import { useConfirmation } from "../common/ConfirmationProvider";
import React, { useState, useEffect } from "react";
import { Trash2, Search, Filter, Terminal } from "lucide-react";
import { logger, AppLogEntry } from "../../services/loggerService";

import { settingsManager } from "../../services/settingsManager";

export const LogsView: React.FC = () => {
  const confirm = useConfirmation();
  const [logs, setLogs] = useState<AppLogEntry[]>(() => logger.getLogs());
  const [filterLevel, setFilterLevel] = useState<string>(() => {
    const saved = settingsManager.getLogs().filterLevel;
    return saved === "all" ? "ALL" : (saved?.toUpperCase() || "ALL");
  });
  const [search, setSearch] = useState<string>("");

  useEffect(() => {
    const mapped = (filterLevel.toLowerCase() === "all" ? "all" : filterLevel.toLowerCase()) as "all" | "info" | "warn" | "error";
    settingsManager.updateLogs({ filterLevel: mapped });
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
              aria-label="Filter log level"
              className="select-field"
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              style={{ fontSize: "12px", padding: "5px 28px 5px 10px", minWidth: "120px" }}
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
              aria-label="Search application logs"
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

          <button onClick={() => confirm({ title: "Clear application logs?", message: "Remove all displayed system logs?", confirmText: "Clear logs" }, () => logger.clear())} className="btn-secondary" style={{ padding: "5px 10px", fontSize: "12px" }}>
            <Trash2 size={13} />
            <span>Clear Logs</span>
          </button>
        </div>
      </div>

      {/* Terminal-like Log Container */}
      <div
        style={{
          minHeight: "min(450px, 50vh)",
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
            <div key={log.id} className="system-log-row">
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
              <span className="system-log-source">
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
