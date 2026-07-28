// RECOVERY HRV WINDOW — the score used to drift during the day and could read HIGHER at night.
// Cause: a rolling 36h lookback (can straddle two nights, and samples fall out of the back of it
// as the clock advances) plus an overnight rule counting from 22:00, which swept up samples taken
// while awake in the evening. pinToLastNight() reduces the pool to one night.
import { pinToLastNight } from "./app.mjs";

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const mean = a => a.reduce((x, s) => x + s.v, 0) / a.length;

// Timeline: night-before-last (poor, HRV ~30), last night (good, HRV ~55),
// plus evening-couch samples at 22:30 last night that the 22:00 rule wrongly called "overnight".
const H = 3600 * 1000;
const wake = new Date("2026-07-28T07:00:00Z").getTime();      // this morning
const bed  = new Date("2026-07-27T23:00:00Z").getTime();      // last night
const couch = bed - 30 * 60 * 1000;                            // 22:30, awake on the sofa
const prevBed = bed - 24 * H, prevWake = wake - 24 * H;        // the night before

const pool = [
  // night before last — low HRV
  { v: 28, t: prevBed + 1 * H }, { v: 31, t: prevBed + 3 * H }, { v: 30, t: prevWake - 1 * H },
  // evening, awake (high, not real recovery data)
  { v: 72, t: couch },
  // last night — the reading we actually want
  { v: 54, t: bed + 1 * H }, { v: 56, t: bed + 3 * H }, { v: 55, t: wake - 1 * H },
];

// 1) With a real sleep window, only last night's samples survive.
const pinned = pinToLastNight(pool, new Date(bed).toISOString(), new Date(wake).toISOString());
check("drops the older night", !pinned.some(s => s.t < prevWake + 1), `kept ${pinned.length}`);
check("drops the awake-evening sample", !pinned.some(s => s.v === 72));
check("keeps all three of last night's samples", pinned.length === 3, `got ${pinned.length}`);
check("average reflects last night only (~55)", Math.abs(mean(pinned) - 55) < 1.5, `mean ${mean(pinned).toFixed(1)}`);

// The unpinned average is dragged down by the old night and up by the couch sample — i.e. wrong,
// and it changes as those samples age out of the rolling window. That was the drift.
const rawMean = mean(pool);
check("old behaviour really was different", Math.abs(rawMean - mean(pinned)) > 5, `raw ${rawMean.toFixed(1)} vs pinned ${mean(pinned).toFixed(1)}`);

// 2) The value must not change as the day goes on (the actual complaint). Re-running later with
// the same night's data must give the same answer.
const laterSameDay = pinToLastNight(pool, new Date(bed).toISOString(), new Date(wake).toISOString());
check("stable when re-read later the same day", mean(laterSameDay) === mean(pinned));

// 3) No sleep window (HealthKit gave none) — still isolates the newest night, not two.
const noWindow = pinToLastNight(pool, null, null);
check("without sleep data, still drops the older night", !noWindow.some(s => s.t < prevWake + 1), `kept ${noWindow.length}`);

// 4) Degenerate inputs don't explode.
check("empty pool safe", Array.isArray(pinToLastNight([], null, null)));
check("single sample passed through", pinToLastNight([{ v: 50, t: wake }], null, null).length === 1);
check("garbage dates fall back instead of emptying", pinToLastNight(pool, "not-a-date", "also-bad").length > 0);

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
