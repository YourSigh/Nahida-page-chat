import assert from "node:assert/strict";
import test from "node:test";
import { clickTarget } from "../src/page/actions/interaction.js";
import { isHitTestable } from "../src/page/perception/visibility.js";

const fixture = (t) => {
  const rect = { left: 10, top: 10, right: 50, bottom: 50, width: 40, height: 40 };
  const node = (tagName = "BUTTON") => ({
    tagName, isConnected: true, getBoundingClientRect: () => rect,
    getAttribute: () => null, contains(other) { return other === this; }
  });
  const button = node();
  let clicks = 0, hits = [button], modals = [];
  button.click = () => clicks++;
  const values = {
    Element: class {},
    document: { elementsFromPoint: () => hits, querySelectorAll: () => modals },
    window: { innerWidth: 800, innerHeight: 600, getComputedStyle: () => ({ opacity: "1" }) },
    location: { href: "https://example.test/" },
    requestAnimationFrame: (fn) => setTimeout(fn, 1),
    cancelAnimationFrame: clearTimeout
  };
  for (const [key, value] of Object.entries(values)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]);
  }
  return { node, button, target: { clickElement: button, stateElement: button, kind: "button" }, clicks: () => clicks, hits: value => hits = value, modals: value => modals = value };
};

test("an overlay above the target blocks clicking instead of matching lower hits", async t => {
  const f = fixture(t);
  f.hits([f.node("DIV"), f.button]);
  assert.equal(isHitTestable(f.button), false);
  const result = await clickTarget(f.target);
  assert.equal(result.status, "blocked_occluded");
  assert.equal(result.actionExecuted, false);
  assert.equal(f.clicks(), 0);
});

test("a modal blocks an outside target even without geometric overlap", async t => {
  const f = fixture(t);
  f.modals([f.node("DIALOG")]);
  const result = await clickTarget(f.target);
  assert.equal(result.blocked, true);
  assert.equal(f.clicks(), 0);
});

test("the extension chat host is ignored, but not a page overlay behind it", async t => {
  const f = fixture(t);
  const extensionHost = f.node("DIV");
  f.hits([extensionHost, f.button]);
  assert.equal(isHitTestable(f.button, { extensionHost }), true);
  f.hits([extensionHost, f.node("DIV"), f.button]);
  assert.equal(isHitTestable(f.button, { extensionHost }), false);
});

test("open shadow hit testing resolves actual target instead of rejecting host", t => {
  const f = fixture(t);
  const host = f.node("DIV");
  host.shadowRoot = { mode: "open", elementsFromPoint: () => [f.button, host] };
  f.hits([host]);
  assert.equal(isHitTestable(f.button), true);
  host.shadowRoot.elementsFromPoint = () => [f.node("DIV"), f.button, host];
  assert.equal(isHitTestable(f.button), false);
});

test("a page overlay appearing during a queued navigation prevents activation", async t => {
  const f = fixture(t);
  f.button.tagName = "A";
  f.button.hasAttribute = name => name === "href";
  const result = await clickTarget(f.target);
  assert.equal(result.queued, true);
  f.hits([f.node("DIV"), f.button]);
  await new Promise(resolve => setTimeout(resolve, 110));
  assert.equal(f.clicks(), 0);
});
