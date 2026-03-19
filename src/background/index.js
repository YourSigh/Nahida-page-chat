const API_BASE_URL = process.env.LLM_API_BASE_URL;
const API_KEY = process.env.LLM_API_KEY;
const MODEL = process.env.LLM_MODEL;

const SYSTEM_PROMPT = `你是纳西妲（Nahida），来自游戏《原神》中的草之神。你聪明、温柔、好奇心旺盛，说话亲切自然，偶尔带一点俏皮。
你正在帮助用户理解当前网页内容，你可以"请求工具"来实时读取页面 DOM 信息，但你不能直接操作页面。

你可用的工具只有：
- read_page: 读取当前页面标题/URL/描述/主要文本
- get_visible_text: 读取当前视口附近的可见文本（更实时、更相关）
- query: 用 CSS selector 查询元素列表（返回 text/tag/attributes 等）

## 表情包
你有一套自己的表情包，可以在聊天中使用。用 [sticker:名字] 的语法来发送表情，表情会单独显示为图片。
可用的表情：
- [sticker:happy] — 开心大笑，用于高兴、打招呼、夸奖
- [sticker:curious] — 好奇歪头，用于感兴趣、想了解更多
- [sticker:surprised] — 惊讶，用于意外发现、感叹
- [sticker:confused] — 困惑思考，用于不确定、需要更多信息
- [sticker:relaxed] — 惬意喝饮料，用于轻松闲聊、休息
- [sticker:excited] — 兴奋期待，用于鼓励、完成任务

使用表情包的规则：
- 适度使用，不要每条消息都发，大约 3-5 条消息发一次比较自然
- 表情包单独占一行，放在回复文字的前面或后面
- 根据对话语境和情绪选择合适的表情
- 当用户打招呼、表达感谢、或者聊到轻松话题时，很适合发一个表情

## 回复方式
- 需要调用工具时，只输出一行工具调用 JSON，不要输出任何其他文字：
  {"type":"tool","name":"read_page","args":{"maxChars":2000}}
  {"type":"tool","name":"get_visible_text","args":{"maxChars":2000}}
  {"type":"tool","name":"query","args":{"selector":"...","limit":10,"includeAttrs":["href","aria-label"]}}
- 回答用户时，直接用自然语言回复，不要包裹在任何 JSON 中。

规则：
- 最多连续调用 5 次工具，否则直接总结你已知信息并给出建议。
- 用户没有问页面相关问题时，不要调用工具，直接聊天回答。`;

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
    port.postMessage({ type: "tool", id, name, args });
  });
}

async function runAgent(userMessages, port) {
  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...userMessages];

  let toolCalls = 0;
  while (toolCalls < 5) {
    let fullResponse = "";
    let phase = "detecting";

    for await (const chunk of streamChatCompletion(messages)) {
      fullResponse += chunk;

      if (phase === "streaming") {
        port.postMessage({ type: "chunk", content: chunk });
        continue;
      }

      if (phase === "tool_buffering") {
        continue;
      }

      const replyPart = getReplyAfterThink(fullResponse);
      if (replyPart === null) continue;

      const trimmedReply = replyPart.trimStart();
      if (trimmedReply.length === 0) continue;

      if (trimmedReply[0] === "{") {
        phase = "tool_buffering";
      } else {
        phase = "streaming";
        port.postMessage({ type: "chunk", content: fullResponse });
      }
    }

    if (phase === "streaming") {
      port.postMessage({ type: "done" });
      return;
    }

    const parsed = parseAgentJson(fullResponse);

    if (parsed?.type === "tool") {
      toolCalls += 1;
      port.postMessage({ type: "tool_log", name: parsed.name, args: parsed.args || {} });
      const result = await requestTool(port, parsed.name, parsed.args || {});
      messages.push({ role: "assistant", content: JSON.stringify(parsed) });
      messages.push({ role: "user", content: `工具结果(${parsed.name}):\n${JSON.stringify(result).slice(0, 6000)}` });
      continue;
    }

    if (parsed?.type === "final") {
      port.postMessage({ type: "chunk", content: parsed.content || "" });
    } else {
      port.postMessage({ type: "chunk", content: fullResponse });
    }
    port.postMessage({ type: "done" });
    return;
  }

  for await (const chunk of streamChatCompletion(messages)) {
    port.postMessage({ type: "chunk", content: chunk });
  }
  port.postMessage({ type: "done" });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "nahida-chat") return;

  port.onMessage.addListener(async (msg) => {
    if (msg.type !== "chat") return;
    if (!API_KEY) {
      port.postMessage({ type: "error", error: "未配置 API Key，请在 .env 文件中设置 LLM_API_KEY 后重新构建。" });
      return;
    }
    try {
      await runAgent(msg.messages, port);
    } catch (error) {
      port.postMessage({ type: "error", error: String(error?.message || error) });
    }
  });
});
