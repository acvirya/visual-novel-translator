import { invoke } from "@tauri-apps/api/core";
import { translateWithFreeMt } from "./freeMtService";
import { buildCompleteSystemPrompt, ChatMessage, calculateUsageCost, OpenRouterCompletionResponse } from "./openRouterService";
import { extractSpeakerAndDialogue, executePreprocessingPipeline } from "../utils/textPreprocessor";
import { logger } from "./loggerService";
import { useBatchStore } from "../stores/useBatchStore";

export interface BatchItem {
  id: number;
  originalSpeaker?: string;
  originalMessage: string;
  translatedSpeaker?: string;
  translatedMessage?: string;
  rawJson?: any; // preserved original keys
}

export interface BatchFileEntry {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  rawContent: string;
  items: BatchItem[];
  detectedKeys: string[];
  status: "ready" | "processing" | "completed" | "error";
  completedLines: number;
  explicitLines?: number;
  totalLines: number;
  error?: string;
}

export interface KeyMappingConfig {
  sourceSpeakerKey: string; // e.g. "speaker", "name", "character", "none", or "auto"
  sourceMessageKey: string; // e.g. "message", "text", "dialogue", "auto"
  targetSpeakerKey: string; // e.g. "translated_speaker"
  targetMessageKey: string; // e.g. "translated_message"
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
  autoContinueUntilCompleted?: boolean; // Infinite retry until 100% completed
  translateExplicitOnly?: boolean; // Only re-translate lines previously flagged as explicit/censored
  overrideRawWithPreprocessed?: boolean; // Overwrite raw Japanese text with cleaned preprocessed text in output
  outputDir: string;
  fileSuffix: string;
  keyMapping: KeyMappingConfig;
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

const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;

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
  // - If the original contains Japanese characters, then identical text means un-translated fallback copas (false).
  // - If the original has NO Japanese characters (e.g. "...", "……", "!? ", "OK", "Yes"), then identical text is VALID (true)!
  if (transMsg === rawMsg && JAPANESE_CHAR_REGEX.test(rawMsg)) {
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

class BatchTranslateService {
  private isRunning = false;
  private isPaused = false;
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

  public isPausedState(): boolean {
    return this.isPaused;
  }

  /**
   * Computes the target absolute output path for a given source script file
   */
  public calculateOutputPath(sourcePath: string, outputDir?: string, fileSuffix = "_translated"): string {
    const cleanSource = sourcePath.replace(/\\/g, "/");
    const fileName = cleanSource.split("/").pop() || "script.jsonl";
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    const ext = fileName.endsWith(".json") ? ".json" : ".jsonl";
    const outFileName = `${baseName}${fileSuffix || "_translated"}${ext}`;

    if (outputDir && outputDir.trim()) {
      const dir = outputDir.trim().replace(/\\/g, "/").replace(/\/$/, "");
      return `${dir}/${outFileName}`;
    } else {
      const parentDir = cleanSource.substring(0, cleanSource.lastIndexOf("/"));
      return `${parentDir}/${outFileName}`;
    }
  }

  /**
   * Scans if an output translation file already exists on disk.
   * If found, hydrates the genuinely translated lines into file.items and updates completedLines!
   * Ignores lines where translated message is identical to raw un-translated text.
   */
  public async hydrateExistingTranslationFromDisk(
    file: BatchFileEntry,
    outputDir?: string,
    fileSuffix = "_translated",
    mapping?: KeyMappingConfig
  ): Promise<BatchFileEntry> {
    const targetPath = this.calculateOutputPath(file.path, outputDir, fileSuffix);

    try {
      const existingContent = await invoke<string | null>("read_script_file_by_path", { path: targetPath });
      if (existingContent && existingContent.trim()) {
        const existingItems = this.parseScriptContent(existingContent, mapping);
        if (Array.isArray(existingItems) && existingItems.length > 0) {
          let translatedCount = 0;
          let explicitCount = 0;

          file.items.forEach((item, idx) => {
            const found = existingItems.find((e) => e.id === item.id) || existingItems[idx];
            if (found && isGenuinelyTranslated(found)) {
              item.translatedSpeaker = found.translatedSpeaker || undefined;
              item.translatedMessage = found.translatedMessage;
              translatedCount++;
            } else if (found && isExplicitTagged(found)) {
              item.translatedSpeaker = found.translatedSpeaker || undefined;
              item.translatedMessage = found.translatedMessage;
              explicitCount++;
            } else {
              item.translatedSpeaker = undefined;
              item.translatedMessage = undefined;
            }
          });

          file.completedLines = translatedCount;
          file.explicitLines = explicitCount;
          if (translatedCount >= file.totalLines && file.totalLines > 0 && explicitCount === 0) {
            file.status = "completed";
          } else {
            file.status = "ready";
          }

          logger.info(
            "BatchTranslate",
            `[Hydrate] Verified existing output file on disk for "${file.name}" (${translatedCount}/${file.totalLines} lines genuinely translated, ${explicitCount} explicit).`
          );
          return { ...file };
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
   * Scans a script file to extract all unique JSON keys present in the data
   */
  public detectAvailableKeys(content: string): string[] {
    const keysSet = new Set<string>();
    const trimmed = content.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          parsed.slice(0, 30).forEach((obj) => {
            if (typeof obj === "object" && obj !== null) {
              Object.keys(obj).forEach((k) => keysSet.add(k));
            }
          });
        }
      } catch {}
    }

    const lines = trimmed.split(/\r?\n/).slice(0, 50);
    for (const line of lines) {
      const l = line.trim();
      if (l.startsWith("{") && l.endsWith("}")) {
        try {
          const obj = JSON.parse(l);
          if (typeof obj === "object" && obj !== null) {
            Object.keys(obj).forEach((k) => keysSet.add(k));
          }
        } catch {}
      }
    }

    return Array.from(keysSet);
  }

  /**
   * Parses script content into BatchItem[] with customizable key mapping
   */
  public parseScriptContent(content: string, mapping?: KeyMappingConfig): BatchItem[] {
    const items: BatchItem[] = [];
    const trimmed = content.trim();
    if (!trimmed) return items;

    const spkKey = mapping?.sourceSpeakerKey?.trim() || "auto";
    const msgKey = mapping?.sourceMessageKey?.trim() || "auto";
    const tgtSpkKey = mapping?.targetSpeakerKey?.trim() || "translated_speaker";
    const tgtMsgKey = mapping?.targetMessageKey?.trim() || "translated_message";

    const extractFromObject = (obj: any, idx: number): BatchItem => {
      let spk: string | undefined = undefined;
      let msg = "";

      // 1. Extract Speaker
      if (spkKey === "none") {
        spk = undefined;
      } else if (spkKey !== "auto" && obj[spkKey] !== undefined) {
        spk = String(obj[spkKey]).trim();
      } else {
        // Auto-detect speaker keys
        const detected = obj.speaker ?? obj.name ?? obj.character ?? obj.chara ?? obj.jp_name ?? obj.speaker_name ?? obj.actor;
        if (detected !== undefined && detected !== null && detected !== "") {
          spk = String(detected).trim();
        }
      }

      // 2. Extract Message
      if (msgKey !== "auto" && obj[msgKey] !== undefined) {
        msg = String(obj[msgKey]).trim();
      } else {
        // Auto-detect message keys
        const detected = obj.message ?? obj.text ?? obj.dialogue ?? obj.msg ?? obj.original_message ?? obj.original ?? obj.body ?? obj.content ?? obj.line;
        if (detected !== undefined && detected !== null) {
          msg = String(detected).trim();
        }
      }

      const rawTgtSpk = obj[tgtSpkKey] ?? obj.translated_speaker ?? obj.translatedSpeaker;
      const rawTgtMsg = obj[tgtMsgKey] ?? obj.translated_message ?? obj.translatedMessage;

      const tgtSpk = rawTgtSpk !== undefined && rawTgtSpk !== null && rawTgtSpk !== "null" ? String(rawTgtSpk).trim() : undefined;
      const tgtMsg = rawTgtMsg !== undefined && rawTgtMsg !== null ? String(rawTgtMsg).trim() : (!msg ? "" : undefined);

      return {
        id: idx + 1,
        originalSpeaker: spk || undefined,
        originalMessage: msg,
        translatedSpeaker: tgtSpk,
        translatedMessage: tgtMsg,
        rawJson: obj,
      };
    };

    // 1. Try JSON Array format
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          parsed.forEach((obj, idx) => {
            if (typeof obj === "string") {
              const ext = extractSpeakerAndDialogue(obj);
              items.push({
                id: idx + 1,
                originalSpeaker: ext.speaker || undefined,
                originalMessage: ext.message,
                translatedMessage: !ext.message ? "" : undefined,
              });
            } else if (typeof obj === "object" && obj !== null) {
              items.push(extractFromObject(obj, idx));
            }
          });
          if (items.length > 0) return items;
        }
      } catch {}
    }

    // 2. Try JSONL format (line-by-line JSON)
    const lines = trimmed.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith("{") && line.endsWith("}")) {
        try {
          const obj = JSON.parse(line);
          items.push(extractFromObject(obj, items.length));
        } catch {}
      } else {
        // Plain text line
        const ext = extractSpeakerAndDialogue(line);
        items.push({
          id: items.length + 1,
          originalSpeaker: ext.speaker || undefined,
          originalMessage: ext.message,
          translatedMessage: !ext.message ? "" : undefined,
        });
      }
    }

    return items;
  }

  public async runBatchTranslation(
    files: BatchFileEntry[],
    settings: BatchSettings,
    onFileUpdated: (file: BatchFileEntry) => void
  ): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.abortController = new AbortController();
    useBatchStore.getState().setIsRunning(true);
    useBatchStore.getState().setIsPaused(false);

    try {
      const apiKey = localStorage.getItem("vn_openrouter_api_key") || "";
      const concurrency = Math.max(1, Math.min(8, settings.concurrency || 2));

      logger.info(
        "BatchTranslate",
        `Starting parallel batch translation for ${files.length} files (Mode: ${settings.translateExplicitOnly ? "EXPLICIT-ONLY" : "STANDARD"}, Workers: ${concurrency}, Model: ${settings.modelId}, Batch size: ${settings.linesPerBatch})`
      );

      // Initial pass: hydrate from disk if output file already exists
      for (const f of files) {
        if (f.status !== "completed" || settings.translateExplicitOnly || f.items.some((it) => isExplicitTagged(it))) {
          await this.hydrateExistingTranslationFromDisk(f, settings.outputDir, settings.fileSuffix, settings.keyMapping);
          onFileUpdated({ ...f });
        }
      }

      let totalAllLines = files.reduce((acc, f) => acc + f.totalLines, 0);
      let completedAllLines = files.reduce((acc, f) => acc + f.completedLines, 0);
      let completedFilesCount = files.filter((f) => (f.status as string) === "completed").length;

      let loopPass = 0;
      while (!this.abortController?.signal.aborted) {
        loopPass++;

        const uncompletedFiles = files.filter((f) => {
          if (settings.translateExplicitOnly) {
            return f.items.some((it) => isExplicitTagged(it));
          }
          return (f.status as string) !== "completed";
        });

        if (uncompletedFiles.length === 0) {
          if (settings.translateExplicitOnly) {
            logger.info("BatchTranslate", "All files have 0 explicit-flagged lines. Re-translation complete.");
          }
          break; // All targeted files completed!
        }

        if (loopPass > 1) {
          logger.info(
            "BatchTranslate",
            `[Auto-Continue Pass ${loopPass}] Retrying ${uncompletedFiles.length} incomplete file(s)...`
          );
        }

        const uncompletedQueue = [...uncompletedFiles];
        const getNextFile = () => uncompletedQueue.shift();

        const worker = async (_workerId: number) => {
          while (!this.abortController?.signal.aborted) {
            const file = getNextFile();
            if (!file) break;
            if (settings.translateExplicitOnly && !file.items.some((it) => isExplicitTagged(it))) continue;
            if (!settings.translateExplicitOnly && (file.status as string) === "completed") continue;

            await this.processSingleFile(
              file,
              files.indexOf(file),
              files.length,
              settings,
              apiKey,
              () => {
                completedAllLines = files.reduce((acc, f) => acc + f.completedLines, 0);
                completedFilesCount = files.filter((f) => (f.status as string) === "completed").length;
                this.notify({
                  activeFileId: file.id,
                  activeFileName: file.name,
                  totalFiles: files.length,
                  completedFiles: completedFilesCount,
                  totalLines: totalAllLines,
                  completedLines: completedAllLines,
                  currentBatch: 0,
                  totalBatches: 0,
                });
              },
              (f) => {
                onFileUpdated({ ...f });
              }
            );

            completedFilesCount = files.filter((f) => (f.status as string) === "completed").length;
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

        for (let s = 5; s > 0; s--) {
          if (this.abortController?.signal.aborted) break;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      completedAllLines = files.reduce((acc, f) => acc + f.completedLines, 0);
      completedFilesCount = files.filter((f) => (f.status as string) === "completed").length;

      logger.info(
        "BatchTranslate",
        `Batch translation finished! Completed files: ${completedFilesCount}/${files.length}, Total translated lines: ${completedAllLines}/${totalAllLines}`
      );
    } finally {
      this.isRunning = false;
      this.isPaused = false;
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
    onLineTranslated: () => void,
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

      while (true) {
        if (this.abortController?.signal.aborted) return;
        while (this.isPaused) {
          await new Promise((r) => setTimeout(r, 300));
          if (this.abortController?.signal.aborted) return;
        }

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
        const chunkItems = file.items.slice(startIdx, endIdx);

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
                speaker: it.originalSpeaker ? executePreprocessingPipeline(it.originalSpeaker, "batch") : undefined,
                message: executePreprocessingPipeline(it.originalMessage, "batch"),
              }));
              const aJson = chunk.map((it) => ({
                id: it.id,
                translated_speaker: it.translatedSpeaker || null,
                translated_message: it.translatedMessage,
              }));
              contextHistory.push({
                userContent: JSON.stringify(uJson, null, 2),
                assistantContent: JSON.stringify(aJson, null, 2),
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

          while (this.isPaused) {
            await new Promise((r) => setTimeout(r, 300));
            if (this.abortController?.signal.aborted) break;
          }
          if (this.abortController?.signal.aborted) break;

          try {
            if (isLlm) {
              const activeContext = retryAttempts >= 2 ? [] : contextHistory;

              const resultTurn = await this.translateBatchLlm(
                chunkItems,
                apiKey,
                settings,
                activeContext,
                () => {
                  onLineTranslated();
                },
                originallyExplicitIds
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
                    ? executePreprocessingPipeline(item.originalSpeaker, "batch")
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
                  onLineTranslated();
                }
              }
            }

            batchSuccess = true;
            file.error = undefined;
            file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;
            file.explicitLines = file.items.filter((it) => isExplicitTagged(it)).length;
            await this.saveTranslatedFile(file, settings);
            onFileUpdated(file);

            this.notify({
              activeFileId: file.id,
              activeFileName: file.name,
              totalFiles: totalFilesCount,
              completedFiles: 0,
              totalLines: file.totalLines,
              completedLines: file.completedLines,
              explicitLines: file.explicitLines,
              currentBatch: explicitBatchNum,
              totalBatches: 0,
              recentLine: chunkItems[0]
                ? {
                    id: chunkItems[0].id,
                    fileName: file.name,
                    speaker: chunkItems[0].originalSpeaker,
                    translatedSpeaker: chunkItems[0].translatedSpeaker,
                    original: chunkItems[0].originalMessage,
                    translated: chunkItems[0].translatedMessage || "",
                  }
                : undefined,
            });
          } catch (err: any) {
            if (this.abortController?.signal.aborted) break;
            retryAttempts++;
            lastErrorMessage = err?.message || String(err);
            const isRateLimit =
              lastErrorMessage.includes("429") ||
              lastErrorMessage.toLowerCase().includes("rate-limit") ||
              lastErrorMessage.toLowerCase().includes("too many requests");
            const backoffMs = isRateLimit
              ? Math.min(30000, 2000 * Math.pow(1.5, Math.min(retryAttempts, 8)))
              : Math.min(10000, 1500 + Math.min(retryAttempts, 8) * 1000);
            const attemptInfo = isInfiniteRetry ? `Retry #${retryAttempts}` : `Attempt ${retryAttempts}/${maxRetries}`;

            logger.warn(
              "BatchTranslate",
              `[${file.name}] Explicit Batch #${explicitBatchNum} failed (${lastErrorMessage.slice(0, 80)}...). Retrying in ${(backoffMs / 1000).toFixed(1)}s (${attemptInfo})...`
            );

            file.status = "processing";
            file.error = `Retrying explicit batch #${explicitBatchNum} (${attemptInfo}): ${lastErrorMessage.slice(0, 70)}`;
            onFileUpdated(file);
            await new Promise((r) => setTimeout(r, backoffMs));
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
          await new Promise((r) => setTimeout(r, settings.delayMs));
        }
      }

      file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;
      const remainingExplicit = file.items.filter((it) => isExplicitTagged(it)).length;
      if (remainingExplicit === 0 && !fileHalted) {
        file.status = "completed";
        file.error = undefined;
        await this.saveTranslatedFile(file, settings);
      } else {
        file.status = "error";
        file.error = `Paused: ${remainingExplicit} explicit-tagged lines remaining`;
        await this.saveTranslatedFile(file, settings);
      }
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
      await this.saveTranslatedFile(file, settings);
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
            speaker: it.originalSpeaker ? executePreprocessingPipeline(it.originalSpeaker, "batch") : undefined,
            message: executePreprocessingPipeline(it.originalMessage, "batch"),
          }));
          const aJson = chunk.map((it) => ({
            id: it.id,
            translated_speaker: it.translatedSpeaker || null,
            translated_message: it.translatedMessage,
          }));
          contextHistory.push({
            userContent: JSON.stringify(uJson, null, 2),
            assistantContent: JSON.stringify(aJson, null, 2),
            lineCount: chunk.length,
          });
        }
      }
    }

    let fileHalted = false;
    let lastErrorMessage = "";

    for (let bIdx = 0; bIdx < batchChunks.length; bIdx++) {
      if (this.abortController?.signal.aborted) return;

      while (this.isPaused) {
        await new Promise((r) => setTimeout(r, 300));
        if (this.abortController?.signal.aborted) return;
      }

      const chunkIndices = batchChunks[bIdx];
      const chunkItems = chunkIndices.map((idx) => file.items[idx]);

      let batchSuccess = false;
      let retryAttempts = 0;
      const isInfiniteRetry = settings.autoContinueUntilCompleted !== false;
      const maxRetries = isInfiniteRetry ? Infinity : 5;

      while (!batchSuccess) {
        if (this.abortController?.signal.aborted) break;
        if (!isInfiniteRetry && retryAttempts >= maxRetries) break;

        while (this.isPaused) {
          await new Promise((r) => setTimeout(r, 300));
          if (this.abortController?.signal.aborted) break;
        }
        if (this.abortController?.signal.aborted) break;

        try {
          if (isLlm) {
            // On repeated retries (>= 2), clear previous context turns to break out of context-poisoned hallucination loops
            const activeContext = retryAttempts >= 2 ? [] : contextHistory;

            const resultTurn = await this.translateBatchLlm(
              chunkItems,
              apiKey,
              settings,
              activeContext,
              () => {
                onLineTranslated();
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
                ? executePreprocessingPipeline(item.originalSpeaker, "batch")
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
              onLineTranslated();

              this.notify({
                activeFileId: file.id,
                activeFileName: file.name,
                totalFiles: totalFilesCount,
                completedFiles: 0,
                totalLines: 0,
                completedLines: 0,
                currentBatch: bIdx + 1,
                totalBatches: batchChunks.length,
                recentLine: {
                  id: item.id,
                  fileName: file.name,
                  speaker: item.originalSpeaker,
                  translatedSpeaker: item.translatedSpeaker,
                  original: item.originalMessage,
                  translated: item.translatedMessage,
                },
              });

              if (settings.delayMs > 0) {
                await new Promise((r) => setTimeout(r, settings.delayMs));
              }
            }
          }

          batchSuccess = true;
          file.error = undefined;
          file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;
          file.explicitLines = file.items.filter((it) => isExplicitTagged(it)).length;
          if (file.completedLines + (file.explicitLines || 0) >= file.totalLines && file.totalLines > 0) {
            file.status = "completed";
          }
          // Synchronize output file to disk progressively
          await this.saveTranslatedFile(file, settings);
          onFileUpdated({ ...file });
        } catch (err: any) {
          if (this.abortController?.signal.aborted) break;

          retryAttempts++;
          lastErrorMessage = err?.message || String(err);

          const isRateLimit =
            lastErrorMessage.includes("429") ||
            lastErrorMessage.toLowerCase().includes("rate-limit") ||
            lastErrorMessage.toLowerCase().includes("too many requests");

          const backoffMs = isRateLimit
            ? Math.min(30000, 2000 * Math.pow(1.5, Math.min(retryAttempts, 8)))
            : Math.min(10000, 1500 + Math.min(retryAttempts, 8) * 1000);

          const attemptInfo = isInfiniteRetry
            ? `Retry #${retryAttempts}`
            : `Attempt ${retryAttempts}/${maxRetries}`;

          logger.warn(
            "BatchTranslate",
            `[${file.name}] Batch ${bIdx + 1}/${batchChunks.length} failed (${lastErrorMessage.slice(0, 80)}...). Retrying in ${(backoffMs / 1000).toFixed(1)}s (${attemptInfo})...`
          );

          file.status = "processing";
          file.error = `Retrying batch ${bIdx + 1}/${batchChunks.length} (${attemptInfo}): ${lastErrorMessage.slice(0, 70)}`;
          onFileUpdated({ ...file });

          await new Promise((r) => setTimeout(r, backoffMs));
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
        await new Promise((r) => setTimeout(r, settings.delayMs));
      }
    }

    // Check file final status and update completedLines count
    file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;
    file.explicitLines = file.items.filter((it) => isExplicitTagged(it)).length;

    if (file.completedLines + (file.explicitLines || 0) >= file.totalLines && !fileHalted) {
      file.status = "completed";
      file.error = undefined;
      await this.saveTranslatedFile(file, settings);
    } else {
      file.status = "error";
      file.error = `Paused at batch (${file.completedLines}/${file.totalLines} lines translated): ${lastErrorMessage || "Halted"}`;
      if (file.completedLines > 0 || (file.explicitLines || 0) > 0) {
        await this.saveTranslatedFile(file, settings);
      }
    }

    onFileUpdated({ ...file });
  }

  public async writeBatchDebugLog(params: {
    outputDir?: string;
    modelId: string;
    error?: string;
    messages: ChatMessage[];
    rawResponse?: string;
    parsedArray?: any[];
    items: BatchItem[];
    extraInfo?: string;
  }): Promise<void> {
    const timestamp = new Date().toLocaleString();
    const sep = "=".repeat(80);
    const subSep = "-".repeat(60);

    let formattedChat = "";
    params.messages.forEach((m, idx) => {
      formattedChat += `\n[Message #${idx + 1} | Role: ${m.role.toUpperCase()}]\n${m.content}\n${subSep}`;
    });

    const logEntry = `\n${sep}\n` +
      `[BATCH TRANSLATE DEBUG LOG - ${timestamp}]\n` +
      `Model: ${params.modelId}\n` +
      `Items In Batch: IDs [${params.items.map((i) => i.id).join(", ")}] (Total: ${params.items.length} lines)\n` +
      (params.error ? `Error Message: ${params.error}\n` : "") +
      (params.extraInfo ? `Diagnostic Notes: ${params.extraInfo}\n` : "") +
      `\n--- 1. FULL CHAT PAYLOAD SENT TO LLM ---\n` +
      `${formattedChat}\n` +
      `\n--- 2. RAW LLM RESPONSE (UNMODIFIED) ---\n` +
      `${params.rawResponse || "[NO RESPONSE RECEIVED / EMPTY]"}\n` +
      `\n--- 3. EXTRACTED PARSED OBJECTS ---\n` +
      `${JSON.stringify(params.parsedArray || [], null, 2)}\n` +
      `${sep}\n`;

    const logTargets = ["batch_debug_log.txt"];
    if (params.outputDir && params.outputDir.trim()) {
      const dir = params.outputDir.replace(/\\/g, "/").replace(/\/$/, "");
      logTargets.push(`${dir}/batch_debug_log.txt`);
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
    allowedOverwriteIds?: Set<number>
  ): Promise<WholeTurnBatch> {
    if (!apiKey.trim()) {
      throw new Error("OpenRouter API Key is missing. Please configure and verify your API key in Translation Providers.");
    }

    const systemPrompt = buildCompleteSystemPrompt({
      mode: "batch",
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

    const rawUserContent = JSON.stringify(inputBatchJson, null, 2);

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

    try {
      const nativeRes = await invoke<OpenRouterCompletionResponse>("openrouter_chat_completion", {
        apiKey: apiKey.trim(),
        modelId: settings.modelId,
        messagesJson: JSON.stringify(messages),
        temperature: settings.temperature,
        timeoutSeconds,
      });

      if (nativeRes && nativeRes.content) {
        content = nativeRes.content.trim();
        exactPromptTokens = nativeRes.prompt_tokens || 0;
        exactCompletionTokens = nativeRes.completion_tokens || 0;
        exactCachedTokens = nativeRes.cached_tokens || 0;
        exactCost = nativeRes.cost || 0;
        hasExactUsage = true;
      }
    } catch (e: any) {
      lastErr = e?.message || String(e);
      logger.warn("BatchTranslate", `Native completion failed: ${lastErr}, trying fetch fallback...`);
    }

    if (!content) {
      const fetchAbort = new AbortController();
      const fetchTimer = setTimeout(() => fetchAbort.abort(), timeoutSeconds * 1000);
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          signal: fetchAbort.signal,
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/acvirya/visual-novel-translator",
            "X-Title": "VN Translator Desktop",
          },
          body: JSON.stringify({
            model: settings.modelId,
            messages,
            temperature: settings.temperature,
          }),
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          const networkErr = `OpenRouter HTTP ${res.status}: ${errBody}`;
          await this.writeBatchDebugLog({
            outputDir: settings.outputDir,
            modelId: settings.modelId,
            error: networkErr,
            messages,
            items,
            extraInfo: "Fetch fallback HTTP error response",
          });
          throw new Error(networkErr);
        }
        const data = await responseToJson(res);
        content = data.choices?.[0]?.message?.content?.trim() || "";
        if (data.usage) {
          exactPromptTokens = data.usage.prompt_tokens || 0;
          exactCompletionTokens = data.usage.completion_tokens || 0;
          exactCachedTokens = data.usage.prompt_tokens_details?.cached_tokens || 0;
          exactCost = data.usage.cost || 0;
          hasExactUsage = true;
        }
      } catch (fetchErr: any) {
        const fullErr = lastErr || fetchErr?.message || String(fetchErr);
        await this.writeBatchDebugLog({
          outputDir: settings.outputDir,
          modelId: settings.modelId,
          error: fullErr,
          messages,
          items,
          extraInfo: "Network completion failure across both native and fetch fallbacks",
        });
        throw new Error(fullErr);
      } finally {
        clearTimeout(fetchTimer);
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

    // Ultra-Resilient JSON Parser for LLM batch responses
    // Handles:
    // - Unescaped doubled quotes (e.g. ""Do not flock together."")
    // - Unescaped nested inner quotes (e.g. "perhaps "vision" wasn't...")
    // - Wrapped { translations: [...] } or { items: [...] } objects
    // - Code fences ```json ... ``` and leading "json" words
    // - Reasoning model preambles and JSON lines
    // - Direct regex extraction fallback for malformed JSON structures
    const parseLlmBatchResponse = (raw: string): any[] => {
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

      const unwrapCandidate = (data: any): any[] | null => {
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

      // Repairs common LLM JSON syntax errors (like doubled quotes `""text""` or malformed quotes)
      const repairJsonQuotes = (str: string): string => {
        let s = str.trim();
        // Fix targeted doubled quotes around property values: `"translated_message": ""text""` -> `"translated_message": "text"`
        s = s.replace(/("translated_message"\s*:\s*)""([\s\S]*?)""(\s*[,}\]])/g, '$1"$2"$3');
        s = s.replace(/("translated_speaker"\s*:\s*)""([\s\S]*?)""(\s*[,}\]])/g, '$1"$2"$3');
        // Generic doubled quotes fallback: `:\s*""` -> `:"` and `""\s*([,}])` -> `"$1`
        s = s.replace(/(:\s*)""/g, '$1"');
        s = s.replace(/""(\s*[,}\]])/g, '"$1');
        return s;
      };

      const sanitizeCandidate = (str: string): string => {
        let s = str.trim();
        s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        s = s.replace(/^json\s*(?=[{\[])/i, "").trim();
        return s;
      };

      // 1. Try parsing extracted markdown code fence ```json ... ```
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
              const repaired = JSON.parse(repairJsonQuotes(inner));
              const unwrapped = unwrapCandidate(repaired);
              if (unwrapped && unwrapped.length > 0) return unwrapped;
            } catch {}
          }
        }
      }

      // 2. Direct JSON.parse on sanitized string (with and without quote repairs)
      const sanitized = sanitizeCandidate(raw);
      try {
        const direct = JSON.parse(sanitized);
        const unwrapped = unwrapCandidate(direct);
        if (unwrapped && unwrapped.length > 0) return unwrapped;
      } catch {
        try {
          const repaired = JSON.parse(repairJsonQuotes(sanitized));
          const unwrapped = unwrapCandidate(repaired);
          if (unwrapped && unwrapped.length > 0) return unwrapped;
        } catch {}
      }

      // 3. Extract bracketed array [...] or brace object {...}
      const braceMatch = sanitized.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          const obj = JSON.parse(braceMatch[0]);
          const unwrapped = unwrapCandidate(obj);
          if (unwrapped && unwrapped.length > 0) return unwrapped;
        } catch {
          try {
            const repaired = JSON.parse(repairJsonQuotes(braceMatch[0]));
            const unwrapped = unwrapCandidate(repaired);
            if (unwrapped && unwrapped.length > 0) return unwrapped;
          } catch {}
        }
      }

      const bracketMatch = sanitized.match(/\[[\s\S]*\]/);
      if (bracketMatch) {
        try {
          const arr = JSON.parse(bracketMatch[0]);
          const unwrapped = unwrapCandidate(arr);
          if (unwrapped && unwrapped.length > 0) return unwrapped;
        } catch {
          try {
            const repaired = JSON.parse(repairJsonQuotes(bracketMatch[0]));
            const unwrapped = unwrapCandidate(repaired);
            if (unwrapped && unwrapped.length > 0) return unwrapped;
          } catch {}
        }
      }

      // 4. Extract JSON Lines format (e.g. {"id":1,...}\n{"id":2,...})
      const lineObjects: any[] = [];
      const lines = raw.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim().replace(/^json\s*/i, "").trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            const obj = JSON.parse(trimmed);
            if (obj && typeof obj === "object") {
              const unwrapped = unwrapCandidate(obj);
              if (unwrapped) lineObjects.push(...unwrapped);
              else lineObjects.push(obj);
            }
          } catch {
            try {
              const repaired = JSON.parse(repairJsonQuotes(trimmed));
              if (repaired && typeof repaired === "object") {
                const unwrapped = unwrapCandidate(repaired);
                if (unwrapped) lineObjects.push(...unwrapped);
                else lineObjects.push(repaired);
              }
            } catch {}
          }
        }
      }
      if (lineObjects.length > 0) {
        return lineObjects;
      }

      // 5. Linear balanced-bracket scan for top-level JSON objects {...}
      const scannedObjects: any[] = [];
      let depth = 0;
      let startIdx = -1;
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === "{") {
          if (depth === 0) startIdx = i;
          depth++;
        } else if (ch === "}") {
          if (depth > 0) {
            depth--;
            if (depth === 0 && startIdx !== -1) {
              const candidate = raw.slice(startIdx, i + 1);
              try {
                const obj = JSON.parse(candidate);
                if (obj && typeof obj === "object") {
                  const unwrapped = unwrapCandidate(obj);
                  if (unwrapped) scannedObjects.push(...unwrapped);
                  else scannedObjects.push(obj);
                }
              } catch {
                try {
                  const repaired = JSON.parse(repairJsonQuotes(candidate));
                  if (repaired && typeof repaired === "object") {
                    const unwrapped = unwrapCandidate(repaired);
                    if (unwrapped) scannedObjects.push(...unwrapped);
                    else scannedObjects.push(repaired);
                  }
                } catch {}
              }
              startIdx = -1;
            }
          }
        }
      }
      if (scannedObjects.length > 0) {
        return scannedObjects;
      }

      return [];
    };

    const parsedArray = parseLlmBatchResponse(content);

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

    for (const item of items) {
      const found = parsedArray.find((p) => p && p.id === item.id);
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
      } else if (!JAPANESE_CHAR_REGEX.test(item.originalMessage)) {
        // Line without Japanese characters (punctuation/symbols like "...", "!?")
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

    // Record session usage statistics (using exact values from OpenRouter API if available)
    try {
      let promptTokens = exactPromptTokens;
      let completionTokens = exactCompletionTokens;
      let cachedTokens = exactCachedTokens;
      let cost = exactCost;

      if (!hasExactUsage || (promptTokens === 0 && completionTokens === 0)) {
        const promptChars = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
        promptTokens = Math.max(1, Math.round(promptChars / 2.6));
        cachedTokens = contextHistory.length > 0 ? Math.round((promptChars * 0.65) / 2.6) : 0;
        completionTokens = Math.max(1, Math.round(content.length / 3.0));
        cost = calculateUsageCost(settings.modelId, promptTokens, completionTokens, cachedTokens);
      }

      useBatchStore.getState().addSessionTokens(promptTokens, completionTokens, cachedTokens, cost);
    } catch (statErr) {
      console.warn("Failed to record batch session stats:", statErr);
    }

    const assistantPayloadJson = JSON.stringify(
      {
        translations: items.map((it) => ({
          id: it.id,
          translated_speaker: it.translatedSpeaker || null,
          translated_message: it.translatedMessage || it.originalMessage,
        })),
      },
      null,
      2
    );

    return {
      userContent: rawUserContent,
      assistantContent: assistantPayloadJson,
      lineCount: items.length,
    };
  }

  public async saveTranslatedFile(file: BatchFileEntry, settings: BatchSettings): Promise<void> {
    try {
      const srcSpkKey = settings.keyMapping?.sourceSpeakerKey?.trim() || "auto";
      const srcMsgKey = settings.keyMapping?.sourceMessageKey?.trim() || "auto";
      const tgtSpkKey = settings.keyMapping?.targetSpeakerKey?.trim() || "translated_speaker";
      const tgtMsgKey = settings.keyMapping?.targetMessageKey?.trim() || "translated_message";

      const outputObjects: any[] = [];

      file.items.forEach((item) => {
        const finalRawSpeaker =
          settings.overrideRawWithPreprocessed && item.originalSpeaker
            ? executePreprocessingPipeline(item.originalSpeaker, "batch")
            : item.originalSpeaker;

        const finalRawMessage = settings.overrideRawWithPreprocessed
          ? executePreprocessingPipeline(item.originalMessage, "batch")
          : item.originalMessage;

        const finalTranslatedSpeaker = item.translatedSpeaker !== undefined ? item.translatedSpeaker : null;
        const finalTranslatedMessage = item.translatedMessage !== undefined ? item.translatedMessage : null;

        if (item.rawJson && typeof item.rawJson === "object") {
          const updated: any = { ...item.rawJson };

          if (settings.overrideRawWithPreprocessed) {
            if (srcSpkKey !== "auto" && srcSpkKey !== "none" && updated[srcSpkKey] !== undefined) {
              updated[srcSpkKey] = finalRawSpeaker || null;
            } else if (updated.speaker !== undefined) {
              updated.speaker = finalRawSpeaker || null;
            } else if (updated.name !== undefined) {
              updated.name = finalRawSpeaker || null;
            } else if (updated.character !== undefined) {
              updated.character = finalRawSpeaker || null;
            }

            if (srcMsgKey !== "auto" && updated[srcMsgKey] !== undefined) {
              updated[srcMsgKey] = finalRawMessage;
            } else if (updated.message !== undefined) {
              updated.message = finalRawMessage;
            } else if (updated.text !== undefined) {
              updated.text = finalRawMessage;
            } else if (updated.dialogue !== undefined) {
              updated.dialogue = finalRawMessage;
            } else if (updated.msg !== undefined) {
              updated.msg = finalRawMessage;
            }
          }

          updated[tgtSpkKey] = finalTranslatedSpeaker;
          updated[tgtMsgKey] = finalTranslatedMessage;

          // Keep in-memory rawJson in sync with latest translations
          item.rawJson[tgtSpkKey] = finalTranslatedSpeaker;
          item.rawJson[tgtMsgKey] = finalTranslatedMessage;

          outputObjects.push(updated);
        } else {
          outputObjects.push({
            speaker: finalRawSpeaker || null,
            [tgtSpkKey]: finalTranslatedSpeaker,
            message: finalRawMessage,
            [tgtMsgKey]: finalTranslatedMessage,
          });
        }
      });

      const targetPath = this.calculateOutputPath(file.path, settings.outputDir, settings.fileSuffix);
      let outputContent: string;
      if (targetPath.toLowerCase().endsWith(".json")) {
        // Standard formatted JSON array
        outputContent = JSON.stringify(outputObjects, null, 2);
      } else {
        // JSONL / text format
        outputContent = outputObjects.map((obj) => JSON.stringify(obj)).join("\n");
      }

      await invoke("save_script_file", { path: targetPath, content: outputContent });
      logger.info("BatchTranslate", `Saved to disk: ${targetPath} (${file.completedLines}/${file.totalLines} lines)`);
    } catch (err: any) {
      logger.error("BatchTranslate", `Failed to save translated file ${file.name}: ${err?.message || err}`);
    }
  }

  public pause() {
    this.isPaused = true;
    useBatchStore.getState().setIsPaused(true);
    logger.info("BatchTranslate", "Batch translation paused.");
  }

  public resume() {
    this.isPaused = false;
    useBatchStore.getState().setIsPaused(false);
    logger.info("BatchTranslate", "Batch translation resumed.");
  }

  public cancel() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isRunning = false;
    this.isPaused = false;
    useBatchStore.getState().setIsRunning(false);
    useBatchStore.getState().setIsPaused(false);
    logger.info("BatchTranslate", "Batch translation cancelled.");
  }
}

async function responseToJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response from OpenRouter (HTTP ${res.status}): ${text.slice(0, 150)}`);
  }
}

export const batchTranslateService = new BatchTranslateService();
