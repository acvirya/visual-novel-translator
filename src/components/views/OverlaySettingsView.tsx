import React, { useState, useEffect, useRef } from "react";
import { OverlayConfig } from "../../types";
import {
  overlayChannel,
  OverlayEvent,
} from "../../utils/overlayChannel";
import {
  OVERLAY_PRESETS,
  compileOverlayTemplate,
  getOverlayAnimationCss,
  TemplatePreset,
  loadUserCustomPresets,
  saveUserCustomPresets,
  getAllOverlayPresets,
  isBuiltInPreset,
} from "../../utils/overlayTemplateEngine";
import { settingsManager } from "../../services/settingsManager";
import { shortcutService } from "../../services/shortcutService";
import { formatMonitorLabel } from "../../utils/monitorUtils";
import { invoke } from "@tauri-apps/api/core";
import {
  Monitor,
  Power,
  Move,
  Check,
  Sliders,
  Sparkles,
  Palette,
  Plus,
  Save,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  Type,
  Search,
  Film,
  RotateCcw,
  Zap,
} from "lucide-react";
import { SegmentedControl } from "../common/SegmentedControl";

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
  isExcludedFromCapture: true, // Always active internally

  // Single Box Positioning & Auto-expansion
  x: 140,
  y: 760,
  width: 1100,
  height: 130,
  maxExpandRatio: 2.0,

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
  useCustomTemplate: true,
  templatePreset: "classic",
  customTemplateHtml: OVERLAY_PRESETS[0].html,
  customTemplateCss: OVERLAY_PRESETS[0].css,
};

export const OverlaySettingsView: React.FC = () => {
  const [config, setConfig] = useState<OverlayConfig>(() => {
    const saved = settingsManager.getOverlay().config || overlayChannel.getSavedConfig();
    return {
      ...INITIAL_OVERLAY_CONFIG,
      ...(saved || {}),
      isEnabled: saved?.isEnabled ?? false,
      isExcludedFromCapture: true, // Always guaranteed active
      useCustomTemplate: true,
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
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Searchable Preset Combobox State
  const [isPresetDropdownOpen, setIsPresetDropdownOpen] = useState<boolean>(false);
  const [presetSearchQuery, setPresetSearchQuery] = useState<string>("");
  const presetDropdownRef = useRef<HTMLDivElement>(null);

  // New Preset Modal State
  const [isCreatingNewPreset, setIsCreatingNewPreset] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>("");
  const [saveNotification, setSaveNotification] = useState<string | null>(null);

  const allPresets = getAllOverlayPresets(customPresets);
  const activePresetId = config.templatePreset || "classic";
  const isCurrentBuiltIn = isBuiltInPreset(activePresetId);

  // Filter presets by search query
  const filteredPresets = allPresets.filter(
    (p) =>
      p.name.toLowerCase().includes(presetSearchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(presetSearchQuery.toLowerCase())
  );

  // Close preset dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (presetDropdownRef.current && !presetDropdownRef.current.contains(e.target as Node)) {
        setIsPresetDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load monitors from Tauri backend
  useEffect(() => {
    async function loadMonitors() {
      try {
        const list = await invoke<MonitorInfo[]>("get_monitors");
        if (list && list.length > 0) {
          setMonitors(list);
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

  // Listen to position saves from actual overlay window
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
      const updated = { ...prev, ...patch, isExcludedFromCapture: true };
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
        await invoke("show_overlay", {
          monitorName: config.targetMonitor,
          x: Math.round(config.x),
          y: Math.round(config.y),
          width: Math.round(config.width),
          height: Math.round(config.height),
          isClickThrough: config.isClickThrough,
        });
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
    shortcutService.setOverlayClickThrough(!nextEditState);

    overlayChannel.send({ type: "SET_EDIT_MODE", isEditing: nextEditState });

    try {
      await invoke("set_overlay_edit_mode", {
        isEditing: nextEditState,
        monitorName: config.targetMonitor,
        x: Math.round(config.x),
        y: Math.round(config.y),
        width: Math.round(config.width),
        height: Math.round(config.height),
        isClickThrough: config.isClickThrough,
      });
    } catch {
      // Non-Tauri fallback
    }
  };

  // Dynamically update overlay window bounds when inputs change in settings
  useEffect(() => {
    if (config.isEnabled && !isEditingPosition) {
      invoke("update_overlay_bounds", {
        x: Math.round(config.x),
        y: Math.round(config.y),
        width: Math.round(config.width),
        height: Math.round(config.height),
        monitorName: config.targetMonitor,
      }).catch(() => {});
    }
  }, [config.x, config.y, config.width, config.height, config.targetMonitor, config.isEnabled, isEditingPosition]);

  // Sample Dialogue Mock for Live Preview
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

  // Real-time animated dialogue state for sandbox preview
  const [previewDialogue, setPreviewDialogue] = useState(sampleDialogue);
  const [previewAnimTick, setPreviewAnimTick] = useState<number>(0);
  const [previewAnimManualTrigger, setPreviewAnimManualTrigger] = useState<number>(0);

  // Trigger preview animation with automatic 5s post-completion looping
  useEffect(() => {
    const mode = config.textAnimation || "none";
    if (mode === "none") {
      setPreviewDialogue(sampleDialogue);
      return;
    }

    let isMounted = true;
    let typeTimer: any = null;
    let loopTimeout: any = null;

    const runAnimation = () => {
      if (!isMounted) return;

      if (mode === "typewriter") {
        const speed = Math.max(5, Math.min(100, config.animationSpeedMs || 25));
        const targetTrans = sampleDialogue.translatedMessage || "";
        const targetOrig = sampleDialogue.message || "";
        const maxLen = Math.max(targetTrans.length, targetOrig.length);

        if (maxLen === 0) {
          setPreviewDialogue(sampleDialogue);
          return;
        }

        let currentIdx = 1;
        setPreviewDialogue({
          ...sampleDialogue,
          message: targetOrig.slice(0, 1),
          translatedMessage: targetTrans.slice(0, 1),
        });

        if (typeTimer) clearInterval(typeTimer);
        typeTimer = setInterval(() => {
          if (!isMounted) return;
          currentIdx++;
          setPreviewDialogue({
            ...sampleDialogue,
            message: targetOrig.slice(0, currentIdx),
            translatedMessage: targetTrans.slice(0, currentIdx),
          });

          if (currentIdx >= maxLen) {
            clearInterval(typeTimer);
            typeTimer = null;
            // 5-second delay calculated after typewriter animation fully finishes
            loopTimeout = setTimeout(() => {
              if (isMounted) runAnimation();
            }, 5000);
          }
        }, speed);
      } else {
        // CSS Transition modes (fade / blur)
        setPreviewDialogue(sampleDialogue);
        setPreviewAnimTick(Date.now());
        const duration = config.animationSpeedMs || (mode === "blur" ? 350 : 250);
        // 5-second delay calculated after CSS text transition finishes
        loopTimeout = setTimeout(() => {
          if (isMounted) runAnimation();
        }, duration + 5000);
      }
    };

    runAnimation();

    return () => {
      isMounted = false;
      if (typeTimer) clearInterval(typeTimer);
      if (loopTimeout) clearTimeout(loopTimeout);
    };
  }, [sampleTextType, config.textAnimation, config.animationSpeedMs, previewAnimManualTrigger]);

  const handleReplayPreview = () => {
    setPreviewAnimManualTrigger(Date.now());
  };

  // Compile real-time preview
  const speakerSize = config.speakerFontSize || 16;
  const messageSize = config.messageFontSize || config.fontSize || 20;
  const compiledHtml = compileOverlayTemplate(
    config.customTemplateHtml || OVERLAY_PRESETS[0].html,
    previewDialogue,
    config
  );
  const compiledCss = config.customTemplateCss || OVERLAY_PRESETS[0].css;
  const animCss = getOverlayAnimationCss(config.textAnimation, config.animationSpeedMs);
  const rootVars = `:root { --speaker-font-size: ${speakerSize}px; --message-font-size: ${messageSize}px; --font-size: ${messageSize}px; }`;
  const animClass = config.textAnimation && config.textAnimation !== "none" && config.textAnimation !== "typewriter" ? `vn-anim-${config.textAnimation}` : "";
  const compiledPreviewHtml = `<style>${rootVars}\n${animCss}\n${compiledCss}</style><div class="${animClass}">${compiledHtml}</div>`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", width: "100%", minWidth: 0 }}>
      {/* ========================================================================= */}
      {/* 1. QUICK OVERLAY CONTROL BAR                                              */}
      {/* ========================================================================= */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header" style={{ paddingBottom: "10px" }}>
          <div>
            <span className="card-title">
              <Sparkles size={16} color="var(--accent-primary)" /> In-Game Subtitle Overlay
            </span>
            <span className="card-subtitle">
              Borderless transparent overlay rendering translated visual novel text over your game
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {config.isEnabled ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  color: "#3fb950",
                  backgroundColor: "rgba(63, 185, 80, 0.12)",
                  border: "1px solid rgba(63, 185, 80, 0.3)",
                  padding: "3px 8px",
                  borderRadius: "20px",
                }}
              >
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#3fb950" }} />
                Overlay Active
              </span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid var(--border-subtle)",
                  padding: "3px 8px",
                  borderRadius: "20px",
                }}
              >
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "var(--text-muted)" }} />
                Standby
              </span>
            )}
          </div>
        </div>

        {/* Top Row: Target Display Monitor Selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "12px", borderBottom: "1px solid var(--border-subtle)" }}>
          <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}>
            <Monitor size={14} color="var(--accent-primary)" /> Target Display Screen:
          </label>
          <select
            value={config.targetMonitor}
            onChange={(e) => updateConfig({ targetMonitor: e.target.value })}
            style={{ height: "32px", fontSize: "12px", minWidth: "220px", maxWidth: "420px", flex: "1 1 auto" }}
            title="Select target display monitor for in-game overlay"
          >
            {monitors.map((m, idx) => (
              <option key={m.name || idx} value={m.name}>
                {formatMonitorLabel(m)}
              </option>
            ))}
          </select>
        </div>

        {/* Bottom Row: Master Action Buttons (Start / Stop & Reposition Box) */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", marginTop: "12px" }}>
          {/* Master Start / Stop Button */}
          <button
            onClick={handleToggleOverlay}
            className={config.isEnabled ? "btn-primary" : "btn-secondary"}
            style={{
              backgroundColor: config.isEnabled ? "var(--accent-success)" : "var(--bg-surface-elevated)",
              height: "34px",
              padding: "0 18px",
              fontWeight: 600,
            }}
          >
            <Power size={14} />
            <span>{config.isEnabled ? "Stop In-Game Overlay" : "Start In-Game Overlay"}</span>
          </button>

          {/* Reposition Box Button */}
          <button
            onClick={handleToggleEditMode}
            disabled={!config.isEnabled}
            className={isEditingPosition ? "btn-primary" : "btn-secondary"}
            style={{
              backgroundColor: isEditingPosition ? "var(--accent-gold)" : "var(--bg-surface-elevated)",
              color: isEditingPosition ? "#000000" : "var(--text-primary)",
              borderColor: isEditingPosition ? "var(--accent-gold)" : "var(--border-subtle)",
              opacity: config.isEnabled ? 1 : 0.5,
              cursor: config.isEnabled ? "pointer" : "not-allowed",
              height: "34px",
              padding: "0 14px",
              fontWeight: 600,
            }}
            title="Drag and resize the overlay box directly on your screen"
          >
            {isEditingPosition ? <Check size={14} /> : <Move size={14} />}
            <span>{isEditingPosition ? "Save Position (Enter)" : "Drag / Reposition Box"}</span>
          </button>
        </div>

        {saveNotification && (
          <div
            style={{
              marginTop: "10px",
              padding: "7px 12px",
              backgroundColor: "rgba(63, 185, 80, 0.12)",
              border: "1px solid var(--accent-success)",
              borderRadius: "var(--radius-sm)",
              color: "var(--accent-success)",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Check size={13} />
            <span>{saveNotification}</span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. PRESET & LIVE PREVIEW (Unified Card)                                   */}
      {/* ========================================================================= */}
      <div className="card" style={{ margin: 0 }}>
        {/* Preset Selector Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Palette size={16} color="var(--accent-gold)" /> Overlay Theme Preset & Live Preview
            </span>
            <span className="card-subtitle">
              Choose visual style and test real-time rendering appearance
            </span>
          </div>

          {/* Sample Dialogue Type Switcher */}
          <SegmentedControl<"standard" | "long">
            options={[
              { id: "standard", label: "Standard Text" },
              { id: "long", label: "Long Dialogue" },
            ]}
            value={sampleTextType}
            onChange={setSampleTextType}
            size="sm"
          />
        </div>

        {/* Searchable Overlay Preset Dropdown */}
        <div ref={presetDropdownRef} style={{ position: "relative", marginBottom: "14px", width: "100%" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Search size={14} style={{ position: "absolute", left: "10px", color: "var(--text-muted)", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="Search or select overlay preset..."
              value={isPresetDropdownOpen ? presetSearchQuery : (allPresets.find((p) => p.id === activePresetId)?.name || "Select Preset")}
              onChange={(e) => {
                setPresetSearchQuery(e.target.value);
                setIsPresetDropdownOpen(true);
              }}
              onFocus={() => {
                setIsPresetDropdownOpen(true);
                setPresetSearchQuery("");
              }}
              style={{ width: "100%", paddingLeft: "32px", paddingRight: "30px", fontSize: "12px", height: "34px" }}
            />
            <button
              type="button"
              onClick={() => setIsPresetDropdownOpen(!isPresetDropdownOpen)}
              style={{ position: "absolute", right: "8px", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px" }}
            >
              <ChevronDown size={14} />
            </button>
          </div>

          {/* Preset Dropdown Menu */}
          {isPresetDropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: "4px",
                backgroundColor: "var(--bg-panel, #161b22)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                maxHeight: "240px",
                overflowY: "auto",
                zIndex: 100,
              }}
            >
              {filteredPresets.length === 0 ? (
                <div style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: "12px" }}>
                  No presets found matching "{presetSearchQuery}"
                </div>
              ) : (
                filteredPresets.map((preset) => {
                  const isSelected = preset.id === activePresetId;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => {
                        handleApplyPreset(preset);
                        setIsPresetDropdownOpen(false);
                        setPresetSearchQuery("");
                      }}
                      style={{
                        padding: "8px 12px",
                        fontSize: "12px",
                        cursor: "pointer",
                        backgroundColor: isSelected ? "rgba(88, 166, 255, 0.15)" : "transparent",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontWeight: 600, color: isSelected ? "var(--accent-primary)" : "var(--text-primary)" }}>
                            {preset.name}
                          </span>
                          {!isBuiltInPreset(preset.id) && (
                            <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "10px", backgroundColor: "rgba(227, 179, 65, 0.15)", color: "var(--accent-gold)" }}>
                              Custom
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {preset.description}
                        </span>
                      </div>
                      {isSelected && <Check size={14} color="var(--accent-primary)" />}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Live Preview Screen Container */}
        <div
          style={{
            position: "relative",
            minHeight: "190px",
            backgroundColor: "#0a0c10",
            backgroundImage: "radial-gradient(circle at 50% 50%, rgba(30, 41, 59, 0.5) 0%, rgba(10, 12, 16, 0.9) 100%)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            padding: "28px 36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "visible",
            marginBottom: "14px",
          }}
        >
          {/* Rendered Overlay Box */}
          <div key={previewAnimTick} style={{ width: "100%", maxWidth: "800px", overflow: "visible" }} dangerouslySetInnerHTML={{ __html: compiledPreviewHtml }} />
        </div>

        {/* Display Fields & Font Adjustments Row (Under Preview) */}
        <div
          style={{
            backgroundColor: "var(--bg-app)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            padding: "14px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          {/* Sliders Grid: Speaker Font Size vs Message Font Size */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
            {/* Speaker Font Size Slider */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                <label style={{ fontSize: "11.5px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Type size={12} /> Speaker Font Size:
                </label>
                <strong style={{ fontSize: "11.5px", color: "var(--accent-gold)" }}>{config.speakerFontSize || 16} px</strong>
              </div>
              <input
                type="range"
                min={12}
                max={32}
                step={1}
                value={config.speakerFontSize || 16}
                onChange={(e) => {
                  const sz = Number(e.target.value);
                  updateConfig({ speakerFontSize: sz });
                }}
                style={{ width: "100%" }}
              />
            </div>

            {/* Message Font Size Slider */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                <label style={{ fontSize: "11.5px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Type size={12} /> Dialogue Message Font Size:
                </label>
                <strong style={{ fontSize: "11.5px", color: "var(--accent-primary)" }}>{config.messageFontSize || config.fontSize || 20} px</strong>
              </div>
              <input
                type="range"
                min={14}
                max={40}
                step={1}
                value={config.messageFontSize || config.fontSize || 20}
                onChange={(e) => {
                  const sz = Number(e.target.value);
                  updateConfig({ messageFontSize: sz, fontSize: sz });
                }}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          {/* Visibility Toggles (Only 2 toggles: Show Original Japanese Text & Show Original Speaker) */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center", borderTop: "1px solid var(--border-subtle)", paddingTop: "10px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer", color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={config.showMessage}
                onChange={(e) => updateConfig({ showMessage: e.target.checked })}
              />
              <span>Show Original Japanese Dialogue (Raw Text)</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer", color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={config.showSpeaker}
                onChange={(e) => updateConfig({ showSpeaker: e.target.checked })}
              />
              <span>Show Original Japanese Character Name (Raw Speaker)</span>
            </label>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. DIALOGUE TEXT ANIMATION & STREAMING EFFECTS                            */}
      {/* ========================================================================= */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header" style={{ marginBottom: "12px" }}>
          <div>
            <span className="card-title">
              <Film size={16} color="var(--accent-cyan)" /> Subtitle Text Animation
            </span>
            <span className="card-subtitle">
              Choose how translated dialogue text appears on screen (Typewriter stream or CSS transitions)
            </span>
          </div>

          <button
            type="button"
            onClick={handleReplayPreview}
            className="btn-secondary"
            style={{ height: "28px", padding: "0 10px", fontSize: "11.5px" }}
            title="Replay the animation in the live preview sandbox above"
          >
            <RotateCcw size={12} color="var(--accent-cyan)" />
            <span>Replay Animation</span>
          </button>
        </div>

        {/* Animation Mode Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <SegmentedControl<"none" | "typewriter" | "fade" | "blur">
              options={[
                { id: "none", label: "None (Instant)" },
                { id: "typewriter", label: "Typewriter (VN Stream)" },
                { id: "fade", label: "Smooth Text Fade" },
                { id: "blur", label: "Blur Reveal Text" },
              ]}
              value={config.textAnimation || "none"}
              onChange={(mode) => updateConfig({ textAnimation: mode })}
              size="md"
            />
          </div>

          {/* Speed / Duration Slider (When animation is enabled) */}
          {config.textAnimation && config.textAnimation !== "none" && (
            <div
              style={{
                backgroundColor: "var(--bg-app)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              {config.textAnimation === "typewriter" ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                      <Zap size={13} color="var(--accent-gold)" /> Typewriter Speed (Per Character):
                    </label>
                    <strong style={{ fontSize: "12px", color: "var(--accent-gold)" }}>
                      {config.animationSpeedMs || 25} ms / char{" "}
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 400 }}>
                        ({(config.animationSpeedMs || 25) <= 15 ? "Fast" : (config.animationSpeedMs || 25) <= 35 ? "Normal" : "Slow"})
                      </span>
                    </strong>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={80}
                    step={1}
                    value={config.animationSpeedMs || 25}
                    onChange={(e) => updateConfig({ animationSpeedMs: Number(e.target.value) })}
                    style={{ width: "100%" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                    <span>5ms (Ultra Fast)</span>
                    <span>80ms (Slow)</span>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                      <Zap size={13} color="var(--accent-cyan)" /> Text Transition Duration:
                    </label>
                    <strong style={{ fontSize: "12px", color: "var(--accent-cyan)" }}>
                      {config.animationSpeedMs || (config.textAnimation === "blur" ? 350 : 250)} ms
                    </strong>
                  </div>
                  <input
                    type="range"
                    min={100}
                    max={600}
                    step={50}
                    value={config.animationSpeedMs || (config.textAnimation === "blur" ? 350 : 250)}
                    onChange={(e) => updateConfig({ animationSpeedMs: Number(e.target.value) })}
                    style={{ width: "100%" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                    <span>100ms (Snappy)</span>
                    <span>600ms (Cinematic)</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. ADVANCED CUSTOM TEMPLATE & CODE ENGINE (Collapsible)                   */}
      {/* ========================================================================= */}
      <div className="card" style={{ margin: 0 }}>
        <div
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Sliders size={15} color="var(--accent-primary)" />
            <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
              Advanced Custom Code & Template Engine
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "12px" }}>
            <span>{showAdvanced ? "Hide" : "Expand"}</span>
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>

        {showAdvanced && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "14px", borderTop: "1px solid var(--border-subtle)", paddingTop: "14px" }}>
            {/* Toolbar: Custom Preset Actions */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  Editing: <strong style={{ color: "var(--text-primary)" }}>{allPresets.find((p) => p.id === activePresetId)?.name}</strong>
                  {isCurrentBuiltIn ? " (Built-in Preset)" : " (Custom User Preset)"}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {!isCurrentBuiltIn && (
                  <>
                    <button
                      type="button"
                      onClick={handleUpdateCurrentPreset}
                      className="btn-primary"
                      style={{ height: "28px", padding: "0 10px", fontSize: "11.5px" }}
                    >
                      <Save size={12} />
                      <span>Save Changes</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDeleteCurrentPreset}
                      className="btn-danger"
                      style={{ height: "28px", padding: "0 10px", fontSize: "11.5px" }}
                    >
                      <Trash2 size={12} />
                      <span>Delete Preset</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setIsCreatingNewPreset(true)}
                  className="btn-secondary"
                  style={{ height: "28px", padding: "0 10px", fontSize: "11.5px" }}
                >
                  <Plus size={12} />
                  <span>Save as New Preset</span>
                </button>
              </div>
            </div>

            {/* Code Tabs */}
            <SegmentedControl<"html" | "css">
              options={[
                { id: "html", label: "HTML Template" },
                { id: "css", label: "CSS Stylesheet" },
              ]}
              value={activeCodeTab}
              onChange={setActiveCodeTab}
              size="sm"
            />

            {/* Code Editor Textarea */}
            {activeCodeTab === "html" ? (
              <textarea
                value={config.customTemplateHtml || ""}
                onChange={(e) => updateConfig({ customTemplateHtml: e.target.value })}
                rows={10}
                style={{
                  width: "100%",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11.5px",
                  lineHeight: "1.45",
                  padding: "10px",
                  boxSizing: "border-box",
                }}
                placeholder="Enter custom HTML template using {{speaker}}, {{message}}, {{translatedMessage}}..."
              />
            ) : (
              <textarea
                value={config.customTemplateCss || ""}
                onChange={(e) => updateConfig({ customTemplateCss: e.target.value })}
                rows={12}
                style={{
                  width: "100%",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11.5px",
                  lineHeight: "1.45",
                  padding: "10px",
                  boxSizing: "border-box",
                }}
                placeholder="Enter custom CSS rules..."
              />
            )}
          </div>
        )}
      </div>

      {/* Save as New Preset Modal */}
      {isCreatingNewPreset && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: "var(--bg-panel, #161b22)",
              border: "1px solid var(--border-active)",
              borderRadius: "var(--radius-md)",
              padding: "18px 20px",
              width: "360px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              boxShadow: "0 12px 36px rgba(0, 0, 0, 0.6)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong style={{ fontSize: "13.5px", color: "var(--text-primary)" }}>Save as New Preset</strong>
              <button
                type="button"
                onClick={() => setIsCreatingNewPreset(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={14} />
              </button>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                Preset Name
              </label>
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="e.g. My Dark Floating Subtitle"
                style={{ width: "100%", fontSize: "12px", height: "32px" }}
                autoFocus
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setIsCreatingNewPreset(false)}
                className="btn-secondary"
                style={{ height: "30px", fontSize: "12px" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAsNewPreset}
                disabled={!newPresetName.trim()}
                className="btn-primary"
                style={{ height: "30px", fontSize: "12px" }}
              >
                Create Preset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
