import test from "node:test";
import assert from "node:assert/strict";
import { createPresenceSync } from "../../js/member-preferences.mjs";

function fixture({ read = async () => ({ data: null }), write = async () => ({ error: null }) } = {}) {
  const remote = [], states = [], payloads = [];
  const client = { from(table) {
    assert.equal(table, "xsyn_member_preferences");
    return {
      select(columns) {
        assert.equal(columns, "presence_mode");
        return { eq(key, owner) {
          assert.equal(key, "user_id");
          return { maybeSingle: () => read(owner) };
        } };
      },
      upsert(payload, options) {
        assert.deepEqual(options, { onConflict: "user_id" });
        payloads.push(payload);
        return write(payload);
      },
    };
  } };
  const sync = createPresenceSync(client, {
    onRemote: mode => remote.push(mode), onSync: state => states.push(state),
  });
  return { sync, remote, states, payloads };
}

test("private preference is read only for the active account and validates remote values", async () => {
  const fixtureValid = fixture({ read: async owner => {
    assert.equal(owner, "owner-a");
    return { data: { presence_mode: "busy" } };
  } });
  await fixtureValid.sync.activate("owner-a");
  assert.deepEqual(fixtureValid.remote, ["busy"]);
  assert.equal(fixtureValid.states.at(-1), "synced");
  const invalid = fixture({ read: async () => ({ data: { presence_mode: "invalid" } }) });
  await invalid.sync.activate("owner-a");
  assert.deepEqual(invalid.remote, []);
  assert.equal(invalid.states.at(-1), "unavailable");
});

test("slow initial reads cannot overwrite a newer selection", async () => {
  let resolveRead;
  const pending = fixture({ read: () => new Promise(resolve => { resolveRead = resolve; }) });
  const reading = pending.sync.activate("owner-a");
  await pending.sync.select("busy");
  resolveRead({ data: { presence_mode: "away" } });
  await reading;
  assert.deepEqual(pending.remote, []);
  assert.deepEqual(pending.payloads, [{ user_id: "owner-a", presence_mode: "busy" }]);
  assert.equal(pending.states.at(-1), "synced");
});

test("writes remain ordered and old account work is discarded after logout", async () => {
  let finishWrite;
  const pending = fixture({ write: () => new Promise(resolve => { finishWrite = resolve; }) });
  await pending.sync.activate("owner-a");
  const first = pending.sync.select("busy");
  const queued = pending.sync.select("away");
  await Promise.resolve();
  await pending.sync.activate(null);
  finishWrite({ error: null });
  await Promise.all([first, queued]);
  assert.deepEqual(pending.payloads, [{ user_id: "owner-a", presence_mode: "busy" }]);
  assert.ok(!pending.states.includes("synced"));
});

test("old account reads cannot populate a new account", async () => {
  let resolveRead;
  const pending = fixture({ read: owner => owner === "owner-a"
    ? new Promise(resolve => { resolveRead = resolve; })
    : Promise.resolve({ data: { presence_mode: "auto" } }) });
  const reading = pending.sync.activate("owner-a");
  await pending.sync.activate("owner-b");
  resolveRead({ data: { presence_mode: "busy" } });
  await reading;
  assert.deepEqual(pending.remote, ["auto"]);
});

test("failed writes remain recoverable and invalid selections never reach the server", async () => {
  let failing = true;
  const pending = fixture({ write: async () => failing ? { error: { code: "offline" } } : { error: null } });
  await pending.sync.activate("owner-a");
  await pending.sync.select("invalid");
  assert.equal(pending.payloads.length, 0);
  await pending.sync.select("busy");
  assert.equal(pending.states.at(-1), "unavailable");
  failing = false;
  await pending.sync.select("away");
  assert.equal(pending.states.at(-1), "synced");
});
