import {
  OverlayConfig,
  OcrRegion,
  OcrStabilityConfig,
  PreprocessingStep,
  GlossaryEntry,
  ReasoningEffort,
  BatchSettings,
} from "../types";
import { DEFAULT_PREPROCESSING_PIPELINE, invalidateCustomRulesCache } from "../utils/textPreprocessor";
import { OVERLAY_PRESETS, TemplatePreset } from "../utils/overlayTemplateEngine";
import { StoredProviderConfig } from "./providers/llmProviderRegistry";
import { encryptSensitive, decryptSensitive } from "../utils/securityUtils";

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

export interface TranslationProviderConfig {
  id: string;
  name: string;
  type: string;
  apiKey?: string;
  baseUrl?: string;
  selectedModel?: string;
  temperature?: number;
  systemPrompt?: string;
  isEnabled: boolean;
  reasoningEffort?: ReasoningEffort;
  reasoningMaxTokens?: number;
  excludeReasoning?: boolean;
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
  providers: Record<string, TranslationProviderConfig>;
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
    providers: {
      openai: {
        id: "openai",
        name: "OpenAI",
        type: "openai",
        apiKey: "",
        selectedModel: "gpt-4o-mini",
        temperature: 0.3,
        isEnabled: true,
      },
      deepl: {
        id: "deepl",
        name: "DeepL Translate",
        type: "deepl",
        apiKey: "",
        isEnabled: true,
      },
      claude: {
        id: "claude",
        name: "Anthropic Claude",
        type: "claude",
        apiKey: "",
        selectedModel: "claude-3-5-haiku-20241022",
        temperature: 0.3,
        isEnabled: false,
      },
      gemini: {
        id: "gemini",
        name: "Google Gemini",
        type: "gemini",
        apiKey: "",
        selectedModel: "gemini-1.5-flash",
        temperature: 0.3,
        isEnabled: false,
      },
      ollama: {
        id: "ollama",
        name: "Ollama (Local LLM)",
        type: "ollama",
        baseUrl: "http://localhost:11434",
        selectedModel: "qwen2.5:7b",
        temperature: 0.3,
        isEnabled: false,
      },
    },
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

class SettingsManager {
  private cache: AppSettings;
  private listeners: Set<(settings: AppSettings) => void> = new Set();

  constructor() {
    this.cache = this.loadFromStorage();
  }

  private clone<T>(val: T): T {
    if (typeof structuredClone === "function") {
      return structuredClone(val);
    }
    return JSON.parse(JSON.stringify(val));
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
        loaded = this.deepMerge(DEFAULT_APP_SETTINGS, parsed);
      } else {
        loaded = this.clone(DEFAULT_APP_SETTINGS);
      }

      // Always reset overlay isEnabled to false on app load to prevent startup ghost windows
      if (loaded.overlay?.config) {
        loaded.overlay.config.isEnabled = false;
      }

      // Decrypt sensitive API keys if encrypted
      if (loaded.llmProviders) {
        for (const pid of Object.keys(loaded.llmProviders)) {
          if (loaded.llmProviders[pid]?.apiKey) {
            loaded.llmProviders[pid].apiKey = decryptSensitive(loaded.llmProviders[pid].apiKey);
          }
        }
      }
      if (loaded.translation?.providers?.openrouter?.apiKey) {
        loaded.translation.providers.openrouter.apiKey = decryptSensitive(loaded.translation.providers.openrouter.apiKey);
      }
      if (loaded.translation?.providers?.deepl?.apiKey) {
        loaded.translation.providers.deepl.apiKey = decryptSensitive(loaded.translation.providers.deepl.apiKey);
      }

      return loaded;
    } catch (e) {
      console.warn("Failed to parse settings from localStorage:", e);
    }
    return this.clone(DEFAULT_APP_SETTINGS);
  }

  private saveToStorage() {
    if (typeof localStorage !== "undefined") {
      try {
        const cacheToPersist = this.clone(this.cache);
        if (cacheToPersist.overlay?.config) {
          cacheToPersist.overlay.config.isEnabled = false;
        }
        // Encrypt sensitive API keys before writing to localStorage
        if (cacheToPersist.llmProviders) {
          for (const pid of Object.keys(cacheToPersist.llmProviders)) {
            if (cacheToPersist.llmProviders[pid]?.apiKey) {
              cacheToPersist.llmProviders[pid].apiKey = encryptSensitive(cacheToPersist.llmProviders[pid].apiKey);
            }
          }
        }
        if (cacheToPersist.translation?.providers?.openrouter?.apiKey) {
          cacheToPersist.translation.providers.openrouter.apiKey = encryptSensitive(cacheToPersist.translation.providers.openrouter.apiKey);
        }
        if (cacheToPersist.translation?.providers?.deepl?.apiKey) {
          cacheToPersist.translation.providers.deepl.apiKey = encryptSensitive(cacheToPersist.translation.providers.deepl.apiKey);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cacheToPersist));
      } catch (e) {
        console.error("Failed to save settings to localStorage:", e);
      }
    }
    this.notifyListeners();
  }

  private deepMerge(target: any, source: any): any {
    const output = Object.assign({}, target);
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach((key) => {
        if (this.isObject(source[key])) {
          if (!(key in target)) Object.assign(output, { [key]: source[key] });
          else output[key] = this.deepMerge(target[key], source[key]);
        } else if (Array.isArray(source[key]) && Array.isArray(target[key])) {
          if (key === "pipeline") {
            const sourceSteps = source[key] as PreprocessingStep[];
            const targetSteps = target[key] as PreprocessingStep[];
            const merged: PreprocessingStep[] = [];
            const processedIds = new Set<string>();

            for (const tStep of targetSteps) {
              const userMatch = sourceSteps.find((s) => s.id === tStep.id);
              if (userMatch) {
                merged.push({ ...tStep, isEnabled: userMatch.isEnabled, options: { ...tStep.options, ...userMatch.options } });
              } else {
                merged.push({ ...tStep });
              }
              processedIds.add(tStep.id);
            }

            for (const sStep of sourceSteps) {
              if (!processedIds.has(sStep.id)) {
                merged.push(sStep);
                processedIds.add(sStep.id);
              }
            }
            output[key] = merged;
          } else if (
            target[key].length > 0 &&
            typeof target[key][0] === "object" &&
            target[key][0] &&
            "id" in target[key][0]
          ) {
            const sourceArr = source[key] as any[];
            const targetArr = target[key] as any[];
            const merged = [...sourceArr];
            const sourceIds = new Set(sourceArr.map((it: any) => it?.id).filter(Boolean));
            for (const tItem of targetArr) {
              if (tItem?.id && !sourceIds.has(tItem.id)) {
                merged.push(tItem);
              }
            }
            output[key] = merged;
          } else {
            output[key] = source[key];
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  private isObject(item: any) {
    return item && typeof item === "object" && !Array.isArray(item);
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
    return (
      this.cache.llmProviders?.openrouter?.apiKey ||
      this.cache.translation?.providers?.openrouter?.apiKey ||
      ""
    );
  }

  public getDeepLApiKey(): string {
    return (
      this.cache.translation?.providers?.deepl?.apiKey ||
      ""
    );
  }

  public getGeneral(): GeneralSettings {
    return this.clone(this.cache.general);
  }

  public getTranslation(): TranslationSettings {
    return this.clone(this.cache.translation);
  }

  public getGlossary(): GlossarySettings {
    return this.clone(this.cache.glossary);
  }

  public getScriptManager(): ScriptManagerSettings {
    return this.clone(this.cache.scriptManager);
  }

  public getTextractor(): TextractorSettings {
    return this.clone(this.cache.textractor);
  }

  public getOcr(): OcrSettings {
    return this.clone(this.cache.ocr);
  }

  public getOverlay(): OverlaySettings {
    return this.clone(this.cache.overlay);
  }

  public getTextPreprocessing(): TextPreprocessingSettings {
    return this.clone(this.cache.textPreprocessing);
  }

  public getLogs(): LogSettings {
    return this.clone(this.cache.logs);
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

  public saveLlmProvider(config: StoredProviderConfig) {
    if (!this.cache.llmProviders) {
      this.cache.llmProviders = this.clone(DEFAULT_LLM_PROVIDERS);
    }
    this.cache.llmProviders[config.id] = this.clone(config);
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

  public updateProvider(providerId: string, patch: Partial<TranslationProviderConfig>) {
    const existing = this.cache.translation.providers[providerId] || {
      id: providerId,
      name: providerId,
      type: providerId,
      isEnabled: true,
    };
    this.cache.translation.providers[providerId] = { ...existing, ...patch };
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
    this.saveToStorage();
  }

  public reloadFromStorage(): void {
    this.cache = this.loadFromStorage();
    invalidateCustomRulesCache();
    this.notifyListeners();
  }

  public subscribe(listener: (settings: AppSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const settingsManager = new SettingsManager();
