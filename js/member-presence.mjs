export const PRESENCE_MODES = Object.freeze(["auto", "busy", "away"]);
export const IDLE_MS = 5 * 60 * 1000;

export function presenceKey(userId) {
  return "xsyn-awfnvhlytiwckkkwfgbc-presence-v1:" + userId;
}

export function readPresence(storage, userId) {
  try {
    const value = storage.getItem(presenceKey(userId));
    return PRESENCE_MODES.includes(value) ? value : "auto";
  } catch { return "auto"; }
}

export function savePresence(storage, userId, mode) {
  if (!PRESENCE_MODES.includes(mode)) throw new Error("Invalid presence mode");
  try { storage.setItem(presenceKey(userId), mode); return true; }
  catch { return false; }
}

export function effectivePresence(mode, { hidden, lastActivity, now }) {
  if (mode === "busy" || mode === "away") return mode;
  return hidden || now - lastActivity >= IDLE_MS ? "away" : "active";
}
