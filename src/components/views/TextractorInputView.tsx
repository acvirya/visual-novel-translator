import React, { useState, useEffect, useRef } from "react";
import {
  TextractorService,
  POPULAR_HOOK_PRESETS,
  DEFAULT_TEXTRACTOR_PATH,
  EngineHookPreset,
} from "../../services/textractorService";
import { executePreprocessingPipeline } from "../../utils/textPreprocessor";
import { useTextractorStore } from "../../stores/useTextractorStore";
import {
  Cpu,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Play,
  Square,
  Zap,
  Sliders,
  Terminal,
  Trash2,
  Radio,
  Search,
  FileText,
  Activity,
  Layers,
  Sparkles,
  Check,
  X,
} from "lucide-react";

export const TextractorInputView: React.FC = () => {
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
    discoveryDuration,
    discoverySecondsLeft,
    isDiscoveryActive,
    debounceMs,
    threads,
    combinedThreadId,
    messageThreadId,
    speakerThreadId,
    inspectedThreadId,
    maxLogLines,
    threadLogs,
    ignoreDuplicateLines,
    latestSpeaker,
    latestMessage,
    latestRawMessage,
    autoForwardToOverlay,
    setExePath,
    setArch,
    setSelectedPid,
    setDiscoveryDuration,
    setDiscoverySecondsLeft,
    setIsDiscoveryActive,
    setDebounceMs,
    setInspectedThreadId,
    setMaxLogLines,
    setIgnoreDuplicateLines,
    setAutoForwardToOverlay,
    setLatestSpeaker,
    setLatestMessage,
    setLatestRawMessage,
  } = useTextractorStore();

  // Local UI-only state (search input & dropdown popovers)
  const [processSearchQuery, setProcessSearchQuery] = useState<string>("");
  const [isProcessDropdownOpen, setIsProcessDropdownOpen] = useState<boolean>(false);
  const [specificTextFilter, setSpecificTextFilter] = useState<string>("");
  const [selectedPreset, setSelectedPreset] = useState<EngineHookPreset>(POPULAR_HOOK_PRESETS[0]);
  const [customHookCode, setCustomHookCode] = useState<string>("");

  const processDropdownRef = useRef<HTMLDivElement>(null);
  const discoveryTimerRef = useRef<any>(null);

  // Close process dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (processDropdownRef.current && !processDropdownRef.current.contains(e.target as Node)) {
        setIsProcessDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Initialize Textractor listener and load process list on mount
  useEffect(() => {
    TextractorService.initListener();
    TextractorService.listProcesses();
  }, []);

  // Handle Discovery Countdown Timer
  useEffect(() => {
    if (isDiscoveryActive && discoverySecondsLeft > 0) {
      discoveryTimerRef.current = setTimeout(() => {
        setDiscoverySecondsLeft(discoverySecondsLeft - 1);
      }, 1000);
    } else if (discoverySecondsLeft === 0 && isDiscoveryActive) {
      setIsDiscoveryActive(false);
    }

    return () => {
      if (discoveryTimerRef.current) clearTimeout(discoveryTimerRef.current);
    };
  }, [isDiscoveryActive, discoverySecondsLeft, setDiscoverySecondsLeft, setIsDiscoveryActive]);

  // Manual Hook Search Toggle
  const handleToggleHookSearch = () => {
    if (!isHooked) return;
    if (isDiscoveryActive) {
      setIsDiscoveryActive(false);
      setDiscoverySecondsLeft(0);
    } else {
      setIsDiscoveryActive(true);
      setDiscoverySecondsLeft(discoveryDuration > 0 ? discoveryDuration : 9999);
    }
  };

  // Attach / Start Textractor Sidecar
  const handleAttach = async () => {
    if (!selectedPid) return;
    await TextractorService.startSidecar(exePath, selectedPid);
  };

  // Detach / Stop Textractor Sidecar
  const handleDetach = async () => {
    await TextractorService.stopSidecar();
  };

  // Insert Custom Hook Code
  const handleInsertHookCode = async () => {
    if (!isHooked || !attachedPid) return;
    const code = customHookCode.trim();
    if (!code) return;

    const command = `${code} -P${attachedPid}`;
    await TextractorService.sendCommand(command);
    setCustomHookCode("");
  };

  // Switch architecture
  const handleSelectArch = async (selectedArch: "x86" | "x64") => {
    if (isHooked) {
      await TextractorService.stopSidecar();
    }
    setArch(selectedArch);
    const newPath =
      selectedArch === "x86"
        ? "C:\\Program Files\\Textractor\\x86\\TextractorCLI.exe"
        : "C:\\Program Files\\Textractor\\x64\\TextractorCLI.exe";
    setExePath(newPath);

    setSelectedPid(null);
    setProcessSearchQuery("");
    setIsProcessDropdownOpen(false);

    TextractorService.listProcesses();
  };

  // Selected process object
  const selectedProcess = processes.find((p) => p.pid === selectedPid) || null;

  // Filter processes by search query
  const filteredProcesses = processes.filter((p) => {
    const q = processSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.window_title.toLowerCase().includes(q) ||
      p.pid.toString().includes(q)
    );
  });

  // Filter threads by specific text search if user typed one
  const threadList = Array.from(threads.values()).filter((t) => {
    if (!specificTextFilter.trim()) return true;
    return t.lastText.toLowerCase().includes(specificTextFilter.toLowerCase().trim());
  });

  // Active inspected thread details & logs
  const currentInspectedThread = inspectedThreadId !== null ? threads.get(inspectedThreadId) : null;
  const currentThreadLogs = inspectedThreadId !== null ? threadLogs.get(inspectedThreadId) || [] : [];

  const isLiveStreamActive = combinedThreadId !== null || messageThreadId !== null || speakerThreadId !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      {/* 1. Header: Path Configuration & Real-Time Sidecar Status */}
      <div className="card" style={{ margin: 0, minWidth: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Cpu size={16} color="var(--accent-primary)" /> Textractor Sidecar Hooker
            </span>
            <span className="card-subtitle">
              Hook in-game dialogues directly from visual novel game processes into VN Translator
            </span>
          </div>

          {/* Status Badge */}
          <span
            className={isHooked ? "badge badge-success" : "badge badge-danger"}
            style={{
              padding: "4px 10px",
              fontWeight: 700,
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {isHooked ? (
              <>
                <CheckCircle2 size={12} /> Hook Attached (PID: {attachedPid})
              </>
            ) : (
              <>
                <XCircle size={12} /> Disconnected (Idle)
              </>
            )}
          </span>
        </div>

        {/* Textractor Executable Path & Arch Config */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "center" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
              TextractorCLI Executable Location
            </label>
            <input
              type="text"
              value={exePath}
              onChange={(e) => setExePath(e.target.value)}
              placeholder={DEFAULT_TEXTRACTOR_PATH}
              style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "12px" }}
            />
          </div>

          {/* Arch Toggle */}
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
              Target Game Architecture
            </label>
            <div style={{ display: "flex", gap: "4px" }}>
              <button
                type="button"
                onClick={() => handleSelectArch("x86")}
                className={arch === "x86" ? "btn-primary" : "btn-secondary"}
                style={{ padding: "5px 12px", fontSize: "12px" }}
                title="Use 32-bit TextractorCLI for 95% of Visual Novels (Kirikiri, Siglus, Majiro, etc.)"
              >
                x86 (32-bit VN)
              </button>
              <button
                type="button"
                onClick={() => handleSelectArch("x64")}
                className={arch === "x64" ? "btn-primary" : "btn-secondary"}
                style={{ padding: "5px 12px", fontSize: "12px" }}
                title="Use 64-bit TextractorCLI for 64-bit Unity and modern visual novels"
              >
                x64 (64-bit)
              </button>
            </div>
          </div>
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
            <XCircle size={14} />
            <span>{hookError}</span>
          </div>
        )}
      </div>

      {/* 2. Target Visual Novel Process Picker & Attacher */}
      <div className="card" style={{ margin: 0, minWidth: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Radio size={16} /> Target Game Process
            </span>
            <span className="card-subtitle">
              Select running Visual Novel window to attach text hooking engine
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "10px", alignItems: "center" }}>
          {/* Searchable Process Combobox */}
          <div ref={processDropdownRef} style={{ position: "relative" }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", color: "var(--text-muted)", pointerEvents: "none" }} />
              <input
                type="text"
                placeholder={selectedProcess ? `"${selectedProcess.window_title}" (${selectedProcess.name} - PID: ${selectedProcess.pid})` : "Type or click to search game process by title, exe, or PID..."}
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
                style={{ width: "100%", paddingLeft: "32px", fontSize: "12px", height: "32px" }}
              />
              {selectedPid && !isHooked && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPid(null);
                    setProcessSearchQuery("");
                  }}
                  style={{ position: "absolute", right: "8px", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px" }}
                  title="Clear selected process"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Dropdown Menu */}
            {isProcessDropdownOpen && !isHooked && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  marginTop: "4px",
                  backgroundColor: "var(--bg-surface-elevated)",
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
                          backgroundColor: isSelected ? "var(--bg-surface-hover)" : "transparent",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-surface-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isSelected ? "var(--bg-surface-hover)" : "transparent")}
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
            style={{ height: "32px", padding: "0 12px", fontSize: "12px", whiteSpace: "nowrap" }}
            title="Refresh running Windows processes"
          >
            <RefreshCw size={12} className={isLoadingProcesses ? "spin" : ""} />
            <span>{isLoadingProcesses ? "Scanning..." : "Refresh Processes"}</span>
          </button>

          {/* Attach / Detach Button */}
          {!isHooked ? (
            <button
              onClick={handleAttach}
              disabled={isAttaching || !selectedPid}
              className="btn-primary"
              style={{ height: "32px", padding: "0 18px", whiteSpace: "nowrap", fontWeight: 600 }}
            >
              {isAttaching ? <RefreshCw size={13} className="spin" /> : <Play size={13} />}
              <span>{isAttaching ? "Attaching..." : "Attach Hook"}</span>
            </button>
          ) : (
            <button
              onClick={handleDetach}
              className="btn-danger"
              style={{ height: "32px", padding: "0 18px", whiteSpace: "nowrap", fontWeight: 600 }}
            >
              <Square size={13} />
              <span>Detach Hook</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Hook Search Settings & Performance Tuning */}
      <div className="card" style={{ margin: 0, minWidth: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Sliders size={16} /> Hook Search & Performance Tuning
            </span>
            <span className="card-subtitle">
              Start manual hook search to capture active in-game text threads with lightweight CPU limits
            </span>
          </div>

          {/* Manual Hook Search Trigger Button */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={handleToggleHookSearch}
              disabled={!isHooked}
              className={isDiscoveryActive ? "btn-danger" : "btn-primary"}
              style={{ padding: "5px 14px", fontSize: "12px", whiteSpace: "nowrap" }}
              title={!isHooked ? "Attach to a game process first" : isDiscoveryActive ? "Stop active search" : "Start scanning for new in-game text threads"}
            >
              {isDiscoveryActive ? (
                <>
                  <Square size={12} />
                  <span>Stop Search ({discoveryDuration === 0 ? "Active" : `${discoverySecondsLeft}s left`})</span>
                </>
              ) : (
                <>
                  <Search size={12} />
                  <span>Start Hook Search</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.5fr", gap: "16px", alignItems: "center" }}>
          {/* Discovery Duration Setting */}
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Hook Search Duration: <strong>{discoveryDuration === 0 ? "Continuous" : `${discoveryDuration} seconds`}</strong>
            </label>
            <select
              value={discoveryDuration}
              onChange={(e) => setDiscoveryDuration(Number(e.target.value))}
              disabled={isDiscoveryActive}
              style={{ width: "100%" }}
            >
              <option value={5}>5 Seconds (Ultra Lightweight)</option>
              <option value={10}>10 Seconds (Recommended)</option>
              <option value={20}>20 Seconds (Deeper Scan)</option>
              <option value={0}>Continuous (No Time Limit)</option>
            </select>
          </div>

          {/* Text Refresh Delay / Debounce */}
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Typewriter Debounce: <strong>{debounceMs} ms</strong>
            </label>
            <input
              type="range"
              min={50}
              max={600}
              step={50}
              value={debounceMs}
              onChange={(e) => setDebounceMs(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          {/* Search Specific Text Matcher */}
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Search Specific Text on Game Screen
            </label>
            <input
              type="text"
              value={specificTextFilter}
              onChange={(e) => setSpecificTextFilter(e.target.value)}
              placeholder="e.g. 「私の名前は... or first few words"
              style={{ width: "100%", fontSize: "12px" }}
            />
          </div>
        </div>

        {/* Additional Preprocessing & Performance Toggles */}
        <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={ignoreDuplicateLines}
              onChange={(e) => setIgnoreDuplicateLines(e.target.checked)}
            />
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
              Remove Consecutive Duplicate Lines (Anti-Echo / Double Trigger)
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              — Suppresses identical consecutive lines from re-triggering translations or flooding logs
            </span>
          </label>
        </div>
      </div>

      {/* 4. Engine Presets & Custom Hook Code Bar */}
      <div className="card" style={{ margin: 0, minWidth: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Terminal size={16} /> Custom Hook Code Injection
            </span>
            <span className="card-subtitle">
              Insert specialized memory hook codes for specific Visual Novel game engines
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.5fr auto", gap: "10px", alignItems: "center" }}>
          {/* Preset Engine Dropdown */}
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
              Popular Engine Presets
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
              style={{ width: "100%" }}
            >
              {POPULAR_HOOK_PRESETS.map((preset) => (
                <option key={preset.name} value={preset.name}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>

          {/* Hook Code Input */}
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
              Hook Code String (e.g. /HN-4*0@... or HS-8*0@...)
            </label>
            <input
              type="text"
              value={customHookCode}
              onChange={(e) => setCustomHookCode(e.target.value)}
              placeholder="Enter hook code..."
              style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "12px" }}
            />
          </div>

          {/* Insert Hook Button */}
          <div style={{ paddingTop: "18px" }}>
            <button
              onClick={handleInsertHookCode}
              disabled={!isHooked || !customHookCode.trim()}
              className="btn-secondary"
              style={{ padding: "7px 16px", whiteSpace: "nowrap" }}
            >
              <Zap size={13} color="var(--accent-gold)" />
              <span>Insert Hook</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5. Live Stream Inspector (Full-Width Top Panel) */}
      <div className="card" style={{ margin: 0, minWidth: 0, width: "100%", boxSizing: "border-box" }}>
        <div className="card-header">
          <div>
            <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Activity size={16} color="var(--accent-success)" /> Live Stream Inspector
            </span>
            <span className="card-subtitle">
              Live text stream intercepted from selected game thread
            </span>
          </div>
        </div>

        {/* Toolbar: Auto-Forward & Clear Stream */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoForwardToOverlay}
              onChange={(e) => setAutoForwardToOverlay(e.target.checked)}
              disabled={!isLiveStreamActive}
            />
            <span style={{ fontWeight: 600 }}>Auto-Forward to Live Translation & Overlay</span>
          </label>

          <button
            onClick={() => {
              setLatestSpeaker("");
              setLatestMessage("");
              setLatestRawMessage("");
            }}
            disabled={!isLiveStreamActive}
            className="btn-secondary"
            style={{ height: "26px", padding: "0 10px", fontSize: "11px" }}
            title="Clear live stream output"
          >
            <Trash2 size={11} />
            <span>Clear Stream</span>
          </button>
        </div>

        {/* Live Stream Output Box */}
        {!isLiveStreamActive ? (
          <div
            style={{
              padding: "16px 20px",
              backgroundColor: "var(--bg-app)",
              border: "1px dashed var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "12.5px",
            }}
          >
            Live stream forwarding is currently idle. Click <strong>"✨ Set Combined"</strong>, <strong>"💬 Set Dialogue"</strong>, or <strong>"👤 Set Speaker"</strong> on any thread below to activate live streaming.
          </div>
        ) : (
          <div
            style={{
              padding: "12px 16px",
              backgroundColor: "var(--bg-app)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {/* Synchronized Combined Preview */}
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>
              {latestSpeaker ? (
                <span style={{ color: "var(--accent-gold)", fontWeight: 700, fontSize: "14px", whiteSpace: "nowrap" }}>
                  【{latestSpeaker}】
                </span>
              ) : null}
              <span style={{ color: "var(--text-primary)", fontSize: "14px", fontWeight: 600, lineHeight: 1.4 }}>
                {latestMessage || (
                  <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "12.5px" }}>
                    (Waiting for in-game dialogue on active thread...)
                  </span>
                )}
              </span>
            </div>

            {/* RAW vs CLEAN Footnote */}
            {latestRawMessage && (
              <div style={{ display: "flex", gap: "16px", fontSize: "11px", borderTop: "1px solid var(--border-subtle)", paddingTop: "6px" }}>
                <div style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  <span>RAW: </span>
                  <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{latestRawMessage}</span>
                </div>
                <div style={{ color: "var(--accent-success)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  <span>CLEAN: </span>
                  <span style={{ fontWeight: 600 }}>{latestMessage}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6. Dual Column Panel: Detected Threads (Left) & Thread Log Inspector (Right) */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 0.95fr)", gap: "16px", minWidth: 0, width: "100%", boxSizing: "border-box" }}>
        {/* Left Column: Discovered Threads Table with Multi-Role Assignment */}
        <div className="card" style={{ margin: 0, minWidth: 0, width: "100%", boxSizing: "border-box", overflow: "hidden" }}>
          <div className="card-header">
            <div>
              <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Layers size={16} /> Detected Text Threads ({threadList.length})
              </span>
              <span className="card-subtitle">Click card to view thread log. Assign roles with buttons.</span>
            </div>
          </div>

          {threadList.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: "12.5px" }}>
              {isHooked
                ? "Waiting for in-game dialogue... Advance a line in your game or click 'Start Hook Search'."
                : "Attach to a game process above to start discovering hook threads."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "360px", overflowY: "auto", minWidth: 0 }}>
              {threadList.map((thread) => {
                const isCombined = combinedThreadId === thread.id;
                const isMsg = messageThreadId === thread.id;
                const isSpeaker = speakerThreadId === thread.id;
                const isInspected = inspectedThreadId === thread.id;

                let cardBorder = isInspected ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)";
                let cardBg = isInspected ? "rgba(78, 115, 223, 0.12)" : "var(--bg-app)";

                if (isCombined) {
                  cardBorder = "1px solid var(--accent-success)";
                  cardBg = isInspected ? "rgba(46, 160, 67, 0.18)" : "rgba(46, 160, 67, 0.08)";
                } else if (isMsg) {
                  cardBorder = "1px solid var(--accent-primary)";
                  cardBg = isInspected ? "rgba(78, 115, 223, 0.18)" : "rgba(78, 115, 223, 0.08)";
                } else if (isSpeaker) {
                  cardBorder = "1px solid var(--accent-gold)";
                  cardBg = isInspected ? "rgba(255, 193, 7, 0.15)" : "rgba(255, 193, 7, 0.06)";
                }

                return (
                  <div
                    key={thread.id}
                    onClick={() => setInspectedThreadId(thread.id)}
                    style={{
                      padding: "10px 12px",
                      backgroundColor: cardBg,
                      border: cardBorder,
                      borderRadius: "var(--radius-sm)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      minWidth: 0,
                      maxWidth: "100%",
                      boxSizing: "border-box",
                      cursor: "pointer",
                      transition: "all 0.1s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                        <span style={{ fontWeight: 600, fontSize: "12.5px", color: isInspected ? "var(--accent-primary)" : "var(--text-primary)", whiteSpace: "nowrap" }}>
                          #{thread.id} {thread.name}
                        </span>

                        {/* Active Role Badges */}
                        {isCombined && (
                          <span className="badge badge-success" style={{ fontSize: "10px", padding: "1px 6px", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "3px" }}>
                            <Sparkles size={9} /> Combined Auto-Split
                          </span>
                        )}
                        {isMsg && (
                          <span className="badge badge-primary" style={{ fontSize: "10px", padding: "1px 6px", whiteSpace: "nowrap" }}>
                            💬 Dialogue
                          </span>
                        )}
                        {isSpeaker && (
                          <span className="badge badge-warning" style={{ fontSize: "10px", padding: "1px 6px", whiteSpace: "nowrap" }}>
                            👤 Speaker Name
                          </span>
                        )}
                      </div>

                      {/* Role Selector Action Buttons */}
                      <div style={{ display: "flex", gap: "4px", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                        {/* 1. Combined (Auto-Split) Button */}
                        <button
                          type="button"
                          onClick={() => TextractorService.toggleRole(thread.id, "combined")}
                          className={isCombined ? "btn-primary" : "btn-secondary"}
                          style={{
                            padding: "2px 8px",
                            fontSize: "11px",
                            whiteSpace: "nowrap",
                            borderColor: isCombined ? "var(--accent-success)" : undefined,
                            backgroundColor: isCombined ? "var(--accent-success)" : undefined,
                            color: isCombined ? "#fff" : undefined,
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                          }}
                          title="Auto-split Character Name (Speaker) & Dialogue Message from single combined thread"
                        >
                          <Sparkles size={11} />
                          <span>Set Combined</span>
                        </button>

                        {/* 2. Dialogue Button */}
                        <button
                          type="button"
                          onClick={() => TextractorService.toggleRole(thread.id, "message")}
                          className={isMsg ? "btn-primary" : "btn-secondary"}
                          style={{ padding: "2px 8px", fontSize: "11px", whiteSpace: "nowrap" }}
                          title="Assign as main dialogue text stream"
                        >
                          💬 Set Dialogue
                        </button>

                        {/* 3. Speaker Button */}
                        <button
                          type="button"
                          onClick={() => TextractorService.toggleRole(thread.id, "speaker")}
                          className={isSpeaker ? "btn-primary" : "btn-secondary"}
                          style={{
                            padding: "2px 8px",
                            fontSize: "11px",
                            whiteSpace: "nowrap",
                            borderColor: isSpeaker ? "var(--accent-gold)" : undefined,
                            backgroundColor: isSpeaker ? "var(--accent-gold)" : undefined,
                            color: isSpeaker ? "#000" : undefined,
                          }}
                          title="Assign as character / speaker name tag stream"
                        >
                          👤 Set Speaker
                        </button>
                      </div>
                    </div>

                    {/* Hook Code & Metrics */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", minWidth: 0 }}>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "10.5px",
                          backgroundColor: "var(--bg-surface)",
                          color: "var(--accent-cyan)",
                          padding: "1px 6px",
                          borderRadius: "2px",
                          border: "1px solid var(--border-subtle)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "75%",
                        }}
                      >
                        {thread.hookCode}
                      </span>
                      <span className="badge badge-neutral" style={{ fontSize: "10px", flexShrink: 0 }}>
                        {thread.totalLines} lines
                      </span>
                    </div>

                    {/* Last Text Snippet */}
                    <div
                      style={{
                        fontSize: "11.5px",
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        minWidth: 0,
                        maxWidth: "100%",
                        backgroundColor: "rgba(0,0,0,0.2)",
                        padding: "3px 6px",
                        borderRadius: "2px",
                        boxSizing: "border-box",
                      }}
                    >
                      {thread.lastText || "(Waiting for text...)"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Dedicated Thread Log Inspector */}
        <div className="card" style={{ margin: 0, minWidth: 0, width: "100%", boxSizing: "border-box", overflow: "hidden" }}>
          <div className="card-header">
            <div>
              <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <FileText size={16} /> Thread Log {currentInspectedThread ? `(#${currentInspectedThread.id})` : ""}
              </span>
              <span className="card-subtitle">
                {currentInspectedThread
                  ? `${currentInspectedThread.name} — ${currentInspectedThread.hookCode}`
                  : "Select a thread on the left to view detailed line logs"}
              </span>
            </div>
          </div>

          {/* Sub-header Toolbar: Max Lines & Clear Log */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", gap: "8px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Max Lines:</span>
              <select
                value={maxLogLines}
                onChange={(e) => setMaxLogLines(Number(e.target.value))}
                style={{ fontSize: "11px", height: "26px", padding: "0 24px 0 6px" }}
                title="Max log lines to retain"
              >
                <option value={50}>50 Lines</option>
                <option value={100}>100 Lines</option>
                <option value={200}>200 Lines</option>
                <option value={500}>500 Lines</option>
              </select>
            </div>

            <button
              onClick={() => {
                if (inspectedThreadId !== null) {
                  TextractorService.clearLogs(inspectedThreadId);
                }
              }}
              disabled={!currentInspectedThread || currentThreadLogs.length === 0}
              className="btn-secondary"
              style={{ height: "26px", padding: "0 10px", fontSize: "11px" }}
              title="Clear log history for this thread"
            >
              <Trash2 size={11} />
              <span>Clear Log</span>
            </button>
          </div>

          {/* Thread Log Entries List */}
          <div
            style={{
              backgroundColor: "var(--bg-app)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "10px",
              height: "360px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              minWidth: 0,
              boxSizing: "border-box",
            }}
          >
            {currentThreadLogs.length === 0 ? (
              <span style={{ color: "var(--text-muted)", fontSize: "11.5px", margin: "auto" }}>
                {currentInspectedThread
                  ? "No lines recorded for this thread yet."
                  : "Select a thread from the list on the left to view its history."}
              </span>
            ) : (
              currentThreadLogs.map((log, idx) => {
                const clean = executePreprocessingPipeline(log.text);

                return (
                  <div
                    key={`${log.timestamp}_${idx}`}
                    style={{
                      borderBottom: "1px solid var(--border-subtle)",
                      paddingBottom: "6px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)", minWidth: 0 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        [{log.timestamp}] Line #{currentThreadLogs.length - idx}
                      </span>
                      <span style={{ color: "var(--accent-cyan)", flexShrink: 0 }}>{log.hook_code}</span>
                    </div>

                    {/* Raw Text */}
                    <div
                      style={{
                        color: "var(--text-secondary)",
                        fontSize: "11.5px",
                        minWidth: 0,
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                      }}
                    >
                      <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>RAW: </span>
                      {log.text}
                    </div>

                    {/* Clean Preprocessed Text */}
                    <div
                      style={{
                        color: "var(--accent-success)",
                        fontSize: "12px",
                        fontWeight: 600,
                        minWidth: 0,
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                      }}
                    >
                      <span style={{ fontSize: "10px" }}>CLEAN: </span>
                      {clean}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
