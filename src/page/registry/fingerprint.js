import { normalizeText } from "../perception/semantic.js";

const semanticClassSignature = (element) => String(element?.className || "")
  .split(/\s+/)
  .map((token) => token.trim().toLowerCase())
  .filter((token) => /radio|checkbox|switch|toggle|button|select|option|tab|input|field|form/.test(token))
  .slice(0, 4)
  .join(".");

const pathSignatureFor = (element) => {
  const parts = [];
  let current = element;
  let guard = 0;
  while (current && guard < 5) {
    guard += 1;
    const tag = String(current.tagName || "").toLowerCase();
    if (!tag) break;
    const role = String(current.getAttribute?.("role") || "").toLowerCase();
    const id = String(current.id || "").trim();
    const name = String(current.getAttribute?.("name") || "").trim();
    const classSignature = semanticClassSignature(current);
    parts.unshift(`${tag}${role ? `[${role}]` : ""}${id ? `#${id}` : ""}${name ? `@${name}` : ""}${classSignature ? `.${classSignature}` : ""}`);
    current = current.parentElement || current.getRootNode?.()?.host || null;
  }
  return parts.join(">");
};

const stableIdFor = (candidate) => {
  const node = candidate.stateElement || candidate.clickElement || candidate.element;
  const id = String(node?.id || "").trim();
  if (id) return `id:${id}`;
  const testId = String(node?.getAttribute?.("data-testid") || node?.getAttribute?.("data-test") || "").trim();
  if (testId) return `test:${testId}`;
  return "";
};

export const fingerprintFor = (candidate) => ({
  kind: String(candidate?.kind || "custom"),
  role: String(candidate?.role || ""),
  name: normalizeText(candidate?.name),
  text: normalizeText(candidate?.text),
  group: normalizeText(candidate?.group),
  inputType: String(candidate?.inputType || ""),
  inputName: String(candidate?.stateElement?.name || ""),
  stableId: stableIdFor(candidate),
  path: pathSignatureFor(candidate?.clickElement || candidate?.element),
  rect: {
    x: Math.round(Number(candidate?.rect?.x || candidate?.rect?.left || 0)),
    y: Math.round(Number(candidate?.rect?.y || candidate?.rect?.top || 0))
  }
});

const sameText = (left, right) => Boolean(left && right && left === right);

const partialText = (left, right) => Boolean(left && right && (left.includes(right) || right.includes(left)));

const kindFamily = (kind) => {
  if (["radio", "checkbox", "switch"].includes(kind)) return "checkable";
  if (["textbox", "select"].includes(kind)) return "input";
  if (["button", "link", "menuitem", "option", "tab"].includes(kind)) return "activate";
  return kind || "custom";
};

export const fingerprintScore = (before, after) => {
  if (!before || !after) return 0;
  let score = 0;
  if (before.stableId && before.stableId === after.stableId) score += 150;
  if (before.kind === after.kind) score += 34;
  else if (kindFamily(before.kind) === kindFamily(after.kind)) score += 12;
  if (sameText(before.name, after.name)) score += 72;
  else if (partialText(before.name, after.name)) score += 22;
  if (sameText(before.text, after.text)) score += 34;
  else if (partialText(before.text, after.text)) score += 10;
  if (sameText(before.group, after.group)) score += 28;
  if (before.inputType && before.inputType === after.inputType) score += 12;
  if (before.inputName && before.inputName === after.inputName) score += 30;
  if (before.role && before.role === after.role) score += 10;
  if (before.path && before.path === after.path) score += 24;
  else if (before.path && after.path && before.path.split(">").slice(-2).join(">").includes(after.path.split(">").slice(-1)[0])) score += 6;
  const distance = Math.hypot(before.rect.x - after.rect.x, before.rect.y - after.rect.y);
  if (distance < 28) score += 14;
  else if (distance < 180) score += 5;
  return score;
};

export const canRebindFingerprint = (before, after, score = fingerprintScore(before, after)) => {
  if (!before || !after) return false;
  if (before.stableId && before.stableId === after.stableId) return score >= 165;
  if (before.kind !== after.kind && kindFamily(before.kind) !== kindFamily(after.kind)) return false;

  const sameName = sameText(before.name, after.name);
  const sameGroup = sameText(before.group, after.group);
  const sameInputName = Boolean(before.inputName && before.inputName === after.inputName);
  const samePath = Boolean(before.path && before.path === after.path);
  const nearby = Math.hypot(before.rect.x - after.rect.x, before.rect.y - after.rect.y) < 180;
  const isCheckable = kindFamily(before.kind) === "checkable";

  if (isCheckable) return score >= 130 && sameName && (sameGroup || sameInputName || samePath);
  return score >= 145 && sameName && (samePath || sameGroup || nearby);
};
