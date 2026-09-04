import React from "react";
import { Cpu, Scan, Radio, Monitor } from "lucide-react";
import { TextractorInputView } from "./TextractorInputView";
import { OcrInputView } from "./OcrInputView";
import { LiveTranslateView } from "./LiveTranslateView";
import { OverlaySettingsView } from "./OverlaySettingsView";
import { SegmentedControl, SegmentedOption } from "../common/SegmentedControl";
import { useTextractorStore } from "../../stores/useTextractorStore";
import { useOcrStore } from "../../stores/useOcrStore";
import { useTranslationStore } from "../../stores/useTranslationStore";
import { useUIStore, LivePipelineStage } from "../../stores/useUIStore";

export type { LivePipelineStage };

interface LiveGameHubViewProps {
  onNavigateToSettings?: () => void;
}

export const LiveGameHubView: React.FC<LiveGameHubViewProps> = ({ onNavigateToSettings }) => {
  const activeStage = useUIStore((state) => state.liveGameStage);
  const setActiveStage = useUIStore((state) => state.setLiveGameStage);
  const selectedInputMode = useUIStore((state) => state.liveGameInputMode);
  const setSelectedInputMode = useUIStore((state) => state.setLiveGameInputMode);

  const isHooked = useTextractorStore((state) => state.isHooked);
  const isOcrScanning = useOcrStore((state) => state.isScanning);
  const isPaused = useTranslationStore((state) => state.isPaused);

  const stageOptions: SegmentedOption<LivePipelineStage>[] = [
    {
      id: "input",
      label: "1. Input Setup",
      icon: <Cpu size={14} />,
      badge: isHooked ? "Hooked" : isOcrScanning ? "OCR On" : undefined,
      badgeColor: isHooked ? "success" : isOcrScanning ? "cyan" : "neutral",
    },
    {
      id: "stream",
      label: "2. Live Translation",
      icon: <Radio size={14} />,
      badge: !isPaused ? "Active" : "Paused",
      badgeColor: !isPaused ? "success" : "warning",
    },
    {
      id: "overlay",
      label: "3. In-Game Overlay",
      icon: <Monitor size={14} />,
      badge: "Ctrl+Shift+L",
      badgeColor: "neutral",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", maxWidth: "1200px", margin: "0 auto" }}>
      {/* 3-Stage Pipeline Stepper in Center */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", padding: "0 0 12px 0", flexShrink: 0 }}>
        <SegmentedControl<LivePipelineStage>
          options={stageOptions}
          value={activeStage}
          onChange={setActiveStage}
          size="md"
        />
      </div>

      {/* Main Stage Content */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", width: "100%" }}>
        {/* STAGE 1: INPUT SETUP */}
        {activeStage === "input" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", width: "100%" }}>
            {/* Input Engine Selector Tabs */}
            <div className="card" style={{ margin: 0 }}>
              <div className="card-header">
                <div>
                  <span className="card-title">
                    <Cpu size={16} /> Choose Dialogue Capture Engine
                  </span>
                  <span className="card-subtitle">
                    Select how the translator captures Japanese text from your Visual Novel game
                  </span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px", marginTop: "4px" }}>
                {/* Textractor Hook Option */}
                <div
                  onClick={() => setSelectedInputMode("textractor")}
                  style={{
                    backgroundColor: selectedInputMode === "textractor" ? "var(--accent-primary-subtle)" : "var(--bg-app)",
                    border: `1.5px solid ${selectedInputMode === "textractor" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                    borderRadius: "var(--radius-md)",
                    padding: "14px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: selectedInputMode === "textractor" ? "var(--accent-primary)" : "var(--bg-surface-elevated)",
                      color: selectedInputMode === "textractor" ? "#ffffff" : "var(--text-muted)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Cpu size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "var(--text-base)", color: selectedInputMode === "textractor" ? "var(--accent-primary)" : "var(--text-primary)" }}>
                      Game Memory Hooking (Textractor)
                    </div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: "2px" }}>
                      Direct game hook (zero OCR delay, 100% accurate character dialogue)
                    </div>
                  </div>
                </div>

                {/* Screen OCR Option */}
                <div
                  onClick={() => setSelectedInputMode("ocr")}
                  style={{
                    backgroundColor: selectedInputMode === "ocr" ? "var(--accent-cyan-subtle)" : "var(--bg-app)",
                    border: `1.5px solid ${selectedInputMode === "ocr" ? "var(--accent-cyan)" : "var(--border-subtle)"}`,
                    borderRadius: "var(--radius-md)",
                    padding: "14px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: selectedInputMode === "ocr" ? "var(--accent-cyan)" : "var(--bg-surface-elevated)",
                      color: selectedInputMode === "ocr" ? "#0d1017" : "var(--text-muted)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Scan size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "var(--text-base)", color: selectedInputMode === "ocr" ? "var(--accent-cyan)" : "var(--text-primary)" }}>
                      Screen OCR Scanner (Windows OneOCR)
                    </div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: "2px" }}>
                      Ideal for browser games, emulators, RPG Maker, or untaggable engines
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Embedded Active Input View */}
            <div style={{ marginTop: "4px" }}>
              {selectedInputMode === "textractor" ? (
                <TextractorInputView onOpenPreprocessingSettings={onNavigateToSettings} />
              ) : (
                <OcrInputView onOpenPreprocessingSettings={onNavigateToSettings} />
              )}
            </div>
          </div>
        )}

        {/* STAGE 2: LIVE TRANSLATION STREAM */}
        {activeStage === "stream" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
            <LiveTranslateView />
          </div>
        )}

        {/* STAGE 3: IN-GAME OVERLAY */}
        {activeStage === "overlay" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", width: "100%" }}>
            <OverlaySettingsView />
          </div>
        )}
      </div>
    </div>
  );
};
