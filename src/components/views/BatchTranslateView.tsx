import { useConfirmation } from "../common/ConfirmationProvider";
import React, { useState, useEffect, useMemo } from "react";
import { TauriBridge } from "../../services/tauriBridge";
import {
  Play,
  FileCode,
  Square,
  Sliders,
  SlidersHorizontal,
  ExternalLink,
  AlertTriangle,
  Brain,
} from "lucide-react";
import { ModelSelectorCombobox } from "../common/ModelSelectorCombobox";
import { ProviderSelectorMultiSelect } from "../common/ProviderSelectorMultiSelect";
import { SegmentedControl } from "../common/SegmentedControl";
import {
  getSelectedModelProviders,
  setSelectedModelProviders,
  fetchModelEndpoints,
  getModelPricingSummary,
  OpenRouterEndpoint,
  getModelReasoningCapabilities,
  formatReasoningEffortLabel,
} from "../../services/openRouterService";
import {
  batchTranslateService,
  BatchFileEntry,
  BatchSettings,
  isGenuinelyTranslated,
  isExplicitTagged,
  isProcessed,
} from "../../services/batchTranslateService";
import { useBatchStore } from "../../stores/useBatchStore";
import { useUIStore } from "../../stores/useUIStore";
import { BatchStatsBadges } from "./batch/BatchStatsBadges";
import { BatchQueuedFilesTable } from "./batch/BatchQueuedFilesTable";
import { BatchPreviewTable } from "./batch/BatchPreviewTable";
import { ReasoningEffort } from "../../types";
import { settingsManager } from "../../services/settingsManager";

export interface BatchTranslateViewProps {
  onOpenPreprocessingSettings?: () => void;
}

export const BatchTranslateView: React.FC<BatchTranslateViewProps> = ({
  onOpenPreprocessingSettings,
}) => {
  const confirm = useConfirmation();
  const {
    queuedFiles,
    setQueuedFiles,
    selectedFileId,
    setSelectedFileId,
    searchFilter,
    setSearchFilter,
    statusFilter,
    setStatusFilter,
    isRunning,
    setIsRunning,
    progressData,
    setProgressData,
    sessionStats,
    avgBatchDurationMs,
    estimatedRemainingSeconds,
  } = useBatchStore();

  // Mode Switcher: "preview" vs "settings"
  const activeTab = useUIStore((state) => state.batchSubTab);
  const setActiveTab = useUIStore((state) => state.setBatchSubTab);

  // Settings State from Centralized settingsManager
  const initialBatch = settingsManager.getBatch();
  const [selectedEngine, setSelectedEngine] = useState<string>(() => initialBatch.modelId || "openai/gpt-4o-mini");
  const [selectedProviders, setSelectedProviders] = useState<string[]>(() => getSelectedModelProviders(initialBatch.modelId || "openai/gpt-4o-mini"));
  const [modelEndpoints, setModelEndpoints] = useState<OpenRouterEndpoint[]>([]);

  useEffect(() => {
    if (!selectedEngine || selectedEngine.startsWith("mt:")) {
      setModelEndpoints([]);
      return;
    }
    let cancelled = false;
    fetchModelEndpoints(selectedEngine).then((eps) => {
      if (!cancelled) setModelEndpoints(eps);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedEngine]);

  const pricingSummary = useMemo(() => {
    return getModelPricingSummary(selectedEngine, selectedProviders, undefined, modelEndpoints);
  }, [selectedEngine, selectedProviders, modelEndpoints]);

  const reasoningCapabilities = useMemo(() => {
    return getModelReasoningCapabilities(selectedEngine);
  }, [selectedEngine]);

  const [linesPerBatch, setLinesPerBatch] = useState<number>(() => initialBatch.linesPerBatch || 10);
  const [linesPerBatchInput, setLinesPerBatchInput] = useState<string>(String(initialBatch.linesPerBatch || 10));

  const [maxBatchContext, setMaxBatchContext] = useState<number>(() => initialBatch.maxBatchContext ?? 2);
  const [maxBatchContextInput, setMaxBatchContextInput] = useState<string>(String(initialBatch.maxBatchContext ?? 2));

  const [retainBatchContext, setRetainBatchContext] = useState<number>(() => initialBatch.retainBatchContext ?? 1);
  const [retainBatchContextInput, setRetainBatchContextInput] = useState<string>(String(initialBatch.retainBatchContext ?? 1));

  const [concurrency, setConcurrency] = useState<number>(() => initialBatch.concurrency || 2);
  const [concurrencyInput, setConcurrencyInput] = useState<string>(String(initialBatch.concurrency || 2));

  const [delayMs, setDelayMs] = useState<number>(() => initialBatch.delayMs ?? 1500);
  const [delayMsInput, setDelayMsInput] = useState<string>(String(initialBatch.delayMs ?? 1500));

  const [timeoutMinutes, setTimeoutMinutes] = useState<number>(() => initialBatch.timeoutMinutes || 10);
  const [timeoutMinutesInput, setTimeoutMinutesInput] = useState<string>(String(initialBatch.timeoutMinutes || 10));

  const [maxBackoffSeconds, setMaxBackoffSeconds] = useState<number>(() => initialBatch.maxBackoffSeconds ?? 30);
  const [maxBackoffSecondsInput, setMaxBackoffSecondsInput] = useState<string>(String(initialBatch.maxBackoffSeconds ?? 30));

  const [autoContinue, setAutoContinue] = useState<boolean>(() => initialBatch.autoContinueUntilCompleted ?? true);
  const [translateExplicitOnly, setTranslateExplicitOnly] = useState<boolean>(() => initialBatch.translateExplicitOnly ?? false);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(() => initialBatch.reasoningEffort || "default");
  const [outputDir, setOutputDir] = useState<string>(() => initialBatch.outputDir || "");
  const [fileSuffix, setFileSuffix] = useState<string>(() => initialBatch.fileSuffix || "_translated");

  // Sync settings to Centralized settingsManager
  useEffect(() => {
    setSelectedProviders(getSelectedModelProviders(selectedEngine));
    settingsManager.updateBatch({
      modelId: selectedEngine,
      linesPerBatch,
      maxBatchContext,
      retainBatchContext,
      concurrency,
      delayMs,
      timeoutMinutes,
      maxBackoffSeconds,
      autoContinueUntilCompleted: autoContinue,
      translateExplicitOnly,
      reasoningEffort,
      outputDir,
      fileSuffix,
    });
  }, [selectedEngine, linesPerBatch, maxBatchContext, retainBatchContext, concurrency, delayMs, timeoutMinutes, maxBackoffSeconds, autoContinue, translateExplicitOnly, reasoningEffort, outputDir, fileSuffix]);

  // Auto-select first file if none selected
  useEffect(() => {
    if (!selectedFileId && queuedFiles.length > 0) {
      setSelectedFileId(queuedFiles[0].id);
    }
  }, [queuedFiles, selectedFileId]);

  // Subscribe to progress events
  useEffect(() => {
    const unsubscribe = batchTranslateService.subscribe((update) => {
      setProgressData(update);
      // Only auto-select active file if user currently has no file selected
      if (update.activeFileId && !useBatchStore.getState().selectedFileId) {
        setSelectedFileId(update.activeFileId);
      }
    });
    return () => unsubscribe();
  }, []);


  // Check if there are remaining lines available to translate based on active mode
  const hasTranslatableLines = useMemo(() => {
    if (queuedFiles.length === 0) return false;
    if (translateExplicitOnly) {
      // In explicit re-translation mode: only explicit-flagged lines are valid targets
      return queuedFiles.some((f) => f.items.some((it) => isExplicitTagged(it)));
    }
    // In standard mode: any line not processed yet (neither genuinely translated nor explicit) is a valid target
    return queuedFiles.some((f) => f.items.some((it) => !isProcessed(it)));
  }, [queuedFiles, translateExplicitOnly]);

  // Active Selected File
  const activeFile = useMemo(() => {
    return queuedFiles.find((f) => f.id === selectedFileId) || queuedFiles[0] || null;
  }, [queuedFiles, selectedFileId]);


  const handleAddFiles = async () => {
    try {
      const results = await TauriBridge.showPickFilesDialog();
      if (Array.isArray(results) && results.length > 0) {
        const rawFiles: BatchFileEntry[] = results.map(([filePath, content, sizeBytes]) => {
          const fileName = filePath.replace(/\\/g, "/").split("/").pop() || "script.jsonl";
          const items = batchTranslateService.parseScriptContent(content);
          return {
            id: `bf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: fileName,
            path: filePath,
            sizeBytes,
            rawContent: content,
            items,
            status: "ready",
            completedLines: items.filter((it) => isGenuinelyTranslated(it)).length,
            totalLines: items.length,
          };
        });

        // Hydrate from existing output files (.jsonl) on disk
        const hydratedFiles = await Promise.all(
          rawFiles.map((f) => batchTranslateService.hydrateExistingTranslationFromDisk(f, outputDir, fileSuffix))
        );

        setQueuedFiles((prev) => [...prev, ...hydratedFiles]);
        if (!selectedFileId && hydratedFiles.length > 0) {
          setSelectedFileId(hydratedFiles[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to pick files:", err);
    }
  };

  const handleBrowseOutputDir = async () => {
    try {
      const folder = await TauriBridge.showPickDirectoryDialog();
      if (folder) {
        setOutputDir(folder);
        if (queuedFiles.length > 0) {
          const rehydrated = await Promise.all(
            queuedFiles.map((f) => batchTranslateService.hydrateExistingTranslationFromDisk(f, folder, fileSuffix))
          );
          setQueuedFiles(rehydrated);
        }
      }
    } catch (err) {
      console.error("Failed to pick output directory:", err);
    }
  };

  const handleScanDiskProgress = async () => {
    if (queuedFiles.length === 0 || isRunning) return;
    try {
      const rehydrated = await Promise.all(
        queuedFiles.map((f) => batchTranslateService.hydrateExistingTranslationFromDisk(f, outputDir, fileSuffix))
      );
      setQueuedFiles(rehydrated);
    } catch (err) {
      console.error("Failed to scan disk progress:", err);
    }
  };

  const handleRemoveFile = (id: string) => {
    confirm({ title: "Remove queued script?", message: "Remove this script and its in-memory progress from the batch queue? Saved files are kept.", confirmText: "Remove script" }, () => {
      if (isRunning) return;
      setQueuedFiles((prev) => prev.filter((f) => f.id !== id));
      if (selectedFileId === id) {
        setSelectedFileId(null);
      }
    });
  };

  const handleClearQueue = () => {
    confirm({ title: "Clear batch queue?", message: "Remove all queued scripts and their in-memory progress? Saved files are kept.", confirmText: "Clear queue" }, () => {
      if (isRunning) return;
      setQueuedFiles([]);
      setSelectedFileId(null);
      setProgressData(null);
    });
  };

  const handleStartBatch = async () => {
    if (queuedFiles.length === 0) return;
    setIsRunning(true);

    const settings: BatchSettings = {
      linesPerBatch,
      maxBatchContext,
      retainBatchContext,
      concurrency,
      modelId: selectedEngine,
      temperature: 0.3,
      delayMs,
      timeoutMinutes,
      maxBackoffSeconds,
      autoContinueUntilCompleted: autoContinue,
      translateExplicitOnly,
      overrideRawWithPreprocessed: true,
      selectedProviders,
      reasoningEffort,
      outputDir,
      fileSuffix,
    };

    try {
      await batchTranslateService.runBatchTranslation(queuedFiles, settings, (updatedFile) => {
        setQueuedFiles((prev) => prev.map((f) => (f.id === updatedFile.id ? { ...updatedFile } : f)));
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleCancelBatch = () => {
    batchTranslateService.cancel();
    setIsRunning(false);
  };

  // Validation Handlers for Numeric Inputs (No upper maximum caps)
  const handleCommitLinesPerBatch = () => {
    const parsed = parseInt(linesPerBatchInput, 10);
    const valid = isNaN(parsed) || parsed < 1 ? 10 : parsed;
    setLinesPerBatch(valid);
    setLinesPerBatchInput(String(valid));
  };

  const handleCommitMaxBatchContext = () => {
    const parsed = parseInt(maxBatchContextInput, 10);
    const valid = isNaN(parsed) || parsed < 0 ? 2 : parsed;
    setMaxBatchContext(valid);
    setMaxBatchContextInput(String(valid));
    if (valid > 0 && retainBatchContext > valid) {
      setRetainBatchContext(valid);
      setRetainBatchContextInput(String(valid));
    }
  };

  const handleCommitRetainBatchContext = () => {
    const parsed = parseInt(retainBatchContextInput, 10);
    const valid = isNaN(parsed) || parsed < 0 ? 1 : (maxBatchContext > 0 ? Math.min(maxBatchContext, parsed) : 0);
    setRetainBatchContext(valid);
    setRetainBatchContextInput(String(valid));
  };

  const handleCommitConcurrency = () => {
    const parsed = parseInt(concurrencyInput, 10);
    const valid = isNaN(parsed) || parsed < 1 ? 2 : parsed;
    setConcurrency(valid);
    setConcurrencyInput(String(valid));
  };

  const handleCommitDelayMs = () => {
    const parsed = parseInt(delayMsInput, 10);
    const valid = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setDelayMs(valid);
    setDelayMsInput(String(valid));
  };

  const handleCommitTimeoutMinutes = () => {
    const parsed = parseInt(timeoutMinutesInput, 10);
    const valid = isNaN(parsed) || parsed < 1 ? 10 : parsed;
    setTimeoutMinutes(valid);
    setTimeoutMinutesInput(String(valid));
  };

  const handleCommitMaxBackoffSeconds = () => {
    const parsed = parseInt(maxBackoffSecondsInput, 10);
    const valid = isNaN(parsed) || parsed < 1 ? 30 : parsed;
    setMaxBackoffSeconds(valid);
    setMaxBackoffSecondsInput(String(valid));
  };

  return (
    <div className="workspace-view">
      {/* ========================================================================= */}
      {/* 1. TOP SUB-TAB SWITCHER (Centered & Uniform with other Views)              */}
      {/* ========================================================================= */}
      <div className="workspace-tabs">
        <SegmentedControl<"preview" | "settings">
          options={[
            {
              id: "preview",
              label: "Script queue",
              icon: <FileCode size={14} />,
              badge: queuedFiles.length > 0 ? `${queuedFiles.length} files` : undefined,
              badgeColor: "neutral",
            },
            {
              id: "settings",
              label: "Batch settings",
              icon: <Sliders size={14} />,
            },
          ]}
          value={activeTab}
          onChange={setActiveTab}
          size="md"
        />
      </div>

      {/* ========================================================================= */}
      {/* 2. PERSISTENT MODEL & SESSION CONTROL BAR (Visible in both subtabs)       */}
      {/* ========================================================================= */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "8px 14px",
          marginBottom: "10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
          flexShrink: 0,
        }}
      >
        {/* Left Side: Model Selector + Master Execution Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minWidth: 0 }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
              Model:
            </span>
            <ModelSelectorCombobox
              selectedModelId={selectedEngine}
              selectedReasoningEffort={reasoningEffort}
              onSelectModel={(id, eff) => {
                setSelectedEngine(id);
                const e = eff || "default";
                setReasoningEffort(e);
              }}
              onSelectReasoningEffort={(eff) => {
                setReasoningEffort(eff);
              }}
              disabled={isRunning}
              width="240px"
              compact={true}
            />
            {!selectedEngine.startsWith("mt:") && (
              <ProviderSelectorMultiSelect
                modelId={selectedEngine}
                selectedProviders={selectedProviders}
                onChangeProviders={(newProviders) => {
                  setSelectedModelProviders(selectedEngine, newProviders);
                  setSelectedProviders(newProviders);
                }}
                disabled={isRunning}
                width="220px"
                compact={true}
              />
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minWidth: 0 }}>
            {!isRunning ? (
              <button
                onClick={handleStartBatch}
                disabled={!hasTranslatableLines}
                className="btn-primary"
                style={{
                  padding: "6px 14px",
                  fontSize: "12px",
                  opacity: !hasTranslatableLines ? 0.5 : 1,
                  cursor: !hasTranslatableLines ? "not-allowed" : "pointer",
                }}
                title={
                  queuedFiles.length === 0
                    ? "No script files loaded in queue. Click 'Add Scripts' to import files."
                    : !hasTranslatableLines
                    ? translateExplicitOnly
                      ? "No explicit / censored flagged lines found in any queued file to re-translate."
                      : "All dialogue lines across all queued files are already 100% completed."
                    : undefined
                }
              >
                <Play size={13} />
                <span>
                  {translateExplicitOnly
                    ? "Re-translate Explicit Lines"
                    : queuedFiles.some((f) => {
                        const proc = f.items.filter((it) => isProcessed(it)).length;
                        return proc > 0 && proc < f.totalLines;
                      })
                    ? "Continue / Resume Batch"
                    : "Start Batch Translation"}
                </span>
              </button>
            ) : (
              <button
                onClick={handleCancelBatch}
                className="btn-secondary"
                style={{ padding: "6px 14px", fontSize: "12px", color: "var(--accent-danger)", borderColor: "var(--accent-danger)" }}
              >
                <Square size={13} />
                <span>Cancel Translation</span>
              </button>
            )}
          </div>
        </div>

        <BatchStatsBadges
          pricingSummary={pricingSummary}
          sessionStats={sessionStats}
          isRunning={isRunning}
          avgBatchDurationMs={avgBatchDurationMs}
          estimatedRemainingSeconds={estimatedRemainingSeconds}
        />
      </div>

      {/* ========================================================================= */}
      {/* 3. DYNAMIC CONTENT AREA: Stretches 100% full height & width               */}
      {/* ========================================================================= */}
      {activeTab === "settings" ? (
        /* ========================================================================= */
        /* MODE A: BATCH SETTINGS & PARAMETERS                                       */
        /* ========================================================================= */
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
          <BatchQueuedFilesTable
            queuedFiles={queuedFiles}
            selectedFileId={selectedFileId}
            isRunning={isRunning}
            onSelectFileId={setSelectedFileId}
            onAddFiles={handleAddFiles}
            onScanDiskProgress={handleScanDiskProgress}
            onClearQueue={handleClearQueue}
            onRemoveFile={handleRemoveFile}
          />


          {/* Card 3: Batch & Context Parameters */}
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minWidth: 0 }}>
              <Sliders size={16} style={{ color: "var(--accent-gold)" }} />
              <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                Batching, LLM Context & Worker Parameters
              </span>
            </div>

            {/* Grid of Number Inputs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "14px" }}>
              {/* Lines Per Batch Chunk */}
              <div>
                <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Lines per Batch Chunk:
                </label>
                <input
                  type="number"
                  min={1}
                  className="input-field"
                  value={linesPerBatchInput}
                  disabled={isRunning}
                  onChange={(e) => setLinesPerBatchInput(e.target.value)}
                  onBlur={handleCommitLinesPerBatch}
                  onKeyDown={(e) => e.key === "Enter" && handleCommitLinesPerBatch()}
                  style={{ width: "100%", fontSize: "12px", padding: "6px 10px", fontWeight: 600 }}
                />
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                  Number of dialogue lines grouped into each prompt turn (e.g. 25, 50, 100).
                </span>
              </div>

              {/* Max Batch Context */}
              <div>
                <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Max Batch Context (batches):
                </label>
                <input
                  type="number"
                  min={0}
                  className="input-field"
                  value={maxBatchContextInput}
                  disabled={isRunning}
                  onChange={(e) => setMaxBatchContextInput(e.target.value)}
                  onBlur={handleCommitMaxBatchContext}
                  onKeyDown={(e) => e.key === "Enter" && handleCommitMaxBatchContext()}
                  style={{ width: "100%", fontSize: "12px", padding: "6px 10px", fontWeight: 600 }}
                />
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                  Preceding dialogue batches remembered in context (0 = context disabled).
                </span>
              </div>

              {/* Retained Batches After Cut */}
              <div>
                <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Retained Batches After Cut:
                </label>
                <input
                  type="number"
                  min={0}
                  className="input-field"
                  value={retainBatchContextInput}
                  disabled={isRunning || maxBatchContext === 0}
                  onChange={(e) => setRetainBatchContextInput(e.target.value)}
                  onBlur={handleCommitRetainBatchContext}
                  onKeyDown={(e) => e.key === "Enter" && handleCommitRetainBatchContext()}
                  style={{ width: "100%", fontSize: "12px", padding: "6px 10px", fontWeight: 600 }}
                />
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                  Batches kept in sliding buffer when context reaches max batch context.
                </span>
              </div>

              {/* Concurrency (Parallel Workers) */}
              <div>
                <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Concurrent Files (Parallel Workers):
                </label>
                <input
                  type="number"
                  min={1}
                  className="input-field"
                  value={concurrencyInput}
                  disabled={isRunning}
                  onChange={(e) => setConcurrencyInput(e.target.value)}
                  onBlur={handleCommitConcurrency}
                  onKeyDown={(e) => e.key === "Enter" && handleCommitConcurrency()}
                  style={{ width: "100%", fontSize: "12px", padding: "6px 10px", fontWeight: 600 }}
                />
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                  Parallel worker threads translating distinct script files simultaneously.
                </span>
              </div>

              {/* Delay Between Requests */}
              <div>
                <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Delay Between Requests (ms):
                </label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  className="input-field"
                  value={delayMsInput}
                  disabled={isRunning}
                  onChange={(e) => setDelayMsInput(e.target.value)}
                  onBlur={handleCommitDelayMs}
                  onKeyDown={(e) => e.key === "Enter" && handleCommitDelayMs()}
                  style={{ width: "100%", fontSize: "12px", padding: "6px 10px", fontWeight: 600 }}
                />
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                  Inter-request pacing delay (1000-3000ms recommended to prevent rate limits).
                </span>
              </div>

              {/* Request Timeout (Minutes) */}
              <div>
                <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  API Timeout (Minutes):
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="input-field"
                  value={timeoutMinutesInput}
                  disabled={isRunning}
                  onChange={(e) => setTimeoutMinutesInput(e.target.value)}
                  onBlur={handleCommitTimeoutMinutes}
                  onKeyDown={(e) => e.key === "Enter" && handleCommitTimeoutMinutes()}
                  style={{ width: "100%", fontSize: "12px", padding: "6px 10px", fontWeight: 600 }}
                />
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                  Max wait duration before timing out (ideal for reasoning models e.g. 10m).
                </span>
              </div>

              {/* Max Retry Backoff Time (Seconds) */}
              <div>
                <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Max Backoff Time (Seconds):
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="input-field"
                  value={maxBackoffSecondsInput}
                  disabled={isRunning}
                  onChange={(e) => setMaxBackoffSecondsInput(e.target.value)}
                  onBlur={handleCommitMaxBackoffSeconds}
                  onKeyDown={(e) => e.key === "Enter" && handleCommitMaxBackoffSeconds()}
                  style={{ width: "100%", fontSize: "12px", padding: "6px 10px", fontWeight: 600 }}
                />
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                  Maximum wait limit during rate-limits & retries (e.g. 5s for fast bruteforce, 30s default).
                </span>
              </div>

              {/* Reasoning / Thinking Effort */}
              <div>
                <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  <Brain size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px", color: "var(--accent-purple, #a855f7)" }} />
                  Reasoning / Thinking Effort:
                </label>
                <select
                  className="input-field"
                  value={
                    reasoningCapabilities.mode === "toggle_only"
                      ? (reasoningEffort === "none" ? "none" : "default")
                      : (reasoningCapabilities.supportedEfforts.includes(reasoningEffort) || reasoningEffort === "none" || reasoningEffort === "default" ? reasoningEffort : "default")
                  }
                  disabled={isRunning || !reasoningCapabilities.isSupported}
                  onChange={(e) => {
                    const val = e.target.value as ReasoningEffort;
                    setReasoningEffort(val);
                  }}
                  style={{ width: "100%", fontSize: "12px", padding: "6px 10px", fontWeight: 600, backgroundColor: "var(--bg-surface-elevated)" }}
                >
                  {!reasoningCapabilities.isSupported ? (
                    <option value="default">Not Supported by Model</option>
                  ) : reasoningCapabilities.mode === "efforts_list" ? (
                    <>
                      <option value="default">
                        Default{reasoningCapabilities.defaultEffort ? ` (${reasoningCapabilities.defaultEffort})` : " (Model Standard)"}
                      </option>
                      {!reasoningCapabilities.isMandatory && <option value="none">Disabled (Off)</option>}
                      {reasoningCapabilities.supportedEfforts.map((eff) => (
                        <option key={eff} value={eff}>
                          {formatReasoningEffortLabel(eff)}
                        </option>
                      ))}
                    </>
                  ) : (
                    <>
                      <option value="default">Enabled (Active)</option>
                      {!reasoningCapabilities.isMandatory && <option value="none">Disabled (Off)</option>}
                    </>
                  )}
                </select>
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                  {!reasoningCapabilities.isSupported
                    ? "Selected model does not accept reasoning / thinking tokens."
                    : reasoningCapabilities.mode === "efforts_list"
                    ? `Supported levels: ${reasoningCapabilities.supportedEfforts.join(", ")}.`
                    : "Binary reasoning toggle supported by this model."}
                </span>
              </div>

              {/* Output File Suffix */}
              <div>
                <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Output File Suffix:
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={fileSuffix}
                  onChange={(e) => setFileSuffix(e.target.value)}
                  disabled={isRunning}
                  placeholder="_translated"
                  style={{ width: "100%", fontSize: "12px", padding: "6px 10px" }}
                />
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                  Appended to output script filename (e.g. <code>scene01_translated.jsonl</code>).
                </span>
              </div>
            </div>

            {/* Output Directory Row */}
            <div>
              <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                Custom Output Directory:
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Same directory as source files (Default)"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  disabled={isRunning}
                  style={{ flex: 1, fontSize: "12px", padding: "6px 10px" }}
                />
                <button
                  type="button"
                  onClick={handleBrowseOutputDir}
                  disabled={isRunning}
                  className="btn-secondary"
                  style={{ padding: "6px 14px", fontSize: "12px" }}
                >
                  Browse Folder
                </button>
              </div>
            </div>

            {/* Automation Toggles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "12px", marginTop: "4px" }}>
              <div
                style={{
                  backgroundColor: autoContinue ? "rgba(56, 189, 248, 0.06)" : "var(--bg-surface-elevated)",
                  border: autoContinue ? "1px solid rgba(56, 189, 248, 0.3)" : "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "8px",
                }}
              >
                <div>
                  <label
                    htmlFor="auto-continue-checkbox"
                    style={{ fontSize: "12px", fontWeight: 700, color: autoContinue ? "var(--accent-cyan)" : "var(--text-primary)", cursor: "pointer" }}
                  >
                    Auto-Retry Until 100% Completed
                  </label>
                  <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                    Keeps retrying failed batches in-place until the file reaches 100% completion before proceeding to next file.
                  </span>
                </div>
                <input
                  id="auto-continue-checkbox"
                  type="checkbox"
                  checked={autoContinue}
                  disabled={isRunning}
                  onChange={(e) => setAutoContinue(e.target.checked)}
                  style={{ accentColor: "var(--accent-cyan)", transform: "scale(1.2)", marginTop: "2px", cursor: "pointer" }}
                />
              </div>

              <div
                style={{
                  backgroundColor: translateExplicitOnly ? "rgba(244, 63, 94, 0.08)" : "var(--bg-surface-elevated)",
                  border: translateExplicitOnly ? "1px solid rgba(244, 63, 94, 0.35)" : "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "8px",
                }}
              >
                <div>
                  <label
                    htmlFor="translate-explicit-checkbox"
                    style={{ fontSize: "12px", fontWeight: 700, color: translateExplicitOnly ? "#fb7185" : "var(--text-primary)", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}
                  >
                    <AlertTriangle size={13} color="#fb7185" />
                    Re-translate Explicit Flagged Lines Only
                  </label>
                  <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                    Slices batches starting from explicit flagged lines, updating only flagged lines while preserving existing translations.
                  </span>
                </div>
                <input
                  id="translate-explicit-checkbox"
                  type="checkbox"
                  checked={translateExplicitOnly}
                  disabled={isRunning}
                  onChange={(e) => setTranslateExplicitOnly(e.target.checked)}
                  style={{ accentColor: "#fb7185", transform: "scale(1.2)", marginTop: "2px", cursor: "pointer" }}
                />
              </div>
            </div>
          </div>

          {/* Card 4: Text Preprocessing & Clean Rules (Compact Redirect Button) */}
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                <SlidersHorizontal size={15} color="var(--accent-primary)" /> Text Preprocessing & Clean Rules
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                Configure engine tag strippers, ruby brackets removals, and regex patterns applied before batch translation.
              </span>
            </div>

            {onOpenPreprocessingSettings && (
              <button
                type="button"
                onClick={onOpenPreprocessingSettings}
                className="btn-secondary"
                style={{ padding: "6px 14px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <ExternalLink size={13} />
                <span>Open Preprocessing Settings</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* MODE B: SCRIPT TRANSLATION PREVIEW (100% Dynamic Table View)               */
        /* ========================================================================= */
        <BatchPreviewTable
          queuedFiles={queuedFiles}
          selectedFileId={selectedFileId}
          activeFile={activeFile || undefined}
          isRunning={isRunning}
          searchFilter={searchFilter}
          statusFilter={statusFilter}
          progressData={progressData}
          onSelectFileId={setSelectedFileId}
          onAddFiles={handleAddFiles}
          onScanDiskProgress={handleScanDiskProgress}
          onSearchChange={setSearchFilter}
          onStatusFilterChange={setStatusFilter}
        />
      )}
    </div>
  );
};
