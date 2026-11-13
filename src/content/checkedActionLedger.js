// Deduplicate repeated checked-state requests without replaying stale evidence.
// Different explicit desired states are legitimate steps in the same workflow.
export const runCheckedAction = async ({ ledger, targetId, checked = true, readState, execute }) => {
  if (typeof checked !== "boolean") {
    return { ok: false, action: "set_checked", verified: false, actionExecuted: false, status: "invalid_arguments", error: "checked 必须为 true 或 false。" };
  }
  const key = String(targetId || "");
  if (!key || !ledger) return execute();
  const desired = checked !== false;
  const previous = ledger.get(key);
  if (previous?.pending) {
    return {
      ok: false, action: "set_checked", verified: false, actionExecuted: false,
      status: "action_pending",
      error: "此目标的上一操作仍在执行，请等待结果后重新读取状态。"
    };
  }
  const entry = { pending: true, desired };
  ledger.set(key, entry);
  try {
    if (previous?.desired === desired) {
      const current = await readState();
      const state = current?.state;
      const satisfied = current?.ok === true && state?.connected === true && state.checked === desired;
      return {
        ok: satisfied,
        action: "set_checked",
        verified: satisfied,
        actionExecuted: false,
        status: satisfied ? (desired ? "already_checked" : "already_unchecked") : "unverified",
        target: current?.target,
        evidence: { after: { checked: state?.checked ?? null, connected: state?.connected === true } },
        ...(!satisfied ? { error: current?.error || "此前已请求该状态，但当前状态未确认满足；没有再次激活，请重新读取页面状态。" } : {})
      };
    }
    const result = await execute();
    if (result?.actionExecuted || ["already_checked", "already_unchecked"].includes(result?.status)) {
      entry.pending = false;
    }
    return result;
  } catch (error) {
    // The action may have mutated before failing. Do not automatically repeat it.
    entry.pending = false;
    throw error;
  } finally {
    // A thrown/rejected action must not leave a permanent pending lock.
    if (ledger.get(key) === entry) {
      if (previous?.desired === desired) ledger.set(key, previous);
      else if (entry.pending) ledger.delete(key);
    }
  }
};
