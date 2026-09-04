import { ReasoningEffort, OpenRouterModel } from "../types";
import { settingsManager } from "../services/settingsManager";
import { LlmProviderRegistry } from "../services/providers/llmProviderRegistry";

export interface ResolvedModelReasoning {
  isSupported: boolean;
  isMandatory: boolean;
  supportsEffort: boolean;
  supportedEfforts: string[];
  defaultEffort?: string;
  supportsMaxTokens: boolean;
  defaultEnabled: boolean;
  mode: "none" | "toggle_only" | "efforts_list";
}

export function formatReasoningEffortLabel(effort: string): string {
  switch (effort.toLowerCase()) {
    case "none":
      return "Off";
    case "minimal":
      return "Minimal";
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "xhigh":
      return "Xhigh";
    case "max":
      return "Max";
    case "default":
      return "Default";
    case "custom":
      return "Custom";
    default:
      return effort.charAt(0).toUpperCase() + effort.slice(1);
  }
}

export function getModelPreferredReasoningEffort(modelId: string): ReasoningEffort | undefined {
  if (!modelId || typeof window === "undefined" || typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem("vn_model_preferred_efforts");
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return parsed[modelId];
  } catch {
    return undefined;
  }
}

export function setModelPreferredReasoningEffort(modelId: string, effort: ReasoningEffort): void {
  if (!modelId || typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem("vn_model_preferred_efforts");
    const map = raw ? JSON.parse(raw) : {};
    if (effort === "default") {
      delete map[modelId];
    } else {
      map[modelId] = effort;
    }
    localStorage.setItem("vn_model_preferred_efforts", JSON.stringify(map));
  } catch (e) {
    console.error("Failed to save preferred effort:", e);
  }
}

export function getModelReasoningCapabilities(
  model: OpenRouterModel | string,
  allModels?: OpenRouterModel[]
): ResolvedModelReasoning {
  let modelObj: OpenRouterModel | undefined;
  let modelId = "";

  if (typeof model === "string") {
    modelId = model.toLowerCase().trim();
    const list = allModels && allModels.length > 0 ? allModels : [];
    modelObj = list.find((m) => m.id.toLowerCase() === modelId);
  } else if (model) {
    modelObj = model;
    modelId = (model.id || "").toLowerCase().trim();
  }

  // If Free MT or empty
  if (!modelId || modelId.startsWith("mt:")) {
    return {
      isSupported: false,
      isMandatory: false,
      supportsEffort: false,
      supportedEfforts: [],
      supportsMaxTokens: false,
      defaultEnabled: false,
      mode: "none",
    };
  }

  const rawReasoning =
    modelObj?.reasoning ||
    (typeof modelObj?.architecture?.reasoning === "object" ? (modelObj.architecture.reasoning as any) : undefined);

  if (rawReasoning && typeof rawReasoning === "object") {
    const isMandatory = Boolean(rawReasoning.mandatory);
    const supportsMaxTokens = Boolean(rawReasoning.supports_max_tokens);
    const defaultEnabled = rawReasoning.default_enabled !== false;
    const supportedEfforts = Array.isArray(rawReasoning.supported_efforts)
      ? rawReasoning.supported_efforts.map(String)
      : [];
    const defaultEffort = rawReasoning.default_effort ? String(rawReasoning.default_effort) : undefined;

    if (supportedEfforts.length > 0) {
      return {
        isSupported: true,
        isMandatory,
        supportsEffort: true,
        supportedEfforts,
        defaultEffort,
        supportsMaxTokens,
        defaultEnabled,
        mode: "efforts_list",
      };
    } else {
      return {
        isSupported: true,
        isMandatory,
        supportsEffort: false,
        supportedEfforts: [],
        defaultEffort,
        supportsMaxTokens,
        defaultEnabled,
        mode: "toggle_only",
      };
    }
  }

  // If parameters metadata indicates reasoning support
  if (
    modelObj?.supported_parameters?.includes("reasoning") ||
    modelObj?.supported_parameters?.includes("include_reasoning") ||
    modelObj?.architecture?.reasoning === true
  ) {
    return {
      isSupported: true,
      isMandatory: false,
      supportsEffort: false,
      supportedEfforts: [],
      supportsMaxTokens: true,
      defaultEnabled: true,
      mode: "toggle_only",
    };
  }

  // Fallback heuristics for all supported providers beyond OpenRouter
  const { providerId: _providerId, modelId: parsedSubModel } = LlmProviderRegistry.parseModelId(modelId);
  const targetId = (parsedSubModel || modelId).toLowerCase();

  // 1. Anthropic Extended Thinking (Claude 3.7 Sonnet / Claude 4)
  if (targetId.includes("claude-3-7") || targetId.includes("claude-4")) {
    return {
      isSupported: true,
      isMandatory: false,
      supportsEffort: true,
      supportedEfforts: ["none", "low", "medium", "high", "max"],
      defaultEffort: "medium",
      supportsMaxTokens: true,
      defaultEnabled: true,
      mode: "efforts_list",
    };
  }

  // 2. OpenAI o1 / o3 Reasoning Models
  if (
    targetId.startsWith("o1") ||
    targetId.startsWith("o3") ||
    targetId.includes("/o1") ||
    targetId.includes("/o3") ||
    targetId.includes("o1-") ||
    targetId.includes("o3-")
  ) {
    return {
      isSupported: true,
      isMandatory: true,
      supportsEffort: true,
      supportedEfforts: ["low", "medium", "high"],
      defaultEffort: "medium",
      supportsMaxTokens: false,
      defaultEnabled: true,
      mode: "efforts_list",
    };
  }

  // 3. DeepSeek R1 / Reasoner (Always-on native reasoning)
  if (targetId.includes("deepseek-reasoner") || targetId === "r1" || targetId.endsWith("-r1")) {
    return {
      isSupported: true,
      isMandatory: true,
      supportsEffort: false,
      supportedEfforts: [],
      supportsMaxTokens: false,
      defaultEnabled: true,
      mode: "toggle_only",
    };
  }

  // 4. Google Gemini Thinking Models
  if (targetId.includes("thinking") || targetId.includes("gemini-2.5") || targetId.includes("gemini-3")) {
    return {
      isSupported: true,
      isMandatory: false,
      supportsEffort: true,
      supportedEfforts: ["none", "low", "medium", "high"],
      defaultEffort: "medium",
      supportsMaxTokens: true,
      defaultEnabled: true,
      mode: "efforts_list",
    };
  }

  // 5. Groq / Open-Weights Reasoning (Qwen QwQ, DeepSeek R1 Distill, etc.)
  if (targetId.includes("r1") || targetId.includes("qwq") || targetId.includes("reasoning")) {
    return {
      isSupported: true,
      isMandatory: false,
      supportsEffort: true,
      supportedEfforts: ["none", "low", "medium", "high"],
      defaultEffort: "medium",
      supportsMaxTokens: false,
      defaultEnabled: true,
      mode: "efforts_list",
    };
  }

  // 6. xAI Grok Thinking
  if (targetId.includes("grok-3") || targetId.includes("grok-thinking")) {
    return {
      isSupported: true,
      isMandatory: false,
      supportsEffort: true,
      supportedEfforts: ["low", "medium", "high"],
      defaultEffort: "medium",
      supportsMaxTokens: false,
      defaultEnabled: true,
      mode: "efforts_list",
    };
  }

  return {
    isSupported: false,
    isMandatory: false,
    supportsEffort: false,
    supportedEfforts: [],
    supportsMaxTokens: false,
    defaultEnabled: false,
    mode: "none",
  };
}

export function isReasoningModel(model: OpenRouterModel | string, allModels?: OpenRouterModel[]): boolean {
  return getModelReasoningCapabilities(model, allModels).isSupported;
}

export function buildReasoningPayload(options?: {
  modelId?: string;
  effort?: ReasoningEffort;
  maxTokens?: number;
  exclude?: boolean;
}): Record<string, any> | undefined {
  const effort = options?.effort || settingsManager.getReasoningEffort();
  const maxTokens = options?.maxTokens !== undefined ? options.maxTokens : settingsManager.getReasoningMaxTokens();
  const exclude = options?.exclude !== undefined ? options.exclude : settingsManager.getExcludeReasoning();

  const capabilities = options?.modelId ? getModelReasoningCapabilities(options.modelId) : null;

  // If model is resolved and does not support reasoning at all, do not send reasoning object
  if (capabilities && !capabilities.isSupported) {
    return undefined;
  }

  const payload: Record<string, any> = {};

  if (effort === "none") {
    // If user explicitly disabled reasoning
    if (capabilities?.supportsEffort && capabilities.supportedEfforts.includes("none")) {
      payload.effort = "none";
    } else {
      payload.exclude = true;
    }
  } else if (effort && effort !== "default" && effort !== "custom") {
    payload.effort = effort;
  }

  if (maxTokens && maxTokens > 0) {
    payload.max_tokens = maxTokens;
  }

  if (exclude === true) {
    payload.exclude = true;
  }

  return Object.keys(payload).length > 0 ? payload : undefined;
}
