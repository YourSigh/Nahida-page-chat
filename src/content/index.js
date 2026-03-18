import stylesText from "../ui/styles.css";
import {
  clampIconPosition,
  computeAnchoredDialogPosition,
  getDefaultIconPosition,
  clampDialogPosition
} from "../utils/geometry.js";
import { safeReadPosition, safeWritePosition } from "../storage/positionStorage.js";

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
  title.textContent = "对话框";

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
  sendButton.addEventListener("click", () => {
    input.value = "";
    input.focus();
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

