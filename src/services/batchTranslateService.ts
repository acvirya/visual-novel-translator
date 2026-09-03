import { invoke, Channel } from "@tauri-apps/api/core";
import { translateWithFreeMt } from "./freeMtService";
import {
  buildCompleteSystemPrompt,
  ChatMessage,
  calculateUsageCost,
  OpenRouterCompletionResponse,
  getSelectedModelProviders,
  buildReasoningPayload,
} from "./openRouterService";
import { cleanSpeakerName, executePreprocessingPipeline } from "../utils/textPreprocessor";
import { parseLlmBatchResponse } from "../utils/batchJsonParser";
import { parseScriptContentAsBatchItems } from "../utils/scriptFileParser";
import { logger } from "./loggerService";
import { useBatchStore, FileStreamingState } from "../stores/useBatchStore";
import { settingsManager } from "./settingsManager";
import { ReasoningEffort } from "../types";
import { LlmProviderRegistry } from "./providers/llmProviderRegistry";
import { LlmDispatcherService, StreamEvent } from "./providers/llmDispatcherService";

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

export interface BatchSettings {
  linesPerBatch: number; // dialogue lines grouped into each prompt turn
  maxBatchContext: number; // maximum preceding batches remembered in context (0 = disabled)
  retainBatchContext: number; // batches retained when context reaches max
  concurrency: number; // parallel file workers
  modelId: string;
  temperature: number;
  delayMs: number; // delay between batches in ms
  timeoutMinutes?: number; // Request timeout in minutes (default: 10)
  maxBackoffSeconds?: number; // Maximum exponential backoff retry wait in seconds (default: 30)
  autoContinueUntilCompleted?: boolean; // Infinite retry until 100% completed
  translateExplicitOnly?: boolean; // Only re-translate lines previously flagged as explicit/censored
  overrideRawWithPreprocessed?: boolean; // Overwrite raw Japanese text with cleaned preprocessed text in output
  selectedProviders?: string[]; // Custom provider routing list (e.g. ["Z.AI", "Venice"])
  reasoningEffort?: ReasoningEffort; // Reasoning effort override for batch
  outputDir: string;
  fileSuffix: string;
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
const SOURCE_EAST_ASIAN_CHAR_REGEX =
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

class BatchTranslateService {
  private isRunning = false;
  private abortController: AbortController | null = null;
  private listeners: ((progress: BatchProgressUpdate) => void)[] = [];

  public subscribe(callback: (progress: BatchProgressUpdate) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notify(update: BatchProgressUpdate) {
    this.listeners.forEach((cb) => cb(update));
    useBatchStore.getState().setProgressData(update);
  }

  public isBusy(): boolean {
    return this.isRunning;
  }

  /**
   * Computes the target absolute output path for a given source script file (always saved as .jsonl)
   */
  public calculateOutputPath(sourcePath: string, outputDir?: string, fileSuffix = "_translated"): string {
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
   * Scans if an output translation file (.jsonl) already exists on disk.
   * If found, hydrates the genuinely translated lines into file.items and updates completedLines!
   */
  public async hydrateExistingTranslationFromDisk(
    file: BatchFileEntry,
    outputDir?: string,
    fileSuffix = "_translated"
  ): Promise<BatchFileEntry> {
    const targetPath = this.calculateOutputPath(file.path, outputDir, fileSuffix);

    try {
      const existingContent = await invoke<string | null>("read_script_file_by_path", { path: targetPath });
      if (existingContent && existingContent.trim()) {
        const existingItems = this.parseScriptContent(existingContent);
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

  /**
   * Parses script content (JSONL, JSON, CSV, KS, or plain text) into standard BatchItem[]
   */
  public parseScriptContent(content: string): BatchItem[] {
    return parseScriptContentAsBatchItems(content);
  }

  public async runBatchTranslation(
    files: BatchFileEntry[],
    settings: BatchSettings,
    onFileUpdated: (file: BatchFileEntry) => void
  ): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.abortController = new AbortController();
    useBatchStore.getState().setIsRunning(true);
    useBatchStore.getState().setIsPaused(false);

    try {
      const apiKey = settingsManager.getOpenRouterApiKey();
      const concurrency = Math.max(1, Math.min(32, settings.concurrency || 2));

      logger.info(
        "BatchTranslate",
        `Starting parallel batch translation for ${files.length} files (Mode: ${settings.translateExplicitOnly ? "EXPLICIT-ONLY" : "STANDARD"}, Workers: ${concurrency}, Model: ${settings.modelId}, Batch size: ${settings.linesPerBatch})`
      );

      // Initial pass: hydrate from disk if output file already exists
      for (const f of files) {
        if (f.status !== "completed" || settings.translateExplicitOnly || f.items.some((it) => isExplicitTagged(it))) {
          await this.hydrateExistingTranslationFromDisk(f, settings.outputDir, settings.fileSuffix);
          onFileUpdated({ ...f, items: [...f.items] });
        }
      }

      // Central progress map to ensure atomic and flicker-free updates across concurrent workers
      const progressMap = new Map<string, { total: number; completed: number; explicit: number; status: string }>();
      files.forEach((f) => {
        progressMap.set(f.id, {
          total: f.totalLines,
          completed: f.completedLines,
          explicit: f.explicitLines || 0,
          status: f.status,
        });
      });

      const sendProgressUpdate = (activeFile: BatchFileEntry, recentLine?: BatchProgressUpdate["recentLine"]) => {
        progressMap.set(activeFile.id, {
          total: activeFile.totalLines,
          completed: activeFile.completedLines,
          explicit: activeFile.explicitLines || 0,
          status: activeFile.status,
        });

        let totalAll = 0;
        let completedAll = 0;
        let explicitAll = 0;
        let completedFiles = 0;

        for (const stats of progressMap.values()) {
          totalAll += stats.total;
          completedAll += stats.completed;
          explicitAll += stats.explicit;
          if (stats.status === "completed") {
            completedFiles++;
          }
        }

        this.notify({
          activeFileId: activeFile.id,
          activeFileName: activeFile.name,
          totalFiles: files.length,
          completedFiles,
          totalLines: totalAll,
          completedLines: completedAll,
          explicitLines: explicitAll,
          currentBatch: 0,
          totalBatches: 0,
          recentLine,
        });
      };

      let loopPass = 0;
      while (!this.abortController?.signal.aborted) {
        loopPass++;

        const uncompletedFiles = files.filter((f) => {
          if (settings.translateExplicitOnly) {
            return f.items.some((it) => isExplicitTagged(it));
          }
          return (f.status as string) !== "completed" && f.items.some((it) => !isProcessed(it));
        });

        if (uncompletedFiles.length === 0) {
          if (settings.translateExplicitOnly) {
            logger.info("BatchTranslate", "All files have 0 explicit-flagged lines. Re-translation complete.");
          } else {
            logger.info("BatchTranslate", "All queued files have 100% completed lines. Batch complete.");
          }
          break; // All targeted files completed!
        }

        if (loopPass > 1) {
          logger.info(
            "BatchTranslate",
            `[Auto-Continue Pass ${loopPass}] Retrying ${uncompletedFiles.length} incomplete file(s)...`
          );
        }

        // Thread-safe atomic file queue using shift() to prevent index shifting during parallel execution
        const uncompletedQueue = [...uncompletedFiles];
        const activeFileIds = new Set<string>();

        const getNextFile = () => {
          while (uncompletedQueue.length > 0) {
            const candidate = uncompletedQueue.shift()!;
            if (!activeFileIds.has(candidate.id)) {
              activeFileIds.add(candidate.id);
              return candidate;
            }
          }
          return null;
        };

        const worker = async (_workerId: number) => {
          while (!this.abortController?.signal.aborted) {
            const file = getNextFile();
            if (!file) break;
            if (settings.translateExplicitOnly && !file.items.some((it) => isExplicitTagged(it))) {
              activeFileIds.delete(file.id);
              continue;
            }
            if (!settings.translateExplicitOnly && ((file.status as string) === "completed" || !file.items.some((it) => !isProcessed(it)))) {
              activeFileIds.delete(file.id);
              continue;
            }

            try {
              const fileIdx = files.findIndex((f) => f.id === file.id);
              await this.processSingleFile(
                file,
                fileIdx !== -1 ? fileIdx : 0,
                files.length,
                settings,
                apiKey,
                (recentLine) => {
                  sendProgressUpdate(file, recentLine);
                },
                (f) => {
                  onFileUpdated({ ...f, items: [...f.items] });
                }
              );
            } finally {
              activeFileIds.delete(file.id);
            }
          }
        };

        const workerPromises = Array.from(
          { length: Math.min(concurrency, uncompletedFiles.length) },
          (_, i) => worker(i + 1)
        );
        await Promise.all(workerPromises);

        if (this.abortController?.signal.aborted) break;

        // Check if all files completed
        const stillRemaining = files.filter((f) => {
          if (settings.translateExplicitOnly) {
            return f.items.some((it) => isExplicitTagged(it));
          }
          return (f.status as string) !== "completed";
        });

        if (stillRemaining.length === 0) {
          break; // All files done!
        }

        // If user disabled auto-continue or if running in explicit-only mode, exit loop after 1 pass
        if (!settings.autoContinueUntilCompleted || settings.translateExplicitOnly) {
          break;
        }

        // If there are still remaining files and autoContinue is enabled, pause for cooldown then retry!
        logger.warn(
          "BatchTranslate",
          `[Auto-Continue] ${stillRemaining.length} file(s) incomplete after pass ${loopPass}. Cooling down 5s before auto-continuing...`
        );

        await cancellableSleep(5000, this.abortController?.signal);
      }

      const totalAllLines = files.reduce((acc, f) => acc + f.totalLines, 0);
      const completedAllLines = files.reduce((acc, f) => acc + f.completedLines, 0);
      const completedFilesCount = files.filter((f) => (f.status as string) === "completed").length;

      logger.info(
        "BatchTranslate",
        `Batch translation finished! Completed files: ${completedFilesCount}/${files.length}, Total translated lines: ${completedAllLines}/${totalAllLines}`
      );
    } finally {
      this.isRunning = false;
      useBatchStore.getState().setIsRunning(false);
      useBatchStore.getState().setIsPaused(false);
    }
  }

  private async processSingleFile(
    file: BatchFileEntry,
    fileIndex: number,
    totalFilesCount: number,
    settings: BatchSettings,
    apiKey: string,
    onLineTranslated: (recentLine?: BatchProgressUpdate["recentLine"]) => void,
    onFileUpdated: (file: BatchFileEntry) => void
  ): Promise<void> {
    file.status = "processing";
    file.error = undefined;
    file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;
    onFileUpdated(file);

    const isLlm = !settings.modelId.startsWith("mt:");
    const batchSize = Math.max(1, settings.linesPerBatch);

    // =========================================================================
    // SPECIAL MODE: TRANSLATE EXPLICIT / CENSORED FLAGGED LINES ONLY
    // =========================================================================
    if (settings.translateExplicitOnly) {
      const explicitCount = file.items.filter((it) => isExplicitTagged(it)).length;

      if (explicitCount === 0) {
        logger.info(
          "BatchTranslate",
          `[File ${fileIndex + 1}/${totalFilesCount}] "${file.name}" has 0 explicit-flagged lines. Skipping.`
        );
        file.status = "completed";
        onFileUpdated(file);
        return;
      }

      logger.info(
        "BatchTranslate",
        `[File ${fileIndex + 1}/${totalFilesCount}] Explicit-Only Mode: Starting "${file.name}" (${explicitCount} explicit lines remaining)`
      );

      const attemptedExplicitLineIds = new Set<number>();
      let contextHistory: WholeTurnBatch[] = [];
      let fileHalted = false;
      let lastErrorMessage = "";
      let explicitBatchNum = 0;
      let lastDiskSaveTime = 0;

      while (true) {
        if (this.abortController?.signal.aborted) return;

        // Dynamically find the first line still tagged explicit that has NOT been attempted in this pass
        const startIdx = file.items.findIndex(
          (it) => isExplicitTagged(it) && !attemptedExplicitLineIds.has(it.id)
        );
        if (startIdx === -1) {
          // All explicit lines in this file have either been resolved or attempted once!
          break;
        }

        explicitBatchNum++;
        const endIdx = Math.min(file.items.length, startIdx + batchSize);
        const chunkItems = file.items.slice(startIdx, endIdx).map((it) => ({ ...it }));

        // Keep track of which IDs in chunkItems were originally explicit
        const originallyExplicitIds = new Set(
          chunkItems.filter((it) => isExplicitTagged(it)).map((it) => it.id)
        );

        // Mark all explicit line IDs in this batch as attempted so we don't loop endlessly
        for (const id of originallyExplicitIds) {
          attemptedExplicitLineIds.add(id);
        }

        // Reconstruct preceding context turns leading up to startIdx for rich story continuity
        if (startIdx > 0 && settings.maxBatchContext > 0) {
          contextHistory = [];
          const precedingBatchCount = Math.max(1, Math.min(settings.maxBatchContext, settings.retainBatchContext || 1));
          const precedingLinesNeeded = precedingBatchCount * settings.linesPerBatch;
          const precedingStart = Math.max(0, startIdx - precedingLinesNeeded);
          const precedingItems = file.items.slice(precedingStart, startIdx).filter((it) => isGenuinelyTranslated(it));
          if (precedingItems.length > 0) {
            for (let p = 0; p < precedingItems.length; p += settings.linesPerBatch) {
              const chunk = precedingItems.slice(p, p + settings.linesPerBatch);
              const uJson = chunk.map((it) => ({
                id: it.id,
                speaker: it.originalSpeaker ? cleanSpeakerName(executePreprocessingPipeline(it.originalSpeaker, "batch")) : undefined,
                message: executePreprocessingPipeline(it.originalMessage, "batch"),
              }));
              const aJson = chunk.map((it) => ({
                id: it.id,
                translated_speaker: it.translatedSpeaker || null,
                translated_message: it.translatedMessage,
              }));
              contextHistory.push({
                userContent: JSON.stringify({ lines: uJson }),
                assistantContent: JSON.stringify(aJson),
                lineCount: chunk.length,
              });
            }
          }
        }

        let batchSuccess = false;
        let retryAttempts = 0;
        const isInfiniteRetry = settings.autoContinueUntilCompleted !== false;
        const maxRetries = isInfiniteRetry ? Infinity : 5;

        while (!batchSuccess) {
          if (this.abortController?.signal.aborted) break;
          if (!isInfiniteRetry && retryAttempts >= maxRetries) break;

          try {
            if (isLlm) {
              const isParsingError =
                lastErrorMessage.includes("JSON") ||
                lastErrorMessage.includes("syntax") ||
                lastErrorMessage.includes("schema") ||
                lastErrorMessage.includes("validation");

              // Only isolate context for this retry turn if poisoned by a parsing hallucination;
              // Preserve context history across rate-limit (429) or transient network/server errors (502/503)
              const activeContext = retryAttempts >= 2 && isParsingError ? [] : contextHistory;

              const resultTurn = await this.translateBatchLlm(
                chunkItems,
                apiKey,
                settings,
                activeContext,
                () => {
                  onLineTranslated();
                },
                originallyExplicitIds,
                {
                  fileId: file.id,
                  fileName: file.name,
                  batchIndex: explicitBatchNum,
                  totalBatches: Math.max(explicitBatchNum, Math.ceil(explicitCount / batchSize)),
                }
              );

              contextHistory.push(resultTurn);
              if (settings.maxBatchContext > 0 && contextHistory.length >= settings.maxBatchContext) {
                const retainTarget = Math.max(1, Math.min(settings.retainBatchContext, settings.maxBatchContext));
                while (contextHistory.length > retainTarget) {
                  contextHistory.shift();
                }
              }
            } else {
              // Free MT engine fallback
              const provider = settings.modelId === "mt:deepl-free" ? "deepl" : "google";
              for (const item of chunkItems) {
                if (originallyExplicitIds.has(item.id)) {
                  const cleanSpk = item.originalSpeaker
                    ? cleanSpeakerName(executePreprocessingPipeline(item.originalSpeaker, "batch"))
                    : undefined;
                  const cleanMsg = executePreprocessingPipeline(item.originalMessage, "batch");
                  const res = await translateWithFreeMt({
                    speaker: cleanSpk,
                    message: cleanMsg,
                    provider,
                  });
                  if (!res.success || !res.translatedMessage) {
                    throw new Error(res.error || "Translation engine returned failure");
                  }
                  item.translatedSpeaker = res.translatedSpeaker || cleanSpk;
                  item.translatedMessage = res.translatedMessage;
                  onLineTranslated({
                    id: item.id,
                    fileName: file.name,
                    speaker: cleanSpk,
                    translatedSpeaker: item.translatedSpeaker,
                    original: cleanMsg,
                    translated: item.translatedMessage,
                  });
                }
              }
            }

            batchSuccess = true;
            file.error = undefined;
            // Clone items immutably so React/Zustand memoized row components trigger re-render
            file.items = file.items.map((it) => {
              const match = chunkItems.find((ci) => ci.id === it.id);
              return match ? { ...match } : it;
            });
            file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;
            file.explicitLines = file.items.filter((it) => isExplicitTagged(it)).length;
            const now = Date.now();
            if (now - lastDiskSaveTime >= 3000) {
              lastDiskSaveTime = now;
              await this.saveTranslatedFile(file, settings);
            }
            onFileUpdated({ ...file, items: [...file.items] });

            const recentLine = chunkItems[0]
              ? {
                  id: chunkItems[0].id,
                  fileName: file.name,
                  speaker: chunkItems[0].originalSpeaker,
                  translatedSpeaker: chunkItems[0].translatedSpeaker,
                  original: chunkItems[0].originalMessage,
                  translated: chunkItems[0].translatedMessage || "",
                }
              : undefined;

            onLineTranslated(recentLine);
          } catch (err: any) {
            if (this.abortController?.signal.aborted) break;
            retryAttempts++;
            lastErrorMessage = err?.message || String(err);
            const isRateLimit =
              lastErrorMessage.includes("429") ||
              lastErrorMessage.toLowerCase().includes("rate-limit") ||
              lastErrorMessage.toLowerCase().includes("too many requests") ||
              lastErrorMessage.toLowerCase().includes("quota");

            const userMaxBackoffMs = Math.max(500, (settings.maxBackoffSeconds !== undefined ? settings.maxBackoffSeconds : 30) * 1000);
            const backoffMs = isRateLimit
              ? Math.min(userMaxBackoffMs, 2000 * Math.pow(1.6, Math.min(retryAttempts, 10)) + Math.random() * 1000)
              : Math.min(Math.min(userMaxBackoffMs, 15000), 1000 + Math.min(retryAttempts, 8) * 500 + Math.random() * 300);
            const attemptInfo = isInfiniteRetry ? `Retry #${retryAttempts}` : `Attempt ${retryAttempts}/${maxRetries}`;

            logger.warn(
              "BatchTranslate",
              `[${file.name}] Explicit Batch #${explicitBatchNum} failed (${lastErrorMessage.slice(0, 80)}...). Retrying in ${(backoffMs / 1000).toFixed(1)}s (${attemptInfo})...`
            );

            file.status = "processing";
            file.error = `Retrying explicit batch #${explicitBatchNum} (${attemptInfo}): ${lastErrorMessage.slice(0, 70)}`;
            onFileUpdated({ ...file, items: [...file.items] });
            await cancellableSleep(backoffMs, this.abortController?.signal);
          }
        }

        if (!batchSuccess) {
          fileHalted = true;
          if (this.abortController?.signal.aborted) {
            logger.info("BatchTranslate", `[${file.name}] Batch translation stopped by user.`);
            file.error = "Translation cancelled by user.";
          } else {
            logger.error(
              "BatchTranslate",
              `[${file.name}] Explicit Batch #${explicitBatchNum} failed after ${retryAttempts} retries. Error: ${lastErrorMessage}`
            );
            file.error = `Explicit batch failed after ${retryAttempts} retries: ${lastErrorMessage}`;
          }
          break;
        }

        if (settings.delayMs > 0 && isLlm) {
          useBatchStore.getState().setFileStreamingState(file.id, (prev) =>
            prev ? { ...prev, phase: "cooldown" as any } : null
          );
          await cancellableSleep(settings.delayMs, this.abortController?.signal);
        }
      }

      file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;
      const remainingExplicit = file.items.filter((it) => isExplicitTagged(it)).length;
      if (remainingExplicit === 0 && !fileHalted) {
        file.status = "completed";
        file.error = undefined;
      } else {
        file.status = "error";
        file.error = `Paused: ${remainingExplicit} explicit-tagged lines remaining`;
      }
      await this.saveTranslatedFile(file, settings);
      useBatchStore.getState().setFileStreamingState(file.id, null);
      onFileUpdated({ ...file });
      return;
    }

    // =========================================================================
    // STANDARD SEQUENTIAL BATCH TRANSLATION MODE
    // =========================================================================
    // Gather uncompleted line indices (neither genuinely translated nor explicit)
    const uncompletedIndices: number[] = [];
    file.items.forEach((item, idx) => {
      if (!isProcessed(item)) {
        uncompletedIndices.push(idx);
      }
    });

    if (uncompletedIndices.length === 0) {
      file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;
      file.explicitLines = file.items.filter((it) => isExplicitTagged(it)).length;
      file.status = "completed";
      onFileUpdated(file);
      return;
    }

    logger.info(
      "BatchTranslate",
      `[File ${fileIndex + 1}/${totalFilesCount}] Starting "${file.name}" (Remaining: ${uncompletedIndices.length}/${file.totalLines} lines, Done: ${file.completedLines}, Explicit: ${file.explicitLines || 0})`
    );

    // Chunk remaining lines into sequential batches
    const batchChunks: number[][] = [];
    for (let i = 0; i < uncompletedIndices.length; i += batchSize) {
      batchChunks.push(uncompletedIndices.slice(i, i + batchSize));
    }

    // Whole-Turn Context History for 100% Prefix Prompt Caching
    let contextHistory: WholeTurnBatch[] = [];

    // Reconstruct previous batch context if resuming mid-file
    const firstUntranslatedIdx = uncompletedIndices[0];
    if (firstUntranslatedIdx > 0 && settings.maxBatchContext > 0) {
      const precedingBatchCount = Math.max(1, Math.min(settings.maxBatchContext, settings.retainBatchContext || 1));
      const precedingLinesNeeded = precedingBatchCount * settings.linesPerBatch;
      const precedingStart = Math.max(0, firstUntranslatedIdx - precedingLinesNeeded);
      const precedingItems = file.items.slice(precedingStart, firstUntranslatedIdx).filter((it) => isGenuinelyTranslated(it));
      if (precedingItems.length > 0) {
        for (let p = 0; p < precedingItems.length; p += settings.linesPerBatch) {
          const chunk = precedingItems.slice(p, p + settings.linesPerBatch);
          const uJson = chunk.map((it) => ({
            id: it.id,
            speaker: it.originalSpeaker ? cleanSpeakerName(executePreprocessingPipeline(it.originalSpeaker, "batch")) : undefined,
            message: executePreprocessingPipeline(it.originalMessage, "batch"),
          }));
          const aJson = chunk.map((it) => ({
            id: it.id,
            translated_speaker: it.translatedSpeaker || null,
            translated_message: it.translatedMessage,
          }));
          contextHistory.push({
            userContent: JSON.stringify({ lines: uJson }),
            assistantContent: JSON.stringify(aJson),
            lineCount: chunk.length,
          });
        }
      }
    }

    let fileHalted = false;
    let lastErrorMessage = "";
    let lastDiskSaveTime = 0;

    for (let bIdx = 0; bIdx < batchChunks.length; bIdx++) {
      if (this.abortController?.signal.aborted) return;

      const chunkIndices = batchChunks[bIdx];
      const chunkItems = chunkIndices.map((idx) => ({ ...file.items[idx] }));

      let batchSuccess = false;
      let retryAttempts = 0;
      const isInfiniteRetry = settings.autoContinueUntilCompleted !== false;
      const maxRetries = isInfiniteRetry ? Infinity : 5;

      while (!batchSuccess) {
        if (this.abortController?.signal.aborted) break;
        if (!isInfiniteRetry && retryAttempts >= maxRetries) break;

        try {
          if (isLlm) {
            const isParsingError =
              lastErrorMessage.includes("JSON") ||
              lastErrorMessage.includes("syntax") ||
              lastErrorMessage.includes("schema") ||
              lastErrorMessage.includes("validation");

            // Only isolate context for this retry turn if poisoned by a parsing hallucination;
            // Preserve context history across rate-limit (429) or transient network/server errors (502/503)
            const activeContext = retryAttempts >= 2 && isParsingError ? [] : contextHistory;

            const resultTurn = await this.translateBatchLlm(
              chunkItems,
              apiKey,
              settings,
              activeContext,
              () => {
                onLineTranslated();
              },
              undefined,
              {
                fileId: file.id,
                fileName: file.name,
                batchIndex: bIdx + 1,
                totalBatches: batchChunks.length,
              }
            );

            // Append the Whole-Turn Batch to Context History for Exact Prefix Cache Match
            contextHistory.push(resultTurn);

            // Sliding Window: calculate total context batches
            if (settings.maxBatchContext > 0 && contextHistory.length >= settings.maxBatchContext) {
              const retainTarget = Math.max(1, Math.min(settings.retainBatchContext, settings.maxBatchContext));
              while (contextHistory.length > retainTarget) {
                contextHistory.shift();
              }
            } else if (settings.maxBatchContext === 0) {
              contextHistory = [];
            }
          } else {
            // Free MT engine (Google / DeepL)
            const provider = settings.modelId === "mt:deepl-free" ? "deepl" : "google";
            for (const item of chunkItems) {
              const cleanSpk = item.originalSpeaker
                ? cleanSpeakerName(executePreprocessingPipeline(item.originalSpeaker, "batch"))
                : undefined;
              const cleanMsg = executePreprocessingPipeline(item.originalMessage, "batch");
              const res = await translateWithFreeMt({
                speaker: cleanSpk,
                message: cleanMsg,
                provider,
              });

              if (!res.success || !res.translatedMessage) {
                throw new Error(res.error || "Translation engine returned failure");
              }

              item.translatedSpeaker = res.translatedSpeaker || cleanSpk;
              item.translatedMessage = res.translatedMessage;

              file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;
              onLineTranslated({
                id: item.id,
                fileName: file.name,
                speaker: item.originalSpeaker,
                translatedSpeaker: item.translatedSpeaker,
                original: item.originalMessage,
                translated: item.translatedMessage,
              });

              if (settings.delayMs > 0) {
                await new Promise((r) => setTimeout(r, settings.delayMs));
              }
            }
          }

          batchSuccess = true;
          file.error = undefined;
          // Clone items immutably so React/Zustand memoized row components trigger re-render
          file.items = file.items.map((it) => {
            const match = chunkItems.find((ci) => ci.id === it.id);
            return match ? { ...match } : it;
          });
          file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;
          file.explicitLines = file.items.filter((it) => isExplicitTagged(it)).length;
          const isFileFinished = file.completedLines + (file.explicitLines || 0) >= file.totalLines && file.totalLines > 0;
          if (isFileFinished) {
            file.status = "completed";
          }
          // Synchronize output file to disk with 3s throttling to prevent SSD thrashing (M8)
          const now = Date.now();
          if (now - lastDiskSaveTime >= 3000 || isFileFinished || bIdx === batchChunks.length - 1) {
            lastDiskSaveTime = now;
            await this.saveTranslatedFile(file, settings);
          }
          onFileUpdated({ ...file, items: [...file.items] });

          const recentLine = chunkItems[0]
            ? {
                id: chunkItems[0].id,
                fileName: file.name,
                speaker: chunkItems[0].originalSpeaker,
                translatedSpeaker: chunkItems[0].translatedSpeaker,
                original: chunkItems[0].originalMessage,
                translated: chunkItems[0].translatedMessage || "",
              }
            : undefined;

          onLineTranslated(recentLine);
        } catch (err: any) {
          if (this.abortController?.signal.aborted) break;

          retryAttempts++;
          lastErrorMessage = err?.message || String(err);

          const isRateLimit =
            lastErrorMessage.includes("429") ||
            lastErrorMessage.toLowerCase().includes("rate-limit") ||
            lastErrorMessage.toLowerCase().includes("too many requests") ||
            lastErrorMessage.toLowerCase().includes("quota");

          const userMaxBackoffMs = Math.max(500, (settings.maxBackoffSeconds !== undefined ? settings.maxBackoffSeconds : 30) * 1000);
          const backoffMs = isRateLimit
            ? Math.min(userMaxBackoffMs, 2000 * Math.pow(1.6, Math.min(retryAttempts, 10)) + Math.random() * 1000)
            : Math.min(Math.min(userMaxBackoffMs, 15000), 1000 + Math.min(retryAttempts, 8) * 500 + Math.random() * 300);

          const attemptInfo = isInfiniteRetry
            ? `Retry #${retryAttempts}`
            : `Attempt ${retryAttempts}/${maxRetries}`;

          logger.warn(
            "BatchTranslate",
            `[${file.name}] Batch ${bIdx + 1}/${batchChunks.length} failed (${lastErrorMessage.slice(0, 80)}...). Retrying in ${(backoffMs / 1000).toFixed(1)}s (${attemptInfo})...`
          );

          file.status = "processing";
          file.error = `Retrying batch ${bIdx + 1}/${batchChunks.length} (${attemptInfo}): ${lastErrorMessage.slice(0, 70)}`;
          onFileUpdated({ ...file, items: [...file.items] });

          await cancellableSleep(backoffMs, this.abortController?.signal);
        }
      }

      // If batch failed after all retries or aborted -> STOP AND DO NOT SKIP
      if (!batchSuccess) {
        fileHalted = true;
        if (this.abortController?.signal.aborted) {
          logger.info("BatchTranslate", `[${file.name}] Batch translation stopped by user.`);
          file.error = "Translation cancelled by user.";
        } else {
          logger.error(
            "BatchTranslate",
            `[${file.name}] Batch ${bIdx + 1} failed after ${retryAttempts} retries. Error: ${lastErrorMessage}`
          );
          file.error = `Batch ${bIdx + 1} failed after ${retryAttempts} retries: ${lastErrorMessage}`;
        }
        break;
      }

      if (settings.delayMs > 0 && isLlm) {
        useBatchStore.getState().setFileStreamingState(file.id, (prev) =>
          prev ? { ...prev, phase: "cooldown" as any } : null
        );
        await cancellableSleep(settings.delayMs, this.abortController?.signal);
      }
    }

    // Check file final status and update completedLines count
    file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;
    file.explicitLines = file.items.filter((it) => isExplicitTagged(it)).length;

    if (file.completedLines + (file.explicitLines || 0) >= file.totalLines && !fileHalted) {
      file.status = "completed";
      file.error = undefined;
    } else {
      file.status = "error";
      file.error = `Halted at batch (${file.completedLines}/${file.totalLines} lines translated): ${lastErrorMessage || "Stopped"}`;
    }

    await this.saveTranslatedFile(file, settings);
    useBatchStore.getState().setFileStreamingState(file.id, null);
    onFileUpdated({ ...file, items: [...file.items] });
  }

  private async writeBatchDebugLog(params: {
    outputDir?: string;
    modelId: string;
    error?: string;
    messages: ChatMessage[];
    rawResponse?: string;
    parsedArray?: any[];
    items: BatchItem[];
    extraInfo?: string;
  }): Promise<void> {
    const logObj = {
      timestamp: new Date().toISOString(),
      modelId: params.modelId,
      error: params.error || null,
      extraInfo: params.extraInfo || null,
      batchLineIds: params.items.map((i) => i.id),
      totalLinesInBatch: params.items.length,
      messages: params.messages,
      rawResponse: params.rawResponse || null,
      parsedArray: params.parsedArray || [],
    };

    const logEntry = JSON.stringify(logObj) + "\n";

    const logTargets = ["batch_debug_log.jsonl"];
    if (params.outputDir && params.outputDir.trim()) {
      const dir = params.outputDir.replace(/\\/g, "/").replace(/\/$/, "");
      logTargets.push(`${dir}/batch_debug_log.jsonl`);
    }

    for (const target of logTargets) {
      try {
        await invoke("append_debug_log", { fileName: target, content: logEntry });
      } catch (e) {
        console.warn(`Failed to write debug log to ${target}:`, e);
      }
    }
  }

  private async translateBatchLlm(
    items: BatchItem[],
    apiKey: string,
    settings: BatchSettings,
    contextHistory: WholeTurnBatch[],
    onItemSuccess: (item: BatchItem) => void,
    allowedOverwriteIds?: Set<number>,
    fileContext?: { fileId: string; fileName: string; batchIndex: number; totalBatches: number }
  ): Promise<WholeTurnBatch> {
    const { providerId, modelId: targetModelId } = LlmProviderRegistry.parseModelId(settings.modelId);
    const providerCfg = LlmProviderRegistry.getProviderConfig(providerId);
    const resolvedKey = (apiKey || providerCfg.apiKey || "").trim();

    if (!resolvedKey) {
      const providerDef = LlmProviderRegistry.getProvider(providerId);
      throw new Error(`${providerDef?.name || "LLM"} API Key is missing. Please configure and verify your API key in Translation Providers.`);
    }

    const systemPrompt = buildCompleteSystemPrompt({
      mode: "batch",
      sourceLang: settingsManager.getSourceLang(),
      targetLang: settingsManager.getTargetLang(),
      includeGlossary: true,
    });

    const inputBatchJson = items.map((it) => {
      const cleanMsg = executePreprocessingPipeline(it.originalMessage, "batch");
      const cleanSpk = it.originalSpeaker
        ? executePreprocessingPipeline(it.originalSpeaker, "batch")
        : undefined;

      return {
        id: it.id,
        speaker: cleanSpk || undefined,
        message: cleanMsg,
      };
    });

    const rawUserContent = JSON.stringify({ lines: inputBatchJson });

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    // Append previous Whole-Turn Batches directly for 100% Exact Prefix Matching (Prompt Caching)
    for (const turn of contextHistory) {
      messages.push({ role: "user", content: turn.userContent });
      messages.push({ role: "assistant", content: turn.assistantContent });
    }

    // Append active batch user turn
    messages.push({ role: "user", content: rawUserContent });

    const timeoutSeconds = Math.max(60, (settings.timeoutMinutes || 10) * 60);

    let content = "";
    let lastErr = "";
    let exactPromptTokens = 0;
    let exactCompletionTokens = 0;
    let exactCachedTokens = 0;
    let exactCost = 0;
    let hasExactUsage = false;

    const activeProviders = settings.selectedProviders ?? getSelectedModelProviders(settings.modelId);
    const reasoningPayload = buildReasoningPayload({ effort: settings.reasoningEffort });

    // Initialize per-file real-time streaming state in store
    if (fileContext) {
      useBatchStore.getState().setFileStreamingState(fileContext.fileId, {
        fileId: fileContext.fileId,
        fileName: fileContext.fileName,
        batchIndex: fileContext.batchIndex,
        totalBatches: fileContext.totalBatches,
        phase: "connecting",
        reasoningText: "",
        accumulatedText: "",
        tokenCount: 0,
        tokensPerSec: 0,
        startedAt: Date.now(),
        lastChunkTime: Date.now(),
      });
    }

    let pendingReasoning = "";
    let pendingContent = "";
    let pendingTokens = 0;
    let pendingPhase: FileStreamingState["phase"] | null = null;
    let lastFlushTime = 0;
    let flushTimer: any = null;

    const flushStreamState = (immediatePhase?: FileStreamingState["phase"]) => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (!fileContext) return;
      const fileId = fileContext.fileId;
      const rText = pendingReasoning;
      const cText = pendingContent;
      const addTokens = pendingTokens;
      const newPhase = immediatePhase || pendingPhase;

      pendingReasoning = "";
      pendingContent = "";
      pendingTokens = 0;
      pendingPhase = null;
      lastFlushTime = Date.now();

      useBatchStore.getState().setFileStreamingState(fileId, (prev) => {
        const now = Date.now();
        const base: FileStreamingState = prev || {
          fileId,
          fileName: fileContext.fileName,
          batchIndex: fileContext.batchIndex,
          totalBatches: fileContext.totalBatches,
          phase: "connecting",
          reasoningText: "",
          accumulatedText: "",
          tokenCount: 0,
          tokensPerSec: 0,
          startedAt: now,
          lastChunkTime: now,
        };

        const finalReasoning = rText ? base.reasoningText + rText : base.reasoningText;
        const finalContent = cText ? base.accumulatedText + cText : base.accumulatedText;
        const totalTokens = base.tokenCount + addTokens;
        const elapsedSec = Math.max(0.1, (now - base.startedAt) / 1000);

        return {
          ...base,
          phase: newPhase || base.phase,
          reasoningText: finalReasoning,
          accumulatedText: finalContent,
          tokenCount: totalTokens,
          tokensPerSec: Math.round(totalTokens / elapsedSec),
          lastChunkTime: now,
        };
      });
    };

    const handleStreamEvent = (event: StreamEvent) => {
      if (this.abortController?.signal.aborted) return;
      if (!fileContext) return;

      if (event.type === "Status") {
        flushStreamState(event.data as any);
        return;
      }

      if (event.type === "Usage") {
        const u = event.data as any;
        if (u && typeof u === "object") {
          if (u.prompt_tokens) exactPromptTokens = Number(u.prompt_tokens);
          if (u.completion_tokens) exactCompletionTokens = Number(u.completion_tokens);
          if (u.cached_tokens) exactCachedTokens = Number(u.cached_tokens);
          if (u.cost) exactCost = Number(u.cost);
          if (exactPromptTokens > 0) hasExactUsage = true;
        }
        return;
      }

      if (event.type === "Reasoning") {
        const chunkStr = String(event.data || "");
        pendingReasoning += chunkStr;
        pendingTokens += Math.max(1, Math.round(chunkStr.length / 4));
        pendingPhase = "thinking";
      } else if (event.type === "Chunk") {
        const chunkStr = String(event.data || "");
        pendingContent += chunkStr;
        pendingTokens += Math.max(1, Math.round(chunkStr.length / 4));
        pendingPhase = "translating";
      }

      const now = Date.now();
      if (now - lastFlushTime >= 50) {
        flushStreamState();
      } else if (!flushTimer) {
        flushTimer = setTimeout(() => {
          flushStreamState();
        }, 50);
      }
    };

    try {
      if (providerId !== "openrouter") {
        const reasoningCfg = settingsManager.getReasoningSettings();
        const executePromise = LlmDispatcherService.executeChat({
          modelId: settings.modelId,
          messages,
          temperature: settings.temperature,
          reasoningEffort: settings.reasoningEffort || reasoningCfg.effort,
          reasoningMaxTokens: reasoningCfg.maxTokens,
          excludeReasoning: false,
          timeoutSeconds,
          overrideApiKey: resolvedKey,
          onEvent: handleStreamEvent,
        });

        const abortPromise = new Promise<never>((_, reject) => {
          if (this.abortController?.signal.aborted) {
            return reject(new Error("Translation cancelled by user."));
          }
          this.abortController?.signal.addEventListener(
            "abort",
            () => reject(new Error("Translation cancelled by user.")),
            { once: true }
          );
        });

        const nativeRes = await Promise.race([executePromise, abortPromise]);

        if (nativeRes && nativeRes.content) {
          content = nativeRes.content.trim();
          exactPromptTokens = nativeRes.promptTokens || 0;
          exactCompletionTokens = nativeRes.completionTokens || 0;
          exactCachedTokens = nativeRes.cachedTokens || 0;
          exactCost = nativeRes.cost || 0;
          hasExactUsage = exactPromptTokens > 0;
        }
      } else {
        const channel = new Channel<StreamEvent>();
        channel.onmessage = handleStreamEvent;

        const invokePromise = invoke<OpenRouterCompletionResponse>("openrouter_stream_chat_completion", {
          apiKey: resolvedKey,
          modelId: targetModelId,
          messagesJson: JSON.stringify(messages),
          temperature: settings.temperature,
          maxTokens: undefined, // Omit maxTokens so OpenRouter uses the model's native context limit without truncating
          timeoutSeconds,
          providers: activeProviders.length > 0 ? activeProviders : undefined,
          reasoning: reasoningPayload,
          onEvent: channel,
        });

        const abortPromise = new Promise<never>((_, reject) => {
          if (this.abortController?.signal.aborted) {
            return reject(new Error("Translation cancelled by user."));
          }
          this.abortController?.signal.addEventListener(
            "abort",
            () => reject(new Error("Translation cancelled by user.")),
            { once: true }
          );
        });

        let timeoutTimer: any = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutTimer = setTimeout(() => {
            reject(new Error(`LLM stream response timed out after ${timeoutSeconds}s.`));
          }, (timeoutSeconds + 10) * 1000);
        });

        try {
          const nativeRes = await Promise.race([invokePromise, abortPromise, timeoutPromise]);
          flushStreamState("validating");

          if (nativeRes && nativeRes.content) {
            content = nativeRes.content.trim();
            exactPromptTokens = nativeRes.prompt_tokens || 0;
            exactCompletionTokens = nativeRes.completion_tokens || 0;
            exactCachedTokens = nativeRes.cached_tokens || 0;
            exactCost = nativeRes.cost || 0;
            hasExactUsage = exactPromptTokens > 0;
          }
        } finally {
          if (timeoutTimer) clearTimeout(timeoutTimer);
        }
      }
    } catch (e: any) {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (this.abortController?.signal.aborted) {
        throw new Error("Translation cancelled by user.");
      }
      lastErr = e?.message || String(e);
      logger.error("BatchTranslate", `Native completion failed: ${lastErr}`);
      throw new Error(lastErr);
    } finally {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    }

    if (!content) {
      await this.writeBatchDebugLog({
        outputDir: settings.outputDir,
        modelId: settings.modelId,
        error: "Empty batch response returned from LLM",
        messages,
        items,
        extraInfo: "LLM returned empty or null content field in choice message",
      });
      throw new Error("Empty batch response returned from LLM");
    }

    const parsedArray = parseLlmBatchResponse(content, items);

    if (!Array.isArray(parsedArray) || parsedArray.length === 0) {
      await this.writeBatchDebugLog({
        outputDir: settings.outputDir,
        modelId: settings.modelId,
        error: `Failed to parse valid JSON array from LLM response: ${content.slice(0, 120)}...`,
        messages,
        rawResponse: content,
        parsedArray: [],
        items,
        extraInfo: "Parser stages returned 0 candidate objects",
      });

      throw new Error(`Failed to parse valid JSON array from LLM response: ${content.slice(0, 120)}...`);
    }

    // Strict Line-by-Line Verification: Ensure every single dialogue line is translated.
    // If any line is skipped by the LLM, fail the batch immediately to trigger a clean retry without holes ("bolong-bolong").
    const missingIds: number[] = [];
    const validatedItems: { item: BatchItem; spk?: string; msg: string }[] = [];

    // Positional ID recovery: if the LLM returned items in exact sequential order but omitted the 'id' key
    const validObjects = parsedArray.filter((p) => p && typeof p === "object");
    const itemsWithoutId = validObjects.filter((p) => p.id === undefined);
    if (itemsWithoutId.length > 0 && validObjects.length === items.length) {
      logger.warn(
        "BatchTranslate",
        `LLM omitted 'id' keys on ${itemsWithoutId.length}/${items.length} items. Recovering IDs positionally from 1:1 array order.`
      );
      validObjects.forEach((p, idx) => {
        if (p.id === undefined && items[idx]) {
          p.id = items[idx].id;
        }
      });
    }

    const parsedMap = new Map<number, any>(
      parsedArray
        .filter((p) => p && typeof p === "object" && p.id !== undefined)
        .map((p) => [Number(p.id), p])
    );

    for (const item of items) {
      const found = parsedMap.get(item.id);
      if (!found) {
        missingIds.push(item.id);
        continue;
      }

      const spk = found.translated_speaker ?? found.translatedSpeaker ?? found.speaker;
      const msg = found.translated_message ?? found.translatedMessage ?? found.message;

      if (msg !== undefined && msg !== null && String(msg).trim()) {
        validatedItems.push({
          item,
          spk: spk && spk !== "null" ? String(spk).trim() : (item.originalSpeaker || undefined),
          msg: String(msg).trim(),
        });
      } else if (!SOURCE_EAST_ASIAN_CHAR_REGEX.test(item.originalMessage)) {
        // Line without East Asian characters (punctuation/symbols like "...", "!?")
        validatedItems.push({
          item,
          spk: spk && spk !== "null" ? String(spk).trim() : (item.originalSpeaker || undefined),
          msg: item.originalMessage || "",
        });
      } else {
        missingIds.push(item.id);
      }
    }

    if (missingIds.length > 0) {
      const errMsg = `Strict Validation Failed: LLM skipped ${missingIds.length}/${items.length} lines (IDs: ${missingIds.slice(0, 8).join(", ")}${missingIds.length > 8 ? "..." : ""}). Halting batch to trigger clean retry.`;
      await this.writeBatchDebugLog({
        outputDir: settings.outputDir,
        modelId: settings.modelId,
        error: errMsg,
        messages,
        rawResponse: content,
        parsedArray,
        items,
        extraInfo: `Missing line IDs: [${missingIds.join(", ")}]`,
      });

      throw new Error(errMsg);
    }

    // All lines 100% matched and validated! Apply translations
    for (const res of validatedItems) {
      if (!allowedOverwriteIds || allowedOverwriteIds.has(res.item.id)) {
        res.item.translatedSpeaker = res.spk;
        res.item.translatedMessage = res.msg;
        onItemSuccess(res.item);
      }
    }

    if (fileContext) {
      useBatchStore.getState().setFileStreamingState(fileContext.fileId, (prev) =>
        prev ? { ...prev, phase: "completed" as any } : null
      );
    }

    // Record session usage statistics (using exact values from OpenRouter API if available)
    try {
      let promptTokens = exactPromptTokens;
      let completionTokens = exactCompletionTokens;
      let cachedTokens = exactCachedTokens;
      let cost = exactCost;

      if (!hasExactUsage || promptTokens === 0) {
        const promptChars = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
        promptTokens = Math.max(1, Math.round(promptChars / 2.6));
        cachedTokens = cachedTokens || 0;
        completionTokens = completionTokens > 0 ? completionTokens : Math.max(1, Math.round(content.length / 3.0));
        cost = cost > 0 ? cost : calculateUsageCost(settings.modelId, promptTokens, completionTokens, cachedTokens);
      } else if (cost === 0 && (promptTokens > 0 || completionTokens > 0)) {
        // Some providers report prompt & completion tokens but do not report financial cost (cost = 0)
        cost = calculateUsageCost(settings.modelId, promptTokens, completionTokens, cachedTokens);
      }

      promptTokens = isNaN(promptTokens) || promptTokens < 0 ? 0 : promptTokens;
      completionTokens = isNaN(completionTokens) || completionTokens < 0 ? 0 : completionTokens;
      cachedTokens = isNaN(cachedTokens) || cachedTokens < 0 ? 0 : cachedTokens;
      cost = isNaN(cost) || cost < 0 ? 0 : cost;

      useBatchStore.getState().addSessionTokens(promptTokens, completionTokens, cachedTokens, cost);
    } catch (statErr) {
      console.warn("Failed to record batch session stats:", statErr);
    }

    const assistantPayloadJson = JSON.stringify({
      translations: items.map((it) => ({
        id: it.id,
        translated_speaker: it.translatedSpeaker || null,
        translated_message: it.translatedMessage || it.originalMessage,
      })),
    });

    return {
      userContent: rawUserContent,
      assistantContent: assistantPayloadJson,
      lineCount: items.length,
    };
  }

  public async saveTranslatedFile(file: BatchFileEntry, settings: BatchSettings): Promise<void> {
    try {
      const outputLines = file.items.map((item) => {
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

      const outputContent = outputLines.join("\n");
      const targetPath = this.calculateOutputPath(file.path, settings.outputDir, settings.fileSuffix);

      await invoke("save_script_file", { path: targetPath, content: outputContent });
      logger.info("BatchTranslate", `Saved to disk (.jsonl): ${targetPath} (${file.completedLines}/${file.totalLines} lines)`);
    } catch (err: any) {
      logger.error("BatchTranslate", `Failed to save translated file ${file.name}: ${err?.message || err}`);
    }
  }

  public cancel() {
    if (this.abortController) {
      this.abortController.abort();
    }
    invoke("cancel_all_llm_streams").catch(() => {});
    useBatchStore.getState().clearAllStreamingStates();
    logger.info("BatchTranslate", "Batch translation cancellation requested.");
  }
}

export const batchTranslateService = new BatchTranslateService();
