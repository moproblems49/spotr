// appstore_shot — renders an App Store source capture from the REAL app with a seeded fixture,
// at the same pixel size a phone produces, so build/appstore_frame.mjs can frame it unchanged.
//
// WHY THIS EXISTS: the Training Readiness map's whole claim is "train the muscles that are ready",
// which a real capture can only demonstrate if the person happened to train recently and unevenly.
// Mo had been ill for a week, so every muscle read green and the screenshot proved nothing. The
// four original captioned screenshots were made exactly this way (a seeded "Alex Rivera" store in
// Chromium), so this is the listing's existing method, not a new compromise — the pixels are the
// app's own render of a state it genuinely produces.
//
// The fixture is the interesting part and it is NOT arbitrary: readiness decays exponentially from
// each session (engine/strength.js muscleReadiness), so recency is what paints the map. A push day
// yesterday, legs two days ago and pull a week ago gives a body that is red at the top, amber in
// the legs and green down the back — i.e. the sentence the headline makes.
//
// Every exercise name is resolved through getExEntry before use. A plausible-looking name that is
// not an exact library match ("Incline Dumbbell Press") silently resolves to NO muscle and paints
// nothing, which is the documented demo-corpus failure and is invisible in a screenshot.
//
// Usage: node build/appstore_shot.mjs <out.png> [theme]
import { chromium } from "playwright-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2] || path.join(ROOT, "build/shot_readiness.png");
const THEME = process.argv[3] || "summer";
const ME = "11111111-1111-4111-8111-111111111111";

const dayKey = (ms) => { const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// The key and the clock share a source — a hardcoded date silently ages out of every window that
// measures against Date.now(), and the screen then renders a state nobody asked for.
const ago = (days) => Date.now() - days * 864e5;

const ex = (name, sets, weight, reps) => ({ name,
  sets: Array.from({ length: sets }, () => ({ weight: String(weight), reps: String(reps), done: true })) });

// One rotating 4-day split. The last three sessions are what paint the map; the older four weeks
// exist so trainingLoadRatio has enough history to return a real number instead of null — it needs
// >= 6 sessions over >= 4 distinct days with >= 2 outside the acute week, and a >= 21-day span.
const PUSH = () => [ex("Barbell Bench Press", 5, 185, 5), ex("Overhead Press (Barbell)", 4, 115, 6),
                    ex("Cable Fly", 4, 40, 12), ex("Incline DB Press", 4, 70, 8),
                    ex("Tricep Rope Pushdown", 4, 60, 10), ex("Lateral Raises (Cable)", 3, 20, 15)];
const PULL = () => [ex("Barbell Row", 4, 155, 8), ex("Lat Pulldown", 4, 130, 10),
                    ex("Seated Cable Row", 3, 120, 12), ex("Barbell Curl", 3, 65, 10),
                    ex("Face Pulls", 3, 40, 15)];
const LEGS = () => [ex("Barbell Back Squat", 5, 225, 5), ex("Romanian Deadlift", 4, 185, 8),
                    ex("Leg Press", 4, 360, 10), ex("Lying Leg Curl", 3, 90, 12),
                    ex("Standing Calf Raise", 4, 135, 15)];

const history = {};
const addSession = (daysAgo, name, exercises) => {
  const ms = ago(daysAgo), k = dayKey(ms);
  (history[k] || (history[k] = {}))["s" + daysAgo] =
    { id: "s" + daysAgo, dayName: name, finishedAt: ms, duration: 3780, unit: "lbs", exercises };
};
// Recent three — these are the ones the map reads.
addSession(1, "Push A", PUSH());   // chest / shoulders / triceps: still recovering
addSession(2, "Leg Day", LEGS());  // quads / hams / glutes / calves: part-way back
addSession(6, "Pull A", PULL());   // back / biceps / rear delts: ready
// Four weeks of the same split behind it, so training load is a real ratio.
[8, 9, 11, 13, 15, 16, 18, 20, 22, 23, 25, 27].forEach((d, i) =>
  addSession(d, ["Push A", "Pull A", "Leg Day"][i % 3], [PUSH, PULL, LEGS][i % 3]()));

// Derived from the SAME history rather than hand-listed: calcWeeklyStreak counts dates per week
// against weeklyTarget, so a separate list would let the streak chip disagree with the sessions
// the map is drawn from — two numbers about one fixture is exactly how they drift.
const workoutDates = Object.fromEntries(Object.keys(history).map(k => [k, true]));

const store = {
  currentUserId: ME, unit: "lbs", theme: THEME, programs: [], history,
  workoutDates, weeklyTarget: 3, prEvents: [], posts: [],
  bodyType: "male", strengthSex: "male", age: 29,
  bodyLog: [{ id: "b1", date: dayKey(ago(21)), weight: 181, measurements: {} },
            { id: "b2", date: dayKey(ago(7)),  weight: 179, measurements: {} },
            { id: "b3", date: dayKey(ago(1)),  weight: 178, measurements: {} }],
  prs: { "Barbell Bench Press": 225, "Barbell Back Squat": 315, "Overhead Press (Barbell)": 135,
         "Barbell Row": 185, "Romanian Deadlift": 245 },
  profile: { username: "momo", name: "Mo" },
  users: [{ id: ME, username: "momo", name: "Mo", followers: [], following: [] }],
  // Mirrors the real reading off Mo's own device capture, so everything below the map is his
  // genuine morning and only the training history is seeded.
  recovery: { hrv: 28, hrvBaseline: 35, restingHr: 66, rhrBaseline: 70, sleepHours: 7,
              recoveryScore: 0.72, capturedAt: new Date().toISOString(),
              sleepStart: new Date(Date.now() - 11 * 36e5).toISOString(),
              sleepEnd: new Date(Date.now() - 4 * 36e5).toISOString() },
  activity: { steps: 4492, activeEnergy: 353, date: dayKey(Date.now()) },
  activityHourlyDate: dayKey(Date.now()),
  activityHourly: (() => {
    // An ordinary day, filled only for hours that have ELAPSED — pre-filling the current hour
    // hands the headline steps nobody has taken and invents a gap that is the fixture's fault.
    const h = new Date().getHours(), out = [];
    for (let i = 0; i < 24; i++) out.push(i > h || i < 7 ? { steps: 0, energy: 0 }
      : { steps: Math.round(4492 / Math.max(1, h - 6)), energy: Math.round(353 / Math.max(1, h - 6)) });
    return out;
  })(),
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
p.setDefaultTimeout(8000);
const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.addInitScript((st) => {
  localStorage.setItem("seshd_v1", JSON.stringify(st));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: st.currentUserId } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, store);
await p.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "t", user: { id: ME } }) }));
await p.route("**/rest/v1/**", r => r.abort());   // loadUserData fails gracefully; the seeded store renders
await p.goto("http://127.0.0.1:8199/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2500);
await p.evaluate(() => { const x = [...document.querySelectorAll("button")]
  .find(e => (e.getAttribute("aria-label") || "") === "Profile"); x && x.click(); });
await p.waitForTimeout(2500);

// Scroll the Training Readiness card to the top of the frame, the way Mo's own capture is framed.
// page.mouse.wheel is a NO-OP here — body is pinned overflow:hidden for the app's whole lifetime —
// so drive the tallest real scroller directly and REPORT if nothing moved.
const scrolled = await p.evaluate(() => {
  const sc = [...document.querySelectorAll("*")]
    .filter(e => { const s = getComputedStyle(e); return /auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 40; })
    .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
  if (!sc) return null;
  const card = [...document.querySelectorAll("*")].find(e => (e.textContent || "").trim().startsWith("TODAY") && e.clientHeight > 300);
  const before = sc.scrollTop;
  sc.scrollTop = card ? sc.scrollTop + card.getBoundingClientRect().top - 48 : sc.scrollTop;
  return { moved: sc.scrollTop !== before, top: sc.scrollTop };
});
await p.waitForTimeout(900);

// Read the fills that are ACTUALLY on screen. "Back" is a back-view path and returns null while
// the front is showing, so comparing chest against it is a check that can only ever pass — the
// contrast has to be measured between two regions the same view paints. Chest (trained yesterday)
// against Quads (two days ago) is the claim the headline makes, in one comparison.
const seen = await p.evaluate(() => {
  const f = n => { const el = document.querySelector(`path[data-muscle="${n}"]`); return el ? getComputedStyle(el).fill : null; };
  const warm = c => { const [r, g] = (c.match(/\d+/g) || []).map(Number); return r > g + 40; };
  const chest = f("Chest");
  return { chest, quads: f("Quads"), shoulders: f("Shoulders"),
           chestIsRecovering: !!chest && warm(chest),
           onScreen: /TRAINING READINESS/.test(document.body.innerText) };
});
await p.screenshot({ path: OUT });
await b.close();

console.log("wrote", OUT);
console.log("scroll:", JSON.stringify(scrolled), " map:", JSON.stringify(seen));
if (errs.length) console.log("PAGE ERRORS:", errs.slice(0, 3));
if (!seen.onScreen) { console.log("FAIL — the readiness card never rendered"); process.exit(1); }
if (!seen.chest || !seen.quads) { console.log("FAIL — the front map did not render both regions"); process.exit(1); }
if (seen.chest === seen.quads) { console.log("FAIL — chest and quads painted the same; the fixture produced no contrast"); process.exit(1); }
if (!seen.chestIsRecovering) { console.log(`FAIL — chest is not on the recovering end (${seen.chest}); the map shows nothing to train around`); process.exit(1); }
