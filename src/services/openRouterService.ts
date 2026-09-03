import { invoke } from "@tauri-apps/api/core";
import { jsonrepair } from "jsonrepair";
import { parseSpeakerMessageTranslation } from "./freeMtService";
import { logger } from "./loggerService";
import { settingsManager } from "./settingsManager";
import { ReasoningEffort } from "../types";
import { LlmProviderRegistry } from "./providers/llmProviderRegistry";
import { LlmDispatcherService } from "./providers/llmDispatcherService";

export interface OpenRouterModelPricing {
  prompt: string;
  completion: string;
  image?: string;
  request?: string;
  input_cache_read?: string;
  input_cache_write?: string;
}

export interface OpenRouterModelReasoning {
  mandatory?: boolean;
  default_enabled?: boolean;
  supported_efforts?: string[];
  default_effort?: string;
  supports_max_tokens?: boolean;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: OpenRouterModelPricing;
  supported_parameters?: string[];
  architecture?: {
    modality?: string;
    instruct_type?: string;
    reasoning?: boolean | OpenRouterModelReasoning;
  };
  reasoning?: OpenRouterModelReasoning;
}

export interface OpenRouterEndpoint {
  name: string;
  provider_name: string;
  context_length?: number;
  pricing?: {
    prompt: string;
    completion: string;
    input_cache_read?: string;
    input_cache_write?: string;
    request?: string;
  };
  quantization?: string;
  status?: number;
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
    description: "Fluent dialogue flow, preserves character personality, Japanese honorifics, and expressive punctuation",
    instructions: `1. General Tone & Dialogue Flow:
- Deliver fluent, dynamic, and idiomatic dialogue that sounds natural to native speakers while strictly preserving the emotional weight, subtext, and pacing of the original Japanese visual novel.
- Distinguish clearly between internal monologues (reflective, introspective) and spoken lines (punchy, expressive, conversational).

2. Japanese Honorifics & Addressing Register:
- Preserve standard Japanese honorific suffixes attached via hyphens (e.g., -san, -kun, -chan, -senpai, -sensei, -sama, -dono, -tan, -shi).
- Preserve cultural kinship addressing forms when used as names or titles (e.g., Onii-san, Onee-chan, Senpai, Sensei) unless the glossary specifies otherwise.
- Reflect the attitude and politeness level behind first/second-person pronouns (Ore vs. Boku vs. Watashi vs. Atashi; Anta vs. Omae vs. Anata vs. Kisama) through word choice and sentence stance.

3. Character Archetypes & Personality Nuances:
- Faithfully express distinct character archetypes (e.g., Tsundere, Kuudere, Gyaru, Ojou-sama, Bokukko, Chuunibyou, Delinquent, Polite Kouhai).
- Do not flatten unique verbal tics, polite keigo/desu-masu speech, or deliberate casual roughness into generic, uniform English.

4. Punctuation & Expressive Emotion:
- Retain expressive punctuation conventions: stuttering/hesitation (e.g., "W-What...", "I-I didn't..."), emotional ellipses ("……"), exclamation-question combos ("！？" -> "!?"), wave dashes ("~" / "〜"), and dramatic trailing em-dashes ("――").`,
    isBuiltIn: true,
  },
  {
    id: "literal_accurate",
    name: "Literal & Faithful",
    description: "Strict sentence structure, high grammatical fidelity, ideal for language learners and close reading",
    instructions: `1. Strict Semantic & Syntactic Fidelity:
- Translate with utmost precision and grammatical fidelity to the original Japanese sentence structure and clause relationships.
- Prioritize exact semantic meaning and factual accuracy over creative embellishment or westernized colloquial adaptation.

2. Terminology & Metaphor Handling:
- Retain Japanese cultural idioms, proverbs, and metaphorical expressions with their direct linguistic equivalents rather than replacing them with western pop-culture analogies.
- Translate formal keigo registers, passive constructions, and causative forms as closely as possible to their literal Japanese grammatical intent.

3. Name and Kinship Preservation:
- Keep all character names, honorific suffixes (-san, -kun, -chan, -sama, etc.), and kinship terms (Onii-chan, Onee-sama, Ojisan, Oba-san) in standard Hepburn Romaji.
- Never convert traditional Japanese family addressing into western equivalents (e.g., do not translate 'Onii-chan' to 'Bro' or 'Brother').`,
    isBuiltIn: true,
  },
  {
    id: "light_novel",
    name: "Light Novel & Literary Prose",
    description: "Polished, evocative narrative prose with rich descriptive flow for emotional & deep visual novels",
    instructions: `1. Evocative Literary Atmosphere:
- Render descriptive narrative prose with rich, evocative, and sensory prose style reminiscent of professionally published light novels and literary fiction.
- Employ elevated vocabulary, elegant rhythmic pacing, and vivid descriptive imagery to heighten tension, romance, or melancholy.

2. Dynamic Narrative vs. Character Dialogue:
- Maintain a sharp stylistic distinction between polished descriptive prose and vivid, character-driven spoken dialogue.
- Elevate poetic, philosophical, and dramatic passages while ensuring character conversations remain natural, emotionally resonant, and true to character voices.

3. Emotional Subtext & Pacing:
- Capture subtle psychological tension, unspoken romantic tension, and dramatic pauses with graceful prose flow.`,
    isBuiltIn: true,
  },
  {
    id: "rpg_fantasy",
    name: "RPG & High Fantasy Lore",
    description: "Heroic, dramatic styling with attention to titles, spells, factions, and worldbuilding terminology",
    instructions: `1. Worldbuilding & Heroic Atmosphere:
- Translate with an epic, atmospheric tone suitable for fantasy adventures, kingdom chronicles, and magic battle visual novels.
- Utilize fitting heroic terminology, chivalric registers for knights and royalty, and theatrical archaic flair for ancient deities, demons, and sorcerers.

2. Magic Spells, Techniques & Factions:
- Translate martial arts techniques, magic chant invocations, noble titles, and guild/faction ranks with grand, consistent, and impactful naming conventions.
- When kanji terms possess furigana or fantasy rubies, prioritize the intended lore meaning and heroic impact.`,
    isBuiltIn: true,
  },
  {
    id: "humorous_vibrant",
    name: "Vibrant & Dynamic Slang",
    description: "Expressive, witty localization for comedy, moe, and slice-of-life visual novels",
    instructions: `1. Comedic Timing & Punchy Banter:
- Prioritize sharp comedic timing, witty banter, humorous exasperation, playful teasing, and dynamic tsukkomi (straight man) vs. boke (funny man) chemistry.
- Adapt slapstick gags and comedic exaggerations so they hit with maximum comedic impact in the target language.

2. Modern Colloquialisms & Slang:
- Employ natural modern conversational slang, internet humor, and gaming expressions where appropriate to the character's personality and the scene's comedic context.
- Keep the dialogue lively, colorful, and engaging without drifting away from the original scene intent.`,
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

export const OPENROUTER_STORAGE_KEYS = {
  CACHED_MODELS: "vn_cached_openrouter_models",
  USER_STYLE_PRESETS: "vn_user_style_presets_v1",
  ACTIVE_STYLE_PRESET_ID: "vn_active_style_preset_id",
  ACTIVE_STYLE_INSTRUCTIONS: "vn_active_style_instructions",
  GLOSSARY_ENTRIES: "vn_glossary_entries_v1",
  SOURCE_LANG: "vn_source_lang",
  TARGET_LANG: "vn_target_lang",
} as const;

function safeStorageGet(key: string): string | null {
  try {
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
  } catch {}
  return null;
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  } catch {}
}

export function loadUserStylePresets(): PromptStylePreset[] {
  try {
    const raw = safeStorageGet(OPENROUTER_STORAGE_KEYS.USER_STYLE_PRESETS);
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
    safeStorageSet(OPENROUTER_STORAGE_KEYS.USER_STYLE_PRESETS, JSON.stringify(presets));
  } catch (e) {
    console.error("Failed to save custom style presets:", e);
  }
}

export function getAllStylePresets(customPresets?: PromptStylePreset[]): PromptStylePreset[] {
  const custom = customPresets || loadUserStylePresets();
  return [...BUILTIN_STYLE_PRESETS, ...custom];
}

export function getActiveStylePresetId(): string {
  return safeStorageGet(OPENROUTER_STORAGE_KEYS.ACTIVE_STYLE_PRESET_ID) || "natural_anime";
}

export function getActiveStyleInstructions(): string {
  const saved = safeStorageGet(OPENROUTER_STORAGE_KEYS.ACTIVE_STYLE_INSTRUCTIONS);
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
    sourceLang = safeStorageGet(OPENROUTER_STORAGE_KEYS.SOURCE_LANG) || "ja",
    targetLang = safeStorageGet(OPENROUTER_STORAGE_KEYS.TARGET_LANG) || "en",
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
1. **1:1 Semantic Fidelity (No Summarization or Added Filler)**: Translate the exact dialogue and narrative content faithfully. Do NOT summarize descriptive text, and do NOT inject unprompted commentary, moral warnings, or fictional padding not present in the original line.
2. **Proper Names & Transliteration**: Use standard Hepburn Romaji for Japanese character names and proper nouns unless defined otherwise in the Glossary. Never literally translate human names into English word meanings.
3. **Dialogue Cleanliness & Quote Formatting**:
   - Strip Japanese quote brackets (「...」, 『...』).
   - Output clean dialogue directly into "translated_message" without wrapping the entire sentence in redundant outer quotes like ""..."" or \\"...\\".
   - If dialogue contains quotes within speech, use inner curly quotes “...” or single quotes '...'.
4. **Punctuation, Reactions & Silence Lines**: If the input dialogue contains only ellipsis (e.g. 「......」, 「……」, "..."), exclamation marks, shouts, sound effects, or silence (e.g. 「──!」, 「っ──!?」, 「フッ…」, 「ハァ…」), NEVER skip or omit it—output the corresponding natural punctuation or reaction as-is in "translated_message". NEVER output an empty string ("").
5. **Preserve Text Already in ${tgtName}**: If text or names are already in ${tgtName} (e.g. foreign loanwords, phrases, or English terms), preserve and output them as-is without dropping or mangling.
6. **Strict Pure JSON Only**: Output only valid, raw JSON starting directly with "{" and ending with "}". Do NOT include markdown code fences, conversational preamble, thinking tags, or explanations.`;
  } else {
    part4 = `\n\n### Batch Input & Output Schema Requirements:
You will receive input dialogue lines in JSON format:
{
  "lines": [
    { "id": 1, "speaker": "Speaker Name (or null)", "message": "Original text" },
    { "id": 2, "speaker": null, "message": "Narration text" }
  ]
}

You MUST ALWAYS respond with a JSON object containing the "translations" array.
CRITICAL: Every item inside "translations" MUST include the matching numeric "id", along with "translated_speaker" and "translated_message":
{
  "translations": [
    {
      "id": 1,
      "translated_speaker": "Thunder God Resheph",
      "translated_message": "Do not flock together."
    },
    {
      "id": 2,
      "translated_speaker": null,
      "translated_message": "A six-pronged bolt of lightning split apart the ground beneath our feet."
    }
  ]
}

### CRITICAL BATCH RULES (MANDATORY & ENFORCED):
1. **MANDATORY Numeric "id" on Every Item**:
   - EVERY item in "translations" MUST have the exact integer "id" matching the input line ID (e.g. "id": 1, "id": 2, ...).
   - NEVER omit the "id" field! An output without "id" will cause total batch validation rejection and re-execution.
2. **Translate EVERY Single Line**:
   - You MUST include EVERY input line ID in "translations" (from the first ID to the last ID) in exact 1:1 sequential order.
   - NEVER skip lines, NEVER merge lines, NEVER reorder lines, and NEVER leave "translated_message" empty for any line ID!
3. **Exact Key Names**:
   - Use strictly: "id" (number), "translated_speaker" (string or null), and "translated_message" (string).
   - Do NOT omit "id" or rename keys to just "speaker" or "message".
4. **1:1 Semantic Fidelity (No Summarization or Added Filler)**:
   - Translate the exact dialogue and narrative content faithfully.
   - Do NOT summarize descriptive text, and do NOT inject unprompted commentary, moral warnings, or fictional padding not present in the original line.
5. **Proper Names & Transliteration**:
   - Use standard Hepburn Romaji for Japanese character names and proper nouns unless defined otherwise in the Glossary.
   - Never literally translate human names into English word meanings.
6. **Dialogue Format & Quote Marks**:
   - Strip Japanese quote brackets (「...」, 『...』).
   - Write dialogue directly into "translated_message" without wrapping the whole value in outer quotation marks like ""..."" or \\"...\\".
   - If dialogue contains quotes within speech, use inner curly quotes “...” or single quotes '...'.
7. **Punctuation, Reactions & Silence Lines**:
   - Even if a line consists only of ellipsis, groans, shouts, or reactions (e.g. 「......」, 「──!」, 「っ──!?」, 「うわあああ────!」, 「フッ…」), output the corresponding English punctuation/reaction in "translated_message" (e.g. "......", "──!", "Ghk──!?", "Uwaaaaah────!", "Heh...").
   - NEVER leave "translated_message" as an empty string ("")!
8. **Speaker Formatting**:
   - If the input line has a speaker, translate the speaker name in "translated_speaker".
   - If no speaker (narration), set "translated_speaker": null.
9. **Adult & Explicit Content Handling**:
   - If your safety guidelines restrict you from translating explicit adult/sexual lines, DO NOT abort or refuse the entire batch.
   - Instead, preserve the line ID and output 'translated_message': '[EXPLICIT CONTENT]' while translating all other lines normally.
10. **Strict Pure JSON Only**:
   - Output only valid JSON without any reasoning, preamble, markdown code fences, or explanations.`;
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
let activeModelsFetchPromise: Promise<OpenRouterModel[]> | null = null;

/**
 * Fetch available models from OpenRouter public API (No key required) with caching & deduplicated in-flight promise
 */
export async function fetchOpenRouterModels(forceRefresh = false): Promise<OpenRouterModel[]> {
  if (!forceRefresh && cachedModels && cachedModels.length > 50) {
    return cachedModels;
  }
  if (activeModelsFetchPromise) {
    return activeModelsFetchPromise;
  }

  activeModelsFetchPromise = (async () => {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models");
      if (!response.ok) {
        throw new Error(`Failed to fetch models (HTTP ${response.status})`);
      }
      const json = await response.json();
      if (Array.isArray(json.data) && json.data.length > 0) {
        const parsedModels: OpenRouterModel[] = json.data.map((m: any) => ({
          id: m.id,
          name: m.name || m.id,
          description: m.description || "",
          context_length: m.context_length || 0,
          pricing: {
            prompt: m.pricing?.prompt || "0",
            completion: m.pricing?.completion || "0",
          },
          supported_parameters: Array.isArray(m.supported_parameters) ? m.supported_parameters : undefined,
          architecture: m.architecture || undefined,
          reasoning: m.reasoning || (typeof m.architecture?.reasoning === "object" ? m.architecture.reasoning : undefined),
        }));
        cachedModels = parsedModels;
        try {
          localStorage.setItem(OPENROUTER_STORAGE_KEYS.CACHED_MODELS, JSON.stringify(parsedModels));
        } catch {}
        return parsedModels;
      }
    } catch (error: any) {
      console.warn("Failed to fetch live OpenRouter models, trying cache:", error);
    }

    // Fallback to localStorage cache if network fails
    try {
      const stored = localStorage.getItem(OPENROUTER_STORAGE_KEYS.CACHED_MODELS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cachedModels = parsed;
          return parsed;
        }
      }
    } catch {}

    return cachedModels || [];
  })().finally(() => {
    activeModelsFetchPromise = null;
  });

  return activeModelsFetchPromise;
}

const ENDPOINTS_CACHE_MAP: Map<string, OpenRouterEndpoint[]> = new Map();

/**
 * Fetch available infrastructure providers / endpoints for a specific OpenRouter model
 */
export async function fetchModelEndpoints(modelId: string, forceRefresh = false): Promise<OpenRouterEndpoint[]> {
  if (!modelId || modelId.startsWith("mt:")) return [];
  const cleanId = modelId.trim();

  if (!forceRefresh && ENDPOINTS_CACHE_MAP.has(cleanId)) {
    return ENDPOINTS_CACHE_MAP.get(cleanId)!;
  }

  try {
    const response = await fetch(`https://openrouter.ai/api/v1/models/${cleanId}/endpoints`);
    if (!response.ok) {
      return [];
    }
    const json = await response.json();
    if (json?.data?.endpoints && Array.isArray(json.data.endpoints)) {
      const endpoints: OpenRouterEndpoint[] = json.data.endpoints.map((e: any) => ({
        name: e.name || e.provider_name,
        provider_name: e.provider_name || e.name,
        context_length: e.context_length,
        pricing: e.pricing
          ? {
              prompt: e.pricing.prompt || "0",
              completion: e.pricing.completion || "0",
              input_cache_read: e.pricing.input_cache_read || e.pricing.request || "0",
              input_cache_write: e.pricing.input_cache_write || "0",
              request: e.pricing.request,
            }
          : undefined,
        quantization: e.quantization,
        status: e.status,
      }));

      // Deduplicate by provider_name
      const uniqueEndpoints: OpenRouterEndpoint[] = [];
      const seen = new Set<string>();
      for (const ep of endpoints) {
        if (!seen.has(ep.provider_name)) {
          seen.add(ep.provider_name);
          uniqueEndpoints.push(ep);
        }
      }

      ENDPOINTS_CACHE_MAP.set(cleanId, uniqueEndpoints);
      return uniqueEndpoints;
    }
  } catch (err) {
    console.warn(`Failed to fetch endpoints for model ${modelId}:`, err);
  }
  return [];
}

export interface ModelPricingSummary {
  input: string;
  output: string;
  cache: string;
  isFree: boolean;
}

/**
 * Calculates and formats pricing (Input, Output, Cache per 1M tokens) as an exact price or price range
 * based on the active model and user-selected provider endpoints.
 */
export function getModelPricingSummary(
  modelId: string,
  selectedProviders: string[] = [],
  cachedModel?: OpenRouterModel,
  endpoints: OpenRouterEndpoint[] = []
): ModelPricingSummary {
  if (!modelId) {
    return { input: "$0", output: "$0", cache: "$0", isFree: true };
  }

  if (modelId.startsWith("mt:")) {
    return { input: "$0 (Free)", output: "$0 (Free)", cache: "$0 (Free)", isFree: true };
  }

  // Filter endpoints by user-selected providers if any are chosen
  let relevantEndpoints = endpoints;
  if (selectedProviders && selectedProviders.length > 0) {
    const filtered = endpoints.filter((ep) =>
      selectedProviders.some(
        (sp) => sp.toLowerCase() === ep.provider_name.toLowerCase() || sp.toLowerCase() === ep.name.toLowerCase()
      )
    );
    if (filtered.length > 0) {
      relevantEndpoints = filtered;
    }
  }

  // Gather token prices per 1 Million tokens
  const promptPrices: number[] = [];
  const compPrices: number[] = [];
  const cachePrices: number[] = [];

  for (const ep of relevantEndpoints) {
    if (ep.pricing) {
      if (ep.pricing.prompt !== undefined) {
        promptPrices.push(parseFloat(ep.pricing.prompt || "0") * 1000000);
      }
      if (ep.pricing.completion !== undefined) {
        compPrices.push(parseFloat(ep.pricing.completion || "0") * 1000000);
      }
      if (ep.pricing.input_cache_read !== undefined && parseFloat(ep.pricing.input_cache_read || "0") > 0) {
        cachePrices.push(parseFloat(ep.pricing.input_cache_read || "0") * 1000000);
      }
    }
  }

  // Fallback to top-level model pricing if endpoint pricing is not loaded yet
  if (promptPrices.length === 0 && cachedModel?.pricing) {
    promptPrices.push(parseFloat(cachedModel.pricing.prompt || "0") * 1000000);
    compPrices.push(parseFloat(cachedModel.pricing.completion || "0") * 1000000);
    if (cachedModel.pricing.input_cache_read && parseFloat(cachedModel.pricing.input_cache_read) > 0) {
      cachePrices.push(parseFloat(cachedModel.pricing.input_cache_read) * 1000000);
    }
  }

  const formatPriceVal = (val: number): string => {
    if (val === 0) return "$0";
    if (val < 0.01) return `$${val.toFixed(4)}`;
    if (val < 1) return `$${val.toFixed(2)}`;
    return `$${val.toFixed(2)}`;
  };

  const formatRange = (prices: number[]): string => {
    if (prices.length === 0) return "$0";
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (Math.abs(min - max) < 0.0001) {
      return formatPriceVal(min);
    }
    return `${formatPriceVal(min)} - ${formatPriceVal(max)}`;
  };

  const inputStr = formatRange(promptPrices);
  const outputStr = formatRange(compPrices);
  const cacheStr = cachePrices.length > 0 ? formatRange(cachePrices) : "$0";
  const isFree = promptPrices.length > 0 && promptPrices.every((p) => p === 0) && compPrices.every((p) => p === 0);

  return {
    input: inputStr,
    output: outputStr,
    cache: cacheStr,
    isFree,
  };
}

/**
 * Get selected providers for a model from localStorage
 */
export function getSelectedModelProviders(modelId: string): string[] {
  if (!modelId) return [];
  try {
    const raw = localStorage.getItem("vn_openrouter_model_providers_map");
    if (!raw) return [];
    const map = JSON.parse(raw);
    return Array.isArray(map[modelId]) ? map[modelId] : [];
  } catch {
    return [];
  }
}

/**
 * Save selected providers for a model to localStorage
 */
export function setSelectedModelProviders(modelId: string, providers: string[]): void {
  if (!modelId) return;
  try {
    const raw = localStorage.getItem("vn_openrouter_model_providers_map");
    const map = raw ? JSON.parse(raw) : {};
    if (!providers || providers.length === 0) {
      delete map[modelId];
    } else {
      map[modelId] = providers;
    }
    localStorage.setItem("vn_openrouter_model_providers_map", JSON.stringify(map));
  } catch (err) {
    console.error("Failed to save selected model providers:", err);
  }
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
    try {
      parsed = JSON.parse(jsonrepair(text));
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          try {
            parsed = JSON.parse(jsonrepair(match[0]));
          } catch {}
        }
      }
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
    const saved = safeStorageGet(OPENROUTER_STORAGE_KEYS.GLOSSARY_ENTRIES);
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

export interface ResolvedModelReasoning {
  isSupported: boolean;
  isMandatory: boolean;
  supportsEffort: boolean;
  supportedEfforts: string[];
  defaultEffort?: string;
  supportsMaxTokens: boolean;
  defaultEnabled: boolean;
  mode: "none" | "toggle_only" | "efforts_list";
}

export function formatReasoningEffortLabel(effort: string): string {
  switch (effort.toLowerCase()) {
    case "none":
      return "Off";
    case "minimal":
      return "Minimal";
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "xhigh":
      return "Xhigh";
    case "max":
      return "Max";
    case "default":
      return "Default";
    case "custom":
      return "Custom";
    default:
      return effort.charAt(0).toUpperCase() + effort.slice(1);
  }
}

export function getModelPreferredReasoningEffort(modelId: string): ReasoningEffort | undefined {
  if (!modelId || typeof window === "undefined" || typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem("vn_model_preferred_efforts");
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return parsed[modelId];
  } catch {
    return undefined;
  }
}

export function setModelPreferredReasoningEffort(modelId: string, effort: ReasoningEffort): void {
  if (!modelId || typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem("vn_model_preferred_efforts");
    const map = raw ? JSON.parse(raw) : {};
    if (effort === "default") {
      delete map[modelId];
    } else {
      map[modelId] = effort;
    }
    localStorage.setItem("vn_model_preferred_efforts", JSON.stringify(map));
  } catch (e) {
    console.error("Failed to save preferred effort:", e);
  }
}

export function getModelReasoningCapabilities(
  model: OpenRouterModel | string,
  allModels?: OpenRouterModel[]
): ResolvedModelReasoning {
  let modelObj: OpenRouterModel | undefined;
  let modelId = "";

  if (typeof model === "string") {
    modelId = model.toLowerCase().trim();
    const list = allModels && allModels.length > 0 ? allModels : cachedModels || [];
    modelObj = list.find((m) => m.id.toLowerCase() === modelId);
  } else if (model) {
    modelObj = model;
    modelId = (model.id || "").toLowerCase().trim();
  }

  // If Free MT or empty
  if (!modelId || modelId.startsWith("mt:")) {
    return {
      isSupported: false,
      isMandatory: false,
      supportsEffort: false,
      supportedEfforts: [],
      supportsMaxTokens: false,
      defaultEnabled: false,
      mode: "none",
    };
  }

  const rawReasoning =
    modelObj?.reasoning ||
    (typeof modelObj?.architecture?.reasoning === "object" ? (modelObj.architecture.reasoning as any) : undefined);

  if (rawReasoning && typeof rawReasoning === "object") {
    const isMandatory = Boolean(rawReasoning.mandatory);
    const supportsMaxTokens = Boolean(rawReasoning.supports_max_tokens);
    const defaultEnabled = rawReasoning.default_enabled !== false;
    const supportedEfforts = Array.isArray(rawReasoning.supported_efforts)
      ? rawReasoning.supported_efforts.map(String)
      : [];
    const defaultEffort = rawReasoning.default_effort ? String(rawReasoning.default_effort) : undefined;

    if (supportedEfforts.length > 0) {
      return {
        isSupported: true,
        isMandatory,
        supportsEffort: true,
        supportedEfforts,
        defaultEffort,
        supportsMaxTokens,
        defaultEnabled,
        mode: "efforts_list",
      };
    } else {
      return {
        isSupported: true,
        isMandatory,
        supportsEffort: false,
        supportedEfforts: [],
        defaultEffort,
        supportsMaxTokens,
        defaultEnabled,
        mode: "toggle_only",
      };
    }
  }

  // If parameters metadata indicates reasoning support
  if (
    modelObj?.supported_parameters?.includes("reasoning") ||
    modelObj?.supported_parameters?.includes("include_reasoning") ||
    modelObj?.architecture?.reasoning === true
  ) {
    return {
      isSupported: true,
      isMandatory: false,
      supportsEffort: false,
      supportedEfforts: [],
      supportsMaxTokens: true,
      defaultEnabled: true,
      mode: "toggle_only",
    };
  }

  // Fallback heuristics for all supported providers beyond OpenRouter
  const { providerId: _providerId, modelId: parsedSubModel } = LlmProviderRegistry.parseModelId(modelId);
  const targetId = (parsedSubModel || modelId).toLowerCase();

  // 1. Anthropic Extended Thinking (Claude 3.7 Sonnet / Claude 4)
  if (targetId.includes("claude-3-7") || targetId.includes("claude-4")) {
    return {
      isSupported: true,
      isMandatory: false,
      supportsEffort: true,
      supportedEfforts: ["none", "low", "medium", "high", "max"],
      defaultEffort: "medium",
      supportsMaxTokens: true,
      defaultEnabled: true,
      mode: "efforts_list",
    };
  }

  // 2. OpenAI o1 / o3 Reasoning Models
  if (
    targetId.startsWith("o1") ||
    targetId.startsWith("o3") ||
    targetId.includes("/o1") ||
    targetId.includes("/o3") ||
    targetId.includes("o1-") ||
    targetId.includes("o3-")
  ) {
    return {
      isSupported: true,
      isMandatory: true,
      supportsEffort: true,
      supportedEfforts: ["low", "medium", "high"],
      defaultEffort: "medium",
      supportsMaxTokens: false,
      defaultEnabled: true,
      mode: "efforts_list",
    };
  }

  // 3. DeepSeek R1 / Reasoner (Always-on native reasoning)
  if (targetId.includes("deepseek-reasoner") || targetId === "r1" || targetId.endsWith("-r1")) {
    return {
      isSupported: true,
      isMandatory: true,
      supportsEffort: false,
      supportedEfforts: [],
      supportsMaxTokens: false,
      defaultEnabled: true,
      mode: "toggle_only",
    };
  }

  // 4. Google Gemini Thinking Models
  if (targetId.includes("thinking") || targetId.includes("gemini-2.5") || targetId.includes("gemini-3")) {
    return {
      isSupported: true,
      isMandatory: false,
      supportsEffort: true,
      supportedEfforts: ["none", "low", "medium", "high"],
      defaultEffort: "medium",
      supportsMaxTokens: true,
      defaultEnabled: true,
      mode: "efforts_list",
    };
  }

  // 5. Groq / Open-Weights Reasoning (Qwen QwQ, DeepSeek R1 Distill, etc.)
  if (targetId.includes("r1") || targetId.includes("qwq") || targetId.includes("reasoning")) {
    return {
      isSupported: true,
      isMandatory: false,
      supportsEffort: true,
      supportedEfforts: ["none", "low", "medium", "high"],
      defaultEffort: "medium",
      supportsMaxTokens: false,
      defaultEnabled: true,
      mode: "efforts_list",
    };
  }

  // 6. xAI Grok Thinking
  if (targetId.includes("grok-3") || targetId.includes("grok-thinking")) {
    return {
      isSupported: true,
      isMandatory: false,
      supportsEffort: true,
      supportedEfforts: ["low", "medium", "high"],
      defaultEffort: "medium",
      supportsMaxTokens: false,
      defaultEnabled: true,
      mode: "efforts_list",
    };
  }

  return {
    isSupported: false,
    isMandatory: false,
    supportsEffort: false,
    supportedEfforts: [],
    supportsMaxTokens: false,
    defaultEnabled: false,
    mode: "none",
  };
}

export function isReasoningModel(model: OpenRouterModel | string, allModels?: OpenRouterModel[]): boolean {
  return getModelReasoningCapabilities(model, allModels).isSupported;
}

export function buildReasoningPayload(options?: {
  modelId?: string;
  effort?: ReasoningEffort;
  maxTokens?: number;
  exclude?: boolean;
}): Record<string, any> | undefined {
  const effort = options?.effort || settingsManager.getReasoningEffort();
  const maxTokens = options?.maxTokens !== undefined ? options.maxTokens : settingsManager.getReasoningMaxTokens();
  const exclude = options?.exclude !== undefined ? options.exclude : settingsManager.getExcludeReasoning();

  const capabilities = options?.modelId ? getModelReasoningCapabilities(options.modelId) : null;

  // If model is resolved and does not support reasoning at all, do not send reasoning object
  if (capabilities && !capabilities.isSupported) {
    return undefined;
  }

  const payload: Record<string, any> = {};

  if (effort === "none") {
    // If user explicitly disabled reasoning
    if (capabilities?.supportsEffort && capabilities.supportedEfforts.includes("none")) {
      payload.effort = "none";
    } else {
      payload.exclude = true;
    }
  } else if (effort && effort !== "default" && effort !== "custom") {
    payload.effort = effort;
  }

  if (maxTokens && maxTokens > 0) {
    payload.max_tokens = maxTokens;
  }

  if (exclude === true) {
    payload.exclude = true;
  }

  return Object.keys(payload).length > 0 ? payload : undefined;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterTranslateOptions {
  apiKey: string;
  modelId: string;
  speaker?: string;
  message: string;
  sourceLang?: string;
  targetLang?: string;
  styleInstructions?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  providers?: string[];
  contextHistory?: { user: string; assistant: string }[];
  reasoningEffort?: ReasoningEffort;
  reasoningMaxTokens?: number;
  excludeReasoning?: boolean;
}

export interface OpenRouterTranslateResult {
  success: boolean;
  translatedSpeaker?: string;
  translatedMessage: string;
  rawText?: string;
  cost?: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  error?: string;
}

/**
 * Perform chat completion translation using OpenRouter with structured JSON inputs and outputs
 */
export async function translateWithOpenRouter(options: OpenRouterTranslateOptions): Promise<OpenRouterTranslateResult> {
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
    maxTokens,
    contextHistory = [],
    reasoningEffort,
    reasoningMaxTokens,
    excludeReasoning,
  } = options;

  // Dynamic token ceiling: protects against truncation on long monologues while preventing run-away hallucination
  const dynamicMaxTokens = maxTokens ?? Math.min(2048, Math.max(500, Math.ceil((message || "").length * 4)));

  const { providerId, modelId: targetModelId } = LlmProviderRegistry.parseModelId(modelId);
  const providerCfg = LlmProviderRegistry.getProviderConfig(providerId);
  const cleanKey = (apiKey || providerCfg.apiKey || "").trim();

  if (!cleanKey) {
    const providerDef = LlmProviderRegistry.getProvider(providerId);
    const err = `${providerDef?.name || "LLM"} API Key is missing. Please set your API key in Translation Providers.`;
    logger.error("LLM::API", err);
    return {
      success: false,
      translatedMessage: message,
      error: err,
    };
  }

  // 1. Build Modular System Prompt
  let fullSystemPrompt = systemPrompt;
  if (!fullSystemPrompt) {
    fullSystemPrompt = buildCompleteSystemPrompt({
      mode: "live",
      sourceLang,
      targetLang,
      styleInstructions,
      includeGlossary: true,
    });
  } else {
    // If a custom system prompt is provided, check if it already has glossary instructions
    const hasGlossary = /glossary|glosarium|### Character & Translation Glossary/i.test(fullSystemPrompt);
    if (!hasGlossary) {
      const glossarySnippet = buildGlossarySystemPrompt();
      if (glossarySnippet) {
        fullSystemPrompt = `${fullSystemPrompt}\n\n${glossarySnippet}`;
      }
    }
  }

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

  // Active dialogue line turn formatted with structured dialogue helper for schema consistency
  const activeUserPayload = formatStructuredDialogueInput(speaker, message);
  messages.push({ role: "user", content: activeUserPayload });

  const reasoningPayload = buildReasoningPayload({
    effort: reasoningEffort,
    maxTokens: reasoningMaxTokens,
    exclude: excludeReasoning,
  });

  logger.info(
    "LLM::API",
    `Sending structured request to model: ${modelId} (${messages.length} messages, ${contextHistory.length} history turns, maxTokens: ${dynamicMaxTokens})`
  );

  const startTime = Date.now();
  let content = "";
  let lastErr = "";
  let exactCost = 0;
  let exactPromptTokens = 0;
  let exactCompletionTokens = 0;
  let exactCachedTokens = 0;
  const maxRetries = 3;

  const activeProviders = options.providers ?? getSelectedModelProviders(modelId);

  // If using another provider directly (Anthropic, DeepSeek, Google, OpenAI, Groq, xAI, etc.)
  if (providerId !== "openrouter") {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await LlmDispatcherService.executeChat({
          modelId,
          messages,
          temperature,
          maxTokens: dynamicMaxTokens,
          reasoningEffort,
          reasoningMaxTokens,
          excludeReasoning,
          overrideApiKey: cleanKey,
        });
        if (res && res.content) {
          content = res.content.trim();
          exactCost = res.cost || 0;
          exactPromptTokens = res.promptTokens || 0;
          exactCompletionTokens = res.completionTokens || 0;
          exactCachedTokens = res.cachedTokens || 0;
          const elapsed = Date.now() - startTime;
          logger.info(
            "LLM::API",
            `[${providerId}] Response received in ${elapsed}ms: "${content.slice(0, 70)}..."`
          );
          break;
        }
      } catch (err: any) {
        const errStr = err?.message || String(err);
        lastErr = errStr;
        const isRateLimit = errStr.includes("429") || errStr.toLowerCase().includes("rate limit") || errStr.toLowerCase().includes("too many requests");
        const isTransient = errStr.includes("502") || errStr.includes("503") || errStr.includes("504") || errStr.includes("timeout");
        if ((isRateLimit || isTransient) && attempt < maxRetries) {
          const backoffMs = isRateLimit ? 1500 * Math.pow(2, attempt - 1) + Math.random() * 500 : 1000 * attempt;
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        logger.error("LLM::API", `Direct provider [${providerId}] error: ${errStr}`);
        break;
      }
    }
  } else {
    // OpenRouter flow
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const nativeRes = await invoke<OpenRouterCompletionResponse>("openrouter_chat_completion", {
          apiKey: cleanKey,
          modelId: targetModelId,
          messagesJson: JSON.stringify(messages),
          temperature,
          maxTokens: dynamicMaxTokens,
          providers: activeProviders.length > 0 ? activeProviders : undefined,
          reasoning: reasoningPayload,
        });

        if (nativeRes && nativeRes.content) {
          content = nativeRes.content.trim();
          exactCost = nativeRes.cost || 0;
          exactPromptTokens = nativeRes.prompt_tokens || 0;
          exactCompletionTokens = nativeRes.completion_tokens || 0;
          exactCachedTokens = nativeRes.cached_tokens || 0;
          const elapsed = Date.now() - startTime;
          logger.info(
            "OpenRouter::API",
            `Native structured response received in ${elapsed}ms (Cost: $${exactCost.toFixed(6)}): "${content.slice(0, 70)}..."`
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

        logger.error("OpenRouter::API", `OpenRouter API error: ${errStr}`);
        break;
      }
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
    cost: exactCost,
    promptTokens: exactPromptTokens,
    completionTokens: exactCompletionTokens,
    cachedTokens: exactCachedTokens,
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
    const stored = localStorage.getItem(OPENROUTER_STORAGE_KEYS.CACHED_MODELS) || localStorage.getItem("openrouter_available_models");
    if (stored) {
      try {
        models = JSON.parse(stored);
      } catch {}
    }
  }

  const m = models?.find((x) => x.id.toLowerCase() === modelId.toLowerCase());
  if (!m?.pricing) {
    // If pricing is unknown, return 0 rather than inventing an arbitrary hardcoded price
    return 0;
  }

  const promptPrice = parseFloat(m.pricing.prompt) || 0;
  const compPrice = parseFloat(m.pricing.completion) || 0;

  // If both prompt and completion prices are 0, this model is 100% free!
  if (promptPrice === 0 && compPrice === 0) {
    return 0;
  }

  const nonCachedPrompt = Math.max(0, promptTokens - cachedTokens);
  // Prompt caching typically yields ~50% discount on OpenRouter endpoints unless free
  const promptCost = nonCachedPrompt * promptPrice + cachedTokens * promptPrice * 0.5;
  const compCost = completionTokens * compPrice;

  return promptCost + compCost;
}

