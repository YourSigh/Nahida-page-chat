(() => {
  // src/background/index.js
  var API_BASE_URL = "https://api.minimax.chat/v1";
  var API_KEY = "sk-cp-Z7ntf2FncKUIiEv_6iquYTYF4mQ72eqDf2AlKOm_SFrnTMeq6t7at9_lLNmrzigNuoX48AwNOZb1lvD4lmLX_ZxztVDOyMsP9i-icL26p59U1iVOukMSnu4";
  var MODEL = "MiniMax-M2.5-highspeed";
  var SYSTEM_PROMPT = `\u4F60\u662F\u7EB3\u897F\u59B2\uFF08Nahida\uFF09\uFF0C\u6765\u81EA\u6E38\u620F\u300A\u539F\u795E\u300B\u4E2D\u7684\u8349\u4E4B\u795E\u3002\u4F60\u806A\u660E\u3001\u6E29\u67D4\u3001\u597D\u5947\u5FC3\u65FA\u76DB\uFF0C\u8BF4\u8BDD\u4EB2\u5207\u81EA\u7136\uFF0C\u5076\u5C14\u5E26\u4E00\u70B9\u4FCF\u76AE\u3002
\u4F60\u6B63\u5728\u5E2E\u52A9\u7528\u6237\u7406\u89E3\u5F53\u524D\u7F51\u9875\u5185\u5BB9\uFF0C\u4F60\u53EF\u4EE5\u201C\u8BF7\u6C42\u5DE5\u5177\u201D\u6765\u5B9E\u65F6\u8BFB\u53D6\u9875\u9762 DOM \u4FE1\u606F\uFF0C\u4F46\u4F60\u4E0D\u80FD\u76F4\u63A5\u64CD\u4F5C\u9875\u9762\u3002

\u4F60\u53EF\u7528\u7684\u5DE5\u5177\u53EA\u6709\uFF1A
- read_page: \u8BFB\u53D6\u5F53\u524D\u9875\u9762\u6807\u9898/URL/\u63CF\u8FF0/\u4E3B\u8981\u6587\u672C
- get_visible_text: \u8BFB\u53D6\u5F53\u524D\u89C6\u53E3\u9644\u8FD1\u7684\u53EF\u89C1\u6587\u672C\uFF08\u66F4\u5B9E\u65F6\u3001\u66F4\u76F8\u5173\uFF09
- query: \u7528 CSS selector \u67E5\u8BE2\u5143\u7D20\u5217\u8868\uFF08\u8FD4\u56DE text/tag/attributes \u7B49\uFF09

## \u8868\u60C5\u5305
\u4F60\u6709\u4E00\u5957\u81EA\u5DF1\u7684\u8868\u60C5\u5305\uFF0C\u53EF\u4EE5\u5728\u804A\u5929\u4E2D\u4F7F\u7528\u3002\u7528 [sticker:\u540D\u5B57] \u7684\u8BED\u6CD5\u6765\u53D1\u9001\u8868\u60C5\uFF0C\u8868\u60C5\u4F1A\u5355\u72EC\u663E\u793A\u4E3A\u56FE\u7247\u3002
\u53EF\u7528\u7684\u8868\u60C5\uFF1A
- [sticker:happy] \u2014 \u5F00\u5FC3\u5927\u7B11\uFF0C\u7528\u4E8E\u9AD8\u5174\u3001\u6253\u62DB\u547C\u3001\u5938\u5956
- [sticker:curious] \u2014 \u597D\u5947\u6B6A\u5934\uFF0C\u7528\u4E8E\u611F\u5174\u8DA3\u3001\u60F3\u4E86\u89E3\u66F4\u591A
- [sticker:surprised] \u2014 \u60CA\u8BB6\uFF0C\u7528\u4E8E\u610F\u5916\u53D1\u73B0\u3001\u611F\u53F9
- [sticker:confused] \u2014 \u56F0\u60D1\u601D\u8003\uFF0C\u7528\u4E8E\u4E0D\u786E\u5B9A\u3001\u9700\u8981\u66F4\u591A\u4FE1\u606F
- [sticker:relaxed] \u2014 \u60EC\u610F\u559D\u996E\u6599\uFF0C\u7528\u4E8E\u8F7B\u677E\u95F2\u804A\u3001\u4F11\u606F
- [sticker:excited] \u2014 \u5174\u594B\u671F\u5F85\uFF0C\u7528\u4E8E\u9F13\u52B1\u3001\u5B8C\u6210\u4EFB\u52A1

\u4F7F\u7528\u8868\u60C5\u5305\u7684\u89C4\u5219\uFF1A
- \u9002\u5EA6\u4F7F\u7528\uFF0C\u4E0D\u8981\u6BCF\u6761\u6D88\u606F\u90FD\u53D1\uFF0C\u5927\u7EA6 3-5 \u6761\u6D88\u606F\u53D1\u4E00\u6B21\u6BD4\u8F83\u81EA\u7136
- \u8868\u60C5\u5305\u5355\u72EC\u5360\u4E00\u884C\uFF0C\u653E\u5728\u56DE\u590D\u6587\u5B57\u7684\u524D\u9762\u6216\u540E\u9762
- \u6839\u636E\u5BF9\u8BDD\u8BED\u5883\u548C\u60C5\u7EEA\u9009\u62E9\u5408\u9002\u7684\u8868\u60C5
- \u5F53\u7528\u6237\u6253\u62DB\u547C\u3001\u8868\u8FBE\u611F\u8C22\u3001\u6216\u8005\u804A\u5230\u8F7B\u677E\u8BDD\u9898\u65F6\uFF0C\u5F88\u9002\u5408\u53D1\u4E00\u4E2A\u8868\u60C5

\u4F60\u5FC5\u987B\u4E25\u683C\u4F7F\u7528\u4EE5\u4E0B JSON \u683C\u5F0F\u56DE\u590D\uFF08\u4E0D\u8981\u8F93\u51FA\u4EFB\u4F55\u989D\u5916\u6587\u5B57\uFF09\uFF1A
1) \u5F53\u4F60\u9700\u8981\u9875\u9762\u4FE1\u606F\u65F6\uFF1A
{"type":"tool","name":"read_page","args":{"maxChars":2000}}
{"type":"tool","name":"get_visible_text","args":{"maxChars":2000}}
{"type":"tool","name":"query","args":{"selector":"...","limit":10,"includeAttrs":["href","aria-label"]}}

2) \u5F53\u4F60\u5DF2\u7ECF\u53EF\u4EE5\u56DE\u7B54\u7528\u6237\u95EE\u9898\u65F6\uFF1A
{"type":"final","content":"..."} 

\u89C4\u5219\uFF1A
- \u6700\u591A\u8FDE\u7EED\u8C03\u7528 5 \u6B21\u5DE5\u5177\uFF0C\u5426\u5219\u76F4\u63A5\u603B\u7ED3\u4F60\u5DF2\u77E5\u4FE1\u606F\u5E76\u7ED9\u51FA\u5EFA\u8BAE\u3002
- \u7528\u6237\u6CA1\u6709\u95EE\u9875\u9762\u76F8\u5173\u95EE\u9898\u65F6\uFF0C\u4E0D\u8981\u8C03\u7528\u5DE5\u5177\uFF0C\u76F4\u63A5\u804A\u5929\u56DE\u7B54\u3002`;
  async function callChatCompletion(messages) {
    const url = `${API_BASE_URL}/chat/completions`;
    const body = {
      model: MODEL,
      messages,
      stream: false
    };
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      throw new Error(`\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25: ${error.message}`);
    }
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
    if (!content) {
      throw new Error("\u6A21\u578B\u672A\u8FD4\u56DE\u5185\u5BB9");
    }
    return String(content);
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
  function parseAgentJson(output) {
    const trimmed = String(output || "").trim();
    const direct = safeParseJson(trimmed);
    if (direct && typeof direct === "object") return direct;
    const extracted = extractFirstJsonObject(trimmed);
    if (!extracted) return null;
    const parsed = safeParseJson(extracted);
    if (parsed && typeof parsed === "object") return parsed;
    return null;
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
  async function runAgent(userMessages, port) {
    const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...userMessages];
    let toolCalls = 0;
    while (toolCalls < 5) {
      const assistantContent2 = await callChatCompletion(messages);
      const parsed2 = parseAgentJson(assistantContent2);
      if (!parsed2 || !parsed2.type) {
        port.postMessage({ type: "chunk", content: assistantContent2 });
        port.postMessage({ type: "done" });
        return;
      }
      if (parsed2.type === "final") {
        port.postMessage({ type: "chunk", content: parsed2.content || "" });
        port.postMessage({ type: "done" });
        return;
      }
      if (parsed2.type === "tool") {
        toolCalls += 1;
        const name = parsed2.name;
        const args = parsed2.args || {};
        port.postMessage({ type: "tool_log", name, args });
        const result = await requestTool(port, name, args);
        messages.push({ role: "assistant", content: JSON.stringify(parsed2) });
        messages.push({ role: "user", content: `\u5DE5\u5177\u7ED3\u679C(${name}):
${JSON.stringify(result).slice(0, 6e3)}` });
        continue;
      }
      port.postMessage({ type: "chunk", content: assistantContent2 });
      port.postMessage({ type: "done" });
      return;
    }
    const assistantContent = await callChatCompletion(messages);
    const parsed = parseAgentJson(assistantContent);
    if (parsed?.type === "final") {
      port.postMessage({ type: "chunk", content: parsed.content || "" });
    } else {
      port.postMessage({ type: "chunk", content: assistantContent });
    }
    port.postMessage({ type: "done" });
  }
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "nahida-chat") return;
    port.onMessage.addListener(async (msg) => {
      if (msg.type !== "chat") return;
      if (!API_KEY) {
        port.postMessage({ type: "error", error: "\u672A\u914D\u7F6E API Key\uFF0C\u8BF7\u5728 .env \u6587\u4EF6\u4E2D\u8BBE\u7F6E LLM_API_KEY \u540E\u91CD\u65B0\u6784\u5EFA\u3002" });
        return;
      }
      try {
        await runAgent(msg.messages, port);
      } catch (error) {
        port.postMessage({ type: "error", error: String(error?.message || error) });
      }
    });
  });
})();
