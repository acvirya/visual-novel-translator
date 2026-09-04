import { invoke, Channel } from "@tauri-apps/api/core";
import {
  TextractorProcessInfo,
  MonitorInfo,
  OcrScanResult,
  OcrStabilityConfig,
  CaptureRegion,
  OcrEngineStatus,
  OpenRouterCompletionResponse,
  StreamEvent,
} from "../types";

/**
 * Type-Safe Bridge for all Backend Tauri Commands
 */
export const TauriBridge = {
  // Monitor & Overlay Controls
  getMonitors: (): Promise<MonitorInfo[]> =>
    invoke<MonitorInfo[]>("get_monitors"),

  getWindowMonitor: (label: string): Promise<MonitorInfo> =>
    invoke<MonitorInfo>("get_window_monitor", { label }),

  showOverlay: (options?: {
    monitorName?: string | null;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    isClickThrough?: boolean;
  }): Promise<void> =>
    invoke("show_overlay", options || {}),

  updateOverlayBounds: (options: {
    x: number;
    y: number;
    width: number;
    height: number;
    monitorName?: string | null;
  }): Promise<void> =>
    invoke("update_overlay_bounds", options),

  hideOverlay: (): Promise<void> =>
    invoke("hide_overlay"),

  setOverlayClickThrough: (enable: boolean): Promise<void> =>
    invoke("set_overlay_click_through", { enable }),

  setOverlayEditMode: (options: {
    isEditing: boolean;
    monitorName?: string | null;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    isClickThrough?: boolean;
  }): Promise<void> =>
    invoke("set_overlay_edit_mode", options),

  openRegionSelectorOverlay: (monitorName?: string | null): Promise<void> =>
    invoke("open_region_selector_overlay", { monitorName }),

  closeRegionSelectorOverlay: (): Promise<void> =>
    invoke("close_region_selector_overlay"),

  // Textractor Sidecar
  listTargetProcesses: (): Promise<TextractorProcessInfo[]> =>
    invoke<TextractorProcessInfo[]>("list_target_processes"),

  findTextractorInstallation: (): Promise<string | null> =>
    invoke<string | null>("find_textractor_installation"),

  startTextractor: (exePath: string, targetPid: number): Promise<void> =>
    invoke("start_textractor", { exePath, targetPid }),

  sendTextractorCommand: (command: string): Promise<void> =>
    invoke("send_textractor_command", { command }),

  stopTextractor: (): Promise<void> =>
    invoke("stop_textractor"),

  // OCR Subsystem
  detectOneOcrPath: (customPath?: string | null): Promise<OcrEngineStatus> =>
    invoke<OcrEngineStatus>("detect_oneocr_path", { customPath }),

  captureRegionsPreview: (regions: CaptureRegion[]): Promise<{ [regionId: string]: string }> =>
    invoke<{ [regionId: string]: string }>("capture_regions_preview", { regions }),

  runOneOcrScan: (
    regions: CaptureRegion[],
    scalePercent: number,
    customPath?: string | null,
    stabilityConfig?: OcrStabilityConfig | null
  ): Promise<OcrScanResult> =>
    invoke<OcrScanResult>("run_oneocr_scan", {
      regions,
      scalePercent,
      customPath,
      stabilityConfig,
    }),

  // Translation & Networking
  translateFreeMt: (
    text: string,
    sourceLang: string,
    targetLang: string,
    provider: string,
    apiKey?: string | null
  ): Promise<string> =>
    invoke<string>("translate_free_mt", {
      text,
      sourceLang,
      targetLang,
      provider,
      apiKey,
    }),

  openrouterChatCompletion: (params: {
    apiKey: string;
    modelId: string;
    messagesJson: string;
    temperature: number;
    maxTokens?: number;
    timeoutSeconds?: number;
    providers?: string[];
    reasoning?: any;
  }): Promise<OpenRouterCompletionResponse> =>
    invoke<OpenRouterCompletionResponse>("openrouter_chat_completion", {
      apiKey: params.apiKey,
      modelId: params.modelId,
      messagesJson: params.messagesJson,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      timeoutSeconds: params.timeoutSeconds,
      providers: params.providers,
      reasoning: params.reasoning,
    }),

  openrouterStreamChatCompletion: (params: {
    apiKey: string;
    modelId: string;
    messagesJson: string;
    temperature: number;
    maxTokens?: number;
    timeoutSeconds?: number;
    providers?: string[];
    reasoning?: any;
    streamId?: string;
    onEvent: Channel<StreamEvent>;
  }): Promise<OpenRouterCompletionResponse> =>
    invoke<OpenRouterCompletionResponse>("openrouter_stream_chat_completion", {
      apiKey: params.apiKey,
      modelId: params.modelId,
      messagesJson: params.messagesJson,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      timeoutSeconds: params.timeoutSeconds,
      providers: params.providers,
      reasoning: params.reasoning,
      streamId: params.streamId,
      onEvent: params.onEvent,
    }),

  llmChatCompletion: (params: {
    url: string;
    headers: Record<string, string>;
    payload_json: string;
    timeoutSeconds?: number;
  }): Promise<OpenRouterCompletionResponse> =>
    invoke<OpenRouterCompletionResponse>("llm_chat_completion", params),

  llmStreamChatCompletion: (params: {
    url: string;
    headers: Record<string, string>;
    payload_json: string;
    timeoutSeconds?: number;
    streamId?: string;
    onEvent: Channel<StreamEvent>;
  }): Promise<OpenRouterCompletionResponse> =>
    invoke<OpenRouterCompletionResponse>("llm_stream_chat_completion", params),

  testLlmConnection: (url: string, headers: Record<string, string>): Promise<string> =>
    invoke<string>("test_llm_connection", { url, headers }),

  cancelAllLlmStreams: (): Promise<void> =>
    invoke("cancel_all_llm_streams"),

  cancelLlmStream: (streamId: string): Promise<void> =>
    invoke("cancel_llm_stream", { streamId }),

  // File Dialogs & Disk I/O
  showOpenScriptDialog: (): Promise<[string, string] | null> =>
    invoke<[string, string] | null>("show_open_script_dialog"),

  showSaveScriptDialog: (defaultName?: string | null): Promise<string | null> =>
    invoke<string | null>("show_save_script_dialog", { defaultName }),

  showPickFilesDialog: (): Promise<Array<[string, string, number]>> =>
    invoke<Array<[string, string, number]>>("show_pick_files_dialog"),

  showPickDirectoryDialog: (): Promise<string | null> =>
    invoke<string | null>("show_pick_directory_dialog"),

  saveScriptFile: (path: string, content: string): Promise<void> =>
    invoke("save_script_file", { path, content }),

  readScriptFileByPath: (path: string): Promise<string | null> =>
    invoke<string | null>("read_script_file_by_path", { path }),

  appendDebugLog: (fileName: string, content: string): Promise<void> =>
    invoke("append_debug_log", { fileName, content }),

  openFileInDefaultApp: (path: string): Promise<void> =>
    invoke("open_file_in_default_app", { path }),
};
