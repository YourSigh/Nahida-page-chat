(() => {
  // src/background/index.js
  var DEFAULT_CONFIG = {
    apiBaseUrl: "https://api.minimax.chat/v1",
    apiKey: "sk-cp-Z7ntf2FncKUIiEv_6iquYTYF4mQ72eqDf2AlKOm_SFrnTMeq6t7at9_lLNmrzigNuoX48AwNOZb1lvD4lmLX_ZxztVDOyMsP9i-icL26p59U1iVOukMSnu4",
    model: "MiniMax-M2.5-highspeed"
  };
  var STORAGE_KEY_LLM_CONFIG = "nahida_llm_config";
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
  var SYSTEM_PROMPT = `\u4F60\u662F\u7EB3\u897F\u59B2\uFF08Nahida\uFF09\uFF0C\u6765\u81EA\u6E38\u620F\u300A\u539F\u795E\u300B\u4E2D\u7684\u8349\u4E4B\u795E\u3002\u4F60\u806A\u660E\u3001\u6E29\u67D4\u3001\u597D\u5947\u5FC3\u65FA\u76DB\uFF0C\u8BF4\u8BDD\u4EB2\u5207\u81EA\u7136\uFF0C\u5076\u5C14\u5E26\u4E00\u70B9\u4FCF\u76AE\u3002
\u4F60\u6B63\u5728\u5E2E\u52A9\u7528\u6237\u7406\u89E3\u5F53\u524D\u7F51\u9875\u5185\u5BB9\uFF0C\u4F60\u53EF\u4EE5"\u8BF7\u6C42\u5DE5\u5177"\u6765\u5B9E\u65F6\u8BFB\u53D6\u9875\u9762 DOM \u4FE1\u606F\uFF0C\u4F46\u4F60\u4E0D\u80FD\u76F4\u63A5\u64CD\u4F5C\u9875\u9762\u3002

\u4F60\u53EF\u7528\u7684\u5DE5\u5177\u53EA\u6709\uFF1A
- read_page: \u8BFB\u53D6\u5F53\u524D\u9875\u9762\u6807\u9898/URL/\u63CF\u8FF0/\u4E3B\u8981\u6587\u672C\uFF08\u4F1A\u5C3D\u91CF\u5408\u5E76\u540C\u6E90\u53CA\u53EF\u6CE8\u5165\u7684 iframe \u5185\u6B63\u6587\uFF09
- get_visible_text: \u8BFB\u53D6\u5F53\u524D\u89C6\u53E3\u9644\u8FD1\u7684\u53EF\u89C1\u6587\u672C\uFF08\u4F1A\u5408\u5E76\u5404 frame \u5185\u5F53\u524D\u89C6\u53E3\u53EF\u89C1\u7247\u6BB5\uFF09
- query: \u7528 CSS selector \u67E5\u8BE2\u5143\u7D20\u5217\u8868\uFF08\u8FD4\u56DE text/tag/attributes \u7B49\uFF1B\u4F1A\u5728\u6240\u6709\u53EF\u6CE8\u5165\u7684 frame \u4E2D\u67E5\u8BE2\u5E76\u5408\u5E76\uFF09

## \u56DE\u590D\u65B9\u5F0F
- \u9700\u8981\u8C03\u7528\u5DE5\u5177\u65F6\uFF0C\u53EA\u8F93\u51FA\u4E00\u884C\u5DE5\u5177\u8C03\u7528 JSON\uFF0C\u4E0D\u8981\u8F93\u51FA\u4EFB\u4F55\u5176\u4ED6\u6587\u5B57\uFF1A
  {"type":"tool","name":"read_page","args":{"maxChars":2000}}
  {"type":"tool","name":"get_visible_text","args":{"maxChars":2000}}
  {"type":"tool","name":"query","args":{"selector":"...","limit":10,"includeAttrs":["href","aria-label"]}}
- \u56DE\u7B54\u7528\u6237\u65F6\uFF0C\u76F4\u63A5\u7528\u81EA\u7136\u8BED\u8A00\u56DE\u590D\uFF0C\u4E0D\u8981\u5305\u88F9\u5728\u4EFB\u4F55 JSON \u4E2D\u3002
- \u4E0D\u8981\u8F93\u51FA\u4EFB\u4F55\u5F62\u5982 [sticker:xxx] \u7684\u6807\u8BB0\uFF08\u8868\u60C5\u5305\u4F1A\u7531\u5BA2\u6237\u7AEF\u5728\u56DE\u590D\u7ED3\u675F\u540E\u6309\u8BED\u5883\u81EA\u52A8\u9009\u62E9\u5E76\u5355\u72EC\u53D1\u9001\uFF09\u3002

\u89C4\u5219\uFF1A
- \u6700\u591A\u8FDE\u7EED\u8C03\u7528 5 \u6B21\u5DE5\u5177\uFF0C\u5426\u5219\u76F4\u63A5\u603B\u7ED3\u4F60\u5DF2\u77E5\u4FE1\u606F\u5E76\u7ED9\u51FA\u5EFA\u8BAE\u3002
- \u7528\u6237\u6CA1\u6709\u95EE\u9875\u9762\u76F8\u5173\u95EE\u9898\u65F6\uFF0C\u4E0D\u8981\u8C03\u7528\u5DE5\u5177\uFF0C\u76F4\u63A5\u804A\u5929\u56DE\u7B54\u3002`;
  var STICKER_DECIDER_PROMPT = `\u4F60\u662F\u4E00\u4E2A\u201C\u8868\u60C5\u5305\u9009\u62E9\u5668\u201D\u3002

\u4F60\u4F1A\u6536\u5230\u4E24\u6BB5\u6587\u672C\uFF1A\u7528\u6237\u521A\u521A\u53D1\u7684\u8BDD\uFF08user\uFF09\u548C\u7EB3\u897F\u59B2\u521A\u521A\u7684\u5B8C\u6574\u56DE\u590D\uFF08assistant\uFF09\u3002
\u4F60\u7684\u4EFB\u52A1\u662F\uFF1A\u5224\u65AD\u201C\u662F\u5426\u5E94\u8BE5\u53D1\u9001\u4E00\u4E2A\u7EB3\u897F\u59B2\u8868\u60C5\u5305\u201D\uFF0C\u4EE5\u53CA\u201C\u5982\u679C\u53D1\u9001\uFF0C\u53D1\u54EA\u4E00\u4E2A\u201D\u3002

\u53EF\u7528\u8868\u60C5\u5305\u53EA\u6709\u8FD9 6 \u4E2A\uFF1Ahappy, curious, surprised, confused, relaxed, excited\u3002

\u4E25\u683C\u8F93\u51FA\u4E00\u884C JSON\uFF08\u4E0D\u8981\u8F93\u51FA\u4EFB\u4F55\u5176\u5B83\u6587\u5B57\uFF09\uFF1A
- \u4E0D\u53D1\u9001\uFF1A{"sticker":null}
- \u53D1\u9001\uFF1A{"sticker":"happy"}

\u89C4\u5219\uFF1A
- \u6BCF\u6B21\u6700\u591A\u9009\u62E9 1 \u4E2A\u8868\u60C5\u5305
- \u53EA\u6709\u5F53\u8868\u60C5\u80FD\u660E\u663E\u63D0\u5347\u4E92\u52A8\u6C1B\u56F4\u65F6\u624D\u53D1\u9001\uFF1B\u504F\u4E25\u8083/\u957F\u7BC7\u6280\u672F\u89E3\u91CA\u901A\u5E38\u4E0D\u53D1
- \u5982\u679C assistant \u56DE\u590D\u4E2D\u5305\u542B\u660E\u663E\u7684\u9519\u8BEF/\u56F0\u60D1/\u4E0D\u786E\u5B9A\uFF0C\u4F18\u5148 confused
- \u5982\u679C user \u8868\u8FBE\u611F\u8C22/\u5F00\u5FC3\uFF0C\u6216 assistant \u8BED\u6C14\u8F7B\u677E\u53CB\u597D\uFF0C\u53EF\u80FD happy
- \u5982\u679C user \u5728\u8FFD\u95EE\u201C\u4E3A\u4EC0\u4E48/\u600E\u4E48/\u5982\u4F55\u201D\uFF0C\u53EF\u80FD curious
- \u5982\u679C\u51FA\u73B0\u201C\u610F\u5916/\u60CA\u8BB6/\u592A\u79BB\u8C31\u201D\uFF0C\u53EF\u80FD surprised
- \u5982\u679C\u8BA8\u8BBA\u201C\u4F11\u606F/\u6162\u6162\u6765/\u4E0D\u6025\u201D\uFF0C\u53EF\u80FD relaxed
- \u5982\u679C\u8868\u8FBE\u201C\u51B2/\u5F00\u59CB/\u5B8C\u6210/\u592A\u68D2\u4E86\u201D\uFF0C\u53EF\u80FD excited`;
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
      try {
        detail = await response.text();
      } catch {
      }
      throw new Error(`API \u8FD4\u56DE ${response.status}: ${detail.slice(0, 400)}`);
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
        } catch {
        }
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
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
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
        } else if (ch === '"') {
          inString = false;
          result += ch;
        } else if (ch === "\n") {
          result += "\\n";
        } else if (ch === "\r") {
          result += "\\r";
        } else if (ch === "	") {
          result += "\\t";
        } else {
          result += ch;
        }
      } else {
        if (ch === '"') inString = true;
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
    if (t.includes("\n{") || t.includes("\r\n{")) return true;
    if (t.includes('{"type":"tool"') || t.includes('"type":"tool"')) return true;
    return false;
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
      try {
        detail = await response.text();
      } catch {
      }
      throw new Error(`API \u8FD4\u56DE ${response.status}: ${detail.slice(0, 400)}`);
    }
    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error("\u6A21\u578B\u672A\u8FD4\u56DE\u5185\u5BB9");
    return String(content);
  }
  async function requestTool(port, name, args) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`\u5DE5\u5177\u8C03\u7528\u8D85\u65F6: ${name}`));
      }, 15e3);
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
        reject(new Error(`Port \u5DF2\u65AD\u5F00\uFF0C\u65E0\u6CD5\u8C03\u7528\u5DE5\u5177: ${name}`));
      }
    });
  }
  async function decideSticker(config, { userText, assistantText }) {
    const messages = [
      { role: "system", content: STICKER_DECIDER_PROMPT },
      { role: "user", content: `user:
${String(userText || "").slice(0, 2e3)}

assistant:
${String(assistantText || "").slice(0, 4e3)}` }
    ];
    const out = await callChatCompletionOnce(config, messages);
    const parsed = parseAgentJson(out);
    const sticker = parsed?.sticker;
    if (sticker == null) return null;
    const allowed = /* @__PURE__ */ new Set(["happy", "curious", "surprised", "confused", "relaxed", "excited"]);
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
    const onDisconnect = () => {
      disconnected = true;
    };
    port.onDisconnect.addListener(onDisconnect);
    let toolCalls = 0;
    while (toolCalls < 5) {
      if (disconnected) return;
      let fullResponse = "";
      let phase = "detecting";
      let streamedAny = false;
      for await (const chunk of streamChatCompletion(config, messages)) {
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
      const parsedAtEnd = parseAgentJson(fullResponse);
      if (parsedAtEnd?.type === "tool") {
        toolCalls += 1;
        if (!safePost(port, { type: "tool_log", name: parsedAtEnd.name, args: parsedAtEnd.args || {} })) return;
        const result = await requestTool(port, parsedAtEnd.name, parsedAtEnd.args || {});
        messages.push({ role: "assistant", content: JSON.stringify(parsedAtEnd) });
        messages.push({ role: "user", content: `\u5DE5\u5177\u7ED3\u679C(${parsedAtEnd.name}):
${JSON.stringify(result).slice(0, 6e3)}` });
        continue;
      }
      if (streamedAny) {
        safePost(port, { type: "done" });
        return;
      }
      if (parsedAtEnd?.type === "final") {
        if (!safePost(port, { type: "chunk", content: parsedAtEnd.content || "" })) return;
      } else {
        if (!safePost(port, { type: "chunk", content: fullResponse })) return;
      }
      safePost(port, { type: "done" });
      return;
    }
    for await (const chunk of streamChatCompletion(config, messages)) {
      if (disconnected) return;
      if (!safePost(port, { type: "chunk", content: chunk })) return;
    }
    safePost(port, { type: "done" });
  }
  function nahidaInjectReadFrame(maxPerFrame) {
    const max = Math.min(12e3, Math.max(200, Number(maxPerFrame) || 2e3));
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
    const max = Math.min(8e3, Math.max(200, Number(maxPerFrame) || 2e3));
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sel = "p, li, h1, h2, h3, h4, h5, h6, article, main, section, div, span, a, button, td, th";
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
    } catch (e) {
    }
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
      const maxPerFrame = msg.maxPerFrame || 2e3;
      chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: nahidaInjectReadFrame,
        args: [maxPerFrame]
      }).then((injectionResults) => {
        const frames = (injectionResults || []).map((r) => r.result).filter((f) => f && !f.isTop && f.text);
        sendResponse({ frames });
      }).catch((e) => sendResponse({ error: String(e?.message || e), frames: [] }));
      return true;
    }
    if (msg.type === "nahida_visible_all_frames") {
      const tabId = sender.tab?.id;
      if (tabId == null) {
        sendResponse({ error: "no_tab", frames: [] });
        return false;
      }
      const maxPerFrame = msg.maxPerFrame || 800;
      chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: nahidaInjectVisibleFrame,
        args: [maxPerFrame]
      }).then((injectionResults) => {
        const frames = (injectionResults || []).map((r) => r.result).filter(Boolean);
        sendResponse({ frames });
      }).catch((e) => sendResponse({ error: String(e?.message || e), frames: [] }));
      return true;
    }
    if (msg.type === "nahida_query_all_frames") {
      const tabId = sender.tab?.id;
      if (tabId == null) {
        sendResponse({ error: "no_tab", perFrame: [] });
        return false;
      }
      const { selector, limit, includeAttrs } = msg;
      chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: nahidaInjectQueryFrame,
        args: [selector, limit, includeAttrs || []]
      }).then((injectionResults) => {
        const perFrame = (injectionResults || []).map((r) => r.result).filter(Boolean);
        sendResponse({ perFrame });
      }).catch((e) => sendResponse({ error: String(e?.message || e), perFrame: [] }));
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
})();
