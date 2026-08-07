// THE TOP OF THE ACTIVITY SCALE MUST NOT BE FLAT.
//
// Activity drain was `Math.min(18, raw)`, and raw reaches 18 at roughly 14k steps + 880 kcal — a
// long hike or a shift on your feet, not an outlier. Measured on the shipped code, all of these
// reported the SAME Body Battery: 14.6k steps, 22k, 36.6k, 58.5k, 87.8k. A moderate day and an
// ultramarathon were indistinguishable. The chart agreed with the number only because the caps
// commit had made both sides adopt the same flat model.
//
// It is a soft cap now: linear to a knee, then compressed but still rising. This pins the three
// properties that matter — it stays MONOTONIC at the top, it does not move ordinary days, and it
// stays BOUNDED so a 100k-step day can't erase the whole battery — plus the one that has broken
// four times: the headline and the 24h curve must still agree.
import { computeBodyBattery, computeBodyBatteryTimeline, softCapActivity, softCapWorkout } from "./app.mjs";

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const RealDate = Date;
const D = (h, m = 0, off = 0) => new RealDate(2026, 6, 22 - off, h, m, 0);
const kd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const rec = { recoveryScore: 0.8, sleepHours: 8, sleepStart: D(23, 0, 1).toISOString(), sleepEnd: D(7).toISOString() };
const aSet = () => ({ weight: "185", reps: "8", done: true, type: "normal" });
const sess = (n, endMs) => ({ dayName: "W", unit: "lbs", duration: 3600, finishedAt: endMs,
  exercises: Array.from({ length: Math.ceil(n / 4) }, (_, i) => ({ name: `E${i}`, sets: Array.from({ length: Math.min(4, n - i * 4) }, aSet) })) });

// Steps spread over the waking hours, as a real day records them — NOT all 24 buckets, which is
// not a shape any device produces and which distorts the curve's per-hour scale.
const dayStore = (steps, kcal, withWorkout = false) => {
  const hours = {}; const wake = 7, last = 19, n = last - wake + 1;
  for (let h = wake; h <= last; h++) hours[h] = { steps: steps / n, kcal: kcal / n };
  return { history: withWorkout ? { [kd(D(0))]: { a: sess(20, D(10, 30).getTime()) } } : {},
    activity: { date: kd(D(0)), steps, activeKcal: kcal },
    activityHourly: hours, activityHourlyDate: kd(D(0)), recovery: rec };
};
const at = (now, fn) => { global.Date = class extends RealDate { constructor(...a) { if (!a.length) return new RealDate(now.getTime()); return new RealDate(...a); } static now() { return now.getTime(); } }; const r = fn(); global.Date = RealDate; return r; };
const probe = (store) => at(D(20), () => {
  const bb = computeBodyBattery(store);
  const pts = computeBodyBatteryTimeline(store)?.points || [];
  return { bb, last: pts[pts.length - 1], prev: pts[pts.length - 2] };
});

// ── 1. The ladder must keep descending ───────────────────────────────────────────────────────
const LADDER = [[7320, 439], [14640, 878], [21960, 1318], [36600, 2196], [58560, 3514], [87840, 5270]];
const levels = [], drains = [];
console.log("steps / kcal -> Body Battery (activity drain):");
for (const [st, kc] of LADDER) {
  const r = probe(dayStore(st, kc));
  levels.push(r.bb.level); drains.push(r.bb.activityDrain);
  console.log(`  ${String(st).padStart(6)} / ${String(kc).padStart(5)}  ->  ${String(r.bb.level).padStart(3)}  (−${r.bb.activityDrain})`);
}
check("a bigger day always costs at least as much", levels.every((v, i) => i === 0 || v <= levels[i - 1]), levels.join(" "));
check("...and 14.6k vs 88k steps are no longer the same number", levels[1] !== levels[5],
  `${levels[1]} vs ${levels[5]}`);
check("...with every rung of the ladder distinct", new Set(levels).size === levels.length, levels.join(" "));

// ── 2. Ordinary days must be untouched ───────────────────────────────────────────────────────
// The knee sits above where a normal day lands, so the change must be invisible to most people.
for (const [st, kc] of [[3000, 180], [6000, 360], [9000, 520]]) {
  const raw = st / 1800 + kc / 90;
  check(`an ordinary day (${st} steps) is unchanged by the soft cap`,
    Math.abs(softCapActivity(raw) - raw) < 1e-9, `raw ${raw.toFixed(2)} -> ${softCapActivity(raw).toFixed(2)}`);
}

// ── 3. ...and the top must still be BOUNDED ──────────────────────────────────────────────────
// A soft cap that keeps climbing linearly would just move the problem: a 100k-step day must not
// be able to erase a whole battery on its own.
check("an absurd day is still bounded", softCapActivity(1000) <= 30.001, String(softCapActivity(1000)));
check("...and the bound is approached, not jumped to", softCapActivity(60) < softCapActivity(1000),
  `${softCapActivity(60)} vs ${softCapActivity(1000)}`);
check("zero and nonsense inputs are safe",
  softCapActivity(0) === 0 && softCapActivity(-5) === 0 && softCapActivity(undefined) === 0);

// ── 4. The headline and the chart must still agree at every rung ─────────────────────────────
// This is the property that has broken four times. The endpoint is pinned to the headline, so a
// disagreement shows up as a near-vertical jump in the last few pixels.
{
  let bad = 0;
  for (const [st, kc] of LADDER) for (const withW of [false, true]) {
    const r = probe(dayStore(st, kc, withW));
    const jump = Math.abs(r.last.level - r.prev.level);
    if (jump > 6) { bad++; console.log(`  ${st} steps${withW ? " + workout" : ""}: last move ${jump} (headline ${r.bb.level})`); }
  }
  check("the chart does not end in a cliff at any point on the ladder", bad === 0, `${bad} case(s)`);
}

// ── 4b. NOT CHECKED HERE, ON PURPOSE: the hard-hour divergence ───────────────────────────────
// The curve clamps each hour's activity at 6 while the headline works from whole-day totals with
// no per-hour clamp, so on a genuinely hard day (4h at 12k steps + 600 kcal/h) the headline
// charges 28 where the curve delivers ~21 and the endpoint pin corrects the rest in the last few
// pixels. It is real, it is measured, and it is NOT fixed — see the comment on `activityScale`.
// There is deliberately no assertion with a loosened bound here: a tolerance with a shrug attached
// is how the previous residual hid for a week. When the headline gets a per-hour model, add the
// strict check.

// ── 5. Winnability, both ends ────────────────────────────────────────────────────────────────
// The documented requirement: a good day clears 80, a wrecked day stays under 40. Raising the
// activity ceiling from 18 to 30 makes big days harsher, so both ends need re-checking.
{
  const rested = at(D(11), () => computeBodyBattery({ history: {}, activity: null,
    recovery: { recoveryScore: 0.95, sleepHours: 8.5, sleepStart: D(23, 0, 1).toISOString(), sleepEnd: D(7, 30).toISOString() } }));
  check("a rested rest day still clears 80", rested.level >= 80, String(rested.level));
  const wrecked = at(D(20), () => computeBodyBattery({
    history: { [kd(D(0))]: { a: sess(30, D(17).getTime()) } },
    activity: { date: kd(D(0)), steps: 12000, activeKcal: 700 },
    recovery: { recoveryScore: 0.15, sleepHours: 4, sleepStart: D(2, 0, 0).toISOString(), sleepEnd: D(6).toISOString() } }));
  check("...and a wrecked day stays under 40", wrecked.level < 40, String(wrecked.level));
}


// ── 6. THE TRAINING SIDE HAS THE SAME SHAPE ──────────────────────────────────────────────────
// `sessionDrain` already caps ONE session at 24, and the daily ceiling was a hard 32 — so two
// maximal sessions (24+24=48) and three (72) both landed on exactly 32. A two-a-day and a
// three-a-day were the same number. The knee is at 24, i.e. one maximal session, so a single
// workout of ANY size is untouched: only people who train twice a day see any difference.
{
  console.log("workout drain:");
  const rungs = [8, 16, 24, 32, 40, 48, 72, 96];
  const out = rungs.map(r => softCapWorkout(r));
  for (let i = 0; i < rungs.length; i++) console.log(`  raw ${String(rungs[i]).padStart(3)}  ->  ${out[i].toFixed(1)}`);
  check("one session of any size is unchanged", out[0] === 8 && out[1] === 16 && out[2] === 24,
    out.slice(0, 3).join(" "));
  check("a two-a-day and a three-a-day are different numbers",
    Math.round(softCapWorkout(48)) !== Math.round(softCapWorkout(72)),
    `${softCapWorkout(48)} vs ${softCapWorkout(72)}`);
  check("...and every rung above the knee still rises", out.every((v, i) => i === 0 || v >= out[i - 1]), out.join(" "));
  check("...while staying bounded", softCapWorkout(1000) <= 44.001, String(softCapWorkout(1000)));

  // ...and the chart must still agree with the number on a two-a-day.
  const kdd = kd(D(0));
  const two = { history: { [kdd]: { a: sess(34, D(9, 30).getTime()), b: sess(34, D(17, 30).getTime()) } },
    activity: { date: kdd, steps: 5000, activeKcal: 320 },
    activityHourly: (() => { const h = {}; for (let x = 7; x <= 19; x++) h[x] = { steps: 380, kcal: 25 }; return h; })(),
    activityHourlyDate: kdd, recovery: rec };
  const r = probe(two);
  console.log(`  two-a-day: headline ${r.bb.level} (workout −${r.bb.workoutDrain}), chart's last move ${Math.abs(r.last.level - r.prev.level)}`);
  check("a two-a-day's chart does not end in a cliff", Math.abs(r.last.level - r.prev.level) <= 6,
    String(Math.abs(r.last.level - r.prev.level)));
  // THE NUMBERS THE CARD PRINTS MUST BE WHOLE. sessionDrain returns integers and the old hard cap
  // kept them integral, so nothing downstream rounded — the soft cap returns a float and the
  // headline rendered "37.023884238244044". This check exists because the sim's own console line
  // is what exposed it.
  check("every figure the card prints is a whole number",
    [r.bb.level, r.bb.charge0, r.bb.workoutDrain, r.bb.activityDrain, r.bb.baselineDrain, r.bb.restRecharge]
      .every(Number.isInteger),
    JSON.stringify({ level: r.bb.level, workout: r.bb.workoutDrain, activity: r.bb.activityDrain }));
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
