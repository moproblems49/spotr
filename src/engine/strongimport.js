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
  "plate loaded": ["Plate-Loaded", "Plate Loaded"],
  assisted: ["Assisted"],
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
  "calf press on seated leg press": "leg press calf raise",
  "calf press on leg press": "leg press calf raise",
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
  // Added from a REAL Strong export (328 workouts, 63 exercises). Each one was a live wrong-match or
  // a miss against the library as it stood -- measured, not guessed.
  "standing calf raise|smith machine": "Smith Machine Calf Raise",
  "triceps extension|machine": "Machine Tricep Extension",
  "triceps pushdown|cable - straight bar": "Tricep Straight Bar Pushdown",
  "triceps pushdown|cable - rope": "Tricep Rope Pushdown",
  "seated overhead press|dumbbell": "Seated DB Shoulder Press",
  "bench press|dumbbell": "Flat DB Press",
  "pullover|machine": "Pullover Machine",
  "iso-lateral chest press|machine": "Hammer Strength Chest Press",
  "pec deck|machine": "Pec Deck Machine",
  "hip abductor|machine": "Hip Abduction Machine",
  "hip adductor|machine": "Adduction Machine",
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
      // Equipment-bearing spellings go first. This ordering was the FIRST fix for "Reverse Fly
      // (Dumbbell)" landing on the CABLE variant (`_exNorm` strips parentheses, so the bare
      // movement matched whichever variant sits first in EXERCISE_DB). It is NO LONGER what holds
      // that fix up: the strict pass in `resolveImportName` does, and reversing this order was
      // measured to change nothing on a real 63-exercise export. It still sets priority WITHIN the
      // fuzzy pass, where the export's equipment is the better tie-breaker than library order.
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

// Parenthesis-PRESERVING normaliser. `_exNorm` deletes "(...)" wholesale, which is right for the
// app's own lookups and wrong here: it makes "Standing Calf Raise (Smith Machine)" identical to
// plain "Standing Calf Raise", so the equipment the export named is thrown away before any
// candidate that would honour it gets a turn.
const strictNorm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9()]+/g, " ").replace(/\s*([()])\s*/g, "$1").trim();

// Resolve ONE Strong exercise name. Returns { name, how } on a hit, or null -- and null means
// "ask the user", never "import it anyway and hope".
//
// TWO PASSES, and the split is the fix for a real wrong-match rather than tidiness. Every
// lookup goes through `getExEntry`, which strips parentheses -- so ANY candidate carrying an
// equipment suffix is secretly fuzzy, and on Mo's real export "Standing Calf Raise (Smith
// Machine)" resolved to plain "Standing Calf Raise" before the exact "Smith Machine Calf Raise"
// was ever tried. Pass 1 accepts a hit only when the entry's name equals the candidate WITH its
// parentheses intact; pass 2 is the old fuzzy behaviour, reached only once nothing exact exists.
// Both passes still go through `getExEntry`, so custom exercises win exactly as they do in-app.
export function resolveImportName(raw) {
  const list = [];
  const seen = new Set();
  for (const c of candidates(raw)) {
    const k = c.v.toLowerCase();
    if (!seen.has(k)) { seen.add(k); list.push(c); }
  }
  for (const { v, how } of list) {
    const e = getExEntry(v);
    if (e && strictNorm(e.name) === strictNorm(v)) return { name: e.name, how, exact: true };
  }
  for (const { v, how } of list) {
    const e = getExEntry(v);
    if (e) return { name: e.name, how: how + " (fuzzy)", exact: false };
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


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// PARSING + CONVERSION. Everything below is pure: text in, sessions out. The write path lives in
// the app, because it needs the token, the store and the durable queue.
//
// The format was read off a REAL export (Mo's, Sep 2026: 4,398 rows, 328 workouts, 2019-2026),
// not written from memory -- and the file disagreed with memory in four ways worth knowing:
//   * "Set Order" is not always a number. "W" = warm-up, "F" = failure, and "Rest Timer" is not a
//     set at all: it is the TIMER SETTING (seconds in the Seconds column), one per exercise.
//   * "Duration" is whatever the timer said when Finish was tapped: "23h 30m" (left running) and
//     "30s" (logged after the fact) both occur. A number that wrong is worse than none.
//   * There is no unit column. Strong exports in the user's display unit, so the importer has to
//     be told which one.
//   * Timed sets (Plank) put the time in Seconds with 0 reps -- including one 12,813s "plank",
//     i.e. a timer left running for 3.5 hours.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// RFC-4180 CSV: quoted fields may carry commas, doubled quotes and NEWLINES (Strong notes do).
// A line-split parser breaks the moment a note contains a return, so this walks characters.
export function parseCsv(text) {
  const rows = []; let row = []; let f = ""; let q = false;
  const s = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(f); f = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else f += c;
  }
  if (f !== "" || row.length) { row.push(f); if (row.length > 1 || row[0] !== "") rows.push(row); }
  return rows;
}

const STRONG_REQUIRED = ["Date", "Workout Name", "Exercise Name", "Set Order", "Weight", "Reps"];

// "1h 4m" / "59m" / "30s" / "1h" -> seconds. Returns 0 for anything implausible, and 0 is what the
// app already stores for "unknown" (guest migration writes `duration || 0`). A whole-day duration
// would drag every average-session-length figure the app computes; a guess would be invented data.
export function parseStrongDuration(d) {
  const m = String(d || "").match(/^\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?\s*$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return 0;
  const secs = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  return secs >= 5 * 60 && secs <= 5 * 3600 ? secs : 0;
}

// Numbers come out as "210.0" / "12.0"; the app stores what a person types ("210", "12").
const cleanNum = (v) => {
  const n = parseFloat(v);
  if (!isFinite(n) || n <= 0) return "";
  return String(Math.round(n * 100) / 100);
};

// A deterministic UUID per (user, workout). `workout_history.id` is a GLOBAL primary key, so the
// user id has to be in the seed: two people who both did "Push A" at the same second would
// otherwise mint the same id, and the second import would try to upsert onto the FIRST person's
// row -- refused by RLS at best. Deterministic (rather than random) is what makes re-running the
// import an upsert of the same rows instead of a second copy of the whole history -- the exact
// 202-rows-for-55-workouts bug the guest migration once had.
function hash32(str, seed) {
  let h = seed ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 0x5bd1e995); h ^= h >>> 13; }
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0).toString(16).padStart(8, "0");
}
export function strongSessionId(userId, date, workoutName) {
  const k = `strong|${userId}|${date}|${workoutName}`;
  const hex = hash32(k, 0x9e3779b9) + hash32(k, 0x85ebca6b) + hash32(k, 0xc2b2ae35) + hash32(k, 0x27d4eb2f);
  // Version nibble 8 ("custom") + RFC variant bits: a well-formed UUID Postgres will accept.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const MAX_TIMED_SECS = 30 * 60; // a "set" longer than this is a timer someone forgot to stop

// Parse a Strong export into the raw workouts it contains, without resolving any names. Throws a
// user-readable Error if the file isn't a Strong export, so the screen can say so plainly.
export function parseStrongExport(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("That file is empty.");
  const head = rows[0].map((h) => h.trim());
  const missing = STRONG_REQUIRED.filter((c) => !head.includes(c));
  if (missing.length) throw new Error("That doesn't look like a Strong export (missing " + missing.join(", ") + ").");
  const col = (name) => head.indexOf(name);
  const C = {
    date: col("Date"), name: col("Workout Name"), dur: col("Duration"), ex: col("Exercise Name"),
    order: col("Set Order"), w: col("Weight"), r: col("Reps"), secs: col("Seconds"), dist: col("Distance"),
    note: col("Notes"), wnote: col("Workout Notes"), rpe: col("RPE"),
  };
  const get = (row, i) => (i >= 0 ? (row[i] ?? "") : "");

  const workouts = new Map();
  let skippedSets = 0;
  // Sets Seshd has no way to hold, counted separately so the review can SAY what was left out
  // rather than dropping it silently: cardio (a distance) and loaded carries/holds (weight plus
  // seconds, no reps). Seshd logs weight x reps, and a set has no duration field.
  let skippedTimed = 0;
  for (const row of rows.slice(1)) {
    const date = get(row, C.date).trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(date)) continue;
    const wName = get(row, C.name).trim() || "Imported workout";
    const key = date + "\u0000" + wName;
    let w = workouts.get(key);
    if (!w) {
      w = { date, name: wName, duration: parseStrongDuration(get(row, C.dur)), workoutNote: "", exercises: new Map() };
      workouts.set(key, w);
    }
    const wn = get(row, C.wnote).trim();
    if (wn && !w.workoutNote) w.workoutNote = wn;

    const exName = get(row, C.ex).trim();
    if (!exName) continue;
    let ex = w.exercises.get(exName);
    if (!ex) { ex = { rawName: exName, sets: [], note: "" }; w.exercises.set(exName, ex); }
    const n = get(row, C.note).trim();
    if (n && !ex.note) ex.note = n;

    const order = get(row, C.order).trim();
    if (order === "Rest Timer" || !order) continue; // a timer SETTING, not a set
    // Strong's D is a drop set, which Seshd has its own type for -- mapping it to "normal" threw
    // the label away.
    const type = order === "W" ? "warmup" : order === "F" ? "failure" : order === "D" ? "drop" : "normal";
    let weight = cleanNum(get(row, C.w));
    let reps = cleanNum(get(row, C.r));
    const secs = parseFloat(get(row, C.secs)) || 0;
    const dist = parseFloat(get(row, C.dist)) || 0;
    if (!reps && dist > 0) { skippedTimed++; continue; } // cardio: a distance is not a rep count
    if (!reps && secs > 0) {
      if (secs > MAX_TIMED_SECS) { skippedSets++; continue; }
      // A LOADED timed set (farmer's walk 100 lb x 60 s) must not become 60 reps: that is 6,000 lb
      // of volume and a 140 lb "estimated 1RM" out of nothing, i.e. fake PRs. Only a bodyweight
      // hold (plank) goes in as seconds-in-reps, the way it is logged in the app.
      if (parseFloat(weight) > 0) { skippedTimed++; continue; }
      reps = String(Math.round(secs));
    }
    if (!reps) { skippedSets++; continue; } // an empty set: nothing was done
    const set = { weight, reps, done: true, type };
    const rpe = parseFloat(get(row, C.rpe));
    if (isFinite(rpe) && rpe > 0 && rpe <= 10) set.rpe = rpe;
    ex.sets.push(set);
  }

  const out = [];
  for (const w of workouts.values()) {
    const exercises = [...w.exercises.values()].filter((e) => e.sets.length);
    if (!exercises.length) continue;
    out.push({ ...w, exercises });
  }
  return { workouts: out, skippedSets, skippedTimed };
}

// Turn parsed workouts into rows the app can store, given a name map (Strong name -> Seshd name)
// that the user has confirmed. Every exercise MUST be in the map: the screen refuses to import
// until each unmatched name has been given an answer, because an unmapped name is the silent
// zero-muscle bug this whole module exists to prevent.
export function strongToSessions(workouts, { userId, unit, nameMap }) {
  return workouts.map((w) => {
    const day = w.date.slice(0, 10);
    const id = strongSessionId(userId, w.date, w.name);
    // Strong's Date is local wall-clock time with no zone -- which is exactly what `new Date`
    // assumes for a "YYYY-MM-DDTHH:MM:SS" string, so the session lands on the day it was lifted.
    const finishedAt = new Date(w.date.replace(" ", "T")).getTime() + (w.duration || 0) * 1000;
    const notes = {};
    const exercises = w.exercises.map((e, i) => {
      const name = nameMap[e.rawName];
      if (!name) throw new Error("No mapping for " + e.rawName);
      let note = e.note;
      if (i === 0 && w.workoutNote) note = note ? `${w.workoutNote}\n${note}` : w.workoutNote;
      if (note) notes[name] = notes[name] ? `${notes[name]}\n${note}` : note;
      return { name, sets: e.sets.map((s) => ({ ...s })) };
    });
    return {
      id, date: day, dayName: w.name, exercises, duration: w.duration, unit,
      finishedAt: isFinite(finishedAt) ? finishedAt : new Date(day + "T12:00:00").getTime(),
      notes,
    };
  });
}
