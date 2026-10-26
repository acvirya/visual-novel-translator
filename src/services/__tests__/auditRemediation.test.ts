// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { settingsManager } from "../settingsManager";
import { scriptManagerService } from "../scriptManagerService";
import { compileOverlayTemplate } from "../../utils/overlayTemplateEngine";
import { parseSpeakerMessageTranslation } from "../freeMtService";

describe("Audit Remediation Suite (Analysis.md Findings)", () => {
  describe("CRIT-01: Keyring Race Condition Prevention", () => {
    it("should resolve ensureReady() and return valid key without crashing", async () => {
      await expect(settingsManager.ensureReady()).resolves.toBeUndefined();
      const openRouterKey = await settingsManager.getApiKey("openrouter");
      expect(typeof openRouterKey).toBe("string");
    });
  });

  describe("CRIT-03 & CRIT-06: Script Database Flush & State Immutability", () => {
    it("should return an immutable copy of entries from getState()", () => {
      const state1 = scriptManagerService.getState();
      const originalLength = state1.entries.length;

      // Attempt external mutation
      (state1.entries as any).push({ id: "hacked", message: "illegal" });

      // Second getState() call must NOT contain the mutated item
      const state2 = scriptManagerService.getState();
      expect(state2.entries.length).toBe(originalLength);
      expect(state2.entries.find((e) => e.id === "hacked")).toBeUndefined();
    });

    it("should provide flushPendingSaves() and dispose() without error", async () => {
      await expect(scriptManagerService.flushPendingSaves()).resolves.toBeUndefined();
      await expect(scriptManagerService.dispose()).resolves.toBeUndefined();
    });
  });

  describe("SERI-09: Safe Template Engine Token Interpolation", () => {
    it("should safely interpolate dialogue containing dollar signs without mangling", () => {
      const template = `<div class="msg">{{translatedMessage}}</div>`;
      const dialogue = {
        message: "Original $100",
        translatedMessage: "Price is $100 and $2 for tax ($& symbols)",
      };

      const compiled = compileOverlayTemplate(template, dialogue as any);
      expect(compiled).toContain("Price is $100 and $2 for tax ($&amp; symbols)");
    });
  });

  describe("MIN-06 & SERI-06: Unicode-Aware Speaker Parsing in FreeMT", () => {
    it("should properly extract complex kanji and unicode bracketed speaker names", () => {
      const input = "【坂上 智代】「おはよう、朋也。」";
      const result = parseSpeakerMessageTranslation(input, "坂上 智代");

      expect(result.translatedSpeaker).toBe("坂上 智代");
      expect(result.translatedMessage).toBe("「おはよう、朋也。」");
    });
  });
});
