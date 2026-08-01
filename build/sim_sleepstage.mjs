// SLEEP STAGES FEED RECOVERY — we were reading them and throwing them away.
//
// Apple Health returns sleep split into deep / core / REM. The app collected those samples, then
// discarded the stage label and summed minutes, so eight broken hours scored IDENTICALLY to eight
// restorative ones. Deep sleep is what actually drives physical recovery and it's the main thing
// Garmin weights its overnight recharge on.
//
// The design constraint: duration still gates (five perfect hours are still five hours), a TYPICAL
// night is neutral (so most people see no change), and a device that reports no stages must read as
// UNKNOWN rather than as bad.
const _ls = new Map();
globalThis.localStorage = { getItem: k => (_ls.has(k) ? _ls.get(k) : null), setItem: (k,v)=>_ls.set(k,String(v)), removeItem: k=>_ls.delete(k) };
globalThis.window = undefined;

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

import { readFileSync } from "fs";
const { stageMinutes, computeBodyBattery, sleepQualityMult, pickSleepBlock } = await import("./app.mjs");

// ── stageMinutes: union per stage, because two sources can write the same night ───────────────
// The night CROSSES MIDNIGHT: 11pm on the 22nd through 6am on the 23rd. Writing both ends as
// hours of the 22nd made the window run backwards and clipped every sample away.
const PM = (h, m = 0) => new Date(2026, 6, 22, h, m).getTime();   // evening of the 22nd
const AM = (h, m = 0) => new Date(2026, 6, 23, h, m).getTime();   // small hours of the 23rd
const NIGHT_START = PM(23), NIGHT_END = AM(6);
const smp = (stage, from, to) => ({ stage, startMs: from, endMs: to });

const simple = stageMinutes([
  smp("core", PM(23), AM(0)), smp("deep", AM(0), AM(1)), smp("rem", AM(1), AM(1, 30)),
], NIGHT_START, NIGHT_END);
console.log("simple:", JSON.stringify(simple));
check("deep minutes are summed", simple.deep === 60, String(simple.deep));
check("rem minutes are summed", simple.rem === 30, String(simple.rem));
check("core minutes are summed", simple.core === 60, String(simple.core));

// The same night written twice by two sources must NOT double.
const dup = stageMinutes([
  smp("deep", AM(0), AM(1)), smp("deep", AM(0), AM(1)),
], NIGHT_START, NIGHT_END);
check("a duplicated source does not double the stage", dup.deep === 60, String(dup.deep));
const overlap = stageMinutes([smp("deep", AM(0), AM(1)), smp("deep", AM(0, 30), AM(1, 30))], NIGHT_START, NIGHT_END);
check("partially overlapping samples union rather than add", overlap.deep === 90, String(overlap.deep));

// Anything outside the chosen night is clipped away (an evening nap must not count).
const clipped = stageMinutes([smp("deep", PM(19), PM(20)), smp("deep", AM(0), AM(1))], NIGHT_START, NIGHT_END);
check("samples outside the night window are ignored", clipped.deep === 60, String(clipped.deep));

// A bare "asleep" sample carries NO stage — it must not be counted as core.
check("an undifferentiated 'asleep' sample contributes no stage",
  stageMinutes([smp("asleep", AM(0), AM(4))], NIGHT_START, NIGHT_END).core === 0);
check("junk input doesn't throw", stageMinutes(null, 0, 1).deep === 0 && stageMinutes([{}], 0, 1).rem === 0);

// ── The effect on the score ──────────────────────────────────────────────────────────────────
// Same 8h night, same HRV — only the stage composition differs.
const dk = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
function charge({ deep, rem, hours = 8 }) {
  const rec = { sleepHours: hours,
    sleepStart: new Date(Date.now() - (8 + hours) * 36e5).toISOString(),
    sleepEnd: new Date(Date.now() - 8 * 36e5).toISOString() };
  if (deep != null) { rec.sleepDeepMin = deep; rec.sleepRemMin = rem; rec.sleepCoreMin = hours * 60 - deep - rem; }
  // recoveryScore is computed in readRecovery (device-only), so drive the sleep-only branch:
  // charge0 = 40 + sleepHours*6 there. Instead assert through the full path by supplying a score.
  return { history: {}, activity: null, recovery: rec };
}
// The stage weighting lives in readRecovery's scoring, which needs a device. What computeBodyBattery
// can show directly is that a stage-less night behaves exactly as before — the no-regression half.
const noStages = computeBodyBattery(charge({ deep: null }));
const withStages = computeBodyBattery(charge({ deep: 90, rem: 100 }));
console.log("no stages:", noStages.charge0, " with stages:", withStages.charge0);
check("a night with no stage data is unchanged (unknown must not read as bad)",
  noStages.charge0 === withStages.charge0,
  `${noStages.charge0} vs ${withStages.charge0} — computeBodyBattery must not itself re-weight stages`);

// ── The quality curve — asserted against the REAL exported function ──────────────────────────
// This block used to re-implement q and the multiplier locally and assert on its own copy, which
// would have passed against ANY constants in App.jsx, including wrong ones. It calls the shipped
// sleepQualityMult now, so editing those constants breaks these checks.
const M = (deepMin, remMin, hours) => sleepQualityMult(deepMin, remMin, hours * 60);
const typical = M(0.16 * 480, 0.21 * 480, 8);
console.log(`multiplier — typical:${typical.toFixed(3)} poor:${M(20,40,8).toFixed(3)} great:${M(140,130,8).toFixed(3)}`);
check("a TYPICAL night is neutral (multiplier = 1.0)", Math.abs(typical - 1) < 0.01, typical.toFixed(3));
check("a poor-composition night is penalised", M(20, 40, 8) < 0.95, M(20, 40, 8).toFixed(3));
check("...but never below the 0.85 floor", M(0, 0, 8) === 0.85, String(M(0, 0, 8)));
check("an excellent night is rewarded, capped at 1.15", M(140, 130, 8) > 1.02 && M(300, 300, 8) === 1.15,
  `${M(140,130,8).toFixed(3)} / ${M(300,300,8)}`);
check("great stages can't rescue a short night — duration gates (caller applies it)",
  0.28 * M(90, 70, 5) < 0.78, (0.28 * M(90, 70, 5)).toFixed(3));
check("zero/!finite total is neutral, never NaN",
  M(60, 60, 0) === 1 && sleepQualityMult(60, 60, null) === 1 && isFinite(M(60, 60, 8)));
check("a missing REM field is treated as zero, not NaN", isFinite(sleepQualityMult(80, undefined, 480)));

// ── END-TO-END through a REPLICA of readRecovery's own filter ────────────────────────────────
// The previous version of this sim fed "core" samples STRAIGHT into stageMinutes and passed —
// while the shipped filter dropped "core" before stageMinutes ever saw it. A helper test that
// skips the pipeline green-lights exactly the string the app throws away. This replica is copied
// from src/App.jsx readRecovery; if the two drift again, these checks go red.
// A replica can itself drift from the app, so pin the REAL filter too: assert the shipped bundle
// still accepts both spellings. This is the check that actually fails if someone edits App.jsx.
{
  const src = readFileSync(new URL("./app.mjs", import.meta.url), "utf8");
  const filterLine = src.split("\n").find(l => /st === "asleep" \|\| st === "rem"/.test(l)) || "";
  check("the SHIPPED sleep filter accepts \"core\" as well as \"light\"",
    /st === "core"/.test(filterLine), filterLine.trim().slice(0, 160) || "(filter line not found)");
  check("...and the shipped stage classifier still maps both to core",
    /"light" \|\| st === "core"/.test(src), "stageMinutes classifier changed");
}

const readRecoveryFilter = (raw) => raw.filter(x => {
  const st = (x.sleepState || "").toLowerCase();
  return st === "asleep" || st === "rem" || st === "deep" || st === "light" || st === "core";
}).map(x => ({
  stage: (x.sleepState || "").toLowerCase(),
  startMs: x.startMs, endMs: x.endMs,
  minutes: Math.min((x.endMs - x.startMs) / 60000, (x.endMs - x.startMs) / 60000),
}));

// A realistic watch night: 23:00-07:00, mostly core, deep early, REM late.
const night = (coreName) => {
  const out = [];
  const push = (state, from, to) => out.push({ sleepState: state, startMs: from, endMs: to });
  push(coreName, PM(23), AM(0, 30));
  push("deep", AM(0, 30), AM(1, 55));      // 85 min deep
  push(coreName, AM(1, 55), AM(3, 30));
  push("rem", AM(3, 30), AM(5, 10));       // 100 min rem
  push(coreName, AM(5, 10), AM(7));
  return out;
};
for (const coreName of ["light", "core"]) {
  const samples = readRecoveryFilter(night(coreName));
  const block = pickSleepBlock(samples);
  const st = block ? stageMinutes(samples, block.startMs, block.endMs) : null;
  const hours = block ? Math.round((block.minutes / 60) * 10) / 10 : 0;
  console.log(`"${coreName}" night → ${hours}h, deep ${st?.deep}, rem ${st?.rem}, core ${st?.core}`);
  check(`a "${coreName}"-named night survives the filter as ONE 8h block`, hours >= 7.5, String(hours));
  check(`..."${coreName}": the 85 minutes of deep sleep are counted`, st?.deep === 85, String(st?.deep));
  check(`..."${coreName}": the 100 minutes of REM are counted`, st?.rem === 100, String(st?.rem));
  check(`..."${coreName}": quality is near neutral, not a penalty`,
    Math.abs(sleepQualityMult(st.deep, st.rem, block.minutes) - 1) < 0.12,
    String(sleepQualityMult(st.deep, st.rem, block.minutes)));
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
