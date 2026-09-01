// THREE HEALTH-ENGINE GAPS THAT ALL POINTED THE SAME WAY — TOWARD FLATTERY OR TOWARD A CLIFF.
//
//  1. SPLIT ACTIVITY FRESHNESS. `store.activity` (daily totals) and `store.activityHourly`
//     (hour buckets) come from SEPARATE HealthKit reads and carry SEPARATE date stamps, and
//     readHourlyActivity returns null on its own if every dataType spelling fails. In that state
//     the headline fell back to whole-day totals and the curve charged NOTHING, so the two
//     disagreed by 14 points and the endpoint pin drew the difference across a few pixels — the
//     exact symptom rounds 4-7 of the health era kept closing, reached by a path nobody tested.
//  2. A MISSING RESTING-HR READING RAISED THE SCORE. The "unknown signal is ceilinged at typical"
//     guard was written for HRV and its sibling never got it. Measured: a complete at-baseline
//     read scored 0.80 and the same day with RHR missing scored 0.82 — and an ELEVATED resting
//     pulse (66 vs a 55 baseline) scored 0.62, so losing that one reading turned a back-off day
//     into a better-than-normal one.
//  3. THE STORED RECOVERY SNAPSHOT NEVER EXPIRED. `store.recovery` is only overwritten by a
//     SUCCESSFUL read, and `capturedAt` — written for exactly this — had zero readers, so a dead
//     or uncharged watch left last week's HRV driving today's readiness with nothing saying so.
//
// The endpoint comparison uses the SECOND-to-last curve point on purpose: the last one is pinned
// to the headline by construction, so measuring through it can only ever report agreement.
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://app.test/" });
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.localStorage = dom.window.localStorage;
let fails = 0; const check = (l, c, d) => { if (c) console.log("PASS " + l); else { fails++; console.log("FAIL " + l + (d ? " — " + d : "")); } };

// Freeze now at 18:00 so the number of elapsed waking hours is fixed. A clock-dependent fixture
// is how sim_bbgate went red overnight on code that was fine.
const D = new Date(2026, 6, 22, 18, 0, 0);
const RealDate = Date;
global.Date = class extends RealDate { constructor(...a) { if (!a.length) return new RealDate(D.getTime()); return new RealDate(...a); } static now() { return D.getTime(); } };

const mod = await import("./app.mjs");
const { computeBodyBattery, computeBodyBatteryTimeline, recoveryScoreFrom, freshRecovery } = mod;
check("0. the engine exports what this sim measures",
  [computeBodyBattery, computeBodyBatteryTimeline, recoveryScoreFrom, freshRecovery].every(f => typeof f === "function"));

const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TODAY = keyOf(D), YEST = keyOf(new RealDate(D.getTime() - 864e5));

// ── 1. THE TWO MODELS MUST AGREE WHETHER OR NOT THE HOUR BUCKETS SURVIVED ───────────────────
const hourly = {}; for (let h = 7; h < 18; h++) hourly[h] = { steps: 1200, kcal: 45 };
const baseStore = {
  unit: "lbs", history: {}, workoutDates: {}, activityPrevEvening: {},
  // No capturedAt on purpose here: section 3 owns the staleness axis, and leaving it out keeps
  // this section measuring ONLY the activity-freshness split.
  recovery: { hrv: 60, hrvBaseline: 55, restingHr: 55, rhrBaseline: 55, sleepHours: 8, recoveryScore: 0.8 },
};
const gap = (store) => {
  const bb = computeBodyBattery(store);
  const pts = computeBodyBatteryTimeline(store).points;
  const secondLast = pts[pts.length - 2];
  return { head: bb.level, second: secondLast.level, drain: bb.activityDrain, d: Math.abs(bb.level - secondLast.level) };
};
const bothFresh = gap({ ...baseStore, activity: { steps: 13000, activeKcal: 500, date: TODAY },
  activityHourly: hourly, activityHourlyDate: TODAY });
const split = gap({ ...baseStore, activity: { steps: 13000, activeKcal: 500, date: TODAY },
  activityHourly: hourly, activityHourlyDate: YEST });

// CONTROL. If this drifts the fixture is wrong, not the app — and every assertion below it is
// then meaningless. It also proves the fix cannot have touched the fresh-bucket path.
check("1a. [control] with both reads fresh the two models already agree", bothFresh.d <= 4,
  `headline=${bothFresh.head} curve=${bothFresh.second} gap=${bothFresh.d}`);
check("1b. the headline still charges the day it can see", split.drain > 0, `activityDrain=${split.drain}`);
check("1c. stale hour buckets do NOT split the headline from the curve", split.d <= 4,
  `headline=${split.head} curve=${split.second} gap=${split.d} (was 14 before the shared fallback)`);

// ── 2. LOSING A SIGNAL MUST NEVER IMPROVE THE SCORE ─────────────────────────────────────────
const atBase   = { hrv: 50, hrvBaseline: 50, restingHr: 55, rhrBaseline: 55, sleepHours: 8 };
const noRhr    = { hrv: 50, hrvBaseline: 50, restingHr: null, rhrBaseline: null, sleepHours: 8 };
const noHrv    = { hrv: null, hrvBaseline: null, restingHr: 55, rhrBaseline: 55, sleepHours: 8 };
const noHeart  = { hrv: null, hrvBaseline: null, restingHr: null, rhrBaseline: null, sleepHours: 8 };
const elevated = { hrv: 50, hrvBaseline: 50, restingHr: 66, rhrBaseline: 55, sleepHours: 8 };
const sBase = recoveryScoreFrom(atBase), sNoRhr = recoveryScoreFrom(noRhr),
      sNoHrv = recoveryScoreFrom(noHrv), sNoHeart = recoveryScoreFrom(noHeart),
      sElev = recoveryScoreFrom(elevated);
check("2a. a missing resting-HR read cannot score ABOVE a complete read", sNoRhr <= sBase,
  `complete=${sBase} missing-RHR=${sNoRhr}`);
check("2b. a missing HRV read cannot either (the guard that already existed)", sNoHrv <= sBase,
  `complete=${sBase} missing-HRV=${sNoHrv}`);
check("2c. nor can losing BOTH heart signals at once", sNoHeart <= sBase,
  `complete=${sBase} missing-both=${sNoHeart}`);
// The floor must be untouched: only the CEILING moved. A genuinely elevated resting pulse still
// has to bite, or the fix has quietly made the number stop doing its job.
check("2d. an elevated resting pulse still drags the score down hard", sElev < sBase - 0.1,
  `at-baseline=${sBase} elevated=${sElev}`);
check("2e. and losing that reading is not an upgrade over having it", sNoRhr >= sElev && sNoRhr <= sBase,
  `elevated=${sElev} missing=${sNoRhr} complete=${sBase}`);

// ── 3. A SNAPSHOT OLDER THAN THE READ WINDOW IS NOT TODAY'S READINESS ───────────────────────
const withAge = (ageH) => ({ ...baseStore,
  activity: { steps: 0, activeKcal: 0, date: TODAY }, activityHourly: {}, activityHourlyDate: TODAY,
  recovery: { hrv: 70, hrvBaseline: 50, restingHr: 48, rhrBaseline: 55, sleepHours: 9, recoveryScore: 0.95,
    capturedAt: new RealDate(D.getTime() - ageH * 36e5).toISOString() } });
const fresh12 = computeBodyBattery(withAge(12));
const old37   = computeBodyBattery(withAge(37));
const old7d   = computeBodyBattery(withAge(24 * 7));
check("3a. a 12h-old snapshot is still today's readiness", !!fresh12.hasRecovery && fresh12.charge0 > 90,
  `charge0=${fresh12.charge0} hasRecovery=${!!fresh12.hasRecovery}`);
check("3b. a 37h-old snapshot is NOT, and falls back to the honest estimate", !old37.hasRecovery,
  `charge0=${old37.charge0} hasRecovery=${!!old37.hasRecovery}`);
check("3c. neither is a week-old one", !old7d.hasRecovery, `charge0=${old7d.charge0}`);
check("3d. and the fallback is genuinely lower than the stale flattering number",
  old37.charge0 < fresh12.charge0, `stale-fallback=${old37.charge0} fresh=${fresh12.charge0}`);
// BACKWARD COMPATIBILITY. A snapshot written before capturedAt existed must NOT be binned, or
// shipping this guard blanks the number for everyone holding one. The guard tightens as new
// snapshots land rather than changing what anyone sees the day it ships.
const legacy = withAge(24 * 30); delete legacy.recovery.capturedAt;
const bbLegacy = computeBodyBattery(legacy);
check("3e. a legacy snapshot with no capturedAt is still honoured", !!bbLegacy.hasRecovery,
  `charge0=${bbLegacy.charge0}`);

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
