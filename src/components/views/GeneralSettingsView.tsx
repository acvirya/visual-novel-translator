import React, { useState, useEffect } from "react";
import { Keyboard, Globe, RotateCcw, AlertTriangle, Check, ShieldAlert, BookOpen, Database, Scan, Palette, Code } from "lucide-react";
import { settingsManager } from "../../services/settingsManager";

export const GeneralSettingsView: React.FC = () => {
  const [sourceLang, setSourceLang] = useState<string>(() => {
    return localStorage.getItem("vn_source_lang") || "ja";
  });
  const [targetLang, setTargetLang] = useState<string>(() => {
    return localStorage.getItem("vn_target_lang") || "en";
  });

  const [hotkeyLockOverlay, setHotkeyLockOverlay] = useState<string>(() => {
    return localStorage.getItem("vn_hotkey_lock") || "Ctrl+Shift+L";
  });
  const [hotkeyTogglePause, setHotkeyTogglePause] = useState<string>(() => {
    return localStorage.getItem("vn_hotkey_pause") || "Ctrl+Shift+P";
  });
  const [hotkeyOcrScan, setHotkeyOcrScan] = useState<string>(() => {
    return localStorage.getItem("vn_hotkey_ocr") || "F9";
  });

  // Reset Confirmation Modal State
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [resetCategory, setResetCategory] = useState<string>("all");
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Auto-Save Effect
  useEffect(() => {
    localStorage.setItem("vn_source_lang", sourceLang);
    localStorage.setItem("vn_target_lang", targetLang);
    localStorage.setItem("vn_hotkey_lock", hotkeyLockOverlay);
    localStorage.setItem("vn_hotkey_pause", hotkeyTogglePause);
    localStorage.setItem("vn_hotkey_ocr", hotkeyOcrScan);

    settingsManager.updateGeneral({
      sourceLang,
      targetLang,
      hotkeyLockOverlay,
      hotkeyTogglePause,
      hotkeyOcrScan,
    });
  }, [
    sourceLang,
    targetLang,
    hotkeyLockOverlay,
    hotkeyTogglePause,
    hotkeyOcrScan,
  ]);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  const handleExecuteReset = () => {
    if (resetCategory === "all") {
      // Clear localStorage keys
      const keysToClear = [
        "vn_source_lang",
        "vn_target_lang",
        "vn_auto_start",
        "vn_minimize_tray",
        "vn_hotkey_lock",
        "vn_hotkey_pause",
        "vn_hotkey_ocr",
        "vn_glossary_entries_v1",
        "vn_glossary_categories_v1",
        "vn_script_active_file",
        "vn_script_lines_v1",
        "vn_script_auto_append",
        "vn_script_ngram_settings",
        "vn_textractor_path",
        "vn_textractor_debounce_ms",
        "vn_textractor_max_log_lines",
        "vn_textractor_discovery_duration",
        "vn_textractor_auto_forward",
        "vn_ignore_duplicate_lines",
        "vn_ocr_custom_path",
        "vn_ocr_target_monitor",
        "vn_ocr_regions",
        "vn_ocr_scale_percent",
        "vn_ocr_scan_interval",
        "vn_ocr_auto_forward",
        "vn_ocr_ignore_duplicates",
        "vn_ocr_enable_motion",
        "vn_ocr_settle_time_ms",
        "vn_ocr_motion_sensitivity",
        "vn_ocr_ignore_blinking",
        "vn_overlay_config_v1",
        "vn_overlay_user_presets_v1",
        "vn_preprocessing_pipeline",
        "vn_logs_filter_level",
        "vn_selected_model",
        "vn_openrouter_api_key",
        "vn_openrouter_key_status",
        "vn_openrouter_verified_key",
        "vn_openrouter_key_info",
        "vn_starred_models",
        "vn_live_system_prompt",
        "vn_batch_system_prompt",
        "vn_translator_universal_settings_v1",
      ];
      keysToClear.forEach((k) => localStorage.removeItem(k));
      settingsManager.resetSettings();

      // Reset local state
      setSourceLang("ja");
      setTargetLang("en");
      setHotkeyLockOverlay("Ctrl+Shift+L");
      setHotkeyTogglePause("Ctrl+Shift+P");
      setHotkeyOcrScan("F9");

      showToast("All settings reset to default. Please reload or reopen tabs.");
    } else if (resetCategory === "general") {
      setSourceLang("ja");
      setTargetLang("en");
      setHotkeyLockOverlay("Ctrl+Shift+L");
      setHotkeyTogglePause("Ctrl+Shift+P");
      setHotkeyOcrScan("F9");
      settingsManager.resetSettings("general");
      showToast("General settings reset to defaults.");
    } else if (resetCategory === "glossary") {
      localStorage.removeItem("vn_glossary_entries_v1");
      localStorage.removeItem("vn_glossary_categories_v1");
      settingsManager.resetSettings("glossary");
      showToast("Glossary reset to default sample terms.");
    } else if (resetCategory === "script") {
      localStorage.removeItem("vn_script_lines_v1");
      localStorage.removeItem("vn_script_ngram_settings");
      settingsManager.resetSettings("scriptManager");
      showToast("Script manager reset to defaults.");
    } else if (resetCategory === "ocr") {
      localStorage.removeItem("vn_ocr_regions");
      localStorage.removeItem("vn_ocr_scale_percent");
      localStorage.removeItem("vn_ocr_scan_interval");
      localStorage.removeItem("vn_ocr_enable_motion");
      localStorage.removeItem("vn_ocr_settle_time_ms");
      localStorage.removeItem("vn_ocr_motion_sensitivity");
      localStorage.removeItem("vn_ocr_ignore_blinking");
      settingsManager.resetSettings("ocr");
      showToast("OCR regions and motion parameters reset to defaults.");
    } else if (resetCategory === "overlay") {
      localStorage.removeItem("vn_overlay_config_v1");
      settingsManager.resetSettings("overlay");
      showToast("Overlay box geometry and style reset to defaults.");
    } else if (resetCategory === "preprocessing") {
      localStorage.removeItem("vn_preprocessing_pipeline");
      settingsManager.resetSettings("textPreprocessing");
      showToast("Text preprocessing pipeline reset to default rules.");
    }

    setShowResetModal(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* Toast Notification */}
      {feedbackToast && (
        <div
          style={{
            backgroundColor: "rgba(63, 185, 80, 0.15)",
            border: "1px solid var(--accent-success)",
            color: "var(--accent-success)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 14px",
            fontSize: "12.5px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Check size={15} />
          <span>{feedbackToast}</span>
        </div>
      )}

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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
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

      {/* Reset to Default Settings Section */}
      <div
        className="card"
        style={{
          margin: 0,
          borderColor: "rgba(248, 81, 73, 0.4)",
          backgroundColor: "rgba(248, 81, 73, 0.03)",
        }}
      >
        <div className="card-header">
          <div>
            <span className="card-title" style={{ color: "var(--accent-danger)", display: "flex", alignItems: "center", gap: "6px" }}>
              <RotateCcw size={16} /> Reset to Default Settings
            </span>
            <span className="card-subtitle">
              Restore specific tabs or all application settings back to clean initial factory defaults.
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setResetCategory("all");
              setShowResetModal(true);
            }}
            className="btn-danger"
            style={{ padding: "6px 14px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
          >
            <ShieldAlert size={14} />
            <span>Factory Reset (All Settings)</span>
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginTop: "6px" }}>
          {[
            { id: "general", label: "Reset General & Hotkeys", icon: <Globe size={13} /> },
            { id: "glossary", label: "Reset Glossary Terms", icon: <BookOpen size={13} /> },
            { id: "script", label: "Reset Script Manager", icon: <Database size={13} /> },
            { id: "ocr", label: "Reset OCR & Motion", icon: <Scan size={13} /> },
            { id: "overlay", label: "Reset Overlay Box & Style", icon: <Palette size={13} /> },
            { id: "preprocessing", label: "Reset Text Preprocessing", icon: <Code size={13} /> },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setResetCategory(item.id);
                setShowResetModal(true);
              }}
              className="btn-secondary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 12px",
                fontSize: "12px",
                justifyContent: "flex-start",
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showResetModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-active)",
              borderRadius: "var(--radius-md)",
              padding: "20px 24px",
              maxWidth: "440px",
              width: "90%",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              boxShadow: "0 12px 36px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--accent-danger)" }}>
              <AlertTriangle size={22} />
              <span style={{ fontSize: "15px", fontWeight: 700 }}>
                {resetCategory === "all" ? "Confirm Factory Reset" : "Confirm Reset Category"}
              </span>
            </div>

            <div style={{ fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {resetCategory === "all" ? (
                <span>
                  Are you sure you want to reset <strong>all application settings</strong>, custom overlay presets, OCR regions, and saved terms to factory defaults? This action cannot be undone.
                </span>
              ) : (
                <span>
                  Are you sure you want to reset <strong>{resetCategory}</strong> settings to defaults?
                </span>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "6px" }}>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="btn-secondary"
                style={{ padding: "6px 14px", fontSize: "12px" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteReset}
                className="btn-danger"
                style={{ padding: "6px 16px", fontSize: "12px", fontWeight: 700 }}
              >
                Confirm & Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
