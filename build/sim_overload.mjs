// PROGRESSIVE OVERLOAD — "make it smarter, more accurate and reliable".
// The old engine judged everything from a SINGLE previous session with a flat +5 lb / +2.5 kg and
// no awareness of RPE. Three things were wrong in practice:
//   1. a stall was invisible — three failed attempts at 185 each produced another cheerful "+5"
//   2. the increment ignored the load — 1.5% on a 315 deadlift, 20% on a 25 lb lateral raise
//   3. RPE was collected by the app and then ignored, so it would add weight on top of a grinder
// These check the new behaviour AND that ordinary double progression is untouched.
import { suggestNextSet, loadIncrement, getExerciseTrend, parseRepRange } from "./app.mjs";

let fails = 0;
const check = (l,c,d)=>{ if(c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d?" — "+d:""}`);} };
const dayKey = (off) => { const d = new Date(); d.setDate(d.getDate()-off);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
// sessions: [{ daysAgo, sets:[{w,r,rpe}] }] — newest ordering doesn't matter, keyed by date.
const mkStore = (name, sessions, unit="lbs") => {
  const history = {};
  for (const s of sessions) {
    history[dayKey(s.daysAgo)] = { ["s"+s.daysAgo]: { name:"Day", unit,
      finishedAt: Date.now() - s.daysAgo*864e5,
      exercises: [{ name, sets: s.sets.map(x => ({ weight:String(x.w), reps:String(x.r), done:true,
        type:"normal", ...(x.rpe ? { rpe:String(x.rpe) } : {}) })) }] } };
  }
  return { history, unit };
};
const sets = (w, r, rpe) => [{ w, r, rpe }, { w, r, rpe }, { w, r, rpe }];

// ── 0. Rep-range parsing. Program days store "4×8-12" (a set count then the target), which used
// to parse as null — so double progression never ran at all for a workout started from a program.
check('parses a bare range "6-8"', JSON.stringify(parseRepRange("6-8")) === '{"low":6,"high":8}', JSON.stringify(parseRepRange("6-8")));
check('parses a program day "4×8-12"', JSON.stringify(parseRepRange("4×8-12")) === '{"low":8,"high":12}', JSON.stringify(parseRepRange("4×8-12")));
check('parses "3x5" as five reps, not a 3-5 range', JSON.stringify(parseRepRange("3x5")) === '{"low":5,"high":5}', JSON.stringify(parseRepRange("3x5")));
check('a genuine "3-5" range is still a range', JSON.stringify(parseRepRange("3-5")) === '{"low":3,"high":5}', JSON.stringify(parseRepRange("3-5")));
check('parses "8-12 reps"', JSON.stringify(parseRepRange("8-12 reps")) === '{"low":8,"high":12}', JSON.stringify(parseRepRange("8-12 reps")));
check('a reversed range is normalised', JSON.stringify(parseRepRange("12-8")) === '{"low":8,"high":12}', JSON.stringify(parseRepRange("12-8")));
check('"AMRAP" is not a range', parseRepRange("AMRAP") === null);
check('empty is not a range', parseRepRange("") === null);

// ── 1. Load-scaled increment ─────────────────────────────────────────────────────────────────
check("light load keeps the minimum plate jump (+5)", loadIncrement(60, "lbs") === 5, `${loadIncrement(60,"lbs")}`);
check("135 lb gets +5", loadIncrement(135, "lbs") === 5, `${loadIncrement(135,"lbs")}`);
check("315 lb gets a bigger jump (+10)", loadIncrement(315, "lbs") === 10, `${loadIncrement(315,"lbs")}`);
check("500 lb gets +15, not +5", loadIncrement(500, "lbs") === 15, `${loadIncrement(500,"lbs")}`);
check("increment is capped (+20 max)", loadIncrement(2000, "lbs") === 20, `${loadIncrement(2000,"lbs")}`);
check("kg uses 2.5 kg steps", loadIncrement(60, "kg") === 2.5, `${loadIncrement(60,"kg")}`);
check("200 kg scales to 5 kg", loadIncrement(200, "kg") === 5, `${loadIncrement(200,"kg")}`);

// A heavy lift that hit the top of its range should now advance by more than the old flat +5.
const heavy = mkStore("Deadlift", [{ daysAgo: 4, sets: sets(315, 8) }]);
const sHeavy = suggestNextSet(heavy, "Deadlift", "3×6-8", "lbs", 0);
check("heavy lift advances by the scaled increment", sHeavy?.type === "weight" && sHeavy.weight === 325, `${sHeavy?.type} ${sHeavy?.weight}`);

// ── 2. Stall detection ───────────────────────────────────────────────────────────────────────
// FOUR sessions, not three. The per-set suggestion used to run its own 3-session stall test while
// the plateau banner above it required 4 — two thresholds, two verdicts, and on session three you
// got deload chips with no banner explaining them. They are one call now, and the banner's 4 is
// the number that survived, because it was chosen deliberately to cut false positives and false
// positives are the entire complaint this consolidation came from.
const stalled = mkStore("Bench Press", [
  { daysAgo: 3,  sets: sets(185, 5) },
  { daysAgo: 10, sets: sets(185, 5) },
  { daysAgo: 17, sets: sets(185, 5) },
  { daysAgo: 24, sets: sets(185, 5) },
]);
const sStall = suggestNextSet(stalled, "Bench Press", "3×5-8", "lbs", 0);
check("four flat sessions trigger a deload", sStall?.type === "deload", `got ${sStall?.type}`);
check("deload is ~10% and lands on a real plate", sStall?.weight === 165, `${sStall?.weight}`);
check("deload explains itself", /stuck/i.test(sStall?.reason||""), `"${sStall?.reason}"`);

// Same weight but reps CLIMBING is double progression working — must NOT be called a stall.
const working = mkStore("Bench Press", [
  { daysAgo: 3,  sets: sets(185, 7) },
  { daysAgo: 10, sets: sets(185, 6) },
  { daysAgo: 17, sets: sets(185, 5) },
]);
const sWork = suggestNextSet(working, "Bench Press", "3×5-8", "lbs", 0);
check("climbing reps at one weight is NOT a stall", sWork?.type !== "deload", `got ${sWork?.type}`);
check("...it keeps pushing reps", sWork?.type === "reps" && sWork.reps === 8, `${sWork?.type} ${sWork?.reps}`);

// Two flat sessions is not yet a stall — don't panic early.
const twice = mkStore("Bench Press", [
  { daysAgo: 3,  sets: sets(185, 5) },
  { daysAgo: 10, sets: sets(185, 5) },
]);
check("two flat sessions do not deload yet", suggestNextSet(twice, "Bench Press", "3×5-8", "lbs", 0)?.type !== "deload");

// AUDIT REGRESSION: a stall needs a rep RANGE. Without one there is no target to fail against, so
// holding a steady load on an accessory (Quick Workout logs reps as "") is deliberate, not stuck —
// the first version deloaded it, which is the opposite of the right advice.
const steady = mkStore("Cable Fly", [
  { daysAgo: 3,  sets: sets(100, 12) },
  { daysAgo: 10, sets: sets(100, 12) },
  { daysAgo: 17, sets: sets(100, 12) },
]);
for (const target of ["", null, undefined, "AMRAP"]) {
  const r = suggestNextSet(steady, "Cable Fly", target, "lbs", 0);
  check(`no rep range (${JSON.stringify(target)}) never deloads`, r?.type !== "deload", `got ${r?.type} "${r?.reason}"`);
}
check("no-range steady load still progresses", suggestNextSet(steady, "Cable Fly", "", "lbs", 0)?.type === "weight");
// ...while the SAME history with a range is judged on the range (12 is the top → add weight).
check("with a range, the same history adds weight", suggestNextSet(steady, "Cable Fly", "3×10-12", "lbs", 0)?.type === "weight");

// AUDIT REGRESSION: the deload note rounded a 2.5 kg drop to "-3 kg".
const kgStall = mkStore("Curl", [
  { daysAgo: 3,  sets: sets(25, 8) },
  { daysAgo: 10, sets: sets(25, 8) },
  { daysAgo: 17, sets: sets(25, 8) },
  { daysAgo: 24, sets: sets(25, 8) },
], "kg");
const rKg = suggestNextSet(kgStall, "Curl", "3×10-12", "kg", 0);
check("kg deload note matches the actual drop", rKg?.type === "deload" && rKg.note === `−${25 - rKg.weight} kg`,
  `weight ${rKg?.weight}, note "${rKg?.note}"`);

// ── 3. RPE awareness ─────────────────────────────────────────────────────────────────────────
const grind = mkStore("Back Squat", [{ daysAgo: 4, sets: sets(225, 8, 10) }]);
const sGrind = suggestNextSet(grind, "Back Squat", "3×6-8", "lbs", 0);
check("hitting the top at RPE 10 does NOT add weight", sGrind?.type === "match" && sGrind.weight === 225, `${sGrind?.type} ${sGrind?.weight}`);
check("...and says why", /grind/i.test(sGrind?.reason||""), `"${sGrind?.reason}"`);

const breezy = mkStore("Back Squat", [{ daysAgo: 4, sets: sets(225, 8, 6) }]);
const sEasy = suggestNextSet(breezy, "Back Squat", "3×6-8", "lbs", 0);
check("hitting the top at RPE 6 takes a double jump", sEasy?.type === "weight" && sEasy.weight === 235, `${sEasy?.type} ${sEasy?.weight}`);

const normal = mkStore("Back Squat", [{ daysAgo: 4, sets: sets(225, 8, 8) }]);
const sNorm = suggestNextSet(normal, "Back Squat", "3×6-8", "lbs", 0);
check("a normal RPE 8 takes the single scaled jump", sNorm?.type === "weight" && sNorm.weight === 230, `${sNorm?.type} ${sNorm?.weight}`);

// ── 4. Light isolation work — reps before an outsized jump ───────────────────────────────────
const raise = mkStore("Lateral Raise", [{ daysAgo: 4, sets: sets(20, 12) }]);
const sRaise = suggestNextSet(raise, "Lateral Raise", "3×10-12", "lbs", 0);
check("light isolation earns reps instead of a 25% jump", sRaise?.type === "reps" && sRaise.weight === 20, `${sRaise?.type} ${sRaise?.weight}`);
check("...and explains the jump is too big", /big jump/i.test(sRaise?.reason||""), `"${sRaise?.reason}"`);
// Once clear of the range top it does finally add the plate.
const raiseEarned = mkStore("Lateral Raise", [{ daysAgo: 4, sets: sets(20, 14) }]);
const sEarned = suggestNextSet(raiseEarned, "Lateral Raise", "3×10-12", "lbs", 0);
check("earned reps finally unlock the weight jump", sEarned?.type === "weight" && sEarned.weight === 25, `${sEarned?.type} ${sEarned?.weight}`);

// ── 5. Ordinary double progression is unchanged ──────────────────────────────────────────────
const mid = mkStore("Row", [{ daysAgo: 4, sets: sets(135, 6) }]);
const sMid = suggestNextSet(mid, "Row", "3×6-8", "lbs", 0);
check("under the top → push reps at the same weight", sMid?.type === "reps" && sMid.weight === 135 && sMid.reps === 7, `${sMid?.type} ${sMid?.weight}x${sMid?.reps}`);
const top = mkStore("Row", [{ daysAgo: 4, sets: sets(135, 8) }]);
const sTop = suggestNextSet(top, "Row", "3×6-8", "lbs", 0);
check("at the top → add the plate, reset to range low", sTop?.type === "weight" && sTop.weight === 140 && sTop.reps === 6, `${sTop?.type} ${sTop?.weight}x${sTop?.reps}`);

// ── 6. Layoff deload still wins over everything ──────────────────────────────────────────────
const stale = mkStore("Bench Press", [{ daysAgo: 30, sets: sets(185, 8) }]);
const sStale = suggestNextSet(stale, "Bench Press", "3×5-8", "lbs", 0);
check("a month off triggers the layoff deload", sStale?.type === "deload" && /break/i.test(sStale.reason||""), `${sStale?.type} "${sStale?.reason}"`);

// ── 7. Reliability / degenerate input ────────────────────────────────────────────────────────
check("no history → no suggestion", suggestNextSet({ history:{} }, "Bench Press", "3×5", "lbs", 0) === null);
check("unknown exercise → no suggestion", suggestNextSet(mid, "Nonexistent", "3×5", "lbs", 0) === null);
const bwOnly = mkStore("Pull Up", [{ daysAgo: 4, sets: sets(0, 10) }]);
check("bodyweight (0 lb) sets don't crash or suggest", suggestNextSet(bwOnly, "Pull Up", "3×8-10", "lbs", 0) === null);
check("trend reads newest-first", (() => { const t = getExerciseTrend(working, "Bench Press", "lbs", 0, 4);
  return t.length === 3 && t[0].r === 7 && t[2].r === 5; })());
check("trend carries RPE when logged", getExerciseTrend(grind, "Back Squat", "lbs", 0, 4)[0]?.rpe === 10);

console.log(`\n${fails===0?"ALL PASS":fails+" FAIL(S)"}`);
process.exit(fails?1:0);
