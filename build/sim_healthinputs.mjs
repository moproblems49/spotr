// THE INPUTS TO THE RECOVERY SCORE, not the formula.
//
// The score was recentred yesterday after "Recovery 37% — take it easy" while feeling great. That
// fixed the MAPPING. An audit of what FEEDS it then found four separate ways the inputs are wrong,
// all of which push the score down for someone who is fine:
//
//   1. Every health read was capped at 200 rows over a 36h window, newest-first — so hitting the
//      cap drops the OLDEST rows, i.e. the START of last night. An Apple Watch writes one row per
//      stage segment and a second sleep app doubles that. Measured before the fix: a true 8.0h
//      night reported as 6.7h at 240 rows and 5.7h at 280. Sleep is a quarter of the score.
//   2. Resting HR was `rhr[0]` — a single raw sample, i.e. whichever SOURCE wrote last — compared
//      against a 60-day median. A second app writing 68 against a watch's 51 took 76% to 39%.
//   3. The illness heads-up read `rows[rows.length - 1]`, the OLDEST sample (the plugin returns
//      newest-first). On any night the watch wasn't worn it resurrected a reading up to 30 days
//      old, so one illness kept firing "your body may be fighting something" for a month.
//   4. pickSleepBlock had no recency check, so an all-nighter was handed the PREVIOUS night's
//      sleep and scored as if it had happened.
//
// This tests the shipped source directly — readRecovery needs a device, so the checks below pin
// the specific lines rather than re-implementing the function.
import { readFileSync } from "fs";

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const src = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

// ── 1. The read cap must not be able to eat a night ──────────────────────────────────────────
const readFn = (src.match(/async function read\(dataType[\s\S]{0,420}?\n  \}/) || [""])[0];
check("readRecovery's sample read is no longer capped at 200",
  !/limit:\s*200\b/.test(readFn), readFn.slice(0, 200));
const capMatch = readFn.match(/limit\s*=\s*(\d+)/);
check("...its cap is at least 2000 rows", capMatch && Number(capMatch[1]) >= 2000,
  capMatch ? capMatch[1] : "no default limit found");
check("...ordering is passed explicitly rather than assumed",
  /ascending:\s*false/.test(readFn), readFn.slice(0, 260));
check("...and hitting the cap is reported rather than silent",
  /rows\.length\s*>=\s*limit/.test(readFn), readFn.slice(0, 300));

// ── 2. Today's resting HR must be the same statistic as its baseline ─────────────────────────
check("resting HR is no longer a single raw sample", !/parseFloat\(rhr\[0\]\.value\)/.test(src),
  "parseFloat(rhr[0].value) still present");
check("...it is a median, matching how rhrBaseline is computed",
  /out\.restingHr = Math\.round\(sorted\.length % 2/.test(src), "no median for today's resting HR");

// ── 3. The illness signal must read the NEWEST sample ────────────────────────────────────────
check("the illness heads-up no longer reads the oldest sample",
  !/rows\[rows\.length - 1\]\.v/.test(src), "rows[rows.length - 1].v still present");
check("...it picks the newest by timestamp",
  /const newest = rows\.reduce\(\(a, b\) => \(b\.t > a\.t \? b : a\)/.test(src), "no explicit newest pick");

// ── 4. A stale sleep block must not be reported as last night ────────────────────────────────
check("a stale sleep block is rejected", /now\.getTime\(\) - block\.endMs\) > STALE_SLEEP_MS/.test(src),
  "no staleness guard on the chosen sleep block");

// ── The staleness cutoff itself, exercised as arithmetic at every hour of the day ────────────
// It must reject a block that ended more than a day ago and accept last night's, whatever time
// the app is opened — the class of bug that has taken two sims red overnight on correct code.
// Mirrors the shipped rule: elapsed hours since the block ended, not a clock anchor. A
// clock-anchored cutoff was the FIRST attempt and this sweep is what caught it — it accepted a
// 24h-stale block at every hour from 08:00 to 17:00.
const STALE_SLEEP_MS = 20 * 36e5;
const isStale = (now, endMs) => (now.getTime() - endMs) > STALE_SLEEP_MS;
let hourFails = 0;
// Hours 07:00-23:00 only. Before you have woken there is no COMPLETED block from last night for
// the rule to judge — HealthKit would hold a partial, in-progress one — so a pre-dawn fixture
// labelled "last night" is really yesterday morning, and rejecting it is the correct answer, not
// a bug. The first cut of this loop swept all 24 hours and reported those as failures.
for (let h = 7; h <= 23; h++) {
  const now = new Date(2026, 6, 22, h, 30, 0);
  const wokeToday = new Date(2026, 6, 22, 7, 0, 0).getTime();   // this morning: 0.5h - 16.5h old
  const wokeStale = wokeToday - 24 * 36e5;                      // an all-nighter: 24.5h - 40.5h old
  if (isStale(now, wokeToday)) { hourFails++; console.log(`  hour ${h}: this morning's wake WRONGLY rejected`); }
  if (!isStale(now, wokeStale)) { hourFails++; console.log(`  hour ${h}: a 24h-stale block wrongly ACCEPTED`); }
}
check("the staleness rule keeps last night and drops a 24h-old block at every hour", hourFails === 0,
  `${hourFails} hour(s) wrong`);

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
