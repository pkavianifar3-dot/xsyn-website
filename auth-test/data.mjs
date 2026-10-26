export function createRepository(client) {
  async function unwrap(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  return {
    profile: userId => unwrap(client.from("xsyn_profiles").select("user_id,display_name,bio,is_listed").eq("user_id", userId).maybeSingle()),
    privateProfile: userId => unwrap(client.from("xsyn_profile_private").select("user_id,private_note").eq("user_id", userId).maybeSingle()),
    savePublic: (userId, values) => unwrap(client.from("xsyn_profiles").update({
      display_name: values.display_name, bio: values.bio, is_listed: values.is_listed,
    }).eq("user_id", userId).select("user_id").single()),
    savePrivate: (userId, privateNote) => unwrap(client.from("xsyn_profile_private").update({
      private_note: privateNote,
    }).eq("user_id", userId).select("user_id").single()),
    directory: () => unwrap(client.from("xsyn_profiles").select("user_id,display_name,bio").eq("is_listed", true).order("created_at", { ascending: false }).limit(30)),
    following: userId => unwrap(client.from("xsyn_follows").select("followee_id").eq("follower_id", userId)),
    // follower_id comes from auth.uid() in Postgres, not from the target/profile UI.
    follow: targetId => unwrap(client.from("xsyn_follows").insert({ followee_id: targetId })),
    unfollow: (userId, targetId) => unwrap(client.from("xsyn_follows").delete().eq("follower_id", userId).eq("followee_id", targetId)),
  };
}
