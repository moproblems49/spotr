// BODY BATTERY MUST BE WINNABLE — AND STILL HONEST.
//
// Mo: "I don't think the body battery is accurate. This way no one will ever have a good score."
// Measured, he was right about a specific case: a normal session on a mediocre night collapsed the
// number (his real reading was 7/100). Two causes, both fixed:
//
//   1. Sleep was counted TWICE — once inside recoveryScore (~25% of it) and again as a Morning
//      Charge modifier that could subtract another 16. The modifier is a nudge now (max −8).
//   2. One ordinary workout drained 24-30 points of a scale whose realistic top is ~85. A 20-set
//      session costs 16 now, a 26-set one ~20.
//
// The risk in "fixing" this is making the number flattering and therefore useless, so these
// assertions pin BOTH ends: a good day must be able to score well, and a genuinely depleted day
// must still read as depleted.
const _ls = new Map();
globalThis.localStorage = { getItem: k => (_ls.has(k) ? _ls.get(k) : null), setItem: (k,v)=>_ls.set(k,String(v)), removeItem: k=>_ls.delete(k) };
globalThis.window = undefined;

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const { computeBodyBattery } = await import("./app.mjs");

const dk = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const aSet = () => ({ weight: "185", reps: "8", done: true, type: "normal" });
function session(nSets) {
  const exs = [];
  for (let i = 0; i < Math.ceil(nSets / 4); i++)
    exs.push({ name: `Ex${i}`, sets: Array.from({ length: Math.min(4, nSets - i*4) }, aSet) });
  return { dayName: "W", unit: "lbs", duration: 3600, finishedAt: Date.now() - 2*36e5, exercises: exs };
}
function level({ recovery, sleepH, sets = 0, steps = 6000, kcal = 300, wakeHoursAgo = 8 }) {
  const store = { history: {}, activity: { date: dk(), steps, activeKcal: kcal }, recovery: null };
  if (sets) store.history[dk()] = { s1: session(sets) };
  store.recovery = { recoveryScore: recovery, sleepHours: sleepH,
    sleepEnd: new Date(Date.now() - wakeHoursAgo*36e5).toISOString(),
    sleepStart: new Date(Date.now() - (wakeHoursAgo + sleepH)*36e5).toISOString() };
  return computeBodyBattery(store);
}

// ── A GOOD DAY MUST BE ABLE TO SCORE WELL ────────────────────────────────────────────────────
const restedRest = level({ recovery: 0.90, sleepH: 8.5 });
console.log("well-rested rest day:", restedRest.level);
check("a well-rested rest day scores high (>=80)", restedRest.level >= 80, String(restedRest.level));

const restedTrain = level({ recovery: 0.90, sleepH: 8.5, sets: 26 });
console.log("well-rested + hard session:", restedTrain.level);
check("training hard after a good night still leaves a decent score (>=55)",
  restedTrain.level >= 55, String(restedTrain.level));

const typical = level({ recovery: 0.50, sleepH: 7.0, sets: 20 });
console.log("average night + normal session:", typical.level);
check("an average night + normal session is not in the red (>=40)", typical.level >= 40, String(typical.level));

// ── AND A BAD DAY MUST STILL READ AS BAD ─────────────────────────────────────────────────────
// The UI's copy thresholds: >=80 push hard, >=60 decent, >=40 moderate, else "Low battery".
const wrecked = level({ recovery: 0.16, sleepH: 4.0, sets: 26, steps: 4686, kcal: 288 });
console.log("4h sleep + hard session (Mo's reading):", wrecked.level);
check("4h sleep plus a hard session still warns (<40 = 'Low battery')", wrecked.level < 40, String(wrecked.level));
check("...but is not a broken-looking single digit", wrecked.level >= 15, String(wrecked.level));

// ── SLEEP MUST NOT BE COUNTED TWICE ──────────────────────────────────────────────────────────
// Same recoveryScore, only sleepHours differs. The EXTRA modifier is capped at −8/+7, so the
// spread between a 4h and a 7.5h night at identical HRV can't exceed that.
const sameRec4h  = level({ recovery: 0.5, sleepH: 4.0 }).charge0;
const sameRec75h = level({ recovery: 0.5, sleepH: 7.5 }).charge0;
const sameRec9h  = level({ recovery: 0.5, sleepH: 9.0 }).charge0;
console.log(`charge0 at identical HRV — 4h:${sameRec4h} 7.5h:${sameRec75h} 9h:${sameRec9h}`);
check("the sleep nudge below par is capped at 8 points", sameRec75h - sameRec4h <= 8, `${sameRec75h - sameRec4h}`);
check("the sleep nudge above par is capped at 7 points", sameRec9h - sameRec75h <= 7, `${sameRec9h - sameRec75h}`);
check("more sleep never lowers the charge", sameRec4h <= sameRec75h && sameRec75h <= sameRec9h);

// ── ONE SESSION MUST NOT EAT THE WHOLE BATTERY ───────────────────────────────────────────────
const d20 = level({ recovery: 0.7, sleepH: 7.5, sets: 20 }).workoutDrain;
const d26 = level({ recovery: 0.7, sleepH: 7.5, sets: 26 }).workoutDrain;
const d40 = level({ recovery: 0.7, sleepH: 7.5, sets: 40 }).workoutDrain;
console.log(`training drain — 20 sets:${d20} 26 sets:${d26} 40 sets:${d40}`);
check("a 20-set session costs a sane amount (10-20)", d20 >= 10 && d20 <= 20, String(d20));
check("a marathon session is capped, not unbounded", d40 <= 24, String(d40));
check("more sets always drains more (or equal at the cap)", d20 <= d26 && d26 <= d40);

// ── DIRECTIONS MUST STAY RIGHT ───────────────────────────────────────────────────────────────
check("better recovery scores higher",
  level({ recovery: 0.9, sleepH: 7.5, sets: 20 }).level > level({ recovery: 0.3, sleepH: 7.5, sets: 20 }).level);
check("a rest day beats a training day",
  level({ recovery: 0.6, sleepH: 7.5, sets: 0 }).level > level({ recovery: 0.6, sleepH: 7.5, sets: 20 }).level);
check("longer awake drains more",
  level({ recovery: 0.6, sleepH: 7.5, wakeHoursAgo: 2 }).level > level({ recovery: 0.6, sleepH: 7.5, wakeHoursAgo: 16 }).level);
check("the level never leaves 0-100",
  [0, 0.25, 0.5, 0.75, 1].every(r => [3, 6, 9].every(s =>
    [0, 20, 60].every(n => { const v = level({ recovery: r, sleepH: s, sets: n }).level; return v >= 0 && v <= 100; }))));

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
