import React from "react";
import {
  FolderOpen,
  Plus,
  RefreshCw,
  Trash2,
  FileCode,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import {
  BatchFileEntry,
  isGenuinelyTranslated,
  isExplicitTagged,
} from "../../../services/batchTranslateService";

interface BatchQueuedFilesTableProps {
  queuedFiles: BatchFileEntry[];
  selectedFileId: string | null;
  isRunning: boolean;
  onSelectFileId: (id: string) => void;
  onAddFiles: () => void;
  onScanDiskProgress: () => void;
  onClearQueue: () => void;
  onRemoveFile: (id: string) => void;
}

export const BatchQueuedFilesTable: React.FC<BatchQueuedFilesTableProps> = ({
  queuedFiles,
  selectedFileId,
  isRunning,
  onSelectFileId,
  onAddFiles,
  onScanDiskProgress,
  onClearQueue,
  onRemoveFile,
}) => {
  const totalLines = queuedFiles.reduce((sum, f) => sum + f.totalLines, 0);
  const completedLines = queuedFiles.reduce(
    (sum, f) =>
      sum + (f.completedLines ?? f.items.filter((it) => isGenuinelyTranslated(it)).length),
    0
  );
  const explicitLines = queuedFiles.reduce(
    (sum, f) =>
      sum + (f.explicitLines ?? f.items.filter((it) => isExplicitTagged(it)).length),
    0
  );
  const progressPercent = totalLines > 0 ? Math.round((completedLines / totalLines) * 100) : 0;

  return (
    <div
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <FolderOpen size={16} style={{ color: "var(--accent-cyan)" }} />
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
            Queued Files ({queuedFiles.length})
          </span>
          {queuedFiles.length > 0 && (
            <span
              style={{
                fontSize: "11.5px",
                color: "var(--text-muted)",
                marginLeft: "4px",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                flexWrap: "wrap",
              }}
            >
              • Total: <strong style={{ color: "var(--accent-success)" }}>{completedLines}</strong> /{" "}
              {totalLines} lines ({progressPercent}%)
              {explicitLines > 0 && (
                <span
                  style={{
                    color: "#fb7185",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  • ⚠️ {explicitLines} Censored / Explicit
                </span>
              )}
            </span>
          )}
        </div>

        {/* Action Buttons: Add, Scan Disk, Clear */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            onClick={onAddFiles}
            disabled={isRunning}
            className="btn-primary"
            style={{
              padding: "5px 10px",
              fontSize: "11.5px",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <Plus size={13} />
            <span>Add Scripts</span>
          </button>

          <button
            type="button"
            onClick={onScanDiskProgress}
            disabled={isRunning || queuedFiles.length === 0}
            className="btn-secondary"
            style={{
              padding: "5px 10px",
              fontSize: "11.5px",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
            title="Rescan output folder to check for already translated lines and update completion status"
          >
            <RefreshCw size={13} />
            <span>Scan Disk</span>
          </button>

          <button
            type="button"
            onClick={onClearQueue}
            disabled={isRunning || queuedFiles.length === 0}
            className="btn-secondary"
            style={{
              padding: "5px 10px",
              fontSize: "11.5px",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              color: "var(--accent-danger)",
            }}
          >
            <Trash2 size={13} />
            <span>Clear All</span>
          </button>
        </div>
      </div>

      {/* Table of Queued Files */}
      {queuedFiles.length === 0 ? (
        <div
          style={{
            border: "1px dashed var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            padding: "18px",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: "12px",
            backgroundColor: "var(--bg-app)",
          }}
        >
          No files loaded yet. Click <strong>"Add Scripts"</strong> to import JSONL, JSON, KS, CSV,
          or TXT script files.
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            overflow: "hidden",
            backgroundColor: "var(--bg-app)",
            width: "100%",
          }}
        >
          {/* 1. Stationary Header Row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 130px 36px",
              padding: "8px 12px",
              backgroundColor: "var(--bg-surface-elevated)",
              borderBottom: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
              fontSize: "11px",
              fontWeight: 700,
            }}
          >
            <div>File</div>
            <div>Progress</div>
            <div>Status</div>
            <div style={{ textAlign: "center" }}></div>
          </div>

          {/* 2. Scrollable Body */}
          <div
            style={{
              maxHeight: "200px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {queuedFiles.map((file, idx) => {
              const fDone =
                file.completedLines ?? file.items.filter((it) => isGenuinelyTranslated(it)).length;
              const fExp =
                file.explicitLines ?? file.items.filter((it) => isExplicitTagged(it)).length;
              const isFinished =
                (fDone + fExp >= file.totalLines && file.totalLines > 0) ||
                file.status === "completed";
              const isSelected = file.id === selectedFileId;

              // Status Badge Calculation
              let statusNode: React.ReactNode;
              if (file.status === "processing") {
                statusNode = (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      backgroundColor: "rgba(56, 189, 248, 0.12)",
                      color: "var(--accent-cyan)",
                      border: "1px solid rgba(56, 189, 248, 0.3)",
                    }}
                  >
                    <Activity size={11} className="animate-spin" /> translating
                  </span>
                );
              } else if (isFinished) {
                if (fExp > 0) {
                  statusNode = (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        fontSize: "11px",
                        fontWeight: 700,
                        backgroundColor: "rgba(244, 63, 94, 0.12)",
                        color: "#fb7185",
                        border: "1px solid rgba(244, 63, 94, 0.3)",
                      }}
                    >
                      <AlertTriangle size={11} /> {fExp} explicit
                    </span>
                  );
                } else {
                  statusNode = (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        fontSize: "11px",
                        fontWeight: 700,
                        backgroundColor: "rgba(34, 197, 94, 0.12)",
                        color: "var(--accent-success)",
                        border: "1px solid rgba(34, 197, 94, 0.3)",
                      }}
                    >
                      <CheckCircle2 size={11} /> completed
                    </span>
                  );
                }
              } else if (isRunning) {
                statusNode = (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      fontSize: "11px",
                      fontWeight: 600,
                      backgroundColor: "rgba(234, 179, 8, 0.1)",
                      color: "var(--accent-gold)",
                      border: "1px solid rgba(234, 179, 8, 0.25)",
                    }}
                  >
                    <Clock size={11} /> queued
                  </span>
                );
              } else if (file.status === "error") {
                statusNode = (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      fontSize: "11px",
                      fontWeight: 600,
                      backgroundColor: "rgba(239, 68, 68, 0.12)",
                      color: "var(--accent-danger)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                    }}
                  >
                    error
                  </span>
                );
              } else {
                statusNode = (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      fontSize: "11px",
                      fontWeight: 600,
                      backgroundColor: "var(--bg-surface-elevated)",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    pending
                  </span>
                );
              }

              return (
                <div
                  key={file.id}
                  onClick={() => onSelectFileId(file.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 120px 130px 36px",
                    padding: "6px 12px",
                    alignItems: "center",
                    borderBottom:
                      idx < queuedFiles.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
                    backgroundColor: isSelected ? "rgba(78, 115, 223, 0.12)" : "transparent",
                    cursor: "pointer",
                    transition: "background-color 0.15s ease",
                    fontSize: "12px",
                  }}
                >
                  {/* 1. File Name */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      overflow: "hidden",
                      minWidth: 0,
                    }}
                  >
                    <FileCode
                      size={14}
                      style={{
                        color: isSelected
                          ? "var(--accent-primary)"
                          : isFinished
                          ? "var(--accent-success)"
                          : "var(--accent-cyan)",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: isSelected ? "var(--accent-primary)" : "var(--text-primary)",
                        fontWeight: 600,
                      }}
                      title={file.path}
                    >
                      {file.name}
                    </span>
                  </div>

                  {/* 2. Progress */}
                  <div
                    style={{
                      whiteSpace: "nowrap",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      fontSize: "11.5px",
                    }}
                  >
                    {fDone}/{file.totalLines}
                  </div>

                  {/* 3. Status */}
                  <div style={{ whiteSpace: "nowrap" }}>{statusNode}</div>

                  {/* 4. Action */}
                  <div style={{ textAlign: "center" }}>
                    {!isRunning && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveFile(file.id);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          padding: "2px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        title="Remove file"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
