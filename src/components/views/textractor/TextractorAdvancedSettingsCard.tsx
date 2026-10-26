import React, { useState } from "react";
import {
  TextractorService,
  POPULAR_HOOK_PRESETS,
  EngineHookPreset,
  detectTextractorPath,
} from "../../../services/textractorService";
import { useTextractorStore } from "../../../stores/useTextractorStore";
import {
  Sliders,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Search,
  Zap,
  RefreshCw,
  Check,
  XCircle,
  X,
  Layers,
} from "lucide-react";

export const TextractorAdvancedSettingsCard: React.FC = () => {
  const {
    exePath,
    setExePath,
    isHooked,
    attachedPid,
    selectedPid,
    debounceMs,
    setDebounceMs,
    threadSyncWaitMs,
    setThreadSyncWaitMs,
    charDeduplicationCount,
    setCharDeduplicationCount,
    ignoreDuplicateLines,
    setIgnoreDuplicateLines,
    loopDeduplication,
    setLoopDeduplication,
    stutterReduction,
    setStutterReduction,
    maxCharsPerPass,
    setMaxCharsPerPass,
  } = useTextractorStore();

  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [selectedPreset, setSelectedPreset] = useState<EngineHookPreset>(POPULAR_HOOK_PRESETS[0]);
  const [customHookCode, setCustomHookCode] = useState<string>("");
  const [isInsertingHook, setIsInsertingHook] = useState<boolean>(false);
  const [hookFeedback, setHookFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleInsertHookCode = async () => {
    if (!isHooked || !customHookCode.trim()) return;
    setIsInsertingHook(true);
    setHookFeedback(null);
    try {
      const res = await TextractorService.insertHook(customHookCode.trim());
      if (res.success) {
        setHookFeedback({
          type: "success",
          message: `Custom hook injected successfully to PID ${attachedPid || selectedPid}! Advance game dialogue to detect the new text thread.`,
        });
      } else {
        setHookFeedback({
          type: "error",
          message: res.error || "Failed to insert hook code",
        });
      }
    } catch (err: any) {
      setHookFeedback({
        type: "error",
        message: err?.toString() || "Unexpected error inserting hook",
      });
    } finally {
      setIsInsertingHook(false);
    }
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
            Advanced Hook Settings
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "12px" }}>
          <span>{showAdvanced ? "Hide" : "Expand"}</span>
          {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {showAdvanced && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "14px", borderTop: "1px solid var(--border-subtle)", paddingTop: "14px" }}>
          {/* Category 1: Executable Path */}
          <div style={{ backgroundColor: "var(--bg-app)", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
              <FolderOpen size={13} color="var(--accent-primary)" />
              <span>Textractor Binary Executable Path</span>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                <label style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  TextractorCLI.exe File Path (Auto-resolved from standard Program Files & %LOCALAPPDATA%)
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    const detected = await detectTextractorPath();
                    if (detected) {
                      setExePath(detected);
                    }
                  }}
                  style={{
                    fontSize: "10.5px",
                    padding: "2px 8px",
                    background: "rgba(78, 115, 223, 0.15)",
                    border: "1px solid rgba(78, 115, 223, 0.4)",
                    color: "var(--accent-primary)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <Search size={11} />
                  <span>Auto Detect</span>
                </button>
              </div>
              <input
                type="text"
                value={exePath}
                onChange={(e) => setExePath(e.target.value)}
                style={{ width: "100%", fontSize: "11.5px", fontFamily: "var(--font-mono)" }}
              />
            </div>
          </div>

          {/* Category 2: Custom Engine Hook Code Injection */}
          <div style={{ backgroundColor: "var(--bg-app)", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
              <Zap size={13} color="var(--accent-gold)" />
              <span>Custom Memory Hook Code Injection</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: "10px", alignItems: "flex-end" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                  Popular Engine Preset
                </label>
                <select
                  value={selectedPreset.name}
                  onChange={(e) => {
                    const found = POPULAR_HOOK_PRESETS.find((p) => p.name === e.target.value);
                    if (found) {
                      setSelectedPreset(found);
                      if (found.code) setCustomHookCode(found.code);
                      setHookFeedback(null);
                    }
                  }}
                  style={{ width: "100%", fontSize: "11.5px" }}
                >
                  {POPULAR_HOOK_PRESETS.map((preset) => (
                    <option key={preset.name} value={preset.name}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                  Hook Code String (/HN... or /HS...)
                </label>
                <input
                  type="text"
                  value={customHookCode}
                  onChange={(e) => {
                    setCustomHookCode(e.target.value);
                    setHookFeedback(null);
                  }}
                  placeholder="Enter hook code (e.g. /HN-4*0@...)"
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "11.5px" }}
                />
              </div>

              <button
                type="button"
                onClick={handleInsertHookCode}
                disabled={!isHooked || !customHookCode.trim() || isInsertingHook}
                className="btn-secondary"
                style={{ padding: "6px 14px", fontSize: "11.5px", whiteSpace: "nowrap" }}
              >
                {isInsertingHook ? (
                  <RefreshCw size={12} className="spin" />
                ) : (
                  <Zap size={12} color="var(--accent-gold)" />
                )}
                <span>{isInsertingHook ? "Injecting..." : "Insert Hook"}</span>
              </button>
            </div>

            {hookFeedback && (
              <div
                style={{
                  marginTop: "10px",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "12px",
                  backgroundColor:
                    hookFeedback.type === "success"
                      ? "rgba(46, 160, 67, 0.12)"
                      : "rgba(248, 81, 73, 0.12)",
                  border: `1px solid ${
                    hookFeedback.type === "success"
                      ? "var(--accent-success, #2ea043)"
                      : "var(--accent-danger, #f85149)"
                  }`,
                  color:
                    hookFeedback.type === "success"
                      ? "var(--accent-success, #2ea043)"
                      : "var(--accent-danger, #f85149)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {hookFeedback.type === "success" ? <Check size={14} /> : <XCircle size={14} />}
                  <span>{hookFeedback.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setHookFeedback(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "inherit",
                    cursor: "pointer",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Category 3: Performance & Timing */}
          <div style={{ backgroundColor: "var(--bg-app)", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
              <Sliders size={13} color="var(--accent-primary)" />
              <span>Timing & Dual-Thread Synchronization</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "16px" }}>
              {/* 1. Typewriter Debounce Slider */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 500 }}>
                    Typewriter Debounce Delay:
                  </label>
                  <strong style={{ fontSize: "11px", color: "var(--accent-primary)" }}>{debounceMs} ms</strong>
                </div>
                <input
                  type="range"
                  min={50}
                  max={600}
                  step={25}
                  value={debounceMs}
                  onChange={(e) => setDebounceMs(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "3px", lineHeight: "1.3" }}>
                  Buffers typewriter character streams before dispatching sentences.
                </span>
              </div>

              {/* 2. Dual-Thread Sync Window Slider */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 500 }}>
                    Dual-Thread Sync Wait Window:
                  </label>
                  <strong style={{ fontSize: "11px", color: "var(--accent-gold)" }}>{threadSyncWaitMs || 150} ms</strong>
                </div>
                <input
                  type="range"
                  min={50}
                  max={600}
                  step={25}
                  value={threadSyncWaitMs || 150}
                  onChange={(e) => setThreadSyncWaitMs(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "3px", lineHeight: "1.3" }}>
                  When using separate Name & Dialogue threads, waits up to this duration to sync character name or clear for narration.
                </span>
              </div>
            </div>
          </div>

          {/* Category 4: Deduplication & Clean Text Filtering */}
          <div style={{ backgroundColor: "var(--bg-app)", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
              <Layers size={13} color="var(--accent-secondary)" />
              <span>Text Hook Deduplication & Filtering</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "16px", alignItems: "flex-start" }}>
              {/* 1. Consecutive Character Deduplication Number Input */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", alignItems: "center" }}>
                  <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 500 }}>
                    Consecutive Character Deduplication:
                  </label>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: charDeduplicationCount >= 2 ? "var(--accent-primary)" : "var(--text-muted)" }}>
                    {charDeduplicationCount >= 2 ? `${charDeduplicationCount}x (${charDeduplicationCount === 2 ? "Doubled" : charDeduplicationCount === 3 ? "Tripled" : `${charDeduplicationCount}-pass`})` : "Disabled (0)"}
                  </span>
                </div>
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={1}
                  value={charDeduplicationCount}
                  onChange={(e) => setCharDeduplicationCount(parseInt(e.target.value, 10) || 0)}
                  placeholder="0 to disable (e.g. 2 for doubled characters)"
                  style={{ width: "100%", fontSize: "12px", height: "32px" }}
                />
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "3px", lineHeight: "1.3" }}>
                  Collapses multi-pass text hook duplicates (e.g. set <strong>2</strong> for 「「運運命命」」 → 「運命」, <strong>3</strong> for tripled).
                </span>
              </div>

              {/* 2. Rapid Burst Duplicate Line Suppression Toggle */}
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "11.5px", fontWeight: 500, color: "var(--text-primary)", marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    checked={ignoreDuplicateLines}
                    onChange={(e) => setIgnoreDuplicateLines(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <span>Suppress Identical Burst Packets (&lt; 800ms)</span>
                </label>
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "4px", lineHeight: "1.3" }}>
                  Prevents rapid duplicate memory hook packet bursts from triggering double translations while still allowing repeated lines when you advance the game.
                </span>
              </div>

              {/* 3. Repeated Phrase & Loop Deduplicator */}
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "11.5px", fontWeight: 500, color: "var(--text-primary)", marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    checked={loopDeduplication !== false}
                    onChange={(e) => setLoopDeduplication(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <span>Repeated Phrase & Loop Deduplicator</span>
                </label>
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "4px", lineHeight: "1.3" }}>
                  Collapses shadow and outline rendering hook loops (e.g. 遥月遥月... → 遥月).
                </span>
              </div>

              {/* 4. Stutter & Repeated Punctuation Reducer */}
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "11.5px", fontWeight: 500, color: "var(--text-primary)", marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    checked={stutterReduction !== false}
                    onChange={(e) => setStutterReduction(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <span>Stutter & Repeated Punctuation Reducer</span>
                </label>
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "4px", lineHeight: "1.3" }}>
                  Collapses excessive stutter marks (e.g. あ、、あの → あ、あの, ！！！！ → ！).
                </span>
              </div>

              {/* 5. Max Characters per Pass (Anti-Skip Burst Filter) */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", alignItems: "center" }}>
                  <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 500 }}>
                    Max Characters per Pass (Skip Burst Filter):
                  </label>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: maxCharsPerPass > 0 ? "var(--accent-gold)" : "var(--text-muted)" }}>
                    {maxCharsPerPass > 0 ? `${maxCharsPerPass} chars` : "Disabled (0)"}
                  </span>
                </div>
                <input
                  type="number"
                  min={0}
                  max={5000}
                  step={50}
                  value={maxCharsPerPass}
                  onChange={(e) => setMaxCharsPerPass(parseInt(e.target.value, 10) || 0)}
                  placeholder="250 (0 to disable)"
                  style={{ width: "100%", fontSize: "12px", height: "32px" }}
                />
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "3px", lineHeight: "1.3" }}>
                  Discards text clumps exceeding this length when fast-forwarding/skipping VN dialogue. Does not affect OCR.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
