/**
 * AI Usage Log Service
 * Tracks every AI translation request across Live Game and Batch Translation.
 * Persists transactions persistently to disk as JSONL (`ai_usage_logs.jsonl`).
 */

import { TauriBridge } from "./tauriBridge";
import type { ManagedService } from "./appContainer";
import { redactSecrets, redactSecretText } from "../utils/redactSecrets";

export type AiUsageStatus =
  | "completed"
  | "parsing_error"
  | "safety_refusal"
  | "rate_limited"
  | "timeout"
  | "network_error"
  | "cancelled"
  | "error";

export interface AiUsageLogEntry {
  id: string;
  timestamp: number; // Epoch ms
  formattedTime: string; // e.g. "10 Sep 2026, 07:15:32"
  mode: "live" | "batch";
  modelId: string;
  provider: string;
  cost: number; // In USD
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
  status: AiUsageStatus;
  statusMessage?: string;
  inputSnippet?: string;
  outputSnippet?: string;
  metadata?: Record<string, any>;
}

export interface UsageSummaryStats {
  totalCost: number;
  totalCalls: number;
  totalTokens: number;
  avgLatencyMs: number;
  successCount: number;
  errorCount: number;
}

const LOG_FILE_NAME = "ai_usage_logs.jsonl";
const MAX_IN_MEMORY_LOGS = 3000;

class UsageLogService implements ManagedService {
  public readonly id = "usageLogService";
  private logs: AiUsageLogEntry[] = [];
  private listeners: Set<(logs: AiUsageLogEntry[]) => void> = new Set();
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private historyGeneration = 0;

  public async init(): Promise<void> {
    if (this.isLoaded) return;
    if (!this.loadPromise) {
      this.loadPromise = this.loadHistory().then(() => { this.isLoaded = true; }).finally(() => { this.loadPromise = null; });
    }
    await this.loadPromise;
  }

  public async dispose(): Promise<void> {
    await this.writeQueue;
    this.listeners.clear();
  }

  public subscribe(callback: (logs: AiUsageLogEntry[]) => void): () => void {
    this.listeners.add(callback);
    callback([...this.logs]);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify() {
    const list = [...this.logs];
    this.listeners.forEach((cb) => {
      try {
        cb(list);
      } catch (err) {
        console.error("[UsageLogService] Listener error:", err);
      }
    });
  }

  /**
   * Load previous logs from disk on startup
   */
  public async loadHistory(): Promise<void> {
    const generation = this.historyGeneration;
    try {
      const rawLines = await TauriBridge.readDebugLog(LOG_FILE_NAME, MAX_IN_MEMORY_LOGS);
      if (Array.isArray(rawLines) && rawLines.length > 0) {
        const loaded: AiUsageLogEntry[] = [];
        for (const line of rawLines) {
          try {
            const parsed = JSON.parse(line.trim());
            if (parsed && typeof parsed.id === "string" && Number.isFinite(parsed.timestamp)
              && [parsed.cost, parsed.totalTokens, parsed.latencyMs, parsed.promptTokens, parsed.completionTokens].every((value) => Number.isFinite(value) && value >= 0)) {
              loaded.push(parsed);
            }
          } catch {
            // Skip invalid line
          }
        }
        // Sort newest first
        loaded.sort((a, b) => b.timestamp - a.timestamp);
        if (generation !== this.historyGeneration) return;
        const merged = new Map([...loaded, ...this.logs].map((entry) => [entry.id, entry]));
        this.logs = [...merged.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_IN_MEMORY_LOGS);
        this.notify();
      }
    } catch {
      // Fallback if desktop backend or file not yet created
    }
  }

  /**
   * Record a new AI usage transaction
   */
  public recordLog(params: {
    mode: "live" | "batch";
    modelId: string;
    provider?: string;
    cost: number;
    latencyMs: number;
    promptTokens: number;
    completionTokens: number;
    cachedTokens?: number;
    status: AiUsageStatus;
    statusMessage?: string;
    inputSnippet?: string;
    outputSnippet?: string;
    metadata?: Record<string, any>;
  }): AiUsageLogEntry {
    const now = Date.now();
    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? `usage_${crypto.randomUUID()}`
      : `usage_${now}_${Math.random().toString(36).slice(2, 9)}`;

    const dateObj = new Date(now);
    const formattedTime = dateObj.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const nonnegative = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, value!) : 0;
    const promptTokens = Math.round(nonnegative(params.promptTokens));
    const completionTokens = Math.round(nonnegative(params.completionTokens));
    const cachedTokens = Math.min(promptTokens, Math.round(nonnegative(params.cachedTokens)));
    const totalTokens = promptTokens + completionTokens;

    const entry: AiUsageLogEntry = {
      id,
      timestamp: now,
      formattedTime,
      mode: params.mode,
      modelId: params.modelId,
      provider: params.provider || (params.modelId.includes("/") ? params.modelId.split("/")[0] : "LLM"),
      cost: nonnegative(params.cost),
      latencyMs: Math.round(nonnegative(params.latencyMs)),
      promptTokens,
      completionTokens,
      cachedTokens,
      totalTokens,
      status: params.status,
      statusMessage: params.statusMessage && redactSecretText(params.statusMessage),
      inputSnippet: params.inputSnippet ? params.inputSnippet.slice(0, 500) : undefined,
      outputSnippet: params.outputSnippet ? params.outputSnippet.slice(0, 500) : undefined,
      metadata: redactSecrets(params.metadata) as Record<string, unknown> | undefined,
    };

    // Prepend (newest first)
    this.logs = [entry, ...this.logs].slice(0, MAX_IN_MEMORY_LOGS);
    this.notify();

    // Asynchronously append to disk log
    try {
      const line = JSON.stringify(entry) + "\n";
      this.writeQueue = this.writeQueue.then(() => TauriBridge.appendDebugLog(LOG_FILE_NAME, line)).catch(() => {});
    } catch {
      // Non-blocking disk persist fallback
    }

    return entry;
  }

  /**
   * Clear all usage logs both in-memory and on-disk
   */
  public async clearLogs(): Promise<void> {
    this.historyGeneration++;
    this.logs = [];
    this.notify();
    try {
      const clear = this.writeQueue.then(() => TauriBridge.clearDebugLog(LOG_FILE_NAME));
      this.writeQueue = clear.catch(() => {});
      await clear;
    } catch (err) {
      console.warn("[UsageLogService] Failed to clear disk log:", err);
    }
  }

  public getLogs(): AiUsageLogEntry[] {
    return [...this.logs];
  }

  public getSummaryStats(): UsageSummaryStats {
    let totalCost = 0;
    let totalTokens = 0;
    let totalLatency = 0;
    let successCount = 0;
    let errorCount = 0;

    for (const log of this.logs) {
      totalCost += log.cost;
      totalTokens += log.totalTokens;
      totalLatency += log.latencyMs;
      if (log.status === "completed") {
        successCount++;
      } else {
        errorCount++;
      }
    }

    return {
      totalCost,
      totalCalls: this.logs.length,
      totalTokens,
      avgLatencyMs: this.logs.length > 0 ? Math.round(totalLatency / this.logs.length) : 0,
      successCount,
      errorCount,
    };
  }

  /**
   * Exports logs as formatted JSON string
   */
  public exportAsJson(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Exports logs as CSV
   */
  public exportAsCsv(): string {
    const headers = [
      "Timestamp",
      "Date",
      "Mode",
      "Model",
      "Provider",
      "Status",
      "Cost_USD",
      "Latency_ms",
      "Prompt_Tokens",
      "Completion_Tokens",
      "Cached_Tokens",
      "Total_Tokens",
      "Status_Message",
    ];

    const csvText = (value: string) => {
      const safe = /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const rows = this.logs.map((l) => [
      l.timestamp,
      csvText(l.formattedTime),
      l.mode,
      csvText(l.modelId),
      csvText(l.provider),
      l.status,
      l.cost.toFixed(6),
      l.latencyMs,
      l.promptTokens,
      l.completionTokens,
      l.cachedTokens,
      l.totalTokens,
      csvText(l.statusMessage || ""),
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }
}

export const usageLogService = new UsageLogService();
