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
  | "char_deduplicator"
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
    duplicateCount?: number; // e.g. 2 for doubled (aa->a), 3 for tripled, 0 for any
  };
}

export interface DialogueTurn {
  speaker?: string; // Character / Speaker Name (Empty for narration)
  message: string;  // Dialogue Sentence / Text
}

export interface ManualDialogueInput {
  message: string;  // Manual input without speaker name
}

export interface ScriptEntry {
  id: string;
  speaker?: string;
  translated_speaker?: string;
  message: string;
  translated_message: string;
  matchedCount?: number;
  lastUsed?: string;
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
  sourceType?: "textractor" | "ocr" | "manual" | "batch";
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

export type PickFileTuple = [filePath: string, fileName: string, fileSize: number];
export type ScriptOpenTuple = [filePath: string, content: string];

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

export type TextractorThreadRole = "combined" | "dialogue" | "message" | "speaker" | "ignored";

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
  templatePreset?: string; // "classic" | "persona_stylish" | "manga_bubble" | "custom"
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

export type CaptureRegion = OcrRegion;

export interface OcrStabilityConfig {
  enableMotionDetection: boolean;
  settleTimeMs: number; // e.g. 100 - 800ms, default 250ms
  motionSensitivity: number; // 1 - 10, default 3
  ignoreBlinkingPrompt: boolean; // default true
}

export interface DetectedTextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrScanResult {
  speaker: string;
  message: string;
  rawText: string;
  regionsText: { regionId: string; role: OcrRegionRole; text: string }[];
  detectedLines?: DetectedTextLine[];
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

export interface OpenRouterCompletionResponse {
  content: string;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  cost: number;
  model: string;
}

export type ReasoningEffort =
  | "default"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "custom";

export interface ReasoningConfig {
  effort: ReasoningEffort;
  maxTokens?: number;
  exclude: boolean;
}


