export const TOOL_LIMIT_NOTICE = "操作未完成：已达到工具调用上限，尚未完成最终验证。";

export const parseSseLine = (line) => {
  const trimmed = String(line || "").trim();
  if (!trimmed || !trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trimStart();
  if (data === "[DONE]") return { done: true, content: "" };
  try {
    const json = JSON.parse(data);
    const content = json?.choices?.[0]?.delta?.content;
    return { done: false, content: content == null ? "" : String(content) };
  } catch {
    return null;
  }
};

export const drainSseBuffer = (buffer, incoming = "", flush = false) => {
  const combined = `${String(buffer || "")}${String(incoming || "")}`;
  const lines = combined.split("\n");
  const remainder = flush ? "" : (lines.pop() || "");
  const events = [];
  for (const line of lines) {
    const event = parseSseLine(line);
    if (event) events.push(event);
  }
  if (flush && remainder) {
    const event = parseSseLine(remainder);
    if (event) events.push(event);
  }
  return { remainder, events };
};

export const createSendGate = () => {
  let state = "idle";
  return {
    tryAcquire() {
      if (state !== "idle") return false;
      state = "pending";
      return true;
    },
    markStreaming() {
      state = "streaming";
    },
    release() {
      state = "idle";
    },
    get state() {
      return state;
    }
  };
};

export const acceptTurnMessage = (currentTurnId, lastSeq, message) => {
  if (!message || (message.turnId && message.turnId !== currentTurnId)) {
    return { accepted: false, lastSeq };
  }
  const seq = Number(message.seq);
  if (Number.isFinite(seq) && seq <= lastSeq) return { accepted: false, lastSeq };
  return { accepted: true, lastSeq: Number.isFinite(seq) ? seq : lastSeq };
};
