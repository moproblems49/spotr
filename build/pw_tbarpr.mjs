// THE SERVER FIX ALONE DOES NOT REACH THE PHONE.
//
// Mo logged every T-Bar Row with the bar's 45 lbs added on top; the whole history was corrected at
// the source. But loadUserData rebuilds prs/prsE1rm/prsVolume from history and then MAX-MERGES the
// in-memory copy over the top — deliberately, so a failed PR upsert can't lose a real best — and
// that in-memory copy is rehydrated from localStorage every boot. So the stale inflated 135 wins
// the max forever and the correction looks like it never happened.
//
// The one-time `seshd_tbar_pr_reset_v1` migration drops the local t-bar entries so the next rebuild
// derives them from the corrected history. This suite seeds the exact bad state — corrected history
// (90 max) next to a stale local PR of 135 — and asserts the PR the user sees ends up at 90.
import { chromium } from "playwright-core";

const ME = "11111111-1111-4111-8111-111111111111";
const d = new Date();
const DK = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const s = (w, r) => ({ weight: String(w), reps: String(r), done: true, type: "normal" });

// Corrected history: best working set is 90.
const ROW = {
  id: "aaaaaaaa-4444-4444-8444-444444444444", user_id: ME,
  day_name: "Pull B", duration_secs: 3600, unit: "lbs", note: null,
  workout_date: DK, created_at: new Date().toISOString(),
  exercises: [{ name: "T-Bar Row", sets: [s(90, 12), s(90, 11), s(90, 8)] }],
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);
let fails = 0;
const check = (l, c, dd) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${dd ? " — " + dd : ""}`); } };
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });

await page.addInitScript((me) => {
  // SEED ONCE. addInitScript re-runs on every navigation, so seeding unconditionally would put the
  // pre-fix store back on the reload in check 7 while the migration flag survived — a state no real
  // device can reach, and it failed that check for a reason that had nothing to do with the app.
  if (localStorage.getItem("seshd_v1")) return;
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
    prEvents: [], bodyLog: [], posts: [], profile: { username: "momo", name: "Mo" },
    // The stale local state the migration exists to clear — inflated by the 45 lb bar.
    prs: { "T-Bar Row": 135, "Barbell Bench Press": 225 },
    prsE1rm: { "T-Bar Row": 189 }, prsVolume: { "T-Bar Row": 1620 },
    users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
  // NOTE: seshd_tbar_pr_reset_v1 deliberately NOT set — this is a device that hasn't migrated.
}, ME);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));
await page.route("**/rest/v1/**", r => {
  const u = r.request().url();
  let body = "[]";
  if (/\/rest\/v1\/workout_history\?/.test(u)) body = JSON.stringify([ROW]);
  else if (/\/rest\/v1\/personal_records\?/.test(u))
    body = JSON.stringify([{ user_id: ME, exercise_name: "T-Bar Row", weight_lbs: 90 }]);
  else if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u))
    body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]);
  r.fulfill({ status: 200, contentType: "application/json", body });
});

await page.goto(`http://127.0.0.1:${process.env.PORT || 8199}/`, { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => !/Setting up your account/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(3000);

const readStore = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("seshd_v1") || "{}"); } catch { return {}; } });
const st = await readStore();
console.log("prs:", JSON.stringify(st.prs), " prsE1rm:", JSON.stringify(st.prsE1rm), " prsVolume:", JSON.stringify(st.prsVolume));

check("1. the stale 135 lb T-Bar PR is gone from the local store",
  (st.prs?.["T-Bar Row"] ?? 0) !== 135, `prs=${JSON.stringify(st.prs)}`);
check("2. it reads the corrected best (90) from history, not the inflated one",
  (st.prs?.["T-Bar Row"] ?? 0) === 90, `got ${st.prs?.["T-Bar Row"]}`);
check("3. the e1RM baseline was rebuilt too (Epley on 90x12, capped at 12 reps = 126)",
  (st.prsE1rm?.["T-Bar Row"] ?? 0) === 126, `got ${st.prsE1rm?.["T-Bar Row"]} (stale was 189)`);
check("4. the single-set volume baseline was rebuilt too (90x12 = 1080)",
  (st.prsVolume?.["T-Bar Row"] ?? 0) === 1080, `got ${st.prsVolume?.["T-Bar Row"]} (stale was 1620)`);
check("5. a NON-t-bar PR is untouched — the migration is scoped, not a blanket PR wipe",
  (st.prs?.["Barbell Bench Press"] ?? 0) === 225, `got ${st.prs?.["Barbell Bench Press"]}`);
check("6. the device is flagged so this never runs again",
  await page.evaluate(() => localStorage.getItem("seshd_tbar_pr_reset_v1") === "1"));

// Reload: the corrected value must STICK. Without the flag the migration would re-run harmlessly,
// but the real risk is the opposite — the max-merge re-inflating from a stale localStorage copy.
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(3000);
const st2 = await readStore();
check("7. after a relaunch it is still 90, not re-inflated by the max-merge",
  (st2.prs?.["T-Bar Row"] ?? 0) === 90, `got ${st2.prs?.["T-Bar Row"]}`);

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
