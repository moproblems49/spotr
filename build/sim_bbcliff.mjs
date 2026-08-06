// THE CHART MUST NOT END IN A CLIFF.
//
// `computeBodyBattery` (the big number) and `computeBodyBatteryTimeline` (the 24h chart under it)
// model the same day twice. The timeline force-pins its LAST point to the headline, so whenever
// the two disagree the entire disagreement is drawn across the ~4.5px between the final two points
// — a near-vertical spike at the right edge of the card.
//
// `sim_bbdiverge` sweeps the clock but only ever compares the PINNED endpoint, which is exactly the
// number the pin fabricates. It therefore cannot see any of this. That is why the checks below
// compare the last two points to each other and to the typical hourly step.
//
// Four source mismatches were hiding behind the pin, all measured:
//   * activity drain capped 18/DAY in the headline, 6/HOUR uncapped in the curve
//       -> 30k steps: curve 35 vs headline 18, +17 pin jump.  45k: 58 vs 18, +40.
//   * workout drain capped 32/day in the headline, uncapped in the curve
//       -> two 34-set sessions: curve applies 48 vs 32, +15.
//   * the curve credited rest recharge during the WORKOUT hour; the headline refuses to
//       -> 4h session: −3/h instead of −4.9/h, 9-point cliff.
//   * neither side guarded against a session dated in the FUTURE
//       -> legacy noon-anchored row read at 08:00: −22.
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://app.test/" });
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.localStorage = dom.window.localStorage;

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const RealDate = Date;
const D = (h, m = 0, off = 0) => new RealDate(2026, 6, 22 - off, h, m, 0);
const keyOf = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const aSet = () => ({ weight: "185", reps: "8", done: true, type: "normal" });
const sess = (n, endMs, durS = 3600) => ({ dayName: "W", unit: "lbs", duration: durS, finishedAt: endMs,
  exercises: Array.from({ length: Math.ceil(n/4) }, (_, i) => ({ name: `E${i}`,
    sets: Array.from({ length: Math.min(4, n - i*4) }, aSet) })) });
const buckets = (perHour) => { const h = {}; for (let i = 0; i < 24; i++) h[i] = perHour; return h; };
const rec = { recoveryScore: 0.8, sleepHours: 8,
  sleepStart: D(23, 0, 1).toISOString(), sleepEnd: D(7).toISOString() };

async function at(now, store) {
  global.Date = class extends RealDate {
    constructor(...a) { if (!a.length) return new RealDate(now.getTime()); return new RealDate(...a); }
    static now() { return now.getTime(); }
  };
  const m = await import("./app.mjs?d=" + Math.random());
  const bb = m.computeBodyBattery(store);
  const pts = (m.computeBodyBatteryTimeline(store)?.points) || [];
  const drain = pts.filter(p => p.phase === "drain");
  // Typical hourly step across the drain phase — the yardstick for "is the last move a cliff?".
  const steps = [];
  for (let i = 1; i < drain.length; i++) steps.push(Math.abs(drain[i].level - drain[i-1].level));
  steps.sort((a, b) => a - b);
  const typical = steps.length ? steps[Math.floor(steps.length / 2)] : 0;
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  return { bb, last, prev, typical, jump: Math.abs((last?.level ?? 0) - (prev?.level ?? 0)) };
}

const CASES = {
  "long hike — 30k steps / 2000 kcal": {
    store: () => ({ history: {}, activity: { date: keyOf(D(0)), steps: 30000, activeKcal: 2000 },
      activityHourly: buckets({ steps: 2500, kcal: 165 }), activityHourlyDate: keyOf(D(0)), recovery: rec }) },
  "very big day — 45k steps / 3500 kcal": {
    store: () => ({ history: {}, activity: { date: keyOf(D(0)), steps: 45000, activeKcal: 3500 },
      activityHourly: buckets({ steps: 3750, kcal: 290 }), activityHourlyDate: keyOf(D(0)), recovery: rec }) },
  "two-a-day — 34 sets at 09:00 and 34 at 17:00": {
    store: () => ({ history: { [keyOf(D(0))]: { a: sess(34, D(10).getTime()), b: sess(34, D(18).getTime()) } },
      activity: { date: keyOf(D(0)), steps: 6000, activeKcal: 400 },
      activityHourly: buckets({ steps: 250, kcal: 17 }), activityHourlyDate: keyOf(D(0)), recovery: rec }) },
  "4h session, still afternoon": {
    store: () => ({ history: { [keyOf(D(0))]: { a: sess(24, D(13).getTime(), 4 * 3600) } },
      activity: { date: keyOf(D(0)), steps: 3000, activeKcal: 250 },
      activityHourly: buckets({ steps: 30, kcal: 5 }), activityHourlyDate: keyOf(D(0)), recovery: rec }) },
  "ordinary day — 20 sets, 7k steps": {
    store: () => ({ history: { [keyOf(D(0))]: { a: sess(20, D(10).getTime()) } },
      activity: { date: keyOf(D(0)), steps: 7000, activeKcal: 450 },
      activityHourly: buckets({ steps: 300, kcal: 19 }), activityHourlyDate: keyOf(D(0)), recovery: rec }) },
};

for (const [name, { store }] of Object.entries(CASES)) {
  const r = await at(D(20), store());
  console.log(`${name}\n   curve … ${r.prev?.level} -> ${r.last?.level} (headline ${r.bb.level}), typical hourly step ${r.typical}, jump ${r.jump}`);
  // THE RESIDUAL IS EXPLAINED NOW, so the loosened tolerances are gone. This block used to allow
  // 5 for two-a-day and 11 for the step cases, with a comment saying the cause was "something
  // else in how the two walks accumulate" — which was simply an unexamined guess. An audit found
  // three ordinary mismatches, each verified by removing it and watching the residual go to zero:
  //   * the 18/day activity scale divided by ALL 24 hourly buckets while the drain was applied
  //     only over wake->now, so the curve delivered 18 x walkedHours/bucketHours (13/24 here);
  //   * the headline extended every session span by 1ms (`Math.max(endMs, endMs + 1)`), pushing
  //     it into the next hour so the rest walk skipped that hour's 2-point credit — worth exactly
  //     2 points per session ending on an hour boundary, which is every fixture in this file;
  //   * the headline's 0.6 activity damping on a training day had no counterpart in the curve.
  // All three are fixed, so every case holds the strict bound. If one of these needs loosening
  // again, find the cause first — a tolerance with a shrug attached is how they hid for a week.
  const allow = r.typical + 2;
  check(`${name}: the chart does not end in a cliff`, r.jump <= allow,
    `last move ${r.jump} vs allowed ${allow} (typical hourly step ${r.typical})`);
  check(`${name}: ...and it still lands on the headline`, r.last?.level === r.bb.level,
    `${r.last?.level} vs ${r.bb.level}`);
}

// ── A session dated in the FUTURE must not drain anything ────────────────────────────────────
{
  const store = () => ({ history: { [keyOf(D(0))]: { a: sess(20, D(17).getTime()) } },
    activity: null, recovery: rec });
  const before = await at(D(5), store());     // 05:00 — the 17:00 session has not happened
  const after = await at(D(18), store());     // 18:00 — it has
  console.log(`future session: at 05:00 workoutDrain ${before.bb.workoutDrain}, at 18:00 ${after.bb.workoutDrain}`);
  check("a workout later today drains nothing yet", before.bb.workoutDrain === 0,
    String(before.bb.workoutDrain));
  check("...and drains normally once it has happened", after.bb.workoutDrain > 0,
    String(after.bb.workoutDrain));
  // PRE-DAWN IS NOT EXEMPT. This used to skip the check here, claiming "the curve's last point is
  // the recharge/drain boundary, so the jump is a phase transition". That was false — both of the
  // last two points are tagged "drain", the pin fires, and the one case this file excluded was the
  // worst one in it. With no real sleep window the estimate pushes bedtime to `now`, which empties
  // both the recharge phase and today's drain phase, so the last drawn point was a CONSTANT
  // (`sleepStartLevel`) that did not move between 03:00 and 06:30 while the headline kept
  // draining: measured 55 against a headline of 81, a 26-point jump drawn across ~6px, every
  // night, and worst for the best-rested. Checked properly below.
}

// ── PRE-DAWN: the curve must not end on a constant while the headline drains ─────────────────
{
  // Phone-only user, no HealthKit sleep window at all — the shape that produced the 26-point
  // cliff. Swept across the hours the bug lived in, and at several recovery levels because the
  // gap grew with how rested you were (0.5/7h gave 10 points, 1.0/8.5h gave 27).
  for (const [rs, sh] of [[0.5, 7], [0.8, 8], [1.0, 8.5]]) {
    const store = () => ({ history: {}, activity: null, recovery: { recoveryScore: rs, sleepHours: sh } });
    for (const h of [0, 2, 3, 5, 6]) {
      const r = await at(D(h, 30), store());
      check(`pre-dawn ${String(h).padStart(2, "0")}:30 (recovery ${rs}): the chart does not end in a cliff`,
        r.jump <= r.typical + 2, `jump ${r.jump} vs typical ${r.typical} (headline ${r.bb.level})`);
    }
  }
  // ...and the endpoint must MOVE as the night goes on, rather than sitting on a constant.
  const store = () => ({ history: {}, activity: null, recovery: { recoveryScore: 0.9, sleepHours: 8 } });
  const levels = [];
  for (const h of [1, 3, 5]) levels.push((await at(D(h, 30), store())).last?.level);
  check("...and the pre-dawn endpoint actually changes with the clock",
    new Set(levels).size > 1, `levels ${levels.join(",")}`);
}

// ── A legacy row with no finishedAt anchors to NOON, so it must be inert before noon ─────────
{
  const legacy = { dayName: "W", unit: "lbs", duration: 3600,
    exercises: [{ name: "E", sets: Array.from({ length: 20 }, aSet) }] };   // no finishedAt
  const store = () => ({ history: { [keyOf(D(0))]: { a: legacy } }, activity: null, recovery: rec });
  const morning = await at(D(8), store());
  console.log(`legacy noon-anchored row at 08:00: headline ${morning.bb.level}, curve ends ${morning.last?.level}, workoutDrain ${morning.bb.workoutDrain}`);
  check("a noon-anchored legacy row does not drain at 08:00", morning.bb.workoutDrain === 0,
    String(morning.bb.workoutDrain));
  check("...and the chart agrees with the number", morning.last?.level === morning.bb.level,
    `${morning.last?.level} vs ${morning.bb.level}`);
}

// ── The card's summary line must reconcile to the headline ───────────────────────────────────
{
  const store = { history: { [keyOf(D(0))]: { a: sess(20, D(10).getTime()) } },
    activity: { date: keyOf(D(0)), steps: 4000, activeKcal: 300 },
    activityHourly: buckets({ steps: 30, kcal: 5 }), activityHourlyDate: keyOf(D(0)), recovery: rec };
  const r = await at(D(20), store);
  const b = r.bb;
  const sum = b.charge0 - b.baselineDrain - b.workoutDrain - b.activityDrain + b.restRecharge;
  console.log(`card line: ${b.charge0} −${b.baselineDrain} −${b.workoutDrain} −${b.activityDrain} +${b.restRecharge} = ${sum}, headline ${b.level}`);
  check("every term the card can print reconciles to the headline", sum === b.level,
    `${sum} vs ${b.level}`);
  check("...and rest recovery is non-zero here, so omitting it would show", b.restRecharge > 0,
    String(b.restRecharge));
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
