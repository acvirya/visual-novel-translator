import { cloneDeep } from "lodash-es";
import { z } from "zod";
import {
  OverlayConfig,
  OcrRegion,
  OcrStabilityConfig,
  PreprocessingStep,
  GlossaryEntry,
  ReasoningEffort,
  BatchSettings,
} from "../types";
import { DEFAULT_PREPROCESSING_PIPELINE, invalidateCustomRulesCache, registerCustomRulesProvider } from "../utils/textPreprocessor";
import { OVERLAY_PRESETS, TemplatePreset } from "../constants/overlayPresets";
import { StoredProviderConfig } from "./providers/llmProviderRegistry";
import { SecureStorageService } from "./secureStorageService";
import { TauriBridge } from "./tauriBridge";
import type { ManagedService } from "./appContainer";
import { sanitizeSettings } from "./settingsValidation";
import { hasConnectedOpenAiAccount, type OpenAiAuthStatus } from "../types/openaiAuth";

export interface GeneralSettings {
  sourceLang: string;
  targetLang: string;
  theme?: "dark" | "light" | "system";
  autoStartWithWindows: boolean;
  minimizeToTray: boolean;
  globalHotkeysEnabled?: boolean;
  hotkeyLockOverlay: string;
  hotkeyTogglePause: string;
  hotkeyOcrScan: string;
  hotkeyOcrSnipping: string;
}

export interface TranslationSettings {
  activeProviderId: string;
  liveModel: string;
  manualModel: string;
  batchModel: string;
  useScriptOnly: boolean;
  maxContextLines: number;
  retainContextLines: number;
  maxCharsPerLine: number;
  reasoningEffort: ReasoningEffort;
  reasoningMaxTokens: number;
  excludeReasoning: boolean;
  temperature?: number;
  starredModelIds?: string[];
}

export interface GlossarySettings {
  terms: GlossaryEntry[];
  matchCriteria: "exact" | "case-insensitive" | "fuzzy" | "regex";
  fuzzyThreshold: number;
}

export interface ScriptManagerSettings {
  activeScriptPath?: string;
  matchCriteria: "exact" | "normalized" | "fuzzy" | "regex";
  fuzzyThreshold: number;
  autoReloadOnStartup: boolean;
}

export interface TextractorSettings {
  executablePath: string;
  pollIntervalMs: number;
  flushIntervalMs: number;
  threadBufferSize: number;
  autoAttachProcessName?: string;
  enableAutoAttach: boolean;
  maxLogLines?: number;
  ignoreDuplicateLines?: boolean;
  charDeduplicationCount?: number;
  loopDeduplication?: boolean;
  stutterReduction?: boolean;
  autoForwardToOverlay?: boolean;
  maxCharsPerPass?: number; // Anti-skip burst character limit (default 250)
}

export interface OcrSettings {
  customPath: string;
  targetMonitor: string;
  regions: OcrRegion[];
  scalePercent: number;
  scanInterval: number;
  autoForwardToOverlay: boolean;
  ignoreDuplicates: boolean;
  stability: OcrStabilityConfig;
}

export interface OverlaySettings {
  config: OverlayConfig;
  userCustomPresets: TemplatePreset[];
}

export interface TextPreprocessingSettings {
  pipeline: PreprocessingStep[];
}

export interface LogSettings {
  filterLevel: "all" | "info" | "warn" | "error";
  autoScroll: boolean;
  maxPersistedLines: number;
}

export const DEFAULT_BATCH_SETTINGS: BatchSettings = {
  linesPerBatch: 10,
  maxBatchContext: 1,
  retainBatchContext: 1,
  concurrency: 2,
  modelId: "openai/gpt-4o-mini",
  temperature: 0.3,
  delayMs: 1500,
  timeoutMinutes: 10,
  maxBackoffSeconds: 30,
  autoContinueUntilCompleted: false,
  translateExplicitOnly: false,
  overrideRawWithPreprocessed: false,
  reasoningEffort: "default",
  outputDir: "",
  fileSuffix: "_translated",
};

export const DEFAULT_LLM_PROVIDERS: Record<string, StoredProviderConfig> = {
  openrouter: { id: "openrouter", apiKey: "", baseUrl: "https://openrouter.ai/api/v1" },
  deepseek: { id: "deepseek", apiKey: "", baseUrl: "https://api.deepseek.com" },
  anthropic: { id: "anthropic", apiKey: "", baseUrl: "https://api.anthropic.com" },
  google: { id: "google", apiKey: "", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  openai: { id: "openai", apiKey: "", baseUrl: "https://api.openai.com/v1" },
  groq: { id: "groq", apiKey: "", baseUrl: "https://api.groq.com/openai/v1" },
  xai: { id: "xai", apiKey: "", baseUrl: "https://api.x.ai/v1" },
  nvidia: { id: "nvidia", apiKey: "", baseUrl: "https://integrate.api.nvidia.com/v1" },
  huggingface: { id: "huggingface", apiKey: "", baseUrl: "https://router.huggingface.co/v1" },
  xiaomi: { id: "xiaomi", apiKey: "", baseUrl: "https://api.xiaomimimo.com/v1" },
  zai: { id: "zai", apiKey: "", baseUrl: "https://api.z.ai/api/coding/paas/v4" },
  "github-copilot": { id: "github-copilot", apiKey: "", baseUrl: "https://api.individual.githubcopilot.com" },
  "google-vertex": { id: "google-vertex", apiKey: "", baseUrl: "https://aiplatform.googleapis.com/v1" },
  deepl: { id: "deepl", apiKey: "", baseUrl: "https://api-free.deepl.com/v2" },
  custom: { id: "custom", apiKey: "", baseUrl: "http://localhost:11434/v1" },
};

export interface AppSettings {
  general: GeneralSettings;
  translation: TranslationSettings;
  glossary: GlossarySettings;
  scriptManager: ScriptManagerSettings;
  textractor: TextractorSettings;
  ocr: OcrSettings;
  overlay: OverlaySettings;
  textPreprocessing: TextPreprocessingSettings;
  logs: LogSettings;
  batch: BatchSettings;
  llmProviders: Record<string, StoredProviderConfig>;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  general: {
    sourceLang: "ja",
    targetLang: "en",
    theme: "dark",
    autoStartWithWindows: false,
    minimizeToTray: true,
    globalHotkeysEnabled: true,
    hotkeyLockOverlay: "Alt+L",
    hotkeyTogglePause: "Alt+P",
    hotkeyOcrScan: "Alt+O",
    hotkeyOcrSnipping: "Alt+S",
  },
  translation: {
    activeProviderId: "mt:google-translate",
    liveModel: "mt:google-translate",
    manualModel: "mt:google-translate",
    batchModel: "openai/gpt-4o-mini",
    useScriptOnly: false,
    maxContextLines: 10,
    retainContextLines: 5,
    maxCharsPerLine: 250,
    reasoningEffort: "default",
    reasoningMaxTokens: 0,
    excludeReasoning: false,
    temperature: 0.3,
  },
  glossary: {
    terms: [],
    matchCriteria: "exact",
    fuzzyThreshold: 0.85,
  },
  scriptManager: {
    activeScriptPath: "",
    matchCriteria: "normalized",
    fuzzyThreshold: 0.85,
    autoReloadOnStartup: true,
  },
  textractor: {
    executablePath: "",
    pollIntervalMs: 50,
    flushIntervalMs: 150,
    threadBufferSize: 100,
    autoAttachProcessName: "",
    enableAutoAttach: false,
    maxLogLines: 200,
    ignoreDuplicateLines: true,
    charDeduplicationCount: 3,
    loopDeduplication: true,
    stutterReduction: true,
    autoForwardToOverlay: false,
    maxCharsPerPass: 250,
  },
  ocr: {
    customPath: "",
    targetMonitor: "monitor_1",
    regions: [
      {
        id: "region_1",
        name: "Region 1 (Dialogue)",
        role: "dialogue",
        x: 350,
        y: 750,
        width: 1220,
        height: 250,
        color: "#4e73df",
      },
      {
        id: "region_2",
        name: "Region 2 (Speaker)",
        role: "speaker",
        x: 350,
        y: 690,
        width: 320,
        height: 55,
        color: "#f6c23e",
      },
    ],
    scalePercent: 100,
    scanInterval: 350,
    autoForwardToOverlay: true,
    ignoreDuplicates: true,
    stability: {
      enableMotionDetection: true,
      settleTimeMs: 250,
      motionSensitivity: 3,
      ignoreBlinkingPrompt: true,
    },
  },
  overlay: {
    config: {
      isEnabled: false,
      targetMonitor: "monitor_1",
      isClickThrough: true,
      isExcludedFromCapture: true,
      x: 140,
      y: 760,
      width: 1100,
      height: 130,
      maxExpandRatio: 2.0,
      fontSize: 20,
      speakerFontSize: 16,
      messageFontSize: 20,
      fontColor: "#FFFFFF",
      outlineColor: "#000000",
      outlineWidth: 2,
      backgroundColor: "#0D1017",
      backgroundOpacity: 0.85,
      borderRadius: 8,
      showSpeaker: true,
      showTranslatedSpeaker: true,
      showMessage: true,
      showTranslatedMessage: true,
      useCustomTemplate: false,
      templatePreset: "classic",
      customTemplateHtml: OVERLAY_PRESETS[0].html,
      customTemplateCss: OVERLAY_PRESETS[0].css,
    },
    userCustomPresets: [],
  },
  textPreprocessing: {
    pipeline: DEFAULT_PREPROCESSING_PIPELINE,
  },
  logs: {
    filterLevel: "all",
    autoScroll: true,
    maxPersistedLines: 300,
  },
  batch: DEFAULT_BATCH_SETTINGS,
  llmProviders: DEFAULT_LLM_PROVIDERS,
};

const STORAGE_KEY = "vn_translator_universal_settings_v2";

const AppSettingsSanitizerSchema = z
  .object({
    general: z.record(z.string(), z.any()).optional(),
    translation: z.record(z.string(), z.any()).optional(),
    glossary: z.record(z.string(), z.any()).optional(),
    scriptManager: z.record(z.string(), z.any()).optional(),
    textractor: z.record(z.string(), z.any()).optional(),
    ocr: z.record(z.string(), z.any()).optional(),
    overlay: z.record(z.string(), z.any()).optional(),
    textPreprocessing: z.record(z.string(), z.any()).optional(),
    logs: z.record(z.string(), z.any()).optional(),
    batch: z.record(z.string(), z.any()).optional(),
    llmProviders: z.record(z.string(), z.any()).optional(),
  })
  .passthrough();

export class SettingsManager implements ManagedService {
  public readonly id = "settingsManager";
  private cache: AppSettings;
  private listeners: Set<(settings: AppSettings) => void> = new Set();
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isSecureStorageInitialized = false;
  private readyPromise: Promise<void>;
  private secureInitPromise: Promise<void> | null = null;
  private diskSaveQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.cache = this.loadFromStorage();
    registerCustomRulesProvider(() => this.cache.textPreprocessing?.pipeline);
    this.readyPromise = this.initSecureStorage().catch((err) => {
      console.warn("[SettingsManager] Failed initial secure keys load:", err);
      throw err;
    });
  }

  public async ensureReady(): Promise<void> {
    return this.readyPromise;
  }

  public async init(): Promise<void> {
    await this.ensureReady();
  }

  public async getApiKey(providerId: string): Promise<string> {
    await this.readyPromise;
    return this.cache.llmProviders?.[providerId]?.apiKey || "";
  }

  public initSecureStorage(): Promise<void> {
    if (this.secureInitPromise) return this.secureInitPromise;
    this.secureInitPromise = this.hydrateSettings().finally(() => {
      this.secureInitPromise = null;
    });
    return this.secureInitPromise;
  }

  private async hydrateSettings(readDisk = true): Promise<void> {
    if (!this.cache.llmProviders) {
      this.cache.llmProviders = this.clone(DEFAULT_LLM_PROVIDERS);
    }
    let hasChanges = false;
    const beforeHydration = this.clone(this.cache);

    // 1. Desktop file-based persistence: sync settings from AppData if running in desktop app
    try {
      const diskContent = readDisk ? await TauriBridge.loadAppSettings() : null;
      if (diskContent) {
        const parsed = JSON.parse(diskContent);
        const validationResult = AppSettingsSanitizerSchema.safeParse(parsed);
        if (validationResult.success && validationResult.data) {
          const merged = this.mergeSettings(this.cache, validationResult.data);
          // Preserve edits made while disk I/O was pending.
          for (const key of Object.keys(beforeHydration) as (keyof AppSettings)[]) {
            if (JSON.stringify(this.cache[key]) !== JSON.stringify(beforeHydration[key])) {
              (merged as Record<keyof AppSettings, unknown>)[key] = this.cache[key];
            }
          }
          this.cache = merged;
          hasChanges = true;
        }
      } else {
        // First run on desktop: seed disk file with initial settings
        hasChanges = true;
      }
    } catch {
      // Non-Tauri fallback (e.g. webview preview or headless unit tests)
    }

    // 2. Load secure API keys from OS Keyring
    let migrationFailed = false;
    for (const pid of Object.keys(this.cache.llmProviders)) {
      const legacyKey = this.cache.llmProviders[pid].apiKey || beforeHydration.llmProviders[pid]?.apiKey;
      try {
        const secureKey = await SecureStorageService.getApiKey(pid);
        if (secureKey) {
          this.cache.llmProviders[pid].apiKey = secureKey;
          hasChanges = true;
        } else if (legacyKey) {
          await SecureStorageService.setApiKey(pid, legacyKey);
          this.cache.llmProviders[pid].apiKey = legacyKey.trim();
          hasChanges = true;
        }
      } catch (err) {
        console.warn(`[SettingsManager] Could not load secure key for ${pid}:`, err);
        if (legacyKey) migrationFailed = true;
      }
    }
    if (migrationFailed) {
      throw new Error("Saved credentials could not be migrated to secure storage. Existing settings were preserved; please check access to the system credential store and restart.");
    }
    if (SecureStorageService.isTauriEnvironment()) {
      try {
        this.applyOpenAiStatus(await TauriBridge.openAiAuthStatus());
        hasChanges = true;
      } catch (error) {
        // An unavailable OAuth store must not prevent the other providers from starting.
        const cfg = this.cache.llmProviders.openai;
        if (cfg?.authMethod === "oauth") { cfg.oauthConnected = false; cfg.isVerified = false; }
        console.warn("[SettingsManager] Could not load OpenAI sign-in status:", error);
      }
    }
    this.isSecureStorageInitialized = true;
    this.cache.overlay.config.isEnabled = false;
    if (hasChanges) {
      this.saveToStorage(true);
      this.notifyListeners();
    }
  }

  public isSecureStorageReady(): boolean {
    return this.isSecureStorageInitialized;
  }

  private clone<T>(val: T): T {
    return cloneDeep(val);
  }

  private mergeSettings(target: AppSettings, source: unknown): AppSettings {
    // Persisted arrays represent the user's complete selection, including [] and deletions.
    return sanitizeSettings(target, source);
  }

  private loadFromStorage(): AppSettings {
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
      return this.clone(DEFAULT_APP_SETTINGS);
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      let loaded: AppSettings;
      if (raw) {
        const parsed = JSON.parse(raw);
        // TD-11: Validate data structure using Zod before merging
        const validationResult = AppSettingsSanitizerSchema.safeParse(parsed);
        const safeData = validationResult.success ? validationResult.data : {};
        // Persisted arrays are complete user selections, including empty arrays.
        loaded = this.mergeSettings(DEFAULT_APP_SETTINGS, safeData);
      } else {
        loaded = this.clone(DEFAULT_APP_SETTINGS);
      }

      // Always reset overlay isEnabled to false on app load to prevent startup ghost windows
      if (loaded.overlay?.config) {
        loaded.overlay.config.isEnabled = false;
      }

      return loaded;
    } catch (e) {
      console.warn("Failed to parse settings from localStorage:", e);
    }
    return this.clone(DEFAULT_APP_SETTINGS);
  }

  private executeSave(): void {
    if (!this.isSettingsWriter()) return;
    const cacheToPersist = this.sanitizedSnapshot(this.cache);
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(cacheToPersist));
    } catch (e) {
      console.error("Failed to save settings to localStorage:", e);
    }
    // A full localStorage must not prevent durable desktop persistence.
    this.diskSaveQueue = this.diskSaveQueue.catch(() => {}).then(() => this.persistToDisk(cacheToPersist));
    void this.diskSaveQueue.catch((error) => console.error("Failed to persist application settings:", error));
  }

  private isSettingsWriter(): boolean {
    if (typeof window === "undefined" || !window.location) return true;
    const params = new URLSearchParams(window.location.search);
    return params.get("overlay") !== "true" && params.get("regionSelector") !== "true";
  }

  private sanitizedSnapshot(settings: AppSettings): AppSettings {
    const snapshot = this.clone(settings);
    snapshot.overlay.config.isEnabled = false;
    for (const provider of Object.values(snapshot.llmProviders)) provider.apiKey = "";
    if (snapshot.llmProviders.openai) {
      delete snapshot.llmProviders.openai.oauthConnected;
      delete snapshot.llmProviders.openai.oauthAccountId;
    }
    return snapshot;
  }

  private async persistToDisk(settingsToPersist: AppSettings): Promise<void> {
    try {
      const json = JSON.stringify(this.sanitizedSnapshot(settingsToPersist), null, 2);
      await TauriBridge.saveAppSettings(json);
    } catch (error) {
      if (SecureStorageService.isTauriEnvironment()) throw error;
    }
  }

  public saveToStorage(immediate = false): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    if (immediate) {
      this.executeSave();
    } else {
      this.saveDebounceTimer = setTimeout(() => {
        this.saveDebounceTimer = null;
        this.executeSave();
      }, 250);
    }
    this.notifyListeners();
  }

  public flush(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    this.executeSave();
  }

  public async dispose(): Promise<void> {
    this.flush();
    await this.diskSaveQueue;
  }

  public async flushPendingSaves(): Promise<void> {
    await this.ensureReady();
    this.flush();
    await this.diskSaveQueue;
  }

  /** Auxiliary windows live across many opens; use the latest shared snapshot
   * and reload credentials before they capture or translate again.
   */
  public async refreshAuxiliarySettings(): Promise<void> {
    await this.ensureReady();
    if (this.isSettingsWriter()) return;
    this.cache = this.loadFromStorage();
    invalidateCustomRulesCache();
    // localStorage is already current; an older queued disk write must not win.
    this.readyPromise = this.hydrateSettings(false);
    await this.readyPromise;
    this.notifyListeners();
  }

  private notifyListeners() {
    const snapshot = this.getSettings();
    this.listeners.forEach((listener) => {
      try { listener(snapshot); } catch (err) { console.error("Settings subscriber failed:", err); }
    });
  }

  public getSettings(): AppSettings {
    return this.clone(this.cache);
  }

  public getSourceLang(): string {
    return this.cache.general?.sourceLang || "ja";
  }

  public getTargetLang(): string {
    return this.cache.general?.targetLang || "en";
  }

  public getSelectedModel(): string {
    return this.cache.translation?.activeProviderId || "mt:google-translate";
  }

  public getOpenRouterApiKey(): string {
    return this.cache.llmProviders?.openrouter?.apiKey || "";
  }

  public getDeepLApiKey(): string {
    return this.cache.llmProviders?.deepl?.apiKey || "";
  }

  public getGeneral(): GeneralSettings {
    return { ...this.cache.general };
  }

  public getTranslation(): TranslationSettings {
    return this.clone(this.cache.translation);
  }

  public getGlossary(): GlossarySettings {
    return this.clone(this.cache.glossary);
  }

  public getScriptManager(): ScriptManagerSettings {
    return { ...this.cache.scriptManager };
  }

  public getTextractor(): TextractorSettings {
    return { ...this.cache.textractor };
  }

  public getOcr(): OcrSettings {
    return {
      ...this.cache.ocr,
      regions: this.cache.ocr.regions?.map((r) => ({ ...r })) || [],
      stability: { ...this.cache.ocr.stability },
    };
  }

  public getOverlay(): OverlaySettings {
    return this.clone(this.cache.overlay);
  }

  public getTextPreprocessing(): TextPreprocessingSettings {
    return {
      ...this.cache.textPreprocessing,
      pipeline: this.cache.textPreprocessing.pipeline?.map((p) => ({ ...p, options: { ...p.options } })) || [],
    };
  }

  public getLogs(): LogSettings {
    return { ...this.cache.logs };
  }

  public getBatch(): BatchSettings {
    return this.clone(this.cache.batch || DEFAULT_BATCH_SETTINGS);
  }

  public getLlmProviders(): Record<string, StoredProviderConfig> {
    return this.clone(this.cache.llmProviders || DEFAULT_LLM_PROVIDERS);
  }

  public getLlmProvider(id: string): StoredProviderConfig {
    const providers = this.cache.llmProviders || DEFAULT_LLM_PROVIDERS;
    if (providers[id]) {
      return this.clone(providers[id]);
    }
    return { id, apiKey: "", baseUrl: undefined, isVerified: false, customModels: [] };
  }

  public async saveLlmProvider(config: StoredProviderConfig): Promise<void> {
    await this.ensureReady();
    if (!this.cache.llmProviders) {
      this.cache.llmProviders = this.clone(DEFAULT_LLM_PROVIDERS);
    }
    if (config.id === "openai") {
      config = { ...config, authMethod: config.authMethod === "oauth" ? "oauth" : "api_key" };
      if (SecureStorageService.isTauriEnvironment()) await TauriBridge.openAiSetAuthMethod(config.authMethod!);
    }
    if (config.apiKey !== undefined) {
      await SecureStorageService.setApiKey(config.id, config.apiKey);
    }
    this.cache.llmProviders[config.id] = { ...this.clone(config), apiKey: (config.apiKey || "").trim() };
    this.saveToStorage();
  }

  private applyOpenAiStatus(status: OpenAiAuthStatus): void {
    const cfg = this.cache.llmProviders.openai || { id: "openai", apiKey: "" };
    const changed = (cfg.authMethod ?? "api_key") !== status.authMethod
      || (status.authMethod === "oauth" && (cfg.oauthAccountId ?? null) !== status.selectedAccountId);
    this.cache.llmProviders.openai = {
      ...cfg, authMethod: status.authMethod,
      oauthConnected: hasConnectedOpenAiAccount(status), oauthAccountId: status.selectedAccountId,
      isVerified: status.authMethod === "oauth" ? hasConnectedOpenAiAccount(status) : changed ? false : cfg.isVerified,
      customModels: changed ? [] : cfg.customModels,
    };
  }

  public updateOpenAiAuthStatus(status: OpenAiAuthStatus): void {
    this.applyOpenAiStatus(status);
    this.saveToStorage();
  }

  public async setLlmApiKey(providerId: string, apiKey: string): Promise<void> {
    await this.ensureReady();
    await SecureStorageService.setApiKey(providerId, apiKey);
    if (!this.cache.llmProviders) {
      this.cache.llmProviders = this.clone(DEFAULT_LLM_PROVIDERS);
    }
    if (!this.cache.llmProviders[providerId]) {
      this.cache.llmProviders[providerId] = {
        id: providerId,
        apiKey: "",
        baseUrl: undefined,
      };
    }
    this.cache.llmProviders[providerId].apiKey = apiKey.trim();
    this.saveToStorage();
  }

  public updateGeneral(patch: Partial<GeneralSettings>) {
    this.cache.general = { ...this.cache.general, ...patch };
    this.saveToStorage();
  }

  public updateTranslation(patch: Partial<TranslationSettings>) {
    this.cache.translation = { ...this.cache.translation, ...patch };
    this.saveToStorage();
  }

  public updateBatch(patch: Partial<BatchSettings>) {
    this.cache.batch = { ...(this.cache.batch || DEFAULT_BATCH_SETTINGS), ...patch };
    this.saveToStorage();
  }

  public getReasoningEffort(): ReasoningEffort {
    return this.cache.translation.reasoningEffort || "default";
  }

  public getReasoningMaxTokens(): number {
    return this.cache.translation.reasoningMaxTokens || 0;
  }

  public getExcludeReasoning(): boolean {
    return Boolean(this.cache.translation.excludeReasoning);
  }

  public getTemperature(): number {
    return this.cache.translation.temperature ?? 0.3;
  }

  public getReasoningSettings(): {
    effort: ReasoningEffort;
    maxTokens: number;
    exclude: boolean;
  } {
    return {
      effort: this.getReasoningEffort(),
      maxTokens: this.getReasoningMaxTokens(),
      exclude: this.getExcludeReasoning(),
    };
  }

  public updateReasoningSettings(patch: {
    effort?: ReasoningEffort;
    maxTokens?: number;
    exclude?: boolean;
  }) {
    if (patch.effort !== undefined) this.cache.translation.reasoningEffort = patch.effort;
    if (patch.maxTokens !== undefined) this.cache.translation.reasoningMaxTokens = patch.maxTokens;
    if (patch.exclude !== undefined) this.cache.translation.excludeReasoning = patch.exclude;
    this.saveToStorage();
  }

  public updateGlossary(patch: Partial<GlossarySettings>) {
    this.cache.glossary = { ...this.cache.glossary, ...patch };
    this.saveToStorage();
  }

  public updateScriptManager(patch: Partial<ScriptManagerSettings>) {
    this.cache.scriptManager = { ...this.cache.scriptManager, ...patch };
    this.saveToStorage();
  }

  public updateTextractor(patch: Partial<TextractorSettings>) {
    this.cache.textractor = { ...this.cache.textractor, ...patch };
    this.saveToStorage();
  }

  public getTextractorMaxChars(): number {
    return this.cache.textractor?.maxCharsPerPass ?? this.cache.translation?.maxCharsPerLine ?? 250;
  }

  public setTextractorMaxChars(val: number) {
    this.updateTextractor({ maxCharsPerPass: val });
  }

  public updateOcr(patch: Partial<OcrSettings>) {
    this.cache.ocr = { ...this.cache.ocr, ...patch };
    this.saveToStorage();
  }

  public updateOverlay(patch: Partial<OverlaySettings>) {
    this.cache.overlay = { ...this.cache.overlay, ...patch };
    this.saveToStorage();
  }

  public updateOverlayConfig(patch: Partial<OverlayConfig>) {
    this.cache.overlay.config = { ...this.cache.overlay.config, ...patch };
    this.saveToStorage();
  }

  public updateTextPreprocessing(patch: Partial<TextPreprocessingSettings>) {
    this.cache.textPreprocessing = { ...this.cache.textPreprocessing, ...patch };
    invalidateCustomRulesCache();
    this.saveToStorage();
  }

  public updateLogs(patch: Partial<LogSettings>) {
    this.cache.logs = { ...this.cache.logs, ...patch };
    this.saveToStorage();
  }

  public async resetSettings(category?: keyof AppSettings): Promise<void> {
    if ((!category || category === "llmProviders") && SecureStorageService.isTauriEnvironment()) {
      await TauriBridge.openAiSetAuthMethod("api_key");
    }
    if (category) {
      (this.cache as Record<keyof AppSettings, any>)[category] = this.clone(DEFAULT_APP_SETTINGS[category]);
    } else {
      this.cache = this.clone(DEFAULT_APP_SETTINGS);
    }
    invalidateCustomRulesCache();
    this.saveToStorage(true);
  }

  public reloadFromStorage(): void {
    this.cache = this.loadFromStorage();
    invalidateCustomRulesCache();
    this.readyPromise = this.initSecureStorage().catch((err) => {
      console.warn("[SettingsManager] Secure storage reload error:", err);
    });
    this.notifyListeners();
  }

  public subscribe(listener: (settings: AppSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const settingsManager = new SettingsManager();
