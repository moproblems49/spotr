// "YOU BEAT LAST TIME" — the finish summary's lift-by-lift comparison.
//
// The summary already showed session volume vs last time, which is an abstract number nobody
// trains for. This compares each exercise's top working set against the last time that exercise
// was trained: heavier, or the same weight for more reps. Getting the comparison wrong is worse
// than not having it — claiming a PR that isn't one destroys trust in every other number.
const _ls = new Map();
globalThis.localStorage = { getItem: k => (_ls.has(k) ? _ls.get(k) : null), setItem: (k,v) => _ls.set(k,String(v)), removeItem: k => _ls.delete(k) };
globalThis.window = undefined;

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const { sessionWins, topSet } = await import("./app.mjs");

const set = (w, r, extra = {}) => ({ weight: String(w), reps: String(r), done: true, type: "normal", ...extra });
const sess = (exercises) => ({ exercises });
const hist = (day, sid, exercises) => ({ [day]: { [sid]: { exercises } } });

// ── topSet ranks by WEIGHT first, then reps — how a lifter reads their own log ────────────────
check("top set is the heaviest, not the highest-rep",
  topSet([set(205, 8), set(225, 3)]).w === 225, JSON.stringify(topSet([set(205, 8), set(225, 3)])));
check("...and at equal weight, the most reps wins",
  topSet([set(225, 3), set(225, 6)]).r === 6);
check("warmups never count as the top set",
  topSet([set(315, 1, { type: "warmup" }), set(225, 5)]).w === 225);
check("unfinished sets never count", topSet([{ weight:"405", reps:"1", done:false, type:"normal" }, set(225,5)]).w === 225);
check("no completed sets gives no top set", topSet([{ weight:"225", reps:"5", done:false }]) === null);

// ── The three outcomes ───────────────────────────────────────────────────────────────────────
const store = { history: hist("2026-07-20", "old1", [
  { name: "Barbell Bench Press", sets: [set(195, 5), set(195, 5)] },
  { name: "Barbell Back Squat",  sets: [set(275, 5)] },
  { name: "Lat Pulldown (Wide)", sets: [set(140, 10)] },
]) };

const wins = sessionWins(sess([
  { name: "Barbell Bench Press", sets: [set(205, 5)] },              // +10 lbs
  { name: "Barbell Back Squat",  sets: [set(275, 8)] },              // same weight, +3 reps
  { name: "Lat Pulldown (Wide)", sets: [set(130, 10)] },             // lighter — not a win
  { name: "Romanian Deadlift",   sets: [set(185, 8)] },              // never done before
]), store);
console.log("WINS:", JSON.stringify(wins));

const byName = Object.fromEntries(wins.map(w => [w.name, w]));
check("a heavier top set is reported as a weight win",
  byName["Barbell Bench Press"]?.kind === "weight" && byName["Barbell Bench Press"]?.by === 10, JSON.stringify(byName["Barbell Bench Press"]));
check("same weight for more reps is reported as a rep win",
  byName["Barbell Back Squat"]?.kind === "reps" && byName["Barbell Back Squat"]?.by === 3, JSON.stringify(byName["Barbell Back Squat"]));
check("a LIGHTER session is not dressed up as a win", !byName["Lat Pulldown (Wide)"]);
check("a first-time exercise is marked as such, not as beating anything",
  byName["Romanian Deadlift"]?.kind === "first", JSON.stringify(byName["Romanian Deadlift"]));
check("heavier ranks above more-reps, which ranks above first-time",
  wins.map(w => w.kind).join(",") === "weight,reps,first", wins.map(w => w.kind).join(","));

// ── The trap: this workout is usually already IN history by the time the summary renders ─────
const storeWithToday = { history: {
  ...hist("2026-07-20", "old1", [{ name: "Barbell Bench Press", sets: [set(195, 5)] }]),
  "2026-07-31": { "todaysid": { exercises: [{ name: "Barbell Bench Press", sets: [set(205, 5)] }] } },
} };
const naive = sessionWins(sess([{ name: "Barbell Bench Press", sets: [set(205, 5)] }]), storeWithToday);
check("without skipping today's row, the lift compares against ITSELF and shows nothing",
  naive.length === 0, JSON.stringify(naive));
const skipped = sessionWins(sess([{ name: "Barbell Bench Press", sets: [set(205, 5)] }]), storeWithToday, "todaysid");
check("skipping this session's id finds the real previous best",
  skipped[0]?.kind === "weight" && skipped[0]?.by === 10, JSON.stringify(skipped));

// ── Nothing improved → nothing claimed ───────────────────────────────────────────────────────
const flat = sessionWins(sess([{ name: "Barbell Bench Press", sets: [set(195, 5)] }]), store);
check("repeating last week exactly claims no win", flat.length === 0, JSON.stringify(flat));
const worse = sessionWins(sess([{ name: "Barbell Bench Press", sets: [set(195, 3)] }]), store);
check("fewer reps at the same weight claims no win", worse.length === 0, JSON.stringify(worse));

// ── Junk in ──────────────────────────────────────────────────────────────────────────────────
check("an empty session is fine", sessionWins(sess([]), store).length === 0);
check("a session with no exercises key is fine", sessionWins({}, store).length === 0);
check("an unnamed exercise is skipped", sessionWins(sess([{ sets: [set(100, 5)] }]), store).length === 0);
check("an empty store is fine (everything is first-time)",
  sessionWins(sess([{ name: "Bench", sets: [set(100, 5)] }]), { history: {} })[0]?.kind === "first");

// Bodyweight work has no weight — a rep gain must still register.
const bwStore = { history: hist("2026-07-20", "o", [{ name: "Pull-Ups", sets: [set(0, 8)] }]) };
const bw = sessionWins(sess([{ name: "Pull-Ups", sets: [set(0, 11)] }]), bwStore);
check("bodyweight reps count as a rep win", bw[0]?.kind === "reps" && bw[0]?.by === 3, JSON.stringify(bw));

// Fractional plates shouldn't produce 10.000000000000002
const fracStore = { history: hist("2026-07-20", "o", [{ name: "DB Curl", sets: [set(27.5, 10)] }]) };
const frac = sessionWins(sess([{ name: "DB Curl", sets: [set(30, 10)] }]), fracStore);
check("fractional weights give a clean delta", frac[0]?.by === 2.5, JSON.stringify(frac));

// ── UNITS. getLastExerciseSession returns RAW numbers in the previous session's own unit and
// hands back `.unit` so the caller converts (suggestNextSet does). Comparing raw across a unit
// switch both invents wins and hides real ones — and a session's unit is stamped per session
// precisely because it can change.
const kgStore = { history: { "2026-07-20": { o: { unit: "kg",
  exercises: [{ name: "Barbell Back Squat", sets: [set(100, 5)] }] } } } };

// 100kg = 220.5lbs. Today's 225lbs IS a win, but only by ~4.5lbs — not by 125.
const upgraded = sessionWins(sess([{ name: "Barbell Back Squat", sets: [set(225, 5)] }]), kgStore, null, "lbs");
console.log("KG→LBS:", JSON.stringify(upgraded));
check("a kg history compared in lbs reports the REAL delta, not the raw number difference",
  upgraded[0]?.kind === "weight" && upgraded[0]?.by > 3 && upgraded[0]?.by < 6, JSON.stringify(upgraded));

// The opposite direction is the one that silently swallows a PR: 102.5kg today vs 225lbs last
// time is a genuine increase, but 102.5 < 225 as raw numbers, so it reported nothing at all.
const lbStore = { history: { "2026-07-20": { o: { unit: "lbs",
  exercises: [{ name: "Barbell Bench Press", sets: [set(225, 5)] }] } } } };
const inKg = sessionWins(sess([{ name: "Barbell Bench Press", sets: [set(105, 5)] }]), lbStore, null, "kg");
console.log("LBS→KG:", JSON.stringify(inKg));
check("a real PR isn't swallowed when the user logs in kg against lbs history",
  inKg[0]?.kind === "weight", JSON.stringify(inKg));

// And a genuinely lighter session across units still isn't dressed up as a win.
const lighterKg = sessionWins(sess([{ name: "Barbell Back Squat", sets: [set(200, 5)] }]), kgStore, null, "lbs");
check("a lighter session across units is still not a win", lighterKg.length === 0, JSON.stringify(lighterKg));

// Same unit on both sides must be untouched by the conversion.
const same = sessionWins(sess([{ name: "Barbell Bench Press", sets: [set(235, 5)] }]), lbStore, null, "lbs");
check("same-unit comparisons are unaffected", same[0]?.by === 10, JSON.stringify(same));

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
