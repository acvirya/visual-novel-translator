import { create } from "zustand";
import { OcrEngineStatus, OcrRegion, OcrScanResult } from "../types";
import { settingsManager } from "../services/settingsManager";

export interface OcrState {
  engineStatus: OcrEngineStatus;
  isScanning: boolean;
  regions: OcrRegion[];
  scalePercent: number;
  scanInterval: number;
  targetMonitor: string;
  customPath: string;
  autoForwardToOverlay: boolean;
  enableMotionDetection: boolean;
  settleTimeMs: number;
  motionSensitivity: number;
  ignoreBlinkingPrompt: boolean;
  latestSpeaker: string;
  latestMessage: string;
  latestRawText: string;
  latencyMs: number;
  isSettled: boolean;
  scanError: string | null;
  regionSnapshots: { [regionId: string]: string };
  isLoadingSnapshot: boolean;

  // Setters & Actions
  setEngineStatus: (status: OcrEngineStatus) => void;
  setIsScanning: (isScanning: boolean) => void;
  setRegions: (regions: OcrRegion[] | ((prev: OcrRegion[]) => OcrRegion[])) => void;
  setScalePercent: (scale: number) => void;
  setScanInterval: (interval: number) => void;
  setTargetMonitor: (monitor: string) => void;
  setCustomPath: (path: string) => void;
  setAutoForwardToOverlay: (autoForward: boolean) => void;
  setEnableMotionDetection: (enable: boolean) => void;
  setSettleTimeMs: (ms: number) => void;
  setMotionSensitivity: (sens: number) => void;
  setIgnoreBlinkingPrompt: (ignore: boolean) => void;
  setScanResult: (result: OcrScanResult) => void;
  setScanError: (error: string | null) => void;
  setRegionSnapshots: (snapshots: { [regionId: string]: string }) => void;
  setIsLoadingSnapshot: (loading: boolean) => void;
  resetScanResult: () => void;
}

const DEFAULT_REGIONS: OcrRegion[] = [
  {
    id: "region_1",
    name: "Region 1 (Dialogue)",
    role: "dialogue",
    x: 350,
    y: 750,
    width: 1220,
    height: 250,
    color: "#4e73df",
  },
  {
    id: "region_2",
    name: "Region 2 (Speaker)",
    role: "speaker",
    x: 350,
    y: 690,
    width: 320,
    height: 55,
    color: "#f6c23e",
  },
];

let isOcrSettingsSubscribed = false;

export const useOcrStore = create<OcrState>((set) => {
  const ocrSettings = settingsManager.getOcr();

  if (!isOcrSettingsSubscribed) {
    isOcrSettingsSubscribed = true;
    settingsManager.subscribe((newSettings) => {
      const o = newSettings.ocr;
      set({
        regions: o.regions || DEFAULT_REGIONS,
        scalePercent: o.scalePercent || 100,
        scanInterval: o.scanInterval || 350,
        targetMonitor: o.targetMonitor || "monitor_1",
        customPath: o.customPath || "",
        autoForwardToOverlay: o.autoForwardToOverlay !== false,
        enableMotionDetection: o.stability?.enableMotionDetection !== false,
        settleTimeMs: o.stability?.settleTimeMs ?? 250,
        motionSensitivity: o.stability?.motionSensitivity ?? 3,
        ignoreBlinkingPrompt: o.stability?.ignoreBlinkingPrompt !== false,
      });
    });
  }

  return {
    engineStatus: { isAvailable: false, dllPath: "", modelPath: "" },
    isScanning: false,
    regions: ocrSettings.regions || DEFAULT_REGIONS,
    scalePercent: ocrSettings.scalePercent || 100,
    scanInterval: ocrSettings.scanInterval || 350,
    targetMonitor: ocrSettings.targetMonitor || "monitor_1",
    customPath: ocrSettings.customPath || "",
    autoForwardToOverlay: ocrSettings.autoForwardToOverlay !== false,
    enableMotionDetection: ocrSettings.stability?.enableMotionDetection !== false,
    settleTimeMs: ocrSettings.stability?.settleTimeMs ?? 250,
    motionSensitivity: ocrSettings.stability?.motionSensitivity ?? 3,
    ignoreBlinkingPrompt: ocrSettings.stability?.ignoreBlinkingPrompt !== false,
    latestSpeaker: "",
    latestMessage: "",
    latestRawText: "",
    latencyMs: 0,
    isSettled: true,
    scanError: null,
    regionSnapshots: {},
    isLoadingSnapshot: false,

    setEngineStatus: (status) => set({ engineStatus: status }),
    setIsScanning: (isScanning) => set({ isScanning }),
    setRegions: (regionsOrFn) =>
      set((state) => {
        const nextRegions = typeof regionsOrFn === "function" ? regionsOrFn(state.regions) : regionsOrFn;
        settingsManager.updateOcr({ regions: nextRegions });
        return { regions: nextRegions };
      }),
    setScalePercent: (scalePercent) => {
      settingsManager.updateOcr({ scalePercent });
      set({ scalePercent });
    },
    setScanInterval: (scanInterval) => {
      settingsManager.updateOcr({ scanInterval });
      set({ scanInterval });
    },
    setTargetMonitor: (targetMonitor) => {
      settingsManager.updateOcr({ targetMonitor });
      set({ targetMonitor });
    },
    setCustomPath: (customPath) => {
      settingsManager.updateOcr({ customPath });
      set({ customPath });
    },
    setAutoForwardToOverlay: (autoForwardToOverlay) => {
      settingsManager.updateOcr({ autoForwardToOverlay });
      set({ autoForwardToOverlay });
    },
    setEnableMotionDetection: (enableMotionDetection) => {
      set((state) => {
        const stability = {
          enableMotionDetection,
          settleTimeMs: state.settleTimeMs,
          motionSensitivity: state.motionSensitivity,
          ignoreBlinkingPrompt: state.ignoreBlinkingPrompt,
        };
        settingsManager.updateOcr({ stability });
        return { enableMotionDetection };
      });
    },
    setSettleTimeMs: (settleTimeMs) => {
      set((state) => {
        const stability = {
          enableMotionDetection: state.enableMotionDetection,
          settleTimeMs,
          motionSensitivity: state.motionSensitivity,
          ignoreBlinkingPrompt: state.ignoreBlinkingPrompt,
        };
        settingsManager.updateOcr({ stability });
        return { settleTimeMs };
      });
    },
    setMotionSensitivity: (motionSensitivity) => {
      set((state) => {
        const stability = {
          enableMotionDetection: state.enableMotionDetection,
          settleTimeMs: state.settleTimeMs,
          motionSensitivity,
          ignoreBlinkingPrompt: state.ignoreBlinkingPrompt,
        };
        settingsManager.updateOcr({ stability });
        return { motionSensitivity };
      });
    },
    setIgnoreBlinkingPrompt: (ignoreBlinkingPrompt) => {
      set((state) => {
        const stability = {
          enableMotionDetection: state.enableMotionDetection,
          settleTimeMs: state.settleTimeMs,
          motionSensitivity: state.motionSensitivity,
          ignoreBlinkingPrompt,
        };
        settingsManager.updateOcr({ stability });
        return { ignoreBlinkingPrompt };
      });
    },
    setScanResult: (result) =>
      set({
        latestSpeaker: result.speaker,
        latestMessage: result.message,
        latestRawText: result.rawText,
        latencyMs: result.latencyMs,
        isSettled: result.isSettled,
        scanError: null,
      }),
    setScanError: (scanError) => set({ scanError }),
    setRegionSnapshots: (regionSnapshots) => set({ regionSnapshots }),
    setIsLoadingSnapshot: (isLoadingSnapshot) => set({ isLoadingSnapshot }),
    resetScanResult: () =>
      set({
        latestSpeaker: "",
        latestMessage: "",
        latestRawText: "",
        latencyMs: 0,
        isSettled: true,
        scanError: null,
      }),
  };
});
