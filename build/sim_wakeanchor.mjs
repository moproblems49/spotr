// A WINDOW IS ONLY AS HONEST AS ITS ANCHOR — and this one shipped flat.
//
// Body Battery bounds the day's activity to [wake, now]. That bound is right: movement recorded
// while you were genuinely asleep is the watch on the nightstand, not your day. But the wake
// anchor is a GUESS — 07:00 — whenever no watch recorded a sleep window, which is every
// phone-only user, every night. Bounding to a guess and treating it as fact discarded everything
// before it. Measured on the shipped bundle 2026-07-31j, an estimated 07:00 anchor with a shift
// walked 03:00-06:59, read at 20:30:
//
//   day steps   6,500  14,500  26,500  42,500  66,500  106,500
//   battery        71      71      71      71      71       71     <- ALL THE SAME
//
// A 6.5k day and a 106k day were indistinguishable, with the sheet still printing the full step
// count next to the un-charged drain. Same failure class as the hard `min(18, …)` this era
// started by fixing, arrived at from the opposite direction: not a ceiling, a window.
//
// The fix is `earliestActiveHourToday` — the mirror of the existing bedtime gate. Steps can prove
// you were AWAKE, never that you were asleep, so evidence only moves the estimated anchor EARLIER
// and only when the anchor is an estimate at all: a measured HealthKit window beats a guess and
// must NOT be overridden, or the nightstand gets counted again.
import { computeBodyBattery, computeBodyBatteryTimeline } from "./app.mjs";

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const RealDate = Date;
const D = (h, m = 0, off = 0) => new RealDate(2026, 6, 22 - off, h, m, 0);
const kd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const at = (now, fn) => { global.Date = class extends RealDate { constructor(...a) { if (!a.length) return new RealDate(now.getTime()); return new RealDate(...a); } static now() { return now.getTime(); } }; const r = fn(); global.Date = RealDate; return r; };

const build = (hours, recovery) => {
  let steps = 0, kcal = 0;
  for (const v of Object.values(hours)) { steps += v.steps; kcal += v.kcal; }
  return { history: {}, activity: { date: kd(D(0)), steps, activeKcal: kcal },
    activityHourly: hours, activityHourlyDate: kd(D(0)), recovery };
};
// No sleepStart/sleepEnd => no measured window => the 07:00 estimate is used.
const ESTIMATED = { recoveryScore: 0.8, sleepHours: 7 };
const read = (store, now) => at(now, () => {
  const bb = computeBodyBattery(store);
  const pts = computeBodyBatteryTimeline(store)?.points || [];
  return { bb, prev: pts[pts.length - 2] };
});

// ── 1. Pre-anchor movement must move the number ──────────────────────────────────────────────
{
  const levels = [], drains = [];
  console.log("early riser, gym in hours 5-6, estimated 07:00 anchor, read 19:00:");
  for (const s of [0, 3000, 6000, 9000, 12000]) {
    const hours = {};
    for (let h = 8; h <= 18; h++) hours[h] = { steps: 400, kcal: 25 };
    if (s) for (let h = 5; h <= 6; h++) hours[h] = { steps: s, kcal: s / 18 };
    const r = read(build(hours, ESTIMATED), D(19));
    levels.push(r.bb.level); drains.push(r.bb.activityDrain);
    console.log(`  ${String(s).padStart(6)} steps/h -> battery ${String(r.bb.level).padStart(3)} (−${String(r.bb.activityDrain).padStart(2)})  chart ${String(r.prev?.level).padStart(3)}`);
  }
  check("a pre-anchor gym session is not free", levels[1] < levels[0], `${levels[0]} -> ${levels[1]}`);
  check("...and a bigger one always costs at least as much",
    levels.every((v, i) => i === 0 || v <= levels[i - 1]), levels.join(" "));
  check("...with every rung distinct, not a flat scale", new Set(levels).size === levels.length, levels.join(" "));
}

// ── 2. The chart must follow the anchor too ──────────────────────────────────────────────────
// Moving only the headline would have swapped a flat number for a 20-point endpoint cliff. Both
// models take the anchor from the same helper, so the drain phase covers the same hours.
{
  const hours = {};
  for (let h = 8; h <= 18; h++) hours[h] = { steps: 400, kcal: 25 };
  for (let h = 5; h <= 6; h++) hours[h] = { steps: 9000, kcal: 500 };
  const r = read(build(hours, ESTIMATED), D(19));
  const gap = Math.abs(r.prev.level - r.bb.level);
  console.log(`  headline ${r.bb.level} vs chart's own last point ${r.prev.level} (gap ${gap})`);
  check("the chart tracks the number once the anchor moves", gap <= 3, String(gap));
}

// ── 3. A MEASURED SLEEP WINDOW MUST WIN ──────────────────────────────────────────────────────
// This is the half that keeps the bound meaningful. With a real HealthKit window, hours before
// wake are hours you were asleep and their steps are another device's noise — counting them is
// the double-count bug this project has fixed twice. The anchor must NOT be pulled earlier here.
{
  const measured = { recoveryScore: 0.8, sleepHours: 8,
    sleepStart: D(23, 0, 1).toISOString(), sleepEnd: D(7).toISOString() };
  const hours = {};
  for (let h = 8; h <= 18; h++) hours[h] = { steps: 400, kcal: 25 };
  const quiet = read(build({ ...hours }, measured), D(19));
  for (let h = 3; h <= 6; h++) hours[h] = { steps: 9000, kcal: 500 };
  const noisy = read(build(hours, measured), D(19));
  console.log(`  measured window: quiet night ${quiet.bb.level} (−${quiet.bb.activityDrain}), 'steps' during sleep ${noisy.bb.level} (−${noisy.bb.activityDrain})`);
  check("steps recorded inside a MEASURED sleep window are still ignored",
    noisy.bb.activityDrain === quiet.bb.activityDrain,
    `${quiet.bb.activityDrain} vs ${noisy.bb.activityDrain}`);
}

// ── 4. A quiet night must not move anything ──────────────────────────────────────────────────
// The gate is `AWAKE_STEPS_PER_H` (120) — a trip to the bathroom must not restart your day and
// charge you 0.9/h of baseline drain for the hours you were asleep.
{
  const hours = {};
  for (let h = 8; h <= 18; h++) hours[h] = { steps: 400, kcal: 25 };
  const plain = read(build({ ...hours }, ESTIMATED), D(19));
  hours[3] = { steps: 40, kcal: 3 };   // bathroom trip
  const nudged = read(build(hours, ESTIMATED), D(19));
  console.log(`  quiet night ${plain.bb.level}, with a 40-step 3am trip ${nudged.bb.level}`);
  check("a 3am bathroom trip does not restart the day", nudged.bb.level === plain.bb.level,
    `${plain.bb.level} vs ${nudged.bb.level}`);
}

// ── 5. Every hour of the clock ───────────────────────────────────────────────────────────────
// The anchor logic branches on now-vs-07:00 and on today-vs-yesterday, so it has to be swept
// rather than spot-checked; pre-dawn is where this function's neighbours have broken repeatedly.
{
  let bad = 0;
  for (let h = 0; h <= 23; h++) {
    const hours = {};
    for (let x = 5; x <= Math.max(5, Math.min(h, 22)); x++) hours[x] = { steps: 3000, kcal: 170 };
    const r = read(build(hours, ESTIMATED), D(h, 40));
    if (!Number.isFinite(r.bb.level) || r.bb.level < 5 || r.bb.level > 100) {
      bad++; console.log(`  ${h}:40 -> level ${r.bb.level}`);
    }
    if (!Number.isInteger(r.bb.activityDrain)) { bad++; console.log(`  ${h}:40 -> drain ${r.bb.activityDrain}`); }
  }
  check("the number stays sane and whole at every hour of the clock", bad === 0, `${bad} bad hour(s)`);
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
