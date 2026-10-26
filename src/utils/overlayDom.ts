import DOMPurify from "dompurify";

/** Reconcile presentation markup without replacing the frame, background, or
 * unchanged elements. Text gets its own transparent animation span.
 */
export function updateOverlayDom(root: HTMLElement, html: string): HTMLElement[] {
  const document = root.ownerDocument;
  const next = document.createElement("div");
  next.innerHTML = DOMPurify.sanitize(`<div>${html}</div>`, {
    ALLOWED_TAGS: ["style", "div", "span", "p", "br", "b", "strong", "i", "em", "small", "ruby", "rt", "rp", "section", "article", "header", "footer", "h1", "h2", "h3", "ul", "ol", "li", "hr"],
    ALLOWED_ATTR: ["class", "id", "style", "title", "lang", "dir"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
  const walker = document.createTreeWalker(next, 4);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    if (text.textContent?.trim() && !text.parentElement?.closest("style")) textNodes.push(text);
  }
  for (const text of textNodes) {
    const span = document.createElement("span");
    span.className = "vn-template-text";
    span.setAttribute("data-vn-text", "");
    text.replaceWith(span);
    span.append(text);
  }
  const changed: HTMLElement[] = [];
  const record = (node: Node) => {
    if (node.nodeType !== 1) return;
    const element = node as HTMLElement;
    if (element.hasAttribute("data-vn-text")) changed.push(element);
    changed.push(...element.querySelectorAll<HTMLElement>("[data-vn-text]"));
  };
  const reconcile = (current: Node, incoming: Node) => {
    const wanted = Array.from(incoming.childNodes);
    for (let index = 0; index < wanted.length; index++) {
      const source = wanted[index];
      const existing = current.childNodes[index];
      if (!existing || existing.nodeType !== source.nodeType || existing.nodeName !== source.nodeName) {
        const clone = source.cloneNode(true);
        if (existing) current.replaceChild(clone, existing); else current.appendChild(clone);
        record(clone);
      } else if (source.nodeType === 3) {
        if (existing.textContent !== source.textContent) {
          existing.textContent = source.textContent;
          const parent = existing.parentElement;
          if (parent?.hasAttribute("data-vn-text")) changed.push(parent);
        }
      } else if (source.nodeType === 1) {
        const target = existing as Element;
        const element = source as Element;
        for (const attribute of Array.from(target.attributes)) {
          if (!element.hasAttribute(attribute.name)) target.removeAttribute(attribute.name);
        }
        for (const attribute of Array.from(element.attributes)) {
          if (target.getAttribute(attribute.name) !== attribute.value) target.setAttribute(attribute.name, attribute.value);
        }
        reconcile(existing, source);
      }
    }
    while (current.childNodes.length > wanted.length) current.removeChild(current.lastChild!);
  };
  reconcile(root, next);
  return [...new Set(changed)];
}
