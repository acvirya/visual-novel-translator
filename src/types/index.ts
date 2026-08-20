export type NavigationTab =
  // Translation
  | "live-translate"
  | "manual-translate"
  | "batch-translate"
  | "glossary-manager"
  | "script-manager"
  | "logs"
  // Input
  | "textractor"
  | "ocr"
  // Overlay
  | "overlay-settings"
  // Settings
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

export interface PreprocessingStep {
  id: string;
  type: PreprocessingType;
  name: string;
  description: string;
  isEnabled: boolean;
  isCustom?: boolean;
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
}

export interface NGramSettings {
  nValue: number;
  similarityThreshold: number; // 0.0 - 1.0
  normalizeWhitespace: boolean;
  removePunctuation: boolean;
  ignoreCase: boolean;
}
