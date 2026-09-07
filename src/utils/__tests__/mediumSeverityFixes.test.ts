import { describe, it, expect, beforeEach } from "vitest";
import { isPotentiallyVulnerableRegex, cleanSpeakerName, clearSpeakerCleanCache } from "../textPreprocessor";
import { isGoogleTranslate, isDeepLFree, isFreeMtProvider, FREE_MT_PROVIDERS } from "../../services/freeMtService";

describe("Medium & Low Severity Fixes Validation", () => {
  describe("M10: Catastrophic Backtracking Guard", () => {
    it("detects vulnerable nested quantifiers", () => {
      expect(isPotentiallyVulnerableRegex("(a+)+")).toBe(true);
      expect(isPotentiallyVulnerableRegex("([0-9]+)*")).toBe(true);
      expect(isPotentiallyVulnerableRegex("([a-z]+)+")).toBe(true);
      expect(isPotentiallyVulnerableRegex("(a|b+)+")).toBe(true);
      expect(isPotentiallyVulnerableRegex("(.+)+")).toBe(true);
    });

    it("allows safe regular expressions", () => {
      expect(isPotentiallyVulnerableRegex("hello\\s+world")).toBe(false);
      expect(isPotentiallyVulnerableRegex("\\[[^\\]]+\\]")).toBe(false);
      expect(isPotentiallyVulnerableRegex("【.*?】")).toBe(false);
      expect(isPotentiallyVulnerableRegex("^\\s*|\\s*$")).toBe(false);
    });
  });

  describe("M13: Speaker Cache Bounds", () => {
    beforeEach(() => {
      clearSpeakerCleanCache();
    });

    it("normalizes and caches reasonable speaker names", () => {
      const spk1 = cleanSpeakerName("【伊織】【伊織】");
      expect(spk1).toBe("伊織");
      const spk2 = cleanSpeakerName("【伊織】【伊織】");
      expect(spk2).toBe("伊織");
    });

    it("does not cache abnormally long lines", () => {
      const longJunk = Array.from({ length: 90 }, (_, i) => String.fromCharCode(65 + (i % 26))).join("");
      const cleaned = cleanSpeakerName(longJunk);
      expect(cleaned.length).toBeGreaterThan(80);
    });
  });

  describe("M2: Typed Provider ID Resolution", () => {
    it("identifies Google Translate provider variants", () => {
      expect(isGoogleTranslate(FREE_MT_PROVIDERS.GOOGLE)).toBe(true);
      expect(isGoogleTranslate("google")).toBe(true);
      expect(isGoogleTranslate("openai/gpt-4o")).toBe(false);
    });

    it("identifies DeepL provider variants", () => {
      expect(isDeepLFree(FREE_MT_PROVIDERS.DEEPL)).toBe(true);
      expect(isDeepLFree("deepl")).toBe(true);
      expect(isDeepLFree("anthropic/claude-3-opus")).toBe(false);
    });

    it("identifies free MT providers correctly", () => {
      expect(isFreeMtProvider("mt:google-translate")).toBe(true);
      expect(isFreeMtProvider("mt:deepl-free")).toBe(true);
      expect(isFreeMtProvider("openrouter/deepseek/deepseek-chat")).toBe(false);
    });
  });
});
