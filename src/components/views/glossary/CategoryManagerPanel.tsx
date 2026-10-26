import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { GlossaryCategory } from "../GlossaryManagerView";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  categories: GlossaryCategory[];
  selectedCategory: string | null;
  counts: Record<string, number>;
  totalCount: number;
  onSelectCategory: (name: string | null) => void;
  onAddCategory: (name: string, description: string) => boolean;
  onDeleteCategory: (category: GlossaryCategory) => void;
}
export function CategoryManagerPanel({ isOpen, onClose, categories, selectedCategory, counts, totalCount, onSelectCategory, onAddCategory, onDeleteCategory }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  if (!isOpen) return null;
  return <section className="category-panel" aria-label="Category filters and management">
    <div className="category-panel-heading"><div><h3>Categories</h3><p>Select a category to filter terms. Closing this panel clears the filter.</p></div><button className="icon-button" aria-label="Close categories" onClick={onClose}><X size={16} /></button></div>
    <div className="category-list">
      <button className={`category-filter${selectedCategory === null ? " is-selected" : ""}`} aria-pressed={selectedCategory === null} onClick={() => onSelectCategory(null)}><span><strong>All terms</strong><small>Show every category</small></span><span>{totalCount}</span></button>
      {categories.map((category) => <div className="category-row" key={category.id}>
        <button className={`category-filter${selectedCategory === category.name ? " is-selected" : ""}`} aria-pressed={selectedCategory === category.name} onClick={() => onSelectCategory(category.name)}><span><strong>{category.name}</strong><small>{category.description}</small></span><span>{counts[category.name] || 0}</span></button>
        {!category.id.startsWith("derived:") && category.id !== "default-term" && <button className="icon-button" aria-label={`Delete category ${category.name}`} onClick={() => onDeleteCategory(category)}><Trash2 size={13} /></button>}
      </div>)}
    </div>
    <form className="category-add-form" onSubmit={(event) => { event.preventDefault(); if (name.trim() && onAddCategory(name.trim(), description.trim())) { setName(""); setDescription(""); } }}>
      <input type="text" aria-label="New category name" placeholder="Category name" required value={name} onChange={(event) => setName(event.target.value)} />
      <input type="text" aria-label="New category description" placeholder="Description (optional)" value={description} onChange={(event) => setDescription(event.target.value)} />
      <button className="btn-secondary" type="submit" disabled={!name.trim()}><Plus size={14} /> Add category</button>
    </form>
  </section>;
}
