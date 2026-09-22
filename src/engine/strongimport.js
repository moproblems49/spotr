// Strong -> Seshd exercise-name resolution.
//
// WHY THIS MODULE EXISTS. Strong names every exercise "Movement (Equipment)"; Seshd's library is a
// MIX of three conventions -- "Barbell Bench Press" (equipment PREFIX), "Overhead Press (Barbell)"
// (equipment SUFFIX) and "Lat Pulldown (Wide)" (suffix is GRIP, not equipment at all). Worse,
// `_exNorm` STRIPS parentheses, so it throws the equipment token away entirely and
// "Bench Press (Barbell)" normalises to "bench press", which matches nothing.
// Measured on a realistic slice of Strong's own names: 12/28 resolved, i.e. bench, squat, rows,
// curls and pulldowns all missed.
//
// AND A MISS IS SILENT, WHICH IS THE REAL HAZARD. An unresolved name still imports: History shows
// the session and the volume counts, while `getMuscle` returns nothing, so the muscle map, weekly
// muscle volume, muscle readiness and "most trained" all quietly get zero from it. That is exactly
// the demo-corpus scar in CLAUDE.md, except at the scale of someone's whole training history.
// So the contract here is: resolve what can be resolved MECHANICALLY, and hand back everything
// else for the user to map by hand. Never guess a muscle.
//
// The ladder generates CANDIDATE spellings and tries each through the REAL `getExEntry` -- it must
// never hold its own copy of the library, or it is testing its copy (the documented guard rule).

import { getExEntry } from "./exercises.js";

// Strong's equipment vocabulary -> the spellings Seshd's library actually uses.
const EQUIP_ALIASES = {
  dumbbell: ["DB", "Dumbbell"],
  barbell: ["Barbell", "BB"],
  cable: ["Cable"],
  machine: ["Machine"],
  "smith machine": ["Smith Machine", "Smith"],
  "ez bar": ["EZ Bar"],
  bodyweight: [""],
  weighted: ["Weighted"],
  band: ["Band", "Resistance Band"],
  plate: ["Plate"],
};

// Movement-phrase synonyms. Keyed on the MOVEMENT half only (equipment is handled separately by
// the ladder), so one entry covers every equipment variant Strong might pair it with.
// Deliberately conservative: an entry here asserts two names mean the SAME lift. Anything where
// the right answer depends on taste (which pulldown grip, which row) is left out and surfaces to
// the user instead.
const MOVE_SYNONYMS = {
  "bicep curl": "curl",
  "biceps curl": "curl",
  "bent over row": "row",
  "barbell row": "row",
  "skullcrusher": "skull crusher",
  "skullcrushers": "skull crusher",
  "lying triceps extension": "skull crusher",
  "triceps pushdown": "tricep rope pushdown",
  "tricep pushdown": "tricep rope pushdown",
  "triceps extension": "overhead tricep extension",
  "seated row": "seated cable row",
  "calf press": "leg press calf raise",
  "chest fly": "fly",
  "rear delt reverse fly": "rear delt fly",
  "reverse fly": "rear delt fly",
  "hip thrust": "barbell hip thrust",
  "lying leg curl": "lying leg curl",
  "squat": "back squat",
};

// Equipment-SPECIFIC synonyms, for the lifts whose Seshd name depends on the equipment rather than
// being a straight prefix/suffix flip of it.
const MOVE_EQUIP_SYNONYMS = {
  "shoulder press|dumbbell": "Seated DB Shoulder Press",
  "shoulder press|machine": "Machine Shoulder Press",
  "shoulder press|barbell": "Overhead Press (Barbell)",
  "overhead press|dumbbell": "Standing DB Shoulder Press",
  "incline bench press|barbell": "Incline Barbell Press",
  "incline bench press|dumbbell": "Incline DB Press",
  "incline bench press|smith machine": "Smith Machine Incline Press",
  "incline chest press|machine": "Incline Chest Press (Machine)",
  "chest press|machine": "Machine Chest Press",
  "squat|dumbbell": "Goblet Squat",
  "squat|smith machine": "Smith Machine Squat",
  "squat|machine": "Hack Squat (Machine)",
};

const titleCase = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

// "Bench Press (Barbell)" -> { move: "bench press", equip: "barbell" }
function splitStrongName(raw) {
  const m = String(raw || "").trim().match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (!m) return { move: String(raw || "").trim().toLowerCase(), equip: "" };
  return { move: m[1].trim().toLowerCase(), equip: m[2].trim().toLowerCase() };
}

// Toggle a trailing plural on the LAST word. `_exNorm` collapses punctuation but NOT plurals, so
// "Lateral Raise (DB)" and "Lateral Raises (DB)" are different strings to it.
function pluralVariants(s) {
  const out = [s];
  const m = s.match(/^(.*?)(\w+)$/);
  if (!m) return out;
  const [, head, last] = m;
  if (/s$/i.test(last)) out.push(head + last.replace(/s$/i, ""));
  else out.push(head + last + "s");
  return out;
}

// Every spelling worth trying for one Strong name, cheapest/most-confident first.
function candidates(raw) {
  const { move, equip } = splitStrongName(raw);
  const out = [];
  const push = (v, how) => { if (v && v.trim()) out.push({ v: v.trim(), how }); };

  push(raw, "exact");

  const exactKey = MOVE_EQUIP_SYNONYMS[`${move}|${equip}`];
  if (exactKey) push(exactKey, "equipment-specific synonym");

  const moves = [move];
  if (MOVE_SYNONYMS[move]) moves.push(MOVE_SYNONYMS[move]);

  const equips = equip ? (EQUIP_ALIASES[equip] || [titleCase(equip)]) : [""];

  for (const mv of moves) {
    const M = titleCase(mv);
    for (const mvv of pluralVariants(M)) {
      // EQUIPMENT-BEARING SPELLINGS GO FIRST, AND THE ORDER IS LOAD-BEARING. `_exNorm` strips
      // parentheses, so the bare movement "Rear Delt Fly" matches "Rear Delt Fly (Cable)",
      // "(DB)" and "(Machine)" equally -- whichever sits first in EXERCISE_DB wins. Trying the
      // bare movement first therefore let library ORDER pick the equipment and silently mapped
      // Strong's "Reverse Fly (Dumbbell)" onto the CABLE variant. Equipment is information the
      // export gave us; spend it before falling back to discarding it.
      for (const eq of equips) {
        if (!eq) continue;
        push(`${eq} ${mvv}`, "equipment prefix");   // Barbell Bench Press
        push(`${mvv} (${eq})`, "equipment suffix"); // Overhead Press (Barbell)
      }
      push(mvv, mv === move ? "movement only" : "synonym");
    }
  }
  return out;
}

// Resolve ONE Strong exercise name. Returns { name, how } on a hit, or null -- and null means
// "ask the user", never "import it anyway and hope".
export function resolveImportName(raw) {
  const seen = new Set();
  for (const { v, how } of candidates(raw)) {
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    const e = getExEntry(v);
    if (e) return { name: e.name, how };
  }
  return null;
}

// Resolve a whole export's worth of names at once. `unmatched` is the list the import screen has
// to put in front of the user before anything is written.
export function resolveImportNames(rawNames) {
  const matched = {}, unmatched = [];
  for (const raw of [...new Set(rawNames.filter(Boolean))]) {
    const r = resolveImportName(raw);
    if (r) matched[raw] = r;
    else unmatched.push(raw);
  }
  return { matched, unmatched };
}
