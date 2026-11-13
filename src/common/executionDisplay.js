// A resource budget is a stop condition, not a plan or an estimate of completion.
const count = (value) => Math.max(0, Math.floor(Number(value) || 0));

export const executionDisplay = (snapshot, outcome) => {
  if (!snapshot) return { visible: false, text: "" };
  const tools = count(snapshot.usage?.toolExecutions);
  if (!tools) return { visible: false, text: "" };
  const verified = count(snapshot.progress?.verifiedActionCalls);
  const unverified = count(snapshot.progress?.unverifiedActionCalls);
  const paused = snapshot.status === "paused" || outcome?.status === "incomplete";
  const interrupted = outcome?.type === "disconnect";
  const ended = outcome?.type === "done";
  const state = paused ? "已暂停，任务未完成" : interrupted ? "已中断，结果待确认" : ended ? "本轮已结束，不代表任务全部完成" : "正在执行";
  return {
    visible: true,
    paused,
    text: `${state} · 工具调用 ${tools} 次 · 已核验操作 ${verified} 次${unverified ? ` · 已执行但未核验 ${unverified} 次` : ""}`
  };
};
