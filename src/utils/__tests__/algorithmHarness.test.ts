import { describe, it, expect } from "vitest";
import { extractSpeakerAndDialogue, cleanSpeakerName } from "../textPreprocessor";
import { parseScriptFileContent } from "../scriptFileParser";
import { parseLlmBatchResponse } from "../batchJsonParser";
import { calcLevenshteinDistance } from "../../services/scriptManagerService";
import { getLanguageName } from "../../constants/languages";
import { sanitizeCustomCss } from "../overlayTemplateEngine";
import {
  isReasoningModel,
  buildReasoningPayload,
  getModelReasoningCapabilities,
  formatReasoningEffortLabel,
  getModelPreferredReasoningEffort,
  setModelPreferredReasoningEffort,
} from "../../services/openRouterService";

describe("Algorithm Verification Test Harness", () => {
  it("extracts speaker prefix and dialogue correctly", () => {
    const spk1 = extractSpeakerAndDialogue("【智代】「早く教室に行こう」");
    expect(spk1.speaker).toBe("智代");
    expect(spk1.message).toContain("早く教室に行こう");
  });

  it("extracts speaker suffix correctly", () => {
    const spk2 = extractSpeakerAndDialogue("「早く行こう」智代");
    expect(spk2.speaker).toBe("智代");
  });

  it("cleans speaker name brackets", () => {
    const cleanSpk = cleanSpeakerName("【坂上 智代】");
    expect(cleanSpk).toBe("坂上 智代");
  });

  it("parses JSONL script lines accurately", () => {
    const jsonlContent = `{"id": 1, "speaker": "智代", "message": "おはよう", "translated_message": "Good morning"}\n{"id": 2, "message": "いい天気だね", "translated_message": "Nice weather"}`;
    const parsedJsonl = parseScriptFileContent(jsonlContent);
    expect(parsedJsonl).toHaveLength(2);
    expect(parsedJsonl[0].translatedMessage).toBe("Good morning");
  });

  it("parses batch LLM output with doubled quotes and code fences", () => {
    const llmOutput = "```json\n[\n  {\"id\": 1, \"translated_message\": \"\"Hello World\"\"}\n]\n```";
    const parsedLlm = parseLlmBatchResponse(llmOutput, [{ id: 1, originalMessage: "こんにちは" }]);
    expect(parsedLlm).toHaveLength(1);
    expect(parsedLlm[0].translated_message).toContain("Hello World");
  });

  it("calculates Levenshtein distance accurately", () => {
    const dist = calcLevenshteinDistance("智代", "智世");
    expect(dist).toBe(1);
  });

  it("resolves language names from ISO codes", () => {
    expect(getLanguageName("ja")).toBe("Japanese");
    expect(getLanguageName("id")).toBe("Indonesian");
    expect(getLanguageName("en")).toBe("English");
  });

  it("sanitizes unsafe CSS expressions and imports", () => {
    const unsafeCss = "body { background: red; behavior: url(test.htc); } @import url('evil.css');";
    const sanitizedCss = sanitizeCustomCss(unsafeCss);
    expect(sanitizedCss).not.toContain("behavior:");
    expect(sanitizedCss).not.toContain("@import");
  });

  it("correctly identifies reasoning models", () => {
    expect(isReasoningModel("deepseek/deepseek-r1")).toBe(true);
    expect(isReasoningModel("openai/o1")).toBe(true);
    expect(isReasoningModel("openai/o3-mini")).toBe(true);
    expect(isReasoningModel("anthropic/claude-3-7-sonnet")).toBe(true);
    expect(isReasoningModel("google/gemini-2.0-flash-thinking-exp:free")).toBe(true);
    expect(isReasoningModel("google/gemini-1.5-flash")).toBe(false);
  });

  it("dynamically resolves model reasoning capabilities for various OpenRouter schemas", () => {
    // 1. Model with supports_max_tokens (e.g. Claude 3.7 Sonnet)
    const cap1 = getModelReasoningCapabilities({
      id: "anthropic/claude-3.7-sonnet",
      name: "Claude 3.7 Sonnet",
      context_length: 200000,
      pricing: { prompt: "0", completion: "0" },
      reasoning: {
        mandatory: false,
        default_enabled: true,
        supports_max_tokens: true,
      },
    });
    expect(cap1.isSupported).toBe(true);
    expect(cap1.mode).toBe("toggle_only");
    expect(cap1.supportsMaxTokens).toBe(true);
    expect(cap1.isMandatory).toBe(false);

    // 2. Model with 3 supported efforts (max, high, low)
    const cap2 = getModelReasoningCapabilities({
      id: "openai/o3-max",
      name: "OpenAI o3-max",
      context_length: 200000,
      pricing: { prompt: "0", completion: "0" },
      reasoning: {
        mandatory: true,
        default_enabled: true,
        supported_efforts: ["max", "high", "low"],
        default_effort: "max",
      },
    });
    expect(cap2.isSupported).toBe(true);
    expect(cap2.mode).toBe("efforts_list");
    expect(cap2.supportedEfforts).toEqual(["max", "high", "low"]);
    expect(cap2.defaultEffort).toBe("max");
    expect(cap2.isMandatory).toBe(true);

    // 3. Model with 5 supported efforts (xhigh, high, medium, low, minimal)
    const cap3 = getModelReasoningCapabilities({
      id: "openai/o1-mini-reasoning",
      name: "OpenAI o1 Mini",
      context_length: 128000,
      pricing: { prompt: "0", completion: "0" },
      reasoning: {
        mandatory: true,
        supported_efforts: ["xhigh", "high", "medium", "low", "minimal"],
        default_effort: "medium",
      },
    });
    expect(cap3.isSupported).toBe(true);
    expect(cap3.mode).toBe("efforts_list");
    expect(cap3.supportedEfforts).toHaveLength(5);
    expect(cap3.defaultEffort).toBe("medium");

    // 4. Model with no reasoning support
    const cap4 = getModelReasoningCapabilities({
      id: "meta-llama/llama-3.1-8b-instruct",
      name: "Llama 3.1 8B",
      context_length: 128000,
      pricing: { prompt: "0", completion: "0" },
    });
    expect(cap4.isSupported).toBe(false);
    expect(cap4.mode).toBe("none");
  });

  it("builds valid OpenRouter reasoning payload", () => {
    const payload = buildReasoningPayload({ effort: "low", maxTokens: 2048, exclude: true });
    expect(payload).toEqual({
      effort: "low",
      max_tokens: 2048,
      exclude: true,
    });
  });

  it("formats reasoning effort labels cleanly without parentheses", () => {
    expect(formatReasoningEffortLabel("none")).toBe("Off");
    expect(formatReasoningEffortLabel("max")).toBe("Max");
    expect(formatReasoningEffortLabel("high")).toBe("High");
    expect(formatReasoningEffortLabel("medium")).toBe("Medium");
    expect(formatReasoningEffortLabel("low")).toBe("Low");
    expect(formatReasoningEffortLabel("minimal")).toBe("Minimal");
    expect(formatReasoningEffortLabel("xhigh")).toBe("Xhigh");
    expect(formatReasoningEffortLabel("default")).toBe("Default");
  });

  it("stores and retrieves model-specific preferred reasoning effort", () => {
    // Setup clean mock localStorage for headless environment
    const storage: Record<string, string> = {};
    (globalThis as any).window = {};
    (globalThis as any).localStorage = {
      getItem: (key: string) => storage[key] || null,
      setItem: (key: string, val: string) => { storage[key] = val; },
      removeItem: (key: string) => { delete storage[key]; },
    };

    setModelPreferredReasoningEffort("google/gemini-2.5-flash-thinking-exp:free", "medium");
    expect(getModelPreferredReasoningEffort("google/gemini-2.5-flash-thinking-exp:free")).toBe("medium");

    setModelPreferredReasoningEffort("openai/o3-mini", "low");
    expect(getModelPreferredReasoningEffort("openai/o3-mini")).toBe("low");
    expect(getModelPreferredReasoningEffort("google/gemini-2.5-flash-thinking-exp:free")).toBe("medium");

    // Setting to default removes the model override
    setModelPreferredReasoningEffort("openai/o3-mini", "default");
    expect(getModelPreferredReasoningEffort("openai/o3-mini")).toBeUndefined();
  });
});

