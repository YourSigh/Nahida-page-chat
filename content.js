(() => {
  // src/ui/styles.css
  var styles_default = ':host {\n  position: fixed;\n  inset: 0;\n  z-index: 2147483647;\n  pointer-events: none;\n}\n\n.widget {\n  position: absolute;\n  left: 0;\n  top: 0;\n  width: 112px;\n  height: 112px;\n  pointer-events: none;\n  transition: transform 140ms ease;\n  will-change: left, top, transform;\n}\n\n.widget.dragging {\n  transition: none;\n}\n\n.widget.hidden {\n  opacity: 0;\n  transform: scale(0.92);\n  pointer-events: none;\n}\n\n.button {\n  all: initial;\n  box-sizing: border-box;\n  display: block;\n  width: 100%;\n  height: 100%;\n  cursor: grab;\n  pointer-events: auto;\n  user-select: none;\n  -webkit-user-select: none;\n  touch-action: none;\n  border: none;\n  background: transparent;\n  padding: 0;\n  transition: transform 160ms ease, filter 160ms ease;\n}\n\n.button:hover {\n  transform: translateY(-2px) scale(1.02);\n  filter: drop-shadow(0 14px 28px rgba(21, 38, 23, 0.22));\n}\n\n.button:active,\n.widget.dragging .button {\n  cursor: grabbing;\n  transform: scale(1.04);\n}\n\n.avatar {\n  display: block;\n  width: 100%;\n  height: 100%;\n  object-fit: contain;\n  pointer-events: none;\n  -webkit-user-drag: none;\n  filter: drop-shadow(0 10px 20px rgba(60, 82, 48, 0.24));\n}\n\n.dialog-overlay {\n  position: fixed;\n  inset: 0;\n  pointer-events: auto;\n  background: rgba(0, 0, 0, 0.22);\n  opacity: 0;\n  visibility: hidden;\n  transition: opacity 160ms ease, visibility 160ms ease;\n}\n\n.dialog-overlay.open {\n  opacity: 1;\n  visibility: visible;\n}\n\n.dialog {\n  position: fixed;\n  left: 20px;\n  top: 20px;\n  width: min(420px, calc(100vw - 40px));\n  height: min(520px, calc(100vh - 40px));\n  min-width: 280px;\n  min-height: 220px;\n  max-width: calc(100vw - 40px);\n  max-height: calc(100vh - 40px);\n  resize: both;\n  overflow: auto;\n  border-radius: 18px;\n  background: rgba(255, 255, 255, 0.94);\n  backdrop-filter: blur(14px);\n  -webkit-backdrop-filter: blur(14px);\n  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);\n  border: 1px solid rgba(255, 255, 255, 0.5);\n  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial,\n    "Apple Color Emoji", "Segoe UI Emoji";\n  color: rgba(20, 26, 22, 0.92);\n  display: flex;\n  flex-direction: column;\n}\n\n.dialog-header {\n  position: sticky;\n  top: 0;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 12px 14px;\n  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.78));\n  border-bottom: 1px solid rgba(20, 26, 22, 0.08);\n  cursor: move;\n  user-select: none;\n  -webkit-user-select: none;\n  touch-action: none;\n}\n\n.dialog-title {\n  font-size: 14px;\n  font-weight: 650;\n  letter-spacing: 0.2px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.icon-button {\n  all: initial;\n  box-sizing: border-box;\n  pointer-events: auto;\n  cursor: pointer;\n  border: none;\n  background: rgba(20, 26, 22, 0.06);\n  color: rgba(20, 26, 22, 0.86);\n  border-radius: 12px;\n  padding: 8px 10px;\n  font-size: 12px;\n  line-height: 1;\n  transition: transform 120ms ease, background 120ms ease;\n  font-family: inherit;\n}\n\n.icon-button:hover {\n  transform: translateY(-1px);\n  background: rgba(20, 26, 22, 0.1);\n}\n\n.dialog-body {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  padding: 12px 14px;\n  flex: 1;\n  min-height: 0;\n}\n\n.messages {\n  flex: 1;\n  min-height: 0;\n  overflow: auto;\n  padding: 10px;\n  border-radius: 14px;\n  background: rgba(20, 26, 22, 0.045);\n  border: 1px solid rgba(20, 26, 22, 0.08);\n  font-size: 13px;\n  line-height: 1.4;\n}\n\n.composer {\n  display: flex;\n  gap: 10px;\n  align-items: flex-end;\n}\n\n.input {\n  flex: 1;\n  min-width: 0;\n  resize: none;\n  border-radius: 14px;\n  border: 1px solid rgba(20, 26, 22, 0.12);\n  background: rgba(255, 255, 255, 0.9);\n  padding: 10px 12px;\n  font-family: inherit;\n  font-size: 13px;\n  line-height: 1.35;\n  outline: none;\n}\n\n.input:focus {\n  border-color: rgba(70, 120, 90, 0.55);\n  box-shadow: 0 0 0 4px rgba(70, 120, 90, 0.18);\n}\n\n.send {\n  white-space: nowrap;\n  font-weight: 650;\n}\n\n';

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
    title.textContent = "\u5BF9\u8BDD\u6846\uFF08\u5360\u4F4D\uFF09";
    const closeButton = document.createElement("button");
    closeButton.className = "icon-button";
    closeButton.type = "button";
    closeButton.textContent = "\u5173\u95ED";
    header.append(title, closeButton);
    const body = document.createElement("div");
    body.className = "dialog-body";
    const messages = document.createElement("div");
    messages.className = "messages";
    messages.textContent = "\u8FD9\u91CC\u4E4B\u540E\u4F1A\u663E\u793A\u804A\u5929\u8BB0\u5F55\uFF08\u4F60\u540E\u9762\u63A5\u5165 AI \u804A\u5929\u5373\u53EF\uFF09\u3002";
    const composer = document.createElement("div");
    composer.className = "composer";
    const input = document.createElement("textarea");
    input.className = "input";
    input.rows = 2;
    input.placeholder = "\u8F93\u5165\u5185\u5BB9\uFF08\u5BF9\u8BDD\u529F\u80FD\u540E\u7EED\u63A5\u5165\uFF09";
    const sendButton = document.createElement("button");
    sendButton.className = "icon-button send";
    sendButton.type = "button";
    sendButton.textContent = "\u53D1\u9001";
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
    overlay.addEventListener("pointerdown", () => setDialogOpen(false));
    closeButton.addEventListener("click", () => setDialogOpen(false));
    sendButton.addEventListener("click", () => {
      input.value = "";
      input.focus();
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
      if (header.hasPointerCapture(event.pointerId)) {
        header.releasePointerCapture(event.pointerId);
      }
      clampDialogIntoViewport();
    };
    header.addEventListener("pointerdown", beginDialogDrag);
    header.addEventListener("pointermove", moveDialogDrag);
    header.addEventListener("pointerup", endDialogDrag);
    header.addEventListener("pointercancel", endDialogDrag);
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
