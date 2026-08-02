// The readiness map carries NO caption. Three have now been tried and cut — "Still recovering: …",
// "Lagging: …", then "Longest since trained: …" plus the recovery/sleep nudges under it. This pins
// that none of them comes back, and that removing the block didn't take the MAP with it.
//
// Shown to FAIL against the previous commit (3b66e7b): every string below was on screen there.
import { chromium } from "playwright-core";

const ME = "11111111-1111-4111-8111-111111111111";
const dk = (daysAgo) => { const d = new Date(Date.now() - daysAgo * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const s = (w, r) => ({ weight: String(w), reps: String(r), done: true, type: "normal" });
const row = (id, daysAgo, name, exercises) => ({ id, user_id: ME, day_name: name, duration_secs: 3600,
  unit: "lbs", note: null, workout_date: dk(daysAgo),
  created_at: new Date(Date.now() - daysAgo * 864e5).toISOString(), exercises });

// A history that WOULD have produced every removed caption:
//   Traps + calves untrained for 19 days → "Longest since trained: Traps 19d · Calves 19d"
//   recoveryScore 0.30 (< 0.45)          → "Your recovery is below baseline today — easing off helps."
const ROWS = [
  row("aaaaaaaa-0000-4000-8000-000000000001", 19, "Full Body",
    [{ name: "Barbell Shrug", sets: [s(225, 10), s(225, 10)] }, { name: "Standing Calf Raise", sets: [s(180, 12)] }]),
  ...[1, 3, 5].map((d, i) => row(`aaaaaaaa-0000-4000-8000-00000000000${i + 2}`, d, "Push",
    [{ name: "Barbell Bench Press", sets: [s(185, 8), s(185, 8), s(185, 7)] }])),
];

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);

await page.addInitScript((me) => {
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
    prEvents: [], posts: [], bodyType: "male", strengthSex: "male",
    // The strength map needs a bodyweight and some main lifts, or it renders its "log your
    // bodyweight" empty state instead of the caption — which is correct behaviour, not a bug.
    bodyLog: [{ date: new Date().toISOString().slice(0, 10), weight: 185, unit: "lbs" }],
    prs: { "Barbell Bench Press": 245, "Barbell Back Squat": 315, "Barbell Deadlift": 405,
           "Overhead Press": 145, "Barbell Row": 205 },
    profile: { username: "momo", name: "Mo" },
    users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
    // A genuinely poor overnight read: score 0.30 is under the 0.45 "below baseline" trigger,
    // and 5.2h is under the 6h "low sleep" fallback trigger. Both captions had a reason to fire.
    recovery: { recoveryScore: 0.30, hrv: 28, hrvBaseline: 45, restingHr: 62, sleepHours: 5.2,
      sleepStart: new Date(Date.now() - 13 * 36e5).toISOString(),
      sleepEnd: new Date(Date.now() - 8 * 36e5).toISOString() },
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, ME);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));
await page.route("**/rest/v1/**", r => {
  const u = r.request().url();
  let body = "[]";
  if (/\/rest\/v1\/workout_history\?/.test(u)) body = JSON.stringify(ROWS);
  else if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u))
    body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]);
  r.fulfill({ status: 200, contentType: "application/json", body });
});

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

await page.goto("http://127.0.0.1:8207/", { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => !/Setting up your account/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2200);

// The heatmap lives on your OWN profile (4th of 4 tabs), below the muscle-balance card.
await page.mouse.click(375, 869);
await page.waitForTimeout(1200);
// Scroll the profile until the readiness scale is on screen.
for (let i = 0; i < 14; i++) {
  if (await page.getByText("Recovering", { exact: true }).locator("visible=true").count()) break;
  await page.mouse.wheel(0, 600); await page.waitForTimeout(220);
}
await page.waitForTimeout(600);
const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
await page.screenshot({ path: "/home/user/spotr/build/_readycap.png" });

// ── The map itself must still be there ───────────────────────────────────────────────────────
check("the readiness scale still renders (a caption was removed, not the map)",
  body.includes("Recovering") && body.includes("Ready"), body.slice(0, 400));

// ── None of the cut captions may come back ───────────────────────────────────────────────────
for (const gone of [
  "Longest since trained",
  "Your recovery is below baseline",
  "Low recent sleep is slowing recovery",
  "Still recovering:",
  "Everything's been trained",
  "No recent training logged",
]) check(`"${gone}" is gone`, !body.includes(gone), "still on screen");

// ── This is not a blanket wipe: the STRENGTH map keeps its caption ────────────────────────────
const strengthBtn = page.getByText("Strength", { exact: true }).locator("visible=true").first();
if (await strengthBtn.count()) {
  await strengthBtn.click().catch(() => {});
  await page.waitForTimeout(800);
  const sBody = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  check("the strength map still explains itself", /Grey = no strength standard/.test(sBody), sBody.slice(0, 400));
  check("...and 'Lagging: ' as a standalone caption stays gone", !/Lagging: /.test(sBody));
} else check("the Strength mode toggle is reachable", false, "button not found");

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
