import React, { useId } from "react";

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, label, description, disabled = false, size = "md" }) => {
  const id = useId();
  return (
    <label className={`toggle-field toggle-field--${size}${disabled ? " is-disabled" : ""}`}>
      {(label || description) && <span className="toggle-copy"><span>{label}</span>{description && <small id={`${id}-description`}>{description}</small>}</span>}
      <input type="checkbox" role="switch" className="toggle-input" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} aria-label={label || "Toggle setting"} aria-describedby={description ? `${id}-description` : undefined} />
      <span className="toggle-track" aria-hidden="true"><span /></span>
    </label>
  );
};
