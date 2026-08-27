import React, { useState, useEffect, useRef } from "react";
import {
  fetchModelEndpoints,
  OpenRouterEndpoint,
  formatModelPricing,
} from "../../services/openRouterService";
import {
  Server,
  ChevronDown,
  X,
  Search,
  RefreshCw,
  Sliders,
  Plus,
} from "lucide-react";

export interface ProviderSelectorMultiSelectProps {
  modelId: string;
  selectedProviders: string[];
  onChangeProviders: (providers: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
  width?: string;
}

export const ProviderSelectorMultiSelect: React.FC<ProviderSelectorMultiSelectProps> = ({
  modelId,
  selectedProviders,
  onChangeProviders,
  disabled = false,
  compact = false,
  width = "100%",
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [endpoints, setEndpoints] = useState<OpenRouterEndpoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [customProviderInput, setCustomProviderInput] = useState<string>("");

  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch model endpoints whenever modelId changes
  useEffect(() => {
    if (!modelId || modelId.startsWith("mt:")) {
      setEndpoints([]);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    fetchModelEndpoints(modelId)
      .then((list) => {
        if (isMounted) {
          setEndpoints(list);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [modelId]);

  // Handle outside clicks to close dropdown
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

  const isFreeMt = modelId.startsWith("mt:");

  if (isFreeMt) {
    return null;
  }

  const handleToggleProvider = (providerName: string) => {
    if (selectedProviders.includes(providerName)) {
      onChangeProviders(selectedProviders.filter((p) => p !== providerName));
    } else {
      onChangeProviders([...selectedProviders, providerName]);
    }
  };

  const handleSelectAll = () => {
    const allNames = endpoints.map((ep) => ep.provider_name);
    onChangeProviders(allNames);
  };

  const handleClearAll = () => {
    onChangeProviders([]);
  };

  const handleAddCustomProvider = () => {
    const trimmed = customProviderInput.trim();
    if (trimmed && !selectedProviders.includes(trimmed)) {
      onChangeProviders([...selectedProviders, trimmed]);
      setCustomProviderInput("");
    }
  };

  // Filter endpoints
  const q = searchFilter.toLowerCase().trim();
  const filteredEndpoints = endpoints.filter(
    (ep) =>
      ep.provider_name.toLowerCase().includes(q) ||
      ep.name.toLowerCase().includes(q) ||
      (ep.quantization && ep.quantization.toLowerCase().includes(q))
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width,
        userSelect: "none",
      }}
    >
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          padding: compact ? "5px 8px" : "6px 10px",
          borderRadius: "var(--radius-sm)",
          backgroundColor: isOpen ? "var(--bg-surface-elevated)" : "var(--bg-app)",
          border: isOpen
            ? "1px solid var(--accent-primary)"
            : selectedProviders.length > 0
            ? "1px solid rgba(56, 189, 248, 0.4)"
            : "1px solid var(--border-subtle)",
          color: "var(--text-primary)",
          fontSize: compact ? "11px" : "12px",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          textAlign: "left",
          transition: "all 0.15s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden", minWidth: 0 }}>
          <Server
            size={13}
            style={{
              color: selectedProviders.length > 0 ? "var(--accent-cyan)" : "var(--text-muted)",
              flexShrink: 0,
            }}
          />
          {selectedProviders.length === 0 ? (
            <span style={{ color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              All Providers (Auto-Routing)
            </span>
          ) : (
            <span
              style={{
                color: "var(--accent-cyan)",
                fontWeight: 700,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={selectedProviders.join(", ")}
            >
              {selectedProviders.length} Selected
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>
          {selectedProviders.length > 0 && !disabled && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                handleClearAll();
              }}
              style={{
                padding: "2px",
                borderRadius: "3px",
                color: "var(--text-muted)",
                cursor: "pointer",
                display: "inline-flex",
              }}
              title="Clear provider filter (Allow all providers)"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown
            size={13}
            style={{
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
              color: "var(--text-muted)",
            }}
          />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            width: "100%",
            minWidth: "280px",
            maxHeight: "340px",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header & Quick Action */}
          <div
            style={{
              padding: "8px 10px",
              borderBottom: "1px solid var(--border-subtle)",
              backgroundColor: "var(--bg-surface-elevated)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Sliders size={13} style={{ color: "var(--accent-cyan)" }} />
              <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                Select Providers
              </span>
              {endpoints.length > 0 && (
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                  ({endpoints.length} available)
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {selectedProviders.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent-danger)",
                    fontSize: "10.5px",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "2px 4px",
                  }}
                >
                  Reset (All)
                </button>
              )}
              {endpoints.length > 1 && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent-primary)",
                    fontSize: "10.5px",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "2px 4px",
                  }}
                >
                  Select All
                </button>
              )}
            </div>
          </div>

          {/* Search Input */}
          <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "var(--bg-app)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "4px 8px",
              }}
            >
              <Search size={12} style={{ color: "var(--text-muted)" }} />
              <input
                type="text"
                placeholder="Search provider..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--text-primary)",
                  fontSize: "11px",
                  width: "100%",
                }}
              />
            </div>
          </div>

          {/* Endpoints List */}
          <div style={{ overflowY: "auto", flex: 1, maxHeight: "200px", padding: "4px 0" }}>
            {isLoading ? (
              <div
                style={{
                  padding: "16px",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: "11.5px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <RefreshCw size={13} className="animate-spin" />
                <span>Loading available providers...</span>
              </div>
            ) : endpoints.length === 0 ? (
              <div style={{ padding: "12px", textAlign: "center", color: "var(--text-muted)", fontSize: "11px" }}>
                No specific provider endpoints found for this model. You can type a custom provider below.
              </div>
            ) : filteredEndpoints.length === 0 ? (
              <div style={{ padding: "12px", textAlign: "center", color: "var(--text-muted)", fontSize: "11px" }}>
                No provider matching "{searchFilter}"
              </div>
            ) : (
              filteredEndpoints.map((ep) => {
                const isSelected = selectedProviders.includes(ep.provider_name);
                const pricing = ep.pricing ? formatModelPricing(ep.pricing) : null;

                return (
                  <div
                    key={ep.provider_name}
                    onClick={() => handleToggleProvider(ep.provider_name)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                      cursor: "pointer",
                      backgroundColor: isSelected ? "var(--accent-surface)" : "transparent",
                      borderLeft: isSelected ? "3px solid var(--accent-cyan)" : "3px solid transparent",
                      fontSize: "11.5px",
                      transition: "background-color 0.1s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // Handled by container onClick
                        style={{
                          accentColor: "var(--accent-cyan)",
                          cursor: "pointer",
                        }}
                      />
                      <div>
                        <div style={{ fontWeight: isSelected ? 700 : 500, color: "var(--text-primary)" }}>
                          {ep.provider_name}
                        </div>
                        {ep.quantization && (
                          <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                            Quant: {ep.quantization}
                          </span>
                        )}
                      </div>
                    </div>

                    {pricing && (
                      <div style={{ textAlign: "right", fontSize: "10px", color: "var(--text-muted)", flexShrink: 0 }}>
                        {pricing.isFree ? (
                          <span style={{ color: "var(--accent-success)", fontWeight: 700 }}>Free</span>
                        ) : (
                          <span>
                            {pricing.inputPerMillion}/{pricing.outputPerMillion}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Custom Selected Providers that might not be in official list */}
            {selectedProviders
              .filter((p) => !endpoints.some((ep) => ep.provider_name === p))
              .map((customP) => (
                <div
                  key={customP}
                  onClick={() => handleToggleProvider(customP)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    cursor: "pointer",
                    backgroundColor: "var(--accent-surface)",
                    borderLeft: "3px solid var(--accent-cyan)",
                    fontSize: "11.5px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input type="checkbox" checked={true} onChange={() => {}} style={{ accentColor: "var(--accent-cyan)" }} />
                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{customP} (Custom)</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleProvider(customP);
                    }}
                    style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
          </div>

          {/* Custom Provider Manual Input */}
          <div
            style={{
              padding: "6px 8px",
              borderTop: "1px solid var(--border-subtle)",
              backgroundColor: "var(--bg-surface-elevated)",
              display: "flex",
              gap: "4px",
            }}
          >
            <input
              type="text"
              placeholder="Add custom provider name..."
              value={customProviderInput}
              onChange={(e) => setCustomProviderInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCustomProvider()}
              style={{
                backgroundColor: "var(--bg-app)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "3px 6px",
                fontSize: "10.5px",
                color: "var(--text-primary)",
                flex: 1,
              }}
            />
            <button
              type="button"
              onClick={handleAddCustomProvider}
              disabled={!customProviderInput.trim()}
              className="btn-secondary"
              style={{ padding: "3px 8px", fontSize: "10.5px", display: "inline-flex", alignItems: "center", gap: "3px" }}
            >
              <Plus size={11} />
              <span>Add</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
