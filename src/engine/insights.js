// HISTORY-DERIVED INSIGHTS — streaks, the progress-insight cards, and PR-event reconstruction.
//
// Extracted from App.jsx verbatim. Everything here reduces store.history to something a card or a
// banner says; nothing touches the network, HealthKit or React. The coach-context builders
// (buildCoachContext, generateWeeklyReview) deliberately did NOT move with these: they read the
// session token and call the AI endpoint, which makes them device/network glue, not analytics —
// the closure that included them dragged in the HealthKit auth chain and the API base URL, which
// is how you know a "pure" function isn't.
import { dateFromKey, workingDone, dKey, cvt } from "./core.js";
import { getMuscle } from "./exercises.js";
import { calc1RM, epley1RM, sessionVolume } from "./workout.js";

// Rebuild the dated PR-hit log (store.prEvents — what Wrapped/recaps count) from workout history
// by replaying every session in chronological order and tracking a running max per exercise for
// each PR category (weight, estimated 1RM, single-set volume), exactly mirroring the live
// finish-time check in getSetPRTypes/finishWorkout. A PR event is emitted the first time a set
// beats any running max — so the very first time you do an exercise counts, same as the app would
// have recorded it. Used only when the stored log is empty (the log is otherwise append-only at
// finish, so an edited workout or a finish whose PR write didn't land leaves it blank or short).
function reconstructPrEvents(history) {
  const sessions = [];
  Object.entries(history || {}).forEach(([dk, day]) => {
    Object.entries(day || {}).forEach(([sid, s]) => {
      sessions.push({
        dk, sid,
        finishedAt: s?.finishedAt || new Date(dk + "T12:00:00").getTime(),
        unit: s?.unit || "lbs",
        exercises: s?.exercises || [],
      });
    });
  });
  // Chronological: oldest first, so each running max reflects only prior sessions.
  sessions.sort((a, b) => a.finishedAt - b.finishedAt);
  const maxW = {}, maxE = {}, maxV = {};
  const events = [];
  for (const sess of sessions) {
    const toLbs = w => sess.unit === "lbs" ? w : cvt(w, "kg", "lbs");
    for (const ex of sess.exercises) {
      if (!ex?.name) continue;
      let bw = 0, be = 0, bv = 0;
      for (const s of (ex.sets || [])) {
        const done = s?.done === true || (s?.done === undefined && parseFloat(s?.reps) > 0);
        if (!done || s?.type === "warmup") continue;
        const wt = parseFloat(s.weight), r = parseInt(s.reps);
        if (!wt || wt <= 0 || !r || r < 1) continue;
        const lbs = toLbs(wt);
        const e1 = Math.round(epley1RM(lbs, r, 12));
        const v = lbs * r;
        if (lbs > bw) bw = lbs;
        if (e1 > be) be = e1;
        if (v > bv) bv = v;
      }
      const types = [];
      if (bw > 0 && bw > (maxW[ex.name] || 0)) { maxW[ex.name] = bw; types.push("weight"); }
      if (be > 0 && be > (maxE[ex.name] || 0)) { maxE[ex.name] = be; types.push("e1rm"); }
      if (bv > 0 && bv > (maxV[ex.name] || 0)) { maxV[ex.name] = bv; types.push("volume"); }
      if (types.length) events.push({ date: sess.dk, sid: sess.sid, name: ex.name, weightLbs: bw, types });
    }
  }
  return events.slice(-300); // same cap the finish-time appender uses
}


// Get ISO week boundary (Mon 00:00 local) for a given date
function weekStart(d = new Date()) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0 (Sun) - 6 (Sat)
  const offset = day === 0 ? 6 : day - 1; // distance back to Monday
  date.setDate(date.getDate() - offset);
  return date;
}

function weekKey(d) {
  const w = weekStart(d);
  return `${w.getFullYear()}-W${String(Math.floor((w.getTime() - new Date(w.getFullYear(), 0, 1).getTime()) / 604800000) + 1).padStart(2, "0")}`;
}


// Streak v2 — "active week" model.
// User has a weekly workout target (default 3). Each week they hit the target counts as "active".
// Streak is # of consecutive active weeks ending in the current or previous week.
// Returns: { count, target, thisWeek, weeksActive, status } where status is "active" | "at-risk" | "lost"
function calcWeeklyStreak(workoutDates, target = 3) {
  const keys = Object.keys(workoutDates || {});
  if (!keys.length) return { count: 0, target, thisWeek: 0, status: "lost" };

  // Group workouts by week key. Parse the date key at LOCAL noon — `new Date("2026-06-15")`
  // is parsed as UTC midnight, which in negative-UTC timezones lands on the previous day
  // and can bump a workout into the wrong week (showing "0 done" after training).
  const byWeek = {};
  for (const dk of keys) {
    const wk = weekKey(new Date(dk + "T12:00:00"));
    byWeek[wk] = (byWeek[wk] || 0) + 1;
  }

  // Start from the most recent week we have activity in, walk backward
  const now = new Date();
  const thisWeekKey = weekKey(now);
  const thisWeekCount = byWeek[thisWeekKey] || 0;

  // Determine streak: count consecutive active weeks ending in this week OR last week
  // (this week not counted as failure until the week is over)
  let streak = 0;
  let cursor = new Date(now);
  let countingThisWeek = thisWeekCount >= target;

  // Move cursor to start of this week, then iterate weeks
  cursor = weekStart(cursor);
  // Skip this week if it's not yet "made" — only count if hit target OR allow grace
  if (!countingThisWeek) {
    // Don't count this week toward streak yet, but don't break it either — start from last week
    cursor.setDate(cursor.getDate() - 7);
  }

  for (let i = 0; i < 104; i++) { // up to 2 years
    const wk = weekKey(cursor);
    const count = byWeek[wk] || 0;
    if (count >= target) {
      streak++;
      cursor.setDate(cursor.getDate() - 7);
    } else {
      break;
    }
  }

  // Status: active if hit this week, at-risk if last week was active but this week isn't yet
  let status = "lost";
  if (countingThisWeek) status = "active";
  else if (streak > 0) status = "at-risk"; // had a streak going, this week not yet made

  return { count: streak, target, thisWeek: thisWeekCount, status };
}


// Legacy daily-streak helper — kept for components that haven't migrated yet
function calcStreak(workoutDates) {
  const keys = Object.keys(workoutDates||{}).sort().reverse();
  if (!keys.length) return 0;
  const set = new Set(keys);
  let streak = 0;
  const check = new Date(); check.setHours(0,0,0,0);
  for (let i = 0; i < 365; i++) {
    if (set.has(dKey(check))) streak++;
    else if (i > 0) break;
    check.setDate(check.getDate()-1);
  }
  return streak;
}

// ─── Progress Insights Engine ───────────────────────────────────────────────
// Scans workout history and surfaces the single most compelling TRUE fact about
// the user's recent progress. Returns { icon, headline, sub } or null.
// Everything here is derived from data already on hand — no new tracking needed.
// The whole point: make the user feel their progress, which they often don't notice.
function getProgressInsight(store, unit, returnAll = false) {
  const history = store.history || {};
  const dates = Object.keys(history).sort(); // ascending
  if (dates.length < 2) return null; // need some history to say anything meaningful

  const now = Date.now();
  const DAY = 86400000;
  const candidates = [];

  // Helper: collect all completed (non-warmup) sets for an exercise with their date
  function exerciseSets(exName) {
    const out = [];
    for (const d of dates) {
      for (const sess of Object.values(history[d] || {})) {
        const ex = (sess.exercises || []).find(e => e.name === exName);
        if (!ex) continue;
        const su = sess.unit || "lbs";
        for (const s of workingDone(ex.sets)) {
          const w = cvt(parseFloat(s.weight) || 0, su, unit);
          const r = parseFloat(s.reps) || 0;
          // Epley 1RM is only reliable up to ~12 reps. Above that, a burnout/endurance
          // set would inflate the estimate and produce a false "you got stronger" claim,
          // so we don't let those sets define an e1RM for insight purposes.
          const e1rm = (r >= 1 && r <= 12) ? (calc1RM(w, r) || 0) : 0;
          // dateFromKey, not new Date(d) — a bare "YYYY-MM-DD" key parses as midnight UTC,
          // which shifts every set a day earlier west of Greenwich and can push it across the
          // 8-week strength-gain boundary below into the wrong bucket.
          out.push({ date: d, t: dateFromKey(d).getTime(), w, r, e1rm });
        }
      }
    }
    return out;
  }

  // 1. Strength gain on a key lift over the last ~8 weeks (best e1RM then vs now)
  const allExercises = new Set();
  for (const d of dates) {
    for (const sess of Object.values(history[d] || {})) {
      (sess.exercises || []).forEach(e => e.name && allExercises.add(e.name));
    }
  }
  for (const exName of allExercises) {
    const sets = exerciseSets(exName);
    if (sets.length < 4) continue; // need enough data
    const eightWeeksAgo = now - 56 * DAY;
    const older = sets.filter(s => s.t < eightWeeksAgo);
    const recent = sets.filter(s => s.t >= eightWeeksAgo);
    if (!older.length || !recent.length) {
      // Not enough span — compare first quarter vs last quarter of available data
      const q = Math.max(1, Math.floor(sets.length / 4));
      const earlyBest = Math.max(...sets.slice(0, q).map(s => s.e1rm));
      const lateBest = Math.max(...sets.slice(-q).map(s => s.e1rm));
      if (earlyBest > 0 && lateBest > earlyBest) {
        const gain = Math.round(lateBest - earlyBest);
        if (gain >= (unit === "kg" ? 5 : 10)) {
          candidates.push({ key: `strength:${exName}`, priority: 2, icon: "trending", headline: `Your ${exName} is up ${gain} ${unit}`, sub: `Estimated 1-rep max since you started tracking it` });
        }
      }
      continue;
    }
    const olderBest = Math.max(...older.map(s => s.e1rm));
    const recentBest = Math.max(...recent.map(s => s.e1rm));
    if (olderBest > 0 && recentBest > olderBest) {
      const gain = Math.round(recentBest - olderBest);
      if (gain >= (unit === "kg" ? 5 : 10)) {
        candidates.push({ key: `strength:${exName}`, priority: 1, icon: "trending", headline: `Your ${exName} is up ${gain} ${unit}`, sub: `Estimated 1-rep max, recent sessions vs earlier` });
      }
    }
  }

  // 2. Weekly streak milestone
  const ws = calcWeeklyStreak(store.workoutDates || {}, store.weeklyTarget || 3);
  if (ws.count >= 2) {
    candidates.push({ key: `streak:${ws.count}`, priority: ws.count >= 4 ? 1 : 3, icon: "flame", headline: `${ws.count} week streak`, sub: `You've hit your weekly target ${ws.count} weeks running. Keep it alive.` });
  }

  // 3. Biggest-volume week ever (this week vs all prior weeks)
  const volByWeek = {};
  for (const d of dates) {
    for (const sess of Object.values(history[d] || {})) {
      // sessionVolume() is the ONE volume definition — this used to reimplement its filter
      // inline (a third variant, differing from exerciseSets' own inline copy above it), so this
      // "Biggest week yet" banner could disagree with what History/Profile report for the same
      // week. dateFromKey, not new Date(d) — see the note in exerciseSets above.
      const v = cvt(sessionVolume(sess), sess.unit || "lbs", unit);
      const wk = weekKey(dateFromKey(d));
      volByWeek[wk] = (volByWeek[wk] || 0) + v;
    }
  }
  const thisWk = weekKey(new Date());
  const thisWkVol = volByWeek[thisWk] || 0;
  const priorVols = Object.entries(volByWeek).filter(([k]) => k !== thisWk).map(([, v]) => v);
  if (thisWkVol > 0 && priorVols.length >= 2 && thisWkVol > Math.max(...priorVols)) {
    candidates.push({ key: `bigweek:${thisWk}`, priority: 2, icon: "trophy", headline: `Biggest week yet`, sub: `${Math.round(thisWkVol).toLocaleString()} ${unit} lifted this week — a personal best` });
  }

  // 4. Total sessions milestone
  const totalSessions = dates.reduce((a, d) => a + Object.keys(history[d] || {}).length, 0);
  if ([10, 25, 50, 100, 150, 200, 250, 300, 500].includes(totalSessions)) {
    candidates.push({ key: `sessions:${totalSessions}`, priority: 1, icon: "trophy", headline: `${totalSessions} workouts logged`, sub: `That's real consistency. Proud of you.` });
  }

  // 5. Recovery awareness — if the user has trained one muscle group 3+ times in the
  // last 4 days, gently flag it (could use a rest day for that group). Quiet, low-priority
  // so it doesn't dominate when there's better news.
  {
    const sevenDayAgo = now - 4 * DAY;
    const muscleHits = {};
    for (const d of dates) {
      const dms = new Date(d + "T12:00:00").getTime();
      if (dms < sevenDayAgo) continue;
      for (const sess of Object.values(history[d] || {})) {
        const musclesThisSession = new Set();
        (sess.exercises || []).forEach(ex => {
          if (!ex.name) return;
          // Only count if there were real working sets
          const worked = (ex.sets || []).some(s => s.type !== "warmup" && (s.done === true || parseFloat(s.reps) > 0));
          if (!worked) return;
          const m = (getMuscle(ex.name)) || "";
          if (m && m !== "Cardio" && m !== "Yoga") musclesThisSession.add(m);
        });
        musclesThisSession.forEach(m => { muscleHits[m] = (muscleHits[m] || 0) + 1; });
      }
    }
    const overworked = Object.entries(muscleHits).filter(([m, c]) => c >= 3);
    if (overworked.length > 0) {
      const [m, c] = overworked[0];
      candidates.push({ key: `recovery:${m}:${weekKey(new Date())}`, priority: 5, icon: "trending", headline: `${m} trained ${c}× in 4 days`, sub: `Consider a rest day for that group — recovery is where the gains stick.` });
    }
  }

  if (!candidates.length) return returnAll ? [] : null;
  // Drop any insight the user has already swiped away (persisted keys).
  const dismissed = new Set(store.dismissedInsights || []);
  const live = candidates.filter(c => !c.key || !dismissed.has(c.key));
  if (!live.length) return returnAll ? [] : null;
  // Lower priority number = more compelling. Tie-break randomly so it varies.
  live.sort((a, b) => a.priority - b.priority || Math.random() - 0.5);
  return returnAll ? live : live[0];
}


// Returns ALL insight candidates (sorted, most compelling first) for the swipeable
// card stack on the workout tab. Wraps getProgressInsight's collection by exposing
// the internal candidate list via the optional `returnAll` flag.
function getProgressInsights(store, unit) {
  return getProgressInsight(store, unit, true) || [];
}


// Exported: what App.jsx and src/lazy/ import — calcStreak looked internal from App.jsx alone,
// but WrappedModal imports it directly (the closure tool reads App.jsx only; grep src/lazy/ before
// calling anything private). getProgressInsight stays internal: getProgressInsights is the caller.
export { calcStreak, calcWeeklyStreak, getProgressInsights, reconstructPrEvents };
