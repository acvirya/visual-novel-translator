import React, { useState } from "react";
import { ModelSelectorCombobox } from "../common/ModelSelectorCombobox";
import {
  Play,
  Pause,
  Trash2,
  Database,
  RefreshCw,
  ShieldCheck,
  History,
  RotateCcw,
  Check,
  X,
  Sliders,
} from "lucide-react";
import { translationManager, LlmContextSettings } from "../../services/translationManager";
import { useTranslationStore } from "../../stores/useTranslationStore";

export const LiveTranslateView: React.FC = () => {
  const {
    liveLogs,
    isPaused,
    selectedProvider,
    useScriptOnly,
    scriptThreshold,
    contextSettings,
    contextHistoryLength,
    setSelectedProvider,
    setUseScriptOnly,
    setScriptThreshold,
    clearLiveLogs,
  } = useTranslationStore();

  const [showContextModal, setShowContextModal] = useState<boolean>(false);

  const handleTogglePause = () => {
    translationManager.setPaused(!isPaused);
  };

  const handleToggleScriptOnly = (enabled: boolean) => {
    setUseScriptOnly(enabled);
    translationManager.setUseScriptOnly(enabled);
  };

  const handleThresholdChange = (val: number) => {
    setScriptThreshold(val);
  };

  const handleSaveContextSettings = (newSettings: LlmContextSettings) => {
    translationManager.setContextSettings(newSettings);
  };

  const handleResetContextHistory = () => {
    translationManager.clearContextHistory();
  };

  const isLlmProvider = !selectedProvider.startsWith("mt:");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", gap: "14px" }}>
      {/* Top Action & Provider Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "10px 16px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        {/* Left Side: Auto Translate + Provider Selector + Context Config + Script Only Toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Auto Translate Toggle Button */}
          <button
            onClick={handleTogglePause}
            className={!isPaused ? "btn-primary" : "btn-secondary"}
            style={{
              backgroundColor: !isPaused ? "var(--accent-success)" : "var(--bg-surface-elevated)",
              padding: "7px 14px",
            }}
          >
            {!isPaused ? <Pause size={14} /> : <Play size={14} />}
            <span>{!isPaused ? "Auto-Translate: Active" : "Stream Paused"}</span>
          </button>

          {/* Translation Model Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <ModelSelectorCombobox
              selectedModelId={selectedProvider}
              onSelectModel={(id) => {
                setSelectedProvider(id);
              }}
              disabled={useScriptOnly}
              width="260px"
              compact={true}
            />
          </div>

          {/* LLM Context Settings Button (Highlighted when LLM is active) */}
          <button
            type="button"
            onClick={() => setShowContextModal(!showContextModal)}
            className="btn-secondary"
            style={{
              padding: "6px 10px",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: isLlmProvider ? "var(--accent-cyan)" : "var(--text-secondary)",
              borderColor: isLlmProvider ? "rgba(56, 189, 248, 0.4)" : "var(--border-subtle)",
              backgroundColor: showContextModal ? "var(--bg-surface-elevated)" : undefined,
            }}
            title="Configure LLM Context Window & Memory Retention"
          >
            <History size={13} style={{ color: isLlmProvider ? "var(--accent-cyan)" : "var(--text-muted)" }} />
            <span>
              Context: <strong>{contextSettings.maxContextLines}</strong> / <strong>{contextSettings.retainContextLines}</strong>
            </span>
          </button>

          {/* Use Script Only Toggle */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
              fontSize: "12.5px",
              fontWeight: 600,
              color: useScriptOnly ? "var(--accent-cyan)" : "var(--text-secondary)",
              backgroundColor: useScriptOnly ? "rgba(56, 189, 248, 0.12)" : "var(--bg-surface-elevated)",
              padding: "5px 10px",
              borderRadius: "var(--radius-sm)",
              border: useScriptOnly ? "1px solid rgba(56, 189, 248, 0.4)" : "1px solid var(--border-subtle)",
              transition: "all 0.15s ease",
            }}
            title="When enabled, translation relies exclusively on the pre-translated .jsonl script database"
          >
            <input
              type="checkbox"
              checked={useScriptOnly}
              onChange={(e) => handleToggleScriptOnly(e.target.checked)}
            />
            <ShieldCheck size={13} style={{ color: useScriptOnly ? "var(--accent-cyan)" : "var(--text-muted)" }} />
            <span>Use Script Only</span>
          </label>

          {/* Script Match Threshold Slider */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              fontWeight: 600,
              backgroundColor: "var(--bg-surface-elevated)",
              padding: "4px 8px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
            }}
            title="Similarity threshold required to trigger an offline script match (50% - 100%)"
          >
            <Sliders size={12} style={{ color: "var(--accent-gold)" }} />
            <span style={{ color: "var(--text-secondary)", fontSize: "11.5px" }}>Match:</span>
            <input
              type="range"
              min="0.50"
              max="1.00"
              step="0.05"
              value={scriptThreshold ?? 0.85}
              onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
              style={{ width: "65px", cursor: "pointer" }}
            />
            <span style={{ color: "var(--accent-gold)", minWidth: "30px", textAlign: "right", fontSize: "11.5px" }}>
              {Math.round((scriptThreshold ?? 0.85) * 100)}%
            </span>
          </div>
        </div>

        {/* Right Side: Total Counter & Clear Button */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Lines: <strong style={{ color: "var(--text-primary)" }}>{liveLogs.length}</strong>
          </span>

          <button onClick={clearLiveLogs} className="btn-secondary" title="Clear log stream">
            <Trash2 size={13} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Context Settings Popover / Card */}
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
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {/* Max Context Lines Slider */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Max Context Lines (History Limit):
                </label>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--accent-cyan)" }}>
                  {contextSettings.maxContextLines} lines
                </span>
              </div>
              <input
                type="range"
                min={2}
                max={30}
                step={1}
                value={contextSettings.maxContextLines}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  handleSaveContextSettings({
                    ...contextSettings,
                    maxContextLines: val,
                    retainContextLines: Math.min(contextSettings.retainContextLines, val),
                  });
                }}
                style={{ width: "100%", accentColor: "var(--accent-cyan)" }}
              />
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                Maximum number of previous dialogue turns sent to OpenRouter LLM for story continuity.
              </span>
            </div>

            {/* Retain Context Lines Slider */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Retained Lines After Cut (Sliding Buffer):
                </label>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--accent-gold)" }}>
                  {contextSettings.retainContextLines} lines
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={Math.min(15, contextSettings.maxContextLines)}
                step={1}
                value={contextSettings.retainContextLines}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  handleSaveContextSettings({
                    ...contextSettings,
                    retainContextLines: val,
                  });
                }}
                style={{ width: "100%", accentColor: "var(--accent-gold)" }}
              />
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                When history reaches max limit, this number of most recent dialogue lines are retained as the new baseline context.
              </span>
            </div>
          </div>

          {/* Max Characters per Line Filter */}
          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                Max Characters per Line (Skip/Burst Discard Filter):
              </label>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--accent-cyan)" }}>
                {contextSettings.maxCharsPerLine > 0 ? `${contextSettings.maxCharsPerLine} chars` : "Disabled"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input
                type="range"
                min={50}
                max={1000}
                step={25}
                value={contextSettings.maxCharsPerLine}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  handleSaveContextSettings({
                    ...contextSettings,
                    maxCharsPerLine: val,
                  });
                }}
                style={{ flex: 1, accentColor: "var(--accent-cyan)" }}
              />
              <input
                type="number"
                min={0}
                max={5000}
                className="input-field"
                value={contextSettings.maxCharsPerLine}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 0;
                  handleSaveContextSettings({
                    ...contextSettings,
                    maxCharsPerLine: val,
                  });
                }}
                style={{ width: "80px", fontSize: "12px", padding: "3px 6px", textAlign: "center" }}
              />
            </div>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
              Automatically discards huge clumped text bursts caused by holding the Fast-Forward/Skip button in game (prevents API lag & token waste).
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--border-subtle)", paddingTop: "10px", marginTop: "4px" }}>
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
                <span>Reset Context Buffer</span>
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

      {/* Live Stream Dialogue List */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          paddingRight: "4px",
        }}
      >
        {liveLogs.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-muted)",
              gap: "8px",
            }}
          >
            <RefreshCw size={28} style={{ opacity: 0.5 }} />
            <span>No dialogue logs yet. Waiting for input from Textractor / OCR...</span>
          </div>
        ) : (
          liveLogs.map((item) => (
            <div
              key={item.id}
              style={{
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {/* Header Row: [PROVIDER NAME] OR [SCRIPT MATCH %] + Timings */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {/* Provider Name Badge (Only when translated via provider) */}
                  {!item.matchedFromScript && item.provider && (
                    <span
                      className="badge badge-neutral"
                      style={{
                        backgroundColor: "var(--bg-surface-elevated)",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border-active)",
                        padding: "2px 8px",
                        borderRadius: "var(--radius-sm)",
                        fontWeight: 700,
                        fontSize: "11px",
                        letterSpacing: "0.3px",
                        textTransform: "uppercase",
                      }}
                    >
                      {item.provider}
                    </span>
                  )}

                  {/* Script Match % Badge (Only when matched from script) */}
                  {item.matchedFromScript && (
                    <span
                      className="badge badge-success"
                      style={{
                        padding: "2px 8px",
                        borderRadius: "var(--radius-sm)",
                        fontWeight: 700,
                        fontSize: "11px",
                        letterSpacing: "0.3px",
                        textTransform: "uppercase",
                      }}
                      title="Matched from pre-translated script database"
                    >
                      <Database size={11} />
                      <span>Script Match {item.similarityScore ? `(${(item.similarityScore * 100).toFixed(0)}%)` : ""}</span>
                    </span>
                  )}
                </div>

                <div style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>{item.durationMs}ms</span>
                  <span>•</span>
                  <span>{item.timestamp}</span>
                </div>
              </div>

              {/* Character Name Section (if present) */}
              {item.name && (
                <div
                  style={{
                    backgroundColor: "var(--bg-app)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    padding: "6px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      letterSpacing: "0.5px",
                    }}
                  >
                    [name]
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-jp)",
                      fontSize: "13px",
                      color: "var(--accent-gold)",
                      fontWeight: 600,
                    }}
                  >
                    {item.name.source}
                  </div>
                  <div
                    style={{
                      fontSize: "12.5px",
                      color: "var(--text-primary)",
                      fontWeight: 500,
                    }}
                  >
                    {item.name.translated}
                  </div>
                </div>
              )}

              {/* Message Section */}
              <div
                style={{
                  backgroundColor: "var(--bg-app)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "8px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                    letterSpacing: "0.5px",
                  }}
                >
                  [message]
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-jp)",
                    fontSize: "14px",
                    color: "var(--text-jp)",
                    lineHeight: 1.6,
                  }}
                >
                  {item.message.source}
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "var(--text-primary)",
                    fontWeight: 500,
                    lineHeight: 1.5,
                  }}
                >
                  {item.message.translated}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
