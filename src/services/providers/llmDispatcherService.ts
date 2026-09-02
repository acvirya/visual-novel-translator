import { invoke } from "@tauri-apps/api/core";
import { LlmProviderRegistry, CuratedModelInfo } from "./llmProviderRegistry";
import { OpenRouterCompletionResponse } from "../openRouterService";
import { logger } from "../loggerService";
import { ReasoningEffort } from "../../types";

export interface UniversalChatOptions {
  modelId: string; // May be composite (e.g. "deepseek:deepseek-chat") or standard OpenRouter model
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  timeoutSeconds?: number;
  overrideApiKey?: string;
  overrideBaseUrl?: string;
}

export interface UniversalChatResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cost: number;
}

export class LlmDispatcherService {
  /**
   * Test connection to a given provider by querying its authentication / models endpoint
   */
  public static async testProviderConnection(
    providerId: string,
    apiKey: string,
    customBaseUrl?: string
  ): Promise<{ isValid: boolean; message: string; modelsCount?: number }> {
    const cleanKey = (apiKey || "").trim();
    const def = LlmProviderRegistry.getProvider(providerId);
    if (!def) {
      return { isValid: false, message: `Unknown provider: ${providerId}` };
    }

    const baseUrl = (customBaseUrl || def.defaultBaseUrl).replace(/\/+$/, "");

    try {
      if (providerId === "openrouter") {
        const resp = await invoke<string>("test_llm_connection", {
          url: "https://openrouter.ai/api/v1/auth/key",
          headers: {
            Authorization: `Bearer ${cleanKey}`,
          },
        });
        const parsed = JSON.parse(resp);
        const label = parsed.data?.label || "OpenRouter Key";
        const usage = parsed.data?.usage !== undefined ? ` (Usage: $${Number(parsed.data.usage).toFixed(2)})` : "";
        return { isValid: true, message: `Connected to ${label}${usage}` };
      }

      if (providerId === "anthropic") {
        const resp = await invoke<string>("test_llm_connection", {
          url: `${baseUrl}/v1/models`,
          headers: {
            "x-api-key": cleanKey,
            "anthropic-version": "2023-06-01",
          },
        });
        const parsed = JSON.parse(resp);
        const count = Array.isArray(parsed.data) ? parsed.data.length : undefined;
        return {
          isValid: true,
          message: `Anthropic API verified successfully!${count ? ` (${count} models available)` : ""}`,
          modelsCount: count,
        };
      }

      if (providerId === "github-copilot") {
        const resp = await invoke<string>("test_llm_connection", {
          url: `${baseUrl}/models`,
          headers: {
            Authorization: `Bearer ${cleanKey}`,
            "Editor-Version": "vscode/1.107.0",
            "Copilot-Integration-Id": "vscode-chat",
            "X-GitHub-Api-Version": "2026-06-01",
          },
        });
        const parsed = JSON.parse(resp);
        const count = Array.isArray(parsed.data) ? parsed.data.length : undefined;
        return {
          isValid: true,
          message: `GitHub Copilot token verified!${count ? ` (${count} models available)` : ""}`,
          modelsCount: count,
        };
      }

      // Default for all OpenAI-compatible and Google v1beta/openai providers: GET /models
      const modelsUrl = baseUrl.endsWith("/models") ? baseUrl : `${baseUrl}/models`;
      const resp = await invoke<string>("test_llm_connection", {
        url: modelsUrl,
        headers: cleanKey ? { Authorization: `Bearer ${cleanKey}` } : {},
      });

      const parsed = JSON.parse(resp);
      const dataList = Array.isArray(parsed.data) ? parsed.data : Array.isArray(parsed.models) ? parsed.models : [];
      return {
        isValid: true,
        message: `${def.name} verified successfully! (${dataList.length} models found)`,
        modelsCount: dataList.length,
      };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      return {
        isValid: false,
        message: `Validation failed: ${errMsg.slice(0, 180)}`,
      };
    }
  }

  /**
   * Fetch available model list from provider's endpoint
   */
  public static async fetchProviderModels(
    providerId: string,
    apiKey: string,
    customBaseUrl?: string
  ): Promise<CuratedModelInfo[]> {
    const cleanKey = (apiKey || "").trim();
    const def = LlmProviderRegistry.getProvider(providerId);
    if (!def) return [];

    const baseUrl = (customBaseUrl || def.defaultBaseUrl).replace(/\/+$/, "");

    try {
      let url = `${baseUrl}/models`;
      let headers: Record<string, string> = cleanKey ? { Authorization: `Bearer ${cleanKey}` } : {};

      if (providerId === "anthropic") {
        url = `${baseUrl}/v1/models`;
        headers = {
          "x-api-key": cleanKey,
          "anthropic-version": "2023-06-01",
        };
      } else if (providerId === "github-copilot") {
        headers = {
          Authorization: `Bearer ${cleanKey}`,
          "Editor-Version": "vscode/1.107.0",
          "Copilot-Integration-Id": "vscode-chat",
          "X-GitHub-Api-Version": "2026-06-01",
        };
      } else if (providerId === "google" && !baseUrl.includes("/openai")) {
        url = `${baseUrl}/models?key=${cleanKey}`;
        headers = {};
      }

      const resp = await invoke<string>("test_llm_connection", { url, headers });
      const parsed = JSON.parse(resp);
      const rawList = Array.isArray(parsed.data)
        ? parsed.data
        : Array.isArray(parsed.models)
        ? parsed.models
        : [];

      const fetched: CuratedModelInfo[] = rawList
        .map((m: any) => {
          let id = typeof m === "string" ? m : m.id || m.name;
          if (!id) return null;
          if (id.startsWith("models/")) {
            id = id.replace(/^models\//, "");
          }

          // Filter out non-chat models (embeddings, moderation, tts, audio, image generation)
          if (/embed|moderation|tts|whisper|dall-e|audio|realtime|transcription|babbage|davinci/i.test(id)) {
            return null;
          }

          let name = id;
          if (typeof m === "object") {
            if (m.displayName) name = m.displayName;
            else if (m.display_name) name = m.display_name;
            else if (m.name && !m.name.startsWith("models/")) name = m.name;
          }

          return {
            id,
            name,
            context_length: typeof m === "object" && m.inputTokenLimit ? m.inputTokenLimit : typeof m === "object" && m.context_window ? m.context_window : 128000,
            pricing: { prompt: "0", completion: "0" },
            reasoning: /r1|reason|reasoning|o1|o3|thinking/i.test(id),
          };
        })
        .filter(Boolean) as CuratedModelInfo[];

      return fetched;
    } catch (e) {
      logger.warn("LlmDispatcher", `Could not fetch models dynamically for ${providerId}: ${e}`);
      return [];
    }
  }

  /**
   * Automatically refresh models on app boot for all verified providers
   */
  public static async refreshAllVerifiedProviders(): Promise<void> {
    const providers = LlmProviderRegistry.getProviders();
    for (const p of providers) {
      if (LlmProviderRegistry.isProviderVerified(p.id)) {
        if (p.id === "openrouter") {
          continue;
        }
        const cfg = LlmProviderRegistry.getProviderConfig(p.id);
        try {
          const models = await this.fetchProviderModels(p.id, cfg.apiKey, cfg.baseUrl);
          if (models.length > 0) {
            LlmProviderRegistry.saveProviderConfig({
              ...cfg,
              customModels: models,
            });
            logger.info("LlmDispatcher", `Auto-refreshed ${models.length} models for ${p.name}`);
          }
        } catch (e) {
          logger.warn("LlmDispatcher", `Could not auto-refresh models for ${p.name}: ${e}`);
        }
      }
    }
  }

  /**
   * Execute chat completion across any supported provider via Rust backend
   */
  public static async executeChat(options: UniversalChatOptions): Promise<UniversalChatResult> {
    const { providerId, modelId } = LlmProviderRegistry.parseModelId(options.modelId);
    const def = LlmProviderRegistry.getProvider(providerId);
    const cfg = LlmProviderRegistry.getProviderConfig(providerId);

    const apiKey = (options.overrideApiKey || cfg.apiKey || "").trim();
    const defaultBase = def?.defaultBaseUrl || "https://openrouter.ai/api/v1";
    const baseUrl = (options.overrideBaseUrl || cfg.baseUrl || defaultBase).replace(/\/+$/, "");

    // If using OpenRouter specifically, we can use the native openrouter_chat_completion
    if (providerId === "openrouter") {
      const nativeRes = await invoke<OpenRouterCompletionResponse>("openrouter_chat_completion", {
        apiKey,
        modelId,
        messagesJson: JSON.stringify(options.messages),
        temperature: options.temperature ?? 0.3,
        maxTokens: options.maxTokens,
        timeoutSeconds: options.timeoutSeconds,
      });

      return {
        content: nativeRes.content,
        promptTokens: nativeRes.prompt_tokens,
        completionTokens: nativeRes.completion_tokens,
        cachedTokens: nativeRes.cached_tokens,
        cost: nativeRes.cost,
      };
    }

    // Protocol: Anthropic Messages
    if (def?.protocol === "anthropic") {
      const systemMessage = options.messages.find((m) => m.role === "system");
      const conversationMessages = options.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }));

      const payload: any = {
        model: modelId,
        messages: conversationMessages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.3,
      };

      if (systemMessage) {
        payload.system = systemMessage.content;
      }

      const headers: Record<string, string> = {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      };

      const url = `${baseUrl}/v1/messages`;
      const nativeRes = await invoke<OpenRouterCompletionResponse>("llm_chat_completion", {
        url,
        headers,
        payload_json: JSON.stringify(payload),
        timeoutSeconds: options.timeoutSeconds,
      });

      return {
        content: nativeRes.content,
        promptTokens: nativeRes.prompt_tokens,
        completionTokens: nativeRes.completion_tokens,
        cachedTokens: nativeRes.cached_tokens,
        cost: nativeRes.cost,
      };
    }

    // Protocol: OpenAI-Compatible, Google Gemini, GitHub Copilot, Custom
    const url = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    if (def?.protocol === "copilot") {
      headers["Editor-Version"] = "vscode/1.107.0";
      headers["Copilot-Integration-Id"] = "vscode-chat";
      headers["X-GitHub-Api-Version"] = "2026-06-01";
    }

    const payload: any = {
      model: modelId,
      messages: options.messages,
      temperature: options.temperature ?? 0.3,
      response_format: { type: "json_object" },
    };

    if (options.maxTokens) {
      payload.max_tokens = options.maxTokens;
    }

    const nativeRes = await invoke<OpenRouterCompletionResponse>("llm_chat_completion", {
      url,
      headers,
      payload_json: JSON.stringify(payload),
      timeoutSeconds: options.timeoutSeconds,
    });

    return {
      content: nativeRes.content,
      promptTokens: nativeRes.prompt_tokens,
      completionTokens: nativeRes.completion_tokens,
      cachedTokens: nativeRes.cached_tokens,
      cost: nativeRes.cost,
    };
  }
}
