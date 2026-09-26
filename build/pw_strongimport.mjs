// pw_strongimport — "Import from Strong", driven through the real screen against a STATEFUL stub.
//
// SYNTHETIC FIXTURE: the format was learned from a real export, which is personal data and never
// enters this (public) repo. What this guards is the set of failures that would all look FINE:
//   * nothing is written until every exercise has an answer (a muscle-less name silently zeroes
//     the muscle map -- the demo-corpus scar);
//   * re-importing the same file upserts the same rows instead of adding copies;
//   * a batch the server refuses is REPORTED, never toasted as success, and never shown locally;
//   * notes go to the private workout_notes column, never into the follower-readable jsonb;
//   * history past PostgREST's silent 1,000-row cap survives a refresh (loadUserData REPLACES
//     history wholesale, so a truncated read would quietly delete the oldest sessions).
import { chromium } from "playwright-core";
import fs from "fs"; import os from "os"; import path from "path";
const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
let fails = 0;
const check = (label, ok, detail = "") => { if (!ok) fails++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`); };

// ── fixture: 120 workouts -> 3 batches of 50/50/20 ─────────────────────────────────────────────
const H = "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE";
const lines = [H];
const day0 = new Date("2023-01-02T18:00:00");
for (let i = 0; i < 120; i++) {
  const d = new Date(day0.getTime() + i * 3 * 864e5);
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} 18:00:00`;
  const name = i === 60 ? "FAILME" : `Day ${i}`;
  const dur = i === 5 ? "23h 30m" : "1h 5m";
  lines.push(`${ds},"${name}",${dur},"Bench Press (Barbell)",W,95.0,10.0,0,0.0,"${i === 7 ? "felt heavy, go 5 lb lighter" : i === 75 ? "note in the refused batch" : ""}","",`);
  lines.push(`${ds},"${name}",${dur},"Bench Press (Barbell)",1,${135 + i},5.0,0,0.0,,,`);
  lines.push(`${ds},"${name}",${dur},"Bench Press (Barbell)",Rest Timer,0,0.0,0,90.0,,,`);
  lines.push(`${ds},"${name}",${dur},"Chest Fly",1,40.0,12.0,0,0.0,,,`);
  if (i === 119) lines.push(`${ds},"${name}",${dur},"Mystery Machine",1,50.0,10.0,0,0.0,,,`);
}
const csvFile = path.join(os.tmpdir(), "seshd_strong_fixture.csv");
fs.writeFileSync(csvFile, lines.join("\n"));

// ── stub server ────────────────────────────────────────────────────────────────────────────────
function makeServer({ failDay = null, preseed = 0, native = [] } = {}) {
  const hist = new Map(); let notes = {}; const posts = [];
  const iso = (ms) => new Date(ms).toISOString();
  for (let k = 0; k < preseed; k++) {   // pre-existing history, so the total crosses the 1,000 cap
    const id = `00000000-0000-4000-8000-${String(k).padStart(12, "0")}`;
    hist.set(id, { id, user_id: ME, day_name: "Old", exercises: [{ name: "Barbell Bench Press", sets: [{ weight: "100", reps: "5", done: true, type: "normal" }] }],
      duration_secs: 3000, unit: "lbs", note: "", workout_date: "2021-01-01", created_at: iso(Date.UTC(2021, 0, 1) + k * 1000) });
  }
  // Sessions logged natively IN SESHD (random ids, as the app mints them) on the given days.
  native.forEach((day, k) => {
    const id = `aaaaaaaa-0000-4000-8000-${String(k).padStart(12, "0")}`;
    hist.set(id, { id, user_id: ME, day_name: "Native", exercises: [{ name: "Barbell Bench Press", sets: [{ weight: "200", reps: "5", done: true, type: "normal" }] }],
      duration_secs: 3000, unit: "lbs", note: "", workout_date: day, created_at: `${day}T20:00:00.000Z` });
  });
  return { hist, posts, get notes() { return notes; }, async handle(r) {
    const q = r.request(), u = q.url(), m = q.method(); let status = 200, body = "[]";
    if (/\/rest\/v1\/workout_history/.test(u)) {
      if (m === "POST") {
        const arr = [].concat(JSON.parse(q.postData()));
        posts.push({ url: u.split("/rest/v1/")[1], n: arr.length });
        if (failDay && arr.some(x => x.day_name === failDay)) status = 500;
        else if (arr.some(x => !UUID.test(x.id || ""))) { status = 400; body = '{"code":"22P02"}'; }
        else if (arr.some(x => !x.user_id)) { status = 400; body = '{"code":"23502"}'; }
        else if (!/on_conflict=id/.test(u) && arr.some(x => hist.has(x.id))) { status = 409; body = '{"code":"23505"}'; }
        else { arr.forEach(x => hist.set(x.id, x)); body = JSON.stringify(arr); }
      } else {
        // PostgREST silently caps every response at "Max rows" (Supabase default 1,000).
        const sp = new URL(u).searchParams;
        const lim = Math.min(+(sp.get("limit") || 1e9), 1000), off = +(sp.get("offset") || 0);
        const all = [...hist.values()].sort((a, c) => c.created_at.localeCompare(a.created_at) || c.id.localeCompare(a.id));
        body = JSON.stringify(all.slice(off, off + lim));
      }
    } else if (/\/rest\/v1\/profiles/.test(u) && m === "PATCH") {
      const d = JSON.parse(q.postData() || "{}"); if (d.workout_notes) notes = d.workout_notes;
    } else if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u)) {
      body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark", workout_notes: notes }]);
    }
    r.fulfill({ status, contentType: "application/json", body });
  } };
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
async function open(server) {
  const p = await b.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  p.setDefaultTimeout(5000);
  p._errors = []; p.on("pageerror", e => p._errors.push(e.message));
  p._toasts = [];
  await p.addInitScript(me => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, prs: {}, posts: [],
      profile: { username: "momo", name: "Mo" }, users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", user: { id: me } }));
    localStorage.setItem("seshd_onboarded", "1"); localStorage.setItem("seshd_custom_merge_v1", "1");
  }, ME);
  await p.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "tok", user: { id: ME } }) }));
  await p.route("**/rest/v1/**", r => server.handle(r));
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  return p;
}
async function openImporter(p) {
  await p.locator('button[aria-label="Profile"]').first().click({ force: true }).catch(() => {}); await p.waitForTimeout(900);
  await p.locator('button[aria-label="Settings"]').first().click({ force: true }).catch(() => {}); await p.waitForTimeout(900);
  const row = p.getByText("Import workouts", { exact: true }).locator("visible=true").first();
  const n = await row.count();
  if (n) { await row.click({ force: true }); await p.waitForTimeout(1200); }
  return n;
}
const overlayText = (p) => p.evaluate(() => document.querySelector("[data-fullscreen-overlay]")?.innerText || "");
// Toasts auto-dismiss, so a single late sample can't tell "never shown" from "shown and gone" --
// poll the whole window and keep everything seen (the documented single-sample trap).
async function watchText(p, ms) {
  const seen = new Set(); const end = Date.now() + ms;
  while (Date.now() < end) { seen.add(await p.evaluate(() => document.body.innerText)); await p.waitForTimeout(150); }
  return [...seen].join("\n");
}
async function answerAll(p) {
  const need = await p.locator("[data-import-needs] [data-import-row]").evaluateAll(els => els.map(e => e.getAttribute("data-import-row")));
  if (need.includes("Chest Fly")) {
    await p.locator('[data-import-row="Chest Fly"] button').first().click(); await p.waitForTimeout(700);
    await p.locator('input[placeholder*="earch"]').locator("visible=true").first().fill("Cable Fly"); await p.waitForTimeout(500);
    // ★ Scope the pick to the ON-SCREEN match. After [1] the profile underneath lists twenty sessions
    // containing "Cable Fly (Neutral)", all still in the DOM below the importer, and `.first()` hit
    // one of those off-screen cards: nothing was picked, the sheet stayed open and covered the next
    // Skip button. An overlay does not remove the DOM beneath it.
    const picked = await p.getByText("Cable Fly (Neutral)", { exact: true }).evaluateAll(els => {
      const el = els.find(e => { const r = e.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) return false;
        const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!h && (e.contains(h) || h.contains(e)); });
      if (el) el.click(); return !!el; });
    if (!picked) throw new Error("the picker row for Cable Fly (Neutral) was not on screen");
    await p.waitForTimeout(700);
  }
  for (const n of need.filter(x => x !== "Chest Fly")) {
    await p.getByRole("button", { name: `Skip ${n}` }).click();
    await p.waitForTimeout(150);
  }
  return need;
}

// ── 1. the happy path, with 1,000 rows of history already on the server ─────────────────────────
console.log("\n[1] import, with existing history past the 1,000-row cap");
const s1 = makeServer({ preseed: 1000 });
const p1 = await open(s1);
check("[control] the pre-existing 1,000 sessions loaded", Object.values(JSON.parse(await p1.evaluate(() => localStorage.getItem("seshd_v1"))).history || {})
  .reduce((a, d) => a + Object.keys(d).length, 0) === 1000);
check("Settings has an 'Import workouts' row", await openImporter(p1) > 0);
await p1.locator("input[data-strong-file]").setInputFiles(csvFile); await p1.waitForTimeout(900);
let t = await overlayText(p1);
check("review counts the file (120 workouts)", /120 workouts/.test(t), t.split("\n").slice(2, 4).join(" / "));
check("Rest Timer rows are not counted as sets (240 working+warm-up bench + 120 fly + 1 = 361)", /361 sets/.test(t), (t.match(/[\d,]+ sets/) || [])[0]);
check("two names need a choice (Chest Fly, Mystery Machine)", /2 NEED A CHOICE/i.test(t));
const go = p1.locator("[data-import-go]");
check("import is BLOCKED while anything is unanswered", await go.isDisabled(), await go.innerText());
check("nothing was written before answering", s1.posts.length === 0, `${s1.posts.length} POSTs`);
await answerAll(p1);
check("after answering, the button counts what will actually be written (Mystery was its own set, workout kept)", /Import 120 workouts/.test(await go.innerText()), await go.innerText());
await go.click();
const seen1 = await watchText(p1, 6000);
const rows = [...s1.hist.values()].filter(r => r.day_name !== "Old");
check("all 120 workouts reached the server", rows.length === 120, `got ${rows.length}`);
check("written in batches, every URL an upsert on id", s1.posts.length === 3 && s1.posts.every(x => /on_conflict=id/.test(x.url)), JSON.stringify(s1.posts.map(x => x.n)));
check("every id is a UUID and every row is mine", rows.every(r => UUID.test(r.id) && r.user_id === ME));
check("no exercise in the follower-readable jsonb carries a note", !rows.some(r => r.exercises.some(e => "note" in e)));
check("the note went to the PRIVATE workout_notes column", Object.values(s1.notes).some(n => Object.values(n).some(v => /5 lb lighter/.test(v))), JSON.stringify(s1.notes).slice(0, 120));
check("the user's choice was applied (Chest Fly -> Cable Fly (Neutral))", rows.every(r => r.exercises.some(e => e.name === "Cable Fly (Neutral)")));
check("a skipped exercise was not imported", !rows.some(r => r.exercises.some(e => /Mystery/.test(e.name))));
check("a runaway timer imports as unknown duration", rows.find(r => r.day_name === "Day 5")?.duration_secs === 0);
check("success was reported", /Imported 120 workouts/.test(seen1));
const local1 = JSON.parse(await p1.evaluate(() => localStorage.getItem("seshd_v1")));
const n1 = Object.values(local1.history || {}).reduce((a, d) => a + Object.keys(d).length, 0);
check("after the refresh ALL 1,120 sessions are on the phone (none lost to the 1,000-row cap)", n1 === 1120, `got ${n1}`);
check("PRs rebuilt from the imported history", (local1.prs || {})["Barbell Bench Press"] >= 254, JSON.stringify((local1.prs || {})["Barbell Bench Press"]));

// ── 2. re-import the same file: same rows, no copies ────────────────────────────────────────────
console.log("\n[2] re-importing the same file");
await p1.getByRole("button", { name: /^Done$/ }).click().catch(() => {}); await p1.waitForTimeout(700);
const before = s1.hist.size;
check("reached the importer again", await openImporter(p1) > 0);
await p1.locator("input[data-strong-file]").setInputFiles(csvFile); await p1.waitForTimeout(900);
check("the review says these are already in Seshd and will be UPDATED", /120 of these are already in Seshd/.test(await overlayText(p1)));
await answerAll(p1); await p1.locator("[data-import-go]").click(); await p1.waitForTimeout(5000);
check("the server holds exactly as many rows as before (upsert, not a second copy)", s1.hist.size === before, `${before} -> ${s1.hist.size}`);
check("no page errors in [1]/[2]", p1._errors.length === 0, p1._errors.join(" | "));
await p1.close();

// ── 3. a batch the server refuses ───────────────────────────────────────────────────────────────
console.log("\n[3] a refused batch");
const s3 = makeServer({ failDay: "FAILME" });
const p3 = await open(s3);
await openImporter(p3);
await p3.locator("input[data-strong-file]").setInputFiles(csvFile); await p3.waitForTimeout(900);
await answerAll(p3); await p3.locator("[data-import-go]").click();
const seen3 = await watchText(p3, 6000);
check("[control] the other batches landed", s3.hist.size === 70, `got ${s3.hist.size}`);
check("the refused batch was retried once before giving up", s3.posts.filter(x => x.n === 50).length === 3, JSON.stringify(s3.posts.map(x => x.n)));
check("the done screen says what DIDN'T save", /70 imported, 50 didn't save/.test(seen3));
check("no success toast for a partial import", !/Imported 120 workouts/.test(seen3));
const local3 = JSON.parse(await p3.evaluate(() => localStorage.getItem("seshd_v1")));
const n3 = Object.values(local3.history || {}).reduce((a, d) => a + Object.keys(d).length, 0);
check("the phone holds only what the server confirmed", n3 === 70, `got ${n3}`);
// The local half of "only what the server confirmed" is overwritten by the refresh, so it can't be
// seen from here; the NOTES half can. A note for a workout the server refused would sit in the
// private column pointing at a session that doesn't exist.
check("[control] the note from a saved batch was written", JSON.stringify(s3.notes).includes("5 lb lighter"));
check("no note is written for a workout whose batch was refused", !JSON.stringify(s3.notes).includes("refused batch"), JSON.stringify(s3.notes).slice(0, 140));
check("no page errors in [3]", p3._errors.length === 0, p3._errors.join(" | "));

// ── 4. not a Strong file ────────────────────────────────────────────────────────────────────────
console.log("\n[4] a file that isn't a Strong export");
await p3.getByRole("button", { name: /^Done$/ }).click().catch(() => {}); await p3.waitForTimeout(700);
await openImporter(p3);
const bad = path.join(os.tmpdir(), "seshd_not_strong.csv"); fs.writeFileSync(bad, "name,age\nbob,3\n");
await p3.locator("input[data-strong-file]").setInputFiles(bad); await p3.waitForTimeout(700);
check("it is refused with a readable message", /doesn't look like a Strong export/.test(await overlayText(p3)));
// The screen is named "Import workouts", so it must say up front which app actually works, and a
// refused file must not answer with parser jargon (the old message listed missing column names).
const t4 = await overlayText(p3);
check("the error names no CSV columns", !/missing|Workout Name|Set Order/.test(t4), t4.slice(0, 200));
const src4 = await p3.evaluate(() => document.querySelector("[data-import-sources]")?.innerText || "");
check("the first screen lists Strong as supported", /Strong\s*SUPPORTED/i.test(src4), src4.slice(0, 120));
check("and says other apps are not supported yet", /aren't supported yet/.test(src4), src4.slice(0, 200));
await p3.locator("button[data-import-request]").click().catch(() => {}); await p3.waitForTimeout(900);
const fb = await p3.evaluate(() => [...document.querySelectorAll("textarea")].map(t => t.value).find(v => /import my workouts from/.test(v)) || null);
check("'Request an app' opens feedback with the sentence started", !!fb, String(fb));
check("[control] the importer closed so the feedback sheet is not buried under it",
  await p3.evaluate(() => !document.querySelector("input[data-strong-file]")));
await p3.close();

// ── 5. a Strong workout on a day already logged IN SESHD ─────────────────────────────────────────
// Native ids are random, so no id match can catch this; without the day check someone who used both
// apps side by side imports every shared day twice. Day 3 of the fixture is 2023-01-11.
console.log("\n[5] a Strong workout on a day already logged in Seshd");
const s5 = makeServer({ native: ["2023-01-11"] });
const p5 = await open(s5);
await openImporter(p5);
await p5.locator("input[data-strong-file]").setInputFiles(csvFile); await p5.waitForTimeout(900);
const ov = p5.locator("[data-import-overlap]");
check("the review names the overlapping workout", await ov.count() > 0 && /1 on days you already logged/i.test(await ov.innerText()), await ov.count() ? await ov.innerText() : "no overlap section");
check("the overlap is skipped by default", (await p5.locator("[data-import-overlap] [role=switch]").getAttribute("aria-checked", { timeout: 1500 }).catch(() => null)) === "true");
await answerAll(p5);
const go5 = p5.locator("[data-import-go]");
check("the button counts one fewer (119)", /Import 119 workouts/.test(await go5.innerText()), await go5.innerText());
await go5.click(); await watchText(p5, 5000);
const dayRows = [...s5.hist.values()].filter(r => r.workout_date === "2023-01-11");
check("that day still holds ONLY the native session (not a second copy)", dayRows.length === 1 && dayRows[0].day_name === "Native", JSON.stringify(dayRows.map(r => r.day_name)));
check("[control] the other 119 Strong workouts landed", [...s5.hist.values()].filter(r => r.day_name !== "Native").length === 119);
check("no page errors in [5]", p5._errors.length === 0, p5._errors.join(" | "));
await p5.close();

// Turning it off imports it after all -- the switch must govern the write, not just the label.
const s6 = makeServer({ native: ["2023-01-11"] });
const p6 = await open(s6);
await openImporter(p6);
await p6.locator("input[data-strong-file]").setInputFiles(csvFile); await p6.waitForTimeout(900);
await p6.locator("[data-import-overlap] [role=switch]").click({ timeout: 1500 }).catch(() => {}); await p6.waitForTimeout(200);
await answerAll(p6);
check("switched off, the button counts all 120", /Import 120 workouts/.test(await p6.locator("[data-import-go]").innerText()));
await p6.locator("[data-import-go]").click(); await watchText(p6, 5000);
check("switched off, the overlapping day gets the Strong workout too", [...s6.hist.values()].filter(r => r.workout_date === "2023-01-11").length === 2);
await p6.close();

await b.close();
console.log(`\n${fails ? "FAIL" : "PASS"} pw_strongimport (${fails} failure${fails === 1 ? "" : "s"})`);
process.exit(fails ? 1 : 0);
