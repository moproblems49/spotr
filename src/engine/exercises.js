// THE EXERCISE LIBRARY — the 292-entry database, plus every lookup that turns a NAME into a
// muscle, a region, an equipment type or a set of secondaries.
//
// Extracted from App.jsx verbatim. Imports nothing, like core.js: this is a leaf, and keeping it
// one means the name-resolution rules have exactly one home.
//
// Why the resolution is three-tiered rather than a plain map lookup: history and program exercises
// routinely differ from the library in spacing, casing or qualifiers ("(heavy)", "(finisher)"), so
// _muscleExact is tried first, then a normalised key, then keyword inference. That tolerance is
// narrow on purpose and it has bitten before — CLAUDE.md records five demo-corpus exercises whose
// names looked plausible ("Bench Press" vs "Barbell Bench Press") but matched nothing, so those
// sessions resolved to NO muscle and contributed silently nothing to the heatmap, weekly muscle
// volume, muscle readiness or "most trained". If you seed or import exercise data, resolve every
// name through getExEntry/getMuscle first; a near-miss is invisible rather than loud.
//
// NOTE: this module has an import-time side effect by design — the EXERCISE_DB.forEach below builds
// the _muscleExact/_muscleNorm indexes. It must stay with the data it indexes.

// ═════════════════════════════════════════════════════════════════════════════
// EXERCISE DATABASE
// ═════════════════════════════════════════════════════════════════════════════
const EXERCISE_DB = [
  // ── CHEST ──────────────────────────────────────────────────────────────────
  { name:"Barbell Bench Press", muscle:"Chest" },
  { name:"Incline Barbell Press", muscle:"Chest" },
  { name:"Decline Barbell Press", muscle:"Chest" },
  { name:"Incline DB Press", muscle:"Chest" },
  { name:"Flat DB Press", muscle:"Chest" },
  { name:"Decline DB Press", muscle:"Chest" },
  { name:"Cable Fly (Low-to-High)", muscle:"Chest" },
  { name:"Cable Fly (High-to-Low)", muscle:"Chest" },
  { name:"Cable Fly (Neutral)", muscle:"Chest" },
  { name:"Pec Deck Machine", muscle:"Chest" },
  { name:"DB Fly", muscle:"Chest" },
  { name:"Incline DB Fly", muscle:"Chest" },
  { name:"Dips", muscle:"Chest" },
  { name:"Weighted Dips", muscle:"Chest" },
  { name:"Push-Ups", muscle:"Chest" },
  { name:"Weighted Push-Ups", muscle:"Chest" },
  { name:"Wide-Grip Push-Ups", muscle:"Chest" },
  { name:"Archer Push-Ups", muscle:"Chest" },
  { name:"DB Pullover", muscle:"Chest" },
  { name:"Machine Chest Press", muscle:"Chest" },
  { name:"Smith Machine Bench Press", muscle:"Chest" },
  { name:"Smith Machine Incline Press", muscle:"Chest" },
  { name:"Landmine Press", muscle:"Chest" },
  { name:"Svend Press", muscle:"Chest" },
  // ── BACK ───────────────────────────────────────────────────────────────────
  { name:"Barbell Row", muscle:"Back" },
  { name:"Pendlay Row", muscle:"Back" },
  { name:"T-Bar Row", muscle:"Back" },
  { name:"T-Bar Row (Landmine)", muscle:"Back" },
  { name:"Seated Cable Row (Wide)", muscle:"Back" },
  { name:"Seated Cable Row (Narrow)", muscle:"Back" },
  { name:"Single-Arm DB Row", muscle:"Back" },
  { name:"Single-Arm Cable Row", muscle:"Back" },
  { name:"Chest-Supported Row", muscle:"Back" },
  { name:"Chest-Supported DB Row", muscle:"Back" },
  { name:"Incline DB Row", muscle:"Back" },
  { name:"Pull-Ups", muscle:"Back" },
  { name:"Weighted Pull-Ups", muscle:"Back" },
  { name:"Chin-Ups", muscle:"Back" },
  { name:"Neutral-Grip Pull-Ups", muscle:"Back" },
  { name:"Lat Pulldown (Wide)", muscle:"Back" },
  { name:"Lat Pulldown (Underhand)", muscle:"Back" },
  { name:"Lat Pulldown (Neutral)", muscle:"Back" },
  { name:"Single-Arm Lat Pulldown", muscle:"Back" },
  { name:"Straight-Arm Pulldown", muscle:"Back" },
  { name:"Iso-Lateral Row (Machine)", muscle:"Back" },
  { name:"Hammer Strength Row", muscle:"Back" },
  { name:"Meadows Row", muscle:"Back" },
  { name:"Rack Pull", muscle:"Back" },
  { name:"Inverted Row", muscle:"Back" },
  { name:"Cable Pullover", muscle:"Back" },
  // ── REAR DELTS ─────────────────────────────────────────────────────────────
  { name:"Face Pulls", muscle:"Rear Delts" },
  { name:"Rear Delt Fly (Cable)", muscle:"Rear Delts" },
  { name:"Rear Delt Fly (DB)", muscle:"Rear Delts" },
  { name:"Rear Delt Fly (Machine)", muscle:"Rear Delts" },
  { name:"Band Pull-Apart", muscle:"Rear Delts" },
  { name:"Prone Y-Raise", muscle:"Rear Delts" },
  // ── SHOULDERS ──────────────────────────────────────────────────────────────
  { name:"Overhead Press (Barbell)", muscle:"Shoulders" },
  { name:"Seated OHP (Barbell)", muscle:"Shoulders" },
  { name:"Seated DB Shoulder Press", muscle:"Shoulders" },
  { name:"Standing DB Shoulder Press", muscle:"Shoulders" },
  { name:"Arnold Press", muscle:"Shoulders" },
  { name:"Lateral Raises (DB)", muscle:"Shoulders" },
  { name:"Lateral Raises (Cable)", muscle:"Shoulders" },
  { name:"Lateral Raises (Machine)", muscle:"Shoulders" },
  { name:"Seated Lateral Raises", muscle:"Shoulders" },
  { name:"Front Raises (DB)", muscle:"Shoulders" },
  { name:"Front Raises (Plate)", muscle:"Shoulders" },
  { name:"Front Raises (Cable)", muscle:"Shoulders" },
  { name:"Upright Row", muscle:"Shoulders" },
  { name:"Machine Shoulder Press", muscle:"Shoulders" },
  { name:"Smith Machine OHP", muscle:"Shoulders" },
  { name:"Push Press", muscle:"Shoulders" },
  { name:"Bradford Press", muscle:"Shoulders" },
  { name:"Lu Raises", muscle:"Shoulders" },
  // ── TRAPS ──────────────────────────────────────────────────────────────────
  { name:"Behind-the-Back Shrugs", muscle:"Traps" },
  { name:"Rack Pull (Traps focus)", muscle:"Traps" },
  { name:"Farmer's Walk", muscle:"Traps" },
  // ── BICEPS ─────────────────────────────────────────────────────────────────
  { name:"Barbell Curl", muscle:"Biceps" },
  { name:"EZ Bar Curl", muscle:"Biceps" },
  { name:"Dumbbell Curl", muscle:"Biceps" },
  { name:"Alternating DB Curl", muscle:"Biceps" },
  { name:"Incline DB Curl", muscle:"Biceps" },
  { name:"Hammer Curl", muscle:"Biceps" },
  { name:"Cross-Body Hammer Curl", muscle:"Biceps" },
  { name:"Preacher Curl (EZ Bar)", muscle:"Biceps" },
  { name:"Preacher Curl (DB)", muscle:"Biceps" },
  { name:"Cable Curl (Single Arm)", muscle:"Biceps" },
  { name:"Cable Curl (Both Arms)", muscle:"Biceps" },
  { name:"Concentration Curl", muscle:"Biceps" },
  { name:"Reverse Curl", muscle:"Biceps" },
  { name:"Spider Curl", muscle:"Biceps" },
  { name:"Drag Curl", muscle:"Biceps" },
  { name:"21s (Barbell Curl)", muscle:"Biceps" },
  { name:"Machine Curl", muscle:"Biceps" },
  // ── TRICEPS ────────────────────────────────────────────────────────────────
  { name:"Skull Crushers (EZ Bar)", muscle:"Triceps" },
  { name:"Skull Crushers (DB)", muscle:"Triceps" },
  { name:"Skull Crushers (Cable)", muscle:"Triceps" },
  { name:"Tricep Rope Pushdown", muscle:"Triceps" },
  { name:"Tricep Bar Pushdown", muscle:"Triceps" },
  { name:"Tricep Straight Bar Pushdown", muscle:"Triceps" },
  { name:"Single-Arm Tricep Pushdown", muscle:"Triceps" },
  { name:"Overhead Tricep Extension (DB)", muscle:"Triceps" },
  { name:"Overhead Tricep Extension (Cable)", muscle:"Triceps" },
  { name:"Overhead Tricep Extension (EZ Bar)", muscle:"Triceps" },
  { name:"Close-Grip Bench Press", muscle:"Triceps" },
  { name:"Tricep Dips", muscle:"Triceps" },
  { name:"Diamond Push-Ups", muscle:"Triceps" },
  { name:"JM Press", muscle:"Triceps" },
  { name:"Tate Press", muscle:"Triceps" },
  { name:"Machine Tricep Extension", muscle:"Triceps" },
  // ── QUADS ──────────────────────────────────────────────────────────────────
  { name:"Barbell Back Squat", muscle:"Quads" },
  { name:"Low Bar Squat", muscle:"Quads" },
  { name:"High Bar Squat", muscle:"Quads" },
  { name:"Front Squat", muscle:"Quads" },
  { name:"Leg Press", muscle:"Quads" },
  { name:"Leg Press (Single Leg)", muscle:"Quads" },
  { name:"Hack Squat", muscle:"Quads" },
  { name:"Bulgarian Split Squat", muscle:"Quads" },
  { name:"Reverse Lunges", muscle:"Quads" },
  { name:"Lateral Lunges", muscle:"Quads" },
  { name:"Leg Extension", muscle:"Quads" },
  { name:"Leg Extension (Single)", muscle:"Quads" },
  { name:"Goblet Squat", muscle:"Quads" },
  { name:"Smith Machine Squat", muscle:"Quads" },
  { name:"Sissy Squat", muscle:"Quads" },
  { name:"Cyclist Squat", muscle:"Quads" },
  // ── HAMSTRINGS ─────────────────────────────────────────────────────────────
  { name:"Deadlift", muscle:"Hamstrings" },
  { name:"Sumo Deadlift", muscle:"Hamstrings" },
  { name:"Romanian Deadlift", muscle:"Hamstrings" },
  { name:"Stiff-Leg Deadlift", muscle:"Hamstrings" },
  { name:"Single-Leg RDL", muscle:"Hamstrings" },
  { name:"Lying Leg Curl", muscle:"Hamstrings" },
  { name:"Seated Leg Curl", muscle:"Hamstrings" },
  { name:"Standing Leg Curl", muscle:"Hamstrings" },
  { name:"Nordic Curl", muscle:"Hamstrings" },
  { name:"Good Morning", muscle:"Hamstrings" },
  { name:"Glute Ham Raise", muscle:"Hamstrings" },
  // ── GLUTES ─────────────────────────────────────────────────────────────────
  { name:"Hip Thrust (Barbell)", muscle:"Glutes" },
  { name:"Hip Thrust (Machine)", muscle:"Glutes" },
  { name:"Hip Thrust (DB)", muscle:"Glutes" },
  { name:"Single-Leg Hip Thrust", muscle:"Glutes" },
  { name:"Glute Kickback (Cable)", muscle:"Glutes" },
  { name:"Glute Kickback (Machine)", muscle:"Glutes" },
  { name:"Abduction Machine", muscle:"Glutes" },
  { name:"Cable Abduction", muscle:"Glutes" },
  { name:"Donkey Kicks", muscle:"Glutes" },
  { name:"Clamshells", muscle:"Glutes" },
  { name:"45° Back Extension", muscle:"Glutes" },
  // ── CALVES ─────────────────────────────────────────────────────────────────
  { name:"Standing Calf Raise", muscle:"Calves" },
  { name:"Seated Calf Raise", muscle:"Calves" },
  { name:"Leg Press Calf Raise", muscle:"Calves" },
  { name:"Single-Leg Calf Raise", muscle:"Calves" },
  { name:"Smith Machine Calf Raise", muscle:"Calves" },
  { name:"Donkey Calf Raise", muscle:"Calves" },
  { name:"Tibialis Raise", muscle:"Calves" },
  // ── CORE ───────────────────────────────────────────────────────────────────
  { name:"Plank", muscle:"Core" },
  { name:"Side Plank", muscle:"Core" },
  { name:"Cable Crunch", muscle:"Core" },
  { name:"Hanging Leg Raise", muscle:"Core" },
  { name:"Hanging Knee Raise", muscle:"Core" },
  { name:"Ab Wheel Rollout", muscle:"Core" },
  { name:"Decline Crunch", muscle:"Core" },
  { name:"Decline Sit-Up", muscle:"Core" },
  { name:"Russian Twist", muscle:"Core" },
  { name:"Landmine Rotation", muscle:"Core" },
  { name:"Cable Woodchop", muscle:"Core" },
  { name:"Pallof Press", muscle:"Core" },
  { name:"Dragon Flag", muscle:"Core" },
  { name:"Toes-to-Bar", muscle:"Core" },
  { name:"Reverse Crunch", muscle:"Core" },
  { name:"V-Up", muscle:"Core" },
  { name:"Hollow Body Hold", muscle:"Core" },
  { name:"Dead Bug", muscle:"Core" },
  // ── FOREARMS ───────────────────────────────────────────────────────────────
  { name:"Wrist Curl", muscle:"Forearms" },
  { name:"Reverse Wrist Curl", muscle:"Forearms" },
  { name:"Wrist Roller", muscle:"Forearms" },
  { name:"Plate Pinch", muscle:"Forearms" },
  { name:"Farmers Carry", muscle:"Forearms" },
  { name:"Gripper", muscle:"Forearms" },
  // ── NECK ───────────────────────────────────────────────────────────────────
  { name:"Neck Extension", muscle:"Neck" },
  { name:"Neck Flexion", muscle:"Neck" },
  { name:"Neck Lateral Flexion", muscle:"Neck" },
  { name:"Neck Harness", muscle:"Neck" },
  // ── FULL BODY / COMPOUND ───────────────────────────────────────────────────
  { name:"Power Clean", muscle:"Full Body" },
  { name:"Hang Clean", muscle:"Full Body" },
  { name:"Clean and Jerk", muscle:"Full Body" },
  { name:"Snatch", muscle:"Full Body" },
  { name:"Hang Snatch", muscle:"Full Body" },
  { name:"Kettlebell Swing", muscle:"Full Body" },
  { name:"Kettlebell Clean", muscle:"Full Body" },
  { name:"Kettlebell Snatch", muscle:"Full Body" },
  { name:"Trap Bar Deadlift", muscle:"Full Body" },
  { name:"Sled Push", muscle:"Full Body" },
  { name:"Sled Pull", muscle:"Full Body" },
  { name:"Battle Ropes", muscle:"Full Body" },
  { name:"Tire Flip", muscle:"Full Body" },
  { name:"Box Jump", muscle:"Full Body" },
  { name:"Broad Jump", muscle:"Full Body" },
  { name:"Thruster", muscle:"Full Body" },
  { name:"Wall Ball", muscle:"Full Body" },
  { name:"Bear Complex", muscle:"Full Body" },
  // ── CARDIO / CONDITIONING ──────────────────────────────────────────────────
  { name:"Treadmill Run", muscle:"Cardio" },
  { name:"Stationary Bike", muscle:"Cardio" },
  { name:"Rowing Machine", muscle:"Cardio" },
  { name:"Stair Master", muscle:"Cardio" },
  { name:"Elliptical", muscle:"Cardio" },
  { name:"Jump Rope", muscle:"Cardio" },
  { name:"Assault Bike", muscle:"Cardio" },
  { name:"Ski Erg", muscle:"Cardio" },
  { name:"Incline Walk", muscle:"Cardio" },
  // ── YOGA / MIND-BODY ──────────────────────────────────────────────────────
  // Tracked by duration (no weight, no reps) — similar to cardio but its own category.
  // Covers the major styles users would actually search for.
  { name:"Vinyasa Flow", muscle:"Yoga" },
  { name:"Hatha Yoga", muscle:"Yoga" },
  { name:"Ashtanga Yoga", muscle:"Yoga" },
  { name:"Yin Yoga", muscle:"Yoga" },
  { name:"Restorative Yoga", muscle:"Yoga" },
  { name:"Power Yoga", muscle:"Yoga" },
  { name:"Bikram / Hot Yoga", muscle:"Yoga" },
  { name:"Iyengar Yoga", muscle:"Yoga" },
  { name:"Kundalini Yoga", muscle:"Yoga" },
  { name:"Sivananda Yoga", muscle:"Yoga" },
  { name:"Acro Yoga", muscle:"Yoga" },
  { name:"Yoga Nidra", muscle:"Yoga" },
  { name:"Prenatal Yoga", muscle:"Yoga" },
  { name:"Chair Yoga", muscle:"Yoga" },
  { name:"Sun Salutation", muscle:"Yoga" },
  { name:"Pilates", muscle:"Yoga" },
  { name:"Mobility Flow", muscle:"Yoga" },
  { name:"Stretching", muscle:"Yoga" },
  { name:"Meditation", muscle:"Yoga" },

  // — Common gym machines that were missing from the catalog —
  // Back / pull
  { name:"High Row (Machine)", muscle:"Back" },
  { name:"Low Row (Machine)", muscle:"Back" },
  { name:"Plate-Loaded Row", muscle:"Back" },
  { name:"Assisted Pull-Up (Machine)", muscle:"Back" },
  { name:"Pullover Machine", muscle:"Back" },
  { name:"Back Extension (Machine)", muscle:"Back" },
  // Chest / push
  { name:"Incline Chest Press (Machine)", muscle:"Chest" },
  { name:"Decline Chest Press (Machine)", muscle:"Chest" },
  { name:"Plate-Loaded Chest Press", muscle:"Chest" },
  { name:"Assisted Dip (Machine)", muscle:"Chest" },
  // Shoulders
  { name:"Plate-Loaded Shoulder Press", muscle:"Shoulders" },
  { name:"Reverse Pec Deck", muscle:"Rear Delts" },
  // Legs
  { name:"Adduction Machine", muscle:"Quads" },
  { name:"Hack Squat (Machine)", muscle:"Quads" },
  { name:"Pendulum Squat", muscle:"Quads" },
  { name:"Belt Squat", muscle:"Quads" },
  { name:"Glute Drive (Machine)", muscle:"Glutes" },
  { name:"Reverse Hyperextension", muscle:"Glutes" },
  // Calves
  { name:"Standing Calf Raise (Machine)", muscle:"Calves" },
  { name:"Seated Calf Raise (Machine)", muscle:"Calves" },
  // Core
  { name:"Crunch Machine", muscle:"Core" },
  { name:"Ab Coaster", muscle:"Core" },
  // Arms
  { name:"Preacher Curl Machine", muscle:"Biceps" },
  { name:"Dip Machine", muscle:"Triceps" },

  // ── LIBRARY EXPANSION ──────────────────────────────────────────────────────
  // Chest
  { name:"Hammer Strength Chest Press", muscle:"Chest" },
  { name:"Floor Press", muscle:"Chest" },
  // Back
  { name:"Seal Row", muscle:"Back" },
  { name:"Kroc Row", muscle:"Back" },
  { name:"Machine High Row", muscle:"Back" },
  // Shoulders
  { name:"Z Press", muscle:"Shoulders" },
  { name:"Cable Lateral Raise", muscle:"Shoulders" },
  { name:"Machine Lateral Raise", muscle:"Shoulders" },
  { name:"Behind-the-Neck Press", muscle:"Shoulders" },
  { name:"Viking Press", muscle:"Shoulders" },
  // Rear Delts
  { name:"Cable Rear Delt Fly", muscle:"Rear Delts" },
  { name:"Bent-Over Dumbbell Reverse Fly", muscle:"Rear Delts" },
  { name:"Face Pull (Rope)", muscle:"Rear Delts" },
  // Biceps
  { name:"Cable Curl", muscle:"Biceps" },
  { name:"Bayesian Cable Curl", muscle:"Biceps" },
  // Triceps
  { name:"Overhead Cable Extension", muscle:"Triceps" },
  { name:"Skull Crusher", muscle:"Triceps" },
  { name:"Cable Kickback", muscle:"Triceps" },
  // Forearms
  { name:"Barbell Wrist Curl", muscle:"Forearms" },
  { name:"Reverse Barbell Curl", muscle:"Forearms" },
  { name:"Farmer's Carry", muscle:"Forearms" },
  // Traps
  { name:"Barbell Shrug", muscle:"Traps" },
  { name:"Dumbbell Shrug", muscle:"Traps" },
  { name:"Cable Shrug", muscle:"Traps" },
  { name:"Trap Bar Shrug", muscle:"Traps" },
  { name:"Power Shrug", muscle:"Traps" },
  // Quads
  { name:"Walking Lunge", muscle:"Quads" },
  { name:"Step-Up", muscle:"Quads" },
  // Hamstrings
  { name:"Seated Hamstring Curl (Cable)", muscle:"Hamstrings" },
  { name:"Razor Curl", muscle:"Hamstrings" },
  { name:"Back Extension", muscle:"Hamstrings" },
  // Glutes
  { name:"Hip Thrust", muscle:"Glutes" },
  { name:"Barbell Glute Bridge", muscle:"Glutes" },
  { name:"Cable Kickback (Glute)", muscle:"Glutes" },
  { name:"Bulgarian Split Squat (Glute)", muscle:"Glutes" },
  { name:"Hip Abduction Machine", muscle:"Glutes" },
  { name:"Frog Pump", muscle:"Glutes" },
  // Calves
  // Core
  // Cardio
  { name:"Incline Treadmill Walk", muscle:"Cardio" },
  { name:"Stair Climber", muscle:"Cardio" },
];


// Detect equipment from an exercise name (rough, name-based) so substitutions can prefer a
// DIFFERENT implement — e.g. swapping a barbell move when you only have dumbbells.
function exEquipment(name) {
  const n = (name || "").toLowerCase();
  if (/\b(db|dumbbell)\b/.test(n)) return "dumbbell";
  if (/barbell|\bbar\b/.test(n)) return "barbell";
  if (/cable|rope|pulldown|pushdown/.test(n)) return "cable";
  if (/machine|smith|hack|pec deck|leg press|leg extension|leg curl/.test(n)) return "machine";
  if (/(^|\s)(push-?up|pull-?up|chin-?up|dip|plank|bodyweight|sit-?up|crunch|lunge|nordic|sissy)/.test(n)) return "bodyweight";
  if (/kettlebell/.test(n)) return "kettlebell";
  return "other";
}


// Suggest substitute exercises for a given exercise: same muscle group, excluding itself.
// Orders by DIFFERENT equipment first (the common reason to swap — equipment unavailable),
// then alphabetically. Returns up to `limit` names.
// Resolve an exercise name to a muscle group, robustly. The exact-name lookup is brittle —
// history/program exercises often differ in spacing, casing, or qualifiers like "(heavy)" or
// "(finisher)". So: (1) exact match, (2) normalized match (strip punctuation/parentheticals),
// (3) keyword inference (row→Back, pulldown→Back, raise→Shoulders, etc.). Returns muscle or null.
const _muscleExact = {};

const _muscleNorm = {};

const _normName = (s) => (s || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
EXERCISE_DB.forEach(e => {
  _muscleExact[e.name] = e.muscle;
  const nk = _normName(e.name);
  if (nk && !_muscleNorm[nk]) _muscleNorm[nk] = e.muscle;
});

function resolveMuscle(name) {
  if (!name) return null;
  if (_muscleExact[name]) return _muscleExact[name];
  const n = _normName(name);
  if (_muscleNorm[n]) return _muscleNorm[n];
  const has = (...ws) => ws.some(w => n.includes(w));
  if (has("face pull")) return "Rear Delts";
  if (has("rear delt", "reverse fly", "reverse pec")) return "Rear Delts";
  if (has("lateral raise", "lat raise", "side raise", "lateral raises")) return "Shoulders";
  if (has("shrug")) return "Traps";
  if (has("curl") && !has("leg curl", "nordic")) return "Biceps";
  if (has("pushdown", "tricep", "skull", "overhead extension", "kickback", "jm press", "tate", "dip")) return "Triceps";
  if (has("pulldown", "pull down", "pull up", "pullup", "chin up", "row", "lat ", "pullover", "high row", "rack pull", "t bar", "t-bar")) return "Back";
  if (has("ohp", "overhead press", "shoulder press", "military", "z press", "arnold", "landmine press", "viking")) return "Shoulders";
  if (has("bench", "chest", "fly", "pec", "incline press", "decline press", "svend")) return "Chest";
  if (has("squat", "leg press", "lunge", "leg extension", "step up", "hack", "sissy", "pendulum")) return "Quads";
  if (has("deadlift", "rdl", "romanian", "leg curl", "good morning", "ham", "nordic", "back extension", "hex bar")) return "Hamstrings";
  if (has("hip thrust", "glute", "bridge", "abduction", "frog pump")) return "Glutes";
  if (has("calf", "calves")) return "Calves";
  if (has("plank", "crunch", "ab ", "abs", "sit up", "leg raise", "russian twist", "rollout", "pallof", "dead bug", "toes to bar", "hanging")) return "Core";
  if (has("run", "treadmill", "bike", "rowing machine", "row erg", "elliptical", "stair", "jump rope", "sled", "cardio", "assault")) return "Cardio";
  if (has("press") || has("push up")) return "Chest";
  return null;
}


// Custom-exercise registry — kept in sync with store.customExercises by the app so any module-level
// helper (getMuscle, pickers) can see user-created exercises without prop-drilling. Each entry:
// { id, name, muscle, equipment }.
let _customExercises = [];

function setCustomExerciseRegistry(list) { _customExercises = Array.isArray(list) ? list : []; }

const _exNorm = (s) => (s || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();


// Canonical names for de-duplicated library exercises. The old (removed) spellings still appear in
// some users' logged history, so we resolve them to the canonical entry here — nothing orphans.
const EXERCISE_ALIASES = {
  "Barbell Shrugs": "Barbell Shrug",
  "Cable Shrugs": "Cable Shrug",
  "DB Shrugs": "Dumbbell Shrug",
  "Dumbbell Pullover": "DB Pullover",
  "Incline Dumbbell Curl": "Incline DB Curl",
  "Walking Lunges": "Walking Lunge",
  "Step-Ups": "Step-Up",
  "Frog Pumps": "Frog Pump",
};

// Map a de-duplicated old spelling to its canonical entry. Used both for exercise-DB lookups
// and for the standing exerciseNotes/barTypes maps, so a renamed exercise doesn't orphan a
// user's saved note or bar-type override under the old spelling.
const canonicalExName = (n) => EXERCISE_ALIASES[n] || n;


// Resolve an exercise's library/custom entry by name (exact, then normalized). Custom exercises
// win when present so a user's chosen muscle is authoritative.
function getExEntry(name) {
  if (!name) return null;
  name = canonicalExName(name); // map de-duplicated old spellings to the canonical entry
  let e = _customExercises.find(x => x.name === name);
  if (e) return e;
  e = EXERCISE_DB.find(x => x.name === name);
  if (e) return e;
  const n = _exNorm(name);
  e = _customExercises.find(x => _exNorm(x.name) === n);
  if (e) return e;
  e = EXERCISE_DB.find(x => _exNorm(x.name) === n);
  return e || null;
}


// THE single source of truth for "what muscle does this exercise work?". Order: stored entry
// (custom first, then DB), then keyword inference. Used everywhere so custom/renamed exercises
// resolve consistently instead of silently falling back to "Full Body".
function getMuscle(name) {
  const e = getExEntry(name);
  if (e && e.muscle) return e.muscle;
  return resolveMuscle(name);
}

function suggestExerciseSubstitutes(name, limit = 8) {
  if (!name) return [];
  // Exact match first; then fuzzy — many logged exercises are custom or named slightly
  // differently than the library (e.g. "Barbell Bent-Over Row" vs "Bent Over Row"), which used
  // to yield zero alternatives. Fall back to normalized + keyword matching, then muscle inference.
  const norm = (s) => (s || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  let entry = EXERCISE_DB.find(e => e.name === name);
  if (!entry) entry = EXERCISE_DB.find(e => norm(e.name) === norm(name));
  // Determine the target muscle. Prefer an exact/normalized DB entry; otherwise use resolveMuscle
  // (keyword-based, reliable) rather than a fuzzy token match, which can mis-pick (e.g. "Bent Over
  // Row" → a reverse fly). resolveMuscle understands rows→Back, press→Chest/Shoulders, etc.
  let muscle = entry ? entry.muscle : (typeof resolveMuscle === "function" ? resolveMuscle(name) : null);
  // If still nothing, last-ditch token overlap against the DB.
  if (!muscle) {
    const toks = new Set(norm(name).split(" ").filter(w => w.length > 2));
    let best = null, bestScore = 0;
    for (const e of EXERCISE_DB) {
      const et = norm(e.name).split(" ").filter(w => w.length > 2);
      const overlap = et.filter(w => toks.has(w)).length;
      if (overlap > bestScore) { bestScore = overlap; best = e; }
    }
    if (bestScore >= 1 && best) muscle = best.muscle;
  }
  if (!muscle || muscle === "Other") return [];
  const origEquip = exEquipment(name);
  return EXERCISE_DB
    .filter(e => e.muscle === muscle && norm(e.name) !== norm(name))
    .map(e => ({ name: e.name, equip: exEquipment(e.name) }))
    .sort((a, b) => {
      const aDiff = a.equip !== origEquip ? 0 : 1;
      const bDiff = b.equip !== origEquip ? 0 : 1;
      if (aDiff !== bDiff) return aDiff - bDiff;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit)
    .map(e => e.name);
}

const EXERCISE_SECONDARIES = {"Barbell Bench Press":["Triceps","Shoulders"],"Incline Barbell Press":["Triceps","Shoulders"],"Decline Barbell Press":["Triceps","Shoulders"],"Incline DB Press":["Triceps","Shoulders"],"Flat DB Press":["Triceps","Shoulders"],"Decline DB Press":["Triceps","Shoulders"],"Cable Fly (Low-to-High)":[],"Cable Fly (High-to-Low)":[],"Cable Fly (Neutral)":[],"Pec Deck Machine":[],"DB Fly":[],"Incline DB Fly":[],"Dips":["Triceps","Shoulders"],"Weighted Dips":["Triceps","Shoulders"],"Push-Ups":["Triceps","Shoulders","Abs"],"Weighted Push-Ups":["Triceps","Shoulders","Abs"],"Wide-Grip Push-Ups":["Triceps","Shoulders","Abs"],"Archer Push-Ups":["Triceps","Shoulders","Abs"],"DB Pullover":["Back"],"Machine Chest Press":["Triceps","Shoulders"],"Smith Machine Bench Press":["Triceps","Shoulders"],"Smith Machine Incline Press":["Triceps","Shoulders"],"Landmine Press":["Triceps","Shoulders","Abs","Obliques"],"Svend Press":[],"Barbell Row":["Biceps","RearDelts","Forearms","Traps"],"Pendlay Row":["Biceps","RearDelts","Forearms","Traps"],"T-Bar Row":["Biceps","RearDelts","Forearms","Traps"],"T-Bar Row (Landmine)":["Biceps","RearDelts","Forearms","Traps"],"Seated Cable Row (Wide)":["Biceps","RearDelts","Forearms","Traps"],"Seated Cable Row (Narrow)":["Biceps","RearDelts","Forearms","Traps"],"Single-Arm DB Row":["Biceps","RearDelts","Forearms","Traps"],"Single-Arm Cable Row":["Biceps","RearDelts","Forearms","Traps"],"Chest-Supported Row":["Biceps","RearDelts","Forearms","Traps"],"Chest-Supported DB Row":["Biceps","RearDelts","Forearms","Traps"],"Incline DB Row":["Biceps","RearDelts","Forearms","Traps"],"Pull-Ups":["Biceps","RearDelts","Forearms"],"Weighted Pull-Ups":["Biceps","RearDelts","Forearms"],"Chin-Ups":["Biceps","RearDelts","Forearms"],"Neutral-Grip Pull-Ups":["Biceps","RearDelts","Forearms"],"Lat Pulldown (Wide)":["Biceps","RearDelts","Forearms"],"Lat Pulldown (Underhand)":["Biceps","RearDelts","Forearms"],"Lat Pulldown (Neutral)":["Biceps","RearDelts","Forearms"],"Single-Arm Lat Pulldown":["Biceps","RearDelts","Forearms"],"Straight-Arm Pulldown":["RearDelts","Forearms"],"Iso-Lateral Row (Machine)":["Biceps","RearDelts","Forearms","Traps"],"Hammer Strength Row":["Biceps","RearDelts","Forearms","Traps"],"Meadows Row":["Biceps","RearDelts","Forearms","Traps"],"Rack Pull":["RearDelts","Forearms","Hamstrings","Glutes","Traps","LowerBack"],"Inverted Row":["Biceps","RearDelts","Forearms","Traps"],"Cable Pullover":["RearDelts","Forearms"],"Face Pulls":["Traps","Back"],"Rear Delt Fly (Cable)":["Traps"],"Rear Delt Fly (DB)":["Traps"],"Rear Delt Fly (Machine)":["Traps"],"Band Pull-Apart":["Traps"],"Prone Y-Raise":["Traps"],"Overhead Press (Barbell)":["Triceps","Traps","Abs"],"Seated OHP (Barbell)":["Triceps","Traps"],"Seated DB Shoulder Press":["Triceps","Traps"],"Standing DB Shoulder Press":["Triceps","Traps","Abs"],"Arnold Press":["Triceps","Traps"],"Lateral Raises (DB)":["Traps"],"Lateral Raises (Cable)":["Traps"],"Lateral Raises (Machine)":["Traps"],"Seated Lateral Raises":["Traps"],"Front Raises (DB)":[],"Front Raises (Plate)":[],"Front Raises (Cable)":[],"Upright Row":["Traps","Biceps"],"Machine Shoulder Press":["Triceps","Traps"],"Smith Machine OHP":["Triceps","Traps"],"Push Press":["Triceps","Traps","Abs"],"Bradford Press":["Triceps","Traps"],"Lu Raises":["Traps"],"Barbell Shrugs":["Forearms"],"DB Shrugs":["Forearms"],"Cable Shrugs":["Forearms"],"Behind-the-Back Shrugs":["Forearms"],"Rack Pull (Traps focus)":["Back","Forearms"],"Farmer's Walk":["Shoulders","Forearms","Abs","Obliques"],"Barbell Curl":["Forearms"],"EZ Bar Curl":["Forearms"],"Dumbbell Curl":["Forearms"],"Alternating DB Curl":["Forearms"],"Incline DB Curl":["Forearms"],"Hammer Curl":["Forearms"],"Cross-Body Hammer Curl":["Forearms"],"Preacher Curl (EZ Bar)":["Forearms"],"Preacher Curl (DB)":["Forearms"],"Cable Curl (Single Arm)":["Forearms"],"Cable Curl (Both Arms)":["Forearms"],"Concentration Curl":["Forearms"],"Reverse Curl":["Forearms"],"Spider Curl":["Forearms"],"Drag Curl":["Forearms"],"21s (Barbell Curl)":["Forearms"],"Machine Curl":["Forearms","Back"],"Skull Crushers (EZ Bar)":[],"Skull Crushers (DB)":[],"Skull Crushers (Cable)":[],"Tricep Rope Pushdown":[],"Tricep Bar Pushdown":[],"Tricep Straight Bar Pushdown":[],"Single-Arm Tricep Pushdown":[],"Overhead Tricep Extension (DB)":[],"Overhead Tricep Extension (Cable)":[],"Overhead Tricep Extension (EZ Bar)":[],"Close-Grip Bench Press":["Chest","Shoulders"],"Tricep Dips":["Chest","Shoulders"],"Diamond Push-Ups":[],"JM Press":["Chest","Shoulders"],"Tate Press":[],"Machine Tricep Extension":[],"Barbell Back Squat":["Glutes","Hamstrings","Calves"],"Low Bar Squat":["Glutes","Hamstrings","Calves"],"High Bar Squat":["Glutes","Hamstrings","Calves"],"Front Squat":["Glutes","Hamstrings","Calves","Abs"],"Leg Press":["Glutes","Hamstrings","Calves"],"Leg Press (Single Leg)":["Glutes","Hamstrings","Calves"],"Hack Squat":["Glutes","Hamstrings","Calves"],"Bulgarian Split Squat":["Glutes","Hamstrings","Calves","Obliques"],"Walking Lunges":["Glutes","Hamstrings","Calves","Obliques"],"Reverse Lunges":["Glutes","Hamstrings","Calves","Obliques"],"Lateral Lunges":["Glutes","Hamstrings","Calves","Obliques"],"Leg Extension":[],"Leg Extension (Single)":[],"Step-Ups":["Glutes","Hamstrings","Calves","Obliques"],"Goblet Squat":["Glutes","Hamstrings","Calves","Abs"],"Smith Machine Squat":["Glutes","Hamstrings","Calves"],"Sissy Squat":[],"Cyclist Squat":[],"Deadlift":["Glutes","LowerBack","Back","Traps"],"Sumo Deadlift":["Glutes","LowerBack","Back","Traps"],"Romanian Deadlift":["Glutes","LowerBack","Back"],"Stiff-Leg Deadlift":["Glutes","LowerBack","Back"],"Single-Leg RDL":["Glutes","LowerBack","Back","Obliques"],"Lying Leg Curl":["Calves"],"Seated Leg Curl":["Calves"],"Standing Leg Curl":["Calves"],"Nordic Curl":["Calves"],"Good Morning":["Glutes","LowerBack","Back"],"Glute Ham Raise":["Calves"],"Hip Thrust (Barbell)":["Hamstrings"],"Hip Thrust (Machine)":["Hamstrings"],"Hip Thrust (DB)":["Hamstrings"],"Single-Leg Hip Thrust":["Hamstrings"],"Glute Kickback (Cable)":[],"Glute Kickback (Machine)":[],"Abduction Machine":[],"Cable Abduction":[],"Donkey Kicks":[],"Frog Pumps":[],"Clamshells":[],"45° Back Extension":["Hamstrings"],"Standing Calf Raise":[],"Seated Calf Raise":[],"Leg Press Calf Raise":[],"Single-Leg Calf Raise":[],"Smith Machine Calf Raise":[],"Donkey Calf Raise":[],"Tibialis Raise":[],"Plank":["Obliques"],"Side Plank":["Obliques"],"Cable Crunch":[],"Hanging Leg Raise":["Obliques"],"Hanging Knee Raise":["Obliques"],"Ab Wheel Rollout":["Obliques"],"Decline Crunch":[],"Decline Sit-Up":[],"Russian Twist":["Obliques"],"Landmine Rotation":["Obliques"],"Cable Woodchop":["Obliques"],"Pallof Press":["Obliques"],"Dragon Flag":["Obliques"],"Toes-to-Bar":[],"Reverse Crunch":[],"V-Up":[],"Hollow Body Hold":[],"Dead Bug":[],"Wrist Curl":[],"Reverse Wrist Curl":[],"Wrist Roller":[],"Plate Pinch":[],"Farmers Carry":["Traps","Abs","Obliques"],"Gripper":[],"Neck Extension":[],"Neck Flexion":[],"Neck Lateral Flexion":[],"Neck Harness":[],"Power Clean":["Traps","Quads","Hamstrings","Glutes","Shoulders","Abs"],"Hang Clean":["Traps","Quads","Hamstrings","Glutes","Shoulders","Abs"],"Clean and Jerk":["Traps","Quads","Hamstrings","Glutes","Shoulders","Abs"],"Snatch":["Traps","Quads","Hamstrings","Glutes","Shoulders","Abs"],"Hang Snatch":["Traps","Quads","Hamstrings","Glutes","Shoulders","Abs"],"Kettlebell Swing":["Glutes","Hamstrings","Back","Abs"],"Kettlebell Clean":["Traps","Quads","Hamstrings","Glutes","Shoulders","Abs"],"Kettlebell Snatch":["Traps","Quads","Hamstrings","Glutes","Shoulders","Abs"],"Trap Bar Deadlift":["Glutes","LowerBack","Back","Traps","Quads"],"Sled Push":["Quads","Glutes","Calves"],"Sled Pull":["Quads","Glutes","Calves"],"Battle Ropes":["Shoulders"],"Tire Flip":["Back","Quads","Abs"],"Box Jump":["Quads","Glutes","Calves"],"Broad Jump":["Quads","Glutes","Calves"],"Thruster":["Quads","Shoulders","Triceps","Abs"],"Wall Ball":["Quads","Shoulders","Abs"],"Bear Complex":["Quads","Shoulders","Abs"],"Treadmill Run":[],"Stationary Bike":[],"Rowing Machine":[],"Stair Master":[],"Elliptical":[],"Jump Rope":[],"Assault Bike":[],"Ski Erg":[],"Incline Walk":[],"Vinyasa Flow":[],"Hatha Yoga":[],"Ashtanga Yoga":[],"Yin Yoga":[],"Restorative Yoga":[],"Power Yoga":[],"Bikram / Hot Yoga":[],"Iyengar Yoga":[],"Kundalini Yoga":[],"Sivananda Yoga":[],"Acro Yoga":[],"Yoga Nidra":[],"Prenatal Yoga":[],"Chair Yoga":[],"Sun Salutation":[],"Pilates":[],"Mobility Flow":[],"Stretching":[],"Meditation":[],"High Row (Machine)":["Biceps","RearDelts","Forearms","Traps"],"Low Row (Machine)":["Biceps","RearDelts","Forearms","Traps"],"Plate-Loaded Row":["Biceps","RearDelts","Forearms","Traps"],"Assisted Pull-Up (Machine)":["Biceps","RearDelts","Forearms"],"Pullover Machine":["RearDelts","Forearms"],"Back Extension (Machine)":["Glutes","Hamstrings"],"Incline Chest Press (Machine)":["Triceps","Shoulders"],"Decline Chest Press (Machine)":["Triceps","Shoulders"],"Plate-Loaded Chest Press":["Triceps","Shoulders"],"Assisted Dip (Machine)":["Triceps","Shoulders"],"Plate-Loaded Shoulder Press":["Triceps","Traps"],"Reverse Pec Deck":["Traps"],"Adduction Machine":[],"Hack Squat (Machine)":["Glutes","Hamstrings","Calves"],"Pendulum Squat":["Glutes","Hamstrings","Calves"],"Belt Squat":["Glutes","Hamstrings","Calves"],"Glute Drive (Machine)":["Hamstrings"],"Reverse Hyperextension":["Hamstrings"],"Standing Calf Raise (Machine)":[],"Seated Calf Raise (Machine)":[],"Crunch Machine":[],"Ab Coaster":[],"Preacher Curl Machine":["Forearms","Back"],"Dip Machine":["Chest","Shoulders"],"Hammer Strength Chest Press":["Triceps","Shoulders"],"Floor Press":["Triceps","Shoulders"],"Dumbbell Pullover":["Back"],"Seal Row":["Biceps","RearDelts","Forearms","Traps"],"Kroc Row":["Biceps","RearDelts","Forearms","Traps"],"Machine High Row":["Biceps","RearDelts","Forearms","Traps"],"Z Press":["Triceps","Traps","Abs"],"Cable Lateral Raise":["Traps"],"Machine Lateral Raise":["Traps"],"Behind-the-Neck Press":["Triceps","Traps"],"Viking Press":["Triceps","Traps"],"Cable Rear Delt Fly":["Traps"],"Bent-Over Dumbbell Reverse Fly":["Traps"],"Face Pull (Rope)":["Traps","Back"],"Incline Dumbbell Curl":["Forearms"],"Cable Curl":["Forearms"],"Bayesian Cable Curl":["Forearms"],"Overhead Cable Extension":[],"Skull Crusher":[],"Cable Kickback":[],"Barbell Wrist Curl":[],"Reverse Barbell Curl":[],"Farmer's Carry":["Traps","Abs","Obliques"],"Barbell Shrug":["Forearms"],"Dumbbell Shrug":["Forearms"],"Cable Shrug":["Forearms"],"Trap Bar Shrug":["Forearms"],"Power Shrug":["Forearms"],"Walking Lunge":["Glutes","Hamstrings","Calves","Obliques"],"Step-Up":["Glutes","Hamstrings","Calves","Obliques"],"Seated Hamstring Curl (Cable)":["Calves"],"Razor Curl":["Calves"],"Back Extension":["Glutes"],"Hip Thrust":["Hamstrings"],"Barbell Glute Bridge":["Hamstrings"],"Cable Kickback (Glute)":[],"Bulgarian Split Squat (Glute)":["Hamstrings","Quads","Obliques"],"Hip Abduction Machine":[],"Frog Pump":[],"Incline Treadmill Walk":[],"Stair Climber":[]};

// Secondary-muscle credit only fires on a name in EXERCISE_SECONDARIES — but exact casing/spacing/
// parenthetical formatting can drift from how an exercise is actually logged. Fall back to a
// normalized match (same normalization used elsewhere for tolerant name matching) before giving up.
let _exerciseSecondariesNormCache = null;

const _normExerciseName = (s) => (s || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function getExerciseSecondaries(name) {
  if (!name) return [];
  if (EXERCISE_SECONDARIES[name]) return EXERCISE_SECONDARIES[name];
  if (!_exerciseSecondariesNormCache) {
    // Some distinct keys (e.g. "Back Extension" vs "Back Extension (Machine)") collapse to the
    // same normalized name but carry different secondary-muscle data. Picking either one would be
    // a guess, so an ambiguous normalized name resolves to no fallback match instead.
    const byNorm = {};
    for (const k of Object.keys(EXERCISE_SECONDARIES)) {
      const nk = _normExerciseName(k);
      (byNorm[nk] = byNorm[nk] || []).push(EXERCISE_SECONDARIES[k]);
    }
    _exerciseSecondariesNormCache = {};
    for (const nk of Object.keys(byNorm)) {
      const vals = byNorm[nk];
      if (vals.every(v => JSON.stringify(v) === JSON.stringify(vals[0]))) {
        _exerciseSecondariesNormCache[nk] = vals[0];
      }
    }
  }
  return _exerciseSecondariesNormCache[_normExerciseName(name)] || [];
}

// Map a muscle name to the body-map region(s) it lights up. Some muscles (traps/forearms/calves)
// live on both views; aliases "Back"->Lats and "RearDelts"->Rear Delts are handled here.
const MUSCLE_REGION_MAP = {
  Chest:[["front","Chest"]],
  Back:[["back","Lats"]], Lats:[["back","Lats"]],
  Shoulders:[["front","Shoulders"]], "Front Delts":[["front","Shoulders"]],
  "Rear Delts":[["back","Rear Delts"]], RearDelts:[["back","Rear Delts"]],
  Traps:[["front","Traps"],["back","Traps"]],
  Biceps:[["front","Biceps"]],
  Triceps:[["back","Triceps"]],
  Forearms:[["front","Forearms"],["back","Forearms"]],
  Quads:[["front","Quads"]], Quadriceps:[["front","Quads"]],
  Hamstrings:[["back","Hamstrings"]], Hamstring:[["back","Hamstrings"]],
  Glutes:[["back","Glutes"]],
  Calves:[["front","Calves"],["back","Calves"]],
  Core:[["front","Abs"],["front","Obliques"]], Abs:[["front","Abs"]],
  Obliques:[["front","Obliques"]],
  "Lower Back":[["back","LowerBack"]], LowerBack:[["back","LowerBack"]],
};

function _regionsFor(muscle) {
  if (!muscle) return [];
  return MUSCLE_REGION_MAP[muscle] || MUSCLE_REGION_MAP[(muscle || "").split("/")[0].trim()] || [];
}

// Display name for an internal muscle key. Module-level because two callers need it now (the
// coach summary and the readiness card); it used to be a local const inside one function.
const _cleanMuscle = (m) => ({ RearDelts: "Rear Delts", LowerBack: "Lower Back" }[m] || m);

// Exported: only what App.jsx and src/lazy/ actually import. The index maps, the norm caches,
// the alias table and the mutable custom-exercise registry stay PRIVATE — they are implementation
// detail of the resolution above, and `_customExercises` in particular must only ever be written
// through setCustomExerciseRegistry (an imported binding is read-only, so a direct assignment
// from another module would be a hard error rather than a silent no-op).
export { EXERCISE_DB, MUSCLE_REGION_MAP, EXERCISE_SECONDARIES, exEquipment, resolveMuscle, setCustomExerciseRegistry, _exNorm, canonicalExName, getExEntry, getMuscle, suggestExerciseSubstitutes, getExerciseSecondaries, _regionsFor, _cleanMuscle };