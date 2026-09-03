import { jsonrepair } from "jsonrepair";
import { BatchItem } from "../services/batchTranslateService";
import { logger } from "../services/loggerService";

export interface ParsedBatchTranslationItem {
  id?: number;
  translated_speaker?: string | null;
  translatedSpeaker?: string | null;
  speaker?: string | null;
  translated_message?: string;
  translatedMessage?: string;
  message?: string;
}

/**
 * Ultra-Resilient JSON Parser for LLM batch responses.
 * Handles:
 * - Refusals / safety policy block messages (tagged as [EXPLICIT CONTENT])
 * - Unescaped doubled/triple quotes (e.g. ""Do not flock together."")
 * - Unescaped nested inner quotes (e.g. "perhaps "vision" wasn't...")
 * - Wrapped { translations: [...] } or { items: [...] } objects
 * - Code fences ```json ... ``` and leading "json" words
 * - Reasoning model preambles and JSON lines
 * - Direct regex extraction fallback for malformed JSON structures
 */
export function parseLlmBatchResponse(raw: string, items: BatchItem[]): ParsedBatchTranslationItem[] {
  if (!raw || !raw.trim()) return [];

  // Check if LLM refused to translate due to safety / explicit content policies
  const isRefusal =
    /not able to complete|cannot produce or translate|can't continue translating|explicit sexual content|safety guidelines|content safety|content policy|policy refusal|safety policy/i.test(
      raw
    );

  if (isRefusal) {
    logger.warn(
      "BatchTranslate",
      `Content safety refusal detected from LLM. Tagging batch lines [${items.map((i) => i.id).join(", ")}] as [EXPLICIT CONTENT]`
    );
    return items.map((it) => ({
      id: it.id,
      translated_speaker: it.originalSpeaker ? `[EXPLICIT] ${it.originalSpeaker}` : null,
      translated_message: `[EXPLICIT CONTENT] ${it.originalMessage}`,
    }));
  }

  const unwrapCandidate = (data: any): ParsedBatchTranslationItem[] | null => {
    if (!data) return null;
    if (Array.isArray(data)) {
      if (data.length > 0) return data;
    }
    if (typeof data === "object") {
      // 1. Direct "translations" key
      if (Array.isArray(data.translations) && data.translations.length > 0) {
        return data.translations;
      }
      // 2. Common wrapped keys
      for (const key of ["items", "lines", "results", "dialogues", "output", "data"]) {
        if (Array.isArray(data[key]) && data[key].length > 0) {
          return data[key];
        }
      }
      // 3. Any array of objects inside the wrapper
      for (const val of Object.values(data)) {
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
          return val;
        }
      }
      // 4. Single translation item object: { id: 1, translated_message: "..." }
      if (data.id !== undefined || data.translated_message || data.translatedMessage || data.message) {
        return [data];
      }
    }
    return null;
  };

  // Repairs common LLM JSON syntax errors (like doubled/triple quotes `""text""` or malformed quotes)
  const repairJsonQuotes = (str: string): string => {
    let s = str.trim();
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    s = s.replace(/^json\s*(?=[{\[])/i, "").trim();
    // Fix targeted doubled or triple quotes specifically around property values:
    s = s.replace(/("translated_message"\s*:\s*)""+([\s\S]*?)""+(\s*[,}\]])/g, '$1"$2"$3');
    s = s.replace(/("translated_speaker"\s*:\s*)""+([\s\S]*?)""+(\s*[,}\]])/g, '$1"$2"$3');
    return s;
  };

  const sanitizeCandidate = (str: string): string => {
    let s = str.trim();
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    s = s.replace(/^json\s*(?=[{\[])/i, "").trim();
    return s;
  };

  // 1. Direct JSON.parse & jsonrepair on raw/sanitized content
  const sanitized = sanitizeCandidate(raw);
  try {
    const direct = JSON.parse(sanitized);
    const unwrapped = unwrapCandidate(direct);
    if (unwrapped && unwrapped.length > 0) return unwrapped;
  } catch {
    try {
      const repaired = JSON.parse(jsonrepair(sanitized));
      const unwrapped = unwrapCandidate(repaired);
      if (unwrapped && unwrapped.length > 0) return unwrapped;
    } catch {}
  }

  // 2. Try parsing extracted markdown code fence ```json ... ```
  const codeFenceMatches = raw.match(/```(?:json)?\s*([\s\S]*?)```/gi);
  if (codeFenceMatches) {
    for (const fence of codeFenceMatches) {
      const inner = fence.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      try {
        const parsed = JSON.parse(inner);
        const unwrapped = unwrapCandidate(parsed);
        if (unwrapped && unwrapped.length > 0) return unwrapped;
      } catch {
        try {
          const repaired = JSON.parse(jsonrepair(inner));
          const unwrapped = unwrapCandidate(repaired);
          if (unwrapped && unwrapped.length > 0) return unwrapped;
        } catch {
          try {
            const regexRepaired = JSON.parse(repairJsonQuotes(inner));
            const unwrapped = unwrapCandidate(regexRepaired);
            if (unwrapped && unwrapped.length > 0) return unwrapped;
          } catch {}
        }
      }
    }
  }

  // 3. Extract bracketed array [...] or brace object {...} with jsonrepair
  const arrayMatch = sanitized.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      const unwrapped = unwrapCandidate(parsed);
      if (unwrapped && unwrapped.length > 0) return unwrapped;
    } catch {
      try {
        const repaired = JSON.parse(jsonrepair(arrayMatch[0]));
        const unwrapped = unwrapCandidate(repaired);
        if (unwrapped && unwrapped.length > 0) return unwrapped;
      } catch {}
    }
  }

  const braceMatch = sanitized.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      const parsed = JSON.parse(braceMatch[0]);
      const unwrapped = unwrapCandidate(parsed);
      if (unwrapped && unwrapped.length > 0) return unwrapped;
    } catch {
      try {
        const repaired = JSON.parse(jsonrepair(braceMatch[0]));
        const unwrapped = unwrapCandidate(repaired);
        if (unwrapped && unwrapped.length > 0) return unwrapped;
      } catch {}
    }
  }

  // 4. Line-by-line JSON objects (JSON Lines / streaming format)
  const jsonlMatches = sanitized.match(/\{[^{}]*\}/g);
  if (jsonlMatches && jsonlMatches.length > 0) {
    const linesCollected: ParsedBatchTranslationItem[] = [];
    for (const jsonBlock of jsonlMatches) {
      try {
        const parsed = JSON.parse(jsonBlock);
        if (parsed.id !== undefined || parsed.translated_message || parsed.translatedMessage) {
          linesCollected.push(parsed);
        }
      } catch {}
    }
    if (linesCollected.length > 0) {
      return linesCollected;
    }
  }

  // 5. Fallback: Robust Regex-based field extractor across broken JSON text
  const regexExtracted: ParsedBatchTranslationItem[] = [];
  const objectRegex = /\{[\s\S]*?\}/g;
  let m: RegExpExecArray | null;
  while ((m = objectRegex.exec(sanitized)) !== null) {
    const block = m[0];
    const idMatch = block.match(/"id"\s*:\s*(\d+)/i);
    const spkMatch = block.match(/"translated_speaker"\s*:\s*("([^"]*)"|null)/i);
    const msgMatch = block.match(/"translated_message"\s*:\s*"([\s\S]*?)"(?=\s*[,}\]])/i);

    if (idMatch && msgMatch) {
      regexExtracted.push({
        id: parseInt(idMatch[1], 10),
        translated_speaker: spkMatch && spkMatch[2] ? spkMatch[2] : null,
        translated_message: msgMatch[1].replace(/\\"/g, '"'),
      });
    }
  }

  if (regexExtracted.length > 0) {
    return regexExtracted;
  }

  return [];
}
