import React, { useState } from "react";
import { Scan, Crosshair } from "lucide-react";

export const OcrInputView: React.FC = () => {
  const [ocrEngine, setOcrEngine] = useState<string>("windows_oneocr");
  const [scanInterval, setScanInterval] = useState<number>(600);
  const [autoScanEnabled, setAutoScanEnabled] = useState<boolean>(false);
  const [enhanceContrast, setEnhanceContrast] = useState<boolean>(true);
  const [binarize, setBinarize] = useState<boolean>(false);

  // Dummy region coordinates: x, y, width, height
  const [region, setRegion] = useState({ x: 320, y: 720, width: 800, height: 180 });

  // TODO: Trigger Tauri native overlay region selector
  const handleSelectRegion = () => {
    alert("Select the visual novel dialogue box region on screen...");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* OCR Engine Selection */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <span className="card-title">
            <Scan size={16} /> Windows Media OCR Engine (OneOCR)
          </span>
          <span className="badge badge-success">Offline & Fast</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              OCR Engine
            </label>
            <select
              value={ocrEngine}
              onChange={(e) => setOcrEngine(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="windows_oneocr">Microsoft OneOCR (Snipping Tool Engine)</option>
              <option value="windows_media">Windows.Media.Ocr (Japanese Language Pack)</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Target Recognition Language
            </label>
            <select style={{ width: "100%" }}>
              <option value="ja">Japanese (日本語 - ja-JP)</option>
              <option value="zh">Chinese Simplified (中文 - zh-CN)</option>
              <option value="ko">Korean (한국어 - ko-KR)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Screen Region Capture Configuration */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Crosshair size={16} /> Screen Region Selection (Dialogue Box Area)
            </span>
            <span className="card-subtitle">
              Configure coordinates so OCR focuses scanning exclusively on the in-game text area
            </span>
          </div>

          <button onClick={handleSelectRegion} className="btn-primary">
            <Crosshair size={14} />
            <span>Select Screen Area (F9)</span>
          </button>
        </div>

        {/* Coordinate Display Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "14px" }}>
          <div>
            <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>X Position</label>
            <input type="number" value={region.x} onChange={(e) => setRegion({ ...region, x: Number(e.target.value) })} style={{ width: "100%" }} />
          </div>
          <div>
            <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Y Position</label>
            <input type="number" value={region.y} onChange={(e) => setRegion({ ...region, y: Number(e.target.value) })} style={{ width: "100%" }} />
          </div>
          <div>
            <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Width</label>
            <input type="number" value={region.width} onChange={(e) => setRegion({ ...region, width: Number(e.target.value) })} style={{ width: "100%" }} />
          </div>
          <div>
            <label style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Height</label>
            <input type="number" value={region.height} onChange={(e) => setRegion({ ...region, height: Number(e.target.value) })} style={{ width: "100%" }} />
          </div>
        </div>

        {/* Trigger and Preprocessing Switches */}
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontWeight: 600, display: "block" }}>Auto Scan Loop</span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Automatically scan periodically when screen content changes</span>
            </div>
            <input
              type="checkbox"
              checked={autoScanEnabled}
              onChange={(e) => setAutoScanEnabled(e.target.checked)}
              style={{ transform: "scale(1.2)" }}
            />
          </div>

          {autoScanEnabled && (
            <div>
              <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                Scan Interval: {scanInterval}ms
              </label>
              <input
                type="range"
                min={200}
                max={2000}
                step={50}
                value={scanInterval}
                onChange={(e) => setScanInterval(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: "24px", marginTop: "4px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={enhanceContrast}
                onChange={(e) => setEnhanceContrast(e.target.checked)}
              />
              <span>Enhance Image Contrast</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={binarize}
                onChange={(e) => setBinarize(e.target.checked)}
              />
              <span>Black & White Binarization</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
