import React, { useState, useEffect } from "react";
import { OverlayConfig } from "../../types";
import {
  overlayChannel,
  OverlayEvent,
} from "../../utils/overlayChannel";
import {
  OVERLAY_PRESETS,
  compileOverlayTemplate,
  TemplatePreset,
  loadUserCustomPresets,
  saveUserCustomPresets,
  getAllOverlayPresets,
  isBuiltInPreset,
} from "../../utils/overlayTemplateEngine";
import { settingsManager } from "../../services/settingsManager";
import { formatMonitorLabel } from "../../utils/monitorUtils";
import { invoke } from "@tauri-apps/api/core";
import {
  Monitor,
  Power,
  Move,
  Check,
  Eye,
  Sliders,
  Shield,
  Type,
  Maximize2,
  Code,
  Sparkles,
  Palette,
  FileCode,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

interface MonitorInfo {
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scale_factor: number;
  is_primary: boolean;
}

const INITIAL_OVERLAY_CONFIG: OverlayConfig = {
  isEnabled: false,
  targetMonitor: "monitor_1",
  isClickThrough: true,
  isExcludedFromCapture: true,

  // Single Box Positioning & Auto-expansion
  x: 140,
  y: 760,
  width: 1100,
  height: 130,
  maxExpandRatio: 2.0, // Expand vertically up to 2x initial height before scrolling

  // Appearance
  fontSize: 20,
  speakerFontSize: 16,
  messageFontSize: 20,
  fontColor: "#FFFFFF",
  outlineColor: "#000000",
  outlineWidth: 2,
  backgroundColor: "#0D1017",
  backgroundOpacity: 0.85,
  borderRadius: 8,

  // 4 Display Fields
  showSpeaker: true,
  showTranslatedSpeaker: true,
  showMessage: true,
  showTranslatedMessage: true,

  // Custom Template Engine
  useCustomTemplate: false,
  templatePreset: "classic",
  customTemplateHtml: OVERLAY_PRESETS[0].html,
  customTemplateCss: OVERLAY_PRESETS[0].css,
};

function hexToRgba(hex: string, opacity: number): string {
  const cleanHex = hex.replace("#", "");
  let r = 0, g = 0, b = 0;
  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export const OverlaySettingsView: React.FC = () => {
  const [config, setConfig] = useState<OverlayConfig>(() => {
    const saved = settingsManager.getOverlay().config || overlayChannel.getSavedConfig();
    return {
      ...INITIAL_OVERLAY_CONFIG,
      ...(saved || {}),
      customTemplateHtml: saved?.customTemplateHtml || OVERLAY_PRESETS[0].html,
      customTemplateCss: saved?.customTemplateCss || OVERLAY_PRESETS[0].css,
    };
  });

  const [customPresets, setCustomPresets] = useState<TemplatePreset[]>(() => {
    return loadUserCustomPresets();
  });

  const [monitors, setMonitors] = useState<MonitorInfo[]>([
    { name: "Monitor 1 (Primary)", width: 1920, height: 1080, x: 0, y: 0, scale_factor: 1.0, is_primary: true },
  ]);

  const [isEditingPosition, setIsEditingPosition] = useState<boolean>(false);
  const [sampleTextType, setSampleTextType] = useState<"standard" | "long">("standard");
  const [activeCodeTab, setActiveCodeTab] = useState<"html" | "css">("html");

  // New Preset Modal/Prompt State
  const [isCreatingNewPreset, setIsCreatingNewPreset] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>("");
  const [saveNotification, setSaveNotification] = useState<string | null>(null);

  const allPresets = getAllOverlayPresets(customPresets);
  const activePresetId = config.templatePreset || "classic";
  const isCurrentBuiltIn = isBuiltInPreset(activePresetId);

  // Load monitors from Tauri backend
  useEffect(() => {
    async function loadMonitors() {
      try {
        const list = await invoke<MonitorInfo[]>("get_monitors");
        if (list && list.length > 0) {
          setMonitors(list);
          // Default to primary if not set
          const primary = list.find((m) => m.is_primary) || list[0];
          if (config.targetMonitor === "monitor_1" && primary) {
            updateConfig({ targetMonitor: primary.name });
          }
        }
      } catch {
        // Fallback for non-Tauri dev preview
      }
    }
    loadMonitors();
  }, []);

  // Listen to position saves from the actual overlay window
  useEffect(() => {
    const unsubscribe = overlayChannel.subscribe((event: OverlayEvent) => {
      if (event.type === "POSITION_SAVED") {
        setConfig((prev) => {
          const updated = {
            ...prev,
            x: event.x,
            y: event.y,
            width: event.width,
            height: event.height,
          };
          settingsManager.updateOverlayConfig(updated);
          return updated;
        });
        setIsEditingPosition(false);
      } else if (event.type === "SET_EDIT_MODE") {
        setIsEditingPosition(event.isEditing);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const updateConfig = (patch: Partial<OverlayConfig>) => {
    setConfig((prev) => {
      const updated = { ...prev, ...patch };
      overlayChannel.send({ type: "CONFIG_UPDATE", config: updated });
      settingsManager.updateOverlayConfig(updated);
      return updated;
    });
  };

  // Apply a Built-in or Custom Preset
  const handleApplyPreset = (preset: TemplatePreset) => {
    updateConfig({
      templatePreset: preset.id,
      customTemplateHtml: preset.html,
      customTemplateCss: preset.css,
    });
  };

  // Create & Save a New Custom Preset
  const handleSaveAsNewPreset = () => {
    if (!newPresetName.trim()) return;
    const newId = `user_preset_${Date.now()}`;
    const newPreset: TemplatePreset = {
      id: newId,
      name: newPresetName.trim(),
      description: "User customized overlay template",
      html: config.customTemplateHtml || OVERLAY_PRESETS[0].html,
      css: config.customTemplateCss || OVERLAY_PRESETS[0].css,
    };

    const updatedList = [...customPresets, newPreset];
    setCustomPresets(updatedList);
    saveUserCustomPresets(updatedList);
    settingsManager.updateOverlay({ userCustomPresets: updatedList });

    updateConfig({ templatePreset: newId });
    setIsCreatingNewPreset(false);
    setNewPresetName("");
    showFeedbackNotification(`Created preset: "${newPreset.name}"`);
  };

  // Save / Update Current Custom Preset
  const handleUpdateCurrentPreset = () => {
    if (isCurrentBuiltIn) return;
    const updatedList = customPresets.map((p) => {
      if (p.id === activePresetId) {
        return {
          ...p,
          html: config.customTemplateHtml || "",
          css: config.customTemplateCss || "",
        };
      }
      return p;
    });
    setCustomPresets(updatedList);
    saveUserCustomPresets(updatedList);
    settingsManager.updateOverlay({ userCustomPresets: updatedList });
    showFeedbackNotification("Preset changes saved successfully!");
  };

  // Delete Current Custom Preset
  const handleDeleteCurrentPreset = () => {
    if (isCurrentBuiltIn) return;
    const updatedList = customPresets.filter((p) => p.id !== activePresetId);
    setCustomPresets(updatedList);
    saveUserCustomPresets(updatedList);
    settingsManager.updateOverlay({ userCustomPresets: updatedList });

    // Fallback to classic preset
    handleApplyPreset(OVERLAY_PRESETS[0]);
    showFeedbackNotification("Custom preset deleted.");
  };

  const showFeedbackNotification = (msg: string) => {
    setSaveNotification(msg);
    setTimeout(() => setSaveNotification(null), 3000);
  };

  // Toggle Overlay Master State
  const handleToggleOverlay = async () => {
    const nextState = !config.isEnabled;
    updateConfig({ isEnabled: nextState });

    try {
      if (nextState) {
        await invoke("show_overlay", { monitorName: config.targetMonitor });
      } else {
        await invoke("hide_overlay");
        setIsEditingPosition(false);
      }
    } catch {
      // Non-Tauri fallback
    }
  };

  // Toggle Edit Box Mode
  const handleToggleEditMode = async () => {
    const nextEditState = !isEditingPosition;
    setIsEditingPosition(nextEditState);

    overlayChannel.send({ type: "SET_EDIT_MODE", isEditing: nextEditState });

    try {
      await invoke("set_overlay_edit_mode", { isEditing: nextEditState });
    } catch {
      // Non-Tauri fallback
    }
  };

  // Sample Dialogue Mock
  const sampleSpeakerJP = "坂上 智代";
  const sampleSpeakerEN = "Tomoyo Sakagami";
  const sampleMessageJP =
    sampleTextType === "long"
      ? "「…別に、何でもないわ。早く教室に行きましょう。遅刻するとまた藤林に怒られるし、今日の日直はあなたと私なんだから、サボるわけにはいかないでしょ？」"
      : "「…別に、何でもないわ。早く教室に行きましょう。」";
  const sampleMessageEN =
    sampleTextType === "long"
      ? "\"...It's nothing really. Let's hurry to the classroom. If we're late, Fujibayashi will scold us again, and since you and I are on classroom duty today, we can't afford to slack off, right?\""
      : "\"...It's nothing really. Let's hurry to the classroom.\"";

  const sampleDialogue = {
    speaker: sampleSpeakerJP,
    translatedSpeaker: sampleSpeakerEN,
    message: sampleMessageJP,
    translatedMessage: sampleMessageEN,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* Top Master Status & Action Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "12px 18px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        {/* Left Side: Master Power Toggle & Edit Box Mode */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {/* Overlay Power Toggle */}
          <button
            onClick={handleToggleOverlay}
            className={config.isEnabled ? "btn-primary" : "btn-secondary"}
            style={{
              backgroundColor: config.isEnabled ? "var(--accent-success)" : "var(--bg-surface-elevated)",
              padding: "8px 16px",
              fontWeight: 600,
            }}
          >
            <Power size={15} />
            <span>{config.isEnabled ? "Overlay Running" : "Overlay Disabled"}</span>
          </button>

          {/* Edit / Position Box Action */}
          <button
            onClick={handleToggleEditMode}
            disabled={!config.isEnabled}
            className={isEditingPosition ? "btn-primary" : "btn-secondary"}
            style={{
              backgroundColor: isEditingPosition ? "var(--accent-gold)" : "var(--bg-surface-elevated)",
              color: isEditingPosition ? "#000000" : "var(--text-primary)",
              borderColor: isEditingPosition ? "var(--accent-gold)" : "var(--border-subtle)",
              opacity: config.isEnabled ? 1 : 0.45,
              cursor: config.isEnabled ? "pointer" : "not-allowed",
              padding: "8px 14px",
              fontWeight: 600,
            }}
          >
            {isEditingPosition ? <Check size={15} /> : <Move size={15} />}
            <span>{isEditingPosition ? "Save & Lock Position (Enter)" : "Edit / Position Box"}</span>
          </button>
        </div>

        {/* Right Side: Screenshot/OCR Protection Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: config.isExcludedFromCapture ? "var(--accent-cyan)" : "var(--text-muted)",
              cursor: "pointer",
            }}
            title="Uses Windows WDA_EXCLUDEFROMCAPTURE to guarantee the overlay is invisible to OCR and screen captures"
          >
            <input
              type="checkbox"
              checked={config.isExcludedFromCapture}
              onChange={(e) => updateConfig({ isExcludedFromCapture: e.target.checked })}
            />
            <Shield size={14} style={{ color: config.isExcludedFromCapture ? "var(--accent-cyan)" : "var(--text-muted)" }} />
            <span>Hidden from Screenshot / OCR</span>
          </label>
        </div>
      </div>

      {/* Notification Toast */}
      {saveNotification && (
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
          <span>{saveNotification}</span>
        </div>
      )}

      {/* Mode Switcher Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "10px 16px",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>
            Overlay Box Rendering Engine:
          </span>
        </div>

        <div
          style={{
            display: "inline-flex",
            backgroundColor: "var(--bg-app)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            padding: "2px",
            gap: "3px",
          }}
        >
          <button
            type="button"
            onClick={() => updateConfig({ useCustomTemplate: false })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 14px",
              fontSize: "12px",
              fontWeight: !config.useCustomTemplate ? 600 : 400,
              backgroundColor: !config.useCustomTemplate ? "var(--accent-primary)" : "transparent",
              color: !config.useCustomTemplate ? "#ffffff" : "var(--text-secondary)",
              border: "none",
              borderRadius: "calc(var(--radius-sm) - 2px)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <Palette size={13} />
            <span>Standard Configurable Box</span>
          </button>

          <button
            type="button"
            onClick={() => updateConfig({ useCustomTemplate: true })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 14px",
              fontSize: "12px",
              fontWeight: config.useCustomTemplate ? 600 : 400,
              backgroundColor: config.useCustomTemplate ? "var(--accent-primary)" : "transparent",
              color: config.useCustomTemplate ? "#ffffff" : "var(--text-secondary)",
              border: "none",
              borderRadius: "calc(var(--radius-sm) - 2px)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <Code size={13} />
            <span>Custom Component & HTML/CSS Code</span>
          </button>
        </div>
      </div>

      {/* Grid: Settings & Typography vs Live Monitor Preview */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "16px" }}>
        {/* Left Column: Target Monitor, Box Sizing & Typography */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Target Monitor & Box Dimensions Card */}
          <div className="card" style={{ margin: 0 }}>
            <div className="card-header">
              <span className="card-title">
                <Monitor size={16} /> Target Monitor & Box Dimensions
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Monitor Selector */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                  Target Fullscreen Monitor
                </label>
                <select
                  value={config.targetMonitor}
                  onChange={(e) => updateConfig({ targetMonitor: e.target.value })}
                  style={{ width: "100%" }}
                >
                  {monitors.map((m) => (
                    <option key={m.name} value={m.name}>
                      {formatMonitorLabel(m)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Box Geometry Inputs: X, Y, Width, Height */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                    X Pos (px)
                  </label>
                  <input
                    type="number"
                    value={config.x}
                    onChange={(e) => updateConfig({ x: Number(e.target.value) })}
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                    Y Pos (px)
                  </label>
                  <input
                    type="number"
                    value={config.y}
                    onChange={(e) => updateConfig({ y: Number(e.target.value) })}
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                    Width (px)
                  </label>
                  <input
                    type="number"
                    value={config.width}
                    onChange={(e) => updateConfig({ width: Number(e.target.value) })}
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                    Base Height (px)
                  </label>
                  <input
                    type="number"
                    value={config.height}
                    onChange={(e) => updateConfig({ height: Number(e.target.value) })}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              {/* Vertical Auto-Expansion Banner */}
              <div
                style={{
                  backgroundColor: "var(--bg-app)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "8px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", display: "block" }}>
                    <Maximize2 size={12} style={{ display: "inline", marginRight: "4px" }} />
                    Vertical Auto-Expansion Limit
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Expands up to 2× base height (max {config.height * 2}px) for long dialogues, then scrolls.
                  </span>
                </div>
                <span className="badge badge-neutral" style={{ fontWeight: 700 }}>
                  2.0× Max Height
                </span>
              </div>
            </div>
          </div>

          {/* Display Fields & Typography Sizing Card (Always Available in Both Modes) */}
          <div className="card" style={{ margin: 0 }}>
            <div className="card-header">
              <div>
                <span className="card-title">
                  <Type size={16} /> Display Fields & Font Sizing
                </span>
                <span className="card-subtitle">
                  Select which dialogue elements to show and adjust speaker / message font sizes
                </span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* 4 Display Field Toggles */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px" }}>
                  <input
                    type="checkbox"
                    checked={config.showSpeaker}
                    onChange={(e) => updateConfig({ showSpeaker: e.target.checked })}
                  />
                  <span style={{ fontWeight: config.showSpeaker ? 600 : 400 }}>1. Original Speaker (JP)</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px" }}>
                  <input
                    type="checkbox"
                    checked={config.showTranslatedSpeaker}
                    onChange={(e) => updateConfig({ showTranslatedSpeaker: e.target.checked })}
                  />
                  <span style={{ fontWeight: config.showTranslatedSpeaker ? 600 : 400 }}>2. Translated Speaker</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px" }}>
                  <input
                    type="checkbox"
                    checked={config.showMessage}
                    onChange={(e) => updateConfig({ showMessage: e.target.checked })}
                  />
                  <span style={{ fontWeight: config.showMessage ? 600 : 400 }}>3. Original Message (JP)</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px" }}>
                  <input
                    type="checkbox"
                    checked={config.showTranslatedMessage}
                    onChange={(e) => updateConfig({ showTranslatedMessage: e.target.checked })}
                  />
                  <span style={{ fontWeight: config.showTranslatedMessage ? 600 : 400 }}>4. Translated Message</span>
                </label>
              </div>

              {/* Separate Speaker Font Size & Message Font Size */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Speaker Name Font Size: <strong style={{ color: "var(--text-primary)" }}>{config.speakerFontSize || 16}px</strong>
                    </label>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={36}
                    value={config.speakerFontSize || 16}
                    onChange={(e) => updateConfig({ speakerFontSize: Number(e.target.value) })}
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Dialogue Message Font Size: <strong style={{ color: "var(--text-primary)" }}>{config.messageFontSize || 20}px</strong>
                    </label>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={48}
                    value={config.messageFontSize || 20}
                    onChange={(e) => updateConfig({ messageFontSize: Number(e.target.value), fontSize: Number(e.target.value) })}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            </div>
          </div>

          {config.useCustomTemplate ? (
            <div className="card" style={{ margin: 0 }}>
              <div className="card-header" style={{ flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <span className="card-title">
                    <Code size={16} color="var(--accent-primary)" /> Custom Component & Code Template
                  </span>
                  <span className="card-subtitle">
                    Customize your subtitle layout, nameplates, glowing effects, borders, and animations with code.
                  </span>
                </div>

                {/* Preset Actions & Dropdown */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <Sparkles size={13} color="var(--accent-gold)" />
                  <select
                    value={activePresetId}
                    onChange={(e) => {
                      const found = allPresets.find((p) => p.id === e.target.value);
                      if (found) handleApplyPreset(found);
                    }}
                    style={{
                      padding: "4px 8px",
                      fontSize: "11.5px",
                      backgroundColor: "var(--bg-app)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      maxWidth: "200px",
                    }}
                  >
                    <optgroup label="Built-in Presets">
                      {OVERLAY_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                    {customPresets.length > 0 && (
                      <optgroup label="User Custom Presets">
                        {customPresets.map((p) => (
                          <option key={p.id} value={p.id}>
                            ⭐ {p.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  {/* Preset Action Buttons: Add New, Save Update, Delete */}
                  <button
                    type="button"
                    onClick={() => setIsCreatingNewPreset(true)}
                    className="btn-secondary"
                    style={{ padding: "4px 8px", fontSize: "11px" }}
                    title="Save current code as a new custom preset"
                  >
                    <Plus size={12} />
                    <span>New Preset</span>
                  </button>

                  {!isCurrentBuiltIn && (
                    <>
                      <button
                        type="button"
                        onClick={handleUpdateCurrentPreset}
                        className="btn-primary"
                        style={{ padding: "4px 8px", fontSize: "11px", backgroundColor: "var(--accent-success)", borderColor: "#2ea043" }}
                        title="Save changes to current custom preset"
                      >
                        <Save size={12} />
                        <span>Save</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDeleteCurrentPreset}
                        className="btn-secondary"
                        style={{ padding: "4px 8px", fontSize: "11px", color: "var(--accent-danger)" }}
                        title="Delete this custom preset"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Inline Modal: Create New Preset */}
              {isCreatingNewPreset && (
                <div
                  style={{
                    backgroundColor: "var(--bg-app)",
                    border: "1px solid var(--border-active)",
                    borderRadius: "var(--radius-sm)",
                    padding: "10px 14px",
                    marginBottom: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                    Preset Name:
                  </span>
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="e.g. My Anime Subtitles"
                    style={{ flex: 1, fontSize: "12px", padding: "4px 8px" }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveAsNewPreset}
                    disabled={!newPresetName.trim()}
                    className="btn-primary"
                    style={{ padding: "4px 12px", fontSize: "11.5px" }}
                  >
                    <Save size={12} />
                    <span>Create</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingNewPreset(false);
                      setNewPresetName("");
                    }}
                    className="btn-secondary"
                    style={{ padding: "4px 8px", fontSize: "11.5px" }}
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              <div style={{ marginBottom: "12px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "5px" }}>
                  Template Variables:
                </span>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {[
                    { tag: "{{speaker}}", desc: "Japanese Character Name" },
                    { tag: "{{translatedSpeaker}}", desc: "Translated English Name" },
                    { tag: "{{message}}", desc: "Japanese Dialogue Text" },
                    { tag: "{{translatedMessage}}", desc: "Translated English Dialogue" },
                    { tag: "{{speakerFontSize}}", desc: "Speaker Font Size (px)" },
                    { tag: "{{messageFontSize}}", desc: "Message Font Size (px)" },
                    { tag: "{{fontColor}}", desc: "Font Color Hex" },
                  ].map((item) => (
                    <button
                      key={item.tag}
                      type="button"
                      onClick={() => navigator.clipboard.writeText(item.tag)}
                      className="btn-secondary"
                      style={{
                        padding: "2px 7px",
                        fontSize: "11px",
                        fontFamily: "var(--font-mono)",
                        backgroundColor: "var(--bg-app)",
                        border: "1px solid var(--border-subtle)",
                      }}
                      title={item.desc}
                    >
                      {item.tag}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: "6px", marginBottom: "8px", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "6px" }}>
                <button
                  type="button"
                  onClick={() => setActiveCodeTab("html")}
                  className={activeCodeTab === "html" ? "btn-primary" : "btn-secondary"}
                  style={{ padding: "4px 12px", fontSize: "11.5px" }}
                >
                  <FileCode size={13} />
                  <span>HTML Template</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCodeTab("css")}
                  className={activeCodeTab === "css" ? "btn-primary" : "btn-secondary"}
                  style={{ padding: "4px 12px", fontSize: "11.5px" }}
                >
                  <Palette size={13} />
                  <span>CSS Stylesheet</span>
                </button>
              </div>

              {activeCodeTab === "html" ? (
                <textarea
                  value={config.customTemplateHtml || ""}
                  onChange={(e) => updateConfig({ customTemplateHtml: e.target.value })}
                  rows={12}
                  style={{
                    width: "100%",
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    backgroundColor: "var(--bg-app)",
                    color: "var(--text-primary)",
                    borderRadius: "var(--radius-sm)",
                    padding: "10px",
                    resize: "vertical",
                  }}
                />
              ) : (
                <textarea
                  value={config.customTemplateCss || ""}
                  onChange={(e) => updateConfig({ customTemplateCss: e.target.value })}
                  rows={12}
                  style={{
                    width: "100%",
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    backgroundColor: "var(--bg-app)",
                    color: "#36b9cc",
                    borderRadius: "var(--radius-sm)",
                    padding: "10px",
                    resize: "vertical",
                  }}
                />
              )}
            </div>
          ) : (
            <>
              {/* Styling & Color Pickers Card */}
              <div className="card" style={{ margin: 0 }}>
                <div className="card-header">
                  <span className="card-title">
                    <Sliders size={16} /> Subtitle Box Styling & Colors
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                        Background Opacity: {Math.round(config.backgroundOpacity * 100)}%
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={config.backgroundOpacity}
                        onChange={(e) => updateConfig({ backgroundOpacity: Number(e.target.value) })}
                        style={{ width: "100%" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                        Border Radius: {config.borderRadius}px
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={30}
                        value={config.borderRadius}
                        onChange={(e) => updateConfig({ borderRadius: Number(e.target.value) })}
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                        Font Color
                      </label>
                      <input
                        type="color"
                        value={config.fontColor}
                        onChange={(e) => updateConfig({ fontColor: e.target.value })}
                        style={{ width: "100%", height: "32px", padding: "2px", background: "none", border: "1px solid var(--border-subtle)" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                        Outline (Stroke)
                      </label>
                      <input
                        type="color"
                        value={config.outlineColor}
                        onChange={(e) => updateConfig({ outlineColor: e.target.value })}
                        style={{ width: "100%", height: "32px", padding: "2px", background: "none", border: "1px solid var(--border-subtle)" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                        Box Background
                      </label>
                      <input
                        type="color"
                        value={config.backgroundColor}
                        onChange={(e) => updateConfig({ backgroundColor: e.target.value })}
                        style={{ width: "100%", height: "32px", padding: "2px", background: "none", border: "1px solid var(--border-subtle)" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Column: Live Monitor & Subtitle Box Simulator */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card" style={{ margin: 0, display: "flex", flexDirection: "column", height: "100%" }}>
            <div className="card-header">
              <div>
                <span className="card-title">
                  <Eye size={16} /> Live In-Game Overlay Simulator
                </span>
                <span className="card-subtitle">
                  Preview on simulated 1920×1080 game screen
                </span>
              </div>

              {/* Sample Dialogue Switcher */}
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => setSampleTextType("standard")}
                  className={sampleTextType === "standard" ? "btn-primary" : "btn-secondary"}
                  style={{ padding: "3px 8px", fontSize: "11px" }}
                >
                  Short Line
                </button>
                <button
                  onClick={() => setSampleTextType("long")}
                  className={sampleTextType === "long" ? "btn-primary" : "btn-secondary"}
                  style={{ padding: "3px 8px", fontSize: "11px" }}
                >
                  Long Line
                </button>
              </div>
            </div>

            {/* Simulated Game Backdrop */}
            <div
              style={{
                flex: 1,
                minHeight: "360px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "#050608",
                border: isEditingPosition ? "2px dashed var(--accent-gold)" : "1px solid var(--border-subtle)",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                padding: "20px",
                backgroundImage: "radial-gradient(#1e293b 1.2px, transparent 1.2px)",
                backgroundSize: "20px 20px",
                overflow: "hidden",
              }}
            >
              {config.useCustomTemplate && config.customTemplateHtml ? (
                <div
                  style={{
                    width: "100%",
                    // @ts-ignore
                    "--speaker-font-size": `${config.speakerFontSize || 16}px`,
                    // @ts-ignore
                    "--message-font-size": `${config.messageFontSize || 20}px`,
                    // @ts-ignore
                    "--overlay-font-size": `${config.fontSize || 20}px`,
                  }}
                >
                  {config.customTemplateCss && (
                    <style dangerouslySetInnerHTML={{ __html: config.customTemplateCss }} />
                  )}
                  <div
                    dangerouslySetInnerHTML={{
                      __html: compileOverlayTemplate(config.customTemplateHtml, sampleDialogue, config),
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    width: "100%",
                    minHeight: `${config.height}px`,
                    maxHeight: `${config.height * config.maxExpandRatio}px`,
                    backgroundColor: hexToRgba(config.backgroundColor, config.backgroundOpacity),
                    borderRadius: `${config.borderRadius}px`,
                    padding: "12px 16px",
                    color: config.fontColor,
                    border: isEditingPosition
                      ? "2px solid var(--accent-gold)"
                      : `${config.outlineWidth}px solid ${config.outlineColor}`,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    overflowY: "auto",
                    transition: "all 0.2s ease",
                  }}
                >
                  {(config.showSpeaker || config.showTranslatedSpeaker) && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      {config.showSpeaker && (
                        <span
                          style={{
                            backgroundColor: "rgba(227, 179, 65, 0.2)",
                            color: "var(--accent-gold)",
                            padding: "1px 7px",
                            borderRadius: "var(--radius-sm)",
                            fontWeight: 700,
                            fontSize: `${config.speakerFontSize || Math.max(12, config.fontSize * 0.75)}px`,
                            fontFamily: "var(--font-jp)",
                          }}
                        >
                          {sampleSpeakerJP}
                        </span>
                      )}

                      {config.showTranslatedSpeaker && (
                        <span
                          style={{
                            fontSize: `${config.speakerFontSize || Math.max(12, config.fontSize * 0.75)}px`,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                          }}
                        >
                          {sampleSpeakerEN}
                        </span>
                      )}
                    </div>
                  )}

                  {config.showMessage && (
                    <div
                      style={{
                        fontSize: `${Math.max(12, (config.messageFontSize || config.fontSize) * 0.8)}px`,
                        fontFamily: "var(--font-jp)",
                        color: "var(--text-jp)",
                        lineHeight: "1.5",
                        borderLeft: "2px solid var(--border-active)",
                        paddingLeft: "8px",
                      }}
                    >
                      {sampleMessageJP}
                    </div>
                  )}

                  {config.showTranslatedMessage && (
                    <div
                      style={{
                        fontSize: `${config.messageFontSize || config.fontSize}px`,
                        fontWeight: 600,
                        lineHeight: "1.4",
                        color: config.fontColor,
                        textShadow: `${config.outlineWidth}px ${config.outlineWidth}px 0px ${config.outlineColor}`,
                      }}
                    >
                      {sampleMessageEN}
                    </div>
                  )}
                </div>
              )}

              {isEditingPosition && (
                <div
                  style={{
                    position: "absolute",
                    top: "14px",
                    left: "14px",
                    backgroundColor: "rgba(227, 179, 65, 0.18)",
                    border: "1px solid var(--accent-gold)",
                    color: "var(--accent-gold)",
                    padding: "6px 12px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "12px",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Move size={14} />
                  <span>Click & Drag on actual overlay window to reposition or resize</span>
                </div>
              )}
            </div>

            <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
              <span>Click-through passes mouse events directly to game beneath overlay</span>
              <span>Protected from Windows Snipping Tool & OCR</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
