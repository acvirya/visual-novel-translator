import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
  Trash2,
  Download,
  Coins,
  Cpu,
  Zap,
  Activity,
  Radio,
  FileText,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  usageLogService,
  AiUsageLogEntry,
  UsageSummaryStats,
  AiUsageStatus,
} from "../../../services/usageLogService";
import { ConfirmDialog } from "../../common/ConfirmDialog";
import { AiUsageDetailModal } from "./AiUsageDetailModal";
import { useToast } from "../../common/ToastProvider";

export const AiUsageLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AiUsageLogEntry[]>(() => usageLogService.getLogs());
  const [stats, setStats] = useState<UsageSummaryStats>(() => usageLogService.getSummaryStats());
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AiUsageLogEntry | null>(null);

  // Filters
  const [modeFilter, setModeFilter] = useState<"all" | "live" | "batch">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "error">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { showToast } = useToast();

  useEffect(() => {
    // Initial load
    usageLogService.loadHistory().then(() => {
      setLogs(usageLogService.getLogs());
      setStats(usageLogService.getSummaryStats());
    });

    const unsubscribe = usageLogService.subscribe((updatedLogs) => {
      setLogs(updatedLogs);
      setStats(usageLogService.getSummaryStats());
    });

    return () => unsubscribe();
  }, []);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Mode filter
      if (modeFilter !== "all" && log.mode !== modeFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === "completed" && log.status !== "completed") {
        return false;
      }
      if (statusFilter === "error" && log.status === "completed") {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const modelMatch = log.modelId.toLowerCase().includes(query);
        const providerMatch = log.provider.toLowerCase().includes(query);
        const statusMatch = log.status.toLowerCase().includes(query);
        const inputSnippetMatch = log.inputSnippet?.toLowerCase().includes(query);
        const outputSnippetMatch = log.outputSnippet?.toLowerCase().includes(query);
        if (!modelMatch && !providerMatch && !statusMatch && !inputSnippetMatch && !outputSnippetMatch) {
          return false;
        }
      }

      return true;
    });
  }, [logs, modeFilter, statusFilter, searchQuery]);

  const handleClearLogs = async () => {
    await usageLogService.clearLogs();
    showToast("AI usage logs have been cleared", "info");
  };

  const handleExportJson = () => {
    const jsonStr = usageLogService.exportAsJson();
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-usage-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Exported AI usage logs to JSON", "success");
  };

  const handleExportCsv = () => {
    const csvStr = usageLogService.exportAsCsv();
    const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-usage-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Exported AI usage logs to CSV", "success");
  };

  const formatCost = (cost: number) => {
    if (cost <= 0) return "$0.0000";
    if (cost < 0.0001) return `<$0.0001`;
    return `$${cost.toFixed(4)}`;
  };

  const getStatusBadge = (status: AiUsageStatus) => {
    switch (status) {
      case "completed":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              borderRadius: "9999px",
              fontSize: "11px",
              fontWeight: 600,
              backgroundColor: "rgba(34, 197, 94, 0.12)",
              color: "#4ade80",
              border: "1px solid rgba(34, 197, 94, 0.25)",
            }}
          >
            <CheckCircle2 size={11} />
            Completed
          </span>
        );
      case "parsing_error":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              borderRadius: "9999px",
              fontSize: "11px",
              fontWeight: 600,
              backgroundColor: "rgba(234, 179, 8, 0.12)",
              color: "#facc15",
              border: "1px solid rgba(234, 179, 8, 0.25)",
            }}
          >
            <AlertCircle size={11} />
            Parsing Error
          </span>
        );
      case "safety_refusal":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              borderRadius: "9999px",
              fontSize: "11px",
              fontWeight: 600,
              backgroundColor: "rgba(249, 115, 22, 0.12)",
              color: "#fb923c",
              border: "1px solid rgba(249, 115, 22, 0.25)",
            }}
          >
            <AlertCircle size={11} />
            Safety Refusal
          </span>
        );
      default:
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              borderRadius: "9999px",
              fontSize: "11px",
              fontWeight: 600,
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              color: "#f87171",
              border: "1px solid rgba(239, 68, 68, 0.25)",
            }}
          >
            <AlertCircle size={11} />
            {status.replace(/_/g, " ")}
          </span>
        );
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: "16px" }}>
      {/* KPI Stats Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
          gap: "12px",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              backgroundColor: "rgba(245, 158, 11, 0.15)",
              color: "#f59e0b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Coins size={18} />
          </div>
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
              Total Est. Cost
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
              ${stats.totalCost.toFixed(4)}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              backgroundColor: "rgba(59, 130, 246, 0.15)",
              color: "#60a5fa",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Activity size={18} />
          </div>
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
              Total Requests
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
              {stats.totalCalls.toLocaleString()}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              backgroundColor: "rgba(168, 85, 247, 0.15)",
              color: "#c084fc",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Cpu size={18} />
          </div>
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
              Total Tokens
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
              {stats.totalTokens.toLocaleString()}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              backgroundColor: "rgba(34, 197, 94, 0.15)",
              color: "#4ade80",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Zap size={18} />
          </div>
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
              Avg Latency
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
              {stats.avgLatencyMs.toLocaleString()} ms
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar: Filters & Actions */}
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
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Mode Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Mode:</span>
            <select
              className="select-field"
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value as any)}
              style={{ fontSize: "12px", padding: "4px 24px 4px 8px", minWidth: "90px" }}
            >
              <option value="all">All Modes</option>
              <option value="live">Live Only</option>
              <option value="batch">Batch Only</option>
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Filter size={13} style={{ color: "var(--text-muted)" }} />
            <select
              className="select-field"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              style={{ fontSize: "12px", padding: "4px 24px 4px 8px", minWidth: "110px" }}
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="error">Errors & Refusals</option>
            </select>
          </div>

          {/* Search Box */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Search size={14} style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              className="input-field"
              placeholder="Search model, provider, text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "200px", fontSize: "12px", padding: "4px 8px" }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={handleExportJson}
            className="btn-secondary"
            title="Export logs as JSON"
            style={{ padding: "5px 10px", fontSize: "12px" }}
          >
            <Download size={13} />
            <span>JSON</span>
          </button>
          <button
            onClick={handleExportCsv}
            className="btn-secondary"
            title="Export logs as CSV"
            style={{ padding: "5px 10px", fontSize: "12px" }}
          >
            <Download size={13} />
            <span>CSV</span>
          </button>
          <button
            onClick={() => setShowClearConfirm(true)}
            className="btn-secondary"
            title="Clear all usage history"
            style={{ padding: "5px 10px", fontSize: "12px", color: "var(--accent-danger)" }}
          >
            <Trash2 size={13} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto", maxHeight: "550px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "12px" }}>
            <thead>
              <tr
                style={{
                  backgroundColor: "var(--bg-surface-elevated, rgba(255, 255, 255, 0.03))",
                  borderBottom: "1px solid var(--border-subtle)",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  fontSize: "11px",
                  letterSpacing: "0.05em",
                }}
              >
                <th style={{ padding: "10px 16px", fontWeight: 600 }}>Date & Time</th>
                <th style={{ padding: "10px 16px", fontWeight: 600 }}>Mode</th>
                <th style={{ padding: "10px 16px", fontWeight: 600 }}>Model</th>
                <th style={{ padding: "10px 16px", fontWeight: 600 }}>Cost</th>
                <th style={{ padding: "10px 16px", fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "48px 16px", textAlign: "center", color: "var(--text-muted)" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                      <Activity size={28} style={{ opacity: 0.3 }} />
                      <span>No AI usage logs found matching your filter criteria.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    tabIndex={0}
                    aria-label={`View ${log.modelId} request at ${log.formattedTime}`}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedLog(log); } }}
                    onClick={() => setSelectedLog(log)}
                    style={{
                      borderBottom: "1px solid var(--border-subtle)",
                      cursor: "pointer",
                      transition: "background-color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.04)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <td style={{ padding: "12px 16px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {log.formattedTime}
                    </td>
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 600,
                          backgroundColor:
                            log.mode === "live"
                              ? "rgba(6, 182, 212, 0.12)"
                              : "rgba(168, 85, 247, 0.12)",
                          color: log.mode === "live" ? "#22d3ee" : "#c084fc",
                          border:
                            log.mode === "live"
                              ? "1px solid rgba(6, 182, 212, 0.25)"
                              : "1px solid rgba(168, 85, 247, 0.25)",
                        }}
                      >
                        {log.mode === "live" ? <Radio size={10} /> : <FileText size={10} />}
                        {log.mode.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{log.modelId}</span>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{log.provider}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                      {formatCost(log.cost)}
                    </td>
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      {getStatusBadge(log.status)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--border-subtle)",
            fontSize: "11px",
            color: "var(--text-muted)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>
            Showing <strong>{filteredLogs.length}</strong> of <strong>{logs.length}</strong> entries
          </span>
          <span>Tip: Click any row to view full latency, token breakdowns, and request snippets.</span>
        </div>
      </div>

      {/* Detail Modal */}
      <ConfirmDialog isOpen={showClearConfirm} onClose={() => setShowClearConfirm(false)} onConfirm={handleClearLogs} title="Clear translation usage?" message="This removes all saved translation usage entries. This cannot be undone." confirmText="Clear usage" />
      {selectedLog && <AiUsageDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  );
};
