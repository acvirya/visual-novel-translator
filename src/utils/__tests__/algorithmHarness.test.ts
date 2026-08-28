/**
 * Algorithmic Verification Test Harness
 * Tests:
 * 1. Speaker & Dialogue Extraction
 * 2. Script File Parser (JSON, JSONL, TXT, TSV)
 * 3. Batch LLM JSON Parser (Refusals, doubled quotes, fences)
 * 4. Fuzzy Matcher (Levenshtein & Bigrams)
 */

import { extractSpeakerAndDialogue, cleanSpeakerName } from "../textPreprocessor";
import { parseScriptFileContent } from "../scriptFileParser";
import { parseLlmBatchResponse } from "../batchJsonParser";
import { calcLevenshteinDistance } from "../../services/scriptManagerService";
import { getLanguageName } from "../../constants/languages";
import { sanitizeCustomCss } from "../overlayTemplateEngine";

export function runAllSelfTests(): { passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  const assert = (condition: boolean, testName: string) => {
    if (condition) {
      passed++;
    } else {
      failed++;
      errors.push(`FAILED: ${testName}`);
    }
  };

  // Test 1: Speaker Extraction
  const spk1 = extractSpeakerAndDialogue("【智代】「早く教室に行こう」");
  assert(spk1.speaker === "智代" && spk1.message.includes("早く教室に行こう"), "Speaker Bracket Prefix Extraction");

  const spk2 = extractSpeakerAndDialogue("「早く行こう」智代");
  assert(spk2.speaker === "智代", "Suffix Speaker Extraction");

  // Test 2: Clean Speaker Name
  const cleanSpk = cleanSpeakerName("【坂上 智代】");
  assert(cleanSpk === "坂上 智代", "Clean Speaker Name brackets strip");

  // Test 3: Script File Parser
  const jsonlContent = `{"id": 1, "speaker": "智代", "message": "おはよう", "translated_message": "Good morning"}\n{"id": 2, "message": "いい天気だね", "translated_message": "Nice weather"}`;
  const parsedJsonl = parseScriptFileContent(jsonlContent);
  assert(parsedJsonl.length === 2 && parsedJsonl[0].translatedMessage === "Good morning", "Parse JSONL script lines");

  // Test 4: Batch LLM JSON Parser (doubled quotes & fences)
  const llmOutput = "```json\n[\n  {\"id\": 1, \"translated_message\": \"\"Hello World\"\"}\n]\n```";
  const parsedLlm = parseLlmBatchResponse(llmOutput, [{ id: 1, originalMessage: "こんにちは" }]);
  assert(parsedLlm.length === 1 && Boolean(parsedLlm[0].translated_message?.includes("Hello World")), "Parse LLM doubled quotes with fences");

  // Test 5: Levenshtein Distance
  const dist = calcLevenshteinDistance("智代", "智世");
  assert(dist === 1, "Levenshtein distance 1 substitution");

  // Test 6: Universal Language Registry
  const langJa = getLanguageName("ja");
  assert(langJa === "Japanese", "Get language name Japanese from code 'ja'");

  // Test 7: Custom CSS Sanitizer
  const unsafeCss = "body { background: red; behavior: url(test.htc); } @import url('evil.css');";
  const sanitizedCss = sanitizeCustomCss(unsafeCss);
  assert(!sanitizedCss.includes("behavior:") && !sanitizedCss.includes("@import"), "Sanitize unsafe CSS expressions and imports");

  return { passed, failed, errors };
}
