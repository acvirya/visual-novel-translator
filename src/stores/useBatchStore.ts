import { create } from "zustand";
import { BatchFileEntry, BatchProgressUpdate, BatchSettings } from "../services/batchTranslateService";
import { SessionUsageStats, FileStreamingState, FileStreamingPhase } from "../types";
import { settingsManager } from "../services/settingsManager";

export type { SessionUsageStats, FileStreamingState, FileStreamingPhase };

export type BatchLifecycleState =
  | "idle"
  | "running"
  | "paused"
  | "cancelling"
  | "completed"
  | "failed";

export interface BatchState {
  queuedFiles: BatchFileEntry[];
  selectedFileId: string | null;
  searchFilter: string;
  statusFilter: "all" | "completed" | "untranslated" | "explicit";
  lifecycleState: BatchLifecycleState;
  isRunning: boolean;
  isPaused: boolean;
  progressData: BatchProgressUpdate | null;
  settings: BatchSettings;
  sessionStats: SessionUsageStats;
  streamingFileStates: Record<string, FileStreamingState>;
  avgBatchDurationMs: number;
  estimatedRemainingSeconds: number | null;
  batchesPerMinute: number;
  completedBatchesCount: number;

  // Actions
  transitionTo: (nextState: BatchLifecycleState) => boolean;
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
  recordBatchCompletion: (durationMs: number, remainingBatches: number, concurrency: number) => void;
  setFileStreamingState: (fileId: string, state: FileStreamingState | null | ((prev?: FileStreamingState) => FileStreamingState | null)) => void;
  clearAllStreamingStates: () => void;
}

let isBatchSettingsSubscribed = false;

export const useBatchStore = create<BatchState>((set) => {
  if (!isBatchSettingsSubscribed) {
    isBatchSettingsSubscribed = true;
    settingsManager.subscribe((newSettings) => {
      set({ settings: newSettings.batch });
    });
  }

  const VALID_TRANSITIONS: Record<BatchLifecycleState, BatchLifecycleState[]> = {
    idle: ["running"],
    running: ["paused", "cancelling", "completed", "failed", "idle"],
    paused: ["running", "cancelling", "idle"],
    cancelling: ["idle", "failed"],
    completed: ["idle", "running"],
    failed: ["idle", "running"],
  };

  return {
    queuedFiles: [],
    selectedFileId: null,
    searchFilter: "",
    statusFilter: "all",
    lifecycleState: "idle",
    isRunning: false,
    isPaused: false,
    progressData: null,
    settings: settingsManager.getBatch(),
    sessionStats: {
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      totalCost: 0,
    },
    streamingFileStates: {},
    avgBatchDurationMs: 0,
    estimatedRemainingSeconds: null,
    batchesPerMinute: 0,
    completedBatchesCount: 0,

    transitionTo: (nextState) => {
      let allowed = false;
      set((state) => {
        const validNext = VALID_TRANSITIONS[state.lifecycleState];
        if (!validNext || !validNext.includes(nextState)) {
          console.warn(`[useBatchStore] Invalid state transition: ${state.lifecycleState} -> ${nextState}`);
          allowed = false;
          return state;
        }
        allowed = true;
        const isRunning = nextState === "running" || nextState === "paused";
        const isPaused = nextState === "paused";
        return {
          lifecycleState: nextState,
          isRunning,
          isPaused,
          ...(isRunning
            ? {}
            : {
                completedBatchesCount: 0,
                avgBatchDurationMs: 0,
                estimatedRemainingSeconds: null,
                batchesPerMinute: 0,
              }),
        };
      });
      return allowed;
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
    setIsRunning: (isRunning) =>
      set(() => ({
        isRunning,
        lifecycleState: isRunning ? "running" : "idle",
        // Reset moving average metrics on stopped
        ...(isRunning
          ? {}
          : {
              completedBatchesCount: 0,
              avgBatchDurationMs: 0,
              estimatedRemainingSeconds: null,
              batchesPerMinute: 0,
            }),
      })),
    setIsPaused: (isPaused) =>
      set((state) => ({
        isPaused,
        lifecycleState: isPaused ? "paused" : state.isRunning ? "running" : "idle",
      })),
    setProgressData: (progressData) => set({ progressData }),
    setSettings: (partial) =>
      set((state) => {
        settingsManager.updateBatch(partial);
        return { settings: { ...state.settings, ...partial } };
      }),
    recordBatchCompletion: (durationMs, remainingBatches, concurrency) =>
      set((state) => {
        const count = state.completedBatchesCount + 1;
        // Exponential moving average (alpha = 0.3) for smooth, adaptive ETA estimation
        const prevAvg = state.avgBatchDurationMs > 0 ? state.avgBatchDurationMs : durationMs;
        const newAvg = prevAvg * 0.7 + durationMs * 0.3;
        const effectiveConcurrency = Math.max(1, concurrency || 1);
        const activeWorkers = Math.min(effectiveConcurrency, Math.max(1, remainingBatches));
        const remainingSeconds =
          remainingBatches > 0
            ? Math.round((remainingBatches * newAvg) / (activeWorkers * 1000))
            : 0;
        const batchesPerMinute =
          newAvg > 0 ? Math.round((60000 / newAvg) * effectiveConcurrency * 10) / 10 : 0;

        return {
          completedBatchesCount: count,
          avgBatchDurationMs: newAvg,
          estimatedRemainingSeconds: remainingSeconds,
          batchesPerMinute,
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
    setFileStreamingState: (fileId, stateOrFn) =>
      set((state) => {
        const prev = state.streamingFileStates[fileId];
        const next = typeof stateOrFn === "function" ? stateOrFn(prev) : stateOrFn;
        if (!next) {
          const copy = { ...state.streamingFileStates };
          delete copy[fileId];
          return { streamingFileStates: copy };
        }
        return {
          streamingFileStates: {
            ...state.streamingFileStates,
            [fileId]: next,
          },
        };
      }),
    clearAllStreamingStates: () => set({ streamingFileStates: {} }),
  };
});

