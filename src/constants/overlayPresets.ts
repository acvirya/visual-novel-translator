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

