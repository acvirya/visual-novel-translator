import { invoke } from "@tauri-apps/api/core";
import { parseSpeakerMessageTranslation } from "./freeMtService";
import { logger } from "./loggerService";

export interface OpenRouterModelPricing {
  prompt: string;
  completion: string;
  image?: string;
  request?: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: OpenRouterModelPricing;
}

export interface OpenRouterKeyInfo {
  label?: string;
  usage: number; // in USD
  limit: number | null;
  is_free_tier: boolean;
  rate_limit?: {
    requests: number;
    interval: string;
  };
}

export interface OpenRouterTestResult {
  isValid: boolean;
  message: string;
  keyInfo?: OpenRouterKeyInfo;
}

export const DEFAULT_LIVE_SYSTEM_PROMPT =
  `You are an expert Visual Novel localizer translating Japanese dialogue to natural English.\nTranslate accurately, preserving character personality, emotional nuance, tone, and Japanese honorifics (-san, -kun, -chan, -senpai, -sensei) where appropriate.\n\n### Structured Output Schema Requirements:\nYou MUST ALWAYS respond with a valid, clean JSON object matching this schema:\n{\n  "translated_speaker": "Character name in English (or null if no speaker in input)",\n  "translated_message": "Natural English translation of the dialogue"\n}\n\nDo not include commentary or markdown wrapper outside the JSON object.`;

export const DEFAULT_BATCH_SYSTEM_PROMPT =
  "You are an expert Visual Novel script translator processing multiple dialogue entries.\nTranslate each dialogue line accurately while maintaining strict character voice consistency and context continuity across lines.\nPreserve JSON schema keys and line structure identically without omitting or modifying structure.";

/**
 * Format model input and output pricing per 1M tokens with up/down arrows
 */
export function formatModelPricing(pricing: OpenRouterModelPricing): {
  inputPerMillion: string;
  outputPerMillion: string;
  isFree: boolean;
} {
  const promptNum = parseFloat(pricing.prompt || "0") * 1000000;
  const completionNum = parseFloat(pricing.completion || "0") * 1000000;
  const isFree = promptNum === 0 && completionNum === 0;

  const formatPrice = (num: number) => {
    if (num === 0) return "$0";
    if (num < 0.01) return `$${num.toFixed(4)}`;
    if (num < 1) return `$${num.toFixed(2)}`;
    return `$${num.toFixed(2)}`;
  };

  return {
    inputPerMillion: isFree ? "$0" : formatPrice(promptNum),
    outputPerMillion: isFree ? "$0" : formatPrice(completionNum),
    isFree,
  };
}

let cachedModels: OpenRouterModel[] | null = null;

/**
 * Fetch available models from OpenRouter public API (No key required) with caching
 */
export async function fetchOpenRouterModels(forceRefresh = false): Promise<OpenRouterModel[]> {
  if (!forceRefresh && cachedModels && cachedModels.length > 50) {
    return cachedModels;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models");
    if (!response.ok) {
      throw new Error(`Failed to fetch models (HTTP ${response.status})`);
    }
    const json = await response.json();
    if (Array.isArray(json.data) && json.data.length > 0) {
      const parsedModels = json.data.map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        description: m.description || "",
        context_length: m.context_length || 0,
        pricing: {
          prompt: m.pricing?.prompt || "0",
          completion: m.pricing?.completion || "0",
        },
      }));
      cachedModels = parsedModels;
      try {
        localStorage.setItem("vn_cached_openrouter_models", JSON.stringify(parsedModels));
      } catch {}
      return parsedModels;
    }
  } catch (error: any) {
    console.warn("Failed to fetch live OpenRouter models, trying cache:", error);
  }

  // Fallback to localStorage cache if network fails
  try {
    const stored = localStorage.getItem("vn_cached_openrouter_models");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedModels = parsed;
        return parsed;
      }
    }
  } catch {}

  return cachedModels || [];
}

/**
 * Test and validate OpenRouter API Key using https://openrouter.ai/api/v1/auth/key
 */
export async function testOpenRouterKey(apiKey: string): Promise<OpenRouterTestResult> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    logger.warn("OpenRouter::Auth", "Verification failed: API key input is empty.");
    return { isValid: false, message: "API key cannot be empty." };
  }

  logger.info("OpenRouter::Auth", `Testing API key validation (${cleanKey.slice(0, 8)}...)...`);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cleanKey}`,
      },
    });

    if (response.status === 200) {
      const json = await response.json();
      const data = json.data || {};
      const keyInfo: OpenRouterKeyInfo = {
        label: data.label || "Default Key",
        usage: typeof data.usage === "number" ? data.usage : 0,
        limit: data.limit ?? null,
        is_free_tier: !!data.is_free_tier,
        rate_limit: data.rate_limit,
      };

      logger.info("OpenRouter::Auth", `API Key verified successfully! Label: ${keyInfo.label}, Usage: $${keyInfo.usage.toFixed(4)}`);

      return {
        isValid: true,
        message: "Key verified!",
        keyInfo,
      };
    } else if (response.status === 401) {
      logger.error("OpenRouter::Auth", "Unauthorized (401): Invalid OpenRouter API Key.");
      return {
        isValid: false,
        message: "Unauthorized (401): Invalid API Key. Please verify your OpenRouter key.",
      };
    } else {
      const errorText = await response.text().catch(() => "");
      logger.error("OpenRouter::Auth", `Validation failed HTTP ${response.status}: ${errorText}`);
      return {
        isValid: false,
        message: `Validation failed (HTTP ${response.status}): ${errorText || "Unknown response"}`,
      };
    }
  } catch (error: any) {
    logger.error("OpenRouter::Auth", `Network error connecting to OpenRouter auth: ${error?.message || error}`);
    return {
      isValid: false,
      message: `Network error connecting to OpenRouter: ${error?.message || error}`,
    };
  }
}

/**
 * Formats dialogue inputs into structured JSON for LLM requests
 */
export function formatStructuredDialogueInput(speaker: string | undefined, message: string): string {
  const cleanMsg = message.trim();
  const cleanSpk = speaker?.trim().replace(/^[【\[［<〈〔]|[\】\]］>〉〕]$/g, "").trim();

  if (cleanSpk) {
    return JSON.stringify({ speaker: cleanSpk, message: cleanMsg });
  }
  return JSON.stringify({ message: cleanMsg });
}

/**
 * Parses structured JSON response from LLM
 */
export function parseStructuredDialogueOutput(
  rawContent: string,
  originalSpeaker?: string
): { translatedSpeaker?: string; translatedMessage: string } {
  const text = rawContent.trim();
  let parsed: any = null;

  try {
    const cleanJson = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleanJson);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {}
    }
  }

  if (parsed && typeof parsed === "object") {
    let spk = parsed.translated_speaker ?? parsed.translatedSpeaker ?? parsed.speaker;
    let msg = parsed.translated_message ?? parsed.translatedMessage ?? parsed.message;

    if (spk === null || spk === "null" || spk === "") {
      spk = undefined;
    }

    if (msg && typeof msg === "string") {
      return {
        translatedSpeaker: spk ? String(spk).trim() : (originalSpeaker ? originalSpeaker.trim() : undefined),
        translatedMessage: String(msg).trim(),
      };
    }
  }

  // Resilient Fallback to Bracket/Colon Parser
  return parseSpeakerMessageTranslation(text, originalSpeaker);
}

/**
 * Generates an appended system prompt snippet from active Glossary Manager entries
 */
export function buildGlossarySystemPrompt(): string {
  try {
    const saved = localStorage.getItem("vn_glossary_entries_v1");
    if (!saved) return "";
    const entries: Array<{ original: string; translation: string; category?: string; notes?: string }> = JSON.parse(saved);
    if (!Array.isArray(entries) || entries.length === 0) return "";

    const lines = entries
      .filter((e) => e && e.original?.trim() && e.translation?.trim())
      .map((e) => `- "${e.original.trim()}" -> "${e.translation.trim()}"${e.category ? ` [Category: ${e.category}]` : ""}${e.notes ? ` (${e.notes})` : ""}`);

    if (lines.length === 0) return "";

    return `\n\n### Character & Translation Glossary (MANDATORY):
Strictly adhere to the following predefined translations whenever these Japanese names, terms, or phrases appear in dialogue or speaker fields:
${lines.join("\n")}

### Character Name Granularity & Addressing Rules:
1. **Dialogue & Spoken Names**:
   - When a character is called by **First / Given Name only** in Japanese (e.g., "智代", "智代ちゃん"), translate using the **First Name only** (e.g., "Tomoyo", "Tomoyo-chan"). **NEVER expand spoken dialogue to the full name** unless the full name was explicitly spoken in Japanese!
   - When a character is called by **Family / Last Name only** (e.g., "坂上", "坂上先輩"), translate using the **Last Name only** (e.g., "Sakagami", "Sakagami-senpai").
   - Only output the full name (e.g., "Tomoyo Sakagami") if the original Japanese text explicitly uses the full name (e.g., "坂上智代") or in formal introductions.

2. **Speaker Tag Granularity**:
   - Match the exact granularity of the Japanese speaker tag:
   - If the original speaker is a First Name only (e.g., "智代"), set translated_speaker to First Name only ("Tomoyo").
   - If the original speaker is a Last Name only (e.g., "坂上"), set translated_speaker to Last Name only ("Sakagami").
   - If the original speaker is a Full Name ("坂上 智代"), set translated_speaker to Full Name ("Tomoyo Sakagami").`;
  } catch {
    return "";
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Perform chat completion translation using OpenRouter with structured JSON inputs and outputs
 */
export async function translateWithOpenRouter(options: {
  apiKey: string;
  modelId: string;
  speaker?: string;
  message: string;
  systemPrompt?: string;
  temperature?: number;
  contextHistory?: { user: string; assistant: string }[];
}): Promise<{
  success: boolean;
  translatedSpeaker?: string;
  translatedMessage: string;
  rawText?: string;
  error?: string;
}> {
  const {
    apiKey,
    modelId,
    speaker,
    message,
    systemPrompt = DEFAULT_LIVE_SYSTEM_PROMPT,
    temperature = 0.3,
    contextHistory = [],
  } = options;

  const cleanKey = apiKey.trim();

  if (!cleanKey) {
    const err = "OpenRouter API Key is missing. Please set your API key in Translation Providers.";
    logger.error("OpenRouter::API", err);
    return {
      success: false,
      translatedMessage: message,
      error: err,
    };
  }

  // 1. Build Full System Prompt (Base + Glossary entries appended)
  const glossaryAddendum = buildGlossarySystemPrompt();
  const fullSystemPrompt = `${systemPrompt}${glossaryAddendum}`;

  // 2. Format Structured JSON Prompt
  const promptText = formatStructuredDialogueInput(speaker, message);

  // 3. Assemble Message History for Multi-Turn Context
  const messages: ChatMessage[] = [
    { role: "system", content: fullSystemPrompt },
  ];

  if (Array.isArray(contextHistory) && contextHistory.length > 0) {
    for (const turn of contextHistory) {
      if (turn.user && turn.assistant) {
        messages.push({ role: "user", content: turn.user });
        messages.push({ role: "assistant", content: turn.assistant });
      }
    }
  }

  // Append current user turn
  messages.push({ role: "user", content: promptText });

  logger.info(
    "OpenRouter::API",
    `Sending structured request to model: ${modelId} (${messages.length} messages, ${contextHistory.length} history turns)`
  );

  const startTime = Date.now();
  let content = "";
  let lastErr = "";
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const nativeRes = await invoke<string>("openrouter_chat_completion", {
        apiKey: cleanKey,
        modelId,
        messagesJson: JSON.stringify(messages),
        temperature,
      });

      if (nativeRes && nativeRes.trim()) {
        content = nativeRes.trim();
        const elapsed = Date.now() - startTime;
        logger.info(
          "OpenRouter::API",
          `Native structured response received in ${elapsed}ms: "${content.slice(0, 70)}..."`
        );
        break;
      }
    } catch (nativeErr: any) {
      const errStr = nativeErr?.message || String(nativeErr);
      lastErr = errStr;

      const isRateLimit = errStr.includes("429") || errStr.toLowerCase().includes("rate limit") || errStr.toLowerCase().includes("too many requests");
      const isTransient = errStr.includes("502") || errStr.includes("503") || errStr.includes("504") || errStr.includes("timeout");

      if ((isRateLimit || isTransient) && attempt < maxRetries) {
        const backoffMs = isRateLimit ? 1500 * Math.pow(2, attempt - 1) + Math.random() * 500 : 1000 * attempt;
        logger.warn(
          "OpenRouter::API",
          `Transient error (${errStr.slice(0, 60)}...). Retrying in ${(backoffMs / 1000).toFixed(1)}s (Attempt ${attempt}/${maxRetries})...`
        );
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      // If it's not a rate-limit/transient or max retries reached, break
      logger.error("OpenRouter::API", `OpenRouter API error: ${errStr}`);
      break;
    }
  }

  // If native failed or was unavailable, try fallback fetch as last resort
  if (!content) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cleanKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/acvirya/visual-novel-translator",
          "X-Title": "VN Translator Desktop",
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          temperature,
          response_format: { type: "json_object" },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        content = data.choices?.[0]?.message?.content?.trim() || "";
      }
    } catch {
      // Ignored if fetch fails
    }
  }

  if (!content) {
    const errMsg = lastErr ? `OpenRouter error: ${lastErr}` : "Empty completion content returned from OpenRouter";
    logger.error("OpenRouter::API", errMsg);
    return {
      success: false,
      translatedMessage: message,
      error: errMsg,
    };
  }

  // Safely parse structured JSON (translated_speaker and translated_message)
  const { translatedSpeaker, translatedMessage } = parseStructuredDialogueOutput(content, speaker);

  return {
    success: true,
    translatedSpeaker,
    translatedMessage,
    rawText: content,
  };
}
