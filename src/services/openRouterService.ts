export interface OpenRouterModelPricing {
  prompt: string;
  completion: string;
  image?: string;
  request?: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: OpenRouterModelPricing;
}

export interface OpenRouterKeyInfo {
  label?: string;
  usage: number; // in USD
  limit: number | null;
  is_free_tier: boolean;
  rate_limit?: {
    requests: number;
    interval: string;
  };
}

export interface OpenRouterTestResult {
  isValid: boolean;
  message: string;
  keyInfo?: OpenRouterKeyInfo;
}

export const DEFAULT_LIVE_SYSTEM_PROMPT =
  "You are an expert Visual Novel localizer from Japanese to English.\nTranslate the given dialogue naturally, preserving character personality, emotional nuance, and Japanese honorifics (-san, -kun, -chan, -senpai, -sensei) where appropriate.\nOutput only the clean translation without surrounding commentary.";

export const DEFAULT_BATCH_SYSTEM_PROMPT =
  "You are an expert Visual Novel script translator processing multiple dialogue entries.\nTranslate each dialogue line accurately while maintaining strict character voice consistency and context continuity across lines.\nPreserve JSON schema keys and line structure identically without omitting or modifying structure.";

/**
 * Format model input and output pricing per 1M tokens with up/down arrows
 */
export function formatModelPricing(pricing: OpenRouterModelPricing): {
  inputPerMillion: string;
  outputPerMillion: string;
  isFree: boolean;
} {
  const promptNum = parseFloat(pricing.prompt || "0") * 1000000;
  const completionNum = parseFloat(pricing.completion || "0") * 1000000;
  const isFree = promptNum === 0 && completionNum === 0;

  const formatPrice = (num: number) => {
    if (num === 0) return "$0";
    if (num < 0.01) return `$${num.toFixed(4)}`;
    if (num < 1) return `$${num.toFixed(2)}`;
    return `$${num.toFixed(2)}`;
  };

  return {
    inputPerMillion: isFree ? "$0" : formatPrice(promptNum),
    outputPerMillion: isFree ? "$0" : formatPrice(completionNum),
    isFree,
  };
}

let cachedModels: OpenRouterModel[] | null = null;

/**
 * Fetch available models from OpenRouter public API (No key required) with caching
 */
export async function fetchOpenRouterModels(forceRefresh = false): Promise<OpenRouterModel[]> {
  if (!forceRefresh && cachedModels && cachedModels.length > 50) {
    return cachedModels;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models");
    if (!response.ok) {
      throw new Error(`Failed to fetch models (HTTP ${response.status})`);
    }
    const json = await response.json();
    if (Array.isArray(json.data) && json.data.length > 0) {
      const parsedModels = json.data.map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        description: m.description || "",
        context_length: m.context_length || 0,
        pricing: {
          prompt: m.pricing?.prompt || "0",
          completion: m.pricing?.completion || "0",
        },
      }));
      cachedModels = parsedModels;
      try {
        localStorage.setItem("vn_cached_openrouter_models", JSON.stringify(parsedModels));
      } catch {}
      return parsedModels;
    }
  } catch (error: any) {
    console.warn("Failed to fetch live OpenRouter models, trying cache:", error);
  }

  // Fallback to localStorage cache if network fails
  try {
    const stored = localStorage.getItem("vn_cached_openrouter_models");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedModels = parsed;
        return parsed;
      }
    }
  } catch {}

  return cachedModels || [];
}

/**
 * Test and validate OpenRouter API Key using https://openrouter.ai/api/v1/auth/key
 */
export async function testOpenRouterKey(apiKey: string): Promise<OpenRouterTestResult> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { isValid: false, message: "API key cannot be empty." };
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cleanKey}`,
      },
    });

    if (response.status === 200) {
      const json = await response.json();
      const data = json.data || {};
      const keyInfo: OpenRouterKeyInfo = {
        label: data.label || "Default Key",
        usage: typeof data.usage === "number" ? data.usage : 0,
        limit: data.limit ?? null,
        is_free_tier: !!data.is_free_tier,
        rate_limit: data.rate_limit,
      };

      return {
        isValid: true,
        message: "Key verified!",
        keyInfo,
      };
    } else if (response.status === 401) {
      return {
        isValid: false,
        message: "Unauthorized (401): Invalid API Key. Please verify your OpenRouter key.",
      };
    } else {
      const errorText = await response.text().catch(() => "");
      return {
        isValid: false,
        message: `Validation failed (HTTP ${response.status}): ${errorText || "Unknown response"}`,
      };
    }
  } catch (error: any) {
    return {
      isValid: false,
      message: `Network error connecting to OpenRouter: ${error?.message || error}`,
    };
  }
}
