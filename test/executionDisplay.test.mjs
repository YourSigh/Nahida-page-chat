import test from "node:test";
import assert from "node:assert/strict";
import { executionDisplay } from "../src/common/executionDisplay.js";
import { createExecutionBudget, ExecutionBudgetManager, progressFromToolResult } from "../src/background/executionBudget.js";

test("greeting without tools never shows execution status, even after final response", () => {
  const snapshot = new ExecutionBudgetManager({ budget: createExecutionBudget({ estimatedItems: 1 }) }).snapshot();
  assert.equal(executionDisplay(snapshot).visible, false);
  assert.equal(executionDisplay(snapshot, { type: "done" }).visible, false);
});

test("resource budgets and estimated item counts are never presented as task progress", () => {
  const manager = new ExecutionBudgetManager({ budget: createExecutionBudget({ estimatedItems: 30 }) });
  manager.usage.toolExecutions = 2;
  const snapshot = manager.snapshot();
  assert.doesNotMatch(snapshot.text, /已完成题目|预计剩余|\d+\s*\/\s*\d+/u);
  const display = executionDisplay(snapshot);
  assert.match(display.text, /工具调用 2 次/u);
  assert.doesNotMatch(display.text, /分钟|30|完成题目|%|\//u);
});

test("only verified executed operations increment the verified operation counter", () => {
  let progress = progressFromToolResult({ action: "read_page", verified: true });
  progress = progressFromToolResult({ action: "click", actionExecuted: true, verified: false }, progress);
  progress = progressFromToolResult({ action: "type", actionExecuted: true, verified: true }, progress);
  progress = progressFromToolResult({ action: "set_checked", status: "already_checked", verified: true, actionExecuted: false }, progress);
  assert.equal(progress.verifiedActionCalls, 1);
  assert.equal(progress.unverifiedActionCalls, 1);
  const display = executionDisplay({ usage: { toolExecutions: 4 }, progress });
  assert.match(display.text, /已核验操作 1 次/u);
  assert.match(display.text, /已执行但未核验 1 次/u);
});

test("response end, interruption and pause cannot claim task success", () => {
  const snapshot = { status: "running", usage: { toolExecutions: 1 } };
  assert.match(executionDisplay(snapshot, { type: "done" }).text, /本轮已结束，不代表任务全部完成/u);
  assert.match(executionDisplay(snapshot, { type: "disconnect" }).text, /已中断，结果待确认/u);
  assert.match(executionDisplay({ ...snapshot, status: "paused" }, { type: "done" }).text, /已暂停，任务未完成/u);
});
