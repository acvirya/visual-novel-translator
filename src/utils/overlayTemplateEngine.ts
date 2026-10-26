import { OverlayConfig } from "../types";
import { OverlayDialogueMessage } from "./overlayChannel";
import DOMPurify from "dompurify";
import { settingsManager } from "../services/settingsManager";

import { OVERLAY_PRESETS, type TemplatePreset } from "../constants/overlayPresets";
export { OVERLAY_PRESETS, type TemplatePreset } from "../constants/overlayPresets";

/**
 * Compiles dynamic template HTML by interpolating variables and resolving conditional blocks
 */
export function compileOverlayTemplate(
  templateHtml?: string,
  dialogue?: OverlayDialogueMessage,
  config?: OverlayConfig
): string {
  if (!templateHtml || !dialogue) return "";

  let output = templateHtml;

  // Apply display field visibility toggles if config is present:
  // Raw Japanese fields can be toggled by user, translated fields are always enabled
  const allowSpeaker = config ? config.showSpeaker !== false : true;
  const allowTransSpeaker = true;
  const allowMessage = config ? config.showMessage !== false : true;
  const allowTransMessage = true;

  const speakerVal = allowSpeaker ? (dialogue.speaker || "") : "";
  const transSpeakerVal = allowTransSpeaker ? (dialogue.translatedSpeaker || "") : "";
  const messageVal = allowMessage ? (dialogue.message || "") : "";
  const transMessageVal = allowTransMessage ? (dialogue.translatedMessage || "") : "";

  output = resolveConditionalBlocks(output, {
    speaker: !!speakerVal.trim(),
    translatedSpeaker: !!transSpeakerVal.trim(),
    message: !!messageVal.trim(),
    translatedMessage: !!transMessageVal.trim(),
    hasSpeaker: !!(speakerVal.trim() || transSpeakerVal.trim()),
  });

  // 6. Interpolate Dialogue Variables (SERI-09: Function replacer prevents $ special pattern corruption)
  output = output
    .replace(/\{\{\s*speaker\s*\}\}/gi, () => escapeHtml(speakerVal))
    .replace(/\{\{\s*translatedSpeaker\s*\}\}/gi, () => escapeHtml(transSpeakerVal))
    .replace(/\{\{\s*message\s*\}\}/gi, () => escapeHtml(messageVal))
    .replace(/\{\{\s*translatedMessage\s*\}\}/gi, () => escapeHtml(transMessageVal));

  // 7. Interpolate Config Variables & Typography if available
  if (config) {
    const speakerSize = config.speakerFontSize || Math.max(12, (config.messageFontSize || config.fontSize) - 4);
    const messageSize = config.messageFontSize || config.fontSize;

    output = output
      .replace(/\{\{\s*fontSize\s*\}\}/gi, () => `${messageSize}px`)
      .replace(/\{\{\s*speakerFontSize\s*\}\}/gi, () => `${speakerSize}px`)
      .replace(/\{\{\s*messageFontSize\s*\}\}/gi, () => `${messageSize}px`)
      .replace(/\{\{\s*fontColor\s*\}\}/gi, () => escapeHtml(config.fontColor))
      .replace(/\{\{\s*outlineColor\s*\}\}/gi, () => escapeHtml(config.outlineColor))
      .replace(/\{\{\s*backgroundColor\s*\}\}/gi, () => escapeHtml(config.backgroundColor))
      .replace(/\{\{\s*borderRadius\s*\}\}/gi, () => `${config.borderRadius}px`);
  }

  return sanitizeOverlayHtml(output);
}

/**
 * Strips potentially dangerous script tags, inline event handlers, and javascript: links
 */
export function sanitizeOverlayHtml(html: string): string {
  if (!html) return "";
  // Parse HTML with a maintained sanitizer; regexes miss encoded attributes and
  // browser error-recovery rules. Templates are presentation-only.
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["div", "span", "p", "br", "b", "strong", "i", "em", "small", "ruby", "rt", "rp", "section", "article", "header", "footer", "h1", "h2", "h3", "ul", "ol", "li", "hr"],
    ALLOWED_ATTR: ["class", "id", "style", "title", "lang", "dir"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}

/**
 * Handles block conditional {{#if var}}content{{/if}}
 */
function resolveConditionalBlocks(template: string, values: Record<string, boolean>): string {
  const enabled = [true];
  const tokens = /\{\{\s*(?:#if\s+([a-z]+)|\/if)\s*\}\}/gi;
  let result = "";
  let cursor = 0;
  for (const token of template.matchAll(tokens)) {
    if (enabled[enabled.length - 1]) result += template.slice(cursor, token.index);
    if (token[1]) {
      const key = Object.keys(values).find((name) => name.toLowerCase() === token[1].toLowerCase());
      enabled.push(enabled[enabled.length - 1] && !!(key && values[key]));
    } else if (enabled.length > 1) {
      enabled.pop();
    }
    cursor = token.index! + token[0].length;
  }
  if (enabled[enabled.length - 1]) result += template.slice(cursor);
  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function loadUserCustomPresets(): TemplatePreset[] {
  const presets = settingsManager.getOverlay().userCustomPresets;
  return Array.isArray(presets) ? presets.filter((preset) =>
    preset && typeof preset.id === "string" && typeof preset.name === "string" &&
    typeof preset.description === "string" && typeof preset.html === "string" && typeof preset.css === "string"
  ) : [];
}

export function saveUserCustomPresets(presets: TemplatePreset[]) {
  settingsManager.updateOverlay({ userCustomPresets: presets });
}

export function getAllOverlayPresets(customPresets?: TemplatePreset[]): TemplatePreset[] {
  const userList = customPresets || loadUserCustomPresets();
  return [...OVERLAY_PRESETS, ...userList];
}

export function isBuiltInPreset(presetId: string): boolean {
  return OVERLAY_PRESETS.some((p) => p.id === presetId);
}

/**
 * Standard CSS Keyframes for Subtitle Text Animation (Targets text nodes only, preserving box backdrop)
 */
export function getOverlayAnimationCss(animationMode?: string, speedMs?: number): string {
  const duration = Number.isFinite(speedMs) ? Math.min(10000, Math.max(0, speedMs!)) : (animationMode === "blur" ? 350 : 250);
  return `
@keyframes vnTextFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes vnTextBlurReveal {
  from { opacity: 0; filter: blur(6px); }
  to { opacity: 1; filter: blur(0); }
}

.vn-anim-fade .vn-text-anim-target {
  animation: vnTextFadeIn ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.vn-anim-blur .vn-text-anim-target {
  animation: vnTextBlurReveal ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
`;
}

/**
 * Sanitizes user-supplied custom CSS, stripping javascript / behavioral expressions
 */
export function sanitizeCustomCss(css: string): string {
  if (!css) return "";
  return css
    .replace(/</g, "")
    .replace(/expression\s*\(.*?\)/gi, "")
    .replace(/behavior\s*:[^;}]*/gi, "")
    .replace(/url\s*\(\s*["']?\s*javascript:[^)]*?\)/gi, "none")
    .replace(/@import\s+[^;]+;/gi, "");
}

