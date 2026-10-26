import { useConfirmation } from "../common/ConfirmationProvider";
import React, { useState, useEffect, useRef } from "react";
import { FreeMtCard } from "./providers/FreeMtCard";
import {
  testOpenRouterKey,
  OpenRouterKeyInfo,
  PromptStylePreset,
  BUILTIN_STYLE_PRESETS,
  loadUserStylePresets,
  saveUserStylePresets,
  getAllStylePresets,
  getActiveStylePresetId,
  getActiveStyleInstructions,
} from "../../services/openRouterService";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Globe,
  Eye,
  EyeOff,
  ExternalLink,
  Cpu,
  Sliders,
} from "lucide-react";
import {
  LlmProviderRegistry,
  SUPPORTED_PROVIDERS,
  StoredProviderConfig,
} from "../../services/providers/llmProviderRegistry";
import { LlmDispatcherService } from "../../services/providers/llmDispatcherService";
import { LanguageSelectorCombobox } from "../common/LanguageSelectorCombobox";
import { useToast } from "../common/ToastProvider";
import { settingsManager } from "../../services/settingsManager";
import { StylePresetsCard } from "./providers/StylePresetsCard";

export const TranslationProvidersView: React.FC = () => {
  const confirm = useConfirmation();
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

  const providerConfigsRef = useRef(providerConfigs);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const editProviderConfig = (providerId: string, updates: Partial<StoredProviderConfig>) => {
    const current = providerConfigsRef.current;
    const merged = { ...current[providerId], id: providerId, ...updates };
    providerConfigsRef.current = { ...current, [providerId]: merged };
    setProviderConfigs(providerConfigsRef.current);
    setTestFeedback(null);
  };

  const updateProviderConfig = async (providerId: string, updates: Partial<StoredProviderConfig>): Promise<boolean> => {
    const merged = { ...providerConfigsRef.current[providerId], id: providerId, ...updates };
    // Serialize writes so an earlier blur cannot overwrite a later verified key.
    const save = saveQueueRef.current.then(() => LlmProviderRegistry.saveProviderConfig(merged));
    saveQueueRef.current = save.catch(() => {});
    try {
      await save;
      const current = providerConfigsRef.current[providerId];
      if (current?.apiKey === merged.apiKey && current?.baseUrl === merged.baseUrl) {
        providerConfigsRef.current = { ...providerConfigsRef.current, [providerId]: merged };
        setProviderConfigs(providerConfigsRef.current);
      }
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error), "Could not save provider");
      return false;
    }
  };

  // Hyperparameters
  const [temperature, setTemperature] = useState<number>(() => settingsManager.getTranslation().temperature ?? 0.3);

  // Translation Style & Presets State
  const [userPresets, setUserPresets] = useState<PromptStylePreset[]>(() => loadUserStylePresets());
  const [activePresetId, setActivePresetId] = useState<string>(() => getActiveStylePresetId());
  const [styleInstructions, setStyleInstructions] = useState<string>(() => getActiveStyleInstructions());

  const [sourceLang, setSourceLang] = useState<string>(() => {
    return settingsManager.getSourceLang();
  });
  const [targetLang, setTargetLang] = useState<string>(() => {
    return settingsManager.getTargetLang();
  });

  useEffect(() => {
    localStorage.setItem("vn_active_style_preset_id", activePresetId);
    localStorage.setItem("vn_active_style_instructions", styleInstructions);
  }, [activePresetId, styleInstructions]);

  useEffect(() => {
    settingsManager.updateGeneral({ sourceLang, targetLang });
  }, [sourceLang, targetLang]);

  useEffect(() => {
    settingsManager.updateTranslation({ temperature });
  }, [temperature]);

  // Verify the current draft, then mark it verified only after secure storage succeeds.
  const performProviderTest = async (providerId: string) => {
    const cfg = providerConfigsRef.current[providerId];
    if (!cfg?.apiKey.trim()) {
      toast.error("Please enter an API key first.", "Missing key");
      return;
    }
    setIsTesting(true);
    setTestFeedback(null);
    try {
      if (!await updateProviderConfig(providerId, { isVerified: false })) return;
      const result = providerId === "openrouter"
        ? await testOpenRouterKey(cfg.apiKey)
        : await LlmDispatcherService.testProviderConnection(providerId, cfg.apiKey, cfg.baseUrl);
      if (!await updateProviderConfig(providerId, { isVerified: result.isValid })) return;
      setTestFeedback({ isSuccess: result.isValid, message: result.message });
      if (providerId === "openrouter") {
        const info = "keyInfo" in result ? result.keyInfo as OpenRouterKeyInfo | undefined : undefined;
        setKeyInfo(info || null);
        if (info) localStorage.setItem("vn_provider_openrouter_key_info", JSON.stringify(info));
        else localStorage.removeItem("vn_provider_openrouter_key_info");
      }
      if (!result.isValid) {
        toast.error(result.message, "Connection failed");
        return;
      }
      toast.success(result.message, "Provider saved & verified");
      const models = await LlmDispatcherService.fetchProviderModels(providerId, cfg.apiKey, cfg.baseUrl);
      if (models.length > 0) await updateProviderConfig(providerId, { customModels: models });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTestFeedback({ isSuccess: false, message });
      toast.error(message, "Could not verify provider");
    } finally {
      setIsTesting(false);
    }
  };

  const confirmProviderChange = (providerId: string, action: () => void | Promise<void>) => {
    const saved = LlmProviderRegistry.getProviderConfig(providerId);
    const draft = providerConfigsRef.current[providerId];
    const replacingKey = Boolean(saved.apiKey && saved.apiKey !== draft?.apiKey.trim());
    const changingEndpoint = Boolean(saved.apiKey && (saved.baseUrl || "") !== (draft?.baseUrl || ""));
    if (replacingKey || changingEndpoint) {
      confirm({ title: draft?.apiKey.trim() ? "Replace provider configuration?" : "Remove saved API key?", message: draft?.apiKey.trim() ? "Replace the saved API key or endpoint with these edited values?" : "Delete this provider's saved API key from secure storage?", confirmText: draft?.apiKey.trim() ? "Save changes" : "Remove key", variant: "warning" }, action);
    } else void action();
  };
  const handleTestProvider = (providerId: string) => confirmProviderChange(providerId, () => performProviderTest(providerId));
  const saveProviderDraft = (providerId: string) => confirmProviderChange(providerId, async () => { await updateProviderConfig(providerId, {}); });

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
    confirm({ title: "Reset style instructions?", message: "Replace your edited instructions with this preset default?", confirmText: "Reset instructions", variant: "warning" }, () => {
      const found = allPresets.find((p) => p.id === activePresetId);
      if (found) {
        setStyleInstructions(found.instructions);
        localStorage.setItem("vn_active_style_instructions", found.instructions);
        toast.success(`Reset style instructions to "${found.name}" default.`, "Reset Success");
      }
    });
  };

  // Handle Delete Custom Preset
  const handleDeleteCustomPreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    confirm({ title: "Delete style preset?", message: "Remove this custom translation style? This cannot be undone.", confirmText: "Delete preset" }, () => {
      const updated = userPresets.filter((p) => p.id !== id);
      setUserPresets(updated);
      saveUserStylePresets(updated);
      if (activePresetId === id) {
        const defaultPreset = BUILTIN_STYLE_PRESETS[0];
        setActivePresetId(defaultPreset.id);
        setStyleInstructions(defaultPreset.instructions);
      }
      toast.info("Custom style preset deleted.", "Preset Removed");
    });
  };

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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "16px" }}>
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
                  color: isSelected ? "#fff" : "var(--text-primary)",
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
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                    {currentDef.name}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "capitalize" }}>
                    ({currentDef.category} • {currentDef.protocol})
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {currentDef.apiKeyHelpUrl && (
                    <a
                      href={currentDef.apiKeyHelpUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        color: "var(--accent-primary)",
                        textDecoration: "none",
                      }}
                    >
                      <span>Get API Key</span>
                      <ExternalLink size={11} />
                    </a>
                  )}

                  {isVerified ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--accent-green, #3fb950)",
                        backgroundColor: "rgba(63, 185, 80, 0.1)",
                        border: "1px solid rgba(63, 185, 80, 0.25)",
                        padding: "2px 8px",
                        borderRadius: "12px",
                      }}
                    >
                      <CheckCircle2 size={11} /> Active & Verified
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
                        backgroundColor: "rgba(227, 179, 65, 0.1)",
                        border: "1px solid rgba(227, 179, 65, 0.25)",
                        padding: "2px 8px",
                        borderRadius: "12px",
                      }}
                    >
                      Key Entered (Unverified)
                    </span>
                  ) : (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        padding: "2px 8px",
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
                      aria-label="Provider API key"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={isTesting}
                      onBlur={() => saveProviderDraft(activeProviderTab)}
                      onChange={(e) => {
                        editProviderConfig(activeProviderTab, { apiKey: e.target.value, isVerified: false });
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
                      aria-label={showApiKey ? "Hide API key" : "Show API key"}
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
                    aria-label="Provider API base URL"
                    disabled={isTesting}
                    onBlur={() => saveProviderDraft(activeProviderTab)}
                    onChange={(e) => {
                      editProviderConfig(activeProviderTab, { baseUrl: e.target.value, isVerified: false });
                    }}
                    style={{
                      flex: 1,
                      fontFamily: "monospace",
                      fontSize: "12px",
                    }}
                  />
                  {currentCfg.baseUrl && currentCfg.baseUrl !== currentDef.defaultBaseUrl && (
                    <button
                      disabled={isTesting}
                      onClick={() => confirm({ title: "Reset provider endpoint?", message: "Replace this API base URL with the provider default?", confirmText: "Reset endpoint", variant: "warning" }, async () => {
                        editProviderConfig(activeProviderTab, { baseUrl: undefined, isVerified: false });
                        await updateProviderConfig(activeProviderTab, {});
                      })}
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
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
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
            </div>
          );
        })()}
      </div>

      {/* 3. Translation Parameters (Temperature only) */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Sliders size={16} /> 3. Translation Parameters
            </span>
            <span className="card-subtitle">
              Configure LLM response temperature and translation creativity
            </span>
          </div>
        </div>

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
            style={{ width: "100%", marginTop: "8px" }}
          />
        </div>
      </div>

      <FreeMtCard />

      {/* 4. Style & Presets */}
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
    </div>
  );
};
