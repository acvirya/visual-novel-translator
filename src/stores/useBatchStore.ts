import { create } from "zustand";
import { BatchFileEntry, BatchProgressUpdate, BatchSettings, KeyMappingConfig } from "../services/batchTranslateService";

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
  statusFilter: "all" | "completed" | "untranslated";
  isRunning: boolean;
  isPaused: boolean;
  progressData: BatchProgressUpdate | null;
  settings: BatchSettings;
  keyMapping: KeyMappingConfig;
  sessionStats: SessionUsageStats;

  // Actions
  setQueuedFiles: (files: BatchFileEntry[] | ((prev: BatchFileEntry[]) => BatchFileEntry[])) => void;
  updateFile: (file: BatchFileEntry) => void;
  setSelectedFileId: (id: string | null) => void;
  setSearchFilter: (query: string) => void;
  setStatusFilter: (filter: "all" | "completed" | "untranslated") => void;
  setIsRunning: (running: boolean) => void;
  setIsPaused: (paused: boolean) => void;
  setProgressData: (progress: BatchProgressUpdate | null) => void;
  setSettings: (settings: Partial<BatchSettings>) => void;
  setKeyMapping: (mapping: Partial<KeyMappingConfig>) => void;
  addSessionTokens: (promptTokens: number, completionTokens: number, cachedTokens: number, cost: number) => void;
}

export const useBatchStore = create<BatchState>((set) => {
  const savedModel = localStorage.getItem("vn_batch_selected_model") || "openai/gpt-4o-mini";
  const savedLines = Number(localStorage.getItem("vn_batch_lines_per_batch")) || 10;
  const savedMaxCtx = Number(localStorage.getItem("vn_batch_max_context_lines")) || 10;
  const savedRetainCtx = Number(localStorage.getItem("vn_batch_retain_context_lines")) || 3;
  const savedConcurrency = Number(localStorage.getItem("vn_batch_concurrency")) || 2;
  const savedDelay = Number(localStorage.getItem("vn_batch_delay_ms")) || 300;
  const savedAutoContinue = localStorage.getItem("vn_batch_auto_continue") !== "false";
  const savedOverrideRaw = localStorage.getItem("vn_batch_override_raw") !== "false";
  const savedOutputDir = localStorage.getItem("vn_batch_output_dir") || "";
  const rawSrcSpk = localStorage.getItem("vn_batch_src_speaker_key");
  const savedSrcSpk = rawSrcSpk && rawSrcSpk !== "auto" ? rawSrcSpk : "speaker";

  const rawSrcMsg = localStorage.getItem("vn_batch_src_message_key");
  const savedSrcMsg = rawSrcMsg && rawSrcMsg !== "auto" ? rawSrcMsg : "message";

  const savedTgtSpk = localStorage.getItem("vn_batch_tgt_speaker_key") || "translated_speaker";
  const savedTgtMsg = localStorage.getItem("vn_batch_tgt_message_key") || "translated_message";

  const keyMapping: KeyMappingConfig = {
    sourceSpeakerKey: savedSrcSpk,
    sourceMessageKey: savedSrcMsg,
    targetSpeakerKey: savedTgtSpk,
    targetMessageKey: savedTgtMsg,
  };

  const initialSettings: BatchSettings = {
    linesPerBatch: savedLines,
    maxContextLines: savedMaxCtx,
    retainContextLines: savedRetainCtx,
    concurrency: savedConcurrency,
    modelId: savedModel,
    temperature: 0.3,
    delayMs: savedDelay,
    autoContinueUntilCompleted: savedAutoContinue,
    overrideRawWithPreprocessed: savedOverrideRaw,
    outputDir: savedOutputDir,
    fileSuffix: "_translated",
    keyMapping,
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
    keyMapping,
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
        queuedFiles: state.queuedFiles.map((f) => (f.id === file.id ? { ...file } : f)),
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
        if (partial.maxContextLines !== undefined) localStorage.setItem("vn_batch_max_context_lines", String(partial.maxContextLines));
        if (partial.retainContextLines !== undefined) localStorage.setItem("vn_batch_retain_context_lines", String(partial.retainContextLines));
        if (partial.concurrency !== undefined) localStorage.setItem("vn_batch_concurrency", String(partial.concurrency));
        if (partial.delayMs !== undefined) localStorage.setItem("vn_batch_delay_ms", String(partial.delayMs));
        if (partial.autoContinueUntilCompleted !== undefined) localStorage.setItem("vn_batch_auto_continue", String(partial.autoContinueUntilCompleted));
        if (partial.overrideRawWithPreprocessed !== undefined) localStorage.setItem("vn_batch_override_raw", String(partial.overrideRawWithPreprocessed));
        if (partial.outputDir !== undefined) localStorage.setItem("vn_batch_output_dir", partial.outputDir);
        return { settings: next };
      }),
    setKeyMapping: (partial) =>
      set((state) => {
        const next = { ...state.keyMapping, ...partial };
        if (partial.sourceSpeakerKey !== undefined) localStorage.setItem("vn_batch_src_speaker_key", partial.sourceSpeakerKey);
        if (partial.sourceMessageKey !== undefined) localStorage.setItem("vn_batch_src_message_key", partial.sourceMessageKey);
        if (partial.targetSpeakerKey !== undefined) localStorage.setItem("vn_batch_tgt_speaker_key", partial.targetSpeakerKey);
        if (partial.targetMessageKey !== undefined) localStorage.setItem("vn_batch_tgt_message_key", partial.targetMessageKey);
        return {
          keyMapping: next,
          settings: { ...state.settings, keyMapping: next },
        };
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
