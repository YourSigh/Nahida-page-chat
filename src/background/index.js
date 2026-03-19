const API_BASE_URL = process.env.LLM_API_BASE_URL;
const API_KEY = process.env.LLM_API_KEY;
const MODEL = process.env.LLM_MODEL;

const SYSTEM_PROMPT = `你是纳西妲（Nahida），来自游戏《原神》中的草之神。你聪明、温柔、好奇心旺盛，说话亲切自然，偶尔带一点俏皮。
你正在帮助用户理解当前网页内容，你可以"请求工具"来实时读取页面 DOM 信息，但你不能直接操作页面。

你可用的工具只有：
- read_page: 读取当前页面标题/URL/描述/主要文本
- get_visible_text: 读取当前视口附近的可见文本（更实时、更相关）
- query: 用 CSS selector 查询元素列表（返回 text/tag/attributes 等）

## 回复方式
- 需要调用工具时，只输出一行工具调用 JSON，不要输出任何其他文字：
  {"type":"tool","name":"read_page","args":{"maxChars":2000}}
  {"type":"tool","name":"get_visible_text","args":{"maxChars":2000}}
  {"type":"tool","name":"query","args":{"selector":"...","limit":10,"includeAttrs":["href","aria-label"]}}
- 回答用户时，直接用自然语言回复，不要包裹在任何 JSON 中。
- 不要输出任何形如 [sticker:xxx] 的标记（表情包会由客户端在回复结束后按语境自动选择并单独发送）。

规则：
- 最多连续调用 5 次工具，否则直接总结你已知信息并给出建议。
- 用户没有问页面相关问题时，不要调用工具，直接聊天回答。`;

const STICKER_DECIDER_PROMPT = `你是一个“表情包选择器”。\n\n你会收到两段文本：用户刚刚发的话（user）和纳西妲刚刚的完整回复（assistant）。\n你的任务是：判断“是否应该发送一个纳西妲表情包”，以及“如果发送，发哪一个”。\n\n可用表情包只有这 6 个：happy, curious, surprised, confused, relaxed, excited。\n\n严格输出一行 JSON（不要输出任何其它文字）：\n- 不发送：{\"sticker\":null}\n- 发送：{\"sticker\":\"happy\"}\n\n规则：\n- 每次最多选择 1 个表情包\n- 只有当表情能明显提升互动氛围时才发送；偏严肃/长篇技术解释通常不发\n- 如果 assistant 回复中包含明显的错误/困惑/不确定，优先 confused\n- 如果 user 表达感谢/开心，或 assistant 语气轻松友好，可能 happy\n- 如果 user 在追问“为什么/怎么/如何”，可能 curious\n- 如果出现“意外/惊讶/太离谱”，可能 surprised\n- 如果讨论“休息/慢慢来/不急”，可能 relaxed\n- 如果表达“冲/开始/完成/太棒了”，可能 excited`;

async function* streamChatCompletion(messages) {
  const url = `${API_BASE_URL}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({ model: MODEL, messages, stream: true })
  });

  if (!response.ok) {
    let detail = "";
    try { detail = await response.text(); } catch {}
    throw new Error(`API 返回 ${response.status}: ${detail.slice(0, 400)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const content = json?.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {}
    }
  }
}

function getReplyAfterThink(text) {
  const openIdx = text.indexOf("<think>");
  if (openIdx === -1) return text;
  const closeIdx = text.indexOf("</think>", openIdx + 7);
  if (closeIdx === -1) return null;
  return text.slice(closeIdx + 8);
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function fixUnescapedNewlines(jsonStr) {
  let result = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (inString) {
      if (escape) {
        escape = false;
        result += ch;
      } else if (ch === "\\") {
        escape = true;
        result += ch;
      } else if (ch === "\"") {
        inString = false;
        result += ch;
      } else if (ch === "\n") {
        result += "\\n";
      } else if (ch === "\r") {
        result += "\\r";
      } else if (ch === "\t") {
        result += "\\t";
      } else {
        result += ch;
      }
    } else {
      if (ch === "\"") inString = true;
      result += ch;
    }
  }
  return result;
}

function parseAgentJson(output) {
  const trimmed = String(output || "").trim();
  const direct = safeParseJson(trimmed);
  if (direct && typeof direct === "object") return direct;

  const extracted = extractFirstJsonObject(trimmed);
  if (!extracted) return null;
  let parsed = safeParseJson(extracted);
  if (parsed && typeof parsed === "object") return parsed;

  const fixed = fixUnescapedNewlines(extracted);
  parsed = safeParseJson(fixed);
  if (parsed && typeof parsed === "object") return parsed;
  return null;
}

function looksLikeToolCallPayload(replyText) {
  const t = String(replyText || "").trimStart();
  if (!t) return false;
  if (t[0] === "{") return true;
  // Some models may add a short preface then output JSON on a new line.
  if (t.includes("\n{") || t.includes("\r\n{")) return true;
  if (t.includes("{\"type\":\"tool\"") || t.includes("\"type\":\"tool\"")) return true;
  return false;
}

async function callChatCompletionOnce(messages) {
  const url = `${API_BASE_URL}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({ model: MODEL, messages, stream: false })
  });

  if (!response.ok) {
    let detail = "";
    try { detail = await response.text(); } catch {}
    throw new Error(`API 返回 ${response.status}: ${detail.slice(0, 400)}`);
  }
  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("模型未返回内容");
  return String(content);
}

async function requestTool(port, name, args) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`工具调用超时: ${name}`));
    }, 15_000);

    const handler = (msg) => {
      if (msg?.type !== "tool_result" || msg?.id !== id) return;
      clearTimeout(timeout);
      port.onMessage.removeListener(handler);
      resolve(msg.result);
    };

    port.onMessage.addListener(handler);
    try {
      port.postMessage({ type: "tool", id, name, args });
    } catch (e) {
      clearTimeout(timeout);
      port.onMessage.removeListener(handler);
      reject(new Error(`Port 已断开，无法调用工具: ${name}`));
    }
  });
}

async function decideSticker({ userText, assistantText }) {
  const messages = [
    { role: "system", content: STICKER_DECIDER_PROMPT },
    { role: "user", content: `user:\n${String(userText || "").slice(0, 2000)}\n\nassistant:\n${String(assistantText || "").slice(0, 4000)}` }
  ];
  const out = await callChatCompletionOnce(messages);
  const parsed = parseAgentJson(out);
  const sticker = parsed?.sticker;
  if (sticker == null) return null;
  const allowed = new Set(["happy", "curious", "surprised", "confused", "relaxed", "excited"]);
  if (!allowed.has(sticker)) return null;
  return sticker;
}

function safePost(port, msg) {
  try {
    port.postMessage(msg);
    return true;
  } catch {
    return false;
  }
}

async function runAgent(userMessages, port) {
  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...userMessages];
  let disconnected = false;
  const onDisconnect = () => { disconnected = true; };
  port.onDisconnect.addListener(onDisconnect);

  let toolCalls = 0;
  while (toolCalls < 5) {
    if (disconnected) return;
    let fullResponse = "";
    let phase = "detecting";
    let streamedAny = false;

    for await (const chunk of streamChatCompletion(messages)) {
      if (disconnected) return;
      fullResponse += chunk;

      if (phase === "streaming") {
        if (!safePost(port, { type: "chunk", content: chunk })) return;
        streamedAny = true;
        continue;
      }

      if (phase === "tool_buffering") {
        continue;
      }

      const replyPart = getReplyAfterThink(fullResponse);
      if (replyPart === null) continue;

      const trimmedReply = replyPart.trimStart();
      if (trimmedReply.length === 0) continue;

      if (looksLikeToolCallPayload(trimmedReply)) {
        phase = "tool_buffering";
      } else {
        phase = "streaming";
        if (!safePost(port, { type: "chunk", content: fullResponse })) return;
        streamedAny = true;
      }
    }

    // Stream ended: decide whether this was a tool call or a final answer.
    const parsedAtEnd = parseAgentJson(fullResponse);
    if (parsedAtEnd?.type === "tool") {
      toolCalls += 1;
      if (!safePost(port, { type: "tool_log", name: parsedAtEnd.name, args: parsedAtEnd.args || {} })) return;
      const result = await requestTool(port, parsedAtEnd.name, parsedAtEnd.args || {});
      messages.push({ role: "assistant", content: JSON.stringify(parsedAtEnd) });
      messages.push({ role: "user", content: `工具结果(${parsedAtEnd.name}):\n${JSON.stringify(result).slice(0, 6000)}` });
      continue;
    }

    // If we already streamed, finish normally.
    if (streamedAny) {
      safePost(port, { type: "done" });
      return;
    }

    // No streaming happened and it's not a tool call: just send what we have.
    if (parsedAtEnd?.type === "final") {
      if (!safePost(port, { type: "chunk", content: parsedAtEnd.content || "" })) return;
    } else {
      if (!safePost(port, { type: "chunk", content: fullResponse })) return;
    }
    safePost(port, { type: "done" });
    return;
  }

  for await (const chunk of streamChatCompletion(messages)) {
    if (disconnected) return;
    if (!safePost(port, { type: "chunk", content: chunk })) return;
  }
  safePost(port, { type: "done" });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "nahida-chat") return;

  port.onMessage.addListener(async (msg) => {
    if (!API_KEY) {
      safePost(port, { type: "error", error: "未配置 API Key，请在 .env 文件中设置 LLM_API_KEY 后重新构建。" });
      return;
    }
    try {
      if (msg.type === "chat") {
        await runAgent(msg.messages, port);
        return;
      }
      if (msg.type === "sticker_decide") {
        const sticker = await decideSticker({ userText: msg.userText, assistantText: msg.assistantText });
        safePost(port, { type: "sticker_decision", id: msg.id, sticker });
      }
    } catch (error) {
      safePost(port, { type: "error", error: String(error?.message || error) });
    }
  });
});
