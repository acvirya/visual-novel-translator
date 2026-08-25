import React from "react";

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  badgeColor?: "success" | "warning" | "danger" | "cyan" | "neutral";
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  style?: React.CSSProperties;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className = "",
  style,
}: SegmentedControlProps<T>) {
  const isSmall = size === "sm";

  return (
    <div
      role="tablist"
      className={`segmented-control-container ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        backgroundColor: "var(--bg-app)",
        padding: "3px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border-subtle)",
        gap: "3px",
        userSelect: "none",
        ...style,
      }}
    >
      {options.map((opt) => {
        const isActive = value === opt.id;
        const isDisabled = opt.disabled;

        const getBadgeStyle = () => {
          switch (opt.badgeColor) {
            case "success":
              return { bg: "rgba(63, 185, 80, 0.2)", text: "var(--accent-success)", border: "rgba(63, 185, 80, 0.4)" };
            case "warning":
              return { bg: "rgba(210, 153, 34, 0.2)", text: "var(--accent-gold)", border: "rgba(210, 153, 34, 0.4)" };
            case "danger":
              return { bg: "rgba(248, 81, 73, 0.2)", text: "var(--accent-danger)", border: "rgba(248, 81, 73, 0.4)" };
            case "cyan":
              return { bg: "rgba(56, 189, 248, 0.2)", text: "var(--accent-cyan)", border: "rgba(56, 189, 248, 0.4)" };
            default:
              return { bg: "var(--bg-surface-elevated)", text: "var(--text-muted)", border: "var(--border-subtle)" };
          }
        };

        const badgeStyle = getBadgeStyle();

        return (
          <button
            key={opt.id}
            role="tab"
            aria-selected={isActive}
            disabled={isDisabled}
            onClick={() => !isDisabled && onChange(opt.id)}
            type="button"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: isSmall ? "5px" : "7px",
              height: isSmall ? "28px" : "32px",
              padding: isSmall ? "0 10px" : "0 14px",
              borderRadius: "calc(var(--radius-sm) - 1px)",
              border: `1px solid ${isActive ? "var(--border-focus)" : "transparent"}`,
              backgroundColor: isActive
                ? "var(--accent-primary-subtle)"
                : "transparent",
              color: isActive
                ? "var(--accent-primary)"
                : isDisabled
                ? "var(--text-muted)"
                : "var(--text-secondary)",
              fontWeight: isActive ? 600 : 500,
              fontSize: isSmall ? "var(--text-xs)" : "var(--text-sm)",
              cursor: isDisabled ? "not-allowed" : "pointer",
              opacity: isDisabled ? 0.5 : 1,
              transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: isActive ? "0 1px 4px rgba(78, 115, 223, 0.2)" : "none",
            }}
          >
            {opt.icon && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  color: isActive ? "var(--accent-primary)" : "var(--text-muted)",
                }}
              >
                {opt.icon}
              </span>
            )}
            <span>{opt.label}</span>
            {opt.badge !== undefined && (
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: "var(--radius-full)",
                  backgroundColor: badgeStyle.bg,
                  color: badgeStyle.text,
                  border: `1px solid ${badgeStyle.border}`,
                  lineHeight: "1.2",
                }}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
