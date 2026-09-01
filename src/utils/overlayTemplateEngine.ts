import { OverlayConfig } from "../types";
import { OverlayDialogueMessage } from "./overlayChannel";

export interface TemplatePreset {
  id: string;
  name: string;
  description: string;
  html: string;
  css: string;
}

export const OVERLAY_PRESETS: TemplatePreset[] = [
  {
    id: "classic",
    name: "Classic VN Dialogue Box",
    description: "Standard visual novel subtitle box with dark semi-transparent backdrop and gold nameplate badge",
    html: `<div class="vn-box">
  {{#if hasSpeaker}}
  <div class="vn-nameplate">
    {{#if speaker}}
    <span class="vn-speaker-jp">{{speaker}}</span>
    {{/if}}
    {{#if translatedSpeaker}}
    <span class="vn-speaker-trans">{{translatedSpeaker}}</span>
    {{/if}}
  </div>
  {{/if}}

  {{#if message}}
  <div class="vn-message-jp">{{message}}</div>
  {{/if}}

  {{#if translatedMessage}}
  <div class="vn-message-trans">{{translatedMessage}}</div>
  {{/if}}
</div>`,
    css: `.vn-box {
  width: 100%;
  min-height: 100%;
  background: rgba(13, 16, 23, 0.90);
  border: 2px solid #384566;
  border-radius: 8px;
  padding: 12px 18px;
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 4px 12px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
}

.vn-nameplate {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(227, 179, 65, 0.18);
  border: 1px solid rgba(227, 179, 65, 0.45);
  padding: 2px 10px;
  border-radius: 4px;
  align-self: flex-start;
  box-shadow: inset 0 0 8px rgba(227, 179, 65, 0.1);
}

.vn-speaker-jp {
  color: #f6c23e;
  font-weight: 700;
  font-size: var(--speaker-font-size, 15px);
}

.vn-speaker-trans {
  color: #e6edf3;
  font-weight: 600;
  font-size: calc(var(--speaker-font-size, 15px) * 0.95);
}

.vn-message-jp {
  font-size: calc(var(--message-font-size, 20px) * 0.72);
  color: #8b949e;
  line-height: 1.45;
  border-left: 2px solid #4e73df;
  padding-left: 8px;
}

.vn-message-trans {
  font-size: var(--message-font-size, 20px);
  font-weight: 600;
  color: #ffffff;
  line-height: 1.4;
  text-shadow: 2px 2px 0px #000000;
}`,
  },
  {
    id: "persona_stylish",
    name: "Persona / Anime Slanted Angular Frame",
    description: "Dynamic asymmetrical angled cutouts with a sharp slanted nameplate and high-contrast comic styling",
    html: `<div class="persona-wrapper">
  {{#if hasSpeaker}}
  <div class="persona-nameplate">
    {{#if speaker}}
    <span class="persona-speaker-name">{{speaker}}</span>
    {{/if}}
    {{#if translatedSpeaker}}
    <span class="persona-speaker-en">/ {{translatedSpeaker}}</span>
    {{/if}}
  </div>
  {{/if}}

  <div class="persona-frame {{#if hasSpeaker}}has-speaker{{/if}}">
    <div class="persona-stripe"></div>
    <div class="persona-content">
      {{#if message}}
      <div class="persona-raw">{{message}}</div>
      {{/if}}

      {{#if translatedMessage}}
      <div class="persona-text">{{translatedMessage}}</div>
      {{/if}}
    </div>
  </div>
</div>`,
    css: `.persona-wrapper {
  position: relative;
  width: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 10px 10px 4px 10px;
  box-sizing: border-box;
  overflow: visible;
}

.persona-nameplate {
  position: absolute;
  top: 0px;
  left: 20px;
  z-index: 10;
  background: #ff1053;
  transform: skewX(-14deg);
  padding: 3px 16px;
  box-shadow: -3px 3px 0px #000000, inset 0 1px 0 rgba(255,255,255,0.3);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.persona-speaker-name {
  color: #ffffff;
  font-weight: 900;
  font-size: var(--speaker-font-size, 15px);
  transform: skewX(14deg);
  letter-spacing: 0.5px;
}

.persona-speaker-en {
  color: #ffe6ec;
  font-size: calc(var(--speaker-font-size, 15px) * 0.9);
  font-weight: 700;
  transform: skewX(14deg);
}

.persona-frame {
  width: 100%;
  min-height: 100%;
  background: rgba(12, 14, 18, 0.95);
  clip-path: polygon(0 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 20px 100%, 0 calc(100% - 20px));
  border-left: 5px solid #ff1053;
  border-right: 3px solid #ff1053;
  box-shadow: inset 0 0 16px rgba(0, 0, 0, 0.7);
  position: relative;
  padding: 14px 20px;
  box-sizing: border-box;
  overflow: visible;
}

.persona-frame.has-speaker {
  padding-top: 22px;
}

.persona-stripe {
  position: absolute;
  top: 0;
  right: 36px;
  width: 8px;
  height: 100%;
  background: rgba(255, 16, 83, 0.25);
  transform: skewX(-20deg);
}

.persona-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.persona-raw {
  color: #8b949e;
  font-size: calc(var(--message-font-size, 21px) * 0.7);
  line-height: 1.4;
}

.persona-text {
  color: #ffffff;
  font-size: var(--message-font-size, 21px);
  font-weight: 700;
  line-height: 1.4;
  text-shadow: 2px 2px 0px #000;
}`,
  },
  {
    id: "manga_bubble",
    name: "Manga Comic Speech Balloon",
    description: "Curved organic comic speech balloon with directional speech tail and vibrant manga styling",
    html: `<div class="bubble-wrapper">
  {{#if hasSpeaker}}
  <div class="bubble-speaker">
    {{#if speaker}}
    <span>{{speaker}}</span>
    {{/if}}
    {{#if translatedSpeaker}}
    <span class="bubble-speaker-sub">({{translatedSpeaker}})</span>
    {{/if}}
  </div>
  {{/if}}

  <div class="bubble-body {{#if hasSpeaker}}has-speaker{{/if}}">
    {{#if message}}
    <div class="bubble-jp">{{message}}</div>
    {{/if}}

    {{#if translatedMessage}}
    <div class="bubble-dialogue">{{translatedMessage}}</div>
    {{/if}}
    <div class="bubble-tail"></div>
  </div>
</div>`,
    css: `.bubble-wrapper {
  position: relative;
  width: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 10px 10px 14px 10px;
  box-sizing: border-box;
  overflow: visible;
}

.bubble-speaker {
  position: absolute;
  top: 0;
  left: 20px;
  background: #1f2328;
  color: #f6c23e;
  border: 2px solid #ffffff;
  padding: 2px 12px;
  border-radius: 12px;
  font-weight: 800;
  font-size: var(--speaker-font-size, 14px);
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}

.bubble-speaker-sub {
  color: #ffffff;
  font-weight: 400;
  margin-left: 4px;
}

.bubble-body {
  position: relative;
  background: rgba(255, 255, 255, 0.95);
  border: 3px solid #000000;
  border-radius: 16px;
  padding: 14px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-sizing: border-box;
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.08), 0 3px 10px rgba(0, 0, 0, 0.4);
}

.bubble-body.has-speaker {
  padding-top: 22px;
}

.bubble-jp {
  color: #57606a;
  font-size: calc(var(--message-font-size, 21px) * 0.7);
  line-height: 1.4;
  font-weight: 500;
}

.bubble-dialogue {
  color: #0d1117;
  font-size: var(--message-font-size, 21px);
  font-weight: 800;
  line-height: 1.4;
}

.bubble-tail {
  position: absolute;
  bottom: -12px;
  left: 36px;
  width: 0;
  height: 0;
  border-left: 12px solid transparent;
  border-right: 4px solid transparent;
  border-top: 12px solid rgba(255, 255, 255, 0.95);
}
.bubble-tail::after {
  content: '';
  position: absolute;
  bottom: 0px;
  left: -12px;
  width: 0;
  height: 0;
  border-left: 12px solid transparent;
  border-right: 4px solid transparent;
  border-top: 12px solid #000000;
  z-index: -1;
  transform: translateY(3px);
}`,
  },
  {
    id: "custom",
    name: "Custom HTML/CSS Template",
    description: "Blank canvas template with essential wrapper structure ready for full customization",
    html: `<div class="custom-overlay-box">
  {{#if hasSpeaker}}
  <div class="custom-nameplate">
    {{#if speaker}}
    <span class="name">{{speaker}}</span>
    {{/if}}
    {{#if translatedSpeaker}}
    <span class="translated-name">({{translatedSpeaker}})</span>
    {{/if}}
  </div>
  {{/if}}

  {{#if message}}
  <div class="custom-raw-message">{{message}}</div>
  {{/if}}

  {{#if translatedMessage}}
  <div class="custom-translated-message">{{translatedMessage}}</div>
  {{/if}}
</div>`,
    css: `.custom-overlay-box {
  width: 100%;
  min-height: 100%;
  background: rgba(13, 16, 23, 0.92);
  border: 2px solid #4e73df;
  border-radius: 8px;
  padding: 12px 18px;
  box-shadow: inset 0 0 16px rgba(0, 0, 0, 0.6), 0 3px 10px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
}

.custom-nameplate {
  display: inline-flex;
  gap: 6px;
  color: #f6c23e;
  font-weight: 700;
  font-size: var(--speaker-font-size, 15px);
}

.custom-nameplate .translated-name {
  color: #ffffff;
  font-weight: 400;
}

.custom-raw-message {
  font-size: calc(var(--message-font-size, 20px) * 0.7);
  color: #8b949e;
}

.custom-translated-message {
  font-size: var(--message-font-size, 20px);
  font-weight: 600;
  color: #ffffff;
}`,
  },
];

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

  // 1. Resolve {{#if speaker}}...{{/if}}
  output = resolveConditionalBlock(output, "speaker", !!speakerVal.trim());

  // 2. Resolve {{#if translatedSpeaker}}...{{/if}}
  output = resolveConditionalBlock(output, "translatedSpeaker", !!transSpeakerVal.trim());

  // 3. Resolve {{#if message}}...{{/if}}
  output = resolveConditionalBlock(output, "message", !!messageVal.trim());

  // 4. Resolve {{#if translatedMessage}}...{{/if}}
  output = resolveConditionalBlock(output, "translatedMessage", !!transMessageVal.trim());

  // 5. Resolve {{#if hasSpeaker}}...{{/if}}
  output = resolveConditionalBlock(output, "hasSpeaker", !!(speakerVal.trim() || transSpeakerVal.trim()));

  // 6. Interpolate Dialogue Variables
  output = output
    .replace(/\{\{\s*speaker\s*\}\}/gi, escapeHtml(speakerVal))
    .replace(/\{\{\s*translatedSpeaker\s*\}\}/gi, escapeHtml(transSpeakerVal))
    .replace(/\{\{\s*message\s*\}\}/gi, escapeHtml(messageVal))
    .replace(/\{\{\s*translatedMessage\s*\}\}/gi, escapeHtml(transMessageVal));

  // 7. Interpolate Config Variables & Typography if available
  if (config) {
    const speakerSize = config.speakerFontSize || Math.max(12, (config.messageFontSize || config.fontSize) - 4);
    const messageSize = config.messageFontSize || config.fontSize;

    output = output
      .replace(/\{\{\s*fontSize\s*\}\}/gi, `${messageSize}px`)
      .replace(/\{\{\s*speakerFontSize\s*\}\}/gi, `${speakerSize}px`)
      .replace(/\{\{\s*messageFontSize\s*\}\}/gi, `${messageSize}px`)
      .replace(/\{\{\s*fontColor\s*\}\}/gi, config.fontColor)
      .replace(/\{\{\s*outlineColor\s*\}\}/gi, config.outlineColor)
      .replace(/\{\{\s*backgroundColor\s*\}\}/gi, config.backgroundColor)
      .replace(/\{\{\s*borderRadius\s*\}\}/gi, `${config.borderRadius}px`);
  }

  return sanitizeOverlayHtml(output);
}

/**
 * Strips potentially dangerous script tags, inline event handlers, and javascript: links
 */
export function sanitizeOverlayHtml(html: string): string {
  if (!html) return "";

  // 1. Remove <script> tags and contents
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // 2. Remove <iframe>, <object>, <embed>, <applet>, <form>, <link>, <meta>, <base>, <svg>, <math> tags
  clean = clean.replace(/<\/?(iframe|object|embed|applet|form|link|meta|base|svg|math)\b[^>]*>/gi, "");

  // 3. Remove inline event handlers like onclick=, onerror=, onload=, onmouseover=, etc.
  clean = clean.replace(/\son[a-z0-9_-]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "");

  // 4. Disallow javascript: and vbscript: pseudo protocols in attributes
  clean = clean.replace(/(href|src|action|data)\s*=\s*(?:'javascript:[^']*'|"javascript:[^"]*"|javascript:[^\s>]+)/gi, '$1="#"');
  clean = clean.replace(/(href|src|action|data)\s*=\s*(?:'vbscript:[^']*'|"vbscript:[^"]*"|vbscript:[^\s>]+)/gi, '$1="#"');

  return clean;
}

/**
 * Handles block conditional {{#if var}}content{{/if}}
 */
function resolveConditionalBlock(template: string, variableName: string, condition: boolean): string {
  const regex = new RegExp(`\\{\\{#if\\s+${variableName}\\}\\}([\\s\\S]*?)\\{\\{/if\\}\\}`, "gi");
  return template.replace(regex, (_, content) => {
    return condition ? content : "";
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function loadUserCustomPresets(): TemplatePreset[] {
  try {
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      const raw = localStorage.getItem("vn_app_settings");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.overlay?.userCustomPresets)) {
          return parsed.overlay.userCustomPresets;
        }
      }
    }
  } catch (e) {
    console.error("Failed to load custom user presets:", e);
  }
  return [];
}

export function saveUserCustomPresets(presets: TemplatePreset[]) {
  try {
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      const raw = localStorage.getItem("vn_app_settings");
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed.overlay) parsed.overlay = {};
      parsed.overlay.userCustomPresets = presets;
      localStorage.setItem("vn_app_settings", JSON.stringify(parsed));
    }
  } catch (e) {
    console.error("Failed to save custom user presets:", e);
  }
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
  const duration = speedMs || (animationMode === "blur" ? 350 : 250);
  return `
@keyframes vnTextFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes vnTextBlurReveal {
  from { opacity: 0; filter: blur(6px); }
  to { opacity: 1; filter: blur(0); }
}

.vn-anim-fade .vn-message-trans,
.vn-anim-fade .vn-message-jp,
.vn-anim-fade .vn-text-anim-target,
.vn-anim-fade [class*="message"],
.vn-anim-fade [class*="dialogue"],
.vn-anim-fade [class*="text"],
.vn-anim-fade [class*="content"] {
  animation: vnTextFadeIn ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.vn-anim-blur .vn-message-trans,
.vn-anim-blur .vn-message-jp,
.vn-anim-blur .vn-text-anim-target,
.vn-anim-blur [class*="message"],
.vn-anim-blur [class*="dialogue"],
.vn-anim-blur [class*="text"],
.vn-anim-blur [class*="content"] {
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
    .replace(/expression\s*\(.*?\)/gi, "")
    .replace(/behavior\s*:[^;}]*/gi, "")
    .replace(/url\s*\(\s*["']?\s*javascript:[^)]*?\)/gi, "none")
    .replace(/@import\s+[^;]+;/gi, "");
}

