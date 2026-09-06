import React, { useState, useEffect, useRef } from "react";
import { OcrRegion, MonitorInfo, DetectedTextLine } from "../../types";
import { OcrService } from "../../services/ocrService";
import { translationManager } from "../../services/translationManager";
import { TauriBridge } from "../../services/tauriBridge";
import { Sparkles, Loader2 } from "lucide-react";

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

export const OneShotOcrOverlay: React.FC = () => {
  const currentMonitorRef = useRef<MonitorInfo | null>(null);

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
        currentMonitorRef.current = mon;
        return mon;
      }
    } catch (e) {
      console.warn("Failed to load window monitor for snipping overlay:", e);
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
    currentMonitorRef.current = fallback;
    return fallback;
  };

  useEffect(() => {
    loadWindowMonitor();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        handleCloseSnipping();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // If translations or error are already showing, clicking outside closes the overlay
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
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isSnipDrawing && snipBox) {
      setSnipBox({
        ...snipBox,
        currentX: e.clientX,
        currentY: e.clientY,
      });
    }
  };

  const handleMouseUp = () => {
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
  };

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

      {/* IN-PLACE SUBTITLE-STYLE OVERLAY BOXES */}
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
};
