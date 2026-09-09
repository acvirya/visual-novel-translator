import React, { useState, useEffect, useRef } from "react";
import { Keyboard, X, RotateCcw } from "lucide-react";

interface HotkeyRecorderProps {
  value: string;
  onChange: (newValue: string) => void;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Normalizes a KeyboardEvent into a Tauri-compatible global shortcut string
 * (e.g., "Alt+S", "Ctrl+Shift+L", "F9").
 */
export function normalizeKeyboardEvent(e: React.KeyboardEvent | KeyboardEvent): { shortcut: string | null; isModifierOnly: boolean; heldModifiers: string[] } {
  const heldModifiers: string[] = [];
  if (e.ctrlKey) heldModifiers.push("Ctrl");
  if (e.altKey) heldModifiers.push("Alt");
  if (e.shiftKey) heldModifiers.push("Shift");
  if (e.metaKey) heldModifiers.push("Command");

  // Check if current key is itself just a modifier
  const modifierKeys = ["Control", "Alt", "Shift", "Meta", "AltGraph"];
  if (modifierKeys.includes(e.key)) {
    return { shortcut: null, isModifierOnly: true, heldModifiers };
  }

  // Handle Function keys (F1 - F12) without mandatory modifiers
  const isFunctionKey = /^F([1-9]|1[0-2])$/i.test(e.key);

  // If not a function key and no modifiers are pressed, ignore standalone regular key
  // (Global shortcuts should have at least one modifier unless they are function keys)
  if (!isFunctionKey && heldModifiers.length === 0) {
    return { shortcut: null, isModifierOnly: false, heldModifiers: [] };
  }

  let mainKey = e.key;

  // Normalize single letters to uppercase
  if (/^[a-z]$/i.test(mainKey)) {
    mainKey = mainKey.toUpperCase();
  } else if (mainKey === " ") {
    mainKey = "Space";
  } else if (mainKey === "ArrowUp") {
    mainKey = "Up";
  } else if (mainKey === "ArrowDown") {
    mainKey = "Down";
  } else if (mainKey === "ArrowLeft") {
    mainKey = "Left";
  } else if (mainKey === "ArrowRight") {
    mainKey = "Right";
  } else if (mainKey.length === 1) {
    mainKey = mainKey.toUpperCase();
  }

  const parts = [...heldModifiers, mainKey];
  return { shortcut: parts.join("+"), isModifierOnly: false, heldModifiers };
}

export const HotkeyRecorder: React.FC<HotkeyRecorderProps> = ({
  value,
  onChange,
  defaultValue,
  placeholder = "Click to set shortcut...",
  disabled = false,
}) => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [pendingModifiers, setPendingModifiers] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current value into badge segments
  const keyTokens = value ? value.split("+").map((s) => s.trim()).filter(Boolean) : [];

  // Stop recording when clicking outside
  useEffect(() => {
    if (!isRecording) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsRecording(false);
        setPendingModifiers([]);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isRecording]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isRecording) return;

    e.preventDefault();
    e.stopPropagation();

    // Escape cancels recording
    if (e.key === "Escape") {
      setIsRecording(false);
      setPendingModifiers([]);
      return;
    }

    // Backspace or Delete clears the hotkey
    if ((e.key === "Backspace" || e.key === "Delete") && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      onChange("");
      setIsRecording(false);
      setPendingModifiers([]);
      return;
    }

    const { shortcut, isModifierOnly, heldModifiers } = normalizeKeyboardEvent(e);

    if (isModifierOnly) {
      setPendingModifiers(heldModifiers);
      return;
    }

    if (shortcut) {
      onChange(shortcut);
      setIsRecording(false);
      setPendingModifiers([]);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isRecording) return;
    const modifierKeys = ["Control", "Alt", "Shift", "Meta"];
    if (modifierKeys.includes(e.key)) {
      const held: string[] = [];
      if (e.ctrlKey) held.push("Ctrl");
      if (e.altKey) held.push("Alt");
      if (e.shiftKey) held.push("Shift");
      if (e.metaKey) held.push("Command");
      setPendingModifiers(held);
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={disabled ? -1 : 0}
      onClick={() => {
        if (!disabled && !isRecording) {
          setIsRecording(true);
          setPendingModifiers([]);
        }
      }}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        padding: "6px 10px",
        backgroundColor: isRecording ? "rgba(88, 166, 255, 0.08)" : "var(--bg-app)",
        border: `1px solid ${isRecording ? "var(--accent-primary)" : "var(--border-subtle)"}`,
        borderRadius: "var(--radius-sm)",
        cursor: disabled ? "not-allowed" : "pointer",
        outline: "none",
        transition: "all 0.15s ease-in-out",
        boxShadow: isRecording ? "0 0 0 2px rgba(88, 166, 255, 0.25)" : "none",
        minHeight: "36px",
        userSelect: "none",
      }}
      title={isRecording ? "Press desired key combination on your keyboard..." : "Click to record new hotkey"}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", flex: 1 }}>
        <Keyboard
          size={14}
          color={isRecording ? "var(--accent-primary)" : "var(--text-muted)"}
          style={{ flexShrink: 0 }}
        />

        {isRecording ? (
          pendingModifiers.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {pendingModifiers.map((mod, idx) => (
                <React.Fragment key={idx}>
                  <kbd className="hotkey-badge active-held">{mod}</kbd>
                  <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>+</span>
                </React.Fragment>
              ))}
              <span style={{ fontSize: "11.5px", color: "var(--accent-primary)", fontStyle: "italic" }}>
                Press key...
              </span>
            </div>
          ) : (
            <span style={{ fontSize: "11.5px", color: "var(--accent-primary)", fontStyle: "italic", animation: "pulse 1.5s infinite" }}>
              Press shortcut on keyboard (Esc to cancel)...
            </span>
          )
        ) : keyTokens.length > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
            {keyTokens.map((token, idx) => (
              <React.Fragment key={idx}>
                <kbd
                  style={{
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "4px",
                    padding: "2px 6px",
                    fontSize: "11.5px",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono, monospace)",
                    color: "var(--text-main)",
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.2)",
                  }}
                >
                  {token}
                </kbd>
                {idx < keyTokens.length - 1 && (
                  <span style={{ color: "var(--text-muted)", fontSize: "11px", fontWeight: 600 }}>+</span>
                )}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            {placeholder}
          </span>
        )}
      </div>

      {/* Action Buttons: Reset to default or Clear */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }} onClick={(e) => e.stopPropagation()}>
        {defaultValue && value !== defaultValue && (
          <button
            type="button"
            onClick={() => {
              onChange(defaultValue);
              setIsRecording(false);
            }}
            title={`Reset to default (${defaultValue})`}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "2px 4px",
              borderRadius: "3px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <RotateCcw size={12} />
          </button>
        )}

        {value && !disabled && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setIsRecording(false);
            }}
            title="Clear shortcut"
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "2px 4px",
              borderRadius: "3px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
};
