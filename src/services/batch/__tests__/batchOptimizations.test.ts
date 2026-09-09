import { describe, it, expect, beforeEach } from "vitest";
import { buildBatchPromptMessages } from "../batchPromptBuilder";
import { evaluateRetry } from "../batchRetryPolicy";
import { LlmParseError } from "../../errors";
import { BatchItem } from "../../../utils/batchFileUtils";
import { useBatchStore } from "../../../stores/useBatchStore";

describe("Batch Optimizations - Continuous Monotonic Virtual Sequence ID", () => {
  const discontinuousItems: BatchItem[] = [
    { id: 105, originalSpeaker: "朋也", originalMessage: "おはよう" },
    { id: 110, originalSpeaker: "", originalMessage: "今日もいい天気だ" },
    { id: 115, originalSpeaker: "渚", originalMessage: "そうですね、朋也くん" },
  ];

  it("assigns contiguous virtual sequence IDs when realToVirtualMap is provided", () => {
    const realToVirtualMap = new Map<number, number>([
      [105, 1],
      [110, 2],
      [115, 3],
    ]);

    const { messages } = buildBatchPromptMessages(discontinuousItems, [], realToVirtualMap);
    const userMsg = messages.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();

    const parsedPayload = JSON.parse(userMsg!.content);
    expect(parsedPayload.lines).toHaveLength(3);
    expect(parsedPayload.lines[0].id).toBe(1);
    expect(parsedPayload.lines[1].id).toBe(2);
    expect(parsedPayload.lines[2].id).toBe(3);
  });

  it("preserves original IDs when realToVirtualMap is not provided", () => {
    const { messages } = buildBatchPromptMessages(discontinuousItems, []);
    const userMsg = messages.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();

    const parsedPayload = JSON.parse(userMsg!.content);
    expect(parsedPayload.lines[0].id).toBe(105);
    expect(parsedPayload.lines[1].id).toBe(110);
    expect(parsedPayload.lines[2].id).toBe(115);
  });
});

describe("Batch Optimizations - Fast Cut-Loss on Structured Output Failure", () => {
  it("allows 1 retry for LlmParseError on attempt 1", () => {
    const parseErr = new LlmParseError("JSON unterminated string", "{ 'lines': [", true, "openai");
    const result = evaluateRetry(parseErr, 1, { maxRetries: 5 });

    expect(result.shouldRetry).toBe(true);
    expect(result.backoffMs).toBeGreaterThan(0);
  });

  it("cuts loss immediately and halts when LlmParseError occurs on attempt 2", () => {
    const parseErr = new LlmParseError("JSON syntax error", "Truncated...", true, "openai");
    const result = evaluateRetry(parseErr, 2, { maxRetries: 5 });

    expect(result.shouldRetry).toBe(false);
    expect(result.backoffMs).toBe(0);
    expect(result.attemptInfo).toContain("Cut-loss");
  });

  it("does not prematurely cut loss for other transient errors", () => {
    const networkErr = new Error("Network timeout socket hung up");
    const result = evaluateRetry(networkErr, 2, { maxRetries: 5 });

    expect(result.shouldRetry).toBe(true);
  });
});

describe("Batch Optimizations - Average Batch Duration & Live ETA Tracker", () => {
  beforeEach(() => {
    useBatchStore.setState({
      completedBatchesCount: 0,
      avgBatchDurationMs: 0,
      estimatedRemainingSeconds: null,
      batchesPerMinute: 0,
    });
  });

  it("calculates initial batch duration and ETA correctly", () => {
    const store = useBatchStore.getState();
    // 1st batch took 4000ms, 10 batches remaining, concurrency = 2
    store.recordBatchCompletion(4000, 10, 2);

    const updated = useBatchStore.getState();
    expect(updated.completedBatchesCount).toBe(1);
    expect(updated.avgBatchDurationMs).toBe(4000);
    // ETA = (10 remaining * 4000ms) / (2 concurrency * 1000) = 20s
    expect(updated.estimatedRemainingSeconds).toBe(20);
    // Batches per minute = (60000 / 4000) * 2 = 30
    expect(updated.batchesPerMinute).toBe(30);
  });

  it("smooths duration using exponential moving average on subsequent batches", () => {
    const store = useBatchStore.getState();
    store.recordBatchCompletion(5000, 10, 2); // prevAvg = 5000
    store.recordBatchCompletion(3000, 9, 2);  // newAvg = 5000 * 0.7 + 3000 * 0.3 = 4400

    const updated = useBatchStore.getState();
    expect(updated.completedBatchesCount).toBe(2);
    expect(updated.avgBatchDurationMs).toBeCloseTo(4400, 0);
    // ETA = (9 * 4400) / (2 * 1000) = 19.8 -> 20s
    expect(updated.estimatedRemainingSeconds).toBe(20);
  });
});

describe("Batch Optimizations - Serialized Pacing Gate (Rate-Limit Prevention)", () => {
  it("spaces out parallel concurrent dispatch requests by at least minDelayMs", async () => {
    const { batchTranslateService } = await import("../../batchTranslateService");
    const timestamps: number[] = [];
    const minDelay = 80; // 80ms for fast test execution

    // Dispatch 3 concurrent requests simultaneously
    const req1 = batchTranslateService.acquireDispatchSlot(minDelay).then(() => timestamps.push(Date.now()));
    const req2 = batchTranslateService.acquireDispatchSlot(minDelay).then(() => timestamps.push(Date.now()));
    const req3 = batchTranslateService.acquireDispatchSlot(minDelay).then(() => timestamps.push(Date.now()));

    await Promise.all([req1, req2, req3]);

    expect(timestamps.length).toBe(3);
    // The difference between consecutive dispatch slots should be at least minDelay - delta
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(minDelay - 15);
    expect(timestamps[2] - timestamps[1]).toBeGreaterThanOrEqual(minDelay - 15);
  });

  it("respects abort signal and cancels wait immediately", async () => {
    const { batchTranslateService } = await import("../../batchTranslateService");
    const controller = new AbortController();

    // Fill slot first
    await batchTranslateService.acquireDispatchSlot(100);

    const startTime = Date.now();
    setTimeout(() => controller.abort(), 20);

    await batchTranslateService.acquireDispatchSlot(1000, controller.signal);
    const elapsed = Date.now() - startTime;

    // Should have aborted early around ~20-50ms, not waited the full 1000ms
    expect(elapsed).toBeLessThan(250);
  });
});

