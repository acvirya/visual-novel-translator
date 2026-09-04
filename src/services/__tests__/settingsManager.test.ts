import { describe, it, expect, beforeEach } from "vitest";
import { settingsManager } from "../settingsManager";
import { LlmProviderRegistry } from "../providers/llmProviderRegistry";

describe("SettingsManager & Single Source of Truth", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = String(val);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
    // Reset to defaults before each test
    settingsManager.resetSettings();
  });

  it("returns cloned objects, preventing direct reference mutation", () => {
    const general1 = settingsManager.getGeneral();
    general1.sourceLang = "ko";

    // Internal cache should remain intact
    const general2 = settingsManager.getGeneral();
    expect(general2.sourceLang).toBe("ja");
  });

  it("updates translation settings and notifies subscribers", () => {
    let notified = false;
    const unsub = settingsManager.subscribe((settings) => {
      if (settings.translation.liveModel === "deepseek:deepseek-chat") {
        notified = true;
      }
    });

    settingsManager.updateTranslation({ liveModel: "deepseek:deepseek-chat" });
    expect(settingsManager.getTranslation().liveModel).toBe("deepseek:deepseek-chat");
    expect(notified).toBe(true);
    unsub();
  });

  it("updates and retrieves batch settings correctly", () => {
    settingsManager.updateBatch({ linesPerBatch: 25, concurrency: 4 });
    const batch = settingsManager.getBatch();
    expect(batch.linesPerBatch).toBe(25);
    expect(batch.concurrency).toBe(4);
  });

  it("manages LLM providers through LlmProviderRegistry uniformly", () => {
    const customConfig = {
      id: "deepseek",
      apiKey: "sk-test-deepseek-12345",
      baseUrl: "https://api.deepseek.com/v1",
      isVerified: true,
      customModels: [
        {
          id: "deepseek-reasoner",
          name: "DeepSeek R1",
          context_length: 64000,
          pricing: { prompt: "0.55", completion: "2.19" },
          reasoning: true,
        },
      ],
    };

    LlmProviderRegistry.saveProviderConfig(customConfig);

    const loaded = LlmProviderRegistry.getProviderConfig("deepseek");
    expect(loaded.apiKey).toBe("sk-test-deepseek-12345");
    expect(loaded.isVerified).toBe(true);
    expect(loaded.customModels).toHaveLength(1);
    expect(loaded.customModels?.[0].id).toBe("deepseek-reasoner");

    // Ensure it also reflects through settingsManager
    const fromMgr = settingsManager.getLlmProvider("deepseek");
    expect(fromMgr.apiKey).toBe("sk-test-deepseek-12345");

    // Verify localStorage has encrypted key (not plain text)
    const raw = localStorage.getItem("vn_translator_universal_settings_v2");
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed.llmProviders.deepseek.apiKey).toMatch(/^enc:v1:/);
    expect(parsed.llmProviders.deepseek.apiKey).not.toBe("sk-test-deepseek-12345");
  });

  it("transparently decrypts legacy plain text keys and encrypts on subsequent save", () => {
    // Simulate legacy storage with plain text API key
    const legacySettings = {
      llmProviders: {
        openrouter: { id: "openrouter", apiKey: "sk-or-v1-legacy-plain-key-123" }
      }
    };
    localStorage.setItem("vn_translator_universal_settings_v2", JSON.stringify(legacySettings));

    // Reload settingsManager from localStorage
    settingsManager.reloadFromStorage();

    // Verify it was decrypted into memory
    expect(settingsManager.getOpenRouterApiKey()).toBe("sk-or-v1-legacy-plain-key-123");

    // After updating anything, verify it gets saved in encrypted form
    settingsManager.updateGeneral({ sourceLang: "ja" });
    const raw = localStorage.getItem("vn_translator_universal_settings_v2");
    const parsed = JSON.parse(raw!);
    expect(parsed.llmProviders.openrouter.apiKey).toMatch(/^enc:v1:/);
  });
});
