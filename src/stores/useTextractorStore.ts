import { create } from "zustand";
import { TextractorMessage, TextractorProcessInfo, TextractorThread } from "../types";
import { DEFAULT_TEXTRACTOR_PATH } from "../services/textractorService";
import { settingsManager } from "../services/settingsManager";

export interface TextractorState {
  exePath: string;
  arch: "x86" | "x64";
  processes: TextractorProcessInfo[];
  isLoadingProcesses: boolean;
  selectedPid: number | null;
  isHooked: boolean;
  isAttaching: boolean;
  attachedPid: number | null;
  hookError: string | null;
  debounceMs: number;
  threadSyncWaitMs: number;
  threads: Map<number, TextractorThread>;
  combinedThreadId: number | null;
  messageThreadId: number | null;
  speakerThreadId: number | null;
  capturedThreads: Array<{ threadId: number; role: "speaker" | "dialogue" | "combined" }>;
  inspectedThreadId: number | null;
  maxLogLines: number;
  threadLogs: Map<number, TextractorMessage[]>;
  ignoreDuplicateLines: boolean;
  charDeduplicationCount: number;
  loopDeduplication: boolean;
  stutterReduction: boolean;
  latestSpeaker: string;
  latestMessage: string;
  latestRawMessage: string;
  autoForwardToOverlay: boolean;

  // Actions
  setExePath: (path: string) => void;
  setArch: (arch: "x86" | "x64") => void;
  setProcesses: (processes: TextractorProcessInfo[]) => void;
  setIsLoadingProcesses: (loading: boolean) => void;
  setSelectedPid: (pid: number | null) => void;
  setIsHooked: (hooked: boolean) => void;
  setIsAttaching: (attaching: boolean) => void;
  setAttachedPid: (pid: number | null) => void;
  setHookError: (error: string | null) => void;
  setDebounceMs: (ms: number) => void;
  setThreadSyncWaitMs: (ms: number) => void;
  setThreads: (threads: Map<number, TextractorThread> | ((prev: Map<number, TextractorThread>) => Map<number, TextractorThread>)) => void;
  setCombinedThreadId: (id: number | null) => void;
  setMessageThreadId: (id: number | null) => void;
  setSpeakerThreadId: (id: number | null) => void;
  setCapturedThreads: (threads: Array<{ threadId: number; role: "speaker" | "dialogue" | "combined" }> | ((prev: Array<{ threadId: number; role: "speaker" | "dialogue" | "combined" }>) => Array<{ threadId: number; role: "speaker" | "dialogue" | "combined" }>)) => void;
  reorderCapturedThreads: (fromIndex: number, toIndex: number) => void;
  updateCapturedThreadRole: (threadId: number, role: "speaker" | "dialogue" | "combined" | "ignored") => void;
  setInspectedThreadId: (id: number | null) => void;
  setMaxLogLines: (lines: number) => void;
  setThreadLogs: (logs: Map<number, TextractorMessage[]> | ((prev: Map<number, TextractorMessage[]>) => Map<number, TextractorMessage[]>)) => void;
  setIgnoreDuplicateLines: (ignore: boolean) => void;
  setCharDeduplicationCount: (count: number) => void;
  setLoopDeduplication: (enabled: boolean) => void;
  setStutterReduction: (enabled: boolean) => void;
  setLatestSpeaker: (speaker: string) => void;
  setLatestMessage: (message: string) => void;
  setLatestRawMessage: (raw: string) => void;
  setAutoForwardToOverlay: (auto: boolean) => void;
  resetTextractor: () => void;
}

let isTextractorSettingsSubscribed = false;

export const useTextractorStore = create<TextractorState>((set) => {
  const textractorSettings = settingsManager.getTextractor();

  if (!isTextractorSettingsSubscribed) {
    isTextractorSettingsSubscribed = true;
    settingsManager.subscribe((newSettings) => {
      const ts = newSettings.textractor;
      set({
        exePath: ts.executablePath || DEFAULT_TEXTRACTOR_PATH,
        threadSyncWaitMs: ts.flushIntervalMs || 150,
        maxLogLines: ts.threadBufferSize || 100,
      });
    });
  }

  return {
    exePath: textractorSettings.executablePath || DEFAULT_TEXTRACTOR_PATH,
    arch: "x86",
    processes: [],
    isLoadingProcesses: false,
    selectedPid: null,
    isHooked: false,
    isAttaching: false,
    attachedPid: null,
    hookError: null,
    debounceMs: 250,
    threadSyncWaitMs: textractorSettings.flushIntervalMs || 150,
    threads: new Map(),
    combinedThreadId: null,
    messageThreadId: null,
    speakerThreadId: null,
    capturedThreads: [],
    inspectedThreadId: null,
    maxLogLines: textractorSettings.threadBufferSize || 100,
    threadLogs: new Map(),
    ignoreDuplicateLines: true,
    charDeduplicationCount: 0,
    loopDeduplication: true,
    stutterReduction: true,
    autoForwardToOverlay: true,
    latestSpeaker: "",
    latestMessage: "",
    latestRawMessage: "",

    setExePath: (exePath) => {
      settingsManager.updateTextractor({ executablePath: exePath });
      set({ exePath });
    },
    setArch: (arch) => {
      set({ arch });
    },
    setProcesses: (processes) => set({ processes }),
    setIsLoadingProcesses: (isLoadingProcesses) => set({ isLoadingProcesses }),
    setSelectedPid: (selectedPid) => set({ selectedPid }),
    setIsHooked: (isHooked) => set({ isHooked }),
    setIsAttaching: (isAttaching) => set({ isAttaching }),
    setAttachedPid: (attachedPid) => set({ attachedPid }),
    setHookError: (hookError) => set({ hookError }),
    setDebounceMs: (debounceMs) => {
      set({ debounceMs });
    },
    setThreadSyncWaitMs: (threadSyncWaitMs) => {
      const clamped = Math.max(50, threadSyncWaitMs);
      settingsManager.updateTextractor({ flushIntervalMs: clamped });
      set({ threadSyncWaitMs: clamped });
    },
    setThreads: (threadsOrFn) =>
      set((state) => {
        const next = typeof threadsOrFn === "function" ? threadsOrFn(state.threads) : threadsOrFn;
        return { threads: new Map(next) };
      }),
    setCombinedThreadId: (combinedThreadId) => set({ combinedThreadId }),
    setMessageThreadId: (messageThreadId) => set({ messageThreadId }),
    setSpeakerThreadId: (speakerThreadId) => set({ speakerThreadId }),
    setCapturedThreads: (threadsOrFn) =>
      set((state) => ({
        capturedThreads: typeof threadsOrFn === "function" ? threadsOrFn(state.capturedThreads) : threadsOrFn,
      })),
    reorderCapturedThreads: (fromIndex, toIndex) =>
      set((state) => {
        const next = [...state.capturedThreads];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return { capturedThreads: next };
      }),
    updateCapturedThreadRole: (threadId, role) =>
      set((state) => {
        let next = [...state.capturedThreads];
        if (role === "ignored") {
          next = next.filter((t) => t.threadId !== threadId);
        } else {
          const idx = next.findIndex((t) => t.threadId === threadId);
          if (idx >= 0) {
            next[idx] = { threadId, role };
          } else {
            next.push({ threadId, role });
          }
        }
        return { capturedThreads: next };
      }),
    setInspectedThreadId: (inspectedThreadId) => set({ inspectedThreadId }),
    setMaxLogLines: (maxLogLines) => {
      localStorage.setItem("vn_textractor_max_log_lines", String(maxLogLines));
      set({ maxLogLines });
    },
    setThreadLogs: (logsOrFn) =>
      set((state) => {
        const next = typeof logsOrFn === "function" ? logsOrFn(state.threadLogs) : logsOrFn;
        return { threadLogs: new Map(next) };
      }),
    setIgnoreDuplicateLines: (ignoreDuplicateLines) => {
      localStorage.setItem("vn_ignore_duplicate_lines", String(ignoreDuplicateLines));
      set({ ignoreDuplicateLines });
    },
    setCharDeduplicationCount: (charDeduplicationCount) => {
      const count = Math.max(0, Math.min(10, charDeduplicationCount || 0));
      localStorage.setItem("vn_textractor_char_dedup_count", String(count));
      set({ charDeduplicationCount: count });
    },
    setLoopDeduplication: (loopDeduplication) => {
      localStorage.setItem("vn_textractor_loop_dedup", String(loopDeduplication));
      set({ loopDeduplication });
    },
    setStutterReduction: (stutterReduction) => {
      localStorage.setItem("vn_textractor_stutter_reduction", String(stutterReduction));
      set({ stutterReduction });
    },
    setLatestSpeaker: (latestSpeaker) => set({ latestSpeaker }),
    setLatestMessage: (latestMessage) => set({ latestMessage }),
    setLatestRawMessage: (latestRawMessage) => set({ latestRawMessage }),
    setAutoForwardToOverlay: (autoForwardToOverlay) => {
      localStorage.setItem("vn_textractor_auto_forward", String(autoForwardToOverlay));
      set({ autoForwardToOverlay });
    },
    resetTextractor: () =>
      set({
        isHooked: false,
        isAttaching: false,
        attachedPid: null,
        hookError: null,
        threads: new Map(),
        combinedThreadId: null,
        messageThreadId: null,
        speakerThreadId: null,
        capturedThreads: [],
        inspectedThreadId: null,
        threadLogs: new Map(),
        latestSpeaker: "",
        latestMessage: "",
        latestRawMessage: "",
      }),
  };
});
