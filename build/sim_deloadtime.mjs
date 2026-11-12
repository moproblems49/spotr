// THE DELOAD RULE IS MEASURED IN WEEKS, NOT SESSIONS (Mo, Nov 12): "deload after 3 weeks of no
// workout or no increase in weight or reps."
//
// Before: a plateau was "4 flat sessions" (ten days for a twice-a-week lift, a month for a weekly
// one), and a separate 14-day rule inside the per-set chips said "deload" after a break while the
// banner above them said nothing. Now one verdict, two triggers, both 21 days:
//   LAYOFF — last done 21+ days ago -> start ~10% lighter (20% from six weeks off).
//   STALL  — no gain in weight or reps across a span of 21+ days, with at least 3 sessions in it.
// Every assertion runs the shipped functions (build/app.mjs), never a copy of the maths.
import { detectDeloadNeeded, suggestNextSet } from "./app.mjs";

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const EX = "Barbell Bench Press";
const day = n => { const d = new Date(Date.now() - n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const sets = pairs => pairs.map(([w, r]) => ({ weight: String(w), reps: String(r), done: true, type: "normal" }));
const store = rows => ({
  history: Object.fromEntries(rows.map(([n, pairs], i) => [day(n),
    { [`s${i}`]: { unit: "lbs", exercises: [{ name: EX, sets: sets(pairs) }] } }])),
});
const flat = [[185, 6], [185, 6], [185, 5]];
const j = v => JSON.stringify(v);

// ── LAYOFF ────────────────────────────────────────────────────────────────────────────
{
  const v = detectDeloadNeeded(store([[25, flat], [32, flat]]), EX, "lbs", "6-8");
  check("[layoff] 25 days off -> a layoff verdict", v.stalled && v.kind === "layoff", j(v));
  check("[layoff] it says welcome back, not plateau", v.title === "Welcome back", j(v.title));
  check("[layoff] ~10% off the last top weight (185 -> 165)", v.deloadWeight === 165, j(v.deloadWeight));
  const c = suggestNextSet(store([[25, flat], [32, flat]]), EX, "6-8", "lbs", 0);
  check("[layoff] the set chip agrees with the banner", c && c.type === "deload" && c.weight === 165, j(c));
}
{
  const v = detectDeloadNeeded(store([[50, flat]]), EX, "lbs", "6-8");
  check("[layoff] seven weeks off takes 20% (185 -> 150)", v.stalled && v.kind === "layoff" && v.deloadWeight === 150, j(v));
}
{
  // The old chip rule fired at 14 days. Two weeks off is not three.
  const v = detectDeloadNeeded(store([[15, flat], [22, flat]]), EX, "lbs", "6-8");
  check("[layoff] 15 days off is NOT a layoff", !(v.stalled && v.kind === "layoff"), j(v));
  const c = suggestNextSet(store([[15, flat], [22, flat]]), EX, "6-8", "lbs", 0);
  check("[layoff] ...and no row tells him to deload after 15 days", !c || c.type !== "deload", j(c));
}
{
  const v = detectDeloadNeeded(store([[30, [[0, 12], [0, 10]]]]), EX, "lbs", "8-12");
  check("[layoff] a bodyweight lift has nothing lighter to suggest", !v.stalled, j(v));
}

// ── STALL ─────────────────────────────────────────────────────────────────────────────
{
  // Twice a week, flat, for under two weeks. Four flat sessions used to be enough on its own.
  const v = detectDeloadNeeded(store([[1, flat], [4, flat], [8, flat], [11, flat]]), EX, "lbs", "6-8");
  check("[stall] four flat sessions in 10 days is NOT yet a plateau", !v.stalled, j(v));
}
{
  const v = detectDeloadNeeded(store([[1, flat], [4, flat], [8, flat], [11, flat], [15, flat], [18, flat], [22, flat]]), EX, "lbs", "6-8");
  check("[stall] three weeks flat IS a plateau", v.stalled && v.kind === "stall", j(v));
  check("[stall] and the reason names weeks, not a session count", /3 weeks/.test(v.reason || "") && !/sessions/.test(v.reason || ""), j(v.reason));
  check("[stall] title stays Plateau detected", v.title === "Plateau detected", j(v.title));
}
{
  const v = detectDeloadNeeded(store([[2, [[190, 6], [185, 6]]], [9, flat], [16, flat], [23, flat]]), EX, "lbs", "6-8");
  check("[stall] a weight gain inside the window is not a plateau", !v.stalled, j(v));
}
{
  const v = detectDeloadNeeded(store([[2, [[185, 7], [185, 6], [185, 5]]], [9, flat], [16, flat], [23, flat]]), EX, "lbs", "6-8");
  check("[stall] a rep gain inside the window is not a plateau", !v.stalled, j(v));
}
{
  const v = detectDeloadNeeded(store([[2, flat], [27, flat]]), EX, "lbs", "6-8");
  check("[stall] two sessions are a coincidence, not a plateau", !v.stalled, j(v));
}
{
  // [control] the classic weekly stall still fires exactly as before.
  const v = detectDeloadNeeded(store([[3, flat], [10, flat], [17, flat], [24, flat]]), EX, "lbs", "6-8");
  check("[control] four flat weekly sessions across 3 weeks still stall", v.stalled && v.kind === "stall" && v.deloadWeight === 165, j(v));
}

console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
