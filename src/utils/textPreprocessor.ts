import { PreprocessingStep, PreprocessingSource } from "../types";

export const DEFAULT_PREPROCESSING_SOURCES: PreprocessingSource[] = ["manual", "textractor", "ocr", "batch"];

export const DEFAULT_PREPROCESSING_PIPELINE: PreprocessingStep[] = [
  {
    id: "step_furigana",
    type: "furigana_cleaner",
    name: "Furigana / Ruby Annotation Stripper",
    description: "Strips pronunciation readings like 私(わたし), 漢字[かんじ], and <ruby> tags",
    isEnabled: true,
    applicableSources: ["manual", "textractor", "ocr", "batch"],
    options: {
      stripRubyParentheses: true,
      stripRubyBrackets: true,
      stripRubyHtml: true,
    },
  },
  {
    id: "step_control_chars",
    type: "control_char_cleaner",
    name: "Control Characters & Engine Tags",
    description: "Removes VN engine format tags (e.g. \\c[2], \\v[1]), null bytes, and cleans escape sequences",
    isEnabled: true,
    applicableSources: ["manual", "textractor", "ocr", "batch"],
    options: {
      isRegex: true,
    },
  },
  {
    id: "step_unicode_nfkc",
    type: "unicode_nfkc",
    name: "Unicode NFKC Normalization",
    description: "Converts half-width katakana (ｶﾀｶﾅ → カタカナ) and normalizes character representations",
    isEnabled: true,
    applicableSources: ["manual", "textractor", "ocr", "batch"],
  },
  {
    id: "step_punctuation",
    type: "punctuation_normalizer",
    name: "Japanese Punctuation Normalizer",
    description: "Standardizes ellipses (…… → …), quotes (「」『』), and strips decorative symbols (♪, ♥, ★)",
    isEnabled: true,
    applicableSources: ["manual", "textractor", "ocr", "batch"],
    options: {
      normalizeQuotes: false,
      removeDecorativeSymbols: true,
    },
  },
  {
    id: "step_whitespace",
    type: "whitespace_normalizer",
    name: "Whitespace & Line Break Normalizer",
    description: "Converts full-width spaces (　) and multiple spaces into single space, trims edges",
    isEnabled: true,
    applicableSources: ["manual", "textractor", "ocr", "batch"],
  },
];

export interface StepTraceResult {
  stepId: string;
  stepName: string;
  isEnabled: boolean;
  isApplicable: boolean;
  applicableSources: PreprocessingSource[];
  inputText: string;
  outputText: string;
  wasModified: boolean;
}

export function isStepApplicableForSource(
  step: PreprocessingStep,
  source?: PreprocessingSource
): boolean {
  if (!source) return true;
  const sources = step.applicableSources ?? DEFAULT_PREPROCESSING_SOURCES;
  return sources.includes(source);
}

/**
 * Execute a single preprocessing step on input text
 */
export function applyPreprocessingStep(text: string, step: PreprocessingStep): string {
  if (!step.isEnabled) return text;

  let result = text;

  switch (step.type) {
    case "furigana_cleaner": {
      const opts = step.options || {};
      // 1. Strip <ruby>漢字<rt>かんじ</rt></ruby> or <ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>
      if (opts.stripRubyHtml !== false) {
        result = result.replace(/<ruby>(.*?)<rt>.*?<\/rt><\/ruby>/gi, "$1");
        result = result.replace(/<ruby>(.*?)<rp>.*?<\/rp><rt>.*?<\/rt><rp>.*?<\/rp><\/ruby>/gi, "$1");
        result = result.replace(/<\/?[^>]+(>|$)/g, ""); // strip remaining HTML tags
      }
      // 2. Strip Kanji(kana) -> Kanji (e.g. 私(わたし) -> 私, 漢字(かんじ) -> 漢字)
      if (opts.stripRubyParentheses !== false) {
        result = result.replace(/([\u4E00-\u9FAF\u3400-\u4DBF々])[(（][\u3040-\u309F\u30A0-\u30FF]+[)）]/g, "$1");
      }
      // 3. Strip Kanji[kana] -> Kanji (e.g. 漢字[かんじ] -> 漢字)
      if (opts.stripRubyBrackets !== false) {
        result = result.replace(/([\u4E00-\u9FAF\u3400-\u4DBF々])\[[\u3040-\u309F\u30A0-\u30FF]+\]/g, "$1");
      }
      // 4. Strip Kanji《kana》 -> Kanji (e.g. 漢字《かんじ》 -> 漢字)
      result = result.replace(/([\u4E00-\u9FAF\u3400-\u4DBF々])《[\u3040-\u309F\u30A0-\u30FF]+》/g, "$1");
      break;
    }

    case "control_char_cleaner": {
      // 1. Ren'Py Text & Formatting Tags: {b}, {/b}, {i}, {/i}, {u}, {/u}, {s}, {/s}, {color=#fff}, {size=24}, {w}, {w=1.5}, {p}, {nw}, {fast}, {cps=20}, {alpha=0.5}, {space=10}, etc.
      result = result.replace(/\{\/?(?:b|i|u|s|color|size|font|alpha|cps|w|p|nw|fast|rb|rt|a|k|image|space|vspace|outlinecolor|plain|alt)(?:=[^}]*)?\}/gi, "");

      // 2. KiriKiri / KAG / TyranoBuilder / CatSystem / Siglus bracket tags: [r], [l], [p], [cm], [ct], [er], [wt], [wa], [nowait], [font ...], [voice ...], etc.
      result = result.replace(/\[(?:r|l|p|cm|ct|er|br|lr|wt|wa|nowait|endnowait|resetfont|resetcolor|graph|link|endlink|chara_ptext|playse|voice|se|bgm)[^\]]*\]/gi, "");
      result = result.replace(/\[(?:wait|delay|speed|font|color|size|time|pos|chara)[^\]]*\]/gi, "");
      result = result.replace(/\[(?:voice|vo|voice_id|v)[:=][^\]]+\]/gi, "");

      // 3. @-style engine control tags (BGI, Ethornell, KAG, Majiro, SystemNNN, Qlie: @b1, @t82, @w1, @wait, @page, @v100)
      result = result.replace(/@[a-zA-Z]+[0-9]*/g, "");
      result = result.replace(/@[a-zA-Z0-9_]+/g, "");

      // 4. NScripter / ONScripter command tags (!w1000, !d500, !s10, !sd, !c)
      result = result.replace(/!(?:w|d|s|sd|c)[0-9]*/gi, "");

      // 5. Backslash engine codes (Siglus, RealLive, RPGMaker, CatSystem, AdvPlayer: \c[1], \v[2], \N[3], \G, \fs[20], \., \|, \!, \^, \>, \<, \k, \d, \w, etc.)
      result = result.replace(/\\[a-zA-Z]\[[0-9]+\]/g, "");
      result = result.replace(/\\(?:c|v|n|p|g|fs|pc|color|font)\[[^\]]+\]/gi, "");
      result = result.replace(/\\[a-zA-Z.!^><#{}|\\]/g, "");

      // 6. Majiro / YukaScript / SystemNNN formatting macros (%LC(...), %LF(...), %LS(...), %[0-9]+)
      result = result.replace(/%L[CFS]\([^)]*\)/gi, "");

      // 7. Literal escape string \n, \r, \t if captured as literal backslash chars from memory
      result = result.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, " ");

      // 8. Null bytes and non-printable control characters (Memory Hook noise 0x00-0x1F, 0x7F)
      result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

      // 9. Strip isolated engine ruby/bullet prefixes (e.g. · , ・ , • , ●)
      result = result.replace(/^[\s·・•●○\u00B7\u30FB]+/g, "");
      break;
    }

    case "unicode_nfkc": {
      // Unicode NFKC normalization
      try {
        result = result.normalize("NFKC");
      } catch {
        // Fallback if environment doesn't support normalize
      }
      break;
    }

    case "char_deduplicator": {
      const opts = step.options || {};
      const repeatCount = opts.duplicateCount ?? 2; // 2 (doubled), 3 (tripled), 4 (quadrupled), or 0 for any consecutive duplicate

      if (repeatCount === 0) {
        // Collapses any consecutive duplicate character (2 or more identical adjacent chars)
        result = result.replace(/(.)\1+/gu, "$1");
      } else if (typeof repeatCount === "number" && repeatCount >= 2) {
        // Collapses exact N consecutive identical characters into 1 (e.g. (.)\1 -> $1 for N=2)
        const regex = new RegExp(`(.)\\1{${repeatCount - 1}}`, "gu");
        result = result.replace(regex, "$1");
      }
      break;
    }

    case "phrase_deduplicator": {
      let prev = "";
      // Multi-pass deduplication for nested phrase loops (e.g. shadow / outline font loops)
      for (let pass = 0; pass < 3 && result !== prev; pass++) {
        prev = result;
        // Collapses consecutive identical phrase blocks of length 2 to 150 chars repeating 1+ additional times
        result = result.replace(/(.{2,150}?)\1+/gu, "$1");
      }
      break;
    }

    case "stutter_reducer": {
      // Collapse repeated Japanese commas/dots/stutter marks: 、、+ -> 、  ..+ -> ..  ！！+ -> ！
      result = result.replace(/、{2,}/g, "、");
      result = result.replace(/。{2,}/g, "。");
      result = result.replace(/！{2,}/g, "！");
      result = result.replace(/!{2,}/g, "!");
      result = result.replace(/？{2,}/g, "？");
      result = result.replace(/\?{2,}/g, "?");
      break;
    }

    case "punctuation_normalizer": {
      const opts = step.options || {};
      // Standardize Japanese ellipses
      result = result.replace(/……+/g, "…");
      result = result.replace(/\.{3,}/g, "…");

      if (opts.removeDecorativeSymbols !== false) {
        // Remove decorative symbols often found in VN dialogue: ♪, ♥, ♡, ★, ☆, ◆, ◇, ♬
        result = result.replace(/[♪♥♡★☆◆◇♬▼▲]/g, "");
      }
      break;
    }

    case "whitespace_normalizer": {
      // Convert Japanese full-width space to standard space
      result = result.replace(/\u3000/g, " ");
      // Replace multiple spaces/tabs with single space
      result = result.replace(/[ \t]+/g, " ");
      // Remove empty lines or excess line breaks
      result = result.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      result = result.replace(/\n{2,}/g, "\n");
      // Trim start and end
      result = result.trim();
      break;
    }

    case "custom_regex": {
      const opts = step.options || {};
      const pattern = opts.pattern || "";
      const replacement = opts.replacement || "";

      if (pattern && pattern.length <= 250) {
        try {
          if (opts.isRegex) {
            // Guard against common catastrophic backtracking patterns like (a+)+ or ([a-z]+)+
            const hasCatastrophicPattern = /\([^()]+\+[()]+\+|\([^()]+\*[()]+\*/.test(pattern);
            if (!hasCatastrophicPattern) {
              const flags = opts.ignoreCase ? "gi" : "g";
              const regex = new RegExp(pattern, flags);
              result = result.replace(regex, replacement);
            }
          } else {
            result = result.split(pattern).join(replacement);
          }
        } catch {
          // Invalid regex pattern, skip safely
        }
      }
      break;
    }

    default:
      break;
  }

  return result;
}

/**
 * Execute full pipeline and return final text along with step-by-step transformation traces
 */
export function executePipelineWithTrace(
  rawText: string,
  pipeline: PreprocessingStep[],
  source?: PreprocessingSource
): { finalOutput: string; traces: StepTraceResult[] } {
  let current = rawText;
  const traces: StepTraceResult[] = [];

  for (const step of pipeline) {
    const inputBefore = current;
    const isApplicable = isStepApplicableForSource(step, source);
    const outputAfter = step.isEnabled && isApplicable ? applyPreprocessingStep(current, step) : current;

    traces.push({
      stepId: step.id,
      stepName: step.name,
      isEnabled: step.isEnabled,
      isApplicable,
      applicableSources: step.applicableSources ?? DEFAULT_PREPROCESSING_SOURCES,
      inputText: inputBefore,
      outputText: outputAfter,
      wasModified: step.isEnabled && isApplicable && inputBefore !== outputAfter,
    });

    current = outputAfter;
  }

  return { finalOutput: current, traces };
}

let cachedCustomRules: PreprocessingStep[] | null = null;

/**
 * Invalidate cached custom rules (called when settings or custom rules are modified)
 */
export function invalidateCustomRulesCache(): void {
  cachedCustomRules = null;
}

/**
 * Retrieve active custom preprocessing rules from in-memory cache (or initial localStorage load)
 */
export function getCustomPreprocessingRules(): PreprocessingStep[] {
  if (cachedCustomRules !== null) {
    return cachedCustomRules;
  }
  try {
    // 1. Check canonical universal settings first
    if (typeof localStorage !== "undefined") {
      const rawSettings = localStorage.getItem("vn_translator_universal_settings_v2");
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings);
        const pipeline = parsed?.textPreprocessing?.pipeline;
        if (Array.isArray(pipeline)) {
          cachedCustomRules = pipeline.filter(
            (r: PreprocessingStep) => r && r.isEnabled && (r.type === "custom_regex" || r.isCustom)
          );
          return cachedCustomRules;
        }
      }

      // 2. Fallback to legacy keys
      const customRulesJson =
        localStorage.getItem("vn_custom_replacement_rules") ||
        localStorage.getItem("vn_preprocessing_pipeline");
      if (customRulesJson) {
        const parsed = JSON.parse(customRulesJson);
        if (Array.isArray(parsed)) {
          cachedCustomRules = parsed.filter(
            (r: PreprocessingStep) => r && r.isEnabled && (r.type === "custom_regex" || r.isCustom)
          );
          return cachedCustomRules;
        }
      }
    }
  } catch {
    // Ignore parse error and fallback to empty
  }
  cachedCustomRules = [];
  return cachedCustomRules;
}

/**
 * Convenience helper to execute active stored pipeline on raw input text for a given source
 */
export function executePreprocessingPipeline(
  rawText: string,
  source?: PreprocessingSource
): string {
  try {
    let current = rawText;

    // 1. Core 5 Auto-Active Steps (always enabled for all sources)
    for (const step of DEFAULT_PREPROCESSING_PIPELINE) {
      if (isStepApplicableForSource(step, source)) {
        current = applyPreprocessingStep(current, step);
      }
    }

    // 2. Custom User-Defined Replacement Rules (read from high-speed in-memory cache)
    const customRules = getCustomPreprocessingRules();
    for (const rule of customRules) {
      if (isStepApplicableForSource(rule, source)) {
        current = applyPreprocessingStep(current, rule);
      }
    }

    return current;
  } catch {
    return rawText;
  }
}

// Japanese particle / verb endings that prove a prefix is narration/sentence fragment, NOT a character speaker name
const NARRATION_PREFIX_ENDINGS = /(?:で|を|に|から|と|へ|より|まで|も|の|は|が|した|する|して|された|ている|ていた|あった|ある|ない|なった|なる|だ|です|である|ながら|けれど|けど|ので|そして|また|だが)$/;

// Formatting / engine tags that should never be mistaken for speaker brackets (e.g. <r...>, <ruby>, <font>, <color>, [r], \c[1])
const INLINE_TAG_PREFIX = /^<(?:r|ruby|font|color|b|i|u|size|img|style|\/)[^>]*>/i;

export interface ExtractedDialogue {
  speaker: string;
  message: string;
}

const speakerCleanCache = new Map<string, string>();
const MAX_SPEAKER_CACHE = 500;

// Visual novel engine dummy/placeholder tags indicating narration, monologue, or system notes rather than a real character name
const MONOLOGUE_SPEAKER_REGEX = /^(?:地の文|地の文章|地文|地|ナレーション|ナレ|ナレ[0-9１２345]|独白|モノローグ|内心|心の声|心声|心|思い|思考|旁白|内心独白|ト書き|解説|状況|システム|システムメッセージ|アナウンス|narration|narr|narrator|monologue|mono|thought|thoughts|inner|inner_voice|none|null|undefined|void|empty|blank|no_name|noname|[-―—─_・…\s]+)$/i;

/**
 * Hidden auto-active normalizer for speaker names:
 * Automatically cleans duplicated bracket tags, multi-pass loops, stray brackets,
 * and eliminates VN engine placeholder monologue/narration tags (e.g. 地の文, ナレーション, narr, mono, 独白)
 * Examples:
 * - 【【伊織】【伊織】】 -> 伊織
 * - 【伊織】【伊織】    -> 伊織
 * - 【【伊織】】        -> 伊織
 * - 【伊織】            -> 伊織
 * - [伊織][伊織]        -> 伊織
 * - 伊織伊織            -> 伊織
 * - 地の文 / ナレーション / narr / mono / 独白 -> "" (Clean Monologue)
 */
export function cleanSpeakerName(rawSpeaker: string): string {
  if (!rawSpeaker) return "";
  const cached = speakerCleanCache.get(rawSpeaker);
  if (cached !== undefined) return cached;

  let spk = rawSpeaker.trim();

  // 1. If text contains bracketed segments (e.g. 【伊織】【伊織】 or 【【伊織】【伊織】】),
  // extract all non-empty candidate contents between matching brackets
  const bracketMatches = spk.match(/[【\[［〈〔（(《『「]([^【】\[\]［］〈〉〔〕（）()《》『』「」\r\n\s]+)[】\]］〉〕）)》』」]/g);
  if (bracketMatches && bracketMatches.length > 0) {
    const candidates = bracketMatches
      .map((m) => m.replace(/[【】\[\]［］〈〉〔〕（）()《》『』「」]/g, "").trim())
      .filter((c) => c.length > 0);

    if (candidates.length > 0) {
      // Take first clean non-empty candidate from the bracketed tokens
      spk = candidates[0];
    }
  }

  // 2. Strip any remaining outer/stray bracket characters and punctuation
  spk = spk.replace(/^[【】\[\]［］〈〉〔〕（）()《》『』「」\s:：·・]+|[【】\[\]［］〈〉〔〕（）()《》『』「」\s:：·・]+$/g, "");
  spk = spk.replace(/[【】\[\]［］〈〉〔〕（）()《》『』「」]/g, "").trim();

  // 3. Multi-pass phrase loop deduplication on speaker name (e.g. "伊織伊織" -> "伊織", "クラスメイトクラスメイト" -> "クラスメイト")
  for (let pass = 0; pass < 3; pass++) {
    const deduplicated = spk.replace(/^(.{1,15}?)\1+$/u, "$1");
    if (deduplicated === spk) break;
    spk = deduplicated;
  }

  // 4. Consecutive character duplicate cleaner if every character is doubled (e.g. "伊伊織織" -> "伊織")
  if (spk.length >= 2 && spk.length % 2 === 0) {
    let isAllDoubled = true;
    for (let i = 0; i < spk.length; i += 2) {
      if (spk[i] !== spk[i + 1]) {
        isAllDoubled = false;
        break;
      }
    }
    if (isAllDoubled) {
      spk = spk.replace(/(.)\1/gu, "$1");
    }
  }

  const finalClean = spk.trim();
  let result = finalClean;

  // 5. If speaker name is a VN engine dummy placeholder for monologue/narration, eliminate it!
  if (MONOLOGUE_SPEAKER_REGEX.test(finalClean)) {
    result = "";
  }

  if (speakerCleanCache.size >= MAX_SPEAKER_CACHE) {
    let count = 0;
    for (const key of speakerCleanCache.keys()) {
      speakerCleanCache.delete(key);
      if (++count >= 50) break;
    }
  }
  speakerCleanCache.set(rawSpeaker, result);

  return result;
}

/**
 * Smart extractor to separate character name (speaker) and dialogue message from a single text line
 */
export function extractSpeakerAndDialogue(text: string): ExtractedDialogue {
  const trimmed = text.trim();
  if (!trimmed) return { speaker: "", message: "" };

  // Guard: If text starts with ruby or formatting tag (<r...>, <ruby...>), do not treat as speaker bracket!
  if (INLINE_TAG_PREFIX.test(trimmed)) {
    return {
      speaker: "",
      message: trimmed,
    };
  }

  // 1. Suffix speaker at the end of dialogue or monologue
  // 1a. Suffix Dash separator: 「セリフ」――ソーマ or (モノローグ)--ソーマ
  const suffixDashMatch = trimmed.match(/^([\s\S]+?[」』）\)】\]〕”"])\s*(?:――|——|--)\s*([^「」『』\r\n]{1,20})$/);
  if (suffixDashMatch) {
    return {
      speaker: cleanSpeakerName(suffixDashMatch[2]),
      message: suffixDashMatch[1].trim(),
    };
  }

  // 1b. Bracket/Paren suffix: 「セリフ」(ソーマ) or 「セリフ」【ソーマ】
  const suffixParenMatch = trimmed.match(/^([\s\S]+?[」』）\)])\s*[（(【\[［]([^）)\]】］\r\n]{1,20})[）)\]】］]$/);
  if (suffixParenMatch) {
    return {
      speaker: cleanSpeakerName(suffixParenMatch[2]),
      message: suffixParenMatch[1].trim(),
    };
  }

  // 1c. Direct trailing speaker after closing quote/monologue: 「セリフ」ソーマ, 『セリフ』ソーマ, (モノローグ)ソーマ, （モノローグ）ソーマ
  const suffixDirectQuoteMatch = trimmed.match(/^([「『（\(〔“][\s\S]+?[」』）\)〕”])\s*([^「」『』（\)\r\n。、!?！？:：]{1,20})$/);
  if (suffixDirectQuoteMatch) {
    return {
      speaker: cleanSpeakerName(suffixDirectQuoteMatch[2]),
      message: suffixDirectQuoteMatch[1].trim(),
    };
  }

  // 2. Bracketed Speaker prefix: 【遥月】セリフ, [遥月] セリフ, ［遥月］セリフ, 〈遥月〉セリフ, 〔遥月〕セリフ
  const bracketPrefixMatch = trimmed.match(/^([【\[［〈〔（(《]+(?:[^【】\[\]［］〈〉〔〕（）()《》\r\n]{1,25}[】\]］〉〕）)》]+)+)\s*[:：]?\s*([\s\S]+)$/);
  if (bracketPrefixMatch) {
    const rawBracketSpeaker = bracketPrefixMatch[1];
    const messagePart = bracketPrefixMatch[2]?.trim() || "";
    const cleanedSpeaker = cleanSpeakerName(rawBracketSpeaker);
    if (cleanedSpeaker && messagePart) {
      return {
        speaker: cleanedSpeaker,
        message: messagePart,
      };
    }
  }

  // Fallback single bracket
  const bracketMatch = trimmed.match(/^[【\[［〈〔]([^【\]］〉〕\r\n]{1,20})[】\]］〉〕]\s*[:：]?\s*([\s\S]+)$/);
  if (bracketMatch) {
    const messagePart = bracketMatch[2]?.trim() || "";
    if (messagePart) {
      return {
        speaker: cleanSpeakerName(bracketMatch[1]),
        message: messagePart,
      };
    }
  }

  // 3. Name before Japanese quotation mark: 遥月「セリフ」 or 遥月『セリフ』
  // Checks that:
  // - Name is 1 to 15 characters
  // - Name does NOT end in particles or verb conjugations (e.g. 獲得した, で, を, に, etc.)
  // - The text after closing quote does not continue as a narrative sentence (e.g. 『サラマンダの鱗』が彼女を守っていた。)
  const quoteMatch = trimmed.match(/^([^「『（\r\n]{1,15})\s*([「『][\s\S]+?[」』])\s*([\s\S]*)$/);
  if (quoteMatch) {
    const potentialSpeaker = cleanSpeakerName(quoteMatch[1]);
    const dialoguePart = quoteMatch[2].trim();
    const trailingPart = quoteMatch[3].trim();

    const isNarrationEnding = NARRATION_PREFIX_ENDINGS.test(potentialSpeaker);
    // If there is trailing text after quote starting with particle (e.g. が, を, に, は, で, の) or verb, it's narration!
    const isNarrationTrailing = trailingPart.length > 0 && /^(?:[がをにはでのへとより]|守っ|受け|持っ|使っ|言っ|見|思|知|走|立|座|な|だ|で|さ)/.test(trailingPart);

    if (!isNarrationEnding && !isNarrationTrailing) {
      return {
        speaker: potentialSpeaker,
        message: trailingPart ? `${dialoguePart} ${trailingPart}` : dialoguePart,
      };
    }
  }

  // 4. Colon separator: 遥月: セリフ or 遥月：セリフ
  const colonMatch = trimmed.match(/^([^:：\r\n]{1,15})[:：]\s*([\s\S]+)$/);
  if (colonMatch) {
    const potentialSpeaker = cleanSpeakerName(colonMatch[1]);
    if (!potentialSpeaker.startsWith("http") && !potentialSpeaker.startsWith("<") && !NARRATION_PREFIX_ENDINGS.test(potentialSpeaker)) {
      return {
        speaker: potentialSpeaker,
        message: colonMatch[2].trim(),
      };
    }
  }

  // 5. Newline separator: First line is short name (< 15 chars), followed by dialogue lines
  const lines = trimmed.split(/\r?\n/);
  if (lines.length >= 2 && lines[0].trim().length >= 1 && lines[0].trim().length <= 15 && !lines[0].includes("。") && !NARRATION_PREFIX_ENDINGS.test(lines[0].trim())) {
    return {
      speaker: cleanSpeakerName(lines[0]),
      message: lines.slice(1).join("\n").trim(),
    };
  }

  // 6. No speaker pattern found -> Entire text is dialogue / narration
  return {
    speaker: "",
    message: trimmed,
  };
}
