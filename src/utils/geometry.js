export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const clampIconPosition = ({ x, y }, { edgeGap, buttonSize, viewportWidth, viewportHeight }) => ({
  x: clamp(x, edgeGap, Math.max(edgeGap, viewportWidth - buttonSize - edgeGap)),
  y: clamp(y, edgeGap, Math.max(edgeGap, viewportHeight - buttonSize - edgeGap))
});

export const anchorIconPosition = (position, options) => {
  const clamped = clampIconPosition(position, options);
  const { buttonSize, viewportWidth } = options;
  const horizontalAnchor = clamped.x + buttonSize / 2 <= viewportWidth / 2 ? "left" : "right";
  const horizontalOffset = horizontalAnchor === "left"
    ? clamped.x
    : viewportWidth - buttonSize - clamped.x;

  return { ...clamped, horizontalAnchor, horizontalOffset };
};

export const resolveAnchoredIconPosition = (position, options) => {
  const { buttonSize, viewportWidth } = options;
  const hasAnchor = ["left", "right"].includes(position?.horizontalAnchor)
    && Number.isFinite(position?.horizontalOffset);

  // Positions saved by older versions only contain x/y. Infer their nearest
  // horizontal edge once, then use that edge for all future resizes.
  if (!hasAnchor) {
    return anchorIconPosition(position, options);
  }

  const x = position.horizontalAnchor === "left"
    ? position.horizontalOffset
    : viewportWidth - buttonSize - position.horizontalOffset;
  const clamped = clampIconPosition({ x, y: position.y }, options);

  return {
    ...clamped,
    horizontalAnchor: position.horizontalAnchor,
    horizontalOffset: position.horizontalOffset
  };
};

export const getDefaultIconPosition = ({ edgeGap, buttonSize, viewportWidth, viewportHeight }) => ({
  x: Math.max(edgeGap, viewportWidth - buttonSize - edgeGap),
  y: clamp(Math.round(viewportHeight * 0.22), edgeGap, Math.max(edgeGap, viewportHeight - buttonSize - edgeGap))
});

export const clampDialogPosition = ({ left, top }, { edgeGap, viewportWidth, viewportHeight, dialogWidth, dialogHeight }) => {
  const maxLeft = Math.max(edgeGap, viewportWidth - dialogWidth - edgeGap);
  const maxTop = Math.max(edgeGap, viewportHeight - dialogHeight - edgeGap);
  return {
    left: clamp(left, edgeGap, maxLeft),
    top: clamp(top, edgeGap, maxTop)
  };
};

export const computeAnchoredDialogPosition = ({
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
