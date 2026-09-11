import { clickTarget, pressKeyOnTarget, scrollTarget, selectOptionInTarget, setCheckedTarget, typeIntoTarget } from "./actions/interaction.js";
import { collectSemanticTargets } from "./perception/collectTargets.js";
import {
  accessibleNameFor,
  checkedStateFor,
  clip,
  groupFor,
  inputTypeFor,
  kindFor,
  questionContextFor,
  optionKeyFor,
  roleFor
} from "./perception/semantic.js";
import { isDisabled, isInViewport, isVisible, rectFor } from "./perception/visibility.js";
import { rankTargets } from "./ranking/rankTargets.js";
import { TargetRegistry } from "./registry/targetRegistry.js";
import { evidenceFor, meaningfulChanges, snapshotTargetState } from "./verification/stateSnapshot.js";

const MAX_TARGETS_PER_PAGE = 60;
const MAX_REGISTERED_TARGETS = 1_200;
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

const questionSummariesFor = (entries) => {
  const byKey = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const candidate = entry?.candidate || {};
    const questionKey = String(candidate.questionKey || candidate.questionId || "").trim();
    const optionKey = String(candidate.optionKey || "").trim().toUpperCase();
    if (!questionKey) continue;
    const key = questionKey;
    let question = byKey.get(key);
    if (!question) {
      question = {
        questionId: String(candidate.questionId || key),
        questionKey,
        questionType: candidate.questionType || "",
        stem: clip(candidate.questionText || "", 500),
        options: [],
        selectedOptions: []
      };
      byKey.set(key, question);
    }
    if (!question.questionType && candidate.kind === "radio") question.questionType = "single";
    if (!question.questionType && ["checkbox", "switch"].includes(candidate.kind)) question.questionType = "multiple";
    if (optionKey && !question.options.some((option) => option.key === optionKey)) {
      question.options.push({
        key: optionKey,
        text: clip(candidate.text || candidate.name || "", 220),
        targetId: entry.id,
        checked: candidate.checked === true
      });
    }
    if (optionKey && candidate.checked === true && !question.selectedOptions.includes(optionKey)) question.selectedOptions.push(optionKey);
  }
  return Array.from(byKey.values()).map((question) => ({
    ...question,
    questionType: question.questionType || "unknown"
  }));
};

const targetSnapshot = (id, candidate) => {
  const clickElement = candidate.clickElement || candidate.element;
  const stateElement = candidate.stateElement || clickElement;
  const inferredKind = kindFor(clickElement, stateElement);
  const kind = inferredKind === "custom" ? (candidate.kind || inferredKind) : inferredKind;
  const checked = checkedStateFor(clickElement, stateElement, kind);
  const question = questionContextFor(clickElement, stateElement);
  const record = {
    id,
    kind,
    role: roleFor(clickElement) || candidate.role || undefined,
    name: accessibleNameFor(clickElement, stateElement) || candidate.name || "",
    text: clip(clickElement?.innerText || clickElement?.textContent || stateElement?.innerText || stateElement?.textContent || candidate.text || "", 220),
    optionKey: optionKeyFor(clickElement, candidate.text || "") || candidate.optionKey || undefined,
    questionId: candidate.questionId || question.id || undefined,
    questionKey: candidate.questionKey || question.id || undefined,
    logicalKey: candidate.logicalKey || undefined,
    questionText: candidate.questionText || question.stem || undefined,
    questionType: candidate.questionType || question.type || undefined,
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
    // Count semantic question groups from the complete discovery result, not
    // from the nearby target slice. Otherwise a long form can report 2/8 just
    // because six questions are below the fold.
    const allQuestions = questionSummariesFor(discovered.map((candidate) => ({ candidate })));
    // Keep the safety cap after semantic ranking, never in DOM order. This means
    // controls far down a large page can still be addressed when they are the
    // best match for the requested region.
    const entries = registry.registerSnapshot(ranked.targets.slice(0, MAX_REGISTERED_TARGETS));
    return {
      entries,
      region: ranked.region,
      didFallback: ranked.didFallback,
      discoveredCount: discovered.length,
      registeredCount: entries.length,
      questionCount: allQuestions.length,
      questionIds: allQuestions.map((question) => question.questionId),
      questionTypes: Object.fromEntries(allQuestions.map((question) => [question.questionId, question.questionType]))
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
    const questions = questionSummariesFor(snapshot.entries);
    const questionTypes = Object.fromEntries(questions.map((question) => [question.questionId, question.questionType]));
    return {
      snapshotVersion: registry.snapshotVersion,
      region: snapshot.region,
      regionFallback: snapshot.didFallback || undefined,
      totalTargets,
      discoveredCount: snapshot.discoveredCount,
      registeredCount: snapshot.registeredCount,
      page: requestedPage,
      pageSize: size,
      pageCount,
      hasMore: requestedPage < pageCount,
      questionCount: snapshot.questionCount || questions.length,
      questionIds: snapshot.questionIds?.length ? snapshot.questionIds : questions.map((question) => question.questionId),
      questionTypes: Object.keys(snapshot.questionTypes || {}).length ? snapshot.questionTypes : questionTypes,
      questions,
      targets,
      note: snapshot.discoveredCount > snapshot.registeredCount
        ? `页面发现 ${snapshot.discoveredCount} 个语义目标，当前按排序保留最高的 ${snapshot.registeredCount} 个；可用 region 切换到 above、below 或 all 缩小范围。`
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

  const finalizeAction = (result, resolved, beforeTarget, beforeState) => {
    let activeResolved = resolved;
    let finalResult = result;
    const candidateStillConnected = Boolean(
      resolved.candidate?.clickElement?.isConnected && resolved.candidate?.stateElement?.isConnected
    );

    // Frameworks frequently replace the clicked node during the event handler.
    // Rebind once by fingerprint so verification observes the new instance too.
    if (!result?.verified && !candidateStillConnected) {
      const rebound = registry.resolve(resolved.id);
      if (!rebound.error) {
        activeResolved = rebound;
        const afterState = snapshotTargetState(rebound.candidate);
        const changes = meaningfulChanges(beforeState, afterState);
        if (rebound.rebound && changes.length) {
          finalResult = {
            ...result,
            ok: true,
            verified: true,
            status: "verified",
            evidence: evidenceFor({ before: beforeState, after: afterState, changes, mutated: true }),
            error: undefined
          };
        }
      }
    }

    return attachActionTarget(finalResult, activeResolved, beforeTarget);
  };

  const click = async ({ targetId } = {}) => {
    const resolved = resolveTarget(targetId);
    if (resolved.error) return resolved;
    const beforeTarget = targetSnapshot(resolved.id, resolved.candidate);
    const beforeState = snapshotTargetState(resolved.candidate);
    return finalizeAction(await clickTarget(resolved.candidate), resolved, beforeTarget, beforeState);
  };

  const setChecked = async ({ targetId, checked = true } = {}) => {
    const resolved = resolveTarget(targetId);
    if (resolved.error) return resolved;
    const beforeTarget = targetSnapshot(resolved.id, resolved.candidate);
    if (!["radio", "checkbox", "switch"].includes(beforeTarget.kind)) {
      return { error: "目标不是单选、多选或开关控件。", target: beforeTarget };
    }
    const beforeState = snapshotTargetState(resolved.candidate);
    return finalizeAction(await setCheckedTarget(resolved.candidate, { checked }), resolved, beforeTarget, beforeState);
  };

  const check = async ({ targetId } = {}) => setChecked({ targetId, checked: true });

  const type = async ({ targetId, text = "", clear = true } = {}) => {
    const resolved = resolveTarget(targetId);
    if (resolved.error) return resolved;
    const beforeTarget = targetSnapshot(resolved.id, resolved.candidate);
    const beforeState = snapshotTargetState(resolved.candidate);
    return finalizeAction(await typeIntoTarget(resolved.candidate, { text, clear }), resolved, beforeTarget, beforeState);
  };

  const selectOption = async ({ targetId, value, label } = {}) => {
    const resolved = resolveTarget(targetId);
    if (resolved.error) return resolved;
    const beforeTarget = targetSnapshot(resolved.id, resolved.candidate);
    const beforeState = snapshotTargetState(resolved.candidate);
    return finalizeAction(await selectOptionInTarget(resolved.candidate, { value, label }), resolved, beforeTarget, beforeState);
  };

  const pressKey = async ({ targetId, key } = {}) => {
    const resolved = targetId ? resolveTarget(targetId) : { id: "active", candidate: fallbackActiveTarget(), rebound: false };
    if (resolved.error) return resolved;
    const beforeTarget = targetId ? targetSnapshot(resolved.id, resolved.candidate) : { label: "当前焦点", kind: resolved.candidate.kind };
    const beforeState = snapshotTargetState(resolved.candidate);
    return finalizeAction(await pressKeyOnTarget(resolved.candidate, { key }), resolved, beforeTarget, beforeState);
  };

  const scroll = async ({ direction = "down", amount = 600, targetId } = {}) => {
    const resolved = targetId ? resolveTarget(targetId) : null;
    if (resolved?.error) return resolved;
    const beforeTarget = resolved ? targetSnapshot(resolved.id, resolved.candidate) : null;
    const beforeState = resolved ? snapshotTargetState(resolved.candidate) : null;
    const result = await scrollTarget({ target: resolved?.candidate, direction, amount });
    return resolved ? finalizeAction(result, resolved, beforeTarget, beforeState) : result;
  };

  const wait = async ({ ms = 700 } = {}) => {
    const duration = clampNumber(ms, 700, 50, 5_000);
    await new Promise((resolve) => setTimeout(resolve, duration));
    return { ok: true, action: "wait", status: "completed", ms: duration, url: String(location.href || "") };
  };

  return {
    refresh: ({ maxElements = 60, maxText = 3_000, region = "all" } = {}) => getPageState({ maxElements, maxText, region, page: 1 }),
    getPageState,
    listTargets,
    getTargetState,
    describeTarget,
    click,
    setChecked,
    check,
    type,
    selectOption,
    pressKey,
    scroll,
    wait
  };
}
