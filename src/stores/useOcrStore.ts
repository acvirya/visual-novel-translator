import { create } from "zustand";
import { OcrEngineStatus, OcrRegion, OcrScanResult } from "../types";

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

export const useOcrStore = create<OcrState>((set) => {
  // Load persisted values from localStorage
  const savedRegions = (() => {
    try {
      const saved = localStorage.getItem("vn_ocr_regions");
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_REGIONS;
  })();

  const savedScale = Number(localStorage.getItem("vn_ocr_scale_percent")) || 100;
  const savedInterval = Number(localStorage.getItem("vn_ocr_scan_interval")) || 350;
  const savedCustomPath = localStorage.getItem("vn_ocr_custom_path") || "";
  const savedTargetMonitor = localStorage.getItem("vn_ocr_target_monitor") || "monitor_1";
  const savedAutoForward = localStorage.getItem("vn_ocr_auto_forward") !== "false";
  const savedEnableMotion = localStorage.getItem("vn_ocr_enable_motion") !== "false";
  const savedSettleTime = Number(localStorage.getItem("vn_ocr_settle_time_ms")) || 250;
  const savedMotionSens = Number(localStorage.getItem("vn_ocr_motion_sensitivity")) || 3;
  const savedIgnoreBlinking = localStorage.getItem("vn_ocr_ignore_blinking") !== "false";

  return {
    engineStatus: { isAvailable: false, dllPath: "", modelPath: "" },
    isScanning: false,
    regions: savedRegions,
    scalePercent: savedScale,
    scanInterval: savedInterval,
    targetMonitor: savedTargetMonitor,
    customPath: savedCustomPath,
    autoForwardToOverlay: savedAutoForward,
    enableMotionDetection: savedEnableMotion,
    settleTimeMs: savedSettleTime,
    motionSensitivity: savedMotionSens,
    ignoreBlinkingPrompt: savedIgnoreBlinking,
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
        localStorage.setItem("vn_ocr_regions", JSON.stringify(nextRegions));
        return { regions: nextRegions };
      }),
    setScalePercent: (scalePercent) => {
      localStorage.setItem("vn_ocr_scale_percent", String(scalePercent));
      set({ scalePercent });
    },
    setScanInterval: (scanInterval) => {
      localStorage.setItem("vn_ocr_scan_interval", String(scanInterval));
      set({ scanInterval });
    },
    setTargetMonitor: (targetMonitor) => {
      localStorage.setItem("vn_ocr_target_monitor", targetMonitor);
      set({ targetMonitor });
    },
    setCustomPath: (customPath) => {
      localStorage.setItem("vn_ocr_custom_path", customPath);
      set({ customPath });
    },
    setAutoForwardToOverlay: (autoForwardToOverlay) => {
      localStorage.setItem("vn_ocr_auto_forward", String(autoForwardToOverlay));
      set({ autoForwardToOverlay });
    },
    setEnableMotionDetection: (enableMotionDetection) => {
      localStorage.setItem("vn_ocr_enable_motion", String(enableMotionDetection));
      set({ enableMotionDetection });
    },
    setSettleTimeMs: (settleTimeMs) => {
      localStorage.setItem("vn_ocr_settle_time_ms", String(settleTimeMs));
      set({ settleTimeMs });
    },
    setMotionSensitivity: (motionSensitivity) => {
      localStorage.setItem("vn_ocr_motion_sensitivity", String(motionSensitivity));
      set({ motionSensitivity });
    },
    setIgnoreBlinkingPrompt: (ignoreBlinkingPrompt) => {
      localStorage.setItem("vn_ocr_ignore_blinking", String(ignoreBlinkingPrompt));
      set({ ignoreBlinkingPrompt });
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
