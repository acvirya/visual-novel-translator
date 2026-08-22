import React, { useState, useEffect, useRef } from "react";
import { Search, ChevronDown, Check, Plus, X } from "lucide-react";

export interface LanguageOption {
  code: string;
  name: string;
  nativeName?: string;
  flag?: string;
}

export const STANDARD_LANGUAGES: LanguageOption[] = [
  // Primary VN Sources & Popular Targets
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "zh-CN", name: "Chinese (Simplified)", nativeName: "简体中文", flag: "🇨🇳" },
  { code: "zh-TW", name: "Chinese (Traditional)", nativeName: "繁體中文", flag: "🇹🇼" },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
  { code: "ru", name: "Russian", nativeName: "Русский", flag: "🇷🇺" },
  { code: "pt", name: "Portuguese (Brazil)", nativeName: "Português", flag: "🇧🇷" },
  { code: "pt-PT", name: "Portuguese (Portugal)", nativeName: "Português", flag: "🇵🇹" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", flag: "🇻🇳" },
  { code: "th", name: "Thai", nativeName: "ไทย", flag: "🇹🇭" },
  { code: "it", name: "Italian", nativeName: "Italiano", flag: "🇮🇹" },
  { code: "pl", name: "Polish", nativeName: "Polski", flag: "🇵🇱" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", flag: "🇹🇷" },
  { code: "ar", name: "Arabic", nativeName: "العربية", flag: "🇸🇦" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", flag: "🇳🇱" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu", flag: "🇲🇾" },
  { code: "tl", name: "Tagalog / Filipino", nativeName: "Tagalog", flag: "🇵🇭" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська", flag: "🇺🇦" },
  { code: "cs", name: "Czech", nativeName: "Čeština", flag: "🇨🇿" },
  { code: "hu", name: "Hungarian", nativeName: "Magyar", flag: "🇭🇺" },
  { code: "sv", name: "Swedish", nativeName: "Svenska", flag: "🇸🇪" },
  { code: "fi", name: "Finnish", nativeName: "Suomi", flag: "🇫🇮" },
  { code: "da", name: "Danish", nativeName: "Dansk", flag: "🇩🇰" },
  { code: "no", name: "Norwegian", nativeName: "Norsk", flag: "🇳🇴" },
  { code: "el", name: "Greek", nativeName: "Ελληνικά", flag: "🇬🇷" },
  { code: "ro", name: "Romanian", nativeName: "Română", flag: "🇷🇴" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳" },
  { code: "he", name: "Hebrew", nativeName: "עבריत", flag: "🇮🇱" },
  { code: "jv", name: "Javanese", nativeName: "Basa Jawa", flag: "🇮🇩" },
  { code: "su", name: "Sundanese", nativeName: "Basa Sunda", flag: "🇮🇩" },
  { code: "la", name: "Latin", nativeName: "Latina", flag: "🏛️" },
  { code: "eo", name: "Esperanto", nativeName: "Esperanto", flag: "🌍" },
];

export interface LanguageSelectorComboboxProps {
  value: string;
  onChange: (codeOrName: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const LanguageSelectorCombobox: React.FC<LanguageSelectorComboboxProps> = ({
  value,
  onChange,
  label,
  placeholder = "Search or enter language...",
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Find active language option
  const activeOption = STANDARD_LANGUAGES.find(
    (l) => l.code.toLowerCase() === value.toLowerCase() || l.name.toLowerCase() === value.toLowerCase()
  ) || {
    code: value,
    name: value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unknown",
    flag: "🌐",
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter languages based on search
  const cleanSearch = searchTerm.trim().toLowerCase();
  const filteredLanguages = STANDARD_LANGUAGES.filter((lang) => {
    if (!cleanSearch) return true;
    return (
      lang.name.toLowerCase().includes(cleanSearch) ||
      lang.code.toLowerCase().includes(cleanSearch) ||
      (lang.nativeName && lang.nativeName.toLowerCase().includes(cleanSearch))
    );
  });

  // Check if search matches an existing code/name exactly
  const hasExactMatch = STANDARD_LANGUAGES.some(
    (l) => l.code.toLowerCase() === cleanSearch || l.name.toLowerCase() === cleanSearch
  );

  const handleSelect = (code: string) => {
    onChange(code);
    setIsOpen(false);
    setSearchTerm("");
  };

  const handleCustomSubmit = () => {
    if (cleanSearch) {
      onChange(searchTerm.trim());
      setIsOpen(false);
      setSearchTerm("");
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      {label && (
        <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
          {label}
        </label>
      )}

      {/* Main Selected Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            if (!isOpen) {
              setTimeout(() => inputRef.current?.focus(), 50);
            }
          }
        }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "var(--bg-app)",
          border: `1px solid ${isOpen ? "var(--accent-primary)" : "var(--border-subtle)"}`,
          borderRadius: "var(--radius-sm)",
          padding: "8px 12px",
          color: "var(--text-primary)",
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: "13px",
          textAlign: "left",
          transition: "all 0.15s ease",
          boxShadow: isOpen ? "0 0 0 2px rgba(88, 166, 255, 0.2)" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
          <span style={{ fontSize: "15px" }}>{activeOption.flag || "🌐"}</span>
          <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {activeOption.name}
          </span>
          {activeOption.nativeName && activeOption.nativeName !== activeOption.name && (
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              ({activeOption.nativeName})
            </span>
          )}
          <span
            style={{
              fontSize: "10.5px",
              fontFamily: "monospace",
              color: "var(--accent-primary)",
              backgroundColor: "rgba(88, 166, 255, 0.1)",
              padding: "1px 5px",
              borderRadius: "4px",
              marginLeft: "auto",
            }}
          >
            {activeOption.code}
          </span>
        </div>

        <ChevronDown size={14} style={{ color: "var(--text-muted)", marginLeft: "8px", flexShrink: 0 }} />
      </button>

      {/* Floating Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            width: "100%",
            backgroundColor: "var(--bg-panel, #161b22)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "0 10px 28px rgba(0, 0, 0, 0.5)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            maxHeight: "300px",
          }}
        >
          {/* Search Input Box */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 10px",
              borderBottom: "1px solid var(--border-subtle)",
              backgroundColor: "var(--bg-app)",
            }}
          >
            <Search size={14} color="var(--text-muted)" />
            <input
              ref={inputRef}
              type="text"
              placeholder={placeholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (filteredLanguages.length > 0) {
                    handleSelect(filteredLanguages[0].code);
                  } else if (cleanSearch) {
                    handleCustomSubmit();
                  }
                } else if (e.key === "Escape") {
                  setIsOpen(false);
                }
              }}
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                outline: "none",
                fontSize: "12px",
                color: "var(--text-primary)",
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px" }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Languages List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px" }}>
            {filteredLanguages.map((lang) => {
              const isSelected =
                lang.code.toLowerCase() === value.toLowerCase() ||
                lang.name.toLowerCase() === value.toLowerCase();

              return (
                <div
                  key={lang.code}
                  onClick={() => handleSelect(lang.code)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 10px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    backgroundColor: isSelected ? "rgba(88, 166, 255, 0.15)" : "transparent",
                    color: isSelected ? "var(--accent-primary)" : "var(--text-primary)",
                    fontSize: "12.5px",
                    transition: "background 0.1s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                    <span style={{ fontSize: "14px" }}>{lang.flag || "🌐"}</span>
                    <span style={{ fontWeight: isSelected ? 600 : 400 }}>{lang.name}</span>
                    {lang.nativeName && lang.nativeName !== lang.name && (
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {lang.nativeName}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span
                      style={{
                        fontSize: "10.5px",
                        fontFamily: "monospace",
                        color: "var(--text-muted)",
                        backgroundColor: "var(--bg-app)",
                        padding: "1px 4px",
                        borderRadius: "3px",
                      }}
                    >
                      {lang.code}
                    </span>
                    {isSelected && <Check size={13} color="var(--accent-primary)" />}
                  </div>
                </div>
              );
            })}

            {/* Custom Input Option if not found */}
            {cleanSearch && !hasExactMatch && (
              <div
                onClick={handleCustomSubmit}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 10px",
                  marginTop: "4px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  backgroundColor: "rgba(63, 185, 80, 0.1)",
                  border: "1px dashed rgba(63, 185, 80, 0.4)",
                  color: "#3fb950",
                  fontSize: "12px",
                }}
              >
                <Plus size={14} />
                <span>
                  Use custom language: <strong>"{searchTerm.trim()}"</strong>
                </span>
              </div>
            )}

            {filteredLanguages.length === 0 && !cleanSearch && (
              <div style={{ padding: "12px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
                No languages available.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
