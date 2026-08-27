import React, { useState, useEffect, useRef } from "react";
import {
  OpenRouterModel,
  fetchOpenRouterModels,
  formatModelPricing,
} from "../../services/openRouterService";
import {
  Star,
  Globe,
  Zap,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";

export interface ModelSelectorComboboxProps {
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  width?: string;
  compact?: boolean;
  disabled?: boolean;
}

export function splitModelProviderAndName(model: { id: string; name?: string }): { provider: string; modelName: string } {
  const rawName = (model.name || model.id).trim();
  const idParts = model.id.split("/");

  // 1. If name has "Provider: Model Name" (e.g. "DeepSeek: DeepSeek V3", "Z.ai: GLM 5.2", "Google: Gemini 2.0 Flash")
  if (rawName.includes(":")) {
    const colonIdx = rawName.indexOf(":");
    const prefixProvider = rawName.slice(0, colonIdx).trim();
    let cleanName = rawName.slice(colonIdx + 1).trim();
    if (!cleanName) cleanName = rawName;
    return {
      provider: prefixProvider,
      modelName: cleanName,
    };
  }

  // 2. If no colon in name, derive clean provider label from model ID prefix
  let provider = "";
  if (idParts.length > 1) {
    const authorSlug = idParts[0].toLowerCase();
    const KNOWN_PROVIDERS: Record<string, string> = {
      "openai": "OpenAI",
      "anthropic": "Anthropic",
      "google": "Google",
      "deepseek": "DeepSeek",
      "meta-llama": "Meta",
      "qwen": "Qwen",
      "mistralai": "Mistral",
      "z-ai": "Z.AI",
      "minimax": "MiniMax",
      "cohere": "Cohere",
      "x-ai": "xAI",
      "microsoft": "Microsoft",
      "amazon": "Amazon",
      "nvidia": "NVIDIA",
      "ai21": "AI21",
      "nousresearch": "NousResearch",
      "gryphe": "Gryphe",
      "sao10k": "Sao10K",
      "neversleep": "NeverSleep",
    };
    provider = KNOWN_PROVIDERS[authorSlug] || (idParts[0].charAt(0).toUpperCase() + idParts[0].slice(1));
  } else if (model.id.startsWith("mt:")) {
    provider = "Free MT";
  }

  return {
    provider: provider || "AI Provider",
    modelName: rawName,
  };
}

const INITIAL_STARRED_IDS: string[] = [
  "anthropic/claude-3.5-sonnet",
  "deepseek/deepseek-chat",
  "google/gemini-2.5-flash",
  "openai/gpt-4o-mini",
];

const FALLBACK_POPULAR_MODELS: OpenRouterModel[] = [
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Anthropic: Claude 3.5 Sonnet",
    context_length: 200000,
    pricing: { prompt: "0.000003", completion: "0.000015" },
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek: DeepSeek V3",
    context_length: 64000,
    pricing: { prompt: "0.00000014", completion: "0.00000028" },
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Google: Gemini 2.5 Flash",
    context_length: 1048576,
    pricing: { prompt: "0.00000015", completion: "0.0000006" },
  },
  {
    id: "openai/gpt-4o-mini",
    name: "OpenAI: GPT-4o Mini",
    context_length: 128000,
    pricing: { prompt: "0.00000015", completion: "0.0000006" },
  },
  {
    id: "qwen/qwen-2.5-72b-instruct",
    name: "Qwen: Qwen 2.5 72B Instruct",
    context_length: 131072,
    pricing: { prompt: "0.00000035", completion: "0.0000004" },
  },
];

export const ModelSelectorCombobox: React.FC<ModelSelectorComboboxProps> = ({
  selectedModelId,
  onSelectModel,
  width = "100%",
  compact = false,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [models, setModels] = useState<OpenRouterModel[]>(FALLBACK_POPULAR_MODELS);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [starredIds, setStarredIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("vn_starred_models");
      return saved ? JSON.parse(saved) : INITIAL_STARRED_IDS;
    } catch {
      return INITIAL_STARRED_IDS;
    }
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-fetch models on mount (with caching)
  useEffect(() => {
    async function load() {
      const list = await fetchOpenRouterModels();
      if (list && list.length > 0) {
        setModels(list);
      }
    }
    load();
  }, []);

  // Close dropdown on outside click & reset search filter
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchFilter("");
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Star / Unstar Model
  const handleToggleStar = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let updated: string[];
    if (starredIds.includes(modelId)) {
      updated = starredIds.filter((id) => id !== modelId);
    } else {
      updated = [...starredIds, modelId];
    }
    setStarredIds(updated);
    localStorage.setItem("vn_starred_models", JSON.stringify(updated));
  };

  const handleSelect = (modelId: string) => {
    onSelectModel(modelId);
    setSearchFilter("");
    setIsOpen(false);
  };

  // Find active model details
  const currentModel = models.find((m) => m.id === selectedModelId);
  const currentPricing = currentModel ? formatModelPricing(currentModel.pricing) : null;
  const isSelectedStarred = starredIds.includes(selectedModelId);

  // Display label on the input
  const getDisplayLabel = () => {
    if (isOpen) {
      return searchFilter;
    }
    if (selectedModelId === "mt:google-translate") return "Google Translate (Free MT)";
    if (selectedModelId === "mt:deepl-free") return "DeepL Free (Web Endpoint)";
    if (currentModel) {
      const parsed = splitModelProviderAndName(currentModel);
      return parsed.modelName;
    }
    return selectedModelId || "Select a model...";
  };

  // Filtered lists:
  // If searchFilter is empty, show all starred & all catalog models!
  const q = searchFilter.toLowerCase().trim();

  const filteredStarred = models.filter((m) => {
    if (!starredIds.includes(m.id)) return false;
    if (!q) return true;
    const parsed = splitModelProviderAndName(m);
    return (
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      parsed.modelName.toLowerCase().includes(q) ||
      parsed.provider.toLowerCase().includes(q)
    );
  });

  const filteredCatalog = models.filter((m) => {
    if (starredIds.includes(m.id)) return false; // starred are shown in their own section
    if (!q) return true;
    const parsed = splitModelProviderAndName(m);
    return (
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      parsed.modelName.toLowerCase().includes(q) ||
      parsed.provider.toLowerCase().includes(q)
    );
  });

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width,
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      {/* Combobox Trigger & Input */}
      <div
        onClick={() => {
          if (!isOpen) {
            setIsOpen(true);
            setSearchFilter("");
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          backgroundColor: "var(--bg-app)",
          border: isOpen ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          padding: compact ? "3px 8px" : "5px 10px",
          gap: "6px",
          cursor: "pointer",
          boxShadow: isOpen ? "0 0 0 2px rgba(78, 115, 223, 0.25)" : "none",
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
        }}
      >
        {/* Star status toggle on active model */}
        {selectedModelId && !selectedModelId.startsWith("mt:") && (
          <button
            type="button"
            onClick={(e) => handleToggleStar(selectedModelId, e)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px",
              color: isSelectedStarred ? "var(--accent-gold)" : "var(--text-muted)",
              display: "flex",
              alignItems: "center",
            }}
            title={isSelectedStarred ? "Starred model (Favorite)" : "Click to star model"}
          >
            <Star size={13} fill={isSelectedStarred ? "var(--accent-gold)" : "none"} />
          </button>
        )}

        {selectedModelId.startsWith("mt:") && (
          <Globe size={13} style={{ color: "var(--accent-success)", flexShrink: 0 }} />
        )}

        {/* Search / Manual Model ID Input */}
        <input
          ref={inputRef}
          type="text"
          className="combobox-inner-input"
          value={getDisplayLabel()}
          onChange={(e) => {
            setSearchFilter(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
          }}
          placeholder="Search models (e.g. claude, deepseek, gemini, gpt-4o)..."
          style={{
            flex: 1,
            backgroundColor: "transparent",
            border: "none",
            outline: "none",
            boxShadow: "none",
            fontFamily: "var(--font-mono)",
            fontSize: compact ? "12px" : "12.5px",
            color: "var(--text-primary)",
            padding: "2px 0",
            minWidth: "140px",
            cursor: isOpen ? "text" : "pointer",
          }}
        />

        {/* Clear Search button when typing */}
        {isOpen && searchFilter && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSearchFilter("");
              inputRef.current?.focus();
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              padding: "2px",
            }}
          >
            <X size={12} />
          </button>
        )}

        {/* Dual Pricing Badges on the right of input if space allows */}
        {currentPricing && !compact && !isOpen && (
          <div style={{ display: "flex", gap: "5px", fontSize: "10.5px", flexShrink: 0 }}>
            <span style={{ color: "var(--accent-cyan)", display: "flex", alignItems: "center", gap: "2px" }} title="Prompt Input Price">
              <ArrowUp size={10} /> {currentPricing.inputPerMillion}/M
            </span>
            <span style={{ color: "var(--accent-gold)", display: "flex", alignItems: "center", gap: "2px" }} title="Completion Output Price">
              <ArrowDown size={10} /> {currentPricing.outputPerMillion}/M
            </span>
          </div>
        )}

        {/* Dropdown Chevron Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
            if (!isOpen) {
              setSearchFilter("");
              setTimeout(() => inputRef.current?.focus(), 50);
            }
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            padding: "2px",
          }}
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Hierarchical Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            width: "100%",
            boxSizing: "border-box",
            marginTop: "4px",
            backgroundColor: "#161B26",
            border: "1px solid var(--border-active)",
            borderRadius: "var(--radius-sm)",
            maxHeight: "320px",
            overflowY: "auto",
            zIndex: 99999,
            boxShadow: "0 12px 36px rgba(0,0,0,0.85)",
          }}
        >
          {/* If user typed a custom model ID that has no matches, allow selecting it directly */}
          {q && filteredStarred.length === 0 && filteredCatalog.length === 0 && (
            <div
              onClick={() => handleSelect(searchFilter.trim())}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                backgroundColor: "rgba(78, 115, 223, 0.15)",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>
                Use custom Model ID: <strong style={{ color: "var(--accent-cyan)" }}>{searchFilter.trim()}</strong>
              </span>
            </div>
          )}

          {/* 1. ⭐ TIER 1: STARRED FAVORITES */}
          {filteredStarred.length > 0 && (
            <div>
              <div
                style={{
                  padding: "5px 10px",
                  fontSize: "10.5px",
                  fontWeight: 700,
                  backgroundColor: "rgba(227, 179, 65, 0.12)",
                  color: "var(--accent-gold)",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  letterSpacing: "0.3px",
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                }}
              >
                <Star size={11} fill="var(--accent-gold)" /> STARRED FAVORITES ({filteredStarred.length})
              </div>
              {filteredStarred.map((m) => {
                const isSelected = m.id === selectedModelId;
                const pricing = formatModelPricing(m.pricing);
                const parsed = splitModelProviderAndName(m);
                return (
                  <div
                    key={`starred_${m.id}`}
                    onClick={() => handleSelect(m.id)}
                    style={{
                      padding: "7px 10px",
                      cursor: "pointer",
                      backgroundColor: isSelected ? "rgba(78, 115, 223, 0.25)" : "transparent",
                      borderBottom: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = "var(--bg-surface-elevated)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "1px", overflow: "hidden" }}>
                      <span style={{ fontWeight: 600, fontSize: "12px", color: "var(--text-primary)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                        {parsed.modelName}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--accent-cyan)", fontWeight: 500 }}>
                        {parsed.provider}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                      <div style={{ display: "flex", gap: "4px", fontSize: "10px" }}>
                        <span style={{ color: "var(--accent-cyan)", backgroundColor: "var(--bg-app)", padding: "1px 4px", borderRadius: "2px" }}>
                          ↑ {pricing.inputPerMillion}
                        </span>
                        <span style={{ color: "var(--accent-gold)", backgroundColor: "var(--bg-app)", padding: "1px 4px", borderRadius: "2px" }}>
                          ↓ {pricing.outputPerMillion}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleToggleStar(m.id, e)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--accent-gold)" }}
                        title="Remove from starred"
                      >
                        <Star size={13} fill="var(--accent-gold)" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 2. 🌐 TIER 2: FREE ONLINE MACHINE TRANSLATION */}
          {(!q || "google translate free".includes(q) || "deepl free".includes(q)) && (
            <div>
              <div
                style={{
                  padding: "5px 10px",
                  fontSize: "10.5px",
                  fontWeight: 700,
                  backgroundColor: "rgba(63, 185, 80, 0.12)",
                  color: "var(--accent-success)",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  letterSpacing: "0.3px",
                  position: "sticky",
                  top: filteredStarred.length > 0 ? "0" : "0",
                  zIndex: 2,
                }}
              >
                <Globe size={11} /> FREE ONLINE MT (ZERO COST)
              </div>
              {(!q || "google translate free".includes(q)) && (
                <div
                  onClick={() => handleSelect("mt:google-translate")}
                  style={{
                    padding: "7px 10px",
                    cursor: "pointer",
                    backgroundColor: selectedModelId === "mt:google-translate" ? "rgba(78, 115, 223, 0.25)" : "transparent",
                    borderBottom: "1px solid var(--border-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedModelId !== "mt:google-translate") e.currentTarget.style.backgroundColor = "var(--bg-surface-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    if (selectedModelId !== "mt:google-translate") e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600, fontSize: "12px" }}>Google Translate (Web Endpoint)</span>
                    <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block" }}>
                      Fast free stream fallback
                    </span>
                  </div>
                  <span className="badge badge-success" style={{ fontSize: "9.5px", padding: "1px 5px" }}>
                    Free ($0)
                  </span>
                </div>
              )}

              {(!q || "deepl free".includes(q)) && (
                <div
                  onClick={() => handleSelect("mt:deepl-free")}
                  style={{
                    padding: "7px 10px",
                    cursor: "pointer",
                    backgroundColor: selectedModelId === "mt:deepl-free" ? "rgba(78, 115, 223, 0.25)" : "transparent",
                    borderBottom: "1px solid var(--border-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedModelId !== "mt:deepl-free") e.currentTarget.style.backgroundColor = "var(--bg-surface-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    if (selectedModelId !== "mt:deepl-free") e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600, fontSize: "12px" }}>DeepL Free (Web Endpoint)</span>
                    <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block" }}>
                      Natural Japanese nuance MT scraper
                    </span>
                  </div>
                  <span className="badge badge-success" style={{ fontSize: "9.5px", padding: "1px 5px" }}>
                    Free ($0)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 3. ⚡ TIER 3: OPENROUTER CATALOG */}
          {filteredCatalog.length > 0 && (
            <div>
              <div
                style={{
                  padding: "5px 10px",
                  fontSize: "10.5px",
                  fontWeight: 700,
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  letterSpacing: "0.3px",
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                }}
              >
                <Zap size={11} /> OPENROUTER CATALOG ({filteredCatalog.length})
              </div>

              {filteredCatalog.map((m) => {
                const isSelected = m.id === selectedModelId;
                const pricing = formatModelPricing(m.pricing);
                const parsed = splitModelProviderAndName(m);
                return (
                  <div
                    key={`catalog_${m.id}`}
                    onClick={() => handleSelect(m.id)}
                    style={{
                      padding: "7px 10px",
                      cursor: "pointer",
                      backgroundColor: isSelected ? "rgba(78, 115, 223, 0.25)" : "transparent",
                      borderBottom: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = "var(--bg-surface-elevated)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "1px", overflow: "hidden" }}>
                      <span style={{ fontWeight: 600, fontSize: "12px", color: "var(--text-primary)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                        {parsed.modelName}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--accent-cyan)", fontWeight: 500 }}>
                        {parsed.provider}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                      <div style={{ display: "flex", gap: "4px", fontSize: "10px" }}>
                        <span style={{ color: "var(--accent-cyan)", backgroundColor: "var(--bg-app)", padding: "1px 4px", borderRadius: "2px" }}>
                          ↑ {pricing.inputPerMillion}
                        </span>
                        <span style={{ color: "var(--accent-gold)", backgroundColor: "var(--bg-app)", padding: "1px 4px", borderRadius: "2px" }}>
                          ↓ {pricing.outputPerMillion}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleToggleStar(m.id, e)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--text-muted)" }}
                        title="Add to starred favorites"
                      >
                        <Star size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
