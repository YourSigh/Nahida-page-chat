// Execution budgets are deliberately kept outside the model prompt.  The model
// can propose work, but only the runtime may spend page-operation budget.

export const PAGE_MUTATION_TOOLS = new Set([
  "click",
  "set_checked",
  "check",
  "type",
  "select_option",
  "press_key"
]);

export const isPageMutationTool = (name) => PAGE_MUTATION_TOOLS.has(String(name || ""));

export const didExecutePageMutation = (result) => {
  if (!result || String(result.status || "").startsWith("already_")) return false;
  return result.actionExecuted === true;
};

export const executionPauseNotice = (reason) => ({
  wall_time_limit: "操作未完成：已达到本次执行时间上限，已暂停；页面状态和进度已保留。",
  agent_round_limit: "操作未完成：已达到模型决策轮次上限，尚未完成最终验证。",
  tool_execution_limit: "操作未完成：已达到工具调用上限，尚未完成最终验证。",
  page_mutation_limit: "操作未完成：已达到页面变更上限，尚未完成最终验证。",
  target_retry_limit: "操作已暂停：同一页面目标的重试次数已达到上限，请检查页面状态后再继续。",
  target_rebind_failed: "操作已暂停：目标刷新后仍无法安全重新绑定，请重新读取页面状态。",
  no_progress: "操作已暂停：连续多轮没有观察到页面进展，请检查页面或点击“继续执行”。",
  soft_limit_without_progress: "操作已暂停：接近执行预算且页面没有继续进展，请检查页面或点击“继续执行”。"
}[reason] || "操作未完成：执行已暂停，尚未完成最终验证。" );

export const ABSOLUTE_EXECUTION_CAPS = Object.freeze({
  maxAgentRounds: 512,
  maxToolExecutions: 768,
  maxPageMutations: 512,
  maxWallTimeMs: 15 * 60_000,
  maxLifetimeWallTimeMs: 30 * 60_000,
  maxRetriesPerTarget: 5,
  maxNoProgressRounds: 3
});

const DEFAULTS = Object.freeze({
  maxAgentRounds: 12,
  maxToolExecutions: 24,
  maxPageMutations: 12,
  maxWallTimeMs: 2 * 60_000,
  maxRetriesPerTarget: 2,
  maxNoProgressRounds: 3,
  softAgentRounds: 9,
  softToolExecutions: 18,
  softPageMutations: 9
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value) || 0)));

const textFromMessages = (messages) => (Array.isArray(messages) ? messages : [])
  .filter((message) => message?.role === "user")
  .map((message) => {
    if (typeof message?.content === "string") return message.content;
    if (!Array.isArray(message?.content)) return "";
    return message.content
      .filter((part) => part?.type === "text")
      .map((part) => String(part.text || ""))
      .join(" ");
  })
  .join("\n");

const extractCount = (text) => {
  const matches = [...String(text || "").matchAll(/(?:约|大概|共|一共|总共|全部)?\s*(\d{1,4})\s*(?:道题|道|题目|条记录|条|项|个表单|个任务|个|份)/giu)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  return matches.length ? Math.max(...matches) : 0;
};

const extractPageCount = (text) => {
  const match = String(text || "").match(/(?:共|总共|全部)?\s*(\d{1,3})\s*(?:页|页面)/iu);
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

/**
 * Make a conservative runtime plan from explicit user hints.  It is not a
 * task-specific answer planner: it only estimates how much orchestration a
 * generic page workflow may need.  Later observations can expand this plan.
 */
export const estimateExecutionPlan = (messages, { observedItems = 0, estimatedRemainingItems = 0 } = {}) => {
  const text = textFromMessages(messages);
  const explicitItems = extractCount(text);
  const pages = extractPageCount(text);
  const items = Math.max(1, explicitItems, Number(observedItems) || 0, Number(estimatedRemainingItems) || 0);
  const longTask = explicitItems > 1 || /批量|全部|所有|逐个|逐条|每一个|长任务/iu.test(text);

  // The current public protocol intentionally remains one generic tool call at
  // a time.  Keep batchSize as a plan field so a future safe batch tool can
  // lower model rounds without changing the budget manager.
  const batchSize = 1;
  const discoveryCalls = longTask ? Math.max(2, Math.min(36, Math.ceil(items / 10))) : 2;
  const expectedWrites = items;
  const expectedVerifications = items;
  const expectedToolExecutions = discoveryCalls + expectedWrites + expectedVerifications + 1;
  const expectedAgentRounds = expectedToolExecutions + 2;

  return {
    taskType: longTask ? "long_page_workflow" : "single_page_workflow",
    estimatedItems: items,
    explicitItems,
    pageCount: pages,
    batchSize,
    expectedWrites,
    expectedVerifications,
    discoveryCalls,
    expectedToolExecutions,
    expectedAgentRounds,
    planningSource: explicitItems ? "user_hint" : observedItems ? "page_observation" : "conservative_default"
  };
};

export const createExecutionBudget = (plan = {}) => {
  const source = plan?.plan && typeof plan.plan === "object" ? { ...plan.plan, ...plan } : plan;
  const {
    maxAgentRounds: requestedAgentRounds,
    maxToolExecutions: requestedToolExecutions,
    maxPageMutations: requestedPageMutations,
    maxWallTimeMs: requestedWallTime,
    maxRetriesPerTarget: requestedRetries,
    maxNoProgressRounds: requestedNoProgress,
    softAgentRounds: requestedSoftAgentRounds,
    softToolExecutions: requestedSoftToolExecutions,
    softPageMutations: requestedSoftPageMutations,
    plan: nestedPlan,
    ...planFields
  } = source;
  const items = Math.max(1, Number(source.estimatedItems) || 1);
  const writes = Math.max(1, Number(source.expectedWrites) || items);
  const expectedTools = Math.max(4, Number(source.expectedToolExecutions) || (writes * 2 + 3));
  const expectedRounds = Math.max(4, Number(source.expectedAgentRounds) || expectedTools + 2);
  const wall = clamp(120_000 + items * 8_000, DEFAULTS.maxWallTimeMs, ABSOLUTE_EXECUTION_CAPS.maxWallTimeMs);

  const maxAgentRounds = clamp(requestedAgentRounds ?? Math.max(DEFAULTS.maxAgentRounds, Math.ceil(expectedRounds * 1.35)), DEFAULTS.maxAgentRounds, ABSOLUTE_EXECUTION_CAPS.maxAgentRounds);
  const maxToolExecutions = clamp(requestedToolExecutions ?? Math.max(DEFAULTS.maxToolExecutions, Math.ceil(expectedTools * 1.35)), DEFAULTS.maxToolExecutions, ABSOLUTE_EXECUTION_CAPS.maxToolExecutions);
  const maxPageMutations = clamp(requestedPageMutations ?? Math.max(DEFAULTS.maxPageMutations, Math.ceil(writes * 1.35) + 8), DEFAULTS.maxPageMutations, ABSOLUTE_EXECUTION_CAPS.maxPageMutations);

  return {
    maxAgentRounds,
    maxToolExecutions,
    maxPageMutations,
    maxWallTimeMs: clamp(requestedWallTime ?? wall, DEFAULTS.maxWallTimeMs, ABSOLUTE_EXECUTION_CAPS.maxWallTimeMs),
    maxRetriesPerTarget: clamp(requestedRetries ?? DEFAULTS.maxRetriesPerTarget, 0, ABSOLUTE_EXECUTION_CAPS.maxRetriesPerTarget),
    maxNoProgressRounds: clamp(requestedNoProgress ?? DEFAULTS.maxNoProgressRounds, 1, ABSOLUTE_EXECUTION_CAPS.maxNoProgressRounds),
    softAgentRounds: clamp(requestedSoftAgentRounds ?? Math.ceil(maxAgentRounds * 0.75), 1, maxAgentRounds),
    softToolExecutions: clamp(requestedSoftToolExecutions ?? Math.ceil(maxToolExecutions * 0.75), 1, maxToolExecutions),
    softPageMutations: clamp(requestedSoftPageMutations ?? Math.ceil(maxPageMutations * 0.75), 1, maxPageMutations),
    plan: { ...planFields, estimatedItems: items, expectedWrites: writes, expectedToolExecutions: expectedTools, expectedAgentRounds: expectedRounds }
  };
};

const emptyUsage = (startedAt) => ({
  agentRounds: 0,
  toolExecutions: 0,
  pageMutations: 0,
  retries: 0,
  noProgressRounds: 0,
  startedAt,
  lastProgressAt: startedAt,
  lifetimeStartedAt: startedAt
});

const numericUsage = (usage, startedAt) => {
  const base = emptyUsage(startedAt);
  for (const key of Object.keys(base)) {
    if (key === "startedAt" || key === "lastProgressAt" || key === "lifetimeStartedAt") continue;
    base[key] = Math.max(0, Number(usage?.[key]) || 0);
  }
  base.startedAt = Number(usage?.startedAt) || startedAt;
  base.lastProgressAt = Number(usage?.lastProgressAt) || base.startedAt;
  base.lifetimeStartedAt = Number(usage?.lifetimeStartedAt) || base.startedAt;
  return base;
};

const progressSignature = (progress) => JSON.stringify({
  verifiedItems: Math.max(0, Number(progress?.verifiedItems) || 0),
  completedItems: Math.max(0, Number(progress?.completedItems) || 0),
  currentPage: progress?.currentPage == null ? null : String(progress.currentPage),
  pageFingerprint: String(progress?.pageFingerprint || ""),
  unresolvedErrors: Math.max(0, Number(progress?.unresolvedErrors) || 0)
});

const completionKeyFor = (result) => {
  const target = result?.target || {};
  const questionId = String(target.questionKey || target.questionId || "").trim();
  const optionKey = String(target.optionKey || "").trim();
  if (questionId && optionKey) return `${questionId}:${optionKey}`;
  return String(target.id || result?.targetId || "").trim();
};

const questionIdFor = (result) => {
  const target = result?.target || {};
  return String(target.questionId || target.questionKey || target.id || result?.targetId || "").trim();
};

export const progressFromToolResult = (result, previous = {}) => {
  const action = String(result?.action || "");
  const mutation = PAGE_MUTATION_TOOLS.has(action);
  const alreadySatisfied = ["already_checked", "already_unchecked"].includes(String(result?.status || ""));
  const verifiedTaskItem = mutation && result?.verified === true && (result?.actionExecuted === true || alreadySatisfied);
  const actualMutation = mutation && result?.actionExecuted === true;
  const target = result?.target || {};
  const selectedOptions = Array.isArray(result?.selectedOptions)
    ? result.selectedOptions.map((option) => String(option).toUpperCase()).sort()
    : Array.isArray(result?.question?.selectedOptions)
      ? result.question.selectedOptions.map((option) => String(option).toUpperCase()).sort()
      : null;
  const expectedOptions = Array.isArray(result?.expectedOptions)
    ? result.expectedOptions.map((option) => String(option).toUpperCase()).sort()
    : Array.isArray(result?.question?.expectedOptions)
      ? result.question.expectedOptions.map((option) => String(option).toUpperCase()).sort()
      : null;
  const fullQuestionMatch = selectedOptions && expectedOptions &&
    JSON.stringify(selectedOptions) === JSON.stringify(expectedOptions);
  const questionVerified = Boolean(result?.questionVerified === true || fullQuestionMatch ||
    (verifiedTaskItem && (!target.questionId && !target.questionKey || target.questionType === "single")));
  const scrollOrPageChange = result?.action === "scroll" && result?.verified === true;
  const resultUrl = result?.url || "";
  const resultScroll = result?.scroll || result?.after || result?.evidence?.after || {};
  const priorVerified = Math.max(0, Number(previous?.verifiedItems) || 0);
  const priorCompleted = Math.max(0, Number(previous?.completedItems) || 0);
  const completedItemKeys = new Set(Array.isArray(previous?.completedItemKeys) ? previous.completedItemKeys.map((key) => String(key)) : []);
  const completedQuestionIds = new Set(Array.isArray(previous?.completedQuestionIds) ? previous.completedQuestionIds.map((key) => String(key)) : []);
  const completionKey = verifiedTaskItem ? completionKeyFor(result) : "";
  const isNewCompletedItem = Boolean(completionKey && !completedItemKeys.has(completionKey));
  if (isNewCompletedItem) completedItemKeys.add(completionKey);
  const questionId = questionVerified ? questionIdFor(result) : "";
  const isNewCompletedQuestion = Boolean(questionId && !completedQuestionIds.has(questionId));
  if (isNewCompletedQuestion) completedQuestionIds.add(questionId);
  const next = {
    verifiedItems: Math.max(priorVerified, completedQuestionIds.size),
    completedItems: Math.max(priorCompleted, completedQuestionIds.size),
    completedItemKeys: Array.from(completedItemKeys),
    completedQuestionIds: Array.from(completedQuestionIds),
    questionVerified,
    actualMutation,
    currentPage: result?.page ?? previous?.currentPage ?? null,
    pageFingerprint: resultUrl || resultScroll?.x != null || resultScroll?.y != null || result?.page != null
      ? [resultUrl, resultScroll?.x ?? "", resultScroll?.y ?? "", result?.page ?? ""].join("|")
      : String(previous?.pageFingerprint || ""),
    unresolvedErrors: result?.error ? Math.max(1, Number(previous?.unresolvedErrors) || 0) : Math.max(0, Number(previous?.unresolvedErrors) || 0)
  };
  const changed = isNewCompletedQuestion || actualMutation || scrollOrPageChange ||
    (String(next.currentPage ?? "") !== String(previous.currentPage ?? "")) ||
    (String(next.pageFingerprint || "") !== String(previous.pageFingerprint || "")) ||
    ((Number(next.unresolvedErrors) || 0) < (Number(previous.unresolvedErrors) || 0));
  return {
    ...next,
    issue: String(result?.status || "").startsWith("target_")
      ? (result.status === "target_rebind_failed" ? "target_rebind_failed" : "target_stale")
      : undefined,
    changed
  };
};

export class ExecutionBudgetManager {
  constructor({ budget, now = () => Date.now(), usage, progress, tranche } = {}) {
    this.now = now;
    this.budget = createExecutionBudget(budget || {});
    this.usage = numericUsage(usage, this.now());
    this.progress = progress || null;
    this.lastProgressSignature = this.progress ? progressSignature(this.progress) : "";
    this.lastRoundProgress = false;
    this.tranche = Math.max(1, Number(tranche) || 1);
    this.reserveUnlocked = false;
    this.pauseReason = "";
    this.targetAttempts = new Map();
    this.lastIssue = "";
  }

  consumeAgentRound() {
    this.usage.agentRounds += 1;
    return this.snapshot();
  }

  consumeTool({ isMutation = false, actionExecuted = false, retry = false, failed = false, targetId, status = "" } = {}) {
    this.usage.toolExecutions += 1;
    if (isMutation && actionExecuted) this.usage.pageMutations += 1;
    const alreadySatisfied = String(status || "").startsWith("already_");
    const staleStatus = String(status || "").startsWith("target_");
    const countsAsTargetAttempt = isMutation && targetId && !alreadySatisfied && !staleStatus && (actionExecuted || failed || retry);
    if (countsAsTargetAttempt) {
      const id = String(targetId);
      const attempts = (this.targetAttempts.get(id) || 0) + 1;
      this.targetAttempts.set(id, attempts);
      if (attempts > 1) this.usage.retries += 1;
    } else if (retry) {
      this.usage.retries += 1;
    }
    return this.snapshot();
  }

  recordProgress(nextProgress) {
    const next = nextProgress || {};
    const signature = progressSignature(next);
    const previous = this.progress || {};
    const verifiedIncreased = (Number(next.verifiedItems) || 0) > (Number(previous.verifiedItems) || 0);
    const completedIncreased = (Number(next.completedItems) || 0) > (Number(previous.completedItems) || 0);
    const pageChanged = String(next.currentPage ?? "") !== String(previous.currentPage ?? "") ||
      String(next.pageFingerprint || "") !== String(previous.pageFingerprint || "");
    const errorsResolved = (Number(next.unresolvedErrors) || 0) < (Number(previous.unresolvedErrors) || 0);
    // The first observation is a baseline, not progress by itself.  In
    // particular, a failed click must not reset the no-progress watchdog.
    const observedMutation = next.actualMutation === true;
    const changed = verifiedIncreased || completedIncreased || pageChanged || errorsResolved || observedMutation || next.changed === true;
    this.progress = next;
    this.lastProgressSignature = signature;
    this.lastIssue = String(next.issue || "");
    if (changed) this.usage.lastProgressAt = this.now();
    return changed;
  }

  finishAgentRound({ progressChanged = false } = {}) {
    if (this.lastIssue === "target_rebind_failed") this.pauseReason = "target_rebind_failed";
    if (this.lastIssue === "target_stale" || this.lastIssue === "target_rebind_failed") {
      // A stale handle is a synchronization issue, not evidence that the
      // page made no progress. The recovery result decides whether to pause.
      this.lastRoundProgress = false;
      return this.snapshot();
    }
    this.lastRoundProgress = Boolean(progressChanged);
    if (progressChanged) this.usage.noProgressRounds = 0;
    else this.usage.noProgressRounds += 1;
    return this.snapshot();
  }

  observePageResult(result) {
    const observedPages = Math.max(0, Number(result?.pageCount) || 0);
    const hasQuestionSignal = result?.questionCount != null || Array.isArray(result?.questions) || result?.totalQuestionCount != null;
    const observedQuestionCount = result?.questionCount != null
      ? Number(result.questionCount)
      : Array.isArray(result?.questions)
        ? result.questions.length
        : Number(result?.totalQuestionCount || 0);
    const observedItems = Math.max(0, hasQuestionSignal && Number.isFinite(observedQuestionCount)
      ? observedQuestionCount
      : Number(result?.totalItems || result?.progress?.totalItems) || 0);
    const currentPages = Math.max(0, Number(this.budget.plan?.discoveryCalls) || 0);
    const currentItems = Math.max(1, Number(this.budget.plan?.estimatedItems) || 1);
    const nextItems = Math.max(currentItems, observedItems);
    const nextPages = Math.max(currentPages, observedPages);
    if (nextItems === currentItems && nextPages === currentPages) return false;

    const pageDelta = nextPages - currentPages;
    const currentExpectedTools = Math.max(4, Number(this.budget.plan?.expectedToolExecutions) || 4);
    const nextPlan = {
      ...this.budget.plan,
      estimatedItems: nextItems,
      expectedWrites: Math.max(Number(this.budget.plan?.expectedWrites) || 1, nextItems),
      expectedVerifications: Math.max(Number(this.budget.plan?.expectedVerifications) || 1, nextItems),
      discoveryCalls: nextPages,
      expectedToolExecutions: currentExpectedTools + pageDelta + Math.max(0, nextItems - currentItems) * 2,
      expectedAgentRounds: Math.max(Number(this.budget.plan?.expectedAgentRounds) || 4, currentExpectedTools + pageDelta + Math.max(0, nextItems - currentItems) * 2 + 2),
      planningSource: "runtime_observation"
    };
    const nextBudget = createExecutionBudget(nextPlan);
    for (const key of ["maxAgentRounds", "maxToolExecutions", "maxPageMutations"]) {
      this.budget[key] = clamp(Math.max(this.budget[key], nextBudget[key]), 1, ABSOLUTE_EXECUTION_CAPS[key]);
    }
    for (const key of ["softAgentRounds", "softToolExecutions", "softPageMutations"]) {
      this.budget[key] = clamp(Math.max(this.budget[key], nextBudget[key]), 1, this.budget[key.replace("soft", "max")]);
    }
    this.budget.plan = nextBudget.plan;
    return true;
  }

  softLimitReached() {
    return this.usage.agentRounds >= this.budget.softAgentRounds ||
      this.usage.toolExecutions >= this.budget.softToolExecutions ||
      this.usage.pageMutations >= this.budget.softPageMutations;
  }

  healthyProgress() {
    return this.lastRoundProgress && this.usage.noProgressRounds === 0;
  }

  unlockReserve({ explicit = false } = {}) {
    if (this.reserveUnlocked) return false;
    if (!explicit && !this.softLimitReached()) return false;
    const grow = (value, floor) => Math.max(floor, Math.ceil(value * 0.35));
    this.budget.maxAgentRounds = clamp(this.budget.maxAgentRounds + grow(this.budget.maxAgentRounds, 4), 1, ABSOLUTE_EXECUTION_CAPS.maxAgentRounds);
    this.budget.maxToolExecutions = clamp(this.budget.maxToolExecutions + grow(this.budget.maxToolExecutions, 8), 1, ABSOLUTE_EXECUTION_CAPS.maxToolExecutions);
    this.budget.maxPageMutations = clamp(this.budget.maxPageMutations + grow(this.budget.maxPageMutations, 8), 1, ABSOLUTE_EXECUTION_CAPS.maxPageMutations);
    this.budget.softAgentRounds = clamp(this.budget.softAgentRounds + grow(this.budget.softAgentRounds, 4), 1, this.budget.maxAgentRounds);
    this.budget.softToolExecutions = clamp(this.budget.softToolExecutions + grow(this.budget.softToolExecutions, 8), 1, this.budget.maxToolExecutions);
    this.budget.softPageMutations = clamp(this.budget.softPageMutations + grow(this.budget.softPageMutations, 8), 1, this.budget.maxPageMutations);
    this.reserveUnlocked = true;
    this.tranche += 1;
    return true;
  }

  shouldPause() {
    if (this.pauseReason) return this.pauseReason;
    const elapsed = Math.max(0, this.now() - this.usage.startedAt);
    const lifetimeElapsed = Math.max(0, this.now() - this.usage.lifetimeStartedAt);
    if (elapsed >= this.budget.maxWallTimeMs || lifetimeElapsed >= ABSOLUTE_EXECUTION_CAPS.maxLifetimeWallTimeMs) return "wall_time_limit";
    if (this.usage.agentRounds >= this.budget.maxAgentRounds) return "agent_round_limit";
    if (this.usage.toolExecutions >= this.budget.maxToolExecutions) return "tool_execution_limit";
    if (this.usage.pageMutations >= this.budget.maxPageMutations) return "page_mutation_limit";
    if (this.usage.noProgressRounds >= this.budget.maxNoProgressRounds) return "no_progress";
    if (this.softLimitReached() && !this.healthyProgress()) return "soft_limit_without_progress";
    return "";
  }

  canStartAgentRound() {
    return !this.shouldPause();
  }

  canExecuteTool({ isMutation = false, targetId } = {}) {
    if (isMutation && targetId) {
      const attempts = this.targetAttempts.get(String(targetId)) || 0;
      if (attempts >= this.budget.maxRetriesPerTarget + 1) {
        this.pauseReason = "target_retry_limit";
        return false;
      }
    }
    if (this.shouldPause()) return false;
    if (this.usage.toolExecutions + 1 > this.budget.maxToolExecutions) return false;
    if (isMutation && this.usage.pageMutations + 1 > this.budget.maxPageMutations) return false;
    return true;
  }

  progressText() {
    const p = this.progress || {};
    const total = Number(this.budget.plan?.estimatedItems) || 0;
    const completed = Math.max(Number(p.completedItems) || 0, Number(p.verifiedItems) || 0);
    const itemText = total > 1 ? ` · 已完成题目 ${Math.min(completed, total)} / ${total}` : "";
    const remainingMs = Math.max(0, this.budget.maxWallTimeMs - (this.now() - this.usage.startedAt));
    const remaining = Math.ceil(remainingMs / 60_000);
    return `执行进度${itemText} · 页面变更 ${this.usage.pageMutations} / ${this.budget.maxPageMutations} · 工具 ${this.usage.toolExecutions} / ${this.budget.maxToolExecutions} · 预计剩余约 ${remaining} 分钟`;
  }

  snapshot() {
    const elapsed = Math.max(0, this.now() - this.usage.startedAt);
    const reason = this.shouldPause();
    const percent = (used, max) => max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 100;
    return {
      status: reason ? "paused" : "running",
      reason: reason || undefined,
      tranche: this.tranche,
      reserveUnlocked: this.reserveUnlocked,
      budget: { ...this.budget, plan: { ...this.budget.plan } },
      usage: { ...this.usage },
      progress: this.progress ? { ...this.progress } : null,
      percent: {
        agentRounds: percent(this.usage.agentRounds, this.budget.maxAgentRounds),
        toolExecutions: percent(this.usage.toolExecutions, this.budget.maxToolExecutions),
        pageMutations: percent(this.usage.pageMutations, this.budget.maxPageMutations),
        wallTime: percent(elapsed, this.budget.maxWallTimeMs)
      },
      elapsedMs: elapsed,
      text: this.progressText()
    };
  }
}

export const createExecutionController = ({ messages, now, resume } = {}) => {
  const clock = now || (() => Date.now());
  const plan = estimateExecutionPlan(messages, resume?.observed ? { observedItems: resume.observed } : undefined);
  const budget = resume?.budget || createExecutionBudget(plan);
  const resumeUsage = resume?.usage
    ? {
      ...resume.usage,
      // A user-requested continuation starts a fresh wall-time tranche while
      // preserving the lifetime clock and every operation counter.
      startedAt: clock(),
      lastProgressAt: clock(),
      noProgressRounds: 0,
      lifetimeStartedAt: resume.usage.lifetimeStartedAt || resume.usage.startedAt
    }
    : undefined;
  const manager = new ExecutionBudgetManager({ budget, now: clock, usage: resumeUsage, progress: resume?.progress, tranche: resume?.tranche });
  if (resume?.usage) manager.unlockReserve({ explicit: true });
  return { manager, plan };
};
