/**
 * Strongly-typed Centralized EventBus (A3)
 * Replaces ad-hoc callback arrays across services and prevents memory leaks.
 */

import { TranslationLogItem } from "../types";
import { BatchProgressUpdate, BatchFileEntry } from "./batchTranslateService";
import { logger } from "./loggerService";

export type EventMap = {
  // Translation Events
  "translation:logged": TranslationLogItem;
  "translation:paused": boolean;
  "translation:sessionUsage": {
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    cost: number;
  };

  // Batch Events
  "batch:progress": BatchProgressUpdate;
  "batch:fileUpdated": BatchFileEntry;
  "batch:completed": { totalFiles: number; totalLines: number; durationMs: number };
  "batch:cancelled": void;

  // OCR Events
  "ocr:scanned": { text: string; source: "ocr" | "snipping"; durationMs: number };
  "ocr:status": { isScanning: boolean; error?: string };

  // Textractor Events
  "textractor:line": { text: string; source: "textractor" };
  "textractor:status": { isConnected: boolean; pid?: number };

  // Overlay Events
  "overlay:state": { isVisible: boolean; isLocked: boolean };
};

export type EventKey = keyof EventMap;
export type EventHandler<K extends EventKey> = (data: EventMap[K]) => void;
export type Unsubscribe = () => void;

class EventBus {
  private handlers = new Map<EventKey, Set<EventHandler<any>>>();

  /**
   * Subscribes to an event. Returns an unsubscribe function.
   */
  public on<K extends EventKey>(event: K, handler: EventHandler<K>): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);

    return () => {
      this.off(event, handler);
    };
  }

  /**
   * Subscribes to an event once. Automatically unregisters after firing.
   */
  public once<K extends EventKey>(event: K, handler: EventHandler<K>): Unsubscribe {
    const wrapper = (data: EventMap[K]) => {
      this.off(event, wrapper);
      handler(data);
    };
    return this.on(event, wrapper);
  }

  /**
   * Unsubscribes a handler from an event.
   */
  public off<K extends EventKey>(event: K, handler: EventHandler<K>): void {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  /**
   * Emits an event to all registered handlers.
   */
  public emit<K extends EventKey>(event: K, data: EventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;

    for (const handler of Array.from(set)) {
      try {
        handler(data);
      } catch (err) {
        logger.error("EventBus", `Error in handler for event '${event}': ${err}`);
      }
    }
  }

  /**
   * Clears all listeners for a given event, or all events if none specified.
   */
  public clear(event?: EventKey): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * Returns listener count for debugging/testing
   */
  public listenerCount(event: EventKey): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

export const eventBus = new EventBus();
