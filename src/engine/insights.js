// HISTORY-DERIVED INSIGHTS — streaks, the progress-insight cards, and PR-event reconstruction.
//
// Extracted from App.jsx verbatim. Everything here reduces store.history to something a card or a
// banner says; nothing touches the network, HealthKit or React. The coach-context builders
// (buildCoachContext, generateWeeklyReview) deliberately did NOT move with these: they read the
// session token and call the AI endpoint, which makes them device/network glue, not analytics —
// the closure that included them dragged in the HealthKit auth chain and the API base URL, which
// is how you know a "pure" function isn't.
import { dateFromKey, dateKeyOf, workingDone, dKey, cvt } from "./core.js";
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


// ★★ GRACE IS OFF (Mo, Sep 15 2026) — 0 DISABLES IT, AND THAT IS THE ONLY SWITCH.
// One forgiven week per N weeks of the backward walk shipped free earlier the same day and was
// turned off hours later: Mo would rather sell a streak restore than give one away, and a free
// grace is exactly the product a paid restore would have to compete with. See PARKED IDEAS in
// CLAUDE.md — the paid version's stored exception is a different mechanism (a per-week record of
// what was bought), but the WALK's grace branch is the thing it plugs into, so the branch stays
// here, tested, rather than being deleted and rebuilt from memory later.
//
// What 0 does, precisely: the walk's `graceEvery > 0` guard short-circuits, so no week is ever
// forgiven, `graceUsed` is always 0 and `savedWeek` is always false. That is byte-identical to
// the behaviour before grace existed — a missed week resets the streak. sim_streakgrace pins BOTH
// halves: the mechanism still works when a caller passes graceEvery explicitly, AND the shipped
// default is off.
//
// ★ RE-ENABLING IT IS TWO EDITS, NOT ONE. The card's "STREAK SAVED" kicker was REMOVED with this,
// because a label nothing can reach is the dead-UI class this file keeps paying for. Whatever
// turns grace back on has to put it back, and it is not decoration: a count that survives a week
// the user KNOWS they missed reads as a bug unless something on screen says otherwise. The label
// keys on `savedWeek` ("the most recent COMPLETED week was forgiven"), never on graceUsed > 0 —
// an old forgiven week is not news and would leave the label stuck on for months.
const STREAK_GRACE_EVERY_WEEKS = 0;

// ★ THE TARGET A PAST WEEK IS JUDGED AGAINST IS THE ONE THAT WAS IN FORCE WHEN THAT WEEK BEGAN,
// NOT TODAY'S. The streak recomputes the whole history on every render, so before this existed,
// raising your weekly target from 2 to 3 instantly wiped a genuinely-earned run — the app
// punished you for getting more ambitious, with no warning and no way back except lowering the
// target again.
//
// `history` entries read "target N applied to every week that STARTED before `until`", ascending
// by `until`. The earliest boundary still ahead of the week wins; a week past every recorded
// boundary falls through to the CURRENT target. So an EMPTY history reproduces the old behaviour
// exactly for every existing user — this is backward-compatible by construction and only starts
// mattering at the first change made after it ships. There is no way to recover what someone's
// target was last March, and inventing one would be worse than falling back.
//
// The boundary is the CURRENT WEEK'S MONDAY, not the day of the change, and that is a
// consistency requirement rather than a preference: `countingThisWeek` is computed against the
// CURRENT target, so if the loop judged this week against the OLD one the two could disagree —
// lower your target mid-week and you would get status "active" above a count of 0, because the
// easier test said the week was made and the harder one broke the run at step 0. Anchoring to
// Monday means this week always uses the target the pips and the "N/M" caption are already
// showing.
//
// Junk entries are skipped rather than thrown on: this runs on every render of the landing screen,
// so a malformed row from an older build must degrade to "no recorded change", never to a crash.
// `weekStartDate` is taken AS GIVEN — it is not re-normalised to a Monday, because both ends of
// the comparison already guarantee one (recordTargetChange only ever writes a Monday key, and the
// walk's cursor is seeded by weekStart and stepped in whole weeks). The obvious worry is that
// `cursor.setDate(-7)` DST-drifts off midnight and makes dateKeyOf report the Sunday, flipping a
// boundary that sits exactly on the Monday. MEASURED and it does not: 400 start dates x 110 steps
// across Santiago, Havana, Asuncion, Beirut and Auckland — the four midnight-transition zones plus
// a southern one — gave ZERO drifted steps. Same answer as the earlier weekKey sweep. Do not add a
// normalisation here without a failing case: it would also change what this function means when
// handed an arbitrary day, which sim_streakgrace section 8 pins deliberately.
function targetForWeek(weekStartDate, currentTarget, history) {
  if (!Array.isArray(history) || !history.length) return currentTarget;
  const ws = dateKeyOf(weekStartDate);
  let best = null;
  for (const e of history) {
    const until = e && typeof e.until === "string" ? e.until : null;
    const t = Number(e && e.target);
    if (!until || !Number.isFinite(t) || t < 1) continue;
    if (ws < until && (best === null || until < best.until)) best = { until, target: t };
  }
  return best ? best.target : currentTarget;
}

// Streak v2 — "active week" model.
// User has a weekly workout target (default 3). Each week they hit the target counts as "active".
// Streak is # of consecutive active weeks ending in the current or previous week.
// Returns: { count, target, thisWeek, status, graceUsed, savedWeek } where status is
// "active" | "at-risk" | "lost", graceUsed is how many weeks inside the counted run were forgiven
// (see STREAK_GRACE_EVERY_WEEKS), and savedWeek says the MOST RECENT completed week was one of
// them — the only grace the user can actually see happen, and so the only one worth a label.
// A forgiven week does NOT increment `count`: the number is displayed as "17 wks" and has to mean
// weeks you actually hit the target. Counting a week you were ill would make the headline a lie
// while delivering nothing the user wanted — what they wanted is the chain not resetting to zero.
//
// `opts`: { targetHistory, graceEvery, now } — all optional. `now` exists so a sim can pin the
// clock; a streak test that reads the wall clock passes at one hour and fails at another.
function calcWeeklyStreak(workoutDates, target = 3, opts = {}) {
  const targetHistory = opts && opts.targetHistory;
  const graceEvery = (opts && Number.isFinite(opts.graceEvery)) ? opts.graceEvery : STREAK_GRACE_EVERY_WEEKS;
  const keys = Object.keys(workoutDates || {});
  if (!keys.length) return { count: 0, target, thisWeek: 0, status: "lost", graceUsed: 0, savedWeek: false };

  // Group workouts by week key. Parse the date key at LOCAL noon — `new Date("2026-06-15")`
  // is parsed as UTC midnight, which in negative-UTC timezones lands on the previous day
  // and can bump a workout into the wrong week (showing "0 done" after training).
  const byWeek = {};
  for (const dk of keys) {
    const wk = weekKey(new Date(dk + "T12:00:00"));
    byWeek[wk] = (byWeek[wk] || 0) + 1;
  }

  // Start from the most recent week we have activity in, walk backward
  const now = opts && opts.now != null ? new Date(opts.now) : new Date();
  const thisWeekKey = weekKey(now);
  const thisWeekCount = byWeek[thisWeekKey] || 0;

  // Determine streak: count consecutive active weeks ending in this week OR last week
  // (this week not counted as failure until the week is over)
  let streak = 0;
  let cursor = new Date(now);
  // This week is judged against the CURRENT target, not a historical one — it is the week you are
  // living in, so the goal you have now is the goal that applies.
  let countingThisWeek = thisWeekCount >= target;

  // Move cursor to start of this week, then iterate weeks
  cursor = weekStart(cursor);
  // Skip this week if it's not yet "made" — only count if hit target OR allow grace
  if (!countingThisWeek) {
    // Don't count this week toward streak yet, but don't break it either — start from last week
    cursor.setDate(cursor.getDate() - 7);
  }

  // Walking BACKWARD means the most recent shortfall is the one that gets forgiven, which is the
  // right bias: it is the week the user is staring at. (Forward-in-time semantics would spend the
  // grace on the oldest gap instead and break the run at the newest — the same inputs, a worse
  // answer for the person looking at the card.)
  let graceUsed = 0;
  let lastGraceStep = -Infinity;
  // The walk step that IS the most recent completed week: 0 when we started at last week (this
  // week not made yet), 1 when we started at this week. Forgiving THAT week is the only grace the
  // user can see happening, and a card reading "17 wks" the week after they missed one would
  // otherwise be a silent lie — the number would be right and the sentence it forms with the
  // user's own memory would not.
  const lastWeekStep = countingThisWeek ? 1 : 0;
  let savedWeek = false;
  // ★ A GRACE IS ONLY SPENT IF SOMETHING COUNTS BEHIND IT. The walk always ends by running off
  // the start of the user's history into empty weeks, so the LAST thing it ever does is forgive a
  // week that contributes nothing and then break on the next one. That grace changes no count and
  // must not be reported: a perfect 21-week run came back `graceUsed: 1`, which would have put
  // "streak saved" on a card belonging to someone who has never missed a week. Graces are held
  // pending and committed the moment a week actually counts. (`lastGraceStep` is still set
  // immediately — the SPACING rule has to see a pending grace, or the walk would forgive two
  // trailing weeks in a row and keep going.)
  let pendingGrace = 0;
  let pendingSaved = false;
  for (let i = 0; i < 104; i++) { // up to 2 years
    const wk = weekKey(cursor);
    const count = byWeek[wk] || 0;
    if (count >= targetForWeek(cursor, target, targetHistory)) {
      streak++;
      graceUsed += pendingGrace;
      if (pendingSaved) savedWeek = true;
      pendingGrace = 0;
      pendingSaved = false;
      cursor.setDate(cursor.getDate() - 7);
    } else if (graceEvery > 0 && i - lastGraceStep >= graceEvery) {
      // Forgiven: the chain survives, the count does not grow.
      // A first draft guarded this with `streak > 0` to stop a lapsed account walking back to a
      // run it abandoned months ago — and measured against real data it returned 0, because the
      // FIRST week the walk reaches is the one the user just missed, so `streak` is always 0
      // there. The guard blocked the only case grace exists for. The spacing rule already does
      // that job properly: a lapsed account hits a SECOND consecutive gap one step later, which
      // is refused, so the walk stops. Two weeks off still breaks the streak.
      pendingGrace++;
      if (i === lastWeekStep) pendingSaved = true;
      lastGraceStep = i;
      cursor.setDate(cursor.getDate() - 7);
    } else {
      break;
    }
  }

  // Status: active if hit this week, at-risk if last week was active but this week isn't yet
  let status = "lost";
  if (countingThisWeek) status = "active";
  else if (streak > 0) status = "at-risk"; // had a streak going, this week not yet made

  // A forgiven week with nothing counted behind it is not a forgiven week, it is just an empty
  // walk — reporting graceUsed there would put "1 week forgiven" on a card reading 0.
  return { count: streak, target, thisWeek: thisWeekCount, status, graceUsed: streak > 0 ? graceUsed : 0, savedWeek: streak > 0 && savedWeek };
}

// The store-shaped call. Eight call sites had hand-written `store.weeklyTarget || 3` and would now
// each need the target history threaded through as well — which is the N-copies-drift class this
// codebase keeps paying for, so there is one definition instead. `plusDateKey` is for the finish
// flow, which asks "what will my streak be once today counts" before today has reached the store.
// The friend-stats call in DiscoverScreen deliberately does NOT come through here: it passes a
// FRIEND's dates and a FRIEND's target, and their history is not in public_profiles (nor should
// it be). Grace still applies there, because grace lives inside calcWeeklyStreak itself.
// `now` is for tests only: a caller that omits it gets the wall clock, exactly as before. Without
// it sim_streakgrace's [store] check was pinned to a fixed fixture date while this read today, so
// it went red on its own nine days after it was written.
function storeStreak(store, plusDateKey, now) {
  const base = (store && store.workoutDates) || {};
  return calcWeeklyStreak(
    plusDateKey ? { ...base, [plusDateKey]: true } : base,
    (store && store.weeklyTarget) || 3,
    { targetHistory: store && store.weeklyTargetHistory, ...(now != null ? { now } : {}) }
  );
}

// Record a weekly-target change so past weeks keep being judged against the old goal.
// Returns the NEW history array (never mutates), or null when nothing needs recording.
// `until` is THIS WEEK'S MONDAY and means "the old target applied to every week that started
// before this one". Two guards that each close a real hole: a no-op change records nothing, and a
// SECOND change in the same week does not append again — the first entry already pins that
// boundary, and the intermediate value (2 -> 3 -> 4 in one sitting) was never in force for a whole
// week, so recording it would judge past weeks against a target the user held for ten seconds.
function recordTargetChange(history, oldTarget, newTarget, now = Date.now()) {
  if (!Number.isFinite(oldTarget) || !Number.isFinite(newTarget) || oldTarget === newTarget) return null;
  // The caller passes a CLOCK, not a boundary — the boundary rule (this week's Monday, see
  // targetForWeek) belongs here, beside the function that reads it, or the two drift.
  const until = dateKeyOf(weekStart(new Date(now)));
  const list = Array.isArray(history) ? history.filter(e => e && typeof e.until === "string" && Number.isFinite(Number(e.target))) : [];
  if (list.some(e => e.until === until)) return null;
  // Capped so a user who changes their mind every week cannot grow this without bound — but the
  // cap has to CLEAR the walk, not merely be small. `slice(-N)` keeps the NEWEST N and drops the
  // OLDEST, and dropping an old boundary does not make that week fall back to the current target;
  // it makes it inherit the next boundary along, i.e. a target from years later. At one change a
  // week the walk's own 104-week reach is the binding number, so the cap sits just above it. Each
  // entry is ~35 bytes, so even a full array is a few kB in a jsonb column.
  return [...list, { until, target: oldTarget }].sort((a, b) => a.until < b.until ? -1 : 1).slice(-110);
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
  const ws = storeStreak(store);
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
          // `s.done === undefined` is a LEGACY working set (rows written before the flag existed);
          // `s.done === false` is a set the lifter deliberately did not tick. The old test accepted
          // the second as long as reps had been typed, so three abandoned sessions with every set
          // un-ticked produced "Chest trained 3x in 4 days — consider a rest day" for a muscle that
          // was never trained. Every other done-check in the engine carries this distinction.
          const worked = (ex.sets || []).some(s => s.type !== "warmup"
            && (s.done === true || (s.done === undefined && parseFloat(s.reps) > 0)));
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
export { calcStreak, calcWeeklyStreak, storeStreak, recordTargetChange, targetForWeek, STREAK_GRACE_EVERY_WEEKS, getProgressInsights, reconstructPrEvents };
