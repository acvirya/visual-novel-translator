import { describe, it, expect, vi, beforeEach } from "vitest";
import { TextractorService } from "../textractorService";
import { TauriBridge } from "../tauriBridge";
import { useTextractorStore } from "../../stores/useTextractorStore";

vi.mock("../tauriBridge", () => ({
  TauriBridge: {
    sendTextractorCommand: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("TextractorService Hook Injection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTextractorStore.getState().setAttachedPid(null);
  });

  it("rejects empty or whitespace hook code", async () => {
    const res = await TextractorService.insertHook("   ");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/cannot be empty/i);
    expect(TauriBridge.sendTextractorCommand).not.toHaveBeenCalled();
  });

  it("rejects invalid hook code syntax missing @ symbol", async () => {
    const res = await TextractorService.insertHook("/HN-4*0-invalid");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/invalid hook code format/i);
    expect(TauriBridge.sendTextractorCommand).not.toHaveBeenCalled();
  });

  it("automatically appends active PID flag when injecting valid hook code", async () => {
    useTextractorStore.getState().setAttachedPid(12345);

    const res = await TextractorService.insertHook("/HN-4*0@SiglusEngine.exe");
    expect(res.success).toBe(true);
    expect(TauriBridge.sendTextractorCommand).toHaveBeenCalledWith("/HN-4*0@SiglusEngine.exe -P12345");
  });

  it("preserves explicitly provided PID in hook code", async () => {
    useTextractorStore.getState().setAttachedPid(12345);

    const res = await TextractorService.insertHook("HS-8*0@43F9B0 -P9999");
    expect(res.success).toBe(true);
    expect(TauriBridge.sendTextractorCommand).toHaveBeenCalledWith("HS-8*0@43F9B0 -P9999");
  });
});
