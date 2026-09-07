import { translateWithFreeMt } from "../freeMtService";
import { cleanSpeakerName, executePreprocessingPipeline } from "../../utils/textPreprocessor";
import { BatchItem, BatchSettings } from "../../utils/batchFileUtils";

export interface BatchLineTranslatedPayload {
  id: number;
  fileName: string;
  speaker?: string;
  translatedSpeaker?: string;
  original: string;
  translated: string;
}

/**
 * Translates a batch chunk using free MT engines (Google Translate or DeepL Free)
 */
export async function executeBatchFreeMt(params: {
  chunkItems: BatchItem[];
  settings: BatchSettings;
  filterIds?: Set<number>;
  fileName: string;
  onLineTranslated: (payload: BatchLineTranslatedPayload) => void;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const { chunkItems, settings, filterIds, fileName, onLineTranslated, abortSignal } = params;
  const provider = settings.modelId === "mt:deepl-free" ? "deepl" : "google";

  for (const item of chunkItems) {
    if (abortSignal?.aborted) {
      throw new Error("Translation cancelled by user.");
    }
    if (filterIds && !filterIds.has(item.id)) {
      continue;
    }

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
      fileName,
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
