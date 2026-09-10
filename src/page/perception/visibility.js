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

export const isHitTestable = (element) => {
  if (!canReceivePointer(element) || typeof document.elementsFromPoint !== "function") return false;
  const rect = rectFor(element);
  const x = Math.max(1, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
  const y = Math.max(1, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
  try {
    return document.elementsFromPoint(x, y).some((hit) => composedContains(element, hit));
  } catch {
    return false;
  }
};
