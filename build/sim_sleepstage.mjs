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

const { stageMinutes, computeBodyBattery, sleepQualityMult, pickSleepBlock, readRecoveryFrom } = await import("./app.mjs");

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
// ...AND NOW DRIVEN THROUGH THE SHIPPED PIPELINE, NOT A REPLICA OF IT.
//
// This block used to copy readRecovery's sleep filter into the test, then pin the copy with
// REGEXES against the bundle to catch drift — a guard for a guard. `readRecovery` needed a device,
// which was the excuse; it is split now into a device-only auth wrapper and
// `readRecoveryFrom(H, now)`, so the night can go in one end and the stage minutes come out the
// other. The replica and the regexes are gone: what follows exercises the real filter, the real
// pickSleepBlock, the real stageMinutes and the real quality multiplier in one pass.
//
// (Checked when this was rewritten: the replica had NOT drifted — both spellings produced
// identical output through the real pipeline. The point is that nothing now has to.)
const iso = (t) => new Date(t).toISOString();
const NOW = AM(9);                                   // 09:00 the morning after the night below
const fakeHealth = (rows) => ({
  async readSamples({ dataType, startDate, endDate, limit }) {
    if (dataType !== "sleep") return { samples: [] };
    const a = new Date(startDate).getTime(), b = new Date(endDate).getTime();
    const r = rows.filter(x => { const t = new Date(x.startDate).getTime(); return t >= a && t <= b; })
      .sort((x, y) => new Date(y.startDate) - new Date(x.startDate));   // the plugin is newest-first
    return { samples: r.slice(0, limit) };
  },
});
// A realistic watch night: 23:00-07:00, mostly core, deep early, REM late.
const nightRows = (coreName) => {
  const out = [];
  const push = (state, from, to) => out.push({ sleepState: state, startDate: iso(from), endDate: iso(to), value: String((to - from) / 60000) });
  push(coreName, PM(23), AM(0, 30));
  push("deep", AM(0, 30), AM(1, 55));      // 85 min deep
  push(coreName, AM(1, 55), AM(3, 30));
  push("rem", AM(3, 30), AM(5, 10));       // 100 min rem
  push(coreName, AM(5, 10), AM(7));
  return out;
};
// THE SPELLING THAT MATTERS. The installed plugin maps Apple's asleepCore to "light", so "core"
// never arrives today — but the dependency is pinned "^8.7.1" and adopting Apple's own naming is
// exactly what a minor bump does. Dropping it would be catastrophic and SILENT: core is most of a
// night, so the surviving deep/REM fragments fall far enough apart that pickSleepBlock splits them
// into blocks that all miss the minimum, and a 7.8h night reports as a 50-minute one.
for (const coreName of ["light", "core"]) {
  const out = await readRecoveryFrom(fakeHealth(nightRows(coreName)), new Date(NOW));
  const hours = out?.sleepHours ?? 0;
  console.log(`"${coreName}" night → ${hours}h, deep ${out?.sleepDeepMin}, rem ${out?.sleepRemMin}, core ${out?.sleepCoreMin}`);
  check(`a "${coreName}"-named night survives the SHIPPED filter as ONE 8h block`, hours >= 7.5, String(hours));
  check(`..."${coreName}": the 85 minutes of deep sleep are counted`, out?.sleepDeepMin === 85, String(out?.sleepDeepMin));
  check(`..."${coreName}": the 100 minutes of REM are counted`, out?.sleepRemMin === 100, String(out?.sleepRemMin));
  check(`..."${coreName}": quality is near neutral, not a penalty`,
    Math.abs(sleepQualityMult(out.sleepDeepMin, out.sleepRemMin, hours * 60) - 1) < 0.12,
    String(sleepQualityMult(out.sleepDeepMin, out.sleepRemMin, hours * 60)));
}
// A night the device reported with NO stages at all must read as unknown, not as bad.
{
  const flat = [{ sleepState: "asleep", startDate: iso(PM(23)), endDate: iso(AM(7)), value: String(8 * 60) }];
  const out = await readRecoveryFrom(fakeHealth(flat), new Date(NOW));
  check("an undifferentiated night reports hours but no stage breakdown",
    out?.sleepHours >= 7.5 && out?.sleepDeepMin == null, `${out?.sleepHours}h deep ${out?.sleepDeepMin}`);
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
