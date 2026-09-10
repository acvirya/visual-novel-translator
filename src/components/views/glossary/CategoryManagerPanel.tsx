import React, { useState } from "react";
import { Plus, X, Trash2 } from "lucide-react";
import { GlossaryCategory } from "../GlossaryManagerView";

interface CategoryManagerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  categories: GlossaryCategory[];
  onAddCategory: (name: string, description: string) => void;
  onDeleteCategory: (categoryId: string) => void;
}

export const CategoryManagerPanel: React.FC<CategoryManagerPanelProps> = ({
  isOpen,
  onClose,
  categories,
  onAddCategory,
  onDeleteCategory,
}) => {
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");

  if (!isOpen) return null;

  const handleAdd = () => {
    const trimmedName = newCatName.trim();
    if (!trimmedName) return;
    onAddCategory(trimmedName, newCatDesc.trim() || "-");
    setNewCatName("");
    setNewCatDesc("");
  };

  return (
    <div
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
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
          onClick={onClose}
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
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          style={{ fontSize: "12px", padding: "6px 10px" }}
        />
        <button
          type="button"
          onClick={handleAdd}
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
              onClick={() => onDeleteCategory(cat.id)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "1px" }}
              title="Delete Category"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
