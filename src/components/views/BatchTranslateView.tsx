import React, { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Play,
  Pause,
  Plus,
  Trash2,
  FolderOpen,
  FileCode,
  Square,
  Sliders,
  Sparkles,
  Layers,
  Search,
  CheckCircle2,
  Clock,
  RefreshCw,
  Activity,
  SlidersHorizontal,
  ExternalLink,
} from "lucide-react";
import { ModelSelectorCombobox } from "../common/ModelSelectorCombobox";
import { KeySelectorCombobox } from "../common/KeySelectorCombobox";
import {
  batchTranslateService,
  BatchFileEntry,
  BatchSettings,
  KeyMappingConfig,
  isGenuinelyTranslated,
} from "../../services/batchTranslateService";
import { useBatchStore } from "../../stores/useBatchStore";

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
    isPaused,
    setIsRunning,
    setIsPaused,
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

  const [linesPerBatch, setLinesPerBatch] = useState<number>(() => {
    const val = parseInt(localStorage.getItem("vn_batch_lines_per_batch") || "10", 10);
    return isNaN(val) ? 10 : val;
  });
  const [linesPerBatchInput, setLinesPerBatchInput] = useState<string>(String(linesPerBatch));

  const [maxContextLines, setMaxContextLines] = useState<number>(() => {
    const val = parseInt(localStorage.getItem("vn_batch_max_context_lines") || "10", 10);
    return isNaN(val) ? 10 : val;
  });
  const [maxContextLinesInput, setMaxContextLinesInput] = useState<string>(String(maxContextLines));

  const [retainContextLines, setRetainContextLines] = useState<number>(() => {
    const val = parseInt(localStorage.getItem("vn_batch_retain_context_lines") || "3", 10);
    return isNaN(val) ? 3 : val;
  });
  const [retainContextLinesInput, setRetainContextLinesInput] = useState<string>(String(retainContextLines));

  const [concurrency, setConcurrency] = useState<number>(() => {
    const val = parseInt(localStorage.getItem("vn_batch_concurrency") || "2", 10);
    return isNaN(val) ? 2 : val;
  });
  const [concurrencyInput, setConcurrencyInput] = useState<string>(String(concurrency));

  const [delayMs, setDelayMs] = useState<number>(() => {
    const val = parseInt(localStorage.getItem("vn_batch_delay_ms") || "300", 10);
    return isNaN(val) ? 300 : val;
  });
  const [delayMsInput, setDelayMsInput] = useState<string>(String(delayMs));

  const [autoContinue, setAutoContinue] = useState<boolean>(() => {
    const val = localStorage.getItem("vn_batch_auto_continue");
    return val === null ? true : val === "true";
  });
  const [overrideRawWithPreprocessed, setOverrideRawWithPreprocessed] = useState<boolean>(() => {
    const val = localStorage.getItem("vn_batch_override_raw");
    return val === null ? true : val === "true";
  });
  const [outputDir, setOutputDir] = useState<string>(() => {
    return localStorage.getItem("vn_batch_output_dir") || "";
  });
  const [fileSuffix, setFileSuffix] = useState<string>("_translated");

  // Key Mappings
  const [sourceSpeakerKey, setSourceSpeakerKey] = useState<string>(() => {
    const raw = localStorage.getItem("vn_batch_src_speaker_key");
    return raw && raw !== "auto" ? raw : "speaker";
  });
  const [sourceMessageKey, setSourceMessageKey] = useState<string>(() => {
    const raw = localStorage.getItem("vn_batch_src_message_key");
    return raw && raw !== "auto" ? raw : "message";
  });
  const [targetSpeakerKey, setTargetSpeakerKey] = useState<string>(() => {
    return localStorage.getItem("vn_batch_tgt_speaker_key") || "translated_speaker";
  });
  const [targetMessageKey, setTargetMessageKey] = useState<string>(() => {
    return localStorage.getItem("vn_batch_tgt_message_key") || "translated_message";
  });

  const keyMapping: KeyMappingConfig = useMemo(() => ({
    sourceSpeakerKey,
    sourceMessageKey,
    targetSpeakerKey,
    targetMessageKey,
  }), [sourceSpeakerKey, sourceMessageKey, targetSpeakerKey, targetMessageKey]);

  // Aggregate all detected JSON keys across queued files
  const detectedKeys = useMemo(() => {
    const set = new Set<string>();
    queuedFiles.forEach((f) => f.detectedKeys.forEach((k) => set.add(k)));
    return Array.from(set);
  }, [queuedFiles]);

  // Sync settings to localStorage
  useEffect(() => {
    localStorage.setItem("vn_batch_selected_model", selectedEngine);
    localStorage.setItem("vn_batch_lines_per_batch", String(linesPerBatch));
    localStorage.setItem("vn_batch_max_context_lines", String(maxContextLines));
    localStorage.setItem("vn_batch_retain_context_lines", String(retainContextLines));
    localStorage.setItem("vn_batch_concurrency", String(concurrency));
    localStorage.setItem("vn_batch_delay_ms", String(delayMs));
    localStorage.setItem("vn_batch_auto_continue", String(autoContinue));
    localStorage.setItem("vn_batch_override_raw", String(overrideRawWithPreprocessed));
    localStorage.setItem("vn_batch_output_dir", outputDir);
    localStorage.setItem("vn_batch_src_speaker_key", sourceSpeakerKey);
    localStorage.setItem("vn_batch_src_message_key", sourceMessageKey);
    localStorage.setItem("vn_batch_tgt_speaker_key", targetSpeakerKey);
    localStorage.setItem("vn_batch_tgt_message_key", targetMessageKey);
  }, [selectedEngine, linesPerBatch, maxContextLines, retainContextLines, concurrency, delayMs, autoContinue, overrideRawWithPreprocessed, outputDir, sourceSpeakerKey, sourceMessageKey, targetSpeakerKey, targetMessageKey]);

  // Auto-select first file if none selected
  useEffect(() => {
    if (!selectedFileId && queuedFiles.length > 0) {
      setSelectedFileId(queuedFiles[0].id);
    }
  }, [queuedFiles, selectedFileId]);

  // Re-parse files only when key mappings change
  useEffect(() => {
    if (isRunning) return;
    setQueuedFiles((prev) =>
      prev.map((file) => {
        const newItems = batchTranslateService.parseScriptContent(file.rawContent, keyMapping);
        newItems.forEach((newItem, idx) => {
          const oldItem = file.items.find((it) => it.id === newItem.id) || file.items[idx];
          if (oldItem && isGenuinelyTranslated(oldItem)) {
            newItem.translatedSpeaker = oldItem.translatedSpeaker;
            newItem.translatedMessage = oldItem.translatedMessage;
          }
        });
        const completedCount = newItems.filter((it) => isGenuinelyTranslated(it)).length;
        return {
          ...file,
          items: newItems,
          completedLines: completedCount,
          totalLines: newItems.length,
          status: completedCount >= newItems.length && newItems.length > 0 ? "completed" : file.status,
        };
      })
    );
  }, [sourceSpeakerKey, sourceMessageKey, targetSpeakerKey, targetMessageKey]);

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
  const completedLines = queuedFiles.reduce((acc, f) => acc + f.completedLines, 0);
  const progressPercent = totalLines > 0 ? Math.min(100, Math.round((completedLines / totalLines) * 100)) : 0;

  // Active Selected File
  const activeFile = useMemo(() => {
    return queuedFiles.find((f) => f.id === selectedFileId) || queuedFiles[0] || null;
  }, [queuedFiles, selectedFileId]);

  // Filtered rows for active file
  const displayedItems = useMemo(() => {
    if (!activeFile) return [];
    let list = activeFile.items;

    if (statusFilter === "completed") {
      list = list.filter((it) => isGenuinelyTranslated(it));
    } else if (statusFilter === "untranslated") {
      list = list.filter((it) => !isGenuinelyTranslated(it));
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

  const handleAddFiles = async () => {
    try {
      const results = await invoke<Array<[string, string, number]>>("show_pick_files_dialog");
      if (Array.isArray(results) && results.length > 0) {
        const rawFiles: BatchFileEntry[] = results.map(([filePath, content, sizeBytes]) => {
          const fileName = filePath.replace(/\\/g, "/").split("/").pop() || "script.jsonl";
          const detected = batchTranslateService.detectAvailableKeys(content);
          const items = batchTranslateService.parseScriptContent(content, keyMapping);
          return {
            id: `bf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: fileName,
            path: filePath,
            sizeBytes,
            rawContent: content,
            items,
            detectedKeys: detected,
            status: "ready",
            completedLines: items.filter((it) => isGenuinelyTranslated(it)).length,
            totalLines: items.length,
          };
        });

        // Hydrate from existing output files on disk
        const hydratedFiles = await Promise.all(
          rawFiles.map((f) => batchTranslateService.hydrateExistingTranslationFromDisk(f, outputDir, fileSuffix, keyMapping))
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
            queuedFiles.map((f) => batchTranslateService.hydrateExistingTranslationFromDisk(f, folder, fileSuffix, keyMapping))
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
        queuedFiles.map((f) => batchTranslateService.hydrateExistingTranslationFromDisk(f, outputDir, fileSuffix, keyMapping))
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
    setIsPaused(false);

    const settings: BatchSettings = {
      linesPerBatch,
      maxContextLines,
      retainContextLines,
      concurrency,
      modelId: selectedEngine,
      temperature: 0.3,
      delayMs,
      autoContinueUntilCompleted: autoContinue,
      overrideRawWithPreprocessed,
      outputDir,
      fileSuffix,
      keyMapping,
    };

    try {
      await batchTranslateService.runBatchTranslation(queuedFiles, settings, (updatedFile) => {
        setQueuedFiles((prev) => prev.map((f) => (f.id === updatedFile.id ? updatedFile : f)));
      });
    } finally {
      setIsRunning(false);
      setIsPaused(false);
    }
  };

  const handlePauseResume = () => {
    if (!isRunning) return;
    if (isPaused) {
      batchTranslateService.resume();
      setIsPaused(false);
    } else {
      batchTranslateService.pause();
      setIsPaused(true);
    }
  };

  const handleCancelBatch = () => {
    batchTranslateService.cancel();
    setIsRunning(false);
    setIsPaused(false);
  };

  // Clamping Handlers for Numeric Inputs
  const handleCommitLinesPerBatch = () => {
    const parsed = parseInt(linesPerBatchInput, 10);
    const valid = isNaN(parsed) ? 10 : Math.max(1, Math.min(200, parsed));
    setLinesPerBatch(valid);
    setLinesPerBatchInput(String(valid));
  };

  const handleCommitMaxContext = () => {
    const parsed = parseInt(maxContextLinesInput, 10);
    const valid = isNaN(parsed) ? 10 : Math.max(0, Math.min(500, parsed));
    setMaxContextLines(valid);
    setMaxContextLinesInput(String(valid));
    if (retainContextLines > valid) {
      setRetainContextLines(valid);
      setRetainContextLinesInput(String(valid));
    }
  };

  const handleCommitRetainContext = () => {
    const parsed = parseInt(retainContextLinesInput, 10);
    const valid = isNaN(parsed) ? 3 : Math.max(0, Math.min(maxContextLines, parsed));
    setRetainContextLines(valid);
    setRetainContextLinesInput(String(valid));
  };

  const handleCommitConcurrency = () => {
    const parsed = parseInt(concurrencyInput, 10);
    const valid = isNaN(parsed) ? 2 : Math.max(1, Math.min(10, parsed));
    setConcurrency(valid);
    setConcurrencyInput(String(valid));
  };

  const handleCommitDelayMs = () => {
    const parsed = parseInt(delayMsInput, 10);
    const valid = isNaN(parsed) ? 300 : Math.max(0, Math.min(10000, parsed));
    setDelayMs(valid);
    setDelayMsInput(String(valid));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", gap: "10px", minWidth: 0, flex: 1, minHeight: 0 }}>
      {/* ========================================================================= */}
      {/* 1. TOP CONTROL BAR: Model, Actions & Session Usage Statistics             */}
      {/* ========================================================================= */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "8px 14px",
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
              onSelectModel={(id) => setSelectedEngine(id)}
              disabled={isRunning}
              width="240px"
              compact={true}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {!isRunning ? (
              <button
                onClick={handleStartBatch}
                disabled={queuedFiles.length === 0 || queuedFiles.every((f) => f.status === "completed")}
                className="btn-primary"
                style={{ padding: "6px 14px", fontSize: "12px" }}
              >
                <Play size={13} />
                <span>
                  {queuedFiles.some((f) => f.status === "error" || (f.completedLines > 0 && f.status !== "completed"))
                    ? "Continue / Resume Batch"
                    : "Start Batch Translation"}
                </span>
              </button>
            ) : (
              <>
                <button
                  onClick={handlePauseResume}
                  className="btn-secondary"
                  style={{ padding: "6px 12px", fontSize: "12px" }}
                >
                  {isPaused ? <Play size={13} /> : <Pause size={13} />}
                  <span>{isPaused ? "Resume" : "Pause"}</span>
                </button>
                <button
                  onClick={handleCancelBatch}
                  className="btn-secondary"
                  style={{ padding: "6px 12px", fontSize: "12px", color: "var(--accent-danger)" }}
                >
                  <Square size={13} />
                  <span>Cancel</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right Side: Incremental Session Statistics Badge (Never resets until app exit) */}
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

      {/* ========================================================================= */}
      {/* 2. SWITCH SECTION TABS: Preview vs Settings                               */}
      {/* ========================================================================= */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        <button
          onClick={() => setActiveTab("preview")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 16px",
            borderRadius: "var(--radius-sm)",
            fontSize: "12px",
            fontWeight: 700,
            cursor: "pointer",
            border: activeTab === "preview" ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
            backgroundColor: activeTab === "preview" ? "var(--bg-card)" : "var(--bg-surface)",
            color: activeTab === "preview" ? "var(--accent-primary)" : "var(--text-secondary)",
            transition: "all 0.15s ease",
          }}
        >
          <FileCode size={14} />
          <span>Script Translation Preview</span>
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 16px",
            borderRadius: "var(--radius-sm)",
            fontSize: "12px",
            fontWeight: 700,
            cursor: "pointer",
            border: activeTab === "settings" ? "1px solid var(--accent-gold)" : "1px solid var(--border-subtle)",
            backgroundColor: activeTab === "settings" ? "var(--bg-card)" : "var(--bg-surface)",
            color: activeTab === "settings" ? "var(--accent-gold)" : "var(--text-secondary)",
            transition: "all 0.15s ease",
          }}
        >
          <Sliders size={14} />
          <span>Batch & Key Mapping Settings</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 3. DYNAMIC CONTENT AREA: Stretches 100% full height & width               */}
      {/* ========================================================================= */}
      {activeTab === "settings" ? (
        /* ========================================================================= */
        /* MODE A: BATCH SETTINGS & JSON FIELD MAPPING (Single Column Spacious View) */
        /* ========================================================================= */
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", flex: 1, minHeight: 0, paddingRight: "2px" }}>
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
                  <span style={{ fontSize: "11.5px", color: "var(--text-muted)", marginLeft: "4px" }}>
                    • Total: <strong style={{ color: "var(--text-primary)" }}>{completedLines}</strong> / {totalLines} lines ({progressPercent}%)
                  </span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  onClick={handleAddFiles}
                  disabled={isRunning}
                  className="btn-primary"
                  style={{ padding: "5px 12px", fontSize: "11.5px" }}
                >
                  <Plus size={13} />
                  <span>Add Script Files</span>
                </button>
                {queuedFiles.length > 0 && !isRunning && (
                  <button
                    type="button"
                    onClick={handleScanDiskProgress}
                    className="btn-secondary"
                    style={{ padding: "5px 10px", fontSize: "11.5px" }}
                    title="Scan output folder to hydrate already translated files"
                  >
                    <RefreshCw size={13} />
                    <span>Scan Disk</span>
                  </button>
                )}
                {queuedFiles.length > 0 && !isRunning && (
                  <button
                    type="button"
                    onClick={handleClearQueue}
                    className="btn-secondary"
                    style={{ padding: "5px 10px", fontSize: "11.5px", color: "var(--accent-danger)" }}
                    title="Clear all queued files"
                  >
                    <Trash2 size={13} />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            {/* Global Progress Bar Line */}
            {queuedFiles.length > 0 && (
              <div style={{ width: "100%", height: "5px", backgroundColor: "var(--bg-app)", borderRadius: "3px", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: "100%",
                    backgroundColor: progressPercent === 100 ? "var(--accent-success)" : "var(--accent-cyan)",
                    transition: "width 0.2s ease",
                  }}
                />
              </div>
            )}

            {/* Grid of File Cards */}
            {queuedFiles.length === 0 ? (
              <div
                style={{
                  padding: "16px",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  border: "1px dashed var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                No script files queued. Click <strong>Add Script Files</strong> above to load <code>.jsonl</code> or <code>.json</code> files.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: "8px",
                  maxHeight: "160px",
                  overflowY: "auto",
                }}
              >
                {queuedFiles.map((file) => {
                  const isSelected = file.id === (activeFile?.id);
                  const filePercent = file.totalLines > 0 ? Math.round((file.completedLines / file.totalLines) * 100) : 0;
                  return (
                    <div
                      key={file.id}
                      onClick={() => setSelectedFileId(file.id)}
                      style={{
                        backgroundColor: isSelected ? "var(--bg-card)" : "var(--bg-surface-elevated)",
                        border:
                          file.status === "processing"
                            ? "1px solid var(--accent-cyan)"
                            : file.status === "error"
                            ? "1px solid var(--accent-danger)"
                            : isSelected
                            ? "1px solid var(--accent-primary)"
                            : "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-sm)",
                        padding: "8px 10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: isSelected ? 700 : 600,
                            color: file.status === "error" ? "var(--accent-danger)" : isSelected ? "var(--accent-primary)" : "var(--text-primary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={file.path}
                        >
                          {file.name}
                        </div>
                        <div style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px", marginTop: "2px" }}>
                          <span>{file.completedLines}/{file.totalLines} lines ({filePercent}%)</span>
                          <span>•</span>
                          <span>{(file.sizeBytes / 1024).toFixed(1)} KB</span>
                          {file.status === "processing" && (
                            <span style={{ color: "var(--accent-cyan)", fontWeight: 700 }}>Translating...</span>
                          )}
                          {file.status === "completed" && (
                            <span style={{ color: "var(--accent-success)", fontWeight: 700 }}>Completed</span>
                          )}
                          {file.status === "error" && (
                            <span style={{ color: "var(--accent-danger)", fontWeight: 700 }}>Halted / Error</span>
                          )}
                        </div>
                      </div>

                      {!isRunning && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFile(file.id);
                          }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "3px" }}
                          title="Remove file"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card 2: JSON Field / Key Mapping */}
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Layers size={16} style={{ color: "var(--accent-cyan)" }} />
                <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                  JSON Field / Column Key Mapping
                </span>
              </div>
              {detectedKeys.length > 0 && (
                <span style={{ fontSize: "11px", color: "var(--accent-gold)", fontWeight: 600 }}>
                  {detectedKeys.length} JSON keys auto-detected across scripts
                </span>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
              {/* Source Speaker */}
              <KeySelectorCombobox
                label="Source Speaker Key:"
                value={sourceSpeakerKey}
                onChange={(key) => setSourceSpeakerKey(key)}
                detectedKeys={detectedKeys}
                placeholder="Select or type key..."
                allowNone={true}
                disabled={isRunning}
                helperText="Select detected key or type custom key (e.g. 'speaker', 'name', or 'none')."
              />

              {/* Source Message */}
              <KeySelectorCombobox
                label="Source Message Key:"
                value={sourceMessageKey}
                onChange={(key) => setSourceMessageKey(key)}
                detectedKeys={detectedKeys}
                placeholder="Select or type key..."
                disabled={isRunning}
                helperText="Select detected dialogue key or type custom key (e.g. 'message', 'text', 'dialogue')."
              />

              {/* Target Speaker */}
              <KeySelectorCombobox
                label="Target Speaker Key (Output):"
                value={targetSpeakerKey}
                onChange={(key) => setTargetSpeakerKey(key)}
                detectedKeys={detectedKeys.length > 0 ? detectedKeys : ["translated_speaker", "speaker_en", "trans_speaker"]}
                placeholder="translated_speaker"
                disabled={isRunning}
                helperText="Key name written into output script for translated character names."
              />

              {/* Target Message */}
              <KeySelectorCombobox
                label="Target Message Key (Output):"
                value={targetMessageKey}
                onChange={(key) => setTargetMessageKey(key)}
                detectedKeys={detectedKeys.length > 0 ? detectedKeys : ["translated_message", "message_en", "trans_message"]}
                placeholder="translated_message"
                disabled={isRunning}
                helperText="Key name written into output script for translated dialogue."
              />
            </div>
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
                  max={200}
                  className="input-field"
                  value={linesPerBatchInput}
                  disabled={isRunning}
                  onChange={(e) => setLinesPerBatchInput(e.target.value)}
                  onBlur={handleCommitLinesPerBatch}
                  onKeyDown={(e) => e.key === "Enter" && handleCommitLinesPerBatch()}
                  style={{ width: "100%", fontSize: "12px", padding: "6px 10px", fontWeight: 600 }}
                />
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                  Number of dialogue lines grouped into each prompt turn (Default: 10-25).
                </span>
              </div>

              {/* Max Context Window */}
              <div>
                <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Max Context Window (lines):
                </label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  className="input-field"
                  value={maxContextLinesInput}
                  disabled={isRunning}
                  onChange={(e) => setMaxContextLinesInput(e.target.value)}
                  onBlur={handleCommitMaxContext}
                  onKeyDown={(e) => e.key === "Enter" && handleCommitMaxContext()}
                  style={{ width: "100%", fontSize: "12px", padding: "6px 10px", fontWeight: 600 }}
                />
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                  Preceding dialogue lines remembered (0 = context disabled).
                </span>
              </div>

              {/* Retained Lines After Cut */}
              <div>
                <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Retained Lines After Cut:
                </label>
                <input
                  type="number"
                  min={0}
                  max={maxContextLines}
                  className="input-field"
                  value={retainContextLinesInput}
                  disabled={isRunning || maxContextLines === 0}
                  onChange={(e) => setRetainContextLinesInput(e.target.value)}
                  onBlur={handleCommitRetainContext}
                  onKeyDown={(e) => e.key === "Enter" && handleCommitRetainContext()}
                  style={{ width: "100%", fontSize: "12px", padding: "6px 10px", fontWeight: 600 }}
                />
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                  Lines kept in sliding buffer when context exceeds max.
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
                  max={8}
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
                  max={5000}
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

            {/* Automation & Preprocessing Toggles */}
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
                    Auto-Continue Until 100% Completed
                  </label>
                  <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                    Automatically retries transient rate limits and pauses until all files are fully translated.
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
                  backgroundColor: overrideRawWithPreprocessed ? "rgba(234, 179, 8, 0.06)" : "var(--bg-surface-elevated)",
                  border: overrideRawWithPreprocessed ? "1px solid rgba(234, 179, 8, 0.3)" : "1px solid var(--border-subtle)",
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
                    htmlFor="override-raw-checkbox"
                    style={{ fontSize: "12px", fontWeight: 700, color: overrideRawWithPreprocessed ? "var(--accent-gold)" : "var(--text-primary)", cursor: "pointer" }}
                  >
                    Override Raw Dialogue with Preprocessed Text
                  </label>
                  <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                    Saves cleaned Japanese text (stripped of engine tags/ruby readings) into raw fields for clean hook matching.
                  </span>
                </div>
                <input
                  id="override-raw-checkbox"
                  type="checkbox"
                  checked={overrideRawWithPreprocessed}
                  disabled={isRunning}
                  onChange={(e) => setOverrideRawWithPreprocessed(e.target.checked)}
                  style={{ accentColor: "var(--accent-gold)", transform: "scale(1.2)", marginTop: "2px", cursor: "pointer" }}
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
        /* MODE B: SCRIPT TRANSLATION PREVIEW (100% Dynamic Full Height Table View)   */
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
            flex: 1,
            minHeight: 0,
            height: "100%",
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
                    style={{ fontSize: "12px", padding: "4px 8px", maxWidth: "260px", fontWeight: 600 }}
                  >
                    {queuedFiles.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.completedLines}/{f.totalLines} lines) {f.status === "completed" ? "✓" : ""}
                      </option>
                    ))}
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
                <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "4px" }}>
                  ({activeFile.completedLines}/{activeFile.totalLines} lines translated)
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
                style={{ fontSize: "11.5px", padding: "4px 8px" }}
              >
                <option value="all">All Lines</option>
                <option value="completed">Translated Only</option>
                <option value="untranslated">Untranslated Only</option>
              </select>

              {progressData && progressData.currentBatch > 0 && (
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Batch: <strong style={{ color: "var(--accent-cyan)" }}>{progressData.currentBatch}/{progressData.totalBatches}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Dynamic Full Height Table Container */}
          <div
            style={{
              flex: 1,
              height: "100%",
              minHeight: 0,
              overflowY: "auto",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--bg-app)",
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
                  {displayedItems.map((item) => {
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
                            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                              {item.translatedMessage}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontStyle: "italic", opacity: 0.5 }}>
                              Pending translation...
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                          {isTranslated ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "10.5px", color: "var(--accent-success)", fontWeight: 600 }}>
                              <CheckCircle2 size={13} />
                              <span>Done</span>
                            </span>
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
        </div>
      )}
    </div>
  );
};
