import { invoke } from "@tauri-apps/api/core";
import { translateWithFreeMt } from "./freeMtService";
import { buildCompleteSystemPrompt, ChatMessage } from "./openRouterService";
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
  linesPerBatch: number; // e.g. 25 lines per batch chunk
  maxContextLines: number; // e.g. 100 lines
  retainContextLines: number; // e.g. 25 lines
  concurrency: number; // e.g. 2-5 parallel file workers
  modelId: string;
  temperature: number;
  delayMs: number; // delay between batches in ms
  autoContinueUntilCompleted?: boolean; // Infinite retry until 100% completed
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

  // If the translated message is identical to the raw original message:
  // - If the original contains Japanese characters, then identical text means un-translated fallback copas (false).
  // - If the original has NO Japanese characters (e.g. "...", "……", "!? ", "OK", "Yes"), then identical text is VALID (true)!
  if (transMsg === rawMsg && JAPANESE_CHAR_REGEX.test(rawMsg)) {
    return false;
  }

  return true;
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

          file.items.forEach((item, idx) => {
            const found = existingItems.find((e) => e.id === item.id) || existingItems[idx];
            if (found && isGenuinelyTranslated(found)) {
              item.translatedSpeaker = found.translatedSpeaker || undefined;
              item.translatedMessage = found.translatedMessage;
              translatedCount++;
            } else {
              item.translatedSpeaker = undefined;
              item.translatedMessage = undefined;
            }
          });

          file.completedLines = translatedCount;
          if (translatedCount >= file.totalLines && file.totalLines > 0) {
            file.status = "completed";
          } else if (translatedCount > 0) {
            file.status = "ready";
          }

          logger.info(
            "BatchTranslate",
            `[Hydrate] Verified existing output file on disk for "${file.name}" (${translatedCount}/${file.totalLines} lines genuinely translated).`
          );
          return { ...file };
        }
      }
    } catch (err) {
      logger.warn("BatchTranslate", `Failed to check existing output file for ${file.name}: ${err}`);
    }

    // If no output file was found on disk, reset untranslated items
    file.items.forEach((item) => {
      if (!isGenuinelyTranslated(item)) {
        item.translatedSpeaker = undefined;
        item.translatedMessage = undefined;
      }
    });
    file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;
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

    const apiKey = localStorage.getItem("vn_openrouter_api_key") || "";
    const concurrency = Math.max(1, Math.min(8, settings.concurrency || 2));

    logger.info(
      "BatchTranslate",
      `Starting parallel batch translation for ${files.length} files (Workers: ${concurrency}, Model: ${settings.modelId}, Batch size: ${settings.linesPerBatch})`
    );

    // Initial pass: hydrate from disk if output file already exists
    for (const f of files) {
      if (f.status !== "completed") {
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

      const uncompletedFiles = files.filter((f) => (f.status as string) !== "completed");
      if (uncompletedFiles.length === 0) {
        break; // All files 100% completed!
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
          if ((file.status as string) === "completed") continue;

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
      const stillRemaining = files.filter((f) => (f.status as string) !== "completed");
      if (stillRemaining.length === 0) {
        break; // All files done!
      }

      // If user disabled auto-continue, exit loop now
      if (!settings.autoContinueUntilCompleted) {
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
    this.isRunning = false;
    this.isPaused = false;
    useBatchStore.getState().setIsRunning(false);
    useBatchStore.getState().setIsPaused(false);
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

    // Gather uncompleted line indices (lines that have no translation OR are identical to raw text)
    const uncompletedIndices: number[] = [];
    file.items.forEach((item, idx) => {
      if (!isGenuinelyTranslated(item)) {
        uncompletedIndices.push(idx);
      }
    });

    if (uncompletedIndices.length === 0) {
      file.status = "completed";
      await this.saveTranslatedFile(file, settings);
      onFileUpdated(file);
      return;
    }

    logger.info(
      "BatchTranslate",
      `[File ${fileIndex + 1}/${totalFilesCount}] Starting "${file.name}" (Remaining: ${uncompletedIndices.length}/${file.totalLines} lines)`
    );

    // Chunk remaining lines into sequential batches
    const batchChunks: number[][] = [];
    const batchSize = Math.max(1, settings.linesPerBatch);
    for (let i = 0; i < uncompletedIndices.length; i += batchSize) {
      batchChunks.push(uncompletedIndices.slice(i, i + batchSize));
    }

    // Whole-Turn Context History for 100% Prefix Prompt Caching
    let contextHistory: WholeTurnBatch[] = [];

    // Reconstruct previous batch context if resuming mid-file
    const firstUntranslatedIdx = uncompletedIndices[0];
    if (firstUntranslatedIdx > 0) {
      const precedingStart = Math.max(0, firstUntranslatedIdx - settings.linesPerBatch);
      const precedingItems = file.items.slice(precedingStart, firstUntranslatedIdx).filter((it) => isGenuinelyTranslated(it));
      if (precedingItems.length > 0) {
        const uJson = precedingItems.map((it) => ({
          id: it.id,
          speaker: it.originalSpeaker ? executePreprocessingPipeline(it.originalSpeaker, "batch") : undefined,
          message: executePreprocessingPipeline(it.originalMessage, "batch"),
        }));
        const aJson = precedingItems.map((it) => ({
          id: it.id,
          translated_speaker: it.translatedSpeaker || null,
          translated_message: it.translatedMessage,
        }));
        contextHistory.push({
          userContent: JSON.stringify(uJson, null, 2),
          assistantContent: JSON.stringify(aJson, null, 2),
          lineCount: precedingItems.length,
        });
      }
    }

    let fileHalted = false;
    let lastErrorMessage = "";

    for (let bIdx = 0; bIdx < batchChunks.length; bIdx++) {
      if (this.abortController?.signal.aborted) {
        return;
      }

      while (this.isPaused) {
        await new Promise((r) => setTimeout(r, 300));
        if (this.abortController?.signal.aborted) return;
      }

      const chunkIndices = batchChunks[bIdx];
      const chunkItems = chunkIndices.map((idx) => file.items[idx]);

      let batchSuccess = false;
      let retryAttempts = 0;
      const maxRetries = 5;

      while (!batchSuccess && retryAttempts < maxRetries) {
        if (this.abortController?.signal.aborted) break;

        try {
          if (isLlm) {
            const resultTurn = await this.translateBatchLlm(
              chunkItems,
              apiKey,
              settings,
              contextHistory,
              (item) => {
                file.completedLines = file.items.filter((it) => Boolean(it.translatedMessage && it.translatedMessage.trim())).length;
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
                    translated: item.translatedMessage || "",
                  },
                });
              }
            );

            // Append the Whole-Turn Batch to Context History for Exact Prefix Cache Match
            contextHistory.push(resultTurn);

            // Sliding Window: calculate total context lines
            let totalContextLines = contextHistory.reduce((acc, t) => acc + t.lineCount, 0);
            if (totalContextLines >= settings.maxContextLines) {
              const retainTarget = Math.max(1, Math.min(settings.retainContextLines, settings.maxContextLines));
              while (contextHistory.length > 1 && totalContextLines > retainTarget) {
                const removed = contextHistory.shift();
                if (removed) {
                  totalContextLines -= removed.lineCount;
                }
              }
            }
          } else {
            // Free MT engine (Google / DeepL) -> Sequential line by line
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
          file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;
          // Synchronize output file to disk progressively
          await this.saveTranslatedFile(file, settings);
          onFileUpdated(file);
        } catch (err: any) {
          retryAttempts++;
          lastErrorMessage = err?.message || String(err);

          const isRateLimit =
            lastErrorMessage.includes("429") ||
            lastErrorMessage.toLowerCase().includes("rate-limit") ||
            lastErrorMessage.toLowerCase().includes("too many requests");

          if (retryAttempts < maxRetries) {
            const backoffMs = isRateLimit
              ? Math.min(25000, 2000 * Math.pow(2, retryAttempts - 1))
              : 3000;

            logger.warn(
              "BatchTranslate",
              `[${file.name}] Batch ${bIdx + 1}/${batchChunks.length} failed (${lastErrorMessage.slice(0, 80)}...). Retrying in ${(backoffMs / 1000).toFixed(0)}s (Attempt ${retryAttempts}/${maxRetries})...`
            );

            await new Promise((r) => setTimeout(r, backoffMs));
          }
        }
      }

      // If batch failed after all retries -> STOP AND DO NOT SKIP
      if (!batchSuccess) {
        fileHalted = true;
        logger.error(
          "BatchTranslate",
          `[${file.name}] Batch ${bIdx + 1} failed after ${maxRetries} retries. Halting sequentially. Error: ${lastErrorMessage}`
        );
        break;
      }

      if (settings.delayMs > 0 && isLlm) {
        await new Promise((r) => setTimeout(r, settings.delayMs));
      }
    }

    // Check file final status and update completedLines count
    file.completedLines = file.items.filter((it) => isGenuinelyTranslated(it)).length;

    if (file.completedLines === file.totalLines && !fileHalted) {
      file.status = "completed";
      await this.saveTranslatedFile(file, settings);
    } else {
      file.status = "error";
      file.error = `Paused at batch (${file.completedLines}/${file.totalLines} lines): ${lastErrorMessage || "Halted"}`;
      if (file.completedLines > 0) {
        await this.saveTranslatedFile(file, settings);
      }
    }

    onFileUpdated(file);
  }

  private async translateBatchLlm(
    items: BatchItem[],
    apiKey: string,
    settings: BatchSettings,
    contextHistory: WholeTurnBatch[],
    onItemSuccess: (item: BatchItem) => void
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

    let content = "";
    let lastErr = "";
    try {
      const nativeRes = await invoke<string>("openrouter_chat_completion", {
        apiKey: apiKey.trim(),
        modelId: settings.modelId,
        messagesJson: JSON.stringify(messages),
        temperature: settings.temperature,
      });
      content = nativeRes ? nativeRes.trim() : "";
    } catch (e: any) {
      lastErr = e?.message || String(e);
      logger.warn("BatchTranslate", `Native completion failed: ${lastErr}, trying fetch fallback...`);
    }

    if (!content) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
          throw new Error(`OpenRouter HTTP ${res.status}: ${errBody}`);
        }
        const data = await responseToJson(res);
        content = data.choices?.[0]?.message?.content?.trim() || "";
      } catch (fetchErr: any) {
        throw new Error(lastErr || fetchErr?.message || String(fetchErr));
      }
    }

    if (!content) throw new Error("Empty batch response returned from LLM");

    // Ultra-Resilient JSON Parser for LLM batch responses
    // Handles: JSON arrays, single JSON objects, wrapped objects, JSON Lines, and embedded blocks
    const parseLlmBatchResponse = (raw: string): any[] => {
      const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

      // 1. Direct JSON.parse
      try {
        const direct = JSON.parse(clean);
        if (Array.isArray(direct)) {
          return direct;
        }
        if (direct && typeof direct === "object") {
          // Check for wrapped properties (e.g. { translations: [...], lines: [...], data: [...] })
          for (const val of Object.values(direct)) {
            if (Array.isArray(val) && val.length > 0) {
              return val;
            }
          }
          // Single item object without array brackets: { id: 31, ... }
          if (direct.id !== undefined || direct.translated_message || direct.translatedMessage || direct.message) {
            return [direct];
          }
        }
      } catch {}

      // 2. Extract bracketed array [...]
      const bracketMatch = clean.match(/\[[\s\S]*\]/);
      if (bracketMatch) {
        try {
          const arr = JSON.parse(bracketMatch[0]);
          if (Array.isArray(arr) && arr.length > 0) {
            return arr;
          }
        } catch {}
      }

      // 3. Extract JSON Lines format (e.g. {"id":1}\n{"id":2})
      const lineObjects: any[] = [];
      const lines = clean.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            const obj = JSON.parse(trimmed);
            if (obj && typeof obj === "object") {
              lineObjects.push(obj);
            }
          } catch {}
        }
      }
      if (lineObjects.length > 0) {
        return lineObjects;
      }

      // 4. Linear bracket scan for all individual JSON objects {...} in the text (O(N), no catastrophic backtracking)
      const scannedObjects: any[] = [];
      let depth = 0;
      let startIdx = -1;
      for (let i = 0; i < clean.length; i++) {
        const ch = clean[i];
        if (ch === "{") {
          if (depth === 0) startIdx = i;
          depth++;
        } else if (ch === "}") {
          if (depth > 0) {
            depth--;
            if (depth === 0 && startIdx !== -1) {
              const candidate = clean.slice(startIdx, i + 1);
              try {
                const obj = JSON.parse(candidate);
                if (obj && typeof obj === "object") {
                  scannedObjects.push(obj);
                }
              } catch {}
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
      const timestamp = new Date().toISOString();
      const logEntry = `\n==================== [${timestamp}] BATCH PARSE FAILURE ====================\n` +
        `Model: ${settings.modelId}\n` +
        `Batch item IDs: ${items.map((i) => i.id).join(", ")}\n` +
        `--- RAW LLM RESPONSE ---\n` +
        `${content}\n` +
        `================================================================================\n`;

      try {
        const logFile = settings.outputDir
          ? `${settings.outputDir.replace(/\\/g, "/").replace(/\/$/, "")}/batch_parse_errors.txt`
          : `batch_parse_errors.txt`;
        await invoke("append_debug_log", { fileName: logFile, content: logEntry });
      } catch (logErr) {
        console.error("Failed to append debug log:", logErr);
      }

      throw new Error(`Failed to parse valid JSON array from LLM response: ${content.slice(0, 120)}...`);
    }

    let successCount = 0;
    items.forEach((item, idx) => {
      const found = parsedArray.find((p) => p && p.id === item.id) || parsedArray[idx];
      if (found) {
        const spk = found.translated_speaker ?? found.translatedSpeaker ?? found.speaker;
        const msg = found.translated_message ?? found.translatedMessage ?? found.message;

        if (msg !== undefined && msg !== null && String(msg).trim()) {
          item.translatedSpeaker = spk && spk !== "null" ? String(spk).trim() : (item.originalSpeaker || undefined);
          item.translatedMessage = String(msg).trim();
          successCount++;
          onItemSuccess(item);
        } else if (!JAPANESE_CHAR_REGEX.test(item.originalMessage)) {
          item.translatedSpeaker = item.originalSpeaker || undefined;
          item.translatedMessage = item.originalMessage;
          successCount++;
          onItemSuccess(item);
        }
      } else if (!JAPANESE_CHAR_REGEX.test(item.originalMessage)) {
        // If line is punctuation/English (e.g. "...", "OK") and LLM omitted it from response
        item.translatedSpeaker = item.originalSpeaker || undefined;
        item.translatedMessage = item.originalMessage;
        successCount++;
        onItemSuccess(item);
      }
    });

    if (successCount === 0) {
      const timestamp = new Date().toISOString();
      const logEntry = `\n==================== [${timestamp}] NO VALID MATCHING LINES ====================\n` +
        `Model: ${settings.modelId}\n` +
        `Batch item IDs: ${items.map((i) => i.id).join(", ")}\n` +
        `--- RAW LLM RESPONSE ---\n` +
        `${content}\n` +
        `================================================================================\n`;

      try {
        const logFile = settings.outputDir
          ? `${settings.outputDir.replace(/\\/g, "/").replace(/\/$/, "")}/batch_parse_errors.txt`
          : `batch_parse_errors.txt`;
        await invoke("append_debug_log", { fileName: logFile, content: logEntry });
      } catch {}

      throw new Error("LLM response did not contain any valid translated dialogue lines matching the input batch schema.");
    }

    return {
      userContent: rawUserContent,
      assistantContent: content,
      lineCount: items.length,
    };
  }

  private saveDebounceTimers: Map<string, any> = new Map();

  public async saveTranslatedFile(file: BatchFileEntry, settings: BatchSettings, immediate = false): Promise<void> {
    const doSave = async () => {
      try {
        const srcSpkKey = settings.keyMapping?.sourceSpeakerKey?.trim() || "auto";
        const srcMsgKey = settings.keyMapping?.sourceMessageKey?.trim() || "auto";
        const tgtSpkKey = settings.keyMapping?.targetSpeakerKey?.trim() || "translated_speaker";
        const tgtMsgKey = settings.keyMapping?.targetMessageKey?.trim() || "translated_message";

        let outputLines: string[] = [];

        file.items.forEach((item) => {
          const finalRawSpeaker =
            settings.overrideRawWithPreprocessed && item.originalSpeaker
              ? executePreprocessingPipeline(item.originalSpeaker, "batch")
              : item.originalSpeaker;

          const finalRawMessage = settings.overrideRawWithPreprocessed
            ? executePreprocessingPipeline(item.originalMessage, "batch")
            : item.originalMessage;

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

            updated[tgtSpkKey] = item.translatedSpeaker !== undefined ? item.translatedSpeaker : (item.rawJson[tgtSpkKey] || null);
            updated[tgtMsgKey] = item.translatedMessage || item.rawJson[tgtMsgKey] || null;

            outputLines.push(JSON.stringify(updated));
          } else {
            outputLines.push(
              JSON.stringify({
                speaker: finalRawSpeaker || null,
                [tgtSpkKey]: item.translatedSpeaker || null,
                message: finalRawMessage,
                [tgtMsgKey]: item.translatedMessage || null,
              })
            );
          }
        });

        const outputContent = outputLines.join("\n");
        const targetPath = this.calculateOutputPath(file.path, settings.outputDir, settings.fileSuffix);

        await invoke("save_script_file", { path: targetPath, content: outputContent });
        logger.info("BatchTranslate", `Progress saved: ${targetPath} (${file.completedLines}/${file.totalLines} lines)`);
      } catch (err: any) {
        logger.error("BatchTranslate", `Failed to save translated file ${file.name}: ${err?.message || err}`);
      }
    };

    if (immediate) {
      const existing = this.saveDebounceTimers.get(file.id);
      if (existing) {
        clearTimeout(existing);
        this.saveDebounceTimers.delete(file.id);
      }
      await doSave();
      return;
    }

    // Debounced progressive save (max once every 1200ms per file)
    if (this.saveDebounceTimers.has(file.id)) {
      clearTimeout(this.saveDebounceTimers.get(file.id));
    }

    const timer = setTimeout(() => {
      this.saveDebounceTimers.delete(file.id);
      doSave();
    }, 1200);

    this.saveDebounceTimers.set(file.id, timer);
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
    this.saveDebounceTimers.forEach((t) => clearTimeout(t));
    this.saveDebounceTimers.clear();
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
