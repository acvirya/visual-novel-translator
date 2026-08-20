import React, { useState, useEffect } from "react";
import { Trash2, Search, Filter } from "lucide-react";

interface LogEntry {
  id: string;
  time: string;
  level: "INFO" | "WARN" | "ERROR";
  source: string;
  message: string;
}

// TODO: Replace with Tauri event listener for internal debug logs
const DUMMY_SYSTEM_LOGS: LogEntry[] = [
  { id: "1", time: "23:40:01", level: "INFO", source: "Tauri::Core", message: "Application initialized. Windows subsystem ready." },
  { id: "2", time: "23:40:05", level: "INFO", source: "Textractor::Sidecar", message: "Attached to target PID 14920 [Clannad.exe]." },
  { id: "3", time: "23:40:12", level: "INFO", source: "Textractor::Hook", message: "Thread 0x0045A10 created. Dialogue stream attached." },
  { id: "4", time: "23:40:20", level: "INFO", source: "N-gram::Matcher", message: "Loaded 1,420 lines from scene_prologue.jsonl. Index built (N=2)." },
  { id: "5", time: "23:41:02", level: "WARN", source: "OpenRouter::API", message: "Rate limit threshold reached 80%. Delaying next request by 200ms." },
  { id: "6", time: "23:42:15", level: "INFO", source: "OCR::OneOCR", message: "Region scan completed in 42ms. 0 text boxes detected." },
];

export const LogsView: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>(DUMMY_SYSTEM_LOGS);
  const [filterLevel, setFilterLevel] = useState<string>(() => {
    return localStorage.getItem("vn_logs_filter_level") || "ALL";
  });
  const [search, setSearch] = useState<string>("");

  useEffect(() => {
    localStorage.setItem("vn_logs_filter_level", filterLevel);
  }, [filterLevel]);

  const filteredLogs = logs.filter((l) => {
    if (filterLevel !== "ALL" && l.level !== filterLevel) return false;
    if (search && !l.message.toLowerCase().includes(search.toLowerCase()) && !l.source.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "14px" }}>
      {/* Top Filter Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "10px 16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Filter size={14} style={{ color: "var(--text-muted)" }} />
            <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}>
              <option value="ALL">All Levels</option>
              <option value="INFO">INFO Only</option>
              <option value="WARN">WARN Only</option>
              <option value="ERROR">ERROR Only</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Search size={14} style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              placeholder="Filter log text / source..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "220px" }}
            />
          </div>
        </div>

        <button onClick={() => setLogs([])} className="btn-secondary">
          <Trash2 size={14} />
          <span>Clear Logs</span>
        </button>
      </div>

      {/* Terminal-like Log Container */}
      <div
        style={{
          flex: 1,
          backgroundColor: "var(--bg-app)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "12px 16px",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          lineHeight: "1.7",
          overflowY: "auto",
        }}
      >
        {filteredLogs.map((log) => (
          <div key={log.id} style={{ display: "flex", gap: "12px", alignItems: "baseline" }}>
            <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>[{log.time}]</span>
            <span
              style={{
                color:
                  log.level === "ERROR"
                    ? "var(--accent-danger)"
                    : log.level === "WARN"
                    ? "var(--accent-gold)"
                    : "var(--accent-cyan)",
                fontWeight: 600,
                width: "50px",
                flexShrink: 0,
              }}
            >
              {log.level}
            </span>
            <span style={{ color: "var(--text-secondary)", width: "160px", flexShrink: 0 }}>
              [{log.source}]
            </span>
            <span style={{ color: "var(--text-primary)" }}>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
