import React, { useState } from "react";
import {
  Sliders,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Check,
  Eye,
  EyeOff,
  Radio,
  Layers,
} from "lucide-react";
import {
  PromptStylePreset,
  getLanguageDisplayName,
  buildCompleteSystemPrompt,
} from "../../../services/openRouterService";
import { Modal } from "../../common/Modal";

interface StylePresetsCardProps {
  allPresets: PromptStylePreset[];
  activePresetId: string;
  styleInstructions: string;
  sourceLang: string;
  targetLang: string;
  onSelectPreset: (preset: PromptStylePreset) => void;
  onResetPreset: () => void;
  onChangeStyleInstructions: (text: string) => void;
  onCreateCustomPreset: (name: string, description: string, instructions: string) => void;
  onDeleteCustomPreset: (id: string, e: React.MouseEvent) => void;
}

export const StylePresetsCard: React.FC<StylePresetsCardProps> = ({
  allPresets,
  activePresetId,
  styleInstructions,
  sourceLang,
  targetLang,
  onSelectPreset,
  onResetPreset,
  onChangeStyleInstructions,
  onCreateCustomPreset,
  onDeleteCustomPreset,
}) => {
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [customName, setCustomName] = useState<string>("");
  const [customDesc, setCustomDesc] = useState<string>("");
  const [customInst, setCustomInst] = useState<string>("");

  const [showFullPreview, setShowFullPreview] = useState<boolean>(false);
  const [previewMode, setPreviewMode] = useState<"live" | "batch">("live");

  const assembledPrompt = buildCompleteSystemPrompt({
    mode: previewMode,
    sourceLang,
    targetLang,
    styleInstructions,
    includeGlossary: true,
  });

  const handleOpenAddModal = () => {
    setCustomInst(styleInstructions);
    setShowAddModal(true);
  };

  const handleSaveModal = () => {
    if (!customName.trim() || !customInst.trim()) return;
    onCreateCustomPreset(customName.trim(), customDesc.trim(), customInst.trim());
    setShowAddModal(false);
    setCustomName("");
    setCustomDesc("");
    setCustomInst("");
  };

  return (
    <>
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Sliders size={16} /> 4. Translation Style & Tone Presets
            </span>
            <span className="card-subtitle">
              Adjust character personality and translation tone without worrying about JSON schemas or language tags
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={handleOpenAddModal}
              className="btn-secondary"
              style={{ fontSize: "11.5px", padding: "4px 10px", display: "flex", alignItems: "center", gap: "5px" }}
            >
              <Plus size={13} />
              <span>Add Custom Style</span>
            </button>

            <button
              onClick={onResetPreset}
              className="btn-secondary"
              style={{ fontSize: "11.5px", padding: "4px 8px" }}
              title="Reset active style to preset default instructions"
            >
              <RotateCcw size={13} />
              <span>Reset Style</span>
            </button>
          </div>
        </div>

        {/* Preset Selector Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px", marginBottom: "14px" }}>
          {allPresets.map((preset) => {
            const isSelected = activePresetId === preset.id;
            return (
              <div
                key={preset.id}
                onClick={() => onSelectPreset(preset)}
                style={{
                  backgroundColor: isSelected ? "rgba(88, 166, 255, 0.1)" : "var(--bg-app)",
                  border: `1.5px solid ${isSelected ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                  borderRadius: "var(--radius-sm)",
                  padding: "10px 12px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  position: "relative",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600, fontSize: "12.5px", color: isSelected ? "var(--accent-primary)" : "var(--text-primary)" }}>
                    {preset.name}
                  </span>
                  {!preset.isBuiltIn && (
                    <button
                      onClick={(e) => onDeleteCustomPreset(preset.id, e)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--accent-red)",
                        cursor: "pointer",
                        padding: "2px",
                        opacity: 0.7,
                      }}
                      title="Delete custom preset"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: "1.35" }}>
                  {preset.description}
                </span>
                {isSelected && (
                  <div style={{ marginTop: "4px", display: "flex", alignItems: "center", gap: "4px", fontSize: "10.5px", color: "var(--accent-primary)", fontWeight: 600 }}>
                    <Check size={12} /> Active Style
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Interactive Style Instructions Editor */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
              <Sparkles size={14} color="var(--accent-primary)" />
              Active Translation Style Guidelines (Part 2):
            </label>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              {styleInstructions.length} characters
            </span>
          </div>

          <textarea
            rows={4}
            value={styleInstructions}
            onChange={(e) => onChangeStyleInstructions(e.target.value)}
            style={{
              width: "100%",
              fontSize: "12px",
              lineHeight: "1.5",
              resize: "vertical",
              fontFamily: "inherit",
              backgroundColor: "var(--bg-app)",
              borderColor: "var(--border-subtle)",
            }}
            placeholder="Type custom instructions for translation style, personality, honorifics, or tone..."
          />

          <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            💡 <strong>Automatic Modular Assembly</strong>: Source language (<code>{getLanguageDisplayName(sourceLang)}</code>), target language (<code>{getLanguageDisplayName(targetLang)}</code>), character glossary, and strict JSON output schemas are assembled automatically by the system.
          </span>
        </div>

        {/* Collapsible Full Assembled Prompt Preview */}
        <div style={{ marginTop: "14px", borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
          <div
            onClick={() => setShowFullPreview(!showFullPreview)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
              {showFullPreview ? <EyeOff size={14} /> : <Eye size={14} />}
              {showFullPreview ? "Hide" : "Inspect"} Full Assembled System Prompt (Parts 1–4)
            </span>

            {showFullPreview && (
              <div style={{ display: "flex", gap: "6px" }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setPreviewMode("live")}
                  className={`btn-${previewMode === "live" ? "primary" : "secondary"}`}
                  style={{ padding: "2px 8px", fontSize: "10.5px" }}
                >
                  <Radio size={11} /> Live Mode
                </button>
                <button
                  onClick={() => setPreviewMode("batch")}
                  className={`btn-${previewMode === "batch" ? "primary" : "secondary"}`}
                  style={{ padding: "2px 8px", fontSize: "10.5px" }}
                >
                  <Layers size={11} /> Batch Mode
                </button>
              </div>
            )}
          </div>

          {showFullPreview && (
            <div
              style={{
                marginTop: "10px",
                backgroundColor: "var(--bg-app)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "12px",
                fontSize: "11.5px",
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                color: "var(--text-primary)",
                maxHeight: "260px",
                overflowY: "auto",
                lineHeight: "1.45",
              }}
            >
              {assembledPrompt}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Add Custom Style Preset */}
      {showAddModal && (
        <Modal
          title="Create Custom Translation Style Preset"
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: "380px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Preset Name:
              </label>
              <input
                type="text"
                placeholder="e.g. Indonesian Visual Novel Gaul, Cyberpunk Lore..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Short Description:
              </label>
              <input
                type="text"
                placeholder="Brief summary of when to use this style..."
                value={customDesc}
                onChange={(e) => setCustomDesc(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Style Instructions (Part 2):
              </label>
              <textarea
                rows={5}
                placeholder="Translate with natural colloquial flow, preserving slang..."
                value={customInst}
                onChange={(e) => setCustomInst(e.target.value)}
                style={{ width: "100%", fontSize: "12px", lineHeight: "1.45", resize: "vertical" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}>
              <button onClick={() => setShowAddModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleSaveModal} className="btn-primary">
                Save & Activate Preset
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
