/** Recover valid settings from older or partially corrupted configuration files. */
export function sanitizeSettings<T>(defaults: T, input: unknown): T {
  function merge(fallback: unknown, value: unknown, path: string): unknown {
    if (Array.isArray(fallback)) {
      if (!Array.isArray(value)) return structuredClone(fallback);
      const items = value.filter((item) => item !== null && item !== undefined);
      if (path === "glossary.terms") {
        return items.filter((item) => typeof item === "object" && typeof item.id === "string" && typeof item.original === "string" && typeof item.translation === "string" && typeof item.category === "string")
          .map((item) => ({ ...item, isLocked: item.isLocked === true }));
      }
      if (path === "translation.starredModelIds" || path === "batch.selectedProviders") {
        return items.filter((item) => typeof item === "string");
      }
      if (path === "overlay.userCustomPresets") {
        return items.filter((item) => typeof item === "object" && typeof item.id === "string" && typeof item.html === "string" && typeof item.css === "string");
      }
      if (path === "ocr.regions" || path === "textPreprocessing.pipeline") {
        return items.filter((item) => typeof item === "object" && typeof item.id === "string")
          .map((item) => merge(fallback[0], item, `${path}[]`));
      }
      return structuredClone(items);
    }
    if (fallback !== null && typeof fallback === "object") {
      const source = value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown> : {};
      const result: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(source)) {
        if (key !== "__proto__" && key !== "constructor" && key !== "prototype") result[key] = entry;
      }
      for (const [key, entry] of Object.entries(fallback)) {
        result[key] = merge(entry, source[key], path ? `${path}.${key}` : key);
      }
      if (path === "llmProviders") {
        for (const [id, provider] of Object.entries(result)) {
          if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
            delete result[id];
          } else {
            result[id] = merge({ id, apiKey: "", customModels: [] }, provider, `${path}.${id}`);
          }
        }
      }
      return result;
    }
    if (typeof fallback === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
      const bounds: Record<string, [number, number]> = {
        "batch.linesPerBatch": [1, 1000], "batch.concurrency": [1, 32],
        "batch.maxBatchContext": [0, 100], "batch.retainBatchContext": [0, 100],
        "batch.delayMs": [0, 3600000], "batch.timeoutMinutes": [1, 120],
        "batch.maxBackoffSeconds": [0, 3600], "batch.temperature": [0, 2],
        "ocr.scalePercent": [1, 400], "ocr.scanInterval": [50, 60000],
        "ocr.regions[].width": [1, 32768], "ocr.regions[].height": [1, 32768],
        "translation.maxContextLines": [0, 1000], "translation.retainContextLines": [0, 1000],
        "translation.maxCharsPerLine": [0, 100000], "translation.temperature": [0, 2],
        "glossary.fuzzyThreshold": [0, 1], "scriptManager.fuzzyThreshold": [0, 1],
        "logs.maxPersistedLines": [1, 10000],
      };
      const bound = bounds[path];
      return bound ? Math.min(bound[1], Math.max(bound[0], value)) : value;
    }
    return typeof value === typeof fallback ? value : fallback;
  }
  return merge(defaults, input, "") as T;
}
