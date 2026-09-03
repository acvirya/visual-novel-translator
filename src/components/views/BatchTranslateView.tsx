import React, { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Play,
  Plus,
  Trash2,
  FolderOpen,
  FileCode,
  Square,
  Sliders,
  Sparkles,
  Search,
  CheckCircle2,
  Clock,
  RefreshCw,
  Activity,
  SlidersHorizontal,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Coins,
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
import { BatchStreamBanner } from "./BatchStreamBanner";
import { ReasoningEffort } from "../../types";

export interface BatchTranslateViewProps {
  onOpenPreprocessingSettings?: () => void;
}

export const BatchTranslateView: React.FC<BatchTranslateViewProps> = ({
  onOpenPreprocessingSettings,
}) => {
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
  } = useBatchStore();

  // Mode Switcher: "preview" vs "settings"
  const [activeTab, setActiveTab] = useState<"preview" | "settings">("preview");

  // Settings State
  const [selectedEngine, setSelectedEngine] = useState<string>(() => {
    return localStorage.getItem("vn_batch_selected_model") || "openai/gpt-4o-mini";
  });
  const [selectedProviders, setSelectedProviders] = useState<string[]>(() => {
    const initModel = localStorage.getItem("vn_batch_selected_model") || "openai/gpt-4o-mini";
    return getSelectedModelProviders(initModel);
  });
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

  const [linesPerBatch, setLinesPerBatch] = useState<number>(() => {
    const val = parseInt(localStorage.getItem("vn_batch_lines_per_batch") || "10", 10);
    return isNaN(val) || val < 1 ? 10 : val;
  });
  const [linesPerBatchInput, setLinesPerBatchInput] = useState<string>(String(linesPerBatch));

  const [maxBatchContext, setMaxBatchContext] = useState<number>(() => {
    const raw = localStorage.getItem("vn_batch_max_batch_context") ?? localStorage.getItem("vn_batch_max_context_lines");
    const val = raw !== null ? parseInt(raw, 10) : 2;
    return isNaN(val) || val < 0 ? 2 : val;
  });
  const [maxBatchContextInput, setMaxBatchContextInput] = useState<string>(String(maxBatchContext));

  const [retainBatchContext, setRetainBatchContext] = useState<number>(() => {
    const raw = localStorage.getItem("vn_batch_retain_batch_context") ?? localStorage.getItem("vn_batch_retain_context_lines");
    const val = raw !== null ? parseInt(raw, 10) : 1;
    return isNaN(val) || val < 0 ? 1 : val;
  });
  const [retainBatchContextInput, setRetainBatchContextInput] = useState<string>(String(retainBatchContext));

  const [concurrency, setConcurrency] = useState<number>(() => {
    const val = parseInt(localStorage.getItem("vn_batch_concurrency") || "2", 10);
    return isNaN(val) || val < 1 ? 2 : val;
  });
  const [concurrencyInput, setConcurrencyInput] = useState<string>(String(concurrency));

  const [delayMs, setDelayMs] = useState<number>(() => {
    const val = parseInt(localStorage.getItem("vn_batch_delay_ms") || "300", 10);
    return isNaN(val) || val < 0 ? 300 : val;
  });
  const [delayMsInput, setDelayMsInput] = useState<string>(String(delayMs));

  const [timeoutMinutes, setTimeoutMinutes] = useState<number>(() => {
    const val = parseInt(localStorage.getItem("vn_batch_timeout_minutes") || "10", 10);
    return isNaN(val) || val < 1 ? 10 : val;
  });
  const [timeoutMinutesInput, setTimeoutMinutesInput] = useState<string>(String(timeoutMinutes));

  const [maxBackoffSeconds, setMaxBackoffSeconds] = useState<number>(() => {
    const val = parseInt(localStorage.getItem("vn_batch_max_backoff_seconds") || "30", 10);
    return isNaN(val) || val < 1 ? 30 : val;
  });
  const [maxBackoffSecondsInput, setMaxBackoffSecondsInput] = useState<string>(String(maxBackoffSeconds));

  const [autoContinue, setAutoContinue] = useState<boolean>(() => {
    return localStorage.getItem("vn_batch_auto_continue") !== "false";
  });
  const [translateExplicitOnly, setTranslateExplicitOnly] = useState<boolean>(() => {
    return localStorage.getItem("vn_batch_translate_explicit_only") === "true";
  });
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(() => {
    return (localStorage.getItem("vn_batch_reasoning_effort") as any) || "default";
  });
  const [outputDir, setOutputDir] = useState<string>(() => {
    return localStorage.getItem("vn_batch_output_dir") || "";
  });
  const [fileSuffix, setFileSuffix] = useState<string>("_translated");

  // Sync settings to localStorage
  useEffect(() => {
    localStorage.setItem("vn_batch_selected_model", selectedEngine);
    setSelectedProviders(getSelectedModelProviders(selectedEngine));
    localStorage.setItem("vn_batch_lines_per_batch", String(linesPerBatch));
    localStorage.setItem("vn_batch_max_batch_context", String(maxBatchContext));
    localStorage.setItem("vn_batch_retain_batch_context", String(retainBatchContext));
    localStorage.setItem("vn_batch_concurrency", String(concurrency));
    localStorage.setItem("vn_batch_delay_ms", String(delayMs));
    localStorage.setItem("vn_batch_timeout_minutes", String(timeoutMinutes));
    localStorage.setItem("vn_batch_max_backoff_seconds", String(maxBackoffSeconds));
    localStorage.setItem("vn_batch_auto_continue", String(autoContinue));
    localStorage.setItem("vn_batch_translate_explicit_only", String(translateExplicitOnly));
    localStorage.setItem("vn_batch_reasoning_effort", reasoningEffort);
    localStorage.setItem("vn_batch_output_dir", outputDir);
  }, [selectedEngine, linesPerBatch, maxBatchContext, retainBatchContext, concurrency, delayMs, timeoutMinutes, maxBackoffSeconds, autoContinue, translateExplicitOnly, reasoningEffort, outputDir]);

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
      if (update.activeFileId) {
        setSelectedFileId(update.activeFileId);
      }
    });
    return () => unsubscribe();
  }, []);

  const totalLines = queuedFiles.reduce((acc, f) => acc + f.totalLines, 0);
  const completedLines = queuedFiles.reduce((acc, f) => acc + f.items.filter((it) => isGenuinelyTranslated(it)).length, 0);
  const explicitLines = queuedFiles.reduce((acc, f) => acc + f.items.filter((it) => isExplicitTagged(it)).length, 0);
  const progressPercent = totalLines > 0 ? Math.min(100, Math.round((completedLines / totalLines) * 100)) : 0;

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

  // Filtered rows for active file
  const displayedItems = useMemo(() => {
    if (!activeFile) return [];
    let list = activeFile.items;

    if (statusFilter === "completed") {
      list = list.filter((it) => isGenuinelyTranslated(it) && !isExplicitTagged(it));
    } else if (statusFilter === "untranslated") {
      list = list.filter((it) => !isGenuinelyTranslated(it));
    } else if (statusFilter === "explicit") {
      list = list.filter((it) => isExplicitTagged(it));
    }

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      list = list.filter(
        (it) =>
          (it.originalSpeaker && it.originalSpeaker.toLowerCase().includes(q)) ||
          (it.translatedSpeaker && it.translatedSpeaker.toLowerCase().includes(q)) ||
          it.originalMessage.toLowerCase().includes(q) ||
          (it.translatedMessage && it.translatedMessage.toLowerCase().includes(q)) ||
          String(it.id).includes(q)
      );
    }

    return list;
  }, [activeFile, statusFilter, searchFilter]);

  const PAGE_SIZE = 100;
  const [currentPage, setCurrentPage] = useState(1);
  const isFirstPageMount = useRef(true);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFileId, statusFilter, searchFilter]);

  // Auto-scroll to top when page changes
  useEffect(() => {
    if (isFirstPageMount.current) {
      isFirstPageMount.current = false;
      return;
    }
    const mainContainer = document.querySelector(".view-container");
    if (mainContainer) {
      mainContainer.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentPage]);

  const totalPages = Math.max(1, Math.ceil(displayedItems.length / PAGE_SIZE));
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return displayedItems.slice(start, start + PAGE_SIZE);
  }, [displayedItems, currentPage]);

  const handleAddFiles = async () => {
    try {
      const results = await invoke<Array<[string, string, number]>>("show_pick_files_dialog");
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
      const folder = await invoke<string | null>("show_pick_directory_dialog");
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
    if (isRunning) return;
    setQueuedFiles((prev) => prev.filter((f) => f.id !== id));
    if (selectedFileId === id) {
      setSelectedFileId(null);
    }
  };

  const handleClearQueue = () => {
    if (isRunning) return;
    setQueuedFiles([]);
    setSelectedFileId(null);
    setProgressData(null);
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
    <div style={{ display: "flex", flexDirection: "column", width: "100%", minWidth: 0, maxWidth: "1200px", margin: "0 auto" }}>
      {/* ========================================================================= */}
      {/* 1. TOP SUB-TAB SWITCHER (Centered & Uniform with other Views)              */}
      {/* ========================================================================= */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", padding: "0 0 12px 0", flexShrink: 0 }}>
        <SegmentedControl<"preview" | "settings">
          options={[
            {
              id: "preview",
              label: "Script Translation Preview",
              icon: <FileCode size={14} />,
              badge: queuedFiles.length > 0 ? `${queuedFiles.length} files` : undefined,
              badgeColor: "neutral",
            },
            {
              id: "settings",
              label: "Batch Settings",
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
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
                localStorage.setItem("vn_batch_reasoning_effort", e);
              }}
              onSelectReasoningEffort={(eff) => {
                setReasoningEffort(eff);
                localStorage.setItem("vn_batch_reasoning_effort", eff);
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

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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

        {/* Right Side: Model Pricing Badge & Incremental Session Statistics Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {/* Model Pricing Badge (Input / Output / Cache per 1M tokens) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "var(--bg-app)",
              padding: "4px 10px",
              borderRadius: "20px",
              border: "1px solid var(--border-subtle)",
              fontSize: "11px",
              flexWrap: "wrap",
            }}
            title="Model Pricing per 1 Million tokens (Input, Output, and Prompt Cache) based on selected endpoints"
          >
            <span style={{ color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
              <Coins size={12} color="var(--accent-primary)" /> Pricing / 1M:
            </span>
            <span>In: <strong style={{ color: "var(--accent-cyan)" }}>{pricingSummary.input}</strong></span>
            <span style={{ color: "var(--border-subtle)" }}>•</span>
            <span>Out: <strong style={{ color: "var(--accent-gold)" }}>{pricingSummary.output}</strong></span>
            <span style={{ color: "var(--border-subtle)" }}>•</span>
            <span>Cache: <strong style={{ color: "var(--accent-success)" }}>{pricingSummary.cache}</strong></span>
          </div>

          {/* Session Usage Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "var(--bg-app)",
              padding: "4px 10px",
              borderRadius: "20px",
              border: "1px solid var(--border-subtle)",
              fontSize: "11px",
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
              <Activity size={12} color="var(--accent-primary)" /> Session Tokens:
            </span>
            <span>In: <strong style={{ color: "var(--accent-cyan)" }}>{sessionStats.promptTokens.toLocaleString()}</strong></span>
            <span style={{ color: "var(--border-subtle)" }}>•</span>
            <span>Out: <strong style={{ color: "var(--accent-gold)" }}>{sessionStats.completionTokens.toLocaleString()}</strong></span>
            <span style={{ color: "var(--border-subtle)" }}>•</span>
            <span>Cached: <strong style={{ color: "var(--accent-success)" }}>{sessionStats.cachedTokens.toLocaleString()}</strong></span>
            <span style={{ color: "var(--border-subtle)" }}>•</span>
            <span>Cost: <strong style={{ color: "#38ef7d" }}>${sessionStats.totalCost < 0.01 && sessionStats.totalCost > 0 ? sessionStats.totalCost.toFixed(5) : sessionStats.totalCost.toFixed(4)}</strong></span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. DYNAMIC CONTENT AREA: Stretches 100% full height & width               */}
      {/* ========================================================================= */}
      {activeTab === "settings" ? (
        /* ========================================================================= */
        /* MODE A: BATCH SETTINGS & PARAMETERS                                       */
        /* ========================================================================= */
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
          {/* Card 1: Queued Files Manager in Settings */}
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <FolderOpen size={16} style={{ color: "var(--accent-cyan)" }} />
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                  Queued Files ({queuedFiles.length})
                </span>
                {queuedFiles.length > 0 && (
                  <span style={{ fontSize: "11.5px", color: "var(--text-muted)", marginLeft: "4px", display: "inline-flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                    • Total: <strong style={{ color: "var(--accent-success)" }}>{completedLines}</strong> / {totalLines} lines ({progressPercent}%)
                    {explicitLines > 0 && (
                      <span style={{ color: "#fb7185", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                        • ⚠️ {explicitLines} Censored / Explicit
                      </span>
                    )}
                  </span>
                )}
              </div>

              {/* Action Buttons: Add, Scan Disk, Clear */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  onClick={handleAddFiles}
                  disabled={isRunning}
                  className="btn-primary"
                  style={{ padding: "5px 10px", fontSize: "11.5px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                >
                  <Plus size={13} />
                  <span>Add Scripts</span>
                </button>

                <button
                  type="button"
                  onClick={handleScanDiskProgress}
                  disabled={isRunning || queuedFiles.length === 0}
                  className="btn-secondary"
                  style={{ padding: "5px 10px", fontSize: "11.5px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                  title="Rescan output folder to check for already translated lines and update completion status"
                >
                  <RefreshCw size={13} />
                  <span>Scan Disk</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearQueue}
                  disabled={isRunning || queuedFiles.length === 0}
                  className="btn-secondary"
                  style={{ padding: "5px 10px", fontSize: "11.5px", display: "inline-flex", alignItems: "center", gap: "5px", color: "var(--accent-danger)" }}
                >
                  <Trash2 size={13} />
                  <span>Clear All</span>
                </button>
              </div>
            </div>

            {/* Table of Queued Files */}
            {queuedFiles.length === 0 ? (
              <div
                style={{
                  border: "1px dashed var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "18px",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  backgroundColor: "var(--bg-app)",
                }}
              >
                No files loaded yet. Click <strong>"Add Scripts"</strong> to import JSONL, JSON, KS, CSV, or TXT script files.
              </div>
            ) : (
              <div
                style={{
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                  backgroundColor: "var(--bg-app)",
                  width: "100%",
                }}
              >
                {/* 1. Stationary Header Row (Never touched by scrollbar) */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 120px 130px 36px",
                    padding: "8px 12px",
                    backgroundColor: "var(--bg-surface-elevated)",
                    borderBottom: "1px solid var(--border-subtle)",
                    color: "var(--text-secondary)",
                    fontSize: "11px",
                    fontWeight: 700,
                  }}
                >
                  <div>File</div>
                  <div>Progress</div>
                  <div>Status</div>
                  <div style={{ textAlign: "center" }}></div>
                </div>

                {/* 2. Scrollable Body (Scrollbar strictly contained inside rows) */}
                <div
                  style={{
                    maxHeight: "200px",
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {queuedFiles.map((file, idx) => {
                    const fDone = file.completedLines ?? file.items.filter((it) => isGenuinelyTranslated(it)).length;
                    const fExp = file.explicitLines ?? file.items.filter((it) => isExplicitTagged(it)).length;
                    const isFinished = (fDone + fExp >= file.totalLines && file.totalLines > 0) || file.status === "completed";
                    const isSelected = file.id === selectedFileId;

                    // Status Badge Calculation
                    let statusNode: React.ReactNode;
                    if (file.status === "processing") {
                      statusNode = (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, backgroundColor: "rgba(56, 189, 248, 0.12)", color: "var(--accent-cyan)", border: "1px solid rgba(56, 189, 248, 0.3)" }}>
                          <Activity size={11} className="animate-spin" /> translating
                        </span>
                      );
                    } else if (isFinished) {
                      if (fExp > 0) {
                        statusNode = (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, backgroundColor: "rgba(244, 63, 94, 0.12)", color: "#fb7185", border: "1px solid rgba(244, 63, 94, 0.3)" }}>
                            <AlertTriangle size={11} /> {fExp} explicit
                          </span>
                        );
                      } else {
                        statusNode = (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, backgroundColor: "rgba(34, 197, 94, 0.12)", color: "var(--accent-success)", border: "1px solid rgba(34, 197, 94, 0.3)" }}>
                            <CheckCircle2 size={11} /> completed
                          </span>
                        );
                      }
                    } else if (isRunning) {
                      statusNode = (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, backgroundColor: "rgba(234, 179, 8, 0.1)", color: "var(--accent-gold)", border: "1px solid rgba(234, 179, 8, 0.25)" }}>
                          <Clock size={11} /> queued
                        </span>
                      );
                    } else if (file.status === "error") {
                      statusNode = (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, backgroundColor: "rgba(239, 68, 68, 0.12)", color: "var(--accent-danger)", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
                          error
                        </span>
                      );
                    } else {
                      statusNode = (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, backgroundColor: "var(--bg-surface-elevated)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
                          pending
                        </span>
                      );
                    }

                    return (
                      <div
                        key={file.id}
                        onClick={() => setSelectedFileId(file.id)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 120px 130px 36px",
                          padding: "6px 12px",
                          alignItems: "center",
                          borderBottom: idx < queuedFiles.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
                          backgroundColor: isSelected ? "rgba(78, 115, 223, 0.12)" : "transparent",
                          cursor: "pointer",
                          transition: "background-color 0.15s ease",
                          fontSize: "12px",
                        }}
                      >
                        {/* 1. File Name */}
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden", minWidth: 0 }}>
                          <FileCode size={14} style={{ color: isSelected ? "var(--accent-primary)" : isFinished ? "var(--accent-success)" : "var(--accent-cyan)", flexShrink: 0 }} />
                          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: isSelected ? "var(--accent-primary)" : "var(--text-primary)", fontWeight: 600 }} title={file.path}>
                            {file.name}
                          </span>
                        </div>

                        {/* 2. Progress */}
                        <div style={{ whiteSpace: "nowrap", fontWeight: 600, color: "var(--text-primary)", fontSize: "11.5px" }}>
                          {fDone}/{file.totalLines}
                        </div>

                        {/* 3. Status */}
                        <div style={{ whiteSpace: "nowrap" }}>
                          {statusNode}
                        </div>

                        {/* 4. Action */}
                        <div style={{ textAlign: "center" }}>
                          {!isRunning && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveFile(file.id);
                              }}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                              title="Remove file"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

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
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Sliders size={16} style={{ color: "var(--accent-gold)" }} />
              <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                Batching, LLM Context & Worker Parameters
              </span>
            </div>

            {/* Grid of Number Inputs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
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

              {/* Delay Between Batches */}
              <div>
                <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Delay Between Batches (ms):
                </label>
                <input
                  type="number"
                  min={0}
                  step={50}
                  className="input-field"
                  value={delayMsInput}
                  disabled={isRunning}
                  onChange={(e) => setDelayMsInput(e.target.value)}
                  onBlur={handleCommitDelayMs}
                  onKeyDown={(e) => e.key === "Enter" && handleCommitDelayMs()}
                  style={{ width: "100%", fontSize: "12px", padding: "6px 10px", fontWeight: 600 }}
                />
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                  Rate-limit protection pause between chunk requests.
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
                    localStorage.setItem("vn_batch_reasoning_effort", val);
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px", marginTop: "4px" }}>
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
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            width: "100%",
          }}
        >
          {/* Top Compact Control & File Ribbon for Preview */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", flexShrink: 0 }}>
            {/* Left: Active File Picker & Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <FileCode size={16} style={{ color: "var(--accent-cyan)" }} />
                <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                  File:
                </span>
                {queuedFiles.length > 0 ? (
                  <select
                    className="input-field"
                    value={activeFile?.id || ""}
                    onChange={(e) => setSelectedFileId(e.target.value)}
                    style={{ fontSize: "12px", padding: "5px 28px 5px 10px", minWidth: "180px", maxWidth: "340px", fontWeight: 600 }}
                  >
                    {queuedFiles.map((f) => {
                      const fExp = f.items.filter((it) => isExplicitTagged(it)).length;
                      return (
                        <option key={f.id} value={f.id}>
                          {f.name} {f.status === "completed" ? (fExp > 0 ? "⚠️ (Completed)" : "✓ (Completed)") : ""}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                    No files loaded
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleAddFiles}
                disabled={isRunning}
                className="btn-primary"
                style={{ padding: "4px 10px", fontSize: "11.5px" }}
              >
                <Plus size={12} />
                <span>Add Files</span>
              </button>

              {queuedFiles.length > 0 && !isRunning && (
                <button
                  type="button"
                  onClick={handleScanDiskProgress}
                  className="btn-secondary"
                  style={{ padding: "4px 8px", fontSize: "11.5px" }}
                  title="Scan output folder to hydrate already translated lines"
                >
                  <RefreshCw size={12} />
                  <span>Scan</span>
                </button>
              )}

              {activeFile && (
                <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "4px", display: "inline-flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                  <span>({activeFile.items.filter((it) => isGenuinelyTranslated(it)).length}/{activeFile.totalLines} lines translated)</span>
                  {activeFile.items.some((it) => isExplicitTagged(it)) && (
                    <span style={{ color: "#fb7185", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "2px", marginLeft: "4px" }}>
                      <AlertTriangle size={11} /> {activeFile.items.filter((it) => isExplicitTagged(it)).length} explicit
                    </span>
                  )}
                </span>
              )}
            </div>

            {/* Right: Search Input, Status Filter & Progress Indicators */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  placeholder="Search dialogue..."
                  className="input-field"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{ width: "190px", fontSize: "11.5px", padding: "4px 8px 4px 24px" }}
                />
                <Search size={12} style={{ position: "absolute", left: "7px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              </div>

              <select
                className="input-field"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                style={{ fontSize: "11.5px", padding: "5px 28px 5px 10px", minWidth: "140px" }}
              >
                <option value="all">All Lines</option>
                <option value="completed">Translated Only</option>
                <option value="untranslated">Untranslated Only</option>
                <option value="explicit">Explicit Flagged Only</option>
              </select>

              {progressData && progressData.currentBatch > 0 && (
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Batch: <strong style={{ color: "var(--accent-cyan)" }}>{progressData.currentBatch}/{progressData.totalBatches}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Real-time Streaming Feedback Box (Scoped to Active File in Preview Tab) */}
          <BatchStreamBanner fileId={activeFile?.id} />

          {/* Table Container */}
          <div
            style={{
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--bg-app)",
              width: "100%",
              overflowX: "auto",
            }}
          >
            {!activeFile || activeFile.items.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "var(--text-muted)",
                  padding: "50px 0",
                  gap: "8px",
                }}
              >
                <Sparkles size={34} style={{ opacity: 0.3 }} />
                <span>No script files loaded. Click Add Files above to start.</span>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--bg-surface-elevated)", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-secondary)", textAlign: "left", position: "sticky", top: 0, zIndex: 2 }}>
                    <th style={{ padding: "8px 10px", width: "55px" }}>#</th>
                    <th style={{ padding: "8px 10px", width: "140px" }}>Speaker</th>
                    <th style={{ padding: "8px 10px", width: "42%" }}>Original Dialogue (JP)</th>
                    <th style={{ padding: "8px 10px" }}>Translated Output</th>
                    <th style={{ padding: "8px 10px", width: "80px", textAlign: "center" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((item) => {
                    const isTranslated = isGenuinelyTranslated(item);
                    return (
                      <tr
                        key={`line_${item.id}`}
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.03)",
                          backgroundColor: isTranslated ? "rgba(16, 185, 129, 0.02)" : "transparent",
                          transition: "background-color 0.2s ease",
                        }}
                      >
                        <td style={{ padding: "8px 10px", color: "var(--text-muted)", fontWeight: 500 }}>
                          {item.id}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          {item.originalSpeaker ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                              <span style={{ fontFamily: "var(--font-jp)", color: "var(--accent-gold)", fontWeight: 600 }}>
                                {item.originalSpeaker}
                              </span>
                              {item.translatedSpeaker && (
                                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                  {item.translatedSpeaker}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: "11px" }}>Narration</span>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px", fontFamily: "var(--font-jp)", color: "var(--text-jp)", lineHeight: 1.5 }}>
                          {item.originalMessage}
                        </td>
                        <td style={{ padding: "8px 10px", lineHeight: 1.5 }}>
                          {isTranslated ? (
                            item.translatedMessage && item.translatedMessage.includes("[EXPLICIT CONTENT]") ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    width: "fit-content",
                                    backgroundColor: "rgba(244, 63, 94, 0.12)",
                                    color: "#fb7185",
                                    border: "1px solid rgba(244, 63, 94, 0.3)",
                                    borderRadius: "3px",
                                    padding: "1px 6px",
                                    fontSize: "10.5px",
                                    fontWeight: 700,
                                  }}
                                >
                                  <AlertTriangle size={11} /> Explicit / Safety Skipped
                                </span>
                                <span style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: "12px" }}>
                                  {item.originalMessage}
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                                {item.translatedMessage}
                              </span>
                            )
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontStyle: "italic", opacity: 0.5 }}>
                              Pending translation...
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                          {isTranslated ? (
                            item.translatedMessage && item.translatedMessage.includes("[EXPLICIT CONTENT]") ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "10px", color: "#fb7185", fontWeight: 700 }} title="Skipped due to LLM content safety policy">
                                <AlertTriangle size={12} />
                                <span>Explicit</span>
                              </span>
                            ) : (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "10.5px", color: "var(--accent-success)", fontWeight: 600 }}>
                                <CheckCircle2 size={13} />
                                <span>Done</span>
                              </span>
                            )
                          ) : isRunning && activeFile.status === "processing" ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "10.5px", color: "var(--accent-cyan)" }}>
                              <Clock size={13} />
                              <span>Queue</span>
                            </span>
                          ) : (
                            <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Footer */}
          {activeFile && displayedItems.length > PAGE_SIZE && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 12px",
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                fontSize: "11.5px",
                color: "var(--text-secondary)",
                flexShrink: 0,
              }}
            >
              <span>
                Showing <strong>{(currentPage - 1) * PAGE_SIZE + 1}</strong> - <strong>{Math.min(currentPage * PAGE_SIZE, displayedItems.length)}</strong> of <strong>{displayedItems.length}</strong> lines
              </span>

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="btn-secondary"
                  style={{ padding: "3px 8px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "2px" }}
                >
                  <ChevronLeft size={13} />
                  <span>Prev</span>
                </button>

                <span style={{ fontWeight: 600, padding: "0 6px" }}>
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="btn-secondary"
                  style={{ padding: "3px 8px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "2px" }}
                >
                  <span>Next</span>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
