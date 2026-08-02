// THREE GAPS IN THE EDIT PATH, all found by re-auditing the fixes rather than the original code.
//
//   1. The PR unwind keyed its change-detection signature by exercise NAME, one entry per name.
//      A session listing the same lift twice ("top single + back-off sets" is an ordinary way to
//      log) kept only the LAST row's signature, so editing an earlier duplicate looked like no
//      change at all: the whole unwind silently no-opped and the stale PR stood.
//
//   2. `strict` was wired to the DELETE caller only. Steps 3/4/5 of the edit still fuzzy-matched,
//      so editing the morning "Push Day A" PATCHED THE EVENING session's card with the morning's
//      numbers — a server-side write, permanent. matchesSession is id-only now; a card written
//      before client_id existed stops auto-syncing rather than corrupting a different one.
//
//   3. PR EVENTS were dropped only when the stored PR VALUE moved. Correct a mistyped 315 down
//      while genuinely having hit 315 on another day and the max doesn't move — so nothing fired
//      and the event claiming "315 on THIS session" survived for Wrapped to report.
//
// Red against 8b60dee.
import { chromium } from "playwright-core";

const ME = "11111111-1111-4111-8111-111111111111";
const d = new Date();
const DK = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const YDK = (() => { const y = new Date(Date.now() - 864e5);
  return `${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,"0")}-${String(y.getDate()).padStart(2,"0")}`; })();
const at = (h, dayOffset = 0) => new Date(new Date(Date.now() - dayOffset * 864e5).setHours(h, 0, 0, 0));
const st = (w, r, t) => ({ weight: String(w), reps: String(r), done: true, type: t || "normal" });

let fails = 0;
const check = (l, c, dd) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${dd ? " — " + dd : ""}`); } };

const PORT = process.env.PORT || "8199";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

async function open({ rows, posts = [], prs = {}, prEvents = [] }) {
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(4000);
  const writes = [];
  await page.addInitScript(([me, p, ev]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({
      currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
      weeklyTarget: 3, prEvents: ev, bodyLog: [], prs: p, posts: [],
      profile: { username: "momo", name: "Mo" },
      users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
    }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
  }, [ME, prs, prEvents]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));
  await page.route("**/rest/v1/**", r => {
    const req = r.request(), u = req.url(), m = req.method();
    if (m !== "GET") writes.push({ method: m, url: u.split("/rest/v1/")[1], body: req.postData() || "" });
    let body = "[]";
    if (m === "GET" && /\/rest\/v1\/workout_history\?/.test(u)) body = JSON.stringify(rows);
    else if (m === "GET" && /\/rest\/v1\/posts\?/.test(u)) body = JSON.stringify(posts);
    else if (m === "GET" && /\/rest\/v1\/(profiles|public_profiles)\?/.test(u))
      body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark", pr_events: prEvents }]);
    else if (m === "GET" && /\/rest\/v1\/personal_records/.test(u))
      body = JSON.stringify(Object.entries(prs).map(([n, w]) => ({ user_id: ME, exercise_name: n, weight_lbs: w })));
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(2600);
  await page.mouse.click(164, 869); await page.waitForTimeout(900);
  const h = page.getByText("History", { exact: true }).locator("visible=true").first();
  if (await h.count()) { await h.click(); await page.waitForTimeout(1300); }
  return { page, writes };
}

async function editNth(page, n, boxIndex, value) {
  for (let i = 0; i < 12; i++) {
    if (await page.getByText("Edit", { exact: true }).locator("visible=true").count() > n) break;
    await page.mouse.wheel(0, 600); await page.waitForTimeout(180);
  }
  await page.getByText("Edit", { exact: true }).locator("visible=true").nth(n).click();
  await page.waitForTimeout(900);
  const boxes = page.locator('input[inputmode="decimal"], input[inputmode="numeric"]').locator("visible=true");
  const shown = await boxes.nth(boxIndex).inputValue();
  await boxes.nth(boxIndex).fill(value);
  await page.waitForTimeout(250);
  const save = page.getByText("Save", { exact: false }).locator("visible=true").first();
  if (await save.count()) { await save.click(); }
  await page.waitForTimeout(2200);
  return shown;
}

// ── 1. The same exercise listed TWICE ────────────────────────────────────────────────────────
{
  // Top single 405×1, then back-off 225×8 — same lift, two rows. Stored PR 405.
  const rows = [{ id: "aaaaaaaa-8888-4888-8888-888888888801", user_id: ME, day_name: "Bench Day",
    duration_secs: 3600, unit: "lbs", note: null, workout_date: DK, created_at: at(9).toISOString(),
    exercises: [
      { name: "Barbell Bench Press", sets: [st(405, 1)] },
      { name: "Barbell Bench Press", sets: [st(225, 8)] },
    ] }];
  const { page, writes } = await open({ rows, prs: { "Barbell Bench Press": 405 } });
  const was = await editNth(page, 0, 0, "225");   // correct the FIRST (earlier) duplicate row
  check("the editor opened on the 405 top single", was === "405", `showed ${was}`);
  const after = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const strip = (after.match(/PERSONAL RECORDS([\s\S]{0,120})/) || [])[1] || "";
  const prWrites = writes.filter(w => /personal_records/.test(w.url));
  console.log("dup-row PR strip:", strip.trim().slice(0, 90), "| writes:", JSON.stringify(prWrites.map(w => w.method)));
  check("correcting an EARLIER duplicate row still unwinds the PR",
    /225/.test(strip) && !/405/.test(strip), strip.trim().slice(0, 120));
  check("...and the server row is rewritten", prWrites.length > 0, "no personal_records write");
  await page.close();
}

// ── 2. A legacy card must never be patched by another session's edit ─────────────────────────
{
  const rows = [
    { id: "aaaaaaaa-8888-4888-8888-888888888802", user_id: ME, day_name: "Push Day A",
      duration_secs: 3600, unit: "lbs", note: null, workout_date: DK, created_at: at(9).toISOString(),
      exercises: [{ name: "Barbell Bench Press", sets: [st(225, 5)] }] },
    { id: "aaaaaaaa-8888-4888-8888-888888888803", user_id: ME, day_name: "Push Day A",
      duration_secs: 3600, unit: "lbs", note: null, workout_date: DK, created_at: at(19).toISOString(),
      exercises: [{ name: "Incline Dumbbell Press", sets: [st(80, 10)] }] },
  ];
  // A card with NO client_id, belonging to the EVENING session.
  const posts = [{ id: "post-legacy-evening", user_id: ME, type: "workout", caption: "", image_url: null,
    location: null, run: null, yoga: null, achievement: null, unit: "lbs", is_pr: false,
    client_id: null, created_at: at(19).toISOString(),
    workout: { name: "Push Day A", duration: 3600, volume: 800,
      exercises: [{ name: "Incline Dumbbell Press", isPR: false, sets: [{ w: 80, r: 10 }] }] } }];
  const { page, writes } = await open({ rows, posts, prs: {} });
  const was = await editNth(page, 0, 0, "245");   // edit the MORNING session
  check("the editor opened on the morning session (225)", was === "225", `showed ${was}`);
  const patches = writes.filter(w => w.method === "PATCH" && /^posts\?id=eq\./.test(w.url));
  console.log("post PATCHes:", JSON.stringify(patches.map(p => p.url)));
  check("editing one session never patches ANOTHER session's legacy card", patches.length === 0,
    JSON.stringify(patches.map(p => ({ url: p.url, body: p.body.slice(0, 90) }))));
  await page.close();
}

// ── 3. A PR event must not survive on a set that no longer exists ────────────────────────────
{
  // 315 was mistyped today; the lifter genuinely hit 315 YESTERDAY, so the stored max never moves.
  const rows = [
    { id: "aaaaaaaa-8888-4888-8888-888888888804", user_id: ME, day_name: "Leg Day",
      duration_secs: 3600, unit: "lbs", note: null, workout_date: DK, created_at: at(9).toISOString(),
      exercises: [{ name: "Barbell Back Squat", sets: [st(315, 5)] }] },
    { id: "aaaaaaaa-8888-4888-8888-888888888805", user_id: ME, day_name: "Leg Day",
      duration_secs: 3600, unit: "lbs", note: null, workout_date: YDK, created_at: at(9, 1).toISOString(),
      exercises: [{ name: "Barbell Back Squat", sets: [st(315, 3)] }] },
  ];
  const prEvents = [{ sid: "aaaaaaaa-8888-4888-8888-888888888804", name: "Barbell Back Squat",
    weightLbs: 315, date: DK, types: ["weight"] }];
  const { page, writes } = await open({ rows, prs: { "Barbell Back Squat": 315 }, prEvents });
  const was = await editNth(page, 0, 0, "225");   // today's session corrected down
  check("the editor opened on today's 315", was === "315", `showed ${was}`);
  const profPatch = writes.filter(w => w.method === "PATCH" && /^profiles\?/.test(w.url) && /pr_events/.test(w.body));
  console.log("profiles pr_events PATCHes:", JSON.stringify(profPatch.map(p => p.body.slice(0, 140))));
  check("the PR event for a set that no longer exists is dropped", profPatch.length > 0,
    "no profiles pr_events PATCH issued");
  check("...and the event list no longer claims 315 on that session",
    profPatch.length > 0 && !/888888888804/.test(profPatch[profPatch.length - 1].body),
    profPatch[profPatch.length - 1]?.body?.slice(0, 160) || "");
  await page.close();
}

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
