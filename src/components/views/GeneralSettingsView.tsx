import React, { useState } from "react";
import { Sliders, Keyboard, Globe } from "lucide-react";

export const GeneralSettingsView: React.FC = () => {
  const [sourceLang, setSourceLang] = useState<string>("ja");
  const [targetLang, setTargetLang] = useState<string>("en");
  const [autoStartWithWindows, setAutoStartWithWindows] = useState<boolean>(false);
  const [minimizeToTray, setMinimizeToTray] = useState<boolean>(true);

  const [hotkeyLockOverlay, setHotkeyLockOverlay] = useState<string>("Ctrl+Shift+L");
  const [hotkeyTogglePause, setHotkeyTogglePause] = useState<string>("Ctrl+Shift+P");
  const [hotkeyOcrScan, setHotkeyOcrScan] = useState<string>("F9");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* Languages & Translation Defaults */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <span className="card-title">
            <Globe size={16} /> Default Language Configuration
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Original Game Source Language
            </label>
            <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} style={{ width: "100%" }}>
              <option value="ja">Japanese (日本語)</option>
              <option value="zh">Chinese (中文)</option>
              <option value="ko">Korean (한국어)</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Target Translation Language
            </label>
            <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} style={{ width: "100%" }}>
              <option value="en">English</option>
              <option value="id">Indonesian (Bahasa Indonesia)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Global Hotkeys */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <span className="card-title">
            <Keyboard size={16} /> Global Keyboard Hotkeys
          </span>
          <span className="card-subtitle">Global shortcuts accessible while game window is focused</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Toggle Overlay Lock (Click-Through)
            </label>
            <input
              type="text"
              value={hotkeyLockOverlay}
              onChange={(e) => setHotkeyLockOverlay(e.target.value)}
              style={{ width: "100%", fontFamily: "var(--font-mono)" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Trigger OCR Screen Scan
            </label>
            <input
              type="text"
              value={hotkeyOcrScan}
              onChange={(e) => setHotkeyOcrScan(e.target.value)}
              style={{ width: "100%", fontFamily: "var(--font-mono)" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Pause / Resume Live Stream
            </label>
            <input
              type="text"
              value={hotkeyTogglePause}
              onChange={(e) => setHotkeyTogglePause(e.target.value)}
              style={{ width: "100%", fontFamily: "var(--font-mono)" }}
            />
          </div>
        </div>
      </div>

      {/* Application Behavior */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <span className="card-title">
            <Sliders size={16} /> Window & System Behavior
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={minimizeToTray}
              onChange={(e) => setMinimizeToTray(e.target.checked)}
            />
            <span>Minimize to System Tray on window close</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoStartWithWindows}
              onChange={(e) => setAutoStartWithWindows(e.target.checked)}
            />
            <span>Start automatically with Windows startup</span>
          </label>
        </div>
      </div>
    </div>
  );
};
