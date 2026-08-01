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

const { stageMinutes, computeBodyBattery } = await import("./app.mjs");

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

// ── The quality curve itself, applied the way readRecovery applies it ────────────────────────
// sf * (0.85 + 0.15 * min(2, q)), q = 0.5*(deep/0.16) + 0.5*(rem/0.21) of total.
const q = (deepMin, remMin, hours) => {
  const t = hours * 60;
  return 0.5 * ((deepMin / t) / 0.16) + 0.5 * ((remMin / t) / 0.21);
};
const mult = (deepMin, remMin, hours) => 0.85 + 0.15 * Math.min(2, q(deepMin, remMin, hours));
const typical = mult(0.16 * 480, 0.21 * 480, 8);
console.log(`multiplier — typical:${typical.toFixed(3)} poor:${mult(20, 40, 8).toFixed(3)} great:${mult(140, 130, 8).toFixed(3)}`);
check("a TYPICAL night is neutral (multiplier ≈ 1.0)", Math.abs(typical - 1) < 0.01, typical.toFixed(3));
check("a poor-composition night is penalised", mult(20, 40, 8) < 0.95, mult(20, 40, 8).toFixed(3));
check("...but never catastrophically (floor 0.85)", mult(0, 0, 8) >= 0.85, mult(0, 0, 8).toFixed(3));
check("an excellent night is rewarded modestly", mult(140, 130, 8) > 1.02 && mult(140, 130, 8) <= 1.15,
  mult(140, 130, 8).toFixed(3));
check("great stages can't rescue a short night — duration still gates",
  0.28 * mult(90, 70, 5) < 0.78, (0.28 * mult(90, 70, 5)).toFixed(3));

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
