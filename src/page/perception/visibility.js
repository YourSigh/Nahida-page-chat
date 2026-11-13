import { composedParent } from "./semantic.js";

export const rectFor = (element) => {
  const rect = element?.getBoundingClientRect?.();
  return rect || { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 };
};

const hasVisibleBox = (element) => {
  const rect = rectFor(element);
  return rect.width > 1 && rect.height > 1;
};

const effectiveStyleAllowsVisibility = (element) => {
  try {
    const style = window.getComputedStyle(element);
    const opacity = Number(style.opacity || "1");
    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.visibility !== "collapse" &&
      style.contentVisibility !== "hidden" &&
      opacity > 0.01;
  } catch {
    return true;
  }
};

export const isVisible = (element) => {
  if (!element?.isConnected || !hasVisibleBox(element)) return false;
  let current = element;
  let guard = 0;
  while (current && guard < 40) {
    guard += 1;
    if (!effectiveStyleAllowsVisibility(current)) return false;
    current = composedParent(current);
  }
  return true;
};

export const canReceivePointer = (element) => {
  if (!isVisible(element)) return false;
  let current = element;
  let guard = 0;
  while (current && guard < 40) {
    guard += 1;
    try {
      if (window.getComputedStyle(current).pointerEvents === "none") return false;
    } catch {}
    current = composedParent(current);
  }
  return true;
};

export const isInViewport = (element) => {
  const rect = rectFor(element);
  return rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
};

export const isDisabled = (element) =>
  Boolean(element?.disabled) || element?.getAttribute?.("aria-disabled") === "true";

export const isExtensionElement = (element, extensionHost) =>
  element === extensionHost || Boolean(extensionHost?.contains?.(element));

const composedContains = (ancestor, element) => {
  if (!ancestor || !element) return false;
  if (ancestor === element || ancestor.contains?.(element)) return true;
  let current = element;
  let guard = 0;
  while (current && guard < 40) {
    guard += 1;
    if (current === ancestor) return true;
    current = composedParent(current);
  }
  return false;
};

// Resolve the foremost page hit, descending open shadow roots. The extension's
// own chat is not a page blocker; no real page overlay is filtered out.
const topPageHit = (root, x, y, extensionHost, seen = new Set()) => {
  const hits = typeof root.elementsFromPoint === "function"
    ? root.elementsFromPoint(x, y)
    : [root.elementFromPoint?.(x, y)].filter(Boolean);
  const hit = hits.find((node) => !isExtensionElement(node, extensionHost) && !seen.has(node));
  if (!hit) return null;
  seen.add(hit);
  if (hit.shadowRoot?.mode === "open") {
    return topPageHit(hit.shadowRoot, x, y, extensionHost, seen) || hit;
  }
  return hit;
};

export const pointerBlockReason = (element, { extensionHost } = {}) => {
  if (!canReceivePointer(element)) return "目标当前无法接收点击。";
  let modalElements = [];
  try {
    modalElements = [...document.querySelectorAll(":modal, [role='dialog'][aria-modal='true'], [role='alertdialog'][aria-modal='true']")];
  } catch {
    try { modalElements = [...document.querySelectorAll("[role='dialog'][aria-modal='true'], [role='alertdialog'][aria-modal='true']")]; } catch {}
  }
  const modal = modalElements.find((node) => !isExtensionElement(node, extensionHost) && isVisible(node) && !composedContains(node, element));
  if (modal) return "页面有模态对话框，目标位于对话框外；请先处理对话框。";
  // Older DOM adapters without hit testing cannot establish occlusion.
  if (typeof document.elementsFromPoint !== "function") return "";
  const rect = rectFor(element);
  const left = Math.max(0, rect.left), right = Math.min(window.innerWidth, rect.right);
  const top = Math.max(0, rect.top), bottom = Math.min(window.innerHeight, rect.bottom);
  if (right <= left || bottom <= top) return "目标不在可点击视口内，请重新读取页面状态。";
  try {
    const hit = topPageHit(document, (left + right) / 2, (top + bottom) / 2, extensionHost);
    return hit && composedContains(element, hit) ? "" : "目标被页面中的其他元素遮挡，请先处理遮挡并重新读取页面状态。";
  } catch {
    return "无法确认目标是否被遮挡，请重新读取页面状态。";
  }
};

export const isHitTestable = (element, options) =>
  typeof document.elementsFromPoint === "function" && !pointerBlockReason(element, options);

export const isScrollable = (element) => {
  const tag = String(element?.tagName || "").toLowerCase();
  if (!element?.isConnected || tag === "html" || tag === "body") return false;
  if (!["div", "section", "main", "article", "aside", "nav", "ul", "ol", "pre", "table", "td", "th", "dialog"].includes(tag)) return false;
  try {
    const overflowsY = element.scrollHeight > element.clientHeight + 8;
    const overflowsX = element.scrollWidth > element.clientWidth + 8;
    if (!overflowsX && !overflowsY) return false;
    const style = window.getComputedStyle(element);
    const scrollableY = ["auto", "scroll", "overlay"].includes(style.overflowY) && overflowsY;
    const scrollableX = ["auto", "scroll", "overlay"].includes(style.overflowX) && overflowsX;
    return scrollableX || scrollableY;
  } catch {
    return false;
  }
};
