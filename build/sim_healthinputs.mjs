// THE INPUTS TO THE RECOVERY SCORE, RUN RATHER THAN GREPPED.
//
// This file used to assert that certain REGEXES still matched src/App.jsx. That is a test of the
// text, not of the app: it can only notice if somebody deletes a line. It could not have caught
// the read cap silently truncating a night, a median quietly turning back into a raw sample, a
// stale block being accepted, or any change in what those inputs actually PRODUCE — and every one
// of those is a bug that has really shipped here. `readRecovery` needed a device, which was the
// excuse; it is split now into a device-only auth wrapper and `readRecoveryFrom(H, now)`, so the
// checks below hand it a FAKE HealthKit and read the numbers that come out.
//
// The four bugs it pins, all measured on the real code before the fixes:
//   1. Every read was capped at 200 rows over a 36h window, NEWEST FIRST — so hitting the cap
//      drops the OLDEST rows, i.e. the start of last night. An Apple Watch writes one row per
//      stage segment and a second sleep app doubles that. A true 8.0h night reported as 6.7h at
//      240 rows and 5.7h at 280; sleep is a quarter of the score.
//   2. Resting HR was `rhr[0]` — one raw sample, i.e. whichever SOURCE wrote last — compared
//      against a 60-day median. A second app writing 68 against a watch's 51 took 76% to 39%.
//   3. The illness heads-up read `rows[rows.length - 1]`, the OLDEST sample (the plugin returns
//      newest-first), so one illness kept firing "your body may be fighting something" for a month.
//   4. pickSleepBlock had no recency check, so an all-nighter was handed the PREVIOUS night's
//      sleep and scored as if it had happened.
import { readRecoveryFrom } from "./app.mjs";

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const H_MS = 36e5;

// ── A fake HealthKit ─────────────────────────────────────────────────────────────────────────
// Mirrors the two behaviours of the real plugin that have caused bugs: it returns samples
// NEWEST-FIRST, and it TRUNCATES at `limit` — so an under-sized limit drops the oldest rows.
// `capHits` records every read that came back full, which is how a truncated night is detected.
function fakeHealth(byType, opts = {}) {
  const capHits = [];
  return {
    capHits,
    async readSamples({ dataType, startDate, endDate, limit, ascending }) {
      const s = new Date(startDate).getTime(), e = new Date(endDate).getTime();
      let rows = (byType[dataType] || []).filter(r => {
        const t = new Date(r.startDate).getTime();
        return t >= s && t <= e;
      });
      rows.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));   // newest first
      if (ascending === true) rows.reverse();
      if (opts.honourAscending === false) { /* a plugin that ignores the flag */ }
      if (rows.length > limit) { capHits.push({ dataType, limit, had: rows.length }); rows = rows.slice(0, limit); }
      return { samples: rows };
    },
  };
}
const at = (now, dayOff, h, m = 0) => {
  const d = new Date(now); d.setDate(d.getDate() - dayOff); d.setHours(h, m, 0, 0); return d.getTime();
};
const iso = (t) => new Date(t).toISOString();
const q = (t, v) => ({ startDate: iso(t), endDate: iso(t), value: String(v) });
// A night of sleep as HealthKit really writes it: many short per-stage segments, not one row.
function sleepNight(startMs, hours, segMin = 20) {
  const out = [], n = Math.round((hours * 60) / segMin);
  for (let i = 0; i < n; i++) {
    const a = startMs + i * segMin * 60000, b = a + segMin * 60000;
    const stage = i % 5 === 0 ? "deep" : i % 3 === 0 ? "rem" : "light";
    out.push({ startDate: iso(a), endDate: iso(b), value: String(segMin), sleepState: stage });
  }
  return out;
}
// Sparse overnight HRV, the shape an Apple Watch actually writes.
const hrvNight = (now, dayOff, v) => [0.7, 3.7, 4.2, 7.8].map((o, i) =>
  q(at(now, dayOff + 1, 23) + o * H_MS, v + (i % 3) - 1));

const NOW = new Date(2026, 6, 22, 9, 30, 0);      // 09:30, awake, watch synced

// ── 1. The read cap must not be able to eat a night ──────────────────────────────────────────
{
  // 8.0 hours written as 20-minute stage segments = 24 rows; two sleep sources = 48; a watch that
  // segments finely can produce 200+. The old limit was 200 over a TWO-NIGHT window.
  const sleep = [...sleepNight(at(NOW, 1, 23), 8, 4), ...sleepNight(at(NOW, 2, 23), 8, 4)];
  const H = fakeHealth({ sleep, heartRateVariability: hrvNight(NOW, 0, 55), restingHeartRate: [q(at(NOW, 0, 7), 51)] });
  const out = await readRecoveryFrom(H, NOW);
  console.log(`  ${sleep.length} sleep rows in the window -> sleepHours ${out.sleepHours}`);
  check("a finely-segmented night is not truncated by the read cap",
    out.sleepHours >= 7.9 && out.sleepHours <= 8.1, `${out.sleepHours}h from ${sleep.length} rows`);
  check("...and no read came back at its cap", H.capHits.length === 0, JSON.stringify(H.capHits));

  // The mechanism, demonstrated: force a cap the night can reach and the night must SHRINK. If
  // this ever stops shrinking, the fixture no longer reproduces the original bug and the check
  // above has stopped meaning anything.
  const tiny = fakeHealth({ sleep }); const realRead = tiny.readSamples;
  tiny.readSamples = (a) => realRead.call(tiny, { ...a, limit: Math.min(a.limit, 40) });
  const truncated = await readRecoveryFrom(tiny, NOW);
  console.log(`  same data capped at 40 rows -> sleepHours ${truncated.sleepHours}`);
  check("...and an under-sized cap really would have shortened it",
    truncated.sleepHours < out.sleepHours, `${truncated.sleepHours} vs ${out.sleepHours}`);
}

// ── 2. Today's resting HR must be the same statistic as its baseline ─────────────────────────
{
  // A watch reading 51 all week, then a second app writes a single 68 an hour later. `rhr[0]` is
  // whichever source wrote LAST, so the score used to swing on the order of two rows.
  const hist = []; for (let d = 1; d <= 30; d++) hist.push(q(at(NOW, d, 7), 51));
  const base = { heartRateVariability: hrvNight(NOW, 0, 55), sleep: sleepNight(at(NOW, 1, 23), 8) };
  const clean = await readRecoveryFrom(fakeHealth({ ...base,
    restingHeartRate: [q(at(NOW, 0, 6, 30), 51), q(at(NOW, 0, 7), 51), q(at(NOW, 0, 7, 30), 51), ...hist] }), NOW);
  const polluted = await readRecoveryFrom(fakeHealth({ ...base,
    restingHeartRate: [q(at(NOW, 0, 6, 30), 51), q(at(NOW, 0, 7), 51), q(at(NOW, 0, 7, 30), 51), q(at(NOW, 0, 8), 68), ...hist] }), NOW);
  console.log(`  resting HR: watch only ${clean.restingHr}, second app writes 68 -> ${polluted.restingHr}`);
  check("one stray resting-HR row from a second source does not become today's reading",
    polluted.restingHr === clean.restingHr, `${polluted.restingHr} vs ${clean.restingHr}`);
  check("...and the score barely moves",
    Math.abs(polluted.recoveryScore - clean.recoveryScore) < 0.03,
    `${clean.recoveryScore} -> ${polluted.recoveryScore}`);
}

// ── 3. The illness signal must read the NEWEST sample ────────────────────────────────────────
{
  // Respiratory rate: 30 days at 14, except a spike to 21 a month ago. The plugin returns
  // newest-first, so reading `rows[rows.length - 1]` resurrected the OLDEST row — the spike —
  // and reported it as last night, every night, for a month.
  // THE WATCH WAS NOT WORN LAST NIGHT — which is the whole scenario. `latest` prefers samples
  // from the last 20h and only falls back to "the newest sample" when there are none, so a
  // fixture WITH a reading last night never reaches the line under test and passes either way.
  // The first cut of this check did exactly that: it stayed green with the bug reintroduced.
  const resp = [q(at(NOW, 29, 3), 21)];
  for (let d = 2; d <= 28; d++) resp.push(q(at(NOW, d, 3), 14));
  const out = await readRecoveryFrom(fakeHealth({ respiratoryRate: resp,
    heartRateVariability: hrvNight(NOW, 0, 55), sleep: sleepNight(at(NOW, 1, 23), 8) }), NOW);
  console.log(`  respiratory rate: reported ${out.resp} against baseline ${out.respBaseline} (month-old spike was 21)`);
  check("a month-old spike is not reported as last night", out.resp < 16, String(out.resp));
  check("...and the baseline is the normal value", out.respBaseline === 14, String(out.respBaseline));

  // ...and a REAL spike last night must still be reported, or the fix has just muted the feature.
  const resp2 = [...resp, q(at(NOW, 0, 3), 21)];
  const out2 = await readRecoveryFrom(fakeHealth({ respiratoryRate: resp2,
    heartRateVariability: hrvNight(NOW, 0, 55), sleep: sleepNight(at(NOW, 1, 23), 8) }), NOW);
  check("...but a spike LAST night is still reported", out2.resp >= 20, String(out2.resp));
}

// ── 4. A stale sleep block must not be reported as last night ────────────────────────────────
{
  // An all-nighter: the most recent sleep in the window ended yesterday morning. Scoring it as
  // last night's 8 hours is the difference between "you didn't sleep" and "you slept fine".
  const H = fakeHealth({ sleep: sleepNight(at(NOW, 2, 23), 8),
    heartRateVariability: hrvNight(NOW, 1, 55), restingHeartRate: [q(at(NOW, 1, 7), 51)] });
  const out = await readRecoveryFrom(H, NOW);
  console.log(`  all-nighter: sleepHours ${out.sleepHours}, hrv ${out.hrv}`);
  check("a night you did not sleep does not inherit the previous night's hours", out.sleepHours == null,
    String(out.sleepHours));
  check("...and a two-day-old HRV night is not reported as this morning's", out.hrv == null, String(out.hrv));

  // The same data one day fresher must be accepted, or the guard is just deleting everything.
  // NOTE THE HISTORY. The first cut of this check omitted it and failed on correct code: with
  // fewer than three nights of HRV behind it there is no honest baseline, so the reading is
  // withheld by design — a fixture fault reading as a bug, which is the whole reason this file
  // was rewritten to run the code instead of matching its text.
  const hrvHist = []; for (let d = 1; d <= 30; d++) hrvHist.push(...hrvNight(NOW, d, 55));
  const fresh = await readRecoveryFrom(fakeHealth({ sleep: sleepNight(at(NOW, 1, 23), 8),
    heartRateVariability: [...hrvNight(NOW, 0, 55), ...hrvHist],
    restingHeartRate: [q(at(NOW, 0, 7), 51)] }), NOW);
  check("...while last night IS accepted", fresh.sleepHours >= 7.9 && fresh.hrv != null,
    `${fresh.sleepHours}h hrv ${fresh.hrv}`);
}

// ── 5. The whole pipeline, at every hour of the day ──────────────────────────────────────────
{
  // Two sims have gone red overnight on correct code here. A full read taken at 03:00 and at
  // 21:00 describes the same night and must produce the same numbers.
  const mk = (now) => {
    const hist = []; for (let d = 1; d <= 30; d++) hist.push(...hrvNight(now, d, 55));
    return fakeHealth({
      sleep: sleepNight(at(now, 1, 23), 8),
      heartRateVariability: [...hrvNight(now, 0, 55), ...hist],
      restingHeartRate: Array.from({ length: 30 }, (_, d) => q(at(now, d, 7), 51)),
    });
  };
  const seen = [];
  for (let h = 8; h <= 23; h++) {
    const now = new Date(2026, 6, 22, h, 15, 0);
    const o = await readRecoveryFrom(mk(now), now);
    seen.push({ h, sleep: o.sleepHours, hrv: o.hrv, score: o.recoveryScore });
  }
  check("...and every hour actually produced an HRV reading", seen.every(x => x.hrv != null),
    JSON.stringify(seen.filter(x => x.hrv == null).map(x => x.h)));
  const scores = [...new Set(seen.map(x => x.score))];
  const sleeps = [...new Set(seen.map(x => x.sleep))];
  console.log(`  08:00-23:00: sleep ${sleeps.join("/")}h, scores ${scores.join("/")}`);
  check("the same night reads the same at every waking hour", scores.length === 1 && sleeps.length === 1,
    JSON.stringify(seen.filter(x => x.score !== seen[0].score)));
}

// ── 6. Missing signals are excluded, never scored as zero ────────────────────────────────────
{
  const hrvHist6 = []; for (let d = 1; d <= 30; d++) hrvHist6.push(...hrvNight(NOW, d, 55));
  const full = await readRecoveryFrom(fakeHealth({ sleep: sleepNight(at(NOW, 1, 23), 8),
    heartRateVariability: [...hrvNight(NOW, 0, 55), ...hrvHist6],
    restingHeartRate: Array.from({ length: 30 }, (_, d) => q(at(NOW, d, 7), 51)) }), NOW);
  check("the full read really did include HRV", full.hrv != null && full.hrvBaseline != null,
    `hrv ${full.hrv} baseline ${full.hrvBaseline}`);
  const sleepOnly = await readRecoveryFrom(fakeHealth({ sleep: sleepNight(at(NOW, 1, 23), 8) }), NOW);
  const nothing = await readRecoveryFrom(fakeHealth({}), NOW);
  console.log(`  full read ${full.recoveryScore}, sleep only ${sleepOnly.recoveryScore}, nothing ${nothing}`);
  check("a full read scores normally", full.recoveryScore > 0.6, String(full.recoveryScore));
  check("sleep alone is not scored as a wreck", sleepOnly.recoveryScore > 0.5, String(sleepOnly.recoveryScore));
  check("...nor as more confident than a full read", sleepOnly.recoveryScore <= full.recoveryScore,
    `${sleepOnly.recoveryScore} vs ${full.recoveryScore}`);
  check("no data at all returns null rather than a zero score", nothing === null, JSON.stringify(nothing));
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
