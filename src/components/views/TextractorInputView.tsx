import React, { useState, useEffect, useRef } from "react";
import {
  TextractorService,
  POPULAR_HOOK_PRESETS,
  EngineHookPreset,
} from "../../services/textractorService";
import { useTextractorStore } from "../../stores/useTextractorStore";
import {
  RefreshCw,
  XCircle,
  Play,
  Square,
  Zap,
  Sliders,
  Terminal,
  Trash2,
  Search,
  Activity,
  Layers,
  Check,
  X,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Plus,
  Radio,
  FolderOpen,
  Filter,
} from "lucide-react";

interface TextractorInputViewProps {
  onOpenPreprocessingSettings?: () => void;
}

export const TextractorInputView: React.FC<TextractorInputViewProps> = ({
  onOpenPreprocessingSettings,
}) => {
  // Global Textractor State from Zustand SSOT
  const {
    exePath,
    arch,
    processes,
    isLoadingProcesses,
    selectedPid,
    isHooked,
    isAttaching,
    attachedPid,
    hookError,
    debounceMs,
    threadSyncWaitMs,
    threads,
    capturedThreads,
    inspectedThreadId,
    threadLogs,
    ignoreDuplicateLines,
    charDeduplicationCount,
    loopDeduplication,
    stutterReduction,
    setIgnoreDuplicateLines,
    setCharDeduplicationCount,
    setLoopDeduplication,
    setStutterReduction,
    latestSpeaker,
    latestMessage,
    latestRawMessage,
    setExePath,
    setArch,
    setSelectedPid,
    setDebounceMs,
    setThreadSyncWaitMs,
    reorderCapturedThreads,
    setInspectedThreadId,
    setLatestSpeaker,
    setLatestMessage,
    setLatestRawMessage,
  } = useTextractorStore();

  // Local UI State
  const [processSearchQuery, setProcessSearchQuery] = useState<string>("");
  const [isProcessDropdownOpen, setIsProcessDropdownOpen] = useState<boolean>(false);
  const [isThreadDropdownOpen, setIsThreadDropdownOpen] = useState<boolean>(false);
  const [threadSearchQuery, setThreadSearchQuery] = useState<string>("");
  const [logFilterQuery, setLogFilterQuery] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [selectedPreset, setSelectedPreset] = useState<EngineHookPreset>(POPULAR_HOOK_PRESETS[0]);
  const [customHookCode, setCustomHookCode] = useState<string>("");
  const [draggingCapturedIndex, setDraggingCapturedIndex] = useState<number | null>(null);

  const processDropdownRef = useRef<HTMLDivElement>(null);
  const threadDropdownRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (processDropdownRef.current && !processDropdownRef.current.contains(e.target as Node)) {
        setIsProcessDropdownOpen(false);
      }
      if (threadDropdownRef.current && !threadDropdownRef.current.contains(e.target as Node)) {
        setIsThreadDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Initialize Textractor listener and process list on mount
  useEffect(() => {
    TextractorService.initListener();
    TextractorService.listProcesses();
  }, []);

  // Auto-select first thread if none inspected
  useEffect(() => {
    if (inspectedThreadId === null && threads.size > 0) {
      const firstId = Array.from(threads.keys())[0];
      setInspectedThreadId(firstId);
    }
  }, [threads, inspectedThreadId, setInspectedThreadId]);

  // Actions
  const handleAttach = async () => {
    if (!selectedPid) return;
    await TextractorService.startSidecar(exePath, selectedPid);
  };

  const handleDetach = async () => {
    await TextractorService.stopSidecar();
  };

  const handleInsertHookCode = async () => {
    if (!isHooked || !customHookCode.trim()) return;
    await TextractorService.sendCommand(customHookCode.trim());
  };

  const handleSelectArch = (newArch: "x86" | "x64") => {
    setArch(newArch);
    if (newArch === "x86" && exePath.includes("\\x64\\")) {
      setExePath(exePath.replace("\\x64\\", "\\x86\\"));
    } else if (newArch === "x64" && exePath.includes("\\x86\\")) {
      setExePath(exePath.replace("\\x86\\", "\\x64\\"));
    }
  };

  // Convert threads Map to array
  const allThreadsList = Array.from(threads.values()).sort((a, b) => b.totalLines - a.totalLines);

  const filteredProcesses = processes.filter((p) => {
    if (!processSearchQuery.trim()) return true;
    const q = processSearchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.window_title.toLowerCase().includes(q) ||
      String(p.pid).includes(q)
    );
  });

  const filteredThreadList = allThreadsList.filter((t) => {
    if (!threadSearchQuery.trim()) return true;
    const q = threadSearchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      String(t.id).includes(q) ||
      t.hookCode.toLowerCase().includes(q) ||
      (t.lastText && t.lastText.toLowerCase().includes(q))
    );
  });

  const selectedProcess = processes.find((p) => p.pid === (attachedPid || selectedPid));
  const inspectedThread = inspectedThreadId !== null ? threads.get(inspectedThreadId) : null;
  const inspectedLogs = inspectedThreadId !== null ? threadLogs.get(inspectedThreadId) || [] : [];
  const filteredLogs = inspectedLogs.filter((log) => {
    if (!logFilterQuery.trim()) return true;
    return (log.text || "").toLowerCase().includes(logFilterQuery.toLowerCase());
  });

  // Drag and drop handlers for captured threads
  const handleDragStart = (index: number) => {
    setDraggingCapturedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggingCapturedIndex === null || draggingCapturedIndex === index) return;
    reorderCapturedThreads(draggingCapturedIndex, index);
    setDraggingCapturedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggingCapturedIndex(null);
  };

  const isLiveStreamActive = capturedThreads.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", width: "100%" }}>
      {/* ========================================================================= */}
      {/* 1. TARGET GAME PROCESS (Compact Quick Connect Bar)                        */}
      {/* ========================================================================= */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header" style={{ paddingBottom: "10px" }}>
          <div>
            <span className="card-title">
              <Radio size={16} /> Target Game Process
            </span>
            <span className="card-subtitle">
              Select running Visual Novel window to hook real-time text threads
            </span>
          </div>

          {isHooked && attachedPid && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11.5px",
                fontWeight: 600,
                color: "#3fb950",
                backgroundColor: "rgba(63, 185, 80, 0.12)",
                border: "1px solid rgba(63, 185, 80, 0.3)",
                padding: "3px 8px",
                borderRadius: "20px",
              }}
            >
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#3fb950" }} />
              Hook Active (PID: {attachedPid})
            </span>
          )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
          {/* Searchable Process Picker */}
          <div ref={processDropdownRef} style={{ position: "relative", flex: "1 1 280px", minWidth: "220px" }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", color: "var(--text-muted)", pointerEvents: "none" }} />
              <input
                type="text"
                placeholder={selectedProcess ? `"${selectedProcess.window_title}" (${selectedProcess.name} - PID: ${selectedProcess.pid})` : "Click or type to search game window..."}
                value={isProcessDropdownOpen ? processSearchQuery : (selectedProcess ? `"${selectedProcess.window_title}" — ${selectedProcess.name} (PID: ${selectedProcess.pid})` : "")}
                onChange={(e) => {
                  setProcessSearchQuery(e.target.value);
                  setIsProcessDropdownOpen(true);
                }}
                onFocus={() => {
                  if (!isHooked) {
                    setIsProcessDropdownOpen(true);
                    setProcessSearchQuery("");
                  }
                }}
                disabled={isHooked}
                style={{ width: "100%", paddingLeft: "32px", fontSize: "12px", height: "34px" }}
              />
              {selectedPid && !isHooked && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPid(null);
                    setProcessSearchQuery("");
                  }}
                  style={{ position: "absolute", right: "8px", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px" }}
                  title="Clear selection"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Process Dropdown Menu */}
            {isProcessDropdownOpen && !isHooked && (
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
                  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                  maxHeight: "220px",
                  overflowY: "auto",
                  zIndex: 100,
                }}
              >
                {filteredProcesses.length === 0 ? (
                  <div style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: "12px" }}>
                    No running game processes found matching "{processSearchQuery}"
                  </div>
                ) : (
                  filteredProcesses.map((p) => {
                    const isSelected = p.pid === selectedPid;
                    return (
                      <div
                        key={p.pid}
                        onClick={() => {
                          setSelectedPid(p.pid);
                          setIsProcessDropdownOpen(false);
                          setProcessSearchQuery("");
                        }}
                        style={{
                          padding: "8px 12px",
                          fontSize: "12px",
                          cursor: "pointer",
                          backgroundColor: isSelected ? "rgba(88, 166, 255, 0.15)" : "transparent",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                          <span style={{ fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            "{p.window_title}"
                          </span>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            {p.name} (PID: {p.pid})
                          </span>
                        </div>
                        {isSelected && <Check size={14} color="var(--accent-primary)" />}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Refresh Processes Button */}
          <button
            onClick={() => TextractorService.listProcesses()}
            disabled={isLoadingProcesses || isHooked}
            className="btn-secondary"
            style={{ height: "34px", padding: "0 12px", fontSize: "12px", whiteSpace: "nowrap" }}
            title="Refresh running game processes"
          >
            <RefreshCw size={13} className={isLoadingProcesses ? "spin" : ""} />
            <span>Refresh</span>
          </button>

          {/* Architecture Switcher Toggle (32-bit / 64-bit) */}
          <div
            style={{
              display: "inline-flex",
              backgroundColor: "var(--bg-app)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "2px",
              height: "34px",
              boxSizing: "border-box",
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => handleSelectArch("x86")}
              disabled={isHooked}
              style={{
                padding: "0 10px",
                height: "100%",
                fontSize: "11.5px",
                fontWeight: 600,
                borderRadius: "3px",
                border: "none",
                backgroundColor: arch === "x86" ? "var(--accent-primary)" : "transparent",
                color: arch === "x86" ? "#ffffff" : "var(--text-secondary)",
                cursor: isHooked ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
              }}
              title="32-bit Visual Novel executable"
            >
              32-bit (x86)
            </button>
            <button
              type="button"
              onClick={() => handleSelectArch("x64")}
              disabled={isHooked}
              style={{
                padding: "0 10px",
                height: "100%",
                fontSize: "11.5px",
                fontWeight: 600,
                borderRadius: "3px",
                border: "none",
                backgroundColor: arch === "x64" ? "var(--accent-primary)" : "transparent",
                color: arch === "x64" ? "#ffffff" : "var(--text-secondary)",
                cursor: isHooked ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
              }}
              title="64-bit Visual Novel executable"
            >
              64-bit (x64)
            </button>
          </div>

          {/* Attach / Detach Button */}
          {!isHooked ? (
            <button
              onClick={handleAttach}
              disabled={isAttaching || !selectedPid}
              className="btn-primary"
              style={{ height: "34px", padding: "0 18px", whiteSpace: "nowrap", fontWeight: 600 }}
            >
              {isAttaching ? <RefreshCw size={13} className="spin" /> : <Play size={13} />}
              <span>{isAttaching ? "Attaching..." : "Attach Hook"}</span>
            </button>
          ) : (
            <button
              onClick={handleDetach}
              className="btn-danger"
              style={{ height: "34px", padding: "0 18px", whiteSpace: "nowrap", fontWeight: 600 }}
            >
              <Square size={13} />
              <span>Detach</span>
            </button>
          )}
        </div>

        {hookError && (
          <div
            style={{
              marginTop: "8px",
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
              backgroundColor: "rgba(248, 81, 73, 0.12)",
              border: "1px solid var(--accent-danger)",
              color: "var(--accent-danger)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <XCircle size={15} style={{ flexShrink: 0 }} />
            <span>{hookError}</span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. LIVE STREAM INSPECTOR & ACTIVE CAPTURED THREADS (Drag & Drop Reorder)  */}
      {/* ========================================================================= */}
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
            {/* Quick Button to Text Preprocessing Rules Settings */}
            {onOpenPreprocessingSettings && (
              <button
                type="button"
                onClick={onOpenPreprocessingSettings}
                className="btn-secondary"
                style={{ height: "28px", padding: "0 10px", fontSize: "11.5px", display: "flex", alignItems: "center", gap: "5px" }}
                title="Configure active regex and cleaning rules"
              >
                <Filter size={12} color="var(--accent-primary)" />
                <span>Clean Rules</span>
              </button>
            )}

            <button
              onClick={() => {
                setLatestSpeaker("");
                setLatestMessage("");
                setLatestRawMessage("");
              }}
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
                    backgroundColor: item.role === "combined" ? "rgba(46, 160, 67, 0.08)" : item.role === "speaker" ? "rgba(255, 193, 7, 0.08)" : "rgba(88, 166, 255, 0.08)",
                    border: `1px solid ${item.role === "combined" ? "rgba(46, 160, 67, 0.4)" : item.role === "speaker" ? "rgba(255, 193, 7, 0.4)" : "rgba(88, 166, 255, 0.4)"}`,
                    borderRadius: "var(--radius-sm)",
                    gap: "10px",
                    cursor: "grab",
                    transition: "all 0.15s ease",
                  }}
                >
                  {/* Left: Drag Handle & Thread Name */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}>
                    <GripVertical size={14} color="var(--text-muted)" style={{ cursor: "grab", flexShrink: 0 }} />
                    <span style={{ fontSize: "11px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-primary)" }}>
                      #{item.threadId}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: "12px", color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                      {threadName}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      — "{lastSnippet}"
                    </span>
                  </div>

                  {/* Right: Role Dropdown & Remove Button */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                    <select
                      value={item.role}
                      onChange={(e) => TextractorService.setThreadRole(item.threadId, e.target.value as any)}
                      style={{
                        fontSize: "11.5px",
                        padding: "3px 8px",
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
                      onClick={() => TextractorService.setThreadRole(item.threadId, "ignored")}
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

        {/* Live Stream Direct 2-Tier Output Box (RAW on Top, Clean Result on Bottom) */}
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
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                  {isLiveStreamActive ? "(Waiting for in-game dialogue on active threads...)" : "(No active thread captured)"}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. DETECTED THREADS & LOG (Unified Searchable Combobox + Log Box)         */}
      {/* ========================================================================= */}
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
              <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                <Terminal size={14} color="var(--accent-primary)" />
                {inspectedThread ? (
                  <>
                    <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--accent-primary)" }}>
                      #{inspectedThread.id}
                    </span>
                    <span style={{ fontWeight: 600 }}>{inspectedThread.name}</span>
                    {capturedThreads.some((c) => c.threadId === inspectedThread.id) ? (
                      <span className="badge badge-success" style={{ fontSize: "10px", padding: "1px 5px" }}>
                        Active Captured
                      </span>
                    ) : (
                      <span className="badge badge-neutral" style={{ fontSize: "10px", padding: "1px 5px" }}>
                        Standby ({inspectedThread.totalLines} lines)
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ color: "var(--text-muted)" }}>
                    {allThreadsList.length === 0 ? "No threads discovered yet..." : "Select thread to inspect..."}
                  </span>
                )}
              </div>

              <ChevronDown size={14} color="var(--text-muted)" />
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
                    style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: "12px", color: "var(--text-primary)" }}
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
                            setInspectedThreadId(t.id);
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
                            <span style={{ fontSize: "11px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                  onClick={() => TextractorService.setThreadRole(inspectedThread.id, "dialogue")}
                  className="btn-primary"
                  style={{ fontSize: "12px", padding: "5px 12px", display: "flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap" }}
                >
                  <Plus size={13} />
                  <span>Capture Thread</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => TextractorService.setThreadRole(inspectedThread.id, "ignored")}
                  className="btn-secondary"
                  style={{ fontSize: "12px", padding: "5px 10px", color: "var(--accent-danger)", display: "flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap" }}
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
              <span style={{ color: "var(--text-muted)" }}>
                {filteredLogs.length} events
              </span>

              {inspectedThread && (
                <button
                  type="button"
                  onClick={() => TextractorService.clearLogs(inspectedThread.id)}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}
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

      {/* ========================================================================= */}
      {/* 4. ADVANCED HOOK SETTINGS (Categorized Collapsible Accordion)              */}
      {/* ========================================================================= */}
      <div className="card" style={{ margin: 0 }}>
        <div
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Sliders size={15} color="var(--accent-primary)" />
            <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
              Advanced Hook Settings
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "12px" }}>
            <span>{showAdvanced ? "Hide" : "Expand"}</span>
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>

        {showAdvanced && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "14px", borderTop: "1px solid var(--border-subtle)", paddingTop: "14px" }}>
            {/* Category 1: Executable Path */}
            <div style={{ backgroundColor: "var(--bg-app)", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                <FolderOpen size={13} color="var(--accent-primary)" />
                <span>Textractor Binary Executable Path</span>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                  TextractorCLI.exe File Path (Auto-resolved from drive D:\ and C:\)
                </label>
                <input
                  type="text"
                  value={exePath}
                  onChange={(e) => setExePath(e.target.value)}
                  style={{ width: "100%", fontSize: "11.5px", fontFamily: "var(--font-mono)" }}
                />
              </div>
            </div>

            {/* Category 2: Custom Engine Hook Code Injection */}
            <div style={{ backgroundColor: "var(--bg-app)", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                <Zap size={13} color="var(--accent-gold)" />
                <span>Custom Memory Hook Code Injection</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px", alignItems: "flex-end" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                    Popular Engine Preset
                  </label>
                  <select
                    value={selectedPreset.name}
                    onChange={(e) => {
                      const found = POPULAR_HOOK_PRESETS.find((p) => p.name === e.target.value);
                      if (found) {
                        setSelectedPreset(found);
                        if (found.code) setCustomHookCode(found.code);
                      }
                    }}
                    style={{ width: "100%", fontSize: "11.5px" }}
                  >
                    {POPULAR_HOOK_PRESETS.map((preset) => (
                      <option key={preset.name} value={preset.name}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                    Hook Code String (/HN... or /HS...)
                  </label>
                  <input
                    type="text"
                    value={customHookCode}
                    onChange={(e) => setCustomHookCode(e.target.value)}
                    placeholder="Enter hook code (e.g. /HN-4*0@...)"
                    style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "11.5px" }}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleInsertHookCode}
                  disabled={!isHooked || !customHookCode.trim()}
                  className="btn-secondary"
                  style={{ padding: "6px 14px", fontSize: "11.5px", whiteSpace: "nowrap" }}
                >
                  <Zap size={12} color="var(--accent-gold)" />
                  <span>Insert Hook</span>
                </button>
              </div>
            </div>

            {/* Category 3: Performance & Timing */}
            <div style={{ backgroundColor: "var(--bg-app)", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Sliders size={13} color="var(--accent-primary)" />
                <span>Timing & Dual-Thread Synchronization</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                {/* 1. Typewriter Debounce Slider */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 500 }}>
                      Typewriter Debounce Delay:
                    </label>
                    <strong style={{ fontSize: "11px", color: "var(--accent-primary)" }}>{debounceMs} ms</strong>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={600}
                    step={25}
                    value={debounceMs}
                    onChange={(e) => setDebounceMs(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                  <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "3px", lineHeight: "1.3" }}>
                    Buffers typewriter character streams before dispatching sentences.
                  </span>
                </div>

                {/* 2. Dual-Thread Sync Window Slider */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 500 }}>
                      Dual-Thread Sync Wait Window:
                    </label>
                    <strong style={{ fontSize: "11px", color: "var(--accent-gold)" }}>{threadSyncWaitMs || 150} ms</strong>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={600}
                    step={25}
                    value={threadSyncWaitMs || 150}
                    onChange={(e) => setThreadSyncWaitMs(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                  <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "3px", lineHeight: "1.3" }}>
                    When using separate Name & Dialogue threads, waits up to this duration to sync character name or clear for narration.
                  </span>
                </div>
              </div>
            </div>

            {/* Category 4: Deduplication & Clean Text Filtering */}
            <div style={{ backgroundColor: "var(--bg-app)", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Layers size={13} color="var(--accent-secondary)" />
                <span>Text Hook Deduplication & Filtering</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", alignItems: "flex-start" }}>
                {/* 1. Consecutive Character Deduplication Number Input */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", alignItems: "center" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 500 }}>
                      Consecutive Character Deduplication:
                    </label>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: charDeduplicationCount >= 2 ? "var(--accent-primary)" : "var(--text-muted)" }}>
                      {charDeduplicationCount >= 2 ? `${charDeduplicationCount}x (${charDeduplicationCount === 2 ? "Doubled" : charDeduplicationCount === 3 ? "Tripled" : `${charDeduplicationCount}-pass`})` : "Disabled (0)"}
                    </span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={1}
                    value={charDeduplicationCount}
                    onChange={(e) => setCharDeduplicationCount(parseInt(e.target.value, 10) || 0)}
                    placeholder="0 to disable (e.g. 2 for doubled characters)"
                    style={{ width: "100%", fontSize: "12px", height: "32px" }}
                  />
                  <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "3px", lineHeight: "1.3" }}>
                    Collapses multi-pass text hook duplicates (e.g. set <strong>2</strong> for 「「運運命命」」 → 「運命」, <strong>3</strong> for tripled).
                  </span>
                </div>

                {/* 2. Rapid Burst Duplicate Line Suppression Toggle */}
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "11.5px", fontWeight: 500, color: "var(--text-primary)", marginTop: "4px" }}>
                    <input
                      type="checkbox"
                      checked={ignoreDuplicateLines}
                      onChange={(e) => setIgnoreDuplicateLines(e.target.checked)}
                      style={{ cursor: "pointer" }}
                    />
                    <span>Suppress Identical Burst Packets (&lt; 800ms)</span>
                  </label>
                  <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "4px", lineHeight: "1.3" }}>
                    Prevents rapid duplicate memory hook packet bursts from triggering double translations while still allowing repeated lines when you advance the game.
                  </span>
                </div>

                {/* 3. Repeated Phrase & Loop Deduplicator */}
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "11.5px", fontWeight: 500, color: "var(--text-primary)", marginTop: "4px" }}>
                    <input
                      type="checkbox"
                      checked={loopDeduplication !== false}
                      onChange={(e) => setLoopDeduplication(e.target.checked)}
                      style={{ cursor: "pointer" }}
                    />
                    <span>Repeated Phrase & Loop Deduplicator</span>
                  </label>
                  <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "4px", lineHeight: "1.3" }}>
                    Collapses shadow and outline rendering hook loops (e.g. 遥月遥月... → 遥月).
                  </span>
                </div>

                {/* 4. Stutter & Repeated Punctuation Reducer */}
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "11.5px", fontWeight: 500, color: "var(--text-primary)", marginTop: "4px" }}>
                    <input
                      type="checkbox"
                      checked={stutterReduction !== false}
                      onChange={(e) => setStutterReduction(e.target.checked)}
                      style={{ cursor: "pointer" }}
                    />
                    <span>Stutter & Repeated Punctuation Reducer</span>
                  </label>
                  <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "4px", lineHeight: "1.3" }}>
                    Collapses excessive stutter marks (e.g. あ、、あの → あ、あの, ！！！！ → ！).
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
