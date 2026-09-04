import { create } from "zustand";
import { TranslationLogItem, ReasoningEffort, SessionUsageStats } from "../types";
import { translationManager, LlmContextSettings } from "../services/translationManager";
import { scriptManagerService } from "../services/scriptManagerService";
import { settingsManager } from "../services/settingsManager";

export interface TranslationState {
  liveLogs: TranslationLogItem[];
  isPaused: boolean;
  selectedProvider: string;
  reasoningEffort: ReasoningEffort;
  useScriptOnly: boolean;
  scriptThreshold: number;
  contextSettings: LlmContextSettings;
  contextHistoryLength: number;
  sessionStats: SessionUsageStats;

  // Actions
  addLiveLog: (item: TranslationLogItem) => void;
  setLiveLogs: (logs: TranslationLogItem[]) => void;
  clearLiveLogs: () => void;
  setIsPaused: (isPaused: boolean) => void;
  setSelectedProvider: (provider: string) => void;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  setUseScriptOnly: (useScriptOnly: boolean) => void;
  setScriptThreshold: (threshold: number) => void;
  setContextSettings: (settings: LlmContextSettings) => void;
  setContextHistoryLength: (len: number) => void;
  incrementSessionUsage: (promptTokens: number, completionTokens: number, cachedTokens: number, cost: number) => void;
  resetSessionStats: () => void;
}

let isTranslationManagerSubscribed = false;
let isSettingsManagerSubscribed = false;

export const useTranslationStore = create<TranslationState>((set) => {
  const translationSettings = settingsManager.getTranslation();
  const savedThreshold = scriptManagerService.getMatchThreshold();

  const initialContext: LlmContextSettings = {
    maxContextLines: translationSettings.maxContextLines || 10,
    retainContextLines: translationSettings.retainContextLines || 3,
    maxCharsPerLine: translationSettings.maxCharsPerLine || 250,
  };

  if (!isSettingsManagerSubscribed) {
    isSettingsManagerSubscribed = true;
    settingsManager.subscribe((newSettings) => {
      const liveModel = newSettings.translation.liveModel || newSettings.translation.activeProviderId || "mt:google-translate";
      const effort = newSettings.translation.reasoningEffort || "default";
      const scriptOnly = newSettings.translation.useScriptOnly ?? false;
      const ctx: LlmContextSettings = {
        maxContextLines: newSettings.translation.maxContextLines || 10,
        retainContextLines: newSettings.translation.retainContextLines || 3,
        maxCharsPerLine: newSettings.translation.maxCharsPerLine || 250,
      };

      set({
        selectedProvider: liveModel,
        reasoningEffort: effort,
        useScriptOnly: scriptOnly,
        contextSettings: ctx,
      });
    });
  }

  if (!isTranslationManagerSubscribed) {
    isTranslationManagerSubscribed = true;
    translationManager.onEvent((event) => {
      switch (event.type) {
        case "log":
          set((state) => ({
            liveLogs: [event.item, ...state.liveLogs].slice(0, 250),
          }));
          break;
        case "sessionUsage":
          set((state) => ({
            sessionStats: {
              promptTokens: state.sessionStats.promptTokens + event.promptTokens,
              completionTokens: state.sessionStats.completionTokens + event.completionTokens,
              cachedTokens: state.sessionStats.cachedTokens + event.cachedTokens,
              totalCost: state.sessionStats.totalCost + event.cost,
            },
          }));
          break;
        case "paused":
          set({ isPaused: event.isPaused });
          break;
        case "contextLength":
          set({ contextHistoryLength: event.length });
          break;
        case "contextSettings":
          set({ contextSettings: event.settings });
          break;
        case "useScriptOnly":
          set({ useScriptOnly: event.val });
          break;
      }
    });
  }

  return {
    liveLogs: [],
    isPaused: false,
    selectedProvider: translationSettings.liveModel || translationSettings.activeProviderId || "mt:google-translate",
    reasoningEffort: translationSettings.reasoningEffort || "default",
    useScriptOnly: translationSettings.useScriptOnly || false,
    scriptThreshold: savedThreshold,
    contextSettings: initialContext,
    contextHistoryLength: 0,
    sessionStats: {
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      totalCost: 0,
    },

    addLiveLog: (item) =>
      set((state) => ({
        liveLogs: [item, ...state.liveLogs].slice(0, 250),
      })),
    setLiveLogs: (liveLogs) => set({ liveLogs }),
    clearLiveLogs: () => set({ liveLogs: [] }),
    setIsPaused: (isPaused) => {
      translationManager.setPaused(isPaused);
      set({ isPaused });
    },
    setSelectedProvider: (selectedProvider) => {
      settingsManager.updateTranslation({ liveModel: selectedProvider, activeProviderId: selectedProvider });
      set({ selectedProvider });
    },
    setReasoningEffort: (reasoningEffort) => {
      settingsManager.updateTranslation({ reasoningEffort });
      set({ reasoningEffort });
    },
    setUseScriptOnly: (useScriptOnly) => {
      translationManager.setUseScriptOnly(useScriptOnly);
      set({ useScriptOnly });
    },
    setScriptThreshold: (scriptThreshold) => {
      scriptManagerService.setMatchThreshold(scriptThreshold);
      set({ scriptThreshold });
    },
    setContextSettings: (contextSettings) => {
      translationManager.setContextSettings(contextSettings);
      set({ contextSettings });
    },
    setContextHistoryLength: (contextHistoryLength) => set({ contextHistoryLength }),
    incrementSessionUsage: (promptTokens, completionTokens, cachedTokens, cost) =>
      set((state) => ({
        sessionStats: {
          promptTokens: state.sessionStats.promptTokens + promptTokens,
          completionTokens: state.sessionStats.completionTokens + completionTokens,
          cachedTokens: state.sessionStats.cachedTokens + cachedTokens,
          totalCost: state.sessionStats.totalCost + cost,
        },
      })),
    resetSessionStats: () =>
      set({
        sessionStats: {
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: 0,
          totalCost: 0,
        },
      }),
  };
});
