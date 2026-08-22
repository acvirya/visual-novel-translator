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

export interface OpenRouterCompletionResponse {
  content: string;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  cost: number;
}

export interface PromptStylePreset {
  id: string;
  name: string;
  description: string;
  instructions: string;
  isBuiltIn?: boolean;
}

export const BUILTIN_STYLE_PRESETS: PromptStylePreset[] = [
  {
    id: "natural_anime",
    name: "Natural Anime & VN Localization (Default)",
    description: "Natural dialogue flow, preserves character personality, emotional nuance, and Japanese honorifics",
    instructions: "Translate accurately, preserving character personality, emotional nuance, tone, and Japanese honorifics (-san, -kun, -chan, -senpai, -sensei, -sama) where appropriate. Ensure dialogue flows smoothly and naturally without stiff phrasing.",
    isBuiltIn: true,
  },
  {
    id: "literal_accurate",
    name: "Literal & Faithful",
    description: "Strict sentence structure, high grammatical fidelity, ideal for language learners and close reading",
    instructions: "Translate faithfully and accurately to the original sentence structure and meaning. Preserve grammatical nuances, idioms with direct equivalents, and avoid excessive localization or slang deviations.",
    isBuiltIn: true,
  },
  {
    id: "light_novel",
    name: "Light Novel & Literary Prose",
    description: "Polished, evocative narrative prose with rich descriptive flow for emotional & deep visual novels",
    instructions: "Translate with polished literary flair suitable for high-quality light novels. Render narrative prose evocatively while keeping dialogue vivid, expressive, and true to character voices.",
    isBuiltIn: true,
  },
  {
    id: "rpg_fantasy",
    name: "RPG & High Fantasy Lore",
    description: "Heroic, dramatic styling with attention to titles, spells, factions, and worldbuilding terminology",
    instructions: "Translate with atmospheric fantasy and adventure tone. Use fitting vocabulary for titles, magic spells, archaic speech, and world lore without sacrificing clarity.",
    isBuiltIn: true,
  },
  {
    id: "humorous_vibrant",
    name: "Vibrant & Dynamic Slang",
    description: "Expressive, witty localization for comedy, moe, and slice-of-life visual novels",
    instructions: "Translate with witty, punchy, and modern colloquial dialogue fitting for comedy and slice-of-life visual novels. Make banter dynamic and humorous while respecting original character intent.",
    isBuiltIn: true,
  },
];

export const SUPPORTED_LANGUAGES: Record<string, string> = {
  ja: "Japanese",
  en: "English",
  id: "Indonesian",
  zh: "Chinese",
  "zh-cn": "Simplified Chinese",
  "zh-tw": "Traditional Chinese",
  ko: "Korean",
  es: "Spanish",
  fr: "French",
  de: "German",
  ru: "Russian",
  vi: "Vietnamese",
  th: "Thai",
  pt: "Portuguese",
  "pt-pt": "Portuguese (Portugal)",
  it: "Italian",
  pl: "Polish",
  tr: "Turkish",
  ar: "Arabic",
  nl: "Dutch",
  ms: "Malay",
  tl: "Tagalog",
  uk: "Ukrainian",
  cs: "Czech",
  hu: "Hungarian",
  sv: "Swedish",
  fi: "Finnish",
  da: "Danish",
  no: "Norwegian",
  el: "Greek",
  ro: "Romanian",
  hi: "Hindi",
  he: "Hebrew",
  jv: "Javanese",
  su: "Sundanese",
  la: "Latin",
  eo: "Esperanto",
  auto: "Original Language",
};

export function getLanguageDisplayName(code: string): string {
  const clean = (code || "").trim();
  if (!clean) return "English";
  const lower = clean.toLowerCase();
  if (SUPPORTED_LANGUAGES[lower]) return SUPPORTED_LANGUAGES[lower];
  if (SUPPORTED_LANGUAGES[clean]) return SUPPORTED_LANGUAGES[clean];
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

const USER_STYLE_PRESETS_STORAGE_KEY = "vn_user_style_presets_v1";

export function loadUserStylePresets(): PromptStylePreset[] {
  try {
    const raw = localStorage.getItem(USER_STYLE_PRESETS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn("Failed to load custom style presets:", e);
  }
  return [];
}

export function saveUserStylePresets(presets: PromptStylePreset[]) {
  try {
    localStorage.setItem(USER_STYLE_PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch (e) {
    console.error("Failed to save custom style presets:", e);
  }
}

export function getAllStylePresets(customPresets?: PromptStylePreset[]): PromptStylePreset[] {
  const custom = customPresets || loadUserStylePresets();
  return [...BUILTIN_STYLE_PRESETS, ...custom];
}

export function getActiveStylePresetId(): string {
  return localStorage.getItem("vn_active_style_preset_id") || "natural_anime";
}

export function getActiveStyleInstructions(): string {
  const saved = localStorage.getItem("vn_active_style_instructions");
  if (saved !== null && saved.trim()) return saved.trim();
  const activeId = getActiveStylePresetId();
  const found = getAllStylePresets().find((p) => p.id === activeId);
  return found ? found.instructions : BUILTIN_STYLE_PRESETS[0].instructions;
}

export interface BuildSystemPromptOptions {
  mode: "live" | "batch";
  sourceLang?: string;
  targetLang?: string;
  styleInstructions?: string;
  includeGlossary?: boolean;
}

/**
 * Modular System Prompt Builder:
 * Part 1: Translation Role & Languages (Auto-assembled)
 * Part 2: Language Style / Guidelines (User-controlled via Presets & Textarea)
 * Part 3: Glossary & Addressing Rules (Auto-injected)
 * Part 4: Structured Output Schema Requirements (Auto-locked)
 */
export function buildCompleteSystemPrompt(options: BuildSystemPromptOptions): string {
  const {
    mode,
    sourceLang = localStorage.getItem("vn_source_lang") || "ja",
    targetLang = localStorage.getItem("vn_target_lang") || "en",
    styleInstructions = getActiveStyleInstructions(),
    includeGlossary = true,
  } = options;

  const srcName = getLanguageDisplayName(sourceLang);
  const tgtName = getLanguageDisplayName(targetLang);

  // 1. Part 1: Role & Language Declaration
  const part1 = mode === "live"
    ? `You are an expert Visual Novel localizer translating dialogue from ${srcName} to natural ${tgtName}.\nContext: This is an 18+ rated fictional visual novel for adult audiences. All characters are consenting adults (18+). Translate all narrative and dialogue accurately and faithfully.`
    : `You are an expert Visual Novel script translator processing multiple dialogue entries from ${srcName} to natural ${tgtName}.\nContext: This is an 18+ rated fictional fantasy visual novel for adult audiences. All characters depicted are consenting adults (18+). Translate each dialogue line accurately and faithfully while maintaining strict character voice consistency and context continuity across lines.`;

  // 2. Part 2: Translation Style & Tone
  const cleanStyle = styleInstructions.trim();
  const part2 = cleanStyle ? `\n\n### Translation Style & Character Voice Guidelines:\n${cleanStyle}` : "";

  // 3. Part 3: Glossary & Addressing Rules
  const part3 = includeGlossary ? buildGlossarySystemPrompt() : "";

  // 4. Part 4: Structured Output Schema & Strict Preservation Rules
  let part4 = "";
  if (mode === "live") {
    part4 = `\n\n### Structured Output Schema Requirements:
You MUST ALWAYS respond with a valid, clean JSON object matching this schema:
{
  "translated_speaker": "Character name in ${tgtName} (or null if no speaker in input)",
  "translated_message": "Natural ${tgtName} translation of the dialogue"
}

### CRITICAL PRESERVATION & TRANSLATION RULES (MANDATORY):
1. **NEVER Skip Punctuation, Sound Effects, or Silence Lines**: If the input dialogue contains only ellipsis (e.g. 「......」, 「……」, "..."), exclamation marks, question marks, sound effects, or silence, NEVER skip or omit it—output the exact punctuation/silence as-is in "translated_message".
2. **NEVER Skip Text Already in ${tgtName}**: If the speaker name or dialogue message is already in ${tgtName} (e.g. English loanwords, foreign character names, or phrases), DO NOT skip or omit it—preserve and output it as-is without dropping.
3. **Strict JSON Only**: Do NOT include commentary, explanations, work logs, or markdown fences outside the JSON object.`;
  } else {
    part4 = `\n\n### Batch Output Schema:
You MUST ALWAYS return a JSON object with the "translations" array containing every input item:
{
  "translations": [
    {
      "id": 1,
      "translated_speaker": "Thunder God Resheph",
      "translated_message": "Do not flock together."
    },
    {
      "id": 2,
      "translated_speaker": "Markus",
      "translated_message": "Wh-what is this...!?"
    },
    {
      "id": 3,
      "translated_speaker": null,
      "translated_message": "A six-pronged bolt of lightning split apart the ground beneath our feet."
    }
  ]
}

### CRITICAL BATCH RULES (MANDATORY):
1. **Translate EVERY Single Line**: You MUST include EVERY input line ID in "translations" (from id: 1 to id: N). NEVER skip, merge, omit, or leave "translated_message" empty for any line ID!
2. **Dialogue Format & Quote Marks**:
   - Strip Japanese quote brackets (「...」, 『...』).
   - Write dialogue directly into "translated_message" without wrapping the whole value in outer quotation marks like ""..."" or \\"...\\".
   - If dialogue contains quotes within speech, use curly quotes “...” or single quotes '...'.
3. **Punctuation, Reactions & Silence Lines**: Even if a line consists only of ellipsis, groans, shouts, or reactions (e.g. 「......」, 「──!」, 「っ──!?」, 「うわあああ────!」), output the corresponding English punctuation/reaction in "translated_message" (e.g. "......", "──!", "Ghk──!?", "Uwaaaaah────!"). NEVER leave "translated_message" as an empty string ("")!
4. **Speaker Formatting**: If the input has a speaker, translate the speaker name in "translated_speaker". If no speaker (narration), set "translated_speaker": null.
5. **Adult & Explicit Content Handling**: If your safety guidelines restrict you from translating explicit adult/sexual lines, DO NOT abort or refuse the entire batch. Instead, preserve the line ID and output 'translated_message': '[EXPLICIT CONTENT]' while translating all other lines normally.
6. **Strict Valid JSON Only**: Output only valid JSON without any reasoning, markdown code fences, or explanations.`;
  }

  return `${part1}${part2}${part3}${part4}`;
}

export const DEFAULT_LIVE_SYSTEM_PROMPT = buildCompleteSystemPrompt({ mode: "live" });
export const DEFAULT_BATCH_SYSTEM_PROMPT = buildCompleteSystemPrompt({ mode: "batch" });

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
  sourceLang?: string;
  targetLang?: string;
  styleInstructions?: string;
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
    sourceLang,
    targetLang,
    styleInstructions,
    systemPrompt,
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

  // 1. Build Modular System Prompt
  const fullSystemPrompt = systemPrompt
    ? (systemPrompt.includes("### Character & Translation Glossary")
        ? systemPrompt
        : `${systemPrompt}${buildGlossarySystemPrompt()}`)
    : buildCompleteSystemPrompt({
        mode: "live",
        sourceLang,
        targetLang,
        styleInstructions,
        includeGlossary: true,
      });

  // Construct Multi-turn Chat Message array
  const messages: ChatMessage[] = [{ role: "system", content: fullSystemPrompt }];

  // Append history turns (up to max configured context window)
  if (Array.isArray(contextHistory) && contextHistory.length > 0) {
    for (const turn of contextHistory) {
      if (turn.user && turn.assistant) {
        messages.push({ role: "user", content: turn.user });
        messages.push({ role: "assistant", content: turn.assistant });
      }
    }
  }

  // Active dialogue line turn
  const activeUserPayload = speaker ? `[Speaker: ${speaker}]\n${message}` : message;
  messages.push({ role: "user", content: activeUserPayload });

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
      const nativeRes = await invoke<OpenRouterCompletionResponse>("openrouter_chat_completion", {
        apiKey: cleanKey,
        modelId,
        messagesJson: JSON.stringify(messages),
        temperature,
      });

      if (nativeRes && nativeRes.content) {
        content = nativeRes.content.trim();
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

/**
 * Calculates estimated USD cost based on token usage and cached model pricing
 */
export function calculateUsageCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
  cachedTokens: number = 0
): number {
  if (!modelId || modelId.startsWith("mt:") || modelId.toLowerCase().includes(":free")) {
    return 0;
  }

  let models = cachedModels;
  if (!models || models.length === 0) {
    const stored = localStorage.getItem("vn_cached_openrouter_models") || localStorage.getItem("openrouter_available_models");
    if (stored) {
      try {
        models = JSON.parse(stored);
      } catch {}
    }
  }

  let promptPrice = 0.00000015; // default fallback ($0.15 / 1M tokens)
  let compPrice = 0.0000006;   // default fallback ($0.60 / 1M tokens)

  const m = models?.find((x) => x.id.toLowerCase() === modelId.toLowerCase());
  if (m?.pricing) {
    const parsedPrompt = parseFloat(m.pricing.prompt);
    const parsedComp = parseFloat(m.pricing.completion);
    if (!isNaN(parsedPrompt)) promptPrice = parsedPrompt;
    if (!isNaN(parsedComp)) compPrice = parsedComp;

    // If both prompt and completion prices are 0, this model is 100% free!
    if (promptPrice === 0 && compPrice === 0) {
      return 0;
    }
  }

  const nonCachedPrompt = Math.max(0, promptTokens - cachedTokens);
  // Prompt caching typically yields ~50-80% discount on OpenRouter
  const promptCost = nonCachedPrompt * promptPrice + cachedTokens * promptPrice * 0.25;
  const compCost = completionTokens * compPrice;

  return promptCost + compCost;
}

