import { Channel } from "@tauri-apps/api/core";
import { TauriBridge } from "../tauriBridge";
import { LlmProviderRegistry, CuratedModelInfo } from "./llmProviderRegistry";
import { OpenRouterCompletionResponse } from "../openRouterService";
import { logger } from "../loggerService";
import { ReasoningEffort, StreamEvent } from "../../types";
export type { StreamEvent };

export interface UniversalChatOptions {
  modelId: string; // May be composite (e.g. "deepseek:deepseek-chat") or standard OpenRouter model
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  reasoningMaxTokens?: number;
  excludeReasoning?: boolean;
  timeoutSeconds?: number;
  overrideApiKey?: string;
  overrideBaseUrl?: string;
  streamId?: string;
  onEvent?: (event: StreamEvent) => void;
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

      const resp = await TauriBridge.testLlmConnection(url, headers);
      const parsed = JSON.parse(resp);
      const count = Array.isArray(parsed.data)
        ? parsed.data.length
        : Array.isArray(parsed.models)
        ? parsed.models.length
        : 1;

      return {
        isValid: true,
        message: `Successfully connected to ${def.name}! (${count} models available)`,
        modelsCount: count,
      };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
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

      const resp = await TauriBridge.testLlmConnection(url, headers);
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
      let nativeRes: OpenRouterCompletionResponse;
      if (options.onEvent) {
        const channel = new Channel<StreamEvent>();
        channel.onmessage = options.onEvent;
        nativeRes = await TauriBridge.openrouterStreamChatCompletion({
          apiKey,
          modelId,
          messagesJson: JSON.stringify(options.messages),
          temperature: options.temperature ?? 0.3,
          maxTokens: options.maxTokens,
          timeoutSeconds: options.timeoutSeconds,
          streamId: options.streamId,
          onEvent: channel,
        });
      } else {
        nativeRes = await TauriBridge.openrouterChatCompletion({
          apiKey,
          modelId,
          messagesJson: JSON.stringify(options.messages),
          temperature: options.temperature ?? 0.3,
          maxTokens: options.maxTokens,
          timeoutSeconds: options.timeoutSeconds,
        });
      }

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

      // Anthropic Extended Thinking (Claude 3.7+ / Claude 4)
      const isAnthropicThinking = /claude-3-7|claude-4/i.test(modelId);
      if (isAnthropicThinking) {
        const effort = options.reasoningEffort || "medium";
        const exclude = Boolean(options.excludeReasoning || effort === "none");

        if (!exclude && effort !== "none") {
          let budgetTokens = 2048;
          if (options.reasoningMaxTokens && options.reasoningMaxTokens >= 1024) {
            budgetTokens = options.reasoningMaxTokens;
          } else if (effort === "low") {
            budgetTokens = 1024;
          } else if (effort === "medium") {
            budgetTokens = 2048;
          } else if (effort === "high") {
            budgetTokens = 4096;
          } else if (effort === "max") {
            budgetTokens = 8192;
          }

          payload.thinking = {
            type: "enabled",
            budget_tokens: budgetTokens,
          };

          // Anthropic requires max_tokens > budget_tokens
          payload.max_tokens = Math.max(payload.max_tokens || 4096, budgetTokens + 2048);

          // In Anthropic API: temperature must be 1.0 when thinking is enabled
          payload.temperature = 1.0;
        } else {
          payload.thinking = { type: "disabled" };
        }
      }

      if (systemMessage) {
        payload.system = systemMessage.content;
      }

      const headers: Record<string, string> = {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      };

      const url = `${baseUrl}/v1/messages`;
      let nativeRes: OpenRouterCompletionResponse;
      if (options.onEvent) {
        const channel = new Channel<StreamEvent>();
        channel.onmessage = options.onEvent;
        nativeRes = await TauriBridge.llmStreamChatCompletion({
          url,
          headers,
          payload_json: JSON.stringify(payload),
          timeoutSeconds: options.timeoutSeconds,
          streamId: options.streamId,
          onEvent: channel,
        });
      } else {
        nativeRes = await TauriBridge.llmChatCompletion({
          url,
          headers,
          payload_json: JSON.stringify(payload),
          timeoutSeconds: options.timeoutSeconds,
        });
      }

      return {
        content: nativeRes.content,
        promptTokens: nativeRes.prompt_tokens,
        completionTokens: nativeRes.completion_tokens,
        cachedTokens: nativeRes.cached_tokens,
        cost: nativeRes.cost,
      };
    }

    // Protocol: OpenAI-Compatible, Google Gemini, GitHub Copilot, Groq, DeepSeek, Custom
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

    // Provider-specific reasoning request assembly
    // 1. OpenAI o1 / o3 reasoning models
    if (providerId === "openai" && (/^o[13](-|$)/i.test(modelId) || /o1|o3/i.test(modelId))) {
      const effort = options.reasoningEffort || "medium";
      const validEffort = effort === "none" ? "low" : (effort === "max" ? "high" : effort);
      payload.reasoning_effort = validEffort;

      // OpenAI o1 / o3-mini: temperature is NOT supported (passing it throws 400 Bad Request)
      delete payload.temperature;

      // OpenAI o1 / o3-mini uses max_completion_tokens instead of max_tokens
      if (payload.max_tokens) {
        payload.max_completion_tokens = payload.max_tokens;
        delete payload.max_tokens;
      }
    }

    // 2. DeepSeek direct (deepseek-reasoner / R1)
    else if (providerId === "deepseek" && (/reasoner|r1/i.test(modelId))) {
      // DeepSeek R1 has native reasoning; avoid overriding low temperature
      delete payload.temperature;
      // DeepSeek R1 does not support response_format: { type: "json_object" } and will reject with HTTP 400
      delete payload.response_format;
    }

    // 3. Google Gemini (via OpenAI-compatible endpoint)
    else if ((providerId === "google" || providerId === "google-vertex") && (/thinking|gemini-2\.5|gemini-3/i.test(modelId))) {
      const effort = options.reasoningEffort || "medium";
      const exclude = Boolean(options.excludeReasoning || effort === "none");

      if (exclude || effort === "none") {
        payload.reasoning_effort = "none";
        payload.extra_body = {
          google: {
            thinking_config: { thinking_budget: 0 },
          },
        };
      } else {
        const mappedEffort = effort === "max" ? "high" : effort;
        payload.reasoning_effort = mappedEffort;

        let budget = -1; // dynamic default
        if (options.reasoningMaxTokens && options.reasoningMaxTokens > 0) {
          budget = options.reasoningMaxTokens;
        } else if (effort === "low") budget = 1024;
        else if (effort === "medium") budget = 4096;
        else if (effort === "high" || effort === "max") budget = 8192;

        payload.extra_body = {
          google: {
            thinking_config: { thinking_budget: budget },
          },
        };
      }
    }

    // 4. Groq direct (deepseek-r1, qwen-qwq, etc.)
    else if (providerId === "groq" && (/r1|qwq/i.test(modelId))) {
      const effort = options.reasoningEffort || "medium";
      const exclude = Boolean(options.excludeReasoning || effort === "none");

      if (exclude || effort === "none") {
        payload.reasoning_format = "hidden";
      } else {
        payload.reasoning_format = "parsed";
        if (effort && effort !== "default") {
          payload.reasoning_effort = effort === "max" ? "high" : effort;
        }
      }
    }

    // 5. xAI / generic reasoning models (Ollama, NIM, Hugging Face, etc.)
    else if (/r1|reason|reasoning|o1|o3|thinking|qwq/i.test(modelId)) {
      const effort = options.reasoningEffort || "medium";
      if (effort && effort !== "default" && effort !== "none") {
        payload.reasoning_effort = effort === "max" ? "high" : effort;
      }
    }

    let nativeRes: OpenRouterCompletionResponse;
    const executeCall = async (currentPayload: any) => {
      if (options.onEvent) {
        const channel = new Channel<StreamEvent>();
        channel.onmessage = options.onEvent;
        return await TauriBridge.llmStreamChatCompletion({
          url,
          headers,
          payload_json: JSON.stringify(currentPayload),
          timeoutSeconds: options.timeoutSeconds,
          streamId: options.streamId,
          onEvent: channel,
        });
      } else {
        return await TauriBridge.llmChatCompletion({
          url,
          headers,
          payload_json: JSON.stringify(currentPayload),
          timeoutSeconds: options.timeoutSeconds,
        });
      }
    };

    try {
      nativeRes = await executeCall(payload);
    } catch (err: any) {
      const errMsg = String(err?.message || err || "");
      const isFormatError = /response_format|json_object|json schema|unsupported.*format/i.test(errMsg);
      if (isFormatError && payload.response_format) {
        logger.warn("LLMDispatcher", `Provider rejected response_format, retrying without response_format...`, { modelId, error: errMsg });
        delete payload.response_format;
        nativeRes = await executeCall(payload);
      } else {
        throw err;
      }
    }

    return {
      content: nativeRes.content,
      promptTokens: nativeRes.prompt_tokens,
      completionTokens: nativeRes.completion_tokens,
      cachedTokens: nativeRes.cached_tokens,
      cost: nativeRes.cost,
    };
  }
}
