import { describe, it, expect } from "vitest";
import { normalizeKeyboardEvent } from "../HotkeyRecorder";

describe("HotkeyRecorder - normalizeKeyboardEvent", () => {
  it("detects when only modifier keys are pressed", () => {
    const event = {
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      key: "Control",
    } as KeyboardEvent;

    const result = normalizeKeyboardEvent(event);
    expect(result.isModifierOnly).toBe(true);
    expect(result.shortcut).toBeNull();
    expect(result.heldModifiers).toEqual(["Ctrl"]);
  });

  it("normalizes Alt + s to Alt+S", () => {
    const event = {
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
      metaKey: false,
      key: "s",
    } as KeyboardEvent;

    const result = normalizeKeyboardEvent(event);
    expect(result.isModifierOnly).toBe(false);
    expect(result.shortcut).toBe("Alt+S");
  });

  it("normalizes Ctrl + Shift + l to Ctrl+Shift+L", () => {
    const event = {
      ctrlKey: true,
      altKey: false,
      shiftKey: true,
      metaKey: false,
      key: "l",
    } as KeyboardEvent;

    const result = normalizeKeyboardEvent(event);
    expect(result.isModifierOnly).toBe(false);
    expect(result.shortcut).toBe("Ctrl+Shift+L");
  });

  it("allows standalone function keys like F9", () => {
    const event = {
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      key: "F9",
    } as KeyboardEvent;

    const result = normalizeKeyboardEvent(event);
    expect(result.isModifierOnly).toBe(false);
    expect(result.shortcut).toBe("F9");
  });

  it("ignores standalone alphanumeric keys without modifiers", () => {
    const event = {
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      key: "a",
    } as KeyboardEvent;

    const result = normalizeKeyboardEvent(event);
    expect(result.isModifierOnly).toBe(false);
    expect(result.shortcut).toBeNull();
  });

  it("normalizes arrow keys and space with modifiers", () => {
    const spaceEvent = {
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      key: " ",
    } as KeyboardEvent;
    expect(normalizeKeyboardEvent(spaceEvent).shortcut).toBe("Ctrl+Space");

    const upEvent = {
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      key: "ArrowUp",
    } as KeyboardEvent;
    expect(normalizeKeyboardEvent(upEvent).shortcut).toBe("Ctrl+Up");
  });
});
