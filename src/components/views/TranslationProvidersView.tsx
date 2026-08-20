import React, { useState, useEffect } from "react";
import {
  fetchOpenRouterModels,
  testOpenRouterKey,
  formatModelPricing,
  OpenRouterModel,
  OpenRouterKeyInfo,
  DEFAULT_LIVE_SYSTEM_PROMPT,
  DEFAULT_BATCH_SYSTEM_PROMPT,
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
  Star,
  ArrowUp,
  ArrowDown,
  Sliders,
} from "lucide-react";
import { ModelSelectorCombobox } from "../common/ModelSelectorCombobox";

const INITIAL_STARRED_MODEL_IDS: string[] = [
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

export const TranslationProvidersView: React.FC = () => {
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

  // Starred Models State
  const [starredModelIds, setStarredModelIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("vn_starred_models");
      return saved ? JSON.parse(saved) : INITIAL_STARRED_MODEL_IDS;
    } catch {
      return INITIAL_STARRED_MODEL_IDS;
    }
  });

  // Models State
  const [models, setModels] = useState<OpenRouterModel[]>(FALLBACK_POPULAR_MODELS);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    return localStorage.getItem("vn_selected_model") || "anthropic/claude-3.5-sonnet";
  });

  // Hyperparameters & Prompts
  const [temperature, setTemperature] = useState<number>(0.3);
  const [livePrompt, setLivePrompt] = useState<string>(() => {
    return localStorage.getItem("vn_live_system_prompt") || DEFAULT_LIVE_SYSTEM_PROMPT;
  });
  const [batchPrompt, setBatchPrompt] = useState<string>(() => {
    return localStorage.getItem("vn_batch_system_prompt") || DEFAULT_BATCH_SYSTEM_PROMPT;
  });

  // Free MT Endpoints
  const [useGoogleTranslate, setUseGoogleTranslate] = useState<boolean>(true);
  const [useDeepLFree, setUseDeepLFree] = useState<boolean>(true);

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

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem("vn_openrouter_api_key", apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem("vn_starred_models", JSON.stringify(starredModelIds));
  }, [starredModelIds]);

  useEffect(() => {
    localStorage.setItem("vn_selected_model", selectedModelId);
  }, [selectedModelId]);

  useEffect(() => {
    localStorage.setItem("vn_live_system_prompt", livePrompt);
  }, [livePrompt]);

  useEffect(() => {
    localStorage.setItem("vn_batch_system_prompt", batchPrompt);
  }, [batchPrompt]);

  // Star / Unstar Model
  const handleToggleStar = (modelId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (starredModelIds.includes(modelId)) {
      setStarredModelIds(starredModelIds.filter((id) => id !== modelId));
    } else {
      setStarredModelIds([...starredModelIds, modelId]);
    }
  };

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
    } else {
      setKeyStatus("invalid");
      setKeyInfo(null);
      setTestFeedback({ isSuccess: false, message: result.message });
      localStorage.setItem("vn_openrouter_key_status", "invalid");
      localStorage.removeItem("vn_openrouter_verified_key");
      localStorage.removeItem("vn_openrouter_key_info");
    }
  };

  // Filtered list of starred models for quick cards
  const starredModelsList = models.filter((m) => starredModelIds.includes(m.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* 1. OpenRouter API Key & Connection Status Card */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Zap size={16} color="var(--accent-gold)" /> OpenRouter API Gateway
            </span>
            <span className="card-subtitle">
              Universal API connection for Claude 3.5 Sonnet, GPT-4o, DeepSeek V3, Gemini, and Qwen
            </span>
          </div>

          {/* Status Badge (Initial: Invalid) */}
          <span
            className={keyStatus === "active" ? "badge badge-success" : "badge badge-danger"}
            style={{
              padding: "4px 10px",
              fontWeight: 700,
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            {keyStatus === "active" ? (
              <>
                <CheckCircle2 size={12} /> Active (Verified)
              </>
            ) : (
              <>
                <AlertCircle size={12} /> Invalid (Unverified)
              </>
            )}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              OpenRouter API Key
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  const newKey = e.target.value;
                  setApiKey(newKey);
                  const verifiedKey = localStorage.getItem("vn_openrouter_verified_key");
                  if (verifiedKey && newKey.trim() === verifiedKey.trim()) {
                    setKeyStatus("active");
                    localStorage.setItem("vn_openrouter_key_status", "active");
                    setTestFeedback({ isSuccess: true, message: "Key verified!" });
                  } else {
                    setKeyStatus("invalid");
                    localStorage.setItem("vn_openrouter_key_status", "invalid");
                    setTestFeedback(null);
                  }
                }}
                placeholder="sk-or-v1-..."
                style={{ flex: 1, fontFamily: "var(--font-mono)" }}
              />
              <button
                onClick={handleTestConnection}
                disabled={isTesting || !apiKey.trim()}
                className="btn-primary"
                style={{ padding: "7px 18px", whiteSpace: "nowrap" }}
              >
                {isTesting ? <RefreshCw size={13} className="spin" /> : <Sparkles size={13} />}
                <span>{isTesting ? "Validating..." : "Test Connection"}</span>
              </button>
            </div>

            {/* Test Connection Feedback Banner */}
            {testFeedback && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "12px",
                  backgroundColor: testFeedback.isSuccess ? "rgba(63, 185, 80, 0.12)" : "rgba(248, 81, 73, 0.12)",
                  border: testFeedback.isSuccess ? "1px solid var(--accent-success)" : "1px solid var(--accent-danger)",
                  color: testFeedback.isSuccess ? "var(--accent-success)" : "var(--accent-danger)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {testFeedback.isSuccess ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  <span style={{ fontWeight: 600 }}>{testFeedback.message}</span>
                </div>
                {keyInfo && keyInfo.rate_limit && (
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginLeft: "22px" }}>
                    Rate Limit: {keyInfo.rate_limit.requests} requests per {keyInfo.rate_limit.interval}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. DEDICATED SECTION: Translation Models & Starred Favorites */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Star size={16} color="var(--accent-gold)" fill="var(--accent-gold)" /> Translation Models & Starred Favorites
            </span>
            <span className="card-subtitle">
              Quickly select or star your preferred translation models • {models.length} live OpenRouter models loaded
            </span>
          </div>

          <button
            onClick={loadModels}
            disabled={isLoadingModels}
            className="btn-secondary"
            style={{ padding: "4px 10px", fontSize: "12px" }}
            title="Re-fetch latest models list from OpenRouter"
          >
            <RefreshCw size={12} className={isLoadingModels ? "spin" : ""} />
            <span>{isLoadingModels ? "Fetching..." : "Refresh Models"}</span>
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Active Model Selector with Hierarchical Dropdown */}
          <div
            style={{
              backgroundColor: "var(--bg-app)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
              Active Translation Model (Used by Live, Overlay, & Batch Translate)
            </span>

            {/* Hierarchical Combobox Component */}
            <ModelSelectorCombobox
              selectedModelId={selectedModelId}
              onSelectModel={(id) => {
                setSelectedModelId(id);
                localStorage.setItem("vn_selected_model", id);
              }}
            />
          </div>

          {/* Starred Favorites Grid Cards */}
          <div>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "8px" }}>
              Quick Starred Favorites ({starredModelsList.length} pinned):
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "10px" }}>
              {starredModelsList.map((m) => {
                const isSelected = m.id === selectedModelId;
                const pricing = formatModelPricing(m.pricing);
                return (
                  <div
                    key={m.id}
                    onClick={() => setSelectedModelId(m.id)}
                    style={{
                      backgroundColor: isSelected ? "rgba(78, 115, 223, 0.15)" : "var(--bg-app)",
                      border: isSelected ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 12px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 600, fontSize: "12.5px", color: "var(--text-primary)" }}>
                        {m.name}
                      </span>
                      <button
                        onClick={(e) => handleToggleStar(m.id, e)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--accent-gold)" }}
                        title="Remove from starred"
                      >
                        <Star size={14} fill="var(--accent-gold)" />
                      </button>
                    </div>

                    <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--accent-cyan)" }}>
                      {m.id}
                    </span>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "2px" }}>
                      {m.context_length > 0 && (
                        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                          {Math.round(m.context_length / 1000)}k ctx
                        </span>
                      )}
                      <div style={{ display: "flex", gap: "6px", fontSize: "11px" }}>
                        <span style={{ color: "var(--accent-cyan)", display: "flex", alignItems: "center", gap: "2px" }}>
                          <ArrowUp size={10} /> {pricing.inputPerMillion}/M
                        </span>
                        <span style={{ color: "var(--accent-gold)", display: "flex", alignItems: "center", gap: "2px" }}>
                          <ArrowDown size={10} /> {pricing.outputPerMillion}/M
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Temperature / Creativity Slider */}
          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Temperature / Creativity: <strong>{temperature}</strong>
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              style={{ width: "100%", marginTop: "4px" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5px", color: "var(--text-muted)", marginTop: "2px" }}>
              <span>0.0 (Strict & Literal VN Translation)</span>
              <span>1.0 (Creative & Natural Dialogue Flow)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. System Prompts Section (Dual Boxes) */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Sliders size={16} /> Translation System Prompts
            </span>
            <span className="card-subtitle">
              Configure specialized instructions for live streaming vs multi-line batch scripts
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {/* Box 1: Live / Individual Translation Prompt */}
          <div
            style={{
              backgroundColor: "var(--bg-app)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600, fontSize: "12.5px", color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Radio size={14} /> 1. Live & Individual Translation Prompt
              </span>
              <button
                onClick={() => setLivePrompt(DEFAULT_LIVE_SYSTEM_PROMPT)}
                className="btn-secondary"
                style={{ padding: "2px 6px", fontSize: "10.5px" }}
                title="Reset to default live prompt"
              >
                <RotateCcw size={10} />
                <span>Reset</span>
              </button>
            </div>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Applied during real-time hooked dialogues, manual inputs, and transparent in-game overlay mode.
            </span>
            <textarea
              rows={5}
              value={livePrompt}
              onChange={(e) => setLivePrompt(e.target.value)}
              style={{ width: "100%", fontSize: "12px", lineHeight: "1.5", resize: "vertical" }}
              placeholder="Enter system prompt for single-line live translation..."
            />
          </div>

          {/* Box 2: Batch Translation Prompt */}
          <div
            style={{
              backgroundColor: "var(--bg-app)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600, fontSize: "12.5px", color: "var(--accent-cyan)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Layers size={14} /> 2. Batch Script Translation Prompt
              </span>
              <button
                onClick={() => setBatchPrompt(DEFAULT_BATCH_SYSTEM_PROMPT)}
                className="btn-secondary"
                style={{ padding: "2px 6px", fontSize: "10.5px" }}
                title="Reset to default batch prompt"
              >
                <RotateCcw size={10} />
                <span>Reset</span>
              </button>
            </div>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Applied during multi-file script batch processing for JSON format adherence and context consistency.
            </span>
            <textarea
              rows={5}
              value={batchPrompt}
              onChange={(e) => setBatchPrompt(e.target.value)}
              style={{ width: "100%", fontSize: "12px", lineHeight: "1.5", resize: "vertical" }}
              placeholder="Enter system prompt for batch script translation..."
            />
          </div>
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
    </div>
  );
};
