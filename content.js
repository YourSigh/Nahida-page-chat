(() => {
  // src/ui/styles.css
  var styles_default = ':host {\n  position: fixed;\n  inset: 0;\n  z-index: 2147483647;\n  pointer-events: none;\n}\n\n.widget {\n  position: absolute;\n  left: 0;\n  top: 0;\n  width: 112px;\n  height: 112px;\n  pointer-events: none;\n  transition: transform 140ms ease;\n  will-change: left, top, transform;\n}\n\n.widget.dragging {\n  transition: none;\n}\n\n.widget.hidden {\n  opacity: 0;\n  transform: scale(0.92);\n  pointer-events: none;\n}\n\n.button {\n  all: initial;\n  box-sizing: border-box;\n  display: block;\n  width: 100%;\n  height: 100%;\n  cursor: grab;\n  pointer-events: auto;\n  user-select: none;\n  -webkit-user-select: none;\n  touch-action: none;\n  border: none;\n  background: transparent;\n  padding: 0;\n  transition: transform 160ms ease, filter 160ms ease;\n}\n\n.button:hover {\n  transform: translateY(-2px) scale(1.02);\n  filter: drop-shadow(0 14px 28px rgba(21, 38, 23, 0.22));\n}\n\n.button:active,\n.widget.dragging .button {\n  cursor: grabbing;\n  transform: scale(1.04);\n}\n\n.avatar {\n  display: block;\n  width: 100%;\n  height: 100%;\n  object-fit: contain;\n  pointer-events: none;\n  -webkit-user-drag: none;\n  filter: drop-shadow(0 10px 20px rgba(60, 82, 48, 0.24));\n}\n\n.dialog {\n  position: fixed;\n  left: 20px;\n  top: 20px;\n  width: min(420px, calc(100vw - 40px));\n  height: min(520px, calc(100vh - 40px));\n  min-width: 280px;\n  min-height: 220px;\n  max-width: calc(100vw - 40px);\n  max-height: calc(100vh - 40px);\n  overflow: hidden;\n  border-radius: 18px;\n  background: rgba(255, 255, 255, 0.94);\n  backdrop-filter: blur(14px);\n  -webkit-backdrop-filter: blur(14px);\n  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);\n  border: 1px solid rgba(255, 255, 255, 0.5);\n  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial,\n    "Apple Color Emoji", "Segoe UI Emoji";\n  color: rgba(20, 26, 22, 0.92);\n  display: flex;\n  flex-direction: column;\n  pointer-events: auto;\n  opacity: 0;\n  visibility: hidden;\n  transform: translateY(6px) scale(0.99);\n  transition: opacity 160ms ease, visibility 160ms ease, transform 160ms ease;\n}\n\n.dialog.open {\n  opacity: 1;\n  visibility: visible;\n  transform: none;\n}\n\n.dialog.dragging .dialog-header {\n  cursor: grabbing;\n}\n\n.resize-handle {\n  position: absolute;\n  z-index: 10;\n  pointer-events: auto;\n  background: transparent;\n}\n\n.resize-handle.n,\n.resize-handle.s {\n  left: 10px;\n  right: 10px;\n  height: 10px;\n}\n\n.resize-handle.e,\n.resize-handle.w {\n  top: 10px;\n  bottom: 10px;\n  width: 10px;\n}\n\n.resize-handle.n {\n  top: -4px;\n  cursor: ns-resize;\n}\n\n.resize-handle.s {\n  bottom: -4px;\n  cursor: ns-resize;\n}\n\n.resize-handle.e {\n  right: -4px;\n  cursor: ew-resize;\n}\n\n.resize-handle.w {\n  left: -4px;\n  cursor: ew-resize;\n}\n\n.resize-handle.ne,\n.resize-handle.nw,\n.resize-handle.se,\n.resize-handle.sw {\n  width: 14px;\n  height: 14px;\n}\n\n.resize-handle.ne {\n  top: -5px;\n  right: -5px;\n  cursor: nesw-resize;\n}\n\n.resize-handle.nw {\n  top: -5px;\n  left: -5px;\n  cursor: nwse-resize;\n}\n\n.resize-handle.se {\n  bottom: -5px;\n  right: -5px;\n  cursor: nwse-resize;\n}\n\n.resize-handle.sw {\n  bottom: -5px;\n  left: -5px;\n  cursor: nesw-resize;\n}\n\n.dialog-header {\n  position: sticky;\n  top: 0;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 12px 14px;\n  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.78));\n  border-bottom: 1px solid rgba(20, 26, 22, 0.08);\n  cursor: move;\n  user-select: none;\n  -webkit-user-select: none;\n  touch-action: none;\n}\n\n.dialog-title {\n  font-size: 14px;\n  font-weight: 650;\n  letter-spacing: 0.2px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.icon-button {\n  all: initial;\n  box-sizing: border-box;\n  pointer-events: auto;\n  cursor: pointer;\n  border: none;\n  background: rgba(20, 26, 22, 0.06);\n  color: rgba(20, 26, 22, 0.86);\n  border-radius: 12px;\n  padding: 8px 10px;\n  font-size: 12px;\n  line-height: 1;\n  transition: transform 120ms ease, background 120ms ease;\n  font-family: inherit;\n}\n\n.icon-button:hover {\n  transform: translateY(-1px);\n  background: rgba(20, 26, 22, 0.1);\n}\n\n.dialog-body {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  padding: 12px 14px;\n  flex: 1;\n  min-height: 0;\n  overflow: hidden;\n}\n\n.messages {\n  flex: 1;\n  min-height: 0;\n  overflow-y: auto;\n  overflow-x: hidden;\n  padding: 10px 8px;\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  scroll-behavior: smooth;\n}\n\n.msg {\n  max-width: 85%;\n  padding: 8px 12px;\n  border-radius: 14px;\n  font-size: 13px;\n  line-height: 1.5;\n  word-break: break-word;\n  white-space: pre-wrap;\n}\n\n.msg.user {\n  align-self: flex-end;\n  background: linear-gradient(135deg, #6db082, #4a9960);\n  color: #fff;\n  border-bottom-right-radius: 4px;\n}\n\n.msg.assistant {\n  align-self: flex-start;\n  background: rgba(20, 26, 22, 0.06);\n  color: rgba(20, 26, 22, 0.92);\n  border-bottom-left-radius: 4px;\n}\n\n.msg.error {\n  align-self: center;\n  background: rgba(200, 50, 50, 0.08);\n  color: rgba(180, 40, 40, 0.9);\n  font-size: 12px;\n  text-align: center;\n}\n\n.msg-welcome {\n  text-align: center;\n  font-size: 12px;\n  color: rgba(20, 26, 22, 0.42);\n  padding: 20px 10px 6px;\n  line-height: 1.5;\n}\n\n.think-block {\n  margin-bottom: 6px;\n}\n\n.think-toggle {\n  all: initial;\n  box-sizing: border-box;\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  cursor: pointer;\n  font-family: inherit;\n  font-size: 11px;\n  color: rgba(20, 26, 22, 0.45);\n  padding: 2px 0;\n  user-select: none;\n  -webkit-user-select: none;\n}\n\n.think-toggle:hover {\n  color: rgba(20, 26, 22, 0.7);\n}\n\n.think-arrow {\n  display: inline-block;\n  font-size: 10px;\n  transition: transform 160ms ease;\n}\n\n.think-block.collapsed .think-arrow {\n  transform: rotate(-90deg);\n}\n\n.think-content {\n  margin-top: 4px;\n  padding: 6px 10px;\n  border-left: 2px solid rgba(20, 26, 22, 0.1);\n  font-size: 12px;\n  line-height: 1.5;\n  color: rgba(20, 26, 22, 0.5);\n  white-space: pre-wrap;\n  word-break: break-word;\n  max-height: 200px;\n  overflow-y: auto;\n  transition: max-height 200ms ease, opacity 200ms ease;\n}\n\n.think-block.collapsed .think-content {\n  max-height: 0;\n  overflow: hidden;\n  opacity: 0;\n  margin-top: 0;\n  padding-top: 0;\n  padding-bottom: 0;\n}\n\n.think-block.streaming .think-content {\n  max-height: none;\n}\n\n.reply-content {\n  white-space: pre-wrap;\n  word-break: break-word;\n}\n\n.typing-indicator {\n  display: inline-flex;\n  gap: 4px;\n  padding: 4px 0;\n}\n\n.typing-indicator span {\n  display: inline-block;\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  background: rgba(20, 26, 22, 0.3);\n  animation: typing-bounce 1.2s ease-in-out infinite;\n}\n\n.typing-indicator span:nth-child(2) {\n  animation-delay: 0.15s;\n}\n\n.typing-indicator span:nth-child(3) {\n  animation-delay: 0.3s;\n}\n\n@keyframes typing-bounce {\n  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }\n  30% { transform: translateY(-4px); opacity: 1; }\n}\n\n.composer {\n  display: flex;\n  gap: 8px;\n  align-items: flex-end;\n}\n\n.input {\n  flex: 1;\n  min-width: 0;\n  resize: none;\n  border-radius: 14px;\n  border: 1px solid rgba(20, 26, 22, 0.12);\n  background: rgba(255, 255, 255, 0.9);\n  padding: 10px 12px;\n  font-family: inherit;\n  font-size: 13px;\n  line-height: 1.35;\n  outline: none;\n}\n\n.input:focus {\n  border-color: rgba(70, 120, 90, 0.55);\n  box-shadow: 0 0 0 4px rgba(70, 120, 90, 0.18);\n}\n\n.input:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n\n.send {\n  white-space: nowrap;\n  font-weight: 650;\n}\n\n.send:disabled {\n  opacity: 0.4;\n  cursor: not-allowed;\n}\n\n';

  // src/utils/geometry.js
  var clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  var clampIconPosition = ({ x, y }, { edgeGap, buttonSize, viewportWidth, viewportHeight }) => ({
    x: clamp(x, edgeGap, Math.max(edgeGap, viewportWidth - buttonSize - edgeGap)),
    y: clamp(y, edgeGap, Math.max(edgeGap, viewportHeight - buttonSize - edgeGap))
  });
  var getDefaultIconPosition = ({ edgeGap, buttonSize, viewportWidth, viewportHeight }) => ({
    x: Math.max(edgeGap, viewportWidth - buttonSize - edgeGap),
    y: clamp(Math.round(viewportHeight * 0.22), edgeGap, Math.max(edgeGap, viewportHeight - buttonSize - edgeGap))
  });
  var clampDialogPosition = ({ left, top }, { edgeGap, viewportWidth, viewportHeight, dialogWidth, dialogHeight }) => {
    const maxLeft = Math.max(edgeGap, viewportWidth - dialogWidth - edgeGap);
    const maxTop = Math.max(edgeGap, viewportHeight - dialogHeight - edgeGap);
    return {
      left: clamp(left, edgeGap, maxLeft),
      top: clamp(top, edgeGap, maxTop)
    };
  };
  var computeAnchoredDialogPosition = ({
    iconRect,
    dialogWidth,
    dialogHeight,
    edgeGap,
    dialogGap,
    viewportWidth,
    viewportHeight
  }) => {
    const aboveTop = iconRect.top - dialogGap - dialogHeight;
    const belowTop = iconRect.bottom + dialogGap;
    const preferAbove = aboveTop >= edgeGap || belowTop > viewportHeight - edgeGap - dialogHeight;
    const baseTop = preferAbove ? aboveTop : belowTop;
    const baseLeft = iconRect.right - dialogWidth;
    return clampDialogPosition(
      { left: baseLeft, top: baseTop },
      { edgeGap, viewportWidth, viewportHeight, dialogWidth, dialogHeight }
    );
  };

  // src/storage/positionStorage.js
  var safeReadPosition = async (storageKey) => {
    try {
      const result = await chrome.storage.local.get(storageKey);
      const value = result?.[storageKey];
      if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) {
        return value;
      }
    } catch (error) {
      console.warn("Unable to read floating icon position.", error);
    }
    return null;
  };
  var safeWritePosition = async (storageKey, position) => {
    try {
      if (!chrome?.runtime?.id) {
        return;
      }
      await chrome.storage.local.set({ [storageKey]: position });
    } catch (error) {
      const message = String(error?.message || error || "");
      if (message.includes("Extension context invalidated")) {
        return;
      }
      console.warn("Unable to save floating icon position.", error);
    }
  };

  // src/content/index.js
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
    style.textContent = styles_default;
    const wrapper = document.createElement("div");
    wrapper.className = "widget";
    const button = document.createElement("button");
    button.className = "button";
    button.type = "button";
    button.setAttribute("aria-label", "\u9875\u9762\u60AC\u6D6E\u56FE\u6807");
    const image = document.createElement("img");
    image.className = "avatar";
    image.alt = "";
    image.draggable = false;
    const croppedPngIconUrl = chrome.runtime.getURL("assets/floating-icon-cropped.png");
    const svgIconUrl = chrome.runtime.getURL("assets/floating-icon.svg");
    const pngIconUrl = chrome.runtime.getURL("assets/floating-icon.png");
    image.src = croppedPngIconUrl;
    fetch(croppedPngIconUrl).then((response) => {
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
    }).catch(() => {
      fetch(pngIconUrl).then((response) => {
        if (response.ok) {
          image.src = pngIconUrl;
        } else {
          image.src = svgIconUrl;
        }
      }).catch(() => {
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
    title.textContent = "\u7EB3\u897F\u59B2";
    const closeButton = document.createElement("button");
    closeButton.className = "icon-button";
    closeButton.type = "button";
    closeButton.textContent = "\u5173\u95ED";
    header.append(title, closeButton);
    const body = document.createElement("div");
    body.className = "dialog-body";
    const messagesEl = document.createElement("div");
    messagesEl.className = "messages";
    const welcome = document.createElement("div");
    welcome.className = "msg-welcome";
    welcome.textContent = "\u4F60\u597D\u5440\uFF5E\u6211\u662F\u7EB3\u897F\u59B2\uFF01\u6709\u4EC0\u4E48\u6211\u53EF\u4EE5\u5E2E\u4F60\u7684\u5417\uFF1F";
    messagesEl.appendChild(welcome);
    const composer = document.createElement("div");
    composer.className = "composer";
    const input = document.createElement("textarea");
    input.className = "input";
    input.rows = 2;
    input.placeholder = "\u8F93\u5165\u6D88\u606F\uFF0CEnter \u53D1\u9001\uFF0CShift+Enter \u6362\u884C";
    const sendButton = document.createElement("button");
    sendButton.className = "icon-button send";
    sendButton.type = "button";
    sendButton.textContent = "\u53D1\u9001";
    composer.append(input, sendButton);
    body.append(messagesEl, composer);
    dialog.append(header, body);
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
      const parts = [`\u5F53\u524D\u9875\u9762\u6807\u9898\uFF1A${titleText}`, `URL\uFF1A${url}`];
      if (metaDesc) parts.push(`\u9875\u9762\u63CF\u8FF0\uFF1A${metaDesc}`);
      try {
        const mainEl = document.querySelector("main, article, [role='main']");
        const bodyText = (mainEl || document.body).innerText || "";
        const trimmed = bodyText.slice(0, 2e3).trim();
        if (trimmed) parts.push(`\u9875\u9762\u4E3B\u8981\u5185\u5BB9\uFF08\u622A\u53D6\u524D 2000 \u5B57\uFF09\uFF1A
${trimmed}`);
      } catch {
      }
      return parts.join("\n");
    };
    const sendChat = () => {
      const text = input.value.trim();
      if (!text || isStreaming) return;
      input.value = "";
      appendMessage("user", text);
      const pageContext = chatHistory.length === 0 ? getPageContext() : null;
      const userContent = pageContext ? `[\u4EE5\u4E0B\u662F\u7528\u6237\u5F53\u524D\u6D4F\u89C8\u7684\u9875\u9762\u4FE1\u606F]
${pageContext}

[\u7528\u6237\u7684\u95EE\u9898]
${text}` : text;
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
        toggle.innerHTML = '<span class="think-arrow">\u25BC</span> \u601D\u8003\u8FC7\u7A0B';
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
          thinkContentEl.textContent = thinkText;
          if (thinkClosed && !finished) {
            thinkBlockEl.classList.remove("streaming");
            thinkBlockEl.classList.add("collapsed");
          }
          if (finished && thinkClosed) {
            thinkBlockEl.classList.remove("streaming");
          }
        }
        const trimmedReply = replyText.replace(/^\n+/, "");
        if (trimmedReply || finished && thinkClosed) {
          ensureReplyContent();
          replyContentEl.textContent = trimmedReply;
        }
        scrollToBottom();
      };
      try {
        activePort = chrome.runtime.connect({ name: "nahida-chat" });
      } catch (error) {
        typingIndicator.remove();
        assistantEl.classList.replace("assistant", "error");
        assistantEl.textContent = `\u8FDE\u63A5\u6269\u5C55\u5931\u8D25: ${error.message}`;
        setInputEnabled(true);
        return;
      }
      activePort.onMessage.addListener((msg) => {
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
            assistantEl.textContent = "\uFF08\u7EB3\u897F\u59B2\u6CA1\u6709\u56DE\u590D\u5185\u5BB9\uFF09";
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
            assistantEl.classList.replace("assistant", "error");
            assistantEl.textContent = "\u8FDE\u63A5\u5DF2\u65AD\u5F00";
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
      if (resizeW) {
        const right = dialogResizeState.startLeft + dialogResizeState.startWidth;
        nextLeft = right - nextWidth;
      }
      if (resizeN) {
        const bottom = dialogResizeState.startTop + dialogResizeState.startHeight;
        nextTop = bottom - nextHeight;
      }
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
})();
