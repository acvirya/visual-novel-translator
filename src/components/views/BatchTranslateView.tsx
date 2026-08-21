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
} from "lucide-react";
import { ModelSelectorCombobox } from "../common/ModelSelectorCombobox";
import {
  batchTranslateService,
  BatchFileEntry,
  BatchSettings,
  KeyMappingConfig,
  isGenuinelyTranslated,
} from "../../services/batchTranslateService";
import { useBatchStore } from "../../stores/useBatchStore";

export const BatchTranslateView: React.FC = () => {
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
  } = useBatchStore();

  // Settings
  const [selectedEngine, setSelectedEngine] = useState<string>(() => {
    return localStorage.getItem("vn_batch_selected_model") || "openai/gpt-4o-mini";
  });
  const [linesPerBatch, setLinesPerBatch] = useState<number>(() => {
    const val = parseInt(localStorage.getItem("vn_batch_lines_per_batch") || "10", 10);
    return isNaN(val) ? 10 : val;
  });
  const [maxContextLines, setMaxContextLines] = useState<number>(() => {
    const val = parseInt(localStorage.getItem("vn_batch_max_context_lines") || "10", 10);
    return isNaN(val) ? 10 : val;
  });
  const [retainContextLines, setRetainContextLines] = useState<number>(() => {
    const val = parseInt(localStorage.getItem("vn_batch_retain_context_lines") || "3", 10);
    return isNaN(val) ? 3 : val;
  });
  const [concurrency, setConcurrency] = useState<number>(() => {
    const val = parseInt(localStorage.getItem("vn_batch_concurrency") || "2", 10);
    return isNaN(val) ? 2 : val;
  });
  const [delayMs, setDelayMs] = useState<number>(() => {
    const val = parseInt(localStorage.getItem("vn_batch_delay_ms") || "300", 10);
    return isNaN(val) ? 300 : val;
  });
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

  // Column / Key Mapping Configuration
  const [sourceSpeakerKey, setSourceSpeakerKey] = useState<string>(() => {
    return localStorage.getItem("vn_batch_src_speaker_key") || "auto";
  });
  const [sourceMessageKey, setSourceMessageKey] = useState<string>(() => {
    return localStorage.getItem("vn_batch_src_message_key") || "auto";
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

  // Save settings to localStorage
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

  // Re-parse files only when key mappings explicitly change, preserving already translated lines
  useEffect(() => {
    if (isRunning) return;
    setQueuedFiles((prev) =>
      prev.map((file) => {
        const newItems = batchTranslateService.parseScriptContent(file.rawContent, keyMapping);
        // Preserve any translations already in memory or from output
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

  // Subscribe to batch translation updates
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

        // Hydrate from existing output files on disk if present
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
        // Re-check existing output files in the new output folder
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", gap: "12px" }}>
      {/* Top Header Card */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        {/* Left Side: Model Selector + Parameters */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
              Model:
            </span>
            <ModelSelectorCombobox
              selectedModelId={selectedEngine}
              onSelectModel={(id) => setSelectedEngine(id)}
              disabled={isRunning}
              width="260px"
              compact={true}
            />
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "12px",
              backgroundColor: "var(--bg-surface-elevated)",
              padding: "5px 10px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <span>Batch: <strong style={{ color: "var(--text-primary)" }}>{linesPerBatch} lines</strong></span>
            <span>•</span>
            <span>Context: <strong style={{ color: "var(--accent-cyan)" }}>{maxContextLines} / {retainContextLines}</strong></span>
          </div>
        </div>

        {/* Right Side: Execution Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {!isRunning ? (
            <button
              onClick={handleStartBatch}
              disabled={queuedFiles.length === 0 || queuedFiles.every((f) => f.status === "completed")}
              className="btn-primary"
              style={{ padding: "7px 16px", fontSize: "12.5px" }}
            >
              <Play size={14} />
              <span>
                {queuedFiles.some((f) => f.status === "error" || (f.completedLines > 0 && f.status !== "completed"))
                  ? "Continue / Resume Translation"
                  : "Start Batch Translation"}
              </span>
            </button>
          ) : (
            <>
              <button
                onClick={handlePauseResume}
                className="btn-secondary"
                style={{ padding: "7px 14px", fontSize: "12.5px" }}
              >
                {isPaused ? <Play size={14} /> : <Pause size={14} />}
                <span>{isPaused ? "Resume" : "Pause"}</span>
              </button>
              <button
                onClick={handleCancelBatch}
                className="btn-secondary"
                style={{ padding: "7px 14px", fontSize: "12.5px", color: "var(--accent-danger)" }}
              >
                <Square size={14} />
                <span>Cancel</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Split View: Left (Queued Files & Settings) | Right (Live Interactive Script Table) */}
      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: "12px", flex: 1, minHeight: 0 }}>
        {/* Left Column: Queued Files & Batch Settings */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", paddingRight: "2px" }}>
          {/* File Queue Card */}
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <FolderOpen size={15} style={{ color: "var(--accent-cyan)" }} />
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                  Queued Files ({queuedFiles.length})
                </span>
              </div>

              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  onClick={handleAddFiles}
                  disabled={isRunning}
                  className="btn-primary"
                  style={{ padding: "4px 10px", fontSize: "11.5px" }}
                >
                  <Plus size={13} />
                  <span>Add Files</span>
                </button>
                {queuedFiles.length > 0 && !isRunning && (
                  <button
                    type="button"
                    onClick={handleScanDiskProgress}
                    className="btn-secondary"
                    style={{ padding: "4px 8px", fontSize: "11.5px" }}
                    title="Re-scan output folder for existing progress"
                  >
                    <RefreshCw size={12} />
                  </button>
                )}
                {queuedFiles.length > 0 && !isRunning && (
                  <button
                    type="button"
                    onClick={handleClearQueue}
                    className="btn-secondary"
                    style={{ padding: "4px 8px", fontSize: "11.5px" }}
                    title="Clear queue"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Overall Progress Bar */}
            {queuedFiles.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", margin: "2px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)" }}>
                  <span>Total Progress</span>
                  <span><strong>{completedLines}</strong> / {totalLines} lines ({progressPercent}%)</span>
                </div>
                <div style={{ width: "100%", height: "6px", backgroundColor: "var(--bg-surface-elevated)", borderRadius: "3px", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${progressPercent}%`,
                      height: "100%",
                      backgroundColor: progressPercent === 100 ? "var(--accent-success)" : "var(--accent-cyan)",
                      transition: "width 0.2s ease",
                    }}
                  />
                </div>
              </div>
            )}

            {/* File List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "160px", overflowY: "auto" }}>
              {queuedFiles.length === 0 ? (
                <div
                  style={{
                    padding: "16px 10px",
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    border: "1px dashed var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  Click <strong>Add Files</strong> to select <code>.jsonl</code> / <code>.json</code> scripts.
                </div>
              ) : (
                queuedFiles.map((file) => {
                  const isSelected = file.id === (activeFile?.id);
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
                          <span>{file.completedLines}/{file.totalLines} lines</span>
                          <span>•</span>
                          <span>{(file.sizeBytes / 1024).toFixed(1)} KB</span>
                          {file.status === "processing" && (
                            <span style={{ color: "var(--accent-cyan)", fontWeight: 600 }}>Translating...</span>
                          )}
                          {file.status === "completed" && (
                            <span style={{ color: "var(--accent-success)", fontWeight: 600 }}>Completed</span>
                          )}
                          {file.status === "error" && (
                            <span style={{ color: "var(--accent-danger)", fontWeight: 600 }}>Paused / Failed</span>
                          )}
                          {file.status !== "processing" && file.completedLines > 0 && file.completedLines < file.totalLines && (
                            <span
                              style={{
                                backgroundColor: "rgba(234, 179, 8, 0.15)",
                                color: "var(--accent-gold)",
                                padding: "1px 5px",
                                borderRadius: "3px",
                                fontSize: "10px",
                                fontWeight: 600,
                              }}
                            >
                              Resuming at line {file.completedLines + 1}
                            </span>
                          )}
                          {file.status !== "processing" && file.completedLines === file.totalLines && file.totalLines > 0 && (
                            <span
                              style={{
                                backgroundColor: "rgba(34, 197, 94, 0.15)",
                                color: "var(--accent-success)",
                                padding: "1px 5px",
                                borderRadius: "3px",
                                fontSize: "10px",
                                fontWeight: 600,
                              }}
                            >
                              100% on Disk
                            </span>
                          )}
                        </div>
                        {file.error && (
                          <div style={{ fontSize: "10px", color: "var(--accent-danger)", marginTop: "2px", lineHeight: "1.3" }} title={file.error}>
                            {file.error.length > 70 ? `${file.error.slice(0, 70)}...` : file.error}
                          </div>
                        )}
                      </div>

                      {!isRunning && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFile(file.id);
                          }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px" }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* JSON Column / Key Mapping Card */}
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Layers size={15} style={{ color: "var(--accent-cyan)" }} />
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                  JSON Field / Key Mapping
                </span>
              </div>
              {detectedKeys.length > 0 && (
                <span style={{ fontSize: "10.5px", color: "var(--accent-gold)", fontWeight: 600 }}>
                  {detectedKeys.length} keys detected
                </span>
              )}
            </div>

            {/* Source Speaker Key */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "3px" }}>
                  Source Speaker Key:
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    list="src-speaker-keys"
                    className="input-field"
                    value={sourceSpeakerKey}
                    onChange={(e) => setSourceSpeakerKey(e.target.value)}
                    disabled={isRunning}
                    placeholder="auto"
                    style={{ width: "100%", fontSize: "11.5px", padding: "4px 8px" }}
                  />
                  <datalist id="src-speaker-keys">
                    <option value="auto">Auto-detect (speaker/name/chara)</option>
                    <option value="none">None (Narration only)</option>
                    <option value="speaker">speaker</option>
                    <option value="name">name</option>
                    <option value="character">character</option>
                    <option value="chara">chara</option>
                    {detectedKeys.map((k) => (
                      <option key={`spk_${k}`} value={k}>{k}</option>
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Source Message Key */}
              <div>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "3px" }}>
                  Source Message Key:
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    list="src-message-keys"
                    className="input-field"
                    value={sourceMessageKey}
                    onChange={(e) => setSourceMessageKey(e.target.value)}
                    disabled={isRunning}
                    placeholder="auto"
                    style={{ width: "100%", fontSize: "11.5px", padding: "4px 8px" }}
                  />
                  <datalist id="src-message-keys">
                    <option value="auto">Auto-detect (message/text/dialogue)</option>
                    <option value="message">message</option>
                    <option value="text">text</option>
                    <option value="dialogue">dialogue</option>
                    <option value="msg">msg</option>
                    <option value="content">content</option>
                    {detectedKeys.map((k) => (
                      <option key={`msg_${k}`} value={k}>{k}</option>
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            {/* Target Keys */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "3px" }}>
                  Target Speaker Key:
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={targetSpeakerKey}
                  onChange={(e) => setTargetSpeakerKey(e.target.value)}
                  disabled={isRunning}
                  placeholder="translated_speaker"
                  style={{ width: "100%", fontSize: "11.5px", padding: "4px 8px" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "3px" }}>
                  Target Message Key:
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={targetMessageKey}
                  onChange={(e) => setTargetMessageKey(e.target.value)}
                  disabled={isRunning}
                  placeholder="translated_message"
                  style={{ width: "100%", fontSize: "11.5px", padding: "4px 8px" }}
                />
              </div>
            </div>
          </div>

          {/* Parameters Card */}
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Sliders size={15} style={{ color: "var(--accent-gold)" }} />
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                Batch & Context Parameters
              </span>
            </div>

            {/* Lines Per Batch Slider */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Lines per Batch Chunk:
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={linesPerBatch}
                    disabled={isRunning}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1));
                      setLinesPerBatch(val);
                    }}
                    style={{
                      width: "48px",
                      padding: "2px 4px",
                      fontSize: "11.5px",
                      fontWeight: 700,
                      textAlign: "center",
                      backgroundColor: "var(--bg-surface-elevated)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--accent-primary)",
                    }}
                  />
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>lines</span>
                </div>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                step={1}
                value={linesPerBatch}
                disabled={isRunning}
                onChange={(e) => setLinesPerBatch(parseInt(e.target.value, 10))}
                style={{ width: "100%", accentColor: "var(--accent-primary)" }}
              />
            </div>

            {/* Max Context Lines Slider */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Max Context Window:
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={maxContextLines}
                    disabled={isRunning}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(500, parseInt(e.target.value, 10) || 0));
                      setMaxContextLines(val);
                      setRetainContextLines(Math.min(retainContextLines, val));
                    }}
                    style={{
                      width: "52px",
                      padding: "2px 4px",
                      fontSize: "11.5px",
                      fontWeight: 700,
                      textAlign: "center",
                      backgroundColor: "var(--bg-surface-elevated)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--accent-cyan)",
                    }}
                  />
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>lines</span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={500}
                step={5}
                value={maxContextLines}
                disabled={isRunning}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setMaxContextLines(val);
                  setRetainContextLines(Math.min(retainContextLines, val));
                }}
                style={{ width: "100%", accentColor: "var(--accent-cyan)" }}
              />
            </div>

            {/* Retain Context Lines Slider */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Retained Lines After Cut:
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, Math.min(100, maxContextLines))}
                    value={retainContextLines}
                    disabled={isRunning || maxContextLines === 0}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(Math.min(100, maxContextLines), parseInt(e.target.value, 10) || 1));
                      setRetainContextLines(val);
                    }}
                    style={{
                      width: "48px",
                      padding: "2px 4px",
                      fontSize: "11.5px",
                      fontWeight: 700,
                      textAlign: "center",
                      backgroundColor: "var(--bg-surface-elevated)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--accent-gold)",
                    }}
                  />
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>lines</span>
                </div>
              </div>
              <input
                type="range"
                min={1}
                max={Math.max(1, Math.min(100, maxContextLines))}
                step={1}
                value={retainContextLines}
                disabled={isRunning || maxContextLines === 0}
                onChange={(e) => setRetainContextLines(parseInt(e.target.value, 10))}
                style={{ width: "100%", accentColor: "var(--accent-gold)" }}
              />
            </div>

            {/* Parallel Concurrent Files */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Concurrent Files (Parallel Workers):
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={concurrency}
                    disabled={isRunning}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(8, parseInt(e.target.value, 10) || 1));
                      setConcurrency(val);
                    }}
                    style={{
                      width: "44px",
                      padding: "2px 4px",
                      fontSize: "11.5px",
                      fontWeight: 700,
                      textAlign: "center",
                      backgroundColor: "var(--bg-surface-elevated)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--accent-cyan)",
                    }}
                  />
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>files</span>
                </div>
              </div>
              <input
                type="range"
                min={1}
                max={8}
                step={1}
                value={concurrency}
                disabled={isRunning}
                onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}
                style={{ width: "100%", accentColor: "var(--accent-cyan)" }}
              />
              <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "1px" }}>
                Number of different script files translated concurrently (each file stays sequential for prompt caching).
              </span>
            </div>

            {/* Delay Between Batches */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Delay Between Batches:
                </label>
                <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {delayMs} ms
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={2500}
                step={100}
                value={delayMs}
                disabled={isRunning}
                onChange={(e) => setDelayMs(parseInt(e.target.value, 10))}
                style={{ width: "100%", accentColor: "var(--text-primary)" }}
              />
            </div>

            {/* Auto-Continue Until Completed Toggle */}
            <div
              style={{
                backgroundColor: autoContinue ? "rgba(56, 189, 248, 0.06)" : "var(--bg-surface-elevated)",
                border: autoContinue ? "1px solid rgba(56, 189, 248, 0.3)" : "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 10px",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "8px",
                transition: "all 0.15s ease",
              }}
            >
              <div>
                <label
                  htmlFor="auto-continue-checkbox"
                  style={{
                    fontSize: "11.5px",
                    fontWeight: 700,
                    color: autoContinue ? "var(--accent-cyan)" : "var(--text-primary)",
                    cursor: "pointer",
                    display: "block",
                  }}
                >
                  Auto-Continue Until Completed
                </label>
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                  Automatically retries halted files after cooldown until all files are 100% finished without manual intervention.
                </span>
              </div>
              <input
                id="auto-continue-checkbox"
                type="checkbox"
                checked={autoContinue}
                disabled={isRunning}
                onChange={(e) => setAutoContinue(e.target.checked)}
                style={{
                  accentColor: "var(--accent-cyan)",
                  transform: "scale(1.2)",
                  marginTop: "2px",
                  cursor: "pointer",
                }}
              />
            </div>

            {/* Override Raw Dialogue with Preprocessed Text Toggle */}
            <div
              style={{
                backgroundColor: overrideRawWithPreprocessed ? "rgba(234, 179, 8, 0.06)" : "var(--bg-surface-elevated)",
                border: overrideRawWithPreprocessed ? "1px solid rgba(234, 179, 8, 0.3)" : "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 10px",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "8px",
                transition: "all 0.15s ease",
              }}
            >
              <div>
                <label
                  htmlFor="override-raw-checkbox"
                  style={{
                    fontSize: "11.5px",
                    fontWeight: 700,
                    color: overrideRawWithPreprocessed ? "var(--accent-gold)" : "var(--text-primary)",
                    cursor: "pointer",
                    display: "block",
                  }}
                >
                  Override Raw Text with Preprocessed
                </label>
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginTop: "2px" }}>
                  Saves the cleaned Japanese text (stripped of engine tags, ruby readings, loops) into the raw text fields in the output file for seamless Textractor / OCR hook readability.
                </span>
              </div>
              <input
                id="override-raw-checkbox"
                type="checkbox"
                checked={overrideRawWithPreprocessed}
                disabled={isRunning}
                onChange={(e) => setOverrideRawWithPreprocessed(e.target.checked)}
                style={{
                  accentColor: "var(--accent-gold)",
                  transform: "scale(1.2)",
                  marginTop: "2px",
                  cursor: "pointer",
                }}
              />
            </div>

            {/* Output Directory Field */}
            <div>
              <label style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                Output Folder:
              </label>
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Same folder as source file"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  disabled={isRunning}
                  style={{ flex: 1, fontSize: "11.5px", padding: "4px 8px" }}
                />
                <button
                  type="button"
                  onClick={handleBrowseOutputDir}
                  disabled={isRunning}
                  className="btn-secondary"
                  style={{ padding: "4px 8px", fontSize: "11.5px" }}
                >
                  Browse
                </button>
              </div>
            </div>

            {/* File Suffix */}
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
                style={{ width: "100%", fontSize: "11.5px", padding: "4px 8px" }}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Live Interactive Script Translation Table */}
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            minHeight: 0,
          }}
        >
          {/* Top Bar for Table */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <FileCode size={16} style={{ color: "var(--accent-cyan)" }} />
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                {activeFile ? activeFile.name : "Script Preview"}
              </span>
              {activeFile && (
                <span style={{ fontSize: "11.5px", color: "var(--text-muted)", marginLeft: "4px" }}>
                  ({activeFile.completedLines}/{activeFile.totalLines} lines translated)
                </span>
              )}
            </div>

            {/* Table Search & Status Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  placeholder="Search dialogue..."
                  className="input-field"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{ width: "180px", fontSize: "11.5px", padding: "4px 8px 4px 24px" }}
                />
                <Search size={12} style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
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
                <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                  Batch: <strong style={{ color: "var(--accent-cyan)" }}>{progressData.currentBatch}/{progressData.totalBatches}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Table Container */}
          <div
            style={{
              flex: 1,
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
                  padding: "40px 0",
                  gap: "8px",
                }}
              >
                <Sparkles size={32} style={{ opacity: 0.3 }} />
                <span>No script files loaded. Click Add Files on the left to start.</span>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--bg-surface-elevated)", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-secondary)", textAlign: "left", position: "sticky", top: 0, zIndex: 2 }}>
                    <th style={{ padding: "8px 10px", width: "50px" }}>#</th>
                    <th style={{ padding: "8px 10px", width: "130px" }}>Speaker</th>
                    <th style={{ padding: "8px 10px", width: "42%" }}>Original Dialogue (JP)</th>
                    <th style={{ padding: "8px 10px" }}>Translated Output (EN)</th>
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
      </div>
    </div>
  );
};
