import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebMcpSession } from "../src/content/webMcp.js";

test("only calls same-origin WebMCP tools discovered in the latest list", async (t) => {
  const origin = "https://example.test";
  const tool = {
    origin,
    name: "set_filter",
    description: "Set a filter",
    inputSchema: { type: "object", properties: { query: { type: "string" } } }
  };
  const calls = [];
  const context = {
    getTools: async () => [
      tool,
      { ...tool, origin: "https://other.test" },
      { ...tool, annotations: { debugging: true } }
    ],
    executeTool: async (registered, input) => {
      assert.equal(registered, tool);
      calls.push(input);
      return JSON.stringify({ applied: input.query });
    }
  };
  Object.assign(globalThis, { document: {}, location: { origin } });
  t.after(() => {
    delete globalThis.document;
    delete globalThis.location;
  });

  const controller = new AbortController();
  const session = createWebMcpSession(controller.signal);
  assert.deepEqual(await session.list(), { available: false, tools: [] });
  document.modelContext = context;
  const first = await session.list();
  assert.equal(first.tools.length, 1);
  assert.deepEqual(first.tools[0].inputSchema, tool.inputSchema);
  const next = await session.list();
  assert.notEqual(first.tools[0].toolId, next.tools[0].toolId);
  assert.match((await session.call({ toolId: first.tools[0].toolId })).error, /已失效/);
  const toolId = next.tools[0].toolId;
  assert.match((await session.call({ toolId, input: [] })).error, /JSON 对象/);
  const result = await session.call({ toolId, input: { query: "tea" } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.result, { applied: "tea" });
  controller.abort();
  assert.match((await session.call({ toolId })).error, /已停止/);
  assert.deepEqual(calls, [{ query: "tea" }]);
});
