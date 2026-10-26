import { create } from "zustand";
import {
  AppSettings,
  GeneralSettings,
  TranslationSettings,
  GlossarySettings,
  OverlaySettings,
  TextPreprocessingSettings,
  LogSettings,
  settingsManager,
} from "../services/settingsManager";
import { StoredProviderConfig } from "../services/providers/llmProviderRegistry";
import { BatchSettings } from "../types";

export interface SettingsStoreState {
  settings: AppSettings;
  updateGeneral: (general: Partial<GeneralSettings>) => void;
  updateTranslation: (translation: Partial<TranslationSettings>) => void;
  updateGlossary: (glossary: Partial<GlossarySettings>) => void;
  updateOverlay: (overlay: Partial<OverlaySettings>) => void;
  updateTextPreprocessing: (tp: Partial<TextPreprocessingSettings>) => void;
  updateLogs: (logs: Partial<LogSettings>) => void;
  updateBatch: (batch: Partial<BatchSettings>) => void;
  updateLlmProvider: (config: StoredProviderConfig) => Promise<void>;
  setLlmApiKey: (providerId: string, apiKey: string) => Promise<void>;
  resetSettings: (category?: keyof AppSettings) => Promise<void>;
}

let isSubscribed = false;
let unsubscribeSettingsManager: (() => void) | null = null;

export function setupSettingsStoreSubscription(set: (state: Partial<SettingsStoreState>) => void) {
  if (!isSubscribed) {
    isSubscribed = true;
    unsubscribeSettingsManager = settingsManager.subscribe((newSettings) => {
      set({ settings: newSettings });
    });
  }
}

export function cleanupSettingsStoreSubscription() {
  if (unsubscribeSettingsManager) {
    unsubscribeSettingsManager();
    unsubscribeSettingsManager = null;
    isSubscribed = false;
  }
}

export const useSettingsStore = create<SettingsStoreState>((set) => {
  setupSettingsStoreSubscription(set);

  return {
    settings: settingsManager.getSettings(),
    updateGeneral: (partial) => {
      settingsManager.updateGeneral(partial);
    },
    updateTranslation: (partial) => {
      settingsManager.updateTranslation(partial);
    },
    updateGlossary: (partial) => {
      settingsManager.updateGlossary(partial);
    },
    updateOverlay: (partial) => {
      settingsManager.updateOverlay(partial);
    },
    updateTextPreprocessing: (partial) => {
      settingsManager.updateTextPreprocessing(partial);
    },
    updateLogs: (partial) => {
      settingsManager.updateLogs(partial);
    },
    updateBatch: (partial) => {
      settingsManager.updateBatch(partial);
    },
    updateLlmProvider: async (config) => {
      await settingsManager.saveLlmProvider(config);
    },
    setLlmApiKey: async (providerId, apiKey) => {
      await settingsManager.setLlmApiKey(providerId, apiKey);
    },
    resetSettings: (category) => settingsManager.resetSettings(category),
  };
});
