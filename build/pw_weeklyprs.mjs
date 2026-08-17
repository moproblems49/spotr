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

// 20 lifetime PR'd exercises, but only THREE distinct exercises PR'd inside the last 7 days
// (one of them twice, on two different days, to prove the count dedupes by exercise).
const LIFETIME_PRS = {};
for (let i = 0; i < 20; i++) LIFETIME_PRS[`Lift ${i}`] = 100 + i;
const prEvents = [
  { date: dk(2), sid: "s1", name: "Lift 0", weightLbs: 225, types: ["weight"] },
  { date: dk(3), sid: "s2", name: "Lift 1", weightLbs: 135, types: ["e1rm"] },
  { date: dk(5), sid: "s3", name: "Lift 2", weightLbs: 315, types: ["weight", "volume"] },
  { date: dk(6), sid: "s4", name: "Lift 0", weightLbs: 230, types: ["weight"] },  // same lift again
  { date: dk(30), sid: "s5", name: "Lift 7", weightLbs: 185, types: ["weight"] }, // outside the window
  { date: dk(90), sid: "s6", name: "Lift 8", weightLbs: 205, types: ["weight"] }, // outside the window
];
const EXPECTED_WEEK_PRS = 3;

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
    prQueryUrl = u;
    // The stub answers what a WINDOWED query would return (2 rows). A query with no date filter
    // would, against the real server, have returned every lifetime row — the bug under test.
    return J([{ user_id: FRIEND }, { user_id: FRIEND }]);
  }
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
