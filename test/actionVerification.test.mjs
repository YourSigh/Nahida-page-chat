import assert from "node:assert/strict";
import test from "node:test";
import { clickTarget, selectOptionInTarget, setCheckedTarget, typeIntoTarget } from "../src/page/actions/interaction.js";

const browserFixture = (t) => {
  const globals = {
    Element: class {},
    HTMLInputElement: class {},
    HTMLSelectElement: class {},
    document: { activeElement: null, querySelectorAll: () => [] },
    location: { href: "https://example.test/" },
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: clearTimeout
  };
  for (const [key, value] of Object.entries(globals)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]);
  }
};

const element = (tagName, attrs = {}) => ({
  tagName,
  nodeType: 1,
  isConnected: true,
  value: "",
  getAttribute: (name) => attrs[name] ?? null,
  getBoundingClientRect: () => ({ width: 20, height: 20 })
});

const target = (node, kind, control = node) => ({ clickElement: node, stateElement: control, kind });

test("a click returns before/after evidence rather than throwing after dispatch", async (t) => {
  browserFixture(t);
  const attrs = { "aria-expanded": "false" };
  const button = element("BUTTON", attrs);
  let clicks = 0;
  button.click = () => { clicks++; attrs["aria-expanded"] = "true"; };
  const result = await clickTarget(target(button, "button"));
  assert.equal(clicks, 1);
  assert.equal(result.verified, true);
  assert.equal(result.evidence.before.ariaExpanded, "false");
  assert.equal(result.evidence.after.ariaExpanded, "true");
});

test("a dispatched click without an observable effect is reported as unverified", async (t) => {
  browserFixture(t);
  const button = element("BUTTON");
  let clicks = 0;
  button.click = () => { clicks++; };
  const result = await clickTarget(target(button, "button"));
  assert.equal(clicks, 1);
  assert.equal(result.status, "unverified");
  assert.equal(result.actionExecuted, true);
  assert.deepEqual(result.evidence.changed, []);
});

test("already-checked and fallback actions preserve verification evidence", async (t) => {
  browserFixture(t);
  const input = element("INPUT", { type: "checkbox" });
  input.checked = true;
  let clicks = 0;
  input.click = () => { clicks++; input.checked = true; };
  const already = await setCheckedTarget(target(input, "checkbox"), { checked: true });
  assert.equal(already.status, "already_checked");
  assert.equal(already.actionExecuted, false);
  assert.equal(clicks, 0);
  assert.equal(already.evidence.before.checked, true);

  input.checked = false;
  const label = element("LABEL");
  label.click = () => {};
  const changed = await setCheckedTarget(target(label, "checkbox", input), { checked: true });
  assert.equal(clicks, 1);
  assert.equal(changed.verified, true);
  assert.equal(changed.evidence.before.checked, false);
  assert.equal(changed.evidence.after.checked, true);
});

test("typing and selecting report the original and new values", async (t) => {
  browserFixture(t);
  const input = element("INPUT", { type: "text" });
  input.value = "old";
  input.dispatchEvent = () => true;
  const typed = await typeIntoTarget(target(input, "input"), { text: "new" });
  assert.equal(typed.verified, true);
  assert.equal(typed.evidence.before.value, "old");
  assert.equal(typed.evidence.after.value, "new");

  const select = Object.assign(new HTMLSelectElement(), element("SELECT"), {
    value: "a",
    options: [{ value: "a", label: "A" }, { value: "b", label: "B" }],
    dispatchEvent: () => true
  });
  const selected = await selectOptionInTarget(target(select, "select"), { value: "b" });
  assert.equal(selected.verified, true);
  assert.equal(selected.evidence.before.selectedValue, "a");
  assert.equal(selected.evidence.after.selectedValue, "b");
});
