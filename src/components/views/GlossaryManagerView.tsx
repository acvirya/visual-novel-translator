import React, { useState, useEffect } from "react";
import { GlossaryEntry } from "../../types";
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  Check,
  X,
  Tag,
  BookOpen,
  Globe,
} from "lucide-react";
import { settingsManager } from "../../services/settingsManager";
import { useToast } from "../common/ToastProvider";
import { VndbImporterModal } from "./glossary/VndbImporterModal";
import { CategoryManagerPanel } from "./glossary/CategoryManagerPanel";

export interface GlossaryCategory {
  id: string;
  name: string;
  description: string;
}

const INITIAL_CATEGORIES: GlossaryCategory[] = [
  { id: "c_1", name: "Name", description: "Character first & last names, nicknames" },
  { id: "c_2", name: "Place", description: "Locations, towns, landmarks, and school rooms" },
  { id: "c_3", name: "Honorific", description: "Japanese suffixes (senpai, chan, kun, sama)" },
  { id: "c_4", name: "Term", description: "In-game lore, concepts, items, and story keywords" },
  { id: "c_5", name: "Skill/Ability", description: "Special attacks, magic spells, and combat powers" },
  { id: "c_6", name: "Organization", description: "Clubs, student councils, factions, and guilds" },
];

const DUMMY_GLOSSARY: GlossaryEntry[] = [
  { id: "g_1", original: "坂上 智代", translation: "Tomoyo Sakagami", category: "Name", notes: "Main heroine, student council president" },
  { id: "g_2", original: "岡崎 朋也", translation: "Tomoya Okazaki", category: "Name", notes: "Protagonist" },
  { id: "g_3", original: "古河 渚", translation: "Nagisa Furukawa", category: "Name", notes: "Heroine, drama club founder" },
  { id: "g_4", original: "先輩", translation: "Senpai", category: "Honorific", notes: "Preserve honorific in English translation" },
  { id: "g_5", original: "演劇部", translation: "Drama Club", category: "Term", notes: "School drama club" },
  { id: "g_6", original: "光坂", translation: "Hikarizaka", category: "Place", notes: "Town / school location name" },
  { id: "g_7", original: "生徒会", translation: "Student Council", category: "Organization", notes: "High school student government" },
];

export const GlossaryManagerView: React.FC = () => {
  const toast = useToast();
  const [entries, setEntries] = useState<GlossaryEntry[]>(() => {
    try {
      const saved = localStorage.getItem("vn_glossary_entries_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn("Failed to load glossary entries:", e);
    }
    return DUMMY_GLOSSARY;
  });

  const [categories, setCategories] = useState<GlossaryCategory[]>(() => {
    try {
      const saved = localStorage.getItem("vn_glossary_categories_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn("Failed to load glossary categories:", e);
    }
    return INITIAL_CATEGORIES;
  });

  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Quick Add Term Form State
  const [newOriginal, setNewOriginal] = useState<string>("");
  const [newTranslation, setNewTranslation] = useState<string>("");
  const [newCategory, setNewCategory] = useState<string>("Name");
  const [newNotes, setNewNotes] = useState<string>("");

  // Category Manager Toggle State
  const [showCategoryManager, setShowCategoryManager] = useState<boolean>(false);

  // Editing Glossary Entry State
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editOriginal, setEditOriginal] = useState<string>("");
  const [editTranslation, setEditTranslation] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");

  // VNDB Importer Modal State
  const [showVndbModal, setShowVndbModal] = useState<boolean>(false);

  // Auto-Save Effect
  useEffect(() => {
    try {
      localStorage.setItem("vn_glossary_entries_v1", JSON.stringify(entries));
      localStorage.setItem("vn_glossary_categories_v1", JSON.stringify(categories));
      settingsManager.updateGlossary({
        terms: entries.map((e) => ({
          id: e.id,
          original: e.original,
          translation: e.translation,
          category: e.category,
          notes: e.notes,
          isEnabled: true,
        })),
      });
    } catch (e) {
      console.error("Failed to auto-save glossary:", e);
    }
  }, [entries, categories]);

  const filteredEntries = entries.filter((e) => {
    const matchesSearch =
      e.original.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.translation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.notes && e.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory =
      selectedCategoryFilter === "All" || e.category === selectedCategoryFilter;

    return matchesSearch && matchesCategory;
  });

  // --- Glossary Term Handlers ---
  const handleAddEntry = () => {
    if (!newOriginal.trim() || !newTranslation.trim()) return;
    const newEntry: GlossaryEntry = {
      id: `g_${Date.now()}`,
      original: newOriginal.trim(),
      translation: newTranslation.trim(),
      category: newCategory,
      notes: newNotes.trim() || undefined,
    };
    setEntries([newEntry, ...entries]);
    setNewOriginal("");
    setNewTranslation("");
    setNewNotes("");
  };

  const handleStartEditEntry = (entry: GlossaryEntry) => {
    setEditingEntryId(entry.id);
    setEditOriginal(entry.original);
    setEditTranslation(entry.translation);
    setEditCategory(entry.category);
    setEditNotes(entry.notes || "");
  };

  const handleSaveEditEntry = (id: string) => {
    if (!editOriginal.trim() || !editTranslation.trim()) return;
    setEntries(
      entries.map((e) =>
        e.id === id
          ? {
              ...e,
              original: editOriginal.trim(),
              translation: editTranslation.trim(),
              category: editCategory,
              notes: editNotes.trim() || undefined,
            }
          : e
      )
    );
    setEditingEntryId(null);
  };

  const handleDeleteEntry = (id: string) => {
    setEntries(entries.filter((e) => e.id !== id));
    if (editingEntryId === id) setEditingEntryId(null);
  };

  // --- Category Handlers ---
  const handleAddCategory = (name: string, description: string) => {
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    const newCategoryItem: GlossaryCategory = {
      id: `c_${Date.now()}`,
      name,
      description,
    };
    setCategories([...categories, newCategoryItem]);
  };

  const handleDeleteCategory = (catId: string) => {
    const catToDelete = categories.find((c) => c.id === catId);
    if (!catToDelete) return;
    const catName = catToDelete.name;

    // Remove category
    setCategories(categories.filter((c) => c.id !== catId));

    // Cascade delete associated terms
    setEntries(entries.filter((e) => e.category !== catName));

    if (selectedCategoryFilter === catName) setSelectedCategoryFilter("All");
    if (newCategory === catName) {
      const remaining = categories.filter((c) => c.id !== catId);
      setNewCategory(remaining.length > 0 ? remaining[0].name : "Name");
    }
  };

  const handleImportVndbEntries = (newEntries: GlossaryEntry[]) => {
    if (newEntries.length > 0) {
      setEntries((prev) => [...newEntries, ...prev]);
    }
    toast.success(`Successfully imported ${newEntries.length} character(s) into your Glossary!`, "VNDB Import");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: "14px" }}>
      {/* Top Header Card */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "rgba(56, 189, 248, 0.1)",
              border: "1px solid rgba(56, 189, 248, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent-cyan)",
            }}
          >
            <BookOpen size={18} />
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
              Character & Terms Glossary
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              {entries.length} terms active • Automatically injected into Live & Batch LLM system prompts
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => setShowVndbModal(true)}
            className="btn-primary"
            style={{ padding: "6px 14px", fontSize: "12px", backgroundColor: "#1e3a8a", borderColor: "#3b82f6" }}
          >
            <Globe size={14} />
            <span>Import from VNDB</span>
          </button>
          <button
            onClick={() => setShowCategoryManager(!showCategoryManager)}
            className={showCategoryManager ? "btn-primary" : "btn-secondary"}
            style={{ padding: "6px 12px", fontSize: "12px" }}
          >
            <Tag size={14} />
            <span>Categories ({categories.length})</span>
          </button>
        </div>
      </div>

      {/* Category Manager Toggle Card */}
      <CategoryManagerPanel
        isOpen={showCategoryManager}
        onClose={() => setShowCategoryManager(false)}
        categories={categories}
        onAddCategory={handleAddCategory}
        onDeleteCategory={handleDeleteCategory}
      />

      {/* Main Glossary Table Area */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "14px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Quick Add Term Row */}
        <div
          style={{
            backgroundColor: "var(--bg-surface-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            padding: "10px",
            display: "grid",
            gridTemplateColumns: "1.2fr 1.2fr 130px 1.5fr auto",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <input
            type="text"
            className="input-field"
            placeholder="Japanese Term / Name (e.g. 坂上 智代)"
            value={newOriginal}
            onChange={(e) => setNewOriginal(e.target.value)}
            style={{ fontFamily: "var(--font-jp)", fontSize: "12px", padding: "6px 8px" }}
          />
          <input
            type="text"
            className="input-field"
            placeholder="English Translation (e.g. Tomoyo Sakagami)"
            value={newTranslation}
            onChange={(e) => setNewTranslation(e.target.value)}
            style={{ fontSize: "12px", padding: "6px 8px" }}
          />
          <select
            className="input-field"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            style={{ fontSize: "12px", padding: "6px 28px 6px 10px", minWidth: "140px" }}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="input-field"
            placeholder="Notes / Context (Optional)"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddEntry()}
            style={{ fontSize: "12px", padding: "6px 8px" }}
          />
          <button
            type="button"
            onClick={handleAddEntry}
            disabled={!newOriginal.trim() || !newTranslation.trim()}
            className="btn-primary"
            style={{ padding: "6px 14px", fontSize: "12px" }}
          >
            <Plus size={13} />
            <span>Add Term</span>
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
          <div style={{ display: "flex", gap: "6px", overflowX: "auto" }}>
            <button
              onClick={() => setSelectedCategoryFilter("All")}
              className={selectedCategoryFilter === "All" ? "btn-primary" : "btn-secondary"}
              style={{ padding: "4px 10px", fontSize: "11px", borderRadius: "12px" }}
            >
              All ({entries.length})
            </button>
            {categories.map((c) => {
              const count = entries.filter((e) => e.category === c.name).length;
              return (
                <button
                  key={`filter_${c.id}`}
                  onClick={() => setSelectedCategoryFilter(c.name)}
                  className={selectedCategoryFilter === c.name ? "btn-primary" : "btn-secondary"}
                  style={{ padding: "4px 10px", fontSize: "11px", borderRadius: "12px" }}
                >
                  {c.name} ({count})
                </button>
              );
            })}
          </div>

          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search glossary terms..."
              className="input-field"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "200px", fontSize: "11.5px", padding: "4px 8px 4px 24px" }}
            />
            <Search size={12} style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          </div>
        </div>

        {/* Glossary Table */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--bg-app)",
          }}
        >
          {filteredEntries.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
              No glossary entries found. Add your first term above or import characters from VNDB.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ backgroundColor: "var(--bg-surface-elevated)", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-secondary)", textAlign: "left", position: "sticky", top: 0, zIndex: 2 }}>
                  <th style={{ padding: "8px 12px", width: "25%" }}>Japanese Original</th>
                  <th style={{ padding: "8px 12px", width: "25%" }}>English Translation</th>
                  <th style={{ padding: "8px 12px", width: "120px" }}>Category</th>
                  <th style={{ padding: "8px 12px" }}>Context / Notes</th>
                  <th style={{ padding: "8px 12px", width: "70px", textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => {
                  const isEditing = editingEntryId === entry.id;
                  return (
                    <tr key={entry.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                      {isEditing ? (
                        <>
                          <td style={{ padding: "6px 10px" }}>
                            <input
                              type="text"
                              className="input-field"
                              value={editOriginal}
                              onChange={(e) => setEditOriginal(e.target.value)}
                              style={{ width: "100%", fontFamily: "var(--font-jp)", fontSize: "12px", padding: "4px 6px" }}
                            />
                          </td>
                          <td style={{ padding: "6px 10px" }}>
                            <input
                              type="text"
                              className="input-field"
                              value={editTranslation}
                              onChange={(e) => setEditTranslation(e.target.value)}
                              style={{ width: "100%", fontSize: "12px", padding: "4px 6px" }}
                            />
                          </td>
                          <td style={{ padding: "6px 10px" }}>
                            <select
                              className="input-field"
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                              style={{ width: "100%", fontSize: "11.5px", padding: "4px 28px 4px 8px", minWidth: "130px" }}
                            >
                              {categories.map((c) => (
                                <option key={c.id} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: "6px 10px" }}>
                            <input
                              type="text"
                              className="input-field"
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              style={{ width: "100%", fontSize: "12px", padding: "4px 6px" }}
                            />
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "center" }}>
                            <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                              <button
                                onClick={() => handleSaveEditEntry(entry.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-success)", padding: "2px" }}
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => setEditingEntryId(null)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px" }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: "8px 12px", fontFamily: "var(--font-jp)", color: "var(--accent-gold)", fontWeight: 600 }}>
                            {entry.original}
                          </td>
                          <td style={{ padding: "8px 12px", color: "var(--text-primary)", fontWeight: 500 }}>
                            {entry.translation}
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "10.5px",
                                backgroundColor: "var(--bg-surface-elevated)",
                                border: "1px solid var(--border-subtle)",
                                color: "var(--text-secondary)",
                              }}
                            >
                              {entry.category}
                            </span>
                          </td>
                          <td style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: "11.5px" }}>
                            {entry.notes || "—"}
                          </td>
                          <td style={{ padding: "8px 12px", textAlign: "center" }}>
                            <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                              <button
                                onClick={() => handleStartEditEntry(entry)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px" }}
                                title="Edit term"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteEntry(entry.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px" }}
                                title="Delete term"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <VndbImporterModal
        isOpen={showVndbModal}
        onClose={() => setShowVndbModal(false)}
        onImport={handleImportVndbEntries}
        existingEntries={entries}
      />
    </div>
  );
};
