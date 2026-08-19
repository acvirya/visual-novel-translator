import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { OverlayWindow } from "./components/overlay/OverlayWindow";
import "./index.css";

const isOverlayWindow = window.location.search.includes("overlay=true");

if (isOverlayWindow) {
  document.documentElement.classList.add("overlay-window-mode");
  document.body.classList.add("overlay-window-mode");
  document.documentElement.style.backgroundColor = "transparent";
  document.documentElement.style.background = "transparent";
  document.body.style.backgroundColor = "transparent";
  document.body.style.background = "transparent";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isOverlayWindow ? <OverlayWindow /> : <App />}
  </React.StrictMode>,
);
