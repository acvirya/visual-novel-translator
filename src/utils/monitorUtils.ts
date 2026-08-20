import { MonitorInfo } from "../types";

/**
 * Formats low-level Windows display identifiers (e.g. "\\\\.\\DISPLAY1")
 * into user-friendly names (e.g. "Display 1 (Primary) • 2560×1440").
 */
export function formatMonitorLabel(m: MonitorInfo): string {
  let displayName = m.name;

  // Extract display index like DISPLAY1 -> Display 1
  const displayMatch = displayName.match(/DISPLAY(\d+)/i);
  if (displayMatch) {
    displayName = `Display ${displayMatch[1]}`;
  } else if (displayName.startsWith("\\\\.\\")) {
    displayName = displayName.replace(/^\\\\\.\\/, "");
  }

  const primaryTag = m.is_primary ? " (Primary)" : "";
  return `${displayName}${primaryTag} • ${m.width}×${m.height}`;
}
