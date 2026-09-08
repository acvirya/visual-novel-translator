import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { settingsManager } from "./settingsManager";
import { translationManager } from "./translationManager";
import { ocrService } from "./ocrService";
import { logger } from "./loggerService";
import { TauriBridge } from "./tauriBridge";
import { executePreprocessingPipeline, cleanSpeakerName } from "../utils/textPreprocessor";
import { ManagedService } from "./appContainer";

class ShortcutService implements ManagedService {
  public readonly id = "shortcutService";
  private isInitialized = false;
  private isOverlayClickThrough = true;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private registeredShortcuts = new Set<string>();
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
      // Unregister previously registered shortcuts individually to avoid clearing global shortcuts owned by other components
      for (const key of this.registeredShortcuts) {
        try {
          await unregister(key);
        } catch {
          // ignore if already unregistered
        }
      }
      this.registeredShortcuts.clear();

      const general = settingsManager.getGeneral();
      const lockKey = general.hotkeyLockOverlay?.trim() || "";
      const pauseKey = general.hotkeyTogglePause?.trim() || "";
      const ocrKey = general.hotkeyOcrScan?.trim() || "";
      const snippingKey = general.hotkeyOcrSnipping?.trim() || "";

      this.lastRegisteredKeys = { lockKey, pauseKey, ocrKey, snippingKey };

      // SERI-12: Detect and warn on duplicate key assignment
      const keyUsage = new Map<string, string>();
      const checkCollision = (name: string, key: string): boolean => {
        if (!key) return false;
        const lower = key.toLowerCase();
        if (keyUsage.has(lower)) {
          logger.warn(
            "Shortcuts",
            `Duplicate shortcut ignored for "${name}": "${key}" is already registered for "${keyUsage.get(lower)}"`
          );
          return true; // Collided
        }
        keyUsage.set(lower, name);
        return false;
      };

      // 1. Lock/Unlock Overlay Click-Through
      if (lockKey && !checkCollision("Overlay Lock", lockKey)) {
        try {
          await register(lockKey, async (event) => {
            if (event.state === "Pressed") {
              const nextState = !this.isOverlayClickThrough;
              try {
                await TauriBridge.setOverlayClickThrough(nextState);
                this.isOverlayClickThrough = nextState;
                logger.info(
                  "Shortcuts",
                  `Hotkey [${lockKey}] pressed: Overlay click-through set to ${this.isOverlayClickThrough}`
                );
              } catch (bridgeErr) {
                logger.error("Shortcuts", `Failed to set overlay click-through via TauriBridge: ${bridgeErr}`);
              }
            }
          });
          this.registeredShortcuts.add(lockKey);
          logger.info("Shortcuts", `Registered global shortcut for Overlay Lock: ${lockKey}`);
        } catch (e) {
          logger.warn("Shortcuts", `Could not register lock shortcut '${lockKey}': ${e}`);
        }
      }

      // 2. Toggle Live Translation Pause / Resume
      if (pauseKey && !checkCollision("Pause / Resume", pauseKey)) {
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
          this.registeredShortcuts.add(pauseKey);
          logger.info("Shortcuts", `Registered global shortcut for Pause/Resume: ${pauseKey}`);
        } catch (e) {
          logger.warn("Shortcuts", `Could not register pause shortcut '${pauseKey}': ${e}`);
        }
      }

      // 3. Trigger OCR Manual Scan
      if (ocrKey && !checkCollision("OCR Scan", ocrKey)) {
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
                    await translationManager.translate({
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
          this.registeredShortcuts.add(ocrKey);
          logger.info("Shortcuts", `Registered global shortcut for OCR Scan: ${ocrKey}`);
        } catch (e) {
          logger.warn("Shortcuts", `Could not register OCR shortcut '${ocrKey}': ${e}`);
        }
      }

      // 4. One-Shot OCR Snipping Translator
      if (snippingKey && !checkCollision("OCR Snipping", snippingKey)) {
        try {
          await register(snippingKey, async (event) => {
            if (event.state === "Pressed") {
              logger.info("Shortcuts", `Hotkey [${snippingKey}] pressed: Opening OCR Snipping Tool.`);
              try {
                await ocrService.openRegionSelector(undefined, "snipping");
              } catch (e) {
                logger.error("Shortcuts", `Failed to open OCR Snipping overlay: ${e}`);
              }
            }
          });
          this.registeredShortcuts.add(snippingKey);
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
    for (const key of this.registeredShortcuts) {
      try {
        await unregister(key);
      } catch (err) {
        logger.debug("Shortcuts", `Error while unregistering '${key}': ${err}`);
      }
    }
    this.registeredShortcuts.clear();
    this.isInitialized = false;
  }

  public async destroy() {
    await this.dispose();
  }
}

export const shortcutService = new ShortcutService();
