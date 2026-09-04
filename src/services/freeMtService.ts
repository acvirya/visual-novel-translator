/**
 * Free Machine Translation (MT) Service
 * Implements Google Translate Free & DeepL Free translation with structured "Speaker: Dialogue" packing & parsing.
 * Automatically normalizes suffix speaker names (e.g. 「セリフ」ソーマ -> 【ソーマ】「セリフ」)
 * Uses native Rust command via Tauri to bypass CORS and webview network limits.
 */

import { TauriBridge } from "./tauriBridge";
import { extractSpeakerAndDialogue } from "../utils/textPreprocessor";
import { settingsManager } from "./settingsManager";

export interface FreeMtTranslateOptions {
  speaker?: string;
  message: string;
  sourceLang?: string; // default "ja"
  targetLang?: string; // default "en"
  provider?: "google" | "deepl"; // default "google"
}

export interface FreeMtTranslateResult {
  success: boolean;
  speaker?: string;
  translatedSpeaker?: string;
  message: string;
  translatedMessage: string;
  rawResponse?: string;
  provider: string;
  durationMs: number;
  error?: string;
}

export interface FormattedPayloadResult {
  formattedText: string;
  effectiveSpeaker?: string;
  effectiveMessage: string;
}

/**
 * Normalizes and packs speaker and message into a robust Japanese bracket format for MT engines:
 * "【Speaker】 Message" if speaker is present, or just "Message" for narration.
 * If speaker is at the back of the message (e.g. 「セリフ」ソーマ), it normalizes it to the front!
 */
export function formatSpeakerMessage(speaker: string | undefined, message: string): FormattedPayloadResult {
  let cleanMsg = message.trim();
  let cleanSpk = speaker?.trim().replace(/^[【\[［<〈〔]|[\】\]］>〉〕]$/g, "").trim();

  // If speaker was not explicitly passed, or if message itself contains speaker at front or back
  if (!cleanSpk) {
    const extracted = extractSpeakerAndDialogue(cleanMsg);
    if (extracted.speaker) {
      cleanSpk = extracted.speaker.replace(/^[【\[［<〈〔]|[\】\]］>〉〕]$/g, "").trim();
      cleanMsg = extracted.message.trim();
    }
  }

  if (cleanSpk) {
    return {
      formattedText: `【${cleanSpk}】 ${cleanMsg}`,
      effectiveSpeaker: cleanSpk,
      effectiveMessage: cleanMsg,
    };
  }

  return {
    formattedText: cleanMsg,
    effectiveSpeaker: undefined,
    effectiveMessage: cleanMsg,
  };
}

/**
 * Splits translated response into translatedSpeaker and translatedMessage
 * Safely parses bracketed speaker: 【Speaker】 Message, [Speaker] Message, etc.
 * Supports prefix colon, suffix names, and fallback preservation.
 */
export function parseSpeakerMessageTranslation(
  rawTranslation: string,
  originalSpeaker?: string
): { translatedSpeaker?: string; translatedMessage: string } {
  const text = rawTranslation.trim();

  if (!originalSpeaker || !originalSpeaker.trim()) {
    // If no original speaker was expected, check if the MT output contains a speaker structure
    const extracted = extractSpeakerAndDialogue(text);
    if (extracted.speaker) {
      return {
        translatedSpeaker: extracted.speaker,
        translatedMessage: extracted.message,
      };
    }
    return {
      translatedSpeaker: undefined,
      translatedMessage: text,
    };
  }

  // 1. Match bracketed speaker patterns: 【...】, [...], ［...］, <...>, 〈...〉, 〔...〕
  const bracketMatch = text.match(/^[【\[［<〈〔]([^【\]］>〉〕\r\n]{1,40})[】\]］>〉〕]\s*[:：]?\s*([\s\S]*)$/);
  if (bracketMatch) {
    const rawSpeaker = bracketMatch[1].trim();
    const rawMessage = bracketMatch[2].trim();

    return {
      translatedSpeaker: rawSpeaker || originalSpeaker.trim(),
      translatedMessage: rawMessage || text,
    };
  }

  // 2. Secondary fallback: check if output starts with a speaker name followed by colon near the beginning (<= 30 chars)
  const prefixColonMatch = text.match(/^([^:：\r\n]{1,30})[:：]\s*([\s\S]+)$/);
  if (prefixColonMatch && !/^\d+$/.test(prefixColonMatch[1])) {
    return {
      translatedSpeaker: prefixColonMatch[1].trim(),
      translatedMessage: prefixColonMatch[2].trim(),
    };
  }

  // 3. Suffix speaker fallback in translated text: "Dialogue" - Speaker, "Dialogue" Speaker
  const suffixDashMatch = text.match(/^([\s\S]+?["”』」\)])\s*(?:――|——|--|-)\s*([^"”『」\r\n]{1,30})$/);
  if (suffixDashMatch) {
    return {
      translatedSpeaker: suffixDashMatch[2].trim() || originalSpeaker.trim(),
      translatedMessage: suffixDashMatch[1].trim(),
    };
  }

  const suffixQuoteMatch = text.match(/^([“"『「][\s\S]+?["”』」])\s*([^"”『」\r\n.!?]{1,30})$/);
  if (suffixQuoteMatch) {
    return {
      translatedSpeaker: suffixQuoteMatch[2].trim() || originalSpeaker.trim(),
      translatedMessage: suffixQuoteMatch[1].trim(),
    };
  }

  // 4. Fallback if MT stripped the bracket wrapper
  return {
    translatedSpeaker: originalSpeaker.trim(),
    translatedMessage: text,
  };
}

/**
 * Native Free MT translation via Rust backend (CORS-free, fast, reliable)
 */
export async function translateWithNativeRust(
  text: string,
  sourceLang = "ja",
  targetLang = "en",
  provider = "google"
): Promise<{ text: string; error?: string }> {
  try {
    const apiKey = provider === "deepl" ? settingsManager.getDeepLApiKey() : undefined;
    const result = await TauriBridge.translateFreeMt(
      text,
      sourceLang,
      targetLang,
      provider,
      apiKey
    );
    return { text: result };
  } catch (err: any) {
    console.warn("Native MT command failed, trying fallback:", err);
    return { text: "", error: err?.toString() || String(err) };
  }
}

/**
 * Fallback translation using direct webview fetch (Google Translate Free)
 */
export async function translateWithGoogleFetch(
  text: string,
  sourceLang = "ja",
  targetLang = "en"
): Promise<{ text: string; error?: string }> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
      sourceLang
    )}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Google Translate HTTP ${res.status}`);
    }

    const data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const translated = data[0]
        .map((segment: any) => (Array.isArray(segment) ? segment[0] : ""))
        .join("")
        .trim();
      return { text: translated };
    }

    throw new Error("Invalid response format from Google Translate");
  } catch (err: any) {
    return { text: "", error: err?.message || String(err) };
  }
}

/**
 * Unified Free MT Translation Entrypoint
 */
export async function translateWithFreeMt(
  options: FreeMtTranslateOptions
): Promise<FreeMtTranslateResult> {
  const startTime = Date.now();
  const {
    speaker,
    message,
    sourceLang = "ja",
    targetLang = "en",
    provider = "google",
  } = options;

  if (!message || !message.trim()) {
    return {
      success: true,
      speaker: speaker || undefined,
      translatedSpeaker: speaker || undefined,
      message: "",
      translatedMessage: "",
      provider: provider === "deepl" ? "DeepL Free" : "Google Translate (Free)",
      durationMs: 0,
    };
  }

  // 1. Format payload: Normalizes name at the end/inside to "【Speaker】 Message" at the front
  const { formattedText, effectiveSpeaker, effectiveMessage } = formatSpeakerMessage(speaker, message);

  // 2. Call Native Rust command first (Bypasses webview CORS restrictions)
  let translationRes = await translateWithNativeRust(formattedText, sourceLang, targetLang, provider);
  let providerLabel = provider === "deepl" ? "DeepL Free" : "Google Translate (Free)";

  // Fallback to fetch if native call failed
  if (!translationRes.text) {
    if (provider === "deepl") {
      providerLabel = "Google Translate (DeepL Fallback)";
    }
    translationRes = await translateWithGoogleFetch(formattedText, sourceLang, targetLang);
  }

  const durationMs = Date.now() - startTime;

  if (translationRes.error || !translationRes.text) {
    return {
      success: false,
      speaker: effectiveSpeaker || undefined,
      translatedSpeaker: effectiveSpeaker || undefined,
      message: effectiveMessage,
      translatedMessage: effectiveMessage, // fallback to original
      rawResponse: translationRes.text,
      provider: providerLabel,
      durationMs,
      error: translationRes.error || "Translation returned empty result.",
    };
  }

  // 3. Parse formatted response back to speaker & message
  const { translatedSpeaker, translatedMessage } = parseSpeakerMessageTranslation(
    translationRes.text,
    effectiveSpeaker
  );

  return {
    success: true,
    speaker: effectiveSpeaker || undefined,
    translatedSpeaker,
    message: effectiveMessage,
    translatedMessage,
    rawResponse: translationRes.text,
    provider: providerLabel,
    durationMs,
  };
}
