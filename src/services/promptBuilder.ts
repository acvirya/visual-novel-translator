import { jsonrepair } from "jsonrepair";
import { getLanguageDisplayName } from "../constants/languages";
import { parseSpeakerMessageTranslation } from "./freeMtService";
import { settingsManager } from "./settingsManager";

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

export const PROMPT_STORAGE_KEYS = {
  USER_STYLE_PRESETS: "vn_user_style_presets_v1",
  ACTIVE_STYLE_PRESET_ID: "vn_active_style_preset_id",
  ACTIVE_STYLE_INSTRUCTIONS: "vn_active_style_instructions",
  GLOSSARY_ENTRIES: "vn_glossary_entries_v1",
} as const;

function safeStorageGet(key: string): string | null {
  try {
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
  } catch {
    // Ignored
  }
  return null;
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  } catch {
    // Ignored
  }
}

export function loadUserStylePresets(): PromptStylePreset[] {
  try {
    const raw = safeStorageGet(PROMPT_STORAGE_KEYS.USER_STYLE_PRESETS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn("Failed to load custom style presets:", e);
  }
  return [];
}

export function saveUserStylePresets(presets: PromptStylePreset[]): void {
  try {
    safeStorageSet(PROMPT_STORAGE_KEYS.USER_STYLE_PRESETS, JSON.stringify(presets));
  } catch (e) {
    console.error("Failed to save custom style presets:", e);
  }
}

export function getAllStylePresets(customPresets?: PromptStylePreset[]): PromptStylePreset[] {
  const custom = customPresets || loadUserStylePresets();
  return [...BUILTIN_STYLE_PRESETS, ...custom];
}

export function getActiveStylePresetId(): string {
  return safeStorageGet(PROMPT_STORAGE_KEYS.ACTIVE_STYLE_PRESET_ID) || "natural_anime";
}

export function getActiveStyleInstructions(): string {
  const saved = safeStorageGet(PROMPT_STORAGE_KEYS.ACTIVE_STYLE_INSTRUCTIONS);
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
 * Generates an appended system prompt snippet from active Glossary Manager entries
 */
export function buildGlossarySystemPrompt(): string {
  try {
    // Read from settingsManager single source of truth first, with localStorage fallback
    const glossary = settingsManager.getGlossary();
    let entries: Array<{ original: string; translation: string; category?: string; notes?: string }> = [];

    if (glossary && Array.isArray(glossary.terms) && glossary.terms.length > 0) {
      entries = glossary.terms.map((t) => ({
        original: t.original,
        translation: t.translation,
        category: t.category,
        notes: t.notes,
      }));
    } else {
      const saved = safeStorageGet(PROMPT_STORAGE_KEYS.GLOSSARY_ENTRIES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) entries = parsed;
      }
    }

    if (entries.length === 0) return "";

    const sanitizeGlossaryField = (text: string) =>
      text.replace(/[\r\n]+/g, " ").replace(/"/g, '\\"').trim();

    const lines = entries
      .filter((e) => e && e.original?.trim() && e.translation?.trim())
      .map((e) => {
        const orig = sanitizeGlossaryField(e.original);
        const trans = sanitizeGlossaryField(e.translation);
        const cat = e.category ? sanitizeGlossaryField(e.category) : "";
        const notes = e.notes ? sanitizeGlossaryField(e.notes) : "";
        return `- "${orig}" -> "${trans}"${cat ? ` [Category: ${cat}]` : ""}${notes ? ` (${notes})` : ""}`;
      });

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
    sourceLang = settingsManager.getSourceLang() || "ja",
    targetLang = settingsManager.getTargetLang() || "en",
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
 * Formats dialogue inputs into structured JSON for LLM requests
 */
export function formatStructuredDialogueInput(speaker: string | undefined, message: string): string {
  const cleanMsg = (message || "").replace(/\0/g, "").trim();
  const cleanSpk = speaker ? speaker.replace(/\0/g, "").trim().replace(/^[【\[［<〈〔]|[\】\]］>〉〕]$/g, "").trim() : undefined;

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
          } catch {
            // Ignored
          }
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
