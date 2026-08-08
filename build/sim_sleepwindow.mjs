// THE NUMBER AND THE CHART MUST AGREE ABOUT WHERE YOUR DAY STARTS.
//
// Both Body Battery models decide that from the persisted sleep window, and they used to decide
// it DIFFERENTLY. The 24h curve ran a full trust test — a start AND an end, correctly ordered, a
// span under 16h, and a span no more than 3h longer than the sleep it claims to contain. The
// headline accepted any `sleepEnd` inside the last 20 hours: no start, no ordering, no span
// sanity. So a corrupt window sent them to different anchors and they described different days.
//
// Measured on one store (heavy activity 08:00-10:00, read 20:30), before the fix:
//
//   window 23:00 -> 11:00 claiming 7.5h sleep    headline 77, chart 56    gap 21
//   sleepEnd present with no sleepStart           headline 77, chart 56    gap 21
//   sleepEnd BEFORE sleepStart                    headline 62, chart 56    gap  6
//
// The headline was the FLATTERING side every time — it believed a late wake, so it both charged
// fewer awake hours and pushed the morning's activity outside its window. Note that "they agree"
// is necessary but not sufficient here: they must agree on the CURVE's answer, because the curve's
// checks are the correct ones. A test that only compared the two could be satisfied by breaking
// the curve instead, so the absolute values are pinned as well.
//
// Bad windows are not hypothetical: before pickSleepBlock existed, an evening nap merged with last
// night could persist as "7am -> 8pm", and a persisted window keeps driving both models until the
// next HealthKit sync overwrites it.
import { computeBodyBattery, computeBodyBatteryTimeline, trustedSleepWindow } from "./app.mjs";

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const RealDate = Date;
const D = (h, m = 0, off = 0) => new RealDate(2026, 6, 22 - off, h, m, 0);
const kd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const at = (now, fn) => { global.Date = class extends RealDate { constructor(...a) { if (!a.length) return new RealDate(now.getTime()); return new RealDate(...a); } static now() { return now.getTime(); } }; const r = fn(); global.Date = RealDate; return r; };

const hours = {};
for (let h = 7; h <= 20; h++) hours[h] = { steps: 400, kcal: 25 };
for (let h = 8; h <= 10; h++) hours[h] = { steps: 11000, kcal: 600 };   // a hard morning
let steps = 0, kcal = 0;
for (const v of Object.values(hours)) { steps += v.steps; kcal += v.kcal; }
const mk = (recovery) => ({ history: {}, activity: { date: kd(D(0)), steps, activeKcal: kcal },
  activityHourly: hours, activityHourlyDate: kd(D(0)), recovery });
const read = (recovery, now = D(20, 30)) => at(now, () => {
  const s = mk(recovery);
  const bb = computeBodyBattery(s);
  const pts = computeBodyBatteryTimeline(s)?.points || [];
  return { bb, prev: pts[pts.length - 2] };
});

const GOOD = { recoveryScore: 0.8, sleepHours: 7.5, sleepStart: D(23, 0, 1).toISOString(), sleepEnd: D(7).toISOString() };

// ── 1. A good window is the reference, and must not move ─────────────────────────────────────
const ref = read(GOOD);
console.log(`  trusted window 23:00->07:00: headline ${ref.bb.level}, chart ${ref.prev.level}`);
check("a plausible window agrees with itself", Math.abs(ref.prev.level - ref.bb.level) <= 1,
  `${ref.bb.level} vs ${ref.prev.level}`);

// ── 2. Every corrupt shape must be REJECTED BY BOTH, landing on the estimate ─────────────────
{
  const BAD = [
    ["merged nap: 23:00 -> 11:00 claiming 7.5h", { ...GOOD, sleepEnd: D(11).toISOString() }],
    ["an end with no start", { recoveryScore: 0.8, sleepHours: 7.5, sleepEnd: D(11).toISOString() }],
    ["a start with no end", { recoveryScore: 0.8, sleepHours: 7.5, sleepStart: D(23, 0, 1).toISOString() }],
    ["end BEFORE start", { ...GOOD, sleepStart: D(11).toISOString(), sleepEnd: D(9).toISOString() }],
    ["a 20-hour 'night'", { ...GOOD, sleepStart: D(15, 0, 1).toISOString(), sleepEnd: D(11).toISOString() }],
    ["a window ending in the FUTURE", { ...GOOD, sleepEnd: D(23, 30).toISOString() }],
  ];
  let worst = 0, worstLabel = "";
  console.log("corrupt windows — the number and the chart must still tell the same story:");
  for (const [label, rec] of BAD) {
    const r = read(rec);
    const gap = Math.abs(r.prev.level - r.bb.level);
    console.log(`  ${label.padEnd(42)} headline ${String(r.bb.level).padStart(3)}  chart ${String(r.prev.level).padStart(3)}  gap ${gap}`);
    if (gap > worst) { worst = gap; worstLabel = label; }
    // ...and BOTH must land on the estimate, i.e. the same answer a store with no window at all
    // gives. This is the half that stops the test being satisfiable by breaking the curve.
    check(`  ...and "${label}" falls back to the estimate, not to a corrupt anchor`,
      r.bb.level === ref.bb.level, `${r.bb.level} vs reference ${ref.bb.level}`);
  }
  check("no corrupt window makes the number and the chart disagree", worst <= 1, `${worst} on ${worstLabel}`);
}

// ── 3. The helper itself ─────────────────────────────────────────────────────────────────────
{
  const t = (rec, now = D(20, 30)) => at(now, () => trustedSleepWindow(mk(rec), now));
  check("a good window is returned", !!t(GOOD));
  check("...with the right end", t(GOOD).end.getHours() === 7);
  check("a missing recovery object is safe", at(D(20), () => trustedSleepWindow({}, D(20))) === null);
  check("a null store is safe", at(D(20), () => trustedSleepWindow(null, D(20))) === null);
  check("garbage date strings are rejected",
    t({ ...GOOD, sleepStart: "not-a-date", sleepEnd: "also-not" }) === null);
  // STALENESS: a window from two nights ago must not anchor today.
  check("a window older than 20h is rejected",
    t({ ...GOOD, sleepStart: D(23, 0, 2).toISOString(), sleepEnd: D(7, 0, 1).toISOString() }) === null);
  // ...but a genuine night-shift block in the daytime is legitimate and must survive.
  check("a daytime night-shift sleep is still trusted",
    !!t({ recoveryScore: 0.8, sleepHours: 7, sleepStart: D(9).toISOString(), sleepEnd: D(16).toISOString() },
      D(20, 30)));
  // The span rule is the merged-nap catcher: 8h of window around 7.5h of sleep is fine.
  check("an 8h window around 7.5h of sleep is fine",
    !!t({ ...GOOD, sleepStart: D(23, 0, 1).toISOString(), sleepEnd: D(7).toISOString() }));
  check("...but 12h around 7.5h is not",
    t({ ...GOOD, sleepStart: D(23, 0, 1).toISOString(), sleepEnd: D(11).toISOString() }) === null);
  // No reported sleepHours = nothing to cross-check against; length alone must still gate.
  check("with no sleepHours, a sane span is still trusted",
    !!t({ recoveryScore: 0.8, sleepStart: D(23, 0, 1).toISOString(), sleepEnd: D(7).toISOString() }));
}

// ── 4. Across the clock ──────────────────────────────────────────────────────────────────────
// The trust test compares against `now` twice (not in the future, not older than 20h), so it has
// to be swept rather than spot-checked.
{
  let bad = 0;
  for (let h = 0; h <= 23; h++) {
    const r = read({ ...GOOD, sleepEnd: D(11).toISOString() }, D(h, 40));
    if (!Number.isFinite(r.bb.level) || r.bb.level < 5 || r.bb.level > 100) {
      bad++; console.log(`  ${h}:40 -> ${r.bb.level}`);
    }
  }
  check("a corrupt window never produces a nonsense number, at any hour", bad === 0, `${bad} hour(s)`);
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
