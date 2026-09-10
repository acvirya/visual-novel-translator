import React from "react";
import {
  OpenRouterModel,
  getModelReasoningCapabilities,
  formatReasoningEffortLabel,
  getModelPreferredReasoningEffort,
} from "../../../services/openRouterService";
import { splitModelProviderAndName } from "../ModelSelectorCombobox";
import { Star, Brain, ChevronRight } from "lucide-react";

interface ModelRowItemProps {
  model: OpenRouterModel;
  isSelected: boolean;
  isStarred: boolean;
  allMergedModels: OpenRouterModel[];
  onSelect: (modelId: string) => void;
  onToggleStar: (modelId: string, e: React.MouseEvent) => void;
  onMouseEnter: (e: React.MouseEvent<HTMLDivElement>, model: OpenRouterModel) => void;
  onMouseLeave: () => void;
}

export const ModelRowItem: React.FC<ModelRowItemProps> = ({
  model,
  isSelected,
  isStarred,
  allMergedModels,
  onSelect,
  onToggleStar,
  onMouseEnter,
  onMouseLeave,
}) => {
  const parsed = splitModelProviderAndName(model);
  const capabilities = getModelReasoningCapabilities(model, allMergedModels);
  const preferredEffort = getModelPreferredReasoningEffort(model.id);
  const effortPreviewLabel = preferredEffort && preferredEffort !== "default"
    ? formatReasoningEffortLabel(preferredEffort)
    : (capabilities.defaultEffort ? formatReasoningEffortLabel(capabilities.defaultEffort) : (capabilities.mode === "toggle_only" ? "On" : "Effort"));

  return (
    <div
      onClick={() => onSelect(model.id)}
      style={{
        padding: "7px 10px",
        cursor: "pointer",
        backgroundColor: isSelected ? "rgba(78, 115, 223, 0.25)" : "transparent",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = "var(--bg-surface-elevated)";
        onMouseEnter(e, model);
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
        onMouseLeave();
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1px", overflow: "hidden", minWidth: 0 }}>
        <span style={{ fontWeight: 600, fontSize: "12px", color: "var(--text-primary)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
          {parsed.modelName}
        </span>
        <span style={{ fontSize: "10.5px", color: "var(--accent-cyan)", fontWeight: 500, fontFamily: "var(--font-mono)" }}>
          {parsed.provider}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
        {capabilities.isSupported && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "2px",
              fontSize: "9px",
              fontWeight: 700,
              color: "var(--accent-purple, #a855f7)",
              backgroundColor: "rgba(168, 85, 247, 0.12)",
              border: "1px solid rgba(168, 85, 247, 0.25)",
              padding: "1px 5px",
              borderRadius: "3px",
            }}
            title={`Will select: ${effortPreviewLabel}. Hover to change.`}
          >
            <Brain size={9} />
            <span>{effortPreviewLabel}</span>
            <ChevronRight size={9} />
          </span>
        )}
        <button
          type="button"
          onClick={(e) => onToggleStar(model.id, e)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px",
            color: isStarred ? "var(--accent-gold)" : "var(--text-muted)",
          }}
          title={isStarred ? "Remove from starred" : "Add to starred favorites"}
        >
          <Star size={13} fill={isStarred ? "var(--accent-gold)" : "none"} />
        </button>
      </div>
    </div>
  );
};
