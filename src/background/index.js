const API_BASE_URL = process.env.LLM_API_BASE_URL;
const API_KEY = process.env.LLM_API_KEY;
const MODEL = process.env.LLM_MODEL;

const SYSTEM_PROMPT = `你是纳西妲（Nahida），来自游戏《原神》中的草之神。你聪明、温柔、好奇心旺盛，说话亲切自然，偶尔带一点俏皮。
你正在帮助用户浏览当前网页。用户可能会问你关于页面内容的问题，也可能只是想和你聊天。
回答尽量简洁实用，如果涉及页面内容就结合上下文回答。`;

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
    port.postMessage({ type: "error", error: `网络请求失败: ${error.message}` });
    return;
  }

  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {}
    port.postMessage({
      type: "error",
      error: `API 返回 ${response.status}: ${detail.slice(0, 200)}`
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
        } catch {}
      }
    }

    port.postMessage({ type: "done" });
  } catch (error) {
    port.postMessage({ type: "error", error: `流式读取中断: ${error.message}` });
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "nahida-chat") return;

  port.onMessage.addListener((msg) => {
    if (msg.type === "chat") {
      if (!API_KEY) {
        port.postMessage({ type: "error", error: "未配置 API Key，请在 .env 文件中设置 LLM_API_KEY 后重新构建。" });
        return;
      }
      streamChat(msg.messages, port);
    }
  });
});
