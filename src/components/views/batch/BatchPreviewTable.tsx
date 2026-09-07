import React, { useMemo, useState, useEffect } from "react";
import {
  FileCode,
  Plus,
  RefreshCw,
  Search,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  BatchFileEntry,
  BatchProgressUpdate,
  isGenuinelyTranslated,
  isExplicitTagged,
} from "../../../services/batchTranslateService";
import { BatchStreamBanner } from "../BatchStreamBanner";

interface BatchPreviewTableProps {
  queuedFiles: BatchFileEntry[];
  selectedFileId: string | null;
  activeFile: BatchFileEntry | undefined;
  isRunning: boolean;
  searchFilter: string;
  statusFilter: "all" | "completed" | "untranslated" | "explicit";
  progressData: BatchProgressUpdate | null;
  onSelectFileId: (id: string) => void;
  onAddFiles: () => void;
  onScanDiskProgress: () => void;
  onSearchChange: (search: string) => void;
  onStatusFilterChange: (status: "all" | "completed" | "untranslated" | "explicit") => void;
}

const PAGE_SIZE = 50;

export const BatchPreviewTable: React.FC<BatchPreviewTableProps> = ({
  queuedFiles,
  activeFile,
  isRunning,
  searchFilter,
  statusFilter,
  progressData,
  onSelectFileId,
  onAddFiles,
  onScanDiskProgress,
  onSearchChange,
  onStatusFilterChange,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Reset pagination when active file or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFile?.id, searchFilter, statusFilter]);

  const displayedItems = useMemo(() => {
    if (!activeFile) return [];
    let items = activeFile.items;

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      items = items.filter(
        (it) =>
          (it.originalSpeaker && it.originalSpeaker.toLowerCase().includes(q)) ||
          it.originalMessage.toLowerCase().includes(q) ||
          (it.translatedMessage && it.translatedMessage.toLowerCase().includes(q)) ||
          (it.translatedSpeaker && it.translatedSpeaker.toLowerCase().includes(q))
      );
    }

    if (statusFilter === "completed") {
      items = items.filter((it) => isGenuinelyTranslated(it));
    } else if (statusFilter === "untranslated") {
      items = items.filter((it) => !isGenuinelyTranslated(it));
    } else if (statusFilter === "explicit") {
      items = items.filter((it) => isExplicitTagged(it));
    }

    return items;
  }, [activeFile, searchFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(displayedItems.length / PAGE_SIZE));
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return displayedItems.slice(start, start + PAGE_SIZE);
  }, [displayedItems, currentPage]);

  return (
    <div
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        width: "100%",
      }}
    >
      {/* Top Compact Control & File Ribbon for Preview */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
          flexShrink: 0,
        }}
      >
        {/* Left: Active File Picker & Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <FileCode size={16} style={{ color: "var(--accent-cyan)" }} />
            <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-primary)" }}>
              File:
            </span>
            {queuedFiles.length > 0 ? (
              <select
                className="input-field"
                value={activeFile?.id || ""}
                onChange={(e) => onSelectFileId(e.target.value)}
                style={{
                  fontSize: "12px",
                  padding: "5px 28px 5px 10px",
                  minWidth: "180px",
                  maxWidth: "340px",
                  fontWeight: 600,
                }}
              >
                {queuedFiles.map((f) => {
                  const fExp = f.items.filter((it) => isExplicitTagged(it)).length;
                  return (
                    <option key={f.id} value={f.id}>
                      {f.name}{" "}
                      {f.status === "completed" ? (fExp > 0 ? "⚠️ (Completed)" : "✓ (Completed)") : ""}
                    </option>
                  );
                })}
              </select>
            ) : (
              <span style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                No files loaded
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onAddFiles}
            disabled={isRunning}
            className="btn-primary"
            style={{ padding: "4px 10px", fontSize: "11.5px" }}
          >
            <Plus size={12} />
            <span>Add Files</span>
          </button>

          {queuedFiles.length > 0 && !isRunning && (
            <button
              type="button"
              onClick={onScanDiskProgress}
              className="btn-secondary"
              style={{ padding: "4px 8px", fontSize: "11.5px" }}
              title="Scan output folder to hydrate already translated lines"
            >
              <RefreshCw size={12} />
              <span>Scan</span>
            </button>
          )}

          {activeFile && (
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                marginLeft: "4px",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                flexWrap: "wrap",
              }}
            >
              <span>
                ({activeFile.items.filter((it) => isGenuinelyTranslated(it)).length}/
                {activeFile.totalLines} lines translated)
              </span>
              {activeFile.items.some((it) => isExplicitTagged(it)) && (
                <span
                  style={{
                    color: "#fb7185",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "2px",
                    marginLeft: "4px",
                  }}
                >
                  <AlertTriangle size={11} />{" "}
                  {activeFile.items.filter((it) => isExplicitTagged(it)).length} explicit
                </span>
              )}
            </span>
          )}
        </div>

        {/* Right: Search Input, Status Filter & Progress Indicators */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search dialogue..."
              className="input-field"
              value={searchFilter}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{ width: "190px", fontSize: "11.5px", padding: "4px 8px 4px 24px" }}
            />
            <Search
              size={12}
              style={{
                position: "absolute",
                left: "7px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
          </div>

          <select
            className="input-field"
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as any)}
            style={{ fontSize: "11.5px", padding: "5px 28px 5px 10px", minWidth: "140px" }}
          >
            <option value="all">All Lines</option>
            <option value="completed">Translated Only</option>
            <option value="untranslated">Untranslated Only</option>
            <option value="explicit">Explicit Flagged Only</option>
          </select>

          {progressData && progressData.currentBatch > 0 && (
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Batch:{" "}
              <strong style={{ color: "var(--accent-cyan)" }}>
                {progressData.currentBatch}/{progressData.totalBatches}
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* Real-time Streaming Feedback Box */}
      <BatchStreamBanner fileId={activeFile?.id} />

      {/* Table Container */}
      <div
        style={{
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          backgroundColor: "var(--bg-app)",
          width: "100%",
          overflowX: "auto",
        }}
      >
        {!activeFile || activeFile.items.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-muted)",
              padding: "50px 0",
              gap: "8px",
            }}
          >
            <Sparkles size={34} style={{ opacity: 0.3 }} />
            <span>No script files loaded. Click Add Files above to start.</span>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
            <thead>
              <tr
                style={{
                  backgroundColor: "var(--bg-surface-elevated)",
                  borderBottom: "1px solid var(--border-subtle)",
                  color: "var(--text-secondary)",
                  textAlign: "left",
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                }}
              >
                <th style={{ padding: "8px 10px", width: "55px" }}>#</th>
                <th style={{ padding: "8px 10px", width: "140px" }}>Speaker</th>
                <th style={{ padding: "8px 10px", width: "42%" }}>Original Dialogue (JP)</th>
                <th style={{ padding: "8px 10px" }}>Translated Output</th>
                <th style={{ padding: "8px 10px", width: "80px", textAlign: "center" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((item) => {
                const isTranslated = isGenuinelyTranslated(item);
                return (
                  <tr
                    key={`line_${item.id}`}
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                      backgroundColor: isTranslated ? "rgba(16, 185, 129, 0.02)" : "transparent",
                      transition: "background-color 0.2s ease",
                    }}
                  >
                    <td style={{ padding: "8px 10px", color: "var(--text-muted)", fontWeight: 500 }}>
                      {item.id}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      {item.originalSpeaker ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                          <span
                            style={{
                              fontFamily: "var(--font-jp)",
                              color: "var(--accent-gold)",
                              fontWeight: 600,
                            }}
                          >
                            {item.originalSpeaker}
                          </span>
                          {item.translatedSpeaker && (
                            <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                              {item.translatedSpeaker}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontStyle: "italic",
                            fontSize: "11px",
                          }}
                        >
                          Narration
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        fontFamily: "var(--font-jp)",
                        color: "var(--text-jp)",
                        lineHeight: 1.5,
                      }}
                    >
                      {item.originalMessage}
                    </td>
                    <td style={{ padding: "8px 10px", lineHeight: 1.5 }}>
                      {isTranslated ? (
                        item.translatedMessage &&
                        item.translatedMessage.includes("[EXPLICIT CONTENT]") ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                width: "fit-content",
                                backgroundColor: "rgba(244, 63, 94, 0.12)",
                                color: "#fb7185",
                                border: "1px solid rgba(244, 63, 94, 0.3)",
                                borderRadius: "3px",
                                padding: "1px 6px",
                                fontSize: "10.5px",
                                fontWeight: 700,
                              }}
                            >
                              <AlertTriangle size={11} /> Explicit / Safety Skipped
                            </span>
                            <span
                              style={{
                                color: "var(--text-muted)",
                                fontStyle: "italic",
                                fontSize: "12px",
                              }}
                            >
                              {item.originalMessage}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                            {item.translatedMessage}
                          </span>
                        )
                      ) : (
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontStyle: "italic",
                            opacity: 0.5,
                          }}
                        >
                          Pending translation...
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      {isTranslated ? (
                        item.translatedMessage &&
                        item.translatedMessage.includes("[EXPLICIT CONTENT]") ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px",
                              fontSize: "10px",
                              color: "#fb7185",
                              fontWeight: 700,
                            }}
                            title="Skipped due to LLM content safety policy"
                          >
                            <AlertTriangle size={12} />
                            <span>Explicit</span>
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "10.5px",
                              color: "var(--accent-success)",
                              fontWeight: 600,
                            }}
                          >
                            <CheckCircle2 size={13} />
                            <span>Done</span>
                          </span>
                        )
                      ) : isRunning && activeFile.status === "processing" ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "10.5px",
                            color: "var(--accent-cyan)",
                          }}
                        >
                          <Clock size={13} />
                          <span>Queue</span>
                        </span>
                      ) : (
                        <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      {activeFile && displayedItems.length > PAGE_SIZE && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 12px",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            fontSize: "11.5px",
            color: "var(--text-secondary)",
            flexShrink: 0,
          }}
        >
          <span>
            Showing <strong>{(currentPage - 1) * PAGE_SIZE + 1}</strong> -{" "}
            <strong>{Math.min(currentPage * PAGE_SIZE, displayedItems.length)}</strong> of{" "}
            <strong>{displayedItems.length}</strong> lines
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="btn-secondary"
              style={{
                padding: "3px 8px",
                fontSize: "11px",
                display: "inline-flex",
                alignItems: "center",
                gap: "2px",
              }}
            >
              <ChevronLeft size={13} />
              <span>Prev</span>
            </button>

            <span style={{ fontWeight: 600, padding: "0 6px" }}>
              Page {currentPage} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="btn-secondary"
              style={{
                padding: "3px 8px",
                fontSize: "11px",
                display: "inline-flex",
                alignItems: "center",
                gap: "2px",
              }}
            >
              <span>Next</span>
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
