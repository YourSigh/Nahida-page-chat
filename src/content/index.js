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

const renderMarkdown = (text) => md.render(String(text || ""));

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
  const svgIconUrl = chrome.runtime.getURL("assets/floating-icon.svg");
  const pngIconUrl = chrome.runtime.getURL("assets/floating-icon.png");
  image.src = croppedPngIconUrl;

  fetch(croppedPngIconUrl)
    .then((response) => {
      if (response.ok) {
        image.src = croppedPngIconUrl;
        return;
      }

      return fetch(pngIconUrl).then((pngResponse) => {
        if (pngResponse.ok) {
          image.src = pngIconUrl;
        } else {
          image.src = svgIconUrl;
        }
      });
    })
    .catch(() => {
      fetch(pngIconUrl)
        .then((response) => {
          if (response.ok) {
            image.src = pngIconUrl;
          } else {
            image.src = svgIconUrl;
          }
        })
        .catch(() => {
          image.src = svgIconUrl;
        });
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

  const header = document.createElement("div");
  header.className = "dialog-header";

  const title = document.createElement("div");
  title.className = "dialog-title";
  title.textContent = "纳西妲";

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

  header.append(title, closeButton);

  const body = document.createElement("div");
  body.className = "dialog-body";

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
  input.placeholder = "输入消息，Enter 发送，Shift+Enter 换行";

  const sendButton = document.createElement("button");
  sendButton.className = "icon-button send";
  sendButton.type = "button";
  sendButton.textContent = "发送";

  composer.append(input, sendButton);
  body.append(messagesEl, composer);
  dialog.append(header, body);

  // --- Chat state & logic ---
  const chatHistory = [];
  let isStreaming = false;
  let activePort = null;

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

  const tool_read_page = ({ maxChars = 2000 } = {}) => {
    const titleText = document.title || "";
    const metaDesc = document.querySelector('meta[name="description"]')?.content || "";
    const url = location.href;
    let text = "";
    try {
      const mainEl = document.querySelector("main, article, [role='main']");
      const bodyText = (mainEl || document.body).innerText || "";
      text = bodyText.slice(0, maxChars).trim();
    } catch {}
    return { title: titleText, url, description: metaDesc, text };
  };

  const tool_get_visible_text = ({ maxChars = 2000 } = {}) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const nodes = Array.from(document.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, article, main, section, div, span, a, button"))
      .slice(0, 800);
    const chunks = [];
    for (const el of nodes) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const visible = rect.bottom >= 0 && rect.right >= 0 && rect.top <= vh && rect.left <= vw;
      if (!visible) continue;
      const t = (el.innerText || el.textContent || "").trim();
      if (!t) continue;
      chunks.push(t.replace(/\s+/g, " "));
      const joined = chunks.join("\n");
      if (joined.length >= maxChars) break;
    }
    const text = chunks.join("\n").slice(0, maxChars);
    return { url: location.href, text };
  };

  const tool_query = ({ selector, limit = 10, includeAttrs = [] } = {}) => {
    if (!selector || typeof selector !== "string") {
      return { error: "selector 必填" };
    }
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
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
      };
    });
    return { selector, count: results.length, results };
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

    const parseThinkAndReply = (raw) => {
      const openTag = "<think>";
      const closeTag = "</think>";
      let thinkText = "";
      let replyText = "";
      let thinkClosed = false;

      const openIdx = raw.indexOf(openTag);
      if (openIdx === -1) {
        return { thinkText: "", replyText: raw, thinkClosed: true };
      }

      const afterOpen = openIdx + openTag.length;
      const closeIdx = raw.indexOf(closeTag, afterOpen);
      if (closeIdx === -1) {
        thinkText = raw.slice(afterOpen);
        thinkClosed = false;
        replyText = "";
      } else {
        thinkText = raw.slice(afterOpen, closeIdx);
        thinkClosed = true;
        replyText = raw.slice(closeIdx + closeTag.length);
      }

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

      if (msg.type === "chunk") {
        if (typingIndicator.parentNode) typingIndicator.remove();
        rawResponse += msg.content;
        renderStream(false);
      } else if (msg.type === "done") {
        if (typingIndicator.parentNode) typingIndicator.remove();
        renderStream(true);
        const { replyText } = parseThinkAndReply(rawResponse);
        const reply = replyText.replace(/^\n+/, "");
        if (!reply.trim() && !rawResponse.trim()) {
          // 只有思考过程时，给一个兜底提示
          if (!replyContentEl) {
            // eslint-disable-next-line no-inner-declarations
            replyContentEl = document.createElement("div");
            replyContentEl.className = "reply-content";
            assistantEl.appendChild(replyContentEl);
          }
          replyContentEl.innerHTML = renderMarkdown("（纳西妲没有回复内容）");
        }
        chatHistory.push({ role: "assistant", content: reply || rawResponse });
        setInputEnabled(true);
        activePort = null;
        input.focus();
      } else if (msg.type === "error") {
        if (typingIndicator.parentNode) typingIndicator.remove();
        assistantEl.classList.replace("assistant", "error");
        assistantEl.textContent = msg.error;
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

  const setDialogOpen = (open) => {
    isDialogOpen = open;
    dialog.classList.toggle("open", open);
    dialog.setAttribute("aria-hidden", open ? "false" : "true");
    wrapper.classList.toggle("hidden", open);
    if (open) {
      requestAnimationFrame(() => {
        computeDialogAnchorPosition();
        input.focus();
      });
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
  sendButton.addEventListener("click", () => sendChat());

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendChat();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (!isDialogOpen) {
      return;
    }
    if (event.key === "Escape") {
      setDialogOpen(false);
    }
  });

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
    if (event.target === closeButton) {
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

