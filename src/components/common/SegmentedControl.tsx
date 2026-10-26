import React, { useRef } from "react";

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

export function SegmentedControl<T extends string>({ options, value, onChange, size = "md", className = "", style }: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const moveSelection = (event: React.KeyboardEvent, current: T) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const enabled = options.filter((option) => !option.disabled);
    if (!enabled.length) return;
    event.preventDefault();
    const index = enabled.findIndex((option) => option.id === current);
    const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length;
    onChange(enabled[next].id);
    containerRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")[next]?.focus();
  };

  return (
    <div ref={containerRef} role="tablist" aria-label="Section navigation" className={`segmented-control segmented-control--${size} ${className}`} style={style}>
      {options.map((option) => (
        <button key={option.id} type="button" role="tab" aria-selected={value === option.id} tabIndex={value === option.id ? 0 : -1} disabled={option.disabled} onClick={() => onChange(option.id)} onKeyDown={(event) => moveSelection(event, option.id)} className={`segment${value === option.id ? " is-active" : ""}`}>
          {option.icon}<span>{option.label}</span>
          {option.badge !== undefined && <span className={`segment-badge segment-badge--${option.badgeColor ?? "neutral"}`}>{option.badge}</span>}
        </button>
      ))}
    </div>
  );
}
