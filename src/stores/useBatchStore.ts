import { create } from "zustand";
import { BatchFileEntry, BatchProgressUpdate, BatchSettings } from "../services/batchTranslateService";

export interface SessionUsageStats {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalCost: number;
}

export interface BatchState {
  queuedFiles: BatchFileEntry[];
  selectedFileId: string | null;
  searchFilter: string;
  statusFilter: "all" | "completed" | "untranslated" | "explicit";
  isRunning: boolean;
  isPaused: boolean;
  progressData: BatchProgressUpdate | null;
  settings: BatchSettings;
  sessionStats: SessionUsageStats;

  // Actions
  setQueuedFiles: (files: BatchFileEntry[] | ((prev: BatchFileEntry[]) => BatchFileEntry[])) => void;
  updateFile: (file: BatchFileEntry) => void;
  setSelectedFileId: (id: string | null) => void;
  setSearchFilter: (query: string) => void;
  setStatusFilter: (filter: "all" | "completed" | "untranslated" | "explicit") => void;
  setIsRunning: (running: boolean) => void;
  setIsPaused: (paused: boolean) => void;
  setProgressData: (progress: BatchProgressUpdate | null) => void;
  setSettings: (settings: Partial<BatchSettings>) => void;
  addSessionTokens: (promptTokens: number, completionTokens: number, cachedTokens: number, cost: number) => void;
}

export const useBatchStore = create<BatchState>((set) => {
  const savedModel = localStorage.getItem("vn_batch_selected_model") || "openai/gpt-4o-mini";
  const savedLines = Number(localStorage.getItem("vn_batch_lines_per_batch")) || 10;
  const rawMaxBatch = localStorage.getItem("vn_batch_max_batch_context") ?? localStorage.getItem("vn_batch_max_context_lines");
  const savedMaxBatchCtx = rawMaxBatch !== null && !isNaN(Number(rawMaxBatch)) ? Number(rawMaxBatch) : 2;

  const rawRetainBatch = localStorage.getItem("vn_batch_retain_batch_context") ?? localStorage.getItem("vn_batch_retain_context_lines");
  const savedRetainBatchCtx = rawRetainBatch !== null && !isNaN(Number(rawRetainBatch)) ? Number(rawRetainBatch) : 1;

  const savedConcurrency = Number(localStorage.getItem("vn_batch_concurrency")) || 2;
  const savedDelay = Number(localStorage.getItem("vn_batch_delay_ms")) || 300;
  const savedTimeoutMinutes = Number(localStorage.getItem("vn_batch_timeout_minutes")) || 10;
  const savedMaxBackoff = Number(localStorage.getItem("vn_batch_max_backoff_seconds")) || 30;
  const savedAutoContinue = localStorage.getItem("vn_batch_auto_continue") !== "false";
  const savedTranslateExplicitOnly = localStorage.getItem("vn_batch_translate_explicit_only") === "true";
  const savedOverrideRaw = localStorage.getItem("vn_batch_override_raw") !== "false";
  const savedOutputDir = localStorage.getItem("vn_batch_output_dir") || "";

  const initialSettings: BatchSettings = {
    linesPerBatch: savedLines,
    maxBatchContext: savedMaxBatchCtx,
    retainBatchContext: savedRetainBatchCtx,
    concurrency: savedConcurrency,
    modelId: savedModel,
    temperature: 0.3,
    delayMs: savedDelay,
    timeoutMinutes: savedTimeoutMinutes,
    maxBackoffSeconds: savedMaxBackoff,
    autoContinueUntilCompleted: savedAutoContinue,
    translateExplicitOnly: savedTranslateExplicitOnly,
    overrideRawWithPreprocessed: savedOverrideRaw,
    outputDir: savedOutputDir,
    fileSuffix: "_translated",
  };

  return {
    queuedFiles: [],
    selectedFileId: null,
    searchFilter: "",
    statusFilter: "all",
    isRunning: false,
    isPaused: false,
    progressData: null,
    settings: initialSettings,
    sessionStats: {
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      totalCost: 0,
    },

    setQueuedFiles: (filesOrFn) =>
      set((state) => ({
        queuedFiles: typeof filesOrFn === "function" ? filesOrFn(state.queuedFiles) : filesOrFn,
      })),
    updateFile: (file) =>
      set((state) => ({
        queuedFiles: state.queuedFiles.map((f) =>
          f.id === file.id ? { ...file, items: Array.isArray(file.items) ? [...file.items] : [] } : f
        ),
      })),
    setSelectedFileId: (selectedFileId) => set({ selectedFileId }),
    setSearchFilter: (searchFilter) => set({ searchFilter }),
    setStatusFilter: (statusFilter) => set({ statusFilter }),
    setIsRunning: (isRunning) => set({ isRunning }),
    setIsPaused: (isPaused) => set({ isPaused }),
    setProgressData: (progressData) => set({ progressData }),
    setSettings: (partial) =>
      set((state) => {
        const next = { ...state.settings, ...partial };
        if (partial.modelId !== undefined) localStorage.setItem("vn_batch_selected_model", partial.modelId);
        if (partial.linesPerBatch !== undefined) localStorage.setItem("vn_batch_lines_per_batch", String(partial.linesPerBatch));
        if (partial.maxBatchContext !== undefined) localStorage.setItem("vn_batch_max_batch_context", String(partial.maxBatchContext));
        if (partial.retainBatchContext !== undefined) localStorage.setItem("vn_batch_retain_batch_context", String(partial.retainBatchContext));
        if (partial.concurrency !== undefined) localStorage.setItem("vn_batch_concurrency", String(partial.concurrency));
        if (partial.delayMs !== undefined) localStorage.setItem("vn_batch_delay_ms", String(partial.delayMs));
        if (partial.timeoutMinutes !== undefined) localStorage.setItem("vn_batch_timeout_minutes", String(partial.timeoutMinutes));
        if (partial.maxBackoffSeconds !== undefined) localStorage.setItem("vn_batch_max_backoff_seconds", String(partial.maxBackoffSeconds));
        if (partial.autoContinueUntilCompleted !== undefined) localStorage.setItem("vn_batch_auto_continue", String(partial.autoContinueUntilCompleted));
        if (partial.overrideRawWithPreprocessed !== undefined) localStorage.setItem("vn_batch_override_raw", String(partial.overrideRawWithPreprocessed));
        if (partial.outputDir !== undefined) localStorage.setItem("vn_batch_output_dir", partial.outputDir);
        return { settings: next };
      }),
    addSessionTokens: (promptTokens, completionTokens, cachedTokens, cost) =>
      set((state) => ({
        sessionStats: {
          promptTokens: state.sessionStats.promptTokens + promptTokens,
          completionTokens: state.sessionStats.completionTokens + completionTokens,
          cachedTokens: state.sessionStats.cachedTokens + cachedTokens,
          totalCost: state.sessionStats.totalCost + cost,
        },
      })),
  };
});

