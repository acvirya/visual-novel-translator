import React, { useState } from "react";
import { Sliders, Terminal, KeyRound, Code } from "lucide-react";
import { TranslationProvidersView } from "./TranslationProvidersView";
import { CustomReplacementRulesView } from "./CustomReplacementRulesView";
import { GeneralSettingsView } from "./GeneralSettingsView";
import { LogsView } from "./LogsView";
import { SegmentedControl, SegmentedOption } from "../common/SegmentedControl";

export type SettingsSubTab = "providers" | "custom_rules" | "general" | "logs";

export const UnifiedSettingsView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>("providers");

  const settingOptions: SegmentedOption<SettingsSubTab>[] = [
    {
      id: "providers",
      label: "AI Models & Prompts",
      icon: <KeyRound size={14} />,
    },
    {
      id: "custom_rules",
      label: "Custom Replacement Rules",
      icon: <Code size={14} />,
    },
    {
      id: "general",
      label: "General & Hotkeys",
      icon: <Sliders size={14} />,
    },
    {
      id: "logs",
      label: "System Logs",
      icon: <Terminal size={14} />,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden" }}>
      {/* Settings Sub-tabs Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          backgroundColor: "var(--bg-panel)",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <SegmentedControl<SettingsSubTab>
          options={settingOptions}
          value={activeSubTab}
          onChange={setActiveSubTab}
          size="md"
        />

        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          {activeSubTab === "providers" && "Configure OpenRouter AI models, API keys, and custom prompts"}
          {activeSubTab === "custom_rules" && "Universal regex patterns and custom term replacements applied across all sources"}
          {activeSubTab === "general" && "System-wide hotkeys, language pairs, and app preferences"}
          {activeSubTab === "logs" && "Live debug console, network errors, and IPC execution logs"}
        </span>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px", maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
        {activeSubTab === "providers" && <TranslationProvidersView />}
        {activeSubTab === "custom_rules" && <CustomReplacementRulesView />}
        {activeSubTab === "general" && <GeneralSettingsView />}
        {activeSubTab === "logs" && <LogsView />}
      </div>
    </div>
  );
};
