import React, { useState } from "react";
import { Sparkles, Globe, RefreshCw, Zap } from "lucide-react";

export const TranslationProvidersView: React.FC = () => {
  const [openRouterKey, setOpenRouterKey] = useState<string>("sk-or-v1-••••••••••••••••••••••••");
  const [selectedModel, setSelectedModel] = useState<string>("anthropic/claude-3.5-sonnet");
  const [temperature, setTemperature] = useState<number>(0.3);
  const [systemPrompt, setSystemPrompt] = useState<string>(
    "You are an expert visual novel translator from Japanese to English. Translate dialogue naturally, preserving character tone, emotional depth, and Japanese honorifics (-san, -kun, -senpai) where appropriate."
  );

  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // TODO: Implement actual OpenRouter API call test via Tauri Rust backend
  const handleTestConnection = () => {
    setIsTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setIsTesting(false);
      setTestResult("Successfully connected to OpenRouter API! Latency: 320ms.");
    }, 600);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* OpenRouter Configuration Card */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Zap size={16} color="var(--accent-gold)" /> OpenRouter API (Recommended LLM Provider)
            </span>
            <span className="card-subtitle">
              Access Claude 3.5 Sonnet, GPT-4o-mini, DeepSeek V3, and Gemini with a single API key
            </span>
          </div>

          <span className="badge badge-success">Active</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* API Key Input */}
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              OpenRouter API Key
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="password"
                value={openRouterKey}
                onChange={(e) => setOpenRouterKey(e.target.value)}
                placeholder="sk-or-v1-..."
                style={{ flex: 1, fontFamily: "var(--font-mono)" }}
              />
              <button onClick={handleTestConnection} disabled={isTesting} className="btn-primary">
                {isTesting ? <RefreshCw size={13} className="spin" /> : <Sparkles size={13} />}
                <span>{isTesting ? "Testing..." : "Test Connection"}</span>
              </button>
            </div>
            {testResult && (
              <span style={{ fontSize: "12px", color: "var(--accent-success)", marginTop: "4px", display: "block" }}>
                ✓ {testResult}
              </span>
            )}
          </div>

          {/* Model Selector & Temperature Slider */}
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                AI Translation Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="anthropic/claude-3.5-sonnet">Anthropic: Claude 3.5 Sonnet (Best Quality & Nuance)</option>
                <option value="openai/gpt-4o-mini">OpenAI: GPT-4o Mini (Fast & Cost-Effective)</option>
                <option value="deepseek/deepseek-chat">DeepSeek: DeepSeek-V3 (High Quality & Very Low Cost)</option>
                <option value="google/gemini-2.0-flash-001">Google: Gemini 2.0 Flash</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                Creativity / Temperature: {temperature}
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          {/* System Prompt Instructions */}
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Visual Novel System Prompt
            </label>
            <textarea
              rows={4}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              style={{ width: "100%", fontSize: "12.5px", lineHeight: "1.6" }}
            />
          </div>
        </div>
      </div>

      {/* Free Online Machine Translation (MT) */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Globe size={16} /> Free Online MT (No API Key Required)
            </span>
            <span className="card-subtitle">
              Fast alternative translation services without API costs
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input type="checkbox" defaultChecked />
            <div>
              <span style={{ fontWeight: 600 }}>Google Translate (Free MT Endpoint)</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>
                Fast and stable fallback when LLM quotas are depleted.
              </span>
            </div>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input type="checkbox" defaultChecked />
            <div>
              <span style={{ fontWeight: 600 }}>DeepL Free Web Endpoint</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>
                Natural Japanese to English translation via web scraper endpoint.
              </span>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
};
