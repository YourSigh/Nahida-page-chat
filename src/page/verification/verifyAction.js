import { evidenceFor } from "./stateSnapshot.js";

const isCheckable = (kind) => ["radio", "checkbox", "switch"].includes(kind);

const success = (status, observation, extra = {}) => ({
  ok: true,
  verified: true,
  status,
  evidence: evidenceFor(observation),
  ...extra
});

const unverified = (observation, error, extra = {}) => ({
  ok: false,
  verified: false,
  status: "unverified",
  actionExecuted: true,
  evidence: evidenceFor(observation),
  error,
  ...extra
});

export const verifyActivation = ({ action, target, before, observation, expectedChecked }) => {
  const { after, changes } = observation;
  if (action === "set_checked") {
    if (before.checked === expectedChecked) {
      return success(expectedChecked ? "already_checked" : "already_unchecked", observation, { actionExecuted: false });
    }
    if (after.checked === expectedChecked) return success("verified", observation, { actionExecuted: true });
    return unverified(
      observation,
      `已尝试设置${expectedChecked ? "选中" : "未选中"}，但目标最终状态不符合预期。请重新读取状态确认。`,
      { expectedChecked }
    );
  }

  if (action === "check") {
    if (before.checked === true) return success("already_checked", observation);
    if (after.checked === true) return success("verified", observation);
    return unverified(observation, "操作事件已发出，但目标没有变为已选中。请重新读取页面状态后再决定下一步。");
  }

  if (isCheckable(target.kind)) {
    if (expectedChecked === true && after.checked === true) return success("verified", observation);
    if (before.checked !== null && after.checked !== null && before.checked !== after.checked) return success("verified", observation);
    if (target.kind === "radio" && after.checked === true) return success("already_selected", observation);
    return unverified(observation, "点击事件已发出，但没有检测到该选项的选中状态变化。请重新读取页面状态确认。");
  }

  if (changes.some((key) => ["url", "dialogs", "ariaChecked", "ariaSelected", "ariaPressed", "ariaExpanded", "dataState", "selectedValue", "value"].includes(key))) {
    return success("verified", observation);
  }

  return unverified(
    observation,
    observation.mutated
      ? "页面已发生变化，但无法把变化安全地关联到此目标。请重新读取页面状态确认结果。"
      : "操作事件已发出，但未检测到可验证的页面变化。请重新读取页面状态确认。"
  );
};

export const verifyValue = ({ action, before, observation, expectedValue, sensitive = false }) => {
  const { after } = observation;
  if (after.value === expectedValue) {
    return success("verified", observation, { value: sensitive ? "[已隐藏]" : expectedValue.slice(0, 300) });
  }
  return unverified(observation, "输入事件已发出，但元素值没有变为预期内容。请重新读取页面状态确认。", {
    expected: sensitive ? "[已隐藏]" : expectedValue.slice(0, 300)
  });
};

export const verifySelect = ({ observation, expectedValue, expectedLabel }) => {
  const { after } = observation;
  if (after.selectedValue === expectedValue || after.value === expectedValue) {
    return success("verified", observation, { selected: { value: expectedValue, label: expectedLabel } });
  }
  return unverified(observation, "选择事件已发出，但下拉框没有变为目标选项。请重新读取页面状态确认。", {
    expected: { value: expectedValue, label: expectedLabel }
  });
};
