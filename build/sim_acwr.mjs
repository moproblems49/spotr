// ACUTE : CHRONIC WORKLOAD RATIO — this week's training against what you're conditioned for.
//
// Garmin's "training load". A ratio above ~1.5 is the best-established injury-risk signal in sports
// science; below 0.8 is detraining. It needs no data we don't already have — it's a lifter compared
// against their own 28-day history, so magnitudes cancel out.
//
// The thing that matters most here is REFUSING to answer: a ratio computed off a handful of
// sessions is noise dressed as insight, and this number is meant to change what someone does.
const _ls = new Map();
globalThis.localStorage = { getItem: k => (_ls.has(k) ? _ls.get(k) : null), setItem: (k,v)=>_ls.set(k,String(v)), removeItem: k=>_ls.delete(k) };
globalThis.window = undefined;

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const { trainingLoadRatio } = await import("./app.mjs");

const dk = (daysAgo) => { const d = new Date(Date.now() - daysAgo * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
// A session whose working volume is exactly `vol`.
const sess = (vol, unit = "lbs") => ({ unit, dayName: "W", duration: 3600,
  exercises: [{ name: "Squat", sets: [{ weight: String(vol), reps: "1", done: true, type: "normal" }] }] });

// `plan` maps daysAgo -> volume.
function store(plan, unit = "lbs") {
  const history = {};
  for (const [d, vol] of Object.entries(plan)) history[dk(Number(d))] = { [`s${d}`]: sess(vol, unit) };
  return { history, unit };
}
// A steady 28 days at `vol` every other day, then override the last 7.
function steady(vol, recentVol) {
  const plan = {};
  for (let d = 27; d >= 0; d--) if (d % 2 === 0) plan[d] = d <= 6 ? recentVol : vol;
  return store(plan);
}

// ── It must refuse when it can't be honest ───────────────────────────────────────────────────
check("no history → no ratio", trainingLoadRatio({ history: {} }) === null);
check("a brand-new user with 3 sessions this week → no ratio",
  trainingLoadRatio(store({ 1: 5000, 3: 5000, 5: 5000 })) === null,
  JSON.stringify(trainingLoadRatio(store({ 1: 5000, 3: 5000, 5: 5000 }))));
// Enough sessions but all crammed into a few days — the "28-day average" would be a lie.
const crammed = {}; for (let d = 0; d < 8; d++) crammed[d] = 5000;
check("8 sessions inside 8 days → still no ratio (history too short to average)",
  trainingLoadRatio(store(crammed)) === null, JSON.stringify(trainingLoadRatio(store(crammed))));
check("junk input doesn't throw", trainingLoadRatio(null) === null && trainingLoadRatio({}) === null);

// ── THE GUARD MUST NOT BE BYPASSABLE BY ONE OLD ROW ──────────────────────────────────────────
// The span check used to measure ALL history while the sums came only from the 28-day window, so a
// single ancient row unlocked a "28-day average" built from one training day. Both of these
// returned a confident "4.00 Spike — this is where injuries happen" before the fix.
const sixOnOneDay = { [dk(400)]: { old: sess(5000) }, [dk(3)]: {} };
for (let i = 0; i < 6; i++) sixOnOneDay[dk(3)][`s${i}`] = sess(5000);
console.log("6 sessions on ONE day + a 400-day-old row:", JSON.stringify(trainingLoadRatio({ history: sixOnOneDay })));
check("six sessions on a single day cannot mint a 28-day average",
  trainingLoadRatio({ history: sixOnOneDay }) === null, JSON.stringify(trainingLoadRatio({ history: sixOnOneDay })));

const oneWeekPlusAnchor = { [dk(22)]: { a: sess(5000) } };
for (let i = 0; i < 6; i++) oneWeekPlusAnchor[dk(i)] = { [`s${i}`]: sess(5000) };
console.log("one week of training + a single old anchor:", JSON.stringify(trainingLoadRatio({ history: oneWeekPlusAnchor })));
check("one week of training plus a lone old row is still refused",
  trainingLoadRatio({ history: oneWeekPlusAnchor }) === null, JSON.stringify(trainingLoadRatio({ history: oneWeekPlusAnchor })));

// ── TODAY'S SESSION MUST COUNT AT ANY HOUR ───────────────────────────────────────────────────
// Day-buckets were anchored at noon and compared against Date.now(), so before local noon today's
// own session had a NEGATIVE age and the future-date guard dropped it — the ratio ignored the
// morning workout that most changes it, then jumped a band at 12:00 with no new data.
const withToday = {}; for (let d = 27; d >= 1; d -= 2) withToday[dk(d)] = { s: sess(5000) };
withToday[dk(0)] = { t: sess(20000) };
const todayCounted = trainingLoadRatio({ history: withToday });
const withoutToday = {}; for (let d = 27; d >= 1; d -= 2) withoutToday[dk(d)] = { s: sess(5000) };
console.log("with today's big session:", todayCounted?.ratio, " without it:", trainingLoadRatio({ history: withoutToday })?.ratio);
check("a session logged TODAY moves the ratio (whatever the local hour)",
  todayCounted.ratio > trainingLoadRatio({ history: withoutToday }).ratio,
  `${todayCounted.ratio} vs ${trainingLoadRatio({ history: withoutToday }).ratio}`);

// ── The bands ────────────────────────────────────────────────────────────────────────────────
const flat = trainingLoadRatio(steady(5000, 5000));
console.log("steady:", JSON.stringify(flat));
check("training the same as always sits at ~1.0", flat && Math.abs(flat.ratio - 1) < 0.2, JSON.stringify(flat));
check("...and reads as the sweet spot", flat?.status === "optimal", flat?.status);

const spike = trainingLoadRatio(steady(5000, 15000));
console.log("spike:", JSON.stringify(spike));
check("tripling this week's volume flags a spike", spike?.status === "high", JSON.stringify(spike));
check("...with a ratio above 1.5", spike && spike.ratio > 1.5, String(spike?.ratio));

const easing = trainingLoadRatio(steady(10000, 2000));
console.log("deload:", JSON.stringify(easing));
check("a deload week reads as detraining/low", easing?.status === "low", JSON.stringify(easing));

const ramp = trainingLoadRatio(steady(5000, 7000));
console.log("ramp:", JSON.stringify(ramp));
check("a moderate step up is 'ramping up' or still optimal",
  ramp && ["caution", "optimal"].includes(ramp.status), JSON.stringify(ramp));

// ── Monotonic: more this week can never lower the ratio ──────────────────────────────────────
const rs = [3000, 5000, 8000, 12000, 20000].map(v => trainingLoadRatio(steady(5000, v)).ratio);
console.log("ratios as this week grows:", JSON.stringify(rs));
check("the ratio rises monotonically with this week's volume",
  rs.every((v, i) => i === 0 || v >= rs[i-1]), JSON.stringify(rs));

// ── Units must not distort a RATIO ───────────────────────────────────────────────────────────
const lbsPlan = {}, kgPlan = {};
for (let d = 27; d >= 0; d--) if (d % 2 === 0) { lbsPlan[d] = d <= 6 ? 12000 : 5000; kgPlan[d] = d <= 6 ? 12000 : 5000; }
const inLbs = trainingLoadRatio(store(lbsPlan, "lbs"), "lbs");
const inKg = trainingLoadRatio(store(kgPlan, "kg"), "kg");
check("the ratio is unit-independent (it's a lifter against themselves)",
  Math.abs(inLbs.ratio - inKg.ratio) < 0.01, `${inLbs.ratio} vs ${inKg.ratio}`);
// A GENUINELY mixed history: older sessions logged in kg, this week's in lbs, at equivalent real
// load. The previous version of this check stamped every session "kg" and merely read it as lbs —
// it would have passed code that used store.unit instead of the per-session unit.
const mixedHistory = {};
for (let d = 27; d >= 8; d -= 2) mixedHistory[dk(d)] = { [`k${d}`]: sess(2268, "kg") };   // 2268kg
for (let d = 6; d >= 0; d -= 2) mixedHistory[dk(d)] = { [`l${d}`]: sess(5000, "lbs") };   // ≈5000lbs
const trulyMixed = trainingLoadRatio({ history: mixedHistory }, "lbs");
console.log("truly mixed kg+lbs history:", JSON.stringify(trulyMixed));
check("a mixed kg/lbs history converts PER SESSION and reads ~1.0",
  trulyMixed && Math.abs(trulyMixed.ratio - 1) < 0.25, JSON.stringify(trulyMixed));

// ── Every band carries copy a lifter can act on ──────────────────────────────────────────────
for (const r of [flat, spike, easing, ramp]) {
  check(`the ${r.status} band has a label and a note`, !!r.label && !!r.note && r.note.length > 20, JSON.stringify(r));
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
