import { useConfirmation } from "../common/ConfirmationProvider";
import React, { useState, useEffect, useRef } from "react";
import { OverlayConfig } from "../../types";
import {
  overlayChannel,
  OverlayEvent,
} from "../../utils/overlayChannel";
import {
  OVERLAY_PRESETS,
  compileOverlayTemplate,
  sanitizeCustomCss,
  getOverlayAnimationCss,
  TemplatePreset,
  loadUserCustomPresets,
  saveUserCustomPresets,
  getAllOverlayPresets,
  isBuiltInPreset,
} from "../../utils/overlayTemplateEngine";
import { settingsManager } from "../../services/settingsManager";
import { shortcutService } from "../../services/shortcutService";
import { TauriBridge } from "../../services/tauriBridge";
import { OverlayControlBar, MonitorInfo } from "./overlay/OverlayControlBar";
import { OverlayPreviewCard } from "./overlay/OverlayPreviewCard";
import { OverlayAnimationSection } from "./overlay/OverlayAnimationSection";
import { OverlayTemplateEditor } from "./overlay/OverlayTemplateEditor";

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
  const confirm = useConfirmation();
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

  // Searchable Preset Combobox State
  const [isPresetDropdownOpen, setIsPresetDropdownOpen] = useState<boolean>(false);
  const [presetSearchQuery, setPresetSearchQuery] = useState<string>("");
  const presetDropdownRef = useRef<HTMLDivElement>(null);

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
        const list = await TauriBridge.getMonitors();
        if (list && list.length > 0) {
          setMonitors(list);
          const primary = list.find((m) => m.is_primary) || list[0];
          const hasSelected = list.some((m) => m.name === config.targetMonitor);
          if (!hasSelected && primary) {
            updateConfig({ targetMonitor: primary.name });
          }
        }
      } catch {
        // Fallback for non-Tauri dev preview
      }
    }
    loadMonitors();
  }, []);

  // Listen to position saves and config updates from actual overlay window
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
        setSaveNotification("Overlay position saved!");
        setTimeout(() => setSaveNotification(null), 3000);
      } else if (event.type === "CONFIG_UPDATE") {
        setConfig((prev) => ({
          ...prev,
          ...event.config,
        }));
      } else if (event.type === "SET_EDIT_MODE") {
        setIsEditingPosition(event.isEditing);
      }
    });

    const unsubSettings = settingsManager.subscribe((settings) => {
      if (settings.overlay?.config) {
        setConfig((prev) => ({
          ...prev,
          ...settings.overlay.config,
        }));
      }
    });

    return () => {
      unsubscribe();
      unsubSettings();
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
  const handleSaveAsNewPreset = (presetName: string) => {
    const newId = `user_preset_${Date.now()}`;
    const newPreset: TemplatePreset = {
      id: newId,
      name: presetName,
      description: "User customized overlay template",
      html: config.customTemplateHtml || OVERLAY_PRESETS[0].html,
      css: config.customTemplateCss || OVERLAY_PRESETS[0].css,
    };

    const updatedList = [...customPresets, newPreset];
    setCustomPresets(updatedList);
    saveUserCustomPresets(updatedList);
    settingsManager.updateOverlay({ userCustomPresets: updatedList });

    updateConfig({ templatePreset: newId });
    showFeedbackNotification(`Created preset: "${newPreset.name}"`);
  };

  // Save / Update Current Custom Preset
  const handleUpdateCurrentPreset = () => {
    confirm({ title: "Replace saved overlay preset?", message: "Overwrite this preset with the current HTML and CSS?", confirmText: "Replace preset", variant: "warning" }, () => {
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
    });
  };

  // Delete Current Custom Preset
  const handleDeleteCurrentPreset = () => {
    confirm({ title: "Delete overlay preset?", message: "Remove this custom HTML/CSS preset? This cannot be undone.", confirmText: "Delete preset" }, () => {
      if (isCurrentBuiltIn) return;
      const updatedList = customPresets.filter((p) => p.id !== activePresetId);
      setCustomPresets(updatedList);
      saveUserCustomPresets(updatedList);
      settingsManager.updateOverlay({ userCustomPresets: updatedList });

      handleApplyPreset(OVERLAY_PRESETS[0]);
      showFeedbackNotification("Custom preset deleted.");
    });
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
        await TauriBridge.showOverlay({
          monitorName: config.targetMonitor,
          x: Math.round(config.x),
          y: Math.round(config.y),
          width: Math.round(config.width),
          height: Math.round(config.height),
          isClickThrough: config.isClickThrough,
        });
      } else {
        await TauriBridge.hideOverlay();
        setIsEditingPosition(false);
      }
    } catch {
      // Non-Tauri fallback
    }
  };

  // Open / Enter Edit Box Mode
  const handleOpenEditMode = async () => {
    // If overlay is not enabled yet, enable it so reposition mode is visible
    if (!config.isEnabled) {
      updateConfig({ isEnabled: true });
    }

    setIsEditingPosition(true);
    shortcutService.setOverlayClickThrough(false);

    // Retrieve freshest config from settingsManager to guarantee accurate coordinates
    const latestSaved = settingsManager.getOverlay().config;
    const activeConfig = {
      ...config,
      ...(latestSaved || {}),
    };

    overlayChannel.send({ type: "SET_EDIT_MODE", isEditing: true });

    try {
      await TauriBridge.setOverlayEditMode({
        isEditing: true,
        monitorName: activeConfig.targetMonitor,
        x: Math.round(activeConfig.x),
        y: Math.round(activeConfig.y),
        width: Math.round(activeConfig.width),
        height: Math.round(activeConfig.height),
        isClickThrough: false,
      });
    } catch {
      // Non-Tauri fallback
    }
  };

  // Dynamically update overlay window bounds when inputs change in settings
  useEffect(() => {
    if (config.isEnabled && !isEditingPosition) {
      TauriBridge.updateOverlayBounds({
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
  const compiledCss = sanitizeCustomCss(config.customTemplateCss || OVERLAY_PRESETS[0].css);
  const animCss = getOverlayAnimationCss(config.textAnimation, config.animationSpeedMs);
  const rootVars = `:root { --speaker-font-size: ${speakerSize}px; --message-font-size: ${messageSize}px; --font-size: ${messageSize}px; }`;
  const animClass = config.textAnimation && config.textAnimation !== "none" && config.textAnimation !== "typewriter" ? `vn-anim-${config.textAnimation}` : "";
  const compiledPreviewHtml = `<style>${rootVars}\n${animCss}\n${compiledCss}</style><div class="${animClass}">${compiledHtml}</div>`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", width: "100%", minWidth: 0 }}>
      {/* 1. Quick Overlay Control Bar */}
      <OverlayControlBar
        config={config}
        monitors={monitors}
        saveNotification={saveNotification}
        onUpdateConfig={updateConfig}
        onToggleOverlay={handleToggleOverlay}
        onOpenEditMode={handleOpenEditMode}
      />

      {/* 2. Preset & Live Preview Card */}
      <OverlayPreviewCard
        config={config}
        allPresets={allPresets}
        filteredPresets={filteredPresets}
        activePresetId={activePresetId}
        presetSearchQuery={presetSearchQuery}
        isPresetDropdownOpen={isPresetDropdownOpen}
        presetDropdownRef={presetDropdownRef}
        sampleTextType={sampleTextType}
        previewAnimTick={previewAnimTick}
        compiledPreviewHtml={compiledPreviewHtml}
        onSetSampleTextType={setSampleTextType}
        onSetPresetSearchQuery={setPresetSearchQuery}
        onSetIsPresetDropdownOpen={setIsPresetDropdownOpen}
        onApplyPreset={handleApplyPreset}
        onUpdateConfig={updateConfig}
      />

      {/* 3. Text Animation & Streaming Effects */}
      <OverlayAnimationSection
        config={config}
        onUpdateConfig={updateConfig}
        onReplayPreview={handleReplayPreview}
      />

      {/* 4. Advanced Custom Template & Code Engine */}
      <OverlayTemplateEditor
        config={config}
        allPresets={allPresets}
        activePresetId={activePresetId}
        isCurrentBuiltIn={isCurrentBuiltIn}
        onUpdateConfig={updateConfig}
        onUpdateCurrentPreset={handleUpdateCurrentPreset}
        onDeleteCurrentPreset={handleDeleteCurrentPreset}
        onSaveAsNewPreset={handleSaveAsNewPreset}
      />
    </div>
  );
};
