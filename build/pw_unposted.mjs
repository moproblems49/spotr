// A WORKOUT YOU DIDN'T POST: where does it show up?
//
// The contract Mo asked for: it belongs to YOU, so it must appear in History and on your own
// profile — but it must NOT appear in the feed, which is for things you chose to post.
//
// Seeded through the fetch stub as a workout_history row, NOT just localStorage: loadUserData
// replaces the local history with the server's copy, so a seshd_v1-only seed gets wiped and every
// screen renders empty (documented harness gotcha).
import { chromium } from "playwright-core";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);

const ME = "11111111-1111-4111-8111-111111111111";
const d = new Date();
const DK = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const s = (w, r, t) => ({ weight: String(w), reps: String(r), done: true, type: t || "normal" });

// Warmups included so this also pins the card volume on the profile.
const WORKING = 275*5 + 275*5 + 275*4;              // 3850
const WARMUP  = 135*10 + 185*5;                     // 2275
const ROW = {
  id: "aaaaaaaa-1111-4111-8111-111111111111", user_id: ME,
  day_name: "Unposted Leg Day", duration_secs: 3600, unit: "lbs", note: null,
  workout_date: DK, created_at: new Date().toISOString(),
  exercises: [{ name: "Barbell Back Squat",
    sets: [s(135,10,"warmup"), s(185,5,"warmup"), s(275,5), s(275,5), s(275,4)] }],
};

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
  const u = r.request().url();
  let body = "[]";
  if (/\/rest\/v1\/workout_history\?/.test(u)) body = JSON.stringify([ROW]);
  else if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u))
    body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]);
  r.fulfill({ status: 200, contentType: "application/json", body });
});

let fails = 0;
const check = (l, c, dd) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${dd ? " — " + dd : ""}`); } };
const bodyText = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));

await page.goto("http://127.0.0.1:8199/", { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => !/Setting up your account/.test(document.body.innerText), null, { timeout: 15000 }).catch(()=>{});
await page.waitForTimeout(2000);

// ── FEED (nav slot 1) — must NOT show it ─────────────────────────────────────────────────────
await page.mouse.click(65, 869); await page.waitForTimeout(1400);
const feed = await bodyText();
await page.screenshot({ path: "build/shot_unposted_feed.png" });
console.log("FEED:", feed.slice(0, 180));
check("an unposted workout does NOT appear in the feed", !/Unposted Leg Day/.test(feed), feed.slice(0, 200));

// ── HISTORY (tracker tab → History sub-tab) — must show it ───────────────────────────────────
await page.mouse.click(164, 869); await page.waitForTimeout(900);
const hist = page.getByText("History", { exact: false }).first();
if (await hist.count()) { await hist.click(); await page.waitForTimeout(1200); }
const history = await bodyText();
await page.screenshot({ path: "build/shot_unposted_history.png" });
console.log("HISTORY:", history.slice(0, 220));
check("it DOES appear in History", /Unposted Leg Day/.test(history), history.slice(0, 250));

// ── OWN PROFILE (nav slot 4) — must show it, with working-set volume ─────────────────────────
await page.mouse.click(363, 869); await page.waitForTimeout(1600);
const prof = await bodyText();
await page.screenshot({ path: "build/shot_unposted_profile.png", fullPage: true });
console.log("PROFILE:", prof.slice(0, 300));
check("it DOES appear on your own profile", /Unposted Leg Day/.test(prof), prof.slice(0, 300));
check("the profile's Workouts count includes it (not 0)",
  !/\b0 Workouts?\b/.test(prof) && /\b1 Workouts?\b/.test(prof),
  prof.slice(0, 200));

// The app abbreviates volume with fmtVol: >=1000 becomes "3.9k". Match its own output, plus the
// plain/comma forms other screens use, so this asserts on what a reader actually sees.
const fmtVol = v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v);
const forms = v => new RegExp([fmtVol(v), String(v), v.toLocaleString("en-US")]
  .map(x => x.replace(/[.\\+*?()|[\]{}^$]/g, "\\$&")).join("|"));
const showsWorking  = forms(WORKING).test(prof);
const showsInflated = forms(WORKING + WARMUP).test(prof);
console.log(`working=${WORKING} inflated=${WORKING+WARMUP} showsWorking=${showsWorking} showsInflated=${showsInflated}`);
check("the profile card shows the WORKING-set volume", showsWorking, prof.slice(0, 300));
check("...and never the warmup-inflated total", !showsInflated, prof.slice(0, 300));
check("no warmup set row is printed on the card", !/135\s*[x×]\s*10/i.test(prof), prof.slice(0, 300));

// ── AND IT COUNTS TOWARDS EVERYTHING ─────────────────────────────────────────────────────────
// Not posting is a SHARING choice, not a "doesn't count" choice. Every derived number is computed
// from store.history, so an unposted session has to move all of them.
check("it counts toward the profile's Workouts number", /\b1 Workout\b/.test(prof), prof.slice(0, 160));
check("it counts toward Muscle Balance (3 working sets, warmups excluded)",
  /3 sets · last 30d/.test(prof), prof.slice(0, 300));
check("it counts toward the weekly streak badge", /1\/3/.test(prof), prof.slice(0, 160));
// Not a bare /training/ — that also matches Muscle Balance's EMPTY-state copy ("...how your
// training splits across muscle groups"), so it could pass even with no training load registered.
// The specific "−N training" fragment (App.jsx's Body Battery breakdown, `bb.workoutDrain`) only
// renders when a workout has actually drained the battery.
check("it drains Body Battery (training load registered)", /\d+ training\b/.test(prof), prof.slice(0, 400));

await page.mouse.click(164, 869); await page.waitForTimeout(800);
const h2 = page.getByText("History", { exact: false }).first();
if (await h2.count()) { await h2.click(); await page.waitForTimeout(1200); }
const hist2 = await bodyText();
check("it counts toward History's TOTAL workouts", /1 TOTAL/.test(hist2), hist2.slice(0, 200));
check("it counts toward LIFETIME volume", forms(WORKING).test(hist2), hist2.slice(0, 240));
// Scoped to the chart's own section, not just "somewhere on hist2" — a bare re-test of the same
// regex over the same text as the LIFETIME check above can't tell a right chart apart from a wrong
// one next to a right lifetime tile (exactly the class of bug this exercise is CLAUDE.md's own
// worked example of: the weekly chart printing 6.1k under a 3,850 lifetime tile).
const chartSection = hist2.slice(hist2.indexOf("VOLUME BY WEEK"), hist2.indexOf("PERSONAL RECORDS"));
check("it counts toward the weekly volume chart", forms(WORKING).test(chartSection), chartSection.slice(0, 260));
check("it sets a PERSONAL RECORD", /PERSONAL RECORDS[\s\S]*Barbell Back Squat/.test(hist2), hist2.slice(0, 320));
// There is no "Most Trained" section on History — the only "most trained" text in the app is the
// lowercase caption on the Feed's dismissible LAST WEEK recap card (App.jsx ~22967), which is
// gated to workouts strictly inside the PRIOR Mon-Sun window (weeklyRecap, App.jsx ~19892). ROW is
// dated today (this week), so that card can never render for it, on top of the check's own
// case/screen mismatch (uppercase "MOST TRAINED" vs the real lowercase text). The property this
// was trying to test — an unposted workout still moves per-muscle derived stats — is already
// covered above by the (not week-scoped) Muscle Balance check on Profile.

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
