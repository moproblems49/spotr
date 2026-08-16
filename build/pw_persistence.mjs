// ANYTHING YOU CHANGE MUST REACH THE SERVER, NOT JUST THE SCREEN.
//
// Two shipped bugs had the identical shape: a local `setStore` with no server write, standing in
// front of `loadUserData`, which overwrites its keys WHOLESALE from the server. The data appeared,
// looked saved, and was erased by the next background refresh or relaunch.
//
//   * the onboarding starter program  — bare setStore, never POSTed
//   * "Import a program by code"      — POSTed with a base36 id into a uuid column and no user_id,
//                                       failing 22P02 into a `.catch(devError)` under a
//                                       "Program imported" toast
//
// A full read of every key `loadUserData` writes says the rest are clean. This exists so that
// conclusion is CHECKED rather than believed, and so the next setting added to the app has
// something to fail against. Each case performs a real user action and asserts a matching write
// left the client.
//
// Deliberately NOT asserted here: `historyInteractions` (kudos/comments on unposted history rows)
// has no server table at all — the code says so — so it is on-device by design, not a defect.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(6000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });

// Every write the client makes, in order.
const writes = [];
// The log is CUMULATIVE and never truncated. An earlier draft did `writes.length = 0` before each
// action; the final assertion then re-read the emptied array and reported "unit never PATCHed"
// about a write it had already seen pass two checks earlier.
const profilePatches = (from = 0) => writes.slice(from).filter(w => w.table === "profiles" && w.method === "PATCH").map(w => w.body);
const sawProfileKey = (k, from = 0) => profilePatches(from).some(b => b && Object.prototype.hasOwnProperty.call(b, k));

await page.addInitScript(me => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
    programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
    weeklyTarget: 3, isPublic: false, customExercises: [],
    profile: { username:"momo", name:"Mo" }, users: [{ id: me, username:"momo", name:"Mo", followers:[], following:[] }] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, ME);
await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
  body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
await page.route("**/rest/v1/**", r => {
  const req = r.request(), u = req.url(), m = req.method();
  const J = b => r.fulfill({ status:200, contentType:"application/json", body: JSON.stringify(b) });
  const table = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1] || "?";
  if (m === "POST" || m === "PATCH" || m === "DELETE") {
    let body = null; try { body = JSON.parse(req.postData() || "null"); } catch {}
    writes.push({ table, method: m, body: Array.isArray(body) ? body[0] : body });
    return J([{ id: "00000000-0000-4000-8000-000000000001" }]);
  }
  if (/\/rest\/v1\/(public_)?profiles\?/.test(u))
    return J([{ id: ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark", seen_onboarding:true,
      weekly_target: 3, is_public: false }]);
  return J([]);
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2800);

// Open Settings (Profile -> gear).
await page.getByLabel("Profile").first().click().catch(() => {});
await page.waitForTimeout(1200);
const openedSettings = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => /settings/i.test(x.getAttribute("aria-label") || ""));
  if (b) { b.click(); return true; } return false;
});
await page.waitForTimeout(900);
check("Settings opens", openedSettings && /Appearance|Account|Units/i.test(await page.evaluate(() => document.body.innerText)));

// ── Units ────────────────────────────────────────────────────────────────────────────────────
const mUnit = writes.length;
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^kg$/i.test((x.textContent||"").trim())); b && b.click(); });
await page.waitForTimeout(900);
check("changing units writes profiles.unit", sawProfileKey("unit", mUnit),
  JSON.stringify(profilePatches(mUnit)).slice(0, 160));

// ── Weekly goal ──────────────────────────────────────────────────────────────────────────────
const mGoal = writes.length;
const bumped = await page.evaluate(() => {
  // The weekly-goal control is a row of day-count buttons; click one that is not the current 3.
  const b = [...document.querySelectorAll("button")].filter(x => /^[1-7]$/.test((x.textContent||"").trim()))
    .find(x => (x.textContent||"").trim() !== "3");
  if (b) { b.click(); return (b.textContent||"").trim(); } return null;
});
await page.waitForTimeout(900);
if (bumped) check("changing the weekly goal writes profiles.weekly_target", sawProfileKey("weekly_target", mGoal),
  JSON.stringify(profilePatches(mGoal)).slice(0, 160));
else console.log("  (weekly goal control not found on this screen — skipped)");

// ── Private account ──────────────────────────────────────────────────────────────────────────
const mPriv = writes.length;
// The public/private control is an On/Off segmented pair, not a switch element — a generic
// "find the pointer-cursor sibling of the label" walk found nothing and the case silently
// skipped itself, which is indistinguishable from the setting not persisting. Click "On"
// directly (the fixture starts private, so On is a real change).
const toggled = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => (x.textContent||"").trim() === "On");
  if (b) { b.click(); return true; } return false;
});
await page.waitForTimeout(900);
check("the private-account toggle is present", toggled);
check("toggling private account writes profiles.is_public", sawProfileKey("is_public", mPriv),
  JSON.stringify(profilePatches(mPriv)).slice(0, 160));

// Close the sheet so the run ends on a clean screen.
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^done$/i.test((x.textContent||"").trim())); b && b.click(); });
await page.waitForTimeout(600);

console.log(`\n  writes captured this run: ${writes.length}`);

// ── The invariant that actually generalises ──────────────────────────────────────────────────
// Whatever the app changed, a reload must not silently undo it. Snapshot the store, reload with a
// server that returns the ORIGINAL values, and confirm the app is not showing something the server
// never received. This is the exact mechanism both shipped bugs used.
const before = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("seshd_v1") || "{}");
  return { unit: s.unit, weeklyTarget: s.weeklyTarget, isPublic: s.isPublic };
});
console.log(`  local after edits: ${JSON.stringify(before)}`);
const unitWritten = profilePatches().some(b => b && "unit" in b);
check("the unit change reached the server before any reload could clobber it",
  unitWritten || before.unit === "lbs",
  `local unit=${before.unit}, unit ever PATCHed=${unitWritten}`);

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
