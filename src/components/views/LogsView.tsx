import React, { useState, useEffect } from "react";
import { Trash2, Search, Filter, Terminal } from "lucide-react";
import { logger, AppLogEntry } from "../../services/loggerService";

export const LogsView: React.FC = () => {
  const [logs, setLogs] = useState<AppLogEntry[]>(() => logger.getLogs());
  const [filterLevel, setFilterLevel] = useState<string>(() => {
    return localStorage.getItem("vn_logs_filter_level") || "ALL";
  });
  const [search, setSearch] = useState<string>("");

  useEffect(() => {
    localStorage.setItem("vn_logs_filter_level", filterLevel);
  }, [filterLevel]);

  // Subscribe to real-time logs from loggerService
  useEffect(() => {
    const unsubscribe = logger.subscribe((newLogs) => {
      setLogs(newLogs);
    });
    return () => unsubscribe();
  }, []);

  const filteredLogs = logs.filter((l) => {
    if (filterLevel !== "ALL" && l.level !== filterLevel) return false;
    if (
      search &&
      !l.message.toLowerCase().includes(search.toLowerCase()) &&
      !l.source.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: "14px" }}>
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
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Filter size={14} style={{ color: "var(--text-muted)" }} />
            <select
              className="select-field"
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              style={{ fontSize: "12px", padding: "4px 8px" }}
            >
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
              className="input-field"
              placeholder="Filter log text / source..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "220px", fontSize: "12px", padding: "4px 8px" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Total: <strong style={{ color: "var(--text-primary)" }}>{logs.length}</strong>
          </span>

          <button onClick={() => logger.clear()} className="btn-secondary" style={{ padding: "5px 10px", fontSize: "12px" }}>
            <Trash2 size={13} />
            <span>Clear Logs</span>
          </button>
        </div>
      </div>

      {/* Terminal-like Log Container */}
      <div
        style={{
          minHeight: "450px",
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
        {filteredLogs.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-muted)",
              gap: "8px",
            }}
          >
            <Terminal size={28} style={{ opacity: 0.4 }} />
            <span>No debug log entries match the current filter.</span>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} style={{ display: "flex", gap: "12px", alignItems: "baseline", borderBottom: "1px solid rgba(255,255,255,0.03)", padding: "2px 0" }}>
              <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>[{log.time}]</span>
              <span
                style={{
                  color:
                    log.level === "ERROR"
                      ? "var(--accent-danger)"
                      : log.level === "WARN"
                      ? "var(--accent-gold)"
                      : "var(--accent-cyan)",
                  fontWeight: 700,
                  width: "50px",
                  flexShrink: 0,
                }}
              >
                {log.level}
              </span>
              <span style={{ color: "var(--text-secondary)", width: "160px", flexShrink: 0, fontWeight: 600 }}>
                [{log.source}]
              </span>
              <span style={{ color: log.level === "ERROR" ? "var(--accent-danger)" : "var(--text-primary)", wordBreak: "break-all" }}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
