import { TauriBridge } from "./tauriBridge";
import { OcrEngineStatus, OcrRegion, OcrScanResult, OcrStabilityConfig } from "../types";
import { useOcrStore } from "../stores/useOcrStore";
import { executePreprocessingPipeline, cleanSpeakerName } from "../utils/textPreprocessor";
import { translationManager } from "./translationManager";
import { logger } from "./loggerService";
import { settingsManager } from "./settingsManager";

/**
 * Maps logical OCR region coordinates to physical screen coordinates using device pixel ratio (M5)
 */
function mapRegionsToPhysical(regions: OcrRegion[], dpr: number) {
  return regions.map((r) => {
    const hasValidPhysical =
      r.physicalWidth != null &&
      r.physicalHeight != null &&
      r.physicalWidth > 0 &&
      r.physicalHeight > 0 &&
      r.physicalX != null &&
      r.physicalY != null;

    return {
      id: r.id,
      name: r.name,
      role: r.role,
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
      physicalX: hasValidPhysical ? Math.round(r.physicalX!) : Math.round(r.x * dpr),
      physicalY: hasValidPhysical ? Math.round(r.physicalY!) : Math.round(r.y * dpr),
      physicalWidth: hasValidPhysical ? Math.round(r.physicalWidth!) : Math.round(r.width * dpr),
      physicalHeight: hasValidPhysical ? Math.round(r.physicalHeight!) : Math.round(r.height * dpr),
    };
  });
}

export class OcrService {
  private static scanTimer: ReturnType<typeof setTimeout> | null = null;
  private static isProcessing = false;
  private static lastSentText = { speaker: "", message: "" };
  private static consecutiveErrorCount = 0;
  private static scanSessionId = 0;
  private static isScanningActive = false;

  /**
   * Auto-detect OneOCR files from Windows Snipping Tool directory
   */
  public static async detectOneOcrPath(customPath?: string): Promise<OcrEngineStatus> {
    try {
      const res = await TauriBridge.detectOneOcrPath(customPath);
      useOcrStore.getState().setEngineStatus(res);
      return res;
    } catch (err: any) {
      const errorStatus: OcrEngineStatus = {
        isAvailable: false,
        dllPath: "",
        modelPath: "",
        error: err?.message || "Failed to detect OneOCR",
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
      const mappedRegions = mapRegionsToPhysical(regions, dpr);
      const previews = await TauriBridge.captureRegionsPreview(mappedRegions);
      const res = previews || {};
      useOcrStore.getState().setRegionSnapshots(res);
      return res;
    } catch (err) {
      logger.warn("OCR", `Failed to capture region previews: ${err}`);
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
      const mappedRegions = mapRegionsToPhysical(regions, dpr);
      const result = await TauriBridge.runOneOcrScan(
        mappedRegions,
        Math.max(10, Math.min(300, scalePercent)),
        customPath || null,
        stabilityConfig || null
      );
      return result;
    } catch (err: any) {
      throw new Error(typeof err === "string" ? err : err.message || "OCR scan failed");
    }
  }

  /**
   * Start autonomous background OCR loop
   */
  public static startAutoScan() {
    if (this.isScanningActive) return;
    this.isScanningActive = true;
    this.scanSessionId++;
    const currentSession = this.scanSessionId;

    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    this.consecutiveErrorCount = 0;
    this.lastSentText = { speaker: "", message: "" };
    useOcrStore.getState().setIsScanning(true);
    this.scheduleNextScan(10, currentSession);
  }

  /**
   * Stop autonomous background OCR loop
   */
  public static stopAutoScan() {
    this.isScanningActive = false;
    this.scanSessionId++;
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    this.consecutiveErrorCount = 0;
    this.lastSentText = { speaker: "", message: "" };
    useOcrStore.getState().setIsScanning(false);
  }

  private static scheduleNextScan(delayMs?: number, sessionId?: number) {
    const currentSession = sessionId ?? this.scanSessionId;
    if (!this.isScanningActive || currentSession !== this.scanSessionId) return;
    if (!useOcrStore.getState().isScanning) return;

    const interval = delayMs !== undefined ? delayMs : useOcrStore.getState().scanInterval;
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
    }
    this.scanTimer = setTimeout(() => this.executeScanCycle(currentSession), interval);
  }

  private static async executeScanCycle(sessionId: number) {
    if (!this.isScanningActive || sessionId !== this.scanSessionId) {
      this.scanTimer = null;
      return;
    }

    const store = useOcrStore.getState();
    if (!store.isScanning) {
      this.scanTimer = null;
      return;
    }

    if (this.isProcessing) {
      this.scheduleNextScan(undefined, sessionId);
      return;
    }

    // Skip scanning if no regions are configured (M9)
    const regionsSnapshot = (store.regions || []).map((r) => ({ ...r }));
    if (regionsSnapshot.length === 0) {
      this.scheduleNextScan(1000, sessionId);
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
        regionsSnapshot,
        store.scalePercent,
        store.customPath || undefined,
        stabilityConfig
      );

      // Discard if stopped while awaiting IPC
      if (!this.isScanningActive || sessionId !== this.scanSessionId) {
        return;
      }

      this.consecutiveErrorCount = 0;
      store.setScanResult(result);

      // Preprocess and forward to Translation pipeline if dialogue is settled and changed
      const cleanSpk = result.speaker ? cleanSpeakerName(executePreprocessingPipeline(result.speaker, "ocr")) : "";
      const rawMsg = result.message || result.rawText || "";
      const cleanMsg = rawMsg ? executePreprocessingPipeline(rawMsg, "ocr").trim() : "";

      const hasText = cleanMsg.length > 0;
      const isSettled = result.isSettled !== false;
      const hasChanged = cleanSpk !== this.lastSentText.speaker || cleanMsg !== this.lastSentText.message;

      if (store.autoForwardToOverlay && hasText && isSettled && hasChanged) {
        this.lastSentText = { speaker: cleanSpk, message: cleanMsg };
        translationManager.translate({
          speaker: cleanSpk || undefined,
          message: cleanMsg,
          sourceType: "ocr",
        });
      }
    } catch (err: unknown) {
      if (!this.isScanningActive || sessionId !== this.scanSessionId) {
        return;
      }
      this.consecutiveErrorCount++;
      const errorMessage = err instanceof Error ? err.message : String(err);
      store.setScanError(errorMessage);
      // Exponential backoff up to 5000ms on repeated errors (H4)
      nextDelay = Math.min(5000, store.scanInterval * Math.pow(1.5, Math.min(this.consecutiveErrorCount, 6)));
    } finally {
      this.isProcessing = false;
      if (this.isScanningActive && sessionId === this.scanSessionId) {
        this.scheduleNextScan(nextDelay, sessionId);
      }
    }
  }

  /**
   * Open the dedicated transparent fullscreen region selector window
   */
  public static async openRegionSelector(monitorName?: string, mode: "setup" | "snipping" = "setup"): Promise<void> {
    try {
      await settingsManager.flushPendingSaves();
      const channel = new BroadcastChannel("vn_ocr_channel");
      channel.postMessage({ type: "OPEN_SELECTOR", mode });
      channel.close();
      await TauriBridge.openRegionSelectorOverlay(monitorName || null, mode);
    } catch (err: unknown) {
      logger.warn("OcrService", "Failed to open region selector overlay:", err);
    }
  }

  /**
   * Close the region selector window
   */
  public static async closeRegionSelector(restoreMain: boolean = true): Promise<void> {
    try {
      await TauriBridge.closeRegionSelectorOverlay(restoreMain);
    } catch (err: unknown) {
      logger.warn("OcrService", "Failed to close region selector overlay:", err);
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
