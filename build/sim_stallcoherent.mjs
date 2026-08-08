// A PLATEAU IS A FACT ABOUT THE LIFT, NOT ABOUT A ROW IN A TABLE.
//
// Built from Mo's real Lateral Raises (Cable) history, screenshotted from his phone Aug 8:
//
//   Jul 20   40x12  40x11  40x10  40x8    1640 vol
//   Jul 30   40x12  40x12  40x10  40x9    1720 vol
//   Aug  3   40x12  40x12  40x10  40x10   1760 vol
//
// Every session better than the last. What the shipped app told him on Aug 8:
//
//   "Plateau detected — try a deload: drop to ~35 lbs and rebuild with clean reps"
//   set 1  < 35x15      <- deload
//   set 2  ^ 40x13      <- add reps
//   set 3  < 35x15      <- deload
//   set 4  ^ 40x11      <- add reps
//
// Two independent faults, both reproduced below:
//
//  1. THE PROGRESS TEST ONLY LOOKED AT THE TOP SET. `topReps` is the reps of the heaviest set, and
//     he opens 40x12 every time, so that series is 12/12/12 while sets 2 and 4 climb underneath it.
//     The `repsFlat` guard existed precisely to stop "quietly adding reps at the same weight" being
//     called a plateau and it could not see three quarters of the exercise.
//
//  2. THE BANNER AND THE CHIPS WERE SEPARATE TESTS. Each chip asked whether ITS OWN set index had
//     gained reps since three sessions ago, so rows with different rep histories reached opposite
//     verdicts one line apart.
//
// Both are now one call: `detectDeloadNeeded`, which every chip defers to.
import { detectDeloadNeeded, suggestNextSet, exerciseProgressed } from "./app.mjs";

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const EX = "Lateral Raises (Cable)";
const TARGET = "12-15";
const day = n => { const d = new Date(Date.now() - n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const sets = pairs => pairs.map(([w, r]) => ({ weight: String(w), reps: String(r), done: true, type: "normal" }));
const store = (rows, name = EX) => ({
  history: Object.fromEntries(rows.map(([n, pairs], i) => [day(n),
    { [`s${i}`]: { unit: "lbs", exercises: [{ name, sets: sets(pairs) }] } }])),
});

const MO = store([
  [2,  [[40, 12], [40, 12], [40, 10], [40, 10]]],
  [9,  [[40, 12], [40, 12], [40, 10], [40, 9]]],
  [19, [[40, 12], [40, 11], [40, 10], [40, 8]]],
  [26, [[40, 12], [40, 11], [40, 10], [40, 8]]],
  [33, [[40, 11], [40, 10], [40, 10], [40, 8]]],
]);

// ── 1. Mo's own history must not read as a plateau ───────────────────────────────────────────
{
  const dl = detectDeloadNeeded(MO, EX, "lbs", TARGET);
  console.log(`Mo's real history -> ${dl.stalled ? "STALLED: " + dl.suggestion : "not stalled"}`);
  check("a lifter whose volume rose every session is not told to deload", !dl.stalled);
  check("...and the exercise-wide progress test sees it",
    exerciseProgressed([
      { topWeight: 40, topReps: 12, volume: 1760, unit: "lbs", sets: [{ r: 12 }, { r: 12 }, { r: 10 }, { r: 10 }] },
      { topWeight: 40, topReps: 12, volume: 1720, unit: "lbs", sets: [{ r: 12 }, { r: 12 }, { r: 10 }, { r: 9 }] },
      { topWeight: 40, topReps: 12, volume: 1640, unit: "lbs", sets: [{ r: 12 }, { r: 11 }, { r: 10 }, { r: 8 }] },
      { topWeight: 40, topReps: 12, volume: 1640, unit: "lbs", sets: [{ r: 12 }, { r: 11 }, { r: 10 }, { r: 8 }] },
    ], "lbs"));
}

// ── 2. Every row of one exercise must give the SAME verdict ──────────────────────────────────
// This is the check that would have caught "set 1 deload, set 2 add reps" on the screenshot.
{
  const kinds = [0, 1, 2, 3].map(i => suggestNextSet(MO, EX, TARGET, "lbs", i));
  kinds.forEach((s, i) => console.log(`  set ${i + 1}: ${s.type} ${s.weight}x${s.reps}  (${s.reason})`));
  const deloads = kinds.filter(s => s.type === "deload").length;
  check("no row tells him to deload", deloads === 0, `${deloads} of 4 did`);
  check("the rows agree with the banner", deloads === 0 && !detectDeloadNeeded(MO, EX, "lbs", TARGET).stalled);
}

// ── 3. A GENUINE plateau must still be caught — all four rows, and the banner ─────────────────
// Nothing moves anywhere: same weight, same reps, same volume, five sessions running.
{
  const flat = store([2, 9, 16, 23, 30].map(n => [n, [[40, 12], [40, 11], [40, 10], [40, 9]]]));
  const dl = detectDeloadNeeded(flat, EX, "lbs", TARGET);
  console.log(`genuinely flat history -> ${dl.stalled ? "STALLED, deload to " + dl.deloadWeight : "not stalled"}`);
  check("a real plateau still fires", dl.stalled);
  check("...at 10% off, snapped to a plate", dl.deloadWeight === 35, String(dl.deloadWeight));
  const kinds = [0, 1, 2, 3].map(i => suggestNextSet(flat, EX, TARGET, "lbs", i).type);
  check("...and EVERY row says deload, not some of them",
    kinds.every(t => t === "deload"), kinds.join(" "));
}

// ── 4. At the top of the range the answer is ADD WEIGHT, and the banner must not contradict ──
// He is doing 15s on a 12-15 range at a flat 40. That is not being stuck, that is having earned
// the jump — and the chips say so. The banner used to say "deload" over the top of them.
{
  const topped = store([2, 9, 16, 23, 30].map(n => [n, [[40, 15], [40, 15], [40, 15], [40, 15]]]));
  const dl = detectDeloadNeeded(topped, EX, "lbs", TARGET);
  const s0 = suggestNextSet(topped, EX, TARGET, "lbs", 0);
  console.log(`pinned at the top of the range -> banner ${dl.stalled ? "STALLED" : "quiet"}, set 1 ${s0.type} ${s0.weight}x${s0.reps}`);
  check("the banner does not shout deload at someone who has earned a jump", !dl.stalled);
  // NOT asserting "add weight" here, and the first draft of this test wrongly did. On a 40 lb
  // raise the smallest plate is a 12.5% jump, so `jumpIsBig` deliberately makes you earn reps past
  // the top of the range before it hands you one — the app answered "40x16" and the app was right.
  // What matters for coherence is that the row moves FORWARD while the banner is quiet.
  check("...and the row moves forward rather than back",
    s0.type !== "deload" && (s0.weight > 40 || s0.reps > 15), `${s0.type} ${s0.weight}x${s0.reps}`);

  // A heavy compound, where +5 lbs IS proportionate, is where "add weight" should actually appear.
  const heavy = store([2, 9, 16, 23, 30].map(n => [n, [[225, 8], [225, 8], [225, 8]]]), "Barbell Bench Press");
  const h0 = suggestNextSet(heavy, "Barbell Bench Press", "5-8", "lbs", 0);
  const hdl = detectDeloadNeeded(heavy, "Barbell Bench Press", "lbs", "5-8");
  console.log(`225x8 on a 5-8 range -> banner ${hdl.stalled ? "STALLED" : "quiet"}, set 1 ${h0.type} ${h0.weight}x${h0.reps}`);
  check("a heavy lift at the top of its range is told to add weight", h0.type === "weight" && h0.weight > 225, `${h0.type} ${h0.weight}`);
  check("...and the banner stays quiet over the top of it", !hdl.stalled);
}

// ── 5. One short session must not manufacture a plateau ──────────────────────────────────────
// Three sets instead of four because the gym was closing. Volume collapses; nothing about the
// lifter changed. A newest-vs-best test calls that a stall on its own.
{
  const shortDay = store([
    [2,  [[40, 12], [40, 12], [40, 10]]],
    [9,  [[40, 12], [40, 12], [40, 10], [40, 10]]],
    [19, [[40, 12], [40, 12], [40, 10], [40, 9]]],
    [26, [[40, 12], [40, 11], [40, 10], [40, 8]]],
    [33, [[40, 12], [40, 11], [40, 10], [40, 8]]],
  ]);
  const dl = detectDeloadNeeded(shortDay, EX, "lbs", TARGET);
  console.log(`one 3-set day after four 4-set days -> ${dl.stalled ? "STALLED" : "not stalled"}`);
  check("a single short session is not a plateau", !dl.stalled);
}

// ── 6. Units: the same history read in kg must give the same verdict ─────────────────────────
// Volume and total reps are compared across sessions, so an unconverted volume would invent
// progress (or hide it) the moment a lifter switched units mid-history.
{
  const mixed = {
    history: {
      [day(2)]:  { a: { unit: "kg",  exercises: [{ name: EX, sets: sets([[18, 12], [18, 11], [18, 10], [18, 9]]) }] } },
      [day(9)]:  { a: { unit: "lbs", exercises: [{ name: EX, sets: sets([[40, 12], [40, 11], [40, 10], [40, 9]]) }] } },
      [day(16)]: { a: { unit: "lbs", exercises: [{ name: EX, sets: sets([[40, 12], [40, 11], [40, 10], [40, 9]]) }] } },
      [day(23)]: { a: { unit: "lbs", exercises: [{ name: EX, sets: sets([[40, 12], [40, 11], [40, 10], [40, 9]]) }] } },
      [day(30)]: { a: { unit: "lbs", exercises: [{ name: EX, sets: sets([[40, 12], [40, 11], [40, 10], [40, 9]]) }] } },
    },
  };
  // 18kg = 39.7lbs — the same session logged in the other unit, not a heavier one.
  const dl = detectDeloadNeeded(mixed, EX, "lbs", TARGET);
  console.log(`identical work logged in kg then lbs -> ${dl.stalled ? "STALLED" : "not stalled"}`);
  check("a unit switch does not read as progress", dl.stalled);
}

// ── 7. No rep target: steady load is a choice, not a failure ─────────────────────────────────
{
  const flat = store([2, 9, 16, 23, 30].map(n => [n, [[100, 12], [100, 12], [100, 12]]]));
  const s0 = suggestNextSet(flat, EX, null, "lbs", 0);
  check("with no target range, no row suggests a deload", s0.type !== "deload", s0.type);
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
