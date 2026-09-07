import React from "react";
import { Brain } from "lucide-react";
import { ReasoningEffort } from "../../../types";
import {
  formatReasoningEffortLabel,
  ResolvedModelReasoning,
} from "../../../services/openRouterService";

interface ReasoningSettingsCardProps {
  selectedModelId: string;
  modelName: string;
  reasoningCapabilities: ResolvedModelReasoning;
  reasoningEffort: ReasoningEffort;
  onChangeReasoningEffort: (effort: ReasoningEffort) => void;
  reasoningMaxTokens: number;
  reasoningMaxTokensInput: string;
  onChangeMaxTokens: (inputVal: string, tokens: number) => void;
  excludeReasoning: boolean;
  onChangeExcludeReasoning: (val: boolean) => void;
}

export const ReasoningSettingsCard: React.FC<ReasoningSettingsCardProps> = ({
  selectedModelId,
  modelName,
  reasoningCapabilities,
  reasoningEffort,
  onChangeReasoningEffort,
  reasoningMaxTokens,
  reasoningMaxTokensInput,
  onChangeMaxTokens,
  excludeReasoning,
  onChangeExcludeReasoning,
}) => {
  if (selectedModelId.startsWith("mt:")) {
    return null;
  }

  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="card-header">
        <div>
          <span className="card-title">
            <Brain size={16} style={{ color: "var(--accent-purple, #a855f7)" }} /> 3. Preferred Reasoning & Thinking Tokens
          </span>
          <span className="card-subtitle">
            Configure preferred reasoning effort, token budget, and thinking trace visibility per model
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {/* Status Indicator Banner */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: reasoningCapabilities.isSupported ? "rgba(168, 85, 247, 0.08)" : "var(--bg-app)",
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            border: reasoningCapabilities.isSupported ? "1px solid rgba(168, 85, 247, 0.3)" : "1px solid var(--border-subtle)",
            fontSize: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Brain size={15} color={reasoningCapabilities.isSupported ? "var(--accent-purple, #a855f7)" : "var(--text-muted)"} />
            <span style={{ fontWeight: 600, color: reasoningCapabilities.isSupported ? "var(--text-primary)" : "var(--text-secondary)" }}>
              {reasoningCapabilities.isSupported
                ? `Thinking-Capable Model: "${modelName || selectedModelId}"`
                : `Standard Model: "${modelName || selectedModelId}"`}
            </span>
          </div>
          <span style={{ fontSize: "11px", color: reasoningCapabilities.isSupported ? "var(--accent-purple, #a855f7)" : "var(--text-muted)", fontWeight: 500 }}>
            {!reasoningCapabilities.isSupported
              ? "Direct translation (Reasoning not supported by this model)"
              : reasoningCapabilities.isMandatory
              ? "⚠️ Mandatory Reasoning"
              : reasoningCapabilities.mode === "efforts_list"
              ? `✓ Supported Levels: ${reasoningCapabilities.supportedEfforts.join(", ")}`
              : "✓ Binary Reasoning Toggle"}
          </span>
        </div>

        {/* Reasoning Grid: Effort + Custom Max Tokens */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          {/* Reasoning Effort */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              Preferred Reasoning Effort / Mode:
            </label>
            <select
              className="input-field"
              value={
                !reasoningCapabilities.isSupported
                  ? "none"
                  : reasoningCapabilities.mode === "toggle_only"
                  ? (reasoningEffort === "none" ? "none" : reasoningEffort === "custom" ? "custom" : "default")
                  : (reasoningCapabilities.supportedEfforts.includes(reasoningEffort) || reasoningEffort === "none" || reasoningEffort === "default" || reasoningEffort === "custom" ? reasoningEffort : "default")
              }
              disabled={!reasoningCapabilities.isSupported}
              onChange={(e) => onChangeReasoningEffort(e.target.value as ReasoningEffort)}
              style={{ width: "100%", fontSize: "12px", padding: "7px 10px", fontWeight: 600, backgroundColor: "var(--bg-surface-elevated)" }}
            >
              {!reasoningCapabilities.isSupported ? (
                <option value="none">Not Supported by Model</option>
              ) : reasoningCapabilities.mode === "efforts_list" ? (
                <>
                  <option value="default">
                    Default{reasoningCapabilities.defaultEffort ? `: ${formatReasoningEffortLabel(reasoningCapabilities.defaultEffort)}` : ""}
                  </option>
                  {!reasoningCapabilities.isMandatory && <option value="none">Off</option>}
                  {reasoningCapabilities.supportedEfforts.map((eff) => (
                    <option key={eff} value={eff}>
                      {formatReasoningEffortLabel(eff)}
                    </option>
                  ))}
                  {reasoningCapabilities.supportsMaxTokens && <option value="custom">Custom Token Budget</option>}
                </>
              ) : (
                <>
                  <option value="default">Enabled (Active)</option>
                  {!reasoningCapabilities.isMandatory && <option value="none">Off</option>}
                  {reasoningCapabilities.supportsMaxTokens && <option value="custom">Custom Token Budget</option>}
                </>
              )}
            </select>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "4px" }}>
              {!reasoningCapabilities.isSupported
                ? "Parameters will be automatically skipped for this standard model."
                : "Preferred thinking level is saved specifically for this model. 'Default' uses OpenRouter's model default."}
            </span>
          </div>

          {/* Custom Max Reasoning Tokens Budget */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              Max Reasoning Tokens Budget ({reasoningMaxTokens > 0 ? `${reasoningMaxTokens} tokens` : "Unset / Dynamic"}):
            </label>
            <input
              type="number"
              min={0}
              step={512}
              placeholder={reasoningCapabilities.supportsMaxTokens ? "e.g. 2048 (0 = auto)" : "Optional token budget limit"}
              className="input-field"
              disabled={!reasoningCapabilities.isSupported}
              value={reasoningMaxTokensInput}
              onChange={(e) => {
                const val = e.target.value;
                const parsed = parseInt(val, 10);
                onChangeMaxTokens(val, isNaN(parsed) || parsed < 0 ? 0 : parsed);
              }}
              style={{ width: "100%", fontSize: "12px", padding: "7px 10px", fontWeight: 600 }}
            />
            <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "4px" }}>
              {reasoningCapabilities.supportsMaxTokens
                ? "✓ Explicit max_tokens budget supported natively by this model (e.g. Claude 3.7 Sonnet)."
                : "Token limit ceiling for reasoning steps (if accepted upstream)."}
            </span>
          </div>
        </div>

        {/* Exclude Reasoning from Output Checkbox */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "var(--bg-app)",
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
              Exclude Reasoning Traces from Output (`exclude: true`)
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Keeps game translation output pure by hiding chain-of-thought tokens from the final dialog text.
            </span>
          </div>

          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={excludeReasoning}
              onChange={(e) => onChangeExcludeReasoning(e.target.checked)}
              style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--accent-primary)" }}
            />
          </label>
        </div>
      </div>
    </div>
  );
};
