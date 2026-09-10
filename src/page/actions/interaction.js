import { inputTypeFor, isSensitive } from "../perception/semantic.js";
import { canReceivePointer, isDisabled, isVisible } from "../perception/visibility.js";
import { observeAfterAction, snapshotTargetState } from "../verification/stateSnapshot.js";
import { verifyActivation, verifySelect, verifyValue } from "../verification/verifyAction.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const actionTarget = (target) => target?.clickElement || target?.element || target?.stateElement;
const stateTarget = (target) => target?.stateElement || actionTarget(target);

const invalidTarget = (target, action) => {
  const clickElement = actionTarget(target);
  if (!clickElement?.isConnected) return { error: "目标已经从页面中移除，请重新读取页面状态。", action };
  if (!isVisible(clickElement)) return { error: "目标当前不可见，请先滚动或重新读取页面状态。", action };
  if (isDisabled(clickElement) || isDisabled(stateTarget(target))) return { error: "目标已禁用，无法操作。", action };
  return null;
};

const revealAndFocus = (element) => {
  try {
    element.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "auto" });
    element.focus?.({ preventScroll: true });
  } catch {}
};

const pointerInitFor = (element) => {
  const rect = element.getBoundingClientRect?.();
  return {
    bubbles: true,
    composed: true,
    cancelable: true,
    view: window,
    clientX: rect ? rect.left + rect.width / 2 : 0,
    clientY: rect ? rect.top + rect.height / 2 : 0,
    button: 0,
    buttons: 1
  };
};

const dispatchPointerPrelude = (element) => {
  const init = pointerInitFor(element);
  try {
    if (typeof PointerEvent === "function") {
      element.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      element.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0 }));
    }
    element.dispatchEvent(new MouseEvent("mousedown", init));
    element.dispatchEvent(new MouseEvent("mouseup", { ...init, buttons: 0 }));
  } catch {}
};

const activate = (element) => {
  if (!element?.isConnected) return false;
  try {
    revealAndFocus(element);
    dispatchPointerPrelude(element);
    element.click();
    return true;
  } catch {
    return false;
  }
};

const canNavigate = (target) => {
  const clickElement = actionTarget(target);
  const stateElement = stateTarget(target);
  const tag = String(clickElement?.tagName || "").toLowerCase();
  if (target?.href || (tag === "a" && clickElement?.hasAttribute?.("href"))) return true;
  const inputType = inputTypeFor(stateElement);
  if (["submit", "image"].includes(inputType)) return true;
  if (tag === "button") {
    const type = String(clickElement.getAttribute?.("type") || "submit").toLowerCase();
    return type === "submit" && Boolean(clickElement.closest?.("form"));
  }
  return false;
};

const queuedNavigationResult = (target, action) => {
  const clickElement = actionTarget(target);
  setTimeout(() => activate(clickElement), 80);
  return {
    ok: true,
    action,
    status: "queued_navigation",
    queued: true,
    verified: false,
    note: "该目标可能会跳转或提交表单，已先确认调度点击；新页面加载后请重新读取页面状态。"
  };
};

const combineObservation = (first, second) => ({
  after: second.after,
  changes: Array.from(new Set([...(first.changes || []), ...(second.changes || [])])),
  mutated: Boolean(first.mutated || second.mutated)
});

export const clickTarget = async (target, { check = false } = {}) => {
  const action = check ? "check" : "click";
  const invalid = invalidTarget(target, action);
  if (invalid) return invalid;

  const before = snapshotTargetState(target);
  if (check && before.checked === true) {
    return {
      action,
      ...verifyActivation({
        action,
        target,
        before,
        observation: { after: before, changes: [], mutated: false },
        expectedChecked: true
      })
    };
  }

  if (!check && canNavigate(target)) return queuedNavigationResult(target, action);
  const primary = actionTarget(target);
  if (!activate(primary)) return { action, error: "无法向目标派发点击事件。" };

  let observation = await observeAfterAction(target, before, { timeout: 520 });
  const afterPrimary = observation.after;
  const checkable = ["radio", "checkbox", "switch"].includes(target.kind);
  const needsFallback = (check || checkable) &&
    target.stateElement &&
    target.stateElement !== primary &&
    afterPrimary.checked !== true &&
    (check || before.checked === afterPrimary.checked);
  if (needsFallback && activate(target.stateElement)) {
    const followUp = await observeAfterAction(target, before, { timeout: 360 });
    observation = combineObservation(observation, followUp);
  }

  return {
    action,
    ...verifyActivation({ action, target, before, observation, expectedChecked: check ? true : undefined })
  };
};

const setNativeValue = (element, value) => {
  const tag = String(element?.tagName || "").toLowerCase();
  if (tag === "input") {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    return;
  }
  if (tag === "textarea") {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    return;
  }
  element.textContent = value;
};

const dispatchInputEvents = (element, inputType, data) => {
  try {
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType,
      data
    }));
  } catch {
    element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  }
  element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
};

export const typeIntoTarget = async (target, { text = "", clear = true } = {}) => {
  const action = "type";
  const invalid = invalidTarget(target, action);
  if (invalid) return invalid;
  const element = stateTarget(target);
  const tag = String(element?.tagName || "").toLowerCase();
  const editable = ["input", "textarea"].includes(tag) || element?.isContentEditable || element?.getAttribute?.("contenteditable") === "true";
  if (!editable) return { action, error: "目标不是可输入的文本框。" };
  const inputType = inputTypeFor(element);
  if (["file", "checkbox", "radio", "button", "submit", "reset", "image"].includes(inputType)) {
    return { action, error: `不支持向 ${inputType} 输入文字。` };
  }
  const inputText = String(text ?? "");
  if (inputText.length > 20_000) return { action, error: "输入内容过长（最多 20000 个字符）。" };

  const before = snapshotTargetState(target);
  const nextValue = clear === false ? `${before.value}${inputText}` : inputText;
  try {
    revealAndFocus(element);
    setNativeValue(element, nextValue);
    dispatchInputEvents(element, clear === false ? "insertText" : "insertReplacementText", inputText);
  } catch (error) {
    return { action, error: `输入失败: ${String(error?.message || error)}` };
  }
  const observation = await observeAfterAction(target, before, { timeout: 420 });
  return {
    action,
    ...verifyValue({ action, before, observation, expectedValue: nextValue, sensitive: isSensitive(element) })
  };
};

export const selectOptionInTarget = async (target, { value, label } = {}) => {
  const action = "select_option";
  const invalid = invalidTarget(target, action);
  if (invalid) return invalid;
  const element = stateTarget(target);
  if (!(element instanceof HTMLSelectElement)) return { action, error: "目标不是原生 select。" };

  const wantedValue = value == null ? null : String(value);
  const wantedLabel = label == null ? null : String(label);
  const option = Array.from(element.options).find((item) =>
    (wantedValue != null && item.value === wantedValue) ||
    (wantedLabel != null && (item.label === wantedLabel || item.textContent?.trim() === wantedLabel))
  );
  if (!option) {
    return {
      action,
      error: "没有找到匹配选项。",
      options: Array.from(element.options).slice(0, 50).map((item) => ({ value: item.value, label: String(item.label || item.textContent || "").trim().slice(0, 120) }))
    };
  }

  const before = snapshotTargetState(target);
  try {
    revealAndFocus(element);
    element.value = option.value;
    element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  } catch (error) {
    return { action, error: `选择失败: ${String(error?.message || error)}` };
  }
  const observation = await observeAfterAction(target, before, { timeout: 420 });
  return {
    action,
    ...verifySelect({ observation, expectedValue: option.value, expectedLabel: option.label || option.textContent?.trim() || "" })
  };
};

export const pressKeyOnTarget = async (target, { key } = {}) => {
  const action = "press_key";
  const element = stateTarget(target) || document.activeElement || document.body;
  const keyName = String(key || "").trim();
  if (!keyName || keyName.length > 40) return { action, error: "key 必填且长度不能超过 40。" };
  const before = snapshotTargetState({ ...target, stateElement: element, clickElement: element });
  try {
    revealAndFocus(element);
    const init = { key: keyName, bubbles: true, composed: true, cancelable: true };
    const down = element.dispatchEvent(new KeyboardEvent("keydown", init));
    element.dispatchEvent(new KeyboardEvent("keypress", init));
    const up = element.dispatchEvent(new KeyboardEvent("keyup", init));
    const observation = await observeAfterAction({ ...target, stateElement: element, clickElement: element }, before, { timeout: 420 });
    const verified = observation.changes.length > 0;
    return {
      ok: verified,
      action,
      status: verified ? "verified" : "dispatched_unverified",
      verified,
      actionExecuted: true,
      key: keyName,
      defaultNotPrevented: down && up,
      evidence: {
        before: { checked: before.checked, value: before.sensitive ? "[已隐藏]" : before.value.slice(0, 120) },
        after: { checked: observation.after.checked, value: observation.after.sensitive ? "[已隐藏]" : observation.after.value.slice(0, 120) },
        changed: observation.changes,
        mutated: observation.mutated
      },
      ...(verified ? {} : { error: "按键事件已派发，但未检测到可验证变化。请重新读取页面状态确认。" })
    };
  } catch (error) {
    return { action, error: `按键失败: ${String(error?.message || error)}` };
  }
};

export const scrollTarget = async ({ target, direction = "down", amount = 600 } = {}) => {
  const action = "scroll";
  const dir = String(direction || "down").toLowerCase();
  if (!["up", "down", "left", "right", "top", "bottom"].includes(dir)) {
    return { action, error: "direction 只能是 up、down、left、right、top 或 bottom。" };
  }
  const distance = Math.min(10_000, Math.max(1, Math.abs(Number(amount) || 600)));
  const element = target ? actionTarget(target) : null;
  const scrollNode = element || window;
  const before = scrollNode === window
    ? { x: Math.round(window.scrollX), y: Math.round(window.scrollY) }
    : { x: Math.round(scrollNode.scrollLeft), y: Math.round(scrollNode.scrollTop) };
  try {
    if (dir === "top") scrollNode.scrollTo({ top: 0, behavior: "auto" });
    else if (dir === "bottom") scrollNode.scrollTo({ top: scrollNode === window ? document.documentElement.scrollHeight : scrollNode.scrollHeight, behavior: "auto" });
    else {
      const sign = dir === "up" || dir === "left" ? -1 : 1;
      scrollNode.scrollBy({
        left: dir === "left" || dir === "right" ? sign * distance : 0,
        top: dir === "up" || dir === "down" ? sign * distance : 0,
        behavior: "auto"
      });
    }
    await delay(80);
    const after = scrollNode === window
      ? { x: Math.round(window.scrollX), y: Math.round(window.scrollY) }
      : { x: Math.round(scrollNode.scrollLeft), y: Math.round(scrollNode.scrollTop) };
    const moved = before.x !== after.x || before.y !== after.y;
    return moved
      ? { ok: true, action, status: "verified", verified: true, direction: dir, amount: distance, before, after }
      : { ok: false, action, status: "unverified", verified: false, direction: dir, amount: distance, before, after, error: "滚动位置没有变化，可能已经到达边界或目标不是可滚动容器。" };
  } catch (error) {
    return { action, error: `滚动失败: ${String(error?.message || error)}` };
  }
};
