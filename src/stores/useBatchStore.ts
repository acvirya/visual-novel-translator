import { create } from "zustand";
import { BatchFileEntry, BatchProgressUpdate, BatchSettings } from "../services/batchTranslateService";
import { SessionUsageStats, FileStreamingState, FileStreamingPhase } from "../types";
import { settingsManager } from "../services/settingsManager";

export type { SessionUsageStats, FileStreamingState, FileStreamingPhase };

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
  streamingFileStates: Record<string, FileStreamingState>;

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

  return {
    queuedFiles: [],
    selectedFileId: null,
    searchFilter: "",
    statusFilter: "all",
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
        settingsManager.updateBatch(partial);
        return { settings: { ...state.settings, ...partial } };
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

