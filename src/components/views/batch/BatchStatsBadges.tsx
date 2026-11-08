import React from "react";
import { Coins, Activity, Timer } from "lucide-react";

export interface BatchPricingSummary {
  input: string;
  output: string;
  cache: string;
}

export interface BatchSessionStats {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalCost: number;
}

interface BatchStatsBadgesProps {
  pricingSummary: BatchPricingSummary;
  sessionStats: BatchSessionStats;
  isRunning?: boolean;
  avgBatchDurationMs?: number;
  estimatedRemainingSeconds?: number | null;
}

function formatEta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds <= 0) return "< 1m";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  }
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export const BatchStatsBadges: React.FC<BatchStatsBadgesProps> = ({
  pricingSummary,
  sessionStats,
  isRunning,
  avgBatchDurationMs,
  estimatedRemainingSeconds,
}) => {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
      {/* Session Tokens Capsule */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          backgroundColor: "var(--bg-surface-elevated)",
          padding: "4px 10px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border-subtle)",
          fontSize: "11px",
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--accent-primary)" }}>
          <Activity size={12} />
          <span style={{ fontWeight: 600, letterSpacing: "0.02em" }}>SESSION</span>
        </div>
        <div style={{ width: "1px", height: "12px", backgroundColor: "var(--border-subtle)" }} />
        <span style={{ color: "var(--text-secondary)" }}>
          In: <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{sessionStats.promptTokens.toLocaleString()}</strong>
        </span>
        <span style={{ color: "var(--text-secondary)" }}>
          Out: <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{sessionStats.completionTokens.toLocaleString()}</strong>
        </span>
        {sessionStats.cachedTokens > 0 && (
          <span style={{ color: "var(--text-secondary)" }}>
            Cached: <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{sessionStats.cachedTokens.toLocaleString()}</strong>
          </span>
        )}
        <div style={{ width: "1px", height: "12px", backgroundColor: "var(--border-subtle)" }} />
        <span style={{ color: "var(--text-secondary)" }}>
          Cost: <strong style={{ color: "var(--accent-primary)", fontFamily: "var(--font-mono)" }}>${sessionStats.totalCost < 0.01 && sessionStats.totalCost > 0 ? sessionStats.totalCost.toFixed(5) : sessionStats.totalCost.toFixed(4)}</strong>
        </span>
      </div>

      {/* Model Pricing Capsule */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          backgroundColor: "var(--bg-surface-elevated)",
          padding: "4px 10px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border-subtle)",
          fontSize: "11px",
        }}
        title="Model Pricing per 1 Million tokens (Input, Output, and Prompt Cache) based on selected endpoints"
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--text-muted)" }}>
          <Coins size={12} />
          <span style={{ fontWeight: 600, letterSpacing: "0.02em" }}>PER 1M</span>
        </div>
        <div style={{ width: "1px", height: "12px", backgroundColor: "var(--border-subtle)" }} />
        <span style={{ color: "var(--text-secondary)" }}>
          In: <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{pricingSummary.input}</strong>
        </span>
        <span style={{ color: "var(--text-secondary)" }}>
          Out: <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{pricingSummary.output}</strong>
        </span>
        {pricingSummary.cache && pricingSummary.cache !== "$0" && (
          <>
            <div style={{ width: "1px", height: "12px", backgroundColor: "var(--border-subtle)" }} />
            <span style={{ color: "var(--text-secondary)" }}>
              Cache: <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{pricingSummary.cache}</strong>
            </span>
          </>
        )}
      </div>

      {/* Live Speed & ETA Capsule (Displayed when batch translation is active) */}
      {isRunning && Boolean(avgBatchDurationMs && avgBatchDurationMs > 0) && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "var(--bg-surface-elevated)",
            padding: "4px 10px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-subtle)",
            fontSize: "11px",
          }}
          title="Average execution duration per batch and estimated time to completion (ETA)"
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--accent-primary)" }}>
            <Timer size={12} />
            <span style={{ fontWeight: 600, letterSpacing: "0.02em" }}>SPEED</span>
          </div>
          <div style={{ width: "1px", height: "12px", backgroundColor: "var(--border-subtle)" }} />
          <span style={{ color: "var(--text-secondary)" }}>
            Rate: <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{(avgBatchDurationMs! / 1000).toFixed(1)}s</strong>/batch
          </span>
          <div style={{ width: "1px", height: "12px", backgroundColor: "var(--border-subtle)" }} />
          <span style={{ color: "var(--text-secondary)" }}>
            ETA: <strong style={{ color: "var(--accent-primary)", fontFamily: "var(--font-mono)" }}>{formatEta(estimatedRemainingSeconds)}</strong>
          </span>
        </div>
      )}
    </div>
  );
};
