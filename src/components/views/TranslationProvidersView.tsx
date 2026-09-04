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
  buildCompleteSystemPrompt,
  getLanguageDisplayName,
  getSelectedModelProviders,
  setSelectedModelProviders,
  getModelReasoningCapabilities,
  formatReasoningEffortLabel,
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
  RotateCcw,
  Layers,
  Radio,
  ArrowUp,
  ArrowDown,
  Sliders,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Check,
  Brain,
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
import { Modal } from "../common/Modal";
import { ReasoningEffort } from "../../types";

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
    return localStorage.getItem("vn_selected_model") || "mt:google-translate";
  });
  const [selectedProviders, setSelectedProviders] = useState<string[]>(() => {
    const initModel = localStorage.getItem("vn_selected_model") || "mt:google-translate";
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

  // Custom Preset Modal State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [customName, setCustomName] = useState<string>("");
  const [customDesc, setCustomDesc] = useState<string>("");
  const [customInst, setCustomInst] = useState<string>("");

  // Prompt Full Preview State
  const [showFullPreview, setShowFullPreview] = useState<boolean>(false);
  const [previewMode, setPreviewMode] = useState<"live" | "batch">("live");

  // Free MT Endpoints
  const [useGoogleTranslate, setUseGoogleTranslate] = useState<boolean>(true);
  const [useDeepLFree, setUseDeepLFree] = useState<boolean>(true);

  const [sourceLang, setSourceLang] = useState<string>(() => {
    return localStorage.getItem("vn_source_lang") || "ja";
  });
  const [targetLang, setTargetLang] = useState<string>(() => {
    return localStorage.getItem("vn_target_lang") || "en";
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
    localStorage.setItem("vn_selected_model", selectedModelId);
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
    localStorage.setItem("vn_source_lang", sourceLang);
    localStorage.setItem("vn_target_lang", targetLang);
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

  // Handle Create Custom Preset
  const handleSaveCustom = () => {
    if (!customName.trim() || !customInst.trim()) {
      toast.warning("Preset Name and Instructions are required.", "Missing Information");
      return;
    }

    const newPreset: PromptStylePreset = {
      id: `custom_style_${Date.now()}`,
      name: customName.trim(),
      description: customDesc.trim() || "User-defined custom translation style",
      instructions: customInst.trim(),
      isBuiltIn: false,
    };

    const updated = [...userPresets, newPreset];
    setUserPresets(updated);
    saveUserStylePresets(updated);
    setActivePresetId(newPreset.id);
    setStyleInstructions(newPreset.instructions);
    setShowAddModal(false);
    setCustomName("");
    setCustomDesc("");
    setCustomInst("");
    toast.success(`Custom style preset "${newPreset.name}" created and activated!`, "Preset Created");
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

  const assembledPrompt = buildCompleteSystemPrompt({
    mode: previewMode,
    sourceLang,
    targetLang,
    styleInstructions,
    includeGlossary: true,
  });

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

      {/* 3. Reasoning Tokens & Thinking Budget (OpenRouter) */}
      {!selectedModelId.startsWith("mt:") && (
        <div className="card" style={{ margin: 0 }}>
          <div className="card-header">
            <div>
              <span className="card-title">
                <Brain size={16} style={{ color: "var(--accent-purple, #a855f7)" }} /> 3. Preferred Reasoning & Thinking Tokens
              </span>
              <span className="card-subtitle">
                Configure preferred reasoning effort, token budget, and thinking trace visibility per model
              </span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Status Indicator Banner */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: reasoningCapabilities.isSupported ? "rgba(168, 85, 247, 0.08)" : "var(--bg-app)",
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                border: reasoningCapabilities.isSupported ? "1px solid rgba(168, 85, 247, 0.3)" : "1px solid var(--border-subtle)",
                fontSize: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Brain size={15} color={reasoningCapabilities.isSupported ? "var(--accent-purple, #a855f7)" : "var(--text-muted)"} />
                <span style={{ fontWeight: 600, color: reasoningCapabilities.isSupported ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  {reasoningCapabilities.isSupported
                    ? `Thinking-Capable Model: "${selectedModel.name || selectedModelId}"`
                    : `Standard Model: "${selectedModel.name || selectedModelId}"`}
                </span>
              </div>
              <span style={{ fontSize: "11px", color: reasoningCapabilities.isSupported ? "var(--accent-purple, #a855f7)" : "var(--text-muted)", fontWeight: 500 }}>
                {!reasoningCapabilities.isSupported
                  ? "Direct translation (Reasoning not supported by this model)"
                  : reasoningCapabilities.isMandatory
                  ? "⚠️ Mandatory Reasoning"
                  : reasoningCapabilities.mode === "efforts_list"
                  ? `✓ Supported Levels: ${reasoningCapabilities.supportedEfforts.join(", ")}`
                  : "✓ Binary Reasoning Toggle"}
              </span>
            </div>

            {/* Reasoning Grid: Effort + Custom Max Tokens */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              {/* Reasoning Effort */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Preferred Reasoning Effort / Mode:
                </label>
                <select
                  className="input-field"
                  value={
                    !reasoningCapabilities.isSupported
                      ? "none"
                      : reasoningCapabilities.mode === "toggle_only"
                      ? (reasoningEffort === "none" ? "none" : reasoningEffort === "custom" ? "custom" : "default")
                      : (reasoningCapabilities.supportedEfforts.includes(reasoningEffort) || reasoningEffort === "none" || reasoningEffort === "default" || reasoningEffort === "custom" ? reasoningEffort : "default")
                  }
                  disabled={!reasoningCapabilities.isSupported}
                  onChange={(e) => {
                    const val = e.target.value as ReasoningEffort;
                    setReasoningEffort(val);
                    if (selectedModelId) {
                      setModelPreferredReasoningEffort(selectedModelId, val);
                    }
                  }}
                  style={{ width: "100%", fontSize: "12px", padding: "7px 10px", fontWeight: 600, backgroundColor: "var(--bg-surface-elevated)" }}
                >
                  {!reasoningCapabilities.isSupported ? (
                    <option value="none">Not Supported by Model</option>
                  ) : reasoningCapabilities.mode === "efforts_list" ? (
                    <>
                      <option value="default">
                        Default{reasoningCapabilities.defaultEffort ? `: ${formatReasoningEffortLabel(reasoningCapabilities.defaultEffort)}` : ""}
                      </option>
                      {!reasoningCapabilities.isMandatory && <option value="none">Off</option>}
                      {reasoningCapabilities.supportedEfforts.map((eff) => (
                        <option key={eff} value={eff}>
                          {formatReasoningEffortLabel(eff)}
                        </option>
                      ))}
                      {reasoningCapabilities.supportsMaxTokens && <option value="custom">Custom Token Budget</option>}
                    </>
                  ) : (
                    <>
                      <option value="default">Enabled (Active)</option>
                      {!reasoningCapabilities.isMandatory && <option value="none">Off</option>}
                      {reasoningCapabilities.supportsMaxTokens && <option value="custom">Custom Token Budget</option>}
                    </>
                  )}
                </select>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "4px" }}>
                  {!reasoningCapabilities.isSupported
                    ? "Parameters will be automatically skipped for this standard model."
                    : "Preferred thinking level is saved specifically for this model. 'Default' uses OpenRouter's model default."}
                </span>
              </div>

              {/* Custom Max Reasoning Tokens Budget */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Max Reasoning Tokens Budget ({reasoningMaxTokens > 0 ? `${reasoningMaxTokens} tokens` : "Unset / Dynamic"}):
                </label>
                <input
                  type="number"
                  min={0}
                  step={512}
                  placeholder={reasoningCapabilities.supportsMaxTokens ? "e.g. 2048 (0 = auto)" : "Optional token budget limit"}
                  className="input-field"
                  disabled={!reasoningCapabilities.isSupported}
                  value={reasoningMaxTokensInput}
                  onChange={(e) => {
                    setReasoningMaxTokensInput(e.target.value);
                    const parsed = parseInt(e.target.value, 10);
                    setReasoningMaxTokens(isNaN(parsed) || parsed < 0 ? 0 : parsed);
                  }}
                  style={{ width: "100%", fontSize: "12px", padding: "7px 10px", fontWeight: 600 }}
                />
                <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "4px" }}>
                  {reasoningCapabilities.supportsMaxTokens
                    ? "✓ Explicit max_tokens budget supported natively by this model (e.g. Claude 3.7 Sonnet)."
                    : "Token limit ceiling for reasoning steps (if accepted upstream)."}
                </span>
              </div>
            </div>

            {/* Exclude Reasoning from Output Checkbox */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "var(--bg-app)",
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                  Exclude Reasoning Traces from Output (`exclude: true`)
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Keeps game translation output pure by hiding chain-of-thought tokens from the final dialog text.
                </span>
              </div>

              <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={excludeReasoning}
                  onChange={(e) => setExcludeReasoning(e.target.checked)}
                  style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--accent-primary)" }}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 4. Translation Style & Tone Presets (Modular Prompting) */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Sliders size={16} /> 4. Translation Style & Tone Presets
            </span>
            <span className="card-subtitle">
              Adjust character personality and translation tone without worrying about JSON schemas or language tags
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => {
                setCustomInst(styleInstructions);
                setShowAddModal(true);
              }}
              className="btn-secondary"
              style={{ fontSize: "11.5px", padding: "4px 10px", display: "flex", alignItems: "center", gap: "5px" }}
            >
              <Plus size={13} />
              <span>Add Custom Style</span>
            </button>

            <button
              onClick={handleResetPreset}
              className="btn-secondary"
              style={{ fontSize: "11.5px", padding: "4px 8px" }}
              title="Reset active style to preset default instructions"
            >
              <RotateCcw size={13} />
              <span>Reset Style</span>
            </button>
          </div>
        </div>

        {/* Preset Selector Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px", marginBottom: "14px" }}>
          {allPresets.map((preset) => {
            const isSelected = activePresetId === preset.id;
            return (
              <div
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                style={{
                  backgroundColor: isSelected ? "rgba(88, 166, 255, 0.1)" : "var(--bg-app)",
                  border: `1.5px solid ${isSelected ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                  borderRadius: "var(--radius-sm)",
                  padding: "10px 12px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  position: "relative",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600, fontSize: "12.5px", color: isSelected ? "var(--accent-primary)" : "var(--text-primary)" }}>
                    {preset.name}
                  </span>
                  {!preset.isBuiltIn && (
                    <button
                      onClick={(e) => handleDeleteCustomPreset(preset.id, e)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--accent-red)",
                        cursor: "pointer",
                        padding: "2px",
                        opacity: 0.7,
                      }}
                      title="Delete custom preset"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: "1.35" }}>
                  {preset.description}
                </span>
                {isSelected && (
                  <div style={{ marginTop: "4px", display: "flex", alignItems: "center", gap: "4px", fontSize: "10.5px", color: "var(--accent-primary)", fontWeight: 600 }}>
                    <Check size={12} /> Active Style
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Interactive Style Instructions Editor */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
              <Sparkles size={14} color="var(--accent-primary)" />
              Active Translation Style Guidelines (Part 2):
            </label>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              {styleInstructions.length} characters
            </span>
          </div>

          <textarea
            rows={4}
            value={styleInstructions}
            onChange={(e) => {
              setStyleInstructions(e.target.value);
              localStorage.setItem("vn_active_style_instructions", e.target.value);
            }}
            style={{
              width: "100%",
              fontSize: "12px",
              lineHeight: "1.5",
              resize: "vertical",
              fontFamily: "inherit",
              backgroundColor: "var(--bg-app)",
              borderColor: "var(--border-subtle)",
            }}
            placeholder="Type custom instructions for translation style, personality, honorifics, or tone..."
          />

          <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            💡 <strong>Automatic Modular Assembly</strong>: Source language (<code>{getLanguageDisplayName(sourceLang)}</code>), target language (<code>{getLanguageDisplayName(targetLang)}</code>), character glossary, and strict JSON output schemas are assembled automatically by the system.
          </span>
        </div>

        {/* Collapsible Full Assembled Prompt Preview */}
        <div style={{ marginTop: "14px", borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
          <div
            onClick={() => setShowFullPreview(!showFullPreview)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
              {showFullPreview ? <EyeOff size={14} /> : <Eye size={14} />}
              {showFullPreview ? "Hide" : "Inspect"} Full Assembled System Prompt (Parts 1–4)
            </span>

            {showFullPreview && (
              <div style={{ display: "flex", gap: "6px" }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setPreviewMode("live")}
                  className={`btn-${previewMode === "live" ? "primary" : "secondary"}`}
                  style={{ padding: "2px 8px", fontSize: "10.5px" }}
                >
                  <Radio size={11} /> Live Mode
                </button>
                <button
                  onClick={() => setPreviewMode("batch")}
                  className={`btn-${previewMode === "batch" ? "primary" : "secondary"}`}
                  style={{ padding: "2px 8px", fontSize: "10.5px" }}
                >
                  <Layers size={11} /> Batch Mode
                </button>
              </div>
            )}
          </div>

          {showFullPreview && (
            <div
              style={{
                marginTop: "10px",
                backgroundColor: "var(--bg-app)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "12px",
                fontSize: "11.5px",
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                color: "var(--text-primary)",
                maxHeight: "260px",
                overflowY: "auto",
                lineHeight: "1.45",
              }}
            >
              {assembledPrompt}
            </div>
          )}
        </div>
      </div>

      {/* 5. Free Online Machine Translation (MT) */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Globe size={16} /> 5. Free Online MT (Zero API Cost Fallback)
            </span>
            <span className="card-subtitle">
              Fast web translation services used as backup when API credits expire
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={useGoogleTranslate}
              onChange={(e) => setUseGoogleTranslate(e.target.checked)}
              style={{ transform: "scale(1.15)" }}
            />
            <div>
              <span style={{ fontWeight: 600, fontSize: "13px" }}>Google Translate (Free Web Endpoint)</span>
              <span style={{ fontSize: "11.5px", color: "var(--text-muted)", display: "block" }}>
                High-speed translation engine for live gameplay streaming with minimal latency.
              </span>
            </div>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={useDeepLFree}
              onChange={(e) => setUseDeepLFree(e.target.checked)}
              style={{ transform: "scale(1.15)" }}
            />
            <div>
              <span style={{ fontWeight: 600, fontSize: "13px" }}>DeepL Web Scraper Endpoint</span>
              <span style={{ fontSize: "11.5px", color: "var(--text-muted)", display: "block" }}>
                Natural Japanese nuance translation fallback.
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* Modal: Add Custom Style Preset */}
      {showAddModal && (
        <Modal
          title="Create Custom Translation Style Preset"
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: "380px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Preset Name:
              </label>
              <input
                type="text"
                placeholder="e.g. Indonesian Visual Novel Gaul, Cyberpunk Lore..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Short Description:
              </label>
              <input
                type="text"
                placeholder="Brief summary of when to use this style..."
                value={customDesc}
                onChange={(e) => setCustomDesc(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Style Instructions (Part 2):
              </label>
              <textarea
                rows={5}
                placeholder="Translate with natural colloquial flow, preserving slang..."
                value={customInst}
                onChange={(e) => setCustomInst(e.target.value)}
                style={{ width: "100%", fontSize: "12px", lineHeight: "1.45", resize: "vertical" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}>
              <button onClick={() => setShowAddModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleSaveCustom} className="btn-primary">
                Save & Activate Preset
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
