// SHARING A WORKOUT FROM THE FEED COMPOSER.
//
// The composer is the OTHER way a workout reaches the feed (the first is the share toggle at
// finish). It was the blind spot behind three separate bugs:
//
//   * It never stamped `client_id`, so every card it created was permanently unmatchable by id —
//     which is why "match the post by session id" didn't actually fix editing the wrong card.
//   * Consolidating its payload onto postWorkoutPayload passed a `prs` that WAS NOT A PROP of
//     NewPostModal. That is a ReferenceError inside a click handler: the exact class CLAUDE.md
//     records ("a prop you forgot to pass is a ReferenceError, and a surrounding catch will eat
//     it"). It shipped in 2026-07-30r. Nothing in the existing suites shares from the composer.
//
// Red against 176f7b2: no `posts` POST is issued at all.
import { chromium } from "playwright-core";

const ME = "11111111-1111-4111-8111-111111111111";
const SID = "aaaaaaaa-7777-4777-8777-777777777701";
const d = new Date();
const DK = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const s = (w, r, t) => ({ weight: String(w), reps: String(r), done: true, type: t || "normal" });

// One session with a WARMUP: working volume 225×5 + 225×5 = 2250; the 135×10 warmup must not count.
const ROWS = [{ id: SID, user_id: ME, day_name: "Push Day A", duration_secs: 3600, unit: "lbs",
  note: null, workout_date: DK, created_at: new Date().toISOString(),
  exercises: [{ name: "Barbell Bench Press", sets: [s(135, 10, "warmup"), s(225, 5), s(225, 5)] }] }];

let fails = 0;
const check = (l, c, dd) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${dd ? " — " + dd : ""}`); } };

const PORT = process.env.PORT || "8199";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);

const writes = [];
const pageErrors = [];
page.on("pageerror", e => pageErrors.push(String(e)));
await page.addInitScript((me) => {
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
    weeklyTarget: 3, prEvents: [], bodyLog: [], prs: { "Barbell Bench Press": 225 }, posts: [],
    profile: { username: "momo", name: "Mo" },
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
  if (m !== "GET") writes.push({ method: m, url: u.split("/rest/v1/")[1], body: req.postData() || "" });
  let body = "[]";
  if (m === "GET" && /\/rest\/v1\/workout_history\?/.test(u)) body = JSON.stringify(ROWS);
  else if (m === "GET" && /\/rest\/v1\/(profiles|public_profiles)\?/.test(u))
    body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]);
  else if (m === "POST" && /\/rest\/v1\/posts/.test(u)) {
    try { body = JSON.stringify([{ ...JSON.parse(req.postData() || "{}"), id: "post-new-1" }]); } catch { body = "[]"; }
  }
  r.fulfill({ status: 200, contentType: "application/json", body });
});

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 20000 });
await page.waitForTimeout(2600);

// Feed tab (1st of 4) → the new-post composer.
await page.mouse.click(53, 869);
await page.waitForTimeout(1200);
const plus = page.locator('[aria-label="New post"], [aria-label="Create post"], [aria-label="Add post"]').locator("visible=true").first();
if (await plus.count()) { await plus.click(); await page.waitForTimeout(900); }
else {
  // Fall back to the "+" glyph in the top bar.
  const g = page.getByText("+", { exact: true }).locator("visible=true").first();
  if (await g.count()) { await g.click(); await page.waitForTimeout(900); }
}
const kind = page.getByText("Workout", { exact: true }).locator("visible=true").first();
check("the composer opens and offers a Workout post", await kind.count() > 0,
  (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 220));
if (await kind.count()) { await kind.click(); await page.waitForTimeout(800); }

// Pick the seeded session.
const pick = page.getByText("Push Day A", { exact: false }).locator("visible=true").first();
check("the recent workout is listed for sharing", await pick.count() > 0,
  (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 260));
if (await pick.count()) { await pick.click(); await page.waitForTimeout(700); }

const share = page.getByText(/^(Share|Post)$/).locator("visible=true").last();
if (await share.count()) { await share.click(); }
await page.waitForTimeout(2200);

const postWrite = writes.find(w => w.method === "POST" && /^posts/.test(w.url));
console.log("page errors:", JSON.stringify(pageErrors.slice(0, 2)));
console.log("posts POST:", postWrite ? postWrite.body.slice(0, 260) : "(none)");

// ── THE BUG ──────────────────────────────────────────────────────────────────────────────────
check("sharing from the composer throws no ReferenceError",
  !pageErrors.some(e => /is not defined|Can't find variable/.test(e)), JSON.stringify(pageErrors.slice(0, 2)));
check("...and a post is actually created", !!postWrite, "no POST to posts");

// ── The card must carry the session id, or every later lookup falls back to guessing ─────────
const bodyJson = postWrite ? JSON.parse(postWrite.body) : {};
check("the card carries the session id as client_id", bodyJson.client_id === SID,
  String(bodyJson.client_id));

// ── And the numbers must match every other card builder ──────────────────────────────────────
check("the card's volume excludes the warmup (2,250, not 3,600)", bodyJson?.workout?.volume === 2250,
  String(bodyJson?.workout?.volume));
check("...and the warmup set is not listed on it",
  (bodyJson?.workout?.exercises?.[0]?.sets || []).length === 2,
  JSON.stringify(bodyJson?.workout?.exercises?.[0]?.sets));

// ── NOT COVERED: re-sharing an already-posted workout ────────────────────────────────────────
// posts.client_id is UNIQUE, so stamping it means "upsert THIS card", never "add another" — for a
// deliberate second share from the composer that would overwrite the original card (caption, PR
// flag and image gone; created_at untouched so the "new" post never reaches the top of the feed).
// handleNewPost guards it: `fromComposer && alreadyShared` drops the client_id so a separate card
// is created instead.
//
// THAT GUARD IS NOT TESTED. Several attempts to drive a second share through this suite failed to
// reach the Share tap at all (the composer reopens, the picker renders, no POST is issued), and a
// check that cannot reach the code is worse than no check — it reads as coverage. Recorded here
// rather than silently dropped. Verified by inspection only; if it regresses, nothing here fires.

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
