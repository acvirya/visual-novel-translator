import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Plus,
  Trash2,
  FolderOpen,
  FileCode,
  CheckCircle2,
  Settings2,
  Layers,
  Square,
  RefreshCw,
} from "lucide-react";
import { ModelSelectorCombobox } from "../common/ModelSelectorCombobox";

interface QueuedFile {
  id: string;
  name: string;
  path: string;
  lineCount: number;
  sizeKb: number;
  status: "ready" | "processing" | "completed";
}

interface BatchLinePreview {
  id: number;
  fileName: string;
  speaker?: string;
  translatedSpeaker?: string;
  original: string;
  translated: string;
  status: "completed" | "processing" | "pending";
}

const SAMPLE_FILES_POOL: Omit<QueuedFile, "id" | "status">[] = [
  { name: "scene_01_prologue.jsonl", path: "C:/Games/Clannad/dump/scene_01_prologue.jsonl", lineCount: 120, sizeKb: 28 },
  { name: "scene_02_tomoyo_route.jsonl", path: "C:/Games/Clannad/dump/scene_02_tomoyo_route.jsonl", lineCount: 280, sizeKb: 64 },
  { name: "scene_03_afterschool.jsonl", path: "C:/Games/Clannad/dump/scene_03_afterschool.jsonl", lineCount: 190, sizeKb: 42 },
  { name: "scene_04_festival.jsonl", path: "C:/Games/Clannad/dump/scene_04_festival.jsonl", lineCount: 340, sizeKb: 78 },
];

const INITIAL_PREVIEW_LINES: BatchLinePreview[] = [
  {
    id: 1,
    fileName: "scene_01_prologue.jsonl",
    speaker: "坂上 智代",
    translatedSpeaker: "Tomoyo Sakagami",
    original: "「…別に、何でもないわ。早く教室に行きましょう。」",
    translated: "\"...It's nothing really. Let's hurry to the classroom.\"",
    status: "pending",
  },
  {
    id: 2,
    fileName: "scene_01_prologue.jsonl",
    speaker: "岡崎 朋也",
    translatedSpeaker: "Tomoya Okazaki",
    original: "「ああ、そうだな。遅刻するとまた藤林に怒られる。」",
    translated: "\"Yeah, you're right. If we're late, Fujibayashi will scold us again.\"",
    status: "pending",
  },
  {
    id: 3,
    fileName: "scene_02_tomoyo_route.jsonl",
    speaker: "春原 陽平",
    translatedSpeaker: "Youhei Sunohara",
    original: "「おい朋也ーっ！今日の放課後、例の作戦決行するぞ！」",
    translated: "\"Hey Tomoya! After school today, we're executing that plan!\"",
    status: "pending",
  },
  {
    id: 4,
    fileName: "scene_02_tomoyo_route.jsonl",
    speaker: "",
    translatedSpeaker: "",
    original: "廊下を走る春原の足音が、静まり返った校舎に響き渡る。",
    translated: "Sunohara's footsteps running down the corridor echoed throughout the quiet school building.",
    status: "pending",
  },
  {
    id: 5,
    fileName: "scene_03_afterschool.jsonl",
    speaker: "古河 渚",
    translatedSpeaker: "Nagisa Furukawa",
    original: "「あんぱんが好きです…あなたは好きですか？」",
    translated: "\"I love anpan... Do you like it?\"",
    status: "pending",
  },
];

export const BatchTranslateView: React.FC = () => {
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [previewLines, setPreviewLines] = useState<BatchLinePreview[]>(INITIAL_PREVIEW_LINES);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [completedLines, setCompletedLines] = useState<number>(0);

  // Output Configuration
  const [outputPath, setOutputPath] = useState<string>("C:/Games/Clannad/translations/");
  const [outputStrategy, setOutputStrategy] = useState<"individual" | "merged">("individual");
  const [mergedFileName, setMergedFileName] = useState<string>("all_scenes_translated.jsonl");
  const [fileSuffix, setFileSuffix] = useState<string>("_translated");

  // Variable / Column Key Mapping
  const [sourceNameKey, setSourceNameKey] = useState<string>("speaker");
  const [targetNameKey, setTargetNameKey] = useState<string>("translated_speaker");
  const [sourceMessageKey, setSourceMessageKey] = useState<string>("message");
  const [targetMessageKey, setTargetMessageKey] = useState<string>("translated_message");

  // Engine Settings
  const [selectedEngine, setSelectedEngine] = useState<string>(() => {
    return localStorage.getItem("vn_selected_model") || "anthropic/claude-3.5-sonnet";
  });
  const [concurrency, setConcurrency] = useState<number>(3);
  const [delayMs, setDelayMs] = useState<number>(300);

  const totalLines = queuedFiles.reduce((acc, f) => acc + f.lineCount, 0);
  const progressPercent = totalLines > 0 ? Math.min(100, Math.round((completedLines / totalLines) * 100)) : 0;

  // Pipeline simulation timer ref
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dummy Translation Pipeline: 3 seconds per file
  useEffect(() => {
    if (!isRunning) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // Find the next file that is currently 'processing' or first 'ready'
    const processingFileIndex = queuedFiles.findIndex((f) => f.status === "processing");
    const nextReadyIndex = queuedFiles.findIndex((f) => f.status === "ready");

    let targetIndex = processingFileIndex;
    if (targetIndex === -1 && nextReadyIndex !== -1) {
      targetIndex = nextReadyIndex;
      // Mark as processing
      setQueuedFiles((prev) =>
        prev.map((f, idx) => (idx === targetIndex ? { ...f, status: "processing" } : f))
      );
    }

    if (targetIndex === -1 && nextReadyIndex === -1) {
      // All files completed
      setIsRunning(false);
      return;
    }

    const currentFile = queuedFiles[targetIndex];

    // Update lines belonging to this file in preview table to 'processing'
    setPreviewLines((prev) =>
      prev.map((l) => (l.fileName === currentFile?.name && l.status === "pending" ? { ...l, status: "processing" } : l))
    );

    // 3-second delay simulation for translating this file
    timerRef.current = setTimeout(() => {
      // Mark this file as completed and increment lines
      setQueuedFiles((prev) =>
        prev.map((f, idx) => (idx === targetIndex ? { ...f, status: "completed" } : f))
      );

      if (currentFile) {
        setCompletedLines((prev) => prev + currentFile.lineCount);
        // Mark lines belonging to this file as completed
        setPreviewLines((prev) =>
          prev.map((l) => (l.fileName === currentFile.name ? { ...l, status: "completed" } : l))
        );
      }
    }, 3000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isRunning, queuedFiles]);

  const handleAddFiles = () => {
    // Add dummy files from the sample pool
    const nextSampleIndex = queuedFiles.length % SAMPLE_FILES_POOL.length;
    const sample = SAMPLE_FILES_POOL[nextSampleIndex];

    const newFile: QueuedFile = {
      id: `f_${Date.now()}_${queuedFiles.length}`,
      name: sample.name,
      path: sample.path,
      lineCount: sample.lineCount,
      sizeKb: sample.sizeKb,
      status: "ready",
    };

    setQueuedFiles([...queuedFiles, newFile]);
  };

  const handleRemoveFile = (id: string) => {
    const fileToRemove = queuedFiles.find((f) => f.id === id);
    if (fileToRemove?.status === "completed") {
      setCompletedLines((prev) => Math.max(0, prev - fileToRemove.lineCount));
    }
    setQueuedFiles(queuedFiles.filter((f) => f.id !== id));
  };

  const handleStopFileTranslation = (id: string) => {
    // Abort active processing for this file and reset back to 'ready'
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsRunning(false);

    const file = queuedFiles.find((f) => f.id === id);
    setQueuedFiles(
      queuedFiles.map((f) => (f.id === id ? { ...f, status: "ready" } : f))
    );

    if (file) {
      setPreviewLines((prev) =>
        prev.map((l) => (l.fileName === file.name && l.status === "processing" ? { ...l, status: "pending" } : l))
      );
    }
  };

  const handleToggleRun = () => {
    if (isRunning) {
      // Cancel Batch: Abort and reset the currently processing file back to 'ready'
      if (timerRef.current) clearTimeout(timerRef.current);
      setIsRunning(false);

      const processingFile = queuedFiles.find((f) => f.status === "processing");
      setQueuedFiles((prev) =>
        prev.map((f) => (f.status === "processing" ? { ...f, status: "ready" } : f))
      );

      if (processingFile) {
        setPreviewLines((prev) =>
          prev.map((l) => (l.fileName === processingFile.name && l.status === "processing" ? { ...l, status: "pending" } : l))
        );
      }
    } else {
      const hasReadyFiles = queuedFiles.some((f) => f.status === "ready");
      if (!hasReadyFiles) return;
      setIsRunning(true);
    }
  };

  const handleClearQueue = () => {
    if (isRunning) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setQueuedFiles([]);
    setCompletedLines(0);
    setPreviewLines(INITIAL_PREVIEW_LINES);
  };

  const handleBrowseOutputDir = () => {
    // TODO: Open native Tauri directory picker
    setOutputPath("C:/Games/Clannad/translations_out/");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* Top Card: Multi-File Queue Management */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">
              <Layers size={16} /> Input Files Queue ({queuedFiles.length} files selected)
            </span>
            <span className="card-subtitle">
              Total lines queued: <strong style={{ color: "var(--text-primary)" }}>{totalLines.toLocaleString()} lines</strong>
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={handleAddFiles} className="btn-primary">
              <Plus size={14} />
              <span>Add Files</span>
            </button>
            <button
              onClick={handleClearQueue}
              disabled={isRunning || queuedFiles.length === 0}
              className="btn-secondary"
              title="Clear queue"
              style={{ opacity: isRunning || queuedFiles.length === 0 ? 0.5 : 1 }}
            >
              <Trash2 size={14} />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Queued Files Table / Chips */}
        {queuedFiles.length === 0 ? (
          <div
            style={{
              padding: "28px 16px",
              textAlign: "center",
              backgroundColor: "var(--bg-app)",
              border: "1px dashed var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-muted)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <FileCode size={24} style={{ opacity: 0.4 }} />
            <span>No files in the queue. Click <strong>"Add Files"</strong> to add dummy script files to test the batch pipeline.</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {queuedFiles.map((file) => (
              <div
                key={file.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: file.status === "processing" ? "var(--bg-surface-elevated)" : "var(--bg-app)",
                  border: file.status === "processing" ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "8px 12px",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", overflow: "hidden" }}>
                  <FileCode
                    size={16}
                    style={{
                      color: file.status === "processing" ? "var(--accent-gold)" : "var(--accent-cyan)",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "13px" }}>
                    {file.name}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                    ({file.lineCount} lines • {file.sizeKb} KB)
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {file.path}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                  {file.status === "completed" && (
                    <span className="badge badge-success">
                      <CheckCircle2 size={11} /> Completed
                    </span>
                  )}
                  {file.status === "processing" && (
                    <span className="badge badge-warning">
                      <RefreshCw size={11} className="spin" /> Translating
                    </span>
                  )}
                  {file.status === "ready" && <span className="badge badge-neutral">Ready</span>}

                  {/* Icon Action: STOP button if processing, TRASH button if ready/completed */}
                  {file.status === "processing" ? (
                    <button
                      onClick={() => handleStopFileTranslation(file.id)}
                      className="btn-danger"
                      style={{ padding: "4px 8px", fontSize: "11.5px" }}
                      title="Stop & cancel translation for this file"
                    >
                      <Square size={12} fill="currentColor" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRemoveFile(file.id)}
                      disabled={isRunning}
                      className="btn-danger"
                      style={{ padding: "4px 6px", opacity: isRunning ? 0.4 : 1 }}
                      title="Remove from queue"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grid: Output Configuration & Column/Variable Key Mapping */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        {/* Output Path & Target Filename Strategy */}
        <div className="card" style={{ margin: 0 }}>
          <div className="card-header">
            <span className="card-title">
              <FolderOpen size={16} /> Target Output Configuration
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Output Directory Picker */}
            <div>
              <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                Target Output Directory
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  value={outputPath}
                  onChange={(e) => setOutputPath(e.target.value)}
                  style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: "12px" }}
                />
                <button onClick={handleBrowseOutputDir} className="btn-secondary">
                  <FolderOpen size={13} />
                  <span>Browse...</span>
                </button>
              </div>
            </div>

            {/* Output Strategy Selection */}
            <div>
              <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                Output File Strategy
              </label>
              <div style={{ display: "flex", gap: "12px", marginBottom: "8px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "12.5px" }}>
                  <input
                    type="radio"
                    name="strategy"
                    checked={outputStrategy === "individual"}
                    onChange={() => setOutputStrategy("individual")}
                  />
                  <span>1:1 Output (One file per input file)</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "12.5px" }}>
                  <input
                    type="radio"
                    name="strategy"
                    checked={outputStrategy === "merged"}
                    onChange={() => setOutputStrategy("merged")}
                  />
                  <span>Merged (Single consolidated file)</span>
                </label>
              </div>

              {outputStrategy === "individual" ? (
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                    Filename Suffix Template: e.g. <span style={{ color: "var(--accent-cyan)" }}>[filename]{fileSuffix}.jsonl</span>
                  </label>
                  <input
                    type="text"
                    value={fileSuffix}
                    onChange={(e) => setFileSuffix(e.target.value)}
                    style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "12px" }}
                  />
                </div>
              ) : (
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                    Consolidated Output Filename
                  </label>
                  <input
                    type="text"
                    value={mergedFileName}
                    onChange={(e) => setMergedFileName(e.target.value)}
                    style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "12px" }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* JSON / Column Variable Key Mapping */}
        <div className="card" style={{ margin: 0 }}>
          <div className="card-header">
            <div>
              <span className="card-title">
                <Settings2 size={16} /> Variable / Column Key Mapping
              </span>
              <span className="card-subtitle">
                Explicitly map source and translated keys for speaker and message
              </span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Speaker Keys Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                  Source Speaker Key
                </label>
                <input
                  type="text"
                  value={sourceNameKey}
                  onChange={(e) => setSourceNameKey(e.target.value)}
                  placeholder="e.g. speaker, name"
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "12px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                  Target Translated Speaker Key
                </label>
                <input
                  type="text"
                  value={targetNameKey}
                  onChange={(e) => setTargetNameKey(e.target.value)}
                  placeholder="e.g. translated_speaker"
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "12px" }}
                />
              </div>
            </div>

            {/* Message Keys Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                  Source Message Key
                </label>
                <input
                  type="text"
                  value={sourceMessageKey}
                  onChange={(e) => setSourceMessageKey(e.target.value)}
                  placeholder="e.g. message, text, original"
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "12px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                  Target Translated Message Key
                </label>
                <input
                  type="text"
                  value={targetMessageKey}
                  onChange={(e) => setTargetMessageKey(e.target.value)}
                  placeholder="e.g. translated_message"
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "12px" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Engine & Concurrency Parameters Card */}
      <div className="card" style={{ margin: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr auto", gap: "16px", alignItems: "center" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Translation Engine Model
            </label>
            <ModelSelectorCombobox
              selectedModelId={selectedEngine}
              onSelectModel={(id) => {
                setSelectedEngine(id);
                localStorage.setItem("vn_selected_model", id);
              }}
              compact={true}
              disabled={isRunning}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Concurrency (Parallel Requests): {concurrency}
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
              Rate Limit Delay: {delayMs}ms
            </label>
            <input
              type="number"
              step={50}
              min={0}
              value={delayMs}
              onChange={(e) => setDelayMs(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ alignSelf: "flex-end" }}>
            {(() => {
              const hasReadyFiles = queuedFiles.some((f) => f.status === "ready");
              return (
                <button
                  onClick={handleToggleRun}
                  disabled={!isRunning && !hasReadyFiles}
                  className={isRunning ? "btn-danger" : "btn-primary"}
                  style={{
                    padding: "8px 20px",
                    fontWeight: 600,
                    opacity: !isRunning && !hasReadyFiles ? 0.5 : 1,
                    cursor: !isRunning && !hasReadyFiles ? "not-allowed" : "pointer",
                  }}
                >
                  {isRunning ? <Square size={14} fill="currentColor" /> : <Play size={15} />}
                  <span>
                    {isRunning
                      ? "Cancel Batch"
                      : queuedFiles.length > 0 && !hasReadyFiles
                        ? "All Files Completed"
                        : "Start Batch Translation"}
                  </span>
                </button>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Progress Bar Card */}
      <div className="card" style={{ margin: 0, padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "12px" }}>
          <span style={{ fontWeight: 600 }}>
            Overall Progress: {completedLines.toLocaleString()} / {totalLines.toLocaleString()} Lines Processed
          </span>
          <span style={{ color: "var(--accent-primary)", fontWeight: 700 }}>{progressPercent}%</span>
        </div>
        <div
          style={{
            height: "8px",
            backgroundColor: "var(--bg-app)",
            borderRadius: "var(--radius-full)",
            overflow: "hidden",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progressPercent}%`,
              backgroundColor: "var(--accent-primary)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      {/* Live Sample Queue Table */}
      <div className="card" style={{ margin: 0, padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "10px 16px",
            backgroundColor: "var(--bg-surface-elevated)",
            borderBottom: "1px solid var(--border-subtle)",
            fontSize: "12.5px",
            fontWeight: 600,
            color: "var(--text-secondary)",
          }}
        >
          Live Batch Processing Preview
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border-subtle)" }}>
              <th style={{ padding: "10px 14px", width: "130px", color: "var(--text-muted)" }}>Speaker</th>
              <th style={{ padding: "10px 14px", width: "140px", color: "var(--text-muted)" }}>Translated Speaker</th>
              <th style={{ padding: "10px 14px", width: "36%", color: "var(--text-muted)" }}>Message</th>
              <th style={{ padding: "10px 14px", width: "36%", color: "var(--text-muted)" }}>Translated Message</th>
              <th style={{ padding: "10px 14px", width: "95px", color: "var(--text-muted)" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {previewLines.map((row) => (
              <tr key={row.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td style={{ padding: "10px 14px" }}>
                  {row.speaker ? (
                    <span
                      style={{
                        backgroundColor: "rgba(227, 179, 65, 0.15)",
                        color: "var(--accent-gold)",
                        padding: "2px 7px",
                        borderRadius: "var(--radius-sm)",
                        fontWeight: 600,
                        fontSize: "12px",
                        fontFamily: "var(--font-jp)",
                        display: "inline-block",
                      }}
                    >
                      {row.speaker}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>-</span>
                  )}
                </td>
                <td style={{ padding: "10px 14px" }}>
                  {row.translatedSpeaker ? (
                    <span style={{ fontSize: "12.5px", color: "var(--text-primary)", fontWeight: 500 }}>
                      {row.translatedSpeaker}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>-</span>
                  )}
                </td>
                <td style={{ padding: "10px 14px", fontFamily: "var(--font-jp)", color: "var(--text-jp)" }}>
                  {row.original}
                </td>
                <td style={{ padding: "10px 14px", color: row.status === "completed" || row.status === "processing" ? "var(--text-primary)" : "var(--text-muted)" }}>
                  {row.status === "completed" ? row.translated : row.status === "processing" ? "Translating live..." : "Pending in batch queue..."}
                </td>
                <td style={{ padding: "10px 14px" }}>
                  {row.status === "completed" && (
                    <span className="badge badge-success">
                      <CheckCircle2 size={11} /> Done
                    </span>
                  )}
                  {row.status === "processing" && (
                    <span className="badge badge-warning">Translating</span>
                  )}
                  {row.status === "pending" && (
                    <span className="badge badge-neutral">Queued</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
