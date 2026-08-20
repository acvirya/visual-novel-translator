import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { TextractorProcessInfo, TextractorMessage } from "../types";

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

export class TextractorService {
  /**
   * Enumerate running GUI processes with valid window titles
   */
  public static async listProcesses(): Promise<TextractorProcessInfo[]> {
    try {
      return await invoke<TextractorProcessInfo[]>("list_target_processes");
    } catch (error) {
      console.warn("Failed to list target processes:", error);
      return [];
    }
  }

  /**
   * Start Textractor CLI sidecar and attach to target PID
   */
  public static async startSidecar(exePath: string, targetPid: number): Promise<{ success: boolean; error?: string }> {
    try {
      await invoke("start_textractor", { exePath, targetPid });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.toString() || "Unknown error starting Textractor" };
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
      return { success: true };
    } catch (error) {
      console.warn("Failed to stop Textractor:", error);
      return { success: false };
    }
  }

  /**
   * Subscribe to real-time textractor text events
   */
  public static async onTextEvent(callback: (msg: TextractorMessage) => void): Promise<UnlistenFn> {
    return await listen<TextractorMessage>("textractor-text-event", (event) => {
      callback(event.payload);
    });
  }
}
