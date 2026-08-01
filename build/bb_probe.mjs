// What does Body Battery actually return across realistic people? Mo: "no one will ever have a
// good score." Measure it instead of arguing about it.
const _ls = new Map();
globalThis.localStorage = { getItem: k => (_ls.has(k) ? _ls.get(k) : null), setItem: (k,v)=>_ls.set(k,String(v)), removeItem: k=>_ls.delete(k) };
globalThis.window = undefined;
const { computeBodyBattery } = await import("./app.mjs");

const dk = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const set = () => ({ weight: "185", reps: "8", done: true, type: "normal" });

// A session with N working sets, finished 2h ago.
function session(nSets) {
  const perEx = 4, exs = [];
  for (let i = 0; i < Math.ceil(nSets / perEx); i++) {
    exs.push({ name: `Ex${i}`, sets: Array.from({ length: Math.min(perEx, nSets - i*perEx) }, set) });
  }
  return { dayName: "W", unit: "lbs", duration: 3600, finishedAt: Date.now() - 2*36e5, exercises: exs };
}

function build({ recovery, sleepH, sets, steps, kcal, wakeHoursAgo = 8 }) {
  const store = { history: {}, activity: null, recovery: null };
  if (sets) store.history[dk()] = { s1: session(sets) };
  if (recovery != null) {
    store.recovery = {
      recoveryScore: recovery, sleepHours: sleepH,
      sleepEnd: new Date(Date.now() - wakeHoursAgo*36e5).toISOString(),
      sleepStart: new Date(Date.now() - (wakeHoursAgo + sleepH)*36e5).toISOString(),
    };
  }
  if (steps != null) store.activity = { date: dk(), steps, activeKcal: kcal };
  return store;
}

const rows = [];
const scenarios = [
  ["Great night, rest day",        { recovery: 0.90, sleepH: 8.5, sets: 0,  steps: 6000, kcal: 250 }],
  ["Great night, hard session",    { recovery: 0.90, sleepH: 8.5, sets: 26, steps: 8000, kcal: 500 }],
  ["Good night, normal session",   { recovery: 0.70, sleepH: 7.5, sets: 20, steps: 7000, kcal: 400 }],
  ["Average night, normal session",{ recovery: 0.50, sleepH: 7.0, sets: 20, steps: 7000, kcal: 400 }],
  ["Average night, rest day",      { recovery: 0.50, sleepH: 7.0, sets: 0,  steps: 5000, kcal: 200 }],
  ["Poor night, hard session (Mo)",{ recovery: 0.16, sleepH: 4.0, sets: 26, steps: 4686, kcal: 288 }],
  ["Poor night, rest day",         { recovery: 0.16, sleepH: 4.0, sets: 0,  steps: 3000, kcal: 150 }],
  ["Elite: perfect everything",    { recovery: 1.00, sleepH: 9.0, sets: 0,  steps: 3000, kcal: 150, wakeHoursAgo: 2 }],
];

for (const [name, cfg] of scenarios) {
  const bb = computeBodyBattery(build(cfg));
  rows.push({ name, charge0: bb.charge0, awake: bb.baselineDrain, training: bb.workoutDrain, activity: bb.activityDrain, LEVEL: bb.level });
}
console.table(rows);

// Ceiling sweep: best possible score at each hour of the day, training normally.
const ceiling = [];
for (const h of [2, 6, 10, 14, 18]) {
  const best = computeBodyBattery(build({ recovery: 1.0, sleepH: 8.5, sets: 20, steps: 6000, kcal: 350, wakeHoursAgo: h }));
  const typical = computeBodyBattery(build({ recovery: 0.5, sleepH: 7.0, sets: 20, steps: 6000, kcal: 350, wakeHoursAgo: h }));
  ceiling.push({ hoursAwake: h, bestCase: best.level, typicalUser: typical.level });
}
console.table(ceiling);
