import React, { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { RegionSetupOverlay } from "./RegionSetupOverlay";
import { OneShotOcrOverlay } from "./OneShotOcrOverlay";
import { settingsManager } from "../../services/settingsManager";

export const RegionSelectionOverlay: React.FC = () => {
  const [mode, setMode] = useState<"setup" | "snipping">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("snipping") === "true" || params.get("mode") === "snipping") {
        return "snipping";
      }
    }
    return "setup";
  });
  const [session, setSession] = useState(0);

  useEffect(() => {
    let disposed = false;
    let opening = 0;
    const openSession = async (nextMode?: string) => {
      const request = ++opening;
      await settingsManager.refreshAuxiliarySettings();
      if (disposed || request !== opening) return;
      setMode(nextMode === "snipping" ? "snipping" : "setup");
      setSession((value) => value + 1);
    };
    // 1. Listen for cross-window BroadcastChannel commands
    const channel = new BroadcastChannel("vn_ocr_channel");
    channel.onmessage = (event) => {
      if (event.data?.type === "OPEN_SELECTOR") {
        void openSession(event.data?.mode).catch((error) => console.warn("Could not refresh selector settings:", error));
      }
    };

    // 2. Listen for direct Tauri window events from Rust window manager
    let unlistenTauriEvent: (() => void) | null = null;
    listen<{ mode?: string }>("set-selector-mode", (event) => {
      void openSession(event.payload?.mode).catch((error) => console.warn("Could not refresh selector settings:", error));
    }).then((unlisten) => {
      if (disposed) unlisten();
      else unlistenTauriEvent = unlisten;
    }).catch((error) => console.warn("Selector event listener unavailable:", error));

    return () => {
      disposed = true;
      channel.close();
      if (unlistenTauriEvent) unlistenTauriEvent();
    };
  }, []);

  if (mode === "snipping") {
    return <OneShotOcrOverlay key={`snipping-${session}`} />;
  }

  return <RegionSetupOverlay key={`setup-${session}`} />;
};
