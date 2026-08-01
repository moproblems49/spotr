// ESTIMATED 1RM — one definition, and the single-rep case.
//
// Epley is `w × (1 + reps/30)`: it ESTIMATES a max from a multi-rep set. At ONE rep there is
// nothing to estimate — the weight you lifted IS your one-rep max — but the raw formula still
// multiplies by 31/30 and adds 3.3%. Entering 225 for 1 rep reported a max of 233 (Mo caught it).
//
// The formula had been inlined in SEVEN places, so this wasn't only the calculator: the Est-1RM PR
// badge, the strength score, the progress chart and the server-side history rebuild all carried the
// same 3.3% inflation, and the calculator could disagree with the PR badge about the same set.
const _ls = new Map();
globalThis.localStorage = { getItem: k => (_ls.has(k) ? _ls.get(k) : null), setItem: (k, v) => _ls.set(k, String(v)), removeItem: k => _ls.delete(k) };
globalThis.window = undefined;

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const { epley1RM, calc1RM, getSetPRTypes } = await import("./app.mjs");

// ── THE BUG ──────────────────────────────────────────────────────────────────────────────────
check("a single rep IS the one-rep max — 225×1 is 225, not 233",
  calc1RM(225, 1) === 225, String(calc1RM(225, 1)));
check("...at any weight", calc1RM(100, 1) === 100 && calc1RM(315, 1) === 315,
  `${calc1RM(100, 1)} / ${calc1RM(315, 1)}`);
check("...including a fractional plate load", calc1RM(102.5, 1) === 103, String(calc1RM(102.5, 1)));

// ── Epley itself is unchanged for real multi-rep sets ────────────────────────────────────────
check("225×5 still uses Epley (225 × 7/6 = 262.5 → 263)", calc1RM(225, 5) === 263, String(calc1RM(225, 5)));
check("185×5 is unchanged at 216", calc1RM(185, 5) === 216, String(calc1RM(185, 5)));
check("2 reps is an estimate ABOVE the weight lifted", calc1RM(225, 2) > 225, String(calc1RM(225, 2)));
check("more reps at the same weight estimates a higher max",
  calc1RM(225, 8) > calc1RM(225, 5) && calc1RM(225, 5) > calc1RM(225, 2));

// ── The rep cap belongs to the callers that build PRs, not to the calculator ──────────────────
check("the calculator does not silently cap the reps the user typed",
  calc1RM(100, 30) === 200, String(calc1RM(100, 30)));
check("a capped caller clamps at 12", epley1RM(100, 30, 12) === epley1RM(100, 12, 12),
  `${epley1RM(100, 30, 12)} vs ${epley1RM(100, 12, 12)}`);
check("...and the cap doesn't disturb sets under it", epley1RM(100, 5, 12) === epley1RM(100, 5, 0));
check("a capped single rep is still just the weight", epley1RM(225, 1, 12) === 225, String(epley1RM(225, 1, 12)));

// ── Junk in ──────────────────────────────────────────────────────────────────────────────────
check("no weight gives no estimate", calc1RM(0, 5) === null && calc1RM("", 5) === null);
check("no reps gives no estimate", calc1RM(225, 0) === null && calc1RM(225, "") === null);
check("negative/NaN input gives no estimate",
  calc1RM(-225, 5) === null && calc1RM("abc", 5) === null && calc1RM(225, "abc") === null,
  `${calc1RM(-225, 5)} / ${calc1RM("abc", 5)} / ${calc1RM(225, "abc")}`);
check("epley1RM returns 0 (not NaN) for junk",
  epley1RM("abc", 5) === 0 && epley1RM(225, 0) === 0 && epley1RM(0, 5) === 0);

// ── The PR badge must agree with the calculator about the same set ────────────────────────────
// This is the pairing that was visibly inconsistent: the calculator said one thing about 225×1 and
// the e1RM PR bar was set from another.
const store = { prs: {}, prsE1rm: {}, prsVolume: {} };
const pr = getSetPRTypes(store, "Barbell Bench Press", 225, 1, "lbs");
console.log("PR TYPES for 225×1:", JSON.stringify(pr));
check("the e1RM the PR check uses matches the calculator for the same set",
  pr.e1rmLbs === calc1RM(225, 1), `${pr.e1rmLbs} vs ${calc1RM(225, 1)}`);
check("...and equals the weight lifted", pr.e1rmLbs === 225, String(pr.e1rmLbs));

// A 1-rep set must not out-rank a genuinely better multi-rep set on the e1RM bar.
const heavySingle = getSetPRTypes(store, "X", 225, 1, "lbs").e1rmLbs;
const tripleAt215 = getSetPRTypes(store, "X", 215, 3, "lbs").e1rmLbs;
console.log(`225×1 e1RM = ${heavySingle}, 215×3 e1RM = ${tripleAt215}`);
check("215×3 estimates a higher max than a bare 225 single", tripleAt215 > heavySingle);

// kg input is converted before the estimate, so the PR bar stays in one unit.
const kg = getSetPRTypes(store, "X", 100, 1, "kg");
check("a 1-rep kg set converts to lbs without re-inflating",
  Math.abs(kg.e1rmLbs - 220) <= 1, String(kg.e1rmLbs));

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
