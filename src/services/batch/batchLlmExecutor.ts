import { Channel } from "@tauri-apps/api/core";
import { TauriBridge } from "../tauriBridge";
import { LlmProviderRegistry } from "../providers/llmProviderRegistry";
import { LlmDispatcherService, StreamEvent } from "../providers/llmDispatcherService";
import { buildReasoningPayload, getSelectedModelProviders } from "../openRouterService";
import { calculateUsageCost } from "../../utils/pricingUtils";
import { logger } from "../loggerService";
import { useBatchStore, FileStreamingState } from "../../stores/useBatchStore";
import { settingsManager } from "../settingsManager";
import { parseLlmBatchResponse } from "../../utils/batchJsonParser";
import {
  BatchItem,
  WholeTurnBatch,
  BatchSettings,
  SOURCE_EAST_ASIAN_CHAR_REGEX,
} from "../../utils/batchFileUtils";
import { buildBatchPromptMessages, writeBatchDebugLog } from "./batchPromptBuilder";
import { usageLogService, AiUsageStatus } from "../usageLogService";

export interface BatchFileContext {
  fileId: string;
  fileName: string;
  batchIndex: number;
  totalBatches: number;
}

/**
 * Translates a single batch chunk using LLM streaming APIs
 */
export async function executeBatchLlm(params: {
  items: BatchItem[];
  apiKey: string;
  settings: BatchSettings;
  contextHistory: WholeTurnBatch[];
  onItemSuccess: (item: BatchItem) => void;
  allowedOverwriteIds?: Set<number>;
  fileContext?: BatchFileContext;
  abortController: AbortController | null;
  realToVirtualMap?: Map<number, number>;
}): Promise<WholeTurnBatch> {
  await settingsManager.ensureReady();
  const {
    items,
    apiKey,
    settings,
    contextHistory,
    onItemSuccess,
    allowedOverwriteIds,
    fileContext,
    abortController,
    realToVirtualMap,
  } = params;

  const { providerId, modelId: targetModelId } = LlmProviderRegistry.parseModelId(settings.modelId);
  const providerCfg = LlmProviderRegistry.getProviderConfig(providerId);
  const resolvedKey = (
    providerId === "openrouter"
      ? (apiKey || providerCfg.apiKey)
      : providerCfg.apiKey
  || "").trim();

  if (!resolvedKey && providerId !== "custom") {
    const providerDef = LlmProviderRegistry.getProvider(providerId);
    throw new Error(`${providerDef?.name || "LLM"} API Key is missing. Please configure and verify your API key in Translation Providers.`);
  }

  const { messages, rawUserContent } = buildBatchPromptMessages(items, contextHistory, realToVirtualMap);
  const timeoutSeconds = Math.max(60, (settings.timeoutMinutes || 10) * 60);
  const requestStartTime = Date.now();

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
    if (abortController?.signal.aborted) return;

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

  const streamId = `batch_${crypto.randomUUID()}`;
  let abortHandler: (() => void) | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelStream = () => { void TauriBridge.cancelLlmStream(streamId).catch(() => {}); };
  try {
    if (abortController?.signal.aborted) throw new Error("Translation cancelled by user.");
    const abortPromise = new Promise<never>((_, reject) => {
      abortHandler = () => {
        cancelStream();
        reject(new Error("Translation cancelled by user."));
      };
      abortController?.signal.addEventListener("abort", abortHandler, { once: true });
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => {
        cancelStream();
        reject(new Error(`LLM stream response timed out after ${timeoutSeconds}s.`));
      }, (timeoutSeconds + 10) * 1000);
    });
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
        streamId,
        onEvent: handleStreamEvent,
      });
      const nativeRes = await Promise.race([executePromise, abortPromise, timeoutPromise]);
      flushStreamState("validating");

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

      const invokePromise = TauriBridge.openrouterStreamChatCompletion({
        apiKey: resolvedKey,
        modelId: targetModelId,
        messagesJson: JSON.stringify(messages),
        temperature: settings.temperature,
        maxTokens: undefined,
        timeoutSeconds,
        providers: activeProviders.length > 0 ? activeProviders : undefined,
        reasoning: reasoningPayload,
        streamId,
        onEvent: channel,
      });
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
    }
  } catch (e: any) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (abortController?.signal.aborted) {
      throw new Error("Translation cancelled by user.");
    }
    lastErr = e?.message || String(e);
    logger.error("BatchTranslate", `Native completion failed: ${lastErr}`);

    let failStatus: AiUsageStatus = "error";
    const errLower = lastErr.toLowerCase();
    if (errLower.includes("safety") || errLower.includes("filter") || errLower.includes("refusal")) {
      failStatus = "safety_refusal";
    } else if (errLower.includes("rate") || errLower.includes("429")) {
      failStatus = "rate_limited";
    } else if (errLower.includes("timeout") || errLower.includes("timed out")) {
      failStatus = "timeout";
    }

    const latencyMs = Date.now() - requestStartTime;
    usageLogService.recordLog({
      mode: "batch",
      modelId: settings.modelId,
      provider: providerId,
      cost: 0,
      latencyMs,
      promptTokens: exactPromptTokens,
      completionTokens: exactCompletionTokens,
      cachedTokens: exactCachedTokens,
      status: failStatus,
      statusMessage: lastErr,
      inputSnippet: items.length > 0
        ? `${items.length} lines (IDs ${items[0]?.id}..${items[items.length - 1]?.id}): "${items[0]?.originalMessage.slice(0, 80)}"`
        : undefined,
      metadata: {
        fileId: fileContext?.fileId,
        fileName: fileContext?.fileName,
        batchIndex: fileContext?.batchIndex,
        totalBatches: fileContext?.totalBatches,
        lineCount: items.length,
      },
    });

    throw new Error(lastErr);
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (abortHandler) abortController?.signal.removeEventListener("abort", abortHandler);
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }

  let hasLoggedUsage = false;
  const logAiUsage = (status: AiUsageStatus, statusMessage?: string, finalContent?: string) => {
    if (hasLoggedUsage) return;
    hasLoggedUsage = true;
    const latencyMs = Date.now() - requestStartTime;
    const estPromptTokens = Math.round(rawUserContent.length / 3);
    const estCompletionTokens = Math.round((finalContent || content).length / 3);
    const finalPrompt = exactPromptTokens || estPromptTokens;
    const finalCompletion = exactCompletionTokens || estCompletionTokens;
    const finalCost = hasExactUsage
      ? exactCost
      : calculateUsageCost(settings.modelId, finalPrompt, finalCompletion, 0);

    usageLogService.recordLog({
      mode: "batch",
      modelId: settings.modelId,
      provider: providerId,
      cost: finalCost,
      latencyMs,
      promptTokens: finalPrompt,
      completionTokens: finalCompletion,
      cachedTokens: exactCachedTokens || 0,
      status,
      statusMessage,
      inputSnippet: items.length > 0
        ? `${items.length} lines (IDs ${items[0]?.id}..${items[items.length - 1]?.id}): "${items[0]?.originalMessage.slice(0, 80)}"`
        : undefined,
      outputSnippet: (finalContent || content) ? (finalContent || content).slice(0, 150) : undefined,
      metadata: {
        fileId: fileContext?.fileId,
        fileName: fileContext?.fileName,
        batchIndex: fileContext?.batchIndex,
        totalBatches: fileContext?.totalBatches,
        lineCount: items.length,
      },
    });
  };

  // Transparent Token & Cost Tracking: Immediately record usage once LLM responded,
  // ensuring cost is tracked even if subsequent JSON parsing or line verification fails.
  let hasRecordedUsage = false;
  const recordTokenUsage = () => {
    if (hasRecordedUsage) return;
    hasRecordedUsage = true;
    if (hasExactUsage) {
      useBatchStore.getState().addSessionTokens(
        exactPromptTokens,
        exactCompletionTokens,
        exactCachedTokens,
        exactCost
      );
    } else if (content) {
      const estPromptTokens = Math.round(rawUserContent.length / 3);
      const estCompletionTokens = Math.round(content.length / 3);
      const cost = calculateUsageCost(
        settings.modelId,
        estPromptTokens,
        estCompletionTokens,
        0
      );
      useBatchStore.getState().addSessionTokens(estPromptTokens, estCompletionTokens, 0, cost);
    }
  };

  if (content || hasExactUsage) {
    recordTokenUsage();
  }

  if (!content) {
    logAiUsage("error", "Empty batch response returned from LLM");
    await writeBatchDebugLog({
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
    logAiUsage("parsing_error", `Failed to parse valid JSON array: ${content.slice(0, 100)}...`);
    await writeBatchDebugLog({
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

  // Strict Line-by-Line Verification
  const missingIds: number[] = [];
  const validatedItems: { item: BatchItem; spk?: string; msg: string }[] = [];

  const validObjects = parsedArray.filter((p) => p && typeof p === "object");
  const itemsWithoutId = validObjects.filter((p) => p.id === undefined);
  if (itemsWithoutId.length > 0 && validObjects.length === items.length) {
    logger.warn(
      "BatchTranslate",
      `LLM omitted 'id' keys on ${itemsWithoutId.length}/${items.length} items. Recovering IDs positionally from 1:1 array order.`
    );
    validObjects.forEach((p, idx) => {
      if (p.id === undefined && items[idx]) {
        const assignedId = realToVirtualMap ? realToVirtualMap.get(items[idx].id) ?? items[idx].id : items[idx].id;
        p.id = assignedId;
      }
    });
  }

  const parsedMap = new Map<number, any>(
    parsedArray
      .filter((p) => p && typeof p === "object" && p.id !== undefined)
      .map((p) => [Number(p.id), p])
  );

  for (const item of items) {
    // Lookup by assigned virtual ID first, then fallback to real ID
    const virtualId = realToVirtualMap ? realToVirtualMap.get(item.id) ?? item.id : item.id;
    // A real ID can collide with another row's virtual ID; never mix namespaces.
    const found = parsedMap.get(virtualId);
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
      validatedItems.push({
        item,
        spk: item.originalSpeaker || undefined,
        msg: item.originalMessage,
      });
    } else {
      missingIds.push(item.id);
    }
  }

  if (missingIds.length > 0) {
    const previewIds = missingIds.slice(0, 10).join(", ");
    const moreNotice = missingIds.length > 10 ? ` and ${missingIds.length - 10} more` : "";

    await writeBatchDebugLog({
      outputDir: settings.outputDir,
      modelId: settings.modelId,
      error: `LLM dropped or returned empty translation for ${missingIds.length}/${items.length} lines. Missing line IDs: [${previewIds}${moreNotice}]`,
      messages,
      rawResponse: content,
      parsedArray,
      items,
      extraInfo: "Missing IDs triggered batch reject",
    });

    logAiUsage("parsing_error", `LLM dropped or returned empty translation for ${missingIds.length}/${items.length} lines`);
    throw new Error(
      `LLM dropped or returned empty translation for ${missingIds.length}/${items.length} lines (IDs: [${previewIds}${moreNotice}]). Failing batch to ensure zero missing lines.`
    );
  }

  // All lines validated: assign translations
  for (const { item, spk, msg } of validatedItems) {
    item.translatedSpeaker = spk;
    item.translatedMessage = msg;
    if (allowedOverwriteIds && allowedOverwriteIds.has(item.id)) {
      item.explicitRetranslated = true;
    }
    onItemSuccess(item);
  }

  // Ensure token usage is recorded (idempotent fallback)
  recordTokenUsage();

  // Log successful completion
  logAiUsage("completed", undefined, content);

  return {
    userContent: rawUserContent,
    assistantContent: content,
    lineCount: items.length,
  };
}
