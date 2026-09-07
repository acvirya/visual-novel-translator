import React, { useRef } from "react";
import {
  Activity,
  Filter,
  Trash2,
  GripVertical,
  X,
} from "lucide-react";
import { TextractorThread } from "../../../types";

interface CapturedThreadsCardProps {
  capturedThreads: Array<{ threadId: number; role: "speaker" | "dialogue" | "combined" }>;
  threads: Map<number, TextractorThread>;
  latestSpeaker: string;
  latestMessage: string;
  latestRawMessage: string;
  isLiveStreamActive: boolean;
  onClearLiveBuffer: () => void;
  onOpenPreprocessingSettings?: () => void;
  onReorderThreads: (fromIndex: number, toIndex: number) => void;
  onChangeRole: (threadId: number, role: "speaker" | "dialogue" | "combined" | "ignored") => void;
}

export const CapturedThreadsCard: React.FC<CapturedThreadsCardProps> = ({
  capturedThreads,
  threads,
  latestSpeaker,
  latestMessage,
  latestRawMessage,
  isLiveStreamActive,
  onClearLiveBuffer,
  onOpenPreprocessingSettings,
  onReorderThreads,
  onChangeRole,
}) => {
  const dragItem = useRef<number | null>(null);

  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragItem.current === null || dragItem.current === index) return;
    onReorderThreads(dragItem.current, index);
    dragItem.current = index;
  };

  const handleDragEnd = () => {
    dragItem.current = null;
  };

  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="card-header">
        <div>
          <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Activity size={16} color="var(--accent-success)" /> Live Stream Inspector & Captured Threads
          </span>
          <span className="card-subtitle">
            Manage intercepted threads: set role (Dialogue / Speaker / Combined) and drag to reorder
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {onOpenPreprocessingSettings && (
            <button
              type="button"
              onClick={onOpenPreprocessingSettings}
              className="btn-secondary"
              style={{
                height: "28px",
                padding: "0 10px",
                fontSize: "11.5px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
              title="Configure active regex and cleaning rules"
            >
              <Filter size={12} color="var(--accent-primary)" />
              <span>Clean Rules</span>
            </button>
          )}

          <button
            onClick={onClearLiveBuffer}
            disabled={!isLiveStreamActive}
            className="btn-secondary"
            style={{ height: "28px", padding: "0 8px", fontSize: "11px" }}
            title="Clear live preview buffer"
          >
            <Trash2 size={11} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Captured Threads List (Reorderable) */}
      {capturedThreads.length === 0 ? (
        <div
          style={{
            padding: "16px",
            backgroundColor: "var(--bg-app)",
            border: "1px dashed var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: "12px",
          }}
        >
          No active threads captured yet. Use the <strong>Detected Threads</strong> section below to select and capture game dialogue threads.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
          {capturedThreads.map((item, index) => {
            const thread = threads.get(item.threadId);
            const threadName = thread ? thread.name : `Thread #${item.threadId}`;
            const lastSnippet = thread?.lastText || "(no text intercepted yet)";

            return (
              <div
                key={item.threadId}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  backgroundColor:
                    item.role === "combined"
                      ? "rgba(46, 160, 67, 0.08)"
                      : item.role === "speaker"
                      ? "rgba(255, 193, 7, 0.08)"
                      : "rgba(88, 166, 255, 0.08)",
                  border: `1px solid ${
                    item.role === "combined"
                      ? "rgba(46, 160, 67, 0.4)"
                      : item.role === "speaker"
                      ? "rgba(255, 193, 7, 0.4)"
                      : "rgba(88, 166, 255, 0.4)"
                  }`,
                  borderRadius: "var(--radius-sm)",
                  gap: "10px",
                  cursor: "grab",
                  transition: "all 0.15s ease",
                }}
              >
                {/* Left: Drag Handle & Thread Name */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}>
                  <GripVertical size={14} color="var(--text-muted)" style={{ cursor: "grab", flexShrink: 0 }} />
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      color: "var(--accent-primary)",
                    }}
                  >
                    #{item.threadId}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: "12px", color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                    {threadName}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--text-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    — "{lastSnippet}"
                  </span>
                </div>

                {/* Right: Role Dropdown & Remove Button */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                  <select
                    value={item.role}
                    onChange={(e) => onChangeRole(item.threadId, e.target.value as any)}
                    style={{
                      fontSize: "11.5px",
                      padding: "4px 28px 4px 8px",
                      minWidth: "190px",
                      borderRadius: "4px",
                      fontWeight: 600,
                      backgroundColor: "var(--bg-panel)",
                    }}
                  >
                    <option value="dialogue">💬 Dialogue Text</option>
                    <option value="speaker">👤 Character Speaker Name</option>
                    <option value="combined">✨ Combined (Auto-Split)</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => onChangeRole(item.threadId, "ignored")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--accent-danger)",
                      cursor: "pointer",
                      padding: "4px",
                    }}
                    title="Remove from active captured threads"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Live Stream Direct 2-Tier Output Box */}
      <div
        style={{
          backgroundColor: "var(--bg-app)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Top Tier: Intercepted RAW Stream */}
        <div
          style={{
            padding: "7px 12px",
            backgroundColor: "rgba(0, 0, 0, 0.25)",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "baseline",
            gap: "8px",
            fontSize: "11.5px",
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.5px", flexShrink: 0 }}>
            RAW INTERCEPT:
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {latestRawMessage || "(no incoming raw text)"}
          </span>
        </div>

        {/* Bottom Tier: Clean Extracted Dialogue Result */}
        <div
          style={{
            padding: "10px 14px",
            display: "flex",
            alignItems: "baseline",
            gap: "8px",
            minWidth: 0,
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          {latestSpeaker ? (
            <span style={{ color: "var(--accent-gold)", fontWeight: 700, fontSize: "14px", whiteSpace: "nowrap" }}>
              【{latestSpeaker}】
            </span>
          ) : null}
          <span style={{ color: "var(--text-primary)", fontSize: "14px", fontWeight: 600, lineHeight: 1.45 }}>
            {latestMessage || (
              <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "12.5px" }}>
                {isLiveStreamActive
                  ? "(Waiting for in-game dialogue on active threads...)"
                  : "(No active thread captured)"}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
};
