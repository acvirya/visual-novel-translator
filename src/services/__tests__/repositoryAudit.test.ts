import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsManager, settingsManager, DEFAULT_APP_SETTINGS } from "../settingsManager";
import { SecureStorageService } from "../secureStorageService";
import { TauriBridge } from "../tauriBridge";
import { translationManager } from "../translationManager";
import { AppContainer } from "../appContainer";
import { executeBatchLlm } from "../batch/batchLlmExecutor";
import { usageLogService } from "../usageLogService";
import { calculateOutputPath, hydrateExistingTranslationFromDisk, saveTranslatedFileToDisk, serializeBatchItemsToJsonl, type BatchFileEntry } from "../../utils/batchFileUtils";
import { redactSecrets } from "../../utils/redactSecrets";
import { ScriptManagerService } from "../scriptManagerService";
import { translateWithFreeMt } from "../freeMtService";

vi.mock("../tauriBridge", () => ({ TauriBridge: {
  loadAppSettings: vi.fn().mockResolvedValue(null), saveAppSettings: vi.fn().mockResolvedValue(undefined),
  getSecureKey: vi.fn().mockResolvedValue(null), setSecureKey: vi.fn().mockResolvedValue(undefined),
  deleteSecureKey: vi.fn().mockResolvedValue(undefined), appendDebugLog: vi.fn().mockResolvedValue(undefined),
  clearDebugLog: vi.fn().mockResolvedValue(undefined), readDebugLog: vi.fn().mockResolvedValue([]),
  saveScriptFile: vi.fn().mockResolvedValue(undefined), readScriptFileByPath: vi.fn().mockResolvedValue(null),
  llmStreamChatCompletion: vi.fn(), openrouterStreamChatCompletion: vi.fn(), cancelLlmStream: vi.fn().mockResolvedValue(undefined),
  translateFreeMt: vi.fn(),
} }));

const STORAGE_KEY = "vn_translator_universal_settings_v2";
let store: Record<string, string>;
const instances: SettingsManager[] = [];
const createManager = () => { const manager = new SettingsManager(); instances.push(manager); return manager; };

beforeEach(async () => {
  await settingsManager.ensureReady();
  vi.clearAllMocks();
  store = {};
  vi.stubGlobal("window", { location: { search: "" } });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  });
  SecureStorageService.clearInMemoryKeyring();
  settingsManager.resetSettings();
  await usageLogService.clearLogs();
});

afterEach(async () => {
  for (const manager of instances.splice(0)) await manager.dispose();
  translationManager.clearQueue();
  translationManager.setPaused(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("repository audit regressions", () => {
  it("keeps deleted OCR regions and preprocessing steps deleted after restart", async () => {
    store[STORAGE_KEY] = JSON.stringify({ ocr: { regions: [] }, textPreprocessing: { pipeline: [] } });
    const manager = createManager();
    await manager.ensureReady();
    expect(manager.getOcr().regions).toEqual([]);
    expect(manager.getTextPreprocessing().pipeline).toEqual([]);
  });

  it("recovers malformed nested settings and constrains unsafe batch values", async () => {
    store[STORAGE_KEY] = JSON.stringify({ overlay: { config: null }, batch: { concurrency: -100, linesPerBatch: 0 }, llmProviders: { bad: null } });
    const manager = createManager();
    await manager.ensureReady();
    expect(manager.getOverlay().config.width).toBeGreaterThan(0);
    expect(manager.getBatch().concurrency).toBe(1);
    expect(manager.getBatch().linesPerBatch).toBe(1);
    expect(manager.getLlmProviders().bad).toBeUndefined();
  });

  it("migrates plaintext keys to secure storage and never writes them to disk", async () => {
    store[STORAGE_KEY] = JSON.stringify({ llmProviders: { openrouter: { id: "openrouter", apiKey: "sk-legacy-private-key" } } });
    const manager = createManager();
    await manager.ensureReady();
    await manager.dispose();
    expect(await SecureStorageService.getApiKey("openrouter")).toBe("sk-legacy-private-key");
    expect(store[STORAGE_KEY]).not.toContain("sk-legacy-private-key");
    for (const [json] of vi.mocked(TauriBridge.saveAppSettings).mock.calls) expect(json).not.toContain("sk-legacy-private-key");
  });

  it("preserves the original settings when credential migration fails", async () => {
    store[STORAGE_KEY] = JSON.stringify({ llmProviders: { openrouter: { id: "openrouter", apiKey: "legacy-private-key" } } });
    vi.spyOn(SecureStorageService, "setApiKey").mockRejectedValueOnce(new Error("keyring unavailable"));
    const manager = new SettingsManager();
    await expect(manager.ensureReady()).rejects.toThrow(/could not be migrated/);
    expect(store[STORAGE_KEY]).toContain("legacy-private-key");
  });

  it("auxiliary windows cannot overwrite the main settings snapshot", async () => {
    (window.location as unknown as { search: string }).search = "?overlay=true";
    const manager = createManager();
    await manager.ensureReady();
    vi.mocked(TauriBridge.saveAppSettings).mockClear();
    manager.updateGeneral({ sourceLang: "ko" });
    await manager.dispose();
    expect(TauriBridge.saveAppSettings).not.toHaveBeenCalled();
  });

  it("failed secure writes do not report an unsaved key in active settings", async () => {
    vi.spyOn(SecureStorageService, "setApiKey").mockRejectedValueOnce(new Error("keyring unavailable"));
    await expect(settingsManager.setLlmApiKey("openrouter", "unsaved-secret")).rejects.toThrow("keyring unavailable");
    expect(settingsManager.getOpenRouterApiKey()).toBe("");
  });

  it("settles every pending promise when clearing a paused translation queue", async () => {
    translationManager.setPaused(true);
    const first = translationManager.translate({ message: "one" });
    const second = translationManager.translate({ message: "two" });
    translationManager.clearQueue();
    expect((await Promise.all([first, second])).map((result) => result.provider)).toEqual(["Cancelled", "Cancelled"]);
  });

  it("supports zero retained context without slice(-0) retaining everything", () => {
    translationManager.clearContextHistory();
    translationManager.setContextSettings({ maxContextLines: 0, retainContextLines: 0 });
    (translationManager as unknown as { appendContextTurn: (a: string, b: string) => void }).appendContextTurn("source", "target");
    expect(translationManager.getContextHistoryLength()).toBe(0);
  });

  it("does not send an OpenRouter credential to another batch provider", async () => {
    await expect(executeBatchLlm({ items: [{ id: 1, originalMessage: "hello" }], apiKey: "sk-openrouter-private-key", settings: { ...DEFAULT_APP_SETTINGS.batch, modelId: "deepseek:deepseek-chat" }, contextHistory: [], onItemSuccess: vi.fn(), abortController: new AbortController() })).rejects.toThrow(/API Key is missing/);
    expect(TauriBridge.llmStreamChatCompletion).not.toHaveBeenCalled();
  });

  it("initializes each service only once across simultaneous init calls", async () => {
    const container = new AppContainer();
    const init = vi.fn().mockResolvedValue(undefined);
    container.register({ id: "test", init });
    await Promise.all([container.init(), container.init(), container.init()]);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it("redacts nested credentials, auth URLs, errors and circular metadata", () => {
    const details: Record<string, unknown> = { apiKey: "private", nested: { authorization: "Bearer private" }, error: new Error("GET https://example.test?key=private") };
    details.self = details;
    const json = JSON.stringify(redactSecrets(details));
    expect(json).not.toContain("private");
    expect(json).toContain("[Circular]");
  });

  it("escapes CSV quote delimiters and spreadsheet formulas", () => {
    usageLogService.recordLog({ mode: "live", modelId: '=HYPERLINK("https://example.test")', provider: 'A"B', status: "completed", cost: 0, latencyMs: Infinity, promptTokens: Infinity, completionTokens: -10 });
    const csv = usageLogService.exportAsCsv();
    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');
    expect(csv).toContain('"A""B"');
    expect(usageLogService.getSummaryStats().totalTokens).toBe(0);
  });

  it("preserves raw script text by default and rejects output suffix traversal", () => {
    const text = "  raw source  ";
    expect(JSON.parse(serializeBatchItemsToJsonl([{ id: 1, originalMessage: text }])).message).toBe(text);
    expect(calculateOutputPath("chapter.txt")).toBe("chapter_translated.jsonl");
    expect(() => calculateOutputPath("chapter.txt", "output", "/../escape")).toThrow(/suffix/);
  });

  it("propagates failed disk writes instead of declaring a successful save", async () => {
    vi.mocked(TauriBridge.saveScriptFile).mockRejectedValueOnce(new Error("disk full"));
    await expect(saveTranslatedFileToDisk({ path: "chapter.txt", name: "chapter", items: [] } as unknown as BatchFileEntry, DEFAULT_APP_SETTINGS.batch)).rejects.toThrow("disk full");
  });

  it("does not hydrate a changed source line from an old translation with the same ID", async () => {
    vi.mocked(TauriBridge.readScriptFileByPath).mockResolvedValueOnce(JSON.stringify({ id: 1, message: "old source", translated_message: "old translation" }));
    const file = { path: "chapter.txt", items: [{ id: 1, originalMessage: "new source" }], totalLines: 1 } as BatchFileEntry;
    await hydrateExistingTranslationFromDisk(file);
    expect(file.items[0].translatedMessage).toBeUndefined();
  });

  it("does not send text to Google when the selected DeepL request fails", async () => {
    vi.mocked(TauriBridge.translateFreeMt).mockRejectedValueOnce(new Error("DeepL unavailable"));
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await translateWithFreeMt({ message: "private dialogue", provider: "deepl" });
    expect(result.success).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retries failed native Google MT with the same provider via webview fetch", async () => {
    vi.mocked(TauriBridge.translateFreeMt).mockRejectedValueOnce(new Error("native network error"));
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [[["Hello world!", "original"]]] });
    vi.stubGlobal("fetch", fetch);
    const result = await translateWithFreeMt({ message: "original", provider: "google" });
    expect(result.success).toBe(true);
    expect(result.translatedMessage).toBe("Hello world!");
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("translate.googleapis.com"), expect.anything());
  });

  it("does not return the original text as a translation after MT fails", async () => {
    vi.mocked(TauriBridge.translateFreeMt).mockRejectedValueOnce(new Error("native offline"));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("webview offline")));
    const result = await translateWithFreeMt({ message: "source text", provider: "google" });
    expect(result.success).toBe(false);
    expect(result.translatedMessage).toBe("");
    expect(result.error).toContain("offline");
  });

  it("does not rewrite a script just by opening it or adjusting matching preferences", async () => {
    const manager = new ScriptManagerService();
    manager.openScriptContent("chapter.json", "chapter.json", '[{"id":1,"message":"original"}]');
    manager.setMatchThreshold(0.9);
    manager.setAutoAppend(false);
    await manager.dispose();
    expect(TauriBridge.saveScriptFile).not.toHaveBeenCalled();
  });

  it("keeps non-native imports in memory until explicitly exported", async () => {
    const manager = new ScriptManagerService();
    manager.openScriptContent("chapter.txt", "chapter.txt", "hello");
    manager.addEntry({ message: "new line", translated_message: "translation" });
    await manager.dispose();
    expect(manager.getState().canAutoSave).toBe(false);
    expect(TauriBridge.saveScriptFile).not.toHaveBeenCalled();
  });

  it("flushes a pending write to its original file when switching scripts", async () => {
    const manager = new ScriptManagerService();
    manager.openScriptContent("first.jsonl", "first.jsonl", "");
    manager.addEntry({ message: "first source", translated_message: "first translation" });
    manager.openScriptContent("second.jsonl", "second.jsonl", '{"message":"second source"}');
    await manager.dispose();
    expect(TauriBridge.saveScriptFile).toHaveBeenCalledTimes(1);
    expect(TauriBridge.saveScriptFile).toHaveBeenCalledWith("first.jsonl", expect.stringContaining("first source"));
  });

  it("does not let a delayed startup read replace a newly opened script", async () => {
    store.vn_active_script_filepath = "old.jsonl";
    store.vn_active_script_filename = "old.jsonl";
    let finishRead!: (content: string) => void;
    vi.mocked(TauriBridge.readScriptFileByPath).mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve; }));
    const manager = new ScriptManagerService();
    manager.openScriptContent("new.jsonl", "new.jsonl", '{"message":"new source"}');
    finishRead('{"message":"old source"}');
    await manager.init();
    expect(manager.getState().activeFileName).toBe("new.jsonl");
    expect(manager.getState().entries[0].message).toBe("new source");
    await manager.dispose();
  });

  it("refreshes settings and credentials when an auxiliary window is reopened", async () => {
    (window.location as unknown as { search: string }).search = "?regionSelector=true";
    const manager = createManager();
    await manager.ensureReady();
    store[STORAGE_KEY] = JSON.stringify({ general: { targetLang: "id" } });
    await SecureStorageService.setApiKey("openrouter", "updated-private-key");
    await manager.refreshAuxiliarySettings();
    expect(manager.getGeneral().targetLang).toBe("id");
    expect(manager.getOpenRouterApiKey()).toBe("updated-private-key");
  });
});
