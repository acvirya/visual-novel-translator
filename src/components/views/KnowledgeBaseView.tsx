import React, { useState } from "react";
import { BookOpen, Database } from "lucide-react";
import { GlossaryManagerView } from "./GlossaryManagerView";
import { ScriptManagerView } from "./ScriptManagerView";

export const KnowledgeBaseView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"glossary" | "script">("glossary");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden" }}>
      {/* Sub-tab Navigation Header */}
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
        <button
          type="button"
          onClick={() => setActiveTab("glossary")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 14px",
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${activeTab === "glossary" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
            backgroundColor: activeTab === "glossary" ? "rgba(88, 166, 255, 0.15)" : "var(--bg-app)",
            color: activeTab === "glossary" ? "var(--accent-primary)" : "var(--text-primary)",
            cursor: "pointer",
            fontWeight: activeTab === "glossary" ? 600 : 500,
            fontSize: "12.5px",
            transition: "all 0.15s ease",
          }}
        >
          <BookOpen size={14} />
          <span>Character Glossary & Terms</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("script")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 14px",
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${activeTab === "script" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
            backgroundColor: activeTab === "script" ? "rgba(88, 166, 255, 0.15)" : "var(--bg-app)",
            color: activeTab === "script" ? "var(--accent-primary)" : "var(--text-primary)",
            cursor: "pointer",
            fontWeight: activeTab === "script" ? 600 : 500,
            fontSize: "12.5px",
            transition: "all 0.15s ease",
          }}
        >
          <Database size={14} />
          <span>Offline Script Memory & Index</span>
        </button>
      </div>

      {/* Main Tab Content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", position: "relative" }}>
        {activeTab === "glossary" ? <GlossaryManagerView /> : <ScriptManagerView />}
      </div>
    </div>
  );
};
