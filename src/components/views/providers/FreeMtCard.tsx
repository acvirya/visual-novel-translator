import React from "react";
import { Globe, CheckCircle2 } from "lucide-react";

export const FreeMtCard: React.FC = () => {
  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="card-header">
        <div>
          <span className="card-title">
            <Globe size={16} /> Free Online MT (Zero API Cost Built-in Engines)
          </span>
          <span className="card-subtitle">
            Always-available high-speed translation services that can be used anytime without requiring API keys or credits
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            backgroundColor: "var(--bg-app)",
            padding: "12px 14px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-main)" }}>
              Google Translate
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--accent-green, #3fb950)",
                backgroundColor: "rgba(63, 185, 80, 0.1)",
                border: "1px solid rgba(63, 185, 80, 0.25)",
                padding: "2px 8px",
                borderRadius: "12px",
              }}
            >
              <CheckCircle2 size={11} /> Always Active
            </span>
          </div>
          <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            Ultra fast translation engine suitable for rapid visual novel text streaming with minimal latency.
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            backgroundColor: "var(--bg-app)",
            padding: "12px 14px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-main)" }}>
              DeepL Scraper
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--accent-green, #3fb950)",
                backgroundColor: "rgba(63, 185, 80, 0.1)",
                border: "1px solid rgba(63, 185, 80, 0.25)",
                padding: "2px 8px",
                borderRadius: "12px",
              }}
            >
              <CheckCircle2 size={11} /> Always Active
            </span>
          </div>
          <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            High accuracy translation fallback providing natural Japanese sentence structure and context.
          </span>
        </div>
      </div>
    </div>
  );
};
