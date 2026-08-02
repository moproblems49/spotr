// DELETING ONE WORKOUT CARD MUST DELETE ONE WORKOUT.
//
// Your own profile builds a card per unposted session, keyed `hist_<date>_<dayName>`. Two sessions
// on the same day with the same name therefore produced two cards sharing ONE id, and Delete parsed
// that id back into a date + name and removed EVERY session matching both — locally and on the
// server. You confirmed one deletion and lost two workouts, with no undo.
//
// Two same-day "Push Day A" sessions is not a contrived fixture: a morning and an evening session,
// or two taps of the same program day, produce it. "Quick Workout" (the quick-start default name)
// collides even more easily.
//
// Shown red against 7e3a162 before being trusted.
import { chromium } from "playwright-core";

const ME = "11111111-1111-4111-8111-111111111111";
const SID_AM = "aaaaaaaa-4444-4444-8444-444444444401";
const SID_PM = "aaaaaaaa-4444-4444-8444-444444444402";
const d = new Date();
const DK = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const s = (w, r) => ({ weight: String(w), reps: String(r), done: true, type: "normal" });
const row = (id, hour, w) => ({ id, user_id: ME, day_name: "Push Day A", duration_secs: 3600,
  unit: "lbs", note: null, workout_date: DK,
  created_at: new Date(new Date().setHours(hour, 0, 0, 0)).toISOString(),
  exercises: [{ name: "Barbell Bench Press", sets: [s(w, 5)] }] });

// Same day, same name, different loads — 100×5 = 500 lbs and 200×5 = 1000 lbs.
const ROWS = [row(SID_AM, 9, 100), row(SID_PM, 19, 200)];

let fails = 0;
const check = (l, c, dd) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${dd ? " — " + dd : ""}`); } };

const PORT = process.env.PORT || "8207";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);

const deletes = [];
await page.addInitScript((me) => {
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
    prEvents: [], bodyLog: [], prs: {}, posts: [], profile: { username: "momo", name: "Mo" },
    users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, ME);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));
await page.route("**/rest/v1/**", r => {
  const req = r.request(), u = req.url(), m = req.method();
  if (m === "DELETE" && /workout_history/.test(u)) deletes.push(u.split("id=eq.")[1] || u);
  let body = "[]";
  if (m === "GET" && /\/rest\/v1\/workout_history\?/.test(u)) body = JSON.stringify(ROWS);
  else if (m === "GET" && /\/rest\/v1\/(profiles|public_profiles)\?/.test(u))
    body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]);
  r.fulfill({ status: 200, contentType: "application/json", body });
});

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 20000 });
await page.waitForTimeout(2500);

// Own profile (4th of 4 tabs).
await page.mouse.click(375, 869);
await page.waitForTimeout(1400);

// The workout cards sit below the heatmap/battery/strength blocks, so scroll them into view first.
// fmtVol abbreviates at 1000, so the 200×5 session reads "1.0k lbs" and the 100×5 one "500 lbs".
const scrollToCards = async () => {
  for (let i = 0; i < 20; i++) {
    if (await page.getByText("⋯", { exact: true }).locator("visible=true").count()) return;
    await page.mouse.wheel(0, 600); await page.waitForTimeout(180);
  }
};
const countCards = async () => {
  const t = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  return { has500: /\b500 lbs\b/.test(t), has1000: /1\.0k lbs/.test(t), text: t };
};
await scrollToCards();
const before = await countCards();
check("both same-day sessions render as their own card", before.has500 && before.has1000,
  `500:${before.has500} 1000:${before.has1000}`);

// Delete ONE of them via its ⋯ menu. (U+22EF MIDLINE HORIZONTAL ELLIPSIS — one glyph, not three
// U+00B7 middle dots; the first version of this test looked for the wrong character and found
// nothing, which reads exactly like "no menu" rather than "wrong selector".)
const dots = page.getByText("⋯", { exact: true }).locator("visible=true").first();
check("a workout card exposes its overflow menu", await dots.count() > 0);
if (await dots.count()) { await dots.click(); await page.waitForTimeout(600); }
const del = page.getByText("Delete", { exact: false }).locator("visible=true").first();
if (await del.count()) { await del.click(); await page.waitForTimeout(700); }
// confirmAction sheet
const confirm = page.getByText(/^(Delete|Confirm|Yes)$/).locator("visible=true").last();
if (await confirm.count()) { await confirm.click(); }
await page.waitForTimeout(1600);

const after = await countCards();
console.log("DELETE requests:", JSON.stringify(deletes));
console.log("after:", after.text.slice(0, 220));

// ── THE BUG ──────────────────────────────────────────────────────────────────────────────────
check("exactly ONE workout_history row is deleted", deletes.length === 1, JSON.stringify(deletes));
check("...and it is one of the two seeded sessions",
  deletes.length === 1 && [SID_AM, SID_PM].includes(deletes[0]), JSON.stringify(deletes));
const survivors = [after.has500, after.has1000].filter(Boolean).length;
check("the other session survives on screen", survivors === 1,
  `500:${after.has500} 1000:${after.has1000}`);
// Read the count off the header tile rather than pattern-matching loose text — "Mo 1/3 @momo"
// sits close enough to "0 Workouts" that a sloppy regex reports a PASS on a wiped profile.
const workoutsCount = await page.evaluate(() => {
  const m = document.body.innerText.replace(/\s+/g, " ").match(/(\d+)\s+Workouts?\b/);
  return m ? Number(m[1]) : -1;
});
check("the profile still reports exactly 1 workout", workoutsCount === 1, `reads ${workoutsCount}`);

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
