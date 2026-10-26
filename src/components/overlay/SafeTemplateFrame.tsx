import { useLayoutEffect, useRef } from "react";
import { updateOverlayDom } from "../../utils/overlayDom";

const FRAME_DOCUMENT = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;min-height:100%;background:transparent;color:#fff;font-family:'Segoe UI',sans-serif;overflow-wrap:anywhere}*{box-sizing:border-box}#vn-template-root{min-height:100vh}::-webkit-scrollbar{width:0;height:0}.vn-template-text{background:transparent!important;border:0!important;box-shadow:none!important}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}</style></head><body><div id="vn-template-root"></div></body></html>`;

/** The host can update DOM; frame scripts, navigation, forms, and networking
 * remain disabled. Never add allow-scripts alongside allow-same-origin.
 */
export function SafeTemplateFrame({ html, height = "100%", interactive = false, animation = "none", animationKey = 0, durationMs = 250 }: {
  html: string;
  height?: string | number;
  interactive?: boolean;
  animation?: string;
  animationKey?: number;
  durationMs?: number;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const previousKey = useRef<number | null>(null);
  const latest = useRef({ html, animation, animationKey, durationMs });
  latest.current = { html, animation, animationKey, durationMs };
  const renderContent = () => {
    const document = frame.current?.contentDocument;
    const root = document?.getElementById("vn-template-root");
    if (!root) return;
    const options = latest.current;
    const changed = updateOverlayDom(root, options.html);
    const targets = previousKey.current !== options.animationKey ? Array.from(root.querySelectorAll<HTMLElement>("[data-vn-text]")) : changed;
    previousKey.current = options.animationKey;
    const animate = ["fade", "blur"].includes(options.animation) && !document?.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const target of targets) {
      target.getAnimations?.().forEach((effect) => effect.cancel());
      if (!animate) continue;
      target.animate?.(options.animation === "blur" ? [{ opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)" }] : [{ opacity: 0 }, { opacity: 1 }], { duration: Math.max(0, Math.min(10000, options.durationMs)), easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    }
  };
  useLayoutEffect(renderContent, [html, animation, animationKey, durationMs]);
  return <iframe ref={frame} title="Translation overlay preview" sandbox="allow-same-origin" referrerPolicy="no-referrer" srcDoc={FRAME_DOCUMENT} onLoad={renderContent} tabIndex={-1}
    style={{ display: "block", width: "100%", height, border: 0, background: "transparent", pointerEvents: interactive ? "auto" : "none" }} />;
}
