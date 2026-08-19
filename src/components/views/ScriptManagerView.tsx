import React, { useState } from "react";
import { ScriptLineItem, NGramSettings } from "../../types";
import {
  Database,
  Upload,
  Download,
  Search,
  Sliders,
  Trash2,
  Pencil,
  Check,
  X,
  Plus,
  BookOpen,
} from "lucide-react";

// TODO: Replace with real script database loaded from .jsonl file via Tauri Rust
const DUMMY_SCRIPT_LINES: ScriptLineItem[] = [
  {
    id: "line_001",
    speaker: "坂上 智代",
    translatedSpeaker: "Tomoyo Sakagami",
    original: "「…別に、何でもないわ。早く教室に行きましょう。」",
    translated: "\"...It's nothing really. Let's hurry to the classroom.\"",
    matchedCount: 14,
    lastUsed: "23:42:10",
  },
  {
    id: "line_002",
    speaker: "岡崎 朋也",
    translatedSpeaker: "Tomoya Okazaki",
    original: "「ああ、そうだな。遅刻するとまた藤林に怒られる。」",
    translated: "\"Yeah, you're right. If we're late, Fujibayashi will scold us again.\"",
    matchedCount: 9,
    lastUsed: "23:42:15",
  },
  {
    id: "line_003",
    speaker: "古河 渚",
    translatedSpeaker: "Nagisa Furukawa",
    original: "「あんぱんが好きです…あなたは好きですか？」",
    translated: "\"I love anpan... Do you like it?\"",
    matchedCount: 6,
    lastUsed: "23:38:00",
  },
  {
    id: "line_004",
    speaker: "",
    translatedSpeaker: "",
    original: "廊下を走る春原の足音が、静まり返った校舎に響き渡る。",
    translated: "Sunohara's footsteps running down the corridor echoed throughout the quiet school building.",
    matchedCount: 3,
    lastUsed: "23:42:30",
  },
];

export const ScriptManagerView: React.FC = () => {
  const [activeFileName, setActiveFileName] = useState<string>("clannad_route_tomoyo.jsonl");
  const [scriptLines, setScriptLines] = useState<ScriptLineItem[]>(DUMMY_SCRIPT_LINES);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [autoAppendNewLines, setAutoAppendNewLines] = useState<boolean>(true);

  // Quick Add State
  const [newSpeaker, setNewSpeaker] = useState<string>("");
  const [newTranslatedSpeaker, setNewTranslatedSpeaker] = useState<string>("");
  const [newMessage, setNewMessage] = useState<string>("");
  const [newTranslatedMessage, setNewTranslatedMessage] = useState<string>("");

  // Inline Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSpeaker, setEditSpeaker] = useState<string>("");
  const [editTranslatedSpeaker, setEditTranslatedSpeaker] = useState<string>("");
  const [editMessage, setEditMessage] = useState<string>("");
  const [editTranslatedMessage, setEditTranslatedMessage] = useState<string>("");

  // N-gram Matching Criteria Settings
  const [ngramSettings, setNgramSettings] = useState<NGramSettings>({
    nValue: 2,
    similarityThreshold: 0.8,
    normalizeWhitespace: true,
    removePunctuation: true,
    ignoreCase: true,
  });

  const filteredLines = scriptLines.filter(
    (l) =>
      l.original.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.translated.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.speaker && l.speaker.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (l.translatedSpeaker && l.translatedSpeaker.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleAddLine = () => {
    if (!newMessage.trim() || !newTranslatedMessage.trim()) return;

    const newLine: ScriptLineItem = {
      id: `line_${Date.now()}`,
      speaker: newSpeaker.trim() || undefined,
      translatedSpeaker: newTranslatedSpeaker.trim() || undefined,
      original: newMessage.trim(),
      translated: newTranslatedMessage.trim(),
      matchedCount: 0,
      lastUsed: new Date().toLocaleTimeString("en-US", { hour12: false }),
    };

    setScriptLines([newLine, ...scriptLines]);
    setNewSpeaker("");
    setNewTranslatedSpeaker("");
    setNewMessage("");
    setNewTranslatedMessage("");
  };

  const handleStartEdit = (item: ScriptLineItem) => {
    setEditingId(item.id);
    setEditSpeaker(item.speaker || "");
    setEditTranslatedSpeaker(item.translatedSpeaker || "");
    setEditMessage(item.original);
    setEditTranslatedMessage(item.translated);
  };

  const handleSaveEdit = (id: string) => {
    if (!editMessage.trim() || !editTranslatedMessage.trim()) return;

    setScriptLines(
      scriptLines.map((l) =>
        l.id === id
          ? {
              ...l,
              speaker: editSpeaker.trim() || undefined,
              translatedSpeaker: editTranslatedSpeaker.trim() || undefined,
              original: editMessage.trim(),
              translated: editTranslatedMessage.trim(),
            }
          : l
      )
    );
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleDeleteLine = (id: string) => {
    setScriptLines(scriptLines.filter((l) => l.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const handleImportScript = () => {
    // TODO: Open native Tauri file dialog for .jsonl import
    setActiveFileName("imported_game_script.jsonl");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* Top Banner: Active Script File Status & Quick Actions */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Database size={16} color="var(--accent-cyan)" /> Active Script Database:{" "}
              <span style={{ color: "var(--accent-cyan)" }}>{activeFileName}</span>
            </span>
            <span className="card-subtitle">
              Loaded {scriptLines.length} dialogue entries • Format: .jsonl (JSON Lines)
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={handleImportScript} className="btn-secondary">
              <Upload size={14} />
              <span>Import Script (.jsonl)</span>
            </button>
            <button className="btn-secondary">
              <Download size={14} />
              <span>Export .jsonl</span>
            </button>
          </div>
        </div>

        {/* Auto Append Feature Switch */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "var(--bg-app)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 14px",
            marginTop: "6px",
          }}
        >
          <div>
            <span style={{ fontWeight: 600, display: "block", fontSize: "13px" }}>
              Auto-Append Newly Translated Lines
            </span>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
              Automatically append lines translated via AI/MT in Live Translate mode into this .jsonl script database
            </span>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoAppendNewLines}
              onChange={(e) => setAutoAppendNewLines(e.target.checked)}
              style={{ transform: "scale(1.2)" }}
            />
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: autoAppendNewLines ? "var(--accent-success)" : "var(--text-muted)",
              }}
            >
              {autoAppendNewLines ? "Enabled" : "Disabled"}
            </span>
          </label>
        </div>
      </div>

      {/* Matching Criteria Configuration Card */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Sliders size={16} /> N-Gram Matching Criteria
            </span>
            <span className="card-subtitle">
              Configure string matching accuracy for recognizing in-game dialogues
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              N-Gram Size (Character Window)
            </label>
            <select
              value={ngramSettings.nValue}
              onChange={(e) => setNgramSettings({ ...ngramSettings, nValue: Number(e.target.value) })}
              style={{ width: "100%" }}
            >
              <option value={2}>N = 2 (Bigram - Recommended for Japanese)</option>
              <option value={3}>N = 3 (Trigram)</option>
              <option value={1}>N = 1 (Unigram)</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Similarity Threshold: {Math.round(ngramSettings.similarityThreshold * 100)}%
            </label>
            <input
              type="range"
              min={0.5}
              max={1.0}
              step={0.05}
              value={ngramSettings.similarityThreshold}
              onChange={(e) => setNgramSettings({ ...ngramSettings, similarityThreshold: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
          </div>
        </div>

        {/* Cleaning Switches */}
        <div style={{ display: "flex", gap: "24px", marginTop: "12px", borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "12px" }}>
            <input
              type="checkbox"
              checked={ngramSettings.normalizeWhitespace}
              onChange={(e) => setNgramSettings({ ...ngramSettings, normalizeWhitespace: e.target.checked })}
            />
            <span>Normalize Whitespace</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "12px" }}>
            <input
              type="checkbox"
              checked={ngramSettings.removePunctuation}
              onChange={(e) => setNgramSettings({ ...ngramSettings, removePunctuation: e.target.checked })}
            />
            <span>Strip Punctuation (「」、。)</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "12px" }}>
            <input
              type="checkbox"
              checked={ngramSettings.ignoreCase}
              onChange={(e) => setNgramSettings({ ...ngramSettings, ignoreCase: e.target.checked })}
            />
            <span>Ignore Case</span>
          </label>
        </div>
      </div>

      {/* Quick Add New Line Form */}
      <div className="card" style={{ margin: 0, padding: "14px 16px" }}>
        <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "10px" }}>
          + Add New Script Line Entry
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 2fr 2fr auto", gap: "10px", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Speaker (e.g. 智代)"
            value={newSpeaker}
            onChange={(e) => setNewSpeaker(e.target.value)}
            style={{ fontFamily: "var(--font-jp)" }}
          />
          <input
            type="text"
            placeholder="Translated Speaker (e.g. Tomoyo)"
            value={newTranslatedSpeaker}
            onChange={(e) => setNewTranslatedSpeaker(e.target.value)}
          />
          <input
            type="text"
            placeholder="Japanese Message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            style={{ fontFamily: "var(--font-jp)" }}
          />
          <input
            type="text"
            placeholder="Translated Message..."
            value={newTranslatedMessage}
            onChange={(e) => setNewTranslatedMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddLine()}
          />
          <button onClick={handleAddLine} className="btn-primary" style={{ padding: "7px 16px", whiteSpace: "nowrap" }}>
            <Plus size={14} />
            <span>Add Line</span>
          </button>
        </div>
      </div>

      {/* Script Lines Search and Table */}
      <div className="card" style={{ margin: 0, padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "var(--bg-surface-elevated)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "320px" }}>
            <Search size={14} style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              placeholder="Search speaker, Japanese, or translation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%", padding: "5px 8px" }}
            />
          </div>

          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Showing {filteredLines.length} of {scriptLines.length} entries
          </span>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border-subtle)" }}>
              <th style={{ padding: "10px 14px", width: "130px", color: "var(--text-muted)" }}>Speaker</th>
              <th style={{ padding: "10px 14px", width: "140px", color: "var(--text-muted)" }}>Translated Speaker</th>
              <th style={{ padding: "10px 14px", width: "36%", color: "var(--text-muted)" }}>Message</th>
              <th style={{ padding: "10px 14px", width: "36%", color: "var(--text-muted)" }}>Translated Message</th>
              <th style={{ padding: "10px 14px", width: "90px", color: "var(--text-muted)", textAlign: "center" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLines.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "28px", textAlign: "center", color: "var(--text-muted)" }}>
                  <BookOpen size={24} style={{ opacity: 0.4, margin: "0 auto 8px" }} />
                  <div>No script entries match your search query.</div>
                </td>
              </tr>
            ) : (
              filteredLines.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  {editingId === row.id ? (
                    // Inline Edit Mode
                    <>
                      <td style={{ padding: "8px 10px" }}>
                        <input
                          type="text"
                          value={editSpeaker}
                          placeholder="Speaker..."
                          onChange={(e) => setEditSpeaker(e.target.value)}
                          style={{ width: "100%", fontFamily: "var(--font-jp)", fontSize: "12.5px" }}
                        />
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <input
                          type="text"
                          value={editTranslatedSpeaker}
                          placeholder="Translated Speaker..."
                          onChange={(e) => setEditTranslatedSpeaker(e.target.value)}
                          style={{ width: "100%", fontSize: "12.5px" }}
                        />
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <input
                          type="text"
                          value={editMessage}
                          placeholder="Japanese Message..."
                          onChange={(e) => setEditMessage(e.target.value)}
                          style={{ width: "100%", fontFamily: "var(--font-jp)", fontSize: "13px" }}
                        />
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <input
                          type="text"
                          value={editTranslatedMessage}
                          placeholder="Translated Message..."
                          onChange={(e) => setEditTranslatedMessage(e.target.value)}
                          style={{ width: "100%", fontSize: "13px" }}
                        />
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        <div style={{ display: "inline-flex", gap: "4px" }}>
                          <button
                            onClick={() => handleSaveEdit(row.id)}
                            className="btn-primary"
                            style={{ padding: "4px 6px" }}
                            title="Save changes"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="btn-secondary"
                            style={{ padding: "4px 6px" }}
                            title="Cancel edit"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    // Regular Display Mode
                    <>
                      <td style={{ padding: "10px 14px" }}>
                        {row.speaker ? (
                          <span
                            style={{
                              backgroundColor: "rgba(227, 179, 65, 0.15)",
                              color: "var(--accent-gold)",
                              padding: "2px 7px",
                              borderRadius: "var(--radius-sm)",
                              fontWeight: 600,
                              fontSize: "12px",
                              fontFamily: "var(--font-jp)",
                              display: "inline-block",
                            }}
                          >
                            {row.speaker}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {row.translatedSpeaker ? (
                          <span style={{ fontSize: "12.5px", color: "var(--text-primary)", fontWeight: 500 }}>
                            {row.translatedSpeaker}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", fontFamily: "var(--font-jp)", color: "var(--text-jp)" }}>
                        {row.original}
                      </td>
                      <td style={{ padding: "10px 14px", color: "var(--text-primary)", fontWeight: 500 }}>
                        {row.translated}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <div style={{ display: "inline-flex", gap: "4px" }}>
                          <button
                            onClick={() => handleStartEdit(row)}
                            className="btn-secondary"
                            style={{ padding: "4px 6px", borderRadius: "var(--radius-sm)" }}
                            title="Edit script line"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteLine(row.id)}
                            className="btn-danger"
                            style={{ padding: "4px 6px", borderRadius: "var(--radius-sm)" }}
                            title="Delete script line"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
