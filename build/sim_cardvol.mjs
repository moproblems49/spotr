// A SHARED WORKOUT CARD MUST REPORT THE SAME NUMBERS AS HISTORY.
//
// The workout payload a post carries was built in FIVE places — the original write at finish, the
// local post rebuild after an edit, the server feed-post rebuild, the server group-post rebuild,
// and the history->feed item. Four of the five counted WARMUP sets into `volume` and listed them
// on the card, while History/Profile/the finish summary use sessionVolume() and exclude them.
//
// Measured against live data before the fix: a leg day History reports as 8,440 showed 9,920 on the
// feed — 17.5% heavier — and merely EDITING a shared workout re-inflated a card that had been
// written correctly at finish.
const _ls = new Map();
globalThis.localStorage = { getItem: k => (_ls.has(k) ? _ls.get(k) : null), setItem: (k, v) => _ls.set(k, String(v)), removeItem: k => _ls.delete(k) };
globalThis.window = undefined;

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const { postWorkoutPayload, sessionVolume, workingDone } = await import("./app.mjs");

const set = (w, r, extra = {}) => ({ weight: String(w), reps: String(r), done: true, type: "normal", ...extra });
const warm = (w, r) => set(w, r, { type: "warmup" });

// A realistic leg day: warmups on the squat, then working sets.
const sess = {
  unit: "lbs",
  exercises: [
    { name: "Barbell Back Squat", sets: [warm(135, 10), warm(185, 5), set(275, 5), set(275, 5), set(275, 4)] },
    { name: "Romanian Deadlift",  sets: [warm(135, 8), set(225, 8), set(225, 8)] },
    { name: "Leg Press",          sets: [set(400, 12), set(400, 12)] },
  ],
};

const card = postWorkoutPayload(sess.exercises, {}, null, "lbs");
const history = sessionVolume(sess);
console.log(`card volume = ${card.volume}, history volume = ${history}`);

// ── The invariant ────────────────────────────────────────────────────────────────────────────
check("the shared card's volume equals what History reports for the same session",
  card.volume === Math.round(history), `${card.volume} vs ${Math.round(history)}`);

const warmupVol = 135*10 + 185*5 + 135*8;
check("...and that is NOT the warmup-inclusive total",
  card.volume !== Math.round(history) + warmupVol, `warmups would add ${warmupVol}`);

// ── Warmups must not appear on the card at all ───────────────────────────────────────────────
const squat = card.exercises.find(e => e.name === "Barbell Back Squat");
check("the squat shows its 3 working sets, not all 5", squat?.sets.length === 3, JSON.stringify(squat?.sets));
check("...and no 135 warmup set is listed", !squat?.sets.some(s => s.w === 135), JSON.stringify(squat?.sets));
check("every listed set is a working set",
  card.exercises.every(e => e.sets.length === workingDone(sess.exercises.find(x => x.name === e.name).sets).length));

// ── A warmup can't set a PR ──────────────────────────────────────────────────────────────────
// Stored PRs are in LBS. A 315 warmup single must not flag a PR when the working sets are lighter.
const prSess = [{ name: "Bench", sets: [warm(315, 1), set(225, 5)] }];
const prCard = postWorkoutPayload(prSess, { Bench: 300 }, null, "lbs");
check("a heavy WARMUP does not flag a PR", prCard.exercises[0].isPR === false, JSON.stringify(prCard.exercises[0]));

// ── The kg comparison: store.prs is in LBS ───────────────────────────────────────────────────
// 100kg = 220.5lbs, so against a 200lb stored max this IS a PR. Comparing the raw 100 against 200
// said no — a kg user's cards never showed a PR flag.
const kgCard = postWorkoutPayload([{ name: "Squat", sets: [set(100, 5)] }], { Squat: 200 }, null, "kg");
check("a kg session converts before comparing against the lbs PR store",
  kgCard.exercises[0].isPR === true, JSON.stringify(kgCard.exercises[0]));
const kgNoPR = postWorkoutPayload([{ name: "Squat", sets: [set(80, 5)] }], { Squat: 200 }, null, "kg");
check("...and still says no when it genuinely isn't one (80kg = 176lbs)",
  kgNoPR.exercises[0].isPR === false, JSON.stringify(kgNoPR.exercises[0]));

// ── The finish path passes the REAL PR set, which must win over the heuristic ─────────────────
const named = postWorkoutPayload([{ name: "Bench", sets: [set(135, 5)] }], { Bench: 500 }, new Set(["Bench"]), "lbs");
check("an explicit PR set is trusted over the stored-max guess", named.exercises[0].isPR === true);
const notNamed = postWorkoutPayload([{ name: "Bench", sets: [set(495, 1)] }], { Bench: 100 }, new Set(), "lbs");
check("...and so is an explicit NON-PR", notNamed.exercises[0].isPR === false);

// ── Shape / junk ─────────────────────────────────────────────────────────────────────────────
check("an exercise with nothing logged is left off the card",
  postWorkoutPayload([{ name: "Ghost", sets: [{ weight:"225", reps:"5", done:false, type:"normal" }] }], {}, null, "lbs").exercises.length === 0);
check("an exercise with only warmups is left off the card",
  postWorkoutPayload([{ name: "OnlyWarm", sets: [warm(135, 10)] }], {}, null, "lbs").exercises.length === 0);
check("an unnamed exercise is left off the card",
  postWorkoutPayload([{ sets: [set(100, 5)] }], {}, null, "lbs").exercises.length === 0);
check("no exercises at all gives a zero-volume card",
  postWorkoutPayload([], {}, null, "lbs").volume === 0);
check("undefined input doesn't throw", postWorkoutPayload(undefined, undefined, undefined, undefined).volume === 0);
check("sets are emitted as {w,r} NUMBER pairs, the shape the card renders",
  typeof card.exercises[0].sets[0].w === "number" && typeof card.exercises[0].sets[0].r === "number");

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
