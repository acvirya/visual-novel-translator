import React, { useState } from "react";
import { TranslationLogItem } from "../../types";
import {
  Play,
  Pause,
  Trash2,
  Database,
  RefreshCw,
  Zap,
  ShieldCheck,
} from "lucide-react";

// TODO: Replace with real incoming stream from Tauri Textractor/OCR event listener
const INITIAL_DUMMY_LOGS: TranslationLogItem[] = [
  {
    id: "log_1",
    timestamp: "23:42:10",
    provider: "",
    durationMs: 45,
    matchedFromScript: true,
    similarityScore: 0.98,
    name: {
      source: "坂上 智代",
      translated: "Sakagami Tomoyo",
    },
    message: {
      source: "「…別に、何でもないわ。早く教室に行きましょう。」",
      translated: "\"...It's nothing really. Let's hurry to the classroom.\"",
    },
  },
  {
    id: "log_2",
    timestamp: "23:42:15",
    provider: "OpenRouter (Claude 3.5 Sonnet)",
    durationMs: 380,
    matchedFromScript: false,
    name: {
      source: "岡崎 朋也",
      translated: "Tomoya Okazaki",
    },
    message: {
      source: "「ああ、そうだな。遅刻するとまた藤林に怒られる。」",
      translated: "\"Yeah, you're right. If we're late, Fujibayashi will scold us again.\"",
    },
  },
  {
    id: "log_3",
    timestamp: "23:42:22",
    provider: "Google Translate (Free)",
    durationMs: 190,
    matchedFromScript: false,
    name: {
      source: "春原 陽平",
      translated: "Youhei Sunohara",
    },
    message: {
      source: "「おい朋也ーっ！今日の放課後、例の作戦決行するぞ！」",
      translated: "\"Hey Tomoya! After school today, we're executing that plan!\"",
    },
  },
  {
    id: "log_4",
    timestamp: "23:42:30",
    provider: "",
    durationMs: 30,
    matchedFromScript: true,
    similarityScore: 0.91,
    // Narration: No name field
    message: {
      source: "廊下を走る春原の足音が、静まり返った校舎に響き渡る。",
      translated: "Sunohara's footsteps running down the corridor echoed throughout the quiet school building.",
    },
  },
];

export const LiveTranslateView: React.FC = () => {
  const [logs, setLogs] = useState<TranslationLogItem[]>(INITIAL_DUMMY_LOGS);
  const [isAutoActive, setIsAutoActive] = useState<boolean>(true);
  const [selectedProvider, setSelectedProvider] = useState<string>("openrouter_claude");
  const [useScriptOnly, setUseScriptOnly] = useState<boolean>(false);

  const handleClearLogs = () => {
    // TODO: Clear active translation memory/history
    setLogs([]);
  };

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
        {/* Left Side: Auto Translate + Provider Selector + Script Only Toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {/* Auto Translate Toggle Button */}
          <button
            onClick={() => setIsAutoActive(!isAutoActive)}
            className={isAutoActive ? "btn-primary" : "btn-secondary"}
            style={{
              backgroundColor: isAutoActive ? "var(--accent-success)" : "var(--bg-surface-elevated)",
              padding: "7px 14px",
            }}
          >
            {isAutoActive ? <Pause size={14} /> : <Play size={14} />}
            <span>{isAutoActive ? "Auto-Translate: Active" : "Stream Paused"}</span>
          </button>

          {/* Translation Provider Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Zap size={14} style={{ color: "var(--accent-gold)" }} />
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              disabled={useScriptOnly}
              style={{
                width: "220px",
                opacity: useScriptOnly ? 0.45 : 1,
                cursor: useScriptOnly ? "not-allowed" : "pointer",
              }}
            >
              <option value="openrouter_claude">OpenRouter (Claude 3.5 Sonnet)</option>
              <option value="openrouter_gpt">OpenRouter (GPT-4o-mini)</option>
              <option value="openrouter_deepseek">OpenRouter (DeepSeek-V3)</option>
              <option value="google_free">Google Translate (Free MT)</option>
              <option value="deepl_free">DeepL Web (Free)</option>
            </select>
          </div>

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
              onChange={(e) => setUseScriptOnly(e.target.checked)}
            />
            <ShieldCheck size={13} style={{ color: useScriptOnly ? "var(--accent-cyan)" : "var(--text-muted)" }} />
            <span>Use Script Only</span>
          </label>
        </div>

        {/* Right Side: Total Counter & Clear Button */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Lines: <strong style={{ color: "var(--text-primary)" }}>{logs.length}</strong>
          </span>

          <button onClick={handleClearLogs} className="btn-secondary" title="Clear log stream">
            <Trash2 size={13} />
            <span>Clear</span>
          </button>
        </div>
      </div>

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
        {logs.length === 0 ? (
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
          logs.map((item) => (
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
