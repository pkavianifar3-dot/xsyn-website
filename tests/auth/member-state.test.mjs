import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { observeMember } from "../../js/member-state.mjs";

function fixture(overrides = {}) {
  let callback, unsubscribed = false;
  const states = [];
  const auth = {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: { id: "a" } }, error: null }),
    onAuthStateChange(fn) { callback = fn; return { data: { subscription: {
      unsubscribe() { unsubscribed = true; },
    } } }; },
    ...overrides,
  };
  const observer = observeMember(auth, state => states.push(state));
  return { states, observer, emit: (event, session) => callback(event, session),
    isUnsubscribed: () => unsubscribed };
}
test("header verifies restored identity and never trusts a cached user alone", async () => {
  const f = fixture({
    getSession: async () => ({ data: { session: { user: { id: "a" } } } }),
    getUser: async () => ({ data: { user: { id: "different-user" } } }),
  });
  await setImmediate();
  assert.equal(f.states.at(-1), "unknown");
  assert.ok(!f.states.includes("signed-in"));
  f.observer.stop();
});
test("logout wins over a slow successful user verification", async () => {
  let resolveUser;
  const f = fixture({
    getSession: async () => ({ data: { session: { user: { id: "a" } } } }),
    getUser: () => new Promise(resolve => { resolveUser = resolve; }),
  });
  await setImmediate();
  f.emit("SIGNED_OUT", null);
  resolveUser({ data: { user: { id: "a" } }, error: null });
  await setImmediate();
  assert.equal(f.states.at(-1), "signed-out");
  assert.ok(!f.states.includes("signed-in"));
  f.observer.stop();
});
test("sign-in events update the header after server verification; stop unsubscribes", async () => {
  const f = fixture();
  await setImmediate();
  assert.equal(f.states.at(-1), "signed-out");
  f.emit("SIGNED_IN", { user: { id: "a" } });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.states.at(-1), "signed-in");
  f.observer.stop();
  assert.ok(f.isUnsubscribed());
  const before = f.states.length;
  f.emit("SIGNED_OUT", null);
  assert.equal(f.states.length, before);
});
test("network failures leave an unknown state without claiming logout or login", async () => {
  const f = fixture({ getSession: async () => { throw Error("offline"); } });
  await setImmediate();
  assert.equal(f.states.at(-1), "unknown");
  f.observer.stop();
});

test("account details come only from the verified user and are cleared on logout", async () => {
  const deliveries = [];
  let emit;
  const verifiedUser = { id: "a", email: "verified@example.test" };
  const observer = observeMember({
    getSession: async () => ({ data: { session: { user: { id: "a", email: "cached@example.test" } } } }),
    getUser: async () => ({ data: { user: verifiedUser }, error: null }),
    onAuthStateChange(callback) {
      emit = callback;
      return { data: { subscription: { unsubscribe() {} } } };
    },
  }, (state, user) => deliveries.push({ state, user }));
  await setImmediate();
  assert.deepEqual(deliveries.at(-1), { state: "signed-in", user: verifiedUser });
  assert.ok(deliveries.filter(item => item.state !== "signed-in").every(item => item.user === null));
  emit("SIGNED_OUT", null);
  assert.deepEqual(deliveries.at(-1), { state: "signed-out", user: null });
  observer.stop();
});
