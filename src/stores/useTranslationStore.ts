import { create } from "zustand";
import { TranslationLogItem } from "../types";
import { LlmContextSettings } from "../services/translationManager";
import { scriptManagerService } from "../services/scriptManagerService";

export interface TranslationState {
  liveLogs: TranslationLogItem[];
  isPaused: boolean;
  selectedProvider: string;
  useScriptOnly: boolean;
  scriptThreshold: number;
  contextSettings: LlmContextSettings;
  contextHistoryLength: number;

  // Actions
  addLiveLog: (item: TranslationLogItem) => void;
  setLiveLogs: (logs: TranslationLogItem[]) => void;
  clearLiveLogs: () => void;
  setIsPaused: (isPaused: boolean) => void;
  setSelectedProvider: (provider: string) => void;
  setUseScriptOnly: (useScriptOnly: boolean) => void;
  setScriptThreshold: (threshold: number) => void;
  setContextSettings: (settings: LlmContextSettings) => void;
  setContextHistoryLength: (len: number) => void;
}

export const useTranslationStore = create<TranslationState>((set) => {
  const savedProvider = localStorage.getItem("vn_selected_model") || "mt:google-translate";
  const savedUseScriptOnly = localStorage.getItem("vn_use_script_only") === "true";
  const savedThreshold = scriptManagerService.getMatchThreshold();
  const savedMax = parseInt(localStorage.getItem("vn_llm_max_context_lines") || "10", 10);
  const savedRetain = parseInt(localStorage.getItem("vn_llm_retain_context_lines") || "3", 10);
  const savedMaxChars = parseInt(localStorage.getItem("vn_max_chars_per_line") || "250", 10);

  const initialContext: LlmContextSettings = {
    maxContextLines: isNaN(savedMax) || savedMax < 1 ? 10 : savedMax,
    retainContextLines: isNaN(savedRetain) || savedRetain < 1 ? 3 : savedRetain,
    maxCharsPerLine: isNaN(savedMaxChars) ? 250 : savedMaxChars,
  };

  return {
    liveLogs: [],
    isPaused: false,
    selectedProvider: savedProvider,
    useScriptOnly: savedUseScriptOnly,
    scriptThreshold: savedThreshold,
    contextSettings: initialContext,
    contextHistoryLength: 0,

    addLiveLog: (item) =>
      set((state) => ({
        liveLogs: [item, ...state.liveLogs].slice(0, 250),
      })),
    setLiveLogs: (liveLogs) => set({ liveLogs }),
    clearLiveLogs: () => set({ liveLogs: [] }),
    setIsPaused: (isPaused) => set({ isPaused }),
    setSelectedProvider: (selectedProvider) => {
      localStorage.setItem("vn_selected_model", selectedProvider);
      set({ selectedProvider });
    },
    setUseScriptOnly: (useScriptOnly) => {
      localStorage.setItem("vn_use_script_only", String(useScriptOnly));
      set({ useScriptOnly });
    },
    setScriptThreshold: (scriptThreshold) => {
      scriptManagerService.setMatchThreshold(scriptThreshold);
      set({ scriptThreshold });
    },
    setContextSettings: (contextSettings) => {
      localStorage.setItem("vn_llm_max_context_lines", String(contextSettings.maxContextLines));
      localStorage.setItem("vn_llm_retain_context_lines", String(contextSettings.retainContextLines));
      localStorage.setItem("vn_max_chars_per_line", String(contextSettings.maxCharsPerLine));
      set({ contextSettings });
    },
    setContextHistoryLength: (contextHistoryLength) => set({ contextHistoryLength }),
  };
});
