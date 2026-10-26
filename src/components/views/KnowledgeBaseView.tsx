import React from "react";
import { BookOpen, Database } from "lucide-react";
import { GlossaryManagerView } from "./GlossaryManagerView";
import { ScriptManagerView } from "./ScriptManagerView";
import { SegmentedControl, SegmentedOption } from "../common/SegmentedControl";
import { useUIStore, KnowledgeBaseSubTab } from "../../stores/useUIStore";

export type { KnowledgeBaseSubTab };

export const KnowledgeBaseView: React.FC = () => {
  const activeTab = useUIStore((state) => state.knowledgeBaseSubTab);
  const setActiveTab = useUIStore((state) => state.setKnowledgeBaseSubTab);

  const tabOptions: SegmentedOption<"glossary" | "script">[] = [
    {
      id: "glossary",
      label: "Glossary & terms",
      icon: <BookOpen size={14} />,
    },
    {
      id: "script",
      label: "Script memory",
      icon: <Database size={14} />,
    },
  ];

  return (
    <div className="workspace-view">
      {/* Sub-tab Navigation in Center */}
      <div className="workspace-tabs">
        <SegmentedControl<"glossary" | "script">
          options={tabOptions}
          value={activeTab}
          onChange={setActiveTab}
          size="md"
        />
      </div>

      {/* Main Tab Content */}
      <div className="workspace-body">
        {activeTab === "glossary" ? <GlossaryManagerView /> : <ScriptManagerView />}
      </div>
    </div>
  );
};
