/**
 * Typed Error Hierarchy for VN Translator
 * Replaces ambiguous string inspections with strongly typed exceptions and error codes.
 */

export type AppErrorCode =
  | "UNKNOWN_ERROR"
  | "TRANSLATION_ERROR"
  | "RATE_LIMIT_ERROR"
  | "LLM_PARSE_ERROR"
  | "CONTENT_FILTER_ERROR"
  | "API_KEY_MISSING"
  | "NETWORK_ERROR"
  | "CANCELLATION_ERROR"
  | "INVALID_INPUT"
  | "STORAGE_ERROR";

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly isRetryable: boolean;
  public readonly originalError?: unknown;

  constructor(message: string, code: AppErrorCode = "UNKNOWN_ERROR", isRetryable = false, originalError?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.isRetryable = isRetryable;
    this.originalError = originalError;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TranslationError extends AppError {
  public readonly providerId?: string;

  constructor(message: string, providerId?: string, isRetryable = false, originalError?: unknown) {
    super(message, "TRANSLATION_ERROR", isRetryable, originalError);
    this.name = "TranslationError";
    this.providerId = providerId;
  }
}

export class RateLimitError extends TranslationError {
  public readonly retryAfterMs?: number;

  constructor(message: string, providerId?: string, retryAfterMs?: number, originalError?: unknown) {
    super(message, providerId, true, originalError);
    this.name = "RateLimitError";
    (this as any).code = "RATE_LIMIT_ERROR";
    this.retryAfterMs = retryAfterMs;
  }
}

export class LlmParseError extends TranslationError {
  public readonly rawContent?: string;
  public readonly isSyntaxError: boolean;

  constructor(message: string, rawContent?: string, isSyntaxError = true, providerId?: string, originalError?: unknown) {
    super(message, providerId, true, originalError);
    this.name = "LlmParseError";
    (this as any).code = "LLM_PARSE_ERROR";
    this.rawContent = rawContent;
    this.isSyntaxError = isSyntaxError;
  }
}

export class ApiKeyMissingError extends TranslationError {
  constructor(providerId: string) {
    super(`API key missing or empty for provider: ${providerId}`, providerId, false);
    this.name = "ApiKeyMissingError";
    (this as any).code = "API_KEY_MISSING";
  }
}

export class CancellationError extends AppError {
  constructor(message = "Operation was cancelled by user") {
    super(message, "CANCELLATION_ERROR", false);
    this.name = "CancellationError";
  }
}

export class ContentFilterError extends TranslationError {
  constructor(message: string, providerId?: string, originalError?: unknown) {
    super(message, providerId, false, originalError);
    this.name = "ContentFilterError";
    (this as any).code = "CONTENT_FILTER_ERROR";
  }
}

/**
 * Classifies an unknown error into a typed AppError instance
 */
export function classifyError(err: unknown, defaultProviderId?: string): AppError {
  if (err instanceof AppError) {
    return err;
  }

  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes("abort") || lower.includes("cancel")) {
    return new CancellationError(msg);
  }

  if (
    lower.includes("429") ||
    lower.includes("rate-limit") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("quota")
  ) {
    const match = msg.match(/retry-after:?\s*(\d+)/i);
    const retryAfterMs = match ? parseInt(match[1], 10) * 1000 : undefined;
    return new RateLimitError(msg, defaultProviderId, retryAfterMs, err);
  }
  // IPC / Tauri command argument errors should not be treated as LLM model output parsing errors
  if (
    lower.includes("invalid args") ||
    lower.includes("missing required key") ||
    (lower.includes("command ") && lower.includes("missing"))
  ) {
    return new TranslationError(msg, defaultProviderId, false, err);
  }
  // Prohibited content / safety filter / stop_reason refusal
  if (
    lower.includes("safety") ||
    lower.includes("content_filter") ||
    lower.includes("content filter") ||
    lower.includes("prohibited") ||
    lower.includes("policy violation") ||
    lower.includes("harm_category") ||
    lower.includes("blocklist") ||
    (lower.includes("refusal") && !lower.includes("connection refused"))
  ) {
    return new ContentFilterError(msg, defaultProviderId, err);
  }

  if (
    lower.includes("json") ||
    lower.includes("syntaxerror") ||
    lower.includes("schema") ||
    lower.includes("validation") ||
    lower.includes("failed to parse") ||
    lower.includes("empty batch response")
  ) {
    return new LlmParseError(msg, undefined, true, defaultProviderId, err);
  }

  if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("401")) {
    return new ApiKeyMissingError(defaultProviderId || "unknown");
  }

  const isNetwork =
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504") ||
    lower.includes("network error");

  return new TranslationError(msg, defaultProviderId, isNetwork, err);
}
