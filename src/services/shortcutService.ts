import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { settingsManager } from "./settingsManager";
import { translationManager } from "./translationManager";
import { ocrService } from "./ocrService";
import { logger } from "./loggerService";
import { invoke } from "@tauri-apps/api/core";

class ShortcutService {
  private isInitialized = false;
  private isOverlayClickThrough = true;

  public async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      await this.reloadShortcuts();
    } catch (err) {
      logger.warn("Shortcuts", `Failed to initialize global shortcuts: ${err}`);
    }

    // Subscribe to settings changes to auto-update shortcuts
    settingsManager.subscribe(() => {
      this.reloadShortcuts();
    });
  }

  public async reloadShortcuts() {
    try {
      await unregisterAll();

      const general = settingsManager.getGeneral();
      const lockKey = general.hotkeyLockOverlay?.trim();
      const pauseKey = general.hotkeyTogglePause?.trim();
      const ocrKey = general.hotkeyOcrScan?.trim();

      // 1. Lock/Unlock Overlay Click-Through
      if (lockKey) {
        try {
          await register(lockKey, async (event) => {
            if (event.state === "Pressed") {
              this.isOverlayClickThrough = !this.isOverlayClickThrough;
              await invoke("set_overlay_click_through", { enable: this.isOverlayClickThrough });
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
                  if (res.message) {
                    translationManager.translate({
                      speaker: res.speaker || undefined,
                      message: res.message,
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
    } catch (err) {
      logger.warn("Shortcuts", `Failed to reload global shortcuts: ${err}`);
    }
  }
}

export const shortcutService = new ShortcutService();
