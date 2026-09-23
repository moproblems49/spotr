// sim_strongimport — the Strong CSV importer's engine (src/engine/strongimport.js).
//
// SYNTHETIC FIXTURE ON PURPOSE. The format was learned from a real user export, but that file is
// personal training data and this repo is PUBLIC, so it is never committed. Every quirk the real
// file had is reproduced here by hand: W/F/"Rest Timer" set orders, a note containing a comma and
// a NEWLINE, broken durations ("23h 30m", "30s"), a 12,813-second plank, an empty set.
//
// The resolver checks pin the three WRONG matches the real file exposed. A wrong match is worse
// than a miss: it silently files sets under the wrong exercise (and its PRs) while every screen
// looks fine. Each case below matched the wrong entry on an earlier version of the ladder.
import { parseCsv, parseStrongExport, strongToSessions, resolveImportName, resolveImportNames,
         strongSessionId, parseStrongDuration } from "../src/engine/strongimport.js";
import { getMuscle } from "../src/engine/exercises.js";

let fails = 0;
const ok = (c, m, extra = "") => { console.log(`${c ? "PASS" : "FAIL"} ${m}${!c && extra ? "  -> " + extra : ""}`); if (!c) fails++; };

const CSV = [
  'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
  '2024-03-05 18:00:00,"Push A",1h 10m,"Bench Press (Barbell)",W,95.0,10.0,0,0.0,"","Felt strong",',
  '2024-03-05 18:00:00,"Push A",1h 10m,"Bench Press (Barbell)",1,185.0,5.0,0,0.0,"Pause reps, ""tight""\nnext time 190",,8',
  '2024-03-05 18:00:00,"Push A",1h 10m,"Bench Press (Barbell)",2,185.0,5.0,0,0.0,,,',
  '2024-03-05 18:00:00,"Push A",1h 10m,"Bench Press (Barbell)",Rest Timer,0,0.0,0,90.0,,,',
  '2024-03-05 18:00:00,"Push A",1h 10m,"Plank",1,0,0.0,0,45.0,,,',
  '2024-03-05 18:00:00,"Push A",1h 10m,"Plank",2,0,0.0,0,12813.0,,,',
  '2024-03-05 18:00:00,"Push A",1h 10m,"Chin Up",1,4.0,0.0,0,0.0,,,',
  '2024-03-07 07:30:00,"Legs",23h 30m,"Squat (Barbell)",1,225.0,5.0,0,0.0,,,',
  '2024-03-07 07:30:00,"Legs",23h 30m,"Squat (Barbell)",F,225.0,3.0,0,0.0,,,',
  '2024-03-09 12:00:00,"Quick",30s,"Chest Fly",1,50.0,12.0,0,0.0,,,',
].join("\n");

console.log("\n[csv]");
const rows = parseCsv(CSV);
ok(rows.length === 11, "11 records despite a quoted newline inside a note", `got ${rows.length}`);
ok(rows[2][9] === 'Pause reps, "tight"\nnext time 190', "quoted comma, doubled quote and newline survive", JSON.stringify(rows[2][9]));

console.log("\n[durations]");
ok(parseStrongDuration("1h 10m") === 4200, "1h 10m -> 4200s");
ok(parseStrongDuration("23h 30m") === 0, "a timer left running is unknown (0), not 23.5h");
ok(parseStrongDuration("30s") === 0, "30s (logged after the fact) is unknown");
ok(parseStrongDuration("garbage") === 0, "unparseable is unknown");

console.log("\n[parse]");
const { workouts, skippedSets } = parseStrongExport(CSV);
ok(workouts.length === 3, "3 workouts", `got ${workouts.length}`);
const push = workouts.find((w) => w.name === "Push A");
const bench = push.exercises.find((e) => e.rawName === "Bench Press (Barbell)");
ok(bench.sets.length === 3, "Rest Timer is NOT a set (3 bench sets, not 4)", `got ${bench.sets.length}`);
ok(bench.sets[0].type === "warmup" && bench.sets[1].type === "normal", "W -> warmup, 1 -> normal");
ok(bench.sets[1].rpe === 8, "RPE carried");
ok(bench.sets[1].weight === "185" && bench.sets[1].reps === "5", "numbers cleaned (185.0 -> \"185\")");
const plank = push.exercises.find((e) => e.rawName === "Plank");
ok(plank.sets.length === 1 && plank.sets[0].reps === "45", "timed set -> seconds in reps; 12,813s timer dropped", JSON.stringify(plank?.sets));
ok(!push.exercises.find((e) => e.rawName === "Chin Up"), "an exercise whose only set was empty is dropped");
ok(skippedSets === 2, "2 sets skipped (runaway timer + empty)", `got ${skippedSets}`);
ok(workouts.find((w) => w.name === "Legs").exercises[0].sets[1].type === "failure", "F -> failure");
ok(push.workoutNote === "Felt strong", "workout note captured");
let threw = "";
try { parseStrongExport("a,b,c\n1,2,3"); } catch (e) { threw = e.message; }
ok(/Strong export/.test(threw), "a non-Strong CSV is refused with a readable message", threw);

console.log("\n[resolver: the real export's wrong-matches stay fixed]");
const cases = {
  "Standing Calf Raise (Smith Machine)": "Smith Machine Calf Raise",
  "Reverse Fly (Dumbbell)": "Rear Delt Fly (DB)",
  "Triceps Extension (Machine)": "Machine Tricep Extension",
  "Triceps Pushdown (Cable - Straight Bar)": "Tricep Straight Bar Pushdown",
  "Bench Press (Barbell)": "Barbell Bench Press",
  "Squat (Barbell)": "Barbell Back Squat",
  "Bent Over Row (Barbell)": "Barbell Row",
  "Bench Press (Dumbbell)": "Flat DB Press",
  "Pull Up": "Pull-Ups",
};
for (const [raw, want] of Object.entries(cases)) {
  const got = resolveImportName(raw)?.name;
  ok(got === want, `${raw} -> ${want}`, `got ${got}`);
}
ok(resolveImportName("Chest Fly") === null, "equipment-less 'Chest Fly' is NOT guessed (cable vs DB vs pec deck)");
ok(resolveImportName("Forearms") === null, "a user's own name is handed back, not guessed");
const { matched } = resolveImportNames(Object.keys(cases));
ok(Object.values(matched).every((m) => getMuscle(m.name)), "every resolved name has a real muscle");

console.log("\n[sessions]");
const nameMap = { "Bench Press (Barbell)": "Barbell Bench Press", "Plank": "Plank", "Squat (Barbell)": "Barbell Back Squat", "Chest Fly": "Cable Fly (Neutral)" };
const S = strongToSessions(workouts, { userId: "user-a", unit: "lbs", nameMap });
const s0 = S.find((s) => s.dayName === "Push A");
ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s0.id), "id is a valid UUID (the column is uuid NOT NULL)", s0.id);
const again = strongToSessions(parseStrongExport(CSV).workouts, { userId: "user-a", unit: "lbs", nameMap });
ok(again.map((s) => s.id).join() === S.map((s) => s.id).join(), "re-importing the same file yields the SAME ids (upsert, not a second copy)");
ok(strongSessionId("user-b", "2024-03-05 18:00:00", "Push A") !== s0.id, "ids are scoped per user (the id is a GLOBAL primary key)");
ok(new Set(S.map((s) => s.id)).size === S.length, "no two sessions share an id");
ok(s0.date === "2024-03-05" && s0.duration === 4200, "date + duration");
ok(S.find((s) => s.dayName === "Legs").duration === 0, "a broken duration imports as unknown");
ok(new Date(s0.finishedAt).getHours() === 19 && new Date(s0.finishedAt).getMinutes() === 10, "finishedAt = local start + duration (19:10)");
ok(s0.exercises.every((e) => !("note" in e)), "notes are NOT in the exercises jsonb (that row is follower-readable)");
ok(s0.notes["Barbell Bench Press"]?.startsWith("Felt strong") && s0.notes["Barbell Bench Press"].includes("next time 190"),
   "workout note + exercise note land in the private notes map, on the first exercise", JSON.stringify(s0.notes));
threw = "";
try { strongToSessions(workouts, { userId: "u", unit: "lbs", nameMap: { Plank: "Plank" } }); } catch (e) { threw = e.message; }
ok(/No mapping/.test(threw), "an unmapped exercise REFUSES rather than importing a muscle-less name", threw);

console.log(`\n${fails ? "FAIL" : "PASS"} sim_strongimport (${fails} failure${fails === 1 ? "" : "s"})`);
process.exit(fails ? 1 : 0);
