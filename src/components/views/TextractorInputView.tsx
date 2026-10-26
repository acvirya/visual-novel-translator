import { useConfirmation } from "../common/ConfirmationProvider";
import React, { useState, useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  TextractorService,
  detectTextractorPath,
} from "../../services/textractorService";
import { useTextractorStore } from "../../stores/useTextractorStore";
import { ProcessAttachCard } from "./textractor/ProcessAttachCard";
import { CapturedThreadsCard } from "./textractor/CapturedThreadsCard";
import { ThreadInspectorCard } from "./textractor/ThreadInspectorCard";
import { TextractorAdvancedSettingsCard } from "./textractor/TextractorAdvancedSettingsCard";

interface TextractorInputViewProps {
  onOpenPreprocessingSettings?: () => void;
}

export const TextractorInputView: React.FC<TextractorInputViewProps> = ({
  onOpenPreprocessingSettings,
}) => {
  const confirm = useConfirmation();
  const {
    exePath,
    arch,
    processes,
    isLoadingProcesses,
    selectedPid,
    isHooked,
    isAttaching,
    attachedPid,
    hookError,
    threads,
    capturedThreads,
    inspectedThreadId,
    threadLogs,
    latestSpeaker,
    latestMessage,
    latestRawMessage,
    setExePath,
    setArch,
    setSelectedPid,
    reorderCapturedThreads,
    setInspectedThreadId,
    setLatestSpeaker,
    setLatestMessage,
    setLatestRawMessage,
  } = useTextractorStore();

  const [isSearchingExe, setIsSearchingExe] = useState<boolean>(false);

  // Initialize Textractor listener and process list on mount
  useEffect(() => {
    if (!isTauri()) return;
    void TextractorService.initListener().catch((error: unknown) => console.warn("Could not initialize Textractor listener:", error));
    void TextractorService.listProcesses();
  }, []);

  // Auto-select first thread if none inspected
  useEffect(() => {
    if (inspectedThreadId === null && threads.size > 0) {
      const firstId = Array.from(threads.keys())[0];
      setInspectedThreadId(firstId);
    }
  }, [threads, inspectedThreadId, setInspectedThreadId]);

  const handleAttach = async () => {
    if (!selectedPid) return;
    await TextractorService.startSidecar(exePath, selectedPid);
  };

  const handleDetach = async () => {
    await TextractorService.stopSidecar();
  };

  const handleSelectArch = (newArch: "x86" | "x64") => {
    setArch(newArch);
    if (newArch === "x86" && exePath.includes("\\x64\\")) {
      setExePath(exePath.replace("\\x64\\", "\\x86\\"));
    } else if (newArch === "x64" && exePath.includes("\\x86\\")) {
      setExePath(exePath.replace("\\x86\\", "\\x64\\"));
    }
  };

  const handleDetectExePath = async () => {
    setIsSearchingExe(true);
    try {
      const detected = await detectTextractorPath();
      if (detected) {
        setExePath(detected);
      }
    } finally {
      setIsSearchingExe(false);
    }
  };

  const handleToggleCaptureThread = (threadId: number) => {
    const isCaptured = capturedThreads.some((c) => c.threadId === threadId);
    if (isCaptured) {
      TextractorService.setThreadRole(threadId, "ignored");
    } else {
      TextractorService.setThreadRole(threadId, "dialogue");
    }
  };

  // Convert threads Map to array
  const allThreadsList = Array.from(threads.values()).sort((a, b) => b.totalLines - a.totalLines);
  const selectedProcess = processes.find((p) => p.pid === (attachedPid || selectedPid));
  const inspectedThread = inspectedThreadId !== null ? threads.get(inspectedThreadId) : undefined;
  const isLiveStreamActive = capturedThreads.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", width: "100%" }}>
      {/* 1. Target Game Process & Attach Bar */}
      <ProcessAttachCard
        exePath={exePath}
        onExePathChange={setExePath}
        onDetectExePath={handleDetectExePath}
        isSearchingExe={isSearchingExe}
        arch={arch}
        onSelectArch={handleSelectArch}
        isHooked={isHooked}
        isAttaching={isAttaching}
        attachedPid={attachedPid}
        selectedPid={selectedPid}
        selectedProcess={selectedProcess}
        processes={processes}
        isLoadingProcesses={isLoadingProcesses}
        onRefreshProcesses={() => TextractorService.listProcesses()}
        onSelectPid={setSelectedPid}
        onAttach={handleAttach}
        onDetach={handleDetach}
        hookError={hookError}
      />

      {/* 2. Live Stream Inspector & Active Captured Threads */}
      <CapturedThreadsCard
        capturedThreads={capturedThreads}
        threads={threads}
        latestSpeaker={latestSpeaker}
        latestMessage={latestMessage}
        latestRawMessage={latestRawMessage}
        isLiveStreamActive={isLiveStreamActive}
        onClearLiveBuffer={() => {
          setLatestSpeaker("");
          setLatestMessage("");
          setLatestRawMessage("");
        }}
        onOpenPreprocessingSettings={onOpenPreprocessingSettings}
        onReorderThreads={reorderCapturedThreads}
        onChangeRole={(threadId, role) => TextractorService.setThreadRole(threadId, role)}
      />

      {/* 3. Detected Threads & Real-Time Log */}
      <ThreadInspectorCard
        allThreadsList={allThreadsList}
        inspectedThreadId={inspectedThreadId}
        inspectedThread={inspectedThread}
        capturedThreads={capturedThreads}
        threadLogs={threadLogs}
        onSelectInspectedThread={setInspectedThreadId}
        onToggleCaptureThread={handleToggleCaptureThread}
        onClearThreadLogs={(threadId) => confirm({ title: "Clear hook thread logs?", message: "Remove the captured dialogue history for this thread?", confirmText: "Clear logs" }, () => TextractorService.clearLogs(threadId))}
      />

      {/* 4. Advanced Hook Settings (Collapsible Accordion) */}
      <TextractorAdvancedSettingsCard />
    </div>
  );
};
