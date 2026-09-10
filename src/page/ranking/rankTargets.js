const kindWeight = {
  radio: 38,
  checkbox: 38,
  switch: 36,
  textbox: 34,
  select: 34,
  button: 30,
  link: 25,
  option: 25,
  tab: 24,
  menuitem: 22,
  custom: 12
};

const inDialog = (candidate) => {
  try {
    return Boolean(candidate.clickElement?.closest?.("dialog[open], [role='dialog'], [role='alertdialog']"));
  } catch {
    return false;
  }
};

const inForm = (candidate) => {
  try {
    return Boolean(candidate.clickElement?.closest?.("form, [role='form'], fieldset, [role='radiogroup']"));
  } catch {
    return false;
  }
};

const matchesRegion = (candidate, region) => {
  const rect = candidate.rect;
  if (region === "all") return true;
  if (region === "viewport") return candidate.inViewport;
  if (region === "above") return rect.bottom < 0;
  if (region === "below") return rect.top > window.innerHeight;
  return rect.bottom >= -window.innerHeight * 0.45 && rect.top <= window.innerHeight * 1.45;
};

const distanceBonus = (candidate, region) => {
  const rect = candidate.rect;
  const centerY = rect.top + rect.height / 2;
  if (region === "above") return Math.max(0, 32 - Math.abs(rect.bottom) / 36);
  if (region === "below") return Math.max(0, 32 - Math.abs(rect.top - window.innerHeight) / 36);
  const centerX = rect.left + rect.width / 2;
  const distance = Math.hypot(centerX - window.innerWidth / 2, centerY - window.innerHeight / 2);
  return Math.max(0, 26 - distance / 30);
};

export const rankTargets = (candidates, { region = "nearby" } = {}) => {
  const normalizedRegion = ["viewport", "nearby", "above", "below", "all"].includes(region) ? region : "nearby";
  let scoped = candidates.filter((candidate) => matchesRegion(candidate, normalizedRegion));
  let didFallback = false;
  if (!scoped.length && normalizedRegion !== "all") {
    scoped = candidates;
    didFallback = true;
  }

  const ranked = scoped.map((candidate) => {
    const score =
      (kindWeight[candidate.kind] || 8) +
      (candidate.inViewport ? 92 : 0) +
      (candidate.hitTestable ? 18 : 0) +
      (candidate.disabled ? -35 : 0) +
      (candidate.group ? 7 : 0) +
      (inDialog(candidate) ? 26 : 0) +
      (inForm(candidate) ? 14 : 0) +
      Number(candidate.confidence || 0) * 26 +
      distanceBonus(candidate, normalizedRegion);
    return { ...candidate, priority: Math.round(score) };
  });

  ranked.sort((left, right) => right.priority - left.priority || right.confidence - left.confidence);
  return { targets: ranked, region: normalizedRegion, didFallback };
};
