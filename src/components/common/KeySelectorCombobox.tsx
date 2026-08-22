import React, { useState, useEffect, useRef } from "react";
import { ChevronDown, Search, X, Check, Plus } from "lucide-react";

export interface KeySelectorComboboxProps {
  value: string;
  onChange: (key: string) => void;
  detectedKeys: string[];
  placeholder?: string;
  disabled?: boolean;
  allowNone?: boolean;
  label?: string;
  helperText?: string;
}

export const KeySelectorCombobox: React.FC<KeySelectorComboboxProps> = ({
  value,
  onChange,
  detectedKeys,
  placeholder = "Select or type key...",
  disabled = false,
  allowNone = false,
  label,
  helperText,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Filter keys based on search query
  const filteredKeys = useMemoFilteredKeys(detectedKeys, searchQuery);

  const isCustomTyped = searchQuery.trim() !== "" && !detectedKeys.includes(searchQuery.trim()) && searchQuery.trim() !== "none";

  const handleSelect = (key: string) => {
    onChange(key);
    setIsOpen(false);
    setSearchQuery("");
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      {label && (
        <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
          {label}
        </label>
      )}

      {/* Main Combobox Display Field */}
      <div
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            if (!isOpen) {
              setTimeout(() => inputRef.current?.focus(), 50);
            }
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: disabled ? "var(--bg-surface-elevated)" : "var(--bg-app)",
          border: isOpen ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          padding: "6px 10px",
          cursor: disabled ? "not-allowed" : "pointer",
          userSelect: "none",
          transition: "border-color 0.15s ease",
          minHeight: "34px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value === "none" ? (
            <span style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
              None (Narration only)
            </span>
          ) : value ? (
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
              {value}
            </span>
          ) : (
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {placeholder}
            </span>
          )}

          {value && detectedKeys.includes(value) && (
            <span
              style={{
                fontSize: "9.5px",
                backgroundColor: "rgba(56, 189, 248, 0.12)",
                color: "var(--accent-cyan)",
                padding: "1px 5px",
                borderRadius: "4px",
                fontWeight: 600,
              }}
            >
              Detected
            </span>
          )}

          {value && !detectedKeys.includes(value) && value !== "none" && (
            <span
              style={{
                fontSize: "9.5px",
                backgroundColor: "rgba(234, 179, 8, 0.12)",
                color: "var(--accent-gold)",
                padding: "1px 5px",
                borderRadius: "4px",
                fontWeight: 600,
              }}
            >
              Custom
            </span>
          )}
        </div>

        <ChevronDown
          size={14}
          style={{
            color: "var(--text-muted)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            flexShrink: 0,
          }}
        />
      </div>

      {helperText && (
        <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
          {helperText}
        </span>
      )}

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            width: "100%",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            zIndex: 100,
            maxHeight: "240px",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Search / Type Input */}
          <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border-subtle)", position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              ref={inputRef}
              type="text"
              className="input-field"
              placeholder="Search or type custom key..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (isCustomTyped) {
                    handleSelect(searchQuery.trim());
                  } else if (filteredKeys.length > 0) {
                    handleSelect(filteredKeys[0]);
                  }
                }
              }}
              style={{ width: "100%", fontSize: "11.5px", padding: "5px 8px 5px 26px" }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0 }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Key Options List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px" }}>
            {/* Custom Key Option if typed */}
            {isCustomTyped && (
              <div
                onClick={() => handleSelect(searchQuery.trim())}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  backgroundColor: "rgba(99, 102, 241, 0.12)",
                  color: "var(--accent-primary)",
                  fontSize: "12px",
                  fontWeight: 600,
                  marginBottom: "4px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Plus size={13} />
                  <span>Use custom key: "<strong>{searchQuery.trim()}</strong>"</span>
                </div>
              </div>
            )}

            {/* Special 'None' Option for Speaker */}
            {allowNone && (!searchQuery || "none".includes(searchQuery.toLowerCase()) || "narration".includes(searchQuery.toLowerCase())) && (
              <div
                onClick={() => handleSelect("none")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  backgroundColor: value === "none" ? "var(--bg-card)" : "transparent",
                  color: "var(--text-secondary)",
                  fontSize: "12px",
                  fontStyle: "italic",
                }}
              >
                <span>None (Narration only - No Speaker key)</span>
                {value === "none" && <Check size={13} color="var(--accent-primary)" />}
              </div>
            )}

            {/* Detected Keys List */}
            {filteredKeys.length === 0 && !isCustomTyped && (!allowNone || searchQuery) ? (
              <div style={{ padding: "12px", textAlign: "center", color: "var(--text-muted)", fontSize: "11.5px" }}>
                No matching keys found. Type to add a custom key.
              </div>
            ) : (
              filteredKeys.map((key) => {
                const isSelected = value === key;
                return (
                  <div
                    key={key}
                    onClick={() => handleSelect(key)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      backgroundColor: isSelected ? "var(--bg-card)" : "transparent",
                      color: isSelected ? "var(--accent-primary)" : "var(--text-primary)",
                      fontSize: "12px",
                      fontWeight: isSelected ? 700 : 500,
                      transition: "background-color 0.1s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>{key}</span>
                      {detectedKeys.includes(key) && (
                        <span style={{ fontSize: "9px", color: "var(--text-muted)", opacity: 0.7 }}>
                          (detected)
                        </span>
                      )}
                    </div>
                    {isSelected && <Check size={13} color="var(--accent-primary)" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function useMemoFilteredKeys(detectedKeys: string[], query: string): string[] {
  return React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return detectedKeys;
    return detectedKeys.filter((k) => k.toLowerCase().includes(q));
  }, [detectedKeys, query]);
}
