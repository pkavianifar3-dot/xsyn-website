import { getAuthClient } from "../js/auth-client.mjs";
import { AUTH_STORAGE_KEY, FlowError, OtpFlow, errorText } from "./auth-core.mjs";
import { createRepository } from "./data.mjs";

const $ = id => document.getElementById(id);
let client, repository, flow, user = null, mode = "signin";
let configured = false, authBusy = false, epoch = 0;
let following = new Set();
const write = (id, text) => { $(id).textContent = text; };
function notice(text, error = false, id = "status") {
  write(id, text);
  $(id).dataset.kind = error ? "error" : "info";
}
function sync() {
  const pending = !!flow?.pending;
  $("email-form").hidden = pending;
  $("code-form").hidden = !pending;
  $("email-fields").disabled = !configured || authBusy || !!user || pending;
  $("request-code").disabled = authBusy || !!flow?.remaining();
  for (const name of ["mode-signin", "mode-signup"]) $(name).disabled = !configured || pending || authBusy;
  $("verify-code").disabled = authBusy || !pending || !flow?.expiresIn();
  $("otp").disabled = authBusy;
  $("resend-code").disabled = authBusy || !pending || !!flow?.remaining();
  $("change-email").disabled = authBusy;
  $("sign-out").disabled = authBusy;
  const remaining = flow?.remaining() || 0;
  write("resend-code", remaining ? "ارسال مجدد پس از " + remaining + " ثانیه" : "ارسال مجدد کد");
  if (pending) {
    write("pending-email", flow.pending.email);
    const expiry = flow.expiresIn();
    write("expiry-help", expiry ? "زمان باقی‌ماندهٔ کد: " + Math.floor(expiry / 60) + ":" + String(expiry % 60).padStart(2, "0") : "اعتبار کد تمام شده است. کد تازه درخواست کنید.");
  }
}
function clearPrivateUI() {
  epoch += 1;
  user = null;
  following.clear();
  $("signed-in").hidden = true;
  $("signed-out").hidden = false;
  $("member-panel").hidden = true;
  $("directory-panel").hidden = true;
  $("public-fields").disabled = true;
  $("private-fields").disabled = true;
  for (const id of ["display-name", "bio", "private-note", "otp", "email"]) $(id).value = "";
  $("is-listed").checked = false;
  for (const id of ["account-email", "pending-email", "follow-count", "data-status"]) write(id, "");
  $("directory").replaceChildren();
  flow?.reset();
  sync();
}
async function applySession(session) {
  // A refresh for the same verified user must not cancel an in-flight data load.
  if (session && user?.id === session.user.id) return;
  const generation = ++epoch;
  if (!session) {
    clearPrivateUI();
    notice("برای ورود یا ساخت حساب، کد ایمیلی درخواست کنید.");
    return;
  }
  // Confirm a restored session with Auth; cached local identity is not authorization.
  const { data, error } = await client.auth.getUser();
  if (generation !== epoch) return;
  if (error || !data?.user || data.user.id !== session.user.id) {
    clearPrivateUI();
    notice("نشست قابل تأیید نیست. صفحه را تازه کنید یا دوباره وارد شوید.", true);
    return;
  }
  const changedUser = user?.id !== data.user.id;
  if (changedUser) {
    for (const id of ["display-name", "bio", "private-note", "otp", "email"]) $(id).value = "";
    $("is-listed").checked = false;
    $("directory").replaceChildren();
  }
  user = data.user;
  flow.reset();
  $("signed-out").hidden = true;
  $("signed-in").hidden = false;
  $("member-panel").hidden = false;
  $("directory-panel").hidden = false;
  write("account-email", user.email || "");
  notice("ورود تأیید شد. اطلاعات خصوصی فقط برای صاحب حساب قابل دسترسی است.");
  sync();
  if (changedUser) await loadData();
}
async function loadData() {
  if (!user) return;
  const generation = epoch, uid = user.id;
  $("public-fields").disabled = true;
  $("private-fields").disabled = true;
  try {
    const [profile, privateProfile] = await Promise.all([repository.profile(uid), repository.privateProfile(uid)]);
    if (generation !== epoch || user?.id !== uid) return;
    if (!profile || !privateProfile) throw new FlowError("profile_missing");
    $("display-name").value = profile.display_name;
    $("bio").value = profile.bio;
    $("is-listed").checked = profile.is_listed;
    $("private-note").value = privateProfile.private_note;
    $("public-fields").disabled = false;
    $("private-fields").disabled = false;
    notice("اطلاعات حساب بارگذاری شد.", false, "data-status");
    await loadDirectory();
  } catch {
    if (generation !== epoch) return;
    notice("بخش داده آماده نیست یا دسترسی مجاز نیست. اجرای SQL و تنظیم RLS محیط آزمایشی باید بررسی شود.", true, "data-status");
  }
}
async function loadDirectory() {
  if (!user) return;
  const generation = epoch, uid = user.id;
  $("refresh-directory").disabled = true;
  try {
    const [people, edges] = await Promise.all([repository.directory(), repository.following(uid)]);
    if (generation !== epoch || user?.id !== uid) return;
    following = new Set(edges.map(row => row.followee_id));
    write("follow-count", "تعداد دنبال‌کردن‌های شما: " + following.size);
    $("directory").replaceChildren();
    for (const person of people.filter(row => row.user_id !== uid)) {
      const item = document.createElement("li"), title = document.createElement("h3");
      const bio = document.createElement("p"), button = document.createElement("button");
      // User content is always text, never HTML, URLs or executable attributes.
      title.textContent = person.display_name || "کاربر XSYN";
      bio.textContent = person.bio || "معرفی‌ای ثبت نشده است.";
      button.type = "button";
      button.className = "secondary-button";
      const isFollowing = following.has(person.user_id);
      button.textContent = isFollowing ? "لغو دنبال‌کردن" : "دنبال‌کردن";
      button.setAttribute("aria-label", button.textContent + " " + (person.display_name || "کاربر XSYN"));
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          if (isFollowing) await repository.unfollow(uid, person.user_id);
          else await repository.follow(person.user_id);
          if (generation !== epoch || user?.id !== uid) return;
          await loadDirectory();
          notice("فهرست دنبال‌کردن به‌روز شد.", false, "data-status");
        } catch {
          if (generation === epoch) notice("تغییر دنبال‌کردن انجام نشد. دسترسی یا وضعیت انتشار پروفایل را بررسی کنید.", true, "data-status");
        } finally { button.disabled = false; }
      });
      item.append(title, bio, button);
      $("directory").append(item);
    }
    if (!$("directory").children.length) {
      const item = document.createElement("li");
      item.textContent = "هنوز پروفایل عمومی دیگری در این فهرست نیست.";
      $("directory").append(item);
    }
  } catch {
    if (generation === epoch) notice("فهرست کاربران بارگذاری نشد.", true, "data-status");
  } finally { $("refresh-directory").disabled = false; }
}
function chooseMode(value) {
  mode = value;
  for (const name of ["signin", "signup"]) $("mode-" + name).setAttribute("aria-pressed", String(name === value));
  write("mode-help", value === "signup" ? "با تأیید کد، مالکیت ایمیل شما بررسی و حساب آزمایشی فعال می‌شود." : "اگر از قبل حساب دارید، کد ورود را درخواست کنید.");
  write("request-code", value === "signup" ? "دریافت کد ثبت‌نام" : "دریافت کد ورود");
}
async function authAction(action) {
  if (!configured || authBusy) return;
  authBusy = true; sync();
  try { await action(); }
  catch (error) { notice(errorText(error), true); }
  finally { authBusy = false; sync(); if (flow?.pending && !user) $("otp").focus(); }
}
$("mode-signin").addEventListener("click", () => chooseMode("signin"));
$("mode-signup").addEventListener("click", () => chooseMode("signup"));
$("email-form").addEventListener("submit", event => {
  event.preventDefault();
  authAction(async () => {
    await flow.request($("email").value, mode);
    notice("اگر درخواست مجاز باشد، کد برای ایمیل واردشده ارسال می‌شود.");
    sync(); $("otp").focus();
  });
});
$("code-form").addEventListener("submit", event => {
  event.preventDefault();
  authAction(async () => {
    const session = await flow.verify($("otp").value);
    $("otp").value = "";
    await applySession(session);
  });
});
$("resend-code").addEventListener("click", () => authAction(async () => {
  await flow.resend();
  $("otp").value = "";
  notice("درخواست ارسال کد تازه ثبت شد؛ از جدیدترین کد استفاده کنید.");
}));
$("change-email").addEventListener("click", () => {
  flow.reset(); $("otp").value = ""; write("pending-email", "");
  notice("ایمیل را اصلاح کنید. محدودیت ارسال مجدد همچنان برقرار است.");
  sync(); $("email").focus();
});
$("sign-out").addEventListener("click", () => authAction(async () => {
  // Remove rendered private data immediately, including when a request is slow.
  clearPrivateUI();
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) {
    notice("خروج سمت سرویس تأیید نشد. اتصال را بررسی و دوباره تلاش کنید؛ داده‌های خصوصی از صفحه پاک شده‌اند.", true);
    // Restore a retry control; do not claim successful logout after an error.
    $("signed-in").hidden = false;
    $("signed-out").hidden = true;
    return;
  }
  notice("از این مرورگر خارج شدید.");
}));
$("public-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!user || $("public-fields").disabled) return;
  const uid = user.id, generation = epoch;
  $("public-fields").disabled = true;
  try {
    await repository.savePublic(uid, { display_name: $("display-name").value.trim(), bio: $("bio").value.trim(), is_listed: $("is-listed").checked });
    if (generation !== epoch || user?.id !== uid) return;
    notice("بخش عمومی ذخیره شد.", false, "data-status");
    await loadDirectory();
  } catch { if (generation === epoch) notice("ذخیرهٔ بخش عمومی انجام نشد.", true, "data-status"); }
  finally { if (generation === epoch && user?.id === uid) $("public-fields").disabled = false; }
});
$("private-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!user || $("private-fields").disabled) return;
  const uid = user.id, generation = epoch;
  $("private-fields").disabled = true;
  try {
    await repository.savePrivate(uid, $("private-note").value);
    if (generation === epoch && user?.id === uid) notice("یادداشت خصوصی ذخیره شد.", false, "data-status");
  } catch { if (generation === epoch) notice("ذخیرهٔ یادداشت خصوصی انجام نشد.", true, "data-status"); }
  finally { if (generation === epoch && user?.id === uid) $("private-fields").disabled = false; }
});
$("refresh-directory").addEventListener("click", loadDirectory);

chooseMode(new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "signin");

try {
  const storage = window.localStorage;
  const probe = AUTH_STORAGE_KEY + "-probe";
  try { storage.setItem(probe, "1"); storage.removeItem(probe); }
  catch { throw new FlowError("storage_unavailable"); }
  client = getAuthClient();
  flow = new OtpFlow(client.auth, { storage });
  repository = createRepository(client);
  configured = true;
  // Keep callback synchronous. Never await another Auth call under its lock.
  client.auth.onAuthStateChange((_event, session) => {
    if (!session) { clearPrivateUI(); notice("از حساب خارج شده‌اید."); }
    else setTimeout(() => { applySession(session).catch(() => notice("نشست بارگذاری نشد. دوباره تلاش کنید.", true)); }, 0);
  });
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  await applySession(data.session);
  setInterval(sync, 1000);
} catch (error) { notice(errorText(error), true); }
sync();
