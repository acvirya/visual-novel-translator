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
      label: "AI Usage Logs",
      icon: <Bot size={14} />,
    },
    {
      id: "system",
      label: "System & Debug Logs",
      icon: <Terminal size={14} />,
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      {/* Sub-tabs Header Centered */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
          padding: "0 0 12px 0",
          flexShrink: 0,
        }}
      >
        <SegmentedControl<LogsSubTab>
          options={logOptions}
          value={activeSubTab}
          onChange={setActiveSubTab}
          size="md"
        />
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, minHeight: 0, width: "100%" }}>
        {activeSubTab === "usage" && <AiUsageLogsView />}
        {activeSubTab === "system" && <LogsView />}
      </div>
    </div>
  );
};
