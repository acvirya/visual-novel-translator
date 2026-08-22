import React, { useState, useEffect } from "react";
import { PreprocessingStep, PreprocessingSource } from "../../types";
import {
  DEFAULT_PREPROCESSING_PIPELINE,
  DEFAULT_PREPROCESSING_SOURCES,
} from "../../utils/textPreprocessor";
import { Sparkles, Sliders, Check, ExternalLink } from "lucide-react";

export interface TextPreprocessingWidgetProps {
  source: PreprocessingSource; // "textractor" | "ocr" | "batch" | "manual"
  title?: string;
  onOpenSettings?: () => void;
  compact?: boolean;
}

export const TextPreprocessingWidget: React.FC<TextPreprocessingWidgetProps> = ({
  source,
  title,
  onOpenSettings,
  compact = false,
}) => {
  const [pipeline, setPipeline] = useState<PreprocessingStep[]>(() => {
    try {
      const saved = localStorage.getItem("vn_preprocessing_pipeline");
      if (saved) {
        const parsed: PreprocessingStep[] = JSON.parse(saved);
        const existingIds = new Set(parsed.map((s) => s.id));
        const missingDefaults = DEFAULT_PREPROCESSING_PIPELINE.filter((d) => !existingIds.has(d.id));
        return [...parsed, ...missingDefaults];
      }
      return DEFAULT_PREPROCESSING_PIPELINE;
    } catch {
      return DEFAULT_PREPROCESSING_PIPELINE;
    }
  });

  // Reload when storage changes in other views/tabs
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const saved = localStorage.getItem("vn_preprocessing_pipeline");
        if (saved) {
          setPipeline(JSON.parse(saved));
        }
      } catch {}
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const savePipeline = (updated: PreprocessingStep[]) => {
    setPipeline(updated);
    localStorage.setItem("vn_preprocessing_pipeline", JSON.stringify(updated));
  };

  // Filter steps applicable to this source
  const relevantSteps = pipeline.filter((step) => {
    const sources = step.applicableSources ?? DEFAULT_PREPROCESSING_SOURCES;
    return sources.includes(source);
  });

  const toggleStep = (stepId: string) => {
    const updated = pipeline.map((s) => (s.id === stepId ? { ...s, isEnabled: !s.isEnabled } : s));
    savePipeline(updated);
  };

  const sourceLabels: Record<PreprocessingSource, string> = {
    textractor: "Textractor Hooking",
    ocr: "Screen OCR",
    batch: "Batch Script",
    manual: "Manual Text",
  };

  return (
    <div
      style={{
        backgroundColor: "var(--bg-app)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-sm)",
        padding: compact ? "10px 12px" : "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Sparkles size={14} color="var(--accent-primary)" />
          <span style={{ fontWeight: 600, fontSize: "12px", color: "var(--text-primary)" }}>
            {title || `⚡ Active Clean Filters (${sourceLabels[source]})`}
          </span>
        </div>

        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="btn-secondary"
            style={{ fontSize: "10.5px", padding: "2px 6px", display: "flex", alignItems: "center", gap: "4px" }}
            title="Configure master regex rules in Settings"
          >
            <Sliders size={11} />
            <span>Master Rules</span>
            <ExternalLink size={10} />
          </button>
        )}
      </div>

      {/* Rules Pill Chips Grid */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {relevantSteps.map((step) => {
          const isEnabled = step.isEnabled;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => toggleStep(step.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 8px",
                borderRadius: "14px",
                fontSize: "11px",
                fontWeight: isEnabled ? 600 : 400,
                border: `1px solid ${isEnabled ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                backgroundColor: isEnabled ? "rgba(88, 166, 255, 0.12)" : "var(--bg-card)",
                color: isEnabled ? "var(--accent-primary)" : "var(--text-muted)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title={`${step.description} (Click to toggle)`}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: isEnabled ? "var(--accent-primary)" : "var(--border-subtle)",
                }}
              />
              <span>{step.name}</span>
              {isEnabled && <Check size={11} />}
            </button>
          );
        })}

        {relevantSteps.length === 0 && (
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            No specific filters configured for this source.
          </span>
        )}
      </div>
    </div>
  );
};
