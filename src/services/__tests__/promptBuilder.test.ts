import { describe, it, expect, beforeEach } from "vitest";
import {
  formatStructuredDialogueInput,
  parseStructuredDialogueOutput,
  buildGlossarySystemPrompt,
} from "../promptBuilder";
import { settingsManager } from "../settingsManager";

describe("promptBuilder", () => {
  beforeEach(() => {
    settingsManager.resetSettings();
  });

  it("sanitizes null bytes and speaker brackets in formatStructuredDialogueInput", () => {
    const res = formatStructuredDialogueInput("【Tomoyo\0】", "Hello\0 World! ");
    const parsed = JSON.parse(res);
    expect(parsed.speaker).toBe("Tomoyo");
    expect(parsed.message).toBe("Hello World!");
  });

  it("handles empty speaker gracefully", () => {
    const res = formatStructuredDialogueInput(undefined, "Narration line");
    const parsed = JSON.parse(res);
    expect(parsed.speaker).toBeUndefined();
    expect(parsed.message).toBe("Narration line");
  });

  it("sanitizes multi-line newlines and quotes in buildGlossarySystemPrompt", () => {
    settingsManager.updateGlossary({
      terms: [
        {
          id: "term_1",
          original: 'Sword of "Light"',
          translation: 'Pedang "Cahaya"',
          category: "Weapon\nRare",
          notes: "Legendary item\r\nUsed by Hero",
        },
      ],
    });

    const prompt = buildGlossarySystemPrompt();
    expect(prompt).toContain('Sword of \\"Light\\"');
    expect(prompt).toContain('Pedang \\"Cahaya\\"');
    expect(prompt).toContain("[Category: Weapon Rare]");
    expect(prompt).toContain("(Legendary item Used by Hero)");
    // Must be a single list item without internal line breaks
    const lines = prompt.split("\n").filter((l) => l.startsWith("- "));
    expect(lines.length).toBe(1);
  });

  it("parses structured dialogue JSON output accurately with fallbacks", () => {
    const raw = '```json\n{"translated_speaker": "Tomoyo", "translated_message": "Aku mencintaimu."}\n```';
    const parsed = parseStructuredDialogueOutput(raw, "智代");
    expect(parsed.translatedSpeaker).toBe("Tomoyo");
    expect(parsed.translatedMessage).toBe("Aku mencintaimu.");
  });

  it("repairs malformed JSON output via jsonrepair fallback", () => {
    const malformed = '{"translated_speaker": "Tomoyo", "translated_message": "Trailing comma problem",}';
    const parsed = parseStructuredDialogueOutput(malformed);
    expect(parsed.translatedMessage).toBe("Trailing comma problem");
  });
});
