import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "../useUIStore";

describe("useUIStore", () => {
  beforeEach(() => {
    useUIStore.setState({
      currentTab: "live-game",
      isSidebarCollapsed: false,
      liveGameStage: "stream",
      liveGameInputMode: "textractor",
      batchSubTab: "preview",
      knowledgeBaseSubTab: "glossary",
      settingsSubTab: "providers",
    });
  });

  it("should initialize with default states", () => {
    const state = useUIStore.getState();
    expect(state.currentTab).toBe("live-game");
    expect(state.liveGameStage).toBe("stream");
    expect(state.liveGameInputMode).toBe("textractor");
    expect(state.batchSubTab).toBe("preview");
    expect(state.knowledgeBaseSubTab).toBe("glossary");
    expect(state.settingsSubTab).toBe("providers");
  });

  it("should update tab and subtabs accurately", () => {
    useUIStore.getState().setCurrentTab("batch-translate");
    expect(useUIStore.getState().currentTab).toBe("batch-translate");

    useUIStore.getState().setLiveGameStage("overlay");
    expect(useUIStore.getState().liveGameStage).toBe("overlay");

    useUIStore.getState().setLiveGameInputMode("ocr");
    expect(useUIStore.getState().liveGameInputMode).toBe("ocr");

    useUIStore.getState().setBatchSubTab("settings");
    expect(useUIStore.getState().batchSubTab).toBe("settings");

    useUIStore.getState().setKnowledgeBaseSubTab("script");
    expect(useUIStore.getState().knowledgeBaseSubTab).toBe("script");

    useUIStore.getState().setSettingsSubTab("logs");
    expect(useUIStore.getState().settingsSubTab).toBe("logs");
  });

  it("should toggle sidebar collapse correctly", () => {
    expect(useUIStore.getState().isSidebarCollapsed).toBe(false);

    useUIStore.getState().setIsSidebarCollapsed(true);
    expect(useUIStore.getState().isSidebarCollapsed).toBe(true);

    useUIStore.getState().setIsSidebarCollapsed((prev) => !prev);
    expect(useUIStore.getState().isSidebarCollapsed).toBe(false);
  });
});
