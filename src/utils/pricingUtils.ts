import { OpenRouterModel, OpenRouterEndpoint, OpenRouterModelPricing } from "../types";

export interface ModelPricingSummary {
  input: string;
  output: string;
  cache: string;
  isFree: boolean;
}

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

/**
 * Calculates and formats pricing (Input, Output, Cache per 1M tokens) as an exact price or price range
 * based on the active model and user-selected provider endpoints.
 */
export function getModelPricingSummary(
  modelId: string,
  selectedProviders: string[] = [],
  cachedModel?: OpenRouterModel,
  endpoints: OpenRouterEndpoint[] = []
): ModelPricingSummary {
  if (!modelId) {
    return { input: "$0", output: "$0", cache: "$0", isFree: true };
  }

  if (modelId.startsWith("mt:")) {
    return { input: "$0 (Free)", output: "$0 (Free)", cache: "$0 (Free)", isFree: true };
  }

  // Filter endpoints by user-selected providers if any are chosen
  let relevantEndpoints = endpoints;
  if (selectedProviders && selectedProviders.length > 0) {
    const filtered = endpoints.filter((ep) =>
      selectedProviders.some(
        (sp) =>
          (ep.provider_name && sp.toLowerCase() === ep.provider_name.toLowerCase()) ||
          (ep.name && sp.toLowerCase() === ep.name.toLowerCase())
      )
    );
    if (filtered.length > 0) {
      relevantEndpoints = filtered;
    }
  }

  // Gather token prices per 1 Million tokens
  const promptPrices: number[] = [];
  const compPrices: number[] = [];
  const cachePrices: number[] = [];

  for (const ep of relevantEndpoints) {
    if (ep.pricing) {
      if (ep.pricing.prompt !== undefined) {
        promptPrices.push(parseFloat(ep.pricing.prompt || "0") * 1000000);
      }
      if (ep.pricing.completion !== undefined) {
        compPrices.push(parseFloat(ep.pricing.completion || "0") * 1000000);
      }
      if (ep.pricing.input_cache_read !== undefined && parseFloat(ep.pricing.input_cache_read || "0") > 0) {
        cachePrices.push(parseFloat(ep.pricing.input_cache_read || "0") * 1000000);
      }
    }
  }

  // Fallback to top-level model pricing if endpoint pricing is not loaded yet
  if (promptPrices.length === 0 && cachedModel?.pricing) {
    promptPrices.push(parseFloat(cachedModel.pricing.prompt || "0") * 1000000);
    compPrices.push(parseFloat(cachedModel.pricing.completion || "0") * 1000000);
    if (cachedModel.pricing.input_cache_read && parseFloat(cachedModel.pricing.input_cache_read) > 0) {
      cachePrices.push(parseFloat(cachedModel.pricing.input_cache_read) * 1000000);
    }
  }

  const formatPriceVal = (val: number): string => {
    if (val === 0) return "$0";
    if (val < 0.01) return `$${val.toFixed(4)}`;
    if (val < 1) return `$${val.toFixed(2)}`;
    return `$${val.toFixed(2)}`;
  };

  const formatRange = (prices: number[]): string => {
    if (prices.length === 0) return "$0";
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (Math.abs(min - max) < 0.0001) {
      return formatPriceVal(min);
    }
    return `${formatPriceVal(min)} - ${formatPriceVal(max)}`;
  };

  const inputStr = formatRange(promptPrices);
  const outputStr = formatRange(compPrices);
  const cacheStr = cachePrices.length > 0 ? formatRange(cachePrices) : "$0";
  const isFree = promptPrices.length > 0 && promptPrices.every((p) => p === 0) && compPrices.every((p) => p === 0);

  return {
    input: inputStr,
    output: outputStr,
    cache: cacheStr,
    isFree,
  };
}

/**
 * Calculates estimated USD cost based on token usage and cached model pricing
 */
export function calculateUsageCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
  cachedTokens: number = 0,
  modelList?: OpenRouterModel[]
): number {
  if (!modelId || modelId.startsWith("mt:") || modelId.toLowerCase().includes(":free")) {
    return 0;
  }

  let models = modelList;
  if (!models || models.length === 0) {
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("vn_cached_openrouter_models") || localStorage.getItem("openrouter_available_models");
      if (stored) {
        try {
          models = JSON.parse(stored);
        } catch {
          // Ignored
        }
      }
    }
  }

  const m = models?.find((x) => x.id.toLowerCase() === modelId.toLowerCase());
  if (!m?.pricing) {
    return 0;
  }

  const promptPrice = parseFloat(m.pricing.prompt) || 0;
  const compPrice = parseFloat(m.pricing.completion) || 0;

  if (promptPrice === 0 && compPrice === 0) {
    return 0;
  }

  const nonCachedPrompt = Math.max(0, promptTokens - cachedTokens);
  const promptCost = nonCachedPrompt * promptPrice + cachedTokens * promptPrice * 0.5;
  const compCost = completionTokens * compPrice;

  return promptCost + compCost;
}
