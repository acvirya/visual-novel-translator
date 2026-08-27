import React, { useState, useEffect, useRef } from "react";
import { OverlayConfig } from "../../types";
import {
  overlayChannel,
  OverlayDialogueMessage,
  OverlayEvent,
} from "../../utils/overlayChannel";
import { compileOverlayTemplate, getOverlayAnimationCss } from "../../utils/overlayTemplateEngine";
import { invoke } from "@tauri-apps/api/core";
import { Check, X, Move } from "lucide-react";

const DEFAULT_CONFIG: OverlayConfig = {
  isEnabled: true,
  targetMonitor: "monitor_1",
  isClickThrough: true,
  isExcludedFromCapture: true,
  x: 140,
  y: 760,
  width: 1100,
  height: 130,
  maxExpandRatio: 2.0,
  fontSize: 20,
  fontColor: "#FFFFFF",
  outlineColor: "#000000",
  outlineWidth: 2,
  backgroundColor: "#0D1017",
  backgroundOpacity: 0.85,
  borderRadius: 8,
  showSpeaker: true,
  showTranslatedSpeaker: true,
  showMessage: true,
  showTranslatedMessage: true,
};

const EMPTY_DIALOGUE: OverlayDialogueMessage = {
  speaker: "",
  translatedSpeaker: "",
  message: "",
  translatedMessage: "",
};

const SAMPLE_EDIT_DIALOGUE: OverlayDialogueMessage = {
  speaker: "Speaker Name",
  translatedSpeaker: "",
  message: "Original dialogue text will appear here...",
  translatedMessage: "",
};

function hexToRgba(hex: string, opacity: number): string {
  const cleanHex = hex.replace("#", "");
  let r = 0, g = 0, b = 0;
  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export const OverlayWindow: React.FC = () => {
  const [config, setConfig] = useState<OverlayConfig>(() => {
    return overlayChannel.getSavedConfig() || DEFAULT_CONFIG;
  });

  const [dialogue, setDialogue] = useState<OverlayDialogueMessage>(EMPTY_DIALOGUE);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Box geometry in edit mode
  const [boxRect, setBoxRect] = useState<{ x: number; y: number; width: number; height: number }>({
    x: config.x,
    y: config.y,
    width: config.width,
    height: config.height,
  });

  // Interaction State: drawing, dragging, resizing
  const [interactionMode, setInteractionMode] = useState<"idle" | "drawing" | "dragging" | "resizing">("idle");
  const [resizeHandle, setResizeHandle] = useState<string>("");
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initialBox: typeof boxRect }>({
    mouseX: 0,
    mouseY: 0,
    initialBox: boxRect,
  });

  const highestIdRef = useRef<number>(0);

  // Sync with main app via BroadcastChannel
  useEffect(() => {
    const unsubscribe = overlayChannel.subscribe((event: OverlayEvent) => {
      if (event.type === "CONFIG_UPDATE") {
        setConfig(event.config);
        setBoxRect({
          x: event.config.x,
          y: event.config.y,
          width: event.config.width,
          height: event.config.height,
        });
      } else if (event.type === "SET_EDIT_MODE") {
        setIsEditing(event.isEditing);
      } else if (event.type === "DIALOGUE_UPDATE") {
        const msgId = typeof event.dialogue.id === "number" ? event.dialogue.id : 0;
        // Rule 6: Only accept packets with the highest ID (strictly discard older packets to eliminate race conditions)
        if (msgId > 0 && msgId < highestIdRef.current) {
          return;
        }
        if (msgId > 0 && msgId > highestIdRef.current) {
          highestIdRef.current = msgId;
        }
        setDialogue(event.dialogue);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Update boxRect when config changes externally
  useEffect(() => {
    setBoxRect({
      x: config.x,
      y: config.y,
      width: config.width,
      height: config.height,
    });
  }, [config.x, config.y, config.width, config.height]);

  // Global Escape key listener to safely exit edit mode
  useEffect(() => {
    if (!isEditing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancelPosition();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditing, config]);

  // Handle Save
  const handleSavePosition = async () => {
    setIsEditing(false);
    const updated = {
      ...config,
      x: Math.round(boxRect.x),
      y: Math.round(boxRect.y),
      width: Math.round(boxRect.width),
      height: Math.round(boxRect.height),
    };
    setConfig(updated);

    // Notify main window
    overlayChannel.send({
      type: "POSITION_SAVED",
      x: updated.x,
      y: updated.y,
      width: updated.width,
      height: updated.height,
    });
    overlayChannel.send({ type: "CONFIG_UPDATE", config: updated });

    // Tell Tauri to re-enable click-through
    try {
      await invoke("set_overlay_edit_mode", { isEditing: false });
    } catch {
      // Ignored if not running in Tauri
    }
  };

  // Handle Cancel
  const handleCancelPosition = async () => {
    setIsEditing(false);
    setBoxRect({
      x: config.x,
      y: config.y,
      width: config.width,
      height: config.height,
    });
    overlayChannel.send({ type: "SET_EDIT_MODE", isEditing: false });

    try {
      await invoke("set_overlay_edit_mode", { isEditing: false });
    } catch {
      // Ignored if not running in Tauri
    }
  };

  // Keyboard Shortcuts (Enter / Escape)
  useEffect(() => {
    if (!isEditing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSavePosition();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancelPosition();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditing, boxRect, config]);

  // Pointer Handlers for Draw, Move & Resize
  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (!isEditing) return;
    // Start drawing a new box from scratch
    setInteractionMode("drawing");
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialBox: { x: e.clientX, y: e.clientY, width: 20, height: 20 },
    };
    setBoxRect({ x: e.clientX, y: e.clientY, width: 20, height: 20 });
  };

  const handleBoxMouseDown = (e: React.MouseEvent) => {
    if (!isEditing) return;
    e.stopPropagation();
    setInteractionMode("dragging");
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialBox: { ...boxRect },
    };
  };

  const handleResizeHandleMouseDown = (handle: string, e: React.MouseEvent) => {
    if (!isEditing) return;
    e.stopPropagation();
    setInteractionMode("resizing");
    setResizeHandle(handle);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialBox: { ...boxRect },
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isEditing || interactionMode === "idle") return;

    const dx = e.clientX - dragStartRef.current.mouseX;
    const dy = e.clientY - dragStartRef.current.mouseY;
    const { initialBox } = dragStartRef.current;

    if (interactionMode === "drawing") {
      const x = Math.min(dragStartRef.current.mouseX, e.clientX);
      const y = Math.min(dragStartRef.current.mouseY, e.clientY);
      const width = Math.max(80, Math.abs(dx));
      const height = Math.max(50, Math.abs(dy));
      setBoxRect({ x, y, width, height });
    } else if (interactionMode === "dragging") {
      const x = Math.max(0, initialBox.x + dx);
      const y = Math.max(0, initialBox.y + dy);
      setBoxRect({ ...initialBox, x, y });
    } else if (interactionMode === "resizing") {
      let newX = initialBox.x;
      let newY = initialBox.y;
      let newW = initialBox.width;
      let newH = initialBox.height;

      if (resizeHandle.includes("e")) {
        newW = Math.max(120, initialBox.width + dx);
      }
      if (resizeHandle.includes("s")) {
        newH = Math.max(60, initialBox.height + dy);
      }
      if (resizeHandle.includes("w")) {
        const potentialW = initialBox.width - dx;
        if (potentialW >= 120) {
          newW = potentialW;
          newX = initialBox.x + dx;
        }
      }
      if (resizeHandle.includes("n")) {
        const potentialH = initialBox.height - dy;
        if (potentialH >= 60) {
          newH = potentialH;
          newY = initialBox.y + dy;
        }
      }

      setBoxRect({ x: newX, y: newY, width: newW, height: newH });
    }
  };

  const handleMouseUp = () => {
    if (interactionMode !== "idle") {
      setInteractionMode("idle");
    }
  };

  const [displayedDialogue, setDisplayedDialogue] = useState<OverlayDialogueMessage>(EMPTY_DIALOGUE);
  const [animTick, setAnimTick] = useState<number>(0);

  // Handle Text Animation Subsystem (Typewriter streaming & CSS keyframes)
  useEffect(() => {
    if (isEditing) {
      setDisplayedDialogue(SAMPLE_EDIT_DIALOGUE);
      return;
    }

    const mode = config.textAnimation || "none";
    if (mode === "none" || (!dialogue.message && !dialogue.translatedMessage)) {
      setDisplayedDialogue(dialogue);
      return;
    }

    if (mode === "typewriter") {
      const speed = Math.max(5, Math.min(100, config.animationSpeedMs || 25));
      const targetTrans = dialogue.translatedMessage || "";
      const targetOrig = dialogue.message || "";
      const maxLen = Math.max(targetTrans.length, targetOrig.length);

      if (maxLen === 0) {
        setDisplayedDialogue(dialogue);
        return;
      }

      let currentIdx = 1;
      setDisplayedDialogue({
        ...dialogue,
        message: targetOrig ? targetOrig.slice(0, 1) : "",
        translatedMessage: targetTrans ? targetTrans.slice(0, 1) : "",
      });

      const timer = setInterval(() => {
        currentIdx++;
        setDisplayedDialogue({
          ...dialogue,
          message: targetOrig ? targetOrig.slice(0, currentIdx) : "",
          translatedMessage: targetTrans ? targetTrans.slice(0, currentIdx) : "",
        });

        if (currentIdx >= maxLen) {
          clearInterval(timer);
        }
      }, speed);

      return () => clearInterval(timer);
    } else {
      // CSS Transitions (Fade / Slide / Blur)
      setDisplayedDialogue(dialogue);
      setAnimTick(Date.now());
    }
  }, [dialogue, isEditing, config.textAnimation, config.animationSpeedMs]);

  const currentX = isEditing ? boxRect.x : config.x;
  const currentY = isEditing ? boxRect.y : config.y;
  const currentW = isEditing ? boxRect.width : config.width;
  const currentH = isEditing ? boxRect.height : config.height;

  const activeDialogue = isEditing ? SAMPLE_EDIT_DIALOGUE : displayedDialogue;
  const hasText = Boolean(
    activeDialogue.speaker ||
    activeDialogue.translatedSpeaker ||
    activeDialogue.message ||
    activeDialogue.translatedMessage
  );

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseDown={isEditing ? handleBackdropMouseDown : undefined}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: isEditing ? "rgba(0, 0, 0, 0.58)" : "transparent",
        overflow: "hidden",
        userSelect: "none",
        cursor: isEditing ? (interactionMode === "drawing" ? "crosshair" : "default") : "default",
        transition: "background-color 0.2s ease",
        zIndex: 999999,
        pointerEvents: isEditing ? "auto" : "none",
      }}
    >
      {/* Top Floating Bar in Edit Mode */}
      {isEditing && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#131722",
            border: "1px solid var(--border-active)",
            borderRadius: "var(--radius-md)",
            padding: "10px 18px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
            zIndex: 1000000,
            pointerEvents: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Move size={16} style={{ color: "var(--accent-gold)" }} />
            <span style={{ fontWeight: 700, fontSize: "13px", color: "var(--text-primary)" }}>
              Box Placement Mode
            </span>
          </div>

          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              color: "var(--text-secondary)",
              backgroundColor: "var(--bg-app)",
              padding: "4px 10px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            X: <strong>{Math.round(boxRect.x)}</strong> | Y: <strong>{Math.round(boxRect.y)}</strong> | W:{" "}
            <strong>{Math.round(boxRect.width)}</strong> | H: <strong>{Math.round(boxRect.height)}</strong>
          </div>

          <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            Hold & drag canvas to redraw • Drag box to move • Drag edges to resize
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleSavePosition}
              className="btn-primary"
              style={{ padding: "6px 14px", fontWeight: 700, backgroundColor: "var(--accent-success)" }}
            >
              <Check size={14} />
              <span>Save (Enter)</span>
            </button>
            <button
              onClick={handleCancelPosition}
              className="btn-secondary"
              style={{ padding: "6px 12px" }}
            >
              <X size={14} />
              <span>Cancel (Esc)</span>
            </button>
          </div>
        </div>
      )}

      {/* The Single Subtitle Dialogue Box */}
      {(isEditing || hasText) && (
        <div
          onMouseDown={isEditing ? handleBoxMouseDown : undefined}
          style={{
            position: "absolute",
            left: `${currentX}px`,
            top: `${currentY}px`,
            width: `${currentW}px`,
            minHeight: `${currentH}px`,
            maxHeight: isEditing ? `${currentH}px` : `${currentH * config.maxExpandRatio}px`,
            backgroundColor: config.useCustomTemplate ? "transparent" : hexToRgba(config.backgroundColor, config.backgroundOpacity),
            borderRadius: `${config.borderRadius}px`,
            padding: config.useCustomTemplate ? "0" : "12px 18px",
            color: config.fontColor,
            border: isEditing
              ? "2px solid var(--accent-gold)"
              : config.useCustomTemplate
              ? "none"
              : `${config.outlineWidth}px solid ${config.outlineColor}`,
            boxShadow: isEditing
              ? "0 0 0 4px rgba(227, 179, 65, 0.3), 0 12px 36px rgba(0,0,0,0.8)"
              : config.useCustomTemplate
              ? "none"
              : "0 8px 24px rgba(0,0,0,0.6)",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            overflow: "visible",
            cursor: isEditing ? "move" : "default",
            boxSizing: "border-box",
            pointerEvents: isEditing ? "auto" : "none",
          }}
        >
          {config.useCustomTemplate ? (
            /* Custom Component Template Engine Mode */
            <div
              id="vn-overlay-scope-root"
              className="vn-overlay-scope-root"
              style={{
                width: "100%",
                height: "100%",
                overflow: "visible",
                // @ts-ignore
                "--speaker-font-size": `${config.speakerFontSize || 16}px`,
                // @ts-ignore
                "--message-font-size": `${config.messageFontSize || config.fontSize || 20}px`,
                // @ts-ignore
                "--overlay-font-size": `${config.fontSize || 20}px`,
              }}
            >
              {/* Inject Scoped CSS & Animation Keyframes */}
              <style
                dangerouslySetInnerHTML={{
                  __html: `${getOverlayAnimationCss(config.textAnimation, config.animationSpeedMs)}\n${config.customTemplateCss || ""}`,
                }}
              />
              {/* Render Compiled Template HTML with reactive config */}
              <div
                key={animTick}
                className={config.textAnimation && config.textAnimation !== "none" && config.textAnimation !== "typewriter" ? `vn-anim-${config.textAnimation}` : ""}
                dangerouslySetInnerHTML={{
                  __html: compileOverlayTemplate(config.customTemplateHtml, activeDialogue, config),
                }}
              />
            </div>
          ) : (
            /* Standard Configurable Subtitle Box */
            <div
              key={animTick}
              className={config.textAnimation && config.textAnimation !== "none" && config.textAnimation !== "typewriter" ? `vn-anim-${config.textAnimation}` : ""}
              style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}
            >
              <style
                dangerouslySetInnerHTML={{
                  __html: getOverlayAnimationCss(config.textAnimation, config.animationSpeedMs),
                }}
              />
              {/* Speaker Name Row (JP & Translated) */}
              {(config.showSpeaker || config.showTranslatedSpeaker) && (activeDialogue.speaker || activeDialogue.translatedSpeaker) && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  {config.showSpeaker && activeDialogue.speaker && (
                    <span
                      style={{
                        backgroundColor: "rgba(227, 179, 65, 0.2)",
                        color: "var(--accent-gold)",
                        padding: "1px 8px",
                        borderRadius: "var(--radius-sm)",
                        fontWeight: 700,
                        fontSize: `${config.speakerFontSize || Math.max(12, config.fontSize * 0.75)}px`,
                        fontFamily: "var(--font-jp)",
                      }}
                    >
                      {activeDialogue.speaker}
                    </span>
                  )}

                  {config.showTranslatedSpeaker && activeDialogue.translatedSpeaker && (
                    <span
                      style={{
                        fontSize: `${config.speakerFontSize || Math.max(12, config.fontSize * 0.75)}px`,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      {activeDialogue.translatedSpeaker}
                    </span>
                  )}
                </div>
              )}

              {/* Message (Source Text / Dialogue) */}
              {(config.showMessage || !activeDialogue.translatedMessage) && activeDialogue.message && (
                <div
                  className="vn-text-anim-target"
                  style={{
                    fontSize: `${config.messageFontSize || config.fontSize}px`,
                    fontFamily: "var(--font-jp)",
                    color: config.fontColor || "#FFFFFF",
                    lineHeight: 1.5,
                    textShadow: `${config.outlineWidth}px ${config.outlineWidth}px 0px ${config.outlineColor}`,
                    wordBreak: "break-word",
                  }}
                >
                  {activeDialogue.message}
                </div>
              )}

              {/* Translated Message */}
              {config.showTranslatedMessage && activeDialogue.translatedMessage && (
                <div
                  className="vn-text-anim-target"
                  style={{
                    fontSize: `${config.messageFontSize || config.fontSize}px`,
                    fontWeight: 600,
                    lineHeight: 1.4,
                    color: config.fontColor,
                    textShadow: `${config.outlineWidth}px ${config.outlineWidth}px 0px ${config.outlineColor}`,
                    wordBreak: "break-word",
                  }}
                >
                  {activeDialogue.translatedMessage}
                </div>
              )}
            </div>
          )}

          {/* 8-Way Resize Handles in Edit Mode */}
          {isEditing && (
          <>
            {/* Corners */}
            <div
              onMouseDown={(e) => handleResizeHandleMouseDown("nw", e)}
              style={{ position: "absolute", top: -5, left: -5, width: 10, height: 10, backgroundColor: "var(--accent-gold)", cursor: "nwse-resize" }}
            />
            <div
              onMouseDown={(e) => handleResizeHandleMouseDown("ne", e)}
              style={{ position: "absolute", top: -5, right: -5, width: 10, height: 10, backgroundColor: "var(--accent-gold)", cursor: "nesw-resize" }}
            />
            <div
              onMouseDown={(e) => handleResizeHandleMouseDown("sw", e)}
              style={{ position: "absolute", bottom: -5, left: -5, width: 10, height: 10, backgroundColor: "var(--accent-gold)", cursor: "nesw-resize" }}
            />
            <div
              onMouseDown={(e) => handleResizeHandleMouseDown("se", e)}
              style={{ position: "absolute", bottom: -5, right: -5, width: 10, height: 10, backgroundColor: "var(--accent-gold)", cursor: "nwse-resize" }}
            />
            {/* Edges */}
            <div
              onMouseDown={(e) => handleResizeHandleMouseDown("n", e)}
              style={{ position: "absolute", top: -4, left: "50%", transform: "translateX(-50%)", width: 24, height: 8, backgroundColor: "var(--accent-gold)", borderRadius: "2px", cursor: "ns-resize" }}
            />
            <div
              onMouseDown={(e) => handleResizeHandleMouseDown("s", e)}
              style={{ position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%)", width: 24, height: 8, backgroundColor: "var(--accent-gold)", borderRadius: "2px", cursor: "ns-resize" }}
            />
            <div
              onMouseDown={(e) => handleResizeHandleMouseDown("w", e)}
              style={{ position: "absolute", left: -4, top: "50%", transform: "translateY(-50%)", width: 8, height: 24, backgroundColor: "var(--accent-gold)", borderRadius: "2px", cursor: "ew-resize" }}
            />
            <div
              onMouseDown={(e) => handleResizeHandleMouseDown("e", e)}
              style={{ position: "absolute", right: -4, top: "50%", transform: "translateY(-50%)", width: 8, height: 24, backgroundColor: "var(--accent-gold)", borderRadius: "2px", cursor: "ew-resize" }}
            />
          </>
        )}
      </div>
      )}
    </div>
  );
};
