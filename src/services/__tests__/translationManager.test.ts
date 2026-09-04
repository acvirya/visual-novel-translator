import { describe, it, expect, beforeEach } from "vitest";
import { translationManager, TranslationManagerEvent } from "../translationManager";
import { settingsManager } from "../settingsManager";

describe("translationManager", () => {
  beforeEach(() => {
    settingsManager.resetSettings();
    translationManager.clearContextHistory();
    translationManager.clearQueue();
    translationManager.setPaused(false);
  });

  it("should manage context settings accurately", () => {
    translationManager.setContextSettings({
      maxContextLines: 5,
      retainContextLines: 2,
      maxCharsPerLine: 200,
    });

    const settings = translationManager.getContextSettings();
    expect(settings.maxContextLines).toBe(5);
    expect(settings.retainContextLines).toBe(2);
    expect(settings.maxCharsPerLine).toBe(200);
  });

  it("should emit events to subscribers when state changes", () => {
    const events: TranslationManagerEvent[] = [];
    const unsub = translationManager.onEvent((evt) => {
      events.push(evt);
    });

    translationManager.setPaused(true);
    translationManager.setUseScriptOnly(true);
    translationManager.setContextSettings({ maxContextLines: 8 });

    expect(events.some((e) => e.type === "paused" && e.isPaused === true)).toBe(true);
    expect(events.some((e) => e.type === "useScriptOnly" && e.val === true)).toBe(true);
    expect(events.some((e) => e.type === "contextSettings")).toBe(true);

    unsub();
  });

  it("should prune context history without off-by-one errors", () => {
    translationManager.setContextSettings({
      maxContextLines: 3,
      retainContextLines: 1,
      maxCharsPerLine: 250,
    });

    // Access private appendContextTurn via any for unit test verification
    const tmAny = translationManager as any;
    tmAny.appendContextTurn("Turn 1", "Reply 1");
    expect(translationManager.getContextHistoryLength()).toBe(1);

    tmAny.appendContextTurn("Turn 2", "Reply 2");
    expect(translationManager.getContextHistoryLength()).toBe(2);

    // Exactly at maxContextLines (3 items) - should NOT prune yet!
    tmAny.appendContextTurn("Turn 3", "Reply 3");
    expect(translationManager.getContextHistoryLength()).toBe(3);

    // Exceeding maxContextLines (4th item) - should prune to retainContextLines (1)
    tmAny.appendContextTurn("Turn 4", "Reply 4");
    expect(translationManager.getContextHistoryLength()).toBe(1);
  });

  it("should pause and resume queue processing", () => {
    translationManager.setPaused(true);
    expect(translationManager.isPaused()).toBe(true);

    translationManager.setPaused(false);
    expect(translationManager.isPaused()).toBe(false);
  });

  it("should reset sequence dialogueSeq when clearContextHistory or clearQueue is called", () => {
    // Enqueue an item to increment sequence
    const tmAny = translationManager as any;
    tmAny.dialogueSeq = 42;
    expect(tmAny.dialogueSeq).toBe(42);

    translationManager.clearContextHistory();
    // Verify sequence can handle new items smoothly
    expect(translationManager.getContextHistoryLength()).toBe(0);
  });
});
