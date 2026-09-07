import React from "react";
import { Coins, Activity } from "lucide-react";

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
}

export const BatchStatsBadges: React.FC<BatchStatsBadgesProps> = ({
  pricingSummary,
  sessionStats,
}) => {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
      {/* Model Pricing Badge (Input / Output / Cache per 1M tokens) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          backgroundColor: "var(--bg-app)",
          padding: "4px 10px",
          borderRadius: "20px",
          border: "1px solid var(--border-subtle)",
          fontSize: "11px",
          flexWrap: "wrap",
        }}
        title="Model Pricing per 1 Million tokens (Input, Output, and Prompt Cache) based on selected endpoints"
      >
        <span style={{ color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
          <Coins size={12} color="var(--accent-primary)" /> Pricing / 1M:
        </span>
        <span>In: <strong style={{ color: "var(--accent-cyan)" }}>{pricingSummary.input}</strong></span>
        <span style={{ color: "var(--border-subtle)" }}>•</span>
        <span>Out: <strong style={{ color: "var(--accent-gold)" }}>{pricingSummary.output}</strong></span>
        <span style={{ color: "var(--border-subtle)" }}>•</span>
        <span>Cache: <strong style={{ color: "var(--accent-success)" }}>{pricingSummary.cache}</strong></span>
      </div>

      {/* Session Usage Badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          backgroundColor: "var(--bg-app)",
          padding: "4px 10px",
          borderRadius: "20px",
          border: "1px solid var(--border-subtle)",
          fontSize: "11px",
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
          <Activity size={12} color="var(--accent-primary)" /> Session Tokens:
        </span>
        <span>In: <strong style={{ color: "var(--accent-cyan)" }}>{sessionStats.promptTokens.toLocaleString()}</strong></span>
        <span style={{ color: "var(--border-subtle)" }}>•</span>
        <span>Out: <strong style={{ color: "var(--accent-gold)" }}>{sessionStats.completionTokens.toLocaleString()}</strong></span>
        <span style={{ color: "var(--border-subtle)" }}>•</span>
        <span>Cached: <strong style={{ color: "var(--accent-success)" }}>{sessionStats.cachedTokens.toLocaleString()}</strong></span>
        <span style={{ color: "var(--border-subtle)" }}>•</span>
        <span>Cost: <strong style={{ color: "#38ef7d" }}>${sessionStats.totalCost < 0.01 && sessionStats.totalCost > 0 ? sessionStats.totalCost.toFixed(5) : sessionStats.totalCost.toFixed(4)}</strong></span>
      </div>
    </div>
  );
};
