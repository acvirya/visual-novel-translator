import React, { useState, useEffect, useMemo } from "react";
import {
  fetchOpenRouterModels,
  testOpenRouterKey,
  formatModelPricing,
  OpenRouterModel,
  OpenRouterKeyInfo,
  PromptStylePreset,
  BUILTIN_STYLE_PRESETS,
  loadUserStylePresets,
  saveUserStylePresets,
  getAllStylePresets,
  getActiveStylePresetId,
  getActiveStyleInstructions,
  getSelectedModelProviders,
  setSelectedModelProviders,
  getModelReasoningCapabilities,
  getModelPreferredReasoningEffort,
  setModelPreferredReasoningEffort,
} from "../../services/openRouterService";
import { ProviderSelectorMultiSelect } from "../common/ProviderSelectorMultiSelect";
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Globe,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Server,
  ExternalLink,
  Cpu,
} from "lucide-react";
import {
  LlmProviderRegistry,
  SUPPORTED_PROVIDERS,
  StoredProviderConfig,
} from "../../services/providers/llmProviderRegistry";
import { LlmDispatcherService } from "../../services/providers/llmDispatcherService";
import { ModelSelectorCombobox } from "../common/ModelSelectorCombobox";
import { LanguageSelectorCombobox } from "../common/LanguageSelectorCombobox";
import { useToast } from "../common/ToastProvider";
import { useTranslationStore } from "../../stores/useTranslationStore";
import { settingsManager } from "../../services/settingsManager";
import { ReasoningEffort } from "../../types";
import { ReasoningSettingsCard } from "./providers/ReasoningSettingsCard";
import { StylePresetsCard } from "./providers/StylePresetsCard";
import { FreeMtCard } from "./providers/FreeMtCard";

export const TranslationProvidersView: React.FC = () => {
  const toast = useToast();

  // OpenRouter Stats State
  const [keyInfo, setKeyInfo] = useState<OpenRouterKeyInfo | null>(() => {
    try {
      const saved = localStorage.getItem("vn_provider_openrouter_key_info");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testFeedback, setTestFeedback] = useState<{ isSuccess: boolean; message: string } | null>(null);

  // Models State
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    return settingsManager.getSelectedModel();
  });
  const [selectedProviders, setSelectedProviders] = useState<string[]>(() => {
    const initModel = settingsManager.getSelectedModel();
    return getSelectedModelProviders(initModel);
  });

  // Multi-Provider Hub State
  const [activeProviderTab, setActiveProviderTab] = useState<string>("openrouter");
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [providerConfigs, setProviderConfigs] = useState<Record<string, StoredProviderConfig>>(() => {
    const map: Record<string, StoredProviderConfig> = {};
    for (const p of SUPPORTED_PROVIDERS) {
      map[p.id] = LlmProviderRegistry.getProviderConfig(p.id);
    }
    return map;
  });
  const [isFetchingProviderModels, setIsFetchingProviderModels] = useState<boolean>(false);

  const updateProviderConfig = (providerId: string, updates: Partial<StoredProviderConfig>) => {
    setProviderConfigs((prev) => {
      const existing = prev[providerId] || { id: providerId, apiKey: "" };
      const merged = { ...existing, ...updates };
      LlmProviderRegistry.saveProviderConfig(merged);
      return { ...prev, [providerId]: merged };
    });
  };

  // Hyperparameters
  const [temperature, setTemperature] = useState<number>(() => settingsManager.getTranslation().temperature ?? 0.3);

  // Reasoning / Thinking Tokens State
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(() => settingsManager.getReasoningEffort());
  const [reasoningMaxTokens, setReasoningMaxTokens] = useState<number>(() => settingsManager.getReasoningMaxTokens());
  const [reasoningMaxTokensInput, setReasoningMaxTokensInput] = useState<string>(() => {
    const val = settingsManager.getReasoningMaxTokens();
    return val > 0 ? String(val) : "";
  });
  const [excludeReasoning, setExcludeReasoning] = useState<boolean>(() => settingsManager.getExcludeReasoning());

  // Translation Style & Presets State
  const [userPresets, setUserPresets] = useState<PromptStylePreset[]>(() => loadUserStylePresets());
  const [activePresetId, setActivePresetId] = useState<string>(() => getActiveStylePresetId());
  const [styleInstructions, setStyleInstructions] = useState<string>(() => getActiveStyleInstructions());

  // Free MT Endpoints
  const [useGoogleTranslate, setUseGoogleTranslate] = useState<boolean>(true);
  const [useDeepLFree, setUseDeepLFree] = useState<boolean>(true);

  const [sourceLang, setSourceLang] = useState<string>(() => {
    return settingsManager.getSourceLang();
  });
  const [targetLang, setTargetLang] = useState<string>(() => {
    return settingsManager.getTargetLang();
  });

  // Auto-fetch OpenRouter models on load if verified
  const loadModels = async () => {
    if (!LlmProviderRegistry.isProviderVerified("openrouter")) {
      setModels([]);
      return;
    }
    setIsLoadingModels(true);
    const fetched = await fetchOpenRouterModels();
    if (fetched && fetched.length > 0) {
      setModels(fetched);
    }
    setIsLoadingModels(false);
  };

  useEffect(() => {
    loadModels();
  }, []);

  useEffect(() => {
    settingsManager.updateTranslation({ liveModel: selectedModelId, activeProviderId: selectedModelId });
    useTranslationStore.getState().setSelectedProvider(selectedModelId);
    setSelectedProviders(getSelectedModelProviders(selectedModelId));

    // Sync preferred reasoning effort for this specific model
    const preferred = getModelPreferredReasoningEffort(selectedModelId);
    setReasoningEffort(preferred || "default");
  }, [selectedModelId]);

  useEffect(() => {
    localStorage.setItem("vn_active_style_preset_id", activePresetId);
    localStorage.setItem("vn_active_style_instructions", styleInstructions);
  }, [activePresetId, styleInstructions]);

  useEffect(() => {
    settingsManager.updateGeneral({ sourceLang, targetLang });
  }, [sourceLang, targetLang]);

  useEffect(() => {
    settingsManager.updateReasoningSettings({
      effort: reasoningEffort,
      maxTokens: reasoningMaxTokens,
      exclude: excludeReasoning,
    });
  }, [reasoningEffort, reasoningMaxTokens, excludeReasoning]);

  useEffect(() => {
    settingsManager.updateTranslation({ temperature });
  }, [temperature]);

  const selectedProviderFromStore = useTranslationStore((s) => s.selectedProvider);
  useEffect(() => {
    if (selectedProviderFromStore && selectedProviderFromStore !== selectedModelId) {
      setSelectedModelId(selectedProviderFromStore);
    }
  }, [selectedProviderFromStore]);

  // Test Provider Connection
  const handleTestProvider = async (providerId: string) => {
    const cfg = providerConfigs[providerId];
    if (!cfg || !cfg.apiKey.trim()) {
      toast.error("Please enter an API key first.", "Missing Key");
      return;
    }

    setIsTesting(true);
    setTestFeedback(null);

    if (providerId === "openrouter") {
      const result = await testOpenRouterKey(cfg.apiKey);
      setIsTesting(false);

      if (result.isValid) {
        updateProviderConfig("openrouter", { isVerified: true });
        setKeyInfo(result.keyInfo || null);
        setTestFeedback({ isSuccess: true, message: result.message });
        if (result.keyInfo) {
          localStorage.setItem("vn_provider_openrouter_key_info", JSON.stringify(result.keyInfo));
        }
        toast.success("OpenRouter API Key verified successfully!", "Key Active");
        // Automatically fetch latest models upon verification
        loadModels();
      } else {
        updateProviderConfig("openrouter", { isVerified: false });
        setKeyInfo(null);
        setTestFeedback({ isSuccess: false, message: result.message });
        localStorage.removeItem("vn_provider_openrouter_key_info");
        toast.error(result.message || "Failed to verify API Key.", "Validation Error");
      }
      return;
    }

    // Direct provider test via LlmDispatcherService
    const res = await LlmDispatcherService.testProviderConnection(providerId, cfg.apiKey, cfg.baseUrl);
    setIsTesting(false);
    if (res.isValid) {
      updateProviderConfig(providerId, { isVerified: true });
      setTestFeedback({ isSuccess: true, message: res.message });
      toast.success(res.message, "Connected");
      // Automatically fetch latest models upon verification
      handleFetchProviderModels(providerId);
    } else {
      updateProviderConfig(providerId, { isVerified: false });
      setTestFeedback({ isSuccess: false, message: res.message });
      toast.error(res.message, "Connection Failed");
    }
  };

  const handleFetchProviderModels = async (providerId: string) => {
    const cfg = providerConfigs[providerId];
    if (!cfg || !cfg.apiKey.trim()) {
      toast.error("Please enter an API key first.", "Missing Key");
      return;
    }
    setIsFetchingProviderModels(true);
    const fetched = await LlmDispatcherService.fetchProviderModels(providerId, cfg.apiKey, cfg.baseUrl);
    setIsFetchingProviderModels(false);
    if (fetched && fetched.length > 0) {
      updateProviderConfig(providerId, { customModels: fetched });
      toast.success(`Successfully fetched ${fetched.length} models!`, "Models Updated");
    } else {
      toast.error("Could not fetch models dynamically. Using built-in catalog.", "Fetch Notice");
    }
  };

  const allPresets = getAllStylePresets(userPresets);

  // Handle Preset Selection
  const handleSelectPreset = (preset: PromptStylePreset) => {
    setActivePresetId(preset.id);
    setStyleInstructions(preset.instructions);
    localStorage.setItem("vn_active_style_preset_id", preset.id);
    localStorage.setItem("vn_active_style_instructions", preset.instructions);
    toast.info(`Switched to "${preset.name}" preset.`, "Style Updated");
  };

  // Handle Reset to Preset Default
  const handleResetPreset = () => {
    const found = allPresets.find((p) => p.id === activePresetId);
    if (found) {
      setStyleInstructions(found.instructions);
      localStorage.setItem("vn_active_style_instructions", found.instructions);
      toast.success(`Reset style instructions to "${found.name}" default.`, "Reset Success");
    }
  };

  // Handle Delete Custom Preset
  const handleDeleteCustomPreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = userPresets.filter((p) => p.id !== id);
    setUserPresets(updated);
    saveUserStylePresets(updated);
    if (activePresetId === id) {
      const defaultPreset = BUILTIN_STYLE_PRESETS[0];
      setActivePresetId(defaultPreset.id);
      setStyleInstructions(defaultPreset.instructions);
    }
    toast.info("Custom style preset deleted.", "Preset Removed");
  };

  const selectedModel = models.find((m) => m.id === selectedModelId) || {
    id: selectedModelId,
    name: selectedModelId,
    context_length: 0,
    pricing: { prompt: "0", completion: "0" },
  };

  const reasoningCapabilities = useMemo(
    () => getModelReasoningCapabilities(selectedModelId, models),
    [selectedModelId, models]
  );

  const pricingFormatted = formatModelPricing(selectedModel.pricing);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* 1. Translation Languages Configuration */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Globe size={16} /> Translation Language Pair (Source & Target)
            </span>
            <span className="card-subtitle">
              Configure original game dialogue source language and desired translation output language
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <LanguageSelectorCombobox
              label="Original Game Source Language"
              value={sourceLang}
              onChange={(code) => setSourceLang(code)}
              placeholder="Search or enter source language..."
            />
          </div>

          <div>
            <LanguageSelectorCombobox
              label="Target Translation Language"
              value={targetLang}
              onChange={(code) => setTargetLang(code)}
              placeholder="Search or enter target language..."
            />
          </div>
        </div>
      </div>

      {/* 2. Multi-LLM Providers & Direct API Keys Hub */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Cpu size={16} /> 2. LLM Providers & Direct API Keys
            </span>
            <span className="card-subtitle">
              Configure direct API keys (Anthropic, DeepSeek, Google, OpenAI, Groq, NVIDIA, Copilot, etc.) or universal gateways
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {(() => {
              const activeCount = SUPPORTED_PROVIDERS.filter((p) => {
                const c = providerConfigs[p.id];
                return c && c.apiKey && c.apiKey.trim().length > 0;
              }).length;
              return (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: activeCount > 0 ? "var(--accent-green, #3fb950)" : "var(--text-muted)",
                    backgroundColor: activeCount > 0 ? "rgba(63, 185, 80, 0.1)" : "rgba(255, 255, 255, 0.05)",
                    border: `1px solid ${activeCount > 0 ? "rgba(63, 185, 80, 0.3)" : "var(--border-subtle)"}`,
                    padding: "3px 10px",
                    borderRadius: "20px",
                  }}
                >
                  <Server size={12} /> {activeCount} {activeCount === 1 ? "Provider" : "Providers"} Configured
                </span>
              );
            })()}
          </div>
        </div>

        {/* Provider Tabs Selector */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            paddingBottom: "12px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          {SUPPORTED_PROVIDERS.map((p) => {
            const isSelected = activeProviderTab === p.id;
            const cfg = providerConfigs[p.id];
            const hasKey = !!(cfg?.apiKey && cfg.apiKey.trim().length > 0);
            const isVerified = !!cfg?.isVerified;

            return (
              <button
                key={p.id}
                onClick={() => {
                  setActiveProviderTab(p.id);
                  setTestFeedback(null);
                }}
                className={isSelected ? "btn-primary" : "btn-secondary"}
                style={{
                  fontSize: "12px",
                  padding: "5px 10px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  borderRadius: "var(--radius-sm)",
                  border: isSelected ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                  backgroundColor: isSelected ? "var(--accent-primary)" : "var(--bg-app)",
                  color: isSelected ? "#fff" : "var(--text-main)",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    backgroundColor: isVerified
                      ? "#3fb950"
                      : hasKey
                      ? "#e3b341"
                      : "rgba(255, 255, 255, 0.2)",
                    boxShadow: isVerified ? "0 0 6px rgba(63, 185, 80, 0.8)" : "none",
                  }}
                />
                <span>{p.name}</span>
              </button>
            );
          })}
        </div>

        {/* Active Provider Details */}
        {(() => {
          const currentDef = LlmProviderRegistry.getProvider(activeProviderTab) || SUPPORTED_PROVIDERS[0];
          const currentCfg = providerConfigs[activeProviderTab] || { id: activeProviderTab, apiKey: "" };
          const hasKey = !!(currentCfg.apiKey && currentCfg.apiKey.trim().length > 0);
          const isVerified = !!currentCfg.isVerified;
          const modelsForProvider = LlmProviderRegistry.getModelsForProvider(activeProviderTab);

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "6px" }}>
              {/* Provider Info Banner */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-main)" }}>
                    {currentDef.name}
                  </span>
                  <span
                    style={{
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                      color: "var(--text-muted)",
                      fontWeight: 600,
                    }}
                  >
                    {currentDef.protocol} protocol
                  </span>
                  {currentDef.apiKeyHelpUrl && (
                    <a
                      href={currentDef.apiKeyHelpUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "3px",
                        fontSize: "11px",
                        color: "var(--accent-primary)",
                        textDecoration: "none",
                        marginLeft: "4px",
                      }}
                    >
                      <span>Get API Key</span>
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>

                <div>
                  {isVerified ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#3fb950",
                        backgroundColor: "rgba(63, 185, 80, 0.12)",
                        border: "1px solid rgba(63, 185, 80, 0.3)",
                        padding: "3px 8px",
                        borderRadius: "14px",
                      }}
                    >
                      <CheckCircle2 size={12} /> Active & Verified
                    </span>
                  ) : hasKey ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#e3b341",
                        backgroundColor: "rgba(227, 179, 65, 0.12)",
                        border: "1px solid rgba(227, 179, 65, 0.3)",
                        padding: "3px 8px",
                        borderRadius: "14px",
                      }}
                    >
                      <AlertCircle size={12} /> Configured (Unverified)
                    </span>
                  ) : (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        fontWeight: 500,
                        color: "var(--text-muted)",
                        backgroundColor: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid var(--border-subtle)",
                        padding: "3px 8px",
                        borderRadius: "14px",
                      }}
                    >
                      Not Configured
                    </span>
                  )}
                </div>
              </div>

              {/* API Key Input */}
              <div>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  API Key / Token:
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <input
                      type={showApiKey ? "text" : "password"}
                      placeholder={currentDef.apiKeyPlaceholder}
                      value={currentCfg.apiKey || ""}
                      onChange={(e) => {
                        updateProviderConfig(activeProviderTab, { apiKey: e.target.value, isVerified: false });
                        setTestFeedback(null);
                      }}
                      style={{
                        width: "100%",
                        fontFamily: "monospace",
                        fontSize: "12px",
                        paddingRight: "36px",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      style={{
                        position: "absolute",
                        right: "8px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>

                  <button
                    onClick={() => handleTestProvider(activeProviderTab)}
                    disabled={isTesting || !hasKey}
                    className="btn-primary"
                    style={{ minWidth: "120px", fontSize: "12px" }}
                  >
                    {isTesting ? (
                      <>
                        <RefreshCw size={13} className="spin" />
                        <span>Testing...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={13} />
                        <span>Verify Key</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Base URL (Optional / Configurable for proxies / local ports) */}
              <div>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  API Base URL (Default: <code style={{ fontSize: "10px" }}>{currentDef.defaultBaseUrl}</code>):
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    placeholder={currentDef.defaultBaseUrl}
                    value={currentCfg.baseUrl || ""}
                    onChange={(e) => {
                      updateProviderConfig(activeProviderTab, { baseUrl: e.target.value });
                    }}
                    style={{
                      flex: 1,
                      fontFamily: "monospace",
                      fontSize: "12px",
                    }}
                  />
                  {currentCfg.baseUrl && currentCfg.baseUrl !== currentDef.defaultBaseUrl && (
                    <button
                      onClick={() => updateProviderConfig(activeProviderTab, { baseUrl: undefined })}
                      className="btn-secondary"
                      style={{ fontSize: "11px", padding: "4px 8px" }}
                    >
                      Reset Default
                    </button>
                  )}
                </div>
              </div>

              {/* Test Feedback */}
              {testFeedback && (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "12px",
                    backgroundColor: testFeedback.isSuccess ? "rgba(63, 185, 80, 0.1)" : "rgba(248, 81, 73, 0.1)",
                    border: `1px solid ${testFeedback.isSuccess ? "rgba(63, 185, 80, 0.3)" : "rgba(248, 81, 73, 0.3)"}`,
                    color: testFeedback.isSuccess ? "#3fb950" : "#f85149",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  {testFeedback.isSuccess ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  <span>{testFeedback.message}</span>
                </div>
              )}

              {/* OpenRouter Key Info Stats */}
              {activeProviderTab === "openrouter" && keyInfo && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: "10px",
                    backgroundColor: "var(--bg-app)",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "12px",
                  }}
                >
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block", fontSize: "11px" }}>Key Label</span>
                    <span style={{ fontWeight: 600 }}>{keyInfo.label || "Default"}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block", fontSize: "11px" }}>Credit Usage</span>
                    <span style={{ fontWeight: 600, color: "var(--accent-primary)" }}>
                      ${keyInfo.usage?.toFixed(4) || "0.0000"}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block", fontSize: "11px" }}>Credit Limit</span>
                    <span style={{ fontWeight: 600 }}>
                      {keyInfo.limit !== null ? `$${keyInfo.limit}` : "Unlimited"}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block", fontSize: "11px" }}>Tier Status</span>
                    <span style={{ fontWeight: 600, color: keyInfo.is_free_tier ? "var(--accent-yellow)" : "var(--accent-green)" }}>
                      {keyInfo.is_free_tier ? "Free Tier" : "Paid Pay-As-You-Go"}
                    </span>
                  </div>
                </div>
              )}

              {/* Available Models Preview Box */}
              <div
                style={{
                  backgroundColor: "var(--bg-app)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                  padding: "10px 12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-main)" }}>
                    Available Models ({modelsForProvider.length})
                  </span>
                  <button
                    onClick={() => handleFetchProviderModels(activeProviderTab)}
                    disabled={isFetchingProviderModels || !hasKey}
                    className="btn-secondary"
                    style={{ fontSize: "11px", padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  >
                    <RefreshCw size={11} className={isFetchingProviderModels ? "spin" : ""} />
                    <span>Fetch Available Models</span>
                  </button>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px",
                    maxHeight: "140px",
                    overflowY: "auto",
                  }}
                >
                  {modelsForProvider.map((m) => {
                    const compositeId = activeProviderTab === "openrouter" ? m.id : `${activeProviderTab}:${m.id}`;
                    const isCurrent = selectedModelId === compositeId;

                    return (
                      <div
                        key={m.id}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          backgroundColor: isCurrent ? "rgba(88, 166, 255, 0.15)" : "var(--bg-card)",
                          border: isCurrent ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                        }}
                      >
                        <span style={{ fontWeight: isCurrent ? 700 : 500, color: isCurrent ? "var(--accent-primary)" : "var(--text-main)" }}>
                          {m.name}
                        </span>
                        {m.reasoning && (
                          <span
                            style={{
                              fontSize: "9px",
                              padding: "1px 4px",
                              borderRadius: "3px",
                              backgroundColor: "rgba(163, 113, 247, 0.15)",
                              color: "#a371f7",
                              fontWeight: 600,
                            }}
                          >
                            Reasoning
                          </span>
                        )}
                        <button
                          onClick={() => {
                            setSelectedModelId(compositeId);
                            toast.success(`Selected ${m.name} for translation`, "Model Activated");
                          }}
                          disabled={isCurrent}
                          style={{
                            background: isCurrent ? "none" : "rgba(255, 255, 255, 0.08)",
                            border: "none",
                            color: isCurrent ? "var(--accent-green, #3fb950)" : "var(--text-muted)",
                            cursor: isCurrent ? "default" : "pointer",
                            fontSize: "10px",
                            padding: "2px 6px",
                            borderRadius: "3px",
                          }}
                        >
                          {isCurrent ? "✓ Active" : "Use"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 3. Primary Translation Model Selection */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Sparkles size={16} /> 3. Active Translation Model & Parameters
            </span>
            <span className="card-subtitle">
              Select which LLM powers real-time live subtitle streaming and script translations
            </span>
          </div>

          <button
            onClick={() => loadModels()}
            disabled={isLoadingModels}
            className="btn-secondary"
            style={{ fontSize: "11px", padding: "4px 8px" }}
          >
            <RefreshCw size={12} className={isLoadingModels ? "spin" : ""} />
            <span>Refresh Models</span>
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
              Selected LLM Provider & Model:
            </label>
            <ModelSelectorCombobox
              selectedModelId={selectedModelId}
              onSelectModel={(id) => setSelectedModelId(id)}
              disabled={isLoadingModels}
            />
          </div>

          {/* Model Pricing & Context Info Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: "var(--bg-app)",
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
              fontSize: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{selectedModel.name}</span>
              <span style={{ color: "var(--text-muted)", fontSize: "11.5px" }}>
                Context: {selectedModel.context_length ? `${(selectedModel.context_length / 1000).toFixed(0)}k tokens` : "Unknown"}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {pricingFormatted.isFree ? (
                <span style={{ color: "var(--accent-green)", fontWeight: 600 }}>100% Free Tier</span>
              ) : (
                <>
                  <span style={{ display: "flex", alignItems: "center", gap: "2px", color: "var(--text-muted)" }}>
                    <ArrowDown size={12} color="#3fb950" /> {pricingFormatted.inputPerMillion}/M in
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "2px", color: "var(--text-muted)" }}>
                    <ArrowUp size={12} color="#f85149" /> {pricingFormatted.outputPerMillion}/M out
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Infrastructure Provider Routing Multi-Select */}
          {!selectedModelId.startsWith("mt:") && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600 }}>
                  Infrastructure Provider Routing:
                </label>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Optional: restrict requests to specific provider endpoints (e.g. Z.AI, Venice)
                </span>
              </div>
              <ProviderSelectorMultiSelect
                modelId={selectedModelId}
                selectedProviders={selectedProviders}
                onChangeProviders={(newProviders) => {
                  setSelectedModelProviders(selectedModelId, newProviders);
                  setSelectedProviders(newProviders);
                }}
                disabled={isLoadingModels}
              />
            </div>
          )}

          {/* Temperature Slider */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: "12px", fontWeight: 600 }}>
                Creativity & Temperature: <span style={{ color: "var(--accent-primary)" }}>{temperature}</span>
              </label>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {temperature <= 0.2 ? "Strict & Literal" : temperature <= 0.5 ? "Balanced VN Dialogue (Recommended)" : "High Creativity"}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              style={{ width: "100%", marginTop: "6px" }}
            />
          </div>
        </div>
      </div>

      <ReasoningSettingsCard
        selectedModelId={selectedModelId}
        modelName={selectedModel.name || selectedModelId}
        reasoningCapabilities={reasoningCapabilities}
        reasoningEffort={reasoningEffort}
        onChangeReasoningEffort={(effort) => {
          setReasoningEffort(effort);
          if (selectedModelId) {
            setModelPreferredReasoningEffort(selectedModelId, effort);
          }
        }}
        reasoningMaxTokens={reasoningMaxTokens}
        reasoningMaxTokensInput={reasoningMaxTokensInput}
        onChangeMaxTokens={(inputVal, tokens) => {
          setReasoningMaxTokensInput(inputVal);
          setReasoningMaxTokens(tokens);
        }}
        excludeReasoning={excludeReasoning}
        onChangeExcludeReasoning={setExcludeReasoning}
      />


      <StylePresetsCard
        allPresets={allPresets}
        activePresetId={activePresetId}
        styleInstructions={styleInstructions}
        sourceLang={sourceLang}
        targetLang={targetLang}
        onSelectPreset={handleSelectPreset}
        onResetPreset={handleResetPreset}
        onChangeStyleInstructions={(val) => {
          setStyleInstructions(val);
          localStorage.setItem("vn_active_style_instructions", val);
        }}
        onCreateCustomPreset={(name, desc, inst) => {
          const newPreset: PromptStylePreset = {
            id: `custom_style_${Date.now()}`,
            name,
            description: desc || "User-defined custom translation style",
            instructions: inst,
            isBuiltIn: false,
          };
          const updated = [...userPresets, newPreset];
          setUserPresets(updated);
          saveUserStylePresets(updated);
          setActivePresetId(newPreset.id);
          setStyleInstructions(newPreset.instructions);
          toast.success(`Custom style preset "${newPreset.name}" created and activated!`, "Preset Created");
        }}
        onDeleteCustomPreset={handleDeleteCustomPreset}
      />

      <FreeMtCard
        useGoogleTranslate={useGoogleTranslate}
        useDeepLFree={useDeepLFree}
        onToggleGoogleTranslate={setUseGoogleTranslate}
        onToggleDeepLFree={setUseDeepLFree}
      />
    </div>
  );
};
