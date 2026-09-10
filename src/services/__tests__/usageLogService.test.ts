import { describe, it, expect, beforeEach, vi } from "vitest";
import { usageLogService } from "../usageLogService";

describe("usageLogService", () => {
  beforeEach(async () => {
    await usageLogService.clearLogs();
  });

  it("records live translation usage correctly", () => {
    const entry = usageLogService.recordLog({
      mode: "live",
      modelId: "google/gemini-2.5-flash",
      provider: "openrouter",
      cost: 0.00012,
      latencyMs: 350,
      promptTokens: 120,
      completionTokens: 40,
      cachedTokens: 10,
      status: "completed",
      inputSnippet: "こんにちは世界",
      outputSnippet: "Hello world",
    });

    expect(entry.id).toBeDefined();
    expect(entry.mode).toBe("live");
    expect(entry.modelId).toBe("google/gemini-2.5-flash");
    expect(entry.provider).toBe("openrouter");
    expect(entry.cost).toBe(0.00012);
    expect(entry.totalTokens).toBe(160);
    expect(entry.status).toBe("completed");

    const logs = usageLogService.getLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].id).toBe(entry.id);
  });

  it("records batch translation usage and updates summary statistics", () => {
    usageLogService.recordLog({
      mode: "live",
      modelId: "gpt-4o-mini",
      cost: 0.001,
      latencyMs: 500,
      promptTokens: 500,
      completionTokens: 100,
      status: "completed",
    });

    usageLogService.recordLog({
      mode: "batch",
      modelId: "claude-3-5-sonnet",
      cost: 0.005,
      latencyMs: 1500,
      promptTokens: 1000,
      completionTokens: 300,
      status: "completed",
    });

    usageLogService.recordLog({
      mode: "batch",
      modelId: "claude-3-5-sonnet",
      cost: 0,
      latencyMs: 200,
      promptTokens: 50,
      completionTokens: 0,
      status: "parsing_error",
      statusMessage: "Invalid JSON response",
    });

    const stats = usageLogService.getSummaryStats();
    expect(stats.totalCalls).toBe(3);
    expect(stats.totalCost).toBeCloseTo(0.006, 5);
    expect(stats.totalTokens).toBe(600 + 1300 + 50);
    expect(stats.successCount).toBe(2);
    expect(stats.errorCount).toBe(1);
    expect(stats.avgLatencyMs).toBe(Math.round((500 + 1500 + 200) / 3));
  });

  it("notifies listeners on new logs", () => {
    const listener = vi.fn();
    const unsub = usageLogService.subscribe(listener);

    // Initial subscribe call
    expect(listener).toHaveBeenCalledTimes(1);

    usageLogService.recordLog({
      mode: "live",
      modelId: "gemini-flash",
      cost: 0.0002,
      latencyMs: 300,
      promptTokens: 200,
      completionTokens: 50,
      status: "completed",
    });

    expect(listener).toHaveBeenCalledTimes(2);
    unsub();

    usageLogService.recordLog({
      mode: "live",
      modelId: "gemini-flash",
      cost: 0.0002,
      latencyMs: 300,
      promptTokens: 200,
      completionTokens: 50,
      status: "completed",
    });

    expect(listener).toHaveBeenCalledTimes(2); // Unsubscribed
  });

  it("exports logs to JSON and CSV properly", () => {
    usageLogService.recordLog({
      mode: "live",
      modelId: "model-x",
      provider: "OpenRouter",
      cost: 0.0005,
      latencyMs: 400,
      promptTokens: 150,
      completionTokens: 50,
      status: "completed",
      statusMessage: "OK",
    });

    const jsonStr = usageLogService.exportAsJson();
    const parsed = JSON.parse(jsonStr);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].modelId).toBe("model-x");

    const csvStr = usageLogService.exportAsCsv();
    expect(csvStr).toContain("Timestamp,Date,Mode,Model,Provider,Status");
    expect(csvStr).toContain("model-x");
    expect(csvStr).toContain("OpenRouter");
  });
});
