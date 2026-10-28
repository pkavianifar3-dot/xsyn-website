import { getAuthClient } from "./auth-client.mjs";
import { observeMember } from "./member-state.mjs";
import { effectivePresence, presenceKey, readPresence, savePresence } from "./member-presence.mjs";
import { createPresenceSync } from "./member-preferences.mjs";

const root = document.querySelector("[data-member-widget]");
const accountUrl = new URL("../auth-test/", import.meta.url);
const options = [
  { mode: "auto", icon: "active", title: "خودکار", detail: "تنظیم وضعیت بر اساس فعالیت شما" },
  { mode: "busy", icon: "busy", title: "مزاحم نشوید", detail: "در حال تمرکز هستم" },
  { mode: "away", icon: "away", title: "دور از دسترس", detail: "فعلاً آمادهٔ پاسخ‌گویی نیستم" },
];

if (root) {
  root.innerHTML = `
    <button class="member-avatar" type="button" data-account-toggle aria-label="حساب XSYN" aria-expanded="false" aria-controls="member-account-panel">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>
      <span data-avatar-letter hidden></span><span class="member-auth-dot" aria-hidden="true"></span>
    </button>
    <button class="member-status-toggle" type="button" data-presence-toggle aria-label="انتخاب وضعیت" aria-expanded="false" aria-controls="member-presence-panel" hidden>
      <span class="presence-dot" data-presence-icon aria-hidden="true"></span><span data-presence-label>خودکار</span><span class="member-chevron" aria-hidden="true">⌄</span>
    </button>
    <section class="member-panel member-account-panel" id="member-account-panel" aria-label="جزئیات حساب" hidden>
      <div class="member-panel-top"><span>حساب XSYN</span><button type="button" data-close-account aria-label="بستن جزئیات حساب">×</button></div>
      <div class="member-identity"><span class="member-avatar-large" data-large-avatar aria-hidden="true">X</span><h2 data-account-name>به XSYN خوش آمدید</h2><p class="member-email" data-account-email dir="ltr" hidden></p><p class="member-auth-message" data-auth-message role="status"></p></div>
      <div class="member-account-actions"><a class="member-manage" data-manage href="${accountUrl.href}">ورود / عضویت</a><button class="member-signout" data-signout type="button" hidden>خروج از این مرورگر</button></div>
      <p class="member-panel-note">محتوای عمومی XSYN بدون ورود در دسترس است.</p>
    </section>
    <section class="member-panel member-presence-panel" id="member-presence-panel" aria-label="وضعیت شما" hidden>
      <h2 class="member-menu-title">وضعیت شما</h2>
      <div role="radiogroup" aria-label="انتخاب وضعیت حساب">${options.map(option => `
        <button class="member-status-option" type="button" role="radio" aria-checked="false" tabindex="-1" data-mode="${option.mode}"><span class="presence-dot" data-presence="${option.icon}" aria-hidden="true"></span><span><strong>${option.title}</strong><small>${option.detail}</small></span><span class="member-selected" aria-hidden="true">✓</span></button>`).join("")}
      </div><p class="member-panel-note" data-presence-note>این انتخاب فقط برای حساب شما در این مرورگر ذخیره می‌شود.</p>
    </section><span class="member-sync-status" role="status" data-sync-status></span>`;

  const find = selector => root.querySelector(selector);
  const accountToggle = find("[data-account-toggle]");
  const presenceToggle = find("[data-presence-toggle]");
  const accountPanel = find("#member-account-panel");
  const presencePanel = find("#member-presence-panel");
  const modeButtons = [...root.querySelectorAll("[data-mode]")];
  let client, observer, preferenceSync, user = null, mode = "auto";
  let syncState = "local";
  let localSaved = true;
  let identityGeneration = 0, lastActivity = Date.now();
  let storage = null;
  try { storage = window.localStorage; } catch {}

  function updateSync(state) {
    syncState = state;
    const messages = {
      loading: "در حال خواندن تنظیم خصوصی حساب…",
      saving: "در حال همگام‌سازی تنظیم خصوصی حساب…",
      synced: "این انتخاب خصوصی است و بین دستگاه‌های حساب شما همگام می‌شود.",
      local: "این انتخاب فعلاً در همین مرورگر است؛ با انتخاب وضعیت، در حساب شما ذخیره می‌شود.",
      unavailable: localSaved ? "همگام‌سازی حساب انجام نشد؛ تنظیم فقط در این مرورگر است. برای تلاش دوباره وضعیت را انتخاب کنید." : "ذخیرهٔ تنظیم انجام نشد؛ انتخاب فعلاً فقط در این صفحه فعال است. برای تلاش دوباره وضعیت را انتخاب کنید.",
    };
    find("[data-presence-note]").textContent = messages[state];
    find("[data-sync-status]").textContent = state === "unavailable" ? messages[state] : "";
    if (user) updatePresence();
  }

  function closePanels(returnFocus = false) {
    const wasPresence = !presencePanel.hidden;
    const hadOpen = !accountPanel.hidden || wasPresence;
    accountPanel.hidden = presencePanel.hidden = true;
    accountToggle.setAttribute("aria-expanded", "false");
    presenceToggle.setAttribute("aria-expanded", "false");
    if (returnFocus && hadOpen) (wasPresence ? presenceToggle : accountToggle).focus();
  }

  function updatePresence() {
    if (!user) return;
    const effective = effectivePresence(mode, { hidden: document.hidden, lastActivity, now: Date.now() });
    const title = mode === "auto" ? (effective === "active" ? "فعال" : "دور از دسترس") : options.find(option => option.mode === mode).title;
    find("[data-presence-icon]").dataset.presence = effective;
    find("[data-presence-label]").textContent = title;
    presenceToggle.setAttribute("aria-label", "وضعیت: " + title + "؛ انتخاب وضعیت");
    presenceToggle.title = (mode === "auto" ? "خودکار؛ بر اساس فعالیت شما" : title)
      + (syncState === "unavailable" ? "؛ همگام‌سازی انجام نشد" : "");
    for (const button of modeButtons) {
      const selected = button.dataset.mode === mode;
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
  }

  function setIdentity(name, email) {
    find("[data-account-name]").textContent = name || "حساب XSYN";
    find("[data-account-email]").textContent = email || "";
    find("[data-account-email]").hidden = !email;
    const initial = [...(name || email || "X").trim()][0]?.toLocaleUpperCase() || "X";
    find("[data-avatar-letter]").textContent = initial;
    find("[data-avatar-letter]").hidden = false;
    find("[data-large-avatar]").textContent = initial;
    accountToggle.querySelector("svg").setAttribute("hidden", "");
  }

  async function loadDisplayName(verifiedUser, generation) {
    try {
      const { data, error } = await client.from("xsyn_profiles").select("display_name").eq("user_id", verifiedUser.id).maybeSingle();
      if (!error && data?.display_name && generation === identityGeneration && user?.id === verifiedUser.id) setIdentity(data.display_name, verifiedUser.email);
    } catch {}
  }

  function render(state, verifiedUser) {
    const previousId = user?.id;
    root.dataset.auth = state;
    user = state === "signed-in" ? verifiedUser : null;
    const generation = ++identityGeneration;
    preferenceSync?.activate(user?.id || null);
    presenceToggle.hidden = !user;
    find("[data-signout]").hidden = !user;
    find("[data-signout]").disabled = false;
    find("[data-manage]").textContent = user ? "مدیریت حساب من" : "ورود / عضویت";
    accountToggle.setAttribute("aria-label", user ? "حساب شما در XSYN؛ وارد شده‌اید" : "حساب XSYN؛ ورود و عضویت");
    const messages = { checking: "در حال بررسی حساب…", "signed-out": "برای دسترسی به حساب، وارد شوید.", "signed-in": "وارد حساب شده‌اید", unknown: "وضعیت ورود قابل بررسی نیست؛ اتصال را بررسی کنید." };
    find("[data-auth-message]").textContent = messages[state];
    if (user) {
      if (previousId !== user.id) { mode = readPresence(storage, user.id); lastActivity = Date.now(); }
      setIdentity("", user.email);
      updatePresence();
      loadDisplayName(user, generation);
    } else {
      find("[data-account-name]").textContent = "به XSYN خوش آمدید";
      find("[data-account-email]").textContent = "";
      find("[data-account-email]").hidden = true;
      find("[data-avatar-letter]").textContent = "";
      find("[data-avatar-letter]").hidden = true;
      accountToggle.querySelector("svg").removeAttribute("hidden");
      find("[data-large-avatar]").textContent = "X";
      if (!presencePanel.hidden) closePanels();
    }
    for (const invite of document.querySelectorAll("[data-member-invite]")) {
      invite.textContent = user ? "رفتن به حساب من ←" : "عضویت در XSYN ←";
      invite.href = accountUrl.href + (user ? "" : "?mode=signup");
    }
  }

  accountToggle.addEventListener("click", () => {
    const opening = accountPanel.hidden;
    closePanels();
    if (opening) { accountPanel.hidden = false; accountToggle.setAttribute("aria-expanded", "true"); find("[data-close-account]").focus(); }
  });
  presenceToggle.addEventListener("click", () => {
    const opening = presencePanel.hidden;
    closePanels();
    if (opening && user) { presencePanel.hidden = false; presenceToggle.setAttribute("aria-expanded", "true"); modeButtons.find(button => button.dataset.mode === mode).focus(); }
  });
  find("[data-close-account]").addEventListener("click", () => closePanels(true));
  document.addEventListener("pointerdown", event => { if (!root.contains(event.target)) closePanels(); });
  root.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); closePanels(true); }
    if (event.target.matches("[data-mode]")) {
      const index = modeButtons.indexOf(event.target);
      let next;
      if (["ArrowDown", "ArrowRight"].includes(event.key)) next = (index + 1) % modeButtons.length;
      if (["ArrowUp", "ArrowLeft"].includes(event.key)) next = (index + modeButtons.length - 1) % modeButtons.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = modeButtons.length - 1;
      if (next !== undefined) { event.preventDefault(); modeButtons[next].focus(); }
    }
  });
  root.addEventListener("focusout", event => { if (event.relatedTarget && !root.contains(event.relatedTarget)) closePanels(); });
  for (const button of modeButtons) button.addEventListener("click", () => {
    if (!user) return;
    mode = button.dataset.mode;
    localSaved = savePresence(storage, user.id, mode);
    updatePresence();
    preferenceSync?.select(mode);
    closePanels(true);
  });
  find("[data-signout]").addEventListener("click", async () => {
    const button = find("[data-signout]");
    button.disabled = true;
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
      render("signed-out", null);
      closePanels(true);
    } catch {
      button.disabled = false;
      find("[data-auth-message]").textContent = "خروج تأیید نشد؛ اتصال را بررسی و دوباره تلاش کنید.";
    }
  });
  for (const eventName of ["pointerdown", "keydown", "scroll", "touchstart"]) document.addEventListener(eventName, () => {
    lastActivity = Date.now();
    if (user && mode === "auto") updatePresence();
  }, { passive: true });
  window.addEventListener("storage", event => {
    if (user && (event.key === presenceKey(user.id) || event.key === null)) { preferenceSync?.invalidate(); mode = readPresence(storage, user.id); updateSync("local"); }
  });
  document.addEventListener("visibilitychange", () => {
    updatePresence();
    if (!document.hidden) observer?.refresh();
  });
  window.addEventListener("pageshow", event => { if (event.persisted) observer?.refresh(); });
  setInterval(updatePresence, 15000);
  try {
    client = getAuthClient();
    preferenceSync = createPresenceSync(client, {
      onRemote(value) { mode = value; savePresence(storage, user.id, mode); updatePresence(); },
      onSync: updateSync,
    });
    observer = observeMember(client.auth, render);
  }
  catch { render("unknown", null); }
}
