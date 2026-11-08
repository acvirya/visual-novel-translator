import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useConfirmation } from "../common/ConfirmationProvider";
import { Modal } from "../common/Modal";
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
  Bot,
  Clock,
  MessageSquare,
  Coins,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { translationManager, LlmContextSettings } from "../../services/translationManager";
import { useUIStore } from "../../stores/useUIStore";
import { useTranslationStore } from "../../stores/useTranslationStore";
import {
  fetchModelEndpoints,
  getModelPricingSummary,
  getSelectedModelProviders,
  setSelectedModelProviders,
  OpenRouterEndpoint,
} from "../../services/openRouterService";

export const LiveTranslateView: React.FC = () => {
  const confirm = useConfirmation();
  const viewRef = useRef<HTMLDivElement>(null);
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
    setIsPaused,
    clearLiveLogs,
    resetSessionStats,
  } = useTranslationStore();

  useLayoutEffect(() => {
    // Rows are prepended. Disable browser anchoring and follow the newest row.
    const scrollContainer = viewRef.current?.closest("main");
    if (scrollContainer) scrollContainer.scrollTop = 0;
  }, [liveLogs[0]?.id]);

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
    setModelEndpoints([]);
    fetchModelEndpoints(selectedProvider).then((eps) => {
      if (!cancelled) setModelEndpoints(eps);
    }).catch(() => { if (!cancelled) setModelEndpoints([]); });
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
    setIsPaused(!isPaused);
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
    val = Math.min(500, val);
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
    confirm({ title: "Reset translation memory?", message: "Clear the conversation context used by the next translation?", confirmText: "Reset memory" }, () => translationManager.clearContextHistory());
  };

  const isLlmProvider = selectedProvider && !selectedProvider.startsWith("mt:");

  return (
    <div ref={viewRef} style={{ display: "flex", flexDirection: "column", width: "100%", gap: "12px", overflowAnchor: "none" }}>
      {/* ========================================================================= */}
      {/* 1. TOP CONTROL & TELEMETRY BAR (2-TIER ARCHITECTURE)                     */}
      {/* ========================================================================= */}
      <div
        className="card"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          margin: 0,
          padding: "10px 14px",
          flexShrink: 0,
        }}
      >
        {/* Tier 1: Primary Translation Actions & Model Configuration */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minWidth: 0 }}>
            {/* Auto Translate Toggle Button */}
            <button
              aria-pressed={!isPaused}
              onClick={handleTogglePause}
              className={!isPaused ? "btn-primary" : "btn-secondary"}
              style={{
                height: "32px",
                padding: "0 14px",
                fontWeight: 600,
                fontSize: "12px",
                gap: "6px",
              }}
            >
              {!isPaused ? <Pause size={13} /> : <Play size={13} />}
              <span>{!isPaused ? "Translating" : "Paused"}</span>
            </button>

            {/* Translation Model Selector with Integrated Hover Reasoning Submenu */}
            <ModelSelectorCombobox
              selectedModelId={selectedProvider}
              selectedReasoningEffort={reasoningEffort}
              onSelectModel={(id, eff) => {
                setSelectedProvider(id);
                setReasoningEffort(eff || "default");
              }}
              onSelectReasoningEffort={(eff) => setReasoningEffort(eff)}
              disabled={useScriptOnly}
              width="230px"
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
                width="190px"
                compact={true}
              />
            )}

            {/* Use Script Only Toggle Button */}
            <button
              type="button"
              aria-pressed={useScriptOnly}
              onClick={() => handleToggleScriptOnly(!useScriptOnly)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                height: "32px",
                padding: "0 10px",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${useScriptOnly ? "rgba(136, 189, 242, 0.5)" : "var(--border-subtle)"}`,
                backgroundColor: useScriptOnly ? "rgba(136, 189, 242, 0.14)" : "var(--bg-surface-elevated)",
                color: useScriptOnly ? "var(--accent-primary)" : "var(--text-secondary)",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title="When enabled, translation matches exclusively against the local script memory"
            >
              <Database size={13} color={useScriptOnly ? "var(--accent-primary)" : "var(--text-muted)"} />
              <span>Script Only</span>
            </button>
          </div>

          {/* Right actions: Line counter + Clear logs */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              <strong style={{ color: "var(--text-primary)" }}>{liveLogs.length}</strong> lines
            </span>

            <button
              onClick={() => confirm({ title: "Clear live translation logs?", message: "Remove all displayed dialogue logs?", confirmText: "Clear logs" }, clearLiveLogs)}
              disabled={liveLogs.length === 0}
              className="btn-secondary"
              style={{ height: "28px", padding: "0 8px", fontSize: "11px" }}
              title="Clear dialogue stream logs"
            >
              <Trash2 size={12} />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Tier 2: Telemetry, Pricing & Context Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "8px",
            paddingTop: "6px",
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          {/* Telemetry metrics pills */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            {/* Session Tokens Badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "var(--bg-panel)",
                padding: "3px 9px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-subtle)",
                fontSize: "11px",
              }}
            >
              <Activity size={12} color="var(--accent-primary)" />
              <span style={{ color: "var(--text-muted)" }}>Session:</span>
              <span><strong style={{ color: "var(--accent-secondary)" }}>{sessionStats.promptTokens.toLocaleString()}</strong> in</span>
              <span style={{ color: "var(--border-subtle)" }}>•</span>
              <span><strong style={{ color: "var(--accent-gold)" }}>{sessionStats.completionTokens.toLocaleString()}</strong> out</span>
              <span style={{ color: "var(--border-subtle)" }}>•</span>
              <span>Cost: <strong style={{ color: "var(--accent-success)" }}>${sessionStats.totalCost < 0.01 && sessionStats.totalCost > 0 ? sessionStats.totalCost.toFixed(5) : sessionStats.totalCost.toFixed(4)}</strong></span>
              {sessionStats.totalCost > 0 && (
                <button
                  type="button"
                  onClick={() => confirm({ title: "Reset session statistics?", message: "Clear token and cost counters?", confirmText: "Reset" }, resetSessionStats)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "0 2px",
                    color: "var(--text-muted)",
                    display: "inline-flex",
                  }}
                  title="Reset session tokens & cost"
                >
                  <RotateCcw size={10} />
                </button>
              )}
            </div>

            {/* Model Pricing Badge */}
            {isLlmProvider && !useScriptOnly && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "var(--bg-panel)",
                  padding: "3px 9px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "11px",
                }}
                title="Model pricing per 1M tokens based on selected endpoints"
              >
                <Coins size={12} color="var(--accent-gold)" />
                <span style={{ color: "var(--text-muted)" }}>1M:</span>
                <span>In <strong style={{ color: "var(--accent-secondary)" }}>{pricingSummary.input}</strong></span>
                <span style={{ color: "var(--border-subtle)" }}>•</span>
                <span>Out <strong style={{ color: "var(--accent-gold)" }}>{pricingSummary.output}</strong></span>
              </div>
            )}
          </div>

          {/* Memory Context Button */}
          {!useScriptOnly && isLlmProvider && (
            <button
              type="button"
              onClick={() => setShowContextModal(true)}
              className="btn-secondary"
              style={{
                height: "26px",
                padding: "0 9px",
                fontSize: "11px",
                gap: "5px",
                color: "var(--accent-secondary)",
                borderColor: "rgba(189, 221, 252, 0.25)",
              }}
              title="Configure LLM Context Window & Memory Retention"
            >
              <History size={12} />
              <span>Memory: <strong>{contextHistoryLength}</strong>/<strong>{contextSettings.maxContextLines}</strong></span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. LLM CONTEXT CONFIGURATION FLOATING MODAL                              */}
      {/* ========================================================================= */}
      <Modal
        isOpen={showContextModal}
        onClose={() => setShowContextModal(false)}
        title="LLM Context Window & Memory Retention"
        subtitle="Manage dialogue turns preserved for story context and coherence"
        icon={<History size={16} color="var(--accent-primary)" />}
        maxWidth="500px"
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
            <button
              type="button"
              onClick={handleResetContextHistory}
              className="btn-danger"
              style={{ fontSize: "11.5px", height: "30px" }}
              title="Wipe active memory context for the next dialogue line"
            >
              <RotateCcw size={12} />
              <span>Reset Memory</span>
            </button>
            <button
              type="button"
              onClick={() => setShowContextModal(false)}
              className="btn-primary"
              style={{ fontSize: "11.5px", height: "30px", padding: "0 16px" }}
            >
              <Check size={12} /> Done
            </button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label htmlFor="live-max-context" style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
              Max Context Lines (History Limit):
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                id="live-max-context"
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

          <div>
            <label htmlFor="live-retain-context" style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
              Retained Lines After Cut (Sliding Buffer):
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                id="live-retain-context"
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

          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "var(--text-muted)", paddingTop: "4px" }}>
            <span>Active Context Buffer:</span>
            <strong style={{ color: "var(--text-primary)" }}>{contextHistoryLength} / {contextSettings.maxContextLines} lines</strong>
          </div>
        </div>
      </Modal>

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
              Ready for game dialogue
            </div>
            <div className="empty-state-desc">
              Connect Textractor or configure screen capture in <strong>Capture setup</strong>. New dialogue and its translation will appear here as you play.
            </div>
            <button className="btn-secondary" onClick={() => useUIStore.getState().setLiveGameStage("input")}>Set up dialogue capture</button>
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
                  padding: "10px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
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
                          backgroundColor: "var(--accent-success-subtle)",
                          color: "var(--accent-success)",
                          border: "1px solid rgba(94, 234, 212, 0.25)",
                          padding: "2px 7px",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "11px",
                          fontWeight: 700,
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
                          padding: "2px 7px",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "11px",
                          fontWeight: 500,
                        }}
                      >
                        <Bot size={11} color="var(--accent-primary)" />
                        <span>{item.provider || "AI Model"}</span>
                      </span>
                    )}

                    {/* Error Badge if translation failed */}
                    {item.isError && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          backgroundColor: "var(--accent-danger-subtle)",
                          color: "var(--accent-danger)",
                          border: "1px solid rgba(255, 112, 112, 0.35)",
                          padding: "2px 7px",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "11px",
                          fontWeight: 600,
                        }}
                        title={item.errorMessage || "Translation failed"}
                      >
                        <AlertTriangle size={11} />
                        <span>Failed: {item.errorMessage ? (item.errorMessage.length > 55 ? item.errorMessage.slice(0, 52) + "..." : item.errorMessage) : "Error"}</span>
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
                    backgroundColor: "rgba(0, 0, 0, 0.3)",
                    borderLeft: "2px solid var(--border-active)",
                    borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                    padding: "6px 12px",
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
                    <span style={{ color: "var(--accent-coral)", fontWeight: 700, whiteSpace: "nowrap" }}>
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
                    backgroundColor: item.isError ? "var(--accent-danger-subtle)" : "var(--bg-surface-elevated)",
                    borderLeft: `3px solid ${item.isError ? "var(--accent-danger)" : "var(--accent-primary)"}`,
                    borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                    padding: "8px 12px",
                    display: "flex",
                    alignItems: "baseline",
                    gap: "8px",
                    fontSize: "14px",
                    lineHeight: 1.5,
                    overflowWrap: "anywhere",
                  }}
                >
                  {transSpeaker && (
                    <span style={{ color: "var(--accent-coral)", fontWeight: 700, whiteSpace: "nowrap" }}>
                      【{transSpeaker}】
                    </span>
                  )}
                  <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
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
