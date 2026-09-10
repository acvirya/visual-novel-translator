import React, { useState } from "react";
import { Globe, X, Search, Loader2, ChevronRight, Plus } from "lucide-react";
import { vndbService, VndbSearchResult, VndbCharacterResult } from "../../../services/vndbService";
import {
  VndbTraitFilterOptions,
  DEFAULT_VNDB_TRAIT_FILTERS,
  filterPersonalityTraits,
  formatCharacterNotes,
} from "../../../utils/vndbTraitFilter";
import { GlossaryEntry } from "../../../types";

interface VndbImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (newEntries: GlossaryEntry[]) => void;
  existingEntries: GlossaryEntry[];
}

export const VndbImporterModal: React.FC<VndbImporterModalProps> = ({
  isOpen,
  onClose,
  onImport,
  existingEntries,
}) => {
  const [vndbQuery, setVndbQuery] = useState("");
  const [isSearchingVndb, setIsSearchingVndb] = useState(false);
  const [vndbSearchResults, setVndbSearchResults] = useState<VndbSearchResult[]>([]);
  const [selectedVn, setSelectedVn] = useState<VndbSearchResult | null>(null);
  const [isLoadingCharacters, setIsLoadingCharacters] = useState(false);
  const [vndbCharacters, setVndbCharacters] = useState<VndbCharacterResult[]>([]);
  const [vndbError, setVndbError] = useState<string | null>(null);
  const [traitFilters, setTraitFilters] = useState<VndbTraitFilterOptions>(() => {
    try {
      const saved = localStorage.getItem("vn_vndb_trait_filters");
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_VNDB_TRAIT_FILTERS;
  });

  if (!isOpen) return null;

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

  const handleImport = () => {
    const selected = vndbCharacters.filter((c) => c.selected && (c.original || c.name));
    if (selected.length === 0) return;

    const newEntries: GlossaryEntry[] = [];

    selected.forEach((c) => {
      const orig = (c.original || c.name).trim();
      const trans = c.name.trim();

      const existingIdx = existingEntries.findIndex(
        (e) => e.original.toLowerCase() === orig.toLowerCase()
      );
      if (existingIdx === -1) {
        newEntries.push({
          id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          original: orig,
          translation: trans,
          category: "Name",
          notes: c.notes || (selectedVn ? `From ${selectedVn.title}` : undefined),
        });
      }
    });

    onImport(newEntries);
    onClose();
  };

  return (
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
      onClick={onClose}
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
          <button onClick={onClose} className="btn-secondary" style={{ padding: "4px 8px" }}>
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
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {!selectedVn ? (
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

              {/* Personality Trait Filter Options */}
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

              {/* Character Table */}
              <div style={{ maxHeight: "360px", overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
                {isLoadingCharacters ? (
                  <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)" }}>
                    <Loader2 size={20} className="animate-spin" style={{ margin: "0 auto 8px" }} />
                    <div style={{ fontSize: "12px" }}>Querying VNDB API for character list...</div>
                  </div>
                ) : vndbCharacters.length === 0 ? (
                  <div style={{ padding: "30px 0", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
                    No characters found.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-subtle)", backgroundColor: "var(--bg-surface-elevated)", color: "var(--text-secondary)" }}>
                        <th style={{ width: "40px", padding: "6px 10px", textAlign: "center" }}>Import</th>
                        <th style={{ width: "160px", padding: "6px 10px" }}>Original Name</th>
                        <th style={{ width: "180px", padding: "6px 10px" }}>English Translation</th>
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
          <button onClick={onClose} className="btn-secondary" style={{ padding: "6px 14px", fontSize: "12px" }}>
            Cancel
          </button>
          {selectedVn && (
            <button
              onClick={handleImport}
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
  );
};
