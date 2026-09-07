/**
 * Core Application Constants
 * Centralizes default timeouts, buffer capacities, debounce intervals, and limits (L6)
 */

export const APP_CONSTANTS = {
  // Textractor defaults
  TEXTRACTOR: {
    DEFAULT_MAX_CHARS_PER_PASS: 250,
    DEFAULT_DEBOUNCE_MS: 250,
    DEFAULT_FLUSH_INTERVAL_MS: 150,
    DEFAULT_THREAD_BUFFER_SIZE: 100,
    DEFAULT_BURST_SUPPRESSION_MS: 800,
  },

  // OCR defaults
  OCR: {
    DEFAULT_SETTLE_TIME_MS: 250,
    DEFAULT_MOTION_SENSITIVITY: 3,
    DEFAULT_DEBOUNCE_MS: 250,
  },

  // Translation pipeline defaults
  TRANSLATION: {
    MAX_QUEUE_SIZE: 30,
    DEFAULT_MAX_CONTEXT_LINES: 10,
    DEFAULT_RETAIN_CONTEXT_LINES: 5,
    DEFAULT_MAX_CHARS_PER_LINE: 250,
    DEFAULT_TEMPERATURE: 0.3,
  },

  // Storage & persistence
  STORAGE: {
    DISK_SAVE_THROTTLE_MS: 3000,
    MAX_LOG_ITEMS: 200,
  },
} as const;
