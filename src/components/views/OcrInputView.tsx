import React, { useState, useEffect, useRef } from "react";
import {
  Scan,
  Crosshair,
  Activity,
  CheckCircle2,
  AlertCircle,
  FolderSearch,
  RefreshCw,
  Sliders,
  MessageSquare,
  User,
  Trash2,
  Camera,
  Play,
  Square,
  Monitor,
} from "lucide-react";
import { OcrRegion, OcrEngineStatus, OcrRegionRole, MonitorInfo } from "../../types";
import { OcrService } from "../../services/ocrService";
import { overlayChannel } from "../../utils/overlayChannel";
import { executePreprocessingPipeline } from "../../utils/textPreprocessor";
import { invoke } from "@tauri-apps/api/core";

export const OcrInputView: React.FC = () => {
  // Engine Configuration & Status
  const [engineStatus, setEngineStatus] = useState<OcrEngineStatus>({
    isAvailable: false,
    dllPath: "",
    modelPath: "",
  });
  const [isCheckingEngine, setIsCheckingEngine] = useState<boolean>(false);
  const [customPath, setCustomPath] = useState<string>(() => {
    return localStorage.getItem("vn_ocr_custom_path") || "";
  });

  // Monitors configuration
  const [monitors, setMonitors] = useState<MonitorInfo[]>([
    { name: "Monitor 1 (Primary)", width: 1920, height: 1080, x: 0, y: 0, scale_factor: 1.0, is_primary: true },
  ]);
  const [targetMonitor, setTargetMonitor] = useState<string>(() => {
    return localStorage.getItem("vn_ocr_target_monitor") || "monitor_1";
  });

  // Regions Configuration (Max 2 Regions: Dialogue / Speaker)
  const [regions, setRegions] = useState<OcrRegion[]>(() => {
    try {
      const saved = localStorage.getItem("vn_ocr_regions");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("Failed to load regions:", e);
    }
    return [
      {
        id: "region_1",
        name: "Region 1 (Dialogue)",
        role: "dialogue",
        x: 350,
        y: 750,
        width: 1220,
        height: 250,
        color: "#4e73df",
      },
      {
        id: "region_2",
        name: "Region 2 (Speaker)",
        role: "speaker",
        x: 350,
        y: 690,
        width: 320,
        height: 55,
        color: "#f6c23e",
      },
    ];
  });

  // Resolution Scale % (Preset Slider 25% - 200%, default 100%)
  const [scalePercent, setScalePercent] = useState<number>(() => {
    const saved = localStorage.getItem("vn_ocr_scale_percent");
    return saved ? Number(saved) : 100;
  });

  // Auto-Scan Loop & Interval
  const [isOcrActive, setIsOcrActive] = useState<boolean>(false);
  const [scanInterval, setScanInterval] = useState<number>(500);
  const [autoForwardToOverlay, setAutoForwardToOverlay] = useState<boolean>(true);
  const [ignoreDuplicates, setIgnoreDuplicates] = useState<boolean>(true);

  // Inactive Mode Snapshot Previews
  const [regionSnapshots, setRegionSnapshots] = useState<{ [regionId: string]: string }>({});
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState<boolean>(false);

  // Active Mode OCR Stream Result
  const [latestSpeaker, setLatestSpeaker] = useState<string>("");
  const [latestMessage, setLatestMessage] = useState<string>("");
  const [latestRawText, setLatestRawText] = useState<string>("");
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [scanError, setScanError] = useState<string | null>(null);

  // Single-Slot Overwriting Queue Refs
  const isOcrActiveRef = useRef<boolean>(false);
  const regionsRef = useRef<OcrRegion[]>(regions);
  const scalePercentRef = useRef<number>(scalePercent);
  const customPathRef = useRef<string>(customPath);
  const ignoreDuplicatesRef = useRef<boolean>(ignoreDuplicates);
  const autoForwardRef = useRef<boolean>(autoForwardToOverlay);
  const lastRecognizedTextRef = useRef<{ speaker: string; message: string }>({ speaker: "", message: "" });
  const scanLoopTimerRef = useRef<any>(null);

  const isProcessingRef = useRef<boolean>(false);
  const pendingTaskRef = useRef<boolean>(false);

  isOcrActiveRef.current = isOcrActive;
  regionsRef.current = regions;
  scalePercentRef.current = scalePercent;
  customPathRef.current = customPath;
  ignoreDuplicatesRef.current = ignoreDuplicates;
  autoForwardRef.current = autoForwardToOverlay;

  // Persist settings
  useEffect(() => {
    localStorage.setItem("vn_ocr_regions", JSON.stringify(regions));
  }, [regions]);

  useEffect(() => {
    localStorage.setItem("vn_ocr_scale_percent", String(scalePercent));
  }, [scalePercent]);

  useEffect(() => {
    localStorage.setItem("vn_ocr_custom_path", customPath);
  }, [customPath]);

  useEffect(() => {
    localStorage.setItem("vn_ocr_target_monitor", targetMonitor);
  }, [targetMonitor]);

  // Load monitors from Tauri backend
  useEffect(() => {
    async function loadMonitors() {
      try {
        const list = await invoke<MonitorInfo[]>("get_monitors");
        if (list && list.length > 0) {
          setMonitors(list);
          const primary = list.find((m) => m.is_primary) || list[0];
          if (targetMonitor === "monitor_1" && primary) {
            setTargetMonitor(primary.name);
          }
        }
      } catch (e) {
        console.warn("Failed to load monitors:", e);
      }
    }
    loadMonitors();
  }, []);

  // Listen for updates from RegionSelectionOverlay via BroadcastChannel
  useEffect(() => {
    const channel = new BroadcastChannel("vn_ocr_channel");
    channel.onmessage = (event) => {
      if (event.data?.type === "REGIONS_UPDATED" && Array.isArray(event.data.regions)) {
        setRegions(event.data.regions);
        // Refresh preview snapshots when regions update
        refreshSnapshots(event.data.regions);
      }
    };
    return () => channel.close();
  }, []);

  // Initial engine check & snapshot load
  const checkEngine = async (path?: string) => {
    setIsCheckingEngine(true);
    const status = await OcrService.detectOneOcrPath(path || customPath);
    setEngineStatus(status);
    setIsCheckingEngine(false);
  };

  const refreshSnapshots = async (targetRegions: OcrRegion[] = regions) => {
    if (targetRegions.length === 0) return;
    setIsLoadingSnapshot(true);
    const previews = await OcrService.captureRegionsPreview(targetRegions);
    setRegionSnapshots(previews);
    setIsLoadingSnapshot(false);
  };

  useEffect(() => {
    checkEngine();
    refreshSnapshots();
  }, []);

  // Open Region Selector Overlay Window on selected target monitor
  const handleOpenSelector = async () => {
    await OcrService.openRegionSelector(targetMonitor);
  };

  // Toggle OCR Region Role
  const handleToggleRegionRole = (id: string) => {
    setRegions((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const nextRole: OcrRegionRole = r.role === "dialogue" ? "speaker" : "dialogue";
          return {
            ...r,
            role: nextRole,
            name: nextRole === "dialogue" ? "Dialogue Region" : "Speaker Region",
            color: nextRole === "dialogue" ? "#4e73df" : "#f6c23e",
          };
        }
        return r;
      })
    );
  };

  // Delete Region
  const handleDeleteRegion = (id: string) => {
    setRegions((prev) => prev.filter((r) => r.id !== id));
  };

  // Single OCR Scan Step Execution
  const executeScanStep = async () => {
    if (!isOcrActiveRef.current || regionsRef.current.length === 0) return;

    try {
      const result = await OcrService.runOneOcrScan(
        regionsRef.current,
        scalePercentRef.current,
        customPathRef.current || undefined
      );

      if (result.latencyMs !== undefined) {
        setLatencyMs(result.latencyMs);
      }

      // Preprocess text lines with OCR source filter
      const cleanSpeaker = result.speaker ? executePreprocessingPipeline(result.speaker, "ocr").trim() : "";
      const cleanMessage = result.message ? executePreprocessingPipeline(result.message, "ocr").trim() : "";

      // Check if duplicate suppression enabled
      if (
        ignoreDuplicatesRef.current &&
        cleanSpeaker === lastRecognizedTextRef.current.speaker &&
        cleanMessage === lastRecognizedTextRef.current.message
      ) {
        // Discard unchanged duplicate
        return;
      }

      // Update state if text exists
      if (cleanSpeaker || cleanMessage) {
        setLatestSpeaker(cleanSpeaker);
        setLatestMessage(cleanMessage);
        setLatestRawText(result.rawText);

        lastRecognizedTextRef.current = {
          speaker: cleanSpeaker,
          message: cleanMessage,
        };

        // Forward to Live Translation & Transparent Overlay
        if (autoForwardRef.current) {
          overlayChannel.send({
            type: "DIALOGUE_UPDATE",
            dialogue: {
              speaker: cleanSpeaker || undefined,
              translatedSpeaker: cleanSpeaker || undefined,
              message: result.rawText,
              translatedMessage: cleanMessage,
            },
          });
        }
      }
    } catch (err: any) {
      setScanError(err.message || String(err));
    }
  };

  // Single-Slot Overwriting Worker Loop
  const triggerSingleSlotOcr = async () => {
    if (!isOcrActiveRef.current || regionsRef.current.length === 0) return;

    // If an OCR scan is already in-flight, mark pending frame (overwriting older frame)
    if (isProcessingRef.current) {
      pendingTaskRef.current = true;
      return;
    }

    isProcessingRef.current = true;

    try {
      while (isOcrActiveRef.current) {
        pendingTaskRef.current = false;
        await executeScanStep();

        // If no new pending capture arrived during scan execution, exit loop
        if (!pendingTaskRef.current) {
          break;
        }
      }
    } finally {
      isProcessingRef.current = false;
    }
  };

  // Background Periodic Auto-Scan Trigger
  useEffect(() => {
    if (isOcrActive) {
      // Trigger initial scan immediately
      triggerSingleSlotOcr();

      // Schedule periodic timer to feed the single-slot queue
      scanLoopTimerRef.current = setInterval(() => {
        triggerSingleSlotOcr();
      }, Math.max(100, scanInterval));
    } else {
      if (scanLoopTimerRef.current) {
        clearInterval(scanLoopTimerRef.current);
        scanLoopTimerRef.current = null;
      }
      isProcessingRef.current = false;
      pendingTaskRef.current = false;
      // When OCR is turned off, refresh the inactive preview snapshot
      refreshSnapshots();
    }

    return () => {
      if (scanLoopTimerRef.current) {
        clearInterval(scanLoopTimerRef.current);
      }
    };
  }, [isOcrActive, scanInterval]);

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
              <span className="badge badge-success" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <CheckCircle2 size={12} /> OneOCR Ready
              </span>
            ) : (
              <span className="badge badge-danger" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <AlertCircle size={12} /> OneOCR Missing
              </span>
            )}

            <button
              onClick={() => checkEngine()}
              disabled={isCheckingEngine}
              className="btn-secondary"
              style={{ padding: "4px 10px", fontSize: "11px" }}
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
              OneOCR Installation Path (Auto-detected from WindowsApps or Custom Folder)
            </label>
            <input
              type="text"
              value={customPath || engineStatus.dllPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder="e.g. C:\Program Files\WindowsApps\Microsoft.ScreenSketch_...\SnippingTool"
              style={{
                width: "100%",
                fontFamily: "var(--font-mono)",
                fontSize: "11.5px",
                color: engineStatus.isAvailable ? "var(--text-primary)" : "var(--accent-danger)",
              }}
            />
          </div>

          <div style={{ alignSelf: "flex-end" }}>
            <button
              onClick={() => checkEngine(customPath)}
              className="btn-secondary"
              style={{ padding: "7px 12px", fontSize: "12px", whiteSpace: "nowrap" }}
            >
              <FolderSearch size={13} />
              <span>Apply Custom Path</span>
            </button>
          </div>
        </div>

        {engineStatus.error && (
          <div style={{ marginTop: "10px", padding: "8px 12px", backgroundColor: "rgba(248, 81, 73, 0.1)", border: "1px solid rgba(248, 81, 73, 0.3)", borderRadius: "var(--radius-sm)", color: "var(--accent-danger)", fontSize: "11.5px" }}>
            <strong>Detection Error:</strong> {engineStatus.error}
          </div>
        )}
      </div>

      {/* 2. Screen Region Selection & Scaling Settings (Max 2 Regions) */}
      <div className="card" style={{ margin: 0, minWidth: 0 }}>
        <div className="card-header" style={{ flexWrap: "wrap", gap: "10px" }}>
          <div>
            <span className="card-title">
              <Crosshair size={16} /> Screen Region Selection ({regions.length}/2 Active Boxes)
            </span>
            <span className="card-subtitle">
              Configure coordinates on screen for Speaker Name and Dialogue text
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Monitor size={14} color="var(--text-muted)" />
              <select
                value={targetMonitor}
                onChange={(e) => setTargetMonitor(e.target.value)}
                style={{
                  padding: "4px 8px",
                  fontSize: "12px",
                  backgroundColor: "var(--bg-app)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
                title="Select target monitor where your game window is placed"
              >
                {monitors.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} ({m.width}×{m.height} @ {m.scale_factor}x{m.is_primary ? " - Primary" : ""})
                  </option>
                ))}
              </select>
            </div>

            <button onClick={handleOpenSelector} className="btn-primary" style={{ padding: "5px 14px", fontSize: "12px" }}>
              <Crosshair size={13} />
              <span>Select Screen Area (Draw Box)</span>
            </button>
          </div>
        </div>

        {/* Regions List Grid */}
        <div style={{ display: "grid", gridTemplateColumns: regions.length === 2 ? "1fr 1fr" : "1fr", gap: "12px", marginBottom: "14px" }}>
          {regions.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "12.5px", border: "1px dashed var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
              No screen regions configured. Click <strong>"Select Screen Area"</strong> above to draw up to 2 bounding boxes over your game window.
            </div>
          ) : (
            regions.map((r, idx) => {
              const isDialogue = r.role === "dialogue";
              return (
                <div
                  key={r.id}
                  style={{
                    padding: "10px 14px",
                    backgroundColor: "var(--bg-app)",
                    border: `1px solid ${isDialogue ? "rgba(78, 115, 223, 0.4)" : "rgba(246, 194, 62, 0.4)"}`,
                    borderRadius: "var(--radius-sm)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontWeight: 600, fontSize: "12.5px" }}>
                        Region #{idx + 1}:
                      </span>
                      <span className={isDialogue ? "badge badge-primary" : "badge badge-warning"} style={{ fontSize: "10.5px" }}>
                        {isDialogue ? "💬 Dialogue Message" : "👤 Speaker Name"}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={() => handleToggleRegionRole(r.id)}
                        className="btn-secondary"
                        style={{ padding: "2px 8px", fontSize: "11px" }}
                        title="Toggle role between Dialogue and Speaker"
                      >
                        {isDialogue ? <User size={11} /> : <MessageSquare size={11} />}
                        <span>Set to {isDialogue ? "Speaker" : "Dialogue"}</span>
                      </button>

                      <button
                        onClick={() => handleDeleteRegion(r.id)}
                        className="btn-secondary"
                        style={{ padding: "2px 6px", fontSize: "11px", color: "var(--accent-danger)" }}
                        title="Delete region"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", fontSize: "11px", color: "var(--text-muted)" }}>
                    <div>X: <strong style={{ color: "var(--text-primary)" }}>{Math.round(r.x)}px</strong></div>
                    <div>Y: <strong style={{ color: "var(--text-primary)" }}>{Math.round(r.y)}px</strong></div>
                    <div>Width: <strong style={{ color: "var(--text-primary)" }}>{Math.round(r.width)}px</strong></div>
                    <div>Height: <strong style={{ color: "var(--text-primary)" }}>{Math.round(r.height)}px</strong></div>
                  </div>

                  {r.physicalX !== undefined && (
                    <div style={{ fontSize: "10px", color: "var(--accent-primary)", borderTop: "1px dashed var(--border-subtle)", paddingTop: "4px" }}>
                      🎯 Physical Capture: ({r.physicalX}, {r.physicalY}) - {r.physicalWidth}×{r.physicalHeight}px ({r.targetMonitor || targetMonitor})
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Resolution Scaling Slider */}
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: "12.5px", display: "flex", alignItems: "center", gap: "6px" }}>
                <Sliders size={14} /> Resolution Scale Optimization
              </span>
              <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                Adjust image scaling size sent to OCR (Lower = Faster processing, Higher = Sharp text clarity)
              </span>
            </div>
            <span className="badge badge-neutral" style={{ fontSize: "12px", fontWeight: 700 }}>
              {scalePercent}% {scalePercent === 100 ? "(Default Native)" : scalePercent < 100 ? "(High Speed)" : "(High Sharpness)"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <input
              type="range"
              min={25}
              max={200}
              step={25}
              value={scalePercent}
              onChange={(e) => setScalePercent(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <div style={{ display: "flex", gap: "6px" }}>
              {[50, 75, 100, 150].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setScalePercent(preset)}
                  className={scalePercent === preset ? "btn-primary" : "btn-secondary"}
                  style={{ padding: "2px 8px", fontSize: "10.5px" }}
                >
                  {preset}%
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. OCR Active/Inactive Toggle & Auto-Scan Interval Controls */}
      <div className="card" style={{ margin: 0, minWidth: 0 }}>
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={() => setIsOcrActive(!isOcrActive)}
              className={isOcrActive ? "btn-danger" : "btn-primary"}
              style={{
                padding: "8px 18px",
                fontSize: "13px",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: isOcrActive ? "#da3633" : "var(--accent-success)",
                borderColor: isOcrActive ? "#f85149" : "#2ea043",
                color: "#ffffff",
              }}
              disabled={!engineStatus.isAvailable || regions.length === 0}
            >
              {isOcrActive ? <Square size={14} fill="#fff" /> : <Play size={14} fill="#fff" />}
              <span>{isOcrActive ? "Stop OCR Scanning" : "Start OCR Scanning (Active)"}</span>
            </button>

            {isOcrActive ? (
              <span className="badge badge-success" style={{ fontSize: "11.5px", display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#3fb950", display: "inline-block" }} />
                OCR Active (Scanning every {scanInterval}ms)
              </span>
            ) : (
              <span className="badge badge-neutral" style={{ fontSize: "11.5px" }}>
                ⚡ Inactive Mode (Idle & Zero CPU Usage)
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={autoForwardToOverlay}
                onChange={(e) => setAutoForwardToOverlay(e.target.checked)}
              />
              <span style={{ fontWeight: 600 }}>Auto-Forward to Live Translation & Overlay</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={ignoreDuplicates}
                onChange={(e) => setIgnoreDuplicates(e.target.checked)}
              />
              <span style={{ fontWeight: 600 }}>Discard Identical Duplicate Text</span>
            </label>
          </div>
        </div>

        {/* Scan Interval Slider */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "6px" }}>
          <label style={{ fontSize: "11.5px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            Scan Interval: <strong style={{ color: "var(--text-primary)" }}>{scanInterval}ms</strong>
          </label>
          <input
            type="range"
            min={100}
            max={2000}
            step={50}
            value={scanInterval}
            onChange={(e) => setScanInterval(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <div style={{ display: "flex", gap: "4px" }}>
            {[200, 350, 500, 1000].map((intVal) => (
              <button
                key={intVal}
                onClick={() => setScanInterval(intVal)}
                className={scanInterval === intVal ? "btn-primary" : "btn-secondary"}
                style={{ padding: "2px 8px", fontSize: "10.5px" }}
              >
                {intVal}ms
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Dual-State Live Preview Section */}
      <div className="card" style={{ margin: 0, minWidth: 0, width: "100%", boxSizing: "border-box" }}>
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Activity size={16} color={isOcrActive ? "var(--accent-success)" : "var(--accent-primary)"} />
              {isOcrActive ? "Live OCR Stream Inspector (Active Output)" : "Screen Region Preview (Inactive Mode)"}
            </span>

            {isOcrActive && (
              <span className="badge badge-success" style={{ fontSize: "11px", display: "flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
                ⚡ {latencyMs > 0 ? `${latencyMs}ms Latency` : "Scanning..."} (Single-Slot Queue)
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {!isOcrActive ? (
              <button
                onClick={() => refreshSnapshots()}
                disabled={isLoadingSnapshot}
                className="btn-secondary"
                style={{ padding: "3px 10px", fontSize: "11px" }}
                title="Refresh cropped snapshot of selected regions"
              >
                <Camera size={11} />
                <span>Refresh Snapshot</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setLatestSpeaker("");
                  setLatestMessage("");
                  setLatestRawText("");
                  lastRecognizedTextRef.current = { speaker: "", message: "" };
                }}
                className="btn-secondary"
                style={{ padding: "3px 10px", fontSize: "11px" }}
                title="Clear live output"
              >
                <Trash2 size={11} />
                <span>Clear Output</span>
              </button>
            )}
          </div>
        </div>

        {/* STATE A: INACTIVE PREVIEW (Cropped Screenshots of Regions) */}
        {!isOcrActive ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              OCR scanning is currently inactive to save system resources. Below are the cropped image snapshots from your desktop to verify region boundaries:
            </div>

            {regions.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: "12.5px" }}>
                No regions configured. Click "Select Screen Area" to draw region boxes.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: regions.length === 2 ? "1fr 1fr" : "1fr", gap: "12px" }}>
                {regions.map((r) => {
                  const b64 = regionSnapshots[r.id];
                  const isDialogue = r.role === "dialogue";
                  return (
                    <div
                      key={r.id}
                      style={{
                        padding: "10px",
                        backgroundColor: "var(--bg-app)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-sm)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 600, fontSize: "12px" }}>{r.name}</span>
                        <span className={isDialogue ? "badge badge-primary" : "badge badge-warning"} style={{ fontSize: "10px" }}>
                          {isDialogue ? "💬 Dialogue" : "👤 Speaker"}
                        </span>
                      </div>

                      <div
                        style={{
                          width: "100%",
                          minHeight: "80px",
                          maxHeight: "180px",
                          backgroundColor: "#0d1117",
                          border: "1px solid #30363d",
                          borderRadius: "4px",
                          overflow: "hidden",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {b64 ? (
                          <img
                            src={b64}
                            alt={r.name}
                            style={{
                              maxWidth: "100%",
                              maxHeight: "180px",
                              objectFit: "contain",
                              display: "block",
                            }}
                          />
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                            {isLoadingSnapshot ? "Capturing snapshot..." : "Click 'Refresh Snapshot' to preview"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* STATE B: ACTIVE LIVE OCR TEXT INSPECTOR */
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
            {/* Synchronized Combined Live Output */}
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>
              {latestSpeaker ? (
                <span style={{ color: "var(--accent-gold)", fontWeight: 700, fontSize: "14px", whiteSpace: "nowrap" }}>
                  【{latestSpeaker}】
                </span>
              ) : null}
              <span style={{ color: "var(--text-primary)", fontSize: "14px", fontWeight: 600, lineHeight: 1.4 }}>
                {latestMessage || (
                  <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "12.5px" }}>
                    (Waiting for OCR text recognition...)
                  </span>
                )}
              </span>
            </div>

            {/* RAW Recognized Footnote */}
            {latestRawText && (
              <div style={{ display: "flex", gap: "16px", fontSize: "11px", borderTop: "1px solid var(--border-subtle)", paddingTop: "6px" }}>
                <div style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  <span>RAW OCR: </span>
                  <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{latestRawText}</span>
                </div>
                <div style={{ color: "var(--accent-success)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  <span>CLEAN: </span>
                  <span style={{ fontWeight: 600 }}>{latestMessage}</span>
                </div>
              </div>
            )}

            {scanError && (
              <div style={{ fontSize: "11px", color: "var(--accent-danger)", paddingTop: "4px" }}>
                Scan Error: {scanError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
