import { useClipboardText } from "../../common/useClipboardText";
import React from "react";
import { Modal } from "../../common/Modal";
import {
  Copy,
  Check,
  Clock,
  Coins,
  Cpu,
  Zap,
  Layers,
  Radio,
  AlertTriangle,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { AiUsageLogEntry } from "../../../services/usageLogService";

interface Props {
  log: AiUsageLogEntry | null;
  onClose: () => void;
}

export const AiUsageDetailModal: React.FC<Props> = ({ log, onClose }) => {
  const { copied, copyText } = useClipboardText();


  if (!log) return null;

  const handleCopyJson = () => { void copyText(JSON.stringify(log, null, 2)); };

  const isSuccess = log.status === "completed";
  const isParsingError = log.status === "parsing_error";
  const isSafety = log.status === "safety_refusal";

  const getStatusBadgeColor = () => {
    if (isSuccess) return { bg: "rgba(34, 197, 94, 0.15)", text: "#4ade80", border: "rgba(34, 197, 94, 0.3)" };
    if (isParsingError) return { bg: "rgba(234, 179, 8, 0.15)", text: "#facc15", border: "rgba(234, 179, 8, 0.3)" };
    if (isSafety) return { bg: "rgba(249, 115, 22, 0.15)", text: "#fb923c", border: "rgba(249, 115, 22, 0.3)" };
    return { bg: "rgba(239, 68, 68, 0.15)", text: "#f87171", border: "rgba(239, 68, 68, 0.3)" };
  };

  const statusColors = getStatusBadgeColor();

  return (
    <Modal isOpen={Boolean(log)} onClose={onClose} title="Translation request details" subtitle={log.formattedTime} icon={<Cpu size={20} />} maxWidth="720px" footer={<><span style={{ marginRight: "auto", color: "var(--text-muted)", fontSize: 11, overflowWrap: "anywhere" }}>ID: {log.id}</span><button type="button" className="btn-secondary" onClick={handleCopyJson}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy JSON"}</button><button type="button" className="btn-secondary" onClick={onClose}>Close</button></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Top Identity & Status Banner */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "10px",
              padding: "12px 16px",
              backgroundColor: "var(--bg-canvas)",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  backgroundColor: log.mode === "live" ? "rgba(59, 130, 246, 0.15)" : "rgba(168, 85, 247, 0.15)",
                  color: log.mode === "live" ? "#60a5fa" : "#c084fc",
                  border: `1px solid ${log.mode === "live" ? "rgba(59, 130, 246, 0.3)" : "rgba(168, 85, 247, 0.3)"}`,
                }}
              >
                {log.mode === "live" ? <Radio size={12} /> : <Layers size={12} />}
                {log.mode.toUpperCase()} MODE
              </span>

              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                {log.modelId}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  backgroundColor: statusColors.bg,
                  color: statusColors.text,
                  border: `1px solid ${statusColors.border}`,
                }}
              >
                {isSuccess ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                {log.status.replace(/_/g, " ").toUpperCase()}
              </span>
            </div>
          </div>

          {/* Metric KPI Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))",
              gap: "10px",
            }}
          >
            {/* Cost Card */}
            <div
              style={{
                padding: "12px",
                backgroundColor: "var(--bg-canvas)",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "11px", marginBottom: "4px" }}>
                <Coins size={13} color="#facc15" /> Estimated Cost
              </div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: log.cost > 0 ? "var(--text-primary)" : "var(--text-muted)" }}>
                ${log.cost.toFixed(6)}
              </div>
            </div>

            {/* Latency Card */}
            <div
              style={{
                padding: "12px",
                backgroundColor: "var(--bg-canvas)",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "11px", marginBottom: "4px" }}>
                <Clock size={13} color="#60a5fa" /> Latency
              </div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                {log.latencyMs >= 1000 ? `${(log.latencyMs / 1000).toFixed(2)}s` : `${log.latencyMs}ms`}
              </div>
            </div>

            {/* Prompt Tokens */}
            <div
              style={{
                padding: "12px",
                backgroundColor: "var(--bg-canvas)",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "11px", marginBottom: "4px" }}>
                <Zap size={13} color="#38bdf8" /> Prompt Tokens
              </div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                {log.promptTokens.toLocaleString()}
              </div>
            </div>

            {/* Completion Tokens */}
            <div
              style={{
                padding: "12px",
                backgroundColor: "var(--bg-canvas)",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "11px", marginBottom: "4px" }}>
                <FileText size={13} color="#a855f7" /> Completion Tokens
              </div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                {log.completionTokens.toLocaleString()}
              </div>
            </div>

            {/* Total Tokens */}
            <div
              style={{
                padding: "12px",
                backgroundColor: "var(--bg-canvas)",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "11px", marginBottom: "4px" }}>
                <Layers size={13} color="#4ade80" /> Total Tokens
              </div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                {log.totalTokens.toLocaleString()}
              </div>
              {log.cachedTokens > 0 && (
                <div style={{ fontSize: "10px", color: "#4ade80", marginTop: "2px" }}>
                  ({log.cachedTokens.toLocaleString()} cached)
                </div>
              )}
            </div>
          </div>

          {/* Status Message / Error Details if any */}
          {log.statusMessage && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "8px",
                backgroundColor: isSuccess ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                border: `1px solid ${isSuccess ? "rgba(34, 197, 94, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
                color: isSuccess ? "#4ade80" : "#f87171",
                fontSize: "12px",
                fontFamily: "var(--font-mono, monospace)",
                wordBreak: "break-word",
              }}
            >
              <strong>Status Detail:</strong> {log.statusMessage}
            </div>
          )}

          {/* Input Snippet */}
          {log.inputSnippet && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                Original Input / Dialogue Prompt:
              </span>
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "6px",
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  fontFamily: "var(--font-mono, monospace)",
                  maxHeight: "130px",
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {log.inputSnippet}
              </div>
            </div>
          )}

          {/* Output Snippet */}
          {log.outputSnippet && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                Translated Output / Model Response:
              </span>
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "6px",
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  fontFamily: "var(--font-mono, monospace)",
                  maxHeight: "130px",
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {log.outputSnippet}
              </div>
            </div>
          )}

      </div>
    </Modal>
  );
};
