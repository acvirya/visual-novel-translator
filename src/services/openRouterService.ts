import { logger } from "./loggerService";
import { TauriBridge } from "./tauriBridge";
import {
  ReasoningEffort,
  OpenRouterCompletionResponse,
  OpenRouterModel,
  OpenRouterEndpoint,
  OpenRouterKeyInfo,
  OpenRouterModelPricing,
  OpenRouterModelReasoning,
} from "../types";
import { LlmProviderRegistry } from "./providers/llmProviderRegistry";
import { LlmDispatcherService } from "./providers/llmDispatcherService";
import {
  buildCompleteSystemPrompt,
  buildGlossarySystemPrompt,
  formatStructuredDialogueInput,
  parseStructuredDialogueOutput,
} from "./promptBuilder";
import { buildReasoningPayload } from "../utils/reasoningResolver";

// Re-export type definitions for backward-compatible consumption
export type {
  OpenRouterModelPricing,
  OpenRouterModelReasoning,
  OpenRouterModel,
  OpenRouterEndpoint,
  OpenRouterKeyInfo,
  OpenRouterCompletionResponse,
};

// Re-export prompt and style presets
export type { PromptStylePreset, BuildSystemPromptOptions } from "./promptBuilder";
export {
  BUILTIN_STYLE_PRESETS,
  loadUserStylePresets,
  saveUserStylePresets,
  getAllStylePresets,
  getActiveStylePresetId,
  getActiveStyleInstructions,
  buildCompleteSystemPrompt,
  DEFAULT_LIVE_SYSTEM_PROMPT,
  DEFAULT_BATCH_SYSTEM_PROMPT,
  formatStructuredDialogueInput,
  parseStructuredDialogueOutput,
  buildGlossarySystemPrompt,
} from "./promptBuilder";

// Re-export pricing utilities
export type { ModelPricingSummary } from "../utils/pricingUtils";
export {
  formatModelPricing,
  getModelPricingSummary,
  calculateUsageCost,
} from "../utils/pricingUtils";

// Re-export reasoning resolver
export type { ResolvedModelReasoning } from "../utils/reasoningResolver";
export {
  formatReasoningEffortLabel,
  getModelPreferredReasoningEffort,
  setModelPreferredReasoningEffort,
  getModelReasoningCapabilities,
  isReasoningModel,
  buildReasoningPayload,
} from "../utils/reasoningResolver";

// Re-export supported languages
export {
  SUPPORTED_LANGUAGES_MAP as SUPPORTED_LANGUAGES,
  getLanguageDisplayName,
  getLanguageName,
} from "../constants/languages";

export interface OpenRouterTestResult {
  isValid: boolean;
  message: string;
  keyInfo?: OpenRouterKeyInfo;
}

export const OPENROUTER_STORAGE_KEYS = {
  CACHED_MODELS: "vn_cached_openrouter_models",
  USER_STYLE_PRESETS: "vn_user_style_presets_v1",
  ACTIVE_STYLE_PRESET_ID: "vn_active_style_preset_id",
  ACTIVE_STYLE_INSTRUCTIONS: "vn_active_style_instructions",
  GLOSSARY_ENTRIES: "vn_glossary_entries_v1",
  SOURCE_LANG: "vn_source_lang",
  TARGET_LANG: "vn_target_lang",
} as const;

let cachedModels: OpenRouterModel[] | null = null;
let activeModelsFetchPromise: Promise<OpenRouterModel[]> | null = null;

/**
 * Helper to route HTTP GET requests through Tauri Rust HTTP backend
 * Falling back to web fetch only if Tauri runtime is absent (e.g. non-Tauri tests)
 */
async function fetchViaTauriOrWeb(
  url: string,
  headers: Record<string, string> = {}
): Promise<{ ok: boolean; status: number; data?: any; text?: string; error?: string }> {
  try {
    const raw = await TauriBridge.testLlmConnection(url, headers);
    try {
      const parsed = JSON.parse(raw);
      return { ok: true, status: 200, data: parsed, text: raw };
    } catch {
      return { ok: true, status: 200, text: raw };
    }
  } catch (err: any) {
    const errMsg = String(err?.message || err || "");
    const match = errMsg.match(/HTTP\s+(\d+)(?::\s*([\s\S]*))?/i);
    if (match) {
      const status = parseInt(match[1], 10);
      const body = match[2] || "";
      try {
        const parsed = JSON.parse(body);
        return { ok: false, status, data: parsed, text: body, error: errMsg };
      } catch {
        return { ok: false, status, text: body, error: errMsg };
      }
    }

    // If Tauri is not available (e.g. test environment), fall back to fetch
    if (typeof fetch === "function") {
      try {
        const res = await fetch(url, { headers });
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          return { ok: res.ok, status: res.status, data: json, text };
        } catch {
          return { ok: res.ok, status: res.status, text };
        }
      } catch (fErr: any) {
        return { ok: false, status: 0, error: String(fErr?.message || fErr) };
      }
    }

    return { ok: false, status: 0, error: errMsg };
  }
}

/**
 * Fetch available models from OpenRouter public API (No key required) with caching & deduplicated in-flight promise
 */
export async function fetchOpenRouterModels(forceRefresh = false): Promise<OpenRouterModel[]> {
  if (!forceRefresh && cachedModels && cachedModels.length > 50) {
    return cachedModels;
  }
  if (activeModelsFetchPromise) {
    return activeModelsFetchPromise;
  }

  activeModelsFetchPromise = (async () => {
    try {
      const response = await fetchViaTauriOrWeb("https://openrouter.ai/api/v1/models");
      if (!response.ok) {
        throw new Error(`Failed to fetch models (HTTP ${response.status})`);
      }
      const json = response.data;
      if (Array.isArray(json.data) && json.data.length > 0) {
        const parsedModels: OpenRouterModel[] = json.data.map((m: any) => ({
          id: m.id,
          name: m.name || m.id,
          description: m.description || "",
          context_length: m.context_length || 0,
          pricing: {
            prompt: m.pricing?.prompt || "0",
            completion: m.pricing?.completion || "0",
          },
          supported_parameters: Array.isArray(m.supported_parameters) ? m.supported_parameters : undefined,
          architecture: m.architecture || undefined,
          reasoning: m.reasoning || (typeof m.architecture?.reasoning === "object" ? m.architecture.reasoning : undefined),
        }));
        cachedModels = parsedModels;
        try {
          localStorage.setItem(OPENROUTER_STORAGE_KEYS.CACHED_MODELS, JSON.stringify(parsedModels));
        } catch {
          // Ignored
        }
        return parsedModels;
      }
    } catch (error: any) {
      console.warn("Failed to fetch live OpenRouter models, trying cache:", error);
    }

    // Fallback to localStorage cache if network fails
    try {
      const stored = localStorage.getItem(OPENROUTER_STORAGE_KEYS.CACHED_MODELS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cachedModels = parsed;
          return parsed;
        }
      }
    } catch {
      // Ignored
    }

    return cachedModels || [];
  })().finally(() => {
    activeModelsFetchPromise = null;
  });

  return activeModelsFetchPromise;
}

const MAX_ENDPOINTS_CACHE_SIZE = 50;
const ENDPOINTS_CACHE_MAP: Map<string, OpenRouterEndpoint[]> = new Map();

function setCachedEndpoints(key: string, endpoints: OpenRouterEndpoint[]) {
  if (ENDPOINTS_CACHE_MAP.size >= MAX_ENDPOINTS_CACHE_SIZE) {
    const oldestKey = ENDPOINTS_CACHE_MAP.keys().next().value;
    if (oldestKey) {
      ENDPOINTS_CACHE_MAP.delete(oldestKey);
    }
  }
  ENDPOINTS_CACHE_MAP.set(key, endpoints);
}

/**
 * Fetch available infrastructure providers / endpoints for a specific OpenRouter model
 */
export async function fetchModelEndpoints(modelId: string, forceRefresh = false): Promise<OpenRouterEndpoint[]> {
  if (!modelId || modelId.startsWith("mt:")) return [];
  const cleanId = modelId.trim();

  if (!forceRefresh && ENDPOINTS_CACHE_MAP.has(cleanId)) {
    return ENDPOINTS_CACHE_MAP.get(cleanId)!;
  }

  try {
    const response = await fetchViaTauriOrWeb(`https://openrouter.ai/api/v1/models/${cleanId}/endpoints`);
    if (!response.ok || !response.data) {
      return [];
    }
    const json = response.data;
    if (json?.data?.endpoints && Array.isArray(json.data.endpoints)) {
      const endpoints: OpenRouterEndpoint[] = json.data.endpoints.map((e: any) => ({
        name: e.name || e.provider_name,
        provider_name: e.provider_name || e.name,
        context_length: e.context_length,
        pricing: e.pricing
          ? {
              prompt: e.pricing.prompt || "0",
              completion: e.pricing.completion || "0",
              input_cache_read: e.pricing.input_cache_read || e.pricing.request || "0",
              input_cache_write: e.pricing.input_cache_write || "0",
              request: e.pricing.request,
            }
          : undefined,
        quantization: e.quantization,
        status: e.status,
      }));

      // Deduplicate by provider_name
      const uniqueEndpoints: OpenRouterEndpoint[] = [];
      const seen = new Set<string>();
      for (const ep of endpoints) {
        if (!seen.has(ep.provider_name)) {
          seen.add(ep.provider_name);
          uniqueEndpoints.push(ep);
        }
      }

      setCachedEndpoints(cleanId, uniqueEndpoints);
      return uniqueEndpoints;
    }
  } catch (err) {
    console.warn(`Failed to fetch endpoints for model ${modelId}:`, err);
  }
  return [];
}

/**
 * Get selected providers for a model from localStorage
 */
export function getSelectedModelProviders(modelId: string): string[] {
  if (!modelId) return [];
  try {
    const raw = localStorage.getItem("vn_openrouter_model_providers_map");
    if (!raw) return [];
    const map = JSON.parse(raw);
    return Array.isArray(map[modelId]) ? map[modelId] : [];
  } catch {
    return [];
  }
}

/**
 * Save selected providers for a model to localStorage
 */
export function setSelectedModelProviders(modelId: string, providers: string[]): void {
  if (!modelId) return;
  try {
    const raw = localStorage.getItem("vn_openrouter_model_providers_map");
    const map = raw ? JSON.parse(raw) : {};
    if (!providers || providers.length === 0) {
      delete map[modelId];
    } else {
      map[modelId] = providers;
    }
    localStorage.setItem("vn_openrouter_model_providers_map", JSON.stringify(map));
  } catch (err) {
    console.error("Failed to save selected model providers:", err);
  }
}

/**
 * Test and validate OpenRouter API Key using https://openrouter.ai/api/v1/auth/key
 */
export async function testOpenRouterKey(apiKey: string): Promise<OpenRouterTestResult> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    logger.warn("OpenRouter::Auth", "Verification failed: API key input is empty.");
    return { isValid: false, message: "API key cannot be empty." };
  }

  logger.info("OpenRouter::Auth", `Testing API key validation (${cleanKey.slice(0, 8)}...)...`);

  try {
    const response = await fetchViaTauriOrWeb("https://openrouter.ai/api/v1/auth/key", {
      Authorization: `Bearer ${cleanKey}`,
    });

    if (response.status === 200 && response.data) {
      const data = response.data.data || {};
      const keyInfo: OpenRouterKeyInfo = {
        label: data.label || "Default Key",
        usage: typeof data.usage === "number" ? data.usage : 0,
        limit: data.limit ?? null,
        is_free_tier: !!data.is_free_tier,
        rate_limit: data.rate_limit,
      };

      logger.info("OpenRouter::Auth", `API Key verified successfully! Label: ${keyInfo.label}, Usage: $${keyInfo.usage.toFixed(4)}`);

      return {
        isValid: true,
        message: "Key verified!",
        keyInfo,
      };
    } else if (response.status === 401) {
      logger.error("OpenRouter::Auth", "Unauthorized (401): Invalid OpenRouter API Key.");
      return {
        isValid: false,
        message: "Unauthorized (401): Invalid API Key. Please verify your OpenRouter key.",
      };
    } else {
      const errorText = response.text || response.error || "";
      logger.error("OpenRouter::Auth", `Validation failed HTTP ${response.status}: ${errorText}`);
      return {
        isValid: false,
        message: `Validation failed (HTTP ${response.status}): ${errorText || "Unknown response"}`,
      };
    }
  } catch (error: any) {
    logger.error("OpenRouter::Auth", `Network error connecting to OpenRouter auth: ${error?.message || error}`);
    return {
      isValid: false,
      message: `Network error connecting to OpenRouter: ${error?.message || error}`,
    };
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterTranslateOptions {
  apiKey: string;
  modelId: string;
  speaker?: string;
  message: string;
  sourceLang?: string;
  targetLang?: string;
  styleInstructions?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  providers?: string[];
  contextHistory?: { user: string; assistant: string }[];
  reasoningEffort?: ReasoningEffort;
  reasoningMaxTokens?: number;
  excludeReasoning?: boolean;
}

export interface OpenRouterTranslateResult {
  success: boolean;
  translatedSpeaker?: string;
  translatedMessage: string;
  rawText?: string;
  cost?: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  error?: string;
}

/**
 * Perform chat completion translation using OpenRouter with structured JSON inputs and outputs
 */
export async function translateWithOpenRouter(options: OpenRouterTranslateOptions): Promise<OpenRouterTranslateResult> {
  const {
    apiKey,
    modelId,
    speaker,
    message,
    sourceLang,
    targetLang,
    styleInstructions,
    systemPrompt,
    temperature = 0.3,
    maxTokens,
    contextHistory = [],
    reasoningEffort,
    reasoningMaxTokens,
    excludeReasoning,
  } = options;

  // Dynamic token ceiling: protects against truncation on long monologues while preventing run-away hallucination
  const dynamicMaxTokens = maxTokens ?? Math.min(2048, Math.max(500, Math.ceil((message || "").length * 4)));

  const { providerId, modelId: targetModelId } = LlmProviderRegistry.parseModelId(modelId);
  const providerCfg = LlmProviderRegistry.getProviderConfig(providerId);
  const cleanKey = (
    providerId === "openrouter"
      ? (apiKey || providerCfg.apiKey)
      : (providerCfg.apiKey || apiKey)
  || "").trim();

  if (!cleanKey) {
    const providerDef = LlmProviderRegistry.getProvider(providerId);
    const err = `${providerDef?.name || "LLM"} API Key is missing. Please set your API key in Translation Providers.`;
    logger.error("LLM::API", err);
    return {
      success: false,
      translatedMessage: message,
      error: err,
    };
  }

  // 1. Build Modular System Prompt
  let fullSystemPrompt = systemPrompt;
  if (!fullSystemPrompt) {
    fullSystemPrompt = buildCompleteSystemPrompt({
      mode: "live",
      sourceLang,
      targetLang,
      styleInstructions,
      includeGlossary: true,
    });
  } else {
    // If a custom system prompt is provided, check if it already has glossary instructions
    const hasGlossary = /glossary|glosarium|### Character & Translation Glossary/i.test(fullSystemPrompt);
    if (!hasGlossary) {
      const glossarySnippet = buildGlossarySystemPrompt();
      if (glossarySnippet) {
        fullSystemPrompt = `${fullSystemPrompt}\n\n${glossarySnippet}`;
      }
    }
  }

  // Construct Multi-turn Chat Message array
  const messages: ChatMessage[] = [{ role: "system", content: fullSystemPrompt }];

  // Append history turns (up to max configured context window)
  if (Array.isArray(contextHistory) && contextHistory.length > 0) {
    for (const turn of contextHistory) {
      if (turn.user && turn.assistant) {
        messages.push({ role: "user", content: turn.user });
        messages.push({ role: "assistant", content: turn.assistant });
      }
    }
  }

  // Active dialogue line turn formatted with structured dialogue helper for schema consistency
  const activeUserPayload = formatStructuredDialogueInput(speaker, message);
  messages.push({ role: "user", content: activeUserPayload });

  const reasoningPayload = buildReasoningPayload({
    effort: reasoningEffort,
    maxTokens: reasoningMaxTokens,
    exclude: excludeReasoning,
  });

  logger.info(
    "LLM::API",
    `Sending structured request to model: ${modelId} (${messages.length} messages, ${contextHistory.length} history turns, maxTokens: ${dynamicMaxTokens})`
  );

  const startTime = Date.now();
  let content = "";
  let lastErr = "";
  let exactCost = 0;
  let exactPromptTokens = 0;
  let exactCompletionTokens = 0;
  let exactCachedTokens = 0;
  const maxRetries = 3;

  const activeProviders = options.providers ?? getSelectedModelProviders(modelId);

  // If using another provider directly (Anthropic, DeepSeek, Google, OpenAI, Groq, xAI, etc.)
  if (providerId !== "openrouter") {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await LlmDispatcherService.executeChat({
          modelId,
          messages,
          temperature,
          maxTokens: dynamicMaxTokens,
          reasoningEffort,
          reasoningMaxTokens,
          excludeReasoning,
          overrideApiKey: cleanKey,
        });
        if (res && res.content) {
          content = res.content.trim();
          exactCost = res.cost || 0;
          exactPromptTokens = res.promptTokens || 0;
          exactCompletionTokens = res.completionTokens || 0;
          exactCachedTokens = res.cachedTokens || 0;
          const elapsed = Date.now() - startTime;
          logger.info(
            "LLM::API",
            `[${providerId}] Response received in ${elapsed}ms: "${content.slice(0, 70)}..."`
          );
          break;
        }
      } catch (err: any) {
        const errStr = err?.message || String(err);
        lastErr = errStr;
        const isRateLimit = errStr.includes("429") || errStr.toLowerCase().includes("rate limit") || errStr.toLowerCase().includes("too many requests");
        const isTransient = errStr.includes("502") || errStr.includes("503") || errStr.includes("504") || errStr.includes("timeout");
        if ((isRateLimit || isTransient) && attempt < maxRetries) {
          const backoffMs = isRateLimit ? 1500 * Math.pow(2, attempt - 1) + Math.random() * 500 : 1000 * attempt;
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        logger.error("LLM::API", `Direct provider [${providerId}] error: ${errStr}`);
        break;
      }
    }
  } else {
    // OpenRouter flow
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const nativeRes = await TauriBridge.openrouterChatCompletion({
          apiKey: cleanKey,
          modelId: targetModelId,
          messagesJson: JSON.stringify(messages),
          temperature,
          maxTokens: dynamicMaxTokens,
          providers: activeProviders.length > 0 ? activeProviders : undefined,
          reasoning: reasoningPayload,
        });

        if (nativeRes && nativeRes.content) {
          content = nativeRes.content.trim();
          exactCost = nativeRes.cost || 0;
          exactPromptTokens = nativeRes.prompt_tokens || 0;
          exactCompletionTokens = nativeRes.completion_tokens || 0;
          exactCachedTokens = nativeRes.cached_tokens || 0;
          const elapsed = Date.now() - startTime;
          logger.info(
            "OpenRouter::API",
            `Native structured response received in ${elapsed}ms (Cost: $${exactCost.toFixed(6)}): "${content.slice(0, 70)}..."`
          );
          break;
        }
      } catch (nativeErr: any) {
        const errStr = nativeErr?.message || String(nativeErr);
        lastErr = errStr;

        const isRateLimit = errStr.includes("429") || errStr.toLowerCase().includes("rate limit") || errStr.toLowerCase().includes("too many requests");
        const isTransient = errStr.includes("502") || errStr.includes("503") || errStr.includes("504") || errStr.includes("timeout");

        if ((isRateLimit || isTransient) && attempt < maxRetries) {
          const backoffMs = isRateLimit ? 1500 * Math.pow(2, attempt - 1) + Math.random() * 500 : 1000 * attempt;
          logger.warn(
            "OpenRouter::API",
            `Transient error (${errStr.slice(0, 60)}...). Retrying in ${(backoffMs / 1000).toFixed(1)}s (Attempt ${attempt}/${maxRetries})...`
          );
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        logger.error("OpenRouter::API", `OpenRouter API error: ${errStr}`);
        break;
      }
    }
  }

  if (!content) {
    const errMsg = lastErr ? `OpenRouter error: ${lastErr}` : "Empty completion content returned from OpenRouter";
    logger.error("OpenRouter::API", errMsg);
    return {
      success: false,
      translatedMessage: message,
      error: errMsg,
    };
  }

  // Safely parse structured JSON (translated_speaker and translated_message)
  const { translatedSpeaker, translatedMessage } = parseStructuredDialogueOutput(content, speaker);

  return {
    success: true,
    translatedSpeaker,
    translatedMessage,
    rawText: content,
    cost: exactCost,
    promptTokens: exactPromptTokens,
    completionTokens: exactCompletionTokens,
    cachedTokens: exactCachedTokens,
  };
}
