import { TauriBridge } from "../tauriBridge";
import { buildCompleteSystemPrompt, ChatMessage } from "../openRouterService";
import { executePreprocessingPipeline } from "../../utils/textPreprocessor";
import { BatchItem, WholeTurnBatch } from "../../utils/batchFileUtils";
import { settingsManager } from "../settingsManager";
import { logger } from "../loggerService";

/**
 * Builds the LLM ChatMessage array for a batch translation turn,
 * including system prompt, previous conversation history (for prompt caching),
 * and preprocessed dialogue lines in JSON format.
 */
export function buildBatchPromptMessages(
  items: BatchItem[],
  contextHistory: WholeTurnBatch[],
  realToVirtualMap?: Map<number, number>
): { messages: ChatMessage[]; rawUserContent: string } {
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

    // Use continuous virtual sequence ID if available to prevent LLM hallucinations on skipped lines
    const assignedId = realToVirtualMap ? realToVirtualMap.get(it.id) ?? it.id : it.id;

    return {
      id: assignedId,
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

  return { messages, rawUserContent };
}

/**
 * Appends diagnostic debug logs to disk when an LLM batch fails validation
 */
export async function writeBatchDebugLog(params: {
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

  try {
    await TauriBridge.appendDebugLog("batch_debug_log.jsonl", logEntry);
  } catch (e) {
    logger.warn("BatchPromptBuilder", "Failed to write batch debug log:", e);
  }
}
