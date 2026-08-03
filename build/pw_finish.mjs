// THE FINISH SCREEN MUST DESCRIBE THE WORKOUT THAT WAS ACTUALLY SAVED.
//
// Three finish-path bugs, all confirmed by audit:
//   1. `totalSets`/`totalVol` walked EVERY exercise while `cleanEx`, the server payload and
//      postWorkoutPayload all filter `e.name`. Quick Start seeds an exercise with name:"" and
//      "+ Add Exercise" appends more, and their set rows are fully usable — so sets logged under a
//      blank-named row were counted on the summary and silently dropped from history, the server
//      row and the feed card. Measured: summary 3,250 lbs / 3 sets, history 2,250 / 2.
//   2. The streak was computed from `store.workoutDates` — the closure's copy, which the setStore
//      adding today hasn't updated. calcWeeklyStreak counts dates per week against weeklyTarget,
//      so the workout that COMPLETES the week is precisely the one it couldn't see.
//   3. A guest has no server, so handleSaveWorkout returns {ok:false, reason:"no-token"} — which
//      the finish path treated as a network failure. Every guest workout fired two error toasts
//      and pushed a whole copy of the session into a retry queue that can never drain.
//
// Plus the sign-out leak: an in-progress workout is not part of the session key, so it stayed on
// the device and the next account to sign in landed inside it.
//
// Shown red against 908d617 before being trusted.
import { chromium } from "playwright-core";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const dk = (daysAgo) => { const d = new Date(Date.now() - daysAgo * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

let fails = 0;
const check = (l, c, dd) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${dd ? " — " + dd : ""}`); } };

const PORT = process.env.PORT || "8199";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

// ── 1. Summary must match what is saved (blank-named exercise) ───────────────────────────────
// Rather than fight the NumberPad, seed the live session directly and read the two numbers.
async function summaryVsSaved(blankName) {
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(4000);
  const writes = [];
  const sess = {
    dayName: "Quick Workout", startedAt: Date.now() - 1800000, unit: "lbs",
    exercises: [
      { id: "e1", name: "Barbell Bench Press", sets: [{ id: "s1", weight: "225", reps: "5", done: true, type: "normal" }] },
      { id: "e2", name: blankName, sets: [{ id: "s2", weight: "100", reps: "10", done: true, type: "normal" }] },
    ],
  };
  await page.addInitScript(([me, s]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({
      currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
      weeklyTarget: 3, prEvents: [], bodyLog: [], prs: {}, posts: [],
      profile: { username: "momo", name: "Mo" },
      users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
    }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
    localStorage.setItem("seshd_active_session", JSON.stringify(s));
    localStorage.setItem("seshd_wstart", String(Date.now() - 1800000));
  }, [ME, sess]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));
  await page.route("**/rest/v1/**", r => {
    const req = r.request(), u = req.url(), m = req.method();
    if (m !== "GET") writes.push({ method: m, url: u.split("/rest/v1/")[1], body: req.postData() || "" });
    let body = "[]";
    if (m === "GET" && /\/rest\/v1\/(profiles|public_profiles)\?/.test(u))
      body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]);
    // A real PostgREST insert with return=representation echoes the row back. Answering "[]" reads
    // as "nothing was written", so the app correctly reported a failed save and the fixture — not
    // the app — was producing the "couldn't reach server" toast.
    else if (m === "POST" && /\/rest\/v1\/workout_history/.test(u)) {
      try { body = JSON.stringify([JSON.parse(req.postData() || "{}")]); } catch { body = "[]"; }
    }
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(2600);
  await page.mouse.click(164, 869);
  await page.waitForTimeout(1200);
  const fin = page.getByText(/^Finish/).locator("visible=true").first();
  if (await fin.count()) { await fin.click(); await page.waitForTimeout(900); }
  const confirm = page.getByText(/^Finish workout$/).locator("visible=true").last();
  if (await confirm.count()) { await confirm.click(); }
  await page.waitForTimeout(2200);
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const savePost = writes.find(w => w.method === "POST" && /^workout_history/.test(w.url));
  await page.close();
  return { text, savePost, writes };
}

{
  const r = await summaryVsSaved("");   // second exercise has NO name
  const summaryVol = (r.text.match(/([\d,\.k]+)\s*(?:lbs)?\s*TOTAL VOLUME/i) || r.text.match(/TOTAL VOLUME\s*([\d,\.k]+)/i) || [])[1];
  const savedSets = r.savePost ? (JSON.parse(r.savePost.body).exercises || []).reduce((a, e) => a + e.sets.length, 0) : -1;
  const savedVol = r.savePost ? (JSON.parse(r.savePost.body).exercises || [])
    .reduce((a, e) => a + e.sets.reduce((b, s) => b + Number(s.weight) * Number(s.reps), 0), 0) : -1;
  console.log("summary text:", r.text.slice(0, 260));
  console.log("summary volume:", summaryVol, " saved volume:", savedVol, " saved sets:", savedSets);
  // 225×5 = 1125 is saved; the blank-named 100×10 = 1000 is not.
  check("only the named exercise reaches the server", savedVol === 1125, `saved ${savedVol}`);
  // Read the TOTAL VOLUME tile itself. A whole-page regex matches the live header behind the
  // summary, which carries the same number — it could pass with only one of the two corrected.
  check("the summary's TOTAL VOLUME tile reports the SAVED volume", /^1,125\b/.test(String(summaryVol || "")),
    `tile said ${summaryVol}`);
  check("...and the live header behind it agrees", /1\/1 sets · 1,125 LBS/.test(r.text),
    (r.text.match(/\d+\/\d+ sets · [\d,\.k]+ LBS/) || ["(no header)"])[0]);
  check("...and the saved set count matches", savedSets === 1, `saved ${savedSets} sets`);

  // NO PR CELEBRATION POPUP. It fired 300ms after finishing and covered the summary, which
  // already lists the same PRs — Mo: "pops up after workout is done and i dont think we need it".
  // This session sets a first-ever PR on the bench (prs seeded empty), so the popup had every
  // reason to fire.
  // Singular with one PR, plural with several — the first cut only matched the plural and so
  // passed vacuously against the code that still had the popup.
  check("no PR popup covers the finish summary", !/PERSONAL RECORDS?/.test(r.text), r.text.slice(0, 240));
  check("...and no 'Let's go' dismiss button is present", !/Let's go/.test(r.text), r.text.slice(0, 240));
  check("...while the summary itself still reports the PR", /PR|RECORD/i.test(r.text), r.text.slice(0, 240));
}

// ── 2. The streak counts the workout you just finished ───────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(4000);
  // Two days already logged THIS week, weeklyTarget 3 — this finish completes the week.
  // NOTHING is seeded, and weeklyTarget is 1 — so today's finish is the ONLY thing that can
  // produce a streak. That isolates the bug exactly: the old code read store.workoutDates from
  // the closure, before the setStore adding today had committed, so it saw an empty map.
  //
  // The first cut of this fixture tried to seed "two prior days this week" and silently produced
  // an empty array whenever the test ran on a Sunday (as it did), failing a streak that had no
  // reason to exist. A fixture that depends on the day of the week is a fixture that goes red on
  // correct code — the same wall-clock trap as sim_bbgate and sim_bb24.
  const thisWeek = [];
  const sess = { dayName: "Push", startedAt: Date.now() - 1800000, unit: "lbs",
    exercises: [{ id: "e1", name: "Barbell Bench Press", sets: [{ id: "s1", weight: "225", reps: "5", done: true, type: "normal" }] }] };
  await page.addInitScript(([me, s, dates]) => {
    const wd = {}; dates.forEach(d => { wd[d] = true; });
    localStorage.setItem("seshd_v1", JSON.stringify({
      currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: wd,
      weeklyTarget: 1, prEvents: [], bodyLog: [], prs: {}, posts: [],
      profile: { username: "momo", name: "Mo" },
      users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
    }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
    localStorage.setItem("seshd_active_session", JSON.stringify(s));
    localStorage.setItem("seshd_wstart", String(Date.now() - 1800000));
  }, [ME, sess, thisWeek]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));
  await page.route("**/rest/v1/**", r => {
    // `req` must come from THIS handler. An earlier version referenced a `req` that wasn't in
    // scope here; the ReferenceError was swallowed by the catch below, body stayed "[]", and the
    // block silently exercised the OFFLINE branch while claiming to test a successful save.
    const req = r.request(), u = req.url(), m = req.method();
    let body = "[]";
    if (m === "GET" && /\/rest\/v1\/(profiles|public_profiles)\?/.test(u))
      body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]);
    // A real PostgREST insert with return=representation echoes the row back. Answering "[]" reads
    // as "nothing was written", so the app correctly reports a failed save.
    else if (m === "POST" && /\/rest\/v1\/workout_history/.test(u)) {
      try { body = JSON.stringify([JSON.parse(req.postData() || "{}")]); } catch { body = "[]"; }
    }
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(2600);
  await page.mouse.click(164, 869);
  await page.waitForTimeout(1200);
  const fin = page.getByText(/^Finish/).locator("visible=true").first();
  if (await fin.count()) { await fin.click(); await page.waitForTimeout(900); }
  const confirm = page.getByText(/^Finish workout$/).locator("visible=true").last();
  if (await confirm.count()) { await confirm.click(); }
  await page.waitForTimeout(2200);
  const t = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  console.log("streak fixture — prior days this week:", JSON.stringify(thisWeek), "→", t.slice(0, 200));
  check("the finish that completes the week shows a streak (today must count)", /\dW STREAK/i.test(t), t.slice(0, 240));
  await page.close();
}

// ── 3. A guest finish is not an error ────────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(4000);
  const sess = { dayName: "Push", startedAt: Date.now() - 1800000, unit: "lbs",
    exercises: [{ id: "e1", name: "Barbell Bench Press", sets: [{ id: "s1", weight: "225", reps: "5", done: true, type: "normal" }] }] };
  await page.addInitScript((s) => {
    localStorage.setItem("seshd_v1", JSON.stringify({
      currentUserId: null, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
      weeklyTarget: 3, prEvents: [], bodyLog: [], prs: {}, posts: [], users: [],
    }));
    localStorage.setItem("seshd_guest", "1");
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
    localStorage.setItem("seshd_active_session", JSON.stringify(s));
    localStorage.setItem("seshd_wstart", String(Date.now() - 1800000));
  }, sess);
  await page.route("**/rest/v1/**", r => r.abort());
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(2400);
  await page.mouse.click(164, 869);
  await page.waitForTimeout(1200);
  const fin = page.getByText(/^Finish/).locator("visible=true").first();
  if (await fin.count()) { await fin.click(); await page.waitForTimeout(900); }
  const confirm = page.getByText(/^Finish workout$/).locator("visible=true").last();
  if (await confirm.count()) { await confirm.click(); }
  await page.waitForTimeout(2200);
  const t = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const pending = await page.evaluate(() => localStorage.getItem("seshd_pending_workouts"));
  console.log("guest finish →", t.slice(0, 160), "| pending:", pending);
  check("a guest finish shows no 'couldn't reach server' error", !/couldn't reach server/i.test(t), t.slice(0, 200));
    check("...and the finish is reported as a success", /Workout saved/i.test(t), t.slice(0, 200));
  check("...and queues nothing for a retry that can never happen",
    !pending || JSON.parse(pending).length === 0, String(pending));
  await page.close();
}

// ── 4. Signing out must not leave your workout for the next account ──────────────────────────
// The live workout screen replaces the whole tab UI — no tab bar, no swipe track — so Profile
// genuinely cannot be reached from inside a workout in this build. That is why the first two cuts
// of this check reported "Sign Out unreachable": the app was right, the route didn't exist.
//
// What handleSignOut has to guarantee is simply that these keys are gone when it runs, whatever
// put them there. So: reach Settings normally, plant the keys, then sign out.
{
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(4000);
  await page.addInitScript((me) => {
    localStorage.setItem("seshd_v1", JSON.stringify({
      currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
      weeklyTarget: 3, prEvents: [], bodyLog: [], prs: {}, posts: [],
      profile: { username: "momo", name: "Mo" },
      users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
    }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
  }, ME);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/rest/v1/**", r => {
    const u = r.request().url(), m = r.request().method();
    let body = "[]";
    if (m === "GET" && /\/rest\/v1\/(profiles|public_profiles)\?/.test(u))
      body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.mouse.click(375, 869);                       // Profile
  await page.waitForTimeout(1300);
  const gear = page.locator('[aria-label="Settings"]').first();
  check("Settings is reachable from your own profile", await gear.count() > 0);
  if (await gear.count()) { await gear.click(); await page.waitForTimeout(1200); }

  // Plant exactly what a mid-workout sign-out leaves behind.
  await page.evaluate(() => {
    localStorage.setItem("seshd_active_session", JSON.stringify({ dayName: "Pull A", startedAt: Date.now() - 9e5, unit: "lbs",
      exercises: [{ id: "e1", name: "Barbell Row", sets: [{ id: "s1", weight: "185", reps: "8", done: true, type: "normal" }] }] }));
    localStorage.setItem("seshd_wstart", String(Date.now() - 9e5));
    localStorage.setItem("seshd_wlast_activity", String(Date.now() - 6e5));
    localStorage.setItem("seshd_rest", JSON.stringify({ running: true, startedAt: Date.now(), total: 120 }));
  });

  const so = page.getByText("Sign Out", { exact: true }).first();
  await so.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  check("the Sign Out control is reachable", await so.count() > 0);
  if (await so.count()) { await so.click(); }
  await page.waitForTimeout(2200);

  const left = await page.evaluate(() => ({
    auth: localStorage.getItem("seshd_session"),
    session: localStorage.getItem("seshd_active_session"),
    wstart: localStorage.getItem("seshd_wstart"),
    activity: localStorage.getItem("seshd_wlast_activity"),
    rest: localStorage.getItem("seshd_rest"),
  }));
  console.log("after sign out:", JSON.stringify({ ...left, session: left.session ? "PRESENT" : null }));
  check("signing out clears the auth session", !left.auth, String(left.auth).slice(0, 60));
  check("...and does NOT leave the in-progress workout for the next account", !left.session,
    String(left.session).slice(0, 120));
  check("...nor its start stamp", !left.wstart, String(left.wstart));
  check("...nor the idle-gap stamp", !left.activity, String(left.activity));
  check("...nor a running rest timer", !left.rest, String(left.rest));
  await page.close();
}

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
