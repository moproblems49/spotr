// Cardio minutes / distance and plank seconds are not pounds moved (Muse, Nov 28).
// Imports the shipped engine; nothing here re-implements the maths.
import { setKindOf } from "../src/engine/exercises.js";
import { sessionVolume, postWorkoutPayload, getSetPRTypes, historySetsSummary, suggestNextSet, detectDeloadNeeded } from "../src/engine/workout.js";
import { reconstructPrEvents, dropFirstLogEvents } from "../src/engine/insights.js";
let fail = 0;
const ok = (c, m, extra = "") => { console.log(`${c ? "PASS" : "FAIL"} ${m}${extra ? "  " + extra : ""}`); if (!c) fail++; };
const S = (weight, reps) => ({ weight: String(weight), reps: String(reps), done: true, type: "normal" });

ok(setKindOf("Treadmill Run") === "cardio", "[control] treadmill is cardio");
ok(setKindOf("Plank") === "timed", "plank is a timed hold");
ok(setKindOf("Barbell Bench Press") === "lift", "[control] bench is a lift");

const sess = { unit: "lbs", exercises: [
  { name: "Barbell Bench Press", sets: [S(100, 10), S(100, 8)] },     // 1800
  { name: "Treadmill Run", sets: [S(15, 1)] },
  { name: "Rowing Machine", sets: [S(10, 1)] },
  { name: "Plank", sets: [S(0, 60), S(25, 45)] },
]};
const v = sessionVolume(sess);
ok(v === 1800, "session volume counts lifts only", `got ${v}`);
const card = postWorkoutPayload(sess.exercises, {}, new Set(["Treadmill Run", "Plank"]), "lbs");
ok(card.volume === 1800, "card volume counts lifts only", `got ${card.volume}`);
ok(card.exercises.length === 4, "card still lists cardio and the hold");
ok(!card.exercises.find(e => e.name === "Treadmill Run").isPR, "cardio cannot carry a PR flag");
const store = { prs: { "Treadmill Run": 5, Plank: 10 }, prsE1rm: {}, prsVolume: {}, history: {} };
ok(getSetPRTypes(store, "Treadmill Run", 15, 1, "lbs").types.length === 0, "live badge: no PR on a run");
ok(getSetPRTypes(store, "Plank", 25, 45, "lbs").types.length === 0, "live badge: no PR on a plank");
ok(getSetPRTypes({ prs: { "Barbell Bench Press": 90 }, prsE1rm: {}, prsVolume: {} }, "Barbell Bench Press", 100, 5, "lbs").types.includes("weight"), "[control] a real bench PR still fires");

const mk = (exs) => ({ unit: "lbs", finishedAt: 0, exercises: exs });
const hist = {
  "2026-11-20": { a: { ...mk([{ name: "Treadmill Run", sets: [S(10, 1)] }, { name: "Barbell Bench Press", sets: [S(90, 5)] }]), finishedAt: Date.parse("2026-11-20T12:00") } },
  "2026-11-27": { b: { ...mk([{ name: "Treadmill Run", sets: [S(15, 1)] }, { name: "Barbell Bench Press", sets: [S(100, 5)] }]), finishedAt: Date.parse("2026-11-27T12:00") } },
};
const ev = reconstructPrEvents(hist, Infinity);
ok(!ev.some(e => e.name === "Treadmill Run"), "PR log: a longer run is not a PR", JSON.stringify(ev.map(e => e.name)));
ok(ev.some(e => e.name === "Barbell Bench Press"), "[control] PR log: heavier bench is");
const kept = dropFirstLogEvents([{ name: "Treadmill Run", date: "2026-11-27", sid: "b" }, { name: "Barbell Bench Press", date: "2026-11-27", sid: "b" }], hist);
ok(kept.length === 1 && kept[0].name === "Barbell Bench Press", "stored pre-fix cardio PR events are dropped on load");

ok(historySetsSummary([S(0, 60), S(0, 45)], "lbs", 4, "timed") === "60s · 45s", "History prints a hold as seconds", historySetsSummary([S(0, 60), S(0, 45)], "lbs", 4, "timed"));
ok(historySetsSummary([S(25, 45)], "lbs", 4, "timed") === "25 lbs × 45s", "weighted hold");
ok(historySetsSummary([S(30, 1.2)], "lbs", 4, "cardio") === "30 min · 1.2 mi", "[control] cardio summary");
ok(suggestNextSet({ history: hist }, "Treadmill Run", "8-12", "lbs") === null, "no overload suggestion on cardio");
ok(detectDeloadNeeded({ history: hist }, "Plank", "lbs").stalled === false, "no plateau verdict on a hold");
console.log(fail ? `FAIL ${fail}` : "PASS all");
process.exit(fail ? 1 : 0);
