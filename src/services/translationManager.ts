import { translateWithFreeMt } from "./freeMtService";
import { translateWithOpenRouter, formatStructuredDialogueInput } from "./openRouterService";
import { scriptManagerService } from "./scriptManagerService";
import { settingsManager } from "./settingsManager";
import { overlayChannel } from "../utils/overlayChannel";
import { TranslationLogItem } from "../types";
import { logger } from "./loggerService";
import { useTranslationStore } from "../stores/useTranslationStore";

export interface TranslatePipelineOptions {
  id?: number;
  speaker?: string;
  message: string;
  sourceLang?: string;
  targetLang?: string;
  providerId?: string; // "mt:google-translate", "mt:deepl-free", or OpenRouter model ID
  useScriptOnly?: boolean;
  sourceType?: "textractor" | "ocr" | "manual" | "batch";
}

export interface TranslatePipelineResult {
  success: boolean;
  item: TranslationLogItem;
  speaker?: string;
  translatedSpeaker?: string;
  message: string;
  translatedMessage: string;
  provider: string;
  durationMs: number;
}

export interface LlmContextSettings {
  maxContextLines: number;
  retainContextLines: number;
  maxCharsPerLine: number;
}

interface TranslationTask {
  options: TranslatePipelineOptions;
  resolve: (res: TranslatePipelineResult) => void;
  reqSeq: number;
}

const MAX_QUEUE_SIZE = 30;

function generateLogId(prefix: string = "log"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

class TranslationManager {
  private listeners: ((item: TranslationLogItem) => void)[] = [];
  private contextHistory: { user: string; assistant: string }[] = [];
  private queue: TranslationTask[] = [];
  private isProcessingQueue = false;
  private isPausedInternal = false;
  private dialogueSeq = 0;
  private lastUsedProviderId = "";

  public subscribe(callback: (item: TranslationLogItem) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  public notify(item: TranslationLogItem) {
    this.listeners.forEach((cb) => cb(item));
    useTranslationStore.getState().addLiveLog(item);
  }

  public getContextHistoryLength(): number {
    return this.contextHistory.length;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public isPaused(): boolean {
    return this.isPausedInternal;
  }

  public setPaused(paused: boolean) {
    this.isPausedInternal = paused;
    useTranslationStore.getState().setIsPaused(paused);
    if (!paused) {
      this.processQueue();
    }
  }

  public getMaxCharsPerLine(): number {
    const t = settingsManager.getTranslation();
    return t?.maxCharsPerLine ?? 250;
  }

  public setMaxCharsPerLine(val: number) {
    settingsManager.updateTranslation({ maxCharsPerLine: val });
    useTranslationStore.getState().setContextSettings({
      ...this.getContextSettings(),
      maxCharsPerLine: val,
    });
  }

  public getContextSettings(): LlmContextSettings {
    const t = settingsManager.getTranslation();
    const max = t?.maxContextLines ?? 10;
    const retain = t?.retainContextLines ?? 3;
    return {
      maxContextLines: max < 1 ? 10 : max,
      retainContextLines: retain < 1 ? 3 : retain,
      maxCharsPerLine: this.getMaxCharsPerLine(),
    };
  }

  public setContextSettings(settings: Partial<LlmContextSettings>) {
    const patch: any = {};
    if (settings.maxContextLines !== undefined) patch.maxContextLines = settings.maxContextLines;
    if (settings.retainContextLines !== undefined) patch.retainContextLines = settings.retainContextLines;
    if (settings.maxCharsPerLine !== undefined) patch.maxCharsPerLine = settings.maxCharsPerLine;

    if (Object.keys(patch).length > 0) {
      settingsManager.updateTranslation(patch);
    }

    const currentMax = settings.maxContextLines ?? this.getContextSettings().maxContextLines;
    const currentRetain = settings.retainContextLines ?? this.getContextSettings().retainContextLines;

    // Prune existing if exceeding new max
    if (this.contextHistory.length >= currentMax) {
      this.contextHistory = this.contextHistory.slice(-Math.min(currentRetain, currentMax));
      useTranslationStore.getState().setContextHistoryLength(this.contextHistory.length);
    }

    useTranslationStore.getState().setContextSettings(this.getContextSettings());
  }

  public getUseScriptOnly(): boolean {
    return settingsManager.getTranslation()?.useScriptOnly ?? false;
  }

  public setUseScriptOnly(val: boolean) {
    settingsManager.updateTranslation({ useScriptOnly: val });
    useTranslationStore.getState().setUseScriptOnly(val);
  }

  public clearContextHistory() {
    this.contextHistory = [];
    useTranslationStore.getState().setContextHistoryLength(0);
  }

  public clearQueue() {
    this.queue = [];
  }

  /**
   * Enqueues incoming dialogue into a Sequential FIFO Translation Queue:
   * 1. Filters out clumped / excessively long lines caused by game skipping (> maxCharsPerLine)
   * 2. Executes sequentially to prevent race conditions and preserve dialogue order
   * 3. Bounds queue to MAX_QUEUE_SIZE to avoid memory leaks during fast skipping
   */
  public translate(options: TranslatePipelineOptions): Promise<TranslatePipelineResult> {
    const cleanMsg = options.message?.trim() || "";
    const maxChars = this.getMaxCharsPerLine();

    // Fast-forward / Skip clump filter
    if (maxChars > 0 && cleanMsg.length > maxChars) {
      logger.warn(
        "TranslationManager",
        `[Skipped Burst] Line length (${cleanMsg.length} chars) exceeded limit of ${maxChars} chars. Discarded.`
      );

      const discardedItem: TranslationLogItem = {
        id: generateLogId("discard"),
        timestamp: new Date().toLocaleTimeString(),
        provider: "Discarded (Max Chars)",
        durationMs: 0,
        name: options.speaker ? { source: options.speaker, translated: options.speaker } : undefined,
        message: { source: cleanMsg, translated: `[Skipped - Exceeded ${maxChars} chars limit]` },
      };

      return Promise.resolve({
        success: false,
        item: discardedItem,
        speaker: options.speaker,
        translatedSpeaker: options.speaker,
        message: cleanMsg,
        translatedMessage: `[Skipped - Exceeded ${maxChars} chars limit]`,
        provider: "Discarded (Max Chars)",
        durationMs: 0,
      });
    }

    const reqSeq = options.id !== undefined ? options.id : ++this.dialogueSeq;
    if (options.id !== undefined && options.id > this.dialogueSeq) {
      this.dialogueSeq = options.id;
    }

    return new Promise<TranslatePipelineResult>((resolve) => {
      // If queue exceeds max limit, discard oldest pending item to avoid unbounded backlog
      if (this.queue.length >= MAX_QUEUE_SIZE) {
        const dropped = this.queue.shift();
        if (dropped) {
          logger.warn(
            "TranslationManager",
            `[Queue Overflow] Queue reached limit of ${MAX_QUEUE_SIZE}. Dropped oldest queued line: "${dropped.options.message.slice(0, 30)}..."`
          );
          const overflowItem: TranslationLogItem = {
            id: generateLogId("overflow"),
            timestamp: new Date().toLocaleTimeString(),
            provider: "Discarded (Queue Overflow)",
            durationMs: 0,
            name: dropped.options.speaker ? { source: dropped.options.speaker, translated: dropped.options.speaker } : undefined,
            message: { source: dropped.options.message, translated: "[Skipped - Queue Overflow]" },
          };
          dropped.resolve({
            success: false,
            item: overflowItem,
            speaker: dropped.options.speaker,
            translatedSpeaker: dropped.options.speaker,
            message: dropped.options.message,
            translatedMessage: "[Skipped - Queue Overflow]",
            provider: "Discarded (Queue Overflow)",
            durationMs: 0,
          });
        }
      }

      this.queue.push({ options, resolve, reqSeq });
      this.processQueue();
    });
  }

  /**
   * Process FIFO translation queue sequentially
   */
  private async processQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      while (this.queue.length > 0) {
        if (this.isPausedInternal) {
          break; // Wait until resumed
        }

        const task = this.queue.shift();
        if (!task) break;

        try {
          const result = await this.executeTranslate(task.options, task.reqSeq);
          task.resolve(result);
        } catch (err: any) {
          logger.error("TranslationManager", `Queue task failed: ${err?.message || err}`);
          const errorItem: TranslationLogItem = {
            id: `err_${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            provider: "Error",
            durationMs: 0,
            name: task.options.speaker ? { source: task.options.speaker, translated: task.options.speaker } : undefined,
            message: { source: task.options.message, translated: `[Error: ${err?.message || err}]` },
          };
          task.resolve({
            success: false,
            item: errorItem,
            speaker: task.options.speaker,
            translatedSpeaker: task.options.speaker,
            message: task.options.message,
            translatedMessage: `[Error: ${err?.message || err}]`,
            provider: "Error",
            durationMs: 0,
          });
        }
      }
    } finally {
      this.isProcessingQueue = false;
      // Re-trigger if tasks were enqueued concurrently during completion
      if (this.queue.length > 0 && !this.isPausedInternal) {
        this.processQueue();
      }
    }
  }

  /**
   * Translates incoming dialogue:
   * 1. Checks Active Script Database first
   * 2. If no script match, calls configured MT/LLM (unless useScriptOnly is active)
   * 3. Maintains context window & glossary injection for LLM
   * 4. Auto-appends new translations into Active Script Database
   * 5. Forwards result to Transparent Overlay and Live Translate Log Stream
   */
  private async executeTranslate(options: TranslatePipelineOptions, reqSeq: number = 0): Promise<TranslatePipelineResult> {
    const startTime = Date.now();
    const {
      speaker,
      message,
      sourceLang = options.sourceLang || settingsManager.getSourceLang(),
      targetLang = options.targetLang || settingsManager.getTargetLang(),
      providerId = options.providerId || useTranslationStore.getState().selectedProvider || settingsManager.getSelectedModel(),
      useScriptOnly = options.useScriptOnly !== undefined ? options.useScriptOnly : this.getUseScriptOnly(),
    } = options;

    const cleanMsg = message.trim();
    const cleanSpk = speaker?.trim() || undefined;

    // Reset context window if switching between different models or MT providers (H10)
    if (this.lastUsedProviderId && this.lastUsedProviderId !== providerId) {
      logger.info(
        "TranslationManager",
        `Translation model switched from "${this.lastUsedProviderId}" to "${providerId}". Resetting conversation context turns.`
      );
      this.clearContextHistory();
    }
    this.lastUsedProviderId = providerId;

    if (!cleanMsg) {
      const emptyItem: TranslationLogItem = {
        id: generateLogId("log"),
        timestamp: new Date().toLocaleTimeString(),
        provider: "None",
        durationMs: 0,
        name: cleanSpk ? { source: cleanSpk, translated: cleanSpk } : undefined,
        message: { source: "", translated: "" },
      };
      return {
        success: true,
        item: emptyItem,
        speaker: cleanSpk,
        translatedSpeaker: cleanSpk,
        message: "",
        translatedMessage: "",
        provider: "None",
        durationMs: 0,
      };
    }

    logger.info(
      "TranslationManager",
      `Translating dialogue (provider: ${providerId}, speaker: "${cleanSpk || "None"}", msg: "${cleanMsg.slice(0, 40)}...")`
    );

    // 1. Check Active Script Database first
    const scriptMatch = scriptManagerService.findMatch(cleanMsg, cleanSpk);

    if (scriptMatch.matched && scriptMatch.entry) {
      scriptManagerService.recordMatch(scriptMatch.entry.id);
      const durationMs = Date.now() - startTime;
      const translatedSpeaker = scriptMatch.entry.translated_speaker || cleanSpk;
      const translatedMessage = scriptMatch.entry.translated_message;
      logger.info(
        "TranslationManager",
        `Script Database match found (${(scriptMatch.similarityScore * 100).toFixed(0)}%): "${translatedMessage.slice(0, 40)}..."`
      );

      const logItem: TranslationLogItem = {
        id: generateLogId("log"),
        timestamp: new Date().toLocaleTimeString(),
        provider: "Script Database",
        sourceType: options.sourceType,
        durationMs,
        matchedFromScript: true,
        similarityScore: scriptMatch.similarityScore,
        name: cleanSpk
          ? {
              source: cleanSpk,
              translated: translatedSpeaker || cleanSpk,
            }
          : undefined,
        message: {
          source: cleanMsg,
          translated: translatedMessage,
        },
      };

      // Add to context history for continuity
      const userInput = formatStructuredDialogueInput(cleanSpk, cleanMsg);
      const assistantOutput = JSON.stringify({
        translated_speaker: translatedSpeaker && translatedSpeaker !== cleanSpk ? translatedSpeaker : null,
        translated_message: translatedMessage,
      });
      this.appendContextTurn(userInput, assistantOutput);

      // Forward to Overlay Window
      overlayChannel.send({
        type: "DIALOGUE_UPDATE",
        dialogue: {
          id: reqSeq,
          speaker: cleanSpk,
          translatedSpeaker,
          message: cleanMsg,
          translatedMessage,
        },
      });

      // Notify subscribers and update store
      this.notify(logItem);

      return {
        success: true,
        item: logItem,
        speaker: cleanSpk,
        translatedSpeaker,
        message: cleanMsg,
        translatedMessage,
        provider: "Script Database",
        durationMs,
      };
    }

    // 2. If Use Script Only is active and no match was found, do not call external MT
    if (useScriptOnly) {
      const durationMs = Date.now() - startTime;
      logger.warn("TranslationManager", "Script Only Mode enabled: No script match found, skipping external translation.");
      const fallbackItem: TranslationLogItem = {
        id: generateLogId("log"),
        timestamp: new Date().toLocaleTimeString(),
        provider: "Script Only (No Match)",
        durationMs,
        matchedFromScript: false,
        name: cleanSpk ? { source: cleanSpk, translated: cleanSpk } : undefined,
        message: { source: cleanMsg, translated: cleanMsg },
      };

      overlayChannel.send({
        type: "DIALOGUE_UPDATE",
        dialogue: {
          id: reqSeq,
          speaker: cleanSpk,
          translatedSpeaker: cleanSpk,
          message: cleanMsg,
          translatedMessage: cleanMsg,
        },
      });

      this.notify(fallbackItem);

      return {
        success: false,
        item: fallbackItem,
        speaker: cleanSpk,
        translatedSpeaker: cleanSpk,
        message: cleanMsg,
        translatedMessage: cleanMsg,
        provider: "Script Only (No Match)",
        durationMs,
      };
    }

    // 3. Perform Machine Translation / LLM Translation
    let translatedSpeaker = cleanSpk;
    let translatedMessage = cleanMsg;
    let providerLabel = "Google Translate (Free)";
    let isSuccess = false;

    // A. Google Translate Free MT
    if (providerId === "mt:google-translate" || providerId === "google") {
      providerLabel = "Google Translate (Free)";
      const res = await translateWithFreeMt({
        speaker: cleanSpk,
        message: cleanMsg,
        sourceLang,
        targetLang,
        provider: "google",
      });
      isSuccess = res.success;
      translatedSpeaker = res.translatedSpeaker || cleanSpk;
      translatedMessage = res.translatedMessage || cleanMsg;
    }
    // B. DeepL Free MT
    else if (providerId === "mt:deepl-free" || providerId === "deepl") {
      providerLabel = "DeepL Free";
      const res = await translateWithFreeMt({
        speaker: cleanSpk,
        message: cleanMsg,
        sourceLang,
        targetLang,
        provider: "deepl",
      });
      isSuccess = res.success;
      translatedSpeaker = res.translatedSpeaker || cleanSpk;
      translatedMessage = res.translatedMessage || cleanMsg;
    }
    // C. OpenRouter LLM Translation with Multi-turn Context, Dynamic Languages, Style Presets & Glossary Injection
    else {
      providerLabel = `OpenRouter (${providerId.split("/").pop() || providerId})`;
      const apiKey = settingsManager.getOpenRouterApiKey();

      const res = await translateWithOpenRouter({
        apiKey,
        modelId: providerId,
        speaker: cleanSpk,
        message: cleanMsg,
        sourceLang,
        targetLang,
        contextHistory: this.contextHistory,
        reasoningEffort: useTranslationStore.getState().reasoningEffort,
      });

      isSuccess = res.success;
      translatedSpeaker = res.translatedSpeaker || cleanSpk;
      translatedMessage = res.translatedMessage || cleanMsg;
      if (!res.success) {
        logger.error("TranslationManager", `OpenRouter translation returned error: ${res.error}`);
      }
    }

    const durationMs = Date.now() - startTime;

    // 4. Update Context History for next turns
    if (isSuccess && translatedMessage && translatedMessage !== cleanMsg) {
      const userInput = formatStructuredDialogueInput(cleanSpk, cleanMsg);
      const assistantOutput = JSON.stringify({
        translated_speaker: translatedSpeaker && translatedSpeaker !== cleanSpk ? translatedSpeaker : null,
        translated_message: translatedMessage,
      });
      this.appendContextTurn(userInput, assistantOutput);
    }

    // 5. Auto-append new translation to Active Script Database if successful
    if (isSuccess && translatedMessage && translatedMessage !== cleanMsg) {
      scriptManagerService.autoAppendTranslation({
        speaker: cleanSpk,
        translated_speaker: translatedSpeaker !== cleanSpk ? translatedSpeaker : undefined,
        message: cleanMsg,
        translated_message: translatedMessage,
      });
    }

    // 6. Create Structured Log Item
    const logItem: TranslationLogItem = {
      id: generateLogId("log"),
      timestamp: new Date().toLocaleTimeString(),
      provider: providerLabel,
      sourceType: options.sourceType,
      durationMs,
      matchedFromScript: false,
      name: cleanSpk
        ? {
            source: cleanSpk,
            translated: translatedSpeaker || cleanSpk,
          }
        : undefined,
      message: {
        source: cleanMsg,
        translated: translatedMessage,
      },
    };

    // 7. Update Overlay Window in Real-Time
    overlayChannel.send({
      type: "DIALOGUE_UPDATE",
      dialogue: {
        id: reqSeq,
        speaker: cleanSpk,
        translatedSpeaker,
        message: cleanMsg,
        translatedMessage,
      },
    });

    // 8. Notify Live Translate subscribers
    this.notify(logItem);

    return {
      success: isSuccess,
      item: logItem,
      speaker: cleanSpk,
      translatedSpeaker,
      message: cleanMsg,
      translatedMessage,
      provider: providerLabel,
      durationMs,
    };
  }

  /**
   * Appends a completed dialogue turn into the LLM context history buffer.
   * If history reaches maxContextLines, automatically retains the last retainContextLines lines.
   */
  private appendContextTurn(user: string, assistant: string) {
    const { maxContextLines, retainContextLines } = this.getContextSettings();
    this.contextHistory.push({ user, assistant });

    if (this.contextHistory.length >= maxContextLines) {
      const retainCount = Math.max(1, Math.min(retainContextLines, maxContextLines));
      this.contextHistory = this.contextHistory.slice(-retainCount);
    }

    useTranslationStore.getState().setContextHistoryLength(this.contextHistory.length);
  }
}

export const translationManager = new TranslationManager();
