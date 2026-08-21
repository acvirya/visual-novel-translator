import React, { useState, useEffect } from "react";
import {
  Scan,
  Crosshair,
  Activity,
  CheckCircle2,
  AlertCircle,
  FolderSearch,
  RefreshCw,
  Sliders,
  Trash2,
  Camera,
  Play,
  Square,
  Monitor,
  Zap,
  ArrowLeftRight,
} from "lucide-react";
import { OcrRegion, OcrRegionRole, MonitorInfo } from "../../types";
import { OcrService } from "../../services/ocrService";
import { formatMonitorLabel } from "../../utils/monitorUtils";
import { invoke } from "@tauri-apps/api/core";
import { useOcrStore } from "../../stores/useOcrStore";

export const OcrInputView: React.FC = () => {
  // Pull state from Zustand store
  const {
    engineStatus,
    isScanning,
    regions,
    scalePercent,
    scanInterval,
    targetMonitor,
    customPath,
    autoForwardToOverlay,
    enableMotionDetection,
    settleTimeMs,
    motionSensitivity,
    ignoreBlinkingPrompt,
    latestSpeaker,
    latestMessage,
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
    setAutoForwardToOverlay,
    setEnableMotionDetection,
    setSettleTimeMs,
    setMotionSensitivity,
    setIgnoreBlinkingPrompt,
  } = useOcrStore();

  const [isCheckingEngine, setIsCheckingEngine] = useState<boolean>(false);
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

  // Load monitors from Tauri backend
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
  }, []);

  // Open Region Selector Overlay Window on selected target monitor
  const handleOpenSelector = async () => {
    await OcrService.openRegionSelector(targetMonitor);
  };

  // Swap / Toggle OCR Region Role
  const handleToggleRegionRole = (id: string) => {
    setRegions((prev) => {
      if (prev.length === 2) {
        return prev.map((r) => {
          const nextRole: OcrRegionRole = r.role === "dialogue" ? "speaker" : "dialogue";
          const nextName = nextRole === "dialogue" ? "Dialogue Region" : "Speaker Region";
          const nextColor = nextRole === "dialogue" ? "#4e73df" : "#f6c23e";
          return { ...r, role: nextRole, name: nextName, color: nextColor };
        });
      } else {
        return prev.map((r) => {
          if (r.id === id) {
            const nextRole: OcrRegionRole = r.role === "dialogue" ? "speaker" : "dialogue";
            const nextName = nextRole === "dialogue" ? "Dialogue Region" : "Speaker Region";
            const nextColor = nextRole === "dialogue" ? "#4e73df" : "#f6c23e";
            return { ...r, role: nextRole, name: nextName, color: nextColor };
          }
          return r;
        });
      }
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
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      {/* 1. Header: OneOCR Engine Status & Path Configuration */}
      <div className="card" style={{ margin: 0, minWidth: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Scan size={16} color="var(--accent-primary)" /> Microsoft OneOCR Engine
            </span>
            <span className="card-subtitle">
              High-accuracy offline OCR extracted from Windows 11 Snipping Tool
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {engineStatus.isAvailable ? (
              <span className="badge badge-success" style={{ height: "32px", padding: "0 10px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <CheckCircle2 size={13} /> Ready
              </span>
            ) : (
              <span className="badge badge-danger" style={{ height: "32px", padding: "0 10px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <AlertCircle size={13} /> Missing
              </span>
            )}

            <button
              onClick={() => checkEngine()}
              disabled={isCheckingEngine}
              className="btn-secondary"
              style={{ height: "32px", padding: "0 12px", fontSize: "12px" }}
              title="Rescan Snipping Tool directory"
            >
              <RefreshCw size={12} className={isCheckingEngine ? "spin" : ""} />
              <span>Detect Path</span>
            </button>
          </div>
        </div>

        {/* Engine Path Details & Custom Input */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "10px", alignItems: "center" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              OneOCR Installation Path
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Auto-detected from WindowsApps or specify custom directory..."
              value={customPath || engineStatus.dllPath || ""}
              onChange={(e) => {
                setCustomPath(e.target.value);
                checkEngine(e.target.value);
              }}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ display: "flex", gap: "6px", marginTop: "18px" }}>
            <button
              onClick={() => checkEngine(customPath)}
              className="btn-secondary"
              style={{ height: "32px", padding: "0 12px", fontSize: "12px" }}
            >
              <FolderSearch size={13} />
              <span>Verify Path</span>
            </button>
          </div>
        </div>

        {engineStatus.error && (
          <div style={{ marginTop: "10px", padding: "8px 12px", backgroundColor: "rgba(231, 74, 59, 0.1)", border: "1px solid var(--accent-danger)", borderRadius: "var(--radius-sm)", color: "var(--accent-danger)", fontSize: "12px" }}>
            {engineStatus.error}
          </div>
        )}
      </div>

      {/* 2. Target Monitor, Regions Configuration & Precision Overlay Launcher */}
      <div className="card" style={{ margin: 0, minWidth: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Crosshair size={16} color="var(--accent-cyan)" /> Screen Capture Regions
            </span>
            <span className="card-subtitle">
              Configure dialogue & speaker bounding boxes for OCR extraction
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              onClick={() => refreshSnapshots()}
              disabled={isLoadingSnapshot}
              className="btn-secondary"
              style={{ height: "32px", padding: "0 12px", fontSize: "12px" }}
              title="Capture fresh cropped snapshot previews"
            >
              <Camera size={13} className={isLoadingSnapshot ? "spin" : ""} />
              <span>Refresh Preview</span>
            </button>

            <button
              onClick={handleOpenSelector}
              className="btn-primary"
              style={{ height: "32px", padding: "0 14px", fontSize: "12px" }}
              title="Launch full-screen crosshair overlay to drag & select game dialogue area"
            >
              <Crosshair size={13} />
              <span>Select Region on Screen</span>
            </button>
          </div>
        </div>

        {/* Target Monitor Selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
          <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Monitor size={14} /> Target Display:
          </label>
          <select
            className="input-field"
            value={targetMonitor}
            onChange={(e) => setTargetMonitor(e.target.value)}
            style={{ padding: "4px 8px", fontSize: "12px", minWidth: "220px" }}
          >
            {monitors.map((m, idx) => (
              <option key={m.name || idx} value={m.name}>
                {formatMonitorLabel(m)}
              </option>
            ))}
          </select>
        </div>

        {/* Regions Grid List */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "12px" }}>
          {regions.map((region) => (
            <div
              key={region.id}
              style={{
                backgroundColor: "var(--bg-surface-elevated)",
                border: `1px solid ${region.role === "dialogue" ? "var(--accent-primary)" : "var(--accent-warning)"}`,
                borderRadius: "var(--radius-md)",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      backgroundColor: region.color || (region.role === "dialogue" ? "#4e73df" : "#f6c23e"),
                    }}
                  />
                  <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>{region.name}</strong>
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    onClick={() => handleToggleRegionRole(region.id)}
                    className="btn-secondary"
                    style={{ height: "26px", padding: "0 8px", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}
                    title="Toggle role between Dialogue and Speaker"
                  >
                    <ArrowLeftRight size={11} />
                    <span>{region.role === "dialogue" ? "Dialogue" : "Speaker"}</span>
                  </button>

                  <button
                    onClick={() => handleDeleteRegion(region.id)}
                    className="btn-secondary"
                    style={{ height: "26px", padding: "0 6px", color: "var(--accent-danger)" }}
                    title="Delete Region"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Coordinates summary */}
              <div style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", gap: "10px" }}>
                <span>X: {Math.round(region.x)}px</span>
                <span>Y: {Math.round(region.y)}px</span>
                <span>W: {Math.round(region.width)}px</span>
                <span>H: {Math.round(region.height)}px</span>
              </div>

              {/* Cropped Preview Thumbnail */}
              <div
                style={{
                  height: "70px",
                  backgroundColor: "rgba(0,0,0,0.5)",
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px dashed var(--border-subtle)",
                }}
              >
                {regionSnapshots[region.id] ? (
                  <img
                    src={regionSnapshots[region.id]}
                    alt={region.name}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    No snapshot captured
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Motion Detection, Settle Stability & OCR Interval Tuner */}
      <div className="card" style={{ margin: 0, minWidth: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Sliders size={16} color="var(--accent-gold)" /> Scan Frequency & Stability
            </span>
            <span className="card-subtitle">
              Motion detection ignores typewriter animations and triggers OCR only once text settles
            </span>
          </div>

          {/* Master Start / Stop OCR Scan Toggle */}
          <button
            onClick={toggleAutoScan}
            disabled={!engineStatus.isAvailable}
            className={isScanning ? "btn-secondary" : "btn-primary"}
            style={{
              height: "36px",
              padding: "0 18px",
              fontSize: "13px",
              backgroundColor: isScanning ? "var(--accent-danger)" : undefined,
              borderColor: isScanning ? "var(--accent-danger)" : undefined,
            }}
          >
            {isScanning ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            <span>{isScanning ? "Stop OCR Auto-Scan" : "Start OCR Auto-Scan"}</span>
          </button>
        </div>

        {/* Sliders Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
          {/* Scan Interval */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Capture Interval</label>
              <strong style={{ fontSize: "12px", color: "var(--accent-primary)" }}>{scanInterval} ms</strong>
            </div>
            <input
              type="range"
              min={100}
              max={1000}
              step={50}
              value={scanInterval}
              onChange={(e) => setScanInterval(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--accent-primary)" }}
            />
          </div>

          {/* Settle Time */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Typewriter Settle Delay</label>
              <strong style={{ fontSize: "12px", color: "var(--accent-cyan)" }}>{settleTimeMs} ms</strong>
            </div>
            <input
              type="range"
              min={100}
              max={800}
              step={50}
              value={settleTimeMs}
              onChange={(e) => setSettleTimeMs(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--accent-cyan)" }}
            />
          </div>

          {/* Motion Sensitivity */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Motion Sensitivity</label>
              <strong style={{ fontSize: "12px", color: "var(--accent-gold)" }}>Level {motionSensitivity}</strong>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={motionSensitivity}
              onChange={(e) => setMotionSensitivity(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--accent-gold)" }}
            />
          </div>

          {/* Resolution Scale */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>OCR Resolution Scale</label>
              <strong style={{ fontSize: "12px", color: "var(--accent-success)" }}>{scalePercent}%</strong>
            </div>
            <input
              type="range"
              min={50}
              max={200}
              step={25}
              value={scalePercent}
              onChange={(e) => setScalePercent(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--accent-success)" }}
            />
          </div>
        </div>

        {/* Checkbox Options */}
        <div style={{ display: "flex", gap: "16px", marginTop: "14px", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer", color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={enableMotionDetection}
              onChange={(e) => setEnableMotionDetection(e.target.checked)}
            />
            <span>Enable Typewriter Motion Detection</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer", color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={ignoreBlinkingPrompt}
              onChange={(e) => setIgnoreBlinkingPrompt(e.target.checked)}
            />
            <span>Ignore Blinking Prompt Cursor (▼/▲)</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer", color: "var(--accent-cyan)" }}>
            <input
              type="checkbox"
              checked={autoForwardToOverlay}
              onChange={(e) => setAutoForwardToOverlay(e.target.checked)}
            />
            <span>Auto-Forward to Live Translation & Overlay</span>
          </label>
        </div>
      </div>

      {/* 4. Live Stream Output & Latency Monitor */}
      <div className="card" style={{ margin: 0, minWidth: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Activity size={16} color="var(--accent-success)" /> Live Recognized Output
            </span>
            <span className="card-subtitle">
              Live text recognized by OneOCR pipeline in real-time
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="badge badge-secondary" style={{ padding: "4px 10px", fontSize: "11.5px" }}>
              <Zap size={12} /> Latency: {latencyMs}ms
            </span>
            <span className={`badge ${isSettled ? "badge-success" : "badge-warning"}`} style={{ padding: "4px 10px", fontSize: "11.5px" }}>
              {isSettled ? "Settled" : "Typewriting..."}
            </span>
          </div>
        </div>

        {scanError && (
          <div style={{ marginBottom: "10px", padding: "8px 12px", backgroundColor: "rgba(231, 74, 59, 0.1)", border: "1px solid var(--accent-danger)", borderRadius: "var(--radius-sm)", color: "var(--accent-danger)", fontSize: "12px" }}>
            Scan Error: {scanError}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
          {latestSpeaker && (
            <div style={{ padding: "8px 12px", backgroundColor: "var(--bg-surface-elevated)", borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--accent-gold)" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>Speaker:</span>
              <strong style={{ fontSize: "14px", color: "var(--accent-gold)" }}>{latestSpeaker}</strong>
            </div>
          )}

          <div style={{ padding: "10px 14px", backgroundColor: "var(--bg-surface-elevated)", borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--accent-primary)", minHeight: "50px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>Dialogue:</span>
            <span style={{ fontSize: "14px", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
              {latestMessage || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Waiting for dialogue text...</span>}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
