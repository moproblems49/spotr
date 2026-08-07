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
import { computeBodyBattery, computeBodyBatteryTimeline, softCapActivity } from "./app.mjs";

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

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
