import React from "react";
import {
  ResolvedModelReasoning,
  formatReasoningEffortLabel,
  getModelPreferredReasoningEffort,
} from "../../../services/openRouterService";
import { ReasoningEffort } from "../../../types";
import { Brain, Check } from "lucide-react";

export interface HoveredSubmenuState {
  x: number;
  y: number;
  modelId: string;
  capabilities: ResolvedModelReasoning;
}

interface ReasoningSubmenuProps {
  hoveredSubmenu: HoveredSubmenuState;
  onSelect: (modelId: string, effort?: ReasoningEffort) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export const ReasoningSubmenu: React.FC<ReasoningSubmenuProps> = ({
  hoveredSubmenu,
  onSelect,
  onMouseEnter,
  onMouseLeave,
}) => {
  const currentPreferred = getModelPreferredReasoningEffort(hoveredSubmenu.modelId);
  const isDefaultSelected = !currentPreferred || currentPreferred === "default";
  const isOffSelected = currentPreferred === "none";

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "fixed",
        top: hoveredSubmenu.y,
        left: hoveredSubmenu.x,
        width: "200px",
        backgroundColor: "#161B26",
        border: "1px solid var(--accent-purple, #a855f7)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "0 14px 40px rgba(0,0,0,0.9)",
        zIndex: 1000000,
        padding: "4px 0",
        display: "flex",
        flexDirection: "column",
        gap: "1px",
      }}
    >
      <div
        style={{
          padding: "6px 10px",
          borderBottom: "1px solid rgba(168, 85, 247, 0.25)",
          backgroundColor: "rgba(168, 85, 247, 0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent-purple, #a855f7)", display: "flex", alignItems: "center", gap: "4px" }}>
          <Brain size={12} /> Thinking Effort
        </span>
        {hoveredSubmenu.capabilities.isMandatory && (
          <span style={{ fontSize: "9.5px", color: "var(--accent-gold)", fontWeight: 600 }}>Required</span>
        )}
      </div>

      <div style={{ maxHeight: "240px", overflowY: "auto" }}>
        {/* Default Option */}
        <div
          onClick={() => onSelect(hoveredSubmenu.modelId, "default")}
          style={{
            padding: "7px 10px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "11.5px",
            backgroundColor: isDefaultSelected ? "rgba(168, 85, 247, 0.18)" : "transparent",
            color: isDefaultSelected ? "var(--accent-purple, #a855f7)" : "var(--text-primary)",
            fontWeight: isDefaultSelected ? 700 : 500,
          }}
          onMouseEnter={(e) => {
            if (!isDefaultSelected) e.currentTarget.style.backgroundColor = "var(--bg-surface-elevated)";
          }}
          onMouseLeave={(e) => {
            if (!isDefaultSelected) e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <span>
            Default{hoveredSubmenu.capabilities.defaultEffort ? `: ${formatReasoningEffortLabel(hoveredSubmenu.capabilities.defaultEffort)}` : ""}
          </span>
          {isDefaultSelected && <Check size={12} color="var(--accent-purple, #a855f7)" />}
        </div>

        {/* Off Option (if not mandatory) */}
        {!hoveredSubmenu.capabilities.isMandatory && (
          <div
            onClick={() => onSelect(hoveredSubmenu.modelId, "none")}
            style={{
              padding: "7px 10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "11.5px",
              backgroundColor: isOffSelected ? "rgba(168, 85, 247, 0.18)" : "transparent",
              color: isOffSelected ? "var(--accent-purple, #a855f7)" : "var(--text-primary)",
              fontWeight: isOffSelected ? 700 : 500,
            }}
            onMouseEnter={(e) => {
              if (!isOffSelected) e.currentTarget.style.backgroundColor = "var(--bg-surface-elevated)";
            }}
            onMouseLeave={(e) => {
              if (!isOffSelected) e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <span>Off</span>
            {isOffSelected && <Check size={12} color="var(--accent-purple, #a855f7)" />}
          </div>
        )}

        {/* Specific effort tiers */}
        {hoveredSubmenu.capabilities.mode === "efforts_list" &&
          hoveredSubmenu.capabilities.supportedEfforts
            .filter((eff) => eff !== "none")
            .map((eff) => {
              const isEffSelected = currentPreferred === eff;
              return (
                <div
                  key={eff}
                  onClick={() => onSelect(hoveredSubmenu.modelId, eff as ReasoningEffort)}
                  style={{
                    padding: "7px 10px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "11.5px",
                    backgroundColor: isEffSelected ? "rgba(168, 85, 247, 0.18)" : "transparent",
                    color: isEffSelected ? "var(--accent-purple, #a855f7)" : "var(--text-primary)",
                    fontWeight: isEffSelected ? 700 : 500,
                  }}
                  onMouseEnter={(e) => {
                    if (!isEffSelected) e.currentTarget.style.backgroundColor = "var(--bg-surface-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isEffSelected) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <span>{formatReasoningEffortLabel(eff)}</span>
                  {isEffSelected && <Check size={12} color="var(--accent-purple, #a855f7)" />}
                </div>
              );
            })}
      </div>
    </div>
  );
};
