import React from "react";
import { NavigationTab } from "../../types";
import { Activity, Cpu, Scan } from "lucide-react";

interface HeaderProps {
  currentTab: NavigationTab;
}

const tabTitles: Record<NavigationTab, { title: string; subtitle: string }> = {
  "live-translate": {
    title: "Live Translate",
    subtitle: "Real-time hooked dialogue stream & automatic translation",
  },
  "manual-translate": {
    title: "Manual Translate",
    subtitle: "Translate custom Japanese text or scripts interactively",
  },
  "batch-translate": {
    title: "Batch Translate",
    subtitle: "Translate entire script files (.jsonl, .txt) simultaneously",
  },
  "glossary-manager": {
    title: "Glossary Manager",
    subtitle: "Manage character names, honorifics, and custom term mappings",
  },
  "script-manager": {
    title: "Script Manager",
    subtitle: "Manage pre-translated script databases (.jsonl) and N-gram matching criteria",
  },
  "logs": {
    title: "System Logs",
    subtitle: "Event history, OCR outputs, and translation engine logs",
  },
  "textractor": {
    title: "Textractor Hooking",
    subtitle: "Process attacher, thread selector, and clean regex filters",
  },
  "ocr": {
    title: "Windows OCR (OneOCR)",
    subtitle: "Screen capture region, interval scanner, and image filter settings",
  },
  "overlay-settings": {
    title: "Overlay & Read Mode",
    subtitle: "Transparent in-game display, N-gram script matcher, and multi-box layout",
  },
  "general-settings": {
    title: "General Settings",
    subtitle: "Hotkeys, application behaviors, and window settings",
  },
  "translation-providers": {
    title: "Translation Providers",
    subtitle: "OpenRouter LLM API and Free Online MT configurations",
  },
};

export const Header: React.FC<HeaderProps> = ({ currentTab }) => {
  const currentInfo = tabTitles[currentTab] || { title: currentTab, subtitle: "" };

  return (
    <header
      style={{
        height: "var(--header-height)",
        backgroundColor: "var(--bg-app)",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        flexShrink: 0,
      }}
    >
      {/* Tab Title */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
        <h1 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
          {currentInfo.title}
        </h1>
        <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "none" }}>
          {currentInfo.subtitle}
        </span>
      </div>

      {/* System Status Badges */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {/* TODO: Bind to real Textractor IPC status */}
        <div
          className="badge badge-success"
          title="Textractor status: Connected to Visual Novel process"
        >
          <Cpu size={12} />
          <span>Hook: Active</span>
        </div>

        {/* TODO: Bind to real Windows Media OCR status */}
        <div
          className="badge badge-neutral"
          title="OCR status: Standby (Press Hotkey to scan)"
        >
          <Scan size={12} />
          <span>OCR: Standby</span>
        </div>

        {/* TODO: Bind to real Active Provider */}
        <div
          className="badge badge-neutral"
          title="Active Provider: OpenRouter (Claude 3.5 Sonnet)"
        >
          <Activity size={12} />
          <span>OpenRouter</span>
        </div>
      </div>
    </header>
  );
};
