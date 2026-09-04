import React, { useState, useEffect, useRef } from "react";
import { OcrRegion, OcrRegionRole, MonitorInfo, DetectedTextLine } from "../../types";
import { OcrService } from "../../services/ocrService";
import { translationManager } from "../../services/translationManager";
import { TauriBridge } from "../../services/tauriBridge";
import { listen } from "@tauri-apps/api/event";
import {
  Check,
  X,
  Trash2,
  MessageSquare,
  User,
  Crosshair,
  Sparkles,
  Loader2,
} from "lucide-react";

interface SnippingBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface ActiveSnipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TranslatedItemBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rawText: string;
  translatedText: string;
  isProcessing: boolean;
  error?: string | null;
}

export const RegionSelectionOverlay: React.FC = () => {
  const [mode, setMode] = useState<"setup" | "snipping">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("snipping") === "true" || params.get("mode") === "snipping") {
        return "snipping";
      }
    }
    return "setup";
  });

  const [currentMonitor, setCurrentMonitor] = useState<MonitorInfo | null>(null);

  // Setup Mode State: Predefined Regions
  const [regions, setRegions] = useState<OcrRegion[]>(() => {
    try {
      const saved = localStorage.getItem("vn_ocr_regions");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to load saved OCR regions:", e);
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

  const initialRegionsRef = useRef<OcrRegion[]>([]);
  const currentMonitorRef = useRef<MonitorInfo | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>("region_1");

  // Dragging & Resizing State for Setup Mode
  const [dragAction, setDragAction] = useState<{
    type: "move" | "resize" | "draw";
    regionId: string;
    handle?: string; // 'nw', 'ne', 'sw', 'se'
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
  } | null>(null);

  // Snipping Mode State
  const [isSnipDrawing, setIsSnipDrawing] = useState<boolean>(false);
  const [snipBox, setSnipBox] = useState<SnippingBox | null>(null);
  const [activeSnipRect, setActiveSnipRect] = useState<ActiveSnipRect | null>(null);
  const [isSnipProcessing, setIsSnipProcessing] = useState<boolean>(false);
  const [snipError, setSnipError] = useState<string | null>(null);
  const [translatedBoxes, setTranslatedBoxes] = useState<TranslatedItemBox[]>([]);
  const [copiedBoxId, setCopiedBoxId] = useState<string | null>(null);

  const loadWindowMonitor = async (): Promise<MonitorInfo> => {
    try {
      const mon = await TauriBridge.getWindowMonitor("region-selector");
      if (mon) {
        setCurrentMonitor(mon);
        currentMonitorRef.current = mon;
        return mon;
      }
    } catch (e) {
      console.warn("Failed to load window monitor for region selector:", e);
    }
    const fallback: MonitorInfo = {
      name: "Primary Monitor",
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      scale_factor: window.devicePixelRatio || 1.0,
      is_primary: true,
    };
    setCurrentMonitor(fallback);
    currentMonitorRef.current = fallback;
    return fallback;
  };

  const reloadSavedRegions = async () => {
    const mon = await loadWindowMonitor();
    try {
      const saved = localStorage.getItem("vn_ocr_regions");
      if (saved) {
        const parsed: OcrRegion[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const scale = mon.scale_factor || window.devicePixelRatio || 1.0;
          const monX = mon.x || 0;
          const monY = mon.y || 0;

          // Align CSS logical coordinates with physical if physical exists
          const aligned = parsed.map((r) => {
            if (r.physicalX != null && r.physicalY != null && r.physicalWidth != null && r.physicalHeight != null) {
              const logicalX = Math.round((r.physicalX - monX) / scale);
              const logicalY = Math.round((r.physicalY - monY) / scale);
              const logicalW = Math.round(r.physicalWidth / scale);
              const logicalH = Math.round(r.physicalHeight / scale);
              if (logicalX >= 0 && logicalY >= 0 && logicalW > 10 && logicalH > 10) {
                return {
                  ...r,
                  x: logicalX,
                  y: logicalY,
                  width: logicalW,
                  height: logicalH,
                };
              }
            }
            return r;
          });

          setRegions(aligned);
          initialRegionsRef.current = JSON.parse(JSON.stringify(aligned));
          if (aligned.length > 0) {
            setSelectedRegionId(aligned[0].id);
          }
          return;
        }
      }
    } catch (e) {
      console.warn("Failed to reload OCR regions:", e);
    }
  };

  useEffect(() => {
    reloadSavedRegions();

    const handleFocus = () => {
      reloadSavedRegions();
    };

    const channel = new BroadcastChannel("vn_ocr_channel");
    channel.onmessage = (event) => {
      if (event.data?.type === "OPEN_SELECTOR") {
        setMode(event.data?.mode === "snipping" ? "snipping" : "setup");
        reloadSavedRegions();
      }
    };

    let unlistenTauriEvent: (() => void) | null = null;
    listen<{ mode?: string }>("set-selector-mode", (event) => {
      const targetMode = event.payload?.mode === "snipping" ? "snipping" : "setup";
      setMode(targetMode);
      if (targetMode === "snipping") {
        setSnipBox(null);
        setActiveSnipRect(null);
        setIsSnipDrawing(false);
        setIsSnipProcessing(false);
        setTranslatedBoxes([]);
        setSnipError(null);
      } else {
        reloadSavedRegions();
      }
    }).then((unlisten) => {
      unlistenTauriEvent = unlisten;
    });

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      channel.close();
      if (unlistenTauriEvent) unlistenTauriEvent();
    };
  }, []);

  const computeRegionsWithPhysical = (regs: OcrRegion[]): OcrRegion[] => {
    const activeMonitor = currentMonitorRef.current || currentMonitor || {
      name: "Primary Monitor",
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      scale_factor: window.devicePixelRatio || 1.0,
      is_primary: true,
    };

    const scale = activeMonitor.scale_factor || window.devicePixelRatio || 1.0;
    const monX = activeMonitor.x || 0;
    const monY = activeMonitor.y || 0;

    return regs.map((r) => ({
      ...r,
      physicalX: Math.round(monX + r.x * scale),
      physicalY: Math.round(monY + r.y * scale),
      physicalWidth: Math.round(r.width * scale),
      physicalHeight: Math.round(r.height * scale),
      targetMonitor: activeMonitor.name,
    }));
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode === "snipping") {
        if (e.key === "Escape" || e.key === "Enter") {
          e.preventDefault();
          handleCloseSnipping();
        }
      } else {
        if (e.key === "Escape") {
          handleCancel();
        } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          handleSaveAndClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, regions, currentMonitor, activeSnipRect, translatedBoxes]);

  // ==========================================
  // SETUP MODE HANDLERS
  // ==========================================
  const handleSaveAndClose = async () => {
    try {
      const regionsWithPhysical = computeRegionsWithPhysical(regions);
      localStorage.setItem("vn_ocr_regions", JSON.stringify(regionsWithPhysical));
      const channel = new BroadcastChannel("vn_ocr_channel");
      channel.postMessage({ type: "REGIONS_UPDATED", regions: regionsWithPhysical });
      channel.close();
    } catch (e) {
      console.warn("Failed to broadcast updated regions:", e);
    }
    await OcrService.closeRegionSelector(true);
  };

  const handleCancel = async () => {
    if (initialRegionsRef.current.length > 0) {
      setRegions(JSON.parse(JSON.stringify(initialRegionsRef.current)));
    }
    await OcrService.closeRegionSelector(true);
  };

  const handleResetDefaults = () => {
    const defaultRegions: OcrRegion[] = [
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
    setRegions(defaultRegions);
    setSelectedRegionId("region_1");
  };

  const handleDeleteRegion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRegions((prev) => prev.filter((r) => r.id !== id));
    if (selectedRegionId === id) {
      setSelectedRegionId(null);
    }
  };

  const handleToggleRole = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (mode === "snipping") {
      // In snipping mode, if translations are already showing, clicking outside closes the overlay
      if (activeSnipRect && (translatedBoxes.length > 0 || snipError)) {
        handleCloseSnipping();
        return;
      }

      setIsSnipDrawing(true);
      setSnipBox({
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
      });
      setActiveSnipRect(null);
      setTranslatedBoxes([]);
      setSnipError(null);
      return;
    }

    // Setup mode canvas click
    if (e.target !== e.currentTarget) return;
    if (regions.length >= 2) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const newId = `region_${Date.now()}`;
    const defaultRole: OcrRegionRole = regions.some((r) => r.role === "dialogue") ? "speaker" : "dialogue";

    const newRegion: OcrRegion = {
      id: newId,
      name: defaultRole === "dialogue" ? "Dialogue Region" : "Speaker Region",
      role: defaultRole,
      x: startX,
      y: startY,
      width: 10,
      height: 10,
      color: defaultRole === "dialogue" ? "#4e73df" : "#f6c23e",
    };

    setRegions((prev) => [...prev, newRegion]);
    setSelectedRegionId(newId);

    setDragAction({
      type: "draw",
      regionId: newId,
      startX,
      startY,
      initialX: startX,
      initialY: startY,
      initialW: 10,
      initialH: 10,
    });
  };

  const handleBoxMouseDown = (r: OcrRegion, e: React.MouseEvent) => {
    if (mode === "snipping") return;
    e.stopPropagation();
    setSelectedRegionId(r.id);

    setDragAction({
      type: "move",
      regionId: r.id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: r.x,
      initialY: r.y,
      initialW: r.width,
      initialH: r.height,
    });
  };

  const handleResizeMouseDown = (r: OcrRegion, handle: string, e: React.MouseEvent) => {
    if (mode === "snipping") return;
    e.stopPropagation();
    setSelectedRegionId(r.id);

    setDragAction({
      type: "resize",
      regionId: r.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialX: r.x,
      initialY: r.y,
      initialW: r.width,
      initialH: r.height,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (mode === "snipping") {
      if (isSnipDrawing && snipBox) {
        setSnipBox({
          ...snipBox,
          currentX: e.clientX,
          currentY: e.clientY,
        });
      }
      return;
    }

    if (!dragAction) return;

    const dx = e.clientX - dragAction.startX;
    const dy = e.clientY - dragAction.startY;

    setRegions((prev) =>
      prev.map((r) => {
        if (r.id !== dragAction.regionId) return r;

        if (dragAction.type === "move") {
          return {
            ...r,
            x: Math.max(0, dragAction.initialX + dx),
            y: Math.max(0, dragAction.initialY + dy),
          };
        }

        if (dragAction.type === "draw") {
          const w = Math.max(10, e.clientX - dragAction.startX);
          const h = Math.max(10, e.clientY - dragAction.startY);
          return {
            ...r,
            width: w,
            height: h,
          };
        }

        if (dragAction.type === "resize") {
          let newX = dragAction.initialX;
          let newY = dragAction.initialY;
          let newW = dragAction.initialW;
          let newH = dragAction.initialH;

          if (dragAction.handle?.includes("e")) {
            newW = Math.max(20, dragAction.initialW + dx);
          }
          if (dragAction.handle?.includes("s")) {
            newH = Math.max(20, dragAction.initialH + dy);
          }
          if (dragAction.handle?.includes("w")) {
            const possibleW = dragAction.initialW - dx;
            if (possibleW >= 20) {
              newX = dragAction.initialX + dx;
              newW = possibleW;
            }
          }
          if (dragAction.handle?.includes("n")) {
            const possibleH = dragAction.initialH - dy;
            if (possibleH >= 20) {
              newY = dragAction.initialY + dy;
              newH = possibleH;
            }
          }

          return {
            ...r,
            x: Math.max(0, newX),
            y: Math.max(0, newY),
            width: newW,
            height: newH,
          };
        }

        return r;
      })
    );
  };

  const handleMouseUp = () => {
    if (mode === "snipping") {
      if (isSnipDrawing && snipBox) {
        setIsSnipDrawing(false);
        const x = Math.min(snipBox.startX, snipBox.currentX);
        const y = Math.min(snipBox.startY, snipBox.currentY);
        const width = Math.abs(snipBox.currentX - snipBox.startX);
        const height = Math.abs(snipBox.currentY - snipBox.startY);

        if (width < 15 || height < 15) {
          setSnipBox(null);
          setActiveSnipRect(null);
          return;
        }

        const rect = { x, y, width, height };
        setActiveSnipRect(rect);
        executeSnippingTranslate(rect);
      }
      return;
    }

    setDragAction(null);
  };

  // ==========================================
  // SNIPPING TRANSLATE EXECUTION (MULTIPLE OCR BOUNDING BOXES)
  // ==========================================
  const executeSnippingTranslate = async (rect: ActiveSnipRect) => {
    setIsSnipProcessing(true);
    setSnipError(null);
    setTranslatedBoxes([]);

    try {
      const mon = currentMonitorRef.current || (await loadWindowMonitor());
      const scale = mon.scale_factor || window.devicePixelRatio || 1.0;
      const physicalX = Math.round((mon.x || 0) + rect.x * scale);
      const physicalY = Math.round((mon.y || 0) + rect.y * scale);
      const physicalWidth = Math.round(rect.width * scale);
      const physicalHeight = Math.round(rect.height * scale);

      const ocrRegion: OcrRegion = {
        id: `snip_${Date.now()}`,
        name: "Snipped Region",
        role: "dialogue",
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        physicalX,
        physicalY,
        physicalWidth,
        physicalHeight,
        targetMonitor: mon.name,
      };

      // 1. Run Instant OneOCR Scan with fresh snapshot (no motion caching)
      const ocrRes = await OcrService.runOneOcrScan([ocrRegion], 100);
      const detectedLines: DetectedTextLine[] = ocrRes.detectedLines || [];

      let rawBoxes: TranslatedItemBox[] = [];

      if (detectedLines.length > 0) {
        // Build accurate bounding boxes directly from OCR detection results
        rawBoxes = detectedLines.map((line, idx) => ({
          id: `snip_item_${idx}`,
          x: Math.round(rect.x + line.x / scale),
          y: Math.round(rect.y + line.y / scale),
          width: Math.max(60, Math.round(line.width / scale)),
          height: Math.max(24, Math.round(line.height / scale)),
          rawText: line.text,
          translatedText: "",
          isProcessing: true,
          error: null,
        }));
      } else {
        const fallbackText = (ocrRes.message || ocrRes.rawText || "").trim();
        if (fallbackText) {
          rawBoxes = [
            {
              id: "snip_item_0",
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              rawText: fallbackText,
              translatedText: "",
              isProcessing: true,
              error: null,
            },
          ];
        }
      }

      if (rawBoxes.length === 0) {
        setSnipError("No Japanese text detected in selected area.");
        setIsSnipProcessing(false);
        return;
      }

      setTranslatedBoxes(rawBoxes);

      // 2. Translate all detected boxes in parallel
      await Promise.all(
        rawBoxes.map(async (box) => {
          try {
            const transRes = await translationManager.translate({
              message: box.rawText,
              sourceType: "ocr",
            });

            const resultText = transRes.success && transRes.translatedMessage ? transRes.translatedMessage : box.rawText;

            setTranslatedBoxes((prev) =>
              prev.map((item) =>
                item.id === box.id
                  ? {
                      ...item,
                      isProcessing: false,
                      translatedText: resultText,
                    }
                  : item
              )
            );
          } catch (transErr: any) {
            setTranslatedBoxes((prev) =>
              prev.map((item) =>
                item.id === box.id
                  ? {
                      ...item,
                      isProcessing: false,
                      error: transErr?.message || "Translation failed",
                    }
                  : item
              )
            );
          }
        })
      );
    } catch (err: any) {
      setSnipError(err?.message || String(err));
    } finally {
      setIsSnipProcessing(false);
    }
  };

  const handleCloseSnipping = async () => {
    setSnipBox(null);
    setActiveSnipRect(null);
    setIsSnipDrawing(false);
    setIsSnipProcessing(false);
    setTranslatedBoxes([]);
    setSnipError(null);
    await OcrService.closeRegionSelector(false);
  };

  const handleCopyBox = (box: TranslatedItemBox) => {
    const textToCopy = box.translatedText || box.rawText;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedBoxId(box.id);
    setTimeout(() => setCopiedBoxId(null), 1500);
  };

  // ==========================================
  // RENDER: SNIPPING MODE (IN-PLACE SUBTITLE-STYLE TRANSLATOR)
  // ==========================================
  if (mode === "snipping") {
    const drawingRect =
      isSnipDrawing && snipBox
        ? {
            x: Math.min(snipBox.startX, snipBox.currentX),
            y: Math.min(snipBox.startY, snipBox.currentY),
            width: Math.abs(snipBox.currentX - snipBox.startX),
            height: Math.abs(snipBox.currentY - snipBox.startY),
          }
        : null;

    return (
      <div
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          width: "100vw",
          height: "100vh",
          position: "fixed",
          top: 0,
          left: 0,
          backgroundColor: activeSnipRect ? "rgba(0, 0, 0, 0.35)" : "rgba(0, 0, 0, 0.3)",
          cursor: activeSnipRect ? "default" : "crosshair",
          userSelect: "none",
          overflow: "hidden",
          zIndex: 9999,
        }}
      >
        {/* Floating Instruction Banner */}
        <div
          style={{
            position: "absolute",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(15, 23, 42, 0.92)",
            border: "1px solid rgba(56, 189, 248, 0.4)",
            backdropFilter: "blur(12px)",
            borderRadius: "30px",
            padding: "6px 18px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 8px 28px rgba(0, 0, 0, 0.6)",
            color: "#ffffff",
            fontSize: "12px",
            zIndex: 100,
            pointerEvents: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--accent-cyan, #38bdf8)", fontWeight: 700 }}>
            <Sparkles size={14} />
            <span>One-Shot Snipping Translator</span>
          </div>
          <span style={{ color: "rgba(255, 255, 255, 0.4)" }}>|</span>
          <span style={{ color: "#cbd5e1" }}>
            {activeSnipRect ? "Press [Enter] or [Esc] to return to game" : "Click & drag over text to translate in-place"}
          </span>
        </div>

        {/* Live Selection Rectangle while dragging */}
        {drawingRect && (
          <div
            style={{
              position: "absolute",
              left: `${drawingRect.x}px`,
              top: `${drawingRect.y}px`,
              width: `${drawingRect.width}px`,
              height: `${drawingRect.height}px`,
              border: "2px solid #38bdf8",
              backgroundColor: "rgba(56, 189, 248, 0.15)",
              boxShadow: "0 0 15px rgba(56, 189, 248, 0.4)",
              borderRadius: "4px",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Global Loading Spinner if OCR is running */}
        {isSnipProcessing && translatedBoxes.length === 0 && activeSnipRect && (
          <div
            style={{
              position: "absolute",
              left: `${activeSnipRect.x + activeSnipRect.width / 2 - 75}px`,
              top: `${activeSnipRect.y + activeSnipRect.height / 2 - 16}px`,
              backgroundColor: "rgba(0, 0, 0, 0.88)",
              color: "#38bdf8",
              border: "1px solid rgba(56, 189, 248, 0.5)",
              borderRadius: "4px",
              padding: "6px 14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "12px",
              fontWeight: 600,
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.7)",
              zIndex: 70,
              pointerEvents: "none",
            }}
          >
            <Loader2 size={14} className="animate-spin" />
            <span>Scanning OCR...</span>
          </div>
        )}

        {/* Error Toast */}
        {snipError && activeSnipRect && (
          <div
            style={{
              position: "absolute",
              left: `${activeSnipRect.x}px`,
              top: `${activeSnipRect.y}px`,
              backgroundColor: "rgba(185, 28, 28, 0.92)",
              color: "#ffffff",
              borderRadius: "4px",
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
              zIndex: 70,
            }}
          >
            <span>⚠️ {snipError}</span>
            <span style={{ fontSize: "10px", opacity: 0.8, marginLeft: "6px" }}>[Enter/Esc to exit]</span>
          </div>
        )}

        {/* YOUTUBE SUBTITLE-STYLE OVERLAY BOXES (One for each detected OCR line/choice) */}
        {translatedBoxes.map((box) => {
          const fontSize = Math.max(13, Math.min(22, Math.round(box.height * 0.72)));
          const isCopied = copiedBoxId === box.id;

          return (
            <div
              key={box.id}
              onClick={(e) => {
                e.stopPropagation();
                handleCopyBox(box);
              }}
              style={{
                position: "absolute",
                left: `${box.x}px`,
                top: `${box.y}px`,
                minWidth: `${Math.max(box.width, 60)}px`,
                minHeight: `${Math.max(box.height, 26)}px`,
                backgroundColor: "rgba(0, 0, 0, 0.88)",
                color: "#ffffff",
                backdropFilter: "blur(4px)",
                borderRadius: "4px",
                padding: "3px 8px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.75)",
                border: "1px solid rgba(255, 255, 255, 0.18)",
                fontSize: `${fontSize}px`,
                fontWeight: 600,
                lineHeight: 1.28,
                userSelect: "none",
                zIndex: 60,
                boxSizing: "border-box",
                wordBreak: "break-word",
                cursor: "pointer",
                transition: "transform 0.1s ease, border-color 0.15s ease",
              }}
              title="Click to copy translated text"
            >
              {box.isProcessing ? (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#38bdf8" }}>
                  <Loader2 size={12} className="animate-spin" />
                  <span>Translating...</span>
                </div>
              ) : box.error ? (
                <span style={{ color: "#f87171", fontSize: "11px" }}>⚠️ {box.error}</span>
              ) : (
                <span style={{ color: isCopied ? "#4ade80" : "#ffffff" }}>
                  {isCopied ? "✓ Copied!" : box.translatedText || box.rawText}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ==========================================
  // RENDER: SETUP MODE (REGION CONFIGURATOR)
  // ==========================================
  return (
    <div
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        width: "100vw",
        height: "100vh",
        position: "fixed",
        top: 0,
        left: 0,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        cursor: dragAction ? "move" : regions.length < 2 ? "crosshair" : "default",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {/* Top Banner with Control Buttons */}
      <div
        style={{
          position: "absolute",
          top: "16px",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "#161b22",
          border: "1px solid #30363d",
          borderRadius: "8px",
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          color: "#ffffff",
          fontSize: "13px",
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Crosshair size={18} color="#58a6ff" />
          <span style={{ fontWeight: 600 }}>OCR Region Selector</span>
          <span style={{ color: "#8b949e", fontSize: "12px" }}>
            ({regions.length}/2 active regions)
          </span>
        </div>

        <div style={{ height: "18px", width: "1px", backgroundColor: "#30363d" }} />

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleResetDefaults}
            style={{
              padding: "5px 10px",
              fontSize: "12px",
              backgroundColor: "#21262d",
              color: "#c9d1d9",
              border: "1px solid #30363d",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Reset Defaults
          </button>

          <button
            onClick={handleCancel}
            style={{
              padding: "5px 12px",
              fontSize: "12px",
              backgroundColor: "#21262d",
              color: "#f85149",
              border: "1px solid #30363d",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <X size={13} /> Cancel (Esc)
          </button>

          <button
            onClick={handleSaveAndClose}
            style={{
              padding: "5px 14px",
              fontSize: "12px",
              backgroundColor: "#238636",
              color: "#ffffff",
              border: "1px solid #2ea043",
              borderRadius: "6px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <Check size={14} /> Save & Apply
          </button>
        </div>
      </div>

      {/* Render Region Bounding Boxes */}
      {regions.map((region) => {
        const isSelected = selectedRegionId === region.id;
        const borderColor = region.role === "dialogue" ? "#58a6ff" : "#f6c23e";
        const roleLabel = region.role === "dialogue" ? "💬 Dialogue" : "👤 Speaker Name";

        return (
          <div
            key={region.id}
            onMouseDown={(e) => handleBoxMouseDown(region, e)}
            style={{
              position: "absolute",
              left: `${region.x}px`,
              top: `${region.y}px`,
              width: `${region.width}px`,
              height: `${region.height}px`,
              border: `2px solid ${borderColor}`,
              backgroundColor: region.role === "dialogue" ? "rgba(88, 166, 255, 0.15)" : "rgba(246, 194, 62, 0.15)",
              boxShadow: isSelected ? `0 0 0 2px rgba(255,255,255,0.8), 0 4px 16px rgba(0,0,0,0.5)` : "0 2px 8px rgba(0,0,0,0.3)",
              cursor: "move",
              boxSizing: "border-box",
              borderRadius: "4px",
            }}
          >
            {/* Box Header Toolbar */}
            <div
              style={{
                position: "absolute",
                top: "-28px",
                left: "-2px",
                backgroundColor: "#161b22",
                border: `1px solid ${borderColor}`,
                borderRadius: "4px 4px 0 0",
                padding: "2px 8px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "11px",
                color: "#ffffff",
                whiteSpace: "nowrap",
                userSelect: "none",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Role Toggle Button */}
              <button
                onClick={(e) => handleToggleRole(region.id, e)}
                style={{
                  padding: "1px 6px",
                  fontSize: "10.5px",
                  fontWeight: 600,
                  backgroundColor: region.role === "dialogue" ? "#1f6feb" : "#9e6a03",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "3px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                }}
                title="Click to toggle between Dialogue and Speaker role"
              >
                {region.role === "dialogue" ? <MessageSquare size={10} /> : <User size={10} />}
                <span>{roleLabel}</span>
              </button>

              <span style={{ color: "#8b949e", fontSize: "10px" }}>
                {Math.round(region.width)} × {Math.round(region.height)} px
              </span>

              {/* Delete Button */}
              <button
                onClick={(e) => handleDeleteRegion(region.id, e)}
                style={{
                  padding: "1px 4px",
                  fontSize: "10px",
                  backgroundColor: "transparent",
                  color: "#f85149",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
                title="Delete this region"
              >
                <Trash2 size={11} />
              </button>
            </div>

            {/* Resize Corner Handles */}
            {["nw", "ne", "sw", "se"].map((handle) => {
              let style: React.CSSProperties = {
                position: "absolute",
                width: "10px",
                height: "10px",
                backgroundColor: "#ffffff",
                border: `2px solid ${borderColor}`,
                borderRadius: "2px",
                zIndex: 10,
              };

              if (handle === "nw") {
                style.top = "-5px";
                style.left = "-5px";
                style.cursor = "nwse-resize";
              } else if (handle === "ne") {
                style.top = "-5px";
                style.right = "-5px";
                style.cursor = "nesw-resize";
              } else if (handle === "sw") {
                style.bottom = "-5px";
                style.left = "-5px";
                style.cursor = "nesw-resize";
              } else if (handle === "se") {
                style.bottom = "-5px";
                style.right = "-5px";
                style.cursor = "nwse-resize";
              }

              return (
                <div
                  key={handle}
                  onMouseDown={(e) => handleResizeMouseDown(region, handle, e)}
                  style={style}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
