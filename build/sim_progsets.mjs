// A PROGRAM EXERCISE'S SET COUNT HAS ONE DEFINITION.
//
// The built-in program templates (and the day-preview "+ add exercise" path) write only
// `reps: "3×12-15"` and no `sets` field. Three places read that count and all three disagreed:
//   - startWorkout      → fell back to the leading "N×" in reps, else 3   (right)
//   - the day editor    → Math.max(1, parseInt(ex.sets) || 3)  → always 3 (wrong for "4×...")
//   - the reorder list  → parseInt(ex.sets) || 0                → "0 sets" (visibly wrong)
// So a template day showed "0 sets" in Reorder, "3" on the stepper, and started 4 sets.
// progSetCount() is now the single answer; these checks pin every shape it has to handle.
const _ls = new Map();
globalThis.localStorage = { getItem: k => (_ls.has(k) ? _ls.get(k) : null), setItem: (k, v) => _ls.set(k, String(v)), removeItem: k => _ls.delete(k) };
globalThis.window = undefined;

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const { progSetCount } = await import("./app.mjs");
const eq = (label, ex, want) => check(`${label} → ${want}`, progSetCount(ex) === want, `got ${progSetCount(ex)}`);

// A LIVE session exercise: `sets` is the real array, and 0 is a real answer.
eq("live session, 4 logged sets", { sets: [1, 2, 3, 4] }, 4);
eq("live session, no sets yet", { sets: [] }, 0);

// A PROGRAM day exercise with an explicit count.
eq("explicit numeric count", { sets: 5, reps: "8-12" }, 5);
eq("count stored as a string", { sets: "5", reps: "8-12" }, 5);

// The template shape — the count lives in the reps string only. This is the bug.
eq("multiplication sign", { reps: "4×8-12" }, 4);
eq("lowercase x", { reps: "4x8-12" }, 4);
eq("uppercase X", { reps: "4X8-12" }, 4);
eq("asterisk", { reps: "4*8-12" }, 4);
eq("en-dash range, as the templates write it", { reps: "4×5–8" }, 4);
eq("leading whitespace", { reps: "  3 × 12 " }, 3);
eq("single set", { reps: "1×20" }, 1);
eq("double digits", { reps: "10×3" }, 10);

// No count anywhere → the same default startWorkout has always used.
eq("bare rep range", { reps: "8-12" }, 3);
eq("no reps at all", { name: "Bench" }, 3);
eq("empty reps", { reps: "" }, 3);
eq("sets present but nonsense", { sets: "abc", reps: "8-12" }, 3);
eq("sets zero, no hint in reps", { sets: 0, reps: "8-12" }, 3);
eq("sets negative", { sets: -2, reps: "8-12" }, 3);

// Must never throw on junk — it renders inside a list.
eq("undefined", undefined, 3);
eq("null", null, 3);

// An explicit count WINS over the reps hint: if the user has touched the stepper, that's the truth.
eq("explicit count beats the reps hint", { sets: 2, reps: "5×10" }, 2);

// A rep range that merely CONTAINS an x must not be read as a set count.
eq("reps with no leading count", { reps: "8-12 each side" }, 3);
eq("x not in the leading position", { reps: "AMRAP x2" }, 3);

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
