import { describe, it, expect } from "vitest";
import {
  isExplicitTagged,
  isGenuinelyTranslated,
  isProcessed,
  calculateOutputPath,
  serializeBatchItemsToJsonl,
  BatchItem,
} from "../batchFileUtils";

describe("batchFileUtils", () => {
  describe("isExplicitTagged", () => {
    it("identifies explicit content tags in translated message or speaker", () => {
      expect(isExplicitTagged({ translatedMessage: "[EXPLICIT CONTENT]" })).toBe(true);
      expect(isExplicitTagged({ translatedSpeaker: "[explicit content]" })).toBe(true);
      expect(isExplicitTagged({ translatedMessage: "Hello world", translatedSpeaker: "Hero" })).toBe(false);
    });
  });

  describe("isGenuinelyTranslated", () => {
    it("returns true for blank original message", () => {
      expect(isGenuinelyTranslated({ originalMessage: "" })).toBe(true);
      expect(isGenuinelyTranslated({ originalMessage: "   " })).toBe(true);
    });

    it("returns false if translated message is empty or null string", () => {
      expect(isGenuinelyTranslated({ originalMessage: "こんにちは", translatedMessage: "" })).toBe(false);
      expect(isGenuinelyTranslated({ originalMessage: "こんにちは", translatedMessage: "null" })).toBe(false);
      expect(isGenuinelyTranslated({ originalMessage: "こんにちは", translatedMessage: "undefined" })).toBe(false);
    });

    it("returns false for explicit tagged content", () => {
      expect(isGenuinelyTranslated({ originalMessage: "こんにちは", translatedMessage: "[EXPLICIT CONTENT]" })).toBe(false);
    });

    it("handles identical source text based on presence of East Asian characters", () => {
      // East Asian text copied without translation should be false
      expect(isGenuinelyTranslated({ originalMessage: "こんにちは", translatedMessage: "こんにちは" })).toBe(false);
      expect(isGenuinelyTranslated({ originalMessage: "你好", translatedMessage: "你好" })).toBe(false);
      // Punctuation or ASCII text that is identical is valid
      expect(isGenuinelyTranslated({ originalMessage: "...", translatedMessage: "..." })).toBe(true);
      expect(isGenuinelyTranslated({ originalMessage: "OK!", translatedMessage: "OK!" })).toBe(true);
    });

    it("returns true for genuinely translated content", () => {
      expect(isGenuinelyTranslated({ originalMessage: "こんにちは", translatedMessage: "Hello" })).toBe(true);
    });
  });

  describe("isProcessed", () => {
    it("returns true if either genuinely translated or explicit tagged", () => {
      expect(isProcessed({ originalMessage: "こんにちは", translatedMessage: "Hello" })).toBe(true);
      expect(isProcessed({ originalMessage: "こんにちは", translatedMessage: "[EXPLICIT CONTENT]" })).toBe(true);
      expect(isProcessed({ originalMessage: "こんにちは", translatedMessage: "" })).toBe(false);
    });
  });

  describe("calculateOutputPath", () => {
    it("computes default output path alongside source file", () => {
      const out = calculateOutputPath("C:/games/script/01.ks");
      expect(out).toBe("C:/games/script/01_translated.jsonl");
    });

    it("handles custom output directory and custom suffix", () => {
      const out = calculateOutputPath("C:/games/script/chapter1.txt", "D:/translations", "_id");
      expect(out).toBe("D:/translations/chapter1_id.jsonl");
    });
  });

  describe("serializeBatchItemsToJsonl", () => {
    it("serializes batch items into valid jsonl lines", () => {
      const items: BatchItem[] = [
        { id: 1, originalSpeaker: "太郎", originalMessage: "おはよう", translatedSpeaker: "Taro", translatedMessage: "Good morning" },
        { id: 2, originalMessage: "いい天気だね", translatedMessage: "Nice weather" },
      ];

      const jsonl = serializeBatchItemsToJsonl(items);
      const lines = jsonl.split("\n");
      expect(lines).toHaveLength(2);

      const parsed0 = JSON.parse(lines[0]);
      expect(parsed0.id).toBe(1);
      expect(parsed0.translated_message).toBe("Good morning");

      const parsed1 = JSON.parse(lines[1]);
      expect(parsed1.id).toBe(2);
      expect(parsed1.speaker).toBeNull();
      expect(parsed1.translated_speaker).toBeNull();
    });
  });
});
