import React, { useState, useEffect } from "react";
import {
  Crosshair,
  Activity,
  AlertCircle,
  FolderSearch,
  Sliders,
  Trash2,
  Camera,
  Play,
  Square,
  Monitor,
  Zap,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Filter,
  X,
} from "lucide-react";
import { OcrRegion, OcrRegionRole, MonitorInfo } from "../../types";
import { OcrService } from "../../services/ocrService";
import { formatMonitorLabel } from "../../utils/monitorUtils";
import { invoke } from "@tauri-apps/api/core";
import { useOcrStore } from "../../stores/useOcrStore";

interface OcrInputViewProps {
  onOpenPreprocessingSettings?: () => void;
}

export const OcrInputView: React.FC<OcrInputViewProps> = ({
  onOpenPreprocessingSettings,
}) => {
  // Pull state from Zustand store
  const {
    engineStatus,
    isScanning,
    regions,
    scalePercent,
    scanInterval,
    targetMonitor,
    customPath,
    enableMotionDetection,
    settleTimeMs,
    motionSensitivity,
    ignoreBlinkingPrompt,
    latestSpeaker,
    latestMessage,
    latestRawText,
    latencyMs,
    isSettled,
    scanError,
    regionSnapshots,
    isLoadingSnapshot,
    setRegions,
    setScalePercent,
    setScanInterval,
    setTargetMonitor,
    setCustomPath,
    setEnableMotionDetection,
    setSettleTimeMs,
    setMotionSensitivity,
    setIgnoreBlinkingPrompt,
    resetScanResult,
  } = useOcrStore();

  const [isCheckingEngine, setIsCheckingEngine] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([
    { name: "Monitor 1 (Primary)", width: 1920, height: 1080, x: 0, y: 0, scale_factor: 1.0, is_primary: true },
  ]);

  // Check OneOCR engine status
  const checkEngine = async (path?: string) => {
    setIsCheckingEngine(true);
    await OcrService.detectOneOcrPath(path !== undefined ? path : customPath);
    setIsCheckingEngine(false);
  };

  const refreshSnapshots = async (targetRegions: OcrRegion[] = regions) => {
    if (targetRegions.length === 0) return;
    await OcrService.captureRegionsPreview(targetRegions);
  };

  useEffect(() => {
    checkEngine();
    refreshSnapshots();
  }, []);

  // Load monitors from Tauri backend and sync OCR regions across windows
  useEffect(() => {
    invoke<MonitorInfo[]>("get_monitors")
      .then((m) => {
        if (m && m.length > 0) {
          setMonitors(m);
          if (!targetMonitor || targetMonitor === "monitor_1") {
            const primary = m.find((item) => item.is_primary) || m[0];
            setTargetMonitor(primary.name);
          }
        }
      })
      .catch(() => {});

    const channel = new BroadcastChannel("vn_ocr_channel");
    channel.onmessage = (event) => {
      if (event.data?.type === "REGIONS_UPDATED" && Array.isArray(event.data?.regions)) {
        setRegions(event.data.regions);
        refreshSnapshots(event.data.regions);
      }
    };

    const handleFocus = () => {
      try {
        const saved = localStorage.getItem("vn_ocr_regions");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRegions(parsed);
            refreshSnapshots(parsed);
          }
        }
      } catch {}
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      channel.close();
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // Open Region Selector Overlay Window on selected target monitor
  const handleOpenSelector = async () => {
    await OcrService.openRegionSelector(targetMonitor);
  };

  // Swap / Toggle OCR Region Role
  const handleToggleRegionRole = (id: string) => {
    setRegions((prev) => {
      return prev.map((r) => {
        if (r.id === id) {
          const nextRole: OcrRegionRole = r.role === "dialogue" ? "speaker" : "dialogue";
          const nextName = nextRole === "dialogue" ? "Dialogue Region" : "Speaker Region";
          const nextColor = nextRole === "dialogue" ? "#4e73df" : "#f6c23e";
          return { ...r, role: nextRole, name: nextName, color: nextColor };
        }
        return r;
      });
    });
  };

  // Delete Region
  const handleDeleteRegion = (id: string) => {
    setRegions((prev) => prev.filter((r) => r.id !== id));
  };

  const toggleAutoScan = () => {
    if (isScanning) {
      OcrService.stopAutoScan();
      refreshSnapshots();
    } else {
      OcrService.startAutoScan();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", width: "100%", minWidth: 0 }}>
      {/* ========================================================================= */}
      {/* 1. QUICK CONTROL & SCREEN CAPTURE BAR                                     */}
      {/* ========================================================================= */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header" style={{ paddingBottom: "10px" }}>
          <div>
            <span className="card-title">
              <Crosshair size={16} color="var(--accent-primary)" /> Screen OCR Capture
            </span>
            <span className="card-subtitle">
              Capture text from on-screen bounding boxes using Microsoft OneOCR
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {engineStatus.isAvailable ? (
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
                OneOCR Ready
              </span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  color: "var(--accent-danger)",
                  backgroundColor: "rgba(248, 81, 73, 0.12)",
                  border: "1px solid rgba(248, 81, 73, 0.3)",
                  padding: "3px 8px",
                  borderRadius: "20px",
                }}
              >
                <AlertCircle size={12} />
                OneOCR Missing
              </span>
            )}
          </div>
        </div>

        {/* Action Controls Row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
          {/* Target Monitor Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: "1 1 240px", minWidth: "200px" }}>
            <Monitor size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <select
              value={targetMonitor}
              onChange={(e) => setTargetMonitor(e.target.value)}
              style={{ width: "100%", height: "34px", fontSize: "12px" }}
              title="Select target display monitor for bounding box capture"
            >
              {monitors.map((m, idx) => (
                <option key={m.name || idx} value={m.name}>
                  {formatMonitorLabel(m)}
                </option>
              ))}
            </select>
          </div>

          {/* Select Region on Screen Button */}
          <button
            onClick={handleOpenSelector}
            className="btn-primary"
            style={{ height: "34px", padding: "0 14px", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}
            title="Launch full-screen crosshair overlay to select dialogue box"
          >
            <Crosshair size={13} />
            <span>Select Region on Screen</span>
          </button>

          {/* Refresh Snapshot Preview Button */}
          <button
            onClick={() => refreshSnapshots()}
            disabled={isLoadingSnapshot || regions.length === 0}
            className="btn-secondary"
            style={{ height: "34px", padding: "0 12px", fontSize: "12px", whiteSpace: "nowrap" }}
            title="Capture fresh cropped snapshot preview"
          >
            <Camera size={13} className={isLoadingSnapshot ? "spin" : ""} />
            <span>Refresh Preview</span>
          </button>

          {/* Start / Stop Auto Scan Master Button */}
          <button
            onClick={toggleAutoScan}
            disabled={!engineStatus.isAvailable || regions.length === 0}
            className={isScanning ? "btn-danger" : "btn-primary"}
            style={{
              height: "34px",
              padding: "0 18px",
              fontSize: "12.5px",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {isScanning ? <Square size={13} /> : <Play size={13} />}
            <span>{isScanning ? "Stop OCR Auto-Scan" : "Start OCR Auto-Scan"}</span>
          </button>
        </div>

        {scanError && (
          <div
            style={{
              marginTop: "10px",
              padding: "8px 12px",
              backgroundColor: "rgba(248, 81, 73, 0.12)",
              border: "1px solid var(--accent-danger)",
              borderRadius: "var(--radius-sm)",
              color: "var(--accent-danger)",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span>OCR Error: {scanError}</span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. LIVE STREAM INSPECTOR & CAPTURED REGIONS (2-Tier Output)               */}
      {/* ========================================================================= */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Activity size={16} color="var(--accent-success)" /> Live Stream Inspector & OCR Regions ({regions.length})
            </span>
            <span className="card-subtitle">
              Manage screen bounding boxes and preview real-time recognized dialogue
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
              onClick={() => resetScanResult()}
              disabled={!latestMessage && !latestSpeaker}
              className="btn-secondary"
              style={{ height: "28px", padding: "0 8px", fontSize: "11px" }}
              title="Clear live OCR output buffer"
            >
              <Trash2 size={11} />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Captured Regions List */}
        {regions.length === 0 ? (
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
            No screen regions configured yet. Click <strong>Select Region on Screen</strong> above to drag and select game dialogue areas.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "8px", marginBottom: "12px" }}>
            {regions.map((region) => (
              <div
                key={region.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 10px",
                  backgroundColor: region.role === "dialogue" ? "rgba(88, 166, 255, 0.08)" : "rgba(255, 193, 7, 0.08)",
                  border: `1px solid ${region.role === "dialogue" ? "rgba(88, 166, 255, 0.4)" : "rgba(255, 193, 7, 0.4)"}`,
                  borderRadius: "var(--radius-sm)",
                  gap: "10px",
                }}
              >
                {/* Left: Thumbnail & Info */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}>
                  {/* Thumbnail Preview */}
                  <div
                    style={{
                      width: "48px",
                      height: "32px",
                      backgroundColor: "rgba(0, 0, 0, 0.4)",
                      borderRadius: "3px",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid var(--border-subtle)",
                      flexShrink: 0,
                    }}
                  >
                    {regionSnapshots[region.id] ? (
                      <img
                        src={regionSnapshots[region.id]}
                        alt={region.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <Camera size={12} color="var(--text-muted)" />
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <span
                        style={{
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          backgroundColor: region.role === "dialogue" ? "var(--accent-primary)" : "var(--accent-warning)",
                        }}
                      />
                      <strong style={{ fontSize: "12px", color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                        {region.name}
                      </strong>
                    </div>
                    <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                      {Math.round(region.width)}x{Math.round(region.height)}px
                    </span>
                  </div>
                </div>

                {/* Right: Role Toggle & Delete */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => handleToggleRegionRole(region.id)}
                    className="btn-secondary"
                    style={{ height: "24px", padding: "0 6px", fontSize: "11px", display: "flex", alignItems: "center", gap: "3px" }}
                    title="Toggle role between Dialogue and Speaker"
                  >
                    <ArrowLeftRight size={10} />
                    <span>{region.role === "dialogue" ? "💬 Dialogue" : "👤 Speaker"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteRegion(region.id)}
                    style={{ background: "none", border: "none", color: "var(--accent-danger)", cursor: "pointer", padding: "3px" }}
                    title="Delete Region"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
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
          {/* Top Tier: Intercepted RAW Stream + Latency/Settled Badges */}
          <div
            style={{
              padding: "6px 12px",
              backgroundColor: "rgba(0, 0, 0, 0.25)",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              fontSize: "11.5px",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.5px", flexShrink: 0 }}>
                RAW INTERCEPT:
              </span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {latestRawText || "(no OCR text captured yet)"}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                {latencyMs}ms
              </span>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: "10px",
                  backgroundColor: isSettled ? "rgba(63, 185, 80, 0.15)" : "rgba(210, 153, 34, 0.15)",
                  color: isSettled ? "var(--accent-success)" : "var(--accent-gold)",
                  border: `1px solid ${isSettled ? "rgba(63, 185, 80, 0.3)" : "rgba(210, 153, 34, 0.3)"}`,
                }}
              >
                {isSettled ? "Settled" : "Typewriting..."}
              </span>
            </div>
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
                  {isScanning ? "(Scanning screen regions for text...)" : "(OCR Auto-Scan is stopped)"}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. ADVANCED OCR SETTINGS (Categorized Collapsible Accordion)               */}
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
              Advanced OCR Settings
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "12px" }}>
            <span>{showAdvanced ? "Hide" : "Expand"}</span>
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>

        {showAdvanced && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "14px", borderTop: "1px solid var(--border-subtle)", paddingTop: "14px" }}>
            {/* Category 1: OneOCR Engine Binary Path */}
            <div style={{ backgroundColor: "var(--bg-app)", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                <FolderOpen size={13} color="var(--accent-primary)" />
                <span>Microsoft OneOCR Engine Installation</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", alignItems: "flex-end" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                    OneOCR Directory / DLL Path (Auto-detected from WindowsApps)
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-detected from WindowsApps or specify custom directory..."
                    value={customPath || engineStatus.dllPath || ""}
                    onChange={(e) => {
                      setCustomPath(e.target.value);
                      checkEngine(e.target.value);
                    }}
                    style={{ width: "100%", fontSize: "11.5px", fontFamily: "var(--font-mono)" }}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => checkEngine(customPath)}
                  disabled={isCheckingEngine}
                  className="btn-secondary"
                  style={{ padding: "6px 14px", fontSize: "11.5px", whiteSpace: "nowrap" }}
                >
                  <FolderSearch size={12} className={isCheckingEngine ? "spin" : ""} />
                  <span>Verify Path</span>
                </button>
              </div>

              {engineStatus.error && (
                <div style={{ marginTop: "8px", padding: "6px 10px", backgroundColor: "rgba(248, 81, 73, 0.1)", border: "1px solid var(--accent-danger)", borderRadius: "var(--radius-sm)", color: "var(--accent-danger)", fontSize: "11.5px" }}>
                  {engineStatus.error}
                </div>
              )}
            </div>

            {/* Category 2: Motion Detection & Stability Tuning */}
            <div style={{ backgroundColor: "var(--bg-app)", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                <Zap size={13} color="var(--accent-gold)" />
                <span>Motion Detection & Scan Frequency Tuning</span>
              </div>

              {/* Sliders Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
                {/* Scan Interval */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-muted)" }}>Capture Interval</label>
                    <strong style={{ fontSize: "11px", color: "var(--accent-primary)" }}>{scanInterval} ms</strong>
                  </div>
                  <input
                    type="range"
                    min={100}
                    max={1000}
                    step={50}
                    value={scanInterval}
                    onChange={(e) => setScanInterval(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </div>

                {/* Settle Time */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-muted)" }}>Typewriter Settle Delay</label>
                    <strong style={{ fontSize: "11px", color: "var(--accent-cyan)" }}>{settleTimeMs} ms</strong>
                  </div>
                  <input
                    type="range"
                    min={100}
                    max={800}
                    step={50}
                    value={settleTimeMs}
                    onChange={(e) => setSettleTimeMs(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </div>

                {/* Motion Sensitivity */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-muted)" }}>Motion Sensitivity</label>
                    <strong style={{ fontSize: "11px", color: "var(--accent-gold)" }}>Level {motionSensitivity}</strong>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={motionSensitivity}
                    onChange={(e) => setMotionSensitivity(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </div>

                {/* Resolution Scale */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-muted)" }}>OCR Resolution Scale</label>
                    <strong style={{ fontSize: "11px", color: "var(--accent-success)" }}>{scalePercent}%</strong>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={200}
                    step={25}
                    value={scalePercent}
                    onChange={(e) => setScalePercent(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              {/* Toggles */}
              <div style={{ display: "flex", gap: "16px", marginTop: "12px", flexWrap: "wrap", borderTop: "1px solid var(--border-subtle)", paddingTop: "10px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", cursor: "pointer", color: "var(--text-secondary)" }}>
                  <input
                    type="checkbox"
                    checked={enableMotionDetection}
                    onChange={(e) => setEnableMotionDetection(e.target.checked)}
                  />
                  <span>Enable Typewriter Motion Detection</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", cursor: "pointer", color: "var(--text-secondary)" }}>
                  <input
                    type="checkbox"
                    checked={ignoreBlinkingPrompt}
                    onChange={(e) => setIgnoreBlinkingPrompt(e.target.checked)}
                  />
                  <span>Ignore Blinking Prompt Cursor (▼/▲)</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
