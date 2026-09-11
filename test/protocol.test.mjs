import assert from "node:assert/strict";
import test from "node:test";
import { acceptTurnMessage, createSendGate, drainSseBuffer, TOOL_LIMIT_NOTICE } from "../src/common/streamProtocol.js";
import { runNativePageAgent, streamFinalResponse } from "../src/background/nativeAgent.js";
import { checkedActionPlan } from "../src/page/actions/interaction.js";
import {
  createExecutionBudget,
  createExecutionController,
  estimateExecutionPlan,
  ExecutionBudgetManager,
  progressFromToolResult
} from "../src/background/executionBudget.js";

test("flushes an SSE final buffer without a trailing newline", () => {
  const partial = drainSseBuffer("", 'data: {"choices":[{"delta":{"content":"最后一段"}}]}');
  assert.equal(partial.events.length, 0);

  const flushed = drainSseBuffer(partial.remainder, "", true);
  assert.deepEqual(flushed.events, [{ done: false, content: "最后一段" }]);
});

test("send gate only admits one rapid send until the turn releases", () => {
  const gate = createSendGate();
  assert.equal(gate.tryAcquire(), true);
  assert.equal(gate.tryAcquire(), false);
  gate.markStreaming();
  assert.equal(gate.tryAcquire(), false);
  gate.release();
  assert.equal(gate.tryAcquire(), true);
});

test("turn messages reject stale turns and duplicate sequence numbers", () => {
  let lastSeq = 0;
  let result = acceptTurnMessage("turn-a", lastSeq, { turnId: "turn-a", seq: 1, type: "chunk" });
  assert.equal(result.accepted, true);
  lastSeq = result.lastSeq;

  result = acceptTurnMessage("turn-a", lastSeq, { turnId: "turn-a", seq: 1, type: "chunk" });
  assert.equal(result.accepted, false);
  result = acceptTurnMessage("turn-a", lastSeq, { turnId: "turn-old", seq: 2, type: "chunk" });
  assert.equal(result.accepted, false);
});

test("native final response uses streaming and emits ordered chunks", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"你好"}}]}\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"，世界"}}]}'));
        controller.close();
      }
    });
    return { ok: true, body };
  };

  const sent = [];
  const port = { postMessage(message) { sent.push(message); } };
  try {
    await streamFinalResponse(
      { apiBaseUrl: "https://example.test/v1", apiKey: "test", model: "test-model" },
      [{ role: "user", content: "说你好" }],
      port,
      new AbortController().signal,
      "turn-stream"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 1);
  assert.equal(requests[0].stream, true);
  assert.deepEqual(sent.filter((item) => item.type === "chunk").map((item) => item.content), ["你好", "，世界"]);
  assert.equal(sent.at(-1).type, "done");
  assert.ok(sent.every((item) => item.turnId === "turn-stream"));
  assert.deepEqual(sent.map((item) => item.seq), [1, 2, 3]);
});

test("checked actions are idempotent and never toggle an already selected target", () => {
  assert.deepEqual(
    checkedActionPlan({ kind: "radio", current: true, desired: true }),
    { execute: false, already: true, status: "already_checked", actionExecuted: false, expectedChecked: true }
  );
  assert.equal(checkedActionPlan({ kind: "checkbox", current: false, desired: true }).execute, true);
  assert.equal(checkedActionPlan({ kind: "radio", current: true, desired: false }).execute, false);
});

test("tool limit uses an explicit incomplete notice instead of a completion claim", () => {
  assert.match(TOOL_LIMIT_NOTICE, /操作未完成/);
  assert.doesNotMatch(TOOL_LIMIT_NOTICE, /我已经完成/);
});

test("long workflows receive separate dynamic budgets instead of a fixed small cap", () => {
  const plan = estimateExecutionPlan([{ role: "user", content: "请处理100道题" }]);
  const budget = createExecutionBudget(plan);
  assert.equal(plan.estimatedItems, 100);
  assert.equal(plan.batchSize, 1);
  assert.ok(budget.maxAgentRounds > 32);
  assert.ok(budget.maxToolExecutions > 200);
  assert.ok(budget.maxPageMutations > 100);
  assert.equal(budget.maxWallTimeMs, 15 * 60_000);
  assert.ok(budget.softToolExecutions < budget.maxToolExecutions);
});

test("budget counts actual mutations, detects no progress, and keeps cumulative usage on reserve", () => {
  let now = 0;
  const manager = new ExecutionBudgetManager({
    now: () => now,
    budget: createExecutionBudget({
      estimatedItems: 4,
      expectedWrites: 4,
      maxNoProgressRounds: 3,
      softAgentRounds: 1,
      softToolExecutions: 1,
      softPageMutations: 1
    })
  });

  manager.consumeAgentRound();
  manager.consumeTool({ isMutation: true, actionExecuted: false });
  assert.equal(manager.usage.pageMutations, 0);
  const changed = manager.recordProgress(progressFromToolResult({ action: "click", error: "页面没有响应" }, {}));
  manager.finishAgentRound({ progressChanged: changed });
  assert.equal(manager.usage.noProgressRounds, 1);

  manager.consumeAgentRound();
  const next = progressFromToolResult({ action: "set_checked", verified: true, actionExecuted: true, url: "https://example.test", scroll: { x: 0, y: 0 } }, manager.progress);
  const progressed = manager.recordProgress(next);
  manager.consumeTool({ isMutation: true, actionExecuted: true });
  manager.finishAgentRound({ progressChanged: progressed });
  assert.equal(manager.usage.pageMutations, 1);
  assert.equal(manager.usage.noProgressRounds, 0);

  const beforeResume = manager.usage.toolExecutions;
  assert.equal(manager.unlockReserve(), true);
  assert.equal(manager.usage.toolExecutions, beforeResume);
  assert.equal(manager.tranche, 2);
  assert.ok(manager.budget.maxToolExecutions > 24);

  const frozen = new ExecutionBudgetManager({
    now: () => now,
    budget: createExecutionBudget({ maxWallTimeMs: 120_000 }),
    usage: { startedAt: 0, agentRounds: 1, toolExecutions: 2, pageMutations: 1, lastProgressAt: 0 },
    progress: { verifiedItems: 0, completedItems: 0, pageFingerprint: "same" }
  });
  frozen.consumeAgentRound();
  frozen.finishAgentRound({ progressChanged: false });
  frozen.consumeAgentRound();
  frozen.finishAgentRound({ progressChanged: false });
  frozen.consumeAgentRound();
  frozen.finishAgentRound({ progressChanged: false });
  assert.equal(frozen.shouldPause(), "no_progress");
});

test("budget expands discovery allowance after the runtime observes more pages", () => {
  const manager = new ExecutionBudgetManager({
    budget: createExecutionBudget(estimateExecutionPlan([{ role: "user", content: "查看页面" }]))
  });
  const before = manager.budget.maxToolExecutions;
  assert.equal(manager.observePageResult({ pageCount: 30 }), true);
  assert.ok(manager.budget.maxToolExecutions > before);
  assert.equal(manager.budget.plan.discoveryCalls, 30);
  assert.equal(manager.budget.plan.planningSource, "runtime_observation");
});

test("continuation starts a new wall-time/watchdog tranche without resetting counters", () => {
  let now = 100_000;
  const original = new ExecutionBudgetManager({
    now: () => now,
    budget: createExecutionBudget({ estimatedItems: 10 }),
    usage: { startedAt: 1_000, lifetimeStartedAt: 1_000, agentRounds: 8, toolExecutions: 15, pageMutations: 6, noProgressRounds: 3 },
    progress: { verifiedItems: 4, completedItems: 4, pageFingerprint: "p4" },
    tranche: 1
  });
  const checkpoint = original.snapshot();
  const resumed = createExecutionController({
    messages: [{ role: "user", content: "继续处理10条记录" }],
    now: () => now,
    resume: checkpoint
  }).manager;

  assert.equal(resumed.usage.agentRounds, 8);
  assert.equal(resumed.usage.toolExecutions, 15);
  assert.equal(resumed.usage.pageMutations, 6);
  assert.equal(resumed.usage.noProgressRounds, 0);
  assert.equal(resumed.usage.lifetimeStartedAt, 1_000);
  assert.equal(resumed.usage.startedAt, now);
  assert.equal(resumed.tranche, 2);
  assert.ok(resumed.budget.maxToolExecutions > checkpoint.budget.maxToolExecutions);
});

test("mutation retries are capped per target independently of total tool calls", () => {
  const manager = new ExecutionBudgetManager({
    budget: createExecutionBudget({ maxRetriesPerTarget: 1 })
  });
  assert.equal(manager.canExecuteTool({ isMutation: true, targetId: "target-a" }), true);
  manager.consumeTool({ isMutation: true, targetId: "target-a", failed: true });
  assert.equal(manager.canExecuteTool({ isMutation: true, targetId: "target-a" }), true);
  manager.consumeTool({ isMutation: true, targetId: "target-a", failed: true });
  assert.equal(manager.canExecuteTool({ isMutation: true, targetId: "target-a" }), false);
  assert.equal(manager.shouldPause(), "target_retry_limit");
});

test("already satisfied targets advance task progress once without a page mutation or retry", () => {
  const alreadySelected = {
    action: "set_checked",
    status: "already_checked",
    verified: true,
    actionExecuted: false,
    target: { id: "t-q2-a", questionId: "q2", questionType: "single", optionKey: "A" }
  };
  const first = progressFromToolResult(alreadySelected, {});
  assert.equal(first.completedItems, 1);
  assert.equal(first.verifiedItems, 1);
  assert.equal(first.actualMutation, false);
  assert.deepEqual(first.completedItemKeys, ["q2:A"]);

  const duplicate = progressFromToolResult(alreadySelected, first);
  assert.equal(duplicate.completedItems, 1);
  assert.equal(duplicate.verifiedItems, 1);
  assert.equal(duplicate.changed, false);

  const manager = new ExecutionBudgetManager({ budget: createExecutionBudget({ maxRetriesPerTarget: 1 }) });
  manager.consumeTool({ isMutation: true, targetId: "t-q2-a", status: "already_checked", actionExecuted: false });
  manager.consumeTool({ isMutation: true, targetId: "t-q2-a", status: "already_checked", actionExecuted: false });
  assert.equal(manager.canExecuteTool({ isMutation: true, targetId: "t-q2-a" }), true);
});

test("multiple selected options only complete one question after full verification", () => {
  const base = {
    action: "set_checked",
    verified: true,
    actionExecuted: true,
    target: { id: "t-q5-a", questionId: "q5", questionKey: "question-q5", questionType: "multiple", optionKey: "A" }
  };
  const first = progressFromToolResult(base, {});
  assert.equal(first.completedItems, 0);
  assert.equal(first.questionVerified, false);
  assert.equal(first.actualMutation, true);

  const second = progressFromToolResult({
    ...base,
    target: { ...base.target, id: "t-q5-b", optionKey: "B" }
  }, first);
  assert.equal(second.completedItems, 0);

  const verified = progressFromToolResult({
    ...base,
    target: { ...base.target, id: "t-q5-c", optionKey: "C" },
    questionVerified: true,
    selectedOptions: ["A", "B", "C"],
    expectedOptions: ["A", "B", "C"]
  }, second);
  assert.equal(verified.completedItems, 1);
  assert.deepEqual(verified.completedQuestionIds, ["q5"]);
});

test("page observation uses questionCount instead of target count", () => {
  const manager = new ExecutionBudgetManager({
    budget: createExecutionBudget({ estimatedItems: 1, expectedWrites: 1 })
  });
  assert.equal(manager.observePageResult({ questionCount: 8, totalTargets: 32 }), true);
  assert.equal(manager.budget.plan.estimatedItems, 8);

  const empty = new ExecutionBudgetManager({
    budget: createExecutionBudget({ estimatedItems: 1, expectedWrites: 1 })
  });
  assert.equal(empty.observePageResult({ questionCount: 0, totalTargets: 32 }), false);
  assert.equal(empty.budget.plan.estimatedItems, 1);
});

test("stale targets do not consume no-progress rounds or retry attempts", () => {
  const manager = new ExecutionBudgetManager({
    budget: createExecutionBudget({ maxRetriesPerTarget: 0, maxNoProgressRounds: 1 })
  });
  const stale = progressFromToolResult({ action: "set_checked", status: "target_stale", target: { id: "old-target" } }, {});
  assert.equal(manager.recordProgress(stale), false);
  manager.consumeTool({ isMutation: true, targetId: "old-target", status: "target_stale", failed: true });
  manager.finishAgentRound({ progressChanged: false });
  assert.equal(manager.usage.noProgressRounds, 0);
  assert.equal(manager.canExecuteTool({ isMutation: true, targetId: "old-target" }), true);
});

const eventChannel = () => {
  const listeners = new Set();
  return {
    addListener(listener) { listeners.add(listener); },
    removeListener(listener) { listeners.delete(listener); },
    emit(value) { for (const listener of [...listeners]) listener(value); }
  };
};

test("resume refreshes the page before the first model decision", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (body.stream === true) {
      const encoder = new TextEncoder();
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"恢复完成"}}]}\n'));
            controller.enqueue(encoder.encode("data: [DONE]\n"));
            controller.close();
          }
        })
      };
    }
    return { ok: true, async json() {
      return { choices: [{ message: { content: "", tool_calls: [] } }] };
    } };
  };

  const onMessage = eventChannel();
  const onDisconnect = eventChannel();
  const sent = [];
  const port = {
    onMessage,
    onDisconnect,
    postMessage(message) {
      sent.push(message);
      if (message.type === "tool" && message.name === "get_page_state") {
        setTimeout(() => onMessage.emit({
          type: "tool_result",
          id: message.id,
          result: { ok: true, url: "https://example.test/exam", page: 1, questionCount: 8, questions: [] }
        }), 0);
      }
    }
  };
  const resumeStartedAt = Date.now();
  const resume = new ExecutionBudgetManager({
    budget: createExecutionBudget({ estimatedItems: 8, expectedWrites: 8 }),
    usage: { startedAt: resumeStartedAt, lifetimeStartedAt: resumeStartedAt, agentRounds: 1, toolExecutions: 1, pageMutations: 1 },
    progress: { completedItems: 1, verifiedItems: 1 }
  }).snapshot();

  try {
    await runNativePageAgent(
      { apiBaseUrl: "https://example.test/v1", apiKey: "test", model: "test-model" },
      [{ role: "user", content: "继续执行" }],
      port,
      new AbortController().signal,
      { turnId: "turn-resume", executionId: "execution-resume", resume }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const refreshMessage = sent.find((message) => message.type === "tool");
  assert.equal(refreshMessage?.name, "get_page_state");
  assert.equal(requests[0].stream, false);
  assert.match(requests[0].messages.at(-1).content, /恢复任务后的最新页面状态/);
  assert.equal(requests[1].stream, true);
  assert.equal(sent.at(-1).type, "done");
});
