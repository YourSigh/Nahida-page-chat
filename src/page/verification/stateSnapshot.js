import { checkedStateFor, clip, inputTypeFor, isSensitive } from "../perception/semantic.js";
import { isVisible } from "../perception/visibility.js";

const nodeFor = (target) => target?.stateElement || target?.clickElement || target?.element || null;

const rawValueFor = (node) => {
  const tag = String(node?.tagName || "").toLowerCase();
  if (["input", "textarea", "select"].includes(tag)) return String(node.value ?? "");
  if (node?.isContentEditable || node?.getAttribute?.("contenteditable") === "true") return String(node.textContent || "");
  return "";
};

const dialogCount = () => {
  try {
    return Array.from(document.querySelectorAll("dialog[open], [role='dialog'], [role='alertdialog']"))
      .filter((element) => isVisible(element) && element.getAttribute("aria-hidden") !== "true")
      .length;
  } catch {
    return 0;
  }
};

export const snapshotTargetState = (target) => {
  const node = nodeFor(target);
  const connected = Boolean(node?.isConnected);
  const value = connected ? rawValueFor(node) : "";
  const checked = connected ? checkedStateFor(target.clickElement || node, node, target.kind) : null;
  const active = document.activeElement;
  return {
    connected,
    checked,
    value,
    ariaChecked: connected ? node.getAttribute?.("aria-checked") || "" : "",
    ariaSelected: connected ? node.getAttribute?.("aria-selected") || "" : "",
    ariaPressed: connected ? node.getAttribute?.("aria-pressed") || "" : "",
    ariaExpanded: connected ? node.getAttribute?.("aria-expanded") || "" : "",
    dataState: connected ? node.getAttribute?.("data-state") || "" : "",
    selectedValue: connected && String(node.tagName || "").toLowerCase() === "select" ? String(node.value || "") : "",
    url: String(location.href || ""),
    dialogs: dialogCount(),
    focused: Boolean(active && (active === node || active === target.clickElement || target.clickElement?.contains?.(active))),
    sensitive: isSensitive(node),
    inputType: inputTypeFor(node)
  };
};

export const meaningfulChanges = (before, after) => {
  const changes = [];
  for (const key of ["checked", "value", "ariaChecked", "ariaSelected", "ariaPressed", "ariaExpanded", "dataState", "selectedValue", "url", "dialogs"]) {
    if (before?.[key] !== after?.[key]) changes.push(key);
  }
  return changes;
};

const publicState = (state) => ({
  connected: state.connected,
  checked: state.checked,
  value: state.sensitive ? "[已隐藏]" : clip(state.value, 160),
  ariaChecked: state.ariaChecked || undefined,
  ariaSelected: state.ariaSelected || undefined,
  ariaPressed: state.ariaPressed || undefined,
  ariaExpanded: state.ariaExpanded || undefined,
  dataState: state.dataState || undefined,
  selectedValue: state.selectedValue || undefined,
  dialogs: state.dialogs,
  url: state.url
});

export const evidenceFor = ({ before, after, changes, mutated }) => ({
  before: publicState(before),
  after: publicState(after),
  changed: changes,
  mutated: Boolean(mutated)
});

export const observeAfterAction = async (target, before, { timeout = 650 } = {}) => {
  const duration = Math.max(80, Math.min(2_000, Number(timeout) || 650));
  return await new Promise((resolve) => {
    let settled = false;
    let mutated = false;
    let observer = null;
    let rafId = 0;
    let timer = 0;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (observer) observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      if (timer) clearTimeout(timer);
      const after = snapshotTargetState(target);
      resolve({ after, changes: meaningfulChanges(before, after), mutated });
    };

    const check = () => {
      const after = snapshotTargetState(target);
      if (meaningfulChanges(before, after).length) finish();
    };

    try {
      observer = new MutationObserver(() => {
        mutated = true;
        check();
      });
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["aria-checked", "aria-selected", "aria-pressed", "aria-expanded", "data-state", "class", "value", "checked", "disabled", "open"]
      });
    } catch {}

    let frames = 0;
    const frameCheck = () => {
      if (settled) return;
      check();
      frames += 1;
      if (frames < 8) rafId = requestAnimationFrame(frameCheck);
    };
    rafId = requestAnimationFrame(frameCheck);
    timer = setTimeout(finish, duration);
  });
};
