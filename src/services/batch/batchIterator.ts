import { BatchItem, isExplicitTagged, isGenuinelyTranslated } from "../../utils/batchFileUtils";

export interface BatchChunk {
  chunkIndices: number[];
  chunkItems: BatchItem[];
  batchIndex: number;
  totalBatches: number;
}

/**
 * Creates an iterable list of batch chunks from a file's items.
 * Handles both full-file mode and explicit-only mode without code duplication.
 */
export function createBatchChunks(
  items: BatchItem[],
  linesPerBatch: number,
  mode: "all" | "explicit-only" = "all"
): BatchChunk[] {
  const batchSize = Math.max(1, linesPerBatch || 10);

  if (mode === "explicit-only") {
    const explicitIndices: number[] = [];
    for (let i = 0; i < items.length; i++) {
      if (isExplicitTagged(items[i])) {
        explicitIndices.push(i);
      }
    }

    const chunks: BatchChunk[] = [];
    const totalBatches = Math.ceil(explicitIndices.length / batchSize);

    for (let i = 0; i < explicitIndices.length; i += batchSize) {
      const chunkIndices = explicitIndices.slice(i, i + batchSize);
      const chunkItems = chunkIndices.map((idx) => ({ ...items[idx] }));
      chunks.push({
        chunkIndices,
        chunkItems,
        batchIndex: Math.floor(i / batchSize),
        totalBatches,
      });
    }

    return chunks;
  }

  // "all" mode: Skip lines that are genuinely translated
  const uncompletedIndices: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (!isGenuinelyTranslated(items[i])) {
      uncompletedIndices.push(i);
    }
  }

  const chunks: BatchChunk[] = [];
  const totalBatches = Math.ceil(uncompletedIndices.length / batchSize);

  for (let i = 0; i < uncompletedIndices.length; i += batchSize) {
    const chunkIndices = uncompletedIndices.slice(i, i + batchSize);
    const chunkItems = chunkIndices.map((idx) => ({ ...items[idx] }));
    chunks.push({
      chunkIndices,
      chunkItems,
      batchIndex: Math.floor(i / batchSize),
      totalBatches,
    });
  }

  return chunks;
}
