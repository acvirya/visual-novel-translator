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
  Loader2,
  ChevronRight,
} from "lucide-react";
import { settingsManager } from "../../services/settingsManager";
import { vndbService, VndbSearchResult, VndbCharacterResult } from "../../services/vndbService";
import {
  VndbTraitFilterOptions,
  DEFAULT_VNDB_TRAIT_FILTERS,
  filterPersonalityTraits,
  formatCharacterNotes,
} from "../../utils/vndbTraitFilter";
import { useToast } from "../common/ToastProvider";

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

  // Category Manager Toggle & Form State
  const [showCategoryManager, setShowCategoryManager] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>("");
  const [newCatDesc, setNewCatDesc] = useState<string>("");

  // Editing Glossary Entry State
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editOriginal, setEditOriginal] = useState<string>("");
  const [editTranslation, setEditTranslation] = useState<string>("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");

  // VNDB Importer Modal State
  const [showVndbModal, setShowVndbModal] = useState<boolean>(false);
  const [vndbQuery, setVndbQuery] = useState<string>("");
  const [isSearchingVndb, setIsSearchingVndb] = useState<boolean>(false);
  const [vndbSearchResults, setVndbSearchResults] = useState<VndbSearchResult[]>([]);
  const [selectedVn, setSelectedVn] = useState<VndbSearchResult | null>(null);
  const [isLoadingCharacters, setIsLoadingCharacters] = useState<boolean>(false);
  const [vndbCharacters, setVndbCharacters] = useState<VndbCharacterResult[]>([]);
  const [vndbError, setVndbError] = useState<string | null>(null);
  const [vndbSuccessMsg, setVndbSuccessMsg] = useState<string | null>(null);
  const [traitFilters, setTraitFilters] = useState<VndbTraitFilterOptions>(() => {
    try {
      const saved = localStorage.getItem("vn_vndb_trait_filters");
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_VNDB_TRAIT_FILTERS;
  });

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
  const handleAddCategory = () => {
    const trimmedName = newCatName.trim();
    if (!trimmedName) return;
    if (categories.some((c) => c.name.toLowerCase() === trimmedName.toLowerCase())) return;

    const newCategoryItem: GlossaryCategory = {
      id: `c_${Date.now()}`,
      name: trimmedName,
      description: newCatDesc.trim() || "-",
    };

    setCategories([...categories, newCategoryItem]);
    setNewCatName("");
    setNewCatDesc("");
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

  // --- VNDB Importer Handlers ---
  const handleOpenVndbModal = () => {
    setShowVndbModal(true);
    setVndbError(null);
    setVndbSuccessMsg(null);
  };

  const handleSearchVndb = async () => {
    if (!vndbQuery.trim()) return;
    setIsSearchingVndb(true);
    setVndbError(null);
    setSelectedVn(null);
    setVndbCharacters([]);

    try {
      const results = await vndbService.searchVn(vndbQuery);
      setVndbSearchResults(results);
      if (results.length === 0) {
        setVndbError("No visual novels found matching this query.");
      }
    } catch (err: any) {
      setVndbError(`Failed to search VNDB: ${err?.message || err}`);
    } finally {
      setIsSearchingVndb(false);
    }
  };

  const handleUpdateTraitFilter = (key: keyof VndbTraitFilterOptions, val: boolean) => {
    const next = { ...traitFilters, [key]: val };
    setTraitFilters(next);
    try {
      localStorage.setItem("vn_vndb_trait_filters", JSON.stringify(next));
    } catch {}

    // Dynamically re-filter currently loaded characters in place
    setVndbCharacters((prev) =>
      prev.map((c) => {
        const personality = filterPersonalityTraits(c.rawTraits || [], next);
        const notes = formatCharacterNotes(c.role, c.gender, personality);
        return {
          ...c,
          personality,
          notes,
        };
      })
    );
  };

  const handleSelectVn = async (vn: VndbSearchResult) => {
    setSelectedVn(vn);
    setIsLoadingCharacters(true);
    setVndbError(null);

    try {
      const chars = await vndbService.fetchCharacters(vn.id, traitFilters);
      setVndbCharacters(chars);
      if (chars.length === 0) {
        setVndbError(`No character entries found for "${vn.title}" on VNDB.`);
      }
    } catch (err: any) {
      setVndbError(`Failed to load characters: ${err?.message || err}`);
    } finally {
      setIsLoadingCharacters(false);
    }
  };

  const handleToggleCharacter = (charId: string) => {
    setVndbCharacters((prev) =>
      prev.map((c) => (c.id === charId ? { ...c, selected: !c.selected } : c))
    );
  };

  const handleSelectAllCharacters = (mode: "all" | "main_only" | "none") => {
    setVndbCharacters((prev) =>
      prev.map((c) => {
        if (mode === "all") return { ...c, selected: true };
        if (mode === "none") return { ...c, selected: false };
        return { ...c, selected: c.role === "main" || c.role === "primary" };
      })
    );
  };

  const handleUpdateCharTranslation = (charId: string, newTrans: string) => {
    setVndbCharacters((prev) =>
      prev.map((c) => (c.id === charId ? { ...c, name: newTrans } : c))
    );
  };

  const handleImportSelectedCharacters = () => {
    const selected = vndbCharacters.filter((c) => c.selected && (c.original || c.name));
    if (selected.length === 0) return;

    let addedCount = 0;
    const newEntries: GlossaryEntry[] = [];

    selected.forEach((c) => {
      const orig = (c.original || c.name).trim();
      const trans = c.name.trim();

      // Check if entry with same Japanese original already exists
      const existingIdx = entries.findIndex((e) => e.original.toLowerCase() === orig.toLowerCase());
      if (existingIdx === -1) {
        newEntries.push({
          id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          original: orig,
          translation: trans,
          category: "Name",
          notes: c.notes || (selectedVn ? `From ${selectedVn.title}` : undefined),
        });
        addedCount++;
      }
    });

    if (newEntries.length > 0) {
      setEntries((prev) => [...newEntries, ...prev]);
    }

    toast.success(`Successfully imported ${addedCount} character(s) into your Glossary!`, "VNDB Import");
    setShowVndbModal(false);
    setVndbSuccessMsg(null);
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
            onClick={handleOpenVndbModal}
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
      {showCategoryManager && (
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--accent-primary)",
            borderRadius: "var(--radius-md)",
            padding: "14px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
              Category Management
            </span>
            <button
              onClick={() => setShowCategoryManager(false)}
              className="btn-secondary"
              style={{ padding: "3px 8px" }}
            >
              <X size={13} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: "8px" }}>
            <input
              type="text"
              className="input-field"
              placeholder="Category Name (e.g. Artifact, Spell)..."
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              style={{ fontSize: "12px", padding: "6px 10px" }}
            />
            <input
              type="text"
              className="input-field"
              placeholder="Description (e.g. Special magic relics and weapons)..."
              value={newCatDesc}
              onChange={(e) => setNewCatDesc(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
              style={{ fontSize: "12px", padding: "6px 10px" }}
            />
            <button
              type="button"
              onClick={handleAddCategory}
              className="btn-primary"
              disabled={!newCatName.trim()}
              style={{ padding: "6px 14px", fontSize: "12px" }}
            >
              <Plus size={13} />
              <span>Add Category</span>
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "4px" }}>
            {categories.map((cat) => (
              <div
                key={cat.id}
                style={{
                  backgroundColor: "var(--bg-surface-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "4px 8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "11.5px",
                }}
              >
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{cat.name}</span>
                <span style={{ color: "var(--text-muted)", fontSize: "10.5px" }}>({cat.description})</span>
                <button
                  onClick={() => handleDeleteCategory(cat.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "1px" }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* VNDB Character Importer Modal */}
      {showVndbModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={() => setShowVndbModal(false)}
        >
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-lg)",
              width: "800px",
              maxWidth: "95vw",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "14px 18px",
                backgroundColor: "var(--bg-surface-elevated)",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Globe size={18} style={{ color: "var(--accent-cyan)" }} />
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                  Import Characters from VNDB (Visual Novel Database)
                </span>
              </div>
              <button
                onClick={() => setShowVndbModal(false)}
                className="btn-secondary"
                style={{ padding: "4px 8px" }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Search Input Bar */}
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)", backgroundColor: "var(--bg-app)" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Enter Visual Novel title or VNDB ID/URL (e.g. Clannad, Fate/stay night, or v17)..."
                  value={vndbQuery}
                  onChange={(e) => setVndbQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchVndb()}
                  style={{ flex: 1, fontSize: "12.5px", padding: "8px 12px" }}
                  autoFocus
                />
                <button
                  onClick={handleSearchVndb}
                  disabled={isSearchingVndb || !vndbQuery.trim()}
                  className="btn-primary"
                  style={{ padding: "8px 18px", fontSize: "12.5px" }}
                >
                  {isSearchingVndb ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  <span>Search VNDB</span>
                </button>
              </div>

              {vndbError && (
                <div style={{ color: "var(--accent-danger)", fontSize: "11.5px", marginTop: "8px" }}>
                  {vndbError}
                </div>
              )}
              {vndbSuccessMsg && (
                <div style={{ color: "var(--accent-success)", fontSize: "11.5px", marginTop: "8px", fontWeight: 600 }}>
                  {vndbSuccessMsg}
                </div>
              )}
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {!selectedVn ? (
                // Step 1: Visual Novel Search Results
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>
                    Search Results ({vndbSearchResults.length}):
                  </div>

                  {vndbSearchResults.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)", fontSize: "12px" }}>
                      Search by title or enter a VNDB ID above to find characters.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {vndbSearchResults.map((vn) => (
                        <div
                          key={vn.id}
                          style={{
                            backgroundColor: "var(--bg-surface-elevated)",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "var(--radius-md)",
                            padding: "10px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                            {vn.imageUrl ? (
                              <img
                                src={vn.imageUrl}
                                alt={vn.title}
                                style={{ width: "40px", height: "52px", objectFit: "cover", borderRadius: "3px" }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: "40px",
                                  height: "52px",
                                  backgroundColor: "var(--bg-app)",
                                  borderRadius: "3px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "var(--text-muted)",
                                }}
                              >
                                VN
                              </div>
                            )}

                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {vn.title}
                              </div>
                              {vn.alttitle && (
                                <div style={{ fontSize: "11.5px", fontFamily: "var(--font-jp)", color: "var(--accent-gold)" }}>
                                  {vn.alttitle}
                                </div>
                              )}
                              <div style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: "2px" }}>
                                ID: <span style={{ color: "var(--accent-cyan)" }}>{vn.id}</span>
                                {vn.released && ` • Released: ${vn.released}`}
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => handleSelectVn(vn)}
                            className="btn-primary"
                            style={{ padding: "6px 14px", fontSize: "12px", whiteSpace: "nowrap" }}
                          >
                            <span>Select & Load Characters</span>
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                // Step 2: Character Selection List for chosen VN
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {/* Chosen VN Banner */}
                  <div
                    style={{
                      backgroundColor: "var(--bg-surface-elevated)",
                      border: "1px solid var(--accent-cyan)",
                      borderRadius: "var(--radius-sm)",
                      padding: "8px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Selected VN:</span>{" "}
                      <strong style={{ fontSize: "12.5px", color: "var(--text-primary)" }}>{selectedVn.title}</strong>{" "}
                      <span style={{ fontSize: "11px", color: "var(--accent-cyan)" }}>({selectedVn.id})</span>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedVn(null);
                        setVndbCharacters([]);
                      }}
                      className="btn-secondary"
                      style={{ padding: "3px 8px", fontSize: "11px" }}
                    >
                      Change Visual Novel
                    </button>
                  </div>

                  {/* Personality Trait Filter Options (Token Optimization) */}
                  <div
                    style={{
                      backgroundColor: "var(--bg-app)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      padding: "8px 12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.3px" }}>
                        LLM Personality Token Optimization (Trait Filter):
                      </span>
                      <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                        Filters out obvious/redundant traits to save LLM tokens & prevent prompt pollution
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", fontSize: "11px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", color: "var(--text-primary)" }}>
                        <input
                          type="checkbox"
                          checked={traitFilters.filterTalkingPatterns}
                          onChange={(e) => handleUpdateTraitFilter("filterTalkingPatterns", e.target.checked)}
                          style={{ accentColor: "var(--accent-cyan)", cursor: "pointer" }}
                        />
                        <span>Filter Talking Patterns & Pronouns (Watashi, Boku, Third Person, Desu)</span>
                      </label>

                      <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", color: "var(--text-primary)" }}>
                        <input
                          type="checkbox"
                          checked={traitFilters.filterDialects}
                          onChange={(e) => handleUpdateTraitFilter("filterDialects", e.target.checked)}
                          style={{ accentColor: "var(--accent-cyan)", cursor: "pointer" }}
                        />
                        <span>Filter Dialects (Kansai-ben, Archaic, Gyaru)</span>
                      </label>

                      <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", color: "var(--text-primary)" }}>
                        <input
                          type="checkbox"
                          checked={traitFilters.filterReligiousBeliefs}
                          onChange={(e) => handleUpdateTraitFilter("filterReligiousBeliefs", e.target.checked)}
                          style={{ accentColor: "var(--accent-cyan)", cursor: "pointer" }}
                        />
                        <span>Filter Religious Beliefs (Atheist, Agnostic)</span>
                      </label>
                    </div>
                  </div>

                  {/* Character Filters & Selection Actions */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                      Found <strong>{vndbCharacters.length}</strong> characters (<strong>{vndbCharacters.filter((c) => c.selected).length}</strong> selected):
                    </div>

                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={() => handleSelectAllCharacters("all")}
                        className="btn-secondary"
                        style={{ padding: "3px 8px", fontSize: "11px" }}
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => handleSelectAllCharacters("main_only")}
                        className="btn-secondary"
                        style={{ padding: "3px 8px", fontSize: "11px" }}
                      >
                        Main & Primary Only
                      </button>
                      <button
                        onClick={() => handleSelectAllCharacters("none")}
                        className="btn-secondary"
                        style={{ padding: "3px 8px", fontSize: "11px" }}
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  {/* Characters Table */}
                  <div
                    style={{
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      maxHeight: "260px",
                      overflowY: "auto",
                      backgroundColor: "var(--bg-app)",
                    }}
                  >
                    {isLoadingCharacters ? (
                      <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)", fontSize: "12px" }}>
                        <Loader2 size={18} className="animate-spin" style={{ margin: "0 auto 6px auto" }} />
                        <span>Loading characters from VNDB...</span>
                      </div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px" }}>
                        <thead>
                          <tr style={{ backgroundColor: "var(--bg-surface-elevated)", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-secondary)", textAlign: "left", position: "sticky", top: 0, zIndex: 2 }}>
                            <th style={{ padding: "6px 10px", width: "40px", textAlign: "center" }}>✓</th>
                            <th style={{ padding: "6px 10px", width: "24%" }}>Japanese Name</th>
                            <th style={{ padding: "6px 10px", width: "28%" }}>English Translation (Editable)</th>
                            <th style={{ padding: "6px 10px" }}>Notes / Role, Gender & Personality (Editable)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vndbCharacters.map((char) => (
                            <tr
                              key={char.id}
                              style={{
                                borderBottom: "1px solid rgba(255,255,255,0.03)",
                                backgroundColor: char.selected ? "rgba(56, 189, 248, 0.04)" : "transparent",
                              }}
                            >
                              <td style={{ padding: "6px 10px", textAlign: "center" }}>
                                <input
                                  type="checkbox"
                                  checked={!!char.selected}
                                  onChange={() => handleToggleCharacter(char.id)}
                                  style={{ accentColor: "var(--accent-cyan)", cursor: "pointer" }}
                                />
                              </td>
                              <td style={{ padding: "6px 10px", fontFamily: "var(--font-jp)", color: "var(--accent-gold)", fontWeight: 600 }}>
                                {char.original || char.name}
                              </td>
                              <td style={{ padding: "6px 10px" }}>
                                <input
                                  type="text"
                                  className="input-field"
                                  value={char.name}
                                  onChange={(e) => handleUpdateCharTranslation(char.id, e.target.value)}
                                  style={{ width: "100%", fontSize: "11.5px", padding: "2px 6px" }}
                                />
                              </td>
                              <td style={{ padding: "6px 10px" }}>
                                <input
                                  type="text"
                                  className="input-field"
                                  value={char.notes || ""}
                                  placeholder="e.g. Role: Main, Female | Personality: Cheerful, Mischievous"
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setVndbCharacters((prev) =>
                                      prev.map((c) => (c.id === char.id ? { ...c, notes: val } : c))
                                    );
                                  }}
                                  style={{ width: "100%", fontSize: "11px", padding: "2px 6px" }}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "12px 18px",
                backgroundColor: "var(--bg-surface-elevated)",
                borderTop: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button onClick={() => setShowVndbModal(false)} className="btn-secondary" style={{ padding: "6px 14px", fontSize: "12px" }}>
                Cancel
              </button>
              {selectedVn && (
                <button
                  onClick={handleImportSelectedCharacters}
                  disabled={vndbCharacters.filter((c) => c.selected).length === 0}
                  className="btn-primary"
                  style={{ padding: "6px 16px", fontSize: "12px" }}
                >
                  <Plus size={13} />
                  <span>Import {vndbCharacters.filter((c) => c.selected).length} Character(s)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
