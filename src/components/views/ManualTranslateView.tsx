import React, { useState } from "react";
import { Copy, Sparkles, Languages, ArrowRightLeft, BookOpen } from "lucide-react";

export const ManualTranslateView: React.FC = () => {
  const [sourceText, setSourceText] = useState<string>(
    "「たとえ世界が君を拒んだとしても、私は君の傍にいるよ。」"
  );
  const [translatedText, setTranslatedText] = useState<string>(
    "\"Even if the world rejects you, I will stay by your side.\""
  );
  const [selectedProvider, setSelectedProvider] = useState<string>("openrouter");
  const [isTranslating, setIsTranslating] = useState<boolean>(false);

  // TODO: Connect to Tauri OpenRouter / MT API command
  const handleTranslate = () => {
    setIsTranslating(true);
    setTimeout(() => {
      // Dummy response simulation
      setIsTranslating(false);
    }, 400);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(translatedText);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%", height: "100%" }}>
      {/* Top Options Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "10px 16px",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>
            Provider:
          </span>
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            style={{ width: "230px" }}
          >
            <option value="openrouter">OpenRouter (Claude 3.5 Sonnet)</option>
            <option value="openrouter_gpt">OpenRouter (GPT-4o-mini)</option>
            <option value="openrouter_deepseek">OpenRouter (DeepSeek-V3)</option>
            <option value="google_free">Google Translate (Free MT)</option>
            <option value="deepl_free">DeepL Web (Free)</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={handleTranslate}
            disabled={isTranslating}
            className="btn-primary"
            style={{ opacity: isTranslating ? 0.7 : 1 }}
          >
            <Sparkles size={14} />
            <span>{isTranslating ? "Translating..." : "Translate Now (Ctrl+Enter)"}</span>
          </button>
        </div>
      </div>

      {/* Dual Textareas: Source & Target */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", flex: 1, minHeight: "360px", width: "100%" }}>
        {/* Source Text Column */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "10px", margin: 0, height: "100%" }}>
          <div className="card-header" style={{ margin: 0 }}>
            <span className="card-title">
              <Languages size={15} /> Japanese Source Text
            </span>
            <span className="card-subtitle">{sourceText.length} characters</span>
          </div>

          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="Type or paste Japanese text here..."
            style={{
              fontFamily: "var(--font-jp)",
              fontSize: "14.5px",
              lineHeight: "1.7",
              resize: "none",
              width: "100%",
              flex: 1,
            }}
          />

          <div style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
            <BookOpen size={12} />
            <span>Glossary matched: <strong>傍 (Side/Beside)</strong>, <strong>世界 (World)</strong></span>
          </div>
        </div>

        {/* Target Translation Column */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "10px", margin: 0, height: "100%" }}>
          <div className="card-header" style={{ margin: 0 }}>
            <span className="card-title">
              <ArrowRightLeft size={15} /> Target Translation
            </span>
            <button onClick={handleCopy} className="btn-secondary" style={{ padding: "4px 8px", fontSize: "12px" }}>
              <Copy size={12} />
              <span>Copy</span>
            </button>
          </div>

          <textarea
            value={translatedText}
            onChange={(e) => setTranslatedText(e.target.value)}
            placeholder="Translation output will appear here..."
            style={{
              fontSize: "14.5px",
              lineHeight: "1.7",
              resize: "none",
              width: "100%",
              flex: 1,
            }}
          />

          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Character count: {translatedText.length} | Latency: 280ms
          </div>
        </div>
      </div>
    </div>
  );
};
