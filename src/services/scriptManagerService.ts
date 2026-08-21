/**
 * Script Manager Service
 * Manages active Visual Novel script database (.json / .jsonl), matching engine, native Windows Explorer dialogs, and file autosave.
 */

import { invoke } from "@tauri-apps/api/core";

export function generateUniqueId(prefix = "entry"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface ScriptEntry {
  id: string;
  speaker?: string;
  translated_speaker?: string;
  message: string;
  translated_message: string;
  matchedCount?: number;
  lastUsed?: string;
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
  private exactIndex: Map<string, ScriptEntry> = new Map();
  private normalizedIndex: Map<string, ScriptEntry> = new Map();
  private ngramIndex: Map<string, Set<ScriptEntry>> = new Map();

  constructor() {
    this.loadPersistedState();
  }

  private rebuildIndexes() {
    this.exactIndex.clear();
    this.normalizedIndex.clear();
    this.ngramIndex.clear();

    const normalizeText = (t: string) => {
      let res = t
        .replace(/[\u3000\s\r\n\t]/g, "")
        .replace(/[「」『』【】（）()〈〉《》""''“”]/g, "")
        .replace(/[、，,]/g, "")
        .replace(/[。．\.]+/g, "")
        .replace(/[…‥・―ー\-~〜]/g, "")
        .replace(/[！!]/g, "！")
        .replace(/[？?]/g, "？")
        .replace(/《[^》]+》/g, "")
        .toLowerCase()
        .trim();
      return res || (t.trim().length > 0 ? "..." : "");
    };

    for (const item of this.entries) {
      const trimmed = item.message.trim();
      if (trimmed && !this.exactIndex.has(trimmed)) {
        this.exactIndex.set(trimmed, item);
      }
      const norm = normalizeText(trimmed);
      if (norm && !this.normalizedIndex.has(norm)) {
        this.normalizedIndex.set(norm, item);
      }

      // Build Inverted Bigram Index for instant candidate retrieval
      if (norm.length >= 2) {
        for (let i = 0; i < norm.length - 1; i++) {
          const bg = norm.slice(i, i + 2);
          let set = this.ngramIndex.get(bg);
          if (!set) {
            set = new Set();
            this.ngramIndex.set(bg, set);
          }
          set.add(item);
        }
      }
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

  private saveState() {
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

    this.rebuildIndexes();

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

      return {
        id: obj.id || generateUniqueId(`entry_${idx}`),
        speaker: spk ? String(spk).trim() : undefined,
        translated_speaker: transSpk && transSpk !== "null" ? String(transSpk).trim() : undefined,
        message: String(msg).trim(),
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
        const ext = this.extractSpeakerAndDialogue(line);
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

  private extractSpeakerAndDialogue(raw: string): { speaker: string | null; message: string } {
    const trimmed = raw.trim();
    if (!trimmed) return { speaker: null, message: "" };

    const bracketMatch = trimmed.match(/^[【\[]([^】\]]+)[】\]]\s*(.*)$/);
    if (bracketMatch) {
      return {
        speaker: bracketMatch[1].trim(),
        message: bracketMatch[2].trim(),
      };
    }

    return { speaker: null, message: trimmed };
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
    this.saveState();
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
      this.saveState();
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
    this.saveState();
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

    const cleanMsg = message.trim();
    if (!cleanMsg) return { matched: false, similarityScore: 0 };
    const cleanSpk = speaker?.trim() || undefined;
    const threshold = customThreshold ?? this.matchThreshold;

    // Normalizers
    const normalizeSpeaker = (s?: string) =>
      (s || "")
        .replace(/[\u3000\s【】「」『』()（）\[\]{}<>《》:：#@0-9]/g, "")
        .toLowerCase()
        .trim();

    const normalizeText = (t: string) => {
      let res = t
        .replace(/[\u3000\s\r\n\t]/g, "")
        .replace(/[「」『』【】（）()〈〉《》""''“”]/g, "")
        .replace(/[、，,]/g, "")
        .replace(/[。．\.]+/g, "")
        .replace(/[…‥・―ー\-~〜]/g, "")
        .replace(/[！!]/g, "！")
        .replace(/[？?]/g, "？")
        .replace(/《[^》]+》/g, "")
        .toLowerCase()
        .trim();

      // If string was purely silence/dots (e.g. "……" or "..."), standardize to "..."
      if (!res && t.trim().length > 0) {
        return "...";
      }
      return res;
    };

    const normCleanSpk = normalizeSpeaker(cleanSpk);

    const speakerMatches = (spk1Norm: string, itemSpk?: string): boolean => {
      if (!spk1Norm || !itemSpk) return true; // If one side has no speaker tag, allow match
      const normItemSpk = normalizeSpeaker(itemSpk);
      if (!normItemSpk) return true;
      if (spk1Norm === normItemSpk) return true;
      // Partial / substring match for noisy speaker tags (e.g. "Hazuki 1" vs "Hazuki")
      if (spk1Norm.includes(normItemSpk) || normItemSpk.includes(spk1Norm)) return true;
      return false;
    };

    // Helper to calculate Sørensen–Dice bigram similarity
    const calcBigramDice = (s1: string, s2: string): number => {
      if (s1 === s2) return 1.0;
      if (s1.length < 2 || s2.length < 2) return s1 === s2 ? 1.0 : s1.includes(s2) || s2.includes(s1) ? 0.75 : 0;
      const bg1 = new Map<string, number>();
      for (let i = 0; i < s1.length - 1; i++) {
        const b = s1.slice(i, i + 2);
        bg1.set(b, (bg1.get(b) || 0) + 1);
      }
      let matches = 0;
      for (let j = 0; j < s2.length - 1; j++) {
        const b = s2.slice(j, j + 2);
        const count = bg1.get(b) || 0;
        if (count > 0) {
          matches++;
          bg1.set(b, count - 1);
        }
      }
      return (2 * matches) / (s1.length - 1 + (s2.length - 1));
    };

    // 1. Fast Index Exact Match (O(1))
    const exactHit = this.exactIndex.get(cleanMsg);
    if (exactHit) {
      if (speakerMatches(normCleanSpk, exactHit.speaker) || threshold <= 0.99) {
        exactHit.matchedCount = (exactHit.matchedCount || 0) + 1;
        exactHit.lastUsed = new Date().toLocaleTimeString();
        return {
          matched: true,
          entry: exactHit,
          similarityScore: speakerMatches(normCleanSpk, exactHit.speaker) ? 1.0 : 0.99,
        };
      }
    }

    // 2. Fast Index Normalized Match (O(1))
    const normalizedQuery = normalizeText(cleanMsg);
    if (normalizedQuery.length > 0) {
      const normHit = this.normalizedIndex.get(normalizedQuery);
      if (normHit && threshold <= 0.98) {
        normHit.matchedCount = (normHit.matchedCount || 0) + 1;
        normHit.lastUsed = new Date().toLocaleTimeString();
        return {
          matched: true,
          entry: normHit,
          similarityScore: speakerMatches(normCleanSpk, normHit.speaker) ? 0.98 : 0.97,
        };
      }

      // 3. Substring / Prefix / Suffix match if longer than 5 characters
      if (threshold <= 0.90 && normalizedQuery.length >= 5) {
        let substrFallback: ScriptEntry | null = null;
        for (const item of this.entries) {
          const normItem = normalizeText(item.message);
          if (normItem.length >= 5) {
            if (normItem.includes(normalizedQuery) || normalizedQuery.includes(normItem)) {
              if (speakerMatches(normCleanSpk, item.speaker)) {
                item.matchedCount = (item.matchedCount || 0) + 1;
                item.lastUsed = new Date().toLocaleTimeString();
                return { matched: true, entry: item, similarityScore: 0.90 };
              } else if (!substrFallback) {
                substrFallback = item;
              }
            }
          }
        }

        if (substrFallback) {
          substrFallback.matchedCount = (substrFallback.matchedCount || 0) + 1;
          substrFallback.lastUsed = new Date().toLocaleTimeString();
          return { matched: true, entry: substrFallback, similarityScore: 0.88 };
        }
      }

      // 4. Fuzzy Similarity matching (Inverted Bigram Index + Dice coefficient) with Speaker Preference
      let bestMatch: ScriptEntry | null = null;
      let bestScore = 0;

      // Fast candidate retrieval via inverted index
      let candidates: Set<ScriptEntry> = new Set();
      if (normalizedQuery.length >= 2) {
        for (let i = 0; i < normalizedQuery.length - 1; i++) {
          const bg = normalizedQuery.slice(i, i + 2);
          const hits = this.ngramIndex.get(bg);
          if (hits) {
            hits.forEach((item) => candidates.add(item));
          }
        }
      }

      // If no bigram matches (e.g. single character queries or unindexed items), fallback to direct list
      const candidateList = candidates.size > 0 ? Array.from(candidates) : this.entries;

      for (const item of candidateList) {
        const normItem = normalizeText(item.message);
        if (Math.abs(normItem.length - normalizedQuery.length) > 15) continue;
        const rawScore = calcBigramDice(normalizedQuery, normItem);

        if (rawScore >= threshold) {
          const isSpkMatch = speakerMatches(normCleanSpk, item.speaker);
          // Bonus weight for matching speaker (+0.03) to break ties favorably
          const weightedScore = rawScore + (isSpkMatch ? 0.03 : 0);

          if (weightedScore > bestScore) {
            bestScore = weightedScore;
            bestMatch = item;
          }
        }
      }

      if (bestMatch && bestScore >= threshold) {
        bestMatch.matchedCount = (bestMatch.matchedCount || 0) + 1;
        bestMatch.lastUsed = new Date().toLocaleTimeString();
        return {
          matched: true,
          entry: bestMatch,
          similarityScore: Math.min(1.0, parseFloat(bestScore.toFixed(3))),
        };
      }
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
