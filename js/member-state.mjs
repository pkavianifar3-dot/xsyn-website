// The badge is presentation only. Database RLS remains the authorization boundary.
export function observeMember(auth, render) {
  let generation = 0, stopped = false;
  const current = id => !stopped && id === generation;
  const show = (state, id) => { if (current(id)) render(state); };
  async function verify(session, id) {
    if (!current(id)) return;
    if (!session?.user?.id) { show("signed-out", id); return; }
    show("checking", id);
    try {
      const { data, error } = await auth.getUser();
      show(!error && data?.user?.id === session.user.id ? "signed-in" : "unknown", id);
    } catch { show("unknown", id); }
  }
  async function refresh() {
    const id = ++generation;
    show("checking", id);
    try {
      const { data, error } = await auth.getSession();
      if (error) { show("unknown", id); return; }
      await verify(data?.session, id);
    } catch { show("unknown", id); }
  }
  const { data } = auth.onAuthStateChange((_event, session) => {
    const id = ++generation;
    if (!session) show("signed-out", id);
    // Never call another Auth method while an Auth callback holds its lock.
    else setTimeout(() => { verify(session, id); }, 0);
  });
  refresh();
  return {
    refresh,
    stop() { stopped = true; generation += 1; data.subscription.unsubscribe(); },
  };
}
