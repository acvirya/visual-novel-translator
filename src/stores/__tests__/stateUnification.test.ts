import { describe, it, expect, beforeEach } from "vitest";
import { settingsManager } from "../../services/settingsManager";
import { useTranslationStore } from "../useTranslationStore";
import { useBatchStore } from "../useBatchStore";
import { useSettingsStore } from "../useSettingsStore";

describe("State Management & Service Unification", () => {
  beforeEach(() => {
    settingsManager.resetSettings();
  });

  it("synchronizes useTranslationStore when settingsManager updates translation settings", () => {
    // Initial state check
    expect(useTranslationStore.getState().selectedProvider).toBe("mt:google-translate");

    // Update settings via settingsManager
    settingsManager.updateTranslation({
      liveModel: "deepseek:deepseek-reasoner",
      reasoningEffort: "high",
      useScriptOnly: true,
      maxContextLines: 15,
      temperature: 0.5,
    });

    const state = useTranslationStore.getState();
    expect(state.selectedProvider).toBe("deepseek:deepseek-reasoner");
    expect(state.reasoningEffort).toBe("high");
    expect(state.useScriptOnly).toBe(true);
    expect(state.contextSettings.maxContextLines).toBe(15);
    expect(settingsManager.getTemperature()).toBe(0.5);
  });

  it("synchronizes useBatchStore when settingsManager updates batch settings", () => {
    settingsManager.updateBatch({
      modelId: "anthropic:claude-3-5-sonnet",
      concurrency: 4,
      temperature: 0.2,
      maxBatchContext: 5,
    });

    const batchState = useBatchStore.getState();
    expect(batchState.settings.modelId).toBe("anthropic:claude-3-5-sonnet");
    expect(batchState.settings.concurrency).toBe(4);
    expect(batchState.settings.temperature).toBe(0.2);
    expect(batchState.settings.maxBatchContext).toBe(5);
  });

  it("synchronizes useSettingsStore reactively on any category update", () => {
    settingsManager.updateGeneral({
      sourceLang: "zh",
      targetLang: "id",
    });

    const settingsState = useSettingsStore.getState();
    expect(settingsState.settings.general.sourceLang).toBe("zh");
    expect(settingsState.settings.general.targetLang).toBe("id");
  });
});
