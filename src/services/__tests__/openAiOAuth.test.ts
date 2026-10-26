// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmDispatcherService } from "../providers/llmDispatcherService";
import { LlmProviderRegistry } from "../providers/llmProviderRegistry";
import { settingsManager, DEFAULT_APP_SETTINGS } from "../settingsManager";
import { SecureStorageService } from "../secureStorageService";
import { TauriBridge } from "../tauriBridge";
import { sanitizeSettings } from "../settingsValidation";
import { redactSecrets } from "../../utils/redactSecrets";
import type { OpenAiAuthStatus } from "../../types/openaiAuth";
import { translateWithOpenRouter } from "../openRouterService";
import { executeBatchLlm } from "../batch/batchLlmExecutor";

vi.mock("@tauri-apps/api/core", async importOriginal => ({
  ...await importOriginal<typeof import("@tauri-apps/api/core")>(),
  Channel: class { onmessage = () => {}; },
}));

const status: OpenAiAuthStatus = {
  authMethod: "oauth", selectedAccountId: "account-1", pending: false, error: null,
  accounts: [{ id: "account-1", email: "test@example.com", connected: true }],
};

beforeEach(async () => {
  await settingsManager.ensureReady();
  settingsManager.resetSettings();
  SecureStorageService.clearInMemoryKeyring();
});
afterEach(() => { vi.restoreAllMocks(); settingsManager.resetSettings(); });

describe("OpenAI authentication exclusivity", () => {
  it("routes OAuth through the backend without API keys, custom endpoints or unsupported controls", async () => {
    await settingsManager.saveLlmProvider({ id: "openai", authMethod: "oauth", apiKey: "inactive-api-key", baseUrl: "https://inactive.example", oauthConnected: true, isVerified: true });
    const chat = vi.spyOn(TauriBridge, "llmChatCompletion");
    const oauth = vi.spyOn(TauriBridge, "openAiOAuthCompletion").mockResolvedValue({ content: "Translated", prompt_tokens: 10, completion_tokens: 2, cached_tokens: 3, cost: 0 });
    const result = await LlmDispatcherService.executeChat({ modelId: "openai:account-model", messages: [{ role: "system", content: "Translate" }, { role: "user", content: "Source" }], temperature: 1.5, maxTokens: 1000, streamId: "batch-1", timeoutSeconds: 45 });
    expect(result.content).toBe("Translated");
    expect(chat).not.toHaveBeenCalled();
    expect(oauth).toHaveBeenCalledOnce();
    const request = oauth.mock.calls[0][0];
    expect(request.streamId).toBe("batch-1");
    expect(request.timeoutSeconds).toBe(45);
    expect(request.request.model).toBe("account-model");
    expect(JSON.stringify(request)).not.toContain("inactive");
    expect(request.request).not.toHaveProperty("temperature");
    expect(request.request).not.toHaveProperty("maxTokens");
  });

  it("does not fall back to API keys after an OAuth failure", async () => {
    await settingsManager.saveLlmProvider({ id: "openai", authMethod: "oauth", apiKey: "inactive-key" });
    vi.spyOn(TauriBridge, "openAiOAuthCompletion").mockRejectedValue(new Error("Session expired"));
    const chat = vi.spyOn(TauriBridge, "llmChatCompletion");
    await expect(LlmDispatcherService.executeChat({ modelId: "openai:model", messages: [{ role: "user", content: "Source" }] })).rejects.toThrow("Session expired");
    expect(chat).not.toHaveBeenCalled();
    await expect(LlmDispatcherService.executeChat({ modelId: "openai:model", messages: [{ role: "user", content: "Source" }], overrideApiKey: "other-key" })).rejects.toThrow("overrides cannot");
  });

  it("translates live/manual dialogue with OAuth even when no API key exists", async () => {
    await settingsManager.saveLlmProvider({ id: "openai", authMethod: "oauth", apiKey: "" });
    const oauth = vi.spyOn(TauriBridge, "openAiOAuthCompletion").mockResolvedValue({ content: '{"translated_message":"Hello from OAuth"}', prompt_tokens: 10, completion_tokens: 2, cached_tokens: 0, cost: 0 });
    const result = await translateWithOpenRouter({ apiKey: "", modelId: "openai:account-model", message: "Source dialogue", systemPrompt: "Translate the dialogue as JSON." });
    expect(result.success).toBe(true);
    expect(result.translatedMessage).toBe("Hello from OAuth");
    expect(oauth).toHaveBeenCalledOnce();
  });

  it.each(["", "inactive-api-key"])("translates batches with OAuth with saved API key '%s'", async apiKey => {
    await settingsManager.saveLlmProvider({ id: "openai", authMethod: "oauth", apiKey });
    vi.spyOn(TauriBridge, "appendDebugLog").mockResolvedValue(undefined);
    const oauth = vi.spyOn(TauriBridge, "openAiOAuthCompletion").mockResolvedValue({ content: '{"translations":[{"id":1,"translated_message":"Translated batch line"}]}', prompt_tokens: 10, completion_tokens: 2, cached_tokens: 0, cost: 0 });
    const item = { id: 1, originalSpeaker: "", originalMessage: "Source batch line" };
    const success = vi.fn();
    await executeBatchLlm({ items: [item], apiKey: "", settings: { ...settingsManager.getBatch(), modelId: "openai:account-model" }, contextHistory: [], onItemSuccess: success, abortController: new AbortController() });
    expect(success).toHaveBeenCalledOnce();
    expect(item).toHaveProperty("translatedMessage", "Translated batch line");
    expect(oauth.mock.calls[0][0].streamId).toMatch(/^batch_/);
    expect(JSON.stringify(oauth.mock.calls[0][0].request)).not.toContain("inactive-api-key");
  });

  it("keeps API-key requests on the existing API path when that method is selected", async () => {
    await settingsManager.saveLlmProvider({ id: "openai", authMethod: "api_key", apiKey: "active-api-key", oauthConnected: true });
    const oauth = vi.spyOn(TauriBridge, "openAiOAuthCompletion");
    const chat = vi.spyOn(TauriBridge, "llmChatCompletion").mockResolvedValue({ content: "API translation", prompt_tokens: 1, completion_tokens: 1, cached_tokens: 0, cost: 0 });
    await LlmDispatcherService.executeChat({ modelId: "openai:model", messages: [{ role: "user", content: "Source" }] });
    expect(chat.mock.calls[0][0].headers.Authorization).toBe("Bearer active-api-key");
    expect(chat.mock.calls[0][0].providerId).toBe("openai");
    expect(oauth).not.toHaveBeenCalled();
  });

  it("loads the OAuth model catalog and does not substitute API-key defaults", async () => {
    await settingsManager.saveLlmProvider({ id: "openai", authMethod: "oauth", apiKey: "", oauthConnected: true, isVerified: true });
    expect(LlmProviderRegistry.isProviderActive("openai")).toBe(true);
    expect(LlmProviderRegistry.getModelsForProvider("openai")).toEqual([]);
    vi.spyOn(TauriBridge, "openAiOAuthModels").mockResolvedValue([{ id: "account-specific-model", name: "My model" }]);
    const generic = vi.spyOn(TauriBridge, "testLlmConnection");
    const models = await LlmDispatcherService.fetchProviderModels("openai", "inactive-key", "https://inactive.example");
    expect(models[0].id).toBe("account-specific-model");
    expect(generic).not.toHaveBeenCalled();
  });

  it("does not trust a forged persisted OAuth connection", () => {
    const restored = sanitizeSettings(DEFAULT_APP_SETTINGS, { llmProviders: { openai: { id: "openai", apiKey: "", authMethod: "oauth", oauthConnected: true, isVerified: true, oauthAccountId: "forged" } } });
    expect(restored.llmProviders.openai.authMethod).toBe("oauth");
    expect(restored.llmProviders.openai.oauthConnected).toBeUndefined();
    expect(restored.llmProviders.openai.oauthAccountId).toBeUndefined();
    expect(restored.llmProviders.openai.isVerified).toBe(false);
  });

  it("persists the selected method without persisting connection state or API secrets", async () => {
    settingsManager.updateOpenAiAuthStatus(status);
    await settingsManager.saveLlmProvider({ ...settingsManager.getLlmProvider("openai"), apiKey: "secret-api-key" });
    settingsManager.flush();
    const persisted = JSON.parse(localStorage.getItem("vn_translator_universal_settings_v2")!);
    expect(persisted.llmProviders.openai.authMethod).toBe("oauth");
    expect(persisted.llmProviders.openai.apiKey).toBe("");
    expect(persisted.llmProviders.openai.oauthConnected).toBeUndefined();
    expect(persisted.llmProviders.openai.oauthAccountId).toBeUndefined();
  });

  it("drops stale models when an OAuth account changes or disconnects", async () => {
    settingsManager.updateOpenAiAuthStatus(status);
    await settingsManager.saveLlmProvider({ ...settingsManager.getLlmProvider("openai"), customModels: [{ id: "old-model", name: "Old", context_length: 0, pricing: { prompt: "0", completion: "0" }, reasoning: false }] });
    settingsManager.updateOpenAiAuthStatus({ ...status, selectedAccountId: null });
    expect(LlmProviderRegistry.isProviderActive("openai")).toBe(false);
    expect(LlmProviderRegistry.getModelsForProvider("openai")).toEqual([]);
  });

  it("redacts OAuth hints, refresh tokens and authorization codes in diagnostics", () => {
    const redacted = JSON.stringify(redactSecrets({ id_token: "private-id", refreshToken: "private-refresh", url: "https://auth.openai.com/api/accounts/authorize?id_token_hint=private-hint&code=private-code" }));
    for (const secret of ["private-id", "private-refresh", "private-hint", "private-code"]) expect(redacted).not.toContain(secret);
  });
});
