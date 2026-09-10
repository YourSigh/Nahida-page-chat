import { isNativeToolsUnsupported, runNativePageAgent } from "./nativeAgent.js";

const DEFAULT_CONFIG = {
  apiBaseUrl: process.env.LLM_API_BASE_URL || "https://api.openai.com/v1",
  apiKey: process.env.LLM_API_KEY || "",
  model: process.env.LLM_MODEL || "gpt-4o-mini"
};

const STORAGE_KEY_LLM_CONFIG = "nahida_llm_config";
const LEGACY_TOOL_TIMEOUT_MS = 90_000;

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


const LEGACY_SYSTEM_PROMPT = `你是纳西妲（Nahida），来自游戏《原神》的草之神。你正在帮助用户理解和操作当前网页。

当前模型接口不支持原生工具调用。需要读取或操作页面时，严格只输出一行 JSON，不要输出任何额外文字：
{"type":"tool","name":"get_page_state","args":{"maxElements":35,"maxText":3000}}
{"type":"tool","name":"read_page","args":{"maxChars":4000}}
{"type":"tool","name":"get_visible_text","args":{"maxChars":2000}}
{"type":"tool","name":"click","args":{"targetId":"p1-1"}}
{"type":"tool","name":"type","args":{"targetId":"p1-2","text":"示例","clear":true}}
{"type":"tool","name":"select_option","args":{"targetId":"p1-3","value":"value"}}
{"type":"tool","name":"scroll","args":{"direction":"down","amount":600}}
{"type":"tool","name":"wait","args":{"ms":800}}

规则：
- 用户要求操作页面时，先用 get_page_state 找到目标，并只使用返回的 targetId；页面变化后要重新读取状态。
- 每次只操作一个目标，不猜 selector，不批量操作。
- 若工具结果表示全局页面操作已关闭，告诉用户在插件设置中开启“启用页面操作（全局）”，不要重复请求同一操作。
- 用户未明确要求时，不填写或发送密码、验证码、支付信息、API Key 等秘密，不执行删除、购买、发布等高风险操作。
- 最多连续调用 12 次工具。最终回答时直接用自然语言，不要输出 JSON。`;

const STICKER_DECIDER_PROMPT = `你是一个“表情包选择器”。\n\n你会收到两段文本：用户刚刚发的话（user）和纳西妲刚刚的完整回复（assistant）。\n你的任务是：判断“是否应该发送一个纳西妲表情包”，以及“如果发送，发哪一个”。\n\n可用表情包只有这 6 个：happy, curious, surprised, confused, relaxed, excited。\n\n严格输出一行 JSON（不要输出任何其它文字）：\n- 不发送：{\"sticker\":null}\n- 发送：{\"sticker\":\"happy\"}\n\n规则：\n- 每次最多选择 1 个表情包\n- 只有当表情能明显提升互动氛围时才发送；偏严肃/长篇技术解释通常不发\n- 如果 assistant 回复中包含明显的错误/困惑/不确定，优先 confused\n- 如果 user 表达感谢/开心，或 assistant 语气轻松友好，可能 happy\n- 如果 user 在追问“为什么/怎么/如何”，可能 curious\n- 如果出现“意外/惊讶/太离谱”，可能 surprised\n- 如果讨论“休息/慢慢来/不急”，可能 relaxed\n- 如果表达“冲/开始/完成/太棒了”，可能 excited`;

async function* streamChatCompletion(config, messages, signal) {
  const url = `${config.apiBaseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({ model: config.model, messages, stream: true }),
    signal
  });

  if (!response.ok) {
    let detail = "";
    try { detail = await response.text(); } catch {}
    throw new Error(`API 返回 ${response.status}: ${detail.slice(0, 400)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        let data = trimmed.slice(5);
        if (data.startsWith(" ")) data = data.slice(1);
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data);
          const content = json?.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {}
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
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
    let timeoutId = 0;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = 0;
      port.onMessage.removeListener(handler);
      port.onDisconnect.removeListener(onDisconnect);
    };

    const onDisconnect = () => {
      cleanup();
      reject(new Error("已取消（连接断开）"));
    };

    const handler = (msg) => {
      if (msg?.type !== "tool_result" || msg?.id !== id) return;
      cleanup();
      resolve(msg.result);
    };

    port.onMessage.addListener(handler);
    port.onDisconnect.addListener(onDisconnect);

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`工具调用超时: ${name}`));
    }, LEGACY_TOOL_TIMEOUT_MS);

    try {
      port.postMessage({ type: "tool", id, name, args });
    } catch (e) {
      cleanup();
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

function isAbortError(e) {
  const name = e?.name;
  return name === "AbortError" || (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError");
}

async function runAgent(config, userMessages, port, signal) {
  const messages = [{ role: "system", content: LEGACY_SYSTEM_PROMPT }, ...userMessages];
  let disconnected = false;
  const onDisconnect = () => { disconnected = true; };
  port.onDisconnect.addListener(onDisconnect);

  let toolCalls = 0;
  while (toolCalls < 12) {
    if (disconnected) return;
    if (signal?.aborted) {
      safePost(port, { type: "done" });
      return;
    }
    let fullResponse = "";
    let phase = "detecting";
    let streamedAny = false;
    let uiSentLen = 0;

    try {
      for await (const chunk of streamChatCompletion(config, messages, signal)) {
        if (disconnected) return;
        if (signal?.aborted) {
          safePost(port, { type: "done" });
          return;
        }
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
    } catch (e) {
      if (signal?.aborted || isAbortError(e)) {
        // 始终发 done，避免前端输入框一直禁用（即使尚未产生任何可见 chunk）
        safePost(port, { type: "done" });
        return;
      }
      throw e;
    }

    // Stream ended: decide whether this was a tool call or a final answer.
    const parsedAtEnd = parseAgentJson(fullResponse);
    if (parsedAtEnd?.type === "tool") {
      toolCalls += 1;
      if (!safePost(port, { type: "tool_log", name: parsedAtEnd.name, args: parsedAtEnd.args || {} })) return;
      let result;
      try {
        result = await requestTool(port, parsedAtEnd.name, parsedAtEnd.args || {});
      } catch (err) {
        if (disconnected) return;
        if (signal?.aborted) {
          safePost(port, { type: "done" });
          return;
        }
        safePost(port, { type: "error", error: String(err?.message || err) });
        return;
      }
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
  try {
    for await (const chunk of streamChatCompletion(config, messages, signal)) {
      if (disconnected) return;
      if (signal?.aborted) {
        safePost(port, { type: "done" });
        return;
      }
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
  } catch (e) {
    if (signal?.aborted || isAbortError(e)) {
      safePost(port, { type: "done" });
      return;
    }
    throw e;
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
        const perFrame = (injectionResults || [])
          .map((r) => r.result ? { ...r.result, frameId: r.frameId } : null)
          .filter(Boolean);
        sendResponse({ perFrame });
      })
      .catch((e) => sendResponse({ error: String(e?.message || e), perFrame: [] }));
    return true;
  }

  return false;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "nahida-chat") return;

  let activeController = null;

  port.onDisconnect.addListener(() => {
    activeController?.abort();
    activeController = null;
  });

  port.onMessage.addListener(async (msg) => {
    if (msg?.type === "abort_chat") {
      activeController?.abort();
      return;
    }
    const config = await getLlmConfig();
    if (!config.apiKey) {
      safePost(port, { type: "error", error: "missing_api_key" });
      return;
    }
    try {
      if (msg.type === "chat") {
        activeController?.abort();
        const controller = new AbortController();
        activeController = controller;
        try {
          await runNativePageAgent(config, msg.messages, port, controller.signal);
        } catch (error) {
          if (isNativeToolsUnsupported(error) && Number(error?.nativeSuccessfulCalls || 0) === 0) {
            safePost(port, {
              type: "tool_log",
              name: "compatibility",
              args: { message: "当前接口未启用原生工具调用，已切换兼容模式。" }
            });
            await runAgent(config, msg.messages, port, controller.signal);
          } else {
            throw error;
          }
        } finally {
          if (activeController === controller) activeController = null;
        }
        return;
      }
      if (msg.type === "sticker_decide") {
        const sticker = await decideSticker(config, { userText: msg.userText, assistantText: msg.assistantText });
        safePost(port, { type: "sticker_decision", id: msg.id, sticker });
      }
    } catch (error) {
      if (isAbortError(error)) {
        safePost(port, { type: "done" });
        return;
      }
      safePost(port, { type: "error", error: String(error?.message || error) });
    }
  });
});
