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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Sub-tab Navigation in Center */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", padding: "0 0 12px 0", flexShrink: 0 }}>
        <SegmentedControl<"glossary" | "script">
          options={tabOptions}
          value={activeTab}
          onChange={setActiveTab}
          size="md"
        />
      </div>

      {/* Main Tab Content */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", width: "100%" }}>
        {activeTab === "glossary" ? <GlossaryManagerView /> : <ScriptManagerView />}
      </div>
    </div>
  );
};
