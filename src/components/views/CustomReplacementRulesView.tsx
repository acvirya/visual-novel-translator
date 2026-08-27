import React, { useState, useEffect } from "react";
import { PreprocessingStep, PreprocessingSource } from "../../types";
import {
  DEFAULT_PREPROCESSING_SOURCES,
  executePreprocessingPipeline,
} from "../../utils/textPreprocessor";
import {
  Plus,
  Trash2,
  CheckCircle2,
  Copy,
  Check,
  Code,
  Sparkles,
  Info,
} from "lucide-react";

export const CustomReplacementRulesView: React.FC = () => {
  const [customRules, setCustomRules] = useState<PreprocessingStep[]>(() => {
    try {
      const saved = localStorage.getItem("vn_custom_replacement_rules") || localStorage.getItem("vn_preprocessing_pipeline");
      if (saved) {
        const parsed: PreprocessingStep[] = JSON.parse(saved);
        return parsed.filter((r) => r.type === "custom_regex" || r.isCustom);
      }
      return [];
    } catch {
      return [];
    }
  });

  // Test Sandbox State
  const [testSource, setTestSource] = useState<PreprocessingSource | "all">("all");
  const [sampleInput, setSampleInput] = useState<string>(
    "\\c[2]坂上　智代\\c[0]「……あ、、あのっ……！　私(わたし)は……遅刻(ちこく)したくないの！！♪♥」"
  );
  const [copied, setCopied] = useState<boolean>(false);

  // Save custom rules to localStorage
  useEffect(() => {
    localStorage.setItem("vn_custom_replacement_rules", JSON.stringify(customRules));
  }, [customRules]);

  // Compute live output using the universal pipeline
  const finalOutput = executePreprocessingPipeline(
    sampleInput,
    testSource === "all" ? undefined : testSource
  );

  // Add a new custom rule
  const handleAddRule = () => {
    const newRule: PreprocessingStep = {
      id: `custom_rule_${Date.now()}`,
      type: "custom_regex",
      name: `Custom Rule #${customRules.length + 1}`,
      description: "Custom regex or plain string replacement rule",
      isEnabled: true,
      isCustom: true,
      applicableSources: ["manual", "textractor", "ocr", "batch"],
      options: {
        pattern: "",
        replacement: "",
        isRegex: true,
        ignoreCase: false,
      },
    };
    setCustomRules((prev) => [...prev, newRule]);
  };

  const handleUpdateRule = (ruleId: string, updates: Partial<PreprocessingStep>) => {
    setCustomRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, ...updates } : r))
    );
  };

  const handleUpdateRuleOptions = (ruleId: string, optionUpdates: any) => {
    setCustomRules((prev) =>
      prev.map((r) => {
        if (r.id !== ruleId) return r;
        return {
          ...r,
          options: {
            ...r.options,
            ...optionUpdates,
          },
        };
      })
    );
  };

  const handleDeleteRule = (ruleId: string) => {
    setCustomRules((prev) => prev.filter((r) => r.id !== ruleId));
  };

  const handleToggleSource = (ruleId: string, source: PreprocessingSource) => {
    setCustomRules((prev) =>
      prev.map((r) => {
        if (r.id !== ruleId) return r;
        const currentSources = r.applicableSources ?? DEFAULT_PREPROCESSING_SOURCES;
        const nextSources = currentSources.includes(source)
          ? currentSources.filter((s) => s !== source)
          : [...currentSources, source];
        return {
          ...r,
          applicableSources: nextSources.length > 0 ? nextSources : [source],
        };
      })
    );
  };

  const handleCopyOutput = () => {
    if (!finalOutput) return;
    navigator.clipboard.writeText(finalOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", paddingBottom: "24px" }}>
      {/* Main Grid: Custom Rules on Left, Live Workbench on Right */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "16px", alignItems: "flex-start" }}>
        
        {/* ========================================================================= */}
        {/* LEFT CARD: Custom Replacement Rules List                                  */}
        {/* ========================================================================= */}
        <div className="card" style={{ margin: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
          <div className="card-header" style={{ paddingBottom: 0 }}>
            <div>
              <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Code size={16} /> Custom Replacement Rules ({customRules.length})
              </span>
              <span className="card-subtitle">
                Define global regex or string substitutions applied across all text sources
              </span>
            </div>
            <button
              type="button"
              onClick={handleAddRule}
              className="btn-primary"
              style={{ fontSize: "12px", padding: "6px 12px", display: "flex", alignItems: "center", gap: "6px" }}
            >
              <Plus size={14} />
              <span>Add Custom Rule</span>
            </button>
          </div>

          {customRules.length === 0 ? (
            <div
              style={{
                padding: "36px 20px",
                textAlign: "center",
                color: "var(--text-muted)",
                backgroundColor: "var(--bg-app)",
                borderRadius: "var(--radius-sm)",
                border: "1px dashed var(--border-subtle)",
              }}
            >
              <Info size={28} style={{ margin: "0 auto 8px auto", opacity: 0.5 }} />
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
                No Custom Rules Defined
              </div>
              <div style={{ fontSize: "12px", marginTop: "4px" }}>
                Standard cleaning runs automatically. Click "Add Custom Rule" above if your game needs custom regex replacements.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {customRules.map((rule, idx) => (
                <div
                  key={rule.id}
                  style={{
                    backgroundColor: "var(--bg-app)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    padding: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  {/* Top Bar: Name, Enabled Toggle, Delete */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent-primary)" }}>
                        #{idx + 1}
                      </span>
                      <input
                        type="text"
                        value={rule.name}
                        onChange={(e) => handleUpdateRule(rule.id, { name: e.target.value })}
                        placeholder="Rule Name (e.g. Strip Voice Tag)"
                        style={{ fontSize: "12px", fontWeight: 600, padding: "3px 8px", width: "100%", maxWidth: "240px" }}
                      />
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", fontSize: "11.5px" }}>
                        <input
                          type="checkbox"
                          checked={rule.isEnabled}
                          onChange={(e) => handleUpdateRule(rule.id, { isEnabled: e.target.checked })}
                          style={{ cursor: "pointer" }}
                        />
                        <span style={{ color: rule.isEnabled ? "var(--accent-success)" : "var(--text-muted)", fontWeight: 600 }}>
                          {rule.isEnabled ? "Active" : "Disabled"}
                        </span>
                      </label>

                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        style={{ background: "none", border: "none", color: "var(--accent-danger)", cursor: "pointer", padding: "4px" }}
                        title="Delete Rule"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Pattern & Replacement Inputs */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "10.5px", color: "var(--text-muted)", marginBottom: "3px" }}>
                        Find Pattern {rule.options?.isRegex ? "(Regex)" : "(Plain String)"}:
                      </label>
                      <input
                        type="text"
                        value={rule.options?.pattern || ""}
                        onChange={(e) => handleUpdateRuleOptions(rule.id, { pattern: e.target.value })}
                        placeholder={rule.options?.isRegex ? "\\\\v\\[\\d+\\]" : "Text to replace"}
                        style={{ width: "100%", fontSize: "11.5px", fontFamily: "var(--font-mono)" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "10.5px", color: "var(--text-muted)", marginBottom: "3px" }}>
                        Replacement:
                      </label>
                      <input
                        type="text"
                        value={rule.options?.replacement ?? ""}
                        onChange={(e) => handleUpdateRuleOptions(rule.id, { replacement: e.target.value })}
                        placeholder="(Leave empty to delete)"
                        style={{ width: "100%", fontSize: "11.5px", fontFamily: "var(--font-mono)" }}
                      />
                    </div>
                  </div>

                  {/* Options: Regex toggle & Source filter */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", paddingTop: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--text-secondary)", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={rule.options?.isRegex !== false}
                          onChange={(e) => handleUpdateRuleOptions(rule.id, { isRegex: e.target.checked })}
                        />
                        <span>Regular Expression</span>
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--text-secondary)", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={rule.options?.ignoreCase || false}
                          onChange={(e) => handleUpdateRuleOptions(rule.id, { ignoreCase: e.target.checked })}
                        />
                        <span>Ignore Case</span>
                      </label>
                    </div>

                    {/* Applicable Sources */}
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)", marginRight: "2px" }}>Sources:</span>
                      {(["textractor", "ocr", "batch", "manual"] as PreprocessingSource[]).map((src) => {
                        const isSelected = (rule.applicableSources ?? DEFAULT_PREPROCESSING_SOURCES).includes(src);
                        return (
                          <button
                            key={src}
                            type="button"
                            onClick={() => handleToggleSource(rule.id, src)}
                            style={{
                              fontSize: "9.5px",
                              padding: "2px 6px",
                              borderRadius: "3px",
                              border: `1px solid ${isSelected ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                              backgroundColor: isSelected ? "rgba(59, 130, 246, 0.15)" : "transparent",
                              color: isSelected ? "var(--accent-primary)" : "var(--text-muted)",
                              cursor: "pointer",
                              textTransform: "uppercase",
                              fontWeight: 600,
                            }}
                          >
                            {src}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* RIGHT CARD: Live Sandbox & Transformation Workbench                       */}
        {/* ========================================================================= */}
        <div className="card" style={{ margin: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
          <div className="card-header" style={{ paddingBottom: 0 }}>
            <div>
              <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Sparkles size={16} /> Live Preprocessing Workbench
              </span>
              <span className="card-subtitle">
                Test input text against the complete automated pipeline and custom rules
              </span>
            </div>
            {/* Source Filter for Testing */}
            <select
              value={testSource}
              onChange={(e) => setTestSource(e.target.value as any)}
              style={{ fontSize: "11.5px", padding: "5px 28px 5px 10px", minWidth: "150px", borderRadius: "4px" }}
            >
              <option value="all">🌐 All Sources</option>
              <option value="textractor">🎮 Textractor Hook</option>
              <option value="ocr">📷 OCR Input</option>
              <option value="batch">⚡ Batch Script</option>
              <option value="manual">✍️ Manual Translate</option>
            </select>
          </div>

          {/* Test Input Box */}
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
              Sample Raw Input Text:
            </label>
            <textarea
              rows={3}
              value={sampleInput}
              onChange={(e) => setSampleInput(e.target.value)}
              placeholder="Paste raw visual novel sentence with ruby, engine tags, or strange symbols..."
              style={{ width: "100%", fontSize: "12.5px", fontFamily: "var(--font-mono)", lineHeight: 1.45 }}
            />
          </div>

          {/* Final Output Result Box */}
          <div
            style={{
              backgroundColor: "var(--bg-app)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent-success)", display: "flex", alignItems: "center", gap: "5px" }}>
                <CheckCircle2 size={13} /> Clean Output (Sent to AI / MT Translation)
              </span>
              <button
                type="button"
                onClick={handleCopyOutput}
                className="btn-secondary"
                style={{ fontSize: "11px", padding: "2px 8px", display: "flex", alignItems: "center", gap: "4px" }}
              >
                {copied ? <Check size={12} color="var(--accent-success)" /> : <Copy size={12} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>

            <div
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text-primary)",
                lineHeight: 1.5,
                wordBreak: "break-word",
                minHeight: "40px",
              }}
            >
              {finalOutput || <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(Empty output)</span>}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
