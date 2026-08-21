import { create } from "zustand";
import { TextractorMessage, TextractorProcessInfo, TextractorThread } from "../types";
import { DEFAULT_TEXTRACTOR_PATH } from "../services/textractorService";

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
  discoveryDuration: number;
  discoverySecondsLeft: number;
  isDiscoveryActive: boolean;
  debounceMs: number;
  threads: Map<number, TextractorThread>;
  combinedThreadId: number | null;
  messageThreadId: number | null;
  speakerThreadId: number | null;
  inspectedThreadId: number | null;
  maxLogLines: number;
  threadLogs: Map<number, TextractorMessage[]>;
  ignoreDuplicateLines: boolean;
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
  setDiscoveryDuration: (dur: number) => void;
  setDiscoverySecondsLeft: (sec: number) => void;
  setIsDiscoveryActive: (active: boolean) => void;
  setDebounceMs: (ms: number) => void;
  setThreads: (threads: Map<number, TextractorThread> | ((prev: Map<number, TextractorThread>) => Map<number, TextractorThread>)) => void;
  setCombinedThreadId: (id: number | null) => void;
  setMessageThreadId: (id: number | null) => void;
  setSpeakerThreadId: (id: number | null) => void;
  setInspectedThreadId: (id: number | null) => void;
  setMaxLogLines: (lines: number) => void;
  setThreadLogs: (logs: Map<number, TextractorMessage[]> | ((prev: Map<number, TextractorMessage[]>) => Map<number, TextractorMessage[]>)) => void;
  setIgnoreDuplicateLines: (ignore: boolean) => void;
  setLatestSpeaker: (speaker: string) => void;
  setLatestMessage: (message: string) => void;
  setLatestRawMessage: (raw: string) => void;
  setAutoForwardToOverlay: (auto: boolean) => void;
  resetTextractor: () => void;
}

export const useTextractorStore = create<TextractorState>((set) => {
  const savedExePath = localStorage.getItem("vn_textractor_path") || DEFAULT_TEXTRACTOR_PATH;
  const savedArch = (localStorage.getItem("vn_textractor_arch") as "x86" | "x64") || "x86";
  const savedDebounce = Number(localStorage.getItem("vn_textractor_debounce_ms")) || 250;
  const savedMaxLogs = Number(localStorage.getItem("vn_textractor_max_log_lines")) || 100;
  const savedDiscovery = Number(localStorage.getItem("vn_textractor_discovery_duration")) || 10;
  const savedIgnoreDup = localStorage.getItem("vn_ignore_duplicate_lines") !== "false";
  const savedAutoForward = localStorage.getItem("vn_textractor_auto_forward") !== "false";

  return {
    exePath: savedExePath,
    arch: savedArch,
    processes: [],
    isLoadingProcesses: false,
    selectedPid: null,
    isHooked: false,
    isAttaching: false,
    attachedPid: null,
    hookError: null,
    discoveryDuration: savedDiscovery,
    discoverySecondsLeft: 0,
    isDiscoveryActive: false,
    debounceMs: savedDebounce,
    threads: new Map(),
    combinedThreadId: null,
    messageThreadId: null,
    speakerThreadId: null,
    inspectedThreadId: null,
    maxLogLines: savedMaxLogs,
    threadLogs: new Map(),
    ignoreDuplicateLines: savedIgnoreDup,
    latestSpeaker: "",
    latestMessage: "",
    latestRawMessage: "",
    autoForwardToOverlay: savedAutoForward,

    setExePath: (exePath) => {
      localStorage.setItem("vn_textractor_path", exePath);
      set({ exePath });
    },
    setArch: (arch) => {
      localStorage.setItem("vn_textractor_arch", arch);
      set({ arch });
    },
    setProcesses: (processes) => set({ processes }),
    setIsLoadingProcesses: (isLoadingProcesses) => set({ isLoadingProcesses }),
    setSelectedPid: (selectedPid) => set({ selectedPid }),
    setIsHooked: (isHooked) => set({ isHooked }),
    setIsAttaching: (isAttaching) => set({ isAttaching }),
    setAttachedPid: (attachedPid) => set({ attachedPid }),
    setHookError: (hookError) => set({ hookError }),
    setDiscoveryDuration: (discoveryDuration) => {
      localStorage.setItem("vn_textractor_discovery_duration", String(discoveryDuration));
      set({ discoveryDuration });
    },
    setDiscoverySecondsLeft: (discoverySecondsLeft) => set({ discoverySecondsLeft }),
    setIsDiscoveryActive: (isDiscoveryActive) => set({ isDiscoveryActive }),
    setDebounceMs: (debounceMs) => {
      localStorage.setItem("vn_textractor_debounce_ms", String(debounceMs));
      set({ debounceMs });
    },
    setThreads: (threadsOrFn) =>
      set((state) => ({
        threads: typeof threadsOrFn === "function" ? threadsOrFn(state.threads) : threadsOrFn,
      })),
    setCombinedThreadId: (combinedThreadId) => set({ combinedThreadId }),
    setMessageThreadId: (messageThreadId) => set({ messageThreadId }),
    setSpeakerThreadId: (speakerThreadId) => set({ speakerThreadId }),
    setInspectedThreadId: (inspectedThreadId) => set({ inspectedThreadId }),
    setMaxLogLines: (maxLogLines) => {
      localStorage.setItem("vn_textractor_max_log_lines", String(maxLogLines));
      set({ maxLogLines });
    },
    setThreadLogs: (logsOrFn) =>
      set((state) => ({
        threadLogs: typeof logsOrFn === "function" ? logsOrFn(state.threadLogs) : logsOrFn,
      })),
    setIgnoreDuplicateLines: (ignoreDuplicateLines) => {
      localStorage.setItem("vn_ignore_duplicate_lines", String(ignoreDuplicateLines));
      set({ ignoreDuplicateLines });
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
        inspectedThreadId: null,
        threadLogs: new Map(),
        latestSpeaker: "",
        latestMessage: "",
        latestRawMessage: "",
      }),
  };
});
