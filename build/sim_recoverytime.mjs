// GARMIN-STYLE "HOURS UNTIL RECOVERED" — the recovery-time advisor parked during the Aug 1
// recovery-screen decluttering (a 4th number felt like too much right after simplifying the
// screen) and picked back up once the containment/audit work settled. It reuses sessionDrain (the
// one workout-drain formula Body Battery already shares between its headline and 24h curve) rather
// than inventing a second training-stress number, and scales the base window by recoveryScore.
const _ls = new Map();
globalThis.localStorage = { getItem: k => (_ls.has(k) ? _ls.get(k) : null), setItem: (k,v)=>_ls.set(k,String(v)), removeItem: k=>_ls.delete(k) };
globalThis.window = undefined;

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const { recoveryTimeHours, sessionDrain } = await import("./app.mjs");

const dk = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

// A finished session: `nSets` working sets at `rpe`, ending at `endMs`.
function sess(nSets, rpe, endMs, extra) {
  const sets = [];
  for (let i = 0; i < nSets; i++) sets.push({ weight: "100", reps: "8", done: true, type: "normal", rpe: rpe != null ? String(rpe) : undefined });
  return { unit: "lbs", dayName: "W", duration: 3600, finishedAt: endMs, exercises: [{ name: "Squat", sets }], ...extra };
}
function storeWith(sessions) {
  // sessions: array of { endMs, ...sess fields } — grouped by their own date key.
  const history = {};
  for (const s of sessions) {
    const k = dk(s.finishedAt);
    (history[k] = history[k] || {})[`s${s.finishedAt}`] = s;
  }
  return { history };
}

const NOW = new Date(2026, 7, 20, 18, 0, 0); // Thu Aug 20 2026, 18:00 local

// ── No basis to estimate from ────────────────────────────────────────────────────────────────
check("no history at all → null", recoveryTimeHours({ history: {} }, null, NOW) === null);
check("session with zero working sets (all warmup) → null",
  recoveryTimeHours(storeWith([{ ...sess(0, null, NOW.getTime() - 3600e3), exercises: [{ name:"Squat", sets:[{ weight:"45", reps:"10", done:true, type:"warmup" }] }] }]), null, NOW) === null);

// ── A just-finished light session gives a small positive estimate ──────────────────────────────
{
  const endMs = NOW.getTime() - 5 * 60000; // 5 minutes ago
  const store = storeWith([sess(6, 6, endMs)]); // light: 6 sets, RPE 6 → low drain
  const hrs = recoveryTimeHours(store, null, NOW);
  check("a just-finished light session (no recovery score) returns a small positive hour count",
    hrs != null && hrs > 0 && hrs < 15, `got ${hrs}`);
}

// ── A heavier session needs MORE time than a lighter one, same recovery score, same elapsed time ─
{
  const endMs = NOW.getTime() - 60 * 60000; // 1h ago, same for both
  const light = storeWith([sess(8, 6, endMs)]);
  const heavy = storeWith([sess(24, 9, endMs)]);
  const hLight = recoveryTimeHours(light, { recoveryScore: 0.7 }, NOW);
  const hHeavy = recoveryTimeHours(heavy, { recoveryScore: 0.7 }, NOW);
  check("a heavier/higher-RPE session estimates MORE remaining hours than a lighter one",
    hHeavy > hLight, `light=${hLight} heavy=${hHeavy}`);
}

// ── Time passing on the SAME session only ever reduces (or holds) the remaining estimate ────────
{
  const store1h = storeWith([sess(16, 8, NOW.getTime() - 1 * 3600e3)]);
  const store10h = storeWith([sess(16, 8, NOW.getTime() - 10 * 3600e3)]);
  const store40h = storeWith([sess(16, 8, NOW.getTime() - 40 * 3600e3)]);
  const h1 = recoveryTimeHours(store1h, { recoveryScore: 0.7 }, NOW);
  const h10 = recoveryTimeHours(store10h, { recoveryScore: 0.7 }, NOW);
  const h40 = recoveryTimeHours(store40h, { recoveryScore: 0.7 }, NOW);
  check("remaining hours strictly decreases as more time elapses since the same session",
    h1 > h10 && h10 >= h40, `1h=${h1} 10h=${h10} 40h=${h40}`);
  check("a session finished long enough ago (40h, moderate drain) reads fully recovered (0), never negative",
    h40 === 0, `got ${h40}`);
}

// ── recoveryScore scales the estimate: poorly-recovered needs MORE time than well-recovered ─────
{
  const store = storeWith([sess(20, 8, NOW.getTime() - 2 * 3600e3)]);
  const hGood = recoveryTimeHours(store, { recoveryScore: 0.95 }, NOW);
  const hBad = recoveryTimeHours(store, { recoveryScore: 0.15 }, NOW);
  check("the SAME session estimates MORE remaining hours when poorly recovered than when well recovered",
    hBad > hGood, `good=${hGood} bad=${hBad}`);
}

// ── Never negative, even for an ancient session ─────────────────────────────────────────────────
{
  const store = storeWith([sess(30, 10, NOW.getTime() - 30 * 864e5)]); // 30 days ago, max drain
  const hrs = recoveryTimeHours(store, { recoveryScore: 0.1 }, NOW);
  check("a session weeks old with the worst possible drain/recovery combo still clamps to 0, not negative",
    hrs === 0, `got ${hrs}`);
}

// ── Picks the MOST RECENT session, not just the first one found ────────────────────────────────
{
  // Two sessions same day: an earlier lighter one, a later heavier one. Must use the later one.
  const earlyToday = NOW.getTime() - 8 * 3600e3;
  const lateToday = NOW.getTime() - 1 * 3600e3;
  const store = storeWith([sess(4, 5, earlyToday), sess(24, 9, lateToday)]);
  const hrs = recoveryTimeHours(store, { recoveryScore: 0.7 }, NOW);
  // Compute what the LATE (heavy) session alone would give, to confirm it (not the early light one) drove the answer.
  const lateAlone = recoveryTimeHours(storeWith([sess(24, 9, lateToday)]), { recoveryScore: 0.7 }, NOW);
  check("with two sessions on the same day, the estimate is driven by the LATER (most recent) one",
    hrs === lateAlone, `combined=${hrs} lateAlone=${lateAlone}`);
}
{
  // Sessions on different days: must pick the one from the more recent day, not an earlier day
  // that happens to iterate first in some other order.
  const twoDaysAgo = NOW.getTime() - 2 * 864e5;
  const yesterday = NOW.getTime() - 1 * 864e5 - 3600e3;
  const store = storeWith([sess(30, 10, twoDaysAgo), sess(4, 5, yesterday)]);
  const hrs = recoveryTimeHours(store, { recoveryScore: 0.7 }, NOW);
  const yesterdayAlone = recoveryTimeHours(storeWith([sess(4, 5, yesterday)]), { recoveryScore: 0.7 }, NOW);
  check("across different days, the estimate comes from the most recent DAY's session, not an older heavier one",
    hrs === yesterdayAlone, `combined=${hrs} yesterdayAlone=${yesterdayAlone}`);
}

// ── A bad future-dated row is skipped, falling through to the real most-recent session ─────────
{
  const real = NOW.getTime() - 2 * 3600e3;
  const bogus = NOW.getTime() + 5 * 3600e3; // 5h in the future — a corrupt/clock-skewed row
  const storeReal = storeWith([sess(16, 8, real)]);
  const storeWithBogus = storeWith([sess(16, 8, real), sess(30, 10, bogus)]);
  const hReal = recoveryTimeHours(storeReal, { recoveryScore: 0.7 }, NOW);
  const hWithBogus = recoveryTimeHours(storeWithBogus, { recoveryScore: 0.7 }, NOW);
  check("a future-dated (bogus) session is skipped — the estimate matches the real session alone",
    hReal === hWithBogus, `real=${hReal} withBogus=${hWithBogus}`);
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
