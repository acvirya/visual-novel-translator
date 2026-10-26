import { useEffect, useMemo, useState } from "react";
import { BookOpen, Globe, LockKeyhole, Pencil, Plus, Search, Tag, Trash2, UnlockKeyhole } from "lucide-react";
import { GlossaryEntry } from "../../types";
import { settingsManager } from "../../services/settingsManager";
import { useToast } from "../common/ToastProvider";
import { Modal } from "../common/Modal";
import { useConfirmation } from "../common/ConfirmationProvider";
import { VndbImporterModal } from "./glossary/VndbImporterModal";
import { CategoryManagerPanel } from "./glossary/CategoryManagerPanel";

export interface GlossaryCategory { id: string; name: string; description: string }
const INITIAL_CATEGORIES: GlossaryCategory[] = [
  { id: "c_1", name: "Name", description: "Character names and nicknames" },
  { id: "c_2", name: "Place", description: "Locations and landmarks" },
  { id: "c_3", name: "Honorific", description: "Japanese titles and suffixes" },
  { id: "c_4", name: "Term", description: "Lore, items, and story keywords" },
  { id: "c_5", name: "Skill/Ability", description: "Magic, attacks, and abilities" },
  { id: "c_6", name: "Organization", description: "Clubs, factions, and groups" },
];
type TermDraft = Omit<GlossaryEntry, "id"> & { id?: string };

export function GlossaryManagerView() {
  const toast = useToast();
  const confirm = useConfirmation();
  const [entries, setEntries] = useState(() => settingsManager.getGlossary().terms);
  const [categories, setCategories] = useState<GlossaryCategory[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("vn_glossary_categories_v1") || "null");
      if (Array.isArray(stored) && stored.every((item) => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.description === "string")) return stored;
    } catch { /* Recover invalid category metadata using defaults. */ }
    return INITIAL_CATEGORIES;
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [showVndb, setShowVndb] = useState(false);
  const [draft, setDraft] = useState<TermDraft | null>(null);

  useEffect(() => settingsManager.subscribe((settings) => setEntries(settings.glossary.terms)), []);
  useEffect(() => { localStorage.setItem("vn_glossary_categories_v1", JSON.stringify(categories)); }, [categories]);
  const updateEntries = (update: (previous: GlossaryEntry[]) => GlossaryEntry[]) => {
    settingsManager.updateGlossary({ terms: update(settingsManager.getGlossary().terms) });
  };
  const counts = useMemo(() => entries.reduce<Record<string, number>>((result, entry) => {
    result[entry.category] = (result[entry.category] || 0) + 1;
    return result;
  }, {}), [entries]);
  const availableCategories = useMemo(() => {
    const result = [...categories];
    for (const name of Object.keys(counts)) {
      if (!result.some((category) => category.name === name)) result.push({ id: `derived:${name}`, name, description: "Category used by existing terms" });
    }
    return result.length ? result : [{ id: "default-term", name: "Term", description: "General terms" }];
  }, [categories, counts]);
  const filtered = useMemo(() => {
    const query = search.toLocaleLowerCase().trim();
    return entries.filter((entry) => (!filter || entry.category === filter) &&
      [entry.original, entry.translation, entry.category, entry.notes || ""].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [entries, search, filter]);
  const unlockedCount = entries.filter((entry) => entry.isLocked !== true).length;
  const closeCategories = () => { setShowCategories(false); setFilter(null); };

  const saveTerm = () => {
    if (!draft?.original.trim() || !draft.translation.trim()) return;
    const saved: GlossaryEntry = { ...draft, id: draft.id || `g_${crypto.randomUUID()}`, original: draft.original.trim(), translation: draft.translation.trim(), category: draft.category || availableCategories[0].name, notes: draft.notes?.trim() || undefined };
    const commit = () => {
      updateEntries((previous) => draft.id ? previous.map((entry) => entry.id === saved.id ? { ...entry, ...saved } : entry) : [saved, ...previous]);
      setDraft(null);
      toast.success(draft.id ? "Term updated." : "Term added.");
    };
    if (draft.id) confirm({ title: "Save term changes?", message: `Replace the saved values for "${entries.find((entry) => entry.id === draft.id)?.original || draft.original}"?`, confirmText: "Save changes", variant: "primary" }, commit);
    else commit();
  };
  const deleteTerm = (entry: GlossaryEntry) => {
    if (entry.isLocked) return;
    confirm({ title: "Delete term?", message: `Remove "${entry.original}" from the glossary? This cannot be undone.`, confirmText: "Delete term" }, () => updateEntries((previous) => previous.filter((term) => term.id !== entry.id || term.isLocked === true)));
  };
  const clearTerms = () => confirm({ title: "Clear unlocked terms?", message: `Delete ${unlockedCount} unlocked terms from the entire glossary? Locked terms will be kept. This cannot be undone.`, confirmText: "Clear unlocked terms" }, () => updateEntries((previous) => previous.filter((entry) => entry.isLocked === true)));
  const deleteCategory = (category: GlossaryCategory) => confirm({ title: "Delete category?", message: `Remove "${category.name}"? Its terms will be kept under Uncategorized.`, confirmText: "Delete category" }, () => {
    setCategories((previous) => previous.filter((item) => item.id !== category.id));
    updateEntries((previous) => previous.map((entry) => entry.category === category.name ? { ...entry, category: "Uncategorized" } : entry));
    if (filter === category.name) setFilter(null);
  });

  return <div className="knowledge-manager">
    <header className="knowledge-heading">
      <div><h2><BookOpen size={18} /> Glossary &amp; terms</h2><p>Keep names and terminology consistent across live and batch translation.</p></div>
      <div className="knowledge-actions">
        <button className="btn-secondary" onClick={() => setShowVndb(true)}><Globe size={14} /> Import from VNDB</button>
        <button className="btn-secondary" aria-expanded={showCategories} onClick={() => showCategories ? closeCategories() : setShowCategories(true)}><Tag size={14} /> Categories</button>
      </div>
    </header>
    <CategoryManagerPanel isOpen={showCategories} onClose={closeCategories} categories={availableCategories} selectedCategory={filter} counts={counts} totalCount={entries.length}
      onSelectCategory={(name) => setFilter((previous) => previous === name ? null : name)}
      onAddCategory={(name, description) => {
        if (availableCategories.some((category) => category.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { toast.warning("That category already exists."); return false; }
        setCategories((previous) => [...previous, { id: `c_${crypto.randomUUID()}`, name, description }]); return true;
      }} onDeleteCategory={deleteCategory} />
    <section className="knowledge-table-panel" aria-label="Glossary terms">
      <div className="knowledge-toolbar">
        <div className="knowledge-search"><Search size={15} /><input type="search" aria-label="Search glossary terms" placeholder="Search terms, translations, or notes..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="knowledge-actions"><span className="entry-count"><strong>{filtered.length}</strong>{filtered.length !== entries.length ? ` / ${entries.length}` : ""} terms</span>
          <button className="btn-primary" onClick={() => setDraft({ original: "", translation: "", category: filter || availableCategories[0].name, notes: "" })}><Plus size={14} /> Add term</button>
          <button className="btn-secondary" disabled={!unlockedCount} onClick={clearTerms}><Trash2 size={14} /> Clear all</button>
        </div>
      </div>
      <div className="knowledge-table-scroll">
        {!filtered.length ? <div className="knowledge-empty">{entries.length ? "No terms match this search or category." : "No glossary terms yet. Add a term or import characters from VNDB."}</div> : <table className="knowledge-table glossary-table">
          <thead><tr><th>Original</th><th>Translation</th><th>Category</th><th>Notes</th><th className="row-actions-heading">Actions</th></tr></thead>
          <tbody>{filtered.map((entry) => <tr key={entry.id}>
            <td className="original-term">{entry.original}</td><td>{entry.translation}</td><td><span className="term-category">{entry.category}</span></td><td className="term-notes">{entry.notes || "—"}</td>
            <td><div className="term-row-actions">
              <button className={`icon-button${entry.isLocked ? " term-locked" : ""}`} aria-label={entry.isLocked ? `Unlock ${entry.original}` : `Lock ${entry.original}`} aria-pressed={entry.isLocked === true} title={entry.isLocked ? "Locked: kept when clearing terms. Click to unlock." : "Lock to protect from deletion and Clear all"} onClick={() => updateEntries((previous) => previous.map((term) => term.id === entry.id ? { ...term, isLocked: !term.isLocked } : term))}>{entry.isLocked ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}</button>
              <button className="icon-button" aria-label={`Edit ${entry.original}`} title="Edit term" onClick={() => setDraft({ ...entry })}><Pencil size={14} /></button>
              <button className="icon-button" aria-label={`Delete ${entry.original}`} title={entry.isLocked ? "Unlock this term before deleting" : "Delete term"} disabled={entry.isLocked === true} onClick={() => deleteTerm(entry)}><Trash2 size={14} /></button>
            </div></td>
          </tr>)}</tbody>
        </table>}
      </div>
      {entries.some((entry) => entry.isLocked) && <p className="knowledge-footnote"><LockKeyhole size={12} /> Locked terms are kept when you clear the glossary.</p>}
    </section>
    <Modal isOpen={draft !== null} onClose={() => setDraft(null)} title={draft?.id ? "Edit term" : "Add term"} subtitle="Terms are shared by live translation and batch prompts." footer={<><button type="button" className="btn-secondary" onClick={() => setDraft(null)}>Cancel</button><button type="submit" form="glossary-term-form" className="btn-primary" disabled={!draft?.original.trim() || !draft?.translation.trim()}>{draft?.id ? "Save changes" : "Add term"}</button></>}>
      {draft && <form id="glossary-term-form" className="term-form" onSubmit={(event) => { event.preventDefault(); saveTerm(); }}>
        <label>Original term<input type="text" autoFocus required value={draft.original} onChange={(event) => setDraft({ ...draft, original: event.target.value })} /></label>
        <label>Translation<input type="text" required value={draft.translation} onChange={(event) => setDraft({ ...draft, translation: event.target.value })} /></label>
        <div className="term-category-field"><label htmlFor="term-category">Category</label><select id="term-category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{availableCategories.map((category) => <option key={category.id}>{category.name}</option>)}</select></div>
        <label>Notes <span className="optional-label">(optional)</span><textarea rows={3} value={draft.notes || ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
      </form>}
    </Modal>
    <VndbImporterModal isOpen={showVndb} onClose={() => setShowVndb(false)} existingEntries={entries} onImport={(imported) => { updateEntries((previous) => [...imported, ...previous]); toast.success(`Imported ${imported.length} characters.`); }} />
  </div>;
}
