/**
 * Central Logger Service
 * Captures real-time system, network, and translation logs across the desktop app.
 */

import { TauriBridge } from "./tauriBridge";

export interface AppLogEntry {
  id: string;
  time: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  source: string;
  message: string;
  details?: any;
}

class LoggerService {
  private logs: AppLogEntry[] = [];
  private listeners: Set<(logs: AppLogEntry[]) => void> = new Set();
  private maxLogs = 500;

  constructor() {
    this.info("System", "VN Translator logging service initialized.");
    this.attachGlobalErrorHandlers();
  }

  private attachGlobalErrorHandlers() {
    if (typeof window === "undefined") return;

    window.addEventListener("error", (event) => {
      this.error("GlobalRuntime", event.message || "Uncaught window error", {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      this.error("UnhandledPromise", message, { stack, raw: reason });
    });
  }

  public subscribe(callback: (logs: AppLogEntry[]) => void) {
    this.listeners.add(callback);
    callback([...this.logs]);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify() {
    const list = [...this.logs];
    this.listeners.forEach((cb) => cb(list));
  }

  public log(level: "INFO" | "WARN" | "ERROR" | "DEBUG", source: string, message: string, details?: any) {
    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? `log_${crypto.randomUUID()}`
      : `log_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const entry: AppLogEntry = {
      id,
      time: new Date().toLocaleTimeString("en-US", { hour12: false }),
      level,
      source,
      message,
      details,
    };

    // Console output for DevTools
    const consoleMsg = `[${entry.time}] [${level}] [${source}] ${message}`;
    if (level === "ERROR") {
      console.error(consoleMsg, details || "");
    } else if (level === "WARN") {
      console.warn(consoleMsg, details || "");
    } else if (level === "DEBUG") {
      console.debug(consoleMsg, details || "");
    } else {
      console.log(consoleMsg, details || "");
    }

    this.logs = [entry, ...this.logs].slice(0, this.maxLogs);
    this.notify();

    // Persist critical logs (WARN/ERROR) to disk via TauriBridge (M8)
    if (typeof window !== "undefined" && (level === "ERROR" || level === "WARN")) {
      try {
        const line =
          JSON.stringify({
            isoTime: new Date().toISOString(),
            ...entry,
            details: details ? (typeof details === "string" ? details : JSON.stringify(details)) : undefined,
          }) + "\n";
        TauriBridge.appendDebugLog("app_system_logs.jsonl", line).catch(() => {});
      } catch {
        // Non-blocking disk persist fallback
      }
    }
  }

  public debug(source: string, message: string, details?: any) {
    this.log("DEBUG", source, message, details);
  }

  public info(source: string, message: string, details?: any) {
    this.log("INFO", source, message, details);
  }

  public warn(source: string, message: string, details?: any) {
    this.log("WARN", source, message, details);
  }

  public error(source: string, message: string, details?: any) {
    this.log("ERROR", source, message, details);
  }

  public clear() {
    this.logs = [];
    this.notify();
  }

  public dispose() {
    this.listeners.clear();
    this.logs = [];
  }

  public getLogs(): AppLogEntry[] {
    return [...this.logs];
  }
}

export const logger = new LoggerService();
