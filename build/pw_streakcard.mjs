// ★ THE STREAK CARD IS THE ONLY PLACE THE WEEKLY-TARGET FIX IS VISIBLE, AND THE ENGINE BEING RIGHT
// PROVES NOTHING ABOUT THE CARD. sim_streakgrace proves the MATHS; the card could still read the
// wrong field, render STREAK AT RISK over a correct count, or return null and show nothing at all,
// and no sim would notice. This suite drives the real screen.
//
// It guards TWO shipped facts, and the second is the one with a paired control:
//
//   1. GRACE IS OFF (STREAK_GRACE_EVERY_WEEKS = 0). A missed week resets the run, and the card must
//      NOT carry a "STREAK SAVED" label — that kicker was removed with the flag, because UI nothing
//      can reach is the dead-UI class this repo keeps paying for. A free forgiven week is a product
//      decision (it competes with the paid restore Mo parked), so it must never come back as a side
//      effect of an unrelated edit.
//
//   2. RETROACTIVE TARGET. Raising the weekly goal used to wipe a genuinely-earned run on the next
//      render. weeklyTargetHistory fixes it, and scenes 2 and 3 are the SAME fixture differing only
//      in whether the history is present — so a green 2 means the history did the work, rather than
//      the fixture never having needed it.
//
// FIXTURE: seeded through the STUB, not localStorage. loadUserData REBUILDS workoutDates wholesale
// from workout_history rows on the first foreground, so a localStorage-only seed is replaced by {}
// and the card returns null — which would make every check below pass or fail for reasons that have
// nothing to do with the app. Dates derive from Date.now() because the engine walks back from the
// real clock: a hardcoded date would drift out of its week and fail with a message pointing at
// exactly the wrong cause (the pw_musclezero scar).
//
// EVERY SCENE LOGS ONE WORKOUT THIS WEEK, on purpose. The card is gated
// `if (!ws.count && !ws.thisWeek) return null`, so a broken streak with an empty current week
// renders NOTHING — and "the element is absent" is the weakest possible assertion (an absence check
// satisfied by a fixture omission is a documented scar here). One workout this week puts the broken
// case into its own visible "THIS WEEK / 1/N" state, so every check below is positive.
import { chromium } from "playwright-core";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`  PASS ${l}`); else { fails++; console.log(`  FAIL ${l}${d ? " — " + d : ""}`); } };

const dk = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
// Monday 00:00 local of the week containing `ms` — the same boundary weekStart() uses, so the
// fixture and the code agree about which week a day belongs to by construction.
const mondayOf = (ms) => { const d = new Date(ms); d.setHours(12,0,0,0); const off = d.getDay() === 0 ? 6 : d.getDay() - 1; d.setDate(d.getDate() - off); return d.getTime(); };
const THIS_MON = mondayOf(Date.now());

// spec: { weeksAgo: daysTrainedThatWeek }. Week 0 is the week we are in.
function rowsFor(spec) {
  const out = []; let n = 0;
  for (const [ago, days] of Object.entries(spec)) {
    for (let i = 0; i < days; i++) {
      const t = THIS_MON - Number(ago) * 7 * 864e5 + i * 864e5;
      out.push({ id: `w${n++}`, user_id: ME, workout_date: dk(t), created_at: new Date(t).toISOString(),
        day_name: "Push", exercises: [{ name: "Barbell Bench Press", sets: [{ weight: "135", reps: "8", done: true }] }],
        duration_secs: 3000, unit: "lbs", note: "" });
    }
  }
  return out;
}

const J = (o) => ({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

// Boot one scene and read the streak card off the real screen.
async function scene({ spec, target, history }) {
  const rows = rowsFor(spec);
  const PROFILE = { id: ME, username: "momo", name: "Mo", unit: "lbs", theme: "dark", seen_onboarding: true,
    weekly_target: target, is_public: false, pr_events: [], custom_exercises: [], program_order: [],
    notification_prefs: {}, weekly_target_history: history };
  const store = { currentUserId: ME, unit: "lbs", theme: "dark", programs: [], history: {}, workoutDates: {},
    weeklyTarget: target, weeklyTargetHistory: history, prs: {}, prEvents: [], posts: [], bodyLog: [], customExercises: [],
    profile: { username: "momo", name: "Mo" }, users: [{ id: ME, username: "momo", name: "Mo", followers: [], following: [] }] };

  const p = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  p.setDefaultTimeout(6000);
  p.on("pageerror", e => { fails++; console.log("  PAGEERROR:", e.message.slice(0, 160)); });
  await p.addInitScript(st => {
    localStorage.setItem("seshd_v1", JSON.stringify(st));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: st.currentUserId } }));
    localStorage.setItem("seshd_onboarded", "1"); localStorage.setItem("seshd_custom_merge_v1", "1");
  }, store);
  await p.route("**/auth/v1/**", r => r.fulfill(J({ access_token: "t", user: { id: ME } })));
  await p.route("**/rest/v1/**", r => {
    const u = r.request().url();
    if (/workout_history/.test(u)) return r.fulfill(J(rows));
    if (/profiles/.test(u))        return r.fulfill(J([PROFILE]));
    return r.fulfill(J([]));
  });
  await p.goto("http://127.0.0.1:8199/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3500);

  const seeded = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("seshd_v1") || "{}").workoutDates || {}).length);
  const read = await p.evaluate(() => {
    const kickerEl = [...document.querySelectorAll("div")].find(d =>
      /^(WEEKLY STREAK|STREAK AT RISK|STREAK SAVED|THIS WEEK)$/.test((d.textContent || "").trim()) && d.children.length === 0);
    const card = kickerEl && (kickerEl.closest("div[style*='border-radius']") || kickerEl.parentElement.parentElement);
    return {
      kicker: kickerEl ? kickerEl.textContent.trim() : null,
      text: card ? (card.textContent || "").replace(/\s+/g, " ").trim() : null,
      pageHasSaved: /STREAK SAVED/.test(document.body.innerText || ""),
    };
  });
  await p.close();
  const shown = read.text ? Number((read.text.match(/(\d+)\s*wk/) || [])[1]) : NaN;
  return { ...read, shown, seeded, rows: rows.length };
}

// ── 1. Grace is OFF: one missed week resets the run ──────────────────────────────────────────
// Ten good weeks reached THROUGH a short one. This is the exact fixture the free grace was built
// for, so if grace ever returns this scene is the first thing that changes.
{
  const spec = { 0: 1, 1: 1 }; for (let w = 2; w <= 11; w++) spec[w] = 2;
  const r = await scene({ spec, target: 2, history: [] });
  check("[control] scene 1's history reached the store", r.seeded === r.rows, `workoutDates=${r.seeded}, rows=${r.rows}`);
  check("[control] scene 1 renders the streak card", !!r.kicker, "no kicker found");
  check("[shipped] a missed week resets the streak", !(r.shown > 0), `card="${r.text}"`);
  check("[shipped] the card falls back to the building state", r.kicker === "THIS WEEK", `kicker="${r.kicker}"`);
  check("[shipped] no STREAK SAVED label exists anywhere", r.pageHasSaved === false);
}

// ── 2. Raising the weekly goal does NOT wipe the run ─────────────────────────────────────────
// Eleven weeks of exactly 2/week — which is what the target WAS. The user has since raised it to 3,
// and the boundary says so. Every past week must still be judged at 2.
const RUN = (() => { const s = { 0: 1 }; for (let w = 1; w <= 11; w++) s[w] = 2; return s; })();
const BOUNDARY = [{ until: dk(THIS_MON), target: 2 }];
{
  const r = await scene({ spec: RUN, target: 3, history: BOUNDARY });
  check("[control] scene 2's history reached the store", r.seeded === r.rows, `workoutDates=${r.seeded}, rows=${r.rows}`);
  check("[target] the run survives the raised goal", r.shown === 11, `shown=${r.shown}, card="${r.text}"`);
  check("[target] and the card reads at-risk, not building", r.kicker === "STREAK AT RISK", `kicker="${r.kicker}"`);
  check("[target] this week is judged against the NEW goal", /1\/3/.test(r.text || ""), `card="${r.text}"`);
}

// ── 3. The paired control — the SAME fixture with no boundary recorded ───────────────────────
// This is what shipped before the fix, and what an existing user with no recorded change still
// gets. If scene 2 passed while this one also showed 11, the boundary would be doing nothing and
// scene 2 would be green for the wrong reason.
{
  const r = await scene({ spec: RUN, target: 3, history: [] });
  check("[control] without the boundary the same run collapses", !(r.shown > 0), `shown=${r.shown}, card="${r.text}"`);
  check("[control] and the card drops to the building state", r.kicker === "THIS WEEK", `kicker="${r.kicker}"`);
}

await b.close();
console.log(fails === 0 ? "PASS streak card" : `FAIL ${fails} streak-card check(s)`);
process.exit(fails === 0 ? 0 : 1);
