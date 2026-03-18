(() => {
  if (window.top !== window) {
    return;
  }

  const ROOT_ID = "ys-floating-icon-extension-root";
  const STORAGE_KEY = "ys-floating-icon-position";
  const BUTTON_SIZE = 112;
  const EDGE_GAP = 20;
  const DIALOG_GAP = 12;

  if (document.getElementById(ROOT_ID)) {
    return;
  }

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const getDefaultPosition = () => ({
    x: Math.max(EDGE_GAP, window.innerWidth - BUTTON_SIZE - EDGE_GAP),
    y: clamp(Math.round(window.innerHeight * 0.22), EDGE_GAP, Math.max(EDGE_GAP, window.innerHeight - BUTTON_SIZE - EDGE_GAP))
  });

  const clampPosition = (position) => ({
    x: clamp(position.x, EDGE_GAP, Math.max(EDGE_GAP, window.innerWidth - BUTTON_SIZE - EDGE_GAP)),
    y: clamp(position.y, EDGE_GAP, Math.max(EDGE_GAP, window.innerHeight - BUTTON_SIZE - EDGE_GAP))
  });

  const host = document.createElement("div");
  host.id = ROOT_ID;

  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
    }

    .widget {
      position: absolute;
      left: 0;
      top: 0;
      width: ${BUTTON_SIZE}px;
      height: ${BUTTON_SIZE}px;
      pointer-events: none;
      transition: transform 140ms ease;
      will-change: left, top, transform;
    }

    .widget.dragging {
      transition: none;
    }

    .widget.hidden {
      opacity: 0;
      transform: scale(0.92);
      pointer-events: none;
    }

    .button {
      all: initial;
      box-sizing: border-box;
      display: block;
      width: 100%;
      height: 100%;
      cursor: grab;
      pointer-events: auto;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
      border: none;
      background: transparent;
      padding: 0;
      transition: transform 160ms ease, filter 160ms ease;
    }

    .button:hover {
      transform: translateY(-2px) scale(1.02);
      filter: drop-shadow(0 14px 28px rgba(21, 38, 23, 0.22));
    }

    .button:active,
    .widget.dragging .button {
      cursor: grabbing;
      transform: scale(1.04);
    }

    .avatar {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      pointer-events: none;
      -webkit-user-drag: none;
      filter: drop-shadow(0 10px 20px rgba(60, 82, 48, 0.24));
    }

    .dialog-overlay {
      position: fixed;
      inset: 0;
      pointer-events: auto;
      background: rgba(0, 0, 0, 0.22);
      opacity: 0;
      visibility: hidden;
      transition: opacity 160ms ease, visibility 160ms ease;
    }

    .dialog-overlay.open {
      opacity: 1;
      visibility: visible;
    }

    .dialog {
      position: fixed;
      left: ${EDGE_GAP}px;
      top: ${EDGE_GAP}px;
      width: min(420px, calc(100vw - ${EDGE_GAP * 2}px));
      height: min(520px, calc(100vh - ${EDGE_GAP * 2}px));
      min-width: 280px;
      min-height: 220px;
      max-width: calc(100vw - ${EDGE_GAP * 2}px);
      max-height: calc(100vh - ${EDGE_GAP * 2}px);
      resize: both;
      overflow: auto;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
      border: 1px solid rgba(255, 255, 255, 0.5);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
      color: rgba(20, 26, 22, 0.92);
      display: flex;
      flex-direction: column;
    }

    .dialog-header {
      position: sticky;
      top: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.78));
      border-bottom: 1px solid rgba(20, 26, 22, 0.08);
      cursor: move;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }

    .dialog-title {
      font-size: 14px;
      font-weight: 650;
      letter-spacing: 0.2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .icon-button {
      all: initial;
      box-sizing: border-box;
      pointer-events: auto;
      cursor: pointer;
      border: none;
      background: rgba(20, 26, 22, 0.06);
      color: rgba(20, 26, 22, 0.86);
      border-radius: 12px;
      padding: 8px 10px;
      font-size: 12px;
      line-height: 1;
      transition: transform 120ms ease, background 120ms ease;
      font-family: inherit;
    }

    .icon-button:hover {
      transform: translateY(-1px);
      background: rgba(20, 26, 22, 0.1);
    }

    .dialog-body {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px 14px;
      flex: 1;
      min-height: 0;
    }

    .messages {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 10px;
      border-radius: 14px;
      background: rgba(20, 26, 22, 0.045);
      border: 1px solid rgba(20, 26, 22, 0.08);
      font-size: 13px;
      line-height: 1.4;
    }

    .composer {
      display: flex;
      gap: 10px;
      align-items: flex-end;
    }

    .input {
      flex: 1;
      min-width: 0;
      resize: none;
      border-radius: 14px;
      border: 1px solid rgba(20, 26, 22, 0.12);
      background: rgba(255, 255, 255, 0.9);
      padding: 10px 12px;
      font-family: inherit;
      font-size: 13px;
      line-height: 1.35;
      outline: none;
    }

    .input:focus {
      border-color: rgba(70, 120, 90, 0.55);
      box-shadow: 0 0 0 4px rgba(70, 120, 90, 0.18);
    }

    .send {
      white-space: nowrap;
      font-weight: 650;
    }

  `;

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

  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-hidden", "true");

  const dialog = document.createElement("div");
  dialog.className = "dialog";
  dialog.addEventListener("pointerdown", (event) => event.stopPropagation());

  const header = document.createElement("div");
  header.className = "dialog-header";

  const title = document.createElement("div");
  title.className = "dialog-title";
  title.textContent = "对话框（占位）";

  const closeButton = document.createElement("button");
  closeButton.className = "icon-button";
  closeButton.type = "button";
  closeButton.textContent = "关闭";

  header.append(title, closeButton);

  const body = document.createElement("div");
  body.className = "dialog-body";

  const messages = document.createElement("div");
  messages.className = "messages";
  messages.textContent = "这里之后会显示聊天记录（你后面接入 AI 聊天即可）。";

  const composer = document.createElement("div");
  composer.className = "composer";

  const input = document.createElement("textarea");
  input.className = "input";
  input.rows = 2;
  input.placeholder = "输入内容（对话功能后续接入）";

  const sendButton = document.createElement("button");
  sendButton.className = "icon-button send";
  sendButton.type = "button";
  sendButton.textContent = "发送";

  composer.append(input, sendButton);
  body.append(messages, composer);
  dialog.append(header, body);
  overlay.appendChild(dialog);

  shadowRoot.append(style, wrapper, overlay);

  const mount = () => {
    const target = document.documentElement || document.body;

    if (!target) {
      requestAnimationFrame(mount);
      return;
    }

    target.appendChild(host);
  };

  mount();

  let position = getDefaultPosition();
  let dragState = null;
  let isDialogOpen = false;
  let pendingPointerDown = null;
  const DRAG_THRESHOLD_PX = 6;
  let dialogDragState = null;
  let dialogPosition = { left: EDGE_GAP, top: EDGE_GAP };
  let resizeObserver = null;

  const clampDialogPosition = (next, size) => {
    const maxLeft = Math.max(EDGE_GAP, window.innerWidth - size.width - EDGE_GAP);
    const maxTop = Math.max(EDGE_GAP, window.innerHeight - size.height - EDGE_GAP);
    return {
      left: clamp(next.left, EDGE_GAP, maxLeft),
      top: clamp(next.top, EDGE_GAP, maxTop)
    };
  };

  const applyDialogPosition = () => {
    dialog.style.left = `${dialogPosition.left}px`;
    dialog.style.top = `${dialogPosition.top}px`;
  };

  const measureDialogSize = () => {
    const rect = dialog.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };

  const computeDialogAnchorPosition = () => {
    const iconRect = wrapper.getBoundingClientRect();
    const size = measureDialogSize();

    // Prefer placing the dialog above the icon (aligned to icon's right edge),
    // otherwise place it below. Always clamp into viewport.
    const aboveTop = iconRect.top - DIALOG_GAP - size.height;
    const belowTop = iconRect.bottom + DIALOG_GAP;
    const preferAbove = aboveTop >= EDGE_GAP || belowTop > window.innerHeight - EDGE_GAP - size.height;

    const baseTop = preferAbove ? aboveTop : belowTop;
    const baseLeft = iconRect.right - size.width;

    dialogPosition = clampDialogPosition({ left: baseLeft, top: baseTop }, size);
    applyDialogPosition();
  };

  const clampDialogIntoViewport = () => {
    const size = measureDialogSize();
    dialogPosition = clampDialogPosition(dialogPosition, size);
    applyDialogPosition();
  };

  const setDialogOpen = (open) => {
    isDialogOpen = open;
    overlay.classList.toggle("open", open);
    overlay.setAttribute("aria-hidden", open ? "false" : "true");
    wrapper.classList.toggle("hidden", open);
    if (open) {
      requestAnimationFrame(() => {
        computeDialogAnchorPosition();
        input.focus();
      });
    }
  };

  const toggleDialog = () => setDialogOpen(!isDialogOpen);

  const render = () => {
    wrapper.style.left = `${position.x}px`;
    wrapper.style.top = `${position.y}px`;
  };

  const savePosition = async () => {
    try {
      // When the extension reloads/updates, the content script can briefly outlive
      // its extension context. In that case, storage calls throw "Extension context invalidated."
      // and there's nothing actionable to do.
      if (!chrome?.runtime?.id) {
        return;
      }

      await chrome.storage.local.set({ [STORAGE_KEY]: position });
    } catch (error) {
      const message = String(error?.message || error || "");
      if (message.includes("Extension context invalidated")) {
        return;
      }

      console.warn("Unable to save floating icon position.", error);
    }
  };

  const loadPosition = async () => {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);

      if (result?.[STORAGE_KEY] && Number.isFinite(result[STORAGE_KEY].x) && Number.isFinite(result[STORAGE_KEY].y)) {
        position = clampPosition(result[STORAGE_KEY]);
      }
    } catch (error) {
      console.warn("Unable to read floating icon position.", error);
    }

    render();
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

    position = clampPosition(nextValue);
    render();
  };

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

    const nextPosition = {
      x: event.clientX - dragState.offsetX,
      y: event.clientY - dragState.offsetY
    };

    position = clampPosition(nextPosition);
    render();
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

      position = clampPosition(position);
      render();
      await savePosition();
    } else {
      toggleDialog();
    }

    pendingPointerDown = null;
  };

  button.addEventListener("pointerdown", beginPointer);
  button.addEventListener("pointermove", movePointer);
  button.addEventListener("pointerup", endPointer);
  button.addEventListener("pointercancel", endPointer);
  button.addEventListener("dragstart", (event) => event.preventDefault());

  overlay.addEventListener("pointerdown", () => setDialogOpen(false));
  closeButton.addEventListener("click", () => setDialogOpen(false));
  sendButton.addEventListener("click", () => {
    input.value = "";
    input.focus();
  });

  window.addEventListener("resize", () => {
    position = clampPosition(position);
    render();
    if (isDialogOpen) {
      clampDialogIntoViewport();
    }
  });

  chrome.storage.onChanged.addListener(handleStorageChange);

  render();
  loadPosition();

  const beginDialogDrag = (event) => {
    if (!isDialogOpen || event.button !== 0) {
      return;
    }

    // Avoid dragging when interacting with header buttons.
    if (event.target === closeButton) {
      return;
    }

    const rect = dialog.getBoundingClientRect();
    dialogDragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    header.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveDialogDrag = (event) => {
    if (!dialogDragState || event.pointerId !== dialogDragState.pointerId) {
      return;
    }

    const size = measureDialogSize();
    const next = {
      left: event.clientX - dialogDragState.offsetX,
      top: event.clientY - dialogDragState.offsetY
    };
    dialogPosition = clampDialogPosition(next, size);
    applyDialogPosition();
  };

  const endDialogDrag = (event) => {
    if (!dialogDragState || event.pointerId !== dialogDragState.pointerId) {
      return;
    }

    dialogDragState = null;
    if (header.hasPointerCapture(event.pointerId)) {
      header.releasePointerCapture(event.pointerId);
    }
    clampDialogIntoViewport();
  };

  header.addEventListener("pointerdown", beginDialogDrag);
  header.addEventListener("pointermove", moveDialogDrag);
  header.addEventListener("pointerup", endDialogDrag);
  header.addEventListener("pointercancel", endDialogDrag);

  // Keep the dialog inside viewport while resizing (CSS resize handle).
  resizeObserver = new ResizeObserver(() => {
    if (!isDialogOpen) {
      return;
    }
    clampDialogIntoViewport();
  });
  resizeObserver.observe(dialog);
})();
