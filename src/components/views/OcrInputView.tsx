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
  Trash2,
  Camera,
  Play,
  Square,
  Monitor,
  Zap,
  ArrowLeftRight,
} from "lucide-react";
import { OcrRegion, OcrEngineStatus, OcrRegionRole, MonitorInfo } from "../../types";
import { OcrService } from "../../services/ocrService";
import { overlayChannel } from "../../utils/overlayChannel";
import { executePreprocessingPipeline } from "../../utils/textPreprocessor";
import { formatMonitorLabel, formatMonitorName } from "../../utils/monitorUtils";
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
  const [scanInterval, setScanInterval] = useState<number>(() => {
    const saved = localStorage.getItem("vn_ocr_scan_interval");
    return saved ? Number(saved) : 350;
  });
  const [autoForwardToOverlay, setAutoForwardToOverlay] = useState<boolean>(() => {
    const saved = localStorage.getItem("vn_ocr_auto_forward");
    return saved !== null ? saved === "true" : true;
  });
  const ignoreDuplicates = true; // Always active for maximum performance

  // Motion & Typewriter Settle Stability Settings
  const [enableMotionDetection, setEnableMotionDetection] = useState<boolean>(() => {
    const saved = localStorage.getItem("vn_ocr_enable_motion");
    return saved !== null ? saved === "true" : true;
  });
  const [settleTimeMs, setSettleTimeMs] = useState<number>(() => {
    const saved = localStorage.getItem("vn_ocr_settle_time_ms");
    return saved ? Number(saved) : 250;
  });
  const [motionSensitivity, setMotionSensitivity] = useState<number>(() => {
    const saved = localStorage.getItem("vn_ocr_motion_sensitivity");
    return saved ? Number(saved) : 3;
  });
  const [ignoreBlinkingPrompt, setIgnoreBlinkingPrompt] = useState<boolean>(() => {
    const saved = localStorage.getItem("vn_ocr_ignore_blinking");
    return saved !== null ? saved === "true" : true;
  });

  // Inactive Mode Snapshot Previews
  const [regionSnapshots, setRegionSnapshots] = useState<{ [regionId: string]: string }>({});
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState<boolean>(false);

  // Active Mode OCR Stream Result
  const [latestSpeaker, setLatestSpeaker] = useState<string>("");
  const [latestMessage, setLatestMessage] = useState<string>("");
  const [latestRawText, setLatestRawText] = useState<string>("");
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [isSettled, setIsSettled] = useState<boolean>(true);
  const [scanError, setScanError] = useState<string | null>(null);

  // Single-Slot Overwriting Queue Refs
  const isOcrActiveRef = useRef<boolean>(false);
  const regionsRef = useRef<OcrRegion[]>(regions);
  const scalePercentRef = useRef<number>(scalePercent);
  const customPathRef = useRef<string>(customPath);
  const ignoreDuplicatesRef = useRef<boolean>(ignoreDuplicates);
  const autoForwardRef = useRef<boolean>(autoForwardToOverlay);
  const enableMotionRef = useRef<boolean>(enableMotionDetection);
  const settleTimeMsRef = useRef<number>(settleTimeMs);
  const motionSensRef = useRef<number>(motionSensitivity);
  const ignoreBlinkingRef = useRef<boolean>(ignoreBlinkingPrompt);
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
  enableMotionRef.current = enableMotionDetection;
  settleTimeMsRef.current = settleTimeMs;
  motionSensRef.current = motionSensitivity;
  ignoreBlinkingRef.current = ignoreBlinkingPrompt;

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

  useEffect(() => {
    localStorage.setItem("vn_ocr_enable_motion", String(enableMotionDetection));
  }, [enableMotionDetection]);

  useEffect(() => {
    localStorage.setItem("vn_ocr_settle_time_ms", String(settleTimeMs));
  }, [settleTimeMs]);

  useEffect(() => {
    localStorage.setItem("vn_ocr_motion_sensitivity", String(motionSensitivity));
  }, [motionSensitivity]);

  useEffect(() => {
    localStorage.setItem("vn_ocr_ignore_blinking", String(ignoreBlinkingPrompt));
  }, [ignoreBlinkingPrompt]);

  useEffect(() => {
    localStorage.setItem("vn_ocr_scan_interval", String(scanInterval));
  }, [scanInterval]);

  useEffect(() => {
    localStorage.setItem("vn_ocr_auto_forward", String(autoForwardToOverlay));
  }, [autoForwardToOverlay]);

  useEffect(() => {
    localStorage.setItem("vn_ocr_ignore_duplicates", String(ignoreDuplicates));
  }, [ignoreDuplicates]);

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
    const targetPath = path !== undefined ? path : customPath;
    const status = await OcrService.detectOneOcrPath(targetPath);
    setEngineStatus(status);
    if (path !== undefined && status.isAvailable) {
      localStorage.setItem("vn_ocr_custom_path", path);
    }
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

  // Single Core OCR Scan Execution Step
  const executeScanStep = async () => {
    if (!isOcrActiveRef.current || regionsRef.current.length === 0) return;

    try {
      const result = await OcrService.runOneOcrScan(
        regionsRef.current,
        scalePercentRef.current,
        customPathRef.current || undefined,
        {
          enableMotionDetection: enableMotionRef.current,
          settleTimeMs: settleTimeMsRef.current,
          motionSensitivity: motionSensRef.current,
          ignoreBlinkingPrompt: ignoreBlinkingRef.current,
        }
      );

      if (result.latencyMs !== undefined) {
        setLatencyMs(result.latencyMs);
      }

      if (result.isSettled !== undefined) {
        setIsSettled(result.isSettled);
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
              style={{ height: "32px", padding: "0 12px", fontSize: "12px", whiteSpace: "nowrap" }}
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

        {/* Start / Stop OCR Button & Auto-forward Toggle (placed directly adjacent) */}
        <div style={{ marginTop: "14px", borderTop: "1px solid var(--border-subtle)", paddingTop: "12px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <button
            onClick={() => setIsOcrActive(!isOcrActive)}
            className={isOcrActive ? "btn-danger" : "btn-primary"}
            style={{
              height: "34px",
              padding: "0 18px",
              fontSize: "12.5px",
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
            <span>{isOcrActive ? "Stop OCR" : "Start OCR"}</span>
          </button>

          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoForwardToOverlay}
              onChange={(e) => setAutoForwardToOverlay(e.target.checked)}
            />
            <span style={{ fontWeight: 600 }}>Auto-Forward to Live Translation & Overlay</span>
          </label>
        </div>
      </div>

      {/* 2. Dual-State Live Preview Section (Placed right beneath OneOCR Engine) */}
      <div className="card" style={{ margin: 0, minWidth: 0, width: "100%", boxSizing: "border-box" }}>
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Activity size={16} color={isOcrActive ? "var(--accent-success)" : "var(--accent-primary)"} />
              {isOcrActive ? "Live OCR Stream Inspector" : "Screen Region Preview"}
            </span>

            {isOcrActive && (
              <>
                <span className="badge badge-success" style={{ fontSize: "11px", display: "flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
                  ⚡ {latencyMs > 0 ? `${latencyMs}ms Latency` : "Scanning..."}
                </span>

                {enableMotionDetection && (
                  <span
                    className={isSettled ? "badge badge-success" : "badge badge-warning"}
                    style={{ fontSize: "11px", display: "flex", alignItems: "center", gap: "4px", fontWeight: 600 }}
                  >
                    {isSettled ? "✨ Text Stable" : "⏳ Typewriter Animating..."}
                  </span>
                )}
              </>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {!isOcrActive ? (
              <button
                onClick={() => refreshSnapshots()}
                disabled={isLoadingSnapshot}
                className="btn-secondary"
                style={{ height: "28px", padding: "0 10px", fontSize: "11px" }}
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
                style={{ height: "28px", padding: "0 10px", fontSize: "11px" }}
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
                No regions configured. Click "Select Screen Area" below to draw region boxes.
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

      {/* 3. Screen Region Selection (Max 2 Regions) */}
      <div className="card" style={{ margin: 0, minWidth: 0 }}>
        <div className="card-header" style={{ flexWrap: "wrap", gap: "10px" }}>
          <div>
            <span className="card-title">
              <Crosshair size={16} /> Screen Region Selection
            </span>
            <span className="card-subtitle">
              Configure screen bounding boxes for Speaker Name and Dialogue text
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Monitor size={14} color="var(--text-muted)" />
              <select
                value={targetMonitor}
                onChange={(e) => setTargetMonitor(e.target.value)}
                style={{
                  height: "32px",
                  padding: "0 28px 0 8px",
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
                    {formatMonitorLabel(m)}
                  </option>
                ))}
              </select>
            </div>

            <button onClick={handleOpenSelector} className="btn-primary" style={{ height: "32px", padding: "0 14px", fontSize: "12px" }}>
              <Crosshair size={13} />
              <span>Select Screen Area</span>
            </button>
          </div>
        </div>

        {/* Regions List Grid */}
        <div style={{ display: "grid", gridTemplateColumns: regions.length === 2 ? "1fr 1fr" : "1fr", gap: "12px" }}>
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
                        Region {idx + 1}:
                      </span>
                      <span className={isDialogue ? "badge badge-primary" : "badge badge-warning"} style={{ fontSize: "10.5px" }}>
                        {isDialogue ? "💬 Dialogue Message" : "👤 Speaker Name"}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={() => handleToggleRegionRole(r.id)}
                        className="btn-secondary"
                        style={{ height: "26px", padding: "0 8px", fontSize: "11px" }}
                        title="Switch Role (Speaker ⇄ Dialogue)"
                      >
                        <ArrowLeftRight size={12} />
                      </button>

                      <button
                        onClick={() => handleDeleteRegion(r.id)}
                        className="btn-secondary"
                        style={{ height: "26px", padding: "0 8px", fontSize: "11px", color: "var(--accent-danger)" }}
                        title="Delete region"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Physical coordinates & size */}
                  <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <span>Physical: <strong>X: {r.physicalX ?? Math.round(r.x)}, Y: {r.physicalY ?? Math.round(r.y)}</strong></span>
                    <span>•</span>
                    <span>Size: <strong>{r.physicalWidth ?? Math.round(r.width)} × {r.physicalHeight ?? Math.round(r.height)} px</strong></span>
                    {r.targetMonitor && (
                      <span style={{ color: "var(--text-muted)", fontSize: "10.5px" }}>({formatMonitorName(r.targetMonitor)})</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 4. Settings & Optimization Card */}
      <div className="card" style={{ margin: 0, minWidth: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Sliders size={16} /> Settings & Optimization
            </span>
            <span className="card-subtitle">
              Configure OCR image scaling, capture interval, and smart motion detection
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Resolution Scale & Scan Interval Side by Side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            {/* Resolution Scale */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <label style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                  Resolution Scale: <strong style={{ color: "var(--text-primary)" }}>{scalePercent}%</strong>
                </label>
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                  {scalePercent === 100 ? "Native" : scalePercent < 100 ? "High Speed" : "High Clarity"}
                </span>
              </div>
              <input
                type="range"
                min={25}
                max={200}
                step={25}
                value={scalePercent}
                onChange={(e) => setScalePercent(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>

            {/* Scan Interval */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <label style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                  Scan Interval: <strong style={{ color: "var(--text-primary)" }}>{scanInterval}ms</strong>
                </label>
              </div>
              <input
                type="range"
                min={100}
                max={2000}
                step={50}
                value={scanInterval}
                onChange={(e) => setScanInterval(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          {/* Smart Motion Detection Section */}
          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
            <div>
              <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px" }}>
                <Zap size={14} color="var(--accent-gold)" /> Smart Motion Detection
              </span>
              <span className="card-subtitle" style={{ fontSize: "11px" }}>
                Pauses OCR while dialogue is actively typing or animating, then scans once text has settled.
              </span>
            </div>

            {/* Checklist Toggle positioned right below title/description */}
            <div style={{ marginTop: "8px", marginBottom: enableMotionDetection ? "12px" : "4px" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={enableMotionDetection}
                  onChange={(e) => setEnableMotionDetection(e.target.checked)}
                />
                <span style={{ fontWeight: 600, color: enableMotionDetection ? "var(--accent-success)" : "var(--text-muted)" }}>
                  {enableMotionDetection ? "Smart Motion Detection: Active" : "Smart Motion Detection: Disabled"}
                </span>
              </label>
            </div>

            {enableMotionDetection && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {/* Sliders in a 2-column layout */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                  {/* Settle Window Duration */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        Settle Window: <strong style={{ color: "var(--text-primary)" }}>{settleTimeMs}ms</strong>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={100}
                      max={800}
                      step={25}
                      value={settleTimeMs}
                      onChange={(e) => setSettleTimeMs(Number(e.target.value))}
                      style={{ width: "100%" }}
                    />
                  </div>

                  {/* Stroke Sensitivity */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        Stroke Sensitivity: <strong style={{ color: "var(--text-primary)" }}>{motionSensitivity}/10</strong>
                      </span>
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
                </div>

                {/* Ignore Blinking Prompt Checklist positioned underneath */}
                <div style={{ borderTop: "1px dashed var(--border-subtle)", paddingTop: "8px" }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11.5px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={ignoreBlinkingPrompt}
                      onChange={(e) => setIgnoreBlinkingPrompt(e.target.checked)}
                    />
                    <span style={{ fontWeight: 600 }}>
                      Ignore Blinking Prompt (▼ / ▷)
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
