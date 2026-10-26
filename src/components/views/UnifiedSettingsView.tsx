import React from "react";
import { Sliders, KeyRound, Code } from "lucide-react";
import { TranslationProvidersView } from "./TranslationProvidersView";
import { CustomReplacementRulesView } from "./CustomReplacementRulesView";
import { GeneralSettingsView } from "./GeneralSettingsView";
import { SegmentedControl, SegmentedOption } from "../common/SegmentedControl";
import { useUIStore, SettingsSubTab } from "../../stores/useUIStore";

export type { SettingsSubTab };

export const UnifiedSettingsView: React.FC = () => {
  const activeSubTab = useUIStore((state) => state.settingsSubTab);
  const setActiveSubTab = useUIStore((state) => state.setSettingsSubTab);

  const settingOptions: SegmentedOption<SettingsSubTab>[] = [
    {
      id: "providers",
      label: "Providers & prompts",
      icon: <KeyRound size={14} />,
    },
    {
      id: "custom_rules",
      label: "Text replacements",
      icon: <Code size={14} />,
    },
    {
      id: "general",
      label: "General & shortcuts",
      icon: <Sliders size={14} />,
    },
  ];

  return (
    <div className="workspace-view">
      {/* Settings Sub-tabs Header in Center */}
      <div className="workspace-tabs">
        <SegmentedControl<SettingsSubTab>
          options={settingOptions}
          value={activeSubTab}
          onChange={setActiveSubTab}
          size="md"
        />
      </div>

      {/* Main Content Area */}
      <div className="workspace-body">
        {activeSubTab === "providers" && <TranslationProvidersView />}
        {activeSubTab === "custom_rules" && <CustomReplacementRulesView />}
        {activeSubTab === "general" && <GeneralSettingsView />}
      </div>
    </div>
  );
};
