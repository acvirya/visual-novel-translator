import React, { useState } from "react";
import { BookOpen, Database } from "lucide-react";
import { GlossaryManagerView } from "./GlossaryManagerView";
import { ScriptManagerView } from "./ScriptManagerView";
import { SegmentedControl, SegmentedOption } from "../common/SegmentedControl";

export const KnowledgeBaseView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"glossary" | "script">("glossary");

  const tabOptions: SegmentedOption<"glossary" | "script">[] = [
    {
      id: "glossary",
      label: "Character Glossary & Terms",
      icon: <BookOpen size={14} />,
    },
    {
      id: "script",
      label: "Offline Script Memory & Cache",
      icon: <Database size={14} />,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden" }}>
      {/* Sub-tab Navigation Header */}
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
        <SegmentedControl<"glossary" | "script">
          options={tabOptions}
          value={activeTab}
          onChange={setActiveTab}
          size="md"
        />

        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          {activeTab === "glossary" && "Manage custom character names, terminology, and VNDB synchronization"}
          {activeTab === "script" && "Local script database indexing and zero-latency line lookups"}
        </span>
      </div>

      {/* Main Tab Content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", position: "relative" }}>
        {activeTab === "glossary" ? <GlossaryManagerView /> : <ScriptManagerView />}
      </div>
    </div>
  );
};
