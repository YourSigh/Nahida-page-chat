import stylesText from "../ui/styles.css";
import MarkdownIt from "markdown-it";
import {
  clampIconPosition,
  computeAnchoredDialogPosition,
  getDefaultIconPosition,
  clampDialogPosition
} from "../utils/geometry.js";
import { safeReadPosition, safeWritePosition } from "../storage/positionStorage.js";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true
});

const STICKER_NAMES = ["happy", "curious", "surprised", "confused", "relaxed", "excited"];
const STICKER_URLS = {};
for (const name of STICKER_NAMES) {
  STICKER_URLS[name] = chrome.runtime.getURL(`assets/nahida/${name}.png`);
}

const STICKER_TAG_REGEX = /\[sticker:(\w+)\]/g;

const renderMarkdown = (text) => {
  const html = md.render(String(text || ""));
  return html.replace(
    STICKER_TAG_REGEX,
    (match, name) => {
      const url = STICKER_URLS[name];
      if (!url) return match;
      return `<img class="sticker" src="${url}" alt="${name}" title="${name}" />`;
    }
  );
};

const stripStickerTags = (text) => String(text || "").replace(STICKER_TAG_REGEX, "").trim();

const requestStickerDecision = ({ userText, assistantText }) => {
  const port = chrome.runtime.connect({ name: "nahida-chat" });
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try { port.disconnect(); } catch {}
      resolve(null);
    }, 12_000);

    const handler = (msg) => {
      if (msg?.type !== "sticker_decision" || msg?.id !== id) return;
      clearTimeout(timeout);
      port.onMessage.removeListener(handler);
      try { port.disconnect(); } catch {}
      resolve(msg.sticker || null);
    };

    port.onMessage.addListener(handler);
    port.postMessage({ type: "sticker_decide", id, userText, assistantText });
  });
};

(() => {
  if (window.top !== window) {
    return;
  }

  const ROOT_ID = "ys-floating-icon-extension-root";
  const STORAGE_KEY = "ys-floating-icon-position";
  const BUTTON_SIZE = 112;
  const EDGE_GAP = 20;
  const DIALOG_GAP = 12;
  const DRAG_THRESHOLD_PX = 6;

  if (document.getElementById(ROOT_ID)) {
    return;
  }

  const host = document.createElement("div");
  host.id = ROOT_ID;

  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = stylesText;

  const wrapper = document.createElement("div");
  wrapper.className = "widget";

  const button = document.createElement("button");
  button.className = "button";
  button.type = "button";
  button.setAttribute("aria-label", "页面悬浮图标");

  const image = document.createElement("img");
  image.className = "avatar";
  image.alt = "";
  image.draggable = false;
  const croppedPngIconUrl = chrome.runtime.getURL("assets/floating-icon-cropped.png");
  const pngIconUrl = chrome.runtime.getURL("assets/floating-icon.png");
  image.src = croppedPngIconUrl;

  fetch(croppedPngIconUrl)
    .then((response) => {
      if (response.ok) {
        image.src = croppedPngIconUrl;
        return;
      }
      image.src = pngIconUrl;
    })
    .catch(() => {
      image.src = pngIconUrl;
    });

  button.appendChild(image);
  wrapper.appendChild(button);

  const dialog = document.createElement("div");
  dialog.className = "dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "false");
  dialog.setAttribute("aria-hidden", "true");
  dialog.addEventListener("pointerdown", (event) => event.stopPropagation());
  dialog.addEventListener("click", (event) => event.stopPropagation());

  dialog.style.setProperty("--dialog-bg-url", `url(\"${chrome.runtime.getURL("assets/background.jpeg")}\")`);

  const header = document.createElement("div");
  header.className = "dialog-header";

  const title = document.createElement("div");
  title.className = "dialog-title";
  title.textContent = "纳西妲";

  const headerActions = document.createElement("div");
  headerActions.className = "dialog-actions";

  const settingsButton = document.createElement("button");
  settingsButton.className = "icon-button settings-button";
  settingsButton.type = "button";
  settingsButton.setAttribute("aria-label", "设置");
  const settingsImg = document.createElement("img");
  settingsImg.className = "settings-icon";
  settingsImg.alt = "";
  settingsImg.draggable = false;
  settingsImg.src = chrome.runtime.getURL("assets/setting.png");
  settingsButton.appendChild(settingsImg);

  const closeButton = document.createElement("button");
  closeButton.className = "icon-button close-button";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "关闭");

  const closeImg = document.createElement("img");
  closeImg.className = "close-icon";
  closeImg.alt = "";
  closeImg.draggable = false;
  closeImg.src = chrome.runtime.getURL("assets/close.png");
  closeButton.appendChild(closeImg);

  headerActions.append(settingsButton, closeButton);
  header.append(title, headerActions);

  const settingsPanel = document.createElement("div");
  settingsPanel.className = "settings-panel";
  settingsPanel.setAttribute("aria-hidden", "true");
  settingsPanel.addEventListener("pointerdown", (e) => e.stopPropagation());
  settingsPanel.addEventListener("click", (e) => e.stopPropagation());

  const body = document.createElement("div");
  body.className = "dialog-body";

  const settingsTitle = document.createElement("div");
  settingsTitle.className = "settings-title";
  settingsTitle.textContent = "大模型配置";

  const fieldBaseUrlLabel = document.createElement("label");
  fieldBaseUrlLabel.className = "settings-label";
  fieldBaseUrlLabel.textContent = "API Base URL";
  const fieldBaseUrl = document.createElement("input");
  fieldBaseUrl.className = "settings-input";
  fieldBaseUrl.type = "text";
  fieldBaseUrl.placeholder = "https://api.openai.com/v1";

  const fieldModelLabel = document.createElement("label");
  fieldModelLabel.className = "settings-label";
  fieldModelLabel.textContent = "Model";
  const fieldModel = document.createElement("input");
  fieldModel.className = "settings-input";
  fieldModel.type = "text";
  fieldModel.placeholder = "gpt-4o-mini";

  const fieldKeyLabel = document.createElement("label");
  fieldKeyLabel.className = "settings-label";
  fieldKeyLabel.textContent = "API Key";
  const fieldKey = document.createElement("input");
  fieldKey.className = "settings-input";
  fieldKey.type = "password";
  fieldKey.placeholder = "sk-...";

  const settingsHint = document.createElement("div");
  settingsHint.className = "settings-hint";
  settingsHint.textContent = "配置会保存在本地浏览器（chrome.storage.local），不会上传。";

  const settingsActions = document.createElement("div");
  settingsActions.className = "settings-actions";
  const settingsCancel = document.createElement("button");
  settingsCancel.className = "icon-button settings-cancel";
  settingsCancel.type = "button";
  settingsCancel.textContent = "取消";
  const settingsSave = document.createElement("button");
  settingsSave.className = "icon-button settings-save";
  settingsSave.type = "button";
  settingsSave.textContent = "保存";

  settingsActions.append(settingsCancel, settingsSave);
  settingsPanel.append(
    settingsTitle,
    fieldBaseUrlLabel, fieldBaseUrl,
    fieldModelLabel, fieldModel,
    fieldKeyLabel, fieldKey,
    settingsHint,
    settingsActions
  );

  const messagesEl = document.createElement("div");
  messagesEl.className = "messages";

  const welcome = document.createElement("div");
  welcome.className = "msg-welcome";
  welcome.textContent = "你好呀～我是纳西妲！有什么我可以帮你的吗？";
  messagesEl.appendChild(welcome);

  const composer = document.createElement("div");
  composer.className = "composer";

  const input = document.createElement("textarea");
  input.className = "input";
  input.rows = 2;
  input.placeholder = "输入消息，Enter 发送，Shift/⌘+Enter 换行";

  const sendButton = document.createElement("button");
  sendButton.className = "icon-button send";
  sendButton.type = "button";
  sendButton.setAttribute("aria-label", "发送");

  const sendImg = document.createElement("img");
  sendImg.className = "send-icon";
  sendImg.alt = "";
  sendImg.draggable = false;
  sendImg.src = chrome.runtime.getURL("assets/send.png");
  sendButton.appendChild(sendImg);

  composer.append(input, sendButton);
  body.append(messagesEl, composer);
  dialog.append(header, settingsPanel, body);

  // --- Chat state & logic ---
  const chatHistory = [];
  let isStreaming = false;
  let activePort = null;
  const STORAGE_KEY_LLM_CONFIG = "nahida_llm_config";
  const DEFAULT_LLM_CONFIG = {
    apiBaseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKey: ""
  };

  const setSettingsOpen = (open) => {
    settingsPanel.classList.toggle("open", open);
    settingsPanel.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      fieldKey.focus();
    } else {
      input.focus();
    }
  };

  const closeSettingsIfClickOutside = (event) => {
    if (!settingsPanel.classList.contains("open")) return;
    const path = event.composedPath?.() || [];
    if (path.includes(settingsPanel) || path.includes(settingsButton)) return;
    setSettingsOpen(false);
  };

  document.addEventListener("pointerdown", closeSettingsIfClickOutside, true);

  const loadLlmConfigIntoForm = async () => {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY_LLM_CONFIG);
      const cfg = data?.[STORAGE_KEY_LLM_CONFIG] || {};
      fieldBaseUrl.value = String(cfg.apiBaseUrl || DEFAULT_LLM_CONFIG.apiBaseUrl);
      fieldModel.value = String(cfg.model || DEFAULT_LLM_CONFIG.model);
      fieldKey.value = String(cfg.apiKey || DEFAULT_LLM_CONFIG.apiKey);
    } catch {
      fieldBaseUrl.value = DEFAULT_LLM_CONFIG.apiBaseUrl;
      fieldModel.value = DEFAULT_LLM_CONFIG.model;
      fieldKey.value = DEFAULT_LLM_CONFIG.apiKey;
    }
  };

  const saveLlmConfigFromForm = async () => {
    const next = {
      apiBaseUrl: String(fieldBaseUrl.value || "").trim() || DEFAULT_LLM_CONFIG.apiBaseUrl,
      model: String(fieldModel.value || "").trim() || DEFAULT_LLM_CONFIG.model,
      apiKey: String(fieldKey.value || "").trim()
    };
    await chrome.storage.local.set({ [STORAGE_KEY_LLM_CONFIG]: next });
    return next;
  };

  const ensureApiKeyOrOpenSettings = async () => {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY_LLM_CONFIG);
      const cfg = data?.[STORAGE_KEY_LLM_CONFIG] || {};
      const key = String(cfg.apiKey || "").trim();
      if (key) return true;
    } catch {}
    await loadLlmConfigIntoForm();
    setSettingsOpen(true);
    return false;
  };

  const scrollToBottom = () => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  const appendMessage = (role, text) => {
    const el = document.createElement("div");
    el.className = `msg ${role}`;
    el.textContent = text;
    messagesEl.appendChild(el);
    scrollToBottom();
    return el;
  };

  const setInputEnabled = (enabled) => {
    input.disabled = !enabled;
    sendButton.disabled = !enabled;
    isStreaming = !enabled;
  };

  const getPageContext = () => {
    const titleText = document.title || "";
    const metaDesc = document.querySelector('meta[name="description"]')?.content || "";
    const url = location.href;
    const parts = [`当前页面标题：${titleText}`, `URL：${url}`];
    if (metaDesc) parts.push(`页面描述：${metaDesc}`);

    try {
      const mainEl = document.querySelector("main, article, [role='main']");
      const bodyText = (mainEl || document.body).innerText || "";
      const trimmed = bodyText.slice(0, 2000).trim();
      if (trimmed) parts.push(`页面主要内容（截取前 2000 字）：\n${trimmed}`);
    } catch {}

    return parts.join("\n");
  };

  const sendRuntimeMessage = (payload) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
            return;
          }
          resolve(resp || {});
        });
      } catch (e) {
        resolve({ error: String(e?.message || e) });
      }
    });

  const tool_read_page = async ({ maxChars = 2000 } = {}) => {
    const titleText = document.title || "";
    const metaDesc = document.querySelector('meta[name="description"]')?.content || "";
    const url = location.href;
    let text = "";
    try {
      const mainEl = document.querySelector("main, article, [role='main']");
      const bodyText = (mainEl || document.body).innerText || "";
      text = bodyText.slice(0, maxChars).trim();
    } catch {}

    let iframeSupplement = "";
    let iframeCount = 0;
    try {
      const resp = await sendRuntimeMessage({
        type: "nahida_read_iframe_frames",
        maxPerFrame: Math.min(6000, maxChars)
      });
      const frames = resp.frames || [];
      iframeCount = frames.length;
      let budget = Math.max(0, maxChars - text.length - 40);
      for (const f of frames) {
        if (budget <= 0) break;
        const block = `\n\n[iframe 内]\nURL: ${f.url}\n标题: ${f.title || ""}\n---\n${f.text}`;
        const take = block.slice(0, budget);
        iframeSupplement += take;
        budget -= take.length;
      }
    } catch {}

    const merged = (text + iframeSupplement).slice(0, maxChars);
    return {
      title: titleText,
      url,
      description: metaDesc,
      text: merged,
      iframeSnapshotsMerged: iframeCount
    };
  };

  const getVisibleTextTopFrameOnly = ({ maxChars = 2000 } = {}) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const nodes = Array.from(
      document.querySelectorAll(
        "p, li, h1, h2, h3, h4, h5, h6, article, main, section, div, span, a, button, td, th"
      )
    ).slice(0, 800);
    const chunks = [];
    for (const el of nodes) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const visible = rect.bottom >= 0 && rect.right >= 0 && rect.top <= vh && rect.left <= vw;
      if (!visible) continue;
      const t = (el.innerText || el.textContent || "").trim();
      if (!t) continue;
      chunks.push(t.replace(/\s+/g, " "));
      if (chunks.join("\n").length >= maxChars) break;
    }
    return chunks.join("\n").slice(0, maxChars);
  };

  const tool_get_visible_text = async ({ maxChars = 2000 } = {}) => {
    const fallback = getVisibleTextTopFrameOnly({ maxChars });
    try {
      const resp = await sendRuntimeMessage({
        type: "nahida_visible_all_frames",
        maxPerFrame: Math.min(4000, Math.ceil(maxChars / 2))
      });
      if (resp.error || !resp.frames?.length) {
        return { url: location.href, text: fallback };
      }
      const parts = [];
      let budget = maxChars;
      for (const f of resp.frames) {
        if (!f?.text || budget <= 0) continue;
        const label = f.isTop ? "[顶栏 frame]" : "[子 frame]";
        const piece = `${label} ${f.url}\n${f.text}\n\n`;
        const take = piece.slice(0, budget);
        parts.push(take);
        budget -= take.length;
      }
      const merged = parts.join("").trim().slice(0, maxChars);
      return { url: location.href, text: merged || fallback };
    } catch {
      return { url: location.href, text: fallback };
    }
  };

  const tool_query_top_only = ({ selector, limit = 10, includeAttrs = [] } = {}) => {
    let elements = [];
    try {
      elements = Array.from(document.querySelectorAll(selector)).slice(0, Math.max(1, Math.min(50, limit)));
    } catch (e) {
      return { error: `selector 无效: ${String(e?.message || e)}` };
    }
    const results = elements.map((el) => {
      const attrs = {};
      for (const k of includeAttrs) {
        const v = el.getAttribute?.(k);
        if (v != null) attrs[k] = v;
      }
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName?.toLowerCase?.() || "",
        text: (el.innerText || el.textContent || "").trim().slice(0, 500),
        attrs,
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        frameUrl: location.href
      };
    });
    return { selector, count: results.length, results };
  };

  const tool_query = async ({ selector, limit = 10, includeAttrs = [] } = {}) => {
    if (!selector || typeof selector !== "string") {
      return { error: "selector 必填" };
    }
    const lim = Math.max(1, Math.min(50, limit));
    try {
      const resp = await sendRuntimeMessage({
        type: "nahida_query_all_frames",
        selector,
        limit: lim,
        includeAttrs
      });
      if (resp.error || !resp.perFrame?.length) {
        return tool_query_top_only({ selector, limit: lim, includeAttrs });
      }
      const merged = [];
      for (const pf of resp.perFrame) {
        if (pf.error) continue;
        for (const r of pf.results || []) {
          merged.push({ ...r, frameUrl: pf.url });
          if (merged.length >= lim) break;
        }
        if (merged.length >= lim) break;
      }
      if (!merged.length) {
        return tool_query_top_only({ selector, limit: lim, includeAttrs });
      }
      return { selector, count: merged.length, results: merged.slice(0, lim) };
    } catch (e) {
      return tool_query_top_only({ selector, limit: lim, includeAttrs });
    }
  };

  const runTool = async (name, args) => {
    if (name === "read_page") return tool_read_page(args);
    if (name === "get_visible_text") return tool_get_visible_text(args);
    if (name === "query") return tool_query(args);
    return { error: `未知工具: ${name}` };
  };

  const sendChat = () => {
    const text = input.value.trim();
    if (!text || isStreaming) return;
    ensureApiKeyOrOpenSettings().then((ok) => {
      if (!ok) return;
      doSendChat(text);
    });
  };

  const doSendChat = (text) => {

    input.value = "";
    appendMessage("user", text);

    const pageContext = chatHistory.length === 0 ? getPageContext() : null;

    const userContent = pageContext
      ? `[以下是用户当前浏览的页面信息]\n${pageContext}\n\n[用户的问题]\n${text}`
      : text;

    chatHistory.push({ role: "user", content: userContent });

    setInputEnabled(false);

    const assistantEl = document.createElement("div");
    assistantEl.className = "msg assistant";
    const typingIndicator = document.createElement("div");
    typingIndicator.className = "typing-indicator";
    typingIndicator.innerHTML = "<span></span><span></span><span></span>";
    assistantEl.appendChild(typingIndicator);
    messagesEl.appendChild(assistantEl);
    scrollToBottom();

    let rawResponse = "";
    let thinkBlockEl = null;
    let thinkContentEl = null;
    let replyContentEl = null;
    const turnUserText = text;

    const parseThinkAndReply = (raw) => {
      const OPEN = "\x00THINK_O\x00";
      const CLOSE = "\x00THINK_C\x00";
      const OPEN_HTML = "<think>";
      const OPEN_MD = "`think`";
      const CLOSE_HTML = "</think>";
      const CLOSE_MD = "`/think`";
      let work = String(raw)
        .split(OPEN_HTML).join(OPEN)
        .split(OPEN_MD).join(OPEN)
        .split(CLOSE_HTML).join(CLOSE)
        .split(CLOSE_MD).join(CLOSE);

      const openIdx = work.indexOf(OPEN);
      if (openIdx === -1) {
        return { thinkText: "", replyText: raw, thinkClosed: true };
      }

      const afterOpen = openIdx + OPEN.length;
      const closeIdx = work.indexOf(CLOSE, afterOpen);
      if (closeIdx === -1) {
        return { thinkText: work.slice(afterOpen), replyText: "", thinkClosed: false };
      }

      let thinkText = work.slice(afterOpen, closeIdx);
      let replyText = work.slice(closeIdx + CLOSE.length);
      let thinkClosed = true;

      while (true) {
        const o2 = replyText.indexOf(OPEN);
        if (o2 === -1) break;
        const after2 = o2 + OPEN.length;
        const c2 = replyText.indexOf(CLOSE, after2);
        if (c2 === -1) {
          thinkText += `\n\n${replyText.slice(after2)}`;
          replyText = replyText.slice(0, o2);
          thinkClosed = false;
          break;
        }
        thinkText += `\n\n${replyText.slice(after2, c2)}`;
        replyText = replyText.slice(0, o2) + replyText.slice(c2 + CLOSE.length);
      }

      replyText = replyText.split(OPEN).join("").split(CLOSE).join("").trim();

      return { thinkText, replyText, thinkClosed };
    };


    const ensureThinkBlock = () => {
      if (thinkBlockEl) return;
      thinkBlockEl = document.createElement("div");
      thinkBlockEl.className = "think-block streaming";

      const toggle = document.createElement("button");
      toggle.className = "think-toggle";
      toggle.innerHTML = '<span class="think-arrow">▼</span> 思考过程';
      toggle.addEventListener("click", () => {
        thinkBlockEl.classList.toggle("collapsed");
      });

      thinkContentEl = document.createElement("div");
      thinkContentEl.className = "think-content";

      thinkBlockEl.append(toggle, thinkContentEl);
      assistantEl.insertBefore(thinkBlockEl, assistantEl.firstChild);
    };

    const ensureReplyContent = () => {
      if (replyContentEl) return;
      replyContentEl = document.createElement("div");
      replyContentEl.className = "reply-content";
      assistantEl.appendChild(replyContentEl);
    };

    const renderStream = (finished) => {
      const { thinkText, replyText, thinkClosed } = parseThinkAndReply(rawResponse);

      if (thinkText) {
        ensureThinkBlock();
        thinkContentEl.innerHTML = renderMarkdown(thinkText);
        if (thinkClosed && !finished) {
          thinkBlockEl.classList.remove("streaming");
          thinkBlockEl.classList.add("collapsed");
        }
        if (finished && thinkClosed) {
          thinkBlockEl.classList.remove("streaming");
        }
      }

      const trimmedReply = replyText.replace(/^\n+/, "");
      if (trimmedReply || (finished && thinkClosed)) {
        ensureReplyContent();
        replyContentEl.innerHTML = renderMarkdown(trimmedReply);
      }

      scrollToBottom();
    };

    try {
      activePort = chrome.runtime.connect({ name: "nahida-chat" });
    } catch (error) {
      typingIndicator.remove();
      assistantEl.classList.replace("assistant", "error");
      assistantEl.textContent = `连接扩展失败: ${error.message}`;
      setInputEnabled(true);
      return;
    }

    activePort.onMessage.addListener((msg) => {
      if (msg?.type === "tool") {
        runTool(msg.name, msg.args)
          .then((result) => {
            activePort?.postMessage({ type: "tool_result", id: msg.id, result });
          })
          .catch((error) => {
            activePort?.postMessage({ type: "tool_result", id: msg.id, result: { error: String(error?.message || error) } });
          });
        return;
      }

      if (msg?.type === "tool_log") {
        // TODO: 可以在 UI 里显示工具调用日志（先不影响主流程）
        return;
      }

      if (msg.type === "chunk_reset") {
        if (typingIndicator.parentNode) typingIndicator.remove();
        rawResponse = String(msg.content ?? "");
        renderStream(false);
        return;
      }

      if (msg.type === "chunk") {
        if (typingIndicator.parentNode) typingIndicator.remove();
        rawResponse += msg.content;
        renderStream(false);
      } else if (msg.type === "done") {
        if (typingIndicator.parentNode) typingIndicator.remove();
        renderStream(true);
        const { replyText } = parseThinkAndReply(rawResponse);
        const reply = replyText.replace(/^\n+/, "");
        const cleanedReply = stripStickerTags(reply);
        if (!cleanedReply.trim() && !rawResponse.trim()) {
          if (!replyContentEl) {
            replyContentEl = document.createElement("div");
            replyContentEl.className = "reply-content";
            assistantEl.appendChild(replyContentEl);
          }
          replyContentEl.innerHTML = renderMarkdown("（纳西妲没有回复内容）");
        }

        if (replyContentEl) {
          replyContentEl.innerHTML = renderMarkdown(cleanedReply.replace(/^\n+/, ""));
        }

        chatHistory.push({ role: "assistant", content: cleanedReply || rawResponse });
        setInputEnabled(true);
        input.focus();

        requestStickerDecision({ userText: turnUserText, assistantText: cleanedReply })
          .then((stickerName) => {
            if (!stickerName || !STICKER_URLS[stickerName]) return;
            const bubble = document.createElement("div");
            bubble.className = "msg assistant sticker-msg";
            const img = document.createElement("img");
            img.className = "sticker";
            img.src = STICKER_URLS[stickerName];
            img.alt = stickerName;
            img.title = stickerName;
            bubble.appendChild(img);
            assistantEl.after(bubble);
            scrollToBottom();
          })
          .catch(() => {});

        activePort = null;
      } else if (msg.type === "error") {
        if (typingIndicator.parentNode) typingIndicator.remove();
        assistantEl.classList.replace("assistant", "error");
        if (msg.error === "missing_api_key") {
          assistantEl.textContent = "还没有配置 API Key～先去右上角设置一下吧。";
          loadLlmConfigIntoForm().then(() => setSettingsOpen(true)).catch(() => {});
        } else {
          assistantEl.textContent = msg.error;
        }
        setInputEnabled(true);
        activePort = null;
      }
    });

    activePort.onDisconnect.addListener(() => {
      if (isStreaming) {
        if (typingIndicator.parentNode) typingIndicator.remove();
        renderStream(true);
        const { replyText } = parseThinkAndReply(rawResponse);
        const reply = replyText.replace(/^\n+/, "");
        if (!reply.trim() && !rawResponse.trim()) {
          if (!replyContentEl) {
            replyContentEl = document.createElement("div");
            replyContentEl.className = "reply-content";
            assistantEl.appendChild(replyContentEl);
          }
          replyContentEl.innerHTML = renderMarkdown("连接已断开");
          chatHistory.push({ role: "assistant", content: "连接已断开" });
        } else {
          chatHistory.push({ role: "assistant", content: reply || rawResponse });
        }
        setInputEnabled(true);
        activePort = null;
      }
    });

    activePort.postMessage({ type: "chat", messages: chatHistory });
  };

  const resizeHandleDirs = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];
  const resizeHandles = resizeHandleDirs.map((dir) => {
    const handle = document.createElement("div");
    handle.className = `resize-handle ${dir}`;
    handle.dataset.dir = dir;
    return handle;
  });
  dialog.append(...resizeHandles);

  shadowRoot.append(style, wrapper, dialog);

  const mount = () => {
    const target = document.documentElement || document.body;
    if (!target) {
      requestAnimationFrame(mount);
      return;
    }
    target.appendChild(host);
  };
  mount();

  const viewport = () => ({ viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });

  let iconPosition = getDefaultIconPosition({
    edgeGap: EDGE_GAP,
    buttonSize: BUTTON_SIZE,
    ...viewport()
  });

  let dragState = null;
  let pendingPointerDown = null;
  let isDialogOpen = false;

  let dialogDragState = null;
  let dialogPosition = { left: EDGE_GAP, top: EDGE_GAP };
  let dialogResizeState = null;

  const MIN_DIALOG_WIDTH = 280;
  const MIN_DIALOG_HEIGHT = 220;

  const renderIcon = () => {
    wrapper.style.left = `${iconPosition.x}px`;
    wrapper.style.top = `${iconPosition.y}px`;
  };

  const measureDialogSize = () => {
    const rect = dialog.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };

  const applyDialogPosition = () => {
    dialog.style.left = `${dialogPosition.left}px`;
    dialog.style.top = `${dialogPosition.top}px`;
  };

  const applyDialogSize = (size) => {
    dialog.style.width = `${size.width}px`;
    dialog.style.height = `${size.height}px`;
  };

  const clampDialogIntoViewport = () => {
    const size = measureDialogSize();
    dialogPosition = clampDialogPosition(
      dialogPosition,
      {
        edgeGap: EDGE_GAP,
        dialogWidth: size.width,
        dialogHeight: size.height,
        ...viewport()
      }
    );
    applyDialogPosition();
  };

  const computeDialogAnchorPosition = () => {
    const iconRect = wrapper.getBoundingClientRect();
    const size = measureDialogSize();
    dialogPosition = computeAnchoredDialogPosition({
      iconRect,
      dialogWidth: size.width,
      dialogHeight: size.height,
      edgeGap: EDGE_GAP,
      dialogGap: DIALOG_GAP,
      ...viewport()
    });
    applyDialogPosition();
  };

  let closeAnimationToken = 0;

  const setDialogOpen = (open) => {
    closeAnimationToken += 1;
    const token = closeAnimationToken;
    isDialogOpen = open;
    dialog.setAttribute("aria-hidden", open ? "false" : "true");
    wrapper.classList.toggle("hidden", open);
    if (open) {
      enableKeyboardIsolation();
      dialog.classList.add("open");
      // Force a reflow so the transition reliably runs, then show.
      // This avoids a one-frame state where the dialog is present but not interactable.
      // eslint-disable-next-line no-unused-expressions
      dialog.offsetWidth;
      if (token !== closeAnimationToken) return;
      dialog.classList.add("visible");
      computeDialogAnchorPosition();
      input.focus();
    } else {
      disableKeyboardIsolation();
      dialog.classList.remove("visible");
      const finishClose = () => {
        if (token !== closeAnimationToken) return;
        dialog.classList.remove("open");
      };

      // If transition doesn't run (e.g. already hidden), close immediately.
      const computed = getComputedStyle(dialog);
      const duration = parseFloat(computed.transitionDuration) || 0;
      if (duration <= 0) {
        finishClose();
        return;
      }

      const onEnd = (event) => {
        if (event.target !== dialog) return;
        dialog.removeEventListener("transitionend", onEnd);
        finishClose();
      };
      dialog.addEventListener("transitionend", onEnd);
    }
  };

  const toggleDialog = () => setDialogOpen(!isDialogOpen);

  const beginPointer = (event) => {
    if (event.button !== 0) {
      return;
    }
    const rect = wrapper.getBoundingClientRect();
    pendingPointerDown = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
  };

  const movePointer = (event) => {
    if (!pendingPointerDown || event.pointerId !== pendingPointerDown.pointerId) {
      return;
    }

    if (!dragState) {
      const dx = event.clientX - pendingPointerDown.startX;
      const dy = event.clientY - pendingPointerDown.startY;
      if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        event.preventDefault();
        dragState = { ...pendingPointerDown };
        wrapper.classList.add("dragging");
        button.setPointerCapture(event.pointerId);
      } else {
        return;
      }
    }

    iconPosition = clampIconPosition(
      { x: event.clientX - dragState.offsetX, y: event.clientY - dragState.offsetY },
      { edgeGap: EDGE_GAP, buttonSize: BUTTON_SIZE, ...viewport() }
    );
    renderIcon();
  };

  const endPointer = async (event) => {
    if (!pendingPointerDown || event.pointerId !== pendingPointerDown.pointerId) {
      return;
    }

    if (dragState) {
      dragState = null;
      wrapper.classList.remove("dragging");
      if (button.hasPointerCapture(event.pointerId)) {
        button.releasePointerCapture(event.pointerId);
      }
      iconPosition = clampIconPosition(iconPosition, { edgeGap: EDGE_GAP, buttonSize: BUTTON_SIZE, ...viewport() });
      renderIcon();
      await safeWritePosition(STORAGE_KEY, iconPosition);
    } else {
      toggleDialog();
    }

    pendingPointerDown = null;
  };

  const handleStorageChange = (changes, areaName) => {
    if (areaName !== "local") {
      return;
    }
    const change = changes?.[STORAGE_KEY];
    const nextValue = change?.newValue;
    if (!nextValue || !Number.isFinite(nextValue.x) || !Number.isFinite(nextValue.y)) {
      return;
    }
    iconPosition = clampIconPosition(nextValue, { edgeGap: EDGE_GAP, buttonSize: BUTTON_SIZE, ...viewport() });
    renderIcon();
  };

  button.addEventListener("pointerdown", beginPointer);
  button.addEventListener("pointermove", movePointer);
  button.addEventListener("pointerup", endPointer);
  button.addEventListener("pointercancel", endPointer);
  button.addEventListener("dragstart", (event) => event.preventDefault());

  closeButton.addEventListener("click", () => setDialogOpen(false));
  settingsButton.addEventListener("click", async () => {
    await loadLlmConfigIntoForm();
    setSettingsOpen(true);
  });
  settingsCancel.addEventListener("click", () => setSettingsOpen(false));
  settingsSave.addEventListener("click", async () => {
    try {
      const next = await saveLlmConfigFromForm();
      if (!next.apiKey) {
        // stay open until key is set
        return;
      }
      setSettingsOpen(false);
    } catch {}
  });
  sendButton.addEventListener("click", () => sendChat());

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendChat();
    }
  });

  let keyboardIsolationEnabled = false;
  let imeComposing = false;

  input.addEventListener("compositionstart", () => {
    imeComposing = true;
  });
  input.addEventListener("compositionend", () => {
    imeComposing = false;
  });

  const keyboardIsolationHandler = (event) => {
    if (!isDialogOpen) return;
    const activeEl = shadowRoot.activeElement;
    const isEditable =
      activeEl === input ||
      (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA"));
    if (!isEditable) return;
    const path = event.composedPath?.() || [];
    if (!path.includes(dialog)) return;

    // Cmd+Enter -> newline (not send).
    if (
      event.type === "keydown" &&
      event.key === "Enter" &&
      event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = `${input.value.slice(0, start)}\n${input.value.slice(end)}`;
      const nextPos = start + 1;
      input.setSelectionRange(nextPos, nextPos);
      input.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertLineBreak", data: "\n" }));
      return;
    }

    // Handle "Enter to send" here because we intercept keyboard events in capture phase.
    if (
      event.type === "keydown" &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.isComposing &&
      !imeComposing
    ) {
      if (activeEl !== input) {
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      sendChat();
      return;
    }

    event.stopPropagation();
    event.stopImmediatePropagation?.();

    if (event.key === "Escape") {

      if (!event.isComposing && !imeComposing) {
        event.preventDefault();
        setDialogOpen(false);
      }
    }
  };

  const enableKeyboardIsolation = () => {
    if (keyboardIsolationEnabled) return;
    keyboardIsolationEnabled = true;
    document.addEventListener("keydown", keyboardIsolationHandler, true);
    document.addEventListener("keyup", keyboardIsolationHandler, true);
    document.addEventListener("keypress", keyboardIsolationHandler, true);
  };

  const disableKeyboardIsolation = () => {
    if (!keyboardIsolationEnabled) return;
    keyboardIsolationEnabled = false;
    document.removeEventListener("keydown", keyboardIsolationHandler, true);
    document.removeEventListener("keyup", keyboardIsolationHandler, true);
    document.removeEventListener("keypress", keyboardIsolationHandler, true);
  };

  window.addEventListener("resize", () => {
    iconPosition = clampIconPosition(iconPosition, { edgeGap: EDGE_GAP, buttonSize: BUTTON_SIZE, ...viewport() });
    renderIcon();
    if (isDialogOpen) {
      clampDialogIntoViewport();
    }
  });

  const beginDialogDrag = (event) => {
    if (!isDialogOpen || event.button !== 0) {
      return;
    }
    if (closeButton.contains(event.target)) {
      return;
    }
    if (settingsButton.contains(event.target)) {
      return;
    }
    const rect = dialog.getBoundingClientRect();
    dialogDragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    dialog.classList.add("dragging");
    header.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveDialogDrag = (event) => {
    if (!dialogDragState || event.pointerId !== dialogDragState.pointerId) {
      return;
    }
    const size = measureDialogSize();
    dialogPosition = clampDialogPosition(
      { left: event.clientX - dialogDragState.offsetX, top: event.clientY - dialogDragState.offsetY },
      {
        edgeGap: EDGE_GAP,
        dialogWidth: size.width,
        dialogHeight: size.height,
        ...viewport()
      }
    );
    applyDialogPosition();
  };

  const endDialogDrag = (event) => {
    if (!dialogDragState || event.pointerId !== dialogDragState.pointerId) {
      return;
    }
    dialogDragState = null;
    dialog.classList.remove("dragging");
    if (header.hasPointerCapture(event.pointerId)) {
      header.releasePointerCapture(event.pointerId);
    }
    clampDialogIntoViewport();
  };

  header.addEventListener("pointerdown", beginDialogDrag);
  header.addEventListener("pointermove", moveDialogDrag);
  header.addEventListener("pointerup", endDialogDrag);
  header.addEventListener("pointercancel", endDialogDrag);

  const startDialogResize = (event) => {
    if (!isDialogOpen || event.button !== 0) {
      return;
    }
    const handle = event.currentTarget;
    const dir = handle?.dataset?.dir;
    if (!dir) {
      return;
    }

    const rect = dialog.getBoundingClientRect();
    dialogResizeState = {
      pointerId: event.pointerId,
      dir,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      startWidth: rect.width,
      startHeight: rect.height
    };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveDialogResize = (event) => {
    if (!dialogResizeState || event.pointerId !== dialogResizeState.pointerId) {
      return;
    }

    const { viewportWidth, viewportHeight } = viewport();
    const maxWidth = Math.max(MIN_DIALOG_WIDTH, viewportWidth - EDGE_GAP * 2);
    const maxHeight = Math.max(MIN_DIALOG_HEIGHT, viewportHeight - EDGE_GAP * 2);

    const dx = event.clientX - dialogResizeState.startX;
    const dy = event.clientY - dialogResizeState.startY;
    const dir = dialogResizeState.dir;

    let nextLeft = dialogResizeState.startLeft;
    let nextTop = dialogResizeState.startTop;
    let nextWidth = dialogResizeState.startWidth;
    let nextHeight = dialogResizeState.startHeight;

    const resizeE = dir.includes("e");
    const resizeW = dir.includes("w");
    const resizeS = dir.includes("s");
    const resizeN = dir.includes("n");

    if (resizeE) {
      nextWidth = dialogResizeState.startWidth + dx;
    }
    if (resizeS) {
      nextHeight = dialogResizeState.startHeight + dy;
    }
    if (resizeW) {
      nextWidth = dialogResizeState.startWidth - dx;
      nextLeft = dialogResizeState.startLeft + dx;
    }
    if (resizeN) {
      nextHeight = dialogResizeState.startHeight - dy;
      nextTop = dialogResizeState.startTop + dy;
    }

    nextWidth = Math.min(Math.max(nextWidth, MIN_DIALOG_WIDTH), maxWidth);
    nextHeight = Math.min(Math.max(nextHeight, MIN_DIALOG_HEIGHT), maxHeight);

    // When resizing from W/N and clamped, keep the opposite edge fixed.
    if (resizeW) {
      const right = dialogResizeState.startLeft + dialogResizeState.startWidth;
      nextLeft = right - nextWidth;
    }
    if (resizeN) {
      const bottom = dialogResizeState.startTop + dialogResizeState.startHeight;
      nextTop = bottom - nextHeight;
    }

    // Clamp position so dialog stays within viewport with EDGE_GAP.
    nextLeft = Math.min(Math.max(nextLeft, EDGE_GAP), viewportWidth - EDGE_GAP - nextWidth);
    nextTop = Math.min(Math.max(nextTop, EDGE_GAP), viewportHeight - EDGE_GAP - nextHeight);

    dialogPosition = { left: nextLeft, top: nextTop };
    applyDialogPosition();
    applyDialogSize({ width: nextWidth, height: nextHeight });
  };

  const endDialogResize = (event) => {
    if (!dialogResizeState || event.pointerId !== dialogResizeState.pointerId) {
      return;
    }
    const handle = event.currentTarget;
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    dialogResizeState = null;
    clampDialogIntoViewport();
  };

  resizeHandles.forEach((handle) => {
    handle.addEventListener("pointerdown", startDialogResize);
    handle.addEventListener("pointermove", moveDialogResize);
    handle.addEventListener("pointerup", endDialogResize);
    handle.addEventListener("pointercancel", endDialogResize);
  });

  const resizeObserver = new ResizeObserver(() => {
    if (!isDialogOpen) {
      return;
    }
    clampDialogIntoViewport();
  });
  resizeObserver.observe(dialog);

  chrome.storage.onChanged.addListener(handleStorageChange);

  const bootstrap = async () => {
    renderIcon();
    const stored = await safeReadPosition(STORAGE_KEY);
    if (stored) {
      iconPosition = clampIconPosition(stored, { edgeGap: EDGE_GAP, buttonSize: BUTTON_SIZE, ...viewport() });
      renderIcon();
    }
  };

  bootstrap();
})();

