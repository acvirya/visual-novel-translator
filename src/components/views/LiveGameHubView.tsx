import React, { useState } from "react";
import { Cpu, Scan, Radio, Monitor, ArrowRight } from "lucide-react";
import { TextractorInputView } from "./TextractorInputView";
import { OcrInputView } from "./OcrInputView";
import { LiveTranslateView } from "./LiveTranslateView";
import { OverlaySettingsView } from "./OverlaySettingsView";

export type LivePipelineStage = "input" | "stream" | "overlay";

interface LiveGameHubViewProps {
  onNavigateToSettings?: () => void;
}

export const LiveGameHubView: React.FC<LiveGameHubViewProps> = ({ onNavigateToSettings }) => {
  const [activeStage, setActiveStage] = useState<LivePipelineStage>("stream");
  const [selectedInputMode, setSelectedInputMode] = useState<"textractor" | "ocr">("textractor");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden" }}>
      {/* 3-Stage Pipeline Stepper Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          backgroundColor: "var(--bg-panel)",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        {/* Pipeline Stages Navigation Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {/* Stage 1: Input Setup */}
          <button
            type="button"
            onClick={() => setActiveStage("input")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "7px 14px",
              borderRadius: "var(--radius-sm)",
              border: `1px solid ${activeStage === "input" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              backgroundColor: activeStage === "input" ? "rgba(88, 166, 255, 0.15)" : "var(--bg-app)",
              color: activeStage === "input" ? "var(--accent-primary)" : "var(--text-primary)",
              cursor: "pointer",
              fontWeight: activeStage === "input" ? 600 : 500,
              fontSize: "12.5px",
              transition: "all 0.15s ease",
            }}
          >
            <span
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                backgroundColor: activeStage === "input" ? "var(--accent-primary)" : "var(--border-subtle)",
                color: activeStage === "input" ? "#ffffff" : "var(--text-muted)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "10px",
                fontWeight: 700,
              }}
            >
              1
            </span>
            <Cpu size={14} />
            <span>1. Input Setup</span>
          </button>

          <ArrowRight size={13} color="var(--text-muted)" />

          {/* Stage 2: Live Stream */}
          <button
            type="button"
            onClick={() => setActiveStage("stream")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "7px 14px",
              borderRadius: "var(--radius-sm)",
              border: `1px solid ${activeStage === "stream" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              backgroundColor: activeStage === "stream" ? "rgba(88, 166, 255, 0.15)" : "var(--bg-app)",
              color: activeStage === "stream" ? "var(--accent-primary)" : "var(--text-primary)",
              cursor: "pointer",
              fontWeight: activeStage === "stream" ? 600 : 500,
              fontSize: "12.5px",
              transition: "all 0.15s ease",
            }}
          >
            <span
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                backgroundColor: activeStage === "stream" ? "var(--accent-primary)" : "var(--border-subtle)",
                color: activeStage === "stream" ? "#ffffff" : "var(--text-muted)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "10px",
                fontWeight: 700,
              }}
            >
              2
            </span>
            <Radio size={14} />
            <span>2. Live Translation</span>
          </button>

          <ArrowRight size={13} color="var(--text-muted)" />

          {/* Stage 3: Overlay */}
          <button
            type="button"
            onClick={() => setActiveStage("overlay")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "7px 14px",
              borderRadius: "var(--radius-sm)",
              border: `1px solid ${activeStage === "overlay" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              backgroundColor: activeStage === "overlay" ? "rgba(88, 166, 255, 0.15)" : "var(--bg-app)",
              color: activeStage === "overlay" ? "var(--accent-primary)" : "var(--text-primary)",
              cursor: "pointer",
              fontWeight: activeStage === "overlay" ? 600 : 500,
              fontSize: "12.5px",
              transition: "all 0.15s ease",
            }}
          >
            <span
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                backgroundColor: activeStage === "overlay" ? "var(--accent-primary)" : "var(--border-subtle)",
                color: activeStage === "overlay" ? "#ffffff" : "var(--text-muted)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "10px",
                fontWeight: 700,
              }}
            >
              3
            </span>
            <Monitor size={14} />
            <span>3. In-Game Overlay</span>
          </button>
        </div>
      </div>

      {/* Main Stage Content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", position: "relative" }}>
        {/* STAGE 1: INPUT SETUP */}
        {activeStage === "input" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "16px", maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
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
                    backgroundColor: selectedInputMode === "textractor" ? "rgba(88, 166, 255, 0.1)" : "var(--bg-app)",
                    border: `1.5px solid ${selectedInputMode === "textractor" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                    borderRadius: "var(--radius-sm)",
                    padding: "12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <Cpu size={22} color={selectedInputMode === "textractor" ? "var(--accent-primary)" : "var(--text-muted)"} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "13px", color: selectedInputMode === "textractor" ? "var(--accent-primary)" : "var(--text-primary)" }}>
                      Game Memory Hooking (Textractor)
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      Recommended for native Windows VNs (100% accurate, zero OCR artifacts)
                    </div>
                  </div>
                </div>

                {/* Screen OCR Option */}
                <div
                  onClick={() => setSelectedInputMode("ocr")}
                  style={{
                    backgroundColor: selectedInputMode === "ocr" ? "rgba(88, 166, 255, 0.1)" : "var(--bg-app)",
                    border: `1.5px solid ${selectedInputMode === "ocr" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                    borderRadius: "var(--radius-sm)",
                    padding: "12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <Scan size={22} color={selectedInputMode === "ocr" ? "var(--accent-primary)" : "var(--text-muted)"} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "13px", color: selectedInputMode === "ocr" ? "var(--accent-primary)" : "var(--text-primary)" }}>
                      Screen OCR Scanner (Windows OneOCR)
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      Ideal for emulators, browser games, RPG Maker, or untaggable engines
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
          <div style={{ height: "100%", width: "100%" }}>
            <LiveTranslateView />
          </div>
        )}

        {/* STAGE 3: IN-GAME OVERLAY */}
        {activeStage === "overlay" && (
          <div style={{ padding: "16px", maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
            <OverlaySettingsView />
          </div>
        )}
      </div>
    </div>
  );
};
