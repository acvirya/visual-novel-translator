import React, { useState } from "react";
import { OverlayConfig } from "../../../types";
import { TemplatePreset } from "../../../utils/overlayTemplateEngine";
import { SegmentedControl } from "../../common/SegmentedControl";
import { Sliders, ChevronUp, ChevronDown, Save, Trash2, Plus, X } from "lucide-react";

interface OverlayTemplateEditorProps {
  config: OverlayConfig;
  allPresets: TemplatePreset[];
  activePresetId: string;
  isCurrentBuiltIn: boolean;
  onUpdateConfig: (patch: Partial<OverlayConfig>) => void;
  onUpdateCurrentPreset: () => void;
  onDeleteCurrentPreset: () => void;
  onSaveAsNewPreset: (name: string) => void;
}

export const OverlayTemplateEditor: React.FC<OverlayTemplateEditorProps> = ({
  config,
  allPresets,
  activePresetId,
  isCurrentBuiltIn,
  onUpdateConfig,
  onUpdateCurrentPreset,
  onDeleteCurrentPreset,
  onSaveAsNewPreset,
}) => {
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [activeCodeTab, setActiveCodeTab] = useState<"html" | "css">("html");
  const [isCreatingNewPreset, setIsCreatingNewPreset] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>("");

  const handleCreatePreset = () => {
    if (!newPresetName.trim()) return;
    onSaveAsNewPreset(newPresetName.trim());
    setIsCreatingNewPreset(false);
    setNewPresetName("");
  };

  return (
    <div className="card" style={{ margin: 0 }}>
      <div
        onClick={() => setShowAdvanced(!showAdvanced)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Sliders size={15} color="var(--accent-primary)" />
          <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
            Advanced Custom Code & Template Engine
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "12px" }}>
          <span>{showAdvanced ? "Hide" : "Expand"}</span>
          {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {showAdvanced && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "14px", borderTop: "1px solid var(--border-subtle)", paddingTop: "14px" }}>
          {/* Toolbar: Custom Preset Actions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Editing: <strong style={{ color: "var(--text-primary)" }}>{allPresets.find((p) => p.id === activePresetId)?.name}</strong>
                {isCurrentBuiltIn ? " (Built-in Preset)" : " (Custom User Preset)"}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {!isCurrentBuiltIn && (
                <>
                  <button
                    type="button"
                    onClick={onUpdateCurrentPreset}
                    className="btn-primary"
                    style={{ height: "28px", padding: "0 10px", fontSize: "11.5px" }}
                  >
                    <Save size={12} />
                    <span>Save Changes</span>
                  </button>

                  <button
                    type="button"
                    onClick={onDeleteCurrentPreset}
                    className="btn-danger"
                    style={{ height: "28px", padding: "0 10px", fontSize: "11.5px" }}
                  >
                    <Trash2 size={12} />
                    <span>Delete Preset</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => setIsCreatingNewPreset(true)}
                className="btn-secondary"
                style={{ height: "28px", padding: "0 10px", fontSize: "11.5px" }}
              >
                <Plus size={12} />
                <span>Save as New Preset</span>
              </button>
            </div>
          </div>

          {/* Code Tabs */}
          <SegmentedControl<"html" | "css">
            options={[
              { id: "html", label: "HTML Template" },
              { id: "css", label: "CSS Stylesheet" },
            ]}
            value={activeCodeTab}
            onChange={setActiveCodeTab}
            size="sm"
          />

          {/* Code Editor Textarea */}
          {activeCodeTab === "html" ? (
            <textarea
              value={config.customTemplateHtml || ""}
              onChange={(e) => onUpdateConfig({ customTemplateHtml: e.target.value })}
              rows={10}
              style={{
                width: "100%",
                fontFamily: "var(--font-mono)",
                fontSize: "11.5px",
                lineHeight: "1.45",
                padding: "10px",
                boxSizing: "border-box",
              }}
              placeholder="Enter custom HTML template using {{speaker}}, {{message}}, {{translatedMessage}}..."
            />
          ) : (
            <textarea
              value={config.customTemplateCss || ""}
              onChange={(e) => onUpdateConfig({ customTemplateCss: e.target.value })}
              rows={12}
              style={{
                width: "100%",
                fontFamily: "var(--font-mono)",
                fontSize: "11.5px",
                lineHeight: "1.45",
                padding: "10px",
                boxSizing: "border-box",
              }}
              placeholder="Enter custom CSS rules..."
            />
          )}
        </div>
      )}

      {/* Save as New Preset Modal */}
      {isCreatingNewPreset && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: "var(--bg-panel, #161b22)",
              border: "1px solid var(--border-active)",
              borderRadius: "var(--radius-md)",
              padding: "18px 20px",
              width: "360px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              boxShadow: "0 12px 36px rgba(0, 0, 0, 0.6)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong style={{ fontSize: "13.5px", color: "var(--text-primary)" }}>Save as New Preset</strong>
              <button
                type="button"
                onClick={() => setIsCreatingNewPreset(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={14} />
              </button>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                Preset Name
              </label>
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="e.g. My Dark Floating Subtitle"
                style={{ width: "100%", fontSize: "12px", height: "32px" }}
                autoFocus
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setIsCreatingNewPreset(false)}
                className="btn-secondary"
                style={{ height: "30px", fontSize: "12px" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreatePreset}
                disabled={!newPresetName.trim()}
                className="btn-primary"
                style={{ height: "30px", fontSize: "12px" }}
              >
                Create Preset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
