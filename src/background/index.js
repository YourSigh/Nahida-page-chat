const DEFAULT_CONFIG = {
  apiBaseUrl: process.env.LLM_API_BASE_URL || "https://api.openai.com/v1",
  apiKey: process.env.LLM_API_KEY || "",
  model: process.env.LLM_MODEL || "gpt-4o-mini"
};

const STORAGE_KEY_LLM_CONFIG = "nahida_llm_config";

async function getLlmConfig() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY_LLM_CONFIG);
    const cfg = data?.[STORAGE_KEY_LLM_CONFIG] || {};
    return {
      apiBaseUrl: String(cfg.apiBaseUrl || DEFAULT_CONFIG.apiBaseUrl),
      apiKey: String(cfg.apiKey || DEFAULT_CONFIG.apiKey),
      model: String(cfg.model || DEFAULT_CONFIG.model)
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

const SYSTEM_PROMPT = `你是纳西妲（Nahida），来自游戏《原神》中的草之神。你聪明、温柔、好奇心旺盛，说话亲切自然，偶尔带一点俏皮。
你正在帮助用户理解当前网页内容，你可以"请求工具"来实时读取页面 DOM 信息，但你不能直接操作页面。

你可用的工具只有：
- read_page: 读取当前页面标题/URL/描述/主要文本（会尽量合并同源及可注入的 iframe 内正文）
- get_visible_text: 读取当前视口附近的可见文本（会合并各 frame 内当前视口可见片段）
- query: 用 CSS selector 查询元素列表（返回 text/tag/attributes 等；会在所有可注入的 frame 中查询并合并）
- get_api_endpoints: 采集当前页面最近一小段时间内通过 'fetch' 和 'XMLHttpRequest' 发出的请求 URL/Method（可用于推断该页面的接口地址；可能遗漏在插件注入前已发出的请求）
- get_api_responses: 获取最近一小段时间内通过 'fetch' 和 'XMLHttpRequest' 发出的请求的响应内容预览（可能受 CORS/opaque 响应限制，跨域有时拿不到正文）

## 回复方式
- 需要调用工具时，只输出一行工具调用 JSON，不要输出任何其他文字：
  {"type":"tool","name":"read_page","args":{"maxChars":2000}}
  {"type":"tool","name":"get_visible_text","args":{"maxChars":2000}}
  {"type":"tool","name":"query","args":{"selector":"...","limit":10,"includeAttrs":["href","aria-label"]}}
  {"type":"tool","name":"get_api_endpoints","args":{"waitMs":1500,"maxEntries":200,"stripQuery":true}}
  {"type":"tool","name":"get_api_responses","args":{"waitMs":2500,"maxEntries":20,"stripQuery":true,"maxResponseChars":4000}}
- 回答用户时，直接用自然语言回复，不要包裹在任何 JSON 中。
- 不要输出任何形如 [sticker:xxx] 的标记（表情包会由客户端在回复结束后按语境自动选择并单独发送）。

规则：
- 最多连续调用 5 次工具，否则直接总结你已知信息并给出建议。
- 用户没有问页面相关问题时，不要调用工具，直接聊天回答。`;

const STICKER_DECIDER_PROMPT = `你是一个“表情包选择器”。\n\n你会收到两段文本：用户刚刚发的话（user）和纳西妲刚刚的完整回复（assistant）。\n你的任务是：判断“是否应该发送一个纳西妲表情包”，以及“如果发送，发哪一个”。\n\n可用表情包只有这 6 个：happy, curious, surprised, confused, relaxed, excited。\n\n严格输出一行 JSON（不要输出任何其它文字）：\n- 不发送：{\"sticker\":null}\n- 发送：{\"sticker\":\"happy\"}\n\n规则：\n- 每次最多选择 1 个表情包\n- 只有当表情能明显提升互动氛围时才发送；偏严肃/长篇技术解释通常不发\n- 如果 assistant 回复中包含明显的错误/困惑/不确定，优先 confused\n- 如果 user 表达感谢/开心，或 assistant 语气轻松友好，可能 happy\n- 如果 user 在追问“为什么/怎么/如何”，可能 curious\n- 如果出现“意外/惊讶/太离谱”，可能 surprised\n- 如果讨论“休息/慢慢来/不急”，可能 relaxed\n- 如果表达“冲/开始/完成/太棒了”，可能 excited`;

async function* streamChatCompletion(config, messages) {
  const url = `${config.apiBaseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({ model: config.model, messages, stream: true })
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
  const t = String(text);
  const openHtml = t.indexOf("<think>");
  const openMd = t.indexOf("`think`");
  let openIdx = -1;
  const openLen = 7; // ` ` and `think` are both length 7
  if (openHtml === -1 && openMd === -1) return t;
  if (openHtml === -1) openIdx = openMd;
  else if (openMd === -1) openIdx = openHtml;
  else openIdx = Math.min(openHtml, openMd);

  const afterOpen = openIdx + openLen;
  const closeHtml = t.indexOf("</think>", afterOpen);
  const closeMd = t.indexOf("`/think`", afterOpen);
  const closeLen = 8;
  if (closeHtml === -1 && closeMd === -1) return null;
  let closeIdx = -1;
  if (closeHtml === -1) closeIdx = closeMd;
  else if (closeMd === -1) closeIdx = closeHtml;
  else closeIdx = Math.min(closeHtml, closeMd);

  return t.slice(closeIdx + closeLen);
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

function removeAllCompleteToolJsonObjects(text) {
  let s = String(text);
  let guard = 0;
  while (guard < 50) {
    guard += 1;
    const extracted = extractFirstJsonObject(s);
    if (!extracted) break;
    const fixed = fixUnescapedNewlines(extracted);
    const parsed = safeParseJson(fixed);
    if (parsed?.type !== "tool") break;
    const start = s.indexOf(extracted);
    if (start === -1) break;
    s = `${s.slice(0, start)}${s.slice(start + extracted.length)}`;
    s = s.replace(/\n{3,}/g, "\n\n");
  }
  return s;
}

/** Strip tool-call JSON from text shown in chat while streaming (handles preface + JSON). */
function uiSafeAssistantStreamText(fullResponse) {
  let s = removeAllCompleteToolJsonObjects(fullResponse);
  const lastBrace = s.lastIndexOf("{");
  if (lastBrace === -1) return s;
  const tail = s.slice(lastBrace);
  if (tail.length <= 1 || tail.length > 12000) return s;
  const complete = extractFirstJsonObject(tail);
  if (complete) return s;
  if (/"type"\s*:\s*"tool"/.test(tail) || /"type"\s*:\s*'tool'/.test(tail)) {
    return s.slice(0, lastBrace).replace(/\s+$/u, "");
  }
  return s;
}

async function callChatCompletionOnce(config, messages) {
  const url = `${config.apiBaseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({ model: config.model, messages, stream: false })
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

async function decideSticker(config, { userText, assistantText }) {
  const messages = [
    { role: "system", content: STICKER_DECIDER_PROMPT },
    { role: "user", content: `user:\n${String(userText || "").slice(0, 2000)}\n\nassistant:\n${String(assistantText || "").slice(0, 4000)}` }
  ];
  const out = await callChatCompletionOnce(config, messages);
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

async function runAgent(config, userMessages, port) {
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
    let uiSentLen = 0;

    for await (const chunk of streamChatCompletion(config, messages)) {
      if (disconnected) return;
      fullResponse += chunk;

      if (phase === "tool_buffering") {
        continue;
      }

      if (phase === "streaming") {
        const safe = uiSafeAssistantStreamText(fullResponse);
        if (safe.length > uiSentLen) {
          if (!safePost(port, { type: "chunk", content: safe.slice(uiSentLen) })) return;
          uiSentLen = safe.length;
        } else if (safe.length < uiSentLen) {
          if (!safePost(port, { type: "chunk_reset", content: safe })) return;
          uiSentLen = safe.length;
        }
        streamedAny = true;
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
        const safe = uiSafeAssistantStreamText(fullResponse);
        if (!safePost(port, { type: "chunk", content: safe })) return;
        uiSentLen = safe.length;
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

  let fullTail = "";
  let uiSentLenTail = 0;
  for await (const chunk of streamChatCompletion(config, messages)) {
    if (disconnected) return;
    fullTail += chunk;
    const safe = uiSafeAssistantStreamText(fullTail);
    if (safe.length > uiSentLenTail) {
      if (!safePost(port, { type: "chunk", content: safe.slice(uiSentLenTail) })) return;
      uiSentLenTail = safe.length;
    } else if (safe.length < uiSentLenTail) {
      if (!safePost(port, { type: "chunk_reset", content: safe })) return;
      uiSentLenTail = safe.length;
    }
  }
  safePost(port, { type: "done" });
}

function nahidaInjectReadFrame(maxPerFrame) {
  const max = Math.min(12000, Math.max(200, Number(maxPerFrame) || 2000));
  const url = String(location.href || "");
  const title = String(document.title || "");
  const isTop = window === window.top;
  let text = "";
  try {
    const mainEl = document.querySelector("main, article, [role='main']");
    const root = mainEl || document.body;
    const bodyText = root ? String(root.innerText || "") : "";
    text = bodyText.slice(0, max).trim();
  } catch (e) {
    text = "";
  }
  return { url, title, text, isTop };
}

function nahidaInjectVisibleFrame(maxPerFrame) {
  const max = Math.min(8000, Math.max(200, Number(maxPerFrame) || 2000));
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sel =
    "p, li, h1, h2, h3, h4, h5, h6, article, main, section, div, span, a, button, td, th";
  const chunks = [];
  try {
    const nodes = Array.from(document.querySelectorAll(sel)).slice(0, 800);
    for (let i = 0; i < nodes.length; i += 1) {
      const el = nodes[i];
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const visible = rect.bottom >= 0 && rect.right >= 0 && rect.top <= vh && rect.left <= vw;
      if (!visible) continue;
      const t = String(el.innerText || el.textContent || "").trim();
      if (!t) continue;
      chunks.push(t.replace(/\s+/g, " "));
      if (chunks.join("\n").length >= max) break;
    }
  } catch (e) {}
  return {
    url: String(location.href || ""),
    text: chunks.join("\n").slice(0, max),
    isTop: window === window.top
  };
}

function nahidaInjectQueryFrame(selector, limit, includeAttrs) {
  const lim = Math.min(50, Math.max(1, Number(limit) || 10));
  const attrs = Array.isArray(includeAttrs) ? includeAttrs : [];
  const url = String(location.href || "");
  let elements = [];
  try {
    elements = Array.from(document.querySelectorAll(String(selector || ""))).slice(0, lim);
  } catch (e) {
    return { url, error: String(e?.message || e), results: [] };
  }
  const results = elements.map((el) => {
    const at = {};
    for (let i = 0; i < attrs.length; i += 1) {
      const k = attrs[i];
      const v = el.getAttribute?.(k);
      if (v != null) at[k] = v;
    }
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName?.toLowerCase?.() || "",
      text: String(el.innerText || el.textContent || "").trim().slice(0, 500),
      attrs: at,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
    };
  });
  return { url, results };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return false;

  if (msg.type === "nahida_read_iframe_frames") {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ error: "no_tab", frames: [] });
      return false;
    }
    const maxPerFrame = msg.maxPerFrame || 2000;
    chrome.scripting
      .executeScript({
        target: { tabId, allFrames: true },
        func: nahidaInjectReadFrame,
        args: [maxPerFrame]
      })
      .then((injectionResults) => {
        const frames = (injectionResults || [])
          .map((r) => r.result)
          .filter((f) => f && !f.isTop && f.text);
        sendResponse({ frames });
      })
      .catch((e) => sendResponse({ error: String(e?.message || e), frames: [] }));
    return true;
  }

  if (msg.type === "nahida_visible_all_frames") {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ error: "no_tab", frames: [] });
      return false;
    }
    const maxPerFrame = msg.maxPerFrame || 800;
    chrome.scripting
      .executeScript({
        target: { tabId, allFrames: true },
        func: nahidaInjectVisibleFrame,
        args: [maxPerFrame]
      })
      .then((injectionResults) => {
        const frames = (injectionResults || []).map((r) => r.result).filter(Boolean);
        sendResponse({ frames });
      })
      .catch((e) => sendResponse({ error: String(e?.message || e), frames: [] }));
    return true;
  }

  if (msg.type === "nahida_query_all_frames") {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ error: "no_tab", perFrame: [] });
      return false;
    }
    const { selector, limit, includeAttrs } = msg;
    chrome.scripting
      .executeScript({
        target: { tabId, allFrames: true },
        func: nahidaInjectQueryFrame,
        args: [selector, limit, includeAttrs || []]
      })
      .then((injectionResults) => {
        const perFrame = (injectionResults || []).map((r) => r.result).filter(Boolean);
        sendResponse({ perFrame });
      })
      .catch((e) => sendResponse({ error: String(e?.message || e), perFrame: [] }));
    return true;
  }

  return false;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "nahida-chat") return;

  port.onMessage.addListener(async (msg) => {
    const config = await getLlmConfig();
    if (!config.apiKey) {
      safePost(port, { type: "error", error: "missing_api_key" });
      return;
    }
    try {
      if (msg.type === "chat") {
        await runAgent(config, msg.messages, port);
        return;
      }
      if (msg.type === "sticker_decide") {
        const sticker = await decideSticker(config, { userText: msg.userText, assistantText: msg.assistantText });
        safePost(port, { type: "sticker_decision", id: msg.id, sticker });
      }
    } catch (error) {
      safePost(port, { type: "error", error: String(error?.message || error) });
    }
  });
});
