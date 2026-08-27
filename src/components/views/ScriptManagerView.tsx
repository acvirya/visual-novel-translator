import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  scriptManagerService,
  ScriptEntry,
  ScriptDatabaseState,
} from "../../services/scriptManagerService";
import { useToast } from "../common/ToastProvider";
import { ConfirmDialog } from "../common/ConfirmDialog";
import {
  Database,
  FolderOpen,
  PlusCircle,
  XCircle,
  Search,
  Trash2,
  Pencil,
  Check,
  X,
  Plus,
  BookOpen,
  Sparkles,
  CheckCircle2,
  FileDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Sliders,
} from "lucide-react";

export const ScriptManagerView: React.FC = () => {
  const toast = useToast();
  const [dbState, setDbState] = useState<ScriptDatabaseState>(() => scriptManagerService.getState());
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  // Pagination State for Maximum Performance on 20,000+ lines
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Manual Add Entry Form State
  const [addSpeaker, setAddSpeaker] = useState<string>("");
  const [addTranslatedSpeaker, setAddTranslatedSpeaker] = useState<string>("");
  const [addMessage, setAddMessage] = useState<string>("");
  const [addTranslatedMessage, setAddTranslatedMessage] = useState<string>("");

  // Inline Edit Entry State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSpeaker, setEditSpeaker] = useState<string>("");
  const [editTranslatedSpeaker, setEditTranslatedSpeaker] = useState<string>("");
  const [editMessage, setEditMessage] = useState<string>("");
  const [editTranslatedMessage, setEditTranslatedMessage] = useState<string>("");

  // Subscribe to central script database updates
  useEffect(() => {
    const unsubscribe = scriptManagerService.subscribe((state) => {
      setDbState(state);
    });
    return () => unsubscribe();
  }, []);

  const isFirstPageMount = useRef(true);

  // Reset page when searching
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Auto-scroll to top when page changes
  useEffect(() => {
    if (isFirstPageMount.current) {
      isFirstPageMount.current = false;
      return;
    }
    const mainContainer = document.querySelector(".view-container");
    if (mainContainer) {
      mainContainer.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentPage]);

  const handleCreateNewScript = async () => {
    await scriptManagerService.createNewScriptNative("new_script.jsonl");
    setDbState(scriptManagerService.getState());
  };

  const handleOpenScript = async () => {
    await scriptManagerService.openScriptNative();
    setDbState(scriptManagerService.getState());
  };

  const handleImportFromScripts = async () => {
    if (!dbState.activeFileName) {
      // If no script is currently open, create a new one first
      const createRes = await scriptManagerService.createNewScriptNative("imported_script.jsonl");
      if (!createRes.success) return;
    }

    const res = await scriptManagerService.importEntriesFromScriptsNative();
    setDbState(scriptManagerService.getState());
    if (res.success && res.importedCount > 0) {
      toast.success(`Successfully imported ${res.importedCount} entries from ${res.filesCount} script file(s)!`, "Import Complete");
    } else if (res.error) {
      toast.error(`Import failed: ${res.error}`, "Import Error");
    }
  };

  const handleCloseScript = () => {
    scriptManagerService.closeScript();
    setDbState(scriptManagerService.getState());
    setShowAddForm(false);
    setEditingId(null);
    toast.info("Active script closed.");
  };

  const handleManualAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addMessage.trim() || !addTranslatedMessage.trim()) return;

    scriptManagerService.addEntry({
      speaker: addSpeaker.trim() || undefined,
      translated_speaker: addTranslatedSpeaker.trim() || undefined,
      message: addMessage.trim(),
      translated_message: addTranslatedMessage.trim(),
    });

    setAddSpeaker("");
    setAddTranslatedSpeaker("");
    setAddMessage("");
    setAddTranslatedMessage("");
    setShowAddForm(false);
    toast.success("Script entry added successfully.", "Entry Added");
  };

  const handleStartEdit = (entry: ScriptEntry) => {
    setEditingId(entry.id);
    setEditSpeaker(entry.speaker || "");
    setEditTranslatedSpeaker(entry.translated_speaker || "");
    setEditMessage(entry.message);
    setEditTranslatedMessage(entry.translated_message);
  };

  const handleSaveEdit = (id: string) => {
    if (!editMessage.trim() || !editTranslatedMessage.trim()) return;

    scriptManagerService.updateEntry(id, {
      speaker: editSpeaker.trim() || undefined,
      translated_speaker: editTranslatedSpeaker.trim() || undefined,
      message: editMessage.trim(),
      translated_message: editTranslatedMessage.trim(),
    });

    setEditingId(null);
    toast.success("Script entry updated.", "Entry Updated");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleDeleteEntry = (id: string) => {
    scriptManagerService.deleteEntry(id);
    toast.info("Script entry deleted.");
  };

  const handleClearAll = () => {
    scriptManagerService.clearEntries();
    setDbState(scriptManagerService.getState());
    setShowClearConfirm(false);
    toast.success("All entries deleted from active script.", "Script Cleared");
  };

  // Filter entries based on search query (Memoized)
  const filteredEntries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return dbState.entries;

    const normQ = q.replace(/[\u3000\s「」『』【】（）()〈〉《》""''“”]/g, "").toLowerCase();

    return dbState.entries.filter((entry) => {
      const msg = (entry.message || "").toLowerCase();
      const transMsg = (entry.translated_message || "").toLowerCase();
      const spk = (entry.speaker || "").toLowerCase();
      const transSpk = (entry.translated_speaker || "").toLowerCase();

      if (
        msg.includes(q) ||
        transMsg.includes(q) ||
        spk.includes(q) ||
        transSpk.includes(q)
      ) {
        return true;
      }

      if (normQ) {
        const normMsg = msg.replace(/[\u3000\s「」『』【】（）()〈〉《》""''“”]/g, "");
        const normTransMsg = transMsg.replace(/[\u3000\s]/g, "");
        if (normMsg.includes(normQ) || normTransMsg.includes(normQ)) {
          return true;
        }
      }

      return false;
    });
  }, [dbState.entries, searchQuery]);

  // Paginated Slices (Ultra-lightweight DOM rendering)
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedEntries = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, safePage, pageSize]);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: "14px" }}>
      {/* Top Header Card */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        {/* Left Side: Active Script Info or None */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Database size={18} style={{ color: dbState.activeFileName ? "var(--accent-cyan)" : "var(--text-muted)" }} />
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.5px" }}>
                Active Script Database
              </div>
              <div
                style={{ fontSize: "14px", fontWeight: 700, color: dbState.activeFileName ? "var(--text-primary)" : "var(--text-muted)" }}
                title={dbState.activeFilePath || undefined}
              >
                {dbState.activeFileName || "No active script loaded"}
              </div>
            </div>
          </div>

          {dbState.activeFileName && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  backgroundColor: "rgba(63, 185, 80, 0.12)",
                  color: "var(--accent-success)",
                  padding: "3px 8px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid rgba(63, 185, 80, 0.3)",
                }}
              >
                <CheckCircle2 size={12} /> Autosave Active
              </span>

              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: dbState.autoAppend ? "var(--accent-gold)" : "var(--text-secondary)",
                  backgroundColor: dbState.autoAppend ? "rgba(227, 179, 65, 0.12)" : "var(--bg-surface-elevated)",
                  padding: "4px 8px",
                  borderRadius: "var(--radius-sm)",
                  border: dbState.autoAppend ? "1px solid rgba(227, 179, 65, 0.3)" : "1px solid var(--border-subtle)",
                  cursor: "pointer",
                }}
                title="Automatically append newly translated game lines into this active script"
              >
                <input
                  type="checkbox"
                  checked={dbState.autoAppend}
                  onChange={(e) => scriptManagerService.setAutoAppend(e.target.checked)}
                />
                <Sparkles size={12} /> Auto-Append Translations
              </label>

              {/* Match Similarity Threshold Slider */}
              <div
                style={{
                  display: "inline-flex",
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
                <Sliders size={12} style={{ color: "var(--accent-cyan)" }} />
                <span style={{ color: "var(--text-secondary)", fontSize: "11.5px" }}>Threshold:</span>
                <input
                  type="range"
                  min="0.50"
                  max="1.00"
                  step="0.05"
                  value={dbState.matchThreshold ?? 0.85}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    scriptManagerService.setMatchThreshold(val);
                    setDbState(scriptManagerService.getState());
                  }}
                  style={{ width: "65px", cursor: "pointer" }}
                />
                <span style={{ color: "var(--accent-cyan)", minWidth: "30px", textAlign: "right", fontSize: "11.5px" }}>
                  {Math.round((dbState.matchThreshold ?? 0.85) * 100)}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Action Buttons (Create, Open, Close) */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={handleCreateNewScript}
            className="btn-primary"
            style={{ padding: "6px 12px", fontSize: "12px" }}
          >
            <PlusCircle size={14} />
            <span>Create New Script</span>
          </button>

          <button
            type="button"
            onClick={handleOpenScript}
            className="btn-secondary"
            style={{ padding: "6px 12px", fontSize: "12px" }}
          >
            <FolderOpen size={14} />
            <span>Open Script</span>
          </button>

          {dbState.activeFileName && (
            <button
              type="button"
              onClick={handleImportFromScripts}
              className="btn-secondary"
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                color: "var(--accent-gold)",
                borderColor: "rgba(234, 179, 8, 0.3)",
                backgroundColor: "rgba(234, 179, 8, 0.08)",
              }}
              title="Import and append dialogue lines from one or more script files into this active script"
            >
              <FileDown size={14} />
              <span>Import Entries from Scripts</span>
            </button>
          )}

          {dbState.activeFileName && (
            <button
              type="button"
              onClick={handleCloseScript}
              className="btn-secondary"
              style={{ padding: "6px 12px", fontSize: "12px", color: "var(--accent-danger)" }}
              title="Close current active script"
            >
              <XCircle size={14} />
              <span>Close</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {!dbState.activeFileName ? (
        /* Empty State: No Active Script */
        <div
          style={{
            flex: 1,
            backgroundColor: "var(--bg-surface)",
            border: "1px dashed var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "14px",
            padding: "40px 20px",
            color: "var(--text-muted)",
          }}
        >
          <BookOpen size={48} style={{ color: "var(--text-muted)", opacity: 0.6 }} />
          <div style={{ textAlign: "center", maxWidth: "420px" }}>
            <h3 style={{ color: "var(--text-primary)", fontSize: "16px", marginBottom: "6px" }}>
              No Script Database Loaded
            </h3>
            <p style={{ fontSize: "13px", lineHeight: "1.5", color: "var(--text-muted)" }}>
              Create a new script file, open an existing <code>.json</code> / <code>.jsonl</code> script, or import dialogue entries to enable offline matching, translation memory, and file autosave.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={handleCreateNewScript}
              className="btn-primary"
              style={{ padding: "8px 16px", fontSize: "13px" }}
            >
              <PlusCircle size={15} />
              <span>Create New Script</span>
            </button>
            <button
              onClick={handleOpenScript}
              className="btn-secondary"
              style={{ padding: "8px 16px", fontSize: "13px" }}
            >
              <FolderOpen size={15} />
              <span>Open Existing Script</span>
            </button>
            <button
              onClick={handleImportFromScripts}
              className="btn-secondary"
              style={{
                padding: "8px 16px",
                fontSize: "13px",
                color: "var(--accent-gold)",
                borderColor: "rgba(234, 179, 8, 0.3)",
              }}
            >
              <FileDown size={15} />
              <span>Import from Scripts</span>
            </button>
          </div>
        </div>
      ) : (
        /* Active Script View */
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            minHeight: 0,
          }}
        >
          {/* Action Bar: Search + Add Entry Button + Clear */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            {/* Search Input */}
            <div style={{ position: "relative", flex: 1, minWidth: "240px", maxWidth: "400px" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                type="text"
                className="input-field"
                placeholder="Search dialogue, speaker, or translation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: "32px", width: "100%", fontSize: "12.5px", height: "34px" }}
              />
            </div>

            {/* Total Lines & Action Buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Entries: <strong style={{ color: "var(--text-primary)" }}>{dbState.entries.length}</strong>
              </span>

              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="btn-primary"
                style={{ padding: "6px 12px", fontSize: "12px" }}
              >
                <Plus size={14} />
                <span>{showAddForm ? "Hide Form" : "Add Entry Manual"}</span>
              </button>

              {dbState.entries.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="btn-secondary"
                  style={{ padding: "6px 10px", fontSize: "12px" }}
                  title="Clear all entries"
                >
                  <Trash2 size={13} />
                  <span>Clear All</span>
                </button>
              )}
            </div>
          </div>

          {/* Manual Add Entry Form */}
          {showAddForm && (
            <form
              onSubmit={handleManualAddSubmit}
              style={{
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-active)",
                borderRadius: "var(--radius-md)",
                padding: "14px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--accent-cyan)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Add New Dialogue Entry
              </div>

              {/* Speaker Row (Optional) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                    Speaker (Optional):
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. 坂上 智代"
                    value={addSpeaker}
                    onChange={(e) => setAddSpeaker(e.target.value)}
                    style={{ width: "100%", fontSize: "12.5px", fontFamily: "var(--font-jp)" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                    Translated Speaker (Optional):
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Tomoyo Sakagami"
                    value={addTranslatedSpeaker}
                    onChange={(e) => setAddTranslatedSpeaker(e.target.value)}
                    style={{ width: "100%", fontSize: "12.5px" }}
                  />
                </div>
              </div>

              {/* Message Row (Required) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                    Message / Dialogue (Required):
                  </label>
                  <textarea
                    className="input-field"
                    rows={2}
                    placeholder="e.g. 「…別に、何でもないわ。」"
                    value={addMessage}
                    onChange={(e) => setAddMessage(e.target.value)}
                    style={{ width: "100%", fontSize: "13px", fontFamily: "var(--font-jp)", resize: "vertical" }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                    Translated Message (Required):
                  </label>
                  <textarea
                    className="input-field"
                    rows={2}
                    placeholder="e.g. It's nothing really."
                    value={addTranslatedMessage}
                    onChange={(e) => setAddTranslatedMessage(e.target.value)}
                    style={{ width: "100%", fontSize: "13px", resize: "vertical" }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button type="button" className="btn-secondary" onClick={() => setShowAddForm(false)} style={{ fontSize: "12px", padding: "6px 12px" }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ fontSize: "12px", padding: "6px 16px" }}>
                  <Check size={13} /> Add Entry
                </button>
              </div>
            </form>
          )}

          {/* Entries List */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              width: "100%",
            }}
          >
            {filteredEntries.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "var(--text-muted)",
                  padding: "40px 0",
                  gap: "8px",
                }}
              >
                <Database size={32} style={{ opacity: 0.4 }} />
                <span>
                  {searchQuery ? "No matching dialogue lines found." : "Script is empty. Add entries or play game with Auto-Append enabled."}
                </span>
              </div>
            ) : (
              paginatedEntries.map((entry) => {
                const isEditing = editingId === entry.id;

                if (isEditing) {
                  return (
                    <div
                      key={entry.id}
                      style={{
                        backgroundColor: "var(--bg-surface-elevated)",
                        border: "1px solid var(--accent-gold)",
                        borderRadius: "var(--radius-md)",
                        padding: "12px 14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Speaker (JP)"
                          value={editSpeaker}
                          onChange={(e) => setEditSpeaker(e.target.value)}
                          style={{ fontSize: "12px", fontFamily: "var(--font-jp)" }}
                        />
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Translated Speaker (EN)"
                          value={editTranslatedSpeaker}
                          onChange={(e) => setEditTranslatedSpeaker(e.target.value)}
                          style={{ fontSize: "12px" }}
                        />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        <textarea
                          className="input-field"
                          rows={2}
                          placeholder="Original Dialogue (JP)"
                          value={editMessage}
                          onChange={(e) => setEditMessage(e.target.value)}
                          style={{ fontSize: "12.5px", fontFamily: "var(--font-jp)", resize: "vertical" }}
                        />
                        <textarea
                          className="input-field"
                          rows={2}
                          placeholder="Translated Dialogue (EN)"
                          value={editTranslatedMessage}
                          onChange={(e) => setEditTranslatedMessage(e.target.value)}
                          style={{ fontSize: "12.5px", resize: "vertical" }}
                        />
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(entry.id)}
                          className="btn-primary"
                          style={{ padding: "4px 10px", fontSize: "11.5px" }}
                        >
                          <Check size={12} /> Save
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="btn-secondary"
                          style={{ padding: "4px 8px", fontSize: "11.5px" }}
                        >
                          <X size={12} /> Cancel
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={entry.id}
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      padding: "10px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      transition: "border-color 0.15s ease",
                    }}
                  >
                    {/* Header Row: Speaker (if exists) + Match count + Actions */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {entry.speaker && (
                          <span
                            style={{
                              fontFamily: "var(--font-jp)",
                              fontSize: "12px",
                              fontWeight: 700,
                              color: "var(--accent-gold)",
                              backgroundColor: "rgba(227, 179, 65, 0.1)",
                              padding: "1px 6px",
                              borderRadius: "var(--radius-sm)",
                            }}
                          >
                            {entry.speaker}
                            {entry.translated_speaker && (
                              <span style={{ color: "var(--text-secondary)", fontWeight: 500, marginLeft: "4px", fontFamily: "inherit" }}>
                                ({entry.translated_speaker})
                              </span>
                            )}
                          </span>
                        )}

                        {entry.matchedCount && entry.matchedCount > 0 ? (
                          <span style={{ fontSize: "10.5px", color: "var(--accent-success)", fontWeight: 600 }}>
                            Matched {entry.matchedCount}x
                          </span>
                        ) : null}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(entry)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--text-muted)",
                            padding: "3px",
                          }}
                          title="Edit line"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteEntry(entry.id)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--accent-danger)",
                            padding: "3px",
                          }}
                          title="Delete line"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Dialogue Row */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <div style={{ fontFamily: "var(--font-jp)", fontSize: "13.5px", color: "var(--text-jp)", lineHeight: 1.5 }}>
                        {entry.message}
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500, lineHeight: 1.45 }}>
                        {entry.translated_message}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Pagination Bar */}
          {filteredEntries.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
                padding: "8px 12px",
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                fontSize: "12px",
                color: "var(--text-muted)",
              }}
            >
              {/* Left: Summary */}
              <div>
                Showing{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {((safePage - 1) * pageSize) + 1}
                </strong>
                -
                <strong style={{ color: "var(--text-primary)" }}>
                  {Math.min(safePage * pageSize, filteredEntries.length)}
                </strong>{" "}
                of{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {filteredEntries.length.toLocaleString()}
                </strong>{" "}
                entries
              </div>

              {/* Center: Controls */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={safePage <= 1}
                  className="btn-secondary"
                  style={{ padding: "4px 6px", fontSize: "11px", opacity: safePage <= 1 ? 0.4 : 1 }}
                  title="First Page"
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="btn-secondary"
                  style={{ padding: "4px 8px", fontSize: "11px", opacity: safePage <= 1 ? 0.4 : 1 }}
                  title="Previous Page"
                >
                  <ChevronLeft size={14} />
                  <span>Prev</span>
                </button>

                <span style={{ padding: "0 6px", fontWeight: 600, color: "var(--text-primary)" }}>
                  Page {safePage} of {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="btn-secondary"
                  style={{ padding: "4px 8px", fontSize: "11px", opacity: safePage >= totalPages ? 0.4 : 1 }}
                  title="Next Page"
                >
                  <span>Next</span>
                  <ChevronRight size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={safePage >= totalPages}
                  className="btn-secondary"
                  style={{ padding: "4px 6px", fontSize: "11px", opacity: safePage >= totalPages ? 0.4 : 1 }}
                  title="Last Page"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>

              {/* Right: Page Size Selector */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="input-field"
                  style={{ padding: "2px 26px 2px 8px", fontSize: "11.5px", height: "26px", minWidth: "75px", cursor: "pointer" }}
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={500}>500</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClearAll}
        title="Clear All Script Entries"
        variant="danger"
        confirmText="Delete All Entries"
        message="Are you sure you want to delete all entries from the currently active script? This action cannot be undone."
      />
    </div>
  );
};
