import React, { useState } from "react";
import { GlossaryEntry } from "../../types";
import {
  Plus,
  Search,
  Trash2,
  Upload,
  Download,
  Pencil,
  Check,
  X,
  Tag,
  BookOpen,
} from "lucide-react";

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
  const [entries, setEntries] = useState<GlossaryEntry[]>(DUMMY_GLOSSARY);
  const [categories, setCategories] = useState<GlossaryCategory[]>(INITIAL_CATEGORIES);
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

  // Editing Category State
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState<string>("");
  const [editCatDesc, setEditCatDesc] = useState<string>("");

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

  const handleStartEditCategory = (cat: GlossaryCategory) => {
    setEditingCatId(cat.id);
    setEditCatName(cat.name);
    setEditCatDesc(cat.description);
  };

  const handleSaveEditCategory = (catId: string) => {
    const trimmedName = editCatName.trim();
    if (!trimmedName) return;

    const oldCat = categories.find((c) => c.id === catId);
    if (!oldCat) return;
    const oldName = oldCat.name;

    // Update categories list
    setCategories(
      categories.map((c) =>
        c.id === catId ? { ...c, name: trimmedName, description: editCatDesc.trim() || "-" } : c
      )
    );

    // Cascade rename on glossary entries
    if (oldName !== trimmedName) {
      setEntries(
        entries.map((e) => (e.category === oldName ? { ...e, category: trimmedName } : e))
      );
      if (selectedCategoryFilter === oldName) setSelectedCategoryFilter(trimmedName);
      if (newCategory === oldName) setNewCategory(trimmedName);
    }

    setEditingCatId(null);
  };

  const handleDeleteCategory = (catToDelete: GlossaryCategory) => {
    // Delete category
    setCategories(categories.filter((c) => c.id !== catToDelete.id));

    // Cascade delete: items belonging to this category are also removed!
    setEntries(entries.filter((e) => e.category !== catToDelete.name));

    if (selectedCategoryFilter === catToDelete.name) setSelectedCategoryFilter("All");
    if (newCategory === catToDelete.name && categories.length > 1) {
      const fallback = categories.find((c) => c.id !== catToDelete.id);
      if (fallback) setNewCategory(fallback.name);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* Top Search & Actions Bar */}
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
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: "260px" }}>
          <Search size={15} style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            placeholder="Search Japanese term, translation, category, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setShowCategoryManager(!showCategoryManager)}
            className={showCategoryManager ? "btn-primary" : "btn-secondary"}
          >
            <Tag size={14} />
            <span>Manage Categories ({categories.length})</span>
          </button>
          <button className="btn-secondary">
            <Upload size={14} />
            <span>Import</span>
          </button>
          <button className="btn-secondary">
            <Download size={14} />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Category Management Table Card (Toggleable) */}
      {showCategoryManager && (
        <div
          className="card"
          style={{
            margin: 0,
            padding: 0,
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--accent-primary)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              backgroundColor: "var(--bg-surface-elevated)",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <div>
              <span className="card-title" style={{ fontSize: "13.5px" }}>
                <Tag size={15} style={{ color: "var(--accent-cyan)" }} /> Category Management
              </span>
              <span className="card-subtitle" style={{ fontSize: "11px" }}>
                Note: Deleting a category will also delete all terms linked to it.
              </span>
            </div>
            <button
              onClick={() => setShowCategoryManager(false)}
              className="btn-secondary"
              style={{ padding: "4px 8px" }}
              title="Close Category Manager"
            >
              <X size={13} />
            </button>
          </div>

          {/* Quick Add Category Row */}
          <div
            style={{
              padding: "12px 16px",
              backgroundColor: "var(--bg-app)",
              borderBottom: "1px solid var(--border-subtle)",
              display: "grid",
              gridTemplateColumns: "1fr 2fr auto",
              gap: "10px",
              alignItems: "center",
            }}
          >
            <input
              type="text"
              placeholder="Category Name (e.g. Artifact, Spell)..."
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Description (e.g. Special magic relics and weapons)..."
              value={newCatDesc}
              onChange={(e) => setNewCatDesc(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
            />
            <button onClick={handleAddCategory} className="btn-primary" style={{ padding: "7px 14px", whiteSpace: "nowrap" }}>
              <Plus size={14} />
              <span>Add Category</span>
            </button>
          </div>

          {/* Category Table */}
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
            <thead>
              <tr style={{ backgroundColor: "var(--bg-surface-elevated)", borderBottom: "1px solid var(--border-subtle)" }}>
                <th style={{ padding: "8px 14px", width: "180px", color: "var(--text-muted)", fontSize: "12px" }}>Category Name</th>
                <th style={{ padding: "8px 14px", color: "var(--text-muted)", fontSize: "12px" }}>Description</th>
                <th style={{ padding: "8px 14px", width: "110px", color: "var(--text-muted)", fontSize: "12px", textAlign: "center" }}>Item Count</th>
                <th style={{ padding: "8px 14px", width: "90px", color: "var(--text-muted)", fontSize: "12px", textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const itemCount = entries.filter((e) => e.category === cat.name).length;
                const isEditing = editingCatId === cat.id;

                return (
                  <tr key={cat.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    {isEditing ? (
                      <>
                        <td style={{ padding: "6px 10px" }}>
                          <input
                            type="text"
                            value={editCatName}
                            onChange={(e) => setEditCatName(e.target.value)}
                            style={{ width: "100%", fontSize: "12.5px" }}
                          />
                        </td>
                        <td style={{ padding: "6px 10px" }}>
                          <input
                            type="text"
                            value={editCatDesc}
                            onChange={(e) => setEditCatDesc(e.target.value)}
                            style={{ width: "100%", fontSize: "12.5px" }}
                          />
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
                          {itemCount} terms
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "center" }}>
                          <div style={{ display: "inline-flex", gap: "4px" }}>
                            <button
                              onClick={() => handleSaveEditCategory(cat.id)}
                              className="btn-primary"
                              style={{ padding: "4px 6px" }}
                              title="Save category"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              onClick={() => setEditingCatId(null)}
                              className="btn-secondary"
                              style={{ padding: "4px 6px" }}
                              title="Cancel"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: "8px 14px", fontWeight: 600, color: "var(--text-primary)" }}>
                          <span className="badge badge-neutral" style={{ fontSize: "12px" }}>
                            {cat.name}
                          </span>
                        </td>
                        <td style={{ padding: "8px 14px", color: "var(--text-secondary)", fontSize: "12px" }}>
                          {cat.description}
                        </td>
                        <td style={{ padding: "8px 14px", textAlign: "center", fontWeight: 600, color: itemCount > 0 ? "var(--accent-gold)" : "var(--text-muted)" }}>
                          {itemCount} {itemCount === 1 ? "term" : "terms"}
                        </td>
                        <td style={{ padding: "8px 14px", textAlign: "center" }}>
                          <div style={{ display: "inline-flex", gap: "4px" }}>
                            <button
                              onClick={() => handleStartEditCategory(cat)}
                              className="btn-secondary"
                              style={{ padding: "4px 6px" }}
                              title="Edit category"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => handleDeleteCategory(cat)}
                              className="btn-danger"
                              style={{ padding: "4px 6px" }}
                              title={`Delete category '${cat.name}' and its ${itemCount} items`}
                            >
                              <Trash2 size={12} />
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
        </div>
      )}

      {/* Category Filter Tabs */}
      <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "2px" }}>
        <button
          onClick={() => setSelectedCategoryFilter("All")}
          className={selectedCategoryFilter === "All" ? "btn-primary" : "btn-secondary"}
          style={{ padding: "5px 12px", fontSize: "12px" }}
        >
          All ({entries.length})
        </button>
        {categories.map((cat) => {
          const count = entries.filter((e) => e.category === cat.name).length;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryFilter(cat.name)}
              className={selectedCategoryFilter === cat.name ? "btn-primary" : "btn-secondary"}
              style={{ padding: "5px 12px", fontSize: "12px" }}
            >
              {cat.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Quick Add Term Form */}
      <div className="card" style={{ margin: 0, padding: "14px 16px" }}>
        <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "10px" }}>
          + Add New Term / Character Name Mapping
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1.2fr 1.8fr auto", gap: "10px", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Japanese Term (e.g. 智代)"
            value={newOriginal}
            onChange={(e) => setNewOriginal(e.target.value)}
            style={{ fontFamily: "var(--font-jp)" }}
          />
          <input
            type="text"
            placeholder="Target Translation (e.g. Tomoyo)"
            value={newTranslation}
            onChange={(e) => setNewTranslation(e.target.value)}
          />
          <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Notes (Optional, e.g. Heroine notes)..."
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddEntry()}
          />
          <button onClick={handleAddEntry} className="btn-primary" style={{ padding: "7px 16px", whiteSpace: "nowrap" }}>
            <Plus size={14} />
            <span>Add Term</span>
          </button>
        </div>
      </div>

      {/* Glossary Table */}
      <div className="card" style={{ margin: 0, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--bg-surface-elevated)", borderBottom: "1px solid var(--border-subtle)" }}>
              <th style={{ padding: "10px 14px", width: "22%", color: "var(--text-muted)" }}>Source Term (JP)</th>
              <th style={{ padding: "10px 14px", width: "25%", color: "var(--text-muted)" }}>Target Translation</th>
              <th style={{ padding: "10px 14px", width: "140px", color: "var(--text-muted)" }}>Category</th>
              <th style={{ padding: "10px 14px", color: "var(--text-muted)" }}>Notes</th>
              <th style={{ padding: "10px 14px", width: "90px", color: "var(--text-muted)", textAlign: "center" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "28px", textAlign: "center", color: "var(--text-muted)" }}>
                  <BookOpen size={24} style={{ opacity: 0.4, margin: "0 auto 8px" }} />
                  <div>No glossary entries match your filter or search query.</div>
                </td>
              </tr>
            ) : (
              filteredEntries.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  {editingEntryId === row.id ? (
                    // Inline Edit Mode
                    <>
                      <td style={{ padding: "8px 10px" }}>
                        <input
                          type="text"
                          value={editOriginal}
                          onChange={(e) => setEditOriginal(e.target.value)}
                          style={{ width: "100%", fontFamily: "var(--font-jp)", fontSize: "13px" }}
                        />
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <input
                          type="text"
                          value={editTranslation}
                          onChange={(e) => setEditTranslation(e.target.value)}
                          style={{ width: "100%", fontSize: "13px" }}
                        />
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          style={{ width: "100%", fontSize: "12px" }}
                        >
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.name}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <input
                          type="text"
                          value={editNotes}
                          placeholder="Optional notes..."
                          onChange={(e) => setEditNotes(e.target.value)}
                          style={{ width: "100%", fontSize: "12px" }}
                        />
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        <div style={{ display: "inline-flex", gap: "4px" }}>
                          <button
                            onClick={() => handleSaveEditEntry(row.id)}
                            className="btn-primary"
                            style={{ padding: "4px 6px" }}
                            title="Save changes"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => setEditingEntryId(null)}
                            className="btn-secondary"
                            style={{ padding: "4px 6px" }}
                            title="Cancel edit"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    // Regular Display Mode
                    <>
                      <td style={{ padding: "10px 14px", fontFamily: "var(--font-jp)", fontWeight: 600, color: "var(--accent-gold)" }}>
                        {row.original}
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 500, color: "var(--text-primary)" }}>
                        {row.translation}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span className="badge badge-neutral">{row.category}</span>
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: "12px", color: "var(--text-muted)" }}>
                        {row.notes || "-"}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <div style={{ display: "inline-flex", gap: "4px" }}>
                          <button
                            onClick={() => handleStartEditEntry(row)}
                            className="btn-secondary"
                            style={{ padding: "4px 6px", borderRadius: "var(--radius-sm)" }}
                            title="Edit term"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteEntry(row.id)}
                            className="btn-danger"
                            style={{ padding: "4px 6px", borderRadius: "var(--radius-sm)" }}
                            title="Delete term"
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
