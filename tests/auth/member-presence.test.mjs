import test from "node:test";
import assert from "node:assert/strict";
import { IDLE_MS, effectivePresence, presenceKey, readPresence, savePresence } from "../../js/member-presence.mjs";

test("automatic presence uses activity and visibility without changing manual preferences", () => {
  const active = { hidden: false, lastActivity: 1000, now: 1001 };
  assert.equal(effectivePresence("auto", active), "active");
  assert.equal(effectivePresence("auto", { ...active, hidden: true }), "away");
  assert.equal(effectivePresence("auto", { ...active, now: 1000 + IDLE_MS }), "away");
  assert.equal(effectivePresence("busy", { ...active, hidden: true }), "busy");
  assert.equal(effectivePresence("away", active), "away");
});

test("presence preference is validated and isolated per user", () => {
  const entries = new Map();
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) };
  assert.equal(readPresence(storage, "a"), "auto");
  assert.equal(savePresence(storage, "a", "busy"), true);
  assert.equal(readPresence(storage, "a"), "busy");
  assert.equal(readPresence(storage, "b"), "auto");
  entries.set(presenceKey("b"), "administrator");
  assert.equal(readPresence(storage, "b"), "auto");
  assert.throws(() => savePresence(storage, "a", "administrator"));
});

test("unavailable browser storage fails safely", () => {
  assert.equal(readPresence(null, "a"), "auto");
  assert.equal(savePresence(null, "a", "away"), false);
});
