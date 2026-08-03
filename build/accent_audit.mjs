// THE LIME PASS, STEP 1 — capture what the app looks like today, and INVENTORY every element the
// user actually sees painted in the accent.
//
// `C.accent` is referenced 283 times in App.jsx — the third most-used token in the app, ahead of
// C.border (210) and C.bg (146), against 32 for C.green. That count is the argument for the pass,
// but it is not a work list: a lot of those references are conditional branches that never both
// render, and some paint things nobody looks at. This walks the real screens and reports what is
// ON THE GLASS: for every visible element, whether the accent arrives as text colour, background,
// border, or SVG fill/stroke, plus enough identity (tag, role, aria-label, text) to classify it.
//
// Output: build/accent_before/*.png  +  build/accent_before/inventory.json + a printed summary.
// Re-run after the pass with `after` to diff.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, rmSync } from "fs";

const MODE = process.argv[2] || "before";
const OUT = `build/accent_${MODE}`;
// WIPE FIRST. Screenshots are numbered by order, so a re-run after the tour changes shape leaves
// the old run's files interleaved with the new one under the same numbers — and the stale set here
// was the run whose navigation had silently failed. A mixed directory is worse than no directory.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const ME = "11111111-1111-4111-8111-111111111111";
const PAL = "22222222-2222-4222-8222-222222222222";
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

// A LOADED account, because an empty app hides most of the accent. History drives the charts and
// the streak, PRs drive the badges, a program drives the day cards, a follow drives the feed.
const hist = {};
for (let i = 1; i <= 24; i++) {
  const d = new Date(Date.now() - i * 3 * 864e5);
  hist[dayKey(d)] = { [`s${i}`]: {
    dayName: ["Push A · Heavy Chest", "Pull A · Back Width", "Legs A · Quad Focus"][i % 3],
    duration: 3200 + i * 30, unit: "lbs", finishedAt: d.getTime(),
    exercises: [
      { name: "Barbell Bench Press", sets: [{ weight: String(185 + i), reps: "5", done: true, type: "normal" }, { weight: String(185 + i), reps: "5", done: true, type: "normal" }, { weight: String(185 + i), reps: "4", done: true, type: "normal" }] },
      { name: "Barbell Back Squat", sets: [{ weight: String(245 + i * 2), reps: "5", done: true, type: "normal" }, { weight: String(245 + i * 2), reps: "5", done: true, type: "normal" }] },
      { name: "Lat Pulldown (Wide)", sets: [{ weight: String(120 + i), reps: "10", done: true, type: "normal" }] },
    ] } };
}
const PROG = { id: "p1", name: "PPL · 6 Day", days: [
  { id: "d1", name: "Push A · Heavy Chest", exercises: [
    { name: "Barbell Bench Press", sets: 4, reps: "5-7", rest: "180" },
    { name: "Incline DB Press", reps: "3×8-10" },
    { name: "Lateral Raises (DB)", reps: "4×15-20" }] },
  { id: "d2", name: "Pull A · Back Width", exercises: [
    { name: "Weighted Pull-Ups", reps: "4×6-8" },
    { name: "Seated Cable Row (Narrow)", reps: "3×10" }] },
  { id: "d3", name: "Legs A · Quad Focus", exercises: [
    { name: "Barbell Back Squat", reps: "4×5-8" },
    { name: "Leg Press", reps: "3×10-12" }] },
] };
const store = {
  currentUserId: ME, theme: "dark", unit: "lbs", weeklyTarget: 3, programs: [PROG], activeProgramId: "p1",
  history: hist, prEvents: [], bodyLog: [{ date: dayKey(new Date()), weight: 178 }],
  prs: { "Barbell Bench Press": 225, "Barbell Back Squat": 315 },
  profile: { username: "momo", name: "Mo" },
  // A recovery reading, so the readiness card and Body Battery render with real numbers rather
  // than their empty states — those two screens are where the accent is densest.
  recovery: { hrv: 58, hrvBaseline: 55, restingHr: 49, rhrBaseline: 51, sleepHours: 7.6,
    sleepDeepMin: 76, sleepRemMin: 96, recoveryScore: 0.79, capturedAt: new Date().toISOString(),
    sleepStart: new Date(Date.now() - 9 * 36e5).toISOString(), sleepEnd: new Date(Date.now() - 1.4 * 36e5).toISOString() },
  activity: { date: dayKey(new Date()), steps: 7400, activeKcal: 480 },
  users: [{ id: ME, username: "momo", name: "Mo", bio: "5 years in. Chasing a 4-plate squat.", followers: [PAL], following: [PAL] },
          { id: PAL, username: "maya_lifts", name: "Maya Chen", bio: "Squat-first powerlifter", followers: [ME], following: [ME] }],
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);
await page.addInitScript(([s, me]) => {
  localStorage.setItem("seshd_v1", JSON.stringify(s));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, [store, ME]);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));
await page.route("**/rest/v1/**", r => {
  const u = r.request().url();
  let body = "[]";
  // SEED THROUGH THE STUB. loadUserData replaces the local store with the server copy, so a
  // localStorage-only fixture renders the EMPTY app — the first run of this tour captured
  // "Start your first program" and reported 5 accented elements on the busiest screen.
  if (/\/rest\/v1\/profiles\?/.test(u)) {
    body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true,
      seen_onboarding: true, theme: "dark", bio: "5 years in. Chasing a 4-plate squat.",
      weekly_target: 3, pr_events: [] }]);
  } else if (/\/rest\/v1\/public_profiles\?/.test(u)) {
    body = JSON.stringify(store.users.map(x => ({ ...x, unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" })));
  } else if (/\/rest\/v1\/programs\?/.test(u)) {
    body = JSON.stringify([{ id: "p1", user_id: ME, name: PROG.name, days: PROG.days,
      is_active: true, created_at: new Date().toISOString() }]);
  } else if (/\/rest\/v1\/workout_history\?/.test(u)) {
    body = JSON.stringify(Object.entries(hist).flatMap(([date, byId]) =>
      // COLUMN NAMES ARE `workout_date` / `duration_secs`. Getting them wrong keys every session
      // under `undefined`, and the app renders "Invalid Date" / "NaNmo ago" — which reads exactly
      // like an app bug in a screenshot. Checked against loadUserData rather than guessed.
      Object.entries(byId).map(([sid, s]) => ({ id: sid, user_id: ME, workout_date: date,
        day_name: s.dayName, exercises: s.exercises, duration_secs: s.duration, unit: s.unit,
        created_at: new Date(s.finishedAt).toISOString() }))));
  } else if (/\/rest\/v1\/personal_records\?/.test(u)) {
    body = JSON.stringify(Object.entries(store.prs).map(([name, weight]) =>
      ({ user_id: ME, exercise: name, weight, unit: "lbs" })));
  }
  r.fulfill({ status: 200, contentType: "application/json", body });
});

// The accent in its dark-theme forms. accentSoft is the 12% wash; accent2 the pressed/darker step.
const ACCENTS = { accent: "200, 241, 53", accent2: "168, 212, 38" };
const inventory = [];

// Walk every VISIBLE element and record which channel the accent arrives through. Only leaf-ish
// nodes are labelled with text, because an ancestor's textContent is the whole screen.
const collect = (screen) => page.evaluate(([screen, ACCENTS]) => {
  const hits = [];
  const has = (v) => { if (!v) return null; for (const [name, rgb] of Object.entries(ACCENTS)) if (v.includes(rgb)) return name; return null; };
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.bottom < 0 || r.top > window.innerHeight) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") continue;
    const channels = {};
    for (const [prop, key] of [["color", "text"], ["backgroundColor", "bg"], ["borderTopColor", "border"],
                               ["borderBottomColor", "border"], ["borderLeftColor", "border"],
                               ["borderRightColor", "border"], ["fill", "fill"], ["stroke", "stroke"],
                               ["boxShadow", "shadow"], ["backgroundImage", "gradient"]]) {
      const m = has(cs[prop]); if (m) channels[key] = m;
    }
    if (!Object.keys(channels).length) continue;
    // Skip an element whose accent is inherited from a parent that already reported the same
    // channel — otherwise a lime word inside a lime-coloured div counts twice.
    const p = el.parentElement;
    if (p && channels.text && getComputedStyle(p).color === cs.color && !channels.bg && !channels.border) continue;
    const txt = (el.childElementCount === 0 ? el.textContent : "").trim().slice(0, 48);
    hits.push({ screen, tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || (el.tagName === "BUTTON" ? "button" : ""),
      label: el.getAttribute("aria-label") || "", text: txt,
      channels: Object.entries(channels).map(([k, v]) => v === "accent" ? k : `${k}:${v}`).join("+"),
      w: Math.round(r.width), h: Math.round(r.height) });
  }
  return hits;
}, [screen, ACCENTS]);

let n = 0;
const shot = async (label, wait = 600) => {
  await page.waitForTimeout(wait);
  n++;
  const name = `${String(n).padStart(2, "0")}_${label}`;
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const hits = await collect(label);
  inventory.push(...hits);
  console.log(`  ${name.padEnd(28)} ${String(hits.length).padStart(3)} accented elements`);
};
const tapNav = async (i) => { await page.mouse.click([65, 164, 264, 363][i], 869); await page.waitForTimeout(700); };
const tapText = async (t, wait = 700) => {
  const el = page.getByText(t, { exact: false }).first();
  if (await el.count()) { await el.click().catch(() => {}); await page.waitForTimeout(wait); return true; }
  return false;
};
const goBack = async () => {
  for (const attempt of [
    () => page.locator('button[aria-label="Back"]').locator("visible=true").last().click({ timeout: 1200 }),
    () => page.getByRole("button", { name: "Done" }).locator("visible=true").last().click({ timeout: 1200 }),
    () => page.locator('button[aria-label="Close"]').locator("visible=true").last().click({ timeout: 1200 }),
    () => page.getByText("‹", { exact: true }).last().click({ timeout: 1200 }),
  ]) { try { await attempt(); await page.waitForTimeout(600); return true; } catch {} }
  return false;
};

await page.goto("http://127.0.0.1:8199/", { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => !/Setting up your account/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1400);

console.log(`\n${MODE.toUpperCase()} — walking the app\n`);
await shot("tracker_home", 900);
await page.mouse.wheel(0, 600); await shot("tracker_scrolled", 400);
await page.mouse.wheel(0, 600); await shot("tracker_scrolled2", 400);
await page.mouse.wheel(0, -1400);
// Body Battery sheet — the densest accent surface in the app.
if (await tapText("Body Battery", 900)) { await shot("body_battery_sheet", 900); await goBack(); }
await tapText("Exercises"); await shot("exercises");
const firstEx = page.getByText("Barbell Bench Press", { exact: true }).first();
if (await firstEx.count()) { await firstEx.click().catch(() => {}); await shot("exercise_detail", 900); await goBack(); }
await tapText("History"); await shot("history");
await page.mouse.wheel(0, 700); await shot("history_scrolled", 400);
await page.mouse.wheel(0, -700);
await tapText("Workout"); await shot("workout_tab", 700);

// SOCIAL SCREENS FIRST. The live workout is a full takeover with NO TAB BAR, so every tapNav
// after Quick Start silently does nothing — the first run of this tour captured the workout
// screen four more times under the names feed/discover/profile and reported them as data.
await tapNav(0); await shot("feed", 900);
await tapNav(2); await shot("discover", 900);
await tapNav(3); await shot("profile", 900);
await page.mouse.wheel(0, 700); await shot("profile_scrolled", 400);
await page.mouse.wheel(0, -700);
if (await tapText("Body", 900)) { await shot("body_screen", 900); await goBack(); await tapNav(3); }
const settings = page.locator('button[aria-label="Settings"]').first();
if (await settings.count()) {
  await settings.click(); await shot("settings", 900);
  await page.mouse.wheel(0, 800); await shot("settings_scrolled", 400);
  await tapText("Done", 600);
}

// ...and the live workout LAST, because there is no way back to the tabs except cancelling it.
await tapNav(1); await page.waitForTimeout(400);
if (await tapText("Quick Start", 1200)) {
  await shot("live_workout_empty", 900);
  const box = page.getByPlaceholder("Search exercises...").first();
  if (await box.count()) {
    await box.click(); await box.pressSequentially("Barbell Bench", { delay: 40 });
    await page.waitForTimeout(600); await shot("exercise_picker");
    await page.getByText("Barbell Bench Press", { exact: true }).first().click().catch(() => {});
    await shot("live_workout_loaded", 900);
  }
}

// Every screen must be DISTINCT — identical accent counts on consecutive screens is the tell that
// navigation silently failed, which is exactly how the first run produced four fake screens.
const sig = {};
for (const h of inventory) (sig[h.screen] = sig[h.screen] || []).push(`${h.channels}|${h.text}`);
const seen = new Map();
for (const [s2, arr] of Object.entries(sig)) {
  const k = arr.sort().join("~");
  if (seen.has(k)) console.log(`\n!! ${s2} is IDENTICAL to ${seen.get(k)} — navigation failed, not real data`);
  else seen.set(k, s2);
}

await b.close();

// ── Report ───────────────────────────────────────────────────────────────────────────────────
writeFileSync(`${OUT}/inventory.json`, JSON.stringify(inventory, null, 1));
const byChannel = {}, byScreen = {};
for (const h of inventory) {
  byChannel[h.channels] = (byChannel[h.channels] || 0) + 1;
  byScreen[h.screen] = (byScreen[h.screen] || 0) + 1;
}
console.log(`\n${inventory.length} accented elements across ${n} screens\n`);
console.log("BY SCREEN (worst first)");
for (const [k, v] of Object.entries(byScreen).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
console.log("\nHOW THE ACCENT ARRIVES");
for (const [k, v] of Object.entries(byChannel).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
console.log(`\nfull inventory: ${OUT}/inventory.json`);
