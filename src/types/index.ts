export type NavigationTab =
  // 4 Primary Hubs
  | "live-game"
  | "batch-translate"
  | "knowledge-base"
  | "settings"
  // Legacy / Sub-view compatibility aliases
  | "live-translate"
  | "manual-translate"
  | "glossary-manager"
  | "script-manager"
  | "logs"
  | "textractor"
  | "ocr"
  | "overlay-settings"
  | "text-preprocessing"
  | "general-settings"
  | "translation-providers";

export type PreprocessingType =
  | "furigana_cleaner"
  | "control_char_cleaner"
  | "phrase_deduplicator"
  | "stutter_reducer"
  | "whitespace_normalizer"
  | "punctuation_normalizer"
  | "unicode_nfkc"
  | "custom_regex";

export type PreprocessingSource = "manual" | "textractor" | "ocr" | "batch";

export interface PreprocessingStep {
  id: string;
  type: PreprocessingType;
  name: string;
  description: string;
  isEnabled: boolean;
  isCustom?: boolean;
  applicableSources?: PreprocessingSource[];
  options?: {
    pattern?: string;
    replacement?: string;
    isRegex?: boolean;
    ignoreCase?: boolean;
    stripRubyParentheses?: boolean;
    stripRubyBrackets?: boolean;
    stripRubyHtml?: boolean;
    collapseLimit?: number;
    normalizeQuotes?: boolean;
    removeDecorativeSymbols?: boolean;
  };
}

export interface DialogueTurn {
  speaker?: string; // Character / Speaker Name (Empty for narration)
  message: string;  // Dialogue Sentence / Text
}

export interface ManualDialogueInput {
  message: string;  // Manual input without speaker name
}

export interface ScriptLineItem {
  id: string;
  speaker?: string;
  translatedSpeaker?: string;
  original: string;
  translated: string;
  matchedCount?: number;
  lastUsed?: string;
}

export interface TranslationLogItem {
  id: string;
  timestamp: string;
  provider: string; // e.g. "OpenRouter (Claude 3.5 Sonnet)" or empty if matched from script
  durationMs: number;
  matchedFromScript?: boolean;
  similarityScore?: number;
  name?: {
    source: string; // e.g. "坂上 智代"
    translated: string; // e.g. "Sakagami Tomoyo"
  };
  message: {
    source: string; // e.g. "「…別に、何でもないわ。早く教室に行きましょう。」"
    translated: string; // e.g. "\"...It's nothing really. Let's hurry to the classroom.\""
  };
}

export interface GlossaryEntry {
  id: string;
  original: string;
  translation: string;
  category: string;
  notes?: string;
}

export interface TextractorProcessInfo {
  pid: number;
  name: string;
  window_title: string;
}

export interface TextractorMessage {
  handle: number;
  pid: number;
  address: string;
  context: string;
  context2: string;
  name: string;
  hook_code: string;
  text: string;
  timestamp: string;
}

export type TextractorThreadRole = "combined" | "message" | "speaker" | "ignored";

export interface TextractorThread {
  id: number; // handle
  name: string;
  hookCode: string;
  address?: string;
  totalLines: number;
  lastText: string;
  lastTimestamp: string;
  isActive: boolean;
  role: TextractorThreadRole;
  isPrimary?: boolean;
}

export interface OverlayConfig {
  isEnabled: boolean;
  targetMonitor: string;
  isClickThrough: boolean;
  isExcludedFromCapture: boolean;
  
  // Box Positioning & Auto-expansion
  x: number;
  y: number;
  width: number;
  height: number;
  maxExpandRatio: number; // default: 2 (2x max height expansion before scrolling)

  // Typography & Appearance
  fontSize: number;
  speakerFontSize?: number;
  messageFontSize?: number;
  fontColor: string;
  outlineColor: string;
  outlineWidth: number;
  backgroundColor: string;
  backgroundOpacity: number;
  borderRadius: number;

  // 4 Display Fields
  showSpeaker: boolean;
  showTranslatedSpeaker: boolean;
  showMessage: boolean;
  showTranslatedMessage: boolean;

  // Custom Component / HTML & CSS Template Mode
  useCustomTemplate?: boolean;
  templatePreset?: string; // "classic" | "glassmorphism" | "cyberpunk" | "cinematic" | "rpg" | "custom"
  customTemplateHtml?: string;
  customTemplateCss?: string;

  // Text Animation Subsystem
  textAnimation?: "none" | "typewriter" | "fade" | "blur";
  animationSpeedMs?: number; // Speed in ms (typewriter: ms/char [10-80], css: duration [100-600])
}

export interface NGramSettings {
  nValue: number;
  similarityThreshold: number; // 0.0 - 1.0
  normalizeWhitespace: boolean;
  removePunctuation: boolean;
  ignoreCase: boolean;
}

export interface MonitorInfo {
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scale_factor: number;
  is_primary: boolean;
}

export type OcrRegionRole = "dialogue" | "speaker";

export interface OcrRegion {
  id: string;
  name: string;
  role: OcrRegionRole;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  physicalX?: number;
  physicalY?: number;
  physicalWidth?: number;
  physicalHeight?: number;
  targetMonitor?: string;
}

export interface OcrStabilityConfig {
  enableMotionDetection: boolean;
  settleTimeMs: number; // e.g. 100 - 800ms, default 250ms
  motionSensitivity: number; // 1 - 10, default 3
  ignoreBlinkingPrompt: boolean; // default true
}

export interface OcrScanResult {
  speaker: string;
  message: string;
  rawText: string;
  regionsText: { regionId: string; role: OcrRegionRole; text: string }[];
  timestamp: string;
  latencyMs: number;
  isSettled?: boolean;
}

export interface OcrEngineStatus {
  isAvailable: boolean;
  dllPath: string;
  modelPath: string;
  error?: string;
}

