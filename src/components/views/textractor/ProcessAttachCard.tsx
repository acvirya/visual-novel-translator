import React, { useState, useRef, useEffect } from "react";
import {
  Zap,
  FolderOpen,
  Search,
  X,
  Check,
  RefreshCw,
  Play,
  Square,
  XCircle,
} from "lucide-react";
import { TextractorProcessInfo } from "../../../types";

interface ProcessAttachCardProps {
  exePath: string;
  onExePathChange: (path: string) => void;
  onDetectExePath: () => void;
  isSearchingExe: boolean;
  arch: "x86" | "x64";
  onSelectArch: (arch: "x86" | "x64") => void;
  isHooked: boolean;
  isAttaching: boolean;
  attachedPid: number | null;
  selectedPid: number | null;
  selectedProcess: TextractorProcessInfo | undefined;
  processes: TextractorProcessInfo[];
  isLoadingProcesses: boolean;
  onRefreshProcesses: () => void;
  onSelectPid: (pid: number | null) => void;
  onAttach: () => void;
  onDetach: () => void;
  hookError: string | null;
}

export const ProcessAttachCard: React.FC<ProcessAttachCardProps> = ({
  exePath,
  onExePathChange,
  onDetectExePath,
  isSearchingExe,
  arch,
  onSelectArch,
  isHooked,
  isAttaching,
  attachedPid,
  selectedPid,
  selectedProcess,
  processes,
  isLoadingProcesses,
  onRefreshProcesses,
  onSelectPid,
  onAttach,
  onDetach,
  hookError,
}) => {
  const [isProcessDropdownOpen, setIsProcessDropdownOpen] = useState(false);
  const [processSearchQuery, setProcessSearchQuery] = useState("");
  const processDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicked outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        processDropdownRef.current &&
        !processDropdownRef.current.contains(event.target as Node)
      ) {
        setIsProcessDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredProcesses = processes.filter((p) => {
    const query = processSearchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(query) ||
      p.window_title.toLowerCase().includes(query) ||
      p.pid.toString().includes(query)
    );
  });

  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="card-header">
        <div>
          <span className="card-title">
            <Zap size={16} /> 1. Textractor Executable & Game Process
          </span>
          <span className="card-subtitle">
            Attach Textractor CLI to your running Visual Novel game
          </span>
        </div>

        {isHooked && (
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
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: "#3fb950",
              }}
            />
            Hook Active (PID: {attachedPid})
          </span>
        )}
      </div>

      {/* Textractor Executable Path Row */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
        <input
          type="text"
          placeholder="Path to TextractorCLI.exe (e.g. C:\Games\Textractor\x86\TextractorCLI.exe)"
          value={exePath}
          onChange={(e) => onExePathChange(e.target.value)}
          disabled={isHooked}
          style={{ flex: 1, fontSize: "12px", height: "34px" }}
        />
        <button
          type="button"
          onClick={onDetectExePath}
          disabled={isHooked || isSearchingExe}
          className="btn-secondary"
          style={{ height: "34px", padding: "0 12px", fontSize: "12px", whiteSpace: "nowrap" }}
          title="Auto-detect Textractor directory or pick file"
        >
          <FolderOpen size={13} className={isSearchingExe ? "spin" : ""} />
          <span>{isSearchingExe ? "Scanning..." : "Browse / Auto-Detect"}</span>
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
        {/* Searchable Process Picker */}
        <div
          ref={processDropdownRef}
          style={{ position: "relative", flex: "1 1 280px", minWidth: "220px" }}
        >
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Search
              size={14}
              style={{
                position: "absolute",
                left: "10px",
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              placeholder={
                selectedProcess
                  ? `"${selectedProcess.window_title}" (${selectedProcess.name} - PID: ${selectedProcess.pid})`
                  : "Click or type to search game window..."
              }
              value={
                isProcessDropdownOpen
                  ? processSearchQuery
                  : selectedProcess
                  ? `"${selectedProcess.window_title}" — ${selectedProcess.name} (PID: ${selectedProcess.pid})`
                  : ""
              }
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
                  onSelectPid(null);
                  setProcessSearchQuery("");
                }}
                style={{
                  position: "absolute",
                  right: "8px",
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "2px",
                }}
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
                        onSelectPid(p.pid);
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
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
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
          onClick={onRefreshProcesses}
          disabled={isLoadingProcesses || isHooked}
          className="btn-secondary"
          style={{ height: "34px", padding: "0 12px", fontSize: "12px", whiteSpace: "nowrap" }}
          title="Refresh running game processes"
        >
          <RefreshCw size={13} className={isLoadingProcesses ? "spin" : ""} />
          <span>Refresh</span>
        </button>

        {/* Architecture Switcher Toggle */}
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
            onClick={() => onSelectArch("x86")}
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
            onClick={() => onSelectArch("x64")}
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
            onClick={onAttach}
            disabled={isAttaching || !selectedPid}
            className="btn-primary"
            style={{ height: "34px", padding: "0 18px", whiteSpace: "nowrap", fontWeight: 600 }}
          >
            {isAttaching ? <RefreshCw size={13} className="spin" /> : <Play size={13} />}
            <span>{isAttaching ? "Attaching..." : "Attach Hook"}</span>
          </button>
        ) : (
          <button
            onClick={onDetach}
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
  );
};
