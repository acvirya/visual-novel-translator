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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Settings Sub-tabs Header in Center */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", padding: "0 0 12px 0", flexShrink: 0 }}>
        <SegmentedControl<SettingsSubTab>
          options={settingOptions}
          value={activeSubTab}
          onChange={setActiveSubTab}
          size="md"
        />
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, minHeight: 0, width: "100%" }}>
        {activeSubTab === "providers" && <TranslationProvidersView />}
        {activeSubTab === "custom_rules" && <CustomReplacementRulesView />}
        {activeSubTab === "general" && <GeneralSettingsView />}
        {activeSubTab === "logs" && <LogsView />}
      </div>
    </div>
  );
};
