/**
 * Central Logger Service
 * Captures real-time system, network, and translation logs across the desktop app.
 */

export interface AppLogEntry {
  id: string;
  time: string;
  level: "INFO" | "WARN" | "ERROR";
  source: string;
  message: string;
  details?: any;
}

class LoggerService {
  private logs: AppLogEntry[] = [];
  private listeners: ((logs: AppLogEntry[]) => void)[] = [];
  private maxLogs = 500;

  constructor() {
    this.info("System", "VN Translator logging service initialized.");
  }

  public subscribe(callback: (logs: AppLogEntry[]) => void) {
    this.listeners.push(callback);
    callback([...this.logs]);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notify() {
    const list = [...this.logs];
    this.listeners.forEach((cb) => cb(list));
  }

  public log(level: "INFO" | "WARN" | "ERROR", source: string, message: string, details?: any) {
    const entry: AppLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
    } else {
      console.log(consoleMsg, details || "");
    }

    this.logs = [entry, ...this.logs].slice(0, this.maxLogs);
    this.notify();
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

  public getLogs(): AppLogEntry[] {
    return [...this.logs];
  }
}

export const logger = new LoggerService();
