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

// ── 4b. THE HARD HOUR — athletes, not just walkers ───────────────────────────────────────────
// This block used to read "NOT CHECKED HERE, ON PURPOSE". The curve clamped each hour at a flat
// `Math.min(6, …)` — the same shape of bug as the old `min(18, …)` on a day, one level down. A
// runner doing 12k steps and 600 kcal in ONE hour raws out at 13.3 and the chart recorded 6, the
// same as a brisk walk; meanwhile the headline worked from whole-day totals with no per-hour
// limit at all. Both sides now go through `activityRawSinceWake` — the same buckets, the same
// hours, a per-hour SOFT cap — so they agree by construction rather than by hoping.
//
// TWO THINGS NOT TO MEASURE, both of which give a confident number about nothing:
//   • "How far did the last point move." That conflates a genuinely steep hour with a pin
//     correction. A hiker really does lose 9 points in an hour at 11k steps, and that line is
//     being honest.
//   • The pinned endpoint itself. The pin overwrites the last point WITH the headline, so it can
//     only ever report agreement. That is the whole reason this divergence hid for a week.
// What is measured instead: the SECOND-to-last point, which the walk produces and the pin never
// touches, against the headline computed at that same instant. Both models, same moment, no pin.
//
// The fixture only fills buckets for hours that have ELAPSED. Not because a device writes nothing
// for the current hour — `readHourlyActivity` reads `endDate: now`, so it writes a PARTIAL bucket
// as the hour fills. The reason is that this comparison is anchored at `h:00`: a bucket carrying a
// whole hour's steps at that instant is data from the future, and it hands the headline activity
// nobody has done yet. Filling it manufactures an 8-point gap that is the fixture's fault.
{
  const elapsedStore = (from, to, v, upto) => {
    const hours = {};
    // THE BASELINE HOUR MUST BE BELOW THE REST THRESHOLD (250 steps / 40 kcal), or half this
    // commit goes untested. At 500 steps/hour `restfulHourRecharge` returns 0 for EVERY hour of
    // EVERY fixture here, `restRecharge` is 0 throughout, and the rest walk — the half of the fix
    // that stopped smearing the day's activity across the waking span — produces identical output
    // whichever activity model feeds it. Measured: with a 500-step baseline the smear can be
    // reverted and this whole section stays green; at 120 steps the same revert reads 6.
    for (let h = 7; h <= 22 && h <= upto; h++) hours[h] = { steps: 120, kcal: 15 };
    for (let h = from; h <= to && h <= upto; h++) hours[h] = v;
    let steps = 0, kcal = 0;
    for (const x of Object.values(hours)) { steps += x.steps; kcal += x.kcal; }
    return { history: {}, activity: { date: kd(D(0)), steps, activeKcal: kcal },
      activityHourly: hours, activityHourlyDate: kd(D(0)), recovery: rec };
  };
  const ATHLETES = [
    ["4h trail run (12k steps + 600 kcal/h)", 14, 17, { steps: 12000, kcal: 600 }],
    ["all-day hike (11k steps + 550 kcal/h)", 8, 18, { steps: 11000, kcal: 550 }],
    ["marathon pace (20k steps + 900 kcal/h)", 8, 10, { steps: 20000, kcal: 900 }],
    ["ultra (10h at 15k steps + 800 kcal/h)", 6, 15, { steps: 15000, kcal: 800 }],
    ["an ordinary day, as the control", 0, -1, { steps: 0, kcal: 0 }],
  ];
  console.log("headline vs curve at the same instant, hard hours (pin not involved):");
  let worst = 0, worstLabel = "";
  for (const [label, from, to, v] of ATHLETES) {
    let w = 0, when = "";
    for (let h = 9; h <= 22; h++) {
      const store = elapsedStore(from, to, v, h - 1);
      const pts = at(D(h, 55), () => computeBodyBatteryTimeline(store)?.points || []);
      const prev = pts[pts.length - 2];
      if (!prev || prev.phase === "recharge") continue;
      const hl = at(new RealDate(prev.ts), () => computeBodyBattery(store));
      const gap = Math.abs(prev.level - hl.level);
      if (gap > w) { w = gap; when = `${new RealDate(prev.ts).getHours()}:00 (curve ${prev.level} vs ${hl.level})`; }
    }
    console.log(`  ${label.padEnd(38)} worst gap ${String(w).padStart(2)}  ${when}`);
    if (w > worst) { worst = w; worstLabel = label; }
  }
  // Measured on the code this replaced: 8 on the trail run, 9 on the hike, 15 on the marathon,
  // 16 on the ultra — against 1 for the ordinary day that was the only shape ever tested. An
  // athlete must not get a worse-agreeing chart than a walker, so the bound is the walker's.
  check("an athlete's chart agrees with the number as closely as anyone else's",
    worst <= 2, `${worst} on ${worstLabel}`);
}

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
