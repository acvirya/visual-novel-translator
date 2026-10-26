// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { updateOverlayDom } from "../overlayDom";
import { getOverlayAnimationCss } from "../overlayTemplateEngine";

describe("stable overlay content", () => {
  it("updates text while preserving the backdrop and text elements", () => {
    const root = document.createElement("div");
    document.body.append(root);
    updateOverlayDom(root, '<div class="dialogue-box"><p>Hello</p></div>');
    const box = root.querySelector(".dialogue-box");
    const text = root.querySelector<HTMLElement>("[data-vn-text]");
    const changed = updateOverlayDom(root, '<div class="dialogue-box"><p>Hello world</p></div>');
    expect(root.querySelector(".dialogue-box")).toBe(box);
    expect(root.querySelector("[data-vn-text]")).toBe(text);
    expect(text?.textContent).toBe("Hello world");
    expect(changed).toEqual([text]);
    root.remove();
  });

  it("sanitizes frame updates and only wraps text, not stylesheet content", () => {
    const root = document.createElement("div");
    updateOverlayDom(root, '<style>.box{color:red}</style><div onclick="alert(1)">Text<img src=x onerror="alert(1)"><script>parent.bad=true</script></div>');
    expect(root.querySelector("script,img,[onclick],[onerror]")).toBeNull();
    expect(root.querySelector("style")?.textContent).toBe(".box{color:red}");
    expect(root.querySelectorAll("[data-vn-text]")).toHaveLength(1);
  });

  it("does not select message or content containers for animation", () => {
    const css = getOverlayAnimationCss("fade", 250);
    expect(css).not.toContain('[class*="content"]');
    expect(css).not.toContain('[class*="message"]');
    expect(css).toContain(".vn-anim-fade .vn-text-anim-target");
  });
});
