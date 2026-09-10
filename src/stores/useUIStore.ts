import { create } from "zustand";
import { NavigationTab } from "../types";

export type LivePipelineStage = "input" | "stream" | "overlay";
export type LiveInputMode = "textractor" | "ocr";
export type BatchSubTab = "preview" | "settings";
export type KnowledgeBaseSubTab = "glossary" | "script";
export type SettingsSubTab = "providers" | "custom_rules" | "general";
export type LogsSubTab = "usage" | "system";

export interface UIState {
  currentTab: NavigationTab;
  isSidebarCollapsed: boolean;
  liveGameStage: LivePipelineStage;
  liveGameInputMode: LiveInputMode;
  batchSubTab: BatchSubTab;
  knowledgeBaseSubTab: KnowledgeBaseSubTab;
  settingsSubTab: SettingsSubTab;
  logsSubTab: LogsSubTab;

  // Actions
  setCurrentTab: (tab: NavigationTab) => void;
  setIsSidebarCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  setLiveGameStage: (stage: LivePipelineStage) => void;
  setLiveGameInputMode: (mode: LiveInputMode) => void;
  setBatchSubTab: (tab: BatchSubTab) => void;
  setKnowledgeBaseSubTab: (tab: KnowledgeBaseSubTab) => void;
  setSettingsSubTab: (tab: SettingsSubTab) => void;
  setLogsSubTab: (tab: LogsSubTab) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentTab: "live-game",
  isSidebarCollapsed: false,
  liveGameStage: "stream",
  liveGameInputMode: "textractor",
  batchSubTab: "preview",
  knowledgeBaseSubTab: "glossary",
  settingsSubTab: "providers",
  logsSubTab: "usage",

  setCurrentTab: (currentTab) => set({ currentTab }),
  setIsSidebarCollapsed: (val) =>
    set((state) => ({
      isSidebarCollapsed: typeof val === "function" ? val(state.isSidebarCollapsed) : val,
    })),
  setLiveGameStage: (liveGameStage) => set({ liveGameStage }),
  setLiveGameInputMode: (liveGameInputMode) => set({ liveGameInputMode }),
  setBatchSubTab: (batchSubTab) => set({ batchSubTab }),
  setKnowledgeBaseSubTab: (knowledgeBaseSubTab) => set({ knowledgeBaseSubTab }),
  setSettingsSubTab: (settingsSubTab) => set({ settingsSubTab }),
  setLogsSubTab: (logsSubTab) => set({ logsSubTab }),
}));
