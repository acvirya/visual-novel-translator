import { invoke } from "@tauri-apps/api/core";
import { OcrEngineStatus, OcrRegion, OcrScanResult, OcrStabilityConfig } from "../types";
import { useOcrStore } from "../stores/useOcrStore";
import { executePreprocessingPipeline, cleanSpeakerName } from "../utils/textPreprocessor";
import { translationManager } from "./translationManager";

export class OcrService {
  private static scanTimer: ReturnType<typeof setTimeout> | null = null;
  private static isProcessing = false;
  private static lastSentText = { speaker: "", message: "" };
  private static consecutiveErrorCount = 0;

  /**
   * Auto-detect OneOCR files from Windows Snipping Tool directory
   */
  public static async detectOneOcrPath(customPath?: string): Promise<OcrEngineStatus> {
    try {
      const res = await invoke<OcrEngineStatus>("detect_oneocr_path", {
        customPath: customPath || null,
      });
      useOcrStore.getState().setEngineStatus(res);
      return res;
    } catch (err: any) {
      const errorStatus: OcrEngineStatus = {
        isAvailable: false,
        dllPath: "",
        modelPath: "",
        error: String(err),
      };
      useOcrStore.getState().setEngineStatus(errorStatus);
      return errorStatus;
    }
  }

  /**
   * Capture cropped preview screenshots of given regions as base64 data URLs
   */
  public static async captureRegionsPreview(
    regions: OcrRegion[]
  ): Promise<{ [regionId: string]: string }> {
    useOcrStore.getState().setIsLoadingSnapshot(true);
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1.0 : 1.0;
    try {
      const previews = await invoke<{ [regionId: string]: string }>(
        "capture_regions_preview",
        {
          regions: regions.map((r) => ({
            id: r.id,
            name: r.name,
            role: r.role,
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.round(r.width),
            height: Math.round(r.height),
            physicalX: r.physicalX != null ? Math.round(r.physicalX) : Math.round(r.x * dpr),
            physicalY: r.physicalY != null ? Math.round(r.physicalY) : Math.round(r.y * dpr),
            physicalWidth: r.physicalWidth != null ? Math.round(r.physicalWidth) : Math.round(r.width * dpr),
            physicalHeight: r.physicalHeight != null ? Math.round(r.physicalHeight) : Math.round(r.height * dpr),
          })),
        }
      );
      const res = previews || {};
      useOcrStore.getState().setRegionSnapshots(res);
      return res;
    } catch (err) {
      console.warn("Failed to capture region previews:", err);
      return {};
    } finally {
      useOcrStore.getState().setIsLoadingSnapshot(false);
    }
  }

  /**
   * Run a single OneOCR scan on the specified regions with optional motion stability detection
   */
  public static async runOneOcrScan(
    regions: OcrRegion[],
    scalePercent: number = 100,
    customPath?: string,
    stabilityConfig?: OcrStabilityConfig
  ): Promise<OcrScanResult> {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1.0 : 1.0;
    try {
      const result = await invoke<OcrScanResult>("run_oneocr_scan", {
        regions: regions.map((r) => ({
          id: r.id,
          name: r.name,
          role: r.role,
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
          physicalX: r.physicalX != null ? Math.round(r.physicalX) : Math.round(r.x * dpr),
          physicalY: r.physicalY != null ? Math.round(r.physicalY) : Math.round(r.y * dpr),
          physicalWidth: r.physicalWidth != null ? Math.round(r.physicalWidth) : Math.round(r.width * dpr),
          physicalHeight: r.physicalHeight != null ? Math.round(r.physicalHeight) : Math.round(r.height * dpr),
        })),
        scalePercent: Math.max(10, Math.min(300, scalePercent)),
        customPath: customPath || null,
        stabilityConfig: stabilityConfig || null,
      });
      return result;
    } catch (err: any) {
      throw new Error(typeof err === "string" ? err : err.message || "OCR scan failed");
    }
  }

  /**
   * Start autonomous background OCR loop
   */
  public static startAutoScan() {
    if (this.scanTimer) return;
    this.consecutiveErrorCount = 0;
    useOcrStore.getState().setIsScanning(true);
    this.scheduleNextScan(10);
  }

  /**
   * Stop autonomous background OCR loop
   */
  public static stopAutoScan() {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    this.consecutiveErrorCount = 0;
    this.isProcessing = false;
    useOcrStore.getState().setIsScanning(false);
  }

  private static scheduleNextScan(delayMs?: number) {
    if (!useOcrStore.getState().isScanning) return;
    const interval = delayMs !== undefined ? delayMs : useOcrStore.getState().scanInterval;
    this.scanTimer = setTimeout(() => this.executeScanCycle(), interval);
  }

  private static async executeScanCycle() {
    const store = useOcrStore.getState();
    if (!store.isScanning) {
      this.scanTimer = null;
      return;
    }

    if (this.isProcessing) {
      this.scheduleNextScan();
      return;
    }

    // Skip scanning if no regions are configured (M9)
    if (!store.regions || store.regions.length === 0) {
      this.scheduleNextScan(1000);
      return;
    }

    this.isProcessing = true;
    let nextDelay: number | undefined = undefined;

    try {
      const stabilityConfig: OcrStabilityConfig = {
        enableMotionDetection: store.enableMotionDetection,
        settleTimeMs: store.settleTimeMs,
        motionSensitivity: store.motionSensitivity,
        ignoreBlinkingPrompt: store.ignoreBlinkingPrompt,
      };

      const result = await this.runOneOcrScan(
        store.regions,
        store.scalePercent,
        store.customPath || undefined,
        stabilityConfig
      );

      this.consecutiveErrorCount = 0;
      store.setScanResult(result);

      // Preprocess and forward to Translation pipeline if dialogue is settled and changed
      const cleanSpk = result.speaker ? cleanSpeakerName(executePreprocessingPipeline(result.speaker, "ocr")) : "";
      const cleanMsg = result.message ? executePreprocessingPipeline(result.message, "ocr").trim() : "";

      const hasText = cleanMsg.length > 0;
      const isSettled = result.isSettled;
      const hasChanged = cleanSpk !== this.lastSentText.speaker || cleanMsg !== this.lastSentText.message;

      if (hasText && isSettled && hasChanged) {
        this.lastSentText = { speaker: cleanSpk, message: cleanMsg };
        translationManager.translate({
          speaker: cleanSpk || undefined,
          message: cleanMsg,
          sourceType: "ocr",
        });
      }
    } catch (err: any) {
      this.consecutiveErrorCount++;
      store.setScanError(err?.message || String(err));
      // Exponential backoff up to 5000ms on repeated errors (H4)
      nextDelay = Math.min(5000, store.scanInterval * Math.pow(1.5, Math.min(this.consecutiveErrorCount, 6)));
    } finally {
      this.isProcessing = false;
      this.scheduleNextScan(nextDelay);
    }
  }

  /**
   * Open the dedicated transparent fullscreen region selector window
   */
  public static async openRegionSelector(monitorName?: string): Promise<void> {
    try {
      const channel = new BroadcastChannel("vn_ocr_channel");
      channel.postMessage({ type: "OPEN_SELECTOR" });
      channel.close();
      await invoke("open_region_selector_overlay", {
        monitorName: monitorName || null,
      });
    } catch (err) {
      console.warn("Failed to open region selector overlay:", err);
    }
  }

  /**
   * Close the region selector window
   */
  public static async closeRegionSelector(): Promise<void> {
    try {
      await invoke("close_region_selector_overlay");
    } catch (err) {
      console.warn("Failed to close region selector overlay:", err);
    }
  }

  /**
   * Dispose and cleanup all running scans and resources
   */
  public static dispose(): void {
    this.stopAutoScan();
  }
}

export const ocrService = OcrService;
