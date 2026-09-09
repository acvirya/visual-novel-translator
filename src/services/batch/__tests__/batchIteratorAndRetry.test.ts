import { describe, it, expect } from "vitest";
import { createBatchChunks } from "../batchIterator";
import { evaluateRetry } from "../batchRetryPolicy";
import { RateLimitError, CancellationError } from "../../errors";
import { BatchItem } from "../../../utils/batchFileUtils";

describe("BatchIterator (A6)", () => {
  const dummyItems: BatchItem[] = [
    { id: 1, originalSpeaker: "智代", originalMessage: "こんにちは", translatedMessage: "Hello" },
    { id: 2, originalSpeaker: "", originalMessage: "いい天気ですね" },
    { id: 3, originalSpeaker: "朋也", originalMessage: "そうだな", translatedMessage: "[EXPLICIT CONTENT]" },
    { id: 4, originalSpeaker: "", originalMessage: "歩きましょう" },
  ];

  it("creates chunks in 'all' mode skipping already completed items", () => {
    const chunks = createBatchChunks(dummyItems, 2, "all");
    expect(chunks.length).toBe(2);
    expect(chunks[0].chunkIndices).toEqual([1, 2]);
    expect(chunks[1].chunkIndices).toEqual([3]);
  });

  it("creates chunks in 'explicit-only' mode filtering only explicit tagged items", () => {
    const chunks = createBatchChunks(dummyItems, 2, "explicit-only");
    expect(chunks.length).toBe(1);
    expect(chunks[0].chunkIndices).toEqual([2]);
    expect(chunks[0].chunkItems[0].id).toBe(3);
  });
});

describe("BatchRetryPolicy (A6 & A5)", () => {
  it("does not retry on CancellationError", () => {
    const res = evaluateRetry(new CancellationError(), 1, { maxRetries: 5 });
    expect(res.shouldRetry).toBe(false);
    expect(res.attemptInfo).toBe("Cancelled");
  });

  it("calculates exponential backoff for RateLimitError", () => {
    const rateErr = new RateLimitError("Rate limit reached", "openai", 3500);
    const res = evaluateRetry(rateErr, 2, { maxRetries: 5, maxBackoffSeconds: 30 });
    expect(res.shouldRetry).toBe(true);
    expect(res.backoffMs).toBe(3500);
  });

  it("halts when retry attempts reach maxRetries", () => {
    const err = new Error("Network timeout");
    const res = evaluateRetry(err, 5, { maxRetries: 5, autoContinueUntilCompleted: false });
    expect(res.shouldRetry).toBe(false);
  });

  it("immediately skips on prohibited content or safety refusal without retrying (0 retries)", () => {
    const safetyErr = new Error("LLM prohibited content / safety filter triggered (stop_reason: 'safety'). Provider refused to generate output for this batch.");
    const res = evaluateRetry(safetyErr, 1, { maxRetries: 5 });
    expect(res.shouldRetry).toBe(false);
    expect(res.backoffMs).toBe(0);
    expect(res.attemptInfo).toContain("skipped immediately without retry");
  });
});

