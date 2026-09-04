import { TauriBridge } from "./tauriBridge";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { TextractorProcessInfo, TextractorMessage } from "../types";
import { useTextractorStore } from "../stores/useTextractorStore";
import { cleanSpeakerName, executePreprocessingPipeline, extractSpeakerAndDialogue } from "../utils/textPreprocessor";
import { translationManager } from "./translationManager";
import { logger } from "./loggerService";
import { overlayChannel } from "../utils/overlayChannel";

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

export const DEFAULT_TEXTRACTOR_PATH = "C:\\Program Files\\Textractor\\x86\\TextractorCLI.exe";
export const DEFAULT_TEXTRACTOR_DIR = "C:\\Program Files\\Textractor";

export async function detectTextractorPath(): Promise<string | null> {
  try {
    const found = await TauriBridge.findTextractorInstallation();
    return found || null;
  } catch (err) {
    logger.debug("Textractor", `Textractor auto-detection failed or not found: ${err}`);
    return null;
  }
}

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

// Checks if incoming text is a distinctly new line rather than a fragment continuation of current
export function isDistinctNewLine(current: string, incoming: string): boolean {
  const cur = current.trim();
  const inc = incoming.trim();
  if (!cur || !inc) return false;
  if (cur === inc) return false;

  // If cur is a complete sentence (ended with closing quote, period, exclamation, question mark) and inc starts a new quote
  const curClosed = cur.endsWith("」") || cur.endsWith("』") || cur.endsWith("）") || cur.endsWith(")") || cur.endsWith("。") || cur.endsWith("！") || cur.endsWith("？");
  const incStartsNew = inc.startsWith("「") || inc.startsWith("『") || inc.startsWith("（") || inc.startsWith("(");
  if (curClosed && incStartsNew) return true;

  // If one is not a substring of the other and they have zero overlap
  if (!cur.includes(inc) && !inc.includes(cur)) {
    let hasOverlap = false;
    const maxLen = Math.min(cur.length, inc.length, 60);
    for (let len = maxLen; len >= 2; len--) {
      if (cur.slice(-len) === inc.slice(0, len)) {
        hasOverlap = true;
        break;
      }
    }
    if (!hasOverlap) {
      return true;
    }
  }

  return false;
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

  // 3. Suffix-prefix overlap merge (bounded to max 60 characters)
  const maxLen = Math.min(cur.length, inc.length, 60);
  for (let len = maxLen; len >= 2; len--) {
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
  private static unlistenTermFn: UnlistenFn | null = null;

  // Unified Multi-Thread Coordinator State
  private static syncTimer: ReturnType<typeof setTimeout> | null = null;
  private static syncFirstThreadRole: "speaker" | "dialogue" | "combined" | null = null;
  private static syncStartTime = 0;
  private static bufferedSpeaker = "";
  private static bufferedDialogue = "";
  private static globalDialogueSeq = 0;
  private static lastDispatchedText = { speaker: "", message: "" };
  private static lastDispatchedTime = 0;

  /**
   * Initialize global textractor listener stream
   */
  public static async initListener() {
    if (this.unlistenFn) return;
    try {
      this.unlistenFn = await listen<TextractorMessage>("textractor-text-event", (event) => {
        this.handleIncomingMessage(event.payload);
      });

      this.unlistenTermFn = await listen<{ pid: number }>("textractor-process-terminated", (_event) => {
        useTextractorStore.getState().setIsHooked(false);
        useTextractorStore.getState().setAttachedPid(null);
      });
    } catch (err) {
      console.warn("Failed to register Textractor global event listener:", err);
    }
  }

  /**
   * Cleanup event listeners
   */
  public static cleanupListener() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.unlistenFn) {
      this.unlistenFn();
      this.unlistenFn = null;
    }
    if (this.unlistenTermFn) {
      this.unlistenTermFn();
      this.unlistenTermFn = null;
    }
  }

  /**
   * Enumerate running GUI processes with valid window titles
   */
  public static async listProcesses(): Promise<TextractorProcessInfo[]> {
    useTextractorStore.getState().setIsLoadingProcesses(true);
    try {
      const procs = await TauriBridge.listTargetProcesses();
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
    this.globalDialogueSeq = 0;
    this.lastDispatchedText = { speaker: "", message: "" };
    this.bufferedSpeaker = "";
    this.bufferedDialogue = "";
    overlayChannel.send({ type: "RESET_SEQUENCE" });

    try {
      await TauriBridge.startTextractor(exePath, targetPid);
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
      const store = useTextractorStore.getState();
      let finalCommand = command.trim();

      // Ensure target process flag (-P<pid>) is present if a process is actively attached
      if (!/-P\d+/i.test(finalCommand) && store.attachedPid) {
        finalCommand = `${finalCommand} -P${store.attachedPid}`;
      }

      await TauriBridge.sendTextractorCommand(finalCommand);
      logger.info("Textractor", `Sent command to Textractor stdin: ${finalCommand}`);
      return { success: true };
    } catch (error: any) {
      const errStr = error?.toString() || "Failed to send command";
      logger.error("Textractor", `Failed to send command: ${errStr}`);
      return { success: false, error: errStr };
    }
  }

  /**
   * Insert custom memory hook code into the attached game process
   */
  public static async insertHook(hookCode: string): Promise<{ success: boolean; error?: string }> {
    const trimmed = hookCode.trim();
    if (!trimmed) {
      return { success: false, error: "Hook code cannot be empty" };
    }

    // Textractor hook format validation:
    // Starts with optional '/', followed by H-code or R-code type, and contains '@'
    const hookPattern = /^\/?([Hh]|[Rr]).*@/i;
    if (!hookPattern.test(trimmed)) {
      return {
        success: false,
        error: "Invalid hook code format. Example: /HN-4*0@SiglusEngine.exe or HS-8*0@43F9B0",
      };
    }

    return await this.sendCommand(trimmed);
  }


  /**
   * Detach and stop Textractor CLI
   */
  public static async stopSidecar(): Promise<{ success: boolean }> {
    try {
      await TauriBridge.stopTextractor();
      this.cleanupListener();
      this.globalDialogueSeq = 0;
      this.lastDispatchedText = { speaker: "", message: "" };
      this.bufferedSpeaker = "";
      this.bufferedDialogue = "";
      overlayChannel.send({ type: "RESET_SEQUENCE" });
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
    let normalizedRaw = deduplicateAndMergeLines(rawText);
    if (!normalizedRaw.trim()) return;

    // Apply consecutive duplicate character reduction if configured (e.g. 2 for doubled hooks: 「「運運命命」」 → 「運命」)
    if (store.charDeduplicationCount >= 2) {
      const repeatCount = store.charDeduplicationCount;
      const regex = new RegExp(`(.)\\1{${repeatCount - 1}}`, "gu");
      normalizedRaw = normalizedRaw.replace(regex, "$1");
    }

    // Apply repeated phrase & loop deduplication if enabled (e.g. shadow/outline hooks: 遥月遥月 → 遥月)
    if (store.loopDeduplication !== false) {
      let prev = "";
      for (let pass = 0; pass < 3 && normalizedRaw !== prev; pass++) {
        prev = normalizedRaw;
        normalizedRaw = normalizedRaw.replace(/(.{2,150}?)\1+/gu, "$1");
      }
    }

    // Apply stutter / repeated character reduction if enabled (e.g. あ、、あの → あ、あの)
    if (store.stutterReduction !== false) {
      normalizedRaw = normalizedRaw
        .replace(/、{2,}/g, "、")
        .replace(/。{2,}/g, "。")
        .replace(/！{2,}/g, "！")
        .replace(/!{2,}/g, "!")
        .replace(/？{2,}/g, "？")
        .replace(/\?{2,}/g, "?");
    }

    // 2. Process message according to designated Thread Role (robust matching)
    const isCombined = store.combinedThreadId === handle || store.capturedThreads.some((c) => c.threadId === handle && c.role === "combined");
    const isMessage = store.messageThreadId === handle || store.capturedThreads.some((c) => c.threadId === handle && (c.role === "dialogue" || (c.role as string) === "message"));
    const isSpeaker = store.speakerThreadId === handle || store.capturedThreads.some((c) => c.threadId === handle && c.role === "speaker");

    if (!isCombined && !isMessage && !isSpeaker) return;

    // If new typewriter fragments arrive while timer is running, extend debounce up to limit
    const syncWaitMs = isCombined ? Math.max(80, store.debounceMs || 250) : Math.max(120, store.threadSyncWaitMs || 200);
    const MAX_DEBOUNCE_CEILING_MS = 1200;
    const now = Date.now();

    if (this.syncTimer) {
      if (now - this.syncStartTime > MAX_DEBOUNCE_CEILING_MS) {
        // Force flush accumulated dialogue to prevent starvation on continuous typewriter stream
        clearTimeout(this.syncTimer);
        this.finalizeAndDispatch();
        this.syncStartTime = now;
        this.syncFirstThreadRole = isSpeaker ? "speaker" : isMessage ? "dialogue" : "combined";
      } else {
        clearTimeout(this.syncTimer);
      }
    } else {
      this.syncStartTime = now;
      this.syncFirstThreadRole = isSpeaker ? "speaker" : isMessage ? "dialogue" : "combined";
    }

    this.syncTimer = setTimeout(() => {
      this.finalizeAndDispatch();
    }, syncWaitMs);

    // Accumulate/buffer data into respective slots during the global sync timer window
    if (isCombined) {
      const extracted = extractSpeakerAndDialogue(normalizedRaw);
      const cleanSpk = extracted.speaker ? cleanSpeakerName(executePreprocessingPipeline(extracted.speaker, "textractor")) : "";
      const cleanMsg = executePreprocessingPipeline(extracted.message, "textractor");

      if (cleanSpk) this.bufferedSpeaker = cleanSpk;
      if (cleanMsg) this.bufferedDialogue = mergeDialogueFragments(this.bufferedDialogue, cleanMsg);

      store.setLatestSpeaker(this.bufferedSpeaker);
      store.setLatestMessage(this.bufferedDialogue);
      store.setLatestRawMessage(normalizedRaw);
    } else if (isSpeaker) {
      const cleanSpk = cleanSpeakerName(executePreprocessingPipeline(normalizedRaw, "textractor"));
      if (cleanSpk) {
        this.bufferedSpeaker = cleanSpk;
        store.setLatestSpeaker(cleanSpk);
      }
    } else if (isMessage) {
      const cleanMsg = executePreprocessingPipeline(normalizedRaw, "textractor").trim();
      if (cleanMsg) {
        this.bufferedDialogue = mergeDialogueFragments(this.bufferedDialogue, cleanMsg);
        store.setLatestMessage(this.bufferedDialogue);
        store.setLatestRawMessage(normalizedRaw);
      }
    }
  }

  /**
   * Finalizes assembled text and dispatches to Overlay and TranslationManager
   */
  private static finalizeAndDispatch() {
    let firstRole: "speaker" | "dialogue" | "combined" | null = null;
    let spk = "";
    let msg = "";

    try {
      firstRole = this.syncFirstThreadRole;
      spk = this.bufferedSpeaker.trim();
      msg = this.bufferedDialogue.trim();
    } finally {
      this.syncTimer = null;
      this.syncFirstThreadRole = null;
      this.syncStartTime = 0;
      this.bufferedSpeaker = "";
      this.bufferedDialogue = "";
    }

    // Rule 2:
    // If first thread was speaker and dialogue is empty, discard/drop (orphan speaker hook)
    if (firstRole === "speaker" && !msg) {
      return;
    }

    // If dialogue is empty, discard
    if (!msg) {
      return;
    }

    // If first thread was dialogue and speaker is empty, proceed with empty speaker (pure narration)
    const dialogueId = ++this.globalDialogueSeq;

    // Burst deduplication check (< 800ms)
    const store = useTextractorStore.getState();
    const now = Date.now();
    const isSameText = spk === this.lastDispatchedText.speaker && msg === this.lastDispatchedText.message;
    const timeSinceLast = now - this.lastDispatchedTime;

    if (isSameText && store.ignoreDuplicateLines && timeSinceLast < 800) {
      return;
    }

    this.lastDispatchedText = { speaker: spk, message: msg };
    this.lastDispatchedTime = now;

    // Update UI store
    store.setLatestSpeaker(spk);
    store.setLatestMessage(msg);

    // Forward directly to Translation Pipeline (Single Point of Dispatch)
    translationManager.translate({
      id: dialogueId,
      speaker: spk || undefined,
      message: msg,
      sourceType: "textractor",
    });
  }

  /**
   * Set thread role and sync with capturedThreads
   */
  public static setThreadRole(threadId: number, role: "combined" | "dialogue" | "speaker" | "ignored") {
    // Cleanly cancel any running sync timers and reset buffer on thread change
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    this.syncFirstThreadRole = null;
    this.bufferedDialogue = "";
    this.bufferedSpeaker = "";
    this.lastDispatchedText = { speaker: "", message: "" };

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
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    this.syncFirstThreadRole = null;
    this.bufferedDialogue = "";
    this.bufferedSpeaker = "";
    const store = useTextractorStore.getState();

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

  /**
   * Dispose and cleanup all Textractor listeners and processes
   */
  public static async dispose() {
    await this.stopSidecar();
  }
}

export const textractorService = TextractorService;
