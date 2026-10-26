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

export function LiveGameHubView({ onNavigateToSettings }: { onNavigateToSettings?: () => void }) {
  const activeStage = useUIStore((state) => state.liveGameStage);
  const setActiveStage = useUIStore((state) => state.setLiveGameStage);
  const inputMode = useUIStore((state) => state.liveGameInputMode);
  const setInputMode = useUIStore((state) => state.setLiveGameInputMode);
  const isHooked = useTextractorStore((state) => state.isHooked);
  const isScanning = useOcrStore((state) => state.isScanning);
  const isPaused = useTranslationStore((state) => state.isPaused);
  const stageOptions: SegmentedOption<LivePipelineStage>[] = [
    { id: "input", label: "Capture setup", icon: <Cpu size={14} />, badge: isHooked ? "Connected" : isScanning ? "Scanning" : undefined, badgeColor: "success" },
    { id: "stream", label: "Live translation", icon: <Radio size={14} />, badge: isPaused ? "Paused" : isHooked || isScanning ? "Live" : "Ready", badgeColor: isPaused ? "warning" : isHooked || isScanning ? "success" : "neutral" },
    { id: "overlay", label: "In-game overlay", icon: <Monitor size={14} /> },
  ];

  return (
    <div className="workspace-view">
      <div className="workspace-tabs"><SegmentedControl options={stageOptions} value={activeStage} onChange={setActiveStage} /></div>
      <div className="workspace-body">
        {activeStage === "input" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <section className="card" style={{ margin: 0 }} aria-labelledby="capture-method-title">
              <div className="card-header"><div><h2 id="capture-method-title" className="card-title">Start with your game</h2><p className="card-subtitle">Choose how to capture the dialogue. You can switch methods at any time.</p></div></div>
              <div className="capture-options">
                <button type="button" className={`capture-option${inputMode === "textractor" ? " is-selected" : ""}`} aria-pressed={inputMode === "textractor"} onClick={() => setInputMode("textractor")}><Cpu size={21} /><span><strong>Connect to a game</strong><small>Read dialogue directly with Textractor. Best for supported visual novel engines.</small></span></button>
                <button type="button" className={`capture-option${inputMode === "ocr" ? " is-selected" : ""}`} aria-pressed={inputMode === "ocr"} onClick={() => setInputMode("ocr")}><Scan size={21} /><span><strong>Read from the screen</strong><small>Capture a dialogue area with OneOCR. Useful for emulators and browser games.</small></span></button>
              </div>
            </section>
            {inputMode === "textractor" ? <TextractorInputView onOpenPreprocessingSettings={onNavigateToSettings} /> : <OcrInputView onOpenPreprocessingSettings={onNavigateToSettings} />}
          </div>
        )}
        {activeStage === "stream" && <LiveTranslateView />}
        {activeStage === "overlay" && <OverlaySettingsView />}
      </div>
    </div>
  );
}
