import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { TextractorProcessInfo, TextractorMessage } from "../types";
import { useTextractorStore } from "../stores/useTextractorStore";
import { useTranslationStore } from "../stores/useTranslationStore";
import { cleanSpeakerName, executePreprocessingPipeline, extractSpeakerAndDialogue } from "../utils/textPreprocessor";
import { translationManager } from "./translationManager";

export interface EngineHookPreset {
  name: string;
  engine: string;
  code: string;
  description: string;
}

export const POPULAR_HOOK_PRESETS: EngineHookPreset[] = [
  {
    name: "Auto-Hook All Text (Default)",
    engine: "Universal",
    code: "",
    description: "Hooks TextOutA/W, ExtTextOut, GetGlyphOutline, DrawText, and built-in engine hooks",
  },
  {
    name: "Kirikiri / KAG Engine (UTF-16)",
    engine: "Kirikiri 2 / Z",
    code: "HS-8*0@43F9B0",
    description: "Standard wide-string hook for Fate/stay night, Clannad, Tsukihime, and standard KAG games",
  },
  {
    name: "Siglus Engine (VisualArt's / Key)",
    engine: "SiglusEngine",
    code: "/HN-4*0@SiglusEngine.exe",
    description: "Hook for Summer Pockets, Rewrite, and modern Key visual novels",
  },
  {
    name: "Majiro Engine",
    engine: "Majiro",
    code: "/HB-8*0@Majiro.exe",
    description: "Hook for Nitroplus, August, and Majiro-powered visual novel titles",
  },
  {
    name: "Unity (Mono / IL2CPP Wide Character)",
    engine: "Unity",
    code: "HS65001#4@0:mono-2.0-bdwgc.dll",
    description: "UTF-8 / UTF-16 stream hook for modern Unity visual novels and RPGs",
  },
  {
    name: "CatSystem 2",
    engine: "CatSystem2",
    code: "/HS-8*0@cs2.exe",
    description: "Standard hook for Grisaia no Kajitsu and Frontwing CatSystem2 games",
  },
  {
    name: "YU-RIS Engine",
    engine: "YU-RIS",
    code: "/HB4*0@yuris.exe",
    description: "Hook for standard YU-RIS visual novels",
  },
  {
    name: "Artemis Engine (PF8)",
    engine: "Artemis",
    code: "/HS8*0@root.pfs",
    description: "Hook for modern multiplatform Artemis visual novels",
  },
  {
    name: "NScripter / ONScripter",
    engine: "NScripter",
    code: "/HN4*0@nscript.dat",
    description: "Hook for Tsukihime, Higurashi, and classic NScripter games",
  },
];

export const DEFAULT_TEXTRACTOR_PATH = "D:\\Program Files\\Textractor\\x86\\TextractorCLI.exe";
export const DEFAULT_TEXTRACTOR_DIR = "D:\\Program Files\\Textractor";

// Normalizes multi-line packet bursts:
// If every line is identical, takes only 1 line.
// If lines are different, merges them sequentially.
export function deduplicateAndMergeLines(rawText: string): string {
  if (!rawText) return "";
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0];

  const first = lines[0];
  const allIdentical = lines.every((l) => l === first);
  if (allIdentical) {
    return first;
  }

  // Combine non-identical lines sequentially
  return lines.join(" ");
}

// Smart merge helper for visual novel typewriter text fragments & multi-pass memory hooks
export function mergeDialogueFragments(current: string, incoming: string): string {
  const cur = current.trim();
  const inc = incoming.trim();

  if (!cur) return inc;
  if (!inc) return cur;

  // 1. If incoming chunk is an exact match or substring already inside current, keep current
  if (cur.includes(inc)) {
    return cur;
  }

  // 2. If current is a prefix/substring of incoming, take incoming
  if (inc.includes(cur)) {
    return inc;
  }

  // 3. Suffix-prefix overlap merge (e.g. cur: "かような機会があれば、" inc: "あれば、是が非でも」")
  for (let len = Math.min(cur.length, inc.length); len >= 2; len--) {
    const curEnd = cur.slice(-len);
    const incStart = inc.slice(0, len);
    if (curEnd === incStart) {
      return cur + inc.slice(len);
    }
  }

  // 4. If current line hasn't closed quotation and incoming is continuation
  if (
    !cur.endsWith("」") &&
    !cur.endsWith("』") &&
    !cur.endsWith("）") &&
    !cur.endsWith(")") &&
    !inc.startsWith("「") &&
    !inc.startsWith("『")
  ) {
    return cur + inc;
  }

  return inc;
}

export class TextractorService {
  private static unlistenFn: UnlistenFn | null = null;
  private static debounceTimer: any = null;
  private static bufferedMessage = "";
  private static bufferedSpeaker = "";
  private static lastDispatchedText = { speaker: "", message: "" };

  // Dual-Thread Synchronization State (Sequence ID / Event Counters)
  private static speakerLineSeq = 0;
  private static dialogueLineSeq = 0;
  private static pendingSpeakerText = "";
  private static pendingSpeakerSeq = 0;
  private static speakerWaitTimer: any = null;
  private static dialogueWaitTimer: any = null;
  private static bufferedSeparateDialogue = "";
  private static dialogueStartSpeakerSeq = 0;

  /**
   * Initialize global textractor listener stream
   */
  public static async initListener() {
    if (this.unlistenFn) return;
    try {
      this.unlistenFn = await listen<TextractorMessage>("textractor-text-event", (event) => {
        this.handleIncomingMessage(event.payload);
      });

      await listen<{ pid: number }>("textractor-process-terminated", (_event) => {
        useTextractorStore.getState().setIsHooked(false);
        useTextractorStore.getState().setAttachedPid(null);
      });
    } catch (err) {
      console.warn("Failed to register Textractor global event listener:", err);
    }
  }

  /**
   * Enumerate running GUI processes with valid window titles
   */
  public static async listProcesses(): Promise<TextractorProcessInfo[]> {
    useTextractorStore.getState().setIsLoadingProcesses(true);
    try {
      const procs = await invoke<TextractorProcessInfo[]>("list_target_processes");
      useTextractorStore.getState().setProcesses(procs);
      return procs;
    } catch (error) {
      console.warn("Failed to list target processes:", error);
      return [];
    } finally {
      useTextractorStore.getState().setIsLoadingProcesses(false);
    }
  }

  /**
   * Start Textractor CLI sidecar and attach to target PID
   */
  public static async startSidecar(exePath: string, targetPid: number): Promise<{ success: boolean; error?: string }> {
    const store = useTextractorStore.getState();
    store.setIsAttaching(true);
    store.setHookError(null);

    await this.initListener();

    try {
      await invoke("start_textractor", { exePath, targetPid });
      store.setIsHooked(true);
      store.setAttachedPid(targetPid);
      return { success: true };
    } catch (error: any) {
      const errStr = error?.toString() || "Unknown error starting Textractor";
      store.setHookError(errStr);
      return { success: false, error: errStr };
    } finally {
      store.setIsAttaching(false);
    }
  }

  /**
   * Send custom stdin command to Textractor (e.g. hookcode -P1234, detach -P1234)
   */
  public static async sendCommand(command: string): Promise<{ success: boolean; error?: string }> {
    try {
      await invoke("send_textractor_command", { command });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.toString() || "Failed to send command" };
    }
  }

  /**
   * Detach and stop Textractor CLI
   */
  public static async stopSidecar(): Promise<{ success: boolean }> {
    try {
      await invoke("stop_textractor");
      useTextractorStore.getState().resetTextractor();
      return { success: true };
    } catch (error) {
      console.warn("Failed to stop Textractor:", error);
      return { success: false };
    }
  }

  /**
   * Process raw message from sidecar listener
   */
  public static handleIncomingMessage(msg: TextractorMessage) {
    const store = useTextractorStore.getState();
    const handle = msg.handle;
    const rawText = msg.text || "";

    // 1. Register or update thread in master thread list
    store.setThreads((prevThreads) => {
      const nextThreads = new Map(prevThreads);
      const existing = nextThreads.get(handle);

      if (existing) {
        nextThreads.set(handle, {
          ...existing,
          totalLines: existing.totalLines + (rawText ? 1 : 0),
          lastText: rawText || existing.lastText,
          lastTimestamp: msg.timestamp,
          name: existing.name || msg.name || `Thread 0x${handle.toString(16).toUpperCase()}`,
          hookCode: existing.hookCode || msg.hook_code || "",
          address: existing.address || msg.address || "",
          isActive: true,
        });
      } else {
        nextThreads.set(handle, {
          id: handle,
          name: msg.name || `Thread 0x${handle.toString(16).toUpperCase()}`,
          hookCode: msg.hook_code || "",
          address: msg.address || "",
          totalLines: rawText ? 1 : 0,
          lastText: rawText,
          lastTimestamp: msg.timestamp,
          isActive: true,
          role: "ignored",
        });
      }
      return nextThreads;
    });

    if (rawText.trim()) {
      // Surface Textractor Console warnings to UI
      if (msg.name === "Console" && (rawText.toLowerCase().includes("mismatch") || rawText.toLowerCase().includes("fail") || rawText.toLowerCase().includes("error") || rawText.toLowerCase().includes("denied"))) {
        store.setHookError(rawText);
      }

      store.setThreadLogs((prevLogs) => {
        const nextLogs = new Map(prevLogs);
        const list = nextLogs.get(handle) || [];
        const updated = [msg, ...list].slice(0, store.maxLogLines);
        nextLogs.set(handle, updated);
        return nextLogs;
      });
    }

    if (!rawText.trim()) return;

    // Normalize packet line bursts (deduplicate if all lines identical, merge if different)
    const normalizedRaw = deduplicateAndMergeLines(rawText);
    if (!normalizedRaw.trim()) return;

    // 2. Process message according to designated Thread Role
    const isCombined = store.combinedThreadId === handle;
    const isMessage = store.messageThreadId === handle;
    const isSpeaker = store.speakerThreadId === handle;

    if (isCombined) {
      const extracted = extractSpeakerAndDialogue(normalizedRaw);
      const cleanSpk = extracted.speaker ? cleanSpeakerName(executePreprocessingPipeline(extracted.speaker, "textractor")) : "";
      const cleanMsg = executePreprocessingPipeline(extracted.message, "textractor");

      this.bufferedSpeaker = cleanSpk;
      this.bufferedMessage = mergeDialogueFragments(this.bufferedMessage, cleanMsg);

      store.setLatestSpeaker(this.bufferedSpeaker);
      store.setLatestMessage(this.bufferedMessage);
      store.setLatestRawMessage(normalizedRaw);

      this.debounceDispatch();
    } else if (isSpeaker) {
      // =========================================================================
      // DEDICATED SPEAKER THREAD HANDLER
      // =========================================================================
      const cleanSpk = cleanSpeakerName(executePreprocessingPipeline(normalizedRaw, "textractor"));
      if (!cleanSpk) return;

      // Increment sequence counter for speaker line arrival (never relying on string equality)
      this.speakerLineSeq++;
      this.pendingSpeakerText = cleanSpk;
      this.pendingSpeakerSeq = this.speakerLineSeq;

      store.setLatestSpeaker(cleanSpk);

      if (this.speakerWaitTimer) {
        clearTimeout(this.speakerWaitTimer);
      }

      const currentDialogueSeqAtArrival = this.dialogueLineSeq;
      const syncWait = Math.max(50, store.threadSyncWaitMs || 150);

      // Invalidate orphaned speaker candidate if no dialogue line follows within sync wait window
      this.speakerWaitTimer = setTimeout(() => {
        if (this.dialogueLineSeq === currentDialogueSeqAtArrival) {
          if (this.pendingSpeakerSeq === this.speakerLineSeq) {
            this.pendingSpeakerText = "";
          }
        }
      }, syncWait);
    } else if (isMessage) {
      // =========================================================================
      // DEDICATED DIALOGUE THREAD HANDLER
      // =========================================================================
      const cleanMsg = executePreprocessingPipeline(normalizedRaw, "textractor").trim();
      if (!cleanMsg) return;

      // Increment sequence counter for dialogue line arrival
      this.dialogueLineSeq++;
      this.bufferedSeparateDialogue = mergeDialogueFragments(this.bufferedSeparateDialogue, cleanMsg);
      store.setLatestMessage(this.bufferedSeparateDialogue);
      store.setLatestRawMessage(normalizedRaw);

      // Record speaker sequence at the moment this dialogue arrived
      this.dialogueStartSpeakerSeq = this.speakerLineSeq;
      const syncWait = Math.max(50, store.threadSyncWaitMs || 150);

      if (this.dialogueWaitTimer) {
        clearTimeout(this.dialogueWaitTimer);
      }

      // Wait n ms for speaker thread to produce a new line
      this.dialogueWaitTimer = setTimeout(() => {
        let finalSpeaker = "";
        // If a valid speaker arrived in the window or just prior, pair it
        if (this.pendingSpeakerText && this.pendingSpeakerSeq >= this.dialogueStartSpeakerSeq) {
          finalSpeaker = this.pendingSpeakerText;
          this.pendingSpeakerText = "";
        } else {
          // No speaker produced in the window -> Pure Narration line
          finalSpeaker = "";
        }

        const finalMsg = this.bufferedSeparateDialogue.trim();
        this.bufferedSeparateDialogue = "";

        if (!finalMsg) return;

        this.bufferedSpeaker = finalSpeaker;
        this.bufferedMessage = finalMsg;
        store.setLatestSpeaker(finalSpeaker);
        store.setLatestMessage(finalMsg);

        this.dispatchFinalTranslation(finalSpeaker, finalMsg);
      }, syncWait);
    }
  }

  private static dispatchFinalTranslation(spk: string, msg: string) {
    if (!msg) return;

    const hasChanged = spk !== this.lastDispatchedText.speaker || msg !== this.lastDispatchedText.message;

    if (hasChanged) {
      this.lastDispatchedText = { speaker: spk, message: msg };
      const translationStore = useTranslationStore.getState();
      if (!translationStore.isPaused) {
        translationManager.translate({
          speaker: spk || undefined,
          message: msg,
        });
      }
    }
  }

  private static debounceDispatch() {
    const store = useTextractorStore.getState();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      const spk = this.bufferedSpeaker.trim();
      const msg = this.bufferedMessage.trim();

      this.dispatchFinalTranslation(spk, msg);

      this.bufferedMessage = "";
      this.bufferedSpeaker = "";
    }, store.debounceMs);
  }

  /**
   * Set thread role and sync with capturedThreads
   */
  public static setThreadRole(threadId: number, role: "combined" | "dialogue" | "speaker" | "ignored") {
    const store = useTextractorStore.getState();
    store.updateCapturedThreadRole(threadId, role);

    const currentCaptured = useTextractorStore.getState().capturedThreads;
    let nextCombined: number | null = null;
    let nextMsg: number | null = null;
    let nextSpeaker: number | null = null;

    for (const c of currentCaptured) {
      if (c.role === "combined" && nextCombined === null) nextCombined = c.threadId;
      if (c.role === "dialogue" && nextMsg === null) nextMsg = c.threadId;
      if (c.role === "speaker" && nextSpeaker === null) nextSpeaker = c.threadId;
    }

    store.setCombinedThreadId(nextCombined);
    store.setMessageThreadId(nextMsg);
    store.setSpeakerThreadId(nextSpeaker);

    store.setThreads((prev) => {
      const next = new Map(prev);
      for (const [id, t] of next.entries()) {
        const captured = currentCaptured.find((c) => c.threadId === id);
        const tRole: "combined" | "message" | "speaker" | "ignored" = captured
          ? (captured.role === "dialogue" ? "message" : captured.role)
          : "ignored";
        next.set(id, { ...t, role: tRole });
      }
      return next;
    });

    this.recomputeInspector(nextCombined, nextMsg, nextSpeaker);
  }

  /**
   * Set thread role and recompute inspector (Legacy toggle helper)
   */
  public static toggleRole(threadId: number, role: "combined" | "message" | "speaker") {
    const store = useTextractorStore.getState();
    const targetRole = role === "message" ? "dialogue" : role;
    const existing = store.capturedThreads.find((c) => c.threadId === threadId);

    if (existing && existing.role === targetRole) {
      this.setThreadRole(threadId, "ignored");
    } else {
      this.setThreadRole(threadId, targetRole);
    }
  }

  /**
   * Recomputes live stream inspector according to active roles
   */
  public static recomputeInspector(
    combinedId: number | null,
    msgId: number | null,
    speakerId: number | null
  ) {
    const store = useTextractorStore.getState();
    this.bufferedMessage = "";
    this.bufferedSpeaker = "";
    this.lastDispatchedText = { speaker: "", message: "" };

    if (combinedId === null && msgId === null && speakerId === null) {
      store.setLatestSpeaker("");
      store.setLatestMessage("");
      store.setLatestRawMessage("");
      return;
    }

    if (combinedId !== null) {
      const thread = store.threads.get(combinedId);
      if (thread && thread.lastText) {
        const clean = executePreprocessingPipeline(thread.lastText, "textractor");
        const { speaker, message } = extractSpeakerAndDialogue(clean);
        store.setLatestSpeaker(speaker);
        store.setLatestMessage(message);
        store.setLatestRawMessage(thread.lastText);
      } else {
        store.setLatestSpeaker("");
        store.setLatestMessage("");
        store.setLatestRawMessage("");
      }
      return;
    }

    // Separate Speaker
    if (speakerId !== null) {
      const spkThread = store.threads.get(speakerId);
      if (spkThread && spkThread.lastText) {
        const cleanSpk = executePreprocessingPipeline(spkThread.lastText, "textractor").trim();
        store.setLatestSpeaker(cleanSpk);
      } else {
        store.setLatestSpeaker("");
      }
    } else {
      store.setLatestSpeaker("");
    }

    // Separate Dialogue
    if (msgId !== null) {
      const msgThread = store.threads.get(msgId);
      if (msgThread && msgThread.lastText) {
        const cleanMsg = executePreprocessingPipeline(msgThread.lastText, "textractor");
        store.setLatestMessage(cleanMsg);
        store.setLatestRawMessage(msgThread.lastText);
      } else {
        store.setLatestMessage("");
        store.setLatestRawMessage("");
      }
    } else {
      store.setLatestMessage("");
      store.setLatestRawMessage("");
    }
  }

  /**
   * Clear logs for a specific thread or all threads
   */
  public static clearLogs(threadId?: number) {
    const store = useTextractorStore.getState();
    if (threadId !== undefined) {
      store.setThreadLogs((prev) => {
        const next = new Map(prev);
        next.set(threadId, []);
        return next;
      });
    } else {
      store.setThreadLogs(new Map());
    }
  }
}

export const textractorService = TextractorService;
