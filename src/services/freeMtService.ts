/**
 * Free Machine Translation (MT) Service
 * Implements Google Translate Free & DeepL Free translation with structured "Speaker: Dialogue" packing & parsing.
 * Uses native Rust command via Tauri to bypass CORS and webview network limits.
 */

import { invoke } from "@tauri-apps/api/core";

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

/**
 * Packs speaker and message into a robust Japanese bracket format for MT engines:
 * "【Speaker】 Message" if speaker is present, or just "Message" for narration.
 */
export function formatSpeakerMessage(speaker: string | undefined, message: string): string {
  const cleanMsg = message.trim();
  const cleanSpk = speaker?.trim().replace(/^[【\[［<〈〔]|[\】\]］>〉〕]$/g, "").trim();

  if (cleanSpk) {
    return `【${cleanSpk}】 ${cleanMsg}`;
  }
  return cleanMsg;
}

/**
 * Splits translated response into translatedSpeaker and translatedMessage
 * Safely parses bracketed speaker: 【Speaker】 Message, [Speaker] Message, etc.
 * Delimiter colons inside dialogue (e.g. 12:30 or Chapter 1: Prologue) will never be corrupted!
 */
export function parseSpeakerMessageTranslation(
  rawTranslation: string,
  originalSpeaker?: string
): { translatedSpeaker?: string; translatedMessage: string } {
  const text = rawTranslation.trim();

  if (!originalSpeaker || !originalSpeaker.trim()) {
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

  // 3. Fallback if MT stripped the bracket wrapper
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
    const apiKey = localStorage.getItem("vn_deepl_api_key") || undefined;
    const result = await invoke<string>("translate_free_mt", {
      text,
      sourceLang,
      targetLang,
      provider,
      apiKey,
    });
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

  // 1. Format payload: "Speaker: Dialogue"
  const formattedInput = formatSpeakerMessage(speaker, message);

  // 2. Call Native Rust command first (Bypasses webview CORS restrictions)
  let translationRes = await translateWithNativeRust(formattedInput, sourceLang, targetLang, provider);
  let providerLabel = provider === "deepl" ? "DeepL Free" : "Google Translate (Free)";

  // Fallback to fetch if native call failed
  if (!translationRes.text) {
    if (provider === "deepl") {
      providerLabel = "Google Translate (DeepL Fallback)";
    }
    translationRes = await translateWithGoogleFetch(formattedInput, sourceLang, targetLang);
  }

  const durationMs = Date.now() - startTime;

  if (translationRes.error || !translationRes.text) {
    return {
      success: false,
      speaker: speaker || undefined,
      translatedSpeaker: speaker || undefined,
      message,
      translatedMessage: message, // fallback to original
      rawResponse: translationRes.text,
      provider: providerLabel,
      durationMs,
      error: translationRes.error || "Translation returned empty result.",
    };
  }

  // 3. Parse formatted response back to speaker & message
  const { translatedSpeaker, translatedMessage } = parseSpeakerMessageTranslation(
    translationRes.text,
    speaker
  );

  return {
    success: true,
    speaker: speaker || undefined,
    translatedSpeaker,
    message,
    translatedMessage,
    rawResponse: translationRes.text,
    provider: providerLabel,
    durationMs,
  };
}
