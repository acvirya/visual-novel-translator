import {
  OverlayConfig,
  OcrRegion,
  OcrStabilityConfig,
  PreprocessingStep,
  GlossaryEntry,
} from "../types";
import { DEFAULT_PREPROCESSING_PIPELINE } from "../utils/textPreprocessor";
import { OVERLAY_PRESETS, TemplatePreset } from "../utils/overlayTemplateEngine";

export interface GeneralSettings {
  sourceLang: string;
  targetLang: string;
  autoStartWithWindows: boolean;
  minimizeToTray: boolean;
  hotkeyLockOverlay: string;
  hotkeyTogglePause: string;
  hotkeyOcrScan: string;
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
}

export interface TranslationSettings {
  activeProviderId: string;
  liveModel: string;
  manualModel: string;
  batchModel: string;
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
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  general: {
    sourceLang: "ja",
    targetLang: "en",
    autoStartWithWindows: false,
    minimizeToTray: true,
    hotkeyLockOverlay: "Ctrl+Shift+L",
    hotkeyTogglePause: "Ctrl+Shift+P",
    hotkeyOcrScan: "F9",
  },
  translation: {
    activeProviderId: "openai",
    liveModel: "gpt-4o-mini",
    manualModel: "gpt-4o-mini",
    batchModel: "gpt-4o-mini",
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
};

const STORAGE_KEY = "vn_translator_universal_settings_v1";

class SettingsManager {
  private cache: AppSettings;
  private listeners: Set<(settings: AppSettings) => void> = new Set();

  constructor() {
    this.cache = this.loadFromStorage();
  }

  private loadFromStorage(): AppSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      let loaded: AppSettings;
      if (raw) {
        const parsed = JSON.parse(raw);
        loaded = this.deepMerge(DEFAULT_APP_SETTINGS, parsed);
      } else {
        loaded = JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS));
      }

      // Sync legacy flat keys if present to maintain cross-system consistency
      const flatSource = localStorage.getItem("vn_source_lang");
      if (flatSource) loaded.general.sourceLang = flatSource;
      const flatTarget = localStorage.getItem("vn_target_lang");
      if (flatTarget) loaded.general.targetLang = flatTarget;
      const flatModel = localStorage.getItem("vn_selected_model");
      if (flatModel) loaded.translation.activeProviderId = flatModel;
      const flatOpenRouterKey = localStorage.getItem("vn_openrouter_api_key");
      if (flatOpenRouterKey) {
        if (!loaded.translation.providers.openrouter) {
          loaded.translation.providers.openrouter = {
            id: "openrouter",
            name: "OpenRouter",
            type: "openrouter",
            apiKey: flatOpenRouterKey,
            isEnabled: true,
          };
        } else {
          loaded.translation.providers.openrouter.apiKey = flatOpenRouterKey;
        }
      }

      // Always reset overlay isEnabled to false on app load to prevent startup bugs
      if (loaded.overlay?.config) {
        loaded.overlay.config.isEnabled = false;
      }

      return loaded;
    } catch (e) {
      console.warn("Failed to parse settings from localStorage:", e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS));
  }

  private syncFlatKeys() {
    try {
      if (this.cache.general?.sourceLang) {
        localStorage.setItem("vn_source_lang", this.cache.general.sourceLang);
      }
      if (this.cache.general?.targetLang) {
        localStorage.setItem("vn_target_lang", this.cache.general.targetLang);
      }
      if (this.cache.translation?.activeProviderId) {
        localStorage.setItem("vn_selected_model", this.cache.translation.activeProviderId);
      }
      const openRouterKey =
        this.cache.translation?.providers?.openrouter?.apiKey ||
        this.cache.translation?.providers?.openai?.apiKey;
      if (openRouterKey) {
        localStorage.setItem("vn_openrouter_api_key", openRouterKey);
      }
      const deepLKey = this.cache.translation?.providers?.deepl?.apiKey;
      if (deepLKey) {
        localStorage.setItem("vn_deepl_api_key", deepLKey);
      }
    } catch {
      // Ignored if localStorage is restricted
    }
  }

  private saveToStorage() {
    try {
      const cacheToPersist = JSON.parse(JSON.stringify(this.cache));
      if (cacheToPersist.overlay?.config) {
        cacheToPersist.overlay.config.isEnabled = false;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cacheToPersist));
      this.syncFlatKeys();
      this.notifyListeners();
    } catch (e) {
      console.error("Failed to save settings to localStorage:", e);
    }
  }

  private deepMerge(target: any, source: any): any {
    const output = Object.assign({}, target);
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach((key) => {
        if (this.isObject(source[key])) {
          if (!(key in target)) Object.assign(output, { [key]: source[key] });
          else output[key] = this.deepMerge(target[key], source[key]);
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
    this.listeners.forEach((listener) => listener(this.getSettings()));
  }

  public getSettings(): AppSettings {
    return JSON.parse(JSON.stringify(this.cache));
  }

  public getSourceLang(): string {
    return this.cache.general?.sourceLang || localStorage.getItem("vn_source_lang") || "ja";
  }

  public getTargetLang(): string {
    return this.cache.general?.targetLang || localStorage.getItem("vn_target_lang") || "en";
  }

  public getSelectedModel(): string {
    return this.cache.translation?.activeProviderId || localStorage.getItem("vn_selected_model") || "mt:google-translate";
  }

  public getOpenRouterApiKey(): string {
    return (
      this.cache.translation?.providers?.openrouter?.apiKey ||
      this.cache.translation?.providers?.openai?.apiKey ||
      localStorage.getItem("vn_openrouter_api_key") ||
      ""
    );
  }

  public getDeepLApiKey(): string {
    return (
      this.cache.translation?.providers?.deepl?.apiKey ||
      localStorage.getItem("vn_deepl_api_key") ||
      ""
    );
  }

  public getGeneral(): GeneralSettings {
    return this.cache.general;
  }

  public getTranslation(): TranslationSettings {
    return this.cache.translation;
  }

  public getGlossary(): GlossarySettings {
    return this.cache.glossary;
  }

  public getScriptManager(): ScriptManagerSettings {
    return this.cache.scriptManager;
  }

  public getTextractor(): TextractorSettings {
    return this.cache.textractor;
  }

  public getOcr(): OcrSettings {
    return this.cache.ocr;
  }

  public getOverlay(): OverlaySettings {
    return this.cache.overlay;
  }

  public getTextPreprocessing(): TextPreprocessingSettings {
    return this.cache.textPreprocessing;
  }

  public getLogs(): LogSettings {
    return this.cache.logs;
  }

  public updateGeneral(patch: Partial<GeneralSettings>) {
    this.cache.general = { ...this.cache.general, ...patch };
    this.saveToStorage();
  }

  public updateTranslation(patch: Partial<TranslationSettings>) {
    this.cache.translation = { ...this.cache.translation, ...patch };
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
    this.saveToStorage();
  }

  public updateLogs(patch: Partial<LogSettings>) {
    this.cache.logs = { ...this.cache.logs, ...patch };
    this.saveToStorage();
  }

  /**
   * Reset specific category or all settings to factory defaults, and clean up flat keys
   */
  public resetSettings(category?: keyof AppSettings) {
    if (category) {
      this.cache[category] = JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS[category]));
    } else {
      this.cache = JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS));
    }
    this.saveToStorage();
  }

  public subscribe(listener: (settings: AppSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const settingsManager = new SettingsManager();
