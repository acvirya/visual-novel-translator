import { OverlayConfig } from "../types";
import { emit, listen, UnlistenFn } from "@tauri-apps/api/event";
import { settingsManager } from "../services/settingsManager";

export interface OverlayDialogueMessage {
  id?: number | string;
  speaker?: string;
  translatedSpeaker?: string;
  message?: string;
  translatedMessage?: string;
}

export type OverlayEvent =
  | { type: "CONFIG_UPDATE"; config: OverlayConfig }
  | { type: "SET_EDIT_MODE"; isEditing: boolean }
  | { type: "POSITION_SAVED"; x: number; y: number; width: number; height: number }
  | { type: "DIALOGUE_UPDATE"; dialogue: OverlayDialogueMessage };

class OverlayChannel {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<(event: OverlayEvent) => void> = new Set();
  private lastEventSignature = "";
  private lastEventTime = 0;
  private tauriUnlistenFn: UnlistenFn | null = null;

  constructor() {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        this.channel = new BroadcastChannel("vn_translator_overlay_channel");
        this.channel.onmessage = (msg) => {
          this.handleIncoming(msg.data);
        };
      } catch (err) {
        console.warn("BroadcastChannel not available, relying on Tauri Event IPC:", err);
      }
    }

    // Register Tauri Native Event fallback (H6 & A3)
    if (typeof window !== "undefined") {
      listen<OverlayEvent>("vn-overlay-event", (tauriEvent) => {
        this.handleIncoming(tauriEvent.payload);
      }).then((unlisten) => {
        this.tauriUnlistenFn = unlisten;
      }).catch(() => {});
    }
  }

  private handleIncoming(event: OverlayEvent) {
    if (!event || !event.type) return;

    // Fast deduplicate event if delivered through both BroadcastChannel and Tauri native event (PERF-04)
    const sig =
      event.type === "DIALOGUE_UPDATE"
        ? `dlg_${event.dialogue.id}_${event.dialogue.message}_${event.dialogue.translatedMessage || ""}`
        : `${event.type}_${(event as any).isEditing ?? (event as any).x ?? ""}`;
    const now = Date.now();
    if (sig === this.lastEventSignature && now - this.lastEventTime < 30) {
      return;
    }
    this.lastEventSignature = sig;
    this.lastEventTime = now;

    this.listeners.forEach((cb) => cb(event));
  }

  public send(event: OverlayEvent) {
    // 1. Send via fast web BroadcastChannel
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch {}
    }

    // 2. Dual broadcast via Tauri native event for cross-webview resilience (A3)
    emit("vn-overlay-event", event).catch(() => {});

    // 3. Persist config via SettingsManager
    if (event.type === "CONFIG_UPDATE") {
      settingsManager.updateOverlay({
        config: { ...event.config, isEnabled: false },
      });
    }
  }

  public subscribe(callback: (event: OverlayEvent) => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public getSavedConfig(): OverlayConfig | null {
    const s = settingsManager.getOverlay();
    if (s?.config) {
      return { ...s.config, isEnabled: false };
    }
    return null;
  }

  public destroy() {
    if (this.channel) {
      try {
        this.channel.close();
      } catch {}
      this.channel = null;
    }
    if (this.tauriUnlistenFn) {
      this.tauriUnlistenFn();
      this.tauriUnlistenFn = null;
    }
    this.listeners.clear();
  }
}

export const overlayChannel = new OverlayChannel();
