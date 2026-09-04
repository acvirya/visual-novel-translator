import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { settingsManager } from "./settingsManager";
import { translationManager } from "./translationManager";
import { ocrService } from "./ocrService";
import { logger } from "./loggerService";
import { TauriBridge } from "./tauriBridge";
import { executePreprocessingPipeline, cleanSpeakerName } from "../utils/textPreprocessor";

class ShortcutService {
  private isInitialized = false;
  private isOverlayClickThrough = true;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRegisteredKeys = { lockKey: "", pauseKey: "", ocrKey: "", snippingKey: "" };

  public async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      await this.reloadShortcuts();
    } catch (err) {
      logger.warn("Shortcuts", `Failed to initialize global shortcuts: ${err}`);
    }

    // Subscribe to settings changes to auto-update shortcuts with 300ms debounce
    settingsManager.subscribe(() => {
      const general = settingsManager.getGeneral();
      const currentKeys = {
        lockKey: general.hotkeyLockOverlay?.trim() || "",
        pauseKey: general.hotkeyTogglePause?.trim() || "",
        ocrKey: general.hotkeyOcrScan?.trim() || "",
        snippingKey: general.hotkeyOcrSnipping?.trim() || "",
      };

      if (
        currentKeys.lockKey !== this.lastRegisteredKeys.lockKey ||
        currentKeys.pauseKey !== this.lastRegisteredKeys.pauseKey ||
        currentKeys.ocrKey !== this.lastRegisteredKeys.ocrKey ||
        currentKeys.snippingKey !== this.lastRegisteredKeys.snippingKey
      ) {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.reloadShortcuts();
        }, 300);
      }
    });
  }

  /**
   * Synchronize click-through state when changed externally (e.g. from UI edit mode toggles)
   */
  public setOverlayClickThrough(enable: boolean) {
    this.isOverlayClickThrough = enable;
  }

  public getOverlayClickThrough(): boolean {
    return this.isOverlayClickThrough;
  }

  public async reloadShortcuts() {
    try {
      await unregisterAll();

      const general = settingsManager.getGeneral();
      const lockKey = general.hotkeyLockOverlay?.trim() || "";
      const pauseKey = general.hotkeyTogglePause?.trim() || "";
      const ocrKey = general.hotkeyOcrScan?.trim() || "";
      const snippingKey = general.hotkeyOcrSnipping?.trim() || "";

      this.lastRegisteredKeys = { lockKey, pauseKey, ocrKey, snippingKey };

      // 1. Lock/Unlock Overlay Click-Through
      if (lockKey) {
        try {
          await register(lockKey, async (event) => {
            if (event.state === "Pressed") {
              this.isOverlayClickThrough = !this.isOverlayClickThrough;
              await TauriBridge.setOverlayClickThrough(this.isOverlayClickThrough);
              logger.info(
                "Shortcuts",
                `Hotkey [${lockKey}] pressed: Overlay click-through set to ${this.isOverlayClickThrough}`
              );
            }
          });
          logger.info("Shortcuts", `Registered global shortcut for Overlay Lock: ${lockKey}`);
        } catch (e) {
          logger.warn("Shortcuts", `Could not register lock shortcut '${lockKey}': ${e}`);
        }
      }

      // 2. Toggle Live Translation Pause / Resume
      if (pauseKey) {
        try {
          await register(pauseKey, (event) => {
            if (event.state === "Pressed") {
              const currentPaused = translationManager.isPaused();
              translationManager.setPaused(!currentPaused);
              logger.info(
                "Shortcuts",
                `Hotkey [${pauseKey}] pressed: Live translation ${!currentPaused ? "PAUSED" : "RESUMED"}`
              );
            }
          });
          logger.info("Shortcuts", `Registered global shortcut for Pause/Resume: ${pauseKey}`);
        } catch (e) {
          logger.warn("Shortcuts", `Could not register pause shortcut '${pauseKey}': ${e}`);
        }
      }

      // 3. Trigger OCR Manual Scan
      if (ocrKey) {
        try {
          await register(ocrKey, async (event) => {
            if (event.state === "Pressed") {
              logger.info("Shortcuts", `Hotkey [${ocrKey}] pressed: Triggering instant OCR scan.`);
              const ocrSettings = settingsManager.getOcr();
              if (ocrSettings.regions.length > 0) {
                try {
                  const res = await ocrService.runOneOcrScan(
                    ocrSettings.regions,
                    ocrSettings.scalePercent,
                    ocrSettings.customPath || undefined,
                    ocrSettings.stability
                  );
                  const rawMsg = res.message || res.rawText || "";
                  const cleanMsg = rawMsg ? executePreprocessingPipeline(rawMsg, "ocr").trim() : "";
                  const cleanSpk = res.speaker ? cleanSpeakerName(executePreprocessingPipeline(res.speaker, "ocr")) : "";

                  if (cleanMsg) {
                    translationManager.translate({
                      speaker: cleanSpk || undefined,
                      message: cleanMsg,
                      sourceType: "ocr",
                    });
                  }
                } catch (ocrErr) {
                  logger.error("Shortcuts", `OCR Scan failed on hotkey trigger: ${ocrErr}`);
                }
              }
            }
          });
          logger.info("Shortcuts", `Registered global shortcut for OCR Scan: ${ocrKey}`);
        } catch (e) {
          logger.warn("Shortcuts", `Could not register OCR shortcut '${ocrKey}': ${e}`);
        }
      }

      // 4. One-Shot OCR Snipping Translator
      if (snippingKey) {
        try {
          await register(snippingKey, async (event) => {
            if (event.state === "Pressed") {
              logger.info("Shortcuts", `Hotkey [${snippingKey}] pressed: Opening OCR Snipping Tool.`);
              try {
                await TauriBridge.openRegionSelectorOverlay();
              } catch (e) {
                logger.error("Shortcuts", `Failed to open OCR Snipping overlay: ${e}`);
              }
            }
          });
          logger.info("Shortcuts", `Registered global shortcut for OCR Snipping: ${snippingKey}`);
        } catch (e) {
          logger.warn("Shortcuts", `Could not register Snipping shortcut '${snippingKey}': ${e}`);
        }
      }
    } catch (err) {
      logger.warn("Shortcuts", `Failed to reload global shortcuts: ${err}`);
    }
  }

  public async dispose() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    try {
      await unregisterAll();
    } catch (err) {
      logger.debug("Shortcuts", `Error while unregistering shortcuts during dispose: ${err}`);
    }
    this.isInitialized = false;
  }

  public async destroy() {
    await this.dispose();
  }
}

export const shortcutService = new ShortcutService();
