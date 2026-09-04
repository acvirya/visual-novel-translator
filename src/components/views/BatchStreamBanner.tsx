import React, { useState, useRef, useEffect } from "react";
import {
  RefreshCw,
  Brain,
  Sparkles,
  CheckCircle2,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useBatchStore } from "../../stores/useBatchStore";

export interface BatchStreamBannerProps {
  fileId?: string;
}

export const BatchStreamBanner: React.FC<BatchStreamBannerProps> = React.memo(({ fileId }) => {
  // Ultra-isolated subscription: only re-render this component when this specific file's stream state changes
  const activeStream = useBatchStore((s) => (fileId ? s.streamingFileStates[fileId] : null));

  const [streamViewMode, setStreamViewMode] = useState<"auto" | "output" | "reasoning">("auto");
  const [isStreamCollapsed, setIsStreamCollapsed] = useState<boolean>(false);
  const streamTerminalRef = useRef<HTMLDivElement>(null);

  const isThinkingPhase =
    activeStream?.phase === "thinking" ||
    ((activeStream?.reasoningText?.length || 0) > 0 && (activeStream?.accumulatedText?.length || 0) === 0);
  const activeDisplayMode =
    streamViewMode === "auto" ? (isThinkingPhase ? "reasoning" : "output") : streamViewMode;

  // High-performance Auto-Scroll using requestAnimationFrame (avoids synchronous DOM layout thrashing)
  useEffect(() => {
    const el = streamTerminalRef.current;
    if (!el || !activeStream || isStreamCollapsed) return;

    const rafId = requestAnimationFrame(() => {
      // If user has scrolled up to inspect previous output, do not hijack their scroll
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight;
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [activeStream?.accumulatedText, activeStream?.reasoningText, activeDisplayMode, isStreamCollapsed]);

  if (!activeStream) {
    return null;
  }

  return (
    <div
      style={{
        backgroundColor: "var(--bg-app)",
        border: "1px solid rgba(56, 189, 248, 0.35)",
        borderRadius: "var(--radius-sm)",
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.3)",
      }}
    >
      {/* Stream Header Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        {/* Left: Phase Status, Batch Count & Token Speed */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {activeStream.phase === "connecting" && (
              <RefreshCw size={13} style={{ color: "var(--accent-gold)", animation: "spin 2s linear infinite" }} />
            )}
            {activeStream.phase === "thinking" && (
              <Brain size={13} style={{ color: "#c084fc" }} />
            )}
            {activeStream.phase === "translating" && (
              <Sparkles size={13} style={{ color: "var(--accent-cyan)" }} />
            )}
            {activeStream.phase === "validating" && (
              <RefreshCw size={13} style={{ color: "var(--accent-success)", animation: "spin 1.5s linear infinite" }} />
            )}
            {activeStream.phase === "completed" && (
              <CheckCircle2 size={13} style={{ color: "var(--accent-success)" }} />
            )}
            {activeStream.phase === "cooldown" && (
              <Clock size={13} style={{ color: "var(--accent-gold)" }} />
            )}
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color:
                  activeStream.phase === "thinking"
                    ? "#c084fc"
                    : activeStream.phase === "translating"
                    ? "var(--accent-cyan)"
                    : activeStream.phase === "validating" || activeStream.phase === "completed"
                    ? "var(--accent-success)"
                    : "var(--accent-gold)",
              }}
            >
              {activeStream.phase === "connecting" && "Connecting to LLM API..."}
              {activeStream.phase === "thinking" && "Model is Thinking & Reasoning..."}
              {activeStream.phase === "translating" && "Streaming Translation Tokens..."}
              {activeStream.phase === "validating" && "Validating Line IDs..."}
              {activeStream.phase === "completed" && "Batch Verified & Saved!"}
              {activeStream.phase === "cooldown" && "Cooldown Before Next Batch..."}
            </span>
          </div>

          <span style={{ fontSize: "11px", color: "var(--border-subtle)" }}>•</span>

          <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
            Batch <strong style={{ color: "var(--text-primary)" }}>{activeStream.batchIndex}</strong> of{" "}
            <strong>{activeStream.totalBatches}</strong>
          </span>

          {activeStream.tokensPerSec > 0 && (
            <>
              <span style={{ fontSize: "11px", color: "var(--border-subtle)" }}>•</span>
              <span style={{ fontSize: "11.5px", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Zap size={12} style={{ color: "var(--accent-gold)" }} />
                <span>{activeStream.tokensPerSec} tokens/s</span>
              </span>
            </>
          )}
        </div>

        {/* Right: Output / Reasoning Toggle Tabs & Collapse Button */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {activeStream.reasoningText.length > 0 && (
            <div style={{ display: "flex", backgroundColor: "var(--bg-surface)", borderRadius: "4px", padding: "2px", border: "1px solid var(--border-subtle)" }}>
              <button
                type="button"
                onClick={() => setStreamViewMode("auto")}
                style={{
                  fontSize: "11px",
                  fontWeight: streamViewMode === "auto" ? 700 : 500,
                  backgroundColor: streamViewMode === "auto" ? "var(--bg-surface-elevated)" : "transparent",
                  color: streamViewMode === "auto" ? "var(--accent-gold)" : "var(--text-muted)",
                  border: "none",
                  padding: "2px 7px",
                  borderRadius: "3px",
                  cursor: "pointer",
                }}
                title="Auto: Automatically follows the active stream (shows thoughts while thinking, output while translating)"
              >
                Auto
              </button>
              <button
                type="button"
                onClick={() => setStreamViewMode("output")}
                style={{
                  fontSize: "11px",
                  fontWeight: streamViewMode === "output" || (streamViewMode === "auto" && activeDisplayMode === "output") ? 700 : 500,
                  backgroundColor: streamViewMode === "output" ? "var(--bg-surface-elevated)" : "transparent",
                  color: streamViewMode === "output" || (streamViewMode === "auto" && activeDisplayMode === "output") ? "var(--accent-cyan)" : "var(--text-muted)",
                  border: "none",
                  padding: "2px 8px",
                  borderRadius: "3px",
                  cursor: "pointer",
                }}
              >
                Output ({activeStream.accumulatedText.length}c)
              </button>
              <button
                type="button"
                onClick={() => setStreamViewMode("reasoning")}
                style={{
                  fontSize: "11px",
                  fontWeight: streamViewMode === "reasoning" || (streamViewMode === "auto" && activeDisplayMode === "reasoning") ? 700 : 500,
                  backgroundColor: streamViewMode === "reasoning" ? "var(--bg-surface-elevated)" : "transparent",
                  color: streamViewMode === "reasoning" || (streamViewMode === "auto" && activeDisplayMode === "reasoning") ? "#c084fc" : "var(--text-muted)",
                  border: "none",
                  padding: "2px 8px",
                  borderRadius: "3px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                }}
              >
                <Brain size={11} />
                Thoughts ({activeStream.reasoningText.length}c)
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsStreamCollapsed(!isStreamCollapsed)}
            className="btn-secondary"
            style={{ padding: "3px 8px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "3px" }}
            title={isStreamCollapsed ? "Expand live stream terminal" : "Collapse live stream terminal"}
          >
            {isStreamCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            <span>{isStreamCollapsed ? "Expand" : "Collapse"}</span>
          </button>
        </div>
      </div>

      {/* Stream Terminal Box */}
      {!isStreamCollapsed && (
        <div
          ref={streamTerminalRef}
          style={{
            backgroundColor: "#070a0f",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "4px",
            padding: "8px 10px",
            maxHeight: "140px",
            overflowY: "auto",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "11.5px",
            lineHeight: "1.45",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: activeDisplayMode === "reasoning" ? "#d8b4fe" : "var(--text-primary)",
          }}
        >
          <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px", color: activeDisplayMode === "reasoning" ? "#c084fc" : "var(--accent-cyan)", marginBottom: "5px", display: "flex", alignItems: "center", gap: "4px" }}>
            {activeDisplayMode === "reasoning" ? (
              <>
                <Brain size={11} />
                <span>MODEL REASONING & THINKING STREAM</span>
              </>
            ) : (
              <>
                <Sparkles size={11} />
                <span>TRANSLATION OUTPUT STREAM</span>
              </>
            )}
          </div>
          {activeDisplayMode === "reasoning"
            ? activeStream.reasoningText || "(Waiting for model reasoning thoughts...)"
            : activeStream.accumulatedText || (activeStream.reasoningText.length > 0 ? "(Model finished thinking, awaiting translation output...)" : "(Connecting and awaiting first token...)")}
          <span
            style={{
              display: "inline-block",
              width: "6px",
              height: "12px",
              backgroundColor: activeDisplayMode === "reasoning" ? "#c084fc" : "var(--accent-cyan)",
              marginLeft: "3px",
              verticalAlign: "middle",
            }}
          />
        </div>
      )}
    </div>
  );
});
