import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { OcrService } from "../ocrService";
import { useOcrStore } from "../../stores/useOcrStore";

describe("OcrService scan lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    OcrService.stopAutoScan();
  });

  afterEach(() => {
    OcrService.stopAutoScan();
    vi.useRealTimers();
  });

  it("should start and stop auto-scan cleanly without timer leaks", () => {
    expect(useOcrStore.getState().isScanning).toBe(false);

    OcrService.startAutoScan();
    expect(useOcrStore.getState().isScanning).toBe(true);

    OcrService.stopAutoScan();
    expect(useOcrStore.getState().isScanning).toBe(false);
  });

  it("should handle rapid start/stop calls without multiple concurrent timers", () => {
    // Rapid toggling
    OcrService.startAutoScan();
    OcrService.stopAutoScan();
    OcrService.startAutoScan();
    OcrService.stopAutoScan();

    expect(useOcrStore.getState().isScanning).toBe(false);

    // Fast-forward any remaining timers
    vi.runAllTimers();

    // Should still remain stopped
    expect(useOcrStore.getState().isScanning).toBe(false);
  });
});
