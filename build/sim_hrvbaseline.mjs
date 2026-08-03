// WHAT FEEDS THE RECOVERY SCORE, part 2 — the HRV window, the baseline, and the confidence ceiling.
//
// sim_healthinputs covers the four INPUT bugs (read cap, resting-HR sampling, illness recency,
// stale sleep) by pinning source lines. This one runs the maths, because the decisions below were
// extracted into pure functions precisely so they could be run.
//
// TWO ROUNDS OF BUGS ARE PINNED HERE, and the second round is the more instructive one because
// every bug in it was in MY OWN FIX for the first, and the first version of this file passed
// through all of them:
//
// Round 1 (the shipped code, 90927ed):
//   * the 60-day HRV baseline contained the night it was scoring — day one, ratio 1.000 whatever
//     happened, a wrecked 18ms night reading 58% "Moderate";
//   * it weighted nights by SAMPLE COUNT, so one chatty night outvoted six sparse ones;
//   * with no HealthKit sleep window, the pool was "everything within 14h of the newest sample",
//     so past 22:00 a sofa reading became newest and the night fell out;
//   * a lone 0.25-weight signal was renormalised to 100% — 8h in bed alone said "Ready to push".
//
// Round 2 (the fix, be133ac — found by three cold-context audits, all four reproduced here):
//   * CONTIGUOUS BLOCKS ASSUMED DENSE SAMPLES. An Apple Watch writes a handful of HRV rows a
//     night, hours apart. Requiring 2h of span meant a sparse night never qualified as a night,
//     so the sofa block won anyway and the 22:00 cliff was untouched; a night split by one >3h
//     gap (watch on the charger at 2am) handed the win to the EARLY half, and the staleness guard
//     then measured age from there and deleted HRV outright; and a night whose samples were all
//     >3h apart collapsed to ONE sample, defeating the median it claims to rely on.
//   * THE BASELINE CUTOFF WAS A TIMESTAMP, NOT A KEY, so the scored night's own pre-sleep 22:xx
//     readings survived it and voted as an extra group — and could even satisfy the 3-night
//     small-sample guard by themselves.
//   * "NO OVERNIGHT SAMPLES TODAY -> DROP HRV" FIRED ON ONE STRAY SAMPLE IN 60 DAYS, and dropping
//     HRV RAISED the score, so the failure mode was telling an under-recovered person to train.
//   * THE FLAT `min(score, 0.75)` FLATTENED THE SCALE: the sleep factor is >=0.78 past 7h, so 7h,
//     8h and 9h all clamped to exactly 0.75 for a phone-only user.
import { pinToLastNight, personalBaseline, hrvReading, recoveryScoreFrom } from "./app.mjs";

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const at = (dayOff, h, m = 0) => new Date(2026, 6, 22 - dayOff, h, m, 0).getTime();
const verdict = t => t >= 0.78 ? "Ready to push" : t >= 0.62 ? "Ready" : t >= 0.45 ? "Moderate" : "Take it easy";

// FIXTURES ARE SPARSE BY DEFAULT, because that is what HealthKit actually holds. The first cut of
// this file used 24 samples at 20-minute spacing for every night — 8-24x denser than an Apple
// Watch — and every check in the "22:00 cliff" section passed only because of it.
// `night(d, v)` = 4 readings between 23:40 and 06:50, hours apart, the shape Apple writes.
const NIGHT_OFFSETS = [0.7, 3.7, 4.2, 7.8];                       // hours after 23:00
const night = (dayOff, v, offsets = NIGHT_OFFSETS) =>
  offsets.map((o, i) => ({ v: v + (i % 3) - 1, t: at(dayOff + 1, 23) + o * 36e5 }));
const dense = (dayOff, v, n = 24) =>
  Array.from({ length: n }, (_, i) => ({ v: v + (i % 3) - 1, t: at(dayOff + 1, 23) + i * (8 / n) * 36e5 }));
const history = (v, from = 1, to = 20, mk = night) => { const a = []; for (let d = from; d <= to; d++) a.push(...mk(d, v)); return a; };
const sc = (r, extra = {}) => recoveryScoreFrom({ hrv: r.hrv, hrvBaseline: r.baseline,
  restingHr: 51, rhrBaseline: 51, sleepHours: 7.5, ...extra });

// ── 1. The baseline must exclude the night being scored ──────────────────────────────────────
{
  // Day one with a watch: last night is the ONLY night on record, and it was terrible (18ms for
  // someone whose real normal is ~55). Old behaviour: baseline = median(that night) = 18, ratio
  // 1.000, "you're fine". There is no honest baseline here, so there must be no HRV reading.
  const lastNight = night(0, 18);
  const r = hrvReading(lastNight, lastNight, null, null, at(0, 9));
  check("day one: a wrecked first night can't score itself as normal", r.baseline == null,
    `baseline ${r.baseline}`);

  // With history, the scored night must not be able to drag its own baseline toward itself.
  const hist = history(55);
  const wrecked = night(0, 18);
  const r2 = hrvReading(wrecked, [...hist, ...wrecked], null, null, at(0, 9));
  check("a wrecked night is compared against the 20 good ones, not itself",
    r2.baseline != null && Math.abs(r2.baseline - 55) <= 1, `baseline ${r2.baseline}`);
  check("...and it reads as wrecked", r2.hrv != null && r2.hrv / r2.baseline < 0.45,
    `hrv ${r2.hrv} / ${r2.baseline}`);
  const s = recoveryScoreFrom({ hrv: r2.hrv, hrvBaseline: r2.baseline, restingHr: 52, rhrBaseline: 51, sleepHours: 5 });
  check("...and the score says so", s < 0.4, String(s));
}

// ── 1a. The scored night's own PRE-SLEEP readings must not vote on its baseline ───────────────
{
  // The overnight filter starts at 22:00, so readings taken awake before bedtime belong to the
  // scored night's bucket. A timestamp cutoff at "the first sample of the pinned pool" let them
  // through as a separate, systematically LOW group — dragging the baseline down and the score up
  // every single night. Measured on the shipped fix: baseline 60 -> 57.5, score 0.56 -> 0.65.
  const hist = []; for (let d = 1; d <= 8; d++) hist.push(...night(d, 50 + d));   // medians 51..58
  const tonightPreSleep = [{ v: 38, t: at(0, 22, 10) }, { v: 40, t: at(0, 22, 40) }];
  const asleep = night(0, 55);
  const clean = hrvReading(asleep, [...hist, ...asleep], null, null, at(0, 9));
  const withPre = hrvReading([...tonightPreSleep, ...asleep], [...hist, ...tonightPreSleep, ...asleep], null, null, at(0, 9));
  console.log(`  baseline without pre-sleep readings ${clean.baseline} (${clean.nights} nights), with ${withPre.baseline} (${withPre.nights})`);
  check("pre-sleep readings from the scored night don't become an extra baseline night",
    withPre.nights === clean.nights, `${withPre.nights} vs ${clean.nights}`);
  check("...so the baseline is unchanged by them", withPre.baseline === clean.baseline,
    `${withPre.baseline} vs ${clean.baseline}`);

  // ...and they must not be able to satisfy the 3-night small-sample guard on their own.
  const twoNights = [...night(1, 55), ...night(2, 55)];
  const thin = hrvReading([...tonightPreSleep, ...asleep], [...twoNights, ...tonightPreSleep, ...asleep], null, null, at(0, 9));
  check("two nights of history is still two, not three", thin.baseline == null,
    `baseline ${thin.baseline} from ${thin.nights} nights`);
}

// ── 1b. Every night gets ONE vote, regardless of how many rows it wrote ──────────────────────
{
  // Six ordinary sparse nights at 55ms, plus one night the watch wrote 200 rows at 30ms — spread
  // across that night's 8 hours, NOT beyond it. The first cut of this fixture kept 20-minute
  // spacing, so 200 samples spanned 66 HOURS and corrupted three of the six good nights; the check
  // then passed at 54 by a single median position and would have gone red on correct code.
  const hist = history(55, 2, 7);
  hist.push(...dense(8, 30, 200));
  const rawMedian = [...hist].map(s => s.v).sort((a, b) => a - b)[Math.floor(hist.length / 2)];
  const b = personalBaseline(hist, null, true);
  console.log(`  raw-sample median ${rawMedian} vs median-of-nights ${b.value} over ${b.periods} nights`);
  check("one loud night cannot redefine the baseline", Math.abs(b.value - 55) <= 1, `got ${b.value}`);
  check("nights are counted as nights, not rows", b.periods === 7, `${b.periods}`);
  check("...and the loud night is exactly one of them",
    personalBaseline(dense(8, 30, 200), null, true).periods === 1);
  // The night key must span midnight — 23:00 and 03:00 are one night, not two.
  check("a night that crosses midnight counts once",
    personalBaseline([{ v: 50, t: at(1, 23) }, { v: 50, t: at(0, 3) }], null, true).periods === 1);
}

// ── 2. The 22:00 cliff, at REALISTIC sample density ──────────────────────────────────────────
{
  // No HealthKit sleep rows at all (phone-only, or a watch that writes no sleep). Last night was a
  // normal 55ms night; this evening there are two readings on the sofa at 22:15/22:40, which the
  // overnight hour-rule (>=22:00) sweeps into the same pool.
  const hist = history(55);
  const evening = [{ v: 84, t: at(0, 22, 15) }, { v: 86, t: at(0, 22, 40) }];
  // Every density from "one reading all night" upward. The 2h-span rule failed all but the last.
  const SHAPES = {
    "1 reading": [6.0], "2, 40min apart": [5.6, 6.3], "3, hours apart": [0.7, 4.2, 7.8],
    "4 (typical)": NIGHT_OFFSETS, "all clustered post-wake": [7.4, 7.7, 7.9],
    "split by a charger gap": [0.5, 2.0, 2.8, 6.8, 8.0],
  };
  let bad = 0;
  for (const [label, offsets] of Object.entries(SHAPES)) {
    const lastNight = night(0, 55, offsets);
    const before = hrvReading(lastNight, [...hist, ...lastNight], null, null, at(0, 21));
    const after = hrvReading([...lastNight, ...evening], [...hist, ...lastNight], null, null, at(0, 22, 45));
    const ok = before.hrv === after.hrv && Math.abs(sc(before) - sc(after)) < 0.02;
    if (!ok) { bad++; console.log(`  ${label}: 21:00 hrv ${before.hrv} (${Math.round(sc(before) * 100)}%) -> 22:45 hrv ${after.hrv} (${Math.round(sc(after) * 100)}%)`); }
  }
  check("the reading holds across 22:00 at every sample density", bad === 0, `${bad} shape(s) jumped`);

  // The mechanism, isolated.
  const sparse = night(0, 55, [5.6, 6.3]);
  const pinned = pinToLastNight([...sparse, ...evening], null, null);
  check("a two-sample night still beats two sofa readings", !pinned.some(s => s.v > 80),
    `kept ${pinned.length}, max ${Math.max(...pinned.map(s => s.v))}`);

  // A night split by a >3h gap must stay ONE night — the block-splitting version returned the
  // early half, and the staleness guard then aged the reading from there and deleted it at 21:46.
  const split = night(0, 55, [0.5, 2.0, 8.0]);
  for (const h of [9, 18, 21, 22, 23]) {
    const r = hrvReading(split, [...hist, ...split], null, null, at(0, h, 46));
    if (r.hrv == null) { fails++; console.log(`FAIL a charger-split night vanishes at ${h}:46`); }
    else if (r.hrv !== 55) { fails++; console.log(`FAIL a charger-split night reads ${r.hrv} at ${h}:46, not the median 55`); }
  }
  check("a night split by a charger gap stays one night, all evening", true);

  // ...and the reading is a MEDIAN of the night, never a single surviving sample.
  const odd = night(0, 55, [0.7, 4.2, 7.8]);
  odd[2] = { v: 96, t: odd[2].t };                       // one bad-contact reading at the end
  const r = hrvReading(odd, [...hist, ...odd], null, null, at(0, 10));
  check("one odd reading cannot become the whole night", r.hrv < 60, `hrv ${r.hrv}`);

  // Once tonight genuinely IS a night — you have slept into the small hours — it takes over. That
  // is new information, not a cliff, and refusing to update would be the opposite bug.
  const tonight = [{ v: 40, t: at(0, 23, 30) }, { v: 40, t: at(-1, 1, 10) }, { v: 40, t: at(-1, 3) }];
  const p2 = pinToLastNight([...sparse, ...evening, ...tonight], null, null);
  check("a real in-progress night does take over", p2.every(s => s.v === 40 || s.v > 80),
    `values ${[...new Set(p2.map(s => s.v))].join(",")}`);
}

// ── 3a. Watch off overnight: fall back to a DAYTIME comparison, don't delete the signal ──────
{
  // This user wears the watch 09:30-21:30 and charges it overnight, so they never produce an
  // overnight sample — and they are genuinely under-recovered today (34 vs their daytime normal
  // of 50). The first fix deleted HRV for them entirely, which RAISED the score to 76% "Ready".
  const day = (dayOff, v) => [11, 14, 17, 20].map(h => ({ v, t: at(dayOff, h) }));
  const hist = []; for (let d = 1; d <= 20; d++) hist.push(...day(d, 50));
  const today = day(0, 34);
  const r = hrvReading(today, [...hist, ...today], null, null, at(0, 21));
  check("a daytime-only wearer keeps their reading", r.hrv != null && r.baseline != null,
    `hrv ${r.hrv} baseline ${r.baseline}`);
  check("...compared against their own DAYTIME normal", r.hrv === 34 && r.baseline === 50,
    `${r.hrv} vs ${r.baseline}`);
  const s = sc(r);
  console.log(`  daytime-only, under-recovered: ${Math.round(s * 100)}% — ${verdict(s)}`);
  check("...so an under-recovered day still says so", s < 0.5, String(s));

  // ONE stray overnight sample in sixty days must not change any of that. `histNight.length > 0`
  // was the trigger, so a single night they fell asleep in the watch silenced HRV forever.
  const stray = { v: 60, t: at(30, 3) };
  const r2 = hrvReading(today, [...hist, ...today, stray], null, null, at(0, 21));
  check("one stray overnight sample in 60 days changes nothing", r2.hrv === r.hrv && r2.baseline === r.baseline,
    `hrv ${r2.hrv} baseline ${r2.baseline}`);

  // ...and neither does a reading landing at 09:01 instead of 08:59. The overnight rule is a pure
  // hour test, so the boundary used to be a 43-point cliff on one minute.
  const early = hrvReading([...day(0, 34), { v: 34, t: at(0, 8, 59) }], [...hist, ...today, stray], null, null, at(0, 21));
  const late = hrvReading([...day(0, 34), { v: 34, t: at(0, 9, 1) }], [...hist, ...today, stray], null, null, at(0, 21));
  check("the 09:00 boundary is not a cliff", Math.abs(sc(early) - sc(late)) < 0.1,
    `${Math.round(sc(early) * 100)}% vs ${Math.round(sc(late) * 100)}%`);
}

// ── 3b. No usable baseline of EITHER kind: say nothing, and don't be flattered for it ────────
{
  // Watch normally worn to bed, tonight it sat on the charger, and there is no daytime history to
  // fall back on. There is genuinely nothing to compare, so there must be no reading — but the
  // score must not RISE because of it. At-baseline HRV maps to 0.73 while at-baseline resting HR
  // maps to 0.75 and 8h sleep to 1.0, so dropping the HRV term used to pay 7 points.
  const hist = history(55);
  const daytimeOnly = [{ v: 38, t: at(0, 13) }, { v: 38, t: at(0, 16) }];
  const r = hrvReading(daytimeOnly, hist, null, null, at(0, 18));
  check("no comparable baseline means no HRV reading", r.hrv == null, `hrv ${r.hrv}`);
  const unknown = recoveryScoreFrom({ restingHr: 51, rhrBaseline: 51, sleepHours: 8 });
  const known = recoveryScoreFrom({ hrv: 55, hrvBaseline: 55, restingHr: 51, rhrBaseline: 51, sleepHours: 8 });
  console.log(`  HRV unknown ${Math.round(unknown * 100)}% vs HRV measured and normal ${Math.round(known * 100)}%`);
  check("'we couldn't measure it' never scores better than 'we measured it and it's normal'",
    unknown <= known, `${unknown} vs ${known}`);
}

// ── 3c. Skipping one night must not resurrect the night before ───────────────────────────────
{
  const hist = history(55, 2, 20);
  const nightBefore = night(1, 55);              // worn: ended 06:50 yesterday
  const r = hrvReading(nightBefore, [...hist, ...nightBefore], null, null, at(0, 14));
  check("a two-day-old night is not reported as this morning's", r.hrv == null, `hrv ${r.hrv}`);
  check("...and it is flagged as stale, not as absent data", r.stale === true);
  const lastNight = night(0, 55);
  const late = hrvReading(lastNight, [...hist, ...lastNight], null, null, at(0, 23, 30));
  check("last night still counts at 23:30", late.hrv != null && late.stale === false, `hrv ${late.hrv}`);
}

// ── 3d. The staleness cutoff, checked AT ITS BOUNDARY and at every hour ──────────────────────
{
  // The first cut of this section swept hours 07:00-23:00 with fixtures 0.8-16.8h and 24.8-40.8h
  // old — never within 3 hours of the 20h rule from either side, so it would have passed for any
  // threshold between 17h and 24h. It pinned nothing. These do.
  const hist = history(55, 2, 20);
  const one = (ageH, nowMs) => hrvReading([{ v: 55, t: nowMs - ageH * 36e5 }, { v: 55, t: nowMs - (ageH + 0.5) * 36e5 }],
    hist, null, null, nowMs);
  // now = 22:00 so that both probes land in the small hours of the SAME night bucket — a 19h-old
  // and a 21h-old reading are then the same night, and the only thing separating them is the rule
  // under test. (At 14:00 they would be yesterday EVENING readings, i.e. daytime, and the daytime
  // path would reject them for having no daytime baseline — a fixture fault, not a rule failure.)
  const nowMs = at(0, 22);
  check("a reading 19h old is still today's", one(19, nowMs).hrv != null);
  check("...one 21h old is not", one(21, nowMs).hrv == null);
  check("...and the 21h one is reported as stale", one(21, nowMs).stale === true);
  let bad = 0;
  for (let h = 7; h <= 23; h++) {
    const n = at(0, h, 30);
    const fresh = hrvReading(night(0, 55), hist, null, null, n);
    const staleR = hrvReading(night(1, 55), hist, null, null, n);
    if (fresh.hrv == null) { bad++; console.log(`  hour ${h}: this morning's reading WRONGLY dropped`); }
    if (staleR.hrv != null) { bad++; console.log(`  hour ${h}: yesterday's reading wrongly KEPT`); }
  }
  check("the rule is right at every hour from 07:00 to 23:00", bad === 0, `${bad} wrong`);
}

// ── 4. A thin read cannot reach the top band — but must still discriminate ───────────────────
{
  const sleepOnly = h => recoveryScoreFrom({ sleepHours: h });
  console.log(`  sleep alone: 6h ${Math.round(sleepOnly(6) * 100)}%  7h ${Math.round(sleepOnly(7) * 100)}%  8h ${Math.round(sleepOnly(8) * 100)}%  9h ${Math.round(sleepOnly(9) * 100)}%`);
  check("eight hours in bed alone is not 100%", sleepOnly(8) <= 0.78, String(sleepOnly(8)));
  check("...and does not claim \"Ready to push\" off one signal",
    verdict(sleepOnly(8)) !== "Ready to push", verdict(sleepOnly(8)));
  // The flat cap made 7h, 8h and 9h all exactly 0.75 — a number that had stopped saying anything.
  check("...but a 7h night and an 8h night are still different numbers", sleepOnly(7) < sleepOnly(8),
    `${sleepOnly(7)} vs ${sleepOnly(8)}`);
  check("...and 6h is lower still", sleepOnly(6) < sleepOnly(7), `${sleepOnly(6)} vs ${sleepOnly(7)}`);
  check("a 4h night on the same thin data still reads badly", sleepOnly(4) < 0.2, String(sleepOnly(4)));
  check("resting HR alone is held under the top band too",
    recoveryScoreFrom({ restingHr: 40, rhrBaseline: 51 }) <= 0.78);
  // HRV alone is 0.5 weight, so the old `wsum <= 0.3` test never saw it — it scored a flat 100%.
  const hrvAlone = recoveryScoreFrom({ hrv: 100, hrvBaseline: 50 });
  check("HRV alone does not score 100% either", hrvAlone <= 0.9, String(hrvAlone));
  check("...and still beats a mediocre HRV-alone day", hrvAlone > recoveryScoreFrom({ hrv: 45, hrvBaseline: 50 }));
  // Two real signals are enough to earn the top of the range.
  const full = recoveryScoreFrom({ hrv: 66, hrvBaseline: 55, restingHr: 47, rhrBaseline: 51, sleepHours: 8.5 });
  check("a full read can still say Ready to push", full > 0.9, String(full));
  check("no signal at all returns null, not zero", recoveryScoreFrom({}) === null);
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
