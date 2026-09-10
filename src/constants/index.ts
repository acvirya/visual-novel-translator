/**
 * Unified Application Constants & Defaults (ARCH-03)
 * Single source of truth across frontend services, UI components, and settings.
 */

export const APPLICATION_CONSTANTS = {
  // Script Matching
  SCRIPT_MATCHING: {
    DEFAULT_THRESHOLD: 0.85,
    MAX_NGRAM_BIGRAMS_PER_LINE: 80,
  },

  // Translation & Context Window
  TRANSLATION: {
    DEFAULT_MAX_CONTEXT_LINES: 10,
    DEFAULT_RETAIN_CONTEXT_LINES: 5,
    DEFAULT_MAX_CHARS_PER_LINE: 250,
    DEFAULT_TEMPERATURE: 0.3,
    MAX_QUEUE_SIZE: 30,
    DEFAULT_ACTIVE_PROVIDER_ID: "mt:google-translate",
    DEFAULT_BATCH_MODEL: "openai/gpt-4o-mini",
  },

  // Textractor
  TEXTRACTOR: {
    DEFAULT_MAX_CHARS_PER_PASS: 250,
    DEFAULT_DEBOUNCE_MS: 250,
    DEFAULT_POLL_INTERVAL_MS: 50,
    DEFAULT_FLUSH_INTERVAL_MS: 150,
    DEFAULT_THREAD_BUFFER_SIZE: 100,
    DEFAULT_BURST_SUPPRESSION_MS: 800,
    DEFAULT_MAX_LOG_LINES: 200,
    DEFAULT_CHAR_DEDUP_COUNT: 3,
    DEFAULT_EXECUTABLE_PATH: "C:\\Program Files\\Textractor\\x86\\TextractorCLI.exe",
  },

  // OCR
  OCR: {
    DEFAULT_SCALE_PERCENT: 100,
    DEFAULT_SCAN_INTERVAL_MS: 350,
    DEFAULT_SETTLE_TIME_MS: 250,
    DEFAULT_MOTION_SENSITIVITY: 3,
    DEFAULT_DEBOUNCE_MS: 250,
  },

  // Overlay
  OVERLAY: {
    DEFAULT_FONT_SIZE: 20,
    DEFAULT_SPEAKER_FONT_SIZE: 16,
    DEFAULT_MESSAGE_FONT_SIZE: 20,
    DEFAULT_BG_OPACITY: 0.85,
    DEFAULT_MAX_EXPAND_RATIO: 2.0,
    DEFAULT_OUTLINE_WIDTH: 2,
    DEFAULT_BORDER_RADIUS: 8,
  },

  // Batch Translation
  BATCH: {
    DEFAULT_LINES_PER_REQUEST: 15,
    DEFAULT_CONCURRENCY: 2,
    DEFAULT_TEMPERATURE: 0.3,
    DEFAULT_DELAY_MS: 1000,
    MAX_RETRIES: 2,
  },

  // Storage & Logging
  STORAGE: {
    DISK_SAVE_THROTTLE_MS: 3000,
    MAX_LOG_ITEMS: 300,
  },
} as const;

export * from "./languages";
export { APP_CONSTANTS } from "./appConstants";
export { APP_DEFAULTS } from "./defaults";
