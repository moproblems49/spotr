// THE FIRST-RUN SPINE, END TO END, IN ONE PASS.
//
// Sign up -> onboard -> start the program you were given -> log sets -> finish -> share -> RELAUNCH
// -> is any of it still there.
//
// Every suite in this repo seeds `seshd_onboarded` and a ready-made store, so nothing had ever
// walked the app as a brand-new user. That single gap is why three separate bugs shipped and sat:
//
//   * PROGRAM_TEMPLATES deleted with its references left behind — the Onboarding component body
//     threw, so EVERY new signup got the error boundary instead of the first screen, for 12 days.
//   * The onboarding starter program was written locally and never POSTed, so it vanished on the
//     next refresh and left the user on "No active program".
//   * Import-by-code POSTed a base36 id into a uuid column and reported success anyway.
//
// The reload at the end is the part that matters most. The server here is STATEFUL and returns
// only what the client actually wrote, so anything that never left the phone is gone after it —
// which is exactly the mechanism all three bugs used.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const uuid = n => `${String(n).padStart(8,"0")}-0000-4000-8000-000000000000`;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(6000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });

// ── A stateful server. It keeps ONLY what the client sends it. ────────────────────────────────
const db = {
  profile: { id: ME, username: "momo", name: "Mo", unit: "lbs", theme: "dark",
             seen_onboarding: false, active_program_id: null },
  programs: [], workout_history: [], posts: [], personal_records: [],
};
let seq = 1;
await page.addInitScript(me => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
    programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
    profile: { username:"momo", name:"Mo" }, users: [{ id: me, username:"momo", name:"Mo", followers:[], following:[] }] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
  localStorage.setItem("seshd_custom_merge_v1", "1");
  // seshd_onboarded deliberately NOT set — this is the new-user path.
}, ME);
await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
  body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
await page.route("**/rest/v1/**", r => {
  const req = r.request(), u = req.url(), m = req.method();
  const J = (b, s = 200) => r.fulfill({ status:s, contentType:"application/json", body: JSON.stringify(b) });
  let body = null; try { body = JSON.parse(req.postData() || "null"); } catch {}
  const one = Array.isArray(body) ? body[0] : body;

  if (/\/rest\/v1\/programs/.test(u)) {
    if (m === "POST") {
      // Model the real column types — id and user_id are both uuid NOT NULL. A stub that accepts
      // anything cannot fail against the bug this file exists to catch.
      if (one && "id" in one && !/^[0-9a-f-]{36}$/i.test(String(one.id))) return J({ code:"22P02" }, 400);
      if (!one?.user_id) return J({ code:"23502" }, 400);
      const row = { id: uuid(seq++), user_id: one.user_id, name: one.name, days: one.days };
      db.programs.push(row); return J([row]);
    }
    if (m === "PATCH") {
      const id = (u.match(/id=eq\.([^&]+)/) || [])[1];
      db.programs = db.programs.map(p => p.id === id ? { ...p, ...(one || {}) } : p);
      return J(db.programs);
    }
    return J(db.programs);
  }
  if (/\/rest\/v1\/workout_history/.test(u)) {
    if (m === "POST") {
      const row = { ...(one || {}), id: one?.id || uuid(seq++), user_id: ME,
                    created_at: new Date().toISOString() };
      const i = db.workout_history.findIndex(w => w.id === row.id);
      if (i >= 0) db.workout_history[i] = row; else db.workout_history.push(row);
      return J([row]);
    }
    if (m === "PATCH") {
      const id = (u.match(/id=eq\.([^&]+)/) || [])[1];
      db.workout_history = db.workout_history.map(w => w.id === id ? { ...w, ...(one || {}) } : w);
      return J(db.workout_history);
    }
    return J(db.workout_history);
  }
  if (/\/rest\/v1\/posts/.test(u)) {
    if (m === "POST") {
      const row = { ...(one || {}), id: uuid(seq++), user_id: ME, created_at: new Date().toISOString(),
                    kudos: [], comments: [] };
      db.posts.push(row); return J([row]);
    }
    return J(db.posts.map(p => ({ ...p, kudos: [], comments: [] })));
  }
  if (/\/rest\/v1\/personal_records/.test(u)) {
    if (m === "POST") { db.personal_records.push(one); return J([one]); }
    return J(db.personal_records);
  }
  if (/\/rest\/v1\/profiles/.test(u)) {
    if (m === "PATCH") { Object.assign(db.profile, one || {}); return J([db.profile]); }
    return J([db.profile]);
  }
  if (/\/rest\/v1\/public_profiles/.test(u)) return J([{ id: ME, username:"momo", name:"Mo", is_public:true }]);
  return J([]);
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
const body = () => page.evaluate(() => document.body.innerText);

// ── 1. A brand-new user reaches onboarding at all ────────────────────────────────────────────
const first = await body();
check("1. a new signup reaches onboarding, not the error boundary",
  !/went sideways|unexpected error/i.test(first) && /track every rep|main goal|Continue/i.test(first),
  first.slice(0, 110).replace(/\n/g, " | "));

// ── 2. Walk the wizard ───────────────────────────────────────────────────────────────────────
for (let i = 0; i < 26; i++) {
  const hit = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const bs = [...document.querySelectorAll("button")].filter(vis).map(x => ({ x, t: (x.textContent || "").trim() }));
    if (/Biological sex/i.test(document.body.innerText) && !window.__sex) {
      const m = bs.find(o => /^male$/i.test(o.t));
      if (m) { window.__sex = true; m.x.click(); return "Male"; }
    }
    const pick = bs.find(o => /^(get started|continue|next|finish|done|let's go|start|create my plan)$/i.test(o.t))
      || bs.filter(o => o.t && o.t.length > 1 && o.t.length < 40
                   && !/^‹|^back$|^skip$|^cancel$/i.test(o.t)
                   && !/^(home|workout|discover|profile|activity|messages|exercises|history|1rm)$/i.test(o.t))[0];
    if (pick) { pick.x.click(); return pick.t; }
    return null;
  });
  if (!hit) break;
  await page.waitForTimeout(450);
  if (!/main goal|been lifting|days a week|bit about you|track every rep|know your body|coached weekly/i.test(await body())) break;
}
await page.waitForTimeout(2500);
check("2. onboarding completes without crashing", !/went sideways/i.test(await body()),
  (await body()).slice(0, 110).replace(/\n/g, " | "));
check("3. the starter program reached the SERVER", db.programs.length > 0,
  `programs on server: ${db.programs.length}`);
check("4. it was made the active program server-side", !!db.profile.active_program_id,
  `active_program_id=${db.profile.active_program_id}`);

// ── 3. Start the workout the program gave us ─────────────────────────────────────────────────
await page.getByLabel("Workout").first().click().catch(() => {});
await page.waitForTimeout(1200);
const workoutTab = await body();
check("5. the Workout tab shows a program, not an empty state",
  !/start your first program|no active program/i.test(workoutTab),
  workoutTab.slice(0, 130).replace(/\n/g, " | "));

const started = await page.evaluate(() => {
  const bs = [...document.querySelectorAll("button")].map(x => ({ x, t: (x.textContent || "").trim() }));
  const b = bs.find(o => /^start\b/i.test(o.t)) || bs.find(o => /quick start/i.test(o.t));
  if (b) { b.x.click(); return b.t; } return null;
});
await page.waitForTimeout(1600);
console.log(`  started via: ${JSON.stringify(started)}`);
const inWorkout = /\d+\/\d+ sets|Finish/i.test(await body());
check("6. a workout session starts", inWorkout, (await body()).slice(0, 120).replace(/\n/g, " | "));

// ── 4. Log a set, finish, share ──────────────────────────────────────────────────────────────
if (inWorkout) {
  // Tick the first set's done control.
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-no-tab-swipe]")];
    const first = rows[0];
    if (!first) return;
    const btns = [...first.querySelectorAll("button")];
    const tick = btns[btns.length - 1];
    tick && tick.click();
  });
  await page.waitForTimeout(900);

  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^finish$/i.test((x.textContent||"").trim())); b && b.click(); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^finish workout$/i.test((x.textContent||"").trim())); b && b.click(); });
  await page.waitForTimeout(3000);

  check("7. the workout reached the SERVER", db.workout_history.length > 0,
    `workout_history rows: ${db.workout_history.length}`);

  const summary = await body();
  if (/Share to Feed/i.test(summary)) {
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /share to feed/i.test((x.textContent||"").trim())); b && b.click(); });
    await page.waitForTimeout(2500);
    check("8. sharing created a post on the SERVER", db.posts.length > 0, `posts: ${db.posts.length}`);
  } else {
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /don't share/i.test((x.textContent||"").trim())); b && b.click(); });
    await page.waitForTimeout(1200);
    console.log("  (summary had no Share to Feed control — skipped the share leg)");
  }
}

// ── 5. THE RELAUNCH. Only what the server holds may come back. ───────────────────────────────
console.log(`\n  server state before relaunch: ${db.programs.length} program(s), ${db.workout_history.length} workout(s), ${db.posts.length} post(s)`);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);

const after = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("seshd_v1") || "{}");
  return {
    programs: (s.programs || []).length,
    active: s.activeProgramId,
    historyDays: Object.keys(s.history || {}).length,
    posts: (s.posts || []).length,
  };
});
console.log(`  after relaunch: ${JSON.stringify(after)}`);

check("9. the program survives a relaunch", after.programs > 0, JSON.stringify(after));
check("10. it is still the active program", !!after.active, JSON.stringify(after));
check("11. the logged workout survives a relaunch", after.historyDays > 0, JSON.stringify(after));
const relaunched = await body();
check("12. the app does not land back on an empty first-run state",
  !/start your first program|no active program/i.test(relaunched) && !/went sideways/i.test(relaunched),
  relaunched.slice(0, 140).replace(/\n/g, " | "));

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
