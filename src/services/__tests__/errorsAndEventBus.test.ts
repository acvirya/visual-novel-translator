import { describe, it, expect, vi } from "vitest";
import { RateLimitError, LlmParseError, ApiKeyMissingError, CancellationError, classifyError } from "../errors";
import { eventBus } from "../eventBus";

describe("Typed Errors (A5)", () => {
  it("should classify 429 and rate-limits into RateLimitError", () => {
    const err = classifyError(new Error("HTTP 429 Too Many Requests: retry-after: 5"), "openrouter");
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).isRetryable).toBe(true);
    expect((err as RateLimitError).retryAfterMs).toBe(5000);
  });

  it("should classify JSON syntax errors into LlmParseError", () => {
    const err = classifyError(new Error("Unexpected token < in JSON at position 0"));
    expect(err).toBeInstanceOf(LlmParseError);
    expect((err as LlmParseError).isRetryable).toBe(true);
  });

  it("should classify aborts into CancellationError", () => {
    const err = classifyError(new Error("The user aborted a request."));
    expect(err).toBeInstanceOf(CancellationError);
    expect(err.isRetryable).toBe(false);
  });

  it("should classify missing API key error", () => {
    const err = classifyError(new Error("Unauthorized: API key invalid"), "anthropic");
    expect(err).toBeInstanceOf(ApiKeyMissingError);
    expect((err as ApiKeyMissingError).providerId).toBe("anthropic");
  });
});

describe("EventBus (A3)", () => {
  it("should subscribe, emit, and unsubscribe cleanly", () => {
    const fn = vi.fn();
    const unsub = eventBus.on("translation:paused", fn);

    eventBus.emit("translation:paused", true);
    expect(fn).toHaveBeenCalledWith(true);

    unsub();
    eventBus.emit("translation:paused", false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should support once listener", () => {
    const fn = vi.fn();
    eventBus.once("ocr:scanned", fn);

    eventBus.emit("ocr:scanned", { text: "こんにちは", source: "ocr", durationMs: 120 });
    eventBus.emit("ocr:scanned", { text: "さようなら", source: "ocr", durationMs: 100 });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ text: "こんにちは", source: "ocr", durationMs: 120 });
  });
});
