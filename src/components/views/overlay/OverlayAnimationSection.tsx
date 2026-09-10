import React from "react";
import { OverlayConfig } from "../../../types";
import { Film, RotateCcw, Zap } from "lucide-react";
import { SegmentedControl } from "../../common/SegmentedControl";

interface OverlayAnimationSectionProps {
  config: OverlayConfig;
  onUpdateConfig: (patch: Partial<OverlayConfig>) => void;
  onReplayPreview: () => void;
}

export const OverlayAnimationSection: React.FC<OverlayAnimationSectionProps> = ({
  config,
  onUpdateConfig,
  onReplayPreview,
}) => {
  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="card-header" style={{ marginBottom: "12px" }}>
        <div>
          <span className="card-title">
            <Film size={16} color="var(--accent-cyan)" /> Subtitle Text Animation
          </span>
          <span className="card-subtitle">
            Choose how translated dialogue text appears on screen (Typewriter stream or CSS transitions)
          </span>
        </div>

        <button
          type="button"
          onClick={onReplayPreview}
          className="btn-secondary"
          style={{ height: "28px", padding: "0 10px", fontSize: "11.5px" }}
          title="Replay the animation in the live preview sandbox above"
        >
          <RotateCcw size={12} color="var(--accent-cyan)" />
          <span>Replay Animation</span>
        </button>
      </div>

      {/* Animation Mode Selector */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <SegmentedControl<"none" | "typewriter" | "fade" | "blur">
            options={[
              { id: "none", label: "None (Instant)" },
              { id: "typewriter", label: "Typewriter (VN Stream)" },
              { id: "fade", label: "Smooth Text Fade" },
              { id: "blur", label: "Blur Reveal Text" },
            ]}
            value={config.textAnimation || "none"}
            onChange={(mode) => onUpdateConfig({ textAnimation: mode })}
            size="md"
          />
        </div>

        {/* Speed / Duration Slider (When animation is enabled) */}
        {config.textAnimation && config.textAnimation !== "none" && (
          <div
            style={{
              backgroundColor: "var(--bg-app)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {config.textAnimation === "typewriter" ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Zap size={13} color="var(--accent-gold)" /> Typewriter Speed (Per Character):
                  </label>
                  <strong style={{ fontSize: "12px", color: "var(--accent-gold)" }}>
                    {config.animationSpeedMs || 25} ms / char{" "}
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 400 }}>
                      ({(config.animationSpeedMs || 25) <= 15 ? "Fast" : (config.animationSpeedMs || 25) <= 35 ? "Normal" : "Slow"})
                    </span>
                  </strong>
                </div>
                <input
                  type="range"
                  min={5}
                  max={80}
                  step={1}
                  value={config.animationSpeedMs || 25}
                  onChange={(e) => onUpdateConfig({ animationSpeedMs: Number(e.target.value) })}
                  style={{ width: "100%" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                  <span>5ms (Ultra Fast)</span>
                  <span>80ms (Slow)</span>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Zap size={13} color="var(--accent-cyan)" /> Text Transition Duration:
                  </label>
                  <strong style={{ fontSize: "12px", color: "var(--accent-cyan)" }}>
                    {config.animationSpeedMs || (config.textAnimation === "blur" ? 350 : 250)} ms
                  </strong>
                </div>
                <input
                  type="range"
                  min={100}
                  max={600}
                  step={50}
                  value={config.animationSpeedMs || (config.textAnimation === "blur" ? 350 : 250)}
                  onChange={(e) => onUpdateConfig({ animationSpeedMs: Number(e.target.value) })}
                  style={{ width: "100%" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                  <span>100ms (Snappy)</span>
                  <span>600ms (Cinematic)</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
