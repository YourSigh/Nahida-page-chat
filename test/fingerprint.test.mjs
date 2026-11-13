import assert from "node:assert/strict";
import test from "node:test";
import { canRebindFingerprint, fingerprintScore } from "../src/page/registry/fingerprint.js";
import { checkedStateFor } from "../src/page/perception/semantic.js";
import { TargetRegistry } from "../src/page/registry/targetRegistry.js";

const radioFingerprint = (overrides = {}) => ({
  kind: "radio",
  role: "radio",
  name: "选项 A：示例答案",
  text: "选项 A：示例答案",
  group: "单选题 1",
  inputType: "radio",
  inputName: "question-1",
  stableId: "",
  path: "main>form>div.radio-item",
  rect: { x: 120, y: 280 },
  ...overrides
});

test("rebinds the same custom radio after a framework re-render", () => {
  const before = radioFingerprint();
  const after = radioFingerprint({ rect: { x: 122, y: 308 } });
  const score = fingerprintScore(before, after);

  assert.ok(score >= 130);
  assert.equal(canRebindFingerprint(before, after, score), true);
});

test("does not rebind a radio to a different option in the same group", () => {
  const before = radioFingerprint();
  const after = radioFingerprint({
    name: "选项 B：另一项",
    text: "选项 B：另一项",
    rect: { x: 120, y: 320 }
  });
  const score = fingerprintScore(before, after);

  assert.equal(canRebindFingerprint(before, after, score), false);
});

test("does not rebind a target across explicit question or option metadata", () => {
  const before = radioFingerprint({ questionId: "q4", optionKey: "C" });
  const after = radioFingerprint({ questionId: "q4", optionKey: "A" });
  assert.equal(canRebindFingerprint(before, after), false);
});

test("uses a stable DOM identity when one is available", () => {
  const before = radioFingerprint({ stableId: "id:plan-basic", name: "基础套餐", text: "基础套餐" });
  const after = radioFingerprint({ stableId: "id:plan-basic", name: "基础套餐", text: "基础套餐", rect: { x: 10, y: 800 } });
  const score = fingerprintScore(before, after);

  assert.equal(canRebindFingerprint(before, after, score), true);
});

test("reads custom checked and selected class states in the correct direction", () => {
  const element = (className) => ({
    className,
    getAttribute(name) {
      return name === "data-state" ? "" : null;
    }
  });

  assert.equal(checkedStateFor(element("radio-item selected"), null, "radio"), true);
  assert.equal(checkedStateFor(element("radio-item is-checked"), null, "radio"), true);
  assert.equal(checkedStateFor(element("radio-item unselected"), null, "radio"), false);
  assert.equal(checkedStateFor(element("radio-item is-unchecked"), null, "radio"), false);
});

const fakeCandidate = (optionKey = "B") => {
  const node = {
    isConnected: true,
    tagName: "DIV",
    className: "radio-item",
    parentElement: null,
    getAttribute(name) {
      if (name === "role") return "radio";
      if (name === "data-option-key") return optionKey;
      return null;
    }
  };
  return {
    element: node,
    clickElement: node,
    stateElement: node,
    kind: "radio",
    role: "radio",
    name: `${optionKey}．示例选项`,
    text: `${optionKey}．示例选项`,
    questionId: "q1",
    questionKey: "question-q1",
    questionText: "示例题干",
    questionType: "single",
    optionKey,
    group: "question-q1",
    checked: false,
    rect: { x: 100, y: 200 }
  };
};

test("keeps old snapshot metadata and rebinds a target after ten snapshots", () => {
  const registry = new TargetRegistry({ discover: () => [fakeCandidate("B")] });
  const first = registry.refresh()[0];
  const oldId = first.id;

  for (let index = 0; index < 10; index += 1) registry.refresh();

  assert.equal(registry.entries.has(oldId), false);
  assert.equal(registry.metadataForTarget(oldId).logicalKey, "question-q1:B");
  const rebound = registry.resolve(oldId);
  assert.equal(rebound.rebound, true);
  assert.equal(rebound.candidate.optionKey, "B");
});

test("returns a distinct stale result when no safe logical rebind exists", () => {
  let available = true;
  const registry = new TargetRegistry({ discover: () => available ? [fakeCandidate("B")] : [] });
  const oldId = registry.refresh()[0].id;
  available = false;
  registry.refresh();

  const result = registry.resolve(oldId);
  assert.equal(result.status, "target_stale");
  assert.equal(result.error.includes("无"), true);
});
