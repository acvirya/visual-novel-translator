import { invoke } from "@tauri-apps/api/core";
import { OcrEngineStatus, OcrRegion, OcrScanResult, OcrStabilityConfig } from "../types";

export class OcrService {
  /**
   * Auto-detect OneOCR files from Windows Snipping Tool directory
   */
  static async detectOneOcrPath(customPath?: string): Promise<OcrEngineStatus> {
    try {
      const res = await invoke<OcrEngineStatus>("detect_oneocr_path", {
        customPath: customPath || null,
      });
      return res;
    } catch (err: any) {
      return {
        isAvailable: false,
        dllPath: "",
        modelPath: "",
        error: String(err),
      };
    }
  }

  /**
   * Capture cropped preview screenshots of given regions as base64 data URLs
   */
  static async captureRegionsPreview(
    regions: OcrRegion[]
  ): Promise<{ [regionId: string]: string }> {
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
            physicalX: r.physicalX ? Math.round(r.physicalX) : null,
            physicalY: r.physicalY ? Math.round(r.physicalY) : null,
            physicalWidth: r.physicalWidth ? Math.round(r.physicalWidth) : null,
            physicalHeight: r.physicalHeight ? Math.round(r.physicalHeight) : null,
          })),
        }
      );
      return previews || {};
    } catch (err) {
      console.warn("Failed to capture region previews:", err);
      return {};
    }
  }

  /**
   * Run a single OneOCR scan on the specified regions with optional motion stability detection
   */
  static async runOneOcrScan(
    regions: OcrRegion[],
    scalePercent: number = 100,
    customPath?: string,
    stabilityConfig?: OcrStabilityConfig
  ): Promise<OcrScanResult> {
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
          physicalX: r.physicalX ? Math.round(r.physicalX) : null,
          physicalY: r.physicalY ? Math.round(r.physicalY) : null,
          physicalWidth: r.physicalWidth ? Math.round(r.physicalWidth) : null,
          physicalHeight: r.physicalHeight ? Math.round(r.physicalHeight) : null,
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
   * Open the dedicated transparent fullscreen region selector window
   */
  static async openRegionSelector(monitorName?: string): Promise<void> {
    try {
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
  static async closeRegionSelector(): Promise<void> {
    try {
      await invoke("close_region_selector_overlay");
    } catch (err) {
      console.warn("Failed to close region selector overlay:", err);
    }
  }
}
