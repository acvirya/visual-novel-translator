import deepmerge from "deepmerge";
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
import { OVERLAY_PRESETS, TemplatePreset } from "../utils/overlayTemplateEngine";
import { StoredProviderConfig } from "./providers/llmProviderRegistry";
import { SecureStorageService } from "./secureStorageService";

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
  delayMs: 300,
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
    retainContextLines: 3,
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
import type { ManagedService } from "./appContainer";

class SettingsManager implements ManagedService {
  public readonly id = "settingsManager";
  private cache: AppSettings;
  private listeners: Set<(settings: AppSettings) => void> = new Set();
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isSecureStorageInitialized = false;
  private readyPromise: Promise<void>;

  constructor() {
    this.cache = this.loadFromStorage();
    registerCustomRulesProvider(() => this.cache.textPreprocessing?.pipeline);
    this.readyPromise = this.initSecureStorage().catch((err) => {
      console.warn("[SettingsManager] Failed initial secure keys load:", err);
    });
  }

  public async ensureReady(): Promise<void> {
    return this.readyPromise;
  }

  public async getApiKey(providerId: string): Promise<string> {
    await this.readyPromise;
    return this.cache.llmProviders?.[providerId]?.apiKey || "";
  }

  public async initSecureStorage(): Promise<void> {
    if (!this.cache.llmProviders) {
      this.cache.llmProviders = this.clone(DEFAULT_LLM_PROVIDERS);
    }
    let hasChanges = false;
    for (const pid of Object.keys(this.cache.llmProviders)) {
      try {
        const secureKey = await SecureStorageService.getApiKey(pid);
        if (secureKey) {
          this.cache.llmProviders[pid].apiKey = secureKey;
          hasChanges = true;
        }
      } catch (err) {
        console.warn(`[SettingsManager] Could not load secure key for ${pid}:`, err);
      }
    }
    this.isSecureStorageInitialized = true;
    if (hasChanges) {
      this.saveToStorage(true);
      this.notifyListeners();
    }
  }

  public isSecureStorageReady(): boolean {
    return this.isSecureStorageInitialized;
  }

  private clone<T>(val: T): T {
    if (typeof structuredClone === "function") {
      return structuredClone(val);
    }
    return JSON.parse(JSON.stringify(val));
  }

  private mergeSettings(target: AppSettings, source: any): AppSettings {
    const customArrayMerge = (destinationArray: any[], sourceArray: any[]): any[] => {
      const hasId = (arr: any[]) => arr.some((item) => item && typeof item === "object" && "id" in item);
      if (hasId(destinationArray) || hasId(sourceArray)) {
        const merged = [...sourceArray];
        const sourceIds = new Set(sourceArray.map((i: any) => i?.id).filter(Boolean));
        for (const item of destinationArray) {
          if (item?.id && !sourceIds.has(item.id)) {
            merged.push(item);
          }
        }
        return merged;
      }
      return sourceArray.length > 0 ? sourceArray : destinationArray;
    };

    return deepmerge(target, source, { arrayMerge: customArrayMerge }) as AppSettings;
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
        // CRIT-02 & TD-07: Industry-standard deepmerge with smart array preservation
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
    if (typeof localStorage === "undefined") return;
    try {
      const cacheToPersist = this.clone(this.cache);
      if (cacheToPersist.overlay?.config) {
        cacheToPersist.overlay.config.isEnabled = false;
      }
      // Never store sensitive API keys in localStorage - all keys are managed via OS Keyring
      if (cacheToPersist.llmProviders) {
        for (const pid of Object.keys(cacheToPersist.llmProviders)) {
          if (cacheToPersist.llmProviders[pid]) {
            cacheToPersist.llmProviders[pid].apiKey = "";
          }
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cacheToPersist));
    } catch (e) {
      console.error("Failed to save settings to localStorage:", e);
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
  }

  private notifyListeners() {
    const snapshot = this.getSettings();
    this.listeners.forEach((listener) => listener(snapshot));
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
    return { ...this.cache.translation };
  }

  public getGlossary(): GlossarySettings {
    return { ...this.cache.glossary, terms: [...(this.cache.glossary.terms || [])] };
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
    return {
      ...this.cache.overlay,
      config: { ...this.cache.overlay.config },
      userCustomPresets: [...(this.cache.overlay.userCustomPresets || [])],
    };
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
    return { ...(this.cache.batch || DEFAULT_BATCH_SETTINGS) };
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
    if (!this.cache.llmProviders) {
      this.cache.llmProviders = this.clone(DEFAULT_LLM_PROVIDERS);
    }
    this.cache.llmProviders[config.id] = this.clone(config);
    if (config.apiKey !== undefined) {
      await SecureStorageService.setApiKey(config.id, config.apiKey);
    }
    this.saveToStorage();
  }

  public async setLlmApiKey(providerId: string, apiKey: string): Promise<void> {
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
    this.cache.llmProviders[providerId].apiKey = apiKey;
    await SecureStorageService.setApiKey(providerId, apiKey);
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

  public resetSettings(category?: keyof AppSettings) {
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
    this.initSecureStorage().catch((err) => {
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
