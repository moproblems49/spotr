// A PR MUST BE ABLE TO COME BACK DOWN, AND A UNIT MUST MEAN WHAT IT SAYS.
//
// Five bugs, all confirmed by audit:
//   1. Nothing in the app could LOWER a PR. The edit path only ever raised store.prs,
//      personal_records kept the old row, and loadUserData merges server ∪ history ∪ in-memory
//      taking the MAX — so correcting a mistyped 315 down to 225 left 315 standing as a PR for a
//      set that exists nowhere in the data, permanently and with no UI to remove it.
//   2. Same for DELETING the session that held the PR.
//   3. The edit modal labelled its weight column with the APP's unit, not the SESSION's. A kg
//      session shown to a lbs-mode user reads "LBS" over a 143 that means kg — "fixing" it to 315
//      writes 315 kg (694 lbs) into the log and the PR.
//   4. History's TOTAL/THIS MONTH tiles counted DAYS while the lifetime tile beside them summed
//      sessions and the profile counted sessions. Two workouts in a day read as "1 TOTAL".
//   5. Switching units mid-workout reinterpreted every set already logged: 100 lbs became 100 kg.
//
// Shown red against bebb06c before being trusted.
import { chromium } from "playwright-core";

const ME = "11111111-1111-4111-8111-111111111111";
const d = new Date();
const DK = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const at = (h) => new Date(new Date().setHours(h, 0, 0, 0));
const st = (w, r) => ({ weight: String(w), reps: String(r), done: true, type: "normal" });

let fails = 0;
const check = (l, c, dd) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${dd ? " — " + dd : ""}`); } };

const PORT = process.env.PORT || "8199";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

async function open({ rows, prs, unit = "lbs", activeSession = null }) {
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(4000);
  const writes = [];
  await page.addInitScript(([me, p, u, s]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({
      currentUserId: me, theme: "dark", unit: u, programs: [], history: {}, workoutDates: {},
      weeklyTarget: 3, prEvents: [], bodyLog: [], prs: p, posts: [],
      profile: { username: "momo", name: "Mo" },
      users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
    }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
    if (s) {
      localStorage.setItem("seshd_active_session", JSON.stringify(s));
      localStorage.setItem("seshd_wstart", String(Date.now() - 9e5));
    }
  }, [ME, prs || {}, unit, activeSession]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));
  await page.route("**/rest/v1/**", r => {
    const req = r.request(), u2 = req.url(), m = req.method();
    if (m !== "GET") writes.push({ method: m, url: u2.split("/rest/v1/")[1], body: req.postData() || "" });
    let body = "[]";
    if (m === "GET" && /\/rest\/v1\/workout_history\?/.test(u2)) body = JSON.stringify(rows || []);
    else if (m === "GET" && /\/rest\/v1\/(profiles|public_profiles)\?/.test(u2))
      body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit, is_public: true, seen_onboarding: true, theme: "dark" }]);
    else if (m === "GET" && /\/rest\/v1\/personal_records/.test(u2))
      body = JSON.stringify(Object.entries(prs || {}).map(([n, w]) => ({ user_id: ME, exercise_name: n, weight_lbs: w })));
    else if (m === "POST" && /\/rest\/v1\/workout_history/.test(u2)) {
      try { body = JSON.stringify([JSON.parse(req.postData() || "{}")]); } catch { body = "[]"; }
    }
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(2600);
  return { page, writes };
}

const toHistory = async (page) => {
  await page.mouse.click(164, 869); await page.waitForTimeout(900);
  const h = page.getByText("History", { exact: true }).locator("visible=true").first();
  if (await h.count()) { await h.click(); await page.waitForTimeout(1300); }
};

// ── 1. Editing a PR DOWN releases it ─────────────────────────────────────────────────────────
{
  const rows = [{ id: "aaaaaaaa-6666-4666-8666-666666666601", user_id: ME, day_name: "Leg Day",
    duration_secs: 3600, unit: "lbs", note: null, workout_date: DK, created_at: at(9).toISOString(),
    exercises: [{ name: "Barbell Back Squat", sets: [st(315, 5)] }] }];
  const { page, writes } = await open({ rows, prs: { "Barbell Back Squat": 315 } });
  await toHistory(page);
  const before = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  check("the mistyped 315 is showing as the PR to begin with", /315/.test(before), before.slice(0, 200));

  const editBtn = page.getByText("Edit", { exact: true }).locator("visible=true").first();
  if (await editBtn.count()) { await editBtn.click(); await page.waitForTimeout(900); }
  const box = page.locator('input[inputmode="decimal"], input[inputmode="numeric"]').locator("visible=true").first();
  if (await box.count()) { await box.fill("225"); await page.waitForTimeout(250); }
  const save = page.getByText("Save", { exact: false }).locator("visible=true").first();
  if (await save.count()) { await save.click(); }
  await page.waitForTimeout(2200);

  const after = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const prStrip = (after.match(/PERSONAL RECORDS([\s\S]{0,120})/) || [])[1] || "";
  console.log("PR strip after edit-down:", prStrip.trim().slice(0, 100));
  console.log("writes:", JSON.stringify(writes.filter(w => /personal_records/.test(w.url)).map(w => ({ m: w.method, b: w.body.slice(0, 90) }))));
  check("the PR follows the correction down to 225", /225/.test(prStrip) && !/315/.test(prStrip), prStrip.trim().slice(0, 120));
  const prWrite = writes.find(w => /personal_records/.test(w.url));
  check("...and the server row is rewritten, not left stale", !!prWrite, "no personal_records write");
  check("...with the corrected weight", !!prWrite && /225/.test(prWrite.body), prWrite?.body?.slice(0, 120) || "");
  await page.close();
}

// ── 2. Deleting the session that held the PR releases it ─────────────────────────────────────
{
  const rows = [{ id: "aaaaaaaa-6666-4666-8666-666666666602", user_id: ME, day_name: "Leg Day",
    duration_secs: 3600, unit: "lbs", note: null, workout_date: DK, created_at: at(9).toISOString(),
    exercises: [{ name: "Barbell Back Squat", sets: [st(315, 5)] }] }];
  const { page, writes } = await open({ rows, prs: { "Barbell Back Squat": 315 } });
  await toHistory(page);
  const del = page.getByText("Delete", { exact: true }).locator("visible=true").first();
  if (await del.count()) { await del.click(); await page.waitForTimeout(600); }
  const confirm = page.getByText(/^Delete\?$/).locator("visible=true").last();
  if (await confirm.count()) { await confirm.click(); }
  await page.waitForTimeout(2200);
  const after = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const prDel = writes.find(w => /personal_records/.test(w.url) && w.method === "DELETE");
  console.log("after delete:", after.slice(0, 200));
  console.log("pr writes:", JSON.stringify(writes.filter(w => /personal_records/.test(w.url)).map(w => w.method + " " + w.url)));
  check("deleting the only session for a lift removes its PR from the server", !!prDel,
    JSON.stringify(writes.filter(w => /personal_records/.test(w.url)).map(w => w.method)));
  // A day that has lost its last session is not a training day. This read "1 TOTAL" beside
  // "0 LIFETIME" — the delete cleared history but left the date in workoutDates.
  const totalAfter = (after.match(/(\d+)\s+TOTAL\b/) || [])[1];
  check("...and the emptied day stops counting as a workout", totalAfter === "0", `TOTAL reads ${totalAfter}`);
  check("...and it is gone from the PR strip", !/Barbell Back Squat/.test((after.match(/PERSONAL RECORDS([\s\S]{0,120})/) || [])[1] || ""),
    (after.match(/PERSONAL RECORDS([\s\S]{0,120})/) || [])[1] || "(no strip)");
  await page.close();
}

// ── 3. The edit modal labels the SESSION's unit ──────────────────────────────────────────────
{
  const rows = [{ id: "aaaaaaaa-6666-4666-8666-666666666603", user_id: ME, day_name: "Leg Day",
    duration_secs: 3600, unit: "kg", note: null, workout_date: DK, created_at: at(9).toISOString(),
    exercises: [{ name: "Barbell Back Squat", sets: [st(143, 5)] }] }];
  const { page } = await open({ rows, prs: {}, unit: "lbs" });   // app in LBS, session in KG
  await toHistory(page);
  const editBtn = page.getByText("Edit", { exact: true }).locator("visible=true").first();
  if (await editBtn.count()) { await editBtn.click(); await page.waitForTimeout(1000); }
  const modal = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  // No `|| modal` fallback: if the anchor stops matching, this must fail loudly rather than
  // quietly widen to the whole page and keep passing.
  const header = (modal.match(/Edit workout([\s\S]{0,220})/) || [])[1];
  check("the edit modal opened", !!header, modal.slice(0, 160));
  console.log("edit modal:", header.trim().slice(0, 200));
  check("a kg session's editor does not label its column LBS", !/\bLBS\b/.test(header), header.trim().slice(0, 200));
  // Case-SENSITIVE, and anchored to the column row — /\bKG\b/i also matched the "logged in kg"
  // subtitle, so a regression in the column label alone would have left this green.
  check("...the SET/REPS column header says KG", /SET\s+KG\s+REPS/.test(header), header.trim().slice(0, 200));
  check("...and the subtitle names the session's unit too", /logged in kg/.test(header), header.trim().slice(0, 200));
  await page.close();
}

// ── 4. Two sessions in a day are two workouts ────────────────────────────────────────────────
{
  const rows = [1, 2].map((n, i) => ({ id: `aaaaaaaa-6666-4666-8666-66666666660${4 + i}`, user_id: ME,
    day_name: "Push Day A", duration_secs: 3600, unit: "lbs", note: null, workout_date: DK,
    created_at: at(9 + i * 8).toISOString(),
    exercises: [{ name: "Barbell Bench Press", sets: [st(100 * n, 5)] }] }));
  const { page } = await open({ rows, prs: {} });
  await toHistory(page);
  const t = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const total = (t.match(/(\d+)\s+TOTAL\b/) || [])[1];
  const month = (t.match(/(\d+)\s+THIS MONTH\b/) || [])[1];
  console.log("history tiles →", t.slice(0, 140));
  check("History counts two same-day sessions as two workouts", total === "2", `TOTAL reads ${total}`);
  check("...and THIS MONTH agrees", month === "2", `THIS MONTH reads ${month}`);
  await page.close();
}

// ── 5. Switching units mid-workout converts what's already logged ────────────────────────────
{
  const sess = { dayName: "Pull A", startedAt: Date.now() - 9e5, unit: "lbs",
    exercises: [{ id: "e1", name: "Lat Pulldown (Wide)", sets: [{ id: "s1", weight: "100", reps: "10", done: true, type: "normal" }] }] };
  const { page } = await open({ rows: [], prs: {}, unit: "lbs", activeSession: sess });
  // The live workout screen hides the tab bar, so flip the unit the way Settings does.
  await page.waitForTimeout(500);
  const beforeHeader = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  check("the live header starts at 1,000 lbs", /1,000 LBS/i.test(beforeHeader), beforeHeader.slice(0, 140));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("seshd:unit-changed", { detail: { from: "lbs", to: "kg" } })));
  await page.waitForTimeout(900);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("seshd_active_session") || "{}"));
  const w = stored?.exercises?.[0]?.sets?.[0]?.weight;
  console.log("weight after lbs→kg:", w);
  check("a 100 lb set becomes 45.4 kg, not 100 kg", Math.abs(parseFloat(w) - 45.4) < 0.2, String(w));
  await page.close();
}

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
