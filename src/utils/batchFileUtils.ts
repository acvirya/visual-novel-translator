import { TauriBridge } from "../services/tauriBridge";
import { logger } from "../services/loggerService";
import { cleanSpeakerName, executePreprocessingPipeline } from "./textPreprocessor";
import { parseScriptContentAsBatchItems } from "./scriptFileParser";
import { BatchSettings } from "../types";
export type { BatchSettings };

export interface BatchItem {
  id: number;
  originalSpeaker?: string;
  originalMessage: string;
  translatedSpeaker?: string;
  translatedMessage?: string;
}

export interface BatchFileEntry {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  rawContent: string;
  items: BatchItem[];
  detectedKeys?: string[];
  status: "ready" | "processing" | "completed" | "error";
  completedLines: number;
  explicitLines?: number;
  totalLines: number;
  error?: string;
}

export interface WholeTurnBatch {
  userContent: string; // Exact JSON string sent in user prompt
  assistantContent: string; // Exact JSON string returned by LLM
  lineCount: number;
}

export interface BatchProgressUpdate {
  activeFileId: string;
  activeFileName: string;
  totalFiles: number;
  completedFiles: number;
  totalLines: number;
  completedLines: number;
  explicitLines?: number;
  currentBatch: number;
  totalBatches: number;
  recentLine?: {
    id: number;
    fileName: string;
    speaker?: string;
    translatedSpeaker?: string;
    original: string;
    translated: string;
  };
}

// Comprehensive East Asian character detection covering Hiragana, Katakana, CJK Unified Ideographs, Extensions, Compatibility, and Hangul
export const SOURCE_EAST_ASIAN_CHAR_REGEX =
  /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

export function isExplicitTagged(item: { translatedMessage?: string; translatedSpeaker?: string }): boolean {
  const msg = (item.translatedMessage || "").trim().toUpperCase();
  const spk = (item.translatedSpeaker || "").trim().toUpperCase();
  return msg === "[EXPLICIT CONTENT]" || spk === "[EXPLICIT CONTENT]";
}

export function isGenuinelyTranslated(item: {
  originalMessage: string;
  translatedMessage?: string;
  originalSpeaker?: string;
  translatedSpeaker?: string;
}): boolean {
  const rawMsg = (item.originalMessage || "").trim();

  // If the original line has empty/blank dialogue, automatically mark as Done!
  if (!rawMsg) {
    return true;
  }

  if (!item.translatedMessage || !item.translatedMessage.trim()) {
    return false;
  }

  const transMsg = item.translatedMessage.trim();

  // If the message is literal "null" or "undefined"
  if (transMsg === "null" || transMsg === "undefined") {
    return false;
  }

  // Explicit / Censored tagged content is NOT genuinely translated
  if (isExplicitTagged(item)) {
    return false;
  }

  // If the translated message is identical to the raw original message:
  // - If the original contains East Asian / source characters, then identical text means un-translated fallback copas (false).
  // - If the original has NO source characters (e.g. "...", "……", "!? ", "OK", "Yes"), then identical text is VALID (true)!
  if (transMsg === rawMsg && SOURCE_EAST_ASIAN_CHAR_REGEX.test(rawMsg)) {
    return false;
  }

  return true;
}

export function isProcessed(item: {
  originalMessage: string;
  translatedMessage?: string;
  originalSpeaker?: string;
  translatedSpeaker?: string;
}): boolean {
  return isGenuinelyTranslated(item) || isExplicitTagged(item);
}

export function cancellableSleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onAbort = () => {
      if (timer) clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Computes the target absolute output path for a given source script file (always saved as .jsonl)
 */
export function calculateOutputPath(sourcePath: string, outputDir?: string, fileSuffix = "_translated"): string {
  const cleanSource = sourcePath.replace(/\\/g, "/");
  const fileName = cleanSource.split("/").pop() || "script.jsonl";
  const lastDot = fileName.lastIndexOf(".");
  const baseName = lastDot !== -1 ? fileName.substring(0, lastDot) : fileName;
  const outFileName = `${baseName}${fileSuffix || "_translated"}.jsonl`;

  if (outputDir && outputDir.trim()) {
    const dir = outputDir.trim().replace(/\\/g, "/").replace(/\/$/, "");
    return `${dir}/${outFileName}`;
  } else {
    const parentDir = cleanSource.substring(0, cleanSource.lastIndexOf("/"));
    return `${parentDir}/${outFileName}`;
  }
}

/**
 * Serializes batch items to standard JSONL format with preprocessed dialogue.
 */
export function serializeBatchItemsToJsonl(items: BatchItem[]): string {
  const outputLines = items.map((item) => {
    const finalRawSpeaker = item.originalSpeaker
      ? cleanSpeakerName(executePreprocessingPipeline(item.originalSpeaker, "batch"))
      : item.originalSpeaker;

    const finalRawMessage = executePreprocessingPipeline(item.originalMessage, "batch");

    return JSON.stringify({
      id: item.id,
      speaker: finalRawSpeaker || null,
      message: finalRawMessage,
      translated_speaker: item.translatedSpeaker !== undefined ? item.translatedSpeaker : null,
      translated_message: item.translatedMessage !== undefined ? item.translatedMessage : null,
    });
  });

  return outputLines.join("\n");
}

/**
 * Saves a translated batch file entry to disk (.jsonl) via TauriBridge.
 */
export async function saveTranslatedFileToDisk(file: BatchFileEntry, settings: BatchSettings): Promise<void> {
  try {
    const outputContent = serializeBatchItemsToJsonl(file.items);
    const targetPath = calculateOutputPath(file.path, settings.outputDir, settings.fileSuffix);

    await TauriBridge.saveScriptFile(targetPath, outputContent);
    logger.info("BatchTranslate", `Saved to disk (.jsonl): ${targetPath} (${file.completedLines}/${file.totalLines} lines)`);
  } catch (err: any) {
    logger.error("BatchTranslate", `Failed to save translated file ${file.name}: ${err?.message || err}`);
  }
}

/**
 * Scans if an output translation file (.jsonl) already exists on disk.
 * If found, hydrates the genuinely translated lines into file.items and updates completedLines!
 */
export async function hydrateExistingTranslationFromDisk(
  file: BatchFileEntry,
  outputDir?: string,
  fileSuffix = "_translated"
): Promise<BatchFileEntry> {
  const targetPath = calculateOutputPath(file.path, outputDir, fileSuffix);

  try {
    const existingContent = await TauriBridge.readScriptFileByPath(targetPath);
    if (existingContent && existingContent.trim()) {
      const existingItems = parseScriptContentAsBatchItems(existingContent);
      if (Array.isArray(existingItems) && existingItems.length > 0) {
        let translatedCount = 0;
        let explicitCount = 0;
        const existingMap = new Map<number, BatchItem>(existingItems.map((e) => [e.id, e]));
        const hydratedItems = file.items.map((item, idx) => {
          const found = existingMap.get(item.id) || existingItems[idx];
          if (found && isGenuinelyTranslated(found)) {
            translatedCount++;
            return {
              ...item,
              translatedSpeaker: found.translatedSpeaker || undefined,
              translatedMessage: found.translatedMessage,
            };
          } else if (found && isExplicitTagged(found)) {
            explicitCount++;
            return {
              ...item,
              translatedSpeaker: found.translatedSpeaker || undefined,
              translatedMessage: found.translatedMessage,
            };
          } else {
            return {
              ...item,
              translatedSpeaker: undefined,
              translatedMessage: undefined,
            };
          }
        });

        file.items = hydratedItems;
        file.completedLines = translatedCount;
        file.explicitLines = explicitCount;
        if (translatedCount + explicitCount >= file.totalLines && file.totalLines > 0) {
          file.status = "completed";
        } else {
          file.status = "ready";
        }

        logger.info(
          "BatchTranslate",
          `[Hydrate] Verified existing output file (.jsonl) on disk for "${file.name}" (${translatedCount}/${file.totalLines} lines genuinely translated, ${explicitCount} explicit).`
        );
        return { ...file, items: [...hydratedItems] };
      }
    }
  } catch (err) {
    logger.warn("BatchTranslate", `Failed to check existing output file for ${file.name}: ${err}`);
  }

  // If no output file was found on disk, reset untranslated items
  file.items.forEach((item) => {
    if (!isProcessed(item)) {
      item.translatedSpeaker = undefined;
      item.translatedMessage = undefined;
    }
  });
  file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;
  file.explicitLines = file.items.filter((it) => isExplicitTagged(it)).length;
  return { ...file };
}
