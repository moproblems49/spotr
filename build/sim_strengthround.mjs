// A STRENGTH-CARD WEIGHT IS A WHOLE NUMBER (Mo, Nov 12: "look at the numbers for deadlift and hip
// thrust, why is it doing that?"). His card read "342.1996257107037" and "362.87725184833795": a best
// older than four months is decayed by a per-day fraction (so a stale max cannot overstate current
// strength) and the decayed value went to the screen unrounded. Runs the shipped engine.
import { computeStrengthScore } from "../src/engine/strength.js";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const day = n => { const d = new Date(Date.now() - n * 864e5); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const set = (w, r) => ({ weight: String(w), reps: String(r), done: true, type: "normal" });
const store = {
  bodyLog: [{ date: day(0), weight: "205" }],
  history: {
    [day(200)]: { a: { unit: "lbs", exercises: [{ name: "Deadlift", sets: [set(315, 3)] }] } },
    [day(3)]:   { b: { unit: "lbs", exercises: [{ name: "Bench Press", sets: [set(185, 5)] }] } },
  },
  prs: {}, prEvents: [],
};
const r = computeStrengthScore(store, "lbs", "male");
const dl = (r.lifts || []).find(l => /deadlift/i.test(l.lift) && !/romanian/i.test(l.lift));
const bp = (r.lifts || []).find(l => /bench/i.test(l.lift));
check("[control] the fixture reached the card (deadlift and bench both scored)", !!dl && !!bp, JSON.stringify(r.lifts));
check("a decayed (200-day-old) best is shown as a whole number", !!dl && Number.isInteger(dl.best), dl && String(dl.best));
check("[control] the decay still applied (below the undecayed e1RM of 346)", !!dl && dl.best < 346, dl && String(dl.best));
check("a fresh best is a whole number too", !!bp && Number.isInteger(bp.best), bp && String(bp.best));
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
