import React, { useState } from "react";
import { Sparkles, Sliders, Terminal, KeyRound } from "lucide-react";
import { TranslationProvidersView } from "./TranslationProvidersView";
import { TextPreprocessingView } from "./TextPreprocessingView";
import { GeneralSettingsView } from "./GeneralSettingsView";
import { LogsView } from "./LogsView";

export type SettingsSubTab = "providers" | "preprocessing" | "general" | "logs";

export const UnifiedSettingsView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>("providers");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden" }}>
      {/* Settings Sub-tabs Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 16px",
          backgroundColor: "var(--bg-panel)",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        {/* 1. AI Models & Providers */}
        <button
          type="button"
          onClick={() => setActiveSubTab("providers")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 14px",
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${activeSubTab === "providers" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
            backgroundColor: activeSubTab === "providers" ? "rgba(88, 166, 255, 0.15)" : "var(--bg-app)",
            color: activeSubTab === "providers" ? "var(--accent-primary)" : "var(--text-primary)",
            cursor: "pointer",
            fontWeight: activeSubTab === "providers" ? 600 : 500,
            fontSize: "12.5px",
            transition: "all 0.15s ease",
          }}
        >
          <KeyRound size={14} />
          <span>AI Models & Prompts</span>
        </button>

        {/* 2. Text Preprocessing Master */}
        <button
          type="button"
          onClick={() => setActiveSubTab("preprocessing")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 14px",
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${activeSubTab === "preprocessing" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
            backgroundColor: activeSubTab === "preprocessing" ? "rgba(88, 166, 255, 0.15)" : "var(--bg-app)",
            color: activeSubTab === "preprocessing" ? "var(--accent-primary)" : "var(--text-primary)",
            cursor: "pointer",
            fontWeight: activeSubTab === "preprocessing" ? 600 : 500,
            fontSize: "12.5px",
            transition: "all 0.15s ease",
          }}
        >
          <Sparkles size={14} />
          <span>Text Preprocessing Master</span>
        </button>

        {/* 3. General & Hotkeys */}
        <button
          type="button"
          onClick={() => setActiveSubTab("general")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 14px",
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${activeSubTab === "general" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
            backgroundColor: activeSubTab === "general" ? "rgba(88, 166, 255, 0.15)" : "var(--bg-app)",
            color: activeSubTab === "general" ? "var(--accent-primary)" : "var(--text-primary)",
            cursor: "pointer",
            fontWeight: activeSubTab === "general" ? 600 : 500,
            fontSize: "12.5px",
            transition: "all 0.15s ease",
          }}
        >
          <Sliders size={14} />
          <span>General & Hotkeys</span>
        </button>

        {/* 4. System Logs & Diagnostics */}
        <button
          type="button"
          onClick={() => setActiveSubTab("logs")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 14px",
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${activeSubTab === "logs" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
            backgroundColor: activeSubTab === "logs" ? "rgba(88, 166, 255, 0.15)" : "var(--bg-app)",
            color: activeSubTab === "logs" ? "var(--accent-primary)" : "var(--text-primary)",
            cursor: "pointer",
            fontWeight: activeSubTab === "logs" ? 600 : 500,
            fontSize: "12.5px",
            transition: "all 0.15s ease",
          }}
        >
          <Terminal size={14} />
          <span>System Logs</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px", maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
        {activeSubTab === "providers" && <TranslationProvidersView />}
        {activeSubTab === "preprocessing" && <TextPreprocessingView />}
        {activeSubTab === "general" && <GeneralSettingsView />}
        {activeSubTab === "logs" && <LogsView />}
      </div>
    </div>
  );
};
