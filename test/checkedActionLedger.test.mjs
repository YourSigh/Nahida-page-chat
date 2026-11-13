import test from "node:test";
import assert from "node:assert/strict";
import { runCheckedAction } from "../src/content/checkedActionLedger.js";

const fixture = () => {
  const ledger = new Map();
  let checked = false, clicks = 0, reads = 0;
  const readState = () => { reads++; return { ok: true, target: { id: "box", kind: "checkbox" }, state: { connected: true, checked } }; };
  const run = (desired, overrides = {}) => runCheckedAction({
    ledger, targetId: "box", checked: desired, readState,
    execute: async () => {
      if (checked === desired) return { ok: true, verified: true, status: desired ? "already_checked" : "already_unchecked", actionExecuted: false };
      checked = desired;
      clicks++;
      return { ok: true, verified: true, status: "verified", actionExecuted: true, evidence: { after: { checked } } };
    }, ...overrides
  });
  return { ledger, run, setState: (value) => { checked = value; }, counts: () => ({ checked, clicks, reads }) };
};

test("one turn can explicitly check, uncheck and recheck the same target", async () => {
  const f = fixture();
  assert.equal((await f.run(true)).evidence.after.checked, true);
  assert.equal((await f.run(false)).evidence.after.checked, false);
  assert.equal((await f.run(true)).evidence.after.checked, true);
  assert.deepEqual(f.counts(), { checked: true, clicks: 3, reads: 0 });
});

test("same desired state rereads live state without redispatching", async () => {
  const f = fixture();
  await f.run(true);
  const same = await f.run(true);
  assert.equal(same.status, "already_checked");
  assert.equal(same.verified, true);
  assert.equal(same.actionExecuted, false);
  assert.equal(same.evidence.after.checked, true);
  assert.deepEqual(f.counts(), { checked: true, clicks: 1, reads: 1 });
});

test("page rollback never replays cached successful evidence or repeats the click", async () => {
  const f = fixture();
  await f.run(true);
  f.setState(false);
  const rolledBack = await f.run(true);
  assert.equal(rolledBack.verified, false);
  assert.equal(rolledBack.status, "unverified");
  assert.equal(rolledBack.evidence.after.checked, false);
  assert.deepEqual(f.counts(), { checked: false, clicks: 1, reads: 1 });
});

test("concurrent desired-state changes cannot overlap", async () => {
  const f = fixture();
  let release;
  const pending = f.run(true, { execute: () => new Promise((resolve) => { release = resolve; }) });
  assert.equal((await f.run(false)).status, "action_pending");
  assert.equal((await f.run(true)).status, "action_pending");
  release({ ok: true, verified: true, actionExecuted: true });
  await pending;
  assert.equal((await f.run(false)).status, "already_unchecked");
});

test("a rejected action releases the lock but keeps same-state retry protection", async () => {
  const f = fixture();
  await assert.rejects(f.run(true, { execute: async () => { throw new Error("lost result"); } }), /lost result/);
  assert.equal((await f.run(true)).status, "unverified");
  assert.equal(f.counts().clicks, 0);
  assert.equal((await f.run(false)).status, "already_unchecked");
});

test("disconnected or stale reads and invalid desired types cannot claim success", async () => {
  const f = fixture();
  await f.run(true);
  const stale = await f.run(true, { readState: () => ({ ok: false, error: "stale target" }) });
  assert.equal(stale.verified, false);
  assert.equal(stale.error, "stale target");
  const disconnected = await f.run(true, { readState: () => ({ ok: true, state: { connected: false, checked: true } }) });
  assert.equal(disconnected.verified, false);
  assert.equal((await f.run("false")).status, "invalid_arguments");
  assert.equal(f.counts().clicks, 1);
});

test("ledger integrates with real checked-state action and its observed checkbox state", async (t) => {
  const { setCheckedTarget } = await import("../src/page/actions/interaction.js");
  const globals = {
    Element: class {},
    document: { activeElement: null, querySelectorAll: () => [] },
    location: { href: "https://example.test/form" },
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout
  };
  for (const [key, value] of Object.entries(globals)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]);
  }
  let clicks = 0;
  const checkbox = {
    tagName: "INPUT", nodeType: 1, isConnected: true, checked: false,
    getAttribute: (name) => name === "type" ? "checkbox" : null,
    getBoundingClientRect: () => ({ width: 20, height: 20 }),
    click() { clicks++; this.checked = !this.checked; }
  };
  const ledger = new Map();
  const target = { kind: "checkbox", clickElement: checkbox, stateElement: checkbox };
  const run = (checked) => runCheckedAction({
    ledger, targetId: "checkbox", checked,
    readState: () => ({ ok: true, state: { connected: checkbox.isConnected, checked: checkbox.checked } }),
    execute: () => setCheckedTarget(target, { checked })
  });
  assert.equal((await run(true)).verified, true);
  assert.equal(checkbox.checked, true);
  assert.equal((await run(false)).verified, true);
  assert.equal(checkbox.checked, false);
  assert.equal((await run(false)).status, "already_unchecked");
  assert.equal(clicks, 2);
  checkbox.checked = true;
  assert.equal((await run(false)).verified, false);
  assert.equal(clicks, 2);
});
