import assert from "node:assert/strict";
import test from "node:test";
import { acceptTurnMessage, createSendGate, drainSseBuffer, TOOL_LIMIT_NOTICE } from "../src/common/streamProtocol.js";
import { streamFinalResponse } from "../src/background/nativeAgent.js";
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
  manager.consumeTool({ isMutation: true, targetId: "target-a" });
  assert.equal(manager.canExecuteTool({ isMutation: true, targetId: "target-a" }), true);
  manager.consumeTool({ isMutation: true, targetId: "target-a" });
  assert.equal(manager.canExecuteTool({ isMutation: true, targetId: "target-a" }), false);
  assert.equal(manager.shouldPause(), "target_retry_limit");
});
