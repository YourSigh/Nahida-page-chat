const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='button']",
  "[role='link']",
  "[role='checkbox']",
  "[role='switch']",
  "[onclick]"
].join(",");

const MAX_TARGETS = 60;
const MAX_TEXT = 6_000;

const clip = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

const isVisible = (element) => {
  if (!element?.isConnected) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 1 || rect.height <= 1) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && style.pointerEvents !== "none";
};

const isInViewport = (element) => {
  const rect = element.getBoundingClientRect();
  return rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
};

const isDisabled = (element) =>
  Boolean(element?.disabled) || element?.getAttribute?.("aria-disabled") === "true";

const labelledByText = (element) => {
  const ids = String(element.getAttribute?.("aria-labelledby") || "").trim().split(/\s+/).filter(Boolean);
  if (!ids.length) return "";
  return clip(ids.map((id) => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || "").join(" "), 180);
};

const nameFor = (element) => {
  const tag = element.tagName?.toLowerCase() || "";
  const label = element.getAttribute?.("aria-label") || labelledByText(element);
  if (label) return clip(label, 180);
  if (tag === "input" || tag === "textarea" || tag === "select") {
    const id = element.id;
    const htmlLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    const formLabel = element.closest?.("label");
    const labelText = htmlLabel?.innerText || formLabel?.innerText || "";
    if (labelText) return clip(labelText, 180);
    const own = element.name || element.placeholder || element.title || "";
    if (own) return clip(own, 180);
  }
  if (tag === "img") return clip(element.alt || element.title || "图片", 180);
  return clip(element.innerText || element.textContent || element.title || "", 180);
};

const kindFor = (element) => {
  const tag = element.tagName?.toLowerCase() || "element";
  const role = element.getAttribute?.("role") || "";
  if (tag === "input") return `input:${element.type || "text"}`;
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  if (tag === "a" || role === "link") return "link";
  if (tag === "button" || role === "button") return "button";
  if (element.isContentEditable) return "contenteditable";
  return role || tag;
};

const isSensitive = (element) =>
  (element instanceof HTMLInputElement && element.type === "password") ||
  /password|passwd|token|secret|api[-_]?key/i.test(
    `${element.name || ""} ${element.id || ""} ${element.getAttribute?.("aria-label") || ""}`
  );

const targetSnapshot = (id, element) => {
  const rect = element.getBoundingClientRect();
  const tag = element.tagName?.toLowerCase() || "";
  const record = {
    id,
    kind: kindFor(element),
    name: nameFor(element),
    text: clip(element.innerText || element.textContent || "", 180),
    disabled: isDisabled(element),
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    },
    inViewport: isInViewport(element)
  };

  if (tag === "a") record.href = String(element.href || "").slice(0, 500);
  if (tag === "input" || tag === "textarea") {
    record.inputType = element.type || tag;
    record.placeholder = clip(element.placeholder || "", 120);
    if (!isSensitive(element) && ["checkbox", "radio"].includes(element.type)) record.checked = Boolean(element.checked);
  }
  if (tag === "select") {
    record.options = Array.from(element.options || []).slice(0, 50).map((option) => ({
      value: option.value,
      label: clip(option.label || option.textContent || "", 120),
      selected: option.selected
    }));
  }
  return record;
};

const pageText = (maxChars) => {
  const root = document.querySelector("main, article, [role='main']") || document.body;
  return clip(root?.innerText || "", maxChars);
};

export function createPageController({ extensionHost } = {}) {
  /** @type {Map<string, { element: Element, snapshotVersion: number }>} */
  const targets = new Map();
  let snapshotVersion = 0;

  const isExtensionElement = (element) => element === extensionHost || extensionHost?.contains?.(element);

  const resolveTarget = (targetId) => {
    const id = String(targetId || "");
    const entry = targets.get(id);
    if (!entry) {
      return { error: "目标已失效或从未被识别，请先重新读取页面状态。" };
    }
    if (!entry.element.isConnected || isExtensionElement(entry.element)) {
      targets.delete(id);
      return { error: "目标已经变化，请先重新读取页面状态。" };
    }
    return { element: entry.element, id };
  };

  const getPageState = ({ maxElements = 35, maxText = 3_000 } = {}) => {
    snapshotVersion += 1;
    targets.clear();
    const limit = Math.min(MAX_TARGETS, Math.max(10, Number(maxElements) || 35));
    const candidates = [];
    const seen = new Set();
    for (const element of document.querySelectorAll(INTERACTIVE_SELECTOR)) {
      if (seen.has(element) || isExtensionElement(element) || !isVisible(element)) continue;
      seen.add(element);
      candidates.push(element);
      if (candidates.length >= 600) break;
    }
    const elements = candidates
      .sort((left, right) => Number(isInViewport(right)) - Number(isInViewport(left)))
      .slice(0, limit);

    const targetList = elements.map((element, index) => {
      const id = `p${snapshotVersion}-${index + 1}`;
      targets.set(id, { element, snapshotVersion });
      return targetSnapshot(id, element);
    });

    return {
      ok: true,
      snapshotVersion,
      title: String(document.title || ""),
      url: String(location.href || ""),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: {
        x: Math.round(window.scrollX),
        y: Math.round(window.scrollY),
        maxY: Math.max(0, Math.round(document.documentElement.scrollHeight - window.innerHeight))
      },
      text: pageText(Math.min(MAX_TEXT, Math.max(500, Number(maxText) || 3_000))),
      targets: targetList,
      note: "target ID 只在当前页面状态有效。页面更新、跳转或重新读取状态后，请使用新的 ID。"
    };
  };

  const describeTarget = (targetId) => {
    const resolved = resolveTarget(targetId);
    if (resolved.error) return { targetId: String(targetId || ""), label: "目标已失效", error: resolved.error };
    const snapshot = targetSnapshot(resolved.id, resolved.element);
    return {
      targetId: resolved.id,
      label: snapshot.name || snapshot.text || snapshot.kind,
      kind: snapshot.kind,
      disabled: snapshot.disabled,
      href: snapshot.href || ""
    };
  };

  const click = ({ targetId } = {}) => {
    const resolved = resolveTarget(targetId);
    if (resolved.error) return resolved;
    const { element, id } = resolved;
    if (!isVisible(element)) return { error: "目标当前不可见，请先重新读取页面状态。" };
    if (isDisabled(element)) return { error: "目标已禁用，无法点击。", target: describeTarget(id) };

    const target = describeTarget(id);
    // Return the tool result before a possible navigation destroys the content-script port.
    // The small delay also lets the background start the next tool turn cleanly.
    setTimeout(() => {
      if (!element.isConnected) return;
      try {
        element.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "auto" });
        element.focus?.({ preventScroll: true });
        element.click();
      } catch {
        // A DOM action can fail after navigation or a framework re-render. The next state read will surface it.
      }
    }, 80);

    return {
      ok: true,
      action: "click",
      queued: true,
      target,
      note: "点击已安排执行。若它会导航到新页面，对话将在新页面重新建立。"
    };
  };

  const type = ({ targetId, text = "", clear = true } = {}) => {
    const resolved = resolveTarget(targetId);
    if (resolved.error) return resolved;
    const { element, id } = resolved;
    if (!isVisible(element) || isDisabled(element)) return { error: "目标不可输入。", target: describeTarget(id) };
    const inputText = String(text ?? "");
    if (inputText.length > 20_000) return { error: "输入内容过长（最多 20000 个字符）。" };

    const input = element instanceof HTMLInputElement;
    const textarea = element instanceof HTMLTextAreaElement;
    const editable = input || textarea || element.isContentEditable || element.getAttribute("contenteditable") === "true";
    if (!editable) return { error: "目标不是可输入的 input、textarea 或 contenteditable。", target: describeTarget(id) };
    if (input && ["file", "checkbox", "radio", "button", "submit", "reset", "image"].includes(element.type)) {
      return { error: `不支持向 ${element.type} 输入文字。`, target: describeTarget(id) };
    }

    const oldValue = input || textarea ? element.value : String(element.textContent || "");
    const nextValue = clear === false ? `${oldValue}${inputText}` : inputText;
    try {
      element.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "auto" });
      element.focus?.({ preventScroll: true });
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (setter) setter.call(element, nextValue);
        else element.value = nextValue;
      } else if (textarea) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        if (setter) setter.call(element, nextValue);
        else element.value = nextValue;
      } else {
        element.textContent = nextValue;
      }
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: clear === false ? "insertText" : "insertReplacementText",
        data: inputText
      }));
      element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return {
        ok: true,
        action: "type",
        target: describeTarget(id),
        value: isSensitive(element) ? "[已隐藏]" : clip(nextValue, 300),
        note: "已更新元素值并派发 input/change 事件。"
      };
    } catch (error) {
      return { error: `输入失败: ${String(error?.message || error)}`, target: describeTarget(id) };
    }
  };

  const selectOption = ({ targetId, value, label } = {}) => {
    const resolved = resolveTarget(targetId);
    if (resolved.error) return resolved;
    const { element, id } = resolved;
    if (!(element instanceof HTMLSelectElement)) return { error: "目标不是原生 select。", target: describeTarget(id) };
    if (isDisabled(element)) return { error: "目标已禁用。", target: describeTarget(id) };
    const wantedValue = value == null ? null : String(value);
    const wantedLabel = label == null ? null : String(label);
    const option = Array.from(element.options).find((item) =>
      (wantedValue != null && item.value === wantedValue) ||
      (wantedLabel != null && (item.label === wantedLabel || item.textContent?.trim() === wantedLabel))
    );
    if (!option) {
      return {
        error: "没有找到匹配选项。",
        target: describeTarget(id),
        options: Array.from(element.options).slice(0, 50).map((item) => ({ value: item.value, label: clip(item.label || item.textContent || "", 120) }))
      };
    }
    try {
      element.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "auto" });
      element.focus?.({ preventScroll: true });
      element.value = option.value;
      element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return { ok: true, action: "select_option", target: describeTarget(id), selected: { value: option.value, label: option.label } };
    } catch (error) {
      return { error: `选择失败: ${String(error?.message || error)}`, target: describeTarget(id) };
    }
  };

  const pressKey = ({ targetId, key } = {}) => {
    const resolved = targetId ? resolveTarget(targetId) : { element: document.activeElement || document.body, id: "active" };
    if (resolved.error) return resolved;
    const keyName = String(key || "").trim();
    if (!keyName || keyName.length > 40) return { error: "key 必填且长度不能超过 40。" };
    try {
      resolved.element.focus?.({ preventScroll: true });
      const init = { key: keyName, bubbles: true, composed: true, cancelable: true };
      const down = resolved.element.dispatchEvent(new KeyboardEvent("keydown", init));
      resolved.element.dispatchEvent(new KeyboardEvent("keypress", init));
      const up = resolved.element.dispatchEvent(new KeyboardEvent("keyup", init));
      return {
        ok: true,
        action: "press_key",
        key: keyName,
        target: targetId ? describeTarget(resolved.id) : { label: "当前焦点" },
        defaultNotPrevented: down && up,
        note: "这是 DOM 键盘事件；要求真实键盘手势的网站可能不会响应。"
      };
    } catch (error) {
      return { error: `按键失败: ${String(error?.message || error)}` };
    }
  };

  const scroll = ({ direction = "down", amount = 600, targetId } = {}) => {
    let target = window;
    let label = "页面";
    if (targetId) {
      const resolved = resolveTarget(targetId);
      if (resolved.error) return resolved;
      target = resolved.element;
      label = describeTarget(resolved.id).label || "目标容器";
    }
    const dir = String(direction || "down").toLowerCase();
    if (!["up", "down", "left", "right", "top", "bottom"].includes(dir)) {
      return { error: "direction 只能是 up、down、left、right、top 或 bottom。" };
    }
    const distance = Math.min(10_000, Math.max(1, Math.abs(Number(amount) || 600)));
    const before = target === window ? { x: Math.round(window.scrollX), y: Math.round(window.scrollY) } : { x: Math.round(target.scrollLeft), y: Math.round(target.scrollTop) };
    try {
      if (dir === "top") target.scrollTo({ top: 0, behavior: "smooth" });
      else if (dir === "bottom") target.scrollTo({ top: target === window ? document.documentElement.scrollHeight : target.scrollHeight, behavior: "smooth" });
      else {
        const sign = dir === "up" || dir === "left" ? -1 : 1;
        const left = dir === "left" || dir === "right" ? sign * distance : 0;
        const top = dir === "up" || dir === "down" ? sign * distance : 0;
        target.scrollBy({ left, top, behavior: "smooth" });
      }
      return { ok: true, action: "scroll", direction: dir, amount: distance, target: label, before };
    } catch (error) {
      return { error: `滚动失败: ${String(error?.message || error)}` };
    }
  };

  const wait = async ({ ms = 700 } = {}) => {
    const duration = Math.min(5_000, Math.max(50, Number(ms) || 700));
    await new Promise((resolve) => setTimeout(resolve, duration));
    return { ok: true, action: "wait", ms: duration, url: String(location.href || "") };
  };

  return {
    getPageState,
    describeTarget,
    click,
    type,
    selectOption,
    pressKey,
    scroll,
    wait
  };
}
