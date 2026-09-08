import Papa from "papaparse";
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

  // 2. Check if content is JSON Lines (.jsonl format)
  const firstLine = trimmed.split(/\r?\n/)[0]?.trim();
  if (firstLine && firstLine.startsWith("{") && firstLine.endsWith("}")) {
    const rawLines = trimmed.split(/\r?\n/);
    let allJson = true;
    for (const line of rawLines) {
      const l = line.trim();
      if (!l) continue;
      try {
        const obj = JSON.parse(l);
        items.push(extractFromObject(obj, items.length));
      } catch {
        allJson = false;
        break;
      }
    }
    if (allJson && items.length > 0) {
      return items;
    }
    items.length = 0; // reset if not pure JSONL
  }

  // 3. Robust CSV, TSV, and plain text parsing via PapaParse
  const parsedCsv = Papa.parse<string[]>(trimmed, {
    skipEmptyLines: "greedy",
  });

  if (parsedCsv.data && parsedCsv.data.length > 0) {
    const rows = parsedCsv.data;

    // Check if the first row is a header row (e.g. ["speaker", "message", "translation"])
    let startIndex = 0;
    if (rows.length > 1 && rows[0].length >= 2) {
      const headerSample = rows[0].map((c: string) => String(c).trim().toLowerCase());
      const isHeader = headerSample.some((h: string) =>
        /^(?:id|speaker|character|name|dialogue|message|text|original|translation|translated|translated_message|english|jp|en)$/i.test(
          h
        )
      );
      if (isHeader) {
        startIndex = 1;
      }
    }

    for (let i = startIndex; i < rows.length; i++) {
      const cols = rows[i].map((c: string) => String(c).trim());
      if (cols.length === 0 || (cols.length === 1 && !cols[0])) continue;

      if (cols.length >= 3) {
        // [speaker, message, translation, ...]
        items.push({
          id: items.length + 1,
          speaker: cols[0] ? cleanSpeakerName(cols[0]) : undefined,
          message: cols[1],
          translatedMessage: cols[2] || undefined,
        });
      } else if (cols.length === 2) {
        // [japanese (possibly with speaker brackets), translation]
        const ext = extractSpeakerAndDialogue(cols[0]);
        items.push({
          id: items.length + 1,
          speaker: ext.speaker || undefined,
          message: ext.message,
          translatedMessage: cols[1] || undefined,
        });
      } else {
        // Single column / plain text script format
        const ext = extractSpeakerAndDialogue(cols[0]);
        items.push({
          id: items.length + 1,
          speaker: ext.speaker || undefined,
          message: ext.message,
          translatedMessage: !ext.message ? "" : undefined,
        });
      }
    }
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
