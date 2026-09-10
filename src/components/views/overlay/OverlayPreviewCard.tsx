import React from "react";
import { OverlayConfig } from "../../../types";
import { TemplatePreset, isBuiltInPreset } from "../../../utils/overlayTemplateEngine";
import { SegmentedControl } from "../../common/SegmentedControl";
import { Palette, Search, ChevronDown, Check, Type } from "lucide-react";

interface OverlayPreviewCardProps {
  config: OverlayConfig;
  allPresets: TemplatePreset[];
  filteredPresets: TemplatePreset[];
  activePresetId: string;
  presetSearchQuery: string;
  isPresetDropdownOpen: boolean;
  presetDropdownRef: React.RefObject<HTMLDivElement | null>;
  sampleTextType: "standard" | "long";
  previewAnimTick: number;
  compiledPreviewHtml: string;
  onSetSampleTextType: (type: "standard" | "long") => void;
  onSetPresetSearchQuery: (query: string) => void;
  onSetIsPresetDropdownOpen: (open: boolean) => void;
  onApplyPreset: (preset: TemplatePreset) => void;
  onUpdateConfig: (patch: Partial<OverlayConfig>) => void;
}

export const OverlayPreviewCard: React.FC<OverlayPreviewCardProps> = ({
  config,
  allPresets,
  filteredPresets,
  activePresetId,
  presetSearchQuery,
  isPresetDropdownOpen,
  presetDropdownRef,
  sampleTextType,
  previewAnimTick,
  compiledPreviewHtml,
  onSetSampleTextType,
  onSetPresetSearchQuery,
  onSetIsPresetDropdownOpen,
  onApplyPreset,
  onUpdateConfig,
}) => {
  return (
    <div className="card" style={{ margin: 0 }}>
      {/* Preset Selector Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Palette size={16} color="var(--accent-gold)" /> Overlay Theme Preset & Live Preview
          </span>
          <span className="card-subtitle">
            Choose visual style and test real-time rendering appearance
          </span>
        </div>

        {/* Sample Dialogue Type Switcher */}
        <SegmentedControl<"standard" | "long">
          options={[
            { id: "standard", label: "Standard Text" },
            { id: "long", label: "Long Dialogue" },
          ]}
          value={sampleTextType}
          onChange={onSetSampleTextType}
          size="sm"
        />
      </div>

      {/* Searchable Overlay Preset Dropdown */}
      <div ref={presetDropdownRef} style={{ position: "relative", marginBottom: "14px", width: "100%" }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search size={14} style={{ position: "absolute", left: "10px", color: "var(--text-muted)", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Search or select overlay preset..."
            value={isPresetDropdownOpen ? presetSearchQuery : (allPresets.find((p) => p.id === activePresetId)?.name || "Select Preset")}
            onChange={(e) => {
              onSetPresetSearchQuery(e.target.value);
              onSetIsPresetDropdownOpen(true);
            }}
            onFocus={() => {
              onSetIsPresetDropdownOpen(true);
              onSetPresetSearchQuery("");
            }}
            style={{ width: "100%", paddingLeft: "32px", paddingRight: "30px", fontSize: "12px", height: "34px" }}
          />
          <button
            type="button"
            onClick={() => onSetIsPresetDropdownOpen(!isPresetDropdownOpen)}
            style={{ position: "absolute", right: "8px", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px" }}
          >
            <ChevronDown size={14} />
          </button>
        </div>

        {/* Preset Dropdown Menu */}
        {isPresetDropdownOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: "4px",
              backgroundColor: "var(--bg-panel, #161b22)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              maxHeight: "240px",
              overflowY: "auto",
              zIndex: 100,
            }}
          >
            {filteredPresets.length === 0 ? (
              <div style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: "12px" }}>
                No presets found matching "{presetSearchQuery}"
              </div>
            ) : (
              filteredPresets.map((preset) => {
                const isSelected = preset.id === activePresetId;
                return (
                  <div
                    key={preset.id}
                    onClick={() => {
                      onApplyPreset(preset);
                      onSetIsPresetDropdownOpen(false);
                      onSetPresetSearchQuery("");
                    }}
                    style={{
                      padding: "8px 12px",
                      fontSize: "12px",
                      cursor: "pointer",
                      backgroundColor: isSelected ? "rgba(88, 166, 255, 0.15)" : "transparent",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontWeight: 600, color: isSelected ? "var(--accent-primary)" : "var(--text-primary)" }}>
                          {preset.name}
                        </span>
                        {!isBuiltInPreset(preset.id) && (
                          <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "10px", backgroundColor: "rgba(227, 179, 65, 0.15)", color: "var(--accent-gold)" }}>
                            Custom
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {preset.description}
                      </span>
                    </div>
                    {isSelected && <Check size={14} color="var(--accent-primary)" />}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Live Preview Screen Container */}
      <div
        style={{
          position: "relative",
          minHeight: "190px",
          backgroundColor: "#0a0c10",
          backgroundImage: "radial-gradient(circle at 50% 50%, rgba(30, 41, 59, 0.5) 0%, rgba(10, 12, 16, 0.9) 100%)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          padding: "28px 36px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "visible",
          marginBottom: "14px",
        }}
      >
        {/* Rendered Overlay Box */}
        <div key={previewAnimTick} style={{ width: "100%", maxWidth: "800px", overflow: "visible" }} dangerouslySetInnerHTML={{ __html: compiledPreviewHtml }} />
      </div>

      {/* Display Fields & Font Adjustments Row (Under Preview) */}
      <div
        style={{
          backgroundColor: "var(--bg-app)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          padding: "14px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        {/* Sliders Grid: Speaker Font Size vs Message Font Size */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
          {/* Speaker Font Size Slider */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
              <label style={{ fontSize: "11.5px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                <Type size={12} /> Speaker Font Size:
              </label>
              <strong style={{ fontSize: "11.5px", color: "var(--accent-gold)" }}>{config.speakerFontSize || 16} px</strong>
            </div>
            <input
              type="range"
              min={12}
              max={32}
              step={1}
              value={config.speakerFontSize || 16}
              onChange={(e) => {
                const sz = Number(e.target.value);
                onUpdateConfig({ speakerFontSize: sz });
              }}
              style={{ width: "100%" }}
            />
          </div>

          {/* Message Font Size Slider */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
              <label style={{ fontSize: "11.5px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                <Type size={12} /> Dialogue Message Font Size:
              </label>
              <strong style={{ fontSize: "11.5px", color: "var(--accent-primary)" }}>{config.messageFontSize || config.fontSize || 20} px</strong>
            </div>
            <input
              type="range"
              min={14}
              max={40}
              step={1}
              value={config.messageFontSize || config.fontSize || 20}
              onChange={(e) => {
                const sz = Number(e.target.value);
                onUpdateConfig({ messageFontSize: sz, fontSize: sz });
              }}
              style={{ width: "100%" }}
            />
          </div>
        </div>

        {/* Visibility Toggles (Only 2 toggles: Show Original Japanese Text & Show Original Speaker) */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center", borderTop: "1px solid var(--border-subtle)", paddingTop: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer", color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={config.showMessage}
              onChange={(e) => onUpdateConfig({ showMessage: e.target.checked })}
            />
            <span>Show Original Japanese Dialogue (Raw Text)</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer", color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={config.showSpeaker}
              onChange={(e) => onUpdateConfig({ showSpeaker: e.target.checked })}
            />
            <span>Show Original Japanese Character Name (Raw Speaker)</span>
          </label>
        </div>
      </div>
    </div>
  );
};
