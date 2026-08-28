import { extractSpeakerAndDialogue, cleanSpeakerName } from "./textPreprocessor";
import { BatchItem } from "../services/batchTranslateService";
import { ScriptEntry } from "../types";

export interface ParsedScriptDialogueItem {
  id: number;
  speaker?: string;
  translatedSpeaker?: string;
  message: string;
  translatedMessage?: string;
}

/**
 * Universal robust script parser supporting:
 * - JSON Array of dialogue objects
 * - JSON Lines (.jsonl format)
 * - Plain text script lines (with speaker bracket extraction: 【Speaker】 Dialogue or 「Dialogue」 Speaker)
 * - CSV / TSV tab-delimited dialogue files
 */
export function parseScriptFileContent(rawContent: string): ParsedScriptDialogueItem[] {
  const items: ParsedScriptDialogueItem[] = [];
  const trimmed = rawContent.trim();
  if (!trimmed) return items;

  const extractFromObject = (obj: any, idx: number): ParsedScriptDialogueItem => {
    let spk: string | undefined = undefined;
    let msg = "";

    // Auto-detect speaker keys
    const detectedSpk =
      obj.speaker ??
      obj.name ??
      obj.character ??
      obj.chara ??
      obj.jp_name ??
      obj.speaker_name ??
      obj.actor;

    if (detectedSpk !== undefined && detectedSpk !== null && detectedSpk !== "") {
      spk = cleanSpeakerName(String(detectedSpk).trim());
    }

    // Auto-detect message keys
    const detectedMsg =
      obj.message ??
      obj.text ??
      obj.dialogue ??
      obj.msg ??
      obj.original_message ??
      obj.original ??
      obj.body ??
      obj.content ??
      obj.line;

    if (detectedMsg !== undefined && detectedMsg !== null) {
      msg = String(detectedMsg).trim();
    }

    const rawTgtSpk =
      obj.translated_speaker ??
      obj.translatedSpeaker ??
      obj.speaker_en ??
      obj.trans_speaker;

    const rawTgtMsg =
      obj.translated_message ??
      obj.translatedMessage ??
      obj.message_en ??
      obj.trans_message ??
      obj.translated ??
      obj.english ??
      obj.translation ??
      obj.target_message ??
      obj.targetMessage;

    const tgtSpk =
      rawTgtSpk !== undefined && rawTgtSpk !== null && rawTgtSpk !== "null"
        ? String(rawTgtSpk).trim()
        : undefined;

    const tgtMsg =
      rawTgtMsg !== undefined && rawTgtMsg !== null
        ? String(rawTgtMsg).trim()
        : !msg
        ? ""
        : undefined;

    return {
      id: typeof obj.id === "number" ? obj.id : idx + 1,
      speaker: spk || undefined,
      message: msg,
      translatedSpeaker: tgtSpk,
      translatedMessage: tgtMsg,
    };
  };

  // 1. Try parsing JSON Array format: [ {...}, {...} ]
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        parsed.forEach((obj, idx) => {
          if (typeof obj === "string") {
            const ext = extractSpeakerAndDialogue(obj);
            items.push({
              id: idx + 1,
              speaker: ext.speaker || undefined,
              message: ext.message,
              translatedMessage: !ext.message ? "" : undefined,
            });
          } else if (typeof obj === "object" && obj !== null) {
            items.push(extractFromObject(obj, idx));
          }
        });
        if (items.length > 0) return items;
      }
    } catch {}
  }

  // 2. Line-by-line parser for JSONL, plain text, and standard script lines
  const rawLines = trimmed.split(/\r?\n/);
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;

    // JSON Lines (.jsonl)
    if (line.startsWith("{") && line.endsWith("}")) {
      try {
        const obj = JSON.parse(line);
        items.push(extractFromObject(obj, items.length));
        continue;
      } catch {}
    }

    // Tab-delimited (TSV) or CSV line fallback: Japanese \t English
    if (line.includes("\t")) {
      const parts = line.split("\t");
      if (parts.length >= 2) {
        const ext = extractSpeakerAndDialogue(parts[0].trim());
        items.push({
          id: items.length + 1,
          speaker: ext.speaker || undefined,
          message: ext.message,
          translatedMessage: parts[1].trim(),
        });
        continue;
      }
    }

    // Plain text or standard script format
    const ext = extractSpeakerAndDialogue(line);
    items.push({
      id: items.length + 1,
      speaker: ext.speaker || undefined,
      message: ext.message,
      translatedMessage: !ext.message ? "" : undefined,
    });
  }

  return items;
}

/**
 * Adapter returning ScriptEntry[] for ScriptManagerService
 */
export function parseScriptContentAsEntries(rawContent: string): ScriptEntry[] {
  const parsed = parseScriptFileContent(rawContent);
  return parsed.map((it, idx) => ({
    id: `entry_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
    speaker: it.speaker,
    translated_speaker: it.translatedSpeaker,
    message: it.message,
    translated_message: it.translatedMessage || "",
    matchedCount: 0,
  }));
}

/**
 * Adapter returning BatchItem[] for BatchTranslateService
 */
export function parseScriptContentAsBatchItems(rawContent: string): BatchItem[] {
  const parsed = parseScriptFileContent(rawContent);
  return parsed.map((it, idx) => ({
    id: typeof it.id === "number" ? it.id : idx + 1,
    originalSpeaker: it.speaker,
    originalMessage: it.message,
    translatedSpeaker: it.translatedSpeaker,
    translatedMessage: it.translatedMessage,
  }));
}
