import { invoke } from "@tauri-apps/api/core";
import { extractSpeakerAndDialogue } from "../utils/textPreprocessor";

export function generateUniqueId(prefix = "entry"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Fast Levenshtein distance for short strings (<= 3 chars)
 */
export function calcLevenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: a.length + 1 }, (_, i) => i);

  for (let i = 1; i <= b.length; i++) {
    let prev = i;
    for (let j = 1; j <= a.length; j++) {
      let val: number;
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        val = row[j - 1];
      } else {
        val = Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
      }
      row[j - 1] = prev;
      prev = val;
    }
    row[a.length] = prev;
  }
  return row[a.length];
}

export interface ScriptEntry {
  id: string;
  speaker?: string;
  translated_speaker?: string;
  message: string;
  translated_message: string;
  matchedCount?: number;
  lastUsed?: string;
  // Precomputed index cache (O(1) lookups during searches)
  _normSpeaker?: string;
  _normMessage?: string;
  _canonicalKey?: string;
  _bigramCounts?: Map<string, number>;
  _numBigrams?: number;
}

export interface ScriptDatabaseState {
  activeFilePath: string | null;
  activeFileName: string | null;
  entries: ScriptEntry[];
  autoAppend: boolean;
  matchThreshold: number;
}

class ScriptManagerService {
  private activeFilePath: string | null = null;
  private activeFileName: string | null = null;
  private entries: ScriptEntry[] = [];
  private autoAppend = true;
  private matchThreshold = 0.85;
  private listeners: ((state: ScriptDatabaseState) => void)[] = [];
  private saveDebounceTimer: any = null;
  private canonicalIndex: Map<string, ScriptEntry[]> = new Map();
  private messageOnlyIndex: Map<string, ScriptEntry[]> = new Map();
  private ngramIndex: Map<string, Set<ScriptEntry>> = new Map();

  constructor() {
    this.loadPersistedState();
  }

  public normalizeSpeaker(s?: string): string {
    if (!s) return "";
    return s
      .normalize("NFKC")
      .replace(/[\u3000\s【】「」『』()（）\[\]{}<>《》:：#@]/g, "")
      .toLowerCase()
      .trim();
  }

  public normalizeMessage(m: string): string {
    if (!m) return "";
    const res = m
      .normalize("NFKC")
      .replace(/[\u3000\s\r\n\t]/g, "")
      .replace(/[「」『』【】（）()〈〉""''“”]/g, "")
      .replace(/([\u4E00-\u9FAF\u3400-\u4DBF々])《[\u3040-\u309F\u30A0-\u30FF]+》/g, "$1") // Strip furigana reading when attached to Kanji
      .replace(/[《》]/g, "") // Strip emphasis brackets without deleting term inside (e.g. 《聖剣》 -> 聖剣)
      .replace(/[、，,]/g, "")
      .replace(/[。．\.]+/g, "")
      .replace(/[…‥・―—–~〜\-]/g, "")
      .replace(/ー{2,}/g, "ー") // Collapse repeated chōonpu (あーーー -> あー) while strictly preserving single phonemic ー!
      .replace(/[！!]/g, "！")
      .replace(/[？?]/g, "？")
      .toLowerCase()
      .trim();
    return res || (m.trim().length > 0 ? "..." : "");
  }

  public buildCanonicalKey(speaker?: string, message?: string): string {
    const normSpk = this.normalizeSpeaker(speaker);
    const normMsg = this.normalizeMessage(message || "");
    return `${normSpk}:::${normMsg}`;
  }

  public insertEntryIntoIndexes(item: ScriptEntry) {
    // 1. Precompute normalized values once
    const normSpk = this.normalizeSpeaker(item.speaker);
    const normMsg = this.normalizeMessage(item.message);
    const canonicalKey = `${normSpk}:::${normMsg}`;

    item._normSpeaker = normSpk;
    item._normMessage = normMsg;
    item._canonicalKey = canonicalKey;

    if (canonicalKey) {
      let canonList = this.canonicalIndex.get(canonicalKey);
      if (!canonList) {
        canonList = [];
        this.canonicalIndex.set(canonicalKey, canonList);
      }
      canonList.push(item);
    }

    if (normMsg) {
      let msgList = this.messageOnlyIndex.get(normMsg);
      if (!msgList) {
        msgList = [];
        this.messageOnlyIndex.set(normMsg, msgList);
      }
      msgList.push(item);

      // Precompute Bag-of-Bigrams (frequency map) for multiset Dice calculation
      const bigramCounts = new Map<string, number>();
      if (normMsg.length >= 2) {
        for (let i = 0; i < normMsg.length - 1; i++) {
          const bg = normMsg.slice(i, i + 2);
          bigramCounts.set(bg, (bigramCounts.get(bg) || 0) + 1);
          let set = this.ngramIndex.get(bg);
          if (!set) {
            set = new Set();
            this.ngramIndex.set(bg, set);
          }
          set.add(item);
        }
      }
      item._bigramCounts = bigramCounts;
      item._numBigrams = Math.max(0, normMsg.length - 1);
    }
  }

  private rebuildIndexes() {
    this.canonicalIndex.clear();
    this.messageOnlyIndex.clear();
    this.ngramIndex.clear();

    for (const item of this.entries) {
      this.insertEntryIntoIndexes(item);
    }
  }

  public async loadPersistedState() {
    try {
      const savedPath = localStorage.getItem("vn_active_script_filepath");
      const savedFile = localStorage.getItem("vn_active_script_filename");
      const savedAutoAppend = localStorage.getItem("vn_script_auto_append");
      const savedThreshold = localStorage.getItem("vn_script_match_threshold");

      // Clean up legacy bloated entries key if present
      localStorage.removeItem("vn_active_script_entries");

      this.activeFilePath = savedPath || null;
      this.activeFileName = savedFile || null;
      this.autoAppend = savedAutoAppend !== null ? savedAutoAppend === "true" : true;
      this.matchThreshold = savedThreshold ? Math.max(0.1, Math.min(1.0, parseFloat(savedThreshold))) : 0.85;

      if (this.activeFilePath) {
        try {
          const diskContent = await invoke<string | null>("read_script_file_by_path", { path: this.activeFilePath });
          if (diskContent) {
            this.entries = this.parseEntriesFromContent(diskContent);
            this.rebuildIndexes();
            this.notify();
            return;
          }
        } catch (readErr) {
          console.warn("Failed to load script from disk file:", readErr);
        }
      }

      this.entries = [];
      this.rebuildIndexes();
    } catch (e) {
      console.warn("Failed to load script database from storage:", e);
      this.entries = [];
      this.activeFileName = null;
      this.activeFilePath = null;
      this.rebuildIndexes();
    }
    this.notify();
  }

  private saveState(skipRebuild = false) {
    try {
      if (this.activeFileName) {
        if (this.activeFilePath) {
          localStorage.setItem("vn_active_script_filepath", this.activeFilePath);
        }
        localStorage.setItem("vn_active_script_filename", this.activeFileName);
      } else {
        localStorage.removeItem("vn_active_script_filepath");
        localStorage.removeItem("vn_active_script_filename");
      }
      // Never store full script entries in localStorage to avoid QuotaExceededError
      localStorage.removeItem("vn_active_script_entries");
      localStorage.setItem("vn_script_auto_append", String(this.autoAppend));
      localStorage.setItem("vn_script_match_threshold", String(this.matchThreshold));
    } catch (e) {
      console.warn("Failed to autosave script settings to storage:", e);
    }

    if (!skipRebuild) {
      this.rebuildIndexes();
    }

    // Auto-save to physical disk file if filePath exists (debounced)
    if (this.activeFilePath) {
      if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = setTimeout(async () => {
        try {
          if (!this.activeFilePath) return;
          const isJson = this.activeFilePath.toLowerCase().endsWith(".json");
          const content = this.exportAsContent(isJson);
          await invoke("save_script_file", { path: this.activeFilePath, content });
        } catch (err) {
          console.warn("Failed to write autosave to disk file:", err);
        }
      }, 300);
    }

    this.notify();
  }

  public subscribe(callback: (state: ScriptDatabaseState) => void) {
    this.listeners.push(callback);
    callback(this.getState());
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((cb) => cb(state));
  }

  public getState(): ScriptDatabaseState {
    return {
      activeFilePath: this.activeFilePath,
      activeFileName: this.activeFileName,
      entries: [...this.entries],
      autoAppend: this.autoAppend,
      matchThreshold: this.matchThreshold,
    };
  }

  public getMatchThreshold(): number {
    return this.matchThreshold;
  }

  public setMatchThreshold(val: number) {
    this.matchThreshold = Math.max(0.1, Math.min(1.0, val));
    this.saveState();
  }

  public setAutoAppend(enable: boolean) {
    this.autoAppend = enable;
    this.saveState();
  }

  /**
   * Create a new script by opening native Windows Explorer Save dialog,
   * then immediately opening that newly created file as active script.
   */
  public async createNewScriptNative(defaultName = "my_script.jsonl"): Promise<{ success: boolean; path?: string }> {
    try {
      const selectedPath = await invoke<string | null>("show_save_script_dialog", { defaultName });
      if (!selectedPath) {
        return { success: false }; // User cancelled
      }

      const basename = selectedPath.split(/[/\\]/).pop() || selectedPath;
      this.activeFilePath = selectedPath;
      this.activeFileName = basename;
      this.entries = [];
      this.saveState();

      return { success: true, path: selectedPath };
    } catch (e: any) {
      console.error("Failed to create script file via dialog:", e);
      return { success: false };
    }
  }

  /**
   * Open script via native Windows Explorer Open dialog
   */
  public async openScriptNative(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const result = await invoke<[string, string] | null>("show_open_script_dialog");
      if (!result) {
        return { success: false, count: 0 }; // User cancelled
      }

      const [filePath, content] = result;
      const basename = filePath.split(/[/\\]/).pop() || filePath;

      const openRes = this.openScriptContent(filePath, basename, content);
      return openRes;
    } catch (e: any) {
      return { success: false, count: 0, error: e?.message || String(e) };
    }
  }

  /**
   * Open script from parsed file content
   */
  public openScriptContent(
    filePath: string | null,
    fileName: string,
    rawContent: string
  ): { success: boolean; count: number; error?: string } {
    try {
      const cleanContent = rawContent.trim();
      if (!cleanContent) {
        this.activeFilePath = filePath;
        this.activeFileName = fileName;
        this.entries = [];
        this.saveState();
        return { success: true, count: 0 };
      }

      const parsedEntries = this.parseEntriesFromContent(cleanContent);

      this.activeFilePath = filePath;
      this.activeFileName = fileName;
      this.entries = parsedEntries;
      this.saveState();

      return { success: true, count: parsedEntries.length };
    } catch (err: any) {
      return { success: false, count: 0, error: err?.message || String(err) };
    }
  }

  /**
   * Import and append entries from one or more script files into the currently active script
   */
  public async importEntriesFromScriptsNative(): Promise<{
    success: boolean;
    importedCount: number;
    filesCount: number;
    error?: string;
  }> {
    if (!this.activeFileName) {
      return { success: false, importedCount: 0, filesCount: 0, error: "No active script is currently open." };
    }

    try {
      const results = await invoke<Array<[string, string, number]>>("show_pick_files_dialog");
      if (!Array.isArray(results) || results.length === 0) {
        return { success: false, importedCount: 0, filesCount: 0 }; // User cancelled
      }

      let totalImported = 0;
      const newEntriesToAdd: ScriptEntry[] = [];

      for (const [_filePath, content] of results) {
        const parsed = this.parseEntriesFromContent(content);
        if (parsed.length > 0) {
          totalImported += parsed.length;
          newEntriesToAdd.push(...parsed);
        }
      }

      if (newEntriesToAdd.length > 0) {
        this.entries = [...this.entries, ...newEntriesToAdd];
        this.saveState();
      }

      return {
        success: true,
        importedCount: totalImported,
        filesCount: results.length,
      };
    } catch (e: any) {
      console.error("Failed to import entries from scripts:", e);
      return {
        success: false,
        importedCount: 0,
        filesCount: 0,
        error: e?.message || String(e),
      };
    }
  }

  /**
   * Robust parser to extract ScriptEntry items from any raw string content (.json array, .jsonl, .txt)
   */
  public parseEntriesFromContent(rawContent: string): ScriptEntry[] {
    const cleanContent = rawContent.trim();
    if (!cleanContent) return [];

    const results: ScriptEntry[] = [];

    const extractFromObj = (obj: any, idx: number): ScriptEntry | null => {
      if (!obj || typeof obj !== "object") return null;

      // Extract message
      const msg =
        obj.message ??
        obj.original ??
        obj.original_message ??
        obj.originalMessage ??
        obj.text ??
        obj.dialogue ??
        obj.msg ??
        obj.body ??
        obj.content ??
        obj.line;

      if (!msg || (typeof msg !== "string" && typeof msg !== "number")) return null;

      const transMsg =
        obj.translated_message ??
        obj.translatedMessage ??
        obj.translated ??
        obj.english ??
        obj.translation ??
        obj.target_message ??
        obj.targetMessage ??
        "";

      const spk =
        obj.speaker ??
        obj.original_speaker ??
        obj.originalSpeaker ??
        obj.name ??
        obj.character ??
        undefined;

      const transSpk =
        obj.translated_speaker ??
        obj.translatedSpeaker ??
        obj.translated_name ??
        obj.translatedName ??
        undefined;

      let extractedSpk = spk ? String(spk).trim() : undefined;
      let finalMsg = String(msg).trim();

      // Auto-extract embedded speaker if speaker key wasn't explicitly defined
      if (!extractedSpk) {
        const ext = extractSpeakerAndDialogue(finalMsg);
        if (ext.speaker) {
          extractedSpk = ext.speaker;
          finalMsg = ext.message;
        }
      }

      return {
        id: obj.id || generateUniqueId(`entry_${idx}`),
        speaker: extractedSpk || undefined,
        translated_speaker: transSpk && transSpk !== "null" ? String(transSpk).trim() : undefined,
        message: finalMsg,
        translated_message: transMsg !== undefined && transMsg !== null && transMsg !== "null" ? String(transMsg).trim() : "",
        matchedCount: obj.matchedCount || 0,
        lastUsed: obj.lastUsed,
      };
    };

    // 1. Try JSON Array
    if (cleanContent.startsWith("[")) {
      try {
        const arr = JSON.parse(cleanContent);
        if (Array.isArray(arr)) {
          arr.forEach((item, idx) => {
            const entry = extractFromObj(item, idx);
            if (entry) results.push(entry);
          });
          if (results.length > 0) return results;
        }
      } catch {}
    }

    // 2. Try JSONL / line by line
    const lines = cleanContent.split(/\r?\n/);
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx].trim();
      if (!line) continue;

      if (line.startsWith("{") && line.endsWith("}")) {
        try {
          const obj = JSON.parse(line);
          const entry = extractFromObj(obj, idx);
          if (entry) results.push(entry);
        } catch {}
      } else {
        // Plain text line
        const ext = extractSpeakerAndDialogue(line);
        if (ext.message) {
          results.push({
            id: generateUniqueId(`entry_${idx}`),
            speaker: ext.speaker || undefined,
            message: ext.message,
            translated_message: "",
            matchedCount: 0,
          });
        }
      }
    }

    return results;
  }

  /**
   * Close active script (reverts to no active script)
   */
  public closeScript() {
    this.activeFilePath = null;
    this.activeFileName = null;
    this.entries = [];
    this.saveState();
  }

  /**
   * Add entry manually
   */
  public addEntry(entry: {
    speaker?: string;
    translated_speaker?: string;
    message: string;
    translated_message: string;
  }): boolean {
    if (!this.activeFileName || !entry.message.trim()) return false;

    const newEntry: ScriptEntry = {
      id: generateUniqueId("entry"),
      speaker: entry.speaker?.trim() || undefined,
      translated_speaker: entry.translated_speaker?.trim() || undefined,
      message: entry.message.trim(),
      translated_message: entry.translated_message.trim(),
      matchedCount: 0,
    };

    this.entries = [newEntry, ...this.entries];
    this.insertEntryIntoIndexes(newEntry);
    this.saveState(true);
    return true;
  }

  /**
   * Update existing entry
   */
  public updateEntry(
    id: string,
    patch: Partial<Omit<ScriptEntry, "id">>
  ): boolean {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;

    this.entries[idx] = {
      ...this.entries[idx],
      ...patch,
    };
    this.saveState();
    return true;
  }

  /**
   * Delete entry by id
   */
  public deleteEntry(id: string): boolean {
    const prevLen = this.entries.length;
    this.entries = this.entries.filter((e) => e.id !== id);
    if (this.entries.length !== prevLen) {
      this.saveState();
      return true;
    }
    return false;
  }

  /**
   * Clear all entries in active script
   */
  public clearEntries() {
    this.entries = [];
    this.saveState();
  }

  /**
   * Automatically append a new translation to the active script (called from translationManager)
   */
  public autoAppendTranslation(item: {
    speaker?: string;
    translated_speaker?: string;
    message: string;
    translated_message: string;
  }): boolean {
    if (!this.activeFileName || !this.autoAppend) return false;

    const cleanMsg = item.message.trim();
    if (!cleanMsg || !item.translated_message.trim()) return false;

    const cleanSpk = item.speaker?.trim() || undefined;

    // Check if duplicate already exists
    const existing = this.entries.find(
      (e) =>
        e.message.trim() === cleanMsg &&
        (e.speaker?.trim() || undefined) === cleanSpk
    );

    if (existing) {
      existing.translated_message = item.translated_message.trim();
      existing.translated_speaker = item.translated_speaker?.trim() || undefined;
      existing.matchedCount = (existing.matchedCount || 0) + 1;
      existing.lastUsed = new Date().toLocaleTimeString();
      this.saveState(true);
      return true;
    }

    const newEntry: ScriptEntry = {
      id: generateUniqueId("entry"),
      speaker: cleanSpk,
      translated_speaker: item.translated_speaker?.trim() || undefined,
      message: cleanMsg,
      translated_message: item.translated_message.trim(),
      matchedCount: 1,
      lastUsed: new Date().toLocaleTimeString(),
    };

    this.entries = [newEntry, ...this.entries];
    this.insertEntryIntoIndexes(newEntry);
    this.saveState(true);
    return true;
  }

  /**
   * Look up matching translation in active script before calling external MT/LLM
   */
  public findMatch(
    message: string,
    speaker?: string,
    customThreshold?: number
  ): { matched: boolean; entry?: ScriptEntry; similarityScore: number } {
    if (!this.activeFileName || this.entries.length === 0) {
      return { matched: false, similarityScore: 0 };
    }

    let cleanMsg = message.trim();
    if (!cleanMsg) return { matched: false, similarityScore: 0 };
    let cleanSpk = speaker?.trim() || undefined;

    // If query speaker is missing, try auto-extracting from query message
    if (!cleanSpk) {
      const ext = extractSpeakerAndDialogue(cleanMsg);
      if (ext.speaker) {
        cleanSpk = ext.speaker;
        cleanMsg = ext.message;
      }
    }

    const threshold = customThreshold ?? this.matchThreshold;

    const normCleanSpk = this.normalizeSpeaker(cleanSpk);
    const normCleanMsg = this.normalizeMessage(cleanMsg);
    if (!normCleanMsg) return { matched: false, similarityScore: 0 };

    // Dynamic threshold: prevent particle-collision false positives on short strings
    let effectiveThreshold = threshold;
    if (normCleanMsg.length <= 4) {
      effectiveThreshold = Math.max(threshold, 0.90);
    } else if (normCleanMsg.length <= 6) {
      effectiveThreshold = Math.max(threshold, 0.88);
    }

    const canonicalKey = this.buildCanonicalKey(cleanSpk, cleanMsg);

    const isExactSpeakerMatch = (itemSpk?: string): boolean => {
      const normItemSpk = this.normalizeSpeaker(itemSpk);
      return Boolean(normCleanSpk && normItemSpk && normCleanSpk === normItemSpk);
    };

    const isCompatibleSpeaker = (itemSpk?: string): boolean => {
      const normItemSpk = this.normalizeSpeaker(itemSpk);
      // If neither has a speaker, they match
      if (!normCleanSpk && !normItemSpk) return true;
      // If one side has no speaker, it's compatible
      if (!normCleanSpk || !normItemSpk) return true;
      // Exact match
      if (normCleanSpk === normItemSpk) return true;
      // Substring match for noisy speaker tags (e.g. "Hazuki 1" vs "Hazuki")
      if (normCleanSpk.includes(normItemSpk) || normItemSpk.includes(normCleanSpk)) return true;
      return false;
    };

    const getSpeakerAdjustment = (itemSpk?: string): number => {
      if (isExactSpeakerMatch(itemSpk)) return 0.04;
      if (isCompatibleSpeaker(itemSpk)) return 0.0;
      return -0.08; // Speaker mismatch penalty
    };

    // =========================================================================
    // Tier 1: Exact Canonical Match (O(1)) - Speaker + Message
    // =========================================================================
    if (canonicalKey) {
      const canonList = this.canonicalIndex.get(canonicalKey);
      if (canonList && canonList.length > 0) {
        const hit = canonList[0];
        hit.matchedCount = (hit.matchedCount || 0) + 1;
        hit.lastUsed = new Date().toLocaleTimeString();
        return { matched: true, entry: hit, similarityScore: 1.0 };
      }
    }

    // =========================================================================
    // Tier 2: Normalized Message Match (O(1)) with Speaker Priority & Penalty
    // =========================================================================
    const msgHits = this.messageOnlyIndex.get(normCleanMsg);
    if (msgHits && msgHits.length > 0) {
      // 2a. Exact speaker match (Highest priority)
      const exactSpkHit = msgHits.find((e) => isExactSpeakerMatch(e.speaker));
      if (exactSpkHit) {
        exactSpkHit.matchedCount = (exactSpkHit.matchedCount || 0) + 1;
        exactSpkHit.lastUsed = new Date().toLocaleTimeString();
        return { matched: true, entry: exactSpkHit, similarityScore: 1.0 };
      }

      // 2b. Compatible speaker (one side is narration / speaker omitted in capture)
      const compatibleHit = msgHits.find((e) => isCompatibleSpeaker(e.speaker));
      if (compatibleHit && threshold <= 0.98) {
        compatibleHit.matchedCount = (compatibleHit.matchedCount || 0) + 1;
        compatibleHit.lastUsed = new Date().toLocaleTimeString();
        return { matched: true, entry: compatibleHit, similarityScore: 0.98 };
      }

      // 2c. Different speaker with Exact Message: Apply speaker mismatch penalty (-0.08)
      // Score = 0.92 (e.g. クラスメイト in capture vs 章吾 in script)
      const diffSpeakerScore = 0.92;
      if (diffSpeakerScore >= effectiveThreshold) {
        const fallbackHit = msgHits[0];
        fallbackHit.matchedCount = (fallbackHit.matchedCount || 0) + 1;
        fallbackHit.lastUsed = new Date().toLocaleTimeString();
        return { matched: true, entry: fallbackHit, similarityScore: diffSpeakerScore };
      }
    }

    // =========================================================================
    // Tier 3: Substring / Overlap Match (Protected & Evenly Sampled Inverted-Index Filter)
    // Only triggers for text of reasonable length (>= 6 chars) and very close length (diff <= 3)
    // =========================================================================
    if (threshold <= 0.90 && normCleanMsg.length >= 6) {
      let bestSubstrItem: ScriptEntry | null = null;
      let bestSubstrScore = 0;

      // Fast inverted-index retrieval: sample bigrams evenly across the entire message
      const substrCandidates = new Set<ScriptEntry>();
      const totalBigrams = normCleanMsg.length - 1;
      const sampleIndices = new Set<number>();
      const step = Math.max(1, Math.floor(totalBigrams / 5));
      for (let i = 0; i < totalBigrams; i += step) {
        sampleIndices.add(i);
      }
      sampleIndices.add(Math.max(0, totalBigrams - 1));

      for (const idx of sampleIndices) {
        const bg = normCleanMsg.slice(idx, idx + 2);
        const hits = this.ngramIndex.get(bg);
        if (hits) {
          for (const entry of hits) {
            substrCandidates.add(entry);
          }
        }
      }

      for (const item of substrCandidates) {
        const itemSpk = item._normSpeaker ?? this.normalizeSpeaker(item.speaker);
        const normItem = item._normMessage ?? this.normalizeMessage(item.message);
        if (normItem.length >= 6 && Math.abs(normItem.length - normCleanMsg.length) <= 3) {
          if (normItem.includes(normCleanMsg) || normCleanMsg.includes(normItem)) {
            const overlapScore = Math.min(normItem.length, normCleanMsg.length) / Math.max(normItem.length, normCleanMsg.length);
            const spkAdjustment = getSpeakerAdjustment(itemSpk);
            const finalScore = overlapScore + spkAdjustment;

            if (finalScore >= Math.max(effectiveThreshold, 0.85) && finalScore > bestSubstrScore) {
              bestSubstrScore = finalScore;
              bestSubstrItem = item;
            }
          }
        }
      }

      if (bestSubstrItem && bestSubstrScore >= effectiveThreshold) {
        bestSubstrItem.matchedCount = (bestSubstrItem.matchedCount || 0) + 1;
        bestSubstrItem.lastUsed = new Date().toLocaleTimeString();
        return { matched: true, entry: bestSubstrItem, similarityScore: Math.min(0.95, parseFloat(bestSubstrScore.toFixed(3))) };
      }
    }

    // =========================================================================
    // Tier 4: Fuzzy Matching
    // - Short text (<= 2 chars): Exact match only (bypassed in fuzzy to prevent false positives like はい vs いい)
    // - 3-character text: Normalized Levenshtein Distance
    // - Longer text (>= 4 chars): Bag-of-Bigrams (Multiset) Inverted Index with Mathematical Length Bounds
    // =========================================================================
    let bestMatch: ScriptEntry | null = null;
    let bestScore = 0;

    if (normCleanMsg.length <= 2) {
      // 4a. Short text (1-2 chars): Exact normalized match already handled in Tier 1 & Tier 2.
      // Bypass fuzzy matching because distance 1 changes 50-100% of lexical meaning.
    } else if (normCleanMsg.length === 3) {
      // 4b. 3-character text (e.g. "そうだ", "違うよ"): Normalized Levenshtein Distance
      for (const item of this.entries) {
        const itemSpk = item._normSpeaker ?? this.normalizeSpeaker(item.speaker);
        const normItem = item._normMessage ?? this.normalizeMessage(item.message);
        if (normItem.length !== 3) continue;

        const levDist = calcLevenshteinDistance(normCleanMsg, normItem);
        const levScore = 1.0 - levDist / 3;
        const weightedScore = levScore + getSpeakerAdjustment(itemSpk);

        if (weightedScore >= effectiveThreshold && weightedScore > bestScore) {
          bestScore = weightedScore;
          bestMatch = item;
        }
      }
    } else {
      // 4c. Longer text (>= 4 chars): Bag-of-Bigrams Multiset Intersection
      const queryBigramCounts = new Map<string, number>();
      let queryTotalBigrams = 0;
      for (let i = 0; i < normCleanMsg.length - 1; i++) {
        const bg = normCleanMsg.slice(i, i + 2);
        queryBigramCounts.set(bg, (queryBigramCounts.get(bg) || 0) + 1);
        queryTotalBigrams++;
      }

      // Mathematical length bounds:
      const queryLen = normCleanMsg.length;
      const minAllowedLen = Math.max(2, Math.floor((threshold / (2 - threshold)) * queryLen));
      const maxAllowedLen = Math.ceil(((2 - threshold) / threshold) * queryLen);

      // Collect candidate items from inverted index
      const candidates = new Set<ScriptEntry>();
      for (const bg of queryBigramCounts.keys()) {
        const hits = this.ngramIndex.get(bg);
        if (hits) {
          for (const entry of hits) {
            candidates.add(entry);
          }
        }
      }

      for (const entry of candidates) {
        const normItem = entry._normMessage ?? this.normalizeMessage(entry.message);
        const itemLen = normItem.length;

        // Prune immediately if candidate length violates theoretical bounds
        if (itemLen < minAllowedLen || itemLen > maxAllowedLen) continue;

        const candidateBigrams = entry._numBigrams ?? Math.max(1, itemLen - 1);
        const candidateBigramCounts = entry._bigramCounts;

        // Calculate true Bag-of-Bigrams (multiset) intersection: sum(min(count_Q, count_C))
        let sharedMatches = 0;
        if (candidateBigramCounts) {
          for (const [bg, qCount] of queryBigramCounts.entries()) {
            const cCount = candidateBigramCounts.get(bg);
            if (cCount) {
              sharedMatches += Math.min(qCount, cCount);
            }
          }
        }

        // Candidate-specific exact minimum shared bigrams required:
        const minRequiredShared = Math.ceil((threshold * (queryTotalBigrams + candidateBigrams)) / 2);
        if (sharedMatches < minRequiredShared) continue;

        const rawScore = (2 * sharedMatches) / (queryTotalBigrams + candidateBigrams);
        const itemSpk = entry._normSpeaker ?? this.normalizeSpeaker(entry.speaker);
        const weightedScore = rawScore + getSpeakerAdjustment(itemSpk);

        if (weightedScore >= effectiveThreshold && weightedScore > bestScore) {
          bestScore = weightedScore;
          bestMatch = entry;
        }
      }
    }

    if (bestMatch && bestScore >= effectiveThreshold) {
      bestMatch.matchedCount = (bestMatch.matchedCount || 0) + 1;
      bestMatch.lastUsed = new Date().toLocaleTimeString();
      return {
        matched: true,
        entry: bestMatch,
        similarityScore: Math.min(1.0, parseFloat(bestScore.toFixed(3))),
      };
    }

    return { matched: false, similarityScore: 0 };
  }

  /**
   * Export content as JSON string or JSONL string
   */
  public exportAsContent(asJsonArray = false): string {
    if (asJsonArray) {
      const formatted = this.entries.map((e) => ({
        speaker: e.speaker || undefined,
        translated_speaker: e.translated_speaker || undefined,
        message: e.message,
        translated_message: e.translated_message,
      }));
      return JSON.stringify(formatted, null, 2);
    }

    return this.entries
      .map((e) =>
        JSON.stringify({
          speaker: e.speaker || undefined,
          translated_speaker: e.translated_speaker || undefined,
          message: e.message,
          translated_message: e.translated_message,
        })
      )
      .join("\n");
  }
}

export const scriptManagerService = new ScriptManagerService();
