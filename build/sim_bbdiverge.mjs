// THE HEADLINE AND THE CURVE MUST AGREE — the bug class that keeps coming back.
//
// computeBodyBattery() and computeBodyBatteryTimeline() model the same day twice. They have now
// diverged THREE times, and every time the symptom is the same: the big number and the end of the
// chart directly beneath it disagree, sometimes by 30 points. Existing coverage (sim_bbmatch,
// sim_bbrest) pins two specific clock times; this sweeps the cases that actually broke.
//
// Fixed here, all found by a Fable-5 audit on Aug 1:
//   1. Pre-dawn with NO HealthKit sleep window (every phone-only user, every night): the headline
//      rolled its wake anchor back to yesterday 7am and kept draining while the curve assumed a
//      10pm bedtime and drew a rising recharge. 05:30 read headline 40 / curve 71.
//   2. The curve applied STALE activityHourly buckets as drain with no freshness gate — a whole
//      day of phantom sag, then a 15-point cliff where the endpoint pin snapped back.
//   3. restRecharge was order-blind: still hours banked at full charge were refunded against a
//      later workout, so a 20-set session could be erased entirely.
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://app.test/" });
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.localStorage = dom.window.localStorage;

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const RealDate = Date;
const D = (h, m = 0) => new RealDate(2026, 6, 22, h, m, 0);
const YEST = (h, m = 0) => new RealDate(2026, 6, 21, h, m, 0);
const dk = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const aSet = () => ({ weight: "185", reps: "8", done: true, type: "normal" });
const sess = (n, endMs) => ({ dayName: "W", unit: "lbs", duration: 3600, finishedAt: endMs,
  exercises: Array.from({ length: Math.ceil(n/4) }, (_, i) => ({ name: `E${i}`,
    sets: Array.from({ length: Math.min(4, n - i*4) }, aSet) })) });

// Freeze the clock, then import a FRESH module instance so module-level state can't leak.
async function at(now, store) {
  global.Date = class extends RealDate {
    constructor(...a) { if (!a.length) return new RealDate(now.getTime()); return new RealDate(...a); }
    static now() { return now.getTime(); }
  };
  const m = await import("./app.mjs?d=" + Math.random());
  const bb = m.computeBodyBattery(store);
  const tl = m.computeBodyBatteryTimeline(store);
  const pts = tl?.points || [];
  return { bb, tl, last: pts[pts.length - 1] || null, prev: pts[pts.length - 2] || null };
}

// ── 1. Phone-only user through the midnight rollover ─────────────────────────────────────────
// No store.recovery at all — this is the majority case until someone connects Apple Health.
const phoneOnly = () => ({ history: { [dk(YEST(0))]: { s: sess(20, YEST(18).getTime()) } }, activity: null, recovery: null });
for (const [h, m] of [[21, 0], [23, 30], [0, 30], [1, 30], [3, 30], [5, 30], [6, 45]]) {
  const r = await at(D(h, m), phoneOnly());
  const diff = Math.abs(r.bb.level - (r.last?.level ?? 0));
  console.log(`phone-only ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")} → headline ${r.bb.level}, curve ends ${r.last?.level}`);
  check(`phone-only at ${h}:${String(m).padStart(2,"0")}: the number and the curve agree`, diff === 0, `off by ${diff}`);
}

// ── 2. Stale hourly buckets must not drag the curve ──────────────────────────────────────────
{
  const stale = {}; for (let h = 0; h < 24; h++) stale[h] = { steps: 900, kcal: 60 };
  const store = { history: {}, activity: null, activityHourly: stale, activityHourlyDate: dk(YEST(0)),
    recovery: { recoveryScore: 0.8, sleepHours: 7.5, sleepStart: YEST(23).toISOString(), sleepEnd: D(7).toISOString() } };
  const r = await at(D(20), store);
  console.log(`stale buckets → headline ${r.bb.level}, curve ends ${r.last?.level}, prev point ${r.prev?.level}`);
  check("yesterday's step buckets don't drain today's curve", r.bb.level === r.last?.level,
    `${r.bb.level} vs ${r.last?.level}`);
  check("...and there's no cliff at the pinned endpoint", Math.abs((r.prev?.level ?? 0) - (r.last?.level ?? 0)) <= 3,
    `prev ${r.prev?.level} → last ${r.last?.level}`);
}

// ── 3. Rest must not refund a workout it happened BEFORE ─────────────────────────────────────
{
  const hourly = {}; for (let h = 0; h < 24; h++) hourly[h] = { steps: 20, kcal: 5 };
  hourly[14] = { steps: 800, kcal: 250 };   // the training hour
  const store = { history: { [dk(D(0))]: { s: sess(20, D(15).getTime()) } },
    activity: { date: dk(D(0)), steps: 3000, activeKcal: 200 },
    activityHourly: hourly, activityHourlyDate: dk(D(0)),
    recovery: { recoveryScore: 0.85, sleepHours: 8, sleepStart: YEST(23).toISOString(), sleepEnd: D(7).toISOString() } };
  const r = await at(D(22, 10), store);
  console.log(`rest-then-train → charge0 ${r.bb.charge0}, level ${r.bb.level}, rest +${r.bb.restRecharge}, workout −${r.bb.workoutDrain}`);
  check("a full day of stillness cannot erase the workout entirely",
    r.bb.level < r.bb.charge0, `level ${r.bb.level} vs charge0 ${r.bb.charge0}`);
  check("the number and the curve agree on a rest-then-train day",
    r.bb.level === r.last?.level, `${r.bb.level} vs ${r.last?.level}`);
  check("rest credit never exceeds what the day actually spent",
    r.bb.restRecharge <= r.bb.baselineDrain + r.bb.workoutDrain + r.bb.activityDrain,
    `+${r.bb.restRecharge} vs spent ${r.bb.baselineDrain + r.bb.workoutDrain + r.bb.activityDrain}`);
}

// ── 4. The training hour is not a rest hour ──────────────────────────────────────────────────
{
  // Other hours MUST carry real data, or restfulHourRecharge's "did the read return anything?"
  // guard short-circuits and this passes for the wrong reason (it did, first time round).
  const hourly = {};
  for (let h = 7; h <= 16; h++) hourly[h] = { steps: 900, kcal: 120 };   // an active day...
  hourly[14] = { steps: 0, kcal: 0 };   // ...except the training hour: phone in a locker
  const store = { history: { [dk(D(0))]: { s: sess(20, D(15).getTime()) } },
    activity: { date: dk(D(0)), steps: 2000, activeKcal: 150 },
    activityHourly: hourly, activityHourlyDate: dk(D(0)),
    recovery: { recoveryScore: 0.8, sleepHours: 7.5, sleepStart: YEST(23).toISOString(), sleepEnd: D(7).toISOString() } };
  const r = await at(D(16), store);
  console.log(`locker hour → rest credit ${r.bb.restRecharge}`);
  check("the hour you were training earns no rest credit", r.bb.restRecharge === 0, String(r.bb.restRecharge));
}

// ── 5. The tiles must add up to the number they sit under ────────────────────────────────────
{
  const hourly = {}; for (let h = 0; h < 24; h++) hourly[h] = { steps: 30, kcal: 6 };
  const store = { history: { [dk(D(0))]: { s: sess(16, D(11).getTime()) } },
    activity: { date: dk(D(0)), steps: 4000, activeKcal: 250 },
    activityHourly: hourly, activityHourlyDate: dk(D(0)),
    recovery: { recoveryScore: 0.7, sleepHours: 7, sleepStart: YEST(23, 30).toISOString(), sleepEnd: D(6, 30).toISOString() } };
  const r = await at(D(18), store);
  const sum = r.bb.charge0 - r.bb.baselineDrain - r.bb.workoutDrain - r.bb.activityDrain + r.bb.restRecharge;
  console.log(`tiles: ${r.bb.charge0} −${r.bb.baselineDrain} −${r.bb.workoutDrain} −${r.bb.activityDrain} +${r.bb.restRecharge} = ${sum}, level ${r.bb.level}`);
  check("charge0 − drains + rest equals the displayed level", sum === r.bb.level, `${sum} vs ${r.bb.level}`);
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
