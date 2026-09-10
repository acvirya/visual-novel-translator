/**
 * AI Usage Log Service
 * Tracks every AI translation request across Live Game and Batch Translation.
 * Persists transactions persistently to disk as JSONL (`ai_usage_logs.jsonl`).
 */

import { TauriBridge } from "./tauriBridge";
import type { ManagedService } from "./appContainer";

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

  public async init(): Promise<void> {
    if (this.isLoaded) return;
    await this.loadHistory();
    this.isLoaded = true;
  }

  public dispose(): void {
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
    try {
      const rawLines = await TauriBridge.readDebugLog(LOG_FILE_NAME, MAX_IN_MEMORY_LOGS);
      if (Array.isArray(rawLines) && rawLines.length > 0) {
        const loaded: AiUsageLogEntry[] = [];
        for (const line of rawLines) {
          try {
            const parsed = JSON.parse(line.trim());
            if (parsed && parsed.id && parsed.timestamp) {
              loaded.push(parsed);
            }
          } catch {
            // Skip invalid line
          }
        }
        // Sort newest first
        loaded.sort((a, b) => b.timestamp - a.timestamp);
        this.logs = loaded.slice(0, MAX_IN_MEMORY_LOGS);
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

    const promptTokens = Math.max(0, Math.round(params.promptTokens || 0));
    const completionTokens = Math.max(0, Math.round(params.completionTokens || 0));
    const cachedTokens = Math.max(0, Math.round(params.cachedTokens || 0));
    const totalTokens = promptTokens + completionTokens;

    const entry: AiUsageLogEntry = {
      id,
      timestamp: now,
      formattedTime,
      mode: params.mode,
      modelId: params.modelId,
      provider: params.provider || (params.modelId.includes("/") ? params.modelId.split("/")[0] : "LLM"),
      cost: Number(params.cost) || 0,
      latencyMs: Math.max(0, Math.round(params.latencyMs || 0)),
      promptTokens,
      completionTokens,
      cachedTokens,
      totalTokens,
      status: params.status,
      statusMessage: params.statusMessage,
      inputSnippet: params.inputSnippet ? params.inputSnippet.slice(0, 500) : undefined,
      outputSnippet: params.outputSnippet ? params.outputSnippet.slice(0, 500) : undefined,
      metadata: params.metadata,
    };

    // Prepend (newest first)
    this.logs = [entry, ...this.logs].slice(0, MAX_IN_MEMORY_LOGS);
    this.notify();

    // Asynchronously append to disk log
    try {
      TauriBridge.appendDebugLog(LOG_FILE_NAME, JSON.stringify(entry) + "\n").catch(() => {});
    } catch {
      // Non-blocking disk persist fallback
    }

    return entry;
  }

  /**
   * Clear all usage logs both in-memory and on-disk
   */
  public async clearLogs(): Promise<void> {
    this.logs = [];
    this.notify();
    try {
      await TauriBridge.clearDebugLog(LOG_FILE_NAME);
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

    const rows = this.logs.map((l) => [
      l.timestamp,
      `"${l.formattedTime}"`,
      l.mode,
      `"${l.modelId}"`,
      `"${l.provider}"`,
      l.status,
      l.cost.toFixed(6),
      l.latencyMs,
      l.promptTokens,
      l.completionTokens,
      l.cachedTokens,
      l.totalTokens,
      `"${(l.statusMessage || "").replace(/"/g, '""')}"`,
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }
}

export const usageLogService = new UsageLogService();
