import React from "react";

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = "md",
}) => {
  const isSm = size === "sm";
  const switchWidth = isSm ? 34 : 44;
  const switchHeight = isSm ? 18 : 24;
  const knobSize = isSm ? 14 : 18;
  const knobOffset = isSm ? 2 : 3;
  const knobTranslate = isSm ? 16 : 20;

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        userSelect: "none",
        width: label ? "100%" : "auto",
      }}
    >
      {(label || description) && (
        <div style={{ flex: 1, minWidth: 0 }}>
          {label && (
            <div style={{ fontSize: isSm ? "13px" : "14px", fontWeight: 500, color: "#f3f4f6" }}>
              {label}
            </div>
          )}
          {description && (
            <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "2px" }}>
              {description}
            </div>
          )}
        </div>
      )}

      <div
        onClick={(e) => {
          e.preventDefault();
          if (!disabled) onChange(!checked);
        }}
        style={{
          position: "relative",
          width: `${switchWidth}px`,
          height: `${switchHeight}px`,
          backgroundColor: checked ? "#6366f1" : "rgba(255, 255, 255, 0.15)",
          borderRadius: `${switchHeight}px`,
          transition: "background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: `${knobOffset}px`,
            left: `${knobOffset}px`,
            width: `${knobSize}px`,
            height: `${knobSize}px`,
            backgroundColor: "#ffffff",
            borderRadius: "50%",
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
            transform: checked ? `translateX(${knobTranslate}px)` : "translateX(0)",
            transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </div>
    </label>
  );
};
