import { PreprocessingStep, PreprocessingSource } from "../types";

export const DEFAULT_PREPROCESSING_SOURCES: PreprocessingSource[] = ["manual", "textractor", "ocr", "batch"];

export const DEFAULT_PREPROCESSING_PIPELINE: PreprocessingStep[] = [
  {
    id: "step_furigana",
    type: "furigana_cleaner",
    name: "Furigana / Ruby Annotation Stripper",
    description: "Strips pronunciation readings like 私(わたし), 漢字[かんじ], and <ruby> tags",
    isEnabled: true,
    applicableSources: ["manual", "textractor", "batch"],
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
    applicableSources: ["manual", "textractor", "batch"],
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
    id: "step_phrase_deduplicator",
    type: "phrase_deduplicator",
    name: "Repeated Phrase & Loop Deduplicator",
    description: "Collapses repeating sentence loops and duplicate phrase bursts caused by outline/shadow text hooks (e.g. 遥月遥月... → 遥月)",
    isEnabled: true,
    applicableSources: ["textractor"],
  },
  {
    id: "step_stutter",
    type: "stutter_reducer",
    name: "Stutter & Repeated Character Reducer",
    description: "Normalizes excessive repetitions and stutters (e.g. あ、、あの → あ、あの, ！！！！ → ！)",
    isEnabled: true,
    applicableSources: ["manual", "textractor", "ocr", "batch"],
    options: {
      collapseLimit: 1,
    },
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

      if (pattern) {
        try {
          if (opts.isRegex) {
            const flags = opts.ignoreCase ? "gi" : "g";
            const regex = new RegExp(pattern, flags);
            result = result.replace(regex, replacement);
          } else {
            result = result.split(pattern).join(replacement);
          }
        } catch {
          // Invalid regex pattern, skip
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

/**
 * Convenience helper to execute active stored pipeline on raw input text for a given source
 */
export function executePreprocessingPipeline(
  rawText: string,
  source?: PreprocessingSource
): string {
  try {
    let pipeline = DEFAULT_PREPROCESSING_PIPELINE;
    const stored = localStorage.getItem("vn_preprocessing_pipeline");
    if (stored) {
      pipeline = JSON.parse(stored);
    }
    const { finalOutput } = executePipelineWithTrace(rawText, pipeline, source);
    return finalOutput;
  } catch {
    return rawText;
  }
}

export interface ExtractedDialogue {
  speaker: string;
  message: string;
}

/**
 * Smart extractor to separate character name (speaker) and dialogue message from a single text line
 */
export function extractSpeakerAndDialogue(text: string): ExtractedDialogue {
  const trimmed = text.trim();
  if (!trimmed) return { speaker: "", message: "" };

  // 1. Bracketed Speaker prefix: 【遥月】セリフ, [遥月] セリフ, ［遥月］セリフ, <遥月> セリフ, 〈遥月〉セリフ
  const bracketMatch = trimmed.match(/^[【\[［<〈]([^【\]］>〉\r\n]{1,20})[】\]］>〉]\s*[:：]?\s*([\s\S]+)$/);
  if (bracketMatch) {
    return {
      speaker: bracketMatch[1].trim(),
      message: bracketMatch[2].trim(),
    };
  }

  // 2. Name before Japanese quotation mark: 遥月「セリフ」 or 遥月『セリフ』 or 遥月（セリフ）
  // Speaker name is typically 1 to 15 characters before 「 or 『
  const quoteMatch = trimmed.match(/^([^「『（\r\n]{1,20})\s*([「『（][\s\S]+)$/);
  if (quoteMatch) {
    return {
      speaker: quoteMatch[1].trim(),
      message: quoteMatch[2].trim(),
    };
  }

  // 3. Colon separator: 遥月: セリフ or 遥月：セリフ
  const colonMatch = trimmed.match(/^([^:：\r\n]{1,20})[:：]\s*([\s\S]+)$/);
  if (colonMatch) {
    return {
      speaker: colonMatch[1].trim(),
      message: colonMatch[2].trim(),
    };
  }

  // 4. Newline separator: First line is short name (< 15 chars), followed by dialogue lines
  const lines = trimmed.split(/\r?\n/);
  if (lines.length >= 2 && lines[0].trim().length >= 1 && lines[0].trim().length <= 15 && !lines[0].includes("。")) {
    return {
      speaker: lines[0].trim(),
      message: lines.slice(1).join("\n").trim(),
    };
  }

  // 5. Suffix speaker at the end: 「セリフ」――遥月 or 「セリフ」 (遥月) or 「セリフ」【遥月】
  const suffixDashMatch = trimmed.match(/^([\s\S]+?[」』）\)])\s*(?:――|——|--)\s*([^「」\r\n]{1,20})$/);
  if (suffixDashMatch) {
    return {
      speaker: suffixDashMatch[2].trim(),
      message: suffixDashMatch[1].trim(),
    };
  }

  const suffixParenMatch = trimmed.match(/^([\s\S]+?[」』])\s*[（(【\[]([^）)\]】\r\n]{1,20})[）)\]】]$/);
  if (suffixParenMatch) {
    return {
      speaker: suffixParenMatch[2].trim(),
      message: suffixParenMatch[1].trim(),
    };
  }

  // 6. No speaker pattern found -> Entire text is dialogue / narration
  return {
    speaker: "",
    message: trimmed,
  };
}
