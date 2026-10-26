// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
vi.mock("../../../services/settingsManager", () => ({ settingsManager: { getOverlay: () => ({}), updateOverlay: vi.fn() } }));
import { compileOverlayTemplate, sanitizeOverlayHtml, sanitizeCustomCss } from "../../../utils/overlayTemplateEngine";
import { clampRegion, drawRegion } from "../regionGeometry";

describe("overlay template boundaries", () => {
  it("removes encoded script URLs, event attributes and embedded documents", () => {
    const sanitized = sanitizeOverlayHtml('<a href="java&#x73;cript:alert(1)">link</a><img src=x onerror=alert(1)><svg onload=alert(1)></svg><iframe srcdoc="bad"></iframe><div onclick=alert(1)>Safe</div>');
    const parsed = new DOMParser().parseFromString(sanitized, "text/html");
    expect(parsed.querySelector("a,img,svg,iframe,script")).toBeNull();
    expect(parsed.querySelector("[onclick],[onerror],[onload]")).toBeNull();
    expect(parsed.body.textContent).toContain("Safe");
  });

  it("escapes dialogue interpolated into quoted attributes", () => {
    const html = compileOverlayTemplate('<div title="{{message}}">{{message}}</div>', { message: '\" style=\"display:none\" data-x=\"<script>bad</script>' });
    const parsed = new DOMParser().parseFromString(html, "text/html");
    expect(parsed.querySelector("div")?.hasAttribute("style")).toBe(false);
    expect(parsed.querySelector("script")).toBeNull();
    expect(parsed.querySelector("div")?.textContent).toContain("<script>bad</script>");
  });

  it("handles nested conditionals regardless of variable order", () => {
    const template = '{{#if message}}before{{#if hasSpeaker}}speaker{{#if speaker}} {{speaker}}{{/if}}{{/if}} after{{/if}}';
    expect(compileOverlayTemplate(template, { message: "text" })).toBe("before after");
    expect(compileOverlayTemplate(template, { message: "text", speaker: "Alice" })).toBe("beforespeaker Alice after");
    expect(compileOverlayTemplate(template, { speaker: "Alice" })).toBe("");
  });

  it("does not let CSS close a containing style element", () => {
    expect(sanitizeCustomCss('</style><script>alert(1)</script>')).not.toContain("<");
  });
});

describe("OCR region geometry", () => {
  it("draws a region when dragging up and left", () => {
    expect(drawRegion(200, 180, 50, 60)).toEqual({ x: 50, y: 60, width: 150, height: 120 });
  });
  it("keeps moved and oversized regions inside smaller monitors", () => {
    expect(clampRegion({ x: 350, y: 750, width: 1220, height: 250 }, 800, 600)).toEqual({ x: 0, y: 350, width: 800, height: 250 });
    expect(clampRegion({ x: -20, y: 900, width: 100, height: 100 }, 800, 600)).toEqual({ x: 0, y: 500, width: 100, height: 100 });
  });
});
