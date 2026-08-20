import React, { useState, useEffect, useRef } from "react";
import {
  TextractorProcessInfo,
  TextractorMessage,
  TextractorThread,
} from "../../types";
import {
  TextractorService,
  POPULAR_HOOK_PRESETS,
  DEFAULT_TEXTRACTOR_PATH,
  EngineHookPreset,
} from "../../services/textractorService";
import { executePreprocessingPipeline, extractSpeakerAndDialogue } from "../../utils/textPreprocessor";
import { overlayChannel } from "../../utils/overlayChannel";
import {
  Cpu,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Play,
  Square,
  Zap,
  Sliders,
  Terminal,
  Trash2,
  Radio,
  Search,
  FileText,
  Activity,
  Layers,
  Sparkles,
} from "lucide-react";

// Smart merge helper for visual novel typewriter text fragments & multi-pass memory hooks
function mergeDialogueFragments(current: string, incoming: string): string {
  const cur = current.trim();
  const inc = incoming.trim();

  if (!cur) return inc;
  if (!inc) return cur;

  // 1. If incoming chunk is an exact match or substring already inside current, keep current (e.g. current is full sentence)
  if (cur.includes(inc)) {
    return cur;
  }

  // 2. If current is a prefix/substring of incoming, take incoming (e.g. progressive typewriter expansion)
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

  // Otherwise, it is a new dialogue turn
  return inc;
}

export const TextractorInputView: React.FC = () => {
  // Textractor Binary Path & Architecture
  const [exePath, setExePath] = useState<string>(() => {
    return localStorage.getItem("vn_textractor_path") || DEFAULT_TEXTRACTOR_PATH;
  });
  const [arch, setArch] = useState<"x86" | "x64">("x86");

  // Process Enumeration State
  const [processes, setProcesses] = useState<TextractorProcessInfo[]>([]);
  const [isLoadingProcesses, setIsLoadingProcesses] = useState<boolean>(false);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [processSearchQuery, setProcessSearchQuery] = useState<string>("");

  // Sidecar Hooking State
  const [isHooked, setIsHooked] = useState<boolean>(false);
  const [isAttaching, setIsAttaching] = useState<boolean>(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [attachedPid, setAttachedPid] = useState<number | null>(null);

  // Hook Discovery Duration & Debounce Settings
  const [discoveryDuration, setDiscoveryDuration] = useState<number>(() => {
    const saved = localStorage.getItem("vn_textractor_discovery_duration");
    return saved ? Number(saved) : 10;
  });
  const [discoverySecondsLeft, setDiscoverySecondsLeft] = useState<number>(0);
  const [isDiscoveryActive, setIsDiscoveryActive] = useState<boolean>(false);
  const [debounceMs, setDebounceMs] = useState<number>(() => {
    const saved = localStorage.getItem("vn_textractor_debounce_ms");
    return saved ? Number(saved) : 250;
  });
  const [specificTextFilter, setSpecificTextFilter] = useState<string>("");

  // Custom Hook Codes & Presets
  const [selectedPreset, setSelectedPreset] = useState<EngineHookPreset>(POPULAR_HOOK_PRESETS[0]);
  const [customHookCode, setCustomHookCode] = useState<string>("");

  // Detected Threads & Role Mapping (Combined vs Separate Speaker / Dialogue)
  const [threads, setThreads] = useState<Map<number, TextractorThread>>(new Map());
  const [combinedThreadId, setCombinedThreadId] = useState<number | null>(null);
  const [messageThreadId, setMessageThreadId] = useState<number | null>(null);
  const [speakerThreadId, setSpeakerThreadId] = useState<number | null>(null);

  // Inspected Thread & Per-Thread Logs
  const [inspectedThreadId, setInspectedThreadId] = useState<number | null>(null);
  const [maxLogLines, setMaxLogLines] = useState<number>(() => {
    const saved = localStorage.getItem("vn_textractor_max_log_lines");
    return saved ? Number(saved) : 100;
  });
  const [threadLogs, setThreadLogs] = useState<Map<number, TextractorMessage[]>>(new Map());

  // Duplicate Line Suppression Filter State
  const [ignoreDuplicateLines, setIgnoreDuplicateLines] = useState<boolean>(() => {
    return localStorage.getItem("vn_ignore_duplicate_lines") !== "false";
  });

  useEffect(() => {
    localStorage.setItem("vn_ignore_duplicate_lines", String(ignoreDuplicateLines));
  }, [ignoreDuplicateLines]);

  useEffect(() => {
    localStorage.setItem("vn_textractor_debounce_ms", String(debounceMs));
    localStorage.setItem("vn_textractor_max_log_lines", String(maxLogLines));
    localStorage.setItem("vn_textractor_discovery_duration", String(discoveryDuration));
  }, [debounceMs, maxLogLines, discoveryDuration]);

  // Synchronized Dialogue State for Live Stream Inspector
  const [latestSpeaker, setLatestSpeaker] = useState<string>("");
  const [latestMessage, setLatestMessage] = useState<string>("");
  const [latestRawMessage, setLatestRawMessage] = useState<string>("");
  const [autoForwardToOverlay, setAutoForwardToOverlay] = useState<boolean>(() => {
    const saved = localStorage.getItem("vn_textractor_auto_forward");
    return saved !== null ? saved === "true" : true;
  });

  useEffect(() => {
    localStorage.setItem("vn_textractor_auto_forward", String(autoForwardToOverlay));
  }, [autoForwardToOverlay]);

  // Sync state into persistent Refs to prevent listener re-subscription race conditions
  const combinedThreadIdRef = useRef<number | null>(null);
  const messageThreadIdRef = useRef<number | null>(null);
  const speakerThreadIdRef = useRef<number | null>(null);
  const autoForwardRef = useRef<boolean>(true);
  const ignoreDuplicateLinesRef = useRef<boolean>(true);
  const debounceMsRef = useRef<number>(250);
  const maxLogLinesRef = useRef<number>(100);
  const latestSpeakerRef = useRef<string>("");
  const lastForwardedTextRef = useRef<{ message: string; speaker: string }>({ message: "", speaker: "" });

  combinedThreadIdRef.current = combinedThreadId;
  messageThreadIdRef.current = messageThreadId;
  speakerThreadIdRef.current = speakerThreadId;
  autoForwardRef.current = autoForwardToOverlay;
  ignoreDuplicateLinesRef.current = ignoreDuplicateLines;
  debounceMsRef.current = debounceMs;
  maxLogLinesRef.current = maxLogLines;
  latestSpeakerRef.current = latestSpeaker;

  const dialogueAccumulatorRef = useRef<{
    buffer: string;
    rawBuffer: string;
    lastTimestamp: number;
    timer: any;
  }>({
    buffer: "",
    rawBuffer: "",
    lastTimestamp: 0,
    timer: null,
  });

  // Discovery Timer Ref
  const discoveryTimerRef = useRef<any>(null);

  // Save Path to localStorage
  useEffect(() => {
    localStorage.setItem("vn_textractor_path", exePath);
  }, [exePath]);

  // Load process list on mount
  const loadProcesses = async () => {
    setIsLoadingProcesses(true);
    try {
      const list = await TextractorService.listProcesses();
      setProcesses(list || []);
      if (list && list.length > 0 && selectedPid === null) {
        setSelectedPid(list[0].pid);
      }
    } catch (err) {
      console.warn("Failed to load processes:", err);
    } finally {
      setIsLoadingProcesses(false);
    }
  };

  useEffect(() => {
    loadProcesses();
  }, []);

  // Centralized Inspector Recomputation & State Reset across all role modes
  const recomputeLiveInspector = (
    nextCombined: number | null,
    nextMsg: number | null,
    nextSpeaker: number | null
  ) => {
    // 1. Reset debounce buffer & duplicate suppression cache
    dialogueAccumulatorRef.current = { buffer: "", rawBuffer: "", lastTimestamp: 0, timer: null };
    lastForwardedTextRef.current = { message: "", speaker: "" };

    // 2. If all streams disabled -> wipe inspector completely
    if (nextCombined === null && nextMsg === null && nextSpeaker === null) {
      setLatestSpeaker("");
      setLatestMessage("");
      setLatestRawMessage("");
      return;
    }

    // 3. If Combined Auto-Split is active -> re-extract from combined thread only
    if (nextCombined !== null) {
      const thread = threads.get(nextCombined);
      if (thread && thread.lastText) {
        const clean = executePreprocessingPipeline(thread.lastText, "textractor");
        const { speaker, message } = extractSpeakerAndDialogue(clean);
        setLatestSpeaker(speaker);
        setLatestMessage(message);
        setLatestRawMessage(thread.lastText);
      } else {
        setLatestSpeaker("");
        setLatestMessage("");
        setLatestRawMessage("");
      }
      return;
    }

    // 4. Separate Speaker & Dialogue streams
    // Recompute Speaker
    if (nextSpeaker !== null) {
      const spkThread = threads.get(nextSpeaker);
      if (spkThread && spkThread.lastText) {
        const cleanSpk = executePreprocessingPipeline(spkThread.lastText, "textractor").trim();
        setLatestSpeaker(cleanSpk);
      } else {
        setLatestSpeaker("");
      }
    } else {
      setLatestSpeaker("");
    }

    // Recompute Dialogue
    if (nextMsg !== null) {
      const msgThread = threads.get(nextMsg);
      if (msgThread && msgThread.lastText) {
        const cleanMsg = executePreprocessingPipeline(msgThread.lastText, "textractor");
        setLatestMessage(cleanMsg);
        setLatestRawMessage(msgThread.lastText);
      } else {
        setLatestMessage("");
        setLatestRawMessage("");
      }
    } else {
      setLatestMessage("");
      setLatestRawMessage("");
    }
  };

  // Dedicated Role Click Handlers with Unified Recompute
  const handleToggleCombined = (thread: TextractorThread) => {
    if (combinedThreadIdRef.current === thread.id) {
      setCombinedThreadId(null);
      recomputeLiveInspector(null, messageThreadIdRef.current, speakerThreadIdRef.current);
    } else {
      setCombinedThreadId(thread.id);
      setMessageThreadId(null);
      setSpeakerThreadId(null);
      recomputeLiveInspector(thread.id, null, null);
    }
  };

  const handleToggleDialogue = (thread: TextractorThread) => {
    if (messageThreadIdRef.current === thread.id) {
      setMessageThreadId(null);
      recomputeLiveInspector(null, null, speakerThreadIdRef.current);
    } else {
      setMessageThreadId(thread.id);
      setCombinedThreadId(null);
      const nextSpeaker = speakerThreadIdRef.current === thread.id ? null : speakerThreadIdRef.current;
      if (speakerThreadIdRef.current === thread.id) setSpeakerThreadId(null);
      recomputeLiveInspector(null, thread.id, nextSpeaker);
    }
  };

  const handleToggleSpeaker = (thread: TextractorThread) => {
    if (speakerThreadIdRef.current === thread.id) {
      setSpeakerThreadId(null);
      recomputeLiveInspector(null, messageThreadIdRef.current, null);
    } else {
      setSpeakerThreadId(thread.id);
      setCombinedThreadId(null);
      const nextMsg = messageThreadIdRef.current === thread.id ? null : messageThreadIdRef.current;
      if (messageThreadIdRef.current === thread.id) setMessageThreadId(null);
      recomputeLiveInspector(null, nextMsg, thread.id);
    }
  };

  // Listen to Textractor text events via Tauri Event listener (Registered once on mount)
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    async function setupListener() {
      unlisten = await TextractorService.onTextEvent((msg: TextractorMessage) => {
        const currentCombined = combinedThreadIdRef.current;
        const currentMsgThread = messageThreadIdRef.current;
        const currentSpeakerThread = speakerThreadIdRef.current;
        const currentDebounce = debounceMsRef.current;
        const currentMaxLogs = maxLogLinesRef.current;
        const currentIgnoreDup = ignoreDuplicateLinesRef.current;
        const currentAutoForward = autoForwardRef.current;

        // 1. Update Threads Map with fresh incoming text
        setThreads((prev) => {
          const next = new Map(prev);
          const existing = next.get(msg.handle);
          if (existing) {
            next.set(msg.handle, {
              ...existing,
              totalLines: existing.totalLines + 1,
              lastText: msg.text,
              lastTimestamp: msg.timestamp,
              hookCode: msg.hook_code || existing.hookCode,
            });
          } else {
            // New thread discovered (Keep roles unassigned until explicitly set by user)
            next.set(msg.handle, {
              id: msg.handle,
              name: msg.name || `Thread #${msg.handle}`,
              hookCode: msg.hook_code || "ENGINE_DEFAULT",
              address: msg.address,
              totalLines: 1,
              lastText: msg.text,
              lastTimestamp: msg.timestamp,
              isActive: true,
              role: "ignored",
              isPrimary: false,
            });

            // Set first thread as inspected thread if none selected yet
            setInspectedThreadId((cur) => (cur === null ? msg.handle : cur));
          }
          return next;
        });

        // 2. Append to specific Thread Log (filter consecutive identical lines if enabled)
        setThreadLogs((prev) => {
          const next = new Map(prev);
          const logs = next.get(msg.handle) || [];
          if (currentIgnoreDup && logs.length > 0 && logs[0].text.trim() === msg.text.trim()) {
            return next; // Suppress duplicate from flooding thread log
          }
          const updated = [msg, ...logs].slice(0, currentMaxLogs);
          next.set(msg.handle, updated);
          return next;
        });

        // 3. CASE A: COMBINED STREAM (Auto-Split Speaker + Message from single thread)
        if (currentCombined !== null && msg.handle === currentCombined) {
          const cleanText = executePreprocessingPipeline(msg.text, "textractor");
          if (cleanText.trim().length > 0 && !msg.text.startsWith("Attached to process")) {
            const now = Date.now();
            const acc = dialogueAccumulatorRef.current;
            const timeDiff = now - acc.lastTimestamp;
            const windowLimit = Math.max(currentDebounce, 300);

            // Accumulate and merge fragments if arriving within debounce window
            let mergedClean = cleanText;
            let mergedRaw = msg.text;

            if (acc.buffer && timeDiff < windowLimit) {
              mergedClean = mergeDialogueFragments(acc.buffer, cleanText);
              mergedRaw = mergeDialogueFragments(acc.rawBuffer, msg.text);
            }

            acc.buffer = mergedClean;
            acc.rawBuffer = mergedRaw;
            acc.lastTimestamp = now;

            // Auto-extract speaker and dialogue from merged text
            const { speaker, message } = extractSpeakerAndDialogue(mergedClean);

            setLatestSpeaker(speaker);
            setLatestMessage(message);
            setLatestRawMessage(mergedRaw);

            if (acc.timer) clearTimeout(acc.timer);

            acc.timer = setTimeout(() => {
              const finalClean = executePreprocessingPipeline(acc.buffer, "textractor");
              const extracted = extractSpeakerAndDialogue(finalClean);

              setLatestSpeaker(extracted.speaker);
              setLatestMessage(extracted.message);

              // Suppress duplicate emission
              if (
                currentIgnoreDup &&
                lastForwardedTextRef.current.message === extracted.message &&
                lastForwardedTextRef.current.speaker === extracted.speaker
              ) {
                return;
              }

              lastForwardedTextRef.current = {
                message: extracted.message,
                speaker: extracted.speaker,
              };

              if (currentAutoForward) {
                overlayChannel.send({
                  type: "DIALOGUE_UPDATE",
                  dialogue: {
                    speaker: extracted.speaker || undefined,
                    translatedSpeaker: extracted.speaker || undefined,
                    message: acc.rawBuffer,
                    translatedMessage: extracted.message,
                  },
                });
              }
            }, Math.max(currentDebounce, 150));
          }
        }

        // 4. CASE B: DEDICATED SPEAKER THREAD (Separate stream)
        else if (currentSpeakerThread !== null && msg.handle === currentSpeakerThread) {
          const cleanSpeaker = executePreprocessingPipeline(msg.text, "textractor").trim();
          if (cleanSpeaker) {
            setLatestSpeaker(cleanSpeaker);
          }
        }

        // 5. CASE C: DEDICATED DIALOGUE THREAD (Separate stream)
        else if (currentMsgThread !== null && msg.handle === currentMsgThread) {
          const cleanText = executePreprocessingPipeline(msg.text, "textractor");
          if (cleanText.trim().length > 0 && !msg.text.startsWith("Attached to process")) {
            const now = Date.now();
            const acc = dialogueAccumulatorRef.current;
            const timeDiff = now - acc.lastTimestamp;
            const windowLimit = Math.max(currentDebounce, 300);

            // Accumulate and merge fragments if arriving close together
            let mergedClean = cleanText;
            let mergedRaw = msg.text;

            if (acc.buffer && timeDiff < windowLimit) {
              mergedClean = mergeDialogueFragments(acc.buffer, cleanText);
              mergedRaw = mergeDialogueFragments(acc.rawBuffer, msg.text);
            }

            acc.buffer = mergedClean;
            acc.rawBuffer = mergedRaw;
            acc.lastTimestamp = now;

            // Immediately show current best merged sentence in Live Stream Inspector
            setLatestMessage(mergedClean);
            setLatestRawMessage(mergedRaw);

            // Clear previous trailing flush timer
            if (acc.timer) clearTimeout(acc.timer);

            // Debounced forward to Overlay & Live Translation
            acc.timer = setTimeout(() => {
              const finalClean = executePreprocessingPipeline(acc.buffer, "textractor");
              setLatestMessage(finalClean);

              const currentSpeaker = latestSpeakerRef.current;

              // Check if consecutive duplicate suppression is enabled
              if (
                currentIgnoreDup &&
                lastForwardedTextRef.current.message === finalClean &&
                lastForwardedTextRef.current.speaker === currentSpeaker
              ) {
                return;
              }

              lastForwardedTextRef.current = {
                message: finalClean,
                speaker: currentSpeaker,
              };

              if (currentAutoForward) {
                overlayChannel.send({
                  type: "DIALOGUE_UPDATE",
                  dialogue: {
                    speaker: currentSpeaker || undefined,
                    translatedSpeaker: currentSpeaker || undefined,
                    message: acc.rawBuffer,
                    translatedMessage: finalClean,
                  },
                });
              }
            }, Math.max(currentDebounce, 150));
          }
        }
      });
    }

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Handle Discovery Countdown Timer
  useEffect(() => {
    if (isDiscoveryActive && discoverySecondsLeft > 0) {
      discoveryTimerRef.current = setTimeout(() => {
        setDiscoverySecondsLeft((prev) => prev - 1);
      }, 1000);
    } else if (discoverySecondsLeft === 0 && isDiscoveryActive) {
      setIsDiscoveryActive(false);
    }

    return () => {
      if (discoveryTimerRef.current) clearTimeout(discoveryTimerRef.current);
    };
  }, [isDiscoveryActive, discoverySecondsLeft]);

  // Manual Hook Search Toggle
  const handleToggleHookSearch = () => {
    if (!isHooked) return;
    if (isDiscoveryActive) {
      setIsDiscoveryActive(false);
      setDiscoverySecondsLeft(0);
    } else {
      setIsDiscoveryActive(true);
      setDiscoverySecondsLeft(discoveryDuration > 0 ? discoveryDuration : 9999);
    }
  };

  // Attach / Start Textractor Sidecar
  const handleAttach = async () => {
    if (!selectedPid) return;
    setIsAttaching(true);
    setHookError(null);

    const res = await TextractorService.startSidecar(exePath, selectedPid);
    setIsAttaching(false);

    if (res.success) {
      setIsHooked(true);
      setAttachedPid(selectedPid);
      setThreads(new Map());
      setThreadLogs(new Map());
      setCombinedThreadId(null);
      setMessageThreadId(null);
      setSpeakerThreadId(null);
      setLatestSpeaker("");
      setLatestMessage("");
      setLatestRawMessage("");
      setIsDiscoveryActive(false);
      setDiscoverySecondsLeft(0);
    } else {
      setHookError(res.error || "Failed to attach Textractor to process.");
    }
  };

  // Detach / Stop Textractor Sidecar
  const handleDetach = async () => {
    await TextractorService.stopSidecar();
    setIsHooked(false);
    setAttachedPid(null);
    setCombinedThreadId(null);
    setMessageThreadId(null);
    setSpeakerThreadId(null);
    setIsDiscoveryActive(false);
  };

  // Insert Custom Hook Code
  const handleInsertHookCode = async () => {
    if (!isHooked || !attachedPid) return;
    const code = customHookCode.trim();
    if (!code) return;

    const command = `${code} -P${attachedPid}`;
    await TextractorService.sendCommand(command);
    setCustomHookCode("");
  };

  // Switch architecture and update path preset
  const handleSelectArch = (selectedArch: "x86" | "x64") => {
    setArch(selectedArch);
    if (selectedArch === "x86") {
      setExePath("D:\\Program Files\\Textractor\\x86\\TextractorCLI.exe");
    } else {
      setExePath("D:\\Program Files\\Textractor\\x64\\TextractorCLI.exe");
    }
  };

  // Filter processes by search query
  const filteredProcesses = processes.filter((p) => {
    const q = processSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.window_title.toLowerCase().includes(q) ||
      p.pid.toString().includes(q)
    );
  });

  // Filter threads by specific text search if user typed one
  const threadList = Array.from(threads.values()).filter((t) => {
    if (!specificTextFilter.trim()) return true;
    return t.lastText.toLowerCase().includes(specificTextFilter.toLowerCase().trim());
  });

  // Active inspected thread details & logs
  const currentInspectedThread = inspectedThreadId !== null ? threads.get(inspectedThreadId) : null;
  const currentThreadLogs = inspectedThreadId !== null ? threadLogs.get(inspectedThreadId) || [] : [];

  const isLiveStreamActive = combinedThreadId !== null || messageThreadId !== null || speakerThreadId !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      {/* 1. Header: Path Configuration & Real-Time Sidecar Status */}
      <div className="card" style={{ margin: 0, minWidth: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Cpu size={16} color="var(--accent-primary)" /> Textractor Sidecar Hooker
            </span>
            <span className="card-subtitle">
              Hook in-game dialogues directly from visual novel game processes into VN Translator
            </span>
          </div>

          {/* Status Badge */}
          <span
            className={isHooked ? "badge badge-success" : "badge badge-danger"}
            style={{
              padding: "4px 10px",
              fontWeight: 700,
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {isHooked ? (
              <>
                <CheckCircle2 size={12} /> Hook Attached (PID: {attachedPid})
              </>
            ) : (
              <>
                <XCircle size={12} /> Disconnected (Idle)
              </>
            )}
          </span>
        </div>

        {/* Textractor Executable Path & Arch Config */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "center" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
              TextractorCLI Executable Location
            </label>
            <input
              type="text"
              value={exePath}
              onChange={(e) => setExePath(e.target.value)}
              placeholder="D:\Program Files\Textractor\x86\TextractorCLI.exe"
              style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "12px" }}
            />
          </div>

          {/* Arch Toggle */}
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
              Target Game Architecture
            </label>
            <div style={{ display: "flex", gap: "4px" }}>
              <button
                type="button"
                onClick={() => handleSelectArch("x86")}
                className={arch === "x86" ? "btn-primary" : "btn-secondary"}
                style={{ padding: "5px 12px", fontSize: "12px" }}
                title="Use 32-bit TextractorCLI for 95% of Visual Novels (Kirikiri, Siglus, Majiro, etc.)"
              >
                x86 (32-bit VN)
              </button>
              <button
                type="button"
                onClick={() => handleSelectArch("x64")}
                className={arch === "x64" ? "btn-primary" : "btn-secondary"}
                style={{ padding: "5px 12px", fontSize: "12px" }}
                title="Use 64-bit TextractorCLI for 64-bit Unity and modern visual novels"
              >
                x64 (64-bit)
              </button>
            </div>
          </div>
        </div>

        {hookError && (
          <div
            style={{
              marginTop: "8px",
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
              backgroundColor: "rgba(248, 81, 73, 0.12)",
              border: "1px solid var(--accent-danger)",
              color: "var(--accent-danger)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <XCircle size={14} />
            <span>{hookError}</span>
          </div>
        )}
      </div>

      {/* 2. Target Visual Novel Process Picker & Attacher */}
      <div className="card" style={{ margin: 0, minWidth: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Radio size={16} /> Target Game Process
            </span>
            <span className="card-subtitle">
              Select running Visual Novel window to attach text hooking engine
            </span>
          </div>

          <button
            onClick={loadProcesses}
            disabled={isLoadingProcesses}
            className="btn-secondary"
            style={{ padding: "4px 10px", fontSize: "12px" }}
            title="Refresh running Windows processes"
          >
            <RefreshCw size={12} className={isLoadingProcesses ? "spin" : ""} />
            <span>{isLoadingProcesses ? "Scanning..." : "Refresh Processes"}</span>
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Search Filter & Process Selector */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr auto", gap: "10px", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Search process by title, exe, or PID..."
              value={processSearchQuery}
              onChange={(e) => setProcessSearchQuery(e.target.value)}
              disabled={isHooked}
              style={{ fontSize: "12.5px" }}
            />
            <select
              value={selectedPid || ""}
              onChange={(e) => setSelectedPid(Number(e.target.value))}
              disabled={isHooked}
              style={{ width: "100%", fontSize: "13px" }}
            >
              {filteredProcesses.length === 0 ? (
                <option value="">No running GUI game processes found</option>
              ) : (
                filteredProcesses.map((p) => (
                  <option key={p.pid} value={p.pid}>
                    "{p.window_title}" — {p.name} (PID: {p.pid})
                  </option>
                ))
              )}
            </select>

            {/* Attach / Detach Button */}
            {!isHooked ? (
              <button
                onClick={handleAttach}
                disabled={isAttaching || !selectedPid}
                className="btn-primary"
                style={{ padding: "7px 22px", whiteSpace: "nowrap" }}
              >
                {isAttaching ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
                <span>{isAttaching ? "Attaching..." : "Attach Hook"}</span>
              </button>
            ) : (
              <button
                onClick={handleDetach}
                className="btn-danger"
                style={{ padding: "7px 22px", whiteSpace: "nowrap" }}
              >
                <Square size={14} />
                <span>Detach Hook</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Hook Search Settings & Performance Tuning */}
      <div className="card" style={{ margin: 0, minWidth: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Sliders size={16} /> Hook Search & Performance Tuning
            </span>
            <span className="card-subtitle">
              Start manual hook search to capture active in-game text threads with lightweight CPU limits
            </span>
          </div>

          {/* Manual Hook Search Trigger Button */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={handleToggleHookSearch}
              disabled={!isHooked}
              className={isDiscoveryActive ? "btn-danger" : "btn-primary"}
              style={{ padding: "5px 14px", fontSize: "12px", whiteSpace: "nowrap" }}
              title={!isHooked ? "Attach to a game process first" : isDiscoveryActive ? "Stop active search" : "Start scanning for new in-game text threads"}
            >
              {isDiscoveryActive ? (
                <>
                  <Square size={12} />
                  <span>Stop Search ({discoveryDuration === 0 ? "Active" : `${discoverySecondsLeft}s left`})</span>
                </>
              ) : (
                <>
                  <Search size={12} />
                  <span>Start Hook Search</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.5fr", gap: "16px", alignItems: "center" }}>
          {/* Discovery Duration Setting */}
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Hook Search Duration: <strong>{discoveryDuration === 0 ? "Continuous" : `${discoveryDuration} seconds`}</strong>
            </label>
            <select
              value={discoveryDuration}
              onChange={(e) => setDiscoveryDuration(Number(e.target.value))}
              disabled={isDiscoveryActive}
              style={{ width: "100%" }}
            >
              <option value={5}>5 Seconds (Ultra Lightweight)</option>
              <option value={10}>10 Seconds (Recommended)</option>
              <option value={20}>20 Seconds (Deeper Scan)</option>
              <option value={0}>Continuous (No Time Limit)</option>
            </select>
          </div>

          {/* Text Refresh Delay / Debounce */}
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Typewriter Debounce: <strong>{debounceMs} ms</strong>
            </label>
            <input
              type="range"
              min={50}
              max={600}
              step={50}
              value={debounceMs}
              onChange={(e) => setDebounceMs(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          {/* Search Specific Text Matcher */}
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Search Specific Text on Game Screen
            </label>
            <input
              type="text"
              value={specificTextFilter}
              onChange={(e) => setSpecificTextFilter(e.target.value)}
              placeholder="e.g. 「私の名前は... or first few words"
              style={{ width: "100%", fontSize: "12px" }}
            />
          </div>
        </div>

        {/* Additional Preprocessing & Performance Toggles */}
        <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={ignoreDuplicateLines}
              onChange={(e) => setIgnoreDuplicateLines(e.target.checked)}
            />
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
              Remove Consecutive Duplicate Lines (Anti-Echo / Double Trigger)
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              — Suppresses identical consecutive lines from re-triggering translations or flooding logs
            </span>
          </label>
        </div>
      </div>

      {/* 4. Engine Presets & Custom Hook Code Bar */}
      <div className="card" style={{ margin: 0, minWidth: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Terminal size={16} /> Custom Hook Code Injection
            </span>
            <span className="card-subtitle">
              Insert specialized memory hook codes for specific Visual Novel game engines
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.5fr auto", gap: "10px", alignItems: "center" }}>
          {/* Preset Engine Dropdown */}
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
              Popular Engine Presets
            </label>
            <select
              value={selectedPreset.name}
              onChange={(e) => {
                const found = POPULAR_HOOK_PRESETS.find((p) => p.name === e.target.value);
                if (found) {
                  setSelectedPreset(found);
                  if (found.code) setCustomHookCode(found.code);
                }
              }}
              style={{ width: "100%" }}
            >
              {POPULAR_HOOK_PRESETS.map((preset) => (
                <option key={preset.name} value={preset.name}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>

          {/* Hook Code Input */}
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
              Hook Code String (e.g. /HN-4*0@... or HS-8*0@...)
            </label>
            <input
              type="text"
              value={customHookCode}
              onChange={(e) => setCustomHookCode(e.target.value)}
              placeholder="Enter hook code..."
              style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "12px" }}
            />
          </div>

          {/* Insert Hook Button */}
          <div style={{ paddingTop: "18px" }}>
            <button
              onClick={handleInsertHookCode}
              disabled={!isHooked || !customHookCode.trim()}
              className="btn-secondary"
              style={{ padding: "7px 16px", whiteSpace: "nowrap" }}
            >
              <Zap size={13} color="var(--accent-gold)" />
              <span>Insert Hook</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5. Live Stream Inspector (Full-Width Top Panel) */}
      <div className="card" style={{ margin: 0, minWidth: 0, width: "100%", boxSizing: "border-box" }}>
        <div className="card-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Activity size={16} color="var(--accent-success)" /> Live Stream Inspector
            </span>
            {isLiveStreamActive ? (
              <span className="badge badge-success" style={{ fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}>
                <CheckCircle2 size={11} /> Stream Active (
                {combinedThreadId !== null
                  ? `✨ Combined Auto-Split: #${combinedThreadId}`
                  : `💬 Dialogue: #${messageThreadId ?? "None"}${speakerThreadId !== null ? ` | 👤 Speaker: #${speakerThreadId}` : ""}`}
                )
              </span>
            ) : (
              <span className="badge badge-neutral" style={{ fontSize: "11px" }}>
                Idle (No Thread Assigned)
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={autoForwardToOverlay}
                onChange={(e) => setAutoForwardToOverlay(e.target.checked)}
                disabled={!isLiveStreamActive}
              />
              <span style={{ fontWeight: 600 }}>Auto-Forward to Live Translation & Overlay</span>
            </label>

            <button
              onClick={() => {
                setLatestSpeaker("");
                setLatestMessage("");
                setLatestRawMessage("");
                dialogueAccumulatorRef.current = { buffer: "", rawBuffer: "", lastTimestamp: 0, timer: null };
              }}
              className="btn-secondary"
              style={{ padding: "3px 10px", fontSize: "11px" }}
              title="Clear live stream output"
            >
              <Trash2 size={11} />
              <span>Clear Stream</span>
            </button>
          </div>
        </div>

        {/* Live Stream Output Box */}
        {!isLiveStreamActive ? (
          <div
            style={{
              padding: "16px 20px",
              backgroundColor: "var(--bg-app)",
              border: "1px dashed var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "12.5px",
            }}
          >
            Live stream forwarding is currently idle. Click <strong>"✨ Set Combined"</strong>, <strong>"💬 Set Dialogue"</strong>, or <strong>"👤 Set Speaker"</strong> on any thread below to activate live streaming.
          </div>
        ) : (
          <div
            style={{
              padding: "12px 16px",
              backgroundColor: "var(--bg-app)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {/* Synchronized Combined Preview */}
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" }}>
              {latestSpeaker ? (
                <span style={{ color: "var(--accent-gold)", fontWeight: 700, fontSize: "14px", whiteSpace: "nowrap" }}>
                  【{latestSpeaker}】
                </span>
              ) : null}
              <span style={{ color: "var(--text-primary)", fontSize: "14px", fontWeight: 600, lineHeight: 1.4 }}>
                {latestMessage || (
                  <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "12.5px" }}>
                    (Waiting for in-game dialogue on active thread...)
                  </span>
                )}
              </span>
            </div>

            {/* RAW vs CLEAN Footnote */}
            {latestRawMessage && (
              <div style={{ display: "flex", gap: "16px", fontSize: "11px", borderTop: "1px solid var(--border-subtle)", paddingTop: "6px" }}>
                <div style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  <span>RAW: </span>
                  <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{latestRawMessage}</span>
                </div>
                <div style={{ color: "var(--accent-success)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  <span>CLEAN: </span>
                  <span style={{ fontWeight: 600 }}>{latestMessage}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6. Dual Column Panel: Detected Threads (Left) & Thread Log Inspector (Right) */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 0.95fr)", gap: "16px", minWidth: 0, width: "100%", boxSizing: "border-box" }}>
        {/* Left Column: Discovered Threads Table with Multi-Role Assignment */}
        <div className="card" style={{ margin: 0, minWidth: 0, width: "100%", boxSizing: "border-box", overflow: "hidden" }}>
          <div className="card-header">
            <div>
              <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Layers size={16} /> Detected Text Threads ({threadList.length})
              </span>
              <span className="card-subtitle">Click card to view thread log. Assign roles with buttons.</span>
            </div>
          </div>

          {threadList.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: "12.5px" }}>
              {isHooked
                ? "Waiting for in-game dialogue... Advance a line in your game or click 'Start Hook Search'."
                : "Attach to a game process above to start discovering hook threads."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "360px", overflowY: "auto", minWidth: 0 }}>
              {threadList.map((thread) => {
                const isCombined = combinedThreadId === thread.id;
                const isMsg = messageThreadId === thread.id;
                const isSpeaker = speakerThreadId === thread.id;
                const isInspected = inspectedThreadId === thread.id;

                let cardBorder = isInspected ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)";
                let cardBg = isInspected ? "rgba(78, 115, 223, 0.12)" : "var(--bg-app)";

                if (isCombined) {
                  cardBorder = "1px solid var(--accent-success)";
                  cardBg = isInspected ? "rgba(46, 160, 67, 0.18)" : "rgba(46, 160, 67, 0.08)";
                } else if (isMsg) {
                  cardBorder = "1px solid var(--accent-primary)";
                  cardBg = isInspected ? "rgba(78, 115, 223, 0.18)" : "rgba(78, 115, 223, 0.08)";
                } else if (isSpeaker) {
                  cardBorder = "1px solid var(--accent-gold)";
                  cardBg = isInspected ? "rgba(255, 193, 7, 0.15)" : "rgba(255, 193, 7, 0.06)";
                }

                return (
                  <div
                    key={thread.id}
                    onClick={() => setInspectedThreadId(thread.id)}
                    style={{
                      padding: "10px 12px",
                      backgroundColor: cardBg,
                      border: cardBorder,
                      borderRadius: "var(--radius-sm)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      minWidth: 0,
                      maxWidth: "100%",
                      boxSizing: "border-box",
                      cursor: "pointer",
                      transition: "all 0.1s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                        <span style={{ fontWeight: 600, fontSize: "12.5px", color: isInspected ? "var(--accent-primary)" : "var(--text-primary)", whiteSpace: "nowrap" }}>
                          #{thread.id} {thread.name}
                        </span>

                        {/* Active Role Badges */}
                        {isCombined && (
                          <span className="badge badge-success" style={{ fontSize: "10px", padding: "1px 6px", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "3px" }}>
                            <Sparkles size={9} /> Combined Auto-Split
                          </span>
                        )}
                        {isMsg && (
                          <span className="badge badge-primary" style={{ fontSize: "10px", padding: "1px 6px", whiteSpace: "nowrap" }}>
                            💬 Dialogue
                          </span>
                        )}
                        {isSpeaker && (
                          <span className="badge badge-warning" style={{ fontSize: "10px", padding: "1px 6px", whiteSpace: "nowrap" }}>
                            👤 Speaker Name
                          </span>
                        )}
                      </div>

                      {/* Role Selector Action Buttons */}
                      <div style={{ display: "flex", gap: "4px", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                        {/* 1. Combined (Auto-Split) Button */}
                        <button
                          type="button"
                          onClick={() => handleToggleCombined(thread)}
                          className={isCombined ? "btn-primary" : "btn-secondary"}
                          style={{
                            padding: "2px 8px",
                            fontSize: "11px",
                            whiteSpace: "nowrap",
                            borderColor: isCombined ? "var(--accent-success)" : undefined,
                            backgroundColor: isCombined ? "var(--accent-success)" : undefined,
                            color: isCombined ? "#fff" : undefined,
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                          }}
                          title="Auto-split Character Name (Speaker) & Dialogue Message from single combined thread"
                        >
                          <Sparkles size={11} />
                          <span>Set Combined</span>
                        </button>

                        {/* 2. Dialogue Button */}
                        <button
                          type="button"
                          onClick={() => handleToggleDialogue(thread)}
                          className={isMsg ? "btn-primary" : "btn-secondary"}
                          style={{ padding: "2px 8px", fontSize: "11px", whiteSpace: "nowrap" }}
                          title="Assign as main dialogue text stream"
                        >
                          💬 Set Dialogue
                        </button>

                        {/* 3. Speaker Button */}
                        <button
                          type="button"
                          onClick={() => handleToggleSpeaker(thread)}
                          className={isSpeaker ? "btn-primary" : "btn-secondary"}
                          style={{
                            padding: "2px 8px",
                            fontSize: "11px",
                            whiteSpace: "nowrap",
                            borderColor: isSpeaker ? "var(--accent-gold)" : undefined,
                            backgroundColor: isSpeaker ? "var(--accent-gold)" : undefined,
                            color: isSpeaker ? "#000" : undefined,
                          }}
                          title="Assign as character / speaker name tag stream"
                        >
                          👤 Set Speaker
                        </button>
                      </div>
                    </div>

                    {/* Hook Code & Metrics */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", minWidth: 0 }}>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "10.5px",
                          backgroundColor: "var(--bg-surface)",
                          color: "var(--accent-cyan)",
                          padding: "1px 6px",
                          borderRadius: "2px",
                          border: "1px solid var(--border-subtle)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "75%",
                        }}
                      >
                        {thread.hookCode}
                      </span>
                      <span className="badge badge-neutral" style={{ fontSize: "10px", flexShrink: 0 }}>
                        {thread.totalLines} lines
                      </span>
                    </div>

                    {/* Last Text Snippet */}
                    <div
                      style={{
                        fontSize: "11.5px",
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        minWidth: 0,
                        maxWidth: "100%",
                        backgroundColor: "rgba(0,0,0,0.2)",
                        padding: "3px 6px",
                        borderRadius: "2px",
                        boxSizing: "border-box",
                      }}
                    >
                      {thread.lastText || "(Waiting for text...)"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Dedicated Thread Log Inspector */}
        <div className="card" style={{ margin: 0, minWidth: 0, width: "100%", boxSizing: "border-box", overflow: "hidden" }}>
          <div className="card-header">
            <div>
              <span className="card-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <FileText size={16} /> Thread Log {currentInspectedThread ? `(#${currentInspectedThread.id})` : ""}
              </span>
              <span className="card-subtitle">
                {currentInspectedThread
                  ? `${currentInspectedThread.name} — ${currentInspectedThread.hookCode}`
                  : "Select a thread on the left to view detailed line logs"}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {/* Max Lines Selector */}
              <select
                value={maxLogLines}
                onChange={(e) => setMaxLogLines(Number(e.target.value))}
                style={{ fontSize: "11px", padding: "2px 6px" }}
                title="Max log lines to retain"
              >
                <option value={50}>50 Lines</option>
                <option value={100}>100 Lines (Default)</option>
                <option value={200}>200 Lines</option>
                <option value={500}>500 Lines</option>
              </select>

              <button
                onClick={() => {
                  if (inspectedThreadId !== null) {
                    setThreadLogs((prev) => {
                      const next = new Map(prev);
                      next.set(inspectedThreadId, []);
                      return next;
                    });
                  }
                }}
                disabled={!currentInspectedThread || currentThreadLogs.length === 0}
                className="btn-secondary"
                style={{ padding: "2px 8px", fontSize: "11px" }}
                title="Clear log history for this thread"
              >
                <Trash2 size={11} />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Thread Log Entries List */}
          <div
            style={{
              backgroundColor: "var(--bg-app)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "10px",
              height: "360px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              minWidth: 0,
              boxSizing: "border-box",
            }}
          >
            {currentThreadLogs.length === 0 ? (
              <span style={{ color: "var(--text-muted)", fontSize: "11.5px", margin: "auto" }}>
                {currentInspectedThread
                  ? "No lines recorded for this thread yet."
                  : "Select a thread from the list on the left to view its history."}
              </span>
            ) : (
              currentThreadLogs.map((log, idx) => {
                const clean = executePreprocessingPipeline(log.text);

                return (
                  <div
                    key={`${log.timestamp}_${idx}`}
                    style={{
                      borderBottom: "1px solid var(--border-subtle)",
                      paddingBottom: "6px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)", minWidth: 0 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        [{log.timestamp}] Line #{currentThreadLogs.length - idx}
                      </span>
                      <span style={{ color: "var(--accent-cyan)", flexShrink: 0 }}>{log.hook_code}</span>
                    </div>

                    {/* Raw Text */}
                    <div
                      style={{
                        color: "var(--text-secondary)",
                        fontSize: "11.5px",
                        minWidth: 0,
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                      }}
                    >
                      <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>RAW: </span>
                      {log.text}
                    </div>

                    {/* Clean Preprocessed Text */}
                    <div
                      style={{
                        color: "var(--accent-success)",
                        fontSize: "12px",
                        fontWeight: 600,
                        minWidth: 0,
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                      }}
                    >
                      <span style={{ fontSize: "10px" }}>CLEAN: </span>
                      {clean}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
