const clipText = (value, max = 180) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

export const clip = clipText;
export const normalizeText = (value) => clipText(value, 500).toLocaleLowerCase();

const tagName = (element) => String(element?.tagName || "").toLowerCase();

const rootFor = (element) => {
  try {
    return element?.getRootNode?.() || document;
  } catch {
    return document;
  }
};

const byId = (element, id) => {
  if (!id) return null;
  const root = rootFor(element);
  try {
    if (typeof root.getElementById === "function") return root.getElementById(id);
    return root.querySelector?.(`[id=${JSON.stringify(id)}]`) || null;
  } catch {
    return document.getElementById(id);
  }
};

export const roleFor = (element) => String(element?.getAttribute?.("role") || "").trim().toLowerCase();

export const composedParent = (element) => {
  if (!element) return null;
  if (element.parentElement) return element.parentElement;
  const root = rootFor(element);
  return root?.host instanceof Element ? root.host : null;
};

export const closestComposed = (element, selector) => {
  let current = element;
  let guard = 0;
  while (current && guard < 40) {
    guard += 1;
    try {
      if (current.matches?.(selector)) return current;
    } catch {
      return null;
    }
    current = composedParent(current);
  }
  return null;
};

const labelledByText = (element) => {
  const ids = String(element?.getAttribute?.("aria-labelledby") || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!ids.length) return "";
  return clipText(ids.map((id) => byId(element, id)?.innerText || byId(element, id)?.textContent || "").join(" "));
};

const labelsFor = (element) => {
  try {
    if (element?.labels?.length) return Array.from(element.labels);
  } catch {}
  const id = String(element?.id || "");
  if (!id) return [];
  const root = rootFor(element);
  try {
    return Array.from(root.querySelectorAll?.("label") || []).filter((label) => label.htmlFor === id);
  } catch {
    return [];
  }
};

export const controlForLabel = (label) => {
  if (!label) return null;
  try {
    if (label.control) return label.control;
  } catch {}
  const htmlFor = String(label.htmlFor || label.getAttribute?.("for") || "").trim();
  if (htmlFor) return byId(label, htmlFor);
  try {
    return label.querySelector("input, textarea, select, [contenteditable='true']");
  } catch {
    return null;
  }
};

const classTokens = (element) => String(element?.className || "")
  .split(/\s+/)
  .map((token) => token.trim().toLowerCase())
  .filter(Boolean);

export const classControlKind = (element) => {
  const text = classTokens(element).join(" ");
  if (/(^|[\s_-])radio(?:[\s_-]|$)/.test(text)) return "radio";
  if (/(^|[\s_-])checkbox(?:[\s_-]|$)/.test(text)) return "checkbox";
  if (/(^|[\s_-])(switch|toggle)(?:[\s_-]|$)/.test(text)) return "switch";
  return "";
};

export const inputTypeFor = (element) => {
  if (tagName(element) !== "input") return "";
  return String(element.type || element.getAttribute?.("type") || "text").toLowerCase();
};

export const stateElementFor = (element) => {
  const tag = tagName(element);
  if (["input", "textarea", "select"].includes(tag) || element?.isContentEditable) return element;

  if (tag === "label") {
    const control = controlForLabel(element);
    if (control) return control;
  }

  const role = roleFor(element);
  const classKind = classControlKind(element);
  const canContainState = ["radio", "checkbox", "switch", "option", "tab"].includes(role) ||
    Boolean(classKind) ||
    element?.hasAttribute?.("aria-checked") ||
    element?.hasAttribute?.("aria-selected");
  if (!canContainState) return null;

  try {
    const controls = Array.from(element.querySelectorAll("input[type='radio'], input[type='checkbox']"));
    if (controls.length === 1) return controls[0];
  } catch {}
  return element;
};

export const kindFor = (element, stateElement = stateElementFor(element)) => {
  const stateTag = tagName(stateElement);
  const stateType = inputTypeFor(stateElement);
  if (stateTag === "input") {
    if (stateType === "radio") return "radio";
    if (stateType === "checkbox") return "checkbox";
    if (["button", "submit", "reset", "image"].includes(stateType)) return "button";
    if (stateType === "file") return "file";
    return "textbox";
  }
  if (stateTag === "textarea" || stateElement?.isContentEditable || stateElement?.getAttribute?.("contenteditable") === "true") return "textbox";
  if (stateTag === "select") return "select";

  const tag = tagName(element);
  const role = roleFor(element);
  if (role === "radio") return "radio";
  if (role === "checkbox") return "checkbox";
  if (role === "switch") return "switch";
  if (["textbox", "searchbox", "combobox", "spinbutton"].includes(role)) return "textbox";
  if (role === "button") return "button";
  if (role === "link") return "link";
  if (role === "option") return "option";
  if (role === "tab") return "tab";
  if (["menuitem", "menuitemcheckbox", "menuitemradio"].includes(role)) return "menuitem";
  if (tag === "a" && element?.hasAttribute?.("href")) return "link";
  if (tag === "button") return "button";
  if (tag === "select") return "select";
  if (tag === "textarea" || element?.isContentEditable || element?.getAttribute?.("contenteditable") === "true") return "textbox";

  const classKind = classControlKind(element);
  if (classKind) return classKind;
  if (element?.hasAttribute?.("aria-checked")) return "checkbox";
  if (element?.hasAttribute?.("aria-selected")) return "option";
  return "custom";
};

const stateNodesFor = (element, stateElement) => {
  const nodes = [];
  for (const node of [stateElement, element]) {
    if (node && !nodes.includes(node)) nodes.push(node);
  }
  try {
    for (const node of element?.querySelectorAll?.("input[type='radio'], input[type='checkbox']") || []) {
      if (!nodes.includes(node)) nodes.push(node);
    }
  } catch {}
  return nodes;
};

export const checkedStateFor = (element, stateElement, kind = kindFor(element, stateElement)) => {
  for (const node of stateNodesFor(element, stateElement)) {
    const inputType = inputTypeFor(node);
    if (inputType === "radio" || inputType === "checkbox") return Boolean(node.checked);

    const ariaChecked = node.getAttribute?.("aria-checked");
    if (ariaChecked === "true") return true;
    if (ariaChecked === "false") return false;
    const ariaSelected = node.getAttribute?.("aria-selected");
    if (ariaSelected === "true") return true;
    if (ariaSelected === "false") return false;

    if (["radio", "checkbox", "switch", "option", "tab"].includes(kind)) {
      const dataState = String(node.getAttribute?.("data-state") || "").toLowerCase();
      if (["checked", "selected", "on", "active"].includes(dataState)) return true;
      if (["unchecked", "unselected", "off", "inactive"].includes(dataState)) return false;

      const tokens = classTokens(node);
      if (tokens.some((token) => /(^|[-_])(unchecked|unselected|off|inactive|not-checked|not-selected)$/.test(token))) return false;
      if (tokens.some((token) => /(^|[-_])(checked|selected|active|on)$/.test(token))) return true;
    }
  }
  return null;
};

export const isSensitive = (element) =>
  inputTypeFor(element) === "password" ||
  /password|passwd|token|secret|api[-_]?key/i.test(
    `${element?.name || ""} ${element?.id || ""} ${element?.getAttribute?.("aria-label") || ""}`
  );

const textFromLabels = (element) => clipText(labelsFor(element)
  .map((label) => label.innerText || label.textContent || "")
  .join(" "));

const rawNameFor = (element) => {
  if (!element) return "";
  const direct = element.getAttribute?.("aria-label") || labelledByText(element);
  if (direct) return clipText(direct);
  const tag = tagName(element);
  if (["input", "textarea", "select"].includes(tag)) {
    const labels = textFromLabels(element);
    if (labels) return labels;
    const closestLabel = closestComposed(element, "label");
    if (closestLabel) {
      const labelText = clipText(closestLabel.innerText || closestLabel.textContent || "");
      if (labelText) return labelText;
    }
    const own = element.name || element.placeholder || element.title || "";
    if (own) return clipText(own);
  }
  if (tag === "img") return clipText(element.alt || element.title || "图片");
  return clipText(element.innerText || element.textContent || element.title || "");
};

export const accessibleNameFor = (element, fallbackElement) => rawNameFor(element) || rawNameFor(fallbackElement);

export const optionKeyFor = (element, text = "") => {
  const explicit = ["data-option-key", "data-option", "data-choice", "data-key"]
    .map((name) => String(element?.getAttribute?.(name) || "").trim())
    .find((value) => /^[A-Za-z]$/.test(value));
  if (explicit) return explicit.toUpperCase();

  const inputValue = String(element?.value || "").trim();
  if (/^[A-Za-z]$/.test(inputValue)) return inputValue.toUpperCase();

  const match = String(text || rawNameFor(element) || "").match(/^\s*[（(]?\s*([A-Za-z])\s*[)）.、:：\-]\s*/);
  return match ? match[1].toUpperCase() : "";
};

const questionContainerFor = (element) => closestComposed(
  element,
  "[data-question-id], [data-question], [data-questionid], fieldset, [role='radiogroup'], [role='group']"
);

export const questionContextFor = (element, stateElement) => {
  const container = questionContainerFor(element) || questionContainerFor(stateElement);
  if (!container) return { id: "", stem: "", type: "" };

  const id = ["data-question-id", "data-question", "data-questionid", "id"]
    .map((name) => String(container.getAttribute?.(name) || (name === "id" ? container.id : "")).trim())
    .find(Boolean) || "";
  let stem = String(container.getAttribute?.("data-question-stem") || "").trim();
  if (!stem) {
    try {
      const stemNode = container.querySelector("[data-question-stem], legend, h1, h2, h3, h4, h5, h6");
      stem = String(stemNode?.innerText || stemNode?.textContent || "").trim();
    } catch {}
  }
  if (!stem && roleFor(container) === "radiogroup") stem = labelledByText(container);

  let type = "";
  try {
    const controls = Array.from(container.querySelectorAll("input[type='radio'], input[type='checkbox'], [role='radio'], [role='checkbox'], [role='switch'], [class*='radio'], [class*='checkbox'], [class*='switch'], [class*='toggle']"));
    if (controls.some((node) => inputTypeFor(node) === "checkbox" || ["checkbox", "switch"].includes(roleFor(node)) || ["checkbox", "switch"].includes(classControlKind(node)))) type = "multiple";
    else if (controls.some((node) => inputTypeFor(node) === "radio" || roleFor(node) === "radio" || classControlKind(node) === "radio")) type = "single";
  } catch {}
  return { id: clipText(id, 160), stem: clipText(stem, 500), type };
};

export const groupFor = (element, stateElement) => {
  const inputName = String(stateElement?.name || "").trim();
  if (inputName) return clipText(inputName, 160);

  const group = closestComposed(element, "[role='radiogroup'], [role='group'], fieldset");
  if (!group) return "";
  const groupName = group.getAttribute?.("aria-label") || labelledByText(group);
  if (groupName) return clipText(groupName, 160);
  if (tagName(group) === "fieldset") {
    const legend = group.querySelector?.("legend");
    if (legend) return clipText(legend.innerText || legend.textContent || "", 160);
  }
  return clipText(group.innerText || group.textContent || "", 160);
};

export const hasClickHint = (element, { includeCursor = true } = {}) => {
  if (!element) return false;
  if (element.hasAttribute?.("onclick") || element.hasAttribute?.("onpointerdown") || element.hasAttribute?.("data-action")) return true;
  if (Number(element.tabIndex) >= 0) return true;
  const role = roleFor(element);
  if (["button", "link", "checkbox", "radio", "switch", "option", "tab", "menuitem", "menuitemcheckbox", "menuitemradio"].includes(role)) return true;
  if (!includeCursor) return false;
  try {
    return window.getComputedStyle(element).cursor === "pointer";
  } catch {
    return false;
  }
};
