import { OverlayConfig } from "../types";

export interface OverlayDialogueMessage {
  speaker?: string;
  translatedSpeaker?: string;
  message: string;
  translatedMessage: string;
}

export type OverlayEvent =
  | { type: "CONFIG_UPDATE"; config: OverlayConfig }
  | { type: "SET_EDIT_MODE"; isEditing: boolean }
  | { type: "POSITION_SAVED"; x: number; y: number; width: number; height: number }
  | { type: "DIALOGUE_UPDATE"; dialogue: OverlayDialogueMessage };

class OverlayChannel {
  private channel: BroadcastChannel | null = null;
  private listeners: ((event: OverlayEvent) => void)[] = [];

  constructor() {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      this.channel = new BroadcastChannel("vn_translator_overlay_channel");
      this.channel.onmessage = (msg) => {
        this.listeners.forEach((cb) => cb(msg.data));
      };
    }
  }

  public send(event: OverlayEvent) {
    if (this.channel) {
      this.channel.postMessage(event);
    }
    // Also backup to localStorage
    if (event.type === "CONFIG_UPDATE") {
      localStorage.setItem("vn_overlay_config", JSON.stringify(event.config));
    }
  }

  public subscribe(callback: (event: OverlayEvent) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  public getSavedConfig(): OverlayConfig | null {
    try {
      const data = localStorage.getItem("vn_overlay_config");
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }
}

export const overlayChannel = new OverlayChannel();
