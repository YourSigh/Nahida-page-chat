import {
  accessibleNameFor,
  checkedStateFor,
  classControlKind,
  clip,
  composedParent,
  controlForLabel,
  groupFor,
  hasClickHint,
  inputTypeFor,
  kindFor,
  roleFor,
  stateElementFor
} from "./semantic.js";
import {
  canReceivePointer,
  isDisabled,
  isExtensionElement,
  isHitTestable,
  isInViewport,
  isVisible,
  rectFor,
  isScrollable
} from "./visibility.js";

const MAX_SCAN_NODES = 12_000;
const MAX_DISCOVERED_TARGETS = 12_000;

const ACTIONABLE_ROLES = new Set([
  "button", "link", "checkbox", "radio", "switch", "textbox", "searchbox", "combobox", "spinbutton",
  "option", "tab", "menuitem", "menuitemcheckbox", "menuitemradio"
]);

const isNativeInteractive = (element) => {
  const tag = String(element?.tagName || "").toLowerCase();
  if (["button", "textarea", "select"].includes(tag)) return true;
  if (tag === "a") return element.hasAttribute?.("href");
  if (tag === "input") return inputTypeFor(element) !== "hidden";
  return element?.isContentEditable || element?.getAttribute?.("contenteditable") === "true";
};

const walkOpenShadowDom = (root, output, seen) => {
  if (!root || output.length >= MAX_SCAN_NODES) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let element;
  while ((element = walker.nextNode())) {
    if (seen.has(element)) continue;
    seen.add(element);
    output.push(element);
    if (output.length >= MAX_SCAN_NODES) break;
    if (element.shadowRoot?.mode === "open") walkOpenShadowDom(element.shadowRoot, output, seen);
    if (output.length >= MAX_SCAN_NODES) break;
  }
};

const allElements = () => {
  const output = [];
  walkOpenShadowDom(document, output, new Set());
  return output;
};

const visibleLabelFor = (control) => {
  try {
    const labels = Array.from(control?.labels || []);
    return labels.find((label) => canReceivePointer(label)) || null;
  } catch {
    return null;
  }
};

const visibleProxyFor = (stateElement, sourceElement) => {
  if (sourceElement && canReceivePointer(sourceElement)) return sourceElement;
  const label = visibleLabelFor(stateElement);
  if (label) return label;

  let current = stateElement;
  let guard = 0;
  while (current && guard < 7) {
    guard += 1;
    if (canReceivePointer(current)) {
      const tag = String(current.tagName || "").toLowerCase();
      if (tag === "label" || classControlKind(current) || ACTIONABLE_ROLES.has(roleFor(current)) || hasClickHint(current)) {
        return current;
      }
    }
    current = composedParent(current);
  }

  try {
    const siblings = Array.from(stateElement?.parentElement?.children || []);
    const sibling = siblings.find((node) => node !== stateElement && canReceivePointer(node) && hasClickHint(node));
    if (sibling) return sibling;
  } catch {}
  return null;
};

const candidateConfidence = ({ element, stateElement, kind, clickElement }) => {
  const role = roleFor(element);
  const tag = String(element.tagName || "").toLowerCase();
  if (["input", "textarea", "select", "button"].includes(tag) || (tag === "a" && element.hasAttribute?.("href"))) return 0.99;
  if (tag === "label" && stateElement && ["radio", "checkbox", "textbox", "select"].includes(kind)) return 0.96;
  if (ACTIONABLE_ROLES.has(role)) return 0.94;
  if (element.hasAttribute?.("aria-checked") || element.hasAttribute?.("aria-selected")) return 0.91;
  if (classControlKind(element)) return stateElement && stateElement !== element ? 0.89 : 0.82;
  if (kind === "scroll-container") return 0.76;
  if (clickElement !== element && stateElement) return 0.86;
  if (hasClickHint(element)) return 0.63;
  return 0.5;
};

const isCandidateLike = ({ element, stateElement, kind, probeCursor = false, scrollable = false }) => {
  const tag = String(element.tagName || "").toLowerCase();
  const role = roleFor(element);
  if (isNativeInteractive(element)) return true;
  if (tag === "label" && stateElement) return true;
  if (ACTIONABLE_ROLES.has(role)) return true;
  if (element.hasAttribute?.("aria-checked") || element.hasAttribute?.("aria-selected")) return true;
  if (classControlKind(element)) return true;
  if (["radio", "checkbox", "switch"].includes(kind) && stateElement) return true;
  if (scrollable) return true;
  return kind === "custom" && hasClickHint(element, { includeCursor: probeCursor }) && Boolean(clip(element.innerText || element.textContent || "", 180));
};

const isCursorProbeCandidate = (element) => {
  const tag = String(element?.tagName || "").toLowerCase();
  if (!["div", "span", "li", "td", "summary"].includes(tag)) return false;
  if (element.hasAttribute?.("onclick") || element.hasAttribute?.("data-action") || element.hasAttribute?.("tabindex")) return true;
  const text = String(element.textContent || "").replace(/\s+/g, " ").trim();
  return text.length > 0 && text.length <= 180 && element.children.length <= 4;
};

const isCompositeControlContainer = (element) => {
  if (!classControlKind(element) || ACTIONABLE_ROLES.has(roleFor(element))) return false;
  try {
    const controls = element.querySelectorAll("input[type='radio'], input[type='checkbox'], [role='radio'], [role='checkbox'], [role='switch']");
    return controls.length > 1;
  } catch {
    return false;
  }
};

const candidateFor = (element, extensionHost, { probeCursor = false } = {}) => {
  if (!element?.isConnected || isExtensionElement(element, extensionHost)) return null;
  if (isCompositeControlContainer(element)) return null;

  const stateElement = stateElementFor(element);
  const kind = kindFor(element, stateElement);
  const scrollable = isScrollable(element);
  if (!isCandidateLike({ element, stateElement, kind, probeCursor, scrollable })) return null;

  let clickElement = element;
  const tag = String(element.tagName || "").toLowerCase();
  if (tag === "label") {
    const labelledControl = controlForLabel(element);
    if (labelledControl) clickElement = element;
  } else if (stateElement && !canReceivePointer(stateElement)) {
    clickElement = visibleProxyFor(stateElement, element) || element;
  }

  if (!canReceivePointer(clickElement) || isExtensionElement(clickElement, extensionHost)) return null;
  const rect = rectFor(clickElement);
  const name = accessibleNameFor(clickElement, stateElement);
  const text = clip(clickElement.innerText || clickElement.textContent || stateElement?.innerText || stateElement?.textContent || "", 220);
  if (!name && !text && kind === "custom") return null;

  const stateKind = kindFor(clickElement, stateElement);
  const effectiveKind = kind === "custom" && stateKind === "custom" && scrollable ? "scroll-container" : (kind === "custom" ? stateKind : kind);
  const checked = checkedStateFor(clickElement, stateElement, effectiveKind);
  return {
    element: clickElement,
    clickElement,
    stateElement: stateElement || clickElement,
    sourceElement: element,
    kind: effectiveKind,
    role: roleFor(clickElement) || roleFor(element),
    name,
    text,
    group: groupFor(clickElement, stateElement),
    checked,
    disabled: isDisabled(clickElement) || isDisabled(stateElement),
    inputType: inputTypeFor(stateElement),
    placeholder: clip(stateElement?.placeholder || "", 120),
    href: String(clickElement.href || clickElement.getAttribute?.("href") || "").slice(0, 500),
    rect,
    inViewport: isInViewport(clickElement),
    hitTestable: isHitTestable(clickElement),
    confidence: candidateConfidence({ element, stateElement, kind: effectiveKind, clickElement })
  };
};

const candidateQuality = (candidate) =>
  candidate.confidence * 100 +
  (candidate.hitTestable ? 8 : 0) +
  (candidate.inViewport ? 4 : 0) +
  (candidate.kind !== "custom" ? 2 : 0);

export const collectSemanticTargets = ({ extensionHost, maxCandidates } = {}) => {
  const byLogicalControl = new Map();
  let cursorProbeBudget = 900;
  for (const element of allElements()) {
    const probeCursor = cursorProbeBudget > 0 && isCursorProbeCandidate(element);
    if (probeCursor) cursorProbeBudget -= 1;
    const candidate = candidateFor(element, extensionHost, { probeCursor });
    if (!candidate) continue;
    const logicalKey = candidate.stateElement || candidate.clickElement;
    const previous = byLogicalControl.get(logicalKey);
    if (!previous || candidateQuality(candidate) > candidateQuality(previous)) {
      byLogicalControl.set(logicalKey, candidate);
    }
  }
  const requestedLimit = Number(maxCandidates);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(MAX_DISCOVERED_TARGETS, Math.floor(requestedLimit)))
    : MAX_DISCOVERED_TARGETS;
  return Array.from(byLogicalControl.values()).slice(0, limit);
};
