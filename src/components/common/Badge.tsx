import React from "react";

export interface BadgeProps {
  children: React.ReactNode;
  variant?: "primary" | "success" | "warning" | "danger" | "info" | "neutral";
  size?: "sm" | "md";
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "neutral",
  size = "sm",
  dot = false,
}) => {
  const getStyles = () => {
    switch (variant) {
      case "primary":
        return {
          bg: "rgba(99, 102, 241, 0.12)",
          border: "rgba(99, 102, 241, 0.3)",
          text: "#a5b4fc",
          dotColor: "#818cf8",
        };
      case "success":
        return {
          bg: "rgba(16, 185, 129, 0.12)",
          border: "rgba(16, 185, 129, 0.3)",
          text: "#6ee7b7",
          dotColor: "#34d399",
        };
      case "warning":
        return {
          bg: "rgba(245, 158, 11, 0.12)",
          border: "rgba(245, 158, 11, 0.3)",
          text: "#fcd34d",
          dotColor: "#fbbf24",
        };
      case "danger":
        return {
          bg: "rgba(239, 68, 68, 0.12)",
          border: "rgba(239, 68, 68, 0.3)",
          text: "#fca5a5",
          dotColor: "#f87171",
        };
      case "info":
        return {
          bg: "rgba(14, 165, 233, 0.12)",
          border: "rgba(14, 165, 233, 0.3)",
          text: "#7dd3fc",
          dotColor: "#38bdf8",
        };
      default:
        return {
          bg: "rgba(156, 163, 175, 0.12)",
          border: "rgba(156, 163, 175, 0.25)",
          text: "#9ca3af",
          dotColor: "#9ca3af",
        };
    }
  };

  const styles = getStyles();
  const isSm = size === "sm";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: isSm ? "2px 8px" : "4px 10px",
        borderRadius: "9999px",
        fontSize: isSm ? "11px" : "12px",
        fontWeight: 600,
        backgroundColor: styles.bg,
        border: `1px solid ${styles.border}`,
        color: styles.text,
        letterSpacing: "0.02em",
        lineHeight: 1.3,
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: styles.dotColor,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
};
