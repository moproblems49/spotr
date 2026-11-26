// First-log rule (Nov 26): the first time an exercise is logged is a baseline, not a PR.
// Drives the shipped engine functions; nothing here re-implements the maths.
import { reconstructPrEvents, prsBySession, dropFirstLogEvents } from "../src/engine/insights.js";
import { getSetPRTypes } from "../src/engine/workout.js";
let fails = 0;
const ok = (c, m, d) => { console.log((c ? "PASS " : "FAIL ") + m + (c ? "" : "  " + JSON.stringify(d))); if (!c) fails++; };
const set = (w, r) => ({ weight: String(w), reps: String(r), done: true, type: "normal" });
const sess = (dk, sid, exs) => [dk, { [sid]: { finishedAt: new Date(dk + "T18:00:00").getTime(), unit: "lbs", exercises: exs } }];
const history = Object.fromEntries([
  sess("2026-11-01", "s1", [{ name: "Bench", sets: [set(135, 8)] }, { name: "Squat", sets: [set(185, 5)] }]),
  sess("2026-11-03", "s2", [{ name: "Bench", sets: [set(145, 8)] }, { name: "Row", sets: [set(95, 10)] }]),
  sess("2026-11-05", "s3", [{ name: "Bench", sets: [set(140, 8)] }, { name: "Squat", sets: [set(195, 5)] }]),
]);
const ev = reconstructPrEvents(history, Infinity);
const key = e => e.sid + ":" + e.name;
ok(!ev.some(e => e.sid === "s1"), "first session of every lift emits no PR", ev.map(key));
ok(!ev.some(e => e.name === "Row"), "Row logged once -> no PR", ev.map(key));
ok(ev.some(e => key(e) === "s2:Bench"), "second-time bench that beat the first IS a PR", ev.map(key));
ok(ev.some(e => key(e) === "s3:Squat"), "second-time squat that beat the first IS a PR", ev.map(key));
ok(!ev.some(e => key(e) === "s3:Bench"), "a lighter repeat is not a PR", ev.map(key));
const by = prsBySession(history);
ok(!by.has("s1") && by.get("s2")?.names.has("Bench") && !by.get("s2")?.names.has("Row"), "prsBySession follows the same rule", [...by.entries()].map(([k, v]) => [k, [...v.names]]));
const stored = [
  { date: "2026-11-01", sid: "s1", name: "Bench", weightLbs: 135, types: ["weight"] },
  { date: "2026-11-03", sid: "s2", name: "Row", weightLbs: 95, types: ["weight"] },
  { date: "2026-11-03", sid: "s2", name: "Bench", weightLbs: 145, types: ["weight"] },
  { date: "2026-11-01", name: "Squat", weightLbs: 185, types: ["weight"] },   // legacy row, no sid
];
const kept = dropFirstLogEvents(stored, history);
ok(kept.length === 1 && kept[0].name === "Bench" && kept[0].sid === "s2", "old stored first-log events are dropped on load", kept);
const none = getSetPRTypes({ prs: {}, prsE1rm: {}, prsVolume: {} }, "Curl", 30, 10, "lbs");
ok(none.types.length === 0, "live set badge stays quiet on a never-logged lift", none.types);
const beat = getSetPRTypes({ prs: { Curl: 25 }, prsE1rm: { Curl: 30 }, prsVolume: { Curl: 250 } }, "Curl", 30, 10, "lbs");
ok(beat.types.includes("weight"), "live set badge still fires once a record exists", beat.types);
console.log(fails ? `FAIL ${fails}` : "PASS all");
process.exit(fails ? 1 : 0);
