import { PRESENCE_MODES } from "./member-presence.mjs";

export function createPresenceSync(client, { onRemote, onSync }) {
  let userId = null, generation = 0, revision = 0;
  let writes = Promise.resolve();
  const current = (owner, version) => owner === userId && version === generation;
  return {
    async activate(owner) {
      userId = owner;
      const version = ++generation;
      revision = 0;
      if (!owner) return;
      onSync("loading");
      try {
        const { data, error } = await client.from("xsyn_member_preferences")
          .select("presence_mode").eq("user_id", owner).maybeSingle();
        if (!current(owner, version) || revision) return;
        if (error || (data && !PRESENCE_MODES.includes(data.presence_mode))) throw Error("Preference unavailable");
        if (data) onRemote(data.presence_mode);
        onSync(data ? "synced" : "local");
      } catch {
        if (current(owner, version) && !revision) onSync("unavailable");
      }
    },
    invalidate() { revision += 1; },
    select(mode) {
      if (!userId || !PRESENCE_MODES.includes(mode)) return Promise.resolve();
      const owner = userId, version = generation, selection = ++revision;
      onSync("saving");
      writes = writes.then(async () => {
        if (!current(owner, version)) return;
        try {
          const { error } = await client.from("xsyn_member_preferences")
            .upsert({ user_id: owner, presence_mode: mode }, { onConflict: "user_id" });
          if (error) throw Error("Preference unavailable");
          if (current(owner, version) && revision === selection) onSync("synced");
        } catch {
          if (current(owner, version) && revision === selection) onSync("unavailable");
        }
      });
      return writes;
    },
  };
}
