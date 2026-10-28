import { getAuthClient } from "./auth-client.mjs";
import { observeMember } from "./member-state.mjs";

const bars = [...document.querySelectorAll("[data-member-bar]")];
const invites = [...document.querySelectorAll("[data-member-invite]")];
const accountUrl = new URL("../auth-test/", import.meta.url);
function render(state) {
  const signedIn = state === "signed-in";
  const labels = { "checking": "در حال بررسی حساب", "signed-out": "هنوز وارد نشده‌اید",
    "signed-in": "وارد حساب شده‌اید", "unknown": "وضعیت ورود قابل بررسی نیست" };
  for (const bar of bars) {
    bar.dataset.state = state;
    bar.querySelector("[data-member-status]").textContent = labels[state];
    const link = bar.querySelector("[data-member-account]");
    link.textContent = signedIn ? "حساب من" : "ورود / عضویت";
    link.href = accountUrl.href;
  }
  for (const link of invites) {
    link.textContent = signedIn ? "رفتن به حساب من ←" : "عضویت در XSYN ←";
    link.href = signedIn ? accountUrl.href : accountUrl.href + "?mode=signup";
  }
}
if (bars.length) {
  try {
    const observer = observeMember(getAuthClient().auth, render);
    window.addEventListener("pageshow", event => { if (event.persisted) observer.refresh(); });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") observer.refresh();
    });
  } catch { render("unknown"); }
}
