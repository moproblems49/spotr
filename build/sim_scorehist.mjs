// THE STRENGTH-SCORE CURVE MUST HAVE POINTS ON IT.
//
// Mo's chart showed three: Jun 30, Jul 31, and today. Two independent causes, both confirmed
// against his live data (first workout 10 May 2026, first body-log entry 4 June, 58 workouts):
//
//   1. A SNAPSHOT WITH NO BODY-WEIGHT ENTRY WAS DISCARDED. The score is bodyweight-relative, so
//      it needs a weight — but `if (!bodyLog.length) return null` threw away every snapshot
//      before the first weigh-in, however much training history sat behind it. The 31 May
//      snapshot died for a weigh-in that happened four days later.
//   2. THE MONTHLY THRESHOLD WAS 12 WEEKS. At 84 days a monthly chart has only three month-ends
//      to draw, so an account crossing that line went from a dozen weekly points to almost none.
//
// This also exists to make the function testable at all: it was inline in ProfileScreen, where
// the only way to check it was to look at the chart and squint.
import { strengthScoreHistory } from "./app.mjs";

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const NOW = new Date(2026, 7, 7, 10, 0, 0);          // 7 Aug 2026, matching the live case
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayBefore = (n) => { const d = new Date(NOW); d.setDate(d.getDate() - n); return d; };

// A real training history: 3 sessions a week of the big lifts, slowly getting heavier.
function historyFrom(daysAgo) {
  const h = {};
  for (let i = daysAgo; i >= 0; i -= 2) {
    const d = dayBefore(i);
    const prog = (daysAgo - i) / daysAgo;                 // 0 -> 1 across the span
    const w = (base) => String(Math.round((base + base * 0.25 * prog) / 5) * 5);
    h[key(d)] = { s: { dayName: "Full", unit: "lbs", duration: 3600, finishedAt: d.getTime(), exercises: [
      { name: "Barbell Bench Press", sets: [{ weight: w(155), reps: "5", done: true, type: "normal" }, { weight: w(155), reps: "5", done: true, type: "normal" }] },
      { name: "Barbell Back Squat", sets: [{ weight: w(205), reps: "5", done: true, type: "normal" }, { weight: w(205), reps: "5", done: true, type: "normal" }] },
      { name: "Deadlift", sets: [{ weight: w(255), reps: "5", done: true, type: "normal" }] },
      { name: "Overhead Press", sets: [{ weight: w(95), reps: "5", done: true, type: "normal" }] },
    ] } };
  }
  return h;
}
const mkStore = (daysAgo, weightFromDaysAgo) => ({
  history: historyFrom(daysAgo), prs: {}, prEvents: [], strengthSex: "male", unit: "lbs",
  bodyLog: [{ date: key(dayBefore(weightFromDaysAgo)), weight: 178 },
            { date: key(dayBefore(Math.max(0, weightFromDaysAgo - 30))), weight: 180 }],
});

// ── 1. Mo's exact shape: training from 10 May, first weigh-in 4 June ─────────────────────────
{
  const pts = strengthScoreHistory(mkStore(89, 64), "lbs", "male", NOW);
  console.log(`  89 days of training, first weigh-in 64 days ago -> ${pts?.length} points: ${(pts || []).map(p => p.label).join(", ")}`);
  check("a three-month-old account draws a real curve, not three points",
    pts && pts.length >= 8, `${pts?.length} points`);
  check("...and the earliest point predates the first weigh-in",
    pts && pts[0].date < key(dayBefore(64)), `first point ${pts?.[0]?.date}`);
}

// ── 2. A snapshot before the first weigh-in uses the earliest known weight, not nothing ──────
{
  const late = strengthScoreHistory(mkStore(89, 10), "lbs", "male", NOW);   // weighed in 10 days ago
  const early = strengthScoreHistory(mkStore(89, 85), "lbs", "male", NOW);  // weighed in at the start
  console.log(`  weighed in 10 days ago -> ${late?.length} points;  weighed in on day one -> ${early?.length}`);
  check("logging your weight late does not erase your training history",
    late && early && late.length === early.length, `${late?.length} vs ${early?.length}`);
}

// ── 3. Granularity: weekly while young, monthly once there are enough months ─────────────────
{
  const young = strengthScoreHistory(mkStore(89, 80), "lbs", "male", NOW);
  const old = strengthScoreHistory(mkStore(400, 395), "lbs", "male", NOW);
  const youngLabels = (young || []).map(p => p.label).join(",");
  const oldLabels = (old || []).map(p => p.label).join(",");
  console.log(`  89 days  -> ${youngLabels}`);
  console.log(`  400 days -> ${oldLabels}`);
  check("a 3-month account is charted WEEKLY", /\d+\/\d+/.test(youngLabels), youngLabels);
  check("...and a year-old account switches to monthly", /Jan|Feb|Mar|Sep|Oct|Nov|Dec/.test(oldLabels), oldLabels);
  check("both are capped at 12 points", (young?.length ?? 0) <= 12 && (old?.length ?? 0) <= 12,
    `${young?.length} / ${old?.length}`);
  check("...and a year of training shows more than a quarter's worth of history",
    (old?.length ?? 0) >= 8, `${old?.length}`);
}

// ── 4. Degenerate inputs ─────────────────────────────────────────────────────────────────────
check("no history returns null", strengthScoreHistory({ history: {}, bodyLog: [] }, "lbs", "male", NOW) === null);
check("no body log at all returns null rather than throwing",
  strengthScoreHistory({ history: historyFrom(89), bodyLog: [] }, "lbs", "male", NOW) === null);
check("a single session returns null (a curve needs two points)",
  strengthScoreHistory({ history: { [key(dayBefore(3))]: historyFrom(3)[key(dayBefore(3))] },
    bodyLog: [{ date: key(dayBefore(3)), weight: 178 }] }, "lbs", "male", NOW) === null);

// ── 5. The curve must be ordered and labelled ────────────────────────────────────────────────
{
  const pts = strengthScoreHistory(mkStore(89, 64), "lbs", "male", NOW) || [];
  check("points are in chronological order", pts.every((p, i) => i === 0 || p.date >= pts[i - 1].date),
    pts.map(p => p.date).join(" "));
  check("...and the last one is labelled Now", pts[pts.length - 1]?.label === "Now", pts[pts.length - 1]?.label);
  check("...and every point carries a real date for hold-to-read",
    pts.every(p => /^\d{4}-\d{2}-\d{2}$/.test(p.date)), JSON.stringify(pts.slice(0, 2)));
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
