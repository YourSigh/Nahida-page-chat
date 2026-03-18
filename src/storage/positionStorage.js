export const safeReadPosition = async (storageKey) => {
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

export const safeWritePosition = async (storageKey, position) => {
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

