import React, { useState, useRef, useEffect } from "react";
import {
  Layers,
  Terminal,
  ChevronDown,
  Search,
  X,
  Plus,
  Trash2,
} from "lucide-react";
import { TextractorThread, TextractorMessage } from "../../../types";

interface ThreadInspectorCardProps {
  allThreadsList: TextractorThread[];
  inspectedThreadId: number | null;
  inspectedThread: TextractorThread | undefined;
  capturedThreads: Array<{ threadId: number; role: "speaker" | "dialogue" | "combined" }>;
  threadLogs: Map<number, TextractorMessage[]>;
  onSelectInspectedThread: (id: number | null) => void;
  onToggleCaptureThread: (id: number) => void;
  onClearThreadLogs: (id: number) => void;
}

export const ThreadInspectorCard: React.FC<ThreadInspectorCardProps> = ({
  allThreadsList,
  inspectedThreadId,
  inspectedThread,
  capturedThreads,
  threadLogs,
  onSelectInspectedThread,
  onToggleCaptureThread,
  onClearThreadLogs,
}) => {
  const [isThreadDropdownOpen, setIsThreadDropdownOpen] = useState(false);
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
  const [logFilterQuery, setLogFilterQuery] = useState("");
  const threadDropdownRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        threadDropdownRef.current &&
        !threadDropdownRef.current.contains(event.target as Node)
      ) {
        setIsThreadDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredThreadList = allThreadsList.filter((t) => {
    const q = threadSearchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.id.toString().includes(q) ||
      (t.lastText && t.lastText.toLowerCase().includes(q))
    );
  });

  const activeLogs = (inspectedThreadId ? threadLogs.get(inspectedThreadId) : []) || [];
  const filteredLogs = activeLogs.filter((log) => {
    if (!logFilterQuery.trim()) return true;
    return log.text.toLowerCase().includes(logFilterQuery.toLowerCase());
  });

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [filteredLogs.length]);

  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="card-header" style={{ paddingBottom: "10px" }}>
        <div>
          <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Layers size={16} /> Detected Hook Threads & Real-Time Log ({allThreadsList.length})
          </span>
          <span className="card-subtitle">
            Search and inspect all memory hook threads discovered in the game process
          </span>
        </div>
      </div>

      {/* Thread Selector Searchable Combobox */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "10px" }}>
        <div ref={threadDropdownRef} style={{ position: "relative", flex: 1 }}>
          <div
            onClick={() => setIsThreadDropdownOpen(!isThreadDropdownOpen)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: "var(--bg-app)",
              border: `1px solid ${isThreadDropdownOpen ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              borderRadius: "var(--radius-sm)",
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: "12.5px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden", flex: 1, minWidth: 0 }}>
              <Terminal size={14} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
              {inspectedThread ? (
                <>
                  <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-primary)", flexShrink: 0 }}>
                    #{inspectedThread.id}
                  </span>
                  <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inspectedThread.name}
                  </span>
                  {capturedThreads.some((c) => c.threadId === inspectedThread.id) ? (
                    <span className="badge badge-success" style={{ fontSize: "10px", padding: "1px 5px", flexShrink: 0 }}>
                      Active Captured
                    </span>
                  ) : (
                    <span className="badge badge-neutral" style={{ fontSize: "10px", padding: "1px 5px", flexShrink: 0 }}>
                      Standby ({inspectedThread.totalLines} lines)
                    </span>
                  )}
                </>
              ) : (
                <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {allThreadsList.length === 0 ? "No threads discovered yet..." : "Select thread to inspect..."}
                </span>
              )}
            </div>

            <ChevronDown size={14} color="var(--text-muted)" style={{ flexShrink: 0, marginLeft: "8px" }} />
          </div>

          {/* Dropdown Menu */}
          {isThreadDropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: "4px",
                backgroundColor: "var(--bg-panel, #161b22)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                boxShadow: "0 10px 28px rgba(0, 0, 0, 0.5)",
                zIndex: 999,
                display: "flex",
                flexDirection: "column",
                maxHeight: "260px",
                overflow: "hidden",
              }}
            >
              {/* Search Bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--border-subtle)",
                  backgroundColor: "var(--bg-app)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <Search size={14} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Search thread name, hook code, or text snippet..."
                  value={threadSearchQuery}
                  onChange={(e) => setThreadSearchQuery(e.target.value)}
                  style={{
                    flex: 1,
                    border: "none",
                    background: "transparent",
                    outline: "none",
                    fontSize: "12px",
                    color: "var(--text-primary)",
                  }}
                  autoFocus
                />
                {threadSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setThreadSearchQuery("")}
                    style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Thread Items List */}
              <div style={{ overflowY: "auto", flex: 1, padding: "4px" }}>
                {filteredThreadList.length === 0 ? (
                  <div style={{ padding: "12px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
                    No matching threads found.
                  </div>
                ) : (
                  filteredThreadList.map((t) => {
                    const isCaptured = capturedThreads.some((c) => c.threadId === t.id);
                    const isInspected = inspectedThreadId === t.id;

                    return (
                      <div
                        key={t.id}
                        onClick={() => {
                          onSelectInspectedThread(t.id);
                          setIsThreadDropdownOpen(false);
                          setThreadSearchQuery("");
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "7px 10px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          backgroundColor: isInspected ? "rgba(88, 166, 255, 0.15)" : "transparent",
                          fontSize: "12px",
                          borderBottom: "1px solid rgba(255,255,255,0.03)",
                        }}
                        onMouseEnter={(e) => {
                          if (!isInspected) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isInspected) e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-primary)" }}>
                              #{t.id}
                            </span>
                            <span style={{ fontWeight: 600 }}>{t.name}</span>
                            {isCaptured && (
                              <span className="badge badge-success" style={{ fontSize: "9.5px", padding: "0 4px" }}>
                                Captured
                              </span>
                            )}
                          </div>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--text-muted)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            "{t.lastText || "(no text yet)"}"
                          </span>
                        </div>

                        <span style={{ fontSize: "10.5px", color: "var(--text-muted)", marginLeft: "8px" }}>
                          {t.totalLines} lines
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Quick Capture Button for Inspected Thread */}
        {inspectedThread && (
          <div style={{ display: "flex", gap: "6px" }}>
            {!capturedThreads.some((c) => c.threadId === inspectedThread.id) ? (
              <button
                type="button"
                onClick={() => onToggleCaptureThread(inspectedThread.id)}
                className="btn-primary"
                style={{
                  fontSize: "12px",
                  padding: "5px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  whiteSpace: "nowrap",
                }}
              >
                <Plus size={13} />
                <span>Capture Thread</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onToggleCaptureThread(inspectedThread.id)}
                className="btn-secondary"
                style={{
                  fontSize: "12px",
                  padding: "5px 10px",
                  color: "var(--accent-danger)",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  whiteSpace: "nowrap",
                }}
              >
                <X size={13} />
                <span>Uncapture</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Selected Thread Log Box */}
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
        {/* Log Toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 10px",
            backgroundColor: "var(--bg-panel)",
            borderBottom: "1px solid var(--border-subtle)",
            fontSize: "11.5px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Search size={12} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Filter logs in this thread..."
              value={logFilterQuery}
              onChange={(e) => setLogFilterQuery(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                fontSize: "11.5px",
                color: "var(--text-primary)",
                width: "180px",
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "var(--text-muted)" }}>{filteredLogs.length} events</span>

            {inspectedThread && (
              <button
                type="button"
                onClick={() => onClearThreadLogs(inspectedThread.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                }}
                title="Clear thread log history"
              >
                <Trash2 size={11} />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Log Lines Terminal Output */}
        <div
          ref={logContainerRef}
          style={{
            padding: "10px",
            height: "180px",
            overflowY: "auto",
            fontFamily: "var(--font-mono)",
            fontSize: "11.5px",
            lineHeight: "1.5",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          {filteredLogs.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
              {inspectedThread
                ? "No text received on this thread yet. Advance dialogue in your game."
                : "Select a thread above to view real-time log history."}
            </div>
          ) : (
            filteredLogs.map((log, idx) => (
              <div key={idx} style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "10.5px", whiteSpace: "nowrap" }}>
                  [{log.timestamp}]
                </span>
                <span style={{ color: "var(--text-primary)", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                  {log.text}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
