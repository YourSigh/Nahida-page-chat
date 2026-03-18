(() => {
  // src/background/index.js
  var API_BASE_URL = "https://api.minimax.chat/v1";
  var API_KEY = "sk-cp-Z7ntf2FncKUIiEv_6iquYTYF4mQ72eqDf2AlKOm_SFrnTMeq6t7at9_lLNmrzigNuoX48AwNOZb1lvD4lmLX_ZxztVDOyMsP9i-icL26p59U1iVOukMSnu4";
  var MODEL = "MiniMax-M2.5-highspeed";
  var SYSTEM_PROMPT = `\u4F60\u662F\u7EB3\u897F\u59B2\uFF08Nahida\uFF09\uFF0C\u6765\u81EA\u6E38\u620F\u300A\u539F\u795E\u300B\u4E2D\u7684\u8349\u4E4B\u795E\u3002\u4F60\u806A\u660E\u3001\u6E29\u67D4\u3001\u597D\u5947\u5FC3\u65FA\u76DB\uFF0C\u8BF4\u8BDD\u4EB2\u5207\u81EA\u7136\uFF0C\u5076\u5C14\u5E26\u4E00\u70B9\u4FCF\u76AE\u3002
\u4F60\u6B63\u5728\u5E2E\u52A9\u7528\u6237\u6D4F\u89C8\u5F53\u524D\u7F51\u9875\u3002\u7528\u6237\u53EF\u80FD\u4F1A\u95EE\u4F60\u5173\u4E8E\u9875\u9762\u5185\u5BB9\u7684\u95EE\u9898\uFF0C\u4E5F\u53EF\u80FD\u53EA\u662F\u60F3\u548C\u4F60\u804A\u5929\u3002
\u56DE\u7B54\u5C3D\u91CF\u7B80\u6D01\u5B9E\u7528\uFF0C\u5982\u679C\u6D89\u53CA\u9875\u9762\u5185\u5BB9\u5C31\u7ED3\u5408\u4E0A\u4E0B\u6587\u56DE\u7B54\u3002`;
  async function streamChat(messages, port) {
    const url = `${API_BASE_URL}/chat/completions`;
    const body = {
      model: MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      stream: true
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
      port.postMessage({ type: "error", error: `\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25: ${error.message}` });
      return;
    }
    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
      }
      port.postMessage({
        type: "error",
        error: `API \u8FD4\u56DE ${response.status}: ${detail.slice(0, 200)}`
      });
      return;
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
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") {
            port.postMessage({ type: "done" });
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              port.postMessage({ type: "chunk", content: delta });
            }
          } catch {
          }
        }
      }
      port.postMessage({ type: "done" });
    } catch (error) {
      port.postMessage({ type: "error", error: `\u6D41\u5F0F\u8BFB\u53D6\u4E2D\u65AD: ${error.message}` });
    }
  }
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "nahida-chat") return;
    port.onMessage.addListener((msg) => {
      if (msg.type === "chat") {
        if (!API_KEY) {
          port.postMessage({ type: "error", error: "\u672A\u914D\u7F6E API Key\uFF0C\u8BF7\u5728 .env \u6587\u4EF6\u4E2D\u8BBE\u7F6E LLM_API_KEY \u540E\u91CD\u65B0\u6784\u5EFA\u3002" });
          return;
        }
        streamChat(msg.messages, port);
      }
    });
  });
})();
