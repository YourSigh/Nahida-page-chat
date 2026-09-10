import { clickTarget, pressKeyOnTarget, scrollTarget, selectOptionInTarget, typeIntoTarget } from "./actions/interaction.js";
import { collectSemanticTargets } from "./perception/collectTargets.js";
import {
  accessibleNameFor,
  checkedStateFor,
  clip,
  groupFor,
  inputTypeFor,
  kindFor,
  roleFor
} from "./perception/semantic.js";
import { isDisabled, isInViewport, isVisible, rectFor } from "./perception/visibility.js";
import { rankTargets } from "./ranking/rankTargets.js";
import { TargetRegistry } from "./registry/targetRegistry.js";
import { snapshotTargetState } from "./verification/stateSnapshot.js";

const MAX_TARGETS_PER_PAGE = 60;
const MAX_TEXT = 6_000;

const pageText = (maxChars) => {
  const root = document.querySelector("main, article, [role='main']") || document.body;
  return clip(root?.innerText || root?.textContent || "", maxChars);
};

const clampNumber = (value, fallback, min, max) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
};

const normalizedRegion = (region) => ["viewport", "nearby", "above", "below", "all"].includes(String(region || ""))
  ? String(region)
  : "nearby";

const rectSnapshot = (element) => {
  const rect = rectFor(element);
  return {
    x: Math.round(rect.x ?? rect.left ?? 0),
    y: Math.round(rect.y ?? rect.top ?? 0),
    width: Math.round(rect.width || 0),
    height: Math.round(rect.height || 0)
  };
};

const targetSnapshot = (id, candidate) => {
  const clickElement = candidate.clickElement || candidate.element;
  const stateElement = candidate.stateElement || clickElement;
  const kind = kindFor(clickElement, stateElement) || candidate.kind || "custom";
  const checked = checkedStateFor(clickElement, stateElement, kind);
  const record = {
    id,
    kind,
    role: roleFor(clickElement) || candidate.role || undefined,
    name: accessibleNameFor(clickElement, stateElement) || candidate.name || "",
    text: clip(clickElement?.innerText || clickElement?.textContent || stateElement?.innerText || stateElement?.textContent || candidate.text || "", 220),
    group: groupFor(clickElement, stateElement) || candidate.group || undefined,
    disabled: isDisabled(clickElement) || isDisabled(stateElement),
    confidence: Math.round(Math.max(0, Math.min(1, Number(candidate.confidence || 0))) * 100),
    rect: rectSnapshot(clickElement),
    inViewport: isInViewport(clickElement),
    visible: isVisible(clickElement)
  };

  if (checked !== null) record.checked = checked;
  const href = String(clickElement?.href || clickElement?.getAttribute?.("href") || candidate.href || "");
  if (href) record.href = href.slice(0, 500);
  const inputType = inputTypeFor(stateElement);
  if (inputType) {
    record.inputType = inputType;
    record.placeholder = clip(stateElement?.placeholder || candidate.placeholder || "", 120);
  }
  if (String(stateElement?.tagName || "").toLowerCase() === "select") {
    record.options = Array.from(stateElement.options || []).slice(0, 50).map((option) => ({
      value: option.value,
      label: clip(option.label || option.textContent || "", 120),
      selected: option.selected
    }));
  }
  return record;
};

const fallbackActiveTarget = () => {
  const element = document.activeElement instanceof Element ? document.activeElement : document.body;
  return {
    element,
    clickElement: element,
    stateElement: element,
    kind: kindFor(element, element),
    name: accessibleNameFor(element),
    text: clip(element?.innerText || element?.textContent || "", 180),
    group: "",
    disabled: isDisabled(element),
    confidence: 1,
    rect: rectFor(element),
    inViewport: isInViewport(element)
  };
};

export function createPageController({ extensionHost } = {}) {
  const discover = () => collectSemanticTargets({ extensionHost });
  const registry = new TargetRegistry({ discover });

  const buildSnapshot = ({ region = "nearby" } = {}) => {
    const discovered = discover();
    const ranked = rankTargets(discovered, { region: normalizedRegion(region) });
    const entries = registry.registerSnapshot(ranked.targets);
    return {
      entries,
      region: ranked.region,
      didFallback: ranked.didFallback,
      discoveredCount: discovered.length
    };
  };

  const paginatedTargets = ({ region, page = 1, pageSize = 35 } = {}) => {
    const snapshot = buildSnapshot({ region });
    const size = clampNumber(pageSize, 35, 10, MAX_TARGETS_PER_PAGE);
    const totalTargets = snapshot.entries.length;
    const pageCount = Math.max(1, Math.ceil(totalTargets / size));
    const requestedPage = clampNumber(page, 1, 1, pageCount);
    const start = (requestedPage - 1) * size;
    const targets = snapshot.entries.slice(start, start + size).map((entry) => targetSnapshot(entry.id, entry.candidate));
    return {
      snapshotVersion: registry.snapshotVersion,
      region: snapshot.region,
      regionFallback: snapshot.didFallback || undefined,
      totalTargets,
      discoveredCount: snapshot.discoveredCount,
      page: requestedPage,
      pageSize: size,
      pageCount,
      hasMore: requestedPage < pageCount,
      targets,
      note: snapshot.discoveredCount >= 1_200
        ? "已保留排序最高的 1200 个语义目标；可用 region 切换到 above、below 或 all 缩小范围。"
        : "目标按可见性、语义置信度、表单/对话框上下文和距离排序。"
    };
  };

  const getPageState = ({ maxElements = 35, maxText = 3_000, page = 1, region = "nearby" } = {}) => {
    const targetPage = paginatedTargets({ region, page, pageSize: maxElements });
    return {
      ok: true,
      title: String(document.title || ""),
      url: String(location.href || ""),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: {
        x: Math.round(window.scrollX),
        y: Math.round(window.scrollY),
        maxY: Math.max(0, Math.round(document.documentElement.scrollHeight - window.innerHeight))
      },
      text: pageText(clampNumber(maxText, 3_000, 500, MAX_TEXT)),
      ...targetPage,
      note: `${targetPage.note} targetId 优先在当前快照中使用；若 Vue/React 重绘了同一控件，运行时会按指纹尝试安全重绑。找不到目标不代表页面是 canvas，可调用 list_targets 切换区域或翻页。`
    };
  };

  const listTargets = ({ region = "all", page = 1, pageSize = 35 } = {}) => ({
    ok: true,
    ...paginatedTargets({ region, page, pageSize })
  });

  const resolveTarget = (targetId) => registry.resolve(targetId);

  const describeTarget = (targetId) => {
    const resolved = resolveTarget(targetId);
    if (resolved.error) return { targetId: String(targetId || ""), label: "目标已失效", error: resolved.error };
    const snapshot = targetSnapshot(resolved.id, resolved.candidate);
    return {
      ...snapshot,
      label: snapshot.name || snapshot.text || snapshot.kind,
      rebound: resolved.rebound || undefined
    };
  };

  const getTargetState = ({ targetId } = {}) => {
    const resolved = resolveTarget(targetId);
    if (resolved.error) return resolved;
    const target = targetSnapshot(resolved.id, resolved.candidate);
    const state = snapshotTargetState(resolved.candidate);
    return {
      ok: true,
      target,
      state: {
        checked: state.checked,
        value: state.sensitive ? "[已隐藏]" : clip(state.value, 300),
        ariaChecked: state.ariaChecked || undefined,
        ariaSelected: state.ariaSelected || undefined,
        ariaPressed: state.ariaPressed || undefined,
        ariaExpanded: state.ariaExpanded || undefined,
        selectedValue: state.selectedValue || undefined,
        connected: state.connected,
        url: state.url
      },
      rebound: resolved.rebound || undefined
    };
  };

  const attachActionTarget = (result, resolved, beforeTarget) => {
    const candidate = resolved.candidate;
    const canDescribe = candidate?.clickElement?.isConnected && candidate?.stateElement?.isConnected;
    return {
      ...result,
      target: canDescribe ? targetSnapshot(resolved.id, candidate) : beforeTarget,
      rebound: resolved.rebound || undefined
    };
  };

  const click = async ({ targetId } = {}) => {
    const resolved = resolveTarget(targetId);
    if (resolved.error) return resolved;
    const beforeTarget = targetSnapshot(resolved.id, resolved.candidate);
    return attachActionTarget(await clickTarget(resolved.candidate), resolved, beforeTarget);
  };

  const check = async ({ targetId } = {}) => {
    const resolved = resolveTarget(targetId);
    if (resolved.error) return resolved;
    const beforeTarget = targetSnapshot(resolved.id, resolved.candidate);
    if (!["radio", "checkbox", "switch"].includes(beforeTarget.kind)) {
      return { error: "目标不是单选、多选或开关控件。", target: beforeTarget };
    }
    return attachActionTarget(await clickTarget(resolved.candidate, { check: true }), resolved, beforeTarget);
  };

  const type = async ({ targetId, text = "", clear = true } = {}) => {
    const resolved = resolveTarget(targetId);
    if (resolved.error) return resolved;
    const beforeTarget = targetSnapshot(resolved.id, resolved.candidate);
    return attachActionTarget(await typeIntoTarget(resolved.candidate, { text, clear }), resolved, beforeTarget);
  };

  const selectOption = async ({ targetId, value, label } = {}) => {
    const resolved = resolveTarget(targetId);
    if (resolved.error) return resolved;
    const beforeTarget = targetSnapshot(resolved.id, resolved.candidate);
    return attachActionTarget(await selectOptionInTarget(resolved.candidate, { value, label }), resolved, beforeTarget);
  };

  const pressKey = async ({ targetId, key } = {}) => {
    const resolved = targetId ? resolveTarget(targetId) : { id: "active", candidate: fallbackActiveTarget(), rebound: false };
    if (resolved.error) return resolved;
    const beforeTarget = targetId ? targetSnapshot(resolved.id, resolved.candidate) : { label: "当前焦点", kind: resolved.candidate.kind };
    return attachActionTarget(await pressKeyOnTarget(resolved.candidate, { key }), resolved, beforeTarget);
  };

  const scroll = async ({ direction = "down", amount = 600, targetId } = {}) => {
    const resolved = targetId ? resolveTarget(targetId) : null;
    if (resolved?.error) return resolved;
    const beforeTarget = resolved ? targetSnapshot(resolved.id, resolved.candidate) : null;
    const result = await scrollTarget({ target: resolved?.candidate, direction, amount });
    return resolved ? attachActionTarget(result, resolved, beforeTarget) : result;
  };

  const wait = async ({ ms = 700 } = {}) => {
    const duration = clampNumber(ms, 700, 50, 5_000);
    await new Promise((resolve) => setTimeout(resolve, duration));
    return { ok: true, action: "wait", status: "completed", ms: duration, url: String(location.href || "") };
  };

  return {
    getPageState,
    listTargets,
    getTargetState,
    describeTarget,
    click,
    check,
    type,
    selectOption,
    pressKey,
    scroll,
    wait
  };
}
