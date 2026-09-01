import React, { useState, useEffect, useMemo } from "react";
import { ModelSelectorCombobox } from "../common/ModelSelectorCombobox";
import { ProviderSelectorMultiSelect } from "../common/ProviderSelectorMultiSelect";
import {
  Play,
  Pause,
  Trash2,
  Database,
  History,
  RotateCcw,
  Check,
  X,
  Bot,
  Clock,
  MessageSquare,
  Coins,
  Activity,
} from "lucide-react";
import { translationManager, LlmContextSettings } from "../../services/translationManager";
import { useTranslationStore } from "../../stores/useTranslationStore";
import {
  fetchModelEndpoints,
  getModelPricingSummary,
  getSelectedModelProviders,
  setSelectedModelProviders,
  OpenRouterEndpoint,
} from "../../services/openRouterService";

export const LiveTranslateView: React.FC = () => {
  const {
    liveLogs,
    isPaused,
    selectedProvider,
    reasoningEffort,
    useScriptOnly,
    contextSettings,
    contextHistoryLength,
    sessionStats,
    setSelectedProvider,
    setReasoningEffort,
    setUseScriptOnly,
    clearLiveLogs,
    resetSessionStats,
  } = useTranslationStore();

  const [showContextModal, setShowContextModal] = useState<boolean>(false);
  const [maxContextInput, setMaxContextInput] = useState<string>(() => String(contextSettings.maxContextLines));
  const [retainContextInput, setRetainContextInput] = useState<string>(() => String(contextSettings.retainContextLines));
  const [modelEndpoints, setModelEndpoints] = useState<OpenRouterEndpoint[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>(() => {
    return getSelectedModelProviders(selectedProvider);
  });

  // Sync selected providers when model changes
  useEffect(() => {
    setSelectedProviders(getSelectedModelProviders(selectedProvider));
  }, [selectedProvider]);

  // Fetch model endpoints for accurate pricing calculation
  useEffect(() => {
    if (!selectedProvider || selectedProvider.startsWith("mt:")) {
      setModelEndpoints([]);
      return;
    }
    let cancelled = false;
    fetchModelEndpoints(selectedProvider).then((eps) => {
      if (!cancelled) setModelEndpoints(eps);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedProvider]);

  const pricingSummary = useMemo(() => {
    return getModelPricingSummary(selectedProvider, selectedProviders, undefined, modelEndpoints);
  }, [selectedProvider, selectedProviders, modelEndpoints]);

  // Synchronize local input fields when external context settings change
  useEffect(() => {
    setMaxContextInput(String(contextSettings.maxContextLines));
    setRetainContextInput(String(contextSettings.retainContextLines));
  }, [contextSettings.maxContextLines, contextSettings.retainContextLines]);

  const handleTogglePause = () => {
    translationManager.setPaused(!isPaused);
  };

  const handleToggleScriptOnly = (enabled: boolean) => {
    setUseScriptOnly(enabled);
    translationManager.setUseScriptOnly(enabled);
  };

  const handleSaveContextSettings = (newSettings: LlmContextSettings) => {
    translationManager.setContextSettings(newSettings);
  };

  const handleMaxContextBlur = () => {
    let val = parseInt(maxContextInput, 10);
    if (isNaN(val) || val < 0) val = 0;
    setMaxContextInput(String(val));
    const newRetain = Math.min(contextSettings.retainContextLines, val);
    setRetainContextInput(String(newRetain));
    handleSaveContextSettings({
      ...contextSettings,
      maxContextLines: val,
      retainContextLines: newRetain,
    });
  };

  const handleRetainContextBlur = () => {
    let val = parseInt(retainContextInput, 10);
    if (isNaN(val) || val < 0) val = 0;
    const clamped = Math.min(val, contextSettings.maxContextLines);
    setRetainContextInput(String(clamped));
    handleSaveContextSettings({
      ...contextSettings,
      retainContextLines: clamped,
    });
  };

  const handleResetContextHistory = () => {
    translationManager.clearContextHistory();
  };

  const isLlmProvider = selectedProvider && !selectedProvider.startsWith("mt:");

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: "12px" }}>
      {/* ========================================================================= */}
      {/* 1. TOP CONTROL & PROVIDER BAR                                            */}
      {/* ========================================================================= */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "8px 14px",
          flexWrap: "wrap",
          gap: "10px",
          flexShrink: 0,
        }}
      >
        {/* Left Side: Auto Translate Action + Model Picker + Script Only Toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {/* Auto Translate Toggle Button */}
          <button
            onClick={handleTogglePause}
            className={!isPaused ? "btn-primary" : "btn-secondary"}
            style={{
              backgroundColor: !isPaused ? "var(--accent-success)" : "var(--bg-surface-elevated)",
              padding: "6px 14px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
            }}
          >
            {!isPaused ? <Pause size={13} /> : <Play size={13} />}
            <span>{!isPaused ? "Auto-Translate: Active" : "Stream Paused"}</span>
          </button>

          {/* Translation Model Selector with Integrated Hover Reasoning Submenu */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <ModelSelectorCombobox
              selectedModelId={selectedProvider}
              selectedReasoningEffort={reasoningEffort}
              onSelectModel={(id, eff) => {
                setSelectedProvider(id);
                setReasoningEffort(eff || "default");
              }}
              onSelectReasoningEffort={(eff) => setReasoningEffort(eff)}
              disabled={useScriptOnly}
              width="240px"
              compact={true}
            />
            {isLlmProvider && !useScriptOnly && (
              <ProviderSelectorMultiSelect
                modelId={selectedProvider}
                selectedProviders={selectedProviders}
                onChangeProviders={(newProviders) => {
                  setSelectedModelProviders(selectedProvider, newProviders);
                  setSelectedProviders(newProviders);
                }}
                width="200px"
                compact={true}
              />
            )}
          </div>

          {/* Use Script Only Toggle Button */}
          <button
            type="button"
            onClick={() => handleToggleScriptOnly(!useScriptOnly)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "6px 10px",
              borderRadius: "var(--radius-sm)",
              border: `1px solid ${useScriptOnly ? "rgba(56, 189, 248, 0.5)" : "var(--border-subtle)"}`,
              backgroundColor: useScriptOnly ? "rgba(56, 189, 248, 0.12)" : "var(--bg-surface-elevated)",
              color: useScriptOnly ? "var(--accent-cyan)" : "var(--text-secondary)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            title="When enabled, translation matches exclusively against the Knowledge Base script database"
          >
            <Database size={13} color={useScriptOnly ? "var(--accent-cyan)" : "var(--text-muted)"} />
            <span>Script Only</span>
          </button>
        </div>

        {/* Right Side: Model Pricing & Session Tokens Badges + LLM Context + Clear */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {/* Model Pricing Badge (Input / Output / Cache per 1M tokens) */}
          {isLlmProvider && !useScriptOnly && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "var(--bg-app)",
                padding: "4px 10px",
                borderRadius: "20px",
                border: "1px solid var(--border-subtle)",
                fontSize: "11px",
                flexWrap: "wrap",
              }}
              title="Model Pricing per 1 Million tokens (Input, Output, and Prompt Cache) based on selected endpoints"
            >
              <span style={{ color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
                <Coins size={12} color="var(--accent-primary)" /> Pricing / 1M:
              </span>
              <span>In: <strong style={{ color: "var(--accent-cyan)" }}>{pricingSummary.input}</strong></span>
              <span style={{ color: "var(--border-subtle)" }}>•</span>
              <span>Out: <strong style={{ color: "var(--accent-gold)" }}>{pricingSummary.output}</strong></span>
              <span style={{ color: "var(--border-subtle)" }}>•</span>
              <span>Cache: <strong style={{ color: "var(--accent-success)" }}>{pricingSummary.cache}</strong></span>
            </div>
          )}

          {/* Session Usage Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "var(--bg-app)",
              padding: "4px 10px",
              borderRadius: "20px",
              border: "1px solid var(--border-subtle)",
              fontSize: "11px",
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
              <Activity size={12} color="var(--accent-primary)" /> Session Tokens:
            </span>
            <span>In: <strong style={{ color: "var(--accent-cyan)" }}>{sessionStats.promptTokens.toLocaleString()}</strong></span>
            <span style={{ color: "var(--border-subtle)" }}>•</span>
            <span>Out: <strong style={{ color: "var(--accent-gold)" }}>{sessionStats.completionTokens.toLocaleString()}</strong></span>
            <span style={{ color: "var(--border-subtle)" }}>•</span>
            <span>Cached: <strong style={{ color: "var(--accent-success)" }}>{sessionStats.cachedTokens.toLocaleString()}</strong></span>
            <span style={{ color: "var(--border-subtle)" }}>•</span>
            <span>Cost: <strong style={{ color: "#38ef7d" }}>${sessionStats.totalCost < 0.01 && sessionStats.totalCost > 0 ? sessionStats.totalCost.toFixed(5) : sessionStats.totalCost.toFixed(4)}</strong></span>
            {sessionStats.totalCost > 0 && (
              <button
                type="button"
                onClick={resetSessionStats}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "1px",
                  color: "var(--text-muted)",
                  display: "inline-flex",
                  alignItems: "center",
                }}
                title="Reset session tokens & cost"
              >
                <RotateCcw size={10} />
              </button>
            )}
          </div>

          {/* LLM Context Settings Button */}
          {!useScriptOnly && isLlmProvider && (
            <button
              type="button"
              onClick={() => setShowContextModal(!showContextModal)}
              className="btn-secondary"
              style={{
                padding: "6px 10px",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
                color: "var(--accent-cyan)",
                borderColor: "rgba(56, 189, 248, 0.35)",
                backgroundColor: showContextModal ? "var(--bg-surface-elevated)" : undefined,
              }}
              title="Configure LLM Context Window & Memory Retention"
            >
              <History size={13} />
              <span>
                Memory: <strong>{contextHistoryLength}</strong>/<strong>{contextSettings.maxContextLines}</strong>
              </span>
            </button>
          )}

          {/* Line Counter & Clear Button */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "4px" }}>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", padding: "0 4px" }}>
              <strong>{liveLogs.length}</strong> lines
            </span>

            <button
              onClick={clearLiveLogs}
              disabled={liveLogs.length === 0}
              className="btn-secondary"
              style={{ height: "30px", padding: "0 8px", fontSize: "11.5px" }}
              title="Clear dialogue stream logs"
            >
              <Trash2 size={12} />
              <span>Clear</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. LLM CONTEXT CONFIGURATION MODAL / CARD                                 */}
      {/* ========================================================================= */}
      {showContextModal && (
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-active)",
            borderRadius: "var(--radius-md)",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <History size={15} style={{ color: "var(--accent-cyan)" }} />
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                LLM Context Window & Memory Retention
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowContextModal(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px" }}
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
            {/* Max Context Lines Input */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                Max Context Lines (History Limit):
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={maxContextInput}
                  onChange={(e) => setMaxContextInput(e.target.value)}
                  onBlur={handleMaxContextBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleMaxContextBlur();
                  }}
                  style={{ width: "100%", fontSize: "12.5px", height: "32px", padding: "0 10px" }}
                />
                <span style={{ fontSize: "12px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>lines</span>
              </div>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "4px" }}>
                Maximum dialogue turns sent to LLM for story continuity (0 = disabled).
              </span>
            </div>

            {/* Retain Context Lines Input */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                Retained Lines After Cut (Sliding Buffer):
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="number"
                  min={0}
                  max={contextSettings.maxContextLines}
                  value={retainContextInput}
                  onChange={(e) => setRetainContextInput(e.target.value)}
                  onBlur={handleRetainContextBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRetainContextBlur();
                  }}
                  style={{ width: "100%", fontSize: "12.5px", height: "32px", padding: "0 10px" }}
                />
                <span style={{ fontSize: "12px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>lines</span>
              </div>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "4px" }}>
                Number of most recent lines kept as baseline context when history limit is reached.
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--border-subtle)", paddingTop: "10px", marginTop: "2px" }}>
            <div style={{ fontSize: "11.5px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>Active Context Buffer:</span>
              <strong style={{ color: "var(--text-primary)" }}>{contextHistoryLength} / {contextSettings.maxContextLines} lines</strong>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={handleResetContextHistory}
                className="btn-secondary"
                style={{ padding: "4px 10px", fontSize: "11.5px", color: "var(--accent-danger)" }}
                title="Wipe active memory context for the next dialogue line"
              >
                <RotateCcw size={12} />
                <span>Reset Memory</span>
              </button>
              <button
                type="button"
                onClick={() => setShowContextModal(false)}
                className="btn-primary"
                style={{ padding: "4px 12px", fontSize: "11.5px" }}
              >
                <Check size={12} /> Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. LIVE STREAM DIALOGUE BACKLOG (Visual Novel Style)                      */}
      {/* ========================================================================= */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          width: "100%",
        }}
      >
        {liveLogs.length === 0 ? (
          <div className="empty-state-container" style={{ flex: 1, minHeight: "280px", height: "100%", margin: 0, width: "100%", boxSizing: "border-box" }}>
            <div className="empty-state-icon">
              <MessageSquare size={22} color="var(--accent-primary)" />
            </div>
            <div className="empty-state-title">
              Waiting for dialogue stream...
            </div>
            <div className="empty-state-desc">
              Make sure Textractor Hook or Screen OCR is attached in <strong>1. Input Setup</strong>, then advance dialogue in your visual novel.
            </div>
          </div>
        ) : (
          liveLogs.map((item) => {
            const rawSpeaker = item.name?.source;
            const transSpeaker = item.name?.translated;
            const rawMessage = item.message?.source || "";
            const transMessage = item.message?.translated || "";

            return (
              <div
                key={item.id}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  transition: "border-color 0.15s ease",
                }}
              >
                {/* Header Row: Provider / Script Badge & Timestamp */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {/* Provider or Script Badge */}
                    {item.matchedFromScript ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          backgroundColor: "rgba(63, 185, 80, 0.12)",
                          color: "var(--accent-success)",
                          border: "1px solid rgba(63, 185, 80, 0.3)",
                          padding: "2px 8px",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "11px",
                          fontWeight: 700,
                          letterSpacing: "0.2px",
                        }}
                      >
                        <Database size={11} />
                        <span>Script Match {item.similarityScore ? `(${(item.similarityScore * 100).toFixed(0)}%)` : ""}</span>
                      </span>
                    ) : (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          backgroundColor: "var(--bg-surface-elevated)",
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border-subtle)",
                          padding: "2px 8px",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "11px",
                          fontWeight: 600,
                        }}
                      >
                        <Bot size={11} color="var(--accent-primary)" />
                        <span>{item.provider || "AI Model"}</span>
                      </span>
                    )}

                    {item.durationMs > 0 && (
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {item.durationMs}ms
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Clock size={11} />
                    <span>{item.timestamp}</span>
                  </div>
                </div>

                {/* Original Japanese Dialogue Block */}
                <div
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.2)",
                    borderLeft: "3px solid var(--border-active)",
                    borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                    padding: "8px 12px",
                    display: "flex",
                    alignItems: "baseline",
                    gap: "8px",
                    fontFamily: "var(--font-jp)",
                    fontSize: "13.5px",
                    lineHeight: 1.55,
                    overflowWrap: "anywhere",
                  }}
                >
                  {rawSpeaker && (
                    <span style={{ color: "var(--accent-gold)", fontWeight: 700, whiteSpace: "nowrap" }}>
                      【{rawSpeaker}】
                    </span>
                  )}
                  <span style={{ color: "var(--text-jp)" }}>
                    {typeof rawMessage === "string" ? rawMessage : ""}
                  </span>
                </div>

                {/* Translated Dialogue Block */}
                <div
                  style={{
                    backgroundColor: "var(--bg-surface-elevated)",
                    borderLeft: "3px solid var(--accent-primary)",
                    borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "baseline",
                    gap: "8px",
                    fontSize: "14px",
                    lineHeight: 1.5,
                    overflowWrap: "anywhere",
                  }}
                >
                  {transSpeaker && (
                    <span style={{ color: "var(--accent-gold)", fontWeight: 700, whiteSpace: "nowrap" }}>
                      【{transSpeaker}】
                    </span>
                  )}
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                    {typeof transMessage === "string" ? transMessage : ""}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
