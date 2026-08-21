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

export const useSettingsStore = create<SettingsStoreState>((set) => {
  // Sync state when settingsManager notifies
  settingsManager.subscribe((newSettings) => {
    set({ settings: newSettings });
  });

  return {
    settings: settingsManager.getSettings(),
    updateGeneral: (partial) => {
      settingsManager.updateGeneral(partial);
      set({ settings: settingsManager.getSettings() });
    },
    updateTranslation: (partial) => {
      settingsManager.updateTranslation(partial);
      set({ settings: settingsManager.getSettings() });
    },
    updateGlossary: (partial) => {
      settingsManager.updateGlossary(partial);
      set({ settings: settingsManager.getSettings() });
    },
    updateOverlay: (partial) => {
      settingsManager.updateOverlay(partial);
      set({ settings: settingsManager.getSettings() });
    },
    updateTextPreprocessing: (partial) => {
      settingsManager.updateTextPreprocessing(partial);
      set({ settings: settingsManager.getSettings() });
    },
    updateLogs: (partial) => {
      settingsManager.updateLogs(partial);
      set({ settings: settingsManager.getSettings() });
    },
    resetSettings: (category) => {
      settingsManager.resetSettings(category);
      set({ settings: settingsManager.getSettings() });
    },
  };
});
