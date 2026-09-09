import {
  AppError,
  RateLimitError,
  CancellationError,
  LlmParseError,
  ContentFilterError,
  classifyError,
} from "../errors";

export interface RetryPolicyOptions {
  maxRetries?: number;
  maxBackoffSeconds?: number;
  autoContinueUntilCompleted?: boolean;
}

export interface RetryEvaluation {
  shouldRetry: boolean;
  backoffMs: number;
  attemptInfo: string;
  error: AppError;
}

/**
 * Evaluates whether an error should be retried and calculates the backoff delay
 */
export function evaluateRetry(
  err: unknown,
  retryAttempts: number,
  options: RetryPolicyOptions
): RetryEvaluation {
  const classified = classifyError(err);

  if (classified instanceof CancellationError) {
    return {
      shouldRetry: false,
      backoffMs: 0,
      attemptInfo: "Cancelled",
      error: classified,
    };
  }

  // Immediate Skip (0 Retries): If the provider explicitly blocked or refused due to prohibited content or safety filters,
  // skip immediately without retrying. Retrying prohibited content will never succeed and only wastes tokens and rate limits.
  if (classified instanceof ContentFilterError) {
    return {
      shouldRetry: false,
      backoffMs: 0,
      attemptInfo: "Prohibited content / safety refusal (skipped immediately without retry)",
      error: classified,
    };
  }

  // Fast Cut-Loss (1 Retry - Total 2 attempts): If the model failed to output valid JSON or returned an empty response,
  // allow 1 retry to confirm it wasn't a transient network/truncation glitch.
  if (classified instanceof LlmParseError) {
    const MAX_PARSE_RETRIES = 1; // Allows 1 retry (total 2 attempts)
    if (retryAttempts > MAX_PARSE_RETRIES) {
      return {
        shouldRetry: false,
        backoffMs: 0,
        attemptInfo: `Cut-loss: Output parsing / model generation failed twice consecutively (${retryAttempts} attempts)`,
        error: classified,
      };
    }
  }

  const isInfinite = options.autoContinueUntilCompleted !== false;
  const maxRetries = isInfinite ? 25 : options.maxRetries ?? 5;

  if (retryAttempts >= maxRetries) {
    return {
      shouldRetry: false,
      backoffMs: 0,
      attemptInfo: isInfinite ? `Exceeded max retry (${retryAttempts})` : `Attempt ${retryAttempts}/${maxRetries}`,
      error: classified,
    };
  }

  const userMaxBackoffMs = Math.max(500, (options.maxBackoffSeconds ?? 30) * 1000);

  let backoffMs: number;
  if (classified instanceof RateLimitError) {
    if (classified.retryAfterMs && classified.retryAfterMs > 0) {
      backoffMs = Math.min(userMaxBackoffMs, classified.retryAfterMs);
    } else {
      backoffMs = Math.min(userMaxBackoffMs, 2000 * Math.pow(1.6, Math.min(retryAttempts, 10)) + Math.random() * 1000);
    }
  } else {
    backoffMs = Math.min(Math.min(userMaxBackoffMs, 15000), 1000 + Math.min(retryAttempts, 8) * 500 + Math.random() * 300);
  }

  const attemptInfo = isInfinite ? `Retry #${retryAttempts}` : `Attempt ${retryAttempts}/${maxRetries}`;

  return {
    shouldRetry: true,
    backoffMs,
    attemptInfo,
    error: classified,
  };
}
