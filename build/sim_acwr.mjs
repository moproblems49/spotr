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
// Mixed-unit history must still compare like with like.
const mixed = {}; for (let d = 27; d >= 0; d--) if (d % 2 === 0) mixed[d] = d <= 6 ? 12000 : 5000;
const mixedStore = store(mixed, "kg");
const mixedRatio = trainingLoadRatio(mixedStore, "lbs");
check("a kg history read in lbs gives the same ratio",
  Math.abs(mixedRatio.ratio - inKg.ratio) < 0.01, `${mixedRatio.ratio} vs ${inKg.ratio}`);

// ── Every band carries copy a lifter can act on ──────────────────────────────────────────────
for (const r of [flat, spike, easing, ramp]) {
  check(`the ${r.status} band has a label and a note`, !!r.label && !!r.note && r.note.length > 20, JSON.stringify(r));
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
