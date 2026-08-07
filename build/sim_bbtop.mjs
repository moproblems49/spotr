// 100/100 HAS TO BE EXCEPTIONAL, AND THE TOP OF THE SCALE HAS TO SEPARATE GOOD FROM GREAT.
//
// Mo woke to a Body Battery of 100 and asked whether that was too generous. It was, for two
// independent reasons, both of them the same shape as the flat activity cap:
//
//   1. BOTH HEART TERMS CLAMPED. HRV scored a perfect 1.0 at just 8% above your own baseline and
//      resting HR at 2.5% below it, so +8%, +15%, +30% and +100% were all identical. Measured on
//      the shipped code, three genuinely different mornings all reported 100.
//   2. THE SLEEP NUDGE COULD MANUFACTURE ONE. charge0 is `55 + score * 45`, which already reaches
//      100 at a perfect score; adding up to +7 on top and clamping meant every score from about
//      0.91 upward printed 100. Sleep is a quarter of the score that produced charge0, so pushing
//      past it counts sleep twice — in the flattering direction.
//
// What must NOT change: a day at your own baseline scores exactly what it scored before, and the
// bottom of the scale still bites. Those are pinned here too, because the failure mode of fixing a
// score is making it mean something different for everybody rather than just at the top.
import { computeBodyBattery, recoveryScoreFrom } from "./app.mjs";

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const RealDate = Date;
const D = (h, m = 0, off = 0) => new RealDate(2026, 6, 22 - off, h, m, 0);
const at = (now, fn) => { global.Date = class extends RealDate { constructor(...a) { if (!a.length) return new RealDate(now.getTime()); return new RealDate(...a); } static now() { return now.getTime(); } }; const r = fn(); global.Date = RealDate; return r; };
const score = (hrvRatio, rhrRatio, sh) => recoveryScoreFrom({
  hrv: 50 * hrvRatio, hrvBaseline: 50, restingHr: 50 * rhrRatio, rhrBaseline: 50, sleepHours: sh });
const morning = (hrvRatio, rhrRatio, sh) => at(D(7, 15), () => computeBodyBattery({
  history: {}, activity: null,
  recovery: { recoveryScore: score(hrvRatio, rhrRatio, sh), sleepHours: sh,
    sleepStart: D(23, 0, 1).toISOString(), sleepEnd: D(7).toISOString() } })).level;

// ── 1. The top must separate good nights from great ones ─────────────────────────────────────
const LADDER = [
  ["at your baseline, 8h", 1.00, 1.00, 8.0],
  ["HRV +8%, RHR −3%, 8h", 1.08, 0.97, 8.0],
  ["HRV +15%, RHR −5%, 8.5h", 1.15, 0.95, 8.5],
  ["HRV +30%, RHR −10%, 9h", 1.30, 0.90, 9.0],
  ["HRV +60%, RHR −15%, 9h", 1.60, 0.85, 9.0],
];
const levels = [];
console.log("morning charge at 07:15:");
for (const [label, hr, rr, sh] of LADDER) {
  const lvl = morning(hr, rr, sh);
  levels.push(lvl);
  console.log(`  ${label.padEnd(26)} score ${String(Math.round(score(hr, rr, sh) * 100)).padStart(3)}%  ->  ${lvl}`);
}
check("a better night always scores at least as well", levels.every((v, i) => i === 0 || v >= levels[i - 1]), levels.join(" "));
check("...and the good/great rungs are not all the same number",
  new Set(levels).size >= 4, levels.join(" "));
check("...so an ordinary-good night does not read as perfect", levels[1] < 100, String(levels[1]));

// ── 2. 100 must require something genuinely remarkable ───────────────────────────────────────
check("a merely very good night is not 100", morning(1.15, 0.95, 8.5) < 100, String(morning(1.15, 0.95, 8.5)));
check("...and even an excellent one is not 100", morning(1.30, 0.90, 9.0) < 100, String(morning(1.30, 0.90, 9.0)));
check("...but the top of the scale is still reachable in principle", morning(2.0, 0.75, 9.0) >= 97,
  String(morning(2.0, 0.75, 9.0)));

// ── 3. Nothing at or below baseline may move ─────────────────────────────────────────────────
// The whole change is above baseline. If an ordinary or bad day shifts, the score now means
// something different for everyone rather than only at the top.
check("a day exactly at baseline is unchanged (score 0.80)", Math.abs(score(1.0, 1.0, 8.0) - 0.80) < 0.005,
  String(score(1.0, 1.0, 8.0)));
check("...a mediocre day is unchanged", Math.abs(score(0.95, 1.02, 6.5) - 0.55) < 0.02, String(score(0.95, 1.02, 6.5)));
check("...and a wrecked day still bottoms out", score(0.75, 1.08, 4.5) < 0.15, String(score(0.75, 1.08, 4.5)));

// ── 4. The sleep nudge may not push past what the score earned ───────────────────────────────
{
  // Same night, two sleep durations. The longer one may help, but not beyond the score's ceiling.
  const nine = morning(1.15, 0.95, 9.0), sevenHalf = morning(1.15, 0.95, 7.5);
  console.log(`  same night, 7.5h -> ${sevenHalf}, 9h -> ${nine}`);
  check("more sleep helps but cannot manufacture a perfect morning", nine >= sevenHalf && nine < 100,
    `${sevenHalf} -> ${nine}`);
  // ...and it must still bite downward, which is the half of the nudge that was always right.
  check("a short night still costs, on the same heart readings", morning(1.15, 0.95, 5.0) < sevenHalf,
    `${morning(1.15, 0.95, 5.0)} vs ${sevenHalf}`);
}

// ── 4b. ...BUT THE POSITIVE HALF OF THE NUDGE MUST STILL WORK ────────────────────────────────
{
  // The first cut of the cap above wrote `Math.min(earned, …)` where `earned` was the SAME
  // expression as the pre-nudge charge0, so the min could only bite downward and the `d >= 0`
  // branch became dead code. Measured at score 0.70: 7.5h, 8.5h, 9h and 10h ALL produced 87, and
  // a well-slept day lost 7 points against the previous build. Nothing caught it — all 39 sims
  // passed — because every check here was about the TOP of the range.
  const chargeAt = (score, sh) => at(D(7, 15), () => computeBodyBattery({ history: {}, activity: null,
    recovery: { recoveryScore: score, sleepHours: sh, sleepStart: D(23, 0, 1).toISOString(), sleepEnd: D(7).toISOString() } })).charge0;
  const ladder = [4, 6.5, 7.5, 8.5, 9, 10].map(h => chargeAt(0.70, h));
  console.log(`  score 0.70, sleep 4/6.5/7.5/8.5/9/10h -> ${ladder.join(" ")}`);
  check("a long night still raises Morning Charge", ladder[4] > ladder[2], `9h ${ladder[4]} vs 7.5h ${ladder[2]}`);
  check("...and a short one still lowers it", ladder[0] < ladder[2], `4h ${ladder[0]} vs 7.5h ${ladder[2]}`);
  check("...with the middle of the range actually ordered",
    ladder.slice(0, 5).every((v, i) => i === 0 || v >= ladder[i - 1]), ladder.join(" "));
  // ...while still not manufacturing a perfect morning from a merely good score.
  check("a 0.91 score plus a long night is not 100", chargeAt(0.91, 9) < 100, String(chargeAt(0.91, 9)));
}

// ── 5. Winnability, unchanged ────────────────────────────────────────────────────────────────
check("a rested rest day still clears 80", morning(1.05, 0.98, 8.0) >= 80, String(morning(1.05, 0.98, 8.0)));
{
  const wrecked = at(D(20), () => computeBodyBattery({
    history: {}, activity: { date: `${D(0).getFullYear()}-${String(D(0).getMonth() + 1).padStart(2, "0")}-${String(D(0).getDate()).padStart(2, "0")}`, steps: 12000, activeKcal: 700 },
    recovery: { recoveryScore: score(0.75, 1.08, 4.5), sleepHours: 4.5,
      sleepStart: D(2, 0, 0).toISOString(), sleepEnd: D(6, 30).toISOString() } })).level;
  check("...and a wrecked day stays under 40", wrecked < 40, String(wrecked));
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
