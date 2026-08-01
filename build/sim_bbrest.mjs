// DAYTIME RECOVERY — the battery climbs back during genuinely still hours.
//
// Mo trains in the morning, so he took the training hit at 8am and then watched the number fall all
// day no matter how much he rested (measured: 70 → 57 over 16h of doing nothing). Garmin recharges
// during calm periods off a continuous HR stream; we approximate it from HealthKit's per-hour
// step/energy buckets, which is enough to separate a still afternoon from a walk.
//
// Also pins the thing that broke while building it: ONE session-drain formula. The headline moved
// to 4 + 0.6/set and the 24h curve kept 6 + 0.9/set, so the chart dived to ~10 under a headline of
// 23. Both go through sessionDrain() now, and the last curve point must equal the headline.
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://app.test/" });
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.localStorage = dom.window.localStorage;

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

// Freeze "now" at 3:00pm so there is a real afternoon to rest through.
const NOW = new Date(2026, 6, 22, 15, 0, 0);
const RealDate = Date;
global.Date = class extends RealDate {
  constructor(...a) { if (!a.length) return new RealDate(NOW.getTime()); return new RealDate(...a); }
  static now() { return NOW.getTime(); }
};

const { computeBodyBattery, computeBodyBatteryTimeline } = await import("./app.mjs");

const dk = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const TODAY = dk(NOW);
const aSet = () => ({ weight: "185", reps: "8", done: true, type: "normal" });
const session = (n, endMs) => ({ dayName: "AM Lift", unit: "lbs", duration: 3600, finishedAt: endMs,
  exercises: Array.from({ length: Math.ceil(n/4) }, (_, i) => ({ name: `Ex${i}`,
    sets: Array.from({ length: Math.min(4, n - i*4) }, aSet) })) });

// Woke 7am, trained 8-9am, then the afternoon varies.
const WAKE = new Date(2026, 6, 22, 7, 0, 0);
function build(hourly) {
  return {
    history: { [TODAY]: { s1: session(20, new RealDate(2026, 6, 22, 9, 0, 0).getTime()) } },
    recovery: { recoveryScore: 0.7, sleepHours: 7.5,
      sleepStart: new RealDate(2026, 6, 21, 23, 30, 0).toISOString(),
      sleepEnd: WAKE.toISOString() },
    activity: { date: TODAY, steps: 5000, activeKcal: 300 },
    activityHourly: hourly, activityHourlyDate: TODAY,
  };
}
// The morning workout is real movement; the afternoon is the variable. Hour 7 (up and about
// before the gym) is populated in BOTH fixtures so the only difference is the afternoon —
// an unpopulated hour legitimately counts as still, which would otherwise muddy the contrast.
const morning = { 7: { steps: 600, kcal: 45 }, 8: { steps: 900, kcal: 260 }, 9: { steps: 400, kcal: 90 } };
const busyAfternoon = { ...morning };
for (let h = 10; h <= 15; h++) busyAfternoon[h] = { steps: 1200, kcal: 120 };
const stillAfternoon = { ...morning };
for (let h = 10; h <= 15; h++) stillAfternoon[h] = { steps: 40, kcal: 8 };

const busy = computeBodyBattery(build(busyAfternoon));
const still = computeBodyBattery(build(stillAfternoon));
console.log("busy afternoon: ", JSON.stringify(busy));
console.log("still afternoon:", JSON.stringify(still));

// ── The point of the feature ─────────────────────────────────────────────────────────────────
check("a still afternoon credits rest recovery", still.restRecharge > 0, String(still.restRecharge));
check("a busy afternoon credits none", busy.restRecharge === 0, String(busy.restRecharge));
check("resting leaves you better off than not resting", still.level > busy.level, `${still.level} vs ${busy.level}`);

// ── But it must never invent energy ──────────────────────────────────────────────────────────
check("rest can never lift you above the charge you woke with",
  still.level <= still.charge0, `${still.level} vs charge0 ${still.charge0}`);
const allStill = {}; for (let h = 0; h <= 15; h++) allStill[h] = { steps: 0, kcal: 0 };
const noWorkout = computeBodyBattery({ ...build(allStill), history: {} });
check("a completely still rest day still tops out at the morning charge",
  noWorkout.level <= noWorkout.charge0, `${noWorkout.level} vs ${noWorkout.charge0}`);
check("...and the training drain is still spent even after resting",
  still.level < still.charge0, `${still.level} vs ${still.charge0}`);

// ── No health data must NOT hand out a free recharge ──────────────────────────────────────────
const noHourly = computeBodyBattery({ ...build(stillAfternoon), activityHourly: null, activityHourlyDate: null });
check("without fresh hourly data there is no recharge (can't tell rest from no data)",
  noHourly.restRecharge === 0, String(noHourly.restRecharge));
const staleHourly = computeBodyBattery({ ...build(stillAfternoon), activityHourlyDate: "2020-01-01" });
check("stale buckets from another day are ignored", staleHourly.restRecharge === 0, String(staleHourly.restRecharge));
const emptyHourly = computeBodyBattery({ ...build({}), activityHourly: {}, activityHourlyDate: TODAY });
check("an empty read is treated as no data, not as a still day", emptyHourly.restRecharge === 0, String(emptyHourly.restRecharge));

// ── The curve and the headline must agree ────────────────────────────────────────────────────
for (const [name, hourly] of [["still", stillAfternoon], ["busy", busyAfternoon]]) {
  const store = build(hourly);
  const bb = computeBodyBattery(store);
  const tl = computeBodyBatteryTimeline(store);
  const last = tl.points[tl.points.length - 1];
  console.log(`${name}: headline ${bb.level}, curve ends ${last.level}`);
  check(`the ${name} curve ends exactly on the headline number`, last.level === bb.level, `${last.level} vs ${bb.level}`);
  check(`the ${name} curve never exceeds the morning charge`,
    tl.points.filter(p => p.phase === "drain").every(p => p.level <= bb.charge0 + 0.5),
    JSON.stringify(tl.points.filter(p => p.phase === "drain" && p.level > bb.charge0 + 0.5).slice(0, 3)));
}

// The still afternoon should visibly RISE somewhere after the workout — that's the whole feature.
const tlStill = computeBodyBatteryTimeline(build(stillAfternoon)).points
  .filter(p => p.phase === "drain" && p.ts >= new RealDate(2026, 6, 22, 9, 30, 0).getTime());
const rises = tlStill.some((p, i) => i > 0 && p.level > tlStill[i-1].level);
console.log("afternoon curve:", JSON.stringify(tlStill.map(p => p.level)));
check("the curve visibly ticks UP during the still afternoon", rises, JSON.stringify(tlStill.map(p => p.level)));

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
