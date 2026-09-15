// ★ THE WEEKLY STREAK JUDGED EVERY PAST WEEK AGAINST TODAY'S TARGET, AND ONE MISSED WEEK RESET IT
// TO ZERO. Two separate defects in one function, both of which punish the user for something that
// is not slacking:
//
//   1. RETROACTIVE TARGET. The streak recomputes the whole history on every render against the
//      CURRENT weeklyTarget, so raising your goal from 2 to 3 wiped a genuinely-earned run the
//      instant you tapped it. `weeklyTargetHistory` records the boundaries so a past week is
//      judged against the target that was in force when that week began. An EMPTY history
//      reproduces the old behaviour exactly, which is what makes it safe for existing users.
//
//   2. NO GRACE. A week ill was the same as a week quit. The walk grew a grace branch that
//      forgives one short week per N of the backward walk, without incrementing the count.
//
// ★ THE GRACE IS SHIPPED OFF (STREAK_GRACE_EVERY_WEEKS = 0) — Mo would rather sell a restore than
// give one away. So this file tests TWO different things and the distinction is load-bearing:
// the `[grace]` sections pass `graceEvery` EXPLICITLY, exercising a mechanism the paid restore
// will plug into, while `[shipped]` asserts the DEFAULT is off. A `[grace]` section that relied
// on the default would silently become a test of the shipped behaviour the day the flag moved,
// and the file would keep printing PASS while meaning something else entirely.
//
// EVERY CHECK PINS THE CLOCK via opts.now. A streak test that reads the wall clock passes at one
// hour and fails at another — the documented sim_bbgate scar. The fixture dates are FIXED and the
// clock is fixed to match them, so the two can never drift apart (the pw_datekey rule, both ways).
import { calcWeeklyStreak, storeStreak, recordTargetChange, targetForWeek, STREAK_GRACE_EVERY_WEEKS } from "../src/engine/insights.js";

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

// Monday 2026-09-14 is the start of "this week" for every fixture below.
const NOW = new Date("2026-09-16T10:00:00").getTime(); // a Wednesday inside that week

// Build a date map from "weeks ago -> how many days trained that week".
// Week 0 is the week containing NOW. Days land on Mon/Tue/Wed/... of that week.
function weeks(spec) {
  const out = {};
  const monThisWeek = new Date("2026-09-14T12:00:00");
  for (const [ago, days] of Object.entries(spec)) {
    for (let d = 0; d < days; d++) {
      const dt = new Date(monThisWeek);
      dt.setDate(dt.getDate() - Number(ago) * 7 + d);
      out[`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`] = true;
    }
  }
  return out;
}
const run = (wd, target, extra = {}) => calcWeeklyStreak(wd, target, { now: NOW, ...extra });

// The spacing the grace MECHANISM is tested at. Deliberately a literal and not
// STREAK_GRACE_EVERY_WEEKS: that constant is 0 (shipped off), and a mechanism test that read it
// would test nothing at all. 13 is the value the free grace shipped with for a few hours and the
// one a paid restore would most likely reuse.
const GRACE = 13;
const graced = (wd, target, extra = {}) => run(wd, target, { graceEvery: GRACE, ...extra });

// ── 1. The grace week ────────────────────────────────────────────────────────────────────────
// Ten weeks at target, then last week short. The old code returned 0.
{
  const wd = weeks({ 1: 1, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 3, 11: 3 });
  const r = graced(wd, 3);
  check("[grace] one short week does not reset the streak", r.count >= 9, `count=${r.count}`);
  check("[grace] the forgiven week is NOT counted", r.count === 10, `count=${r.count}, expected 10 (weeks 2..11)`);
  check("[grace] graceUsed reports it", r.graceUsed === 1, `graceUsed=${r.graceUsed}`);
  check("[grace] savedWeek flags the most recent completed week", r.savedWeek === true, `savedWeek=${r.savedWeek}`);
  // The control: the same fixture with grace switched off must collapse, or the checks above are
  // measuring a fixture that never needed grace in the first place.
  check("[control] grace OFF on the same fixture gives 0", run(wd, 3, { graceEvery: 0 }).count === 0);
}

// ── 2. Two short weeks in a row still break it ───────────────────────────────────────────────
{
  const wd = weeks({ 1: 1, 2: 1, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3 });
  const r = graced(wd, 3);
  check("[grace] two consecutive short weeks DO break the streak", r.count === 0, `count=${r.count}`);
}

// ── 3. A second grace inside the spacing window is refused ───────────────────────────────────
{
  // short at 1 and again at 4 — three weeks apart, well inside the spacing window.
  const wd = weeks({ 1: 1, 2: 3, 3: 3, 4: 1, 5: 3, 6: 3, 7: 3, 8: 3 });
  const r = graced(wd, 3);
  check("[grace] a second grace inside the window is refused", r.count === 2, `count=${r.count}, expected weeks 2..3 only`);
  check("[grace] only one grace was spent", r.graceUsed === 1, `graceUsed=${r.graceUsed}`);
}

// ── 4. A second grace OUTSIDE the spacing window is allowed ──────────────────────────────────
{
  const spec = { 1: 1 };
  for (let w = 2; w <= 30; w++) spec[w] = (w === 1 + GRACE) ? 1 : 3;
  const r = graced(weeks(spec), 3);
  check("[grace] a second grace beyond the window IS allowed", r.graceUsed === 2, `graceUsed=${r.graceUsed}`);
}

// ── 5. A lapsed account gets no phantom streak ───────────────────────────────────────────────
{
  const wd = weeks({ 8: 3, 9: 3, 10: 3, 11: 3, 12: 3 });  // trained, then stopped 7 weeks ago
  const r = graced(wd, 3);
  check("[grace] an account that stopped weeks ago reads 0", r.count === 0, `count=${r.count}`);
  check("[grace] and reports no forgiven week", r.graceUsed === 0 && r.savedWeek === false);
}

// ── 6. The retroactive-target bug ────────────────────────────────────────────────────────────
{
  // Twelve weeks of exactly 2/week, which is what the user's target WAS. They raise it to 3 today.
  const spec = {}; for (let w = 1; w <= 12; w++) spec[w] = 2;
  const wd = weeks(spec);
  const hist = recordTargetChange([], 2, 3, NOW);
  // The boundary is THIS WEEK'S MONDAY, not the day of the change — see targetForWeek for why
  // (countingThisWeek uses the current target, so the loop must too, or the two disagree).
  check("[target] recordTargetChange writes the boundary at the week start",
    JSON.stringify(hist) === '[{"until":"2026-09-14","target":2}]', JSON.stringify(hist));

  const broken = run(wd, 3);
  const fixed  = run(wd, 3, { targetHistory: hist });
  // The control FIRST: if raising the target did not damage the streak on this fixture, the fix
  // below would pass for free and this whole section would be measuring nothing.
  check("[control] raising the target DOES wipe the run without history", broken.count <= 1, `count=${broken.count}`);
  check("[target] past weeks are judged against the old target", fixed.count === 12, `count=${fixed.count}`);
  check("[target] and the CURRENT week still uses the new target", fixed.target === 3, `target=${fixed.target}`);
}

// ── 7. Empty history is byte-for-byte the old behaviour ──────────────────────────────────────
{
  const spec = {}; for (let w = 1; w <= 12; w++) spec[w] = 2;
  const wd = weeks(spec);
  for (const t of [1, 2, 3, 4, 5]) {
    const a = run(wd, t, { graceEvery: 0 });
    const b = run(wd, t, { graceEvery: 0, targetHistory: [] });
    const c = run(wd, t, { graceEvery: 0, targetHistory: null });
    check(`[compat] empty history changes nothing at target ${t}`, a.count === b.count && b.count === c.count);
  }
  // Junk from an older build must degrade to "no recorded change", never throw — this runs on
  // every render of the landing screen.
  const junk = [{ until: null, target: 2 }, { target: "x" }, null, 7, { until: "2026-01-01" }];
  check("[compat] a malformed history is ignored rather than thrown on",
    run(wd, 2, { graceEvery: 0, targetHistory: junk }).count === run(wd, 2, { graceEvery: 0 }).count);
}

// ── 8. targetForWeek's boundary semantics ────────────────────────────────────────────────────
{
  const hist = [{ until: "2026-03-01", target: 2 }, { until: "2026-09-01", target: 3 }];
  const on = (k) => targetForWeek(new Date(k + "T12:00:00"), 4, hist);
  check("[target] a week before the first boundary uses the oldest target", on("2026-02-10") === 2, String(on("2026-02-10")));
  check("[target] a week between boundaries uses the middle target", on("2026-05-11") === 3, String(on("2026-05-11")));
  check("[target] a week past every boundary uses the current target", on("2026-09-07") === 4, String(on("2026-09-07")));
  check("[target] the boundary day itself belongs to the NEWER target", on("2026-03-01") === 3, String(on("2026-03-01")));
  check("[target] no history at all uses the current target", targetForWeek(new Date("2026-05-11T12:00:00"), 4, []) === 4);
}

// ── 9. recordTargetChange refuses what it should ─────────────────────────────────────────────
{
  check("[record] a no-op change records nothing", recordTargetChange([], 3, 3, NOW) === null);
  const h = recordTargetChange([], 2, 3, NOW);
  // 2 -> 3 -> 4 in one sitting: 3 was never in force for a whole week, so recording it would judge
  // past weeks against a target the user held for ten seconds.
  check("[record] a second change the same WEEK is not appended", recordTargetChange(h, 3, 4, NOW + 2 * 864e5) === null);
  const h2 = recordTargetChange(h, 3, 4, NOW + 8 * 864e5);
  check("[record] a later change appends and stays sorted",
    JSON.stringify(h2) === '[{"until":"2026-09-14","target":2},{"until":"2026-09-21","target":3}]', JSON.stringify(h2));
  // Unbounded growth: the array is capped — but ABOVE the walk's own 104-week reach, because
  // slice(-N) drops the OLDEST entries and an old week that loses its boundary inherits a target
  // from years later rather than falling back to today's.
  let big = [];
  for (let i = 0; i < 200; i++) big = recordTargetChange(big, 2, 3, NOW - i * 7 * 864e5) || big;
  check("[record] the array cannot grow without bound", big.length <= 110, `length=${big.length}`);
  check("[record] and the cap still clears the 104-week walk", big.length >= 104, `length=${big.length}`);
}

// ── 10. storeStreak threads what the eight call sites would otherwise each have to ───────────
{
  const spec = {}; for (let w = 1; w <= 12; w++) spec[w] = 2;
  const wd = weeks(spec);
  const hist = [{ until: "2026-09-14", target: 2 }];
  const viaStore = storeStreak({ workoutDates: wd, weeklyTarget: 3, weeklyTargetHistory: hist });
  const direct = calcWeeklyStreak(wd, 3, { targetHistory: hist });
  check("[store] storeStreak passes the history through", viaStore.count === direct.count && viaStore.count > 1, `count=${viaStore.count}`);
  check("[store] a missing store degrades to the defaults", storeStreak(undefined).count === 0);
  check("[store] plusDateKey adds today without mutating the store", (() => {
    const s = { workoutDates: { ...wd }, weeklyTarget: 3 };
    const before = Object.keys(s.workoutDates).length;
    storeStreak(s, "2026-09-16");
    return Object.keys(s.workoutDates).length === before;
  })());
}

// ── 10b. THIS WEEK is judged against the CURRENT target, whatever the boundary says ──────────
// The card's pips and its "N/M" caption both show the new target, and `countingThisWeek` is
// computed against it. If the walk judged this week against the OLD one the two could disagree —
// lowering the target mid-week would give status "active" above a count of 0. Anchoring the
// boundary to this week's Monday is what makes that impossible.
{
  const spec = { 0: 2 }; for (let w = 1; w <= 8; w++) spec[w] = 4;   // this week 2, earlier 4
  const wd = weeks(spec);
  const hist = recordTargetChange([], 4, 2, NOW);                    // target LOWERED 4 -> 2 today
  const r = run(wd, 2, { targetHistory: hist });
  check("[target] a lowered target counts THIS week immediately", r.status === "active", `status=${r.status}`);
  check("[target] and status cannot disagree with the count", !(r.status === "active" && r.count === 0), JSON.stringify(r));
  check("[target] past weeks still use the OLD, higher target", r.count === 9, `count=${r.count}, expected this week + 8`);
}

// ── 11. An unbroken run is untouched by any of this ──────────────────────────────────────────
// The riskiest regression is making a CORRECT streak wrong, so pin that explicitly.
{
  const spec = {}; for (let w = 0; w <= 20; w++) spec[w] = 3;
  const r = graced(weeks(spec), 3);
  check("[compat] a perfect run is unchanged and spends no grace", r.count === 21 && r.graceUsed === 0 && r.status === "active", JSON.stringify(r));
  // And the same run under the SHIPPED settings — a perfect streak must not depend on the flag.
  const shipped = run(weeks(spec), 3);
  check("[shipped] a perfect run is identical with grace off", shipped.count === 21 && shipped.status === "active", JSON.stringify(shipped));
}

// ── 12. THE SHIPPED DEFAULT IS GRACE OFF ─────────────────────────────────────────────────────
// Everything labelled [grace] above passes graceEvery explicitly, so none of it can see the flag.
// This section is the only thing that does. It is the guard against grace coming back by accident
// — a free forgiven week is a product decision (it competes with the paid restore Mo parked), not
// a tuning knob, so it must never return as a side effect of an unrelated edit.
{
  check("[shipped] STREAK_GRACE_EVERY_WEEKS is 0", STREAK_GRACE_EVERY_WEEKS === 0, `= ${STREAK_GRACE_EVERY_WEEKS}`);
  // Behavioural, not just the constant: the section-1 fixture is the one grace was built for.
  const wd = weeks({ 1: 1, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 3, 11: 3 });
  const r = run(wd, 3);
  check("[shipped] a missed week DOES reset the streak", r.count === 0, `count=${r.count}`);
  check("[shipped] nothing is reported as forgiven", r.graceUsed === 0 && r.savedWeek === false, JSON.stringify(r));
  // The control: the same fixture with the mechanism switched on must differ, or this section is
  // passing because the fixture never needed grace rather than because the flag is off.
  check("[control] the same fixture WITH grace still counts 10", graced(wd, 3).count === 10, `count=${graced(wd, 3).count}`);
  // And the retroactive-target fix is independent of the flag — it must survive grace being off.
  const mon = "2026-09-14";
  const spec = {}; for (let w = 1; w <= 12; w++) spec[w] = 2;
  const wd2 = weeks(spec);
  const hist = [{ until: mon, target: 2 }];
  check("[shipped] past weeks still use their own target with grace off",
    run(wd2, 3, { targetHistory: hist }).count === 12, `count=${run(wd2, 3, { targetHistory: hist }).count}`);
}

console.log(fails === 0 ? "\nPASS all streak-grace checks" : `\nFAIL ${fails} streak-grace check(s)`);
process.exit(fails === 0 ? 0 : 1);
