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

export interface SettingsStoreState {
  settings: AppSettings;
  updateGeneral: (general: Partial<GeneralSettings>) => void;
  updateTranslation: (translation: Partial<TranslationSettings>) => void;
  updateGlossary: (glossary: Partial<GlossarySettings>) => void;
  updateOverlay: (overlay: Partial<OverlaySettings>) => void;
  updateTextPreprocessing: (tp: Partial<TextPreprocessingSettings>) => void;
  updateLogs: (logs: Partial<LogSettings>) => void;
  resetSettings: (category?: keyof AppSettings) => void;
}

let isSubscribed = false;

export const useSettingsStore = create<SettingsStoreState>((set) => {
  // Single idempotent subscription: settingsManager.notifyListeners() will automatically update this store
  if (!isSubscribed) {
    isSubscribed = true;
    settingsManager.subscribe((newSettings) => {
      set({ settings: newSettings });
    });
  }

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
    resetSettings: (category) => {
      settingsManager.resetSettings(category);
    },
  };
});
