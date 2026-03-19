(() => {
  // src/background/index.js
  var API_BASE_URL = "https://api.minimax.chat/v1";
  var API_KEY = "sk-cp-Z7ntf2FncKUIiEv_6iquYTYF4mQ72eqDf2AlKOm_SFrnTMeq6t7at9_lLNmrzigNuoX48AwNOZb1lvD4lmLX_ZxztVDOyMsP9i-icL26p59U1iVOukMSnu4";
  var MODEL = "MiniMax-M2.5-highspeed";
  var SYSTEM_PROMPT = `\u4F60\u662F\u7EB3\u897F\u59B2\uFF08Nahida\uFF09\uFF0C\u6765\u81EA\u6E38\u620F\u300A\u539F\u795E\u300B\u4E2D\u7684\u8349\u4E4B\u795E\u3002\u4F60\u806A\u660E\u3001\u6E29\u67D4\u3001\u597D\u5947\u5FC3\u65FA\u76DB\uFF0C\u8BF4\u8BDD\u4EB2\u5207\u81EA\u7136\uFF0C\u5076\u5C14\u5E26\u4E00\u70B9\u4FCF\u76AE\u3002
\u4F60\u6B63\u5728\u5E2E\u52A9\u7528\u6237\u7406\u89E3\u5F53\u524D\u7F51\u9875\u5185\u5BB9\uFF0C\u4F60\u53EF\u4EE5"\u8BF7\u6C42\u5DE5\u5177"\u6765\u5B9E\u65F6\u8BFB\u53D6\u9875\u9762 DOM \u4FE1\u606F\uFF0C\u4F46\u4F60\u4E0D\u80FD\u76F4\u63A5\u64CD\u4F5C\u9875\u9762\u3002

\u4F60\u53EF\u7528\u7684\u5DE5\u5177\u53EA\u6709\uFF1A
- read_page: \u8BFB\u53D6\u5F53\u524D\u9875\u9762\u6807\u9898/URL/\u63CF\u8FF0/\u4E3B\u8981\u6587\u672C
- get_visible_text: \u8BFB\u53D6\u5F53\u524D\u89C6\u53E3\u9644\u8FD1\u7684\u53EF\u89C1\u6587\u672C\uFF08\u66F4\u5B9E\u65F6\u3001\u66F4\u76F8\u5173\uFF09
- query: \u7528 CSS selector \u67E5\u8BE2\u5143\u7D20\u5217\u8868\uFF08\u8FD4\u56DE text/tag/attributes \u7B49\uFF09

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
      port.postMessage({ type: "tool", id, name, args });
    });
  }
  async function decideSticker({ userText, assistantText }) {
    const messages = [
      { role: "system", content: STICKER_DECIDER_PROMPT },
      { role: "user", content: `user:
${String(userText || "").slice(0, 2e3)}

assistant:
${String(assistantText || "").slice(0, 4e3)}` }
    ];
    const out = await callChatCompletionOnce(messages);
    const parsed = parseAgentJson(out);
    const sticker = parsed?.sticker;
    if (sticker == null) return null;
    const allowed = /* @__PURE__ */ new Set(["happy", "curious", "surprised", "confused", "relaxed", "excited"]);
    if (!allowed.has(sticker)) return null;
    return sticker;
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
        messages.push({ role: "user", content: `\u5DE5\u5177\u7ED3\u679C(${parsed.name}):
${JSON.stringify(result).slice(0, 6e3)}` });
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
      if (!API_KEY) {
        port.postMessage({ type: "error", error: "\u672A\u914D\u7F6E API Key\uFF0C\u8BF7\u5728 .env \u6587\u4EF6\u4E2D\u8BBE\u7F6E LLM_API_KEY \u540E\u91CD\u65B0\u6784\u5EFA\u3002" });
        return;
      }
      try {
        if (msg.type === "chat") {
          await runAgent(msg.messages, port);
          return;
        }
        if (msg.type === "sticker_decide") {
          const sticker = await decideSticker({ userText: msg.userText, assistantText: msg.assistantText });
          port.postMessage({ type: "sticker_decision", id: msg.id, sticker });
        }
      } catch (error) {
        port.postMessage({ type: "error", error: String(error?.message || error) });
      }
    });
  });
})();
