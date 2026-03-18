export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const clampIconPosition = ({ x, y }, { edgeGap, buttonSize, viewportWidth, viewportHeight }) => ({
  x: clamp(x, edgeGap, Math.max(edgeGap, viewportWidth - buttonSize - edgeGap)),
  y: clamp(y, edgeGap, Math.max(edgeGap, viewportHeight - buttonSize - edgeGap))
});

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

