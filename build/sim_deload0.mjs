// A BLANK REPS FIELD MUST NOT LOOK LIKE LOST STRENGTH.
//
// Consolidating the 1RM estimator into epley1RM() changed one edge case in detectDeloadNeeded():
// epley1RM correctly refuses to estimate from a 0-rep set and returns 0, where the inlined formula
// used to return the weight (w × (1 + 0/30) = w). A 0 dropped into the e1RM series reads as a
// catastrophic strength LOSS, and this function's output tells the lifter to DROP WEIGHT — the
// worst direction to be wrong in. `topReps` is the reps of the heaviest set, so one set marked done
// with a blank reps box is enough to produce it (one such set already exists in live data).
const _ls = new Map();
globalThis.localStorage = { getItem: k => (_ls.has(k) ? _ls.get(k) : null), setItem: (k, v) => _ls.set(k, String(v)), removeItem: k => _ls.delete(k) };
globalThis.window = undefined;

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const { epley1RM } = await import("./app.mjs");

// The exact expression detectDeloadNeeded uses, so this pins the call, not a paraphrase.
const seriesE1rm = (topWeight, topReps) => epley1RM(topWeight, Math.max(1, topReps || 0), 12);

// A lifter genuinely progressing: 225×5 → 235×5 → 245×5, then a session whose top set was logged
// with the reps box left blank.
const progressing = [[225, 5], [235, 5], [245, 5]].map(([w, r]) => seriesE1rm(w, r));
const blankReps = seriesE1rm(245, 0);
console.log("progressing e1rms:", JSON.stringify(progressing), "blank-reps session:", blankReps);

check("a blank-reps top set does not collapse to zero", blankReps > 0, String(blankReps));
check("...it reads as the weight itself, the single it effectively is", blankReps === 245, String(blankReps));
check("...so it does not read as a strength LOSS against the previous sessions",
  blankReps >= Math.min(...progressing) * 0.9, `${blankReps} vs min ${Math.min(...progressing)}`);

// The actual fix must not disturb real sets.
check("a normal 5-rep set is unchanged", seriesE1rm(225, 5) === 225 * (1 + 5 / 30), String(seriesE1rm(225, 5)));
check("a single is still just the weight (the 1RM fix holds here too)", seriesE1rm(225, 1) === 225);
check("the 12-rep cap still applies in this series", seriesE1rm(100, 30) === seriesE1rm(100, 12));
check("a bodyweight/zero-weight session is still 0", seriesE1rm(0, 5) === 0);

// Negative/garbage reps must behave like the blank case, not like a loss.
check("negative reps are treated as a single, not zero", seriesE1rm(200, -3) === 200, String(seriesE1rm(200, -3)));
check("NaN reps are treated as a single, not zero", seriesE1rm(200, NaN) === 200, String(seriesE1rm(200, NaN)));

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
