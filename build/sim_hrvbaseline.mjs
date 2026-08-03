// WHAT FEEDS THE RECOVERY SCORE, part 2 — the HRV window, the baseline, and the confidence cap.
//
// sim_healthinputs covers the four INPUT bugs (read cap, resting-HR sampling, illness recency,
// stale sleep) by pinning source lines. This one exercises the actual maths, because the three
// decisions below were extracted into pure functions precisely so they could be run:
//
//   1. A BASELINE THAT CONTAINS THE NIGHT IT IS SCORING. `hrvBaseline` was the median of every
//      raw sample in 60 days, which on the first night with a watch IS that night — ratio exactly
//      1.000 whatever happened, so a wrecked first night read "Moderate" instead of the floor.
//      It also weighted nights by SAMPLE COUNT, so a full 60-row night outvoted six sparse ones.
//   2. THE 22:00 CLIFF. With no HealthKit sleep rows, the fallback kept "everything within 14h of
//      the newest sample" out of a pool that starts at 22:00 — so an evening reading became
//      newest and 14h back no longer reached last night. Measured against 90927ed on the exact
//      fixture below: the whole night is discarded in favour of two sofa samples, 75% -> 88%.
//   3. WATCH OFF OVERNIGHT -> daytime HRV compared against an overnight baseline, reported as a
//      collapse. And a 36h lookback that still reaches the night BEFORE last, so skipping one
//      night resurrected a two-day-old reading as this morning's.
//   4. ONE 0.25-WEIGHT SIGNAL SCORING 100%. Renormalising over present weights is right, but it
//      means sleep duration alone — a phone with no watch — produced "Ready to push".
//
// EVERY CHECK BELOW WAS RUN AGAINST 90927ed FIRST, on these exact fixtures, by bundling the old
// App.jsx and transcribing the four decisions that lived inline in readRecovery (which needs a
// device). What the shipped code did:
//   day-one wrecked 18ms night   hrv 18 / baseline 18, ratio 1.000 -> 58% "Moderate"
//   6 nights at 55 + 1 loud one  raw-sample median 31 vs median-of-nights 54
//   the 22:00 cliff              kept 2 sofa samples, discarded all 24 of the night, 75% -> 88%
//   watch on the charger         daytime 38 vs overnight baseline 55 -> 38% (worn: 75%)
//   skipped a night              yesterday morning's 55 reported at 14:00 as this morning's
//   sleep 8.5h alone             100%.  resting HR alone: 100%
import { pinToLastNight, personalBaseline, hrvReading, recoveryScoreFrom } from "./app.mjs";

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const H = 36e5;
const at = (dayOff, h, m = 0) => new Date(2026, 6, 22 - dayOff, h, m, 0).getTime();
// A night's worth of samples: bed 23:00 (dayOff+1) to wake 07:00 (dayOff), one every 20 minutes.
const night = (dayOff, v, n = 24) =>
  Array.from({ length: n }, (_, i) => ({ v: v + (i % 3) - 1, t: at(dayOff + 1, 23) + i * 20 * 60000 }));

// ── 1. The baseline must exclude the night being scored ──────────────────────────────────────
{
  // Day one with a watch: last night is the ONLY night on record, and it was terrible (18ms for
  // someone whose real normal is ~55). Old behaviour: baseline = median(that night) = 18, ratio
  // 1.000, "you're fine". There is no honest baseline here, so there must be no HRV reading.
  const lastNight = night(0, 18);
  const r = hrvReading(lastNight, lastNight, null, null, at(0, 9));
  check("day one: a wrecked first night can't score itself as normal", r.baseline == null,
    `baseline ${r.baseline}`);
  check("...so the score falls back to the other signals", recoveryScoreFrom({ hrv: r.hrv, hrvBaseline: r.baseline, sleepHours: 5 }) != null);

  // With history, the scored night must not be able to drag its own baseline toward itself.
  const hist = [];
  for (let d = 1; d <= 20; d++) hist.push(...night(d, 55));
  const wrecked = night(0, 18);
  const r2 = hrvReading(wrecked, [...hist, ...wrecked], null, null, at(0, 9));
  check("a wrecked night is compared against the 20 good ones, not itself",
    r2.baseline != null && Math.abs(r2.baseline - 55) <= 1, `baseline ${r2.baseline}`);
  check("...and it reads as wrecked", r2.hrv != null && r2.hrv / r2.baseline < 0.45,
    `hrv ${r2.hrv} / ${r2.baseline}`);
  const s = recoveryScoreFrom({ hrv: r2.hrv, hrvBaseline: r2.baseline, restingHr: 52, rhrBaseline: 51, sleepHours: 5 });
  check("...and the score says so", s < 0.4, String(s));
}

// ── 1b. Every night gets ONE vote, regardless of how many rows it wrote ──────────────────────
{
  // Six ordinary nights at 55ms, plus one night the watch was in a "high-frequency" mood and
  // wrote 200 rows at 30ms. A raw-sample median is 30 (200 rows outvote 6×24=144); a median of
  // per-night medians is 55, which is what "your normal" means.
  const hist = [];
  for (let d = 2; d <= 7; d++) hist.push(...night(d, 55));
  hist.push(...night(8, 30, 200));
  const raw = [...hist].map(s => s.v).sort((a, b) => a - b);
  const rawMedian = raw[Math.floor(raw.length / 2)];
  const b = personalBaseline(hist, null, true);
  console.log(`  raw-sample median ${rawMedian} vs median-of-nights ${b.value} over ${b.periods} nights`);
  check("one loud night cannot redefine the baseline", Math.abs(b.value - 55) <= 1, `got ${b.value}`);
  check("...and the old raw-sample median really did differ", Math.abs(rawMedian - b.value) > 10,
    `raw ${rawMedian}`);
  check("nights are counted as nights, not rows", b.periods === 7, `${b.periods}`);
  // The night key must span midnight — 23:00 and 03:00 are one night, not two.
  const spanning = personalBaseline([{ v: 50, t: at(1, 23) }, { v: 50, t: at(0, 3) }], null, true);
  check("a night that crosses midnight counts once", spanning.periods === 1, `${spanning.periods}`);
}

// ── 2. The 22:00 cliff ───────────────────────────────────────────────────────────────────────
{
  // No HealthKit sleep rows at all (phone-only, or a watch that writes no sleep). Last night was
  // a normal 55ms night; this evening there are two readings on the sofa at 22:15 and 22:40 which
  // the overnight hour-rule (>=22:00) sweeps into the same pool.
  const hist = [];
  for (let d = 1; d <= 20; d++) hist.push(...night(d, 55));
  const lastNight = night(0, 55);
  const evening = [{ v: 84, t: at(0, 22, 15) }, { v: 86, t: at(0, 22, 40) }];

  const before = hrvReading(lastNight, [...hist, ...lastNight], null, null, at(0, 21));
  const after = hrvReading([...lastNight, ...evening], [...hist, ...lastNight], null, null, at(0, 22, 45));
  const sc = (r) => recoveryScoreFrom({ hrv: r.hrv, hrvBaseline: r.baseline, restingHr: 51, rhrBaseline: 51, sleepHours: 7.5 });
  console.log(`  21:00 hrv ${before.hrv} -> ${Math.round(sc(before) * 100)}%   22:45 hrv ${after.hrv} -> ${Math.round(sc(after) * 100)}%`);
  check("the reading does not jump when the clock passes 22:00", before.hrv === after.hrv,
    `${before.hrv} -> ${after.hrv}`);
  check("...and neither does the score", Math.abs(sc(before) - sc(after)) < 0.02,
    `${sc(before)} -> ${sc(after)}`);

  // The mechanism, isolated: pinToLastNight must pick last night's block, not two sofa readings.
  const pinned = pinToLastNight([...lastNight, ...evening], null, null);
  check("pinToLastNight keeps the night, not the evening", !pinned.some(s => s.v > 80),
    `kept ${pinned.length}, max ${Math.max(...pinned.map(s => s.v))}`);
  check("...and keeps all of it", pinned.length === lastNight.length, `${pinned.length}`);

  // Once tonight genuinely IS a night — asleep two hours — it should win. That is new information,
  // not a cliff, and refusing to update would be the opposite bug.
  const tonight = Array.from({ length: 7 }, (_, i) => ({ v: 40, t: at(0, 23) + i * 20 * 60000 }));
  const pinned2 = pinToLastNight([...lastNight, ...evening, ...tonight], null, null);
  // The two sofa readings are only 20 minutes before the first in-bed one, so they land in the
  // same contiguous block — which is right, that is one continuous stretch of settling into bed.
  // What matters is that LAST night is gone and tonight dominates.
  check("a real in-progress night does take over", !pinned2.some(s => s.v > 50 && s.v < 60),
    `${pinned2.length} samples, values ${[...new Set(pinned2.map(s => s.v))].join(",")}`);
  const pv = pinned2.map(s => s.v).sort((a, b) => a - b);
  check("...and it is what the median sees", pv[Math.floor(pv.length / 2)] === 40, `median ${pv[Math.floor(pv.length / 2)]}`);
}

// ── 3a. Watch off overnight: no reading, not a fake collapse ─────────────────────────────────
{
  const hist = [];
  for (let d = 1; d <= 20; d++) hist.push(...night(d, 55));
  // Today: charger overnight, so only daytime readings — genuinely lower, ~38ms, for reasons that
  // have nothing to do with recovery.
  const daytimeOnly = Array.from({ length: 6 }, (_, i) => ({ v: 38, t: at(0, 11) + i * H }));
  const r = hrvReading(daytimeOnly, hist, null, null, at(0, 18));
  check("a day with no overnight HRV reports no HRV", r.hrv == null, `hrv ${r.hrv}`);
  check("...and says why", r.nightBaselineOnly === true);
  const s = recoveryScoreFrom({ hrv: r.hrv, hrvBaseline: r.baseline, restingHr: 51, rhrBaseline: 51, sleepHours: 7.5 });
  const withHrv = recoveryScoreFrom({ hrv: 55, hrvBaseline: 55, restingHr: 51, rhrBaseline: 51, sleepHours: 7.5 });
  console.log(`  watch on charger: ${Math.round(s * 100)}% (a normal night with the watch on reads ${Math.round(withHrv * 100)}%)`);
  check("...so the score barely moves instead of collapsing", Math.abs(s - withHrv) < 0.12,
    `${s} vs ${withHrv}`);
  // The old behaviour, replicated: daytime 38 against the overnight baseline 55.
  const oldRatio = 38 / 55;
  const oldScore = recoveryScoreFrom({ hrv: 38, hrvBaseline: 55, restingHr: 51, rhrBaseline: 51, sleepHours: 7.5 });
  check("...and the old comparison really was a collapse", oldScore < s - 0.2,
    `old ${oldScore} (ratio ${oldRatio.toFixed(2)}) vs new ${s}`);
}

// ── 3b. Someone who never wears it overnight still gets a score ──────────────────────────────
{
  // No overnight samples anywhere — today or in 60 days. Comparing daytime to daytime is
  // consistent, so this user must keep their HRV reading.
  const day = (dayOff, v) => Array.from({ length: 6 }, (_, i) => ({ v, t: at(dayOff, 11) + i * H }));
  const hist = []; for (let d = 1; d <= 20; d++) hist.push(...day(d, 40));
  const today = day(0, 40);
  const r = hrvReading(today, [...hist, ...today], null, null, at(0, 18));
  check("a daytime-only user is scored daytime vs daytime", r.hrv != null && r.baseline != null,
    `hrv ${r.hrv} baseline ${r.baseline}`);
  check("...at their own normal", Math.abs(r.hrv / r.baseline - 1) < 0.05, `${r.hrv}/${r.baseline}`);
}

// ── 3c. Skipping one night must not resurrect the night before ───────────────────────────────
{
  const hist = []; for (let d = 2; d <= 20; d++) hist.push(...night(d, 55));
  const nightBefore = night(1, 55);              // worn: ends 07:00 yesterday
  // Last night: not worn. At 14:00 today the 36h window still reaches 02:00 yesterday, so the
  // overnight filter is non-empty purely from the night before last.
  const r = hrvReading(nightBefore, [...hist, ...nightBefore], null, null, at(0, 14));
  check("a two-day-old night is not reported as this morning's", r.hrv == null, `hrv ${r.hrv}`);
  check("...and it is flagged as stale, not as absent data", r.stale === true);
  // ...but this morning's own reading, looked at late in the evening, must survive.
  const lastNight = night(0, 55);
  const late = hrvReading(lastNight, [...hist, ...lastNight], null, null, at(0, 23, 30));
  check("last night still counts at 23:30", late.hrv != null && late.stale === false, `hrv ${late.hrv}`);
}

// ── 3d. The staleness rule must hold at every hour, not just the two I picked ────────────────
// The class of bug that has taken two sims red overnight on correct code (sim_bbgate, and the
// first cut of the sleep cutoff in sim_healthinputs). Woke at 07:00; the reading must survive all
// day and the day before's must be rejected all day.
{
  const hist = []; for (let d = 2; d <= 20; d++) hist.push(...night(d, 55));
  let bad = 0;
  for (let h = 7; h <= 23; h++) {
    const fresh = hrvReading(night(0, 55), hist, null, null, at(0, h, 30));
    const stale = hrvReading(night(1, 55), hist, null, null, at(0, h, 30));
    if (fresh.hrv == null) { bad++; console.log(`  hour ${h}: this morning's reading WRONGLY dropped`); }
    if (stale.hrv != null) { bad++; console.log(`  hour ${h}: yesterday's reading wrongly KEPT`); }
  }
  check("the HRV staleness rule is right at every hour from 07:00 to 23:00", bad === 0, `${bad} wrong`);
}

// ── 4. One quarter-weight signal cannot read as "Ready to push" ──────────────────────────────
{
  const verdict = t => t >= 78 ? "Ready to push" : t >= 62 ? "Ready" : t >= 45 ? "Moderate" : "Take it easy";
  const sleepOnly = recoveryScoreFrom({ sleepHours: 8.5 });
  console.log(`  sleep 8.5h and nothing else: ${Math.round(sleepOnly * 100)}% — ${verdict(Math.round(sleepOnly * 100))}`);
  check("eight hours in bed alone is not 100%", sleepOnly <= 0.75, String(sleepOnly));
  check("...and does not claim \"Ready to push\" off one signal",
    verdict(Math.round(sleepOnly * 100)) !== "Ready to push", verdict(Math.round(sleepOnly * 100)));
  check("...and it is not stated more confidently than a full read",
    sleepOnly < recoveryScoreFrom({ hrv: 60, hrvBaseline: 50, restingHr: 46, rhrBaseline: 51, sleepHours: 8.5 }));
  // The cap must only bite at the TOP. A bad night on the same thin data still has to read badly.
  const badSleepOnly = recoveryScoreFrom({ sleepHours: 4 });
  check("a 4h night on the same thin data still reads badly", badSleepOnly < 0.2, String(badSleepOnly));
  // Resting HR alone is the same weight and the same problem.
  check("resting HR alone is capped too", recoveryScoreFrom({ restingHr: 40, rhrBaseline: 51 }) <= 0.75);
  // Two signals together are enough to earn the top of the range.
  const full = recoveryScoreFrom({ hrv: 66, hrvBaseline: 55, restingHr: 47, rhrBaseline: 51, sleepHours: 8.5 });
  check("a full read can still say Ready to push", full > 0.9, String(full));
  check("no signal at all returns null, not zero", recoveryScoreFrom({}) === null);
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
