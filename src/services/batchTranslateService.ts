import { TauriBridge } from "./tauriBridge";
import { parseScriptContentAsBatchItems } from "../utils/scriptFileParser";
import { cleanSpeakerName, executePreprocessingPipeline } from "../utils/textPreprocessor";
import { logger } from "./loggerService";
import { useBatchStore } from "../stores/useBatchStore";
import { settingsManager } from "./settingsManager";
import { executeBatchLlm } from "./batch/batchLlmExecutor";
import { executeBatchFreeMt } from "./batch/batchFreeMtExecutor";
import { createBatchChunks } from "./batch/batchIterator";
import { evaluateRetry } from "./batch/batchRetryPolicy";
import { eventBus } from "./eventBus";
import { ManagedService } from "./appContainer";

import {
  BatchItem,
  BatchFileEntry,
  WholeTurnBatch,
  BatchProgressUpdate,
  BatchSettings,
  SOURCE_EAST_ASIAN_CHAR_REGEX,
  isExplicitTagged,
  isGenuinelyTranslated,
  isProcessed,
  cancellableSleep,
  calculateOutputPath,
  serializeBatchItemsToJsonl,
  saveTranslatedFileToDisk,
  hydrateExistingTranslationFromDisk,
} from "../utils/batchFileUtils";

export type { BatchItem, BatchFileEntry, WholeTurnBatch, BatchProgressUpdate, BatchSettings };
export {
  SOURCE_EAST_ASIAN_CHAR_REGEX,
  isExplicitTagged,
  isGenuinelyTranslated,
  isProcessed,
  cancellableSleep,
  calculateOutputPath,
  serializeBatchItemsToJsonl,
  saveTranslatedFileToDisk,
  hydrateExistingTranslationFromDisk,
};

export const DISK_SAVE_THROTTLE_MS = 3000;

class BatchTranslateService implements ManagedService {
  public readonly id = "batchTranslateService";
  private isRunning = false;
  private abortController: AbortController | null = null;
  private listeners: ((progress: BatchProgressUpdate) => void)[] = [];
  private lastDispatchTimestamp = 0;
  private dispatchLock: Promise<void> = Promise.resolve();

  /**
   * Serialized Pacing Gate:
   * Enforces a minimum delay (e.g. 1-3 seconds) between ANY batch request sent to the provider.
   * Prevents parallel workers from bursting simultaneous requests, protecting against rate limits (HTTP 429).
   */
  public async acquireDispatchSlot(minDelayMs: number, abortSignal?: AbortSignal): Promise<void> {
    if (minDelayMs <= 0) return;

    let releaseLock!: () => void;
    const previousLock = this.dispatchLock;
    this.dispatchLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    try {
      await previousLock;
      if (abortSignal?.aborted) return;

      const now = Date.now();
      const elapsed = now - this.lastDispatchTimestamp;
      const waitNeeded = Math.max(0, minDelayMs - elapsed);

      if (waitNeeded > 0) {
        await cancellableSleep(waitNeeded, abortSignal);
      }
      this.lastDispatchTimestamp = Date.now();
    } finally {
      releaseLock();
    }
  }

  public init() {
    // Lifecycle initialization
  }

  public async dispose() {
    await this.cancel();
    this.listeners = [];
  }

  public subscribe(callback: (progress: BatchProgressUpdate) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notify(update: BatchProgressUpdate) {
    this.listeners.forEach((cb) => cb(update));
    useBatchStore.getState().setProgressData(update);
    eventBus.emit("batch:progress", update);
  }

  public isBusy(): boolean {
    return this.isRunning;
  }

  /**
   * Computes the target absolute output path for a given source script file (always saved as .jsonl)
   */
  public calculateOutputPath(sourcePath: string, outputDir?: string, fileSuffix = "_translated"): string {
    return calculateOutputPath(sourcePath, outputDir, fileSuffix);
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
    return hydrateExistingTranslationFromDisk(file, outputDir, fileSuffix);
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
    this.lastDispatchTimestamp = 0;
    this.dispatchLock = Promise.resolve();
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
        const linesBeforePass = files.reduce((acc, f) => acc + f.completedLines, 0);

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
                files,
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

        const linesAfterPass = files.reduce((acc, f) => acc + f.completedLines, 0);
        const MAX_AUTO_CONTINUE_PASSES = 5;
        if (loopPass >= MAX_AUTO_CONTINUE_PASSES || linesAfterPass === linesBeforePass) {
          logger.warn(
            "BatchTranslate",
            `[Auto-Continue] Halting auto-continue loop: ${loopPass >= MAX_AUTO_CONTINUE_PASSES ? `Reached maximum of ${MAX_AUTO_CONTINUE_PASSES} passes` : "No new lines completed in this pass (persistent error detected)"}. Incomplete files: ${stillRemaining.length}.`
          );
          break;
        }

        // If there are still remaining files and autoContinue is enabled, pause for cooldown then retry!
        logger.warn(
          "BatchTranslate",
          `[Auto-Continue] ${stillRemaining.length} file(s) incomplete after pass ${loopPass} (Progress: +${linesAfterPass - linesBeforePass} lines). Cooling down 5s before pass ${loopPass + 1}/${MAX_AUTO_CONTINUE_PASSES}...`
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
    allFiles: BatchFileEntry[],
    settings: BatchSettings,
    apiKey: string,
    onLineTranslated: (recentLine?: BatchProgressUpdate["recentLine"]) => void,
    onFileUpdated: (file: BatchFileEntry) => void
  ): Promise<void> {
    const isExplicitMode = Boolean(settings.translateExplicitOnly);
    const mode = isExplicitMode ? "explicit-only" : "all";

    // Initial check: gather chunks using composable iterator
    const batchChunks = createBatchChunks(file.items, settings.linesPerBatch, mode);

    if (batchChunks.length === 0) {
      const completed = file.items.filter((it) => isGenuinelyTranslated(it)).length;
      const explicit = file.items.filter((it) => isExplicitTagged(it)).length;
      logger.info(
        "BatchTranslate",
        `[File ${fileIndex + 1}/${totalFilesCount}] "${file.name}" has 0 pending lines in ${mode} mode. Skipping.`
      );
      file.status = "completed";
      file.completedLines = completed;
      file.explicitLines = explicit;
      file.error = undefined;
      onFileUpdated({ ...file, items: [...file.items] });
      return;
    }

    file.status = "processing";
    file.error = undefined;
    file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;
    file.explicitLines = file.items.filter((it) => isExplicitTagged(it)).length;
    onFileUpdated({ ...file, items: [...file.items] });

    logger.info(
      "BatchTranslate",
      `[File ${fileIndex + 1}/${totalFilesCount}] Starting "${file.name}" [${mode} mode] (${batchChunks.length} batches, Done: ${file.completedLines}/${file.totalLines})`
    );

    const isLlm = !settings.modelId.startsWith("mt:");
    let contextHistory: WholeTurnBatch[] = [];
    let fileHalted = false;
    let lastErrorMessage = "";
    let lastDiskSaveTime = 0;

    // Reconstruct preceding context turns if resuming mid-file
    const firstChunkStart = batchChunks[0].chunkIndices[0];
    if (firstChunkStart > 0 && settings.maxBatchContext > 0) {
      const precedingBatchCount = Math.max(1, Math.min(settings.maxBatchContext, settings.retainBatchContext || 1));
      const precedingLinesNeeded = precedingBatchCount * settings.linesPerBatch;
      const precedingStart = Math.max(0, firstChunkStart - precedingLinesNeeded);
      const precedingItems = file.items.slice(precedingStart, firstChunkStart).filter((it) => isGenuinelyTranslated(it));
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

    // Initialize continuous virtual monotonic sequence counter
    let currentVirtualId = 1;
    if (batchChunks.length > 0 && batchChunks[0].chunkItems.length > 0) {
      currentVirtualId = batchChunks[0].chunkItems[0].id;
    }

    for (let bIdx = 0; bIdx < batchChunks.length; bIdx++) {
      if (this.abortController?.signal.aborted) return;

      const chunk = batchChunks[bIdx];
      const chunkItems = chunk.chunkItems;
      const originallyExplicitIds = isExplicitMode
        ? new Set(chunkItems.filter((it) => isExplicitTagged(it)).map((it) => it.id))
        : undefined;

      // Continuous Monotonic Sequence: Assign sequential virtual IDs to eliminate LLM hallucinations on skipped lines
      const realToVirtualMap = new Map<number, number>();
      chunkItems.forEach((ci) => {
        realToVirtualMap.set(ci.id, currentVirtualId++);
      });

      let batchSuccess = false;
      let retryAttempts = 0;
      const batchStartTime = Date.now();

      while (!batchSuccess) {
        if (this.abortController?.signal.aborted) break;

        try {
          const pacingDelay = settings.delayMs !== undefined ? settings.delayMs : 1500;

          if (isLlm) {
            const isParsingError =
              lastErrorMessage.includes("JSON") ||
              lastErrorMessage.includes("syntax") ||
              lastErrorMessage.includes("schema") ||
              lastErrorMessage.includes("validation");

            const activeContext = retryAttempts >= 2 && isParsingError ? [] : contextHistory;

            // Enforce serialized dispatch pacing to prevent burst requests and rate limits
            if (pacingDelay > 0) {
              useBatchStore.getState().setFileStreamingState(file.id, (prev) =>
                prev ? { ...prev, phase: "cooldown" } : null
              );
              await this.acquireDispatchSlot(pacingDelay, this.abortController?.signal);
            }

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
                batchIndex: bIdx + 1,
                totalBatches: batchChunks.length,
              },
              realToVirtualMap
            );

            contextHistory.push(resultTurn);

            if (settings.maxBatchContext > 0 && contextHistory.length >= settings.maxBatchContext) {
              const retainTarget = Math.max(1, Math.min(settings.retainBatchContext, settings.maxBatchContext));
              while (contextHistory.length > retainTarget) {
                contextHistory.shift();
              }
            } else if (settings.maxBatchContext === 0) {
              contextHistory = [];
            }
          } else {
            if (pacingDelay > 0) {
              await this.acquireDispatchSlot(pacingDelay, this.abortController?.signal);
            }
            // Free MT engine fallback
            await executeBatchFreeMt({
              chunkItems,
              settings,
              filterIds: originallyExplicitIds,
              fileName: file.name,
              onLineTranslated: (lineInfo) => {
                file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;
                onLineTranslated(lineInfo);
              },
              abortSignal: this.abortController?.signal,
            });
          }

          batchSuccess = true;
          file.error = undefined;

          // Track completion duration per batch and update live ETA in store based on TOTAL remaining batches
          const batchDurationMs = Date.now() - batchStartTime;
          const currentFileRemaining = Math.max(0, batchChunks.length - 1 - bIdx);
          let totalRemainingBatches = currentFileRemaining;
          for (const otherFile of allFiles) {
            if (otherFile.id === file.id) continue;
            if ((otherFile.status as string) === "completed") continue;
            const pendingLines = isExplicitMode
              ? otherFile.items.filter((it) => isExplicitTagged(it)).length
              : otherFile.items.filter((it) => !isProcessed(it)).length;
            if (pendingLines > 0) {
              totalRemainingBatches += Math.ceil(pendingLines / Math.max(1, settings.linesPerBatch));
            }
          }

          useBatchStore.getState().recordBatchCompletion(
            batchDurationMs,
            totalRemainingBatches,
            settings.concurrency || 2
          );

          // Immutable update of file items with O(1) lookup map (H7)
          const chunkMap = new Map(chunkItems.map((ci) => [ci.id, ci]));
          file.items = file.items.map((it) => {
            const match = chunkMap.get(it.id);
            return match ? { ...match } : it;
          });
          file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;
          file.explicitLines = file.items.filter((it) => isExplicitTagged(it)).length;

          const isFileFinished = file.completedLines + (file.explicitLines || 0) >= file.totalLines && file.totalLines > 0;
          if (isFileFinished) {
            file.status = "completed";
          }

          const now = Date.now();
          if (now - lastDiskSaveTime >= DISK_SAVE_THROTTLE_MS || isFileFinished || bIdx === batchChunks.length - 1) {
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
        } catch (err: unknown) {
          if (this.abortController?.signal.aborted) break;

          retryAttempts++;
          lastErrorMessage = err instanceof Error ? err.message : String(err);

          const evalResult = evaluateRetry(err, retryAttempts, {
            maxRetries: 5,
            maxBackoffSeconds: settings.maxBackoffSeconds,
            autoContinueUntilCompleted: settings.autoContinueUntilCompleted,
          });

          if (!evalResult.shouldRetry) {
            logger.error(
              "BatchTranslate",
              `[${file.name}] Batch ${bIdx + 1}/${batchChunks.length} halted: ${evalResult.attemptInfo} (${lastErrorMessage})`
            );
            break;
          }

          logger.warn(
            "BatchTranslate",
            `[${file.name}] Batch ${bIdx + 1}/${batchChunks.length} failed (${lastErrorMessage.slice(0, 80)}...). Retrying in ${(evalResult.backoffMs / 1000).toFixed(1)}s (${evalResult.attemptInfo})...`
          );

          file.status = "processing";
          file.error = `Retrying batch ${bIdx + 1}/${batchChunks.length} (${evalResult.attemptInfo}): ${lastErrorMessage.slice(0, 70)}`;
          onFileUpdated({ ...file, items: [...file.items] });

          await cancellableSleep(evalResult.backoffMs, this.abortController?.signal);
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
            `[${file.name}] Batch ${bIdx + 1} failed after ${retryAttempts} retries. Error: ${lastErrorMessage}`
          );
          file.error = `Batch ${bIdx + 1} failed after ${retryAttempts} retries: ${lastErrorMessage}`;
        }
        break;
      }
    }

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

  private async translateBatchLlm(
    items: BatchItem[],
    apiKey: string,
    settings: BatchSettings,
    contextHistory: WholeTurnBatch[],
    onItemSuccess: (item: BatchItem) => void,
    allowedOverwriteIds?: Set<number>,
    fileContext?: { fileId: string; fileName: string; batchIndex: number; totalBatches: number },
    realToVirtualMap?: Map<number, number>
  ): Promise<WholeTurnBatch> {
    return executeBatchLlm({
      items,
      apiKey,
      settings,
      contextHistory,
      onItemSuccess,
      allowedOverwriteIds,
      fileContext,
      abortController: this.abortController,
      realToVirtualMap,
    });
  }

  public async saveTranslatedFile(file: BatchFileEntry, settings: BatchSettings): Promise<void> {
    return saveTranslatedFileToDisk(file, settings);
  }

  public async cancel(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }
    try {
      await TauriBridge.cancelAllLlmStreams();
    } catch (err) {
      logger.warn("BatchTranslate", `Failed to cancel LLM streams: ${err}`);
    }
    useBatchStore.getState().clearAllStreamingStates();
    logger.info("BatchTranslate", "Batch translation cancellation completed.");
  }
}

export const batchTranslateService = new BatchTranslateService();
