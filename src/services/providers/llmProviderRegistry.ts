export interface CuratedModelInfo {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
    cacheRead?: string;
    cacheWrite?: string;
  };
  reasoning: boolean;
}

export type LlmProtocol = "openai" | "anthropic" | "google" | "copilot";

export interface LlmProviderDefinition {
  id: string;
  name: string;
  category: "aggregator" | "commercial" | "open_weights" | "custom";
  protocol: LlmProtocol;
  defaultBaseUrl: string;
  apiKeyPlaceholder: string;
  apiKeyHelpUrl: string;
}

export interface StoredProviderConfig {
  id: string;
  apiKey: string;
  baseUrl?: string;
  customModels?: CuratedModelInfo[];
  isVerified?: boolean;
}

export const SUPPORTED_PROVIDERS: LlmProviderDefinition[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "aggregator",
    protocol: "openai",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    apiKeyPlaceholder: "sk-or-v1-xxxxxxxxxxxxxxxx",
    apiKeyHelpUrl: "https://openrouter.ai/keys",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    category: "commercial",
    protocol: "openai",
    defaultBaseUrl: "https://api.deepseek.com",
    apiKeyPlaceholder: "sk-xxxxxxxxxxxxxxxx",
    apiKeyHelpUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    category: "commercial",
    protocol: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    apiKeyPlaceholder: "sk-ant-api03-xxxxxxxxxxxxxxxx",
    apiKeyHelpUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "google",
    name: "Google Gemini",
    category: "commercial",
    protocol: "google",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKeyPlaceholder: "AIzaSyxxxxxxxxxxxxxxxx",
    apiKeyHelpUrl: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "commercial",
    protocol: "openai",
    defaultBaseUrl: "https://api.openai.com/v1",
    apiKeyPlaceholder: "sk-proj-xxxxxxxxxxxxxxxx",
    apiKeyHelpUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "groq",
    name: "Groq",
    category: "open_weights",
    protocol: "openai",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    apiKeyPlaceholder: "gsk_xxxxxxxxxxxxxxxx",
    apiKeyHelpUrl: "https://console.groq.com/keys",
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    category: "commercial",
    protocol: "openai",
    defaultBaseUrl: "https://api.x.ai/v1",
    apiKeyPlaceholder: "xai-xxxxxxxxxxxxxxxx",
    apiKeyHelpUrl: "https://console.x.ai",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    category: "open_weights",
    protocol: "openai",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    apiKeyPlaceholder: "nvapi-xxxxxxxxxxxxxxxx",
    apiKeyHelpUrl: "https://build.nvidia.com",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    category: "open_weights",
    protocol: "openai",
    defaultBaseUrl: "https://router.huggingface.co/v1",
    apiKeyPlaceholder: "hf_xxxxxxxxxxxxxxxx",
    apiKeyHelpUrl: "https://huggingface.co/settings/tokens",
  },
  {
    id: "xiaomi",
    name: "Xiaomi (MiMo)",
    category: "commercial",
    protocol: "openai",
    defaultBaseUrl: "https://api.xiaomimimo.com/v1",
    apiKeyPlaceholder: "xm_xxxxxxxxxxxxxxxx",
    apiKeyHelpUrl: "https://api.xiaomimimo.com",
  },
  {
    id: "zai",
    name: "Z.AI (GLM)",
    category: "commercial",
    protocol: "openai",
    defaultBaseUrl: "https://api.z.ai/api/coding/paas/v4",
    apiKeyPlaceholder: "xxxxxxxxxxxxxxxx.xxxxxxxx",
    apiKeyHelpUrl: "https://open.bigmodel.cn",
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    category: "commercial",
    protocol: "copilot",
    defaultBaseUrl: "https://api.individual.githubcopilot.com",
    apiKeyPlaceholder: "ghu_xxxxxxxxxxxxxxxx or copilot token",
    apiKeyHelpUrl: "https://github.com/settings/tokens",
  },
  {
    id: "google-vertex",
    name: "Google Vertex AI",
    category: "commercial",
    protocol: "google",
    defaultBaseUrl: "https://aiplatform.googleapis.com/v1",
    apiKeyPlaceholder: "Google Cloud API Key or Bearer Token",
    apiKeyHelpUrl: "https://cloud.google.com/vertex-ai",
  },
  {
    id: "custom",
    name: "Custom (OpenAI-Compatible / Local)",
    category: "custom",
    protocol: "openai",
    defaultBaseUrl: "http://localhost:11434/v1",
    apiKeyPlaceholder: "Optional API Key (or 'ollama' / 'local')",
    apiKeyHelpUrl: "https://ollama.com",
  },
];

const STORAGE_PREFIX = "vn_provider_";

export class LlmProviderRegistry {
  public static getProviders(): LlmProviderDefinition[] {
    return SUPPORTED_PROVIDERS;
  }

  public static getProvider(id: string): LlmProviderDefinition | undefined {
    return SUPPORTED_PROVIDERS.find((p) => p.id === id);
  }

  public static getProviderConfig(providerId: string): StoredProviderConfig {
    const key = localStorage.getItem(`${STORAGE_PREFIX}${providerId}_key`) || "";
    const baseUrl = localStorage.getItem(`${STORAGE_PREFIX}${providerId}_base_url`) || undefined;
    const isVerified = localStorage.getItem(`${STORAGE_PREFIX}${providerId}_verified`) === "true";
    const customRaw = localStorage.getItem(`${STORAGE_PREFIX}${providerId}_custom_models`);
    let customModels: CuratedModelInfo[] = [];
    if (customRaw) {
      try {
        customModels = JSON.parse(customRaw);
      } catch {}
    }

    return {
      id: providerId,
      apiKey: key,
      baseUrl,
      isVerified,
      customModels,
    };
  }

  public static saveProviderConfig(config: StoredProviderConfig): void {
    localStorage.setItem(`${STORAGE_PREFIX}${config.id}_key`, config.apiKey);
    if (config.baseUrl) {
      localStorage.setItem(`${STORAGE_PREFIX}${config.id}_base_url`, config.baseUrl);
    } else {
      localStorage.removeItem(`${STORAGE_PREFIX}${config.id}_base_url`);
    }
    localStorage.setItem(`${STORAGE_PREFIX}${config.id}_verified`, String(!!config.isVerified));

    if (config.customModels && config.customModels.length > 0) {
      localStorage.setItem(`${STORAGE_PREFIX}${config.id}_custom_models`, JSON.stringify(config.customModels));
    } else if (config.customModels && config.customModels.length === 0) {
      localStorage.removeItem(`${STORAGE_PREFIX}${config.id}_custom_models`);
    }
  }

  /**
   * Return fetched models for a provider ONLY if it is active and verified
   */
  public static getModelsForProvider(providerId: string): CuratedModelInfo[] {
    const cfg = this.getProviderConfig(providerId);
    if (!cfg.isVerified || !cfg.apiKey || !cfg.apiKey.trim()) {
      return [];
    }
    return cfg.customModels || [];
  }

  public static isProviderVerified(providerId: string): boolean {
    const cfg = this.getProviderConfig(providerId);
    return !!(cfg.isVerified && cfg.apiKey && cfg.apiKey.trim().length > 0);
  }

  public static isProviderActive(providerId: string): boolean {
    const cfg = this.getProviderConfig(providerId);
    return !!(cfg.apiKey && cfg.apiKey.trim().length > 0);
  }

  /**
   * Parse a model identifier string into providerId and actual modelId.
   * Format: "provider:model" (e.g. "deepseek:deepseek-chat", "anthropic:claude-3-5-sonnet")
   * Or fallback OpenRouter model like "openai/gpt-4o-mini"
   */
  public static parseModelId(compositeId: string): { providerId: string; modelId: string } {
    if (!compositeId) {
      return { providerId: "openrouter", modelId: "openai/gpt-4o-mini" };
    }

    if (compositeId.startsWith("mt:")) {
      return { providerId: "free_mt", modelId: compositeId };
    }

    if (compositeId.includes(":")) {
      const parts = compositeId.split(":");
      const candidateProvider = parts[0];
      const modelId = parts.slice(1).join(":");
      if (SUPPORTED_PROVIDERS.some((p) => p.id === candidateProvider)) {
        return { providerId: candidateProvider, modelId };
      }
    }

    // Default to OpenRouter for standard slash models (e.g. "openai/gpt-4o")
    return { providerId: "openrouter", modelId: compositeId };
  }
}
