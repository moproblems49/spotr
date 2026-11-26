// "PRs" UNDER A HEADING THAT SAYS "THIS WEEK" MUST MEAN THIS WEEK.
//
// Mo reported "Friends Activity says I have 57 PRs this week". He had 57 rows in
// `personal_records` — one per exercise he has EVER set a PR on. Two independent counters, same
// mistake, both rendered under the screen's own "THIS WEEK" kicker:
//
//   * his OWN row  — `Object.keys(store.prs).length`, the lifetime PR map.
//   * FRIENDS' rows — `personal_records?user_id=in.(...)` with NO date filter at all.
//
// Fixed by counting the dated PR-hit log (`store.prEvents`, what Wrapped already counts) for the
// own row, and windowing the friends query on `updated_at`. That column only became truthful with
// the personal_records_touch_updated_at DB trigger — the client upserts with merge-duplicates and
// PostgREST's on-conflict UPDATE only touches columns in the payload, so it used to freeze at the
// row's first insert. Proven on live data: a PR logged 2026-08-10 whose row still read 2026-05-22.
//
// Shown red against the pre-fix code: the own row reported the lifetime count.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
const FRIEND = "22222222-2222-4222-8222-222222222222";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const dk = daysAgo => { const d = new Date(Date.now() - daysAgo * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

// ★ Nov 24 (Muse): this screen said 11 PRs while History showed 3 badges for the same week — two
// definitions. Both now read prsBySession (rebuilt from HISTORY), so the fixture seeds history
// through the stub (loadUserData replaces history wholesale) and the suite checks the two
// surfaces AGAINST EACH OTHER, plus the expected number.
// A first-ever log is a BASELINE, not a PR (Nov 26), so every lift is first logged at dk40.
//   dk40: Lift 0 190, Lift 1 130, Lift 2 300, Lift 7 185   (baselines: no tags)
//   dk30: Lift 0 200x5 (PR, outside the window)
//   dk6 : Lift 0 230x5 (PR), Lift 1 135x5 (PR)
//   dk3 : Lift 0 220x5 (no PR), Lift 1 140x5 (PR)
//   dk2 : Lift 2 315x3 (PR), Lift 3 100x5 (FIRST EVER -> baseline, no tag)
// => History tags 4 (one per exercise per session); Friends Activity counts the distinct lifts
// among those tags, 3 (Lift 1 improved twice = one lift that improved — the 57-PRs dedupe rule).
// Old History tagged a session only while its top set sat within 1% of TODAY's best, so Lift 0's
// month-old PR lost its tag once beaten, and Lift 1's first session was never tagged.
const LIFETIME_PRS = {};
for (let i = 0; i < 20; i++) LIFETIME_PRS[`Lift ${i}`] = 100 + i;
const prEvents = [];
const EXPECTED_WEEK_PRS = 3;   // distinct lifts
const EXPECTED_WEEK_TAGS = 4;  // per-session tags
const set = (w, r) => ({ weight: String(w), reps: String(r), done: true, type: "normal" });
let n = 0;
const row = (daysAgo, exs) => ({ id: `aaaaaaaa-0000-4000-8000-00000000000${++n}`, user_id: ME, day_name: `Day ${n}`,
  duration_secs: 3000, unit: "lbs", note: null, workout_date: dk(daysAgo),
  created_at: new Date(Date.now() - daysAgo * 864e5).toISOString(),
  exercises: exs.map(([name, w, r]) => ({ name, sets: [set(w, r)] })) });
const HISTORY_ROWS = [
  row(40, [["Lift 0", 190, 5], ["Lift 1", 130, 5], ["Lift 2", 300, 3], ["Lift 7", 185, 5]]),
  row(30, [["Lift 0", 200, 5]]),
  row(6, [["Lift 0", 230, 5], ["Lift 1", 135, 5]]),
  row(3, [["Lift 0", 220, 5], ["Lift 1", 140, 5]]),
  row(2, [["Lift 2", 315, 3], ["Lift 3", 100, 5]]),
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(6000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });

let prQueryUrl = null;   // capture the friends' personal_records query to assert it is windowed

await page.addInitScript(([me, friend, prs, evs]) => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
    programs: [], history: {}, workoutDates: {}, weeklyTarget: 3, bodyLog: [],
    prs, prEvents: evs, posts: [], profile: { username:"momo", name:"Mo" },
    users: [
      { id: me, username:"momo", name:"Mo", followers: [], following: [friend] },
      { id: friend, username:"pal", name:"Pal", followers: [me], following: [] },
    ] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, [ME, FRIEND, LIFETIME_PRS, prEvents]);

await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
  body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
await page.route("**/rest/v1/**", r => {
  const u = r.request().url();
  const J = b => r.fulfill({ status:200, contentType:"application/json", body: JSON.stringify(b) });
  if (/\/rest\/v1\/personal_records\?/.test(u)) {
    // Only the friends' read — the seeded history now makes the client self-heal its own PRs
    // with an on_conflict POST, which would otherwise overwrite this capture.
    if (r.request().method() !== "GET" || !/user_id=in\./.test(u)) return J([]);
    prQueryUrl = u;
    // The stub answers what a WINDOWED query would return (2 rows). A query with no date filter
    // would, against the real server, have returned every lifetime row — the bug under test.
    return J([{ user_id: FRIEND }, { user_id: FRIEND }]);
  }
  if (/\/rest\/v1\/workout_history\?/.test(u) && u.includes(ME)) return J(HISTORY_ROWS);
  if (/\/rest\/v1\/follows\?/.test(u))
    return J([{ follower_id: ME, following_id: FRIEND, status: "accepted" }]);
  if (/\/rest\/v1\/(public_)?profiles\?/.test(u))
    return J([
      { id: ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark", seen_onboarding:true, is_public:true },
      { id: FRIEND, username:"pal", name:"Pal", unit:"lbs", is_public:true },
    ]);
  return J([]);
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3200);

// Discover -> Friends Activity
await page.getByLabel("Discover").first().click().catch(() => {});
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => /friends activity/i.test((x.textContent||"").trim()));
  b && b.click();
});
await page.waitForTimeout(2000);

const body = await page.evaluate(() => document.body.innerText);
check("0. the Friends Activity screen is up, headed THIS WEEK",
  /Friends Activity/i.test(body) && /THIS WEEK/i.test(body), body.slice(0, 140).replace(/\n/g, " | "));

// Read the "You" row's PR tile by position: the three tiles are Sessions / Volume / PRs.
const myPrs = await page.evaluate(() => {
  const label = [...document.querySelectorAll("div")].filter(d => (d.textContent||"").trim() === "PRs");
  for (const l of label) {
    const tile = l.parentElement;
    const num = tile && tile.firstElementChild;
    if (num && /^\d+$/.test((num.textContent||"").trim())) return Number(num.textContent.trim());
  }
  return null;
});
console.log(`   own-row PRs tile reads: ${myPrs}   (lifetime PR'd exercises in the fixture: ${Object.keys(LIFETIME_PRS).length})`);
check(`1. the own row counts PRs THIS WEEK (${EXPECTED_WEEK_PRS}), not lifetime (${Object.keys(LIFETIME_PRS).length})`,
  myPrs === EXPECTED_WEEK_PRS, `got ${myPrs}`);

// History: count the per-exercise PR tags on sessions inside the same 7-day window.
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.getByLabel("Workout").first().click().catch(() => {});
await page.waitForTimeout(600);
await page.getByText("History", { exact: true }).first().click().catch(() => {});
await page.waitForTimeout(1600);
const hist = await page.evaluate((weekAgoKey) => {
  const out = [];
  document.querySelectorAll("[data-history-date]").forEach(g => {
    const d = g.getAttribute("data-history-date");
    g.querySelectorAll("[data-history-pr]").forEach(el => out.push({ d, name: el.getAttribute("data-history-pr") }));
  });
  return { all: out, groups: document.querySelectorAll("[data-history-date]").length };
});
const weekKey = dk(7);
const histWeek = hist.all.filter(x => x.d > weekKey);
check("2a. History rendered the seeded sessions", hist.groups === 5, `groups ${hist.groups}`);
check(`2b. History tags ${EXPECTED_WEEK_TAGS} PRs this week`, histWeek.length === EXPECTED_WEEK_TAGS, JSON.stringify(hist.all));
const histDistinct = new Set(histWeek.map(x => x.name)).size;
check("2c. History and Friends Activity agree (distinct lifts tagged == the count)", histDistinct === myPrs, `history ${histDistinct} vs friends ${myPrs}`);
check("2e. a first-ever log is NOT tagged (Lift 3 this week, every lift at dk40)", !hist.all.some(x => x.name === "Lift 3" || x.d === dk(40)), JSON.stringify(hist.all));
check("2e2. a second session that beats the first IS tagged (Lift 1, 6 days ago)", hist.all.some(x => x.d === dk(6) && x.name === "Lift 1"), JSON.stringify(hist.all));
check("2f. a PR keeps its tag after a later session beats it (Lift 0, 30 days ago)", hist.all.some(x => x.d === dk(30) && x.name === "Lift 0"), JSON.stringify(hist.all));
check("2d. a session that set no PR has no tag (Lift 0 220x5)", !hist.all.some(x => x.d === dk(3) && x.name === "Lift 0"), JSON.stringify(hist.all));
// (An "and it is not the lifetime count" check used to sit here. It PASSED against the broken
// build — the lifetime map picks up an extra entry at boot, so the buggy number was 21 while the
// check compared against 20. A check that cannot fail on the code it was written for is worse
// than no check; check 1 is the discriminating one.)

// The friends' query must carry a date window — without one the server returns every
// lifetime row and no amount of client arithmetic can recover the weekly number.
console.log(`   friends personal_records query: ${prQueryUrl ? prQueryUrl.split("/rest/v1/")[1] : "(never issued)"}`);
check("3. the friends' personal_records query is windowed by date",
  !!prQueryUrl && /updated_at=gte\./.test(prQueryUrl),
  prQueryUrl ? prQueryUrl.split("/rest/v1/")[1] : "(never issued)");

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
