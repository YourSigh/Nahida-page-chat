import assert from "node:assert/strict";
import test from "node:test";
import { acceptTurnMessage, createSendGate, drainSseBuffer, TOOL_LIMIT_NOTICE } from "../src/common/streamProtocol.js";
import { streamFinalResponse } from "../src/background/nativeAgent.js";
import { checkedActionPlan } from "../src/page/actions/interaction.js";

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
