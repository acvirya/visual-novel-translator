import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { OverlayWindow } from "./components/overlay/OverlayWindow";
import { RegionSelectionOverlay } from "./components/overlay/RegionSelectionOverlay";
import { settingsManager } from "./services/settingsManager";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { ConfirmationProvider } from "./components/common/ConfirmationProvider";
import "./index.css";

const windowParams = new URLSearchParams(window.location.search);
const isOverlayWindow = windowParams.get("overlay") === "true";
const isRegionSelector = windowParams.get("regionSelector") === "true";

if (isOverlayWindow || isRegionSelector) {
  document.documentElement.classList.add("overlay-window-mode");
  document.body.classList.add("overlay-window-mode");
  document.documentElement.style.backgroundColor = "transparent";
  document.documentElement.style.background = "transparent";
  document.body.style.backgroundColor = "transparent";
  document.body.style.background = "transparent";
}

const renderRoot = () => {
  if (isOverlayWindow) return <OverlayWindow />;
  if (isRegionSelector) return <RegionSelectionOverlay />;
  return <App />;
};

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
// Hydrate before any window reads settings into local component state.
// This also ensures the snipping window can access secure provider credentials.
void settingsManager.ensureReady().then(() => root.render(
  <React.StrictMode>
    <ErrorBoundary><ConfirmationProvider>{renderRoot()}</ConfirmationProvider></ErrorBoundary>
  </React.StrictMode>,
)).catch((error: unknown) => {
  root.render(<div role="alert" style={{ padding: 24 }}>Unable to load application settings safely. {error instanceof Error ? error.message : "Please restart the application."}</div>);
});

