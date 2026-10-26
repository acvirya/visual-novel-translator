import React from "react";
import { Bot, Terminal } from "lucide-react";
import { SegmentedControl, SegmentedOption } from "../common/SegmentedControl";
import { useUIStore, LogsSubTab } from "../../stores/useUIStore";
import { AiUsageLogsView } from "./logs/AiUsageLogsView";
import { LogsView } from "./LogsView";

export const LogsHubView: React.FC = () => {
  const activeSubTab = useUIStore((state) => state.logsSubTab);
  const setActiveSubTab = useUIStore((state) => state.setLogsSubTab);

  const logOptions: SegmentedOption<LogsSubTab>[] = [
    {
      id: "usage",
      label: "Translation usage",
      icon: <Bot size={14} />,
    },
    {
      id: "system",
      label: "Application logs",
      icon: <Terminal size={14} />,
    },
  ];

  return (
    <div className="workspace-view">
      {/* Sub-tabs Header Centered */}
      <div className="workspace-tabs">
        <SegmentedControl<LogsSubTab>
          options={logOptions}
          value={activeSubTab}
          onChange={setActiveSubTab}
          size="md"
        />
      </div>

      {/* Main Content Area */}
      <div className="workspace-body">
        {activeSubTab === "usage" && <AiUsageLogsView />}
        {activeSubTab === "system" && <LogsView />}
      </div>
    </div>
  );
};
