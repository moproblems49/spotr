// The readiness map carries NO caption. Three have now been tried and cut — "Still recovering: …",
// "Lagging: …", then "Longest since trained: …" plus the recovery/sleep nudges under it. This pins
// that none of them comes back, and that removing the block didn't take the MAP with it.
//
// HONEST SCOPE (an audit corrected the original claim here): only TWO of these strings were ever
// on screen at 3b66e7b — "Longest since trained" and "Your recovery is below baseline". Those are
// the load-bearing checks. "Still recovering:" and "Lagging:" existed only in code COMMENTS by
// then; the low-sleep line needs recoveryScore to be ABSENT, not low; and the two
// "Everything's been trained" / "No recent training logged" strings are the ELSE branch of the
// same ternary this fixture deliberately drives down the IF side of, so they were unreachable by
// construction in every version. They are kept below as forward-looking guards, explicitly
// labelled as such rather than presented as evidence.
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

const PORT = process.env.PORT || "8199";
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
    // score 0.30 is under the 0.45 "below baseline" trigger. NOTE: 5.2h does NOT also arm the
    // low-sleep line — that one requires recoveryScore to be ABSENT, not low. An earlier comment
    // here claimed both fired; it was wrong, and the separate block below drives the real case.
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

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 20000 });
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
// Load-bearing: both were rendered at 3b66e7b with this exact fixture.
for (const gone of ["Longest since trained", "Your recovery is below baseline"])
  check(`"${gone}" is gone`, !body.includes(gone), "still on screen");
// Forward guards only — see the note at the top. These could not have failed at 3b66e7b.
for (const gone of ["Still recovering:", "Everything's been trained", "No recent training logged"])
  check(`(guard) "${gone}" does not return`, !body.includes(gone), "still on screen");

// The low-sleep line needs recoveryScore ABSENT. Drive that case properly rather than asserting
// it against a fixture that can never produce it.
{
  const p2 = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  p2.setDefaultTimeout(4000);
  await p2.addInitScript((me) => {
    const st = JSON.parse(localStorage.getItem("seshd_v1") || "{}");
    localStorage.setItem("seshd_v1", JSON.stringify({ ...st, currentUserId: me }));
  }, ME);
  await p2.addInitScript((me) => {
    const st = JSON.parse(localStorage.getItem("seshd_v1") || "{}");
    // sleepHours under 6 and NO recoveryScore — the only state that used to emit the low-sleep line.
    st.recovery = { sleepHours: 5.2, sleepStart: new Date(Date.now() - 13 * 36e5).toISOString(),
      sleepEnd: new Date(Date.now() - 8 * 36e5).toISOString() };
    st.currentUserId = me; st.theme = "dark"; st.unit = "lbs"; st.bodyType = "male";
    localStorage.setItem("seshd_v1", JSON.stringify(st));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
  }, ME);
  await p2.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));
  await p2.route("**/rest/v1/**", r => {
    const u = r.request().url(), m = r.request().method();
    let body2 = "[]";
    if (m === "GET" && /\/rest\/v1\/workout_history\?/.test(u)) body2 = JSON.stringify(ROWS);
    else if (m === "GET" && /\/rest\/v1\/(profiles|public_profiles)\?/.test(u))
      body2 = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]);
    r.fulfill({ status: 200, contentType: "application/json", body: body2 });
  });
  await p2.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 20000 });
  await p2.waitForTimeout(2400);
  await p2.mouse.click(375, 869);
  await p2.waitForTimeout(1200);
  for (let i = 0; i < 14; i++) {
    if (await p2.getByText("Recovering", { exact: true }).locator("visible=true").count()) break;
    await p2.mouse.wheel(0, 600); await p2.waitForTimeout(200);
  }
  const t2 = (await p2.locator("body").innerText()).replace(/\s+/g, " ");
  check('"Low recent sleep is slowing recovery" is gone (score ABSENT — the state that emitted it)',
    !t2.includes("Low recent sleep is slowing recovery"), t2.slice(0, 220));
  await p2.close();
}

// ── This is not a blanket wipe: the STRENGTH map keeps its caption ────────────────────────────
const strengthBtn = page.getByText("Strength", { exact: true }).locator("visible=true").first();
if (await strengthBtn.count()) {
  await strengthBtn.click().catch(() => {});
  await page.waitForTimeout(800);
  const sBody = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  check("the strength map still explains itself", /Grey = no strength standard/.test(sBody), sBody.slice(0, 400));
  check("(guard) 'Lagging: ' as a standalone caption stays gone", !/Lagging: /.test(sBody));
} else check("the Strength mode toggle is reachable", false, "button not found");

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
