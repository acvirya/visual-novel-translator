import React, { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { RegionSetupOverlay } from "./RegionSetupOverlay";
import { OneShotOcrOverlay } from "./OneShotOcrOverlay";

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

  useEffect(() => {
    // 1. Listen for cross-window BroadcastChannel commands
    const channel = new BroadcastChannel("vn_ocr_channel");
    channel.onmessage = (event) => {
      if (event.data?.type === "OPEN_SELECTOR") {
        setMode(event.data?.mode === "snipping" ? "snipping" : "setup");
      }
    };

    // 2. Listen for direct Tauri window events from Rust window manager
    let unlistenTauriEvent: (() => void) | null = null;
    listen<{ mode?: string }>("set-selector-mode", (event) => {
      const targetMode = event.payload?.mode === "snipping" ? "snipping" : "setup";
      setMode(targetMode);
    }).then((unlisten) => {
      unlistenTauriEvent = unlisten;
    });

    return () => {
      channel.close();
      if (unlistenTauriEvent) unlistenTauriEvent();
    };
  }, []);

  if (mode === "snipping") {
    return <OneShotOcrOverlay key="snipping" />;
  }

  return <RegionSetupOverlay key="setup" />;
};
