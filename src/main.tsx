import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { OverlayWindow } from "./components/overlay/OverlayWindow";
import { RegionSelectionOverlay } from "./components/overlay/RegionSelectionOverlay";
import "./index.css";

const isOverlayWindow = window.location.search.includes("overlay=true");
const isRegionSelector = window.location.search.includes("regionSelector=true");

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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {renderRoot()}
  </React.StrictMode>,
);

