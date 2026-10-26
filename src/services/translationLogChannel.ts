import { isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import type { TranslationLogItem } from "../types";

const EVENT = "vn-translation-log";
function isLog(value: unknown): value is TranslationLogItem {
  if (!value || typeof value !== "object") return false;
  const log = value as TranslationLogItem;
  return typeof log.id === "string" && typeof log.provider === "string" &&
    typeof log.message?.source === "string" && typeof log.message?.translated === "string";
}
export function publishAuxiliaryTranslationLog(item: TranslationLogItem): void {
  if (typeof window === "undefined" || new URLSearchParams(window.location?.search).get("regionSelector") !== "true") return;
  if (isTauri()) {
    void emitTo("main", EVENT, item).catch((error) => console.warn("Could not forward translation log:", error));
  } else if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(EVENT);
    channel.postMessage(item);
    channel.close();
  }
}
export async function subscribeAuxiliaryTranslationLogs(receive: (item: TranslationLogItem) => void): Promise<() => void> {
  if (typeof window === "undefined") return () => {};
  const onLog = (value: unknown) => { if (isLog(value)) receive(value); };
  if (isTauri()) return listen<TranslationLogItem>(EVENT, (event) => onLog(event.payload));
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(EVENT);
  channel.onmessage = (event) => onLog(event.data);
  return () => channel.close();
}
