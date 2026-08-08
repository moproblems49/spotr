// THE NUMBER AND THE CHART MUST AGREE ABOUT WHERE YOUR DAY STARTS — AND BOTH MUST ACTUALLY USE
// THE MEASURED WINDOW.
//
// Both Body Battery models derive the start of your day from the persisted sleep window, and they
// used to validate it differently: the curve required a start AND an end, ordered, with a sane
// span; the headline accepted any `sleepEnd` inside 20h. A corrupt window therefore sent them to
// different anchors — 21 points apart, with the headline always the flattering side.
//
// ⚠ THE FIRST VERSION OF THIS FILE WAS HALF-VACUOUS AND AN AUDIT BROKE IT IN ONE LINE. Its "good"
// fixture woke at 07:00 — which is exactly the hardcoded FALLBACK estimate — so "window trusted"
// and "window ignored entirely" both produced 56, and every assertion compared 56 to 56. Making
// BOTH call sites throw the window away (`const trusted_ = null`) left the whole file green while
// night-shift users, late risers and early birds all silently got an assumed 07:00 day. Hence
// §0: the reference window wakes at 10:00 and must NOT equal the no-window answer. Never let the
// expected value of a test coincide with the value its fallback produces.
//
// Second trap, also caught: the baseline hour was 400 steps, above REST_STEPS_PER_H (250), so
// `restfulHourRecharge` returned 0 for every hour of every fixture and the headline's ordered rest
// walk was untested. It is 120 steps now — the same bug CLAUDE.md records against sim_stepscale.
import { computeBodyBattery, computeBodyBatteryTimeline, trustedSleepWindow } from "./app.mjs";

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const RealDate = Date;
const D = (h, m = 0, off = 0) => new RealDate(2026, 6, 22 - off, h, m, 0);
const kd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const at = (now, fn) => { global.Date = class extends RealDate { constructor(...a) { if (!a.length) return new RealDate(now.getTime()); return new RealDate(...a); } static now() { return now.getTime(); } }; const r = fn(); global.Date = RealDate; return r; };

// THE BACKGROUND VALUE HAS TO CLEAR THREE BARS AT ONCE, and getting it wrong silently disables
// whatever the file is testing:
//   • below REST_STEPS_PER_H (250) — or restfulHourRecharge returns 0 everywhere and the
//     headline's ordered rest walk goes untested (the sim_stepscale §4b bug);
//   • below AWAKE_STEPS_PER_H (120) — or earliestActiveHourToday drags the ESTIMATED anchor to
//     hour 0 and the fallback stops being the fallback;
//   • not so quiet that every hour is restful, because rest recharge is capped at charge0 and a
//     wholly restful day pins BOTH models to that ceiling — which made a trusted 10:00 wake and
//     no window at all both print 91 and hid the very difference §0 exists to detect.
// Hence a quiet 60-step baseline plus a real active block at 08:00-09:00, early enough to sit
// INSIDE the estimated window (from 07:00) and OUTSIDE the reference measured one (from 10:00).
const baseHours = (upto = 23) => {
  const h = {};
  for (let x = 0; x <= 23 && x <= upto; x++) h[x] = { steps: 60, kcal: 8 };
  for (let x = 8; x <= 9 && x <= upto; x++) h[x] = { steps: 3000, kcal: 170 };
  return h;
};
const mk = (recovery, hours = baseHours()) => {
  let steps = 0, kcal = 0;
  for (const v of Object.values(hours)) { steps += v.steps; kcal += v.kcal; }
  return { history: {}, activity: { date: kd(D(0)), steps, activeKcal: kcal },
    activityHourly: hours, activityHourlyDate: kd(D(0)), recovery };
};
const read = (recovery, now = D(20, 30), hours = baseHours(now.getHours())) => at(now, () => {
  const s = mk(recovery, hours);
  const bb = computeBodyBattery(s);
  const tl = computeBodyBatteryTimeline(s);
  const pts = tl?.points || [];
  return { bb, prev: pts[pts.length - 2], wakeH: tl ? new RealDate(tl.wakeTimeMs).getHours() : null };
});

// A trusted window that wakes at 10:00 — deliberately NOT the 07:00 fallback.
const GOOD = { recoveryScore: 0.8, sleepHours: 7.5, sleepStart: D(2).toISOString(), sleepEnd: D(10).toISOString() };
const NOWINDOW = { recoveryScore: 0.8, sleepHours: 7.5 };
// Strip ONLY the window. charge0 is driven by sleepHours, so "what would this store do with no
// window" has to hold every other field fixed — two of these checks failed on the first run purely
// because the reference reported a different amount of sleep.
const noWindowFor = (rec) => { const { sleepStart, sleepEnd, ...rest } = rec; return rest; };

// ── 0. THE TEST MUST BE ABLE TO TELL "USED" FROM "IGNORED" ───────────────────────────────────
// Read at 11:30, NOT the 20:30 the rest of the file uses. Rest recharge is capped at charge0, so
// by evening a mostly-quiet day has refilled to that ceiling from either anchor and both print 91
// — the difference is real but has been erased by the time you look. Late morning, the estimated
// 07:00 anchor still carries the 08:00-09:00 activity block and the measured 10:00 one does not.
const REF_AT = D(11, 30);
const ref = read(GOOD, REF_AT);
const none = read(NOWINDOW, REF_AT);
console.log(`  at 11:30 — trusted window waking 10:00 -> ${ref.bb.level} (anchor ${ref.wakeH}:00);  no window at all -> ${none.bb.level} (anchor ${none.wakeH}:00)`);
check("a measured window produces a DIFFERENT answer than no window",
  ref.bb.level !== none.bb.level, `both ${ref.bb.level} — this file cannot detect an ignored window`);
check("...and the anchor is the measured wake, not the 07:00 guess", ref.wakeH === 10, `${ref.wakeH}:00`);
// Direction matters too: the measured window starts the day AFTER the morning activity block, so
// trusting it must read HIGHER. An equal-but-different pair would satisfy the check above.
check("...and trusting it excludes the pre-wake activity", ref.bb.level > none.bb.level,
  `trusted ${ref.bb.level} vs estimate ${none.bb.level}`);
check("a trusted window agrees with its own chart", Math.abs(ref.prev.level - ref.bb.level) <= 1,
  `${ref.bb.level} vs ${ref.prev.level}`);

// ── 1. Corrupt windows: rejected by BOTH, landing on the estimate ────────────────────────────
{
  const BAD = [
    ["merged nap 02:00 -> 14:00 claiming 7.5h", { ...GOOD, sleepEnd: D(14).toISOString() }],
    ["the classic merge: 07:00 -> 20:00", { recoveryScore: 0.8, sleepHours: 9, sleepStart: D(7).toISOString(), sleepEnd: D(20).toISOString() }],
    ["an end with no start", { recoveryScore: 0.8, sleepHours: 7.5, sleepEnd: D(14).toISOString() }],
    ["end BEFORE start", { ...GOOD, sleepStart: D(14).toISOString(), sleepEnd: D(12).toISOString() }],
    ["a 20-hour 'night'", { ...GOOD, sleepStart: D(15, 0, 1).toISOString(), sleepEnd: D(11).toISOString() }],
    ["a window ending in the FUTURE", { ...GOOD, sleepEnd: D(23, 30).toISOString() }],
    // The old `if (sleepH && …)` skipped the cross-check entirely on a falsy value, so a 14-hour
    // window with sleepHours 0 anchored the whole day. The span ceiling catches it now.
    ["14h window with sleepHours 0", { recoveryScore: 0.8, sleepHours: 0, sleepStart: D(23, 0, 1).toISOString(), sleepEnd: D(13).toISOString() }],
    ["14h window with no sleepHours", { recoveryScore: 0.8, sleepStart: D(23, 0, 1).toISOString(), sleepEnd: D(13).toISOString() }],
  ];
  let worst = 0, worstLabel = "";
  console.log("corrupt windows — both models must fall back to the estimate:");
  for (const [label, rec] of BAD) {
    const r = read(rec);
    const gap = Math.abs(r.prev.level - r.bb.level);
    console.log(`  ${label.padEnd(40)} headline ${String(r.bb.level).padStart(3)}  chart ${String(r.prev.level).padStart(3)}  anchor ${r.wakeH}:00`);
    if (gap > worst) { worst = gap; worstLabel = label; }
    const asIfNone = read(noWindowFor(rec));
    check(`  ...${label}: falls back to the estimate`, r.bb.level === asIfNone.bb.level,
      `${r.bb.level} vs same-store-without-window ${asIfNone.bb.level}`);
  }
  check("no corrupt window makes the number and the chart disagree", worst <= 1, `${worst} on ${worstLabel}`);
}

// ── 2. A BROKEN NIGHT IS NOT A CORRUPT WINDOW ────────────────────────────────────────────────
// The span rule cannot tell a merged window from fragmented sleep, so it has to be generous. At
// +3 it threw away genuinely measured windows. The damage lands on people whose real wake is far
// from 07:00: a day sleeper in bed 08:00-17:00 who actually slept 5.7h lost a correct 17:00 wake,
// was charged 8 points of drain she hadn't earned, and — worse for a fix whose whole purpose was
// agreement — picked up a 5-9 point headline-vs-chart gap, because the two models' FALLBACK
// anchors disagree with each other.
{
  const FRAGMENTED = [
    ["poor night, 2h awake in 8h", 8, 6.0, 22, 6],
    ["bad night, 3.3h awake in 10h", 10, 6.7, 22, 8],
    ["new parent, 3.7h awake in 10h", 10, 6.3, 22, 8],
    ["insomnia, 3.7h awake in 11h", 11, 7.3, 21, 8],
    ["day sleeper, 3.3h awake in 9h", 9, 5.7, 8, 17],
  ];
  for (const [label, spanH, sleepH, startH, endH] of FRAGMENTED) {
    const start = startH > endH ? D(startH, 0, 1) : D(startH);
    const rec = { recoveryScore: 0.8, sleepHours: sleepH, sleepStart: start.toISOString(), sleepEnd: D(endH).toISOString() };
    const w = at(D(20, 30), () => trustedSleepWindow(mk(rec), D(20, 30)));
    const r = read(rec);
    console.log(`  ${label.padEnd(32)} span ${String(spanH).padStart(2)}h / ${sleepH}h asleep -> ${w ? "trusted" : "REJECTED"}, anchor ${r.wakeH}:00, gap ${Math.abs(r.prev.level - r.bb.level)}`);
    check(`  ...${label} keeps its measured window`, !!w, "rejected");
    check(`  ...and its anchor is the real wake (${endH}:00)`, r.wakeH === endH, `${r.wakeH}:00`);
    check(`  ...and the two models still agree`, Math.abs(r.prev.level - r.bb.level) <= 1,
      String(Math.abs(r.prev.level - r.bb.level)));
  }
}

// ── 3. THE FIRST HOUR AFTER WAKING ───────────────────────────────────────────────────────────
// `activityRawSinceWake` returned null when no bucket had yet landed inside [wake, now], and the
// headline's null-fallback is the WHOLE-DAY total — which charges everything you did before you
// went to sleep. A night-shift nurse on her feet 00:00-08:00 and asleep 09:00-16:00 read 72
// against a chart of 89 one minute after waking, healing itself on the next hour boundary. An
// empty window is ZERO, not unknown.
{
  const rec = { recoveryScore: 0.75, sleepHours: 6.5, sleepStart: D(9).toISOString(), sleepEnd: D(16).toISOString() };
  const shiftHours = (nowH) => {
    const h = {};
    for (let x = 0; x <= 7 && x <= nowH; x++) h[x] = { steps: 1900, kcal: 95 };
    for (let x = 17; x <= 22 && x <= nowH; x++) h[x] = { steps: 300, kcal: 18 };
    return h;
  };
  let worst = 0, when = "";
  for (const [h, m] of [[16, 5], [16, 20], [16, 50], [17, 20], [18, 30], [20, 30]]) {
    const r = read(rec, D(h, m), shiftHours(h));
    const gap = Math.abs(r.prev.level - r.bb.level);
    console.log(`  ${String(h).padStart(2)}:${String(m).padStart(2, "0")} after a 16:00 wake -> headline ${r.bb.level}, chart ${r.prev.level}, gap ${gap}`);
    if (gap > worst) { worst = gap; when = `${h}:${m}`; }
  }
  check("the hour right after waking does not charge you for yesterday's shift", worst <= 1,
    `${worst} at ${when}`);
}

// ── 4. The helper's own edges ────────────────────────────────────────────────────────────────
{
  const t = (rec, now = D(20, 30)) => at(now, () => trustedSleepWindow(mk(rec), now));
  check("a good window is returned, with the right end", t(GOOD)?.end.getHours() === 10);
  check("a missing recovery object is safe", at(D(20), () => trustedSleepWindow({}, D(20))) === null);
  check("a null store is safe", at(D(20), () => trustedSleepWindow(null, D(20))) === null);
  check("garbage date strings are rejected", t({ ...GOOD, sleepStart: "nope", sleepEnd: "also-nope" }) === null);
  check("a window older than 20h is rejected",
    t({ ...GOOD, sleepStart: D(2, 0, 1).toISOString(), sleepEnd: D(10, 0, 1).toISOString() }) === null);
  check("a daytime night-shift sleep is still trusted",
    !!t({ recoveryScore: 0.8, sleepHours: 6.5, sleepStart: D(9).toISOString(), sleepEnd: D(16).toISOString() }));
  // `sleepH + 3` CONCATENATED when sleepHours was a string: 13 > "93" is false, so a merged window
  // sailed through with "9" while "6.5" was rejected — arbitrary rather than graceful.
  const merged = (sh) => ({ recoveryScore: 0.8, sleepHours: sh, sleepStart: D(23, 0, 1).toISOString(), sleepEnd: D(12).toISOString() });
  check("a string sleepHours is coerced, not concatenated", t(merged("9")) === null, "trusted with '9'");
  check("...and the numeric form agrees with it", t(merged(9)) === null);
  check("NaN sleepHours does not trust a 13h window", t(merged(NaN)) === null);
}

// ── 5. Across the clock — comparing the two models at the SAME INSTANT ───────────────────────
// The trust test compares against `now` twice, and the anchor logic branches on now-vs-07:00, so
// this has to be swept. Two things the previous version got wrong:
//   • it asserted only that the level was finite and within 5..100, which the app already clamps
//     — tautological except for NaN;
//   • the first attempt at a real comparison put the chart's second-to-last point against the
//     headline at `now`, which are ONE HOUR APART. It reported a 5-point gap at 08:40 for every
//     fixture including the no-window one, i.e. it was measuring the hour between them, not a
//     disagreement. That hour is honest drain.
// The sound comparison — the same one sim_stepscale §4b uses — is the second-to-last point (which
// the endpoint pin never rewrites) against the headline evaluated at THAT POINT'S timestamp.
{
  let bad = 0, worst = 0, when = "";
  for (const [label, rec] of [["trusted", GOOD], ["no window", NOWINDOW], ["corrupt", { ...GOOD, sleepEnd: D(14).toISOString() }]]) {
    for (let h = 1; h <= 23; h++) {
      // ELAPSED-ONLY buckets, and the SAME store on both sides. A bucket for the in-progress hour
      // holds a whole hour of steps at h:00, which hands the headline activity nobody has done
      // yet — that alone reported a 4-point gap that was purely the fixture's.
      const hours = baseHours(h - 1);
      const r = read(rec, D(h, 40), hours);
      if (!Number.isInteger(r.bb.level)) { bad++; console.log(`  ${label} ${h}:40 -> ${r.bb.level}`); continue; }
      if (!r.prev || r.prev.phase === "recharge") continue;
      const atPrev = new RealDate(r.prev.ts);
      const gap = Math.abs(r.prev.level - read(rec, atPrev, hours).bb.level);
      if (gap > worst) { worst = gap; when = `${label} at ${atPrev.getHours()}:00`; }
    }
  }
  check("every figure stays a whole number at every hour", bad === 0, `${bad}`);
  check("...and the number tracks the chart at every hour", worst <= 2, `${worst} — ${when}`);
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
