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
  background: rgba(13, 16, 23, 0.88);
  border: 2px solid #30363d;
  border-radius: 8px;
  padding: 14px 18px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
}

.vn-nameplate {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(227, 179, 65, 0.15);
  border: 1px solid rgba(227, 179, 65, 0.4);
  padding: 2px 10px;
  border-radius: 4px;
  align-self: flex-start;
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

  <div class="persona-frame">
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
  display: flex;
  flex-direction: column;
  padding-top: 14px;
  box-sizing: border-box;
}

.persona-nameplate {
  position: absolute;
  top: 0px;
  left: 24px;
  z-index: 10;
  background: #ff1053;
  transform: skewX(-14deg);
  padding: 4px 18px;
  box-shadow: -4px 4px 0px #000000;
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
  background: rgba(12, 14, 18, 0.94);
  clip-path: polygon(0 0, calc(100% - 30px) 0, 100% 30px, 100% 100%, 26px 100%, 0 calc(100% - 26px));
  border-left: 6px solid #ff1053;
  border-right: 3px solid #ff1053;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.85);
  position: relative;
  padding: 16px 24px;
  box-sizing: border-box;
}

.persona-stripe {
  position: absolute;
  top: 0;
  right: 40px;
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
    id: "gothic_fantasy",
    name: "Genshin / Fantasy Ornate Filigree Frame",
    description: "Curved asymmetrical corners with golden jewel accents, glowing filigrees, and celestial elegance",
    html: `<div class="gothic-frame">
  <div class="gothic-corner gothic-tl">✦</div>
  <div class="gothic-corner gothic-tr">✦</div>
  <div class="gothic-corner gothic-bl">✦</div>
  <div class="gothic-corner gothic-br">✦</div>

  {{#if hasSpeaker}}
  <div class="gothic-gem-header">
    <span class="gothic-gem">◆</span>
    {{#if speaker}}
    <span class="gothic-speaker">{{speaker}}</span>
    {{/if}}
    {{#if translatedSpeaker}}
    <span class="gothic-speaker-en">· {{translatedSpeaker}}</span>
    {{/if}}
    <span class="gothic-gem">◆</span>
  </div>
  {{/if}}

  {{#if message}}
  <div class="gothic-jp">{{message}}</div>
  {{/if}}

  {{#if translatedMessage}}
  <div class="gothic-trans">{{translatedMessage}}</div>
  {{/if}}
</div>`,
    css: `.gothic-frame {
  position: relative;
  width: 100%;
  min-height: 100%;
  background: linear-gradient(135deg, rgba(20, 16, 32, 0.95) 0%, rgba(10, 8, 18, 0.97) 100%);
  border: 2px solid #d4af37;
  border-radius: 28px 0px 28px 0px;
  padding: 16px 24px;
  box-shadow: 0 0 15px rgba(212, 175, 55, 0.25), inset 0 0 20px rgba(212, 175, 55, 0.08), 0 10px 30px rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
}

.gothic-corner {
  position: absolute;
  color: #f5d77f;
  font-size: 14px;
  text-shadow: 0 0 8px #f5d77f;
}
.gothic-tl { top: 4px; left: 8px; }
.gothic-tr { top: 4px; right: 8px; }
.gothic-bl { bottom: 4px; left: 8px; }
.gothic-br { bottom: 4px; right: 8px; }

.gothic-gem-header {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(212, 175, 55, 0.15);
  border: 1px solid rgba(212, 175, 55, 0.5);
  padding: 2px 14px;
  border-radius: 16px;
  align-self: flex-start;
}

.gothic-gem {
  color: #38ef7d;
  font-size: 11px;
  text-shadow: 0 0 8px #38ef7d;
}

.gothic-speaker {
  color: #fce38a;
  font-weight: 700;
  font-size: var(--speaker-font-size, 15px);
  font-family: serif;
}

.gothic-speaker-en {
  color: #ffffff;
  font-size: calc(var(--speaker-font-size, 15px) * 0.92);
  font-family: serif;
}

.gothic-jp {
  font-size: calc(var(--message-font-size, 21px) * 0.7);
  color: #b3a4c8;
  line-height: 1.4;
}

.gothic-trans {
  font-size: var(--message-font-size, 21px);
  font-weight: 600;
  color: #ffffff;
  line-height: 1.4;
  font-family: serif;
  text-shadow: 1px 1px 3px rgba(0,0,0,0.8);
}`,
  },
  {
    id: "glassmorphism",
    name: "Modern Frosted Glass (Glassmorphism)",
    description: "Sleek translucent glass design with backdrop-filter blur, cyan neon glow, and floating pill badge",
    html: `<div class="glass-container">
  {{#if hasSpeaker}}
  <div class="glass-badge">
    <div class="glass-glow-dot"></div>
    {{#if speaker}}
    <span class="glass-name">{{speaker}}</span>
    {{/if}}
    {{#if translatedSpeaker}}
    <span class="glass-trans-name">({{translatedSpeaker}})</span>
    {{/if}}
  </div>
  {{/if}}

  {{#if message}}
  <div class="glass-jp">{{message}}</div>
  {{/if}}

  {{#if translatedMessage}}
  <div class="glass-text">{{translatedMessage}}</div>
  {{/if}}
</div>`,
    css: `.glass-container {
  width: 100%;
  min-height: 100%;
  background: rgba(18, 24, 38, 0.65);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(78, 115, 223, 0.35);
  border-radius: 14px;
  padding: 16px 20px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
}

.glass-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(78, 115, 223, 0.2);
  border: 1px solid rgba(78, 115, 223, 0.5);
  padding: 3px 12px;
  border-radius: 20px;
  align-self: flex-start;
}

.glass-glow-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #36b9cc;
  box-shadow: 0 0 8px #36b9cc;
}

.glass-name {
  color: #36b9cc;
  font-weight: 700;
  font-size: var(--speaker-font-size, 15px);
}

.glass-trans-name {
  color: #e6edf3;
  font-size: calc(var(--speaker-font-size, 15px) * 0.9);
}

.glass-jp {
  font-size: calc(var(--message-font-size, 21px) * 0.7);
  color: #a0aec0;
  line-height: 1.4;
}

.glass-text {
  font-size: var(--message-font-size, 21px);
  font-weight: 600;
  color: #ffffff;
  line-height: 1.4;
  letter-spacing: 0.3px;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.9);
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

  <div class="bubble-body">
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
  display: flex;
  flex-direction: column;
  padding-top: 10px;
  box-sizing: border-box;
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
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.7);
}

.bubble-speaker-sub {
  color: #ffffff;
  font-weight: 400;
  margin-left: 4px;
}

.bubble-body {
  position: relative;
  background: rgba(255, 255, 255, 0.94);
  border: 3px solid #000000;
  border-radius: 20px;
  padding: 18px 22px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8), 4px 4px 0px #000000;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-sizing: border-box;
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
  bottom: -16px;
  left: 40px;
  width: 0;
  height: 0;
  border-left: 14px solid transparent;
  border-right: 4px solid transparent;
  border-top: 16px solid rgba(255, 255, 255, 0.94);
}`,
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk HUD / Sci-Fi",
    description: "Futuristic angular tech frame with neon yellow nameplate and high-contrast glowing accents",
    html: `<div class="cyber-hud">
  <div class="cyber-corner cyber-corner-tl"></div>
  <div class="cyber-corner cyber-corner-tr"></div>
  
  {{#if hasSpeaker}}
  <div class="cyber-header">
    {{#if speaker}}
    <div class="cyber-tag">ID // {{speaker}}</div>
    {{/if}}
    {{#if translatedSpeaker}}
    <div class="cyber-subtag">[{{translatedSpeaker}}]</div>
    {{/if}}
  </div>
  {{/if}}

  {{#if message}}
  <div class="cyber-raw">{{message}}</div>
  {{/if}}

  {{#if translatedMessage}}
  <div class="cyber-translated">{{translatedMessage}}</div>
  {{/if}}
</div>`,
    css: `.cyber-hud {
  position: relative;
  width: 100%;
  min-height: 100%;
  background: rgba(10, 12, 16, 0.92);
  border: 2px solid #00f0ff;
  clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px));
  padding: 14px 20px;
  box-shadow: 0 0 20px rgba(0, 240, 255, 0.25), inset 0 0 15px rgba(0, 240, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-sizing: border-box;
}

.cyber-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cyber-tag {
  background: #fcee0a;
  color: #000000;
  font-family: monospace;
  font-size: var(--speaker-font-size, 14px);
  font-weight: 800;
  padding: 2px 10px;
  letter-spacing: 1px;
}

.cyber-subtag {
  color: #00f0ff;
  font-family: monospace;
  font-size: calc(var(--speaker-font-size, 14px) * 0.9);
  font-weight: 600;
}

.cyber-raw {
  color: #7982a9;
  font-size: calc(var(--message-font-size, 20px) * 0.7);
  font-family: sans-serif;
  line-height: 1.35;
}

.cyber-translated {
  color: #ffffff;
  font-size: var(--message-font-size, 20px);
  font-weight: 700;
  line-height: 1.4;
  text-shadow: 0 0 6px rgba(0, 240, 255, 0.6);
}`,
  },
  {
    id: "cinematic",
    name: "Minimalist Cinematic Subtitles",
    description: "Frameless floating subtitles with elegant outline and a subtle floating speaker pill",
    html: `<div class="cine-container">
  {{#if hasSpeaker}}
  <div class="cine-speaker">
    {{#if speaker}}
    <span>{{speaker}}</span>
    {{/if}}
    {{#if translatedSpeaker}}
    <span class="cine-speaker-en">({{translatedSpeaker}})</span>
    {{/if}}
  </div>
  {{/if}}

  {{#if message}}
  <div class="cine-source">{{message}}</div>
  {{/if}}

  {{#if translatedMessage}}
  <div class="cine-text">{{translatedMessage}}</div>
  {{/if}}
</div>`,
    css: `.cine-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 8px 16px;
  gap: 6px;
  box-sizing: border-box;
}

.cine-speaker {
  background: rgba(0, 0, 0, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #ffd700;
  font-size: var(--speaker-font-size, 14px);
  font-weight: 700;
  padding: 2px 14px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.8);
}

.cine-speaker-en {
  color: #ffffff;
  font-weight: 500;
  margin-left: 4px;
}

.cine-source {
  color: rgba(220, 220, 220, 0.85);
  font-size: calc(var(--message-font-size, 22px) * 0.7);
  line-height: 1.4;
  text-shadow: 1px 1px 3px #000000, -1px -1px 3px #000000, 1px -1px 3px #000000, -1px 1px 3px #000000;
}

.cine-text {
  color: #ffffff;
  font-size: var(--message-font-size, 22px);
  font-weight: 700;
  line-height: 1.45;
  text-shadow: 2px 2px 4px #000000, -2px -2px 4px #000000, 2px -2px 4px #000000, -2px 2px 4px #000000, 0 4px 12px rgba(0,0,0,0.9);
}`,
  },
  {
    id: "rpg",
    name: "Fantasy RPG / Novel Box",
    description: "Classic scroll style with parchment tones, ornate golden border, and ribbon nameplate",
    html: `<div class="rpg-box">
  {{#if hasSpeaker}}
  <div class="rpg-ribbon">
    {{#if speaker}}
    <span class="rpg-speaker-text">{{speaker}}</span>
    {{/if}}
    {{#if translatedSpeaker}}
    <span class="rpg-speaker-sub">◆ {{translatedSpeaker}}</span>
    {{/if}}
  </div>
  {{/if}}

  {{#if message}}
  <div class="rpg-orig">{{message}}</div>
  {{/if}}

  {{#if translatedMessage}}
  <div class="rpg-dialogue">{{translatedMessage}}</div>
  {{/if}}
</div>`,
    css: `.rpg-box {
  width: 100%;
  min-height: 100%;
  background: linear-gradient(180deg, rgba(26, 20, 16, 0.94) 0%, rgba(15, 12, 10, 0.96) 100%);
  border: 2px solid #c59b27;
  border-radius: 6px;
  box-shadow: 0 0 0 2px #3a2b16, 0 10px 30px rgba(0, 0, 0, 0.85);
  padding: 16px 22px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
}

.rpg-ribbon {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #2b1f14;
  border: 1px solid #c59b27;
  padding: 3px 12px;
  border-radius: 4px;
  align-self: flex-start;
  box-shadow: 0 2px 6px rgba(0,0,0,0.5);
}

.rpg-speaker-text {
  color: #f7d070;
  font-weight: 700;
  font-size: var(--speaker-font-size, 15px);
  font-family: serif;
}

.rpg-speaker-sub {
  color: #d1b894;
  font-size: calc(var(--speaker-font-size, 15px) * 0.9);
  font-family: serif;
}

.rpg-orig {
  color: #a8947b;
  font-size: calc(var(--message-font-size, 20px) * 0.7);
  line-height: 1.4;
  font-style: italic;
}

.rpg-dialogue {
  color: #fbeef0;
  font-size: var(--message-font-size, 20px);
  font-weight: 600;
  line-height: 1.45;
  font-family: serif;
  text-shadow: 1px 1px 2px #000;
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
  background: rgba(13, 16, 23, 0.9);
  border: 2px solid #4e73df;
  border-radius: 10px;
  padding: 14px 18px;
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

  // Apply display field visibility toggles if config is present
  const allowSpeaker = config ? config.showSpeaker !== false : true;
  const allowTransSpeaker = config ? config.showTranslatedSpeaker !== false : true;
  const allowMessage = config ? config.showMessage !== false : true;
  const allowTransMessage = config ? config.showTranslatedMessage !== false : true;

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
    const speakerSize = config.speakerFontSize || Math.max(12, config.fontSize - 4);
    const messageSize = config.messageFontSize || config.fontSize;

    output = output
      .replace(/\{\{\s*fontSize\s*\}\}/gi, `${config.fontSize}px`)
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

  // 2. Remove <iframe>, <object>, <embed>, <applet>, <form>, <link>, <meta> tags
  clean = clean.replace(/<\/?(iframe|object|embed|applet|form|link|meta|base)\b[^>]*>/gi, "");

  // 3. Remove inline event handlers like onclick=, onerror=, onload=, etc.
  clean = clean.replace(/\son[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "");

  // 4. Disallow javascript: pseudo protocols in href/src
  clean = clean.replace(/(href|src)\s*=\s*(?:'javascript:[^']*'|"javascript:[^"]*"|javascript:[^\s>]+)/gi, '$1="#"');

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

const USER_PRESETS_STORAGE_KEY = "vn_overlay_user_presets_v1";

export function loadUserCustomPresets(): TemplatePreset[] {
  try {
    const raw = localStorage.getItem(USER_PRESETS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn("Failed to load custom user presets:", e);
  }
  return [];
}

export function saveUserCustomPresets(presets: TemplatePreset[]) {
  try {
    localStorage.setItem(USER_PRESETS_STORAGE_KEY, JSON.stringify(presets));
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

