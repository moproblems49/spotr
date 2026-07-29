// SLEEP WINDOW — Mo's Body Battery reported "bed 7am, up 8pm". Cause: HealthKit returns many
// short per-stage samples, and the old rule kept every sample ending within 14h of the newest end
// and then took min(start)/max(end) across that merged set. With an evening nap in the lookback,
// the surviving fragments were "the tail of last night" (starting ~7am) and "the nap" (ending
// ~8pm) — a window describing neither. pickSleepBlock groups into contiguous blocks instead.
import { pickSleepBlock, computeBodyBatteryTimeline } from "./app.mjs";

let fails = 0;
const check = (l,c,d)=>{ if(c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d?" — "+d:""}`);} };
const H = 36e5;
const at = (dayOffset, hour, min=0) => { const d = new Date(); d.setHours(hour, min, 0, 0); d.setDate(d.getDate()+dayOffset); return d.getTime(); };
const hhmm = (ms) => new Date(ms).toTimeString().slice(0,5);
const frag = (s,e) => ({ startMs:s, endMs:e, minutes:(e-s)/60000 });

// ── The exact reported shape: last night in ~40min stage fragments + an evening nap ──────────
const night = [];
for (let t = at(-1, 23, 0); t < at(0, 7, 0); t += 40*60000) night.push(frag(t, Math.min(t + 40*60000, at(0,7,0))));
const nap = [frag(at(0, 19, 20), at(0, 20, 0))];   // 40-minute doze on the sofa
const withNap = [...night, ...nap];

// Reproduce the OLD algorithm to prove the fixture really does produce Mo's symptom.
const oldWay = (samples) => {
  const latestEnd = Math.max(0, ...samples.map(s => s.endMs || 0));
  const kept = samples.filter(s => (s.endMs || 0) >= latestEnd - 14 * H);
  return { startMs: Math.min(...kept.map(s => s.startMs)), endMs: Math.max(...kept.map(s => s.endMs)) };
};
const old = oldWay(withNap);
check("fixture reproduces the reported bug under the OLD rule",
  (old.endMs - old.startMs) / H > 12 && new Date(old.startMs).getHours() >= 5 && new Date(old.startMs).getHours() <= 9 && hhmm(old.endMs) === "20:00",
  `old rule said ${hhmm(old.startMs)} → ${hhmm(old.endMs)}`);
console.log(`     (old rule: slept ${hhmm(old.startMs)} → ${hhmm(old.endMs)} = ${((old.endMs-old.startMs)/H).toFixed(1)}h)`);

// ── The fix ──────────────────────────────────────────────────────────────────────────────────
const b = pickSleepBlock(withNap);
check("picks last night, not the nap-merged span", hhmm(b.startMs) === "23:00" && hhmm(b.endMs) === "07:00", `${hhmm(b.startMs)} → ${hhmm(b.endMs)}`);
check("span is a plausible night (8h)", Math.abs((b.endMs - b.startMs)/H - 8) < 0.1, `${((b.endMs-b.startMs)/H).toFixed(1)}h`);
check("sleep minutes exclude the nap", Math.abs(b.minutes/60 - 8) < 0.1, `${(b.minutes/60).toFixed(1)}h`);

// ── Brief wakes inside one night must NOT split it ───────────────────────────────────────────
const brokenNight = [frag(at(-1,23,0), at(0,2,30)), frag(at(0,3,10), at(0,7,0))]; // 40min awake
const bn = pickSleepBlock(brokenNight);
check("a 40-minute wake mid-night stays ONE night", hhmm(bn.startMs) === "23:00" && hhmm(bn.endMs) === "07:00", `${hhmm(bn.startMs)} → ${hhmm(bn.endMs)}`);
check("awake time is not counted as sleep", Math.abs(bn.minutes/60 - 7.33) < 0.1, `${(bn.minutes/60).toFixed(2)}h`);

// ── A long gap DOES split (nap in the afternoon, night before) ────────────────────────────────
const twoNights = [frag(at(-2,23,0), at(-1,7,0)), frag(at(-1,23,0), at(0,6,30))];
const tn = pickSleepBlock(twoNights);
check("two separate nights → the most recent one", hhmm(tn.startMs) === "23:00" && hhmm(tn.endMs) === "06:30", `${hhmm(tn.startMs)} → ${hhmm(tn.endMs)}`);

// ── Night shift: the most recent REAL sleep wins even when it's a daytime block ───────────────
const nightShift = [frag(at(0, 8, 0), at(0, 15, 0))]; // slept 8am-3pm
const ns = pickSleepBlock(nightShift);
check("night-shift daytime sleep is accepted", hhmm(ns.startMs) === "08:00" && hhmm(ns.endMs) === "15:00", `${hhmm(ns.startMs)} → ${hhmm(ns.endMs)}`);

// ── Naps only: take the longest rather than inventing a night ────────────────────────────────
const napsOnly = [frag(at(0,13,0), at(0,13,25)), frag(at(0,17,0), at(0,18,10))];
const no = pickSleepBlock(napsOnly);
check("naps-only falls back to the longest nap", hhmm(no.startMs) === "17:00" && hhmm(no.endMs) === "18:10", `${hhmm(no.startMs)} → ${hhmm(no.endMs)}`);

// AUDIT REGRESSION: two sources (Apple Watch + a sleep app) writing the SAME night must not be
// summed — that reported one 8h night as 16h of sleep inside an 8h window.
const oneSource = [];
for (let t = at(-1,23,0); t < at(0,7,0); t += 2*H) oneSource.push(frag(t, t + 2*H));
const dup = pickSleepBlock([...oneSource, ...oneSource.map(f => ({ ...f }))]);
const solo = pickSleepBlock(oneSource);
check("duplicate sources don't inflate sleep hours", Math.abs(dup.minutes - solo.minutes) < 1, `solo ${(solo.minutes/60).toFixed(1)}h vs dup ${(dup.minutes/60).toFixed(1)}h`);
check("duplicate sources keep the right window", hhmm(dup.startMs) === "23:00" && hhmm(dup.endMs) === "07:00", `${hhmm(dup.startMs)} → ${hhmm(dup.endMs)}`);
check("sleep never exceeds the window it sits in", dup.minutes <= (dup.endMs - dup.startMs)/60000 + 1, `${(dup.minutes/60).toFixed(1)}h in a ${((dup.endMs-dup.startMs)/H).toFixed(1)}h window`);
// Partially overlapping (not identical) samples also only count once.
const overlap = [frag(at(-1,23,0), at(0,3,0)), frag(at(0,1,0), at(0,7,0))];
const ov = pickSleepBlock(overlap);
check("partial overlap counts the union, not the sum", Math.abs(ov.minutes/60 - 8) < 0.1, `${(ov.minutes/60).toFixed(1)}h (sum would be 10)`);
// A sample reporting LESS sleep than its own span (aggregate row net of time awake) is respected.
const netOfAwake = [{ startMs: at(-1,23,0), endMs: at(0,7,0), minutes: 400 }]; // 8h window, 6.7h asleep
check("a row reporting less than its span keeps its own number", Math.abs(pickSleepBlock(netOfAwake).minutes - 400) < 1, `${pickSleepBlock(netOfAwake).minutes}`);

// ── Degenerate input ─────────────────────────────────────────────────────────────────────────
check("empty input returns null", pickSleepBlock([]) === null);
check("null input returns null", pickSleepBlock(null) === null);
check("samples with no timestamps are dropped", pickSleepBlock([{ startMs:null, endMs:null, minutes:400 }]) === null);
check("inverted sample (end before start) is dropped", pickSleepBlock([{ startMs: at(0,7,0), endMs: at(0,1,0), minutes:60 }]) === null);

// ── Defence in depth: a bad window ALREADY in the store must not drive the chart ──────────────
const NOW = Date.now();
const mkStore = (startMs, endMs) => ({
  currentUserId:"u1", history:{},
  recovery:{ recoveryScore:0.7, hrv:44, hrvBaseline:40, restingHr:58, rhrBaseline:60, sleepHours:7.5,
    sleepStart:new Date(startMs).toISOString(), sleepEnd:new Date(endMs).toISOString() },
});
// Both windows END 2h ago so the freshness rule (wake within 20h, not in the future) can't be
// what decides the outcome — the only difference is span vs the 7.5h of sleep it claims.
const badStart = NOW - 15*H, badEnd = NOW - 2*H;     // 13h window around 7.5h of sleep = merged
const goodStart = NOW - 10.5*H, goodEnd = NOW - 2*H; // 8.5h window around 7.5h of sleep = a night
const bad = computeBodyBatteryTimeline(mkStore(badStart, badEnd));
const good = computeBodyBatteryTimeline(mkStore(goodStart, goodEnd));
// Assert on the SPAN the chart ended up using, not on the start time: the 10pm fallback can land
// within half an hour of the fixture's start depending on the wall-clock hour the sim runs at,
// which made a distance-from-fixture check flaky rather than wrong.
const spanOf = (t) => (t.wakeTimeMs - t.sleepStartMs) / H;
check("chart REJECTS a persisted 13h window that claims only 7.5h of sleep",
  bad && Math.abs(spanOf(bad) - 13) > 1, `chart used a ${spanOf(bad).toFixed(1)}h window`);
check("chart still accepts a plausible 8.5h window",
  good && Math.abs(spanOf(good) - 8.5) < 0.1 && Math.abs(good.sleepStartMs - goodStart) < 60000,
  `chart used a ${spanOf(good).toFixed(1)}h window starting ${hhmm(good.sleepStartMs)}`);

console.log(`\n${fails===0?"ALL PASS":fails+" FAIL(S)"}`);
process.exit(fails?1:0);
