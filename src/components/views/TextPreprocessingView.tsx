import React, { useState, useEffect } from "react";
import { PreprocessingStep, PreprocessingSource } from "../../types";
import {
  DEFAULT_PREPROCESSING_PIPELINE,
  DEFAULT_PREPROCESSING_SOURCES,
  executePipelineWithTrace,
} from "../../utils/textPreprocessor";
import {
  GripVertical,
  ArrowUp,
  ArrowDown,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  CheckCircle2,
  Copy,
  Check,
  Code,
  Sliders,
} from "lucide-react";

export const TextPreprocessingView: React.FC = () => {
  const [pipeline, setPipeline] = useState<PreprocessingStep[]>(() => {
    try {
      const saved = localStorage.getItem("vn_preprocessing_pipeline");
      if (saved) {
        const parsed: PreprocessingStep[] = JSON.parse(saved);
        const existingIds = new Set(parsed.map((s) => s.id));
        const missingDefaults = DEFAULT_PREPROCESSING_PIPELINE.filter((d) => !existingIds.has(d.id));
        return [...parsed, ...missingDefaults];
      }
      return DEFAULT_PREPROCESSING_PIPELINE;
    } catch {
      return DEFAULT_PREPROCESSING_PIPELINE;
    }
  });

  // Test Sandbox State & Source Filter
  const [testSource, setTestSource] = useState<PreprocessingSource | "all">("all");
  const [sampleInput, setSampleInput] = useState<string>(
    "\\c[2]坂上　智代\\c[0]「……あ、、あのっ……！　私(わたし)は……遅刻(ちこく)したくないの！！♪♥」"
  );
  const [copied, setCopied] = useState<boolean>(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  // Save pipeline changes to localStorage
  useEffect(() => {
    localStorage.setItem("vn_preprocessing_pipeline", JSON.stringify(pipeline));
  }, [pipeline]);

  // Compute live trace with active test source
  const { finalOutput, traces } = executePipelineWithTrace(
    sampleInput,
    pipeline,
    testSource === "all" ? undefined : testSource
  );

  // Toggle applicable source for a step
  const handleToggleSource = (stepId: string, source: PreprocessingSource) => {
    setPipeline((prev) =>
      prev.map((step) => {
        if (step.id !== stepId) return step;
        const currentSources = step.applicableSources ?? DEFAULT_PREPROCESSING_SOURCES;
        const nextSources = currentSources.includes(source)
          ? currentSources.filter((s) => s !== source)
          : [...currentSources, source];
        return {
          ...step,
          applicableSources: nextSources.length > 0 ? nextSources : [source],
        };
      })
    );
  };

  // Pointer-based Drag & Drop Reordering
  const handlePointerDown = (index: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setDraggingIndex(index);
  };

  const handlePointerEnter = (targetIndex: number) => {
    if (draggingIndex === null || draggingIndex === targetIndex) return;

    setPipeline((prev) => {
      const updated = [...prev];
      const [draggedItem] = updated.splice(draggingIndex, 1);
      updated.splice(targetIndex, 0, draggedItem);
      return updated;
    });
    setDraggingIndex(targetIndex);
  };

  // Global pointerup to release drag
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (draggingIndex !== null) {
        setDraggingIndex(null);
      }
    };

    window.addEventListener("pointerup", handleGlobalPointerUp);
    return () => window.removeEventListener("pointerup", handleGlobalPointerUp);
  }, [draggingIndex]);

  // Toggle step enabled
  const handleToggleStep = (id: string) => {
    setPipeline(
      pipeline.map((step) => (step.id === id ? { ...step, isEnabled: !step.isEnabled } : step))
    );
  };

  // Move step Up
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const newPipeline = [...pipeline];
    const temp = newPipeline[index - 1];
    newPipeline[index - 1] = newPipeline[index];
    newPipeline[index] = temp;
    setPipeline(newPipeline);
  };

  // Move step Down
  const handleMoveDown = (index: number) => {
    if (index >= pipeline.length - 1) return;
    const newPipeline = [...pipeline];
    const temp = newPipeline[index + 1];
    newPipeline[index + 1] = newPipeline[index];
    newPipeline[index] = temp;
    setPipeline(newPipeline);
  };

  // Add Custom Replacement Rule
  const handleAddCustomRule = () => {
    const newStep: PreprocessingStep = {
      id: `custom_${Date.now()}`,
      type: "custom_regex",
      name: `Custom Rule #${pipeline.filter((p) => p.isCustom).length + 1}`,
      description: "Custom user-defined search and replace pattern",
      isEnabled: true,
      isCustom: true,
      applicableSources: ["manual", "textractor", "ocr"],
      options: {
        pattern: "",
        replacement: "",
        isRegex: true,
        ignoreCase: false,
      },
    };
    setPipeline([...pipeline, newStep]);
  };

  // Delete Custom Rule
  const handleDeleteStep = (id: string) => {
    setPipeline(pipeline.filter((step) => step.id !== id));
  };

  // Update Step Options
  const handleUpdateStepOptions = (id: string, patch: Partial<NonNullable<PreprocessingStep["options"]>>) => {
    setPipeline(
      pipeline.map((step) =>
        step.id === id ? { ...step, options: { ...(step.options || {}), ...patch } } : step
      )
    );
  };

  // Reset to Defaults
  const handleResetDefaults = () => {
    if (window.confirm("Reset text preprocessing pipeline to default rules and order?")) {
      setPipeline(DEFAULT_PREPROCESSING_PIPELINE);
    }
  };

  // Copy output
  const handleCopyOutput = () => {
    navigator.clipboard.writeText(finalOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* Top Banner: Centralized Pipeline Management */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Sparkles size={16} color="var(--accent-primary)" /> Centralized Text Preprocessing Pipeline
            </span>
            <span className="card-subtitle">
              Configure cleanup rules and specify which input source (Manual, Textractor, OCR) each step applies to.
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={handleAddCustomRule} className="btn-primary" style={{ padding: "6px 14px", fontSize: "12.5px" }}>
              <Plus size={14} />
              <span>Add Custom Rule</span>
            </button>
            <button onClick={handleResetDefaults} className="btn-secondary" style={{ padding: "6px 12px", fontSize: "12.5px" }} title="Reset to default pipeline">
              <RotateCcw size={13} />
              <span>Reset Defaults</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Reorderable Pipeline List vs Live Interactive Sandbox */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "16px" }}>
        {/* Left Column: Reorderable Steps List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
            <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)" }}>
              Execution Order ({pipeline.filter((p) => p.isEnabled).length} of {pipeline.length} active steps)
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Drag grip handle or use ▲▼ to reorder
            </span>
          </div>

          {/* Draggable Step Cards */}
          {pipeline.map((step, index) => {
            const isFirst = index === 0;
            const isLast = index === pipeline.length - 1;

            return (
              <div
                key={step.id}
                onPointerEnter={() => handlePointerEnter(index)}
                className="card"
                style={{
                  margin: 0,
                  padding: "12px 14px",
                  borderLeft: step.isEnabled ? "3px solid var(--accent-primary)" : "3px solid var(--border-subtle)",
                  backgroundColor: draggingIndex === index ? "var(--bg-surface-elevated)" : step.isEnabled ? "var(--bg-surface)" : "var(--bg-surface-elevated)",
                  opacity: step.isEnabled ? 1 : 0.65,
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  transform: draggingIndex === index ? "scale(1.02)" : "none",
                  boxShadow: draggingIndex === index ? "0 8px 24px rgba(0,0,0,0.6)" : "none",
                  border: draggingIndex === index ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                  userSelect: "none",
                }}
              >
                {/* Step Top Bar: Grip, Step #, Title, Toggle, Reorder Buttons */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                    {/* Drag Handle Grip */}
                    <div
                      onPointerDown={(e) => handlePointerDown(index, e)}
                      style={{
                        cursor: draggingIndex === index ? "grabbing" : "grab",
                        color: draggingIndex === index ? "var(--accent-primary)" : "var(--text-muted)",
                        display: "flex",
                        alignItems: "center",
                        padding: "6px 4px",
                        touchAction: "none",
                      }}
                      title="Click & Drag to reorder"
                    >
                      <GripVertical size={16} />
                    </div>

                    {/* Step Number Badge */}
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        fontWeight: 700,
                        backgroundColor: step.isEnabled ? "var(--bg-app)" : "var(--bg-surface)",
                        color: step.isEnabled ? "var(--accent-cyan)" : "var(--text-muted)",
                        padding: "2px 7px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      #{index + 1}
                    </span>

                    {/* Step Name & Description */}
                    <div>
                      <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)", display: "block" }}>
                        {step.name}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {step.description}
                      </span>
                    </div>
                  </div>

                  {/* Right Actions: Enable Switch, Up/Down, Delete */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {/* Move Up Button */}
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={isFirst}
                      className="btn-secondary"
                      style={{ padding: "4px 6px", opacity: isFirst ? 0.3 : 1 }}
                      title="Move step up"
                    >
                      <ArrowUp size={12} />
                    </button>

                    {/* Move Down Button */}
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={isLast}
                      className="btn-secondary"
                      style={{ padding: "4px 6px", opacity: isLast ? 0.3 : 1 }}
                      title="Move step down"
                    >
                      <ArrowDown size={12} />
                    </button>

                    {/* Toggle Step Switch */}
                    <label style={{ display: "flex", alignItems: "center", marginLeft: "4px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={step.isEnabled}
                        onChange={() => handleToggleStep(step.id)}
                        style={{ transform: "scale(1.15)" }}
                      />
                    </label>

                    {/* Delete button (for custom steps) */}
                    {step.isCustom && (
                      <button
                        onClick={() => handleDeleteStep(step.id)}
                        className="btn-danger"
                        style={{ padding: "4px 6px", marginLeft: "4px" }}
                        title="Delete custom rule"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Applicable Input Sources Checklist (Clean without emojis) */}
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    marginTop: "8px",
                    paddingTop: "8px",
                    borderTop: "1px dashed var(--border-subtle)",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>
                    Applies to:
                  </span>

                  {(["manual", "textractor", "ocr"] as PreprocessingSource[]).map((src) => {
                    const activeSources = step.applicableSources ?? DEFAULT_PREPROCESSING_SOURCES;
                    const isSelected = activeSources.includes(src);
                    const label = src === "manual" ? "Manual Input" : src === "textractor" ? "Textractor" : "OCR";

                    return (
                      <label
                        key={src}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          fontSize: "11px",
                          color: isSelected ? "var(--text-primary)" : "var(--text-muted)",
                          cursor: "pointer",
                          userSelect: "none",
                          fontWeight: isSelected ? 500 : 400,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSource(step.id, src)}
                          style={{
                            cursor: "pointer",
                            accentColor: "var(--accent-primary)",
                          }}
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>

                {/* Specific Step Options / Custom Regex Inputs */}
                {step.type === "custom_regex" && (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      marginTop: "10px",
                      paddingTop: "10px",
                      borderTop: "1px solid var(--border-subtle)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "10.5px", color: "var(--text-muted)", marginBottom: "3px" }}>
                          Match Pattern (Regex / String)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. \\c\\[[0-9]+\\] or [A-Z]+"
                          value={step.options?.pattern || ""}
                          onChange={(e) => handleUpdateStepOptions(step.id, { pattern: e.target.value })}
                          style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "12px" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "10.5px", color: "var(--text-muted)", marginBottom: "3px" }}>
                          Replacement Text
                        </label>
                        <input
                          type="text"
                          placeholder="Leave empty to remove"
                          value={step.options?.replacement || ""}
                          onChange={(e) => handleUpdateStepOptions(step.id, { replacement: e.target.value })}
                          style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "12px" }}
                        />
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "16px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={step.options?.isRegex !== false}
                          onChange={(e) => handleUpdateStepOptions(step.id, { isRegex: e.target.checked })}
                        />
                        <span>Treat as Regular Expression (Regex)</span>
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={step.options?.ignoreCase || false}
                          onChange={(e) => handleUpdateStepOptions(step.id, { ignoreCase: e.target.checked })}
                        />
                        <span>Ignore Case (Case Insensitive)</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Column: Live Interactive Pipeline Sandbox & Inspector */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Live Sandbox Card */}
          <div className="card" style={{ margin: 0 }}>
            <div className="card-header">
              <span className="card-title">
                <Code size={16} /> Live Pipeline Sandbox
              </span>
              <span className="card-subtitle">Real-time transformation tester</span>
            </div>

            {/* Test Input Source Segmented Tabs */}
            <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>
                Preview Source:
              </span>
              <div
                style={{
                  display: "inline-flex",
                  backgroundColor: "var(--bg-app)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "2px",
                  gap: "2px",
                }}
              >
                {[
                  { id: "all", label: "All Sources" },
                  { id: "manual", label: "Manual" },
                  { id: "textractor", label: "Textractor" },
                  { id: "ocr", label: "OCR" },
                ].map((tab) => {
                  const isActive = testSource === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setTestSource(tab.id as any)}
                      style={{
                        padding: "3px 10px",
                        fontSize: "11px",
                        fontWeight: isActive ? 600 : 400,
                        backgroundColor: isActive ? "var(--accent-primary)" : "transparent",
                        color: isActive ? "#ffffff" : "var(--text-secondary)",
                        border: "none",
                        borderRadius: "calc(var(--radius-sm) - 2px)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Sample Presets */}
            <div style={{ marginBottom: "10px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginBottom: "5px" }}>
                Load Sample Dialogue Preset:
              </span>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button
                  onClick={() =>
                    setSampleInput(
                      "私は今日、学校(がっこう)で先輩[せんぱい]に会った。<ruby>約束<rt>やくそく</rt></ruby>を守る。"
                    )
                  }
                  className="btn-secondary"
                  style={{ padding: "3px 8px", fontSize: "11px" }}
                >
                  Furigana & Ruby
                </button>
                <button
                  onClick={() =>
                    setSampleInput(
                      "あ、、、、あのっ……！　　わ、私……！！　遅刻(ちこく)しちゃう！！"
                    )
                  }
                  className="btn-secondary"
                  style={{ padding: "3px 8px", fontSize: "11px" }}
                >
                  Stutter & Spaces
                </button>
                <button
                  onClick={() =>
                    setSampleInput(
                      "\\c[2]坂上　智代\\c[0]「……別に、何でもないわ。\\n早く教室に行きましょう。」"
                    )
                  }
                  className="btn-secondary"
                  style={{ padding: "3px 8px", fontSize: "11px" }}
                >
                  Engine Tags & Quotes
                </button>
                <button
                  onClick={() =>
                    setSampleInput(
                      "ｵﾊﾖｳｺﾞｻﾞｲﾏｽ！　今日(きょう)もよろしく♪♥★"
                    )
                  }
                  className="btn-secondary"
                  style={{ padding: "3px 8px", fontSize: "11px" }}
                >
                  Half-width & Symbols
                </button>
              </div>
            </div>

            {/* Input Raw Text */}
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                Raw Input Text (Before Preprocessing):
              </label>
              <textarea
                value={sampleInput}
                onChange={(e) => setSampleInput(e.target.value)}
                rows={3}
                style={{ width: "100%", fontFamily: "var(--font-jp)", fontSize: "13px", resize: "vertical" }}
                placeholder="Paste sample raw game dialogue text here..."
              />
            </div>

            {/* Output Clean Text */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontSize: "11px", color: "var(--accent-success)", fontWeight: 600 }}>
                  Preprocessed Output (Ready for Translation):
                </label>
                <button
                  onClick={handleCopyOutput}
                  className="btn-secondary"
                  style={{ padding: "2px 8px", fontSize: "11px" }}
                >
                  {copied ? <Check size={12} color="var(--accent-success)" /> : <Copy size={12} />}
                  <span>{copied ? "Copied!" : "Copy"}</span>
                </button>
              </div>
              <div
                style={{
                  backgroundColor: "var(--bg-app)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "10px 12px",
                  fontFamily: "var(--font-jp)",
                  fontSize: "13.5px",
                  color: "var(--text-primary)",
                  minHeight: "48px",
                  wordBreak: "break-word",
                  lineHeight: "1.5",
                }}
              >
                {finalOutput || <span style={{ color: "var(--text-muted)" }}>(Empty result)</span>}
              </div>
            </div>
          </div>

          {/* Step-by-Step Pipeline Inspector */}
          <div className="card" style={{ margin: 0, padding: "14px 16px" }}>
            <div className="card-header" style={{ marginBottom: "10px" }}>
              <span className="card-title">
                <Sliders size={16} /> Step-by-Step Execution Trace
              </span>
              <span className="badge badge-neutral">Pipeline Debugger</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {traces.map((trace, idx) => (
                <div
                  key={trace.stepId}
                  style={{
                    backgroundColor: "var(--bg-app)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 12px",
                    fontSize: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                      Step #{idx + 1}: {trace.stepName}
                    </span>
                    {!trace.isEnabled ? (
                      <span
                        style={{
                          backgroundColor: "rgba(248, 81, 73, 0.1)",
                          color: "var(--accent-danger)",
                          padding: "1px 6px",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "10.5px",
                        }}
                      >
                        Disabled
                      </span>
                    ) : !trace.isApplicable ? (
                      <span
                        style={{
                          backgroundColor: "rgba(246, 194, 62, 0.1)",
                          color: "var(--accent-warning)",
                          padding: "1px 6px",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "10.5px",
                        }}
                      >
                        Skipped (Not for {testSource.toUpperCase()})
                      </span>
                    ) : trace.wasModified ? (
                      <span
                        style={{
                          backgroundColor: "rgba(63, 185, 80, 0.15)",
                          color: "var(--accent-success)",
                          padding: "1px 6px",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "10.5px",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: "3px",
                        }}
                      >
                        <CheckCircle2 size={10} /> Modified
                      </span>
                    ) : (
                      <span
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          color: "var(--text-muted)",
                          padding: "1px 6px",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "10.5px",
                        }}
                      >
                        Passed (No Change)
                      </span>
                    )}
                  </div>

                  {trace.wasModified && (
                    <div
                      style={{
                        fontFamily: "var(--font-jp)",
                        fontSize: "11.5px",
                        color: "var(--text-primary)",
                        backgroundColor: "var(--bg-surface)",
                        padding: "4px 8px",
                        borderRadius: "var(--radius-sm)",
                        borderLeft: "2px solid var(--accent-success)",
                      }}
                    >
                      {trace.outputText}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
