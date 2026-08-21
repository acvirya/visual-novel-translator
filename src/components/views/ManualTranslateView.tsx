import React, { useState } from "react";
import {
  Copy,
  Sparkles,
  Languages,
  ArrowRightLeft,
  Trash2,
  Check,
  Database,
  Layers,
} from "lucide-react";
import { ModelSelectorCombobox } from "../common/ModelSelectorCombobox";
import {
  extractSpeakerAndDialogue,
  executePreprocessingPipeline,
} from "../../utils/textPreprocessor";
import { translateWithFreeMt } from "../../services/freeMtService";
import { translateWithOpenRouter } from "../../services/openRouterService";
import { scriptManagerService } from "../../services/scriptManagerService";

export const ManualTranslateView: React.FC = () => {
  const [sourceText, setSourceText] = useState<string>("");
  const [translatedText, setTranslatedText] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem("vn_selected_model") || "mt:google-translate";
  });
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [statusInfo, setStatusInfo] = useState<{
    latencyMs?: number;
    provider?: string;
    matchedFromScript?: boolean;
    autoAppended?: boolean;
  } | null>(null);

  const handleTranslate = async () => {
    const rawInput = sourceText.trim();
    if (!rawInput || isTranslating) return;

    setIsTranslating(true);
    setStatusInfo(null);
    const startTime = Date.now();

    try {
      // 1. Extract speaker & message from input (e.g. "Speaker: Dialogue" or just "Dialogue")
      const extracted = extractSpeakerAndDialogue(rawInput);
      const cleanSpeaker = extracted.speaker?.trim() || undefined;
      const cleanMessage = executePreprocessingPipeline(extracted.message, "manual").trim();

      if (!cleanMessage) {
        setIsTranslating(false);
        return;
      }

      // 2. Check if already exists in active Script Database
      const scriptMatch = scriptManagerService.findMatch(cleanMessage, cleanSpeaker);

      let finalTranslatedSpeaker: string | undefined = cleanSpeaker;
      let finalTranslatedMessage = "";
      let providerLabel = "Google Translate (Free)";
      let matchedFromScript = false;
      let autoAppended = false;

      if (scriptMatch.matched && scriptMatch.entry) {
        finalTranslatedSpeaker = scriptMatch.entry.translated_speaker || cleanSpeaker;
        finalTranslatedMessage = scriptMatch.entry.translated_message;
        providerLabel = "Script Database";
        matchedFromScript = true;
      } else {
        // 3. Perform MT / LLM Translation
        if (selectedModel === "mt:google-translate" || selectedModel === "google") {
          providerLabel = "Google Translate (Free)";
          const res = await translateWithFreeMt({
            speaker: cleanSpeaker,
            message: cleanMessage,
            provider: "google",
          });
          finalTranslatedSpeaker = res.translatedSpeaker || cleanSpeaker;
          finalTranslatedMessage = res.translatedMessage || cleanMessage;
        } else if (selectedModel === "mt:deepl-free" || selectedModel === "deepl") {
          providerLabel = "DeepL Free";
          const res = await translateWithFreeMt({
            speaker: cleanSpeaker,
            message: cleanMessage,
            provider: "deepl",
          });
          finalTranslatedSpeaker = res.translatedSpeaker || cleanSpeaker;
          finalTranslatedMessage = res.translatedMessage || cleanMessage;
        } else {
          providerLabel = `OpenRouter (${selectedModel.split("/").pop() || selectedModel})`;
          const apiKey = localStorage.getItem("vn_openrouter_api_key") || "";
          const systemPrompt = localStorage.getItem("vn_live_system_prompt") || undefined;

          const res = await translateWithOpenRouter({
            apiKey,
            modelId: selectedModel,
            speaker: cleanSpeaker,
            message: cleanMessage,
            systemPrompt,
          });

          finalTranslatedSpeaker = res.translatedSpeaker || cleanSpeaker;
          finalTranslatedMessage = res.translatedMessage || cleanMessage;
        }

        // 4. Auto-append separated fields into Active Script Database if active
        if (finalTranslatedMessage && finalTranslatedMessage !== cleanMessage) {
          const appended = scriptManagerService.autoAppendTranslation({
            speaker: cleanSpeaker,
            translated_speaker:
              finalTranslatedSpeaker && finalTranslatedSpeaker !== cleanSpeaker
                ? finalTranslatedSpeaker
                : undefined,
            message: cleanMessage,
            translated_message: finalTranslatedMessage,
          });
          autoAppended = appended;
        }
      }

      const durationMs = Date.now() - startTime;

      // 5. Format display output: "Speaker: Message" or "Message"
      if (finalTranslatedSpeaker && cleanSpeaker) {
        setTranslatedText(`${finalTranslatedSpeaker}: ${finalTranslatedMessage}`);
      } else {
        setTranslatedText(finalTranslatedMessage);
      }

      setStatusInfo({
        latencyMs: durationMs,
        provider: providerLabel,
        matchedFromScript,
        autoAppended,
      });
    } catch (err: any) {
      setTranslatedText(`[Translation Error]: ${err?.message || String(err)}`);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCopy = () => {
    if (!translatedText) return;
    navigator.clipboard.writeText(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleClear = () => {
    setSourceText("");
    setTranslatedText("");
    setStatusInfo(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleTranslate();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", width: "100%", height: "100%" }}>
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
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600, whiteSpace: "nowrap" }}>
            Model / Provider:
          </span>
          <ModelSelectorCombobox
            selectedModelId={selectedModel}
            onSelectModel={(id) => {
              setSelectedModel(id);
              localStorage.setItem("vn_selected_model", id);
            }}
            width="280px"
            compact={true}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {sourceText && (
            <button
              onClick={handleClear}
              className="btn-secondary"
              style={{ padding: "6px 10px", fontSize: "12px" }}
              title="Clear inputs"
            >
              <Trash2 size={13} />
              <span>Clear</span>
            </button>
          )}

          <button
            onClick={handleTranslate}
            disabled={isTranslating || !sourceText.trim()}
            className="btn-primary"
            style={{
              padding: "7px 16px",
              fontSize: "12.5px",
              opacity: isTranslating || !sourceText.trim() ? 0.6 : 1,
            }}
          >
            <Sparkles size={14} />
            <span>{isTranslating ? "Translating..." : "Translate (Ctrl+Enter)"}</span>
          </button>
        </div>
      </div>

      {/* Dual Textareas: Source & Target */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "14px",
          flex: 1,
          minHeight: "360px",
          width: "100%",
        }}
      >
        {/* Source Text Column */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "10px", margin: 0, height: "100%" }}>
          <div className="card-header" style={{ margin: 0 }}>
            <span className="card-title">
              <Languages size={15} /> Japanese Source Text
            </span>
            <span className="card-subtitle">{sourceText.length} chars</span>
          </div>

          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type or paste Japanese dialogue here...&#10;Format supports plain dialogue or: Speaker: Dialogue (e.g. 坂上 智代: 「…別に、何でもないわ。」)"
            style={{
              fontFamily: "var(--font-jp)",
              fontSize: "14.5px",
              lineHeight: "1.7",
              resize: "none",
              width: "100%",
              flex: 1,
              backgroundColor: "var(--bg-app)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "12px",
              color: "var(--text-jp)",
            }}
          />

          <div style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Tip: Press <strong>Ctrl + Enter</strong> to translate instantly</span>
            {sourceText.includes(":") || sourceText.includes("：") || sourceText.includes("「") ? (
              <span style={{ color: "var(--accent-gold)", fontWeight: 600 }}>Speaker format detected</span>
            ) : null}
          </div>
        </div>

        {/* Target Translation Column */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "10px", margin: 0, height: "100%" }}>
          <div className="card-header" style={{ margin: 0 }}>
            <span className="card-title">
              <ArrowRightLeft size={15} /> Target Translation Output
            </span>
            <button
              onClick={handleCopy}
              disabled={!translatedText}
              className="btn-secondary"
              style={{ padding: "4px 10px", fontSize: "12px" }}
            >
              {copied ? <Check size={12} style={{ color: "var(--accent-success)" }} /> : <Copy size={12} />}
              <span>{copied ? "Copied!" : "Copy"}</span>
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
              backgroundColor: "var(--bg-app)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "12px",
              color: "var(--text-primary)",
            }}
          />

          {/* Status & Metadata Bar */}
          <div style={{ fontSize: "11.5px", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: "18px" }}>
            <div>
              {statusInfo ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{statusInfo.provider}</span>
                  <span>•</span>
                  <span>{statusInfo.latencyMs}ms</span>

                  {statusInfo.matchedFromScript && (
                    <span
                      style={{
                        backgroundColor: "rgba(63, 185, 80, 0.15)",
                        color: "var(--accent-success)",
                        padding: "1px 6px",
                        borderRadius: "2px",
                        fontWeight: 700,
                        fontSize: "10.5px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "3px",
                      }}
                    >
                      <Database size={10} /> Script Match (100%)
                    </span>
                  )}

                  {statusInfo.autoAppended && (
                    <span
                      style={{
                        backgroundColor: "rgba(227, 179, 65, 0.15)",
                        color: "var(--accent-gold)",
                        padding: "1px 6px",
                        borderRadius: "2px",
                        fontWeight: 600,
                        fontSize: "10.5px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "3px",
                      }}
                    >
                      <Layers size={10} /> Saved to Script
                    </span>
                  )}
                </div>
              ) : (
                <span>Ready for input</span>
              )}
            </div>

            <span>{translatedText.length} chars</span>
          </div>
        </div>
      </div>
    </div>
  );
};
