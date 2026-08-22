import React, { useState, useEffect } from "react";
import { Keyboard, Globe, RotateCcw, ShieldAlert, BookOpen, Database, Scan, Palette, Code } from "lucide-react";
import { settingsManager } from "../../services/settingsManager";
import { useToast } from "../common/ToastProvider";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { LanguageSelectorCombobox } from "../common/LanguageSelectorCombobox";

export const GeneralSettingsView: React.FC = () => {
  const toast = useToast();
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

  const handleExecuteReset = () => {
    if (resetCategory === "all") {
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
        "vn_active_script_filepath",
        "vn_active_script_filename",
        "vn_active_script_entries",
        "vn_script_lines_v1",
        "vn_script_auto_append",
        "vn_script_match_threshold",
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
        "vn_active_style_preset_id",
        "vn_active_style_instructions",
        "vn_user_style_presets_v1",
        "vn_batch_selected_model",
        "vn_batch_lines_per_batch",
        "vn_batch_max_batch_context",
        "vn_batch_retain_batch_context",
        "vn_batch_max_context_lines",
        "vn_batch_retain_context_lines",
        "vn_batch_concurrency",
        "vn_batch_delay_ms",
        "vn_batch_auto_continue",
        "vn_batch_override_raw",
        "vn_batch_output_dir",
        "vn_batch_src_speaker_key",
        "vn_batch_src_message_key",
        "vn_batch_tgt_speaker_key",
        "vn_batch_tgt_message_key",
        "vn_llm_max_context_lines",
        "vn_llm_retain_context_lines",
        "vn_max_chars_per_line",
        "vn_use_script_only",
        "vn_cached_openrouter_models",
        "vn_translator_universal_settings_v1",
      ];
      keysToClear.forEach((k) => localStorage.removeItem(k));
      settingsManager.resetSettings();

      setSourceLang("ja");
      setTargetLang("en");
      setHotkeyLockOverlay("Ctrl+Shift+L");
      setHotkeyTogglePause("Ctrl+Shift+P");
      setHotkeyOcrScan("F9");

      toast.success("All settings reset to default. Please reload or reopen tabs.", "Reset Complete");
    } else if (resetCategory === "general") {
      setSourceLang("ja");
      setTargetLang("en");
      setHotkeyLockOverlay("Ctrl+Shift+L");
      setHotkeyTogglePause("Ctrl+Shift+P");
      setHotkeyOcrScan("F9");
      settingsManager.resetSettings("general");
      toast.success("General settings reset to defaults.", "Reset Success");
    } else if (resetCategory === "glossary") {
      localStorage.removeItem("vn_glossary_entries_v1");
      localStorage.removeItem("vn_glossary_categories_v1");
      settingsManager.resetSettings("glossary");
      toast.success("Glossary reset to default sample terms.", "Reset Success");
    } else if (resetCategory === "script") {
      localStorage.removeItem("vn_script_lines_v1");
      localStorage.removeItem("vn_script_ngram_settings");
      settingsManager.resetSettings("scriptManager");
      toast.success("Script manager reset to defaults.", "Reset Success");
    } else if (resetCategory === "ocr") {
      localStorage.removeItem("vn_ocr_regions");
      localStorage.removeItem("vn_ocr_scale_percent");
      localStorage.removeItem("vn_ocr_scan_interval");
      localStorage.removeItem("vn_ocr_enable_motion");
      localStorage.removeItem("vn_ocr_settle_time_ms");
      localStorage.removeItem("vn_ocr_motion_sensitivity");
      localStorage.removeItem("vn_ocr_ignore_blinking");
      settingsManager.resetSettings("ocr");
      toast.success("OCR regions and motion parameters reset to defaults.", "Reset Success");
    } else if (resetCategory === "overlay") {
      localStorage.removeItem("vn_overlay_config_v1");
      settingsManager.resetSettings("overlay");
      toast.success("Overlay box geometry and style reset to defaults.", "Reset Success");
    } else if (resetCategory === "preprocessing") {
      localStorage.removeItem("vn_preprocessing_pipeline");
      settingsManager.resetSettings("textPreprocessing");
      toast.success("Text preprocessing pipeline reset to default rules.", "Reset Success");
    }

    setShowResetModal(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>

      {/* Languages & Translation Defaults */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Globe size={16} /> Default Language Configuration
            </span>
            <span className="card-subtitle">
              Configure original game dialogue source language and desired translation output language
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <LanguageSelectorCombobox
              label="Original Game Source Language"
              value={sourceLang}
              onChange={(code) => setSourceLang(code)}
              placeholder="Search or enter source language..."
            />
          </div>

          <div>
            <LanguageSelectorCombobox
              label="Target Translation Language"
              value={targetLang}
              onChange={(code) => setTargetLang(code)}
              placeholder="Search or enter target language..."
            />
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
      <ConfirmDialog
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onConfirm={handleExecuteReset}
        title={resetCategory === "all" ? "Confirm Factory Reset" : "Confirm Reset Category"}
        variant="danger"
        confirmText="Confirm & Reset"
        message={
          resetCategory === "all"
            ? "Are you sure you want to reset all application settings, custom overlay presets, OCR regions, and saved terms to factory defaults? This action cannot be undone."
            : `Are you sure you want to reset ${resetCategory} settings to defaults?`
        }
      />
    </div>
  );
};
