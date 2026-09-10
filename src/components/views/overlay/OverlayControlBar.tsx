import React from "react";
import { OverlayConfig } from "../../../types";
import { formatMonitorLabel } from "../../../utils/monitorUtils";
import { Monitor, Power, Move, Check, Sparkles } from "lucide-react";

export interface MonitorInfo {
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scale_factor: number;
  is_primary: boolean;
}

interface OverlayControlBarProps {
  config: OverlayConfig;
  monitors: MonitorInfo[];
  saveNotification: string | null;
  onUpdateConfig: (patch: Partial<OverlayConfig>) => void;
  onToggleOverlay: () => void;
  onOpenEditMode: () => void;
}

export const OverlayControlBar: React.FC<OverlayControlBarProps> = ({
  config,
  monitors,
  saveNotification,
  onUpdateConfig,
  onToggleOverlay,
  onOpenEditMode,
}) => {
  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="card-header" style={{ paddingBottom: "10px" }}>
        <div>
          <span className="card-title">
            <Sparkles size={16} color="var(--accent-primary)" /> In-Game Subtitle Overlay
          </span>
          <span className="card-subtitle">
            Borderless transparent overlay rendering translated visual novel text over your game
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {config.isEnabled ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11.5px",
                fontWeight: 600,
                color: "#3fb950",
                backgroundColor: "rgba(63, 185, 80, 0.12)",
                border: "1px solid rgba(63, 185, 80, 0.3)",
                padding: "3px 8px",
                borderRadius: "20px",
              }}
            >
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#3fb950" }} />
              Overlay Active
            </span>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11.5px",
                fontWeight: 600,
                color: "var(--text-muted)",
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                border: "1px solid var(--border-subtle)",
                padding: "3px 8px",
                borderRadius: "20px",
              }}
            >
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "var(--text-muted)" }} />
              Standby
            </span>
          )}
        </div>
      </div>

      {/* Top Row: Target Display Monitor Selector */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "12px", borderBottom: "1px solid var(--border-subtle)" }}>
        <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}>
          <Monitor size={14} color="var(--accent-primary)" /> Target Display Screen:
        </label>
        <select
          value={config.targetMonitor}
          onChange={(e) => onUpdateConfig({ targetMonitor: e.target.value })}
          style={{ height: "32px", fontSize: "12px", minWidth: "220px", maxWidth: "420px", flex: "1 1 auto" }}
          title="Select target display monitor for in-game overlay"
        >
          {monitors.map((m, idx) => (
            <option key={m.name || idx} value={m.name}>
              {formatMonitorLabel(m)}
            </option>
          ))}
        </select>
      </div>

      {/* Bottom Row: Master Action Buttons (Start / Stop & Reposition Box) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", marginTop: "12px" }}>
        {/* Master Start / Stop Button */}
        <button
          onClick={onToggleOverlay}
          className={config.isEnabled ? "btn-primary" : "btn-secondary"}
          style={{
            backgroundColor: config.isEnabled ? "var(--accent-success)" : "var(--bg-surface-elevated)",
            height: "34px",
            padding: "0 18px",
            fontWeight: 600,
          }}
        >
          <Power size={14} />
          <span>{config.isEnabled ? "Stop In-Game Overlay" : "Start In-Game Overlay"}</span>
        </button>

        {/* Reposition Box Button */}
        <button
          onClick={onOpenEditMode}
          disabled={!config.isEnabled}
          className="btn-secondary"
          style={{
            backgroundColor: "var(--bg-surface-elevated)",
            opacity: config.isEnabled ? 1 : 0.5,
            cursor: config.isEnabled ? "pointer" : "not-allowed",
            height: "34px",
            padding: "0 14px",
            fontWeight: 600,
          }}
          title="Drag and resize the overlay box directly on your screen"
        >
          <Move size={14} />
          <span>Drag / Reposition Box</span>
        </button>
      </div>

      {saveNotification && (
        <div
          style={{
            marginTop: "10px",
            padding: "7px 12px",
            backgroundColor: "rgba(63, 185, 80, 0.12)",
            border: "1px solid var(--accent-success)",
            borderRadius: "var(--radius-sm)",
            color: "var(--accent-success)",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <Check size={13} />
          <span>{saveNotification}</span>
        </div>
      )}
    </div>
  );
};
