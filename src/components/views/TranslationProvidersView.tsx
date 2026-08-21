import React, { useState, useEffect } from "react";
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
} from "../../services/openRouterService";
import {
  Zap,
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
} from "lucide-react";
import { ModelSelectorCombobox } from "../common/ModelSelectorCombobox";
import { useToast } from "../common/ToastProvider";
import { useTranslationStore } from "../../stores/useTranslationStore";
import { Modal } from "../common/Modal";

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

export const TranslationProvidersView: React.FC = () => {
  const toast = useToast();

  // OpenRouter Auth State
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem("vn_openrouter_api_key") || "";
  });
  const [keyStatus, setKeyStatus] = useState<"invalid" | "active">(() => {
    const savedStatus = localStorage.getItem("vn_openrouter_key_status");
    const savedKey = (localStorage.getItem("vn_openrouter_api_key") || "").trim();
    const verifiedKey = (localStorage.getItem("vn_openrouter_verified_key") || "").trim();
    if (savedStatus === "active" && savedKey && savedKey === verifiedKey) {
      return "active";
    }
    return "invalid";
  });
  const [keyInfo, setKeyInfo] = useState<OpenRouterKeyInfo | null>(() => {
    try {
      const saved = localStorage.getItem("vn_openrouter_key_info");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testFeedback, setTestFeedback] = useState<{ isSuccess: boolean; message: string } | null>(() => {
    const savedStatus = localStorage.getItem("vn_openrouter_key_status");
    const savedKey = (localStorage.getItem("vn_openrouter_api_key") || "").trim();
    const verifiedKey = (localStorage.getItem("vn_openrouter_verified_key") || "").trim();
    if (savedStatus === "active" && savedKey && savedKey === verifiedKey) {
      return { isSuccess: true, message: "Key verified!" };
    }
    return null;
  });

  // Models State
  const [models, setModels] = useState<OpenRouterModel[]>(FALLBACK_POPULAR_MODELS);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    return localStorage.getItem("vn_selected_model") || "anthropic/claude-3.5-sonnet";
  });

  // Hyperparameters
  const [temperature, setTemperature] = useState<number>(0.3);

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

  const sourceLang = localStorage.getItem("vn_source_lang") || "ja";
  const targetLang = localStorage.getItem("vn_target_lang") || "en";

  // Auto-fetch OpenRouter models on load
  const loadModels = async () => {
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
    localStorage.setItem("vn_openrouter_api_key", apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem("vn_selected_model", selectedModelId);
    useTranslationStore.getState().setSelectedProvider(selectedModelId);
  }, [selectedModelId]);

  useEffect(() => {
    localStorage.setItem("vn_active_style_preset_id", activePresetId);
    localStorage.setItem("vn_active_style_instructions", styleInstructions);
  }, [activePresetId, styleInstructions]);

  // Test Connection
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestFeedback(null);

    const result = await testOpenRouterKey(apiKey);
    setIsTesting(false);

    if (result.isValid) {
      setKeyStatus("active");
      setKeyInfo(result.keyInfo || null);
      setTestFeedback({ isSuccess: true, message: result.message });
      localStorage.setItem("vn_openrouter_key_status", "active");
      localStorage.setItem("vn_openrouter_verified_key", apiKey.trim());
      if (result.keyInfo) {
        localStorage.setItem("vn_openrouter_key_info", JSON.stringify(result.keyInfo));
      }
      toast.success("OpenRouter API Key verified successfully!", "Key Active");
    } else {
      setKeyStatus("invalid");
      setKeyInfo(null);
      setTestFeedback({ isSuccess: false, message: result.message });
      localStorage.setItem("vn_openrouter_key_status", "invalid");
      localStorage.removeItem("vn_openrouter_verified_key");
      localStorage.removeItem("vn_openrouter_key_info");
      toast.error(result.message || "Failed to verify API Key.", "Validation Error");
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
      {/* 1. OpenRouter API Key & Authentication */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Zap size={16} /> OpenRouter API Key & Authentication
            </span>
            <span className="card-subtitle">
              Universal multi-model gateway (Claude 3.5 Sonnet, GPT-4o, Gemini 2.5, DeepSeek V3, Qwen)
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {keyStatus === "active" ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#3fb950",
                  backgroundColor: "rgba(63, 185, 80, 0.12)",
                  border: "1px solid rgba(63, 185, 80, 0.3)",
                  padding: "4px 10px",
                  borderRadius: "20px",
                }}
              >
                <CheckCircle2 size={14} /> Active & Verified
              </span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#f85149",
                  backgroundColor: "rgba(248, 81, 73, 0.12)",
                  border: "1px solid rgba(248, 81, 73, 0.3)",
                  padding: "4px 10px",
                  borderRadius: "20px",
                }}
              >
                <AlertCircle size={14} /> Unverified
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", gap: "10px" }}>
            <input
              type="password"
              placeholder="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setKeyStatus("invalid");
              }}
              style={{ flex: 1, fontFamily: "monospace", fontSize: "13px" }}
            />

            <button
              onClick={handleTestConnection}
              disabled={isTesting || !apiKey.trim()}
              className="btn-primary"
              style={{ minWidth: "140px" }}
            >
              {isTesting ? (
                <>
                  <RefreshCw size={14} className="spin" />
                  <span>Testing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>Verify Key</span>
                </>
              )}
            </button>
          </div>

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

          {keyInfo && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
      </div>

      {/* 2. Primary Translation Model Selection */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Sparkles size={16} /> Active Translation Model
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

      {/* 3. Translation Style & Tone Presets (Modular Prompting) */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Sliders size={16} /> Translation Style & Tone Presets
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

      {/* 4. Free Online Machine Translation (MT) */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Globe size={16} /> Free Online MT (Zero API Cost Fallback)
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
