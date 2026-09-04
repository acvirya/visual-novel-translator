import { describe, it, expect, vi, beforeEach } from "vitest";
import { LlmDispatcherService } from "../providers/llmDispatcherService";
import { TauriBridge } from "../tauriBridge";
import { OpenRouterCompletionResponse } from "../openRouterService";

describe("LlmDispatcherService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("removes temperature and response_format for DeepSeek reasoning models", async () => {
    let capturedPayload: any = null;

    vi.spyOn(TauriBridge, "llmChatCompletion").mockImplementation(async (params) => {
      capturedPayload = JSON.parse(params.payload_json);
      return {
        content: '{"translation": "Halo"}',
        prompt_tokens: 10,
        completion_tokens: 5,
        cached_tokens: 0,
        cost: 0.001,
      } as OpenRouterCompletionResponse;
    });

    const result = await LlmDispatcherService.executeChat({
      modelId: "deepseek:deepseek-reasoner",
      messages: [{ role: "user", content: "Translate this text" }],
      temperature: 0.7,
      overrideApiKey: "test-deepseek-key",
    });

    expect(result.content).toBe('{"translation": "Halo"}');
    expect(capturedPayload).toBeDefined();
    expect(capturedPayload.temperature).toBeUndefined();
    expect(capturedPayload.response_format).toBeUndefined();
  });

  it("retries without response_format when provider returns format error", async () => {
    let callCount = 0;
    let lastPayload: any = null;

    vi.spyOn(TauriBridge, "llmChatCompletion").mockImplementation(async (params) => {
      callCount++;
      lastPayload = JSON.parse(params.payload_json);

      if (callCount === 1) {
        throw new Error("HTTP 400: response_format 'json_object' is not supported by this model");
      }

      return {
        content: '{"translation": "Berhasil"}',
        prompt_tokens: 15,
        completion_tokens: 8,
        cached_tokens: 0,
        cost: 0.002,
      } as OpenRouterCompletionResponse;
    });

    const result = await LlmDispatcherService.executeChat({
      modelId: "openai:custom-model",
      messages: [{ role: "user", content: "Translate" }],
      overrideApiKey: "test-openai-key",
    });

    expect(callCount).toBe(2);
    expect(result.content).toBe('{"translation": "Berhasil"}');
    expect(lastPayload.response_format).toBeUndefined();
  });
});
