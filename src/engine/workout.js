// WORKOUT MATHS — volume, set counting, 1RM, PR detection, progression and training load.
//
// Extracted from App.jsx verbatim; nothing here changed. This is the layer CLAUDE.md keeps calling
// "ONE definition": sessionVolume/workingDone for what counts as a working set, progSetCount for a
// program day's set count, epley1RM for an estimated max, sessionPRNames for a PR badge,
// postWorkoutPayload for a shared card, detectDeloadNeeded for a plateau verdict. Every one of
// those replaced a fistful of inline copies that had drifted apart and started contradicting each
// other on screen — so if you need one of these numbers, IMPORT IT, never re-derive it locally.
//
// Pure and UI-free: no React, no theme, no DOM. Takes sessions/sets/stores in, returns numbers.
import { workingDone, dKey, LBS_PER_KG, cvt } from "./core.js";

// Detect exercises where weight is loaded on ONE end of the bar only (T-bar row, landmine
// variants). For these, the "bar" doesn't add resistance — the user enters total plate
// weight directly, and we show plates as a single stack, not "per side."
function isOneSidedBarbell(name) {
  if (!name) return false;
  return /\bt-?bar\b|\blandmine\b/i.test(name);
}


// ONE definition of an estimated 1RM. Epley is `w × (1 + reps/30)`, which ESTIMATES a max from a
// multi-rep set — but at ONE rep there is nothing to estimate: the weight you just lifted IS your
// one-rep max. The raw formula still multiplies by 31/30 and adds 3.3%, so entering 225×1 reported
// a max of 233. The formula was inlined in seven places and every one of them had this bug, so the
// calculator and the Est-1RM PR badge could disagree about the same set. They all come here now.
//
// `cap` clamps the rep count first: Epley overstates badly past ~12 reps (a 20-rep burnout set
// would mint a fake PR), so the PR/trend callers pass a cap while the user-facing calculator
// doesn't — there the user chose the number and we shouldn't silently substitute another.
// Returns an unrounded number, or 0 for junk input; callers round if they display it.
function epley1RM(weight, reps, cap = 0) {
  const w = parseFloat(weight), rRaw = parseInt(reps);
  if (!isFinite(w) || !isFinite(rRaw) || w <= 0 || rRaw < 1) return 0;
  const r = cap ? Math.min(rRaw, cap) : rRaw;
  return r === 1 ? w : w * (1 + r / 30);
}

function calc1RM(weight, reps) {
  if (!weight || !reps) return null;
  const v = epley1RM(weight, reps);
  return v ? Math.round(v) : null;
}

// Strong/Hevy-style PR check: a single set can set a PR in raw weight, estimated 1RM
// (weight scaled for reps via Epley, capped at 12 reps so high-rep sets can't inflate it),
// and/or single-set volume (weight × reps) — independently, and more than one can fire at once.
// store.prs holds weight bests (synced); prsE1rm/prsVolume are additive, local-only extensions.
function getSetPRTypes(store, exName, weight, reps, unit) {
  const w = parseFloat(weight), r = parseInt(reps);
  if (!exName || !w || !r || w <= 0 || r < 1) return { types: [], wLbs: 0, e1rmLbs: 0, volLbs: 0 };
  const wLbs = unit === "lbs" ? w : cvt(w, "kg", "lbs");
  const e1rmLbs = Math.round(epley1RM(wLbs, r, 12));
  const volLbs = wLbs * r;
  const types = [];
  if (wLbs > (store.prs?.[exName] || 0)) types.push("weight");
  if (e1rmLbs > (store.prsE1rm?.[exName] || 0)) types.push("e1rm");
  if (volLbs > (store.prsVolume?.[exName] || 0)) types.push("volume");
  return { types, wLbs, e1rmLbs, volLbs };
}


// Volume in the session's OWN unit (callers convert if they need to) — matches what every one of
// these call sites was already doing with raw weights.
function sessionVolume(sess) {
  return (sess?.exercises || []).reduce((a, ex) => a + workingDone(ex.sets)
    .reduce((b, s) => b + (parseFloat(s.weight) || 0) * (parseFloat(s.reps) || 0), 0), 0);
}


// The workout payload a feed / group post carries. ONE definition.
//
// This gets rebuilt in three places when a workout is edited (the local post, the server feed post,
// the server group posts) as three identical copy-pasted blocks — and all three had drifted from
// the ORIGINAL write at finish: they counted WARMUPS into `volume` and listed warmup sets on the
// card. So sharing a workout showed working-set volume, then editing it silently inflated the same
// card (up to 17.5% on real data — a leg day History reports as 8,440 read 9,920), and the feed
// disagreed with History about a session neither had meaningfully changed. Warmups also can't set
// a PR, so `isPR` reads the working sets too.
// `prNames` is the set of exercises that ACTUALLY hit a PR this session — the finish path knows
// this and it's the truthful answer. A rebuild long after the fact doesn't, so it falls back to
// comparing the top working set against the stored max. `store.prs` is held in LBS, so that
// comparison must convert first (`unit` = the SESSION's unit): comparing a raw 100kg top set
// against a 220lb stored max meant a kg user's card never showed a PR flag.
function postWorkoutPayload(exercises, prs, prNames, unit = "lbs") {
  const out = (exercises || []).filter(e => e.name).map(ex => {
    const done = workingDone(ex.sets);
    const maxLbs = cvt(Math.max(0, ...done.map(s => parseFloat(s.weight) || 0)), unit, "lbs");
    return {
      name: ex.name,
      isPR: prNames ? prNames.has(ex.name) : (maxLbs > 0 && maxLbs >= ((prs || {})[ex.name] || 0) * 0.99),
      sets: done.map(s => ({ w: parseFloat(s.weight) || 0, r: parseFloat(s.reps) || 0 })),
    };
  }).filter(ex => ex.sets.length > 0);   // an exercise with nothing logged isn't part of the card
  return { exercises: out, volume: Math.round(out.reduce((a, ex) => a + ex.sets.reduce((b, s) => b + s.w * s.r, 0), 0)) };
}


// Which exercises in a SAVED session stand at (or within 1% of) their stored PR. One rule, shared
// with the cards via postWorkoutPayload. History had two separate copies of this and both were
// wrong: they used a 0.98 threshold where the cards used 0.99, and one of them "converted" by
// scaling the stored LBS pr UP by LBS_PER_KG for a kg session — the wrong direction, so a kg
// lifter's top set had to beat ~2.2× its real PR and the badge could never appear.
// The TRUE best working set (in LBS) for each named exercise, recomputed from a history object.
// Pass the history you want it measured against — after an edit or a delete that means the
// post-change history, which the closure's `store` does not yet hold.
//
// This exists because nothing in the app could ever LOWER a PR. The edit path only raised
// store.prs, personal_records kept the old row, and loadUserData merges server ∪ history ∪
// in-memory taking the MAX of all three — so correcting a mistyped 315 down to 225, or deleting
// the session that held it, left 315 standing as a PR for a set that exists nowhere in the data,
// with no way to remove it. A returned 0 means the exercise has no working sets left at all.
function historyMaxPRs(history, names) {
  const want = new Set((names || []).filter(Boolean));
  const out = {};
  want.forEach(n => { out[n] = 0; });
  Object.values(history || {}).forEach(day => {
    Object.values(day || {}).forEach(w => {
      const wu = w?.unit || "lbs";
      (w?.exercises || []).forEach(ex => {
        if (!ex?.name || !want.has(ex.name)) return;
        (ex.sets || []).forEach(s => {
          const done = s?.done === true || (s?.done === undefined && parseFloat(s?.reps) > 0);
          if (!done || s?.type === "warmup") return;
          const wt = parseFloat(s.weight), r = parseInt(s.reps);
          if (!wt || wt <= 0 || !r || r < 1) return;
          const lbs = wu === "lbs" ? wt : cvt(wt, "kg", "lbs");
          if (lbs > out[ex.name]) out[ex.name] = lbs;
        });
      });
    });
  });
  return out;
}


function sessionPRNames(sess, prs) {
  const payload = postWorkoutPayload(sess?.exercises, prs, null, sess?.unit || "lbs");
  return new Set(payload.exercises.filter(e => e.isPR).map(e => e.name));
}


// Does this post's card come from this session? BY ID ONLY.
//
// This used to fall back to "same day name, within 24h" when a post had no client_id, and that
// guess cost us twice: editing the morning "Push Day A" PATCHED THE EVENING session's card with
// the morning's numbers (server-side, permanent), and wiring the delete through it could remove a
// different workout's card from the feed forever. Both were verified end to end.
//
// A card written before client_id existed therefore stops auto-syncing on edit and stops being
// deleted alongside its workout. That is the deliberate trade: a stale card the user can fix or
// delete by hand beats silently corrupting a DIFFERENT workout's card. Everything written since
// the duplicate-post fix carries the id, and every share path stamps it now.
//
// `sess` and `dateKey` are kept in the signature: callers read better passing what they mean, and
// they document what identifies a session if this ever needs a smarter rule.
function matchesSession(post, sid, sess, dateKey) {
  if (!post || post.type !== "workout" || !post.workout) return false;
  const pcid = post.clientId ?? post.client_id ?? null;
  return pcid != null && sid != null && String(pcid) === String(sid);
}


// How many sets an exercise represents. ONE definition — the program editor, the reorder list and
// startWorkout must all agree, and they didn't: the built-in templates and the day-preview "+ add"
// path write only `reps:"3×12-15"` and no `sets` field, so the editor's stepper showed the default
// 3 while the reorder list showed "0 sets" for the same exercise. Handles both shapes:
//   - a LIVE session exercise, where `sets` is the array of actual sets (0 is a real answer)
//   - a PROGRAM day exercise, where `sets` is a count, possibly absent — then fall back to the
//     leading "N×" in the reps string ("4×8-12" → 4), else 3, exactly as startWorkout does.
function progSetCount(ex) {
  if (Array.isArray(ex?.sets)) return ex.sets.length;
  const n = parseInt(ex?.sets);
  if (n > 0) return n;
  const lead = String(ex?.reps || "").match(/^\s*(\d+)\s*[×x*]/i);
  return lead ? parseInt(lead[1]) : 3;
}


// "4×8–12" for a PROGRAM exercise, whatever shape it stored its sets in.
// The set count comes from progSetCount, so a chip built with this and the day preview's
// "total sets" tile can never disagree — they are the same function. The rep half is `ex.reps`
// with any leading "N×" stripped, because that N IS the set count and would otherwise print
// twice ("4×4×8–12"). A day whose reps are a bare range ("8–12") stores no set count anywhere,
// so it reads progSetCount's default of 3 — the same number the tile totals.
function progSetsReps(ex) {
  const reps = String(ex?.reps || "").replace(/^\s*\d+\s*[×x*]\s*/i, "").trim() || "8–12";
  return `${progSetCount(ex)}×${reps}`;
}


// What you actually BEAT this session, lift by lift.
//
// The summary already showed total volume vs last time, but session tonnage is an abstract number
// an experienced lifter doesn't train for — they train the LIFT. This compares each exercise's top
// working set against the last time that exercise was trained and reports the concrete win:
// heavier, or the same weight for more reps. That's the sentence people screenshot.
//
// `topSet` ranks by weight first, then reps, so "225x3" beats "205x8" — matching how a lifter
// reads their own log. First-time exercises are reported separately rather than as a "win": there
// was nothing to beat.
// Two set shapes exist and they are NOT interchangeable: a LIVE session set is
// {weight,reps,done,type} (strings, needs the warmup/done filter), while getLastExerciseSession
// hands back already-filtered {w,r} number pairs. Mixing them up silently yields "no previous
// data" for every lift, which reads as "first time" on a lift you've done for years.
function bestPair(pairs) {
  return (pairs || []).reduce((best, p) => {
    if (!best) return p;
    if (p.w > best.w || (p.w === best.w && p.r > best.r)) return p;
    return best;
  }, null);
}

function topSet(sets) {
  return bestPair(workingDone(sets).map(sx => ({ w: parseFloat(sx.weight) || 0, r: parseFloat(sx.reps) || 0 })));
}

function sessionWins(session, store, sid, unit = "lbs") {
  const out = [];
  for (const ex of (session?.exercises || [])) {
    if (!ex.name) continue;
    const now = topSet(ex.sets);
    if (!now || (!now.w && !now.r)) continue;
    // getLastExerciseSession walks history newest-first; this session may already be saved into
    // history by the time the summary renders, so skip the row this finish just wrote.
    const prev = getLastExerciseSession(store, ex.name, sid);
    // CONVERT. getLastExerciseSession returns raw numbers in the PREVIOUS session's own unit and
    // hands back `.unit` precisely so the caller converts — suggestNextSet does. Comparing raw
    // across a unit switch invents wins and hides real ones: 100kg last time vs 225lbs today
    // reads as "+125", and 225lbs vs 102.5kg today reads as no win at all.
    const prevTop = prev                                 // already {w,r} pairs — see bestPair
      ? (p => p && { w: cvt(p.w, prev.unit || "lbs", unit), r: p.r })(bestPair(prev.sets))
      : null;
    if (!prevTop || (!prevTop.w && !prevTop.r)) { out.push({ name: ex.name, kind: "first", w: now.w, r: now.r }); continue; }
    if (now.w > prevTop.w) out.push({ name: ex.name, kind: "weight", w: now.w, r: now.r, by: Math.round((now.w - prevTop.w) * 10) / 10 });
    else if (now.w === prevTop.w && now.r > prevTop.r) out.push({ name: ex.name, kind: "reps", w: now.w, r: now.r, by: now.r - prevTop.r });
  }
  // Heavier beats more reps beats first-time; biggest jump first within a kind.
  const rank = { weight: 0, reps: 1, first: 2 };
  return out.sort((a, b) => (rank[a.kind] - rank[b.kind]) || ((b.by || 0) - (a.by || 0)));
}


// `skipSid` lets a caller ignore one session — the finish summary needs the PREVIOUS time an
// exercise was trained, and by the time it renders, this workout is already in history.
function getLastExerciseSession(store, exName, skipSid) {
  const dates = Object.keys(store.history||{}).sort().reverse();
  for (const d of dates) {
    const entries = Object.entries(store.history[d]||{});
    for (const [sessId, sess] of entries) {
      if (skipSid && sessId === skipSid) continue;
      const ex = sess.exercises?.find(e => e.name === exName);
      if (!ex) continue;
      // Filter to WORKING sets only — exclude warmups (their light weight + low reps would
      // otherwise mask real progression and make the engine recommend "same weight, push reps"
      // even when the user actually hit the top of their range on their working sets).
      const doneSets = (ex.sets||[]).filter(s =>
        s.type !== "warmup" &&
        (s.done === true || (s.done === undefined && parseFloat(s.reps) > 0))
      );
      if (doneSets.length > 0) {
        // Days-since needs LOCAL date math (the key is YYYY-MM-DD; constructing a Date
        // from that string parses as UTC midnight, which shifts the day in non-zero
        // timezones and can yield off-by-one daysSince).
        const todayKey = dKey();
        const todayMs = new Date(todayKey + "T12:00:00").getTime();
        const dMs = new Date(d + "T12:00:00").getTime();
        return {
          date: d,
          unit: sess.unit || "lbs",
          sets: doneSets.map(s => ({ w: parseFloat(s.weight)||0, r: parseFloat(s.reps)||0 })),
          daysSince: Math.max(0, Math.floor((todayMs - dMs) / 86400000)),
        };
      }
    }
  }
  return null;
}


function parseRepRange(reps) {
  if (!reps) return null;
  let s = String(reps).replace(/\s/g,"");
  // Program days store reps as "4×8-12" / "3x5" — a SET COUNT then the rep target. This used to
  // fall through to `null`, so double progression never ran for anything started from a program:
  // suggestNextSet silently dropped to its no-range path and could only ever offer "+1 rep" or a
  // bump at 10+ reps. Strip the leading count (only when a × / x separator makes it unambiguous,
  // so a genuine "3-5" range is never mistaken for a set count).
  s = s.replace(/^\d+[×x*]/i, "");
  // Trailing words like "8-12 reps" or "5 each side".
  s = s.replace(/[a-z].*$/i, "");
  // Range with dash or en-dash
  const m = s.match(/^(\d+)[–-](\d+)$/);
  if (m) {
    const low = parseInt(m[1]), high = parseInt(m[2]);
    // A reversed range ("12-8") would make every comparison against `high` nonsense.
    return { low: Math.min(low, high), high: Math.max(low, high) };
  }
  // Single number
  const n = parseInt(s);
  if (!isNaN(n) && /^\d+$/.test(s)) return { low: n, high: n };
  return null;
}


// Returns the last `limit` working-set sessions for an exercise, newest first.
// Each entry: { date, unit, sets:[{w,r}], daysSince, topWeight, topReps, volume }.
function getExerciseSessions(store, exName, limit = 5) {
  const dates = Object.keys(store.history || {}).sort().reverse();
  const out = [];
  const todayMs = new Date(dKey() + "T12:00:00").getTime();
  for (const d of dates) {
    const sessions = Object.values(store.history[d] || {});
    for (const sess of sessions) {
      const ex = sess.exercises?.find(e => e.name === exName);
      if (!ex) continue;
      const doneSets = (ex.sets || []).filter(s =>
        s.type !== "warmup" &&
        (s.done === true || (s.done === undefined && parseFloat(s.reps) > 0))
      );
      if (!doneSets.length) continue;
      const sets = doneSets.map(s => ({ w: parseFloat(s.weight) || 0, r: parseFloat(s.reps) || 0 }));
      const topWeight = Math.max(...sets.map(s => s.w));
      const topReps = Math.max(...sets.filter(s => s.w === topWeight).map(s => s.r), 0);
      const volume = sets.reduce((a, s) => a + s.w * s.r, 0);
      const dMs = new Date(d + "T12:00:00").getTime();
      out.push({
        date: d, unit: sess.unit || "lbs", sets,
        daysSince: Math.max(0, Math.floor((todayMs - dMs) / 86400000)),
        topWeight, topReps, volume,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}


// HAS THIS EXERCISE MOVED FORWARD AT ALL? — the one question every stall test has to answer, and
// the one the old ones kept getting wrong because they only ever looked at the TOP set.
//
// `topReps` is the reps of the heaviest set, so a lifter who opens 40x12 every time and adds his
// progress further down the run — 40x12, 40x12, 40x10, 40x9 becoming 40x12, 40x12, 40x10, 40x10 —
// has a topReps series that is dead flat while every other set climbs. Measured on Mo's real
// Lateral Raises history (Jul 20 / Jul 30 / Aug 3): top set 12/12/12, total volume 1640/1720/1760.
// The banner called that a plateau and told him to drop 5 lbs on a session that was his best yet.
//
// So ask four questions, not one, and count ANY of them as progress: more weight, more reps on the
// top set, more total reps, more volume. Volume and total reps are what see the back half of a run.
//
// COMPARE THE BEST OF THE LAST TWO AGAINST THE BEST OF THE REST, not the newest against everything.
// One short session — three sets instead of four because the gym was closing — drops volume through
// the floor without meaning anything about strength, and a newest-vs-best test reads that as a
// stall on its own. Using the better of the two most recent absorbs a single off day. It also means
// a lifter who peaked one session ago and is now sliding gets a pass for one more session; that is
// the deliberate direction to err, because the cost of a missed stall is silence and the cost of a
// false one is being told to take weight off a bar you just set a record on.
function exerciseProgressed(sessions, unit) {
  if (sessions.length < 2) return true;   // not enough to call anything a plateau
  const series = sessions.map(s => ({
    // Volume and reps are compared across sessions, so both sides must be in ONE unit — a history
    // logged in kg read by an lbs user would otherwise invent progress out of the conversion.
    w: cvt(s.topWeight, s.unit, unit),
    topReps: s.topReps || 0,
    totalReps: (s.sets || []).reduce((a, x) => a + (x.r || 0), 0),
    vol: cvt(s.volume, s.unit, unit),
  }));
  const recent = series.slice(0, 2), older = series.slice(2);
  if (!older.length) return true;
  const best = (arr, k) => Math.max(...arr.map(x => x[k]));
  return ["w", "topReps", "totalReps", "vol"].some(k => best(recent, k) > best(older, k) + 1e-6);
}


// Deload / stall detection — THE one verdict for an exercise. The plateau banner and every set's
// progression chip both read it, so they cannot contradict each other.
//
// They used to be two separate tests and they disagreed constantly. The banner asked whether the
// top set was flat; each chip asked whether ITS OWN set index had gained reps since three sessions
// ago. On the same screen that produced this note, set 1 (12/12/12) said "deload to 35" while set 2
// (12/12/11) said "40x13" directly beneath it — opposite advice about the same exercise, one row
// apart, because the two sets had different rep histories. A stall is a property of the LIFT, not
// of a row in a table.
//
// `repsTarget` is optional. Pass it wherever the verdict sits next to per-set advice: without a
// target "stuck" has no meaning (holding 100x12 on an accessory for a month is a deliberate steady
// load, not a failure), and if the lifter is already at or past the top of the range then the
// honest advice is to ADD weight — which is exactly what the chips say, and the banner used to
// contradict. The AI coach passes nothing, deliberately: it writes prose about the big compounds
// with no chip beside it to disagree with, and a flat bench for four sessions is a stall whatever
// a program has written in its reps column.
function detectDeloadNeeded(store, exName, unit, repsTarget = null) {
  // Require 4 flat sessions (not 3) so the plateau banner only fires on a genuine, sustained
  // stall — fewer false positives, less nagging.
  const sessions = getExerciseSessions(store, exName, 6);
  if (sessions.length < 4) return { stalled: false };
  const norm = sessions.map(s => ({
    wU: cvt(s.topWeight, s.unit, unit),
    // `Math.max(1, …)`: a set marked done with a blank reps field gives topReps 0, and epley1RM
    // rightly refuses to estimate from that — but a 0 dropped into this series reads as a
    // catastrophic strength LOSS and can fire a false "deload" banner telling the lifter to drop
    // weight they haven't actually lost. Treat it as the single it effectively is (the weight
    // itself), which is what this line computed before the estimator was consolidated.
    e1rm: epley1RM(cvt(s.topWeight, s.unit, unit), Math.max(1, s.topReps || 0), 12),
  }));
  const recentRaw = sessions.slice(0, 4);
  const recent = norm.slice(0, 4);
  const topWeights = recent.map(s => s.wU);
  const maxTop = Math.max(...topWeights);
  const minTop = Math.min(...topWeights);
  const weightFlat = (maxTop - minTop) < (unit === "lbs" ? 5 : 2.5);
  const e1rms = recent.map(s => s.e1rm);
  const e1rmNotProgressing = e1rms[0] <= Math.max(...e1rms.slice(1)) + 0.01;
  // Progress anywhere in the exercise — not just on the top set — means this is not a plateau.
  const progressed = exerciseProgressed(recentRaw, unit);
  // At or past the top of the target range at a flat weight is the textbook cue to ADD load. That
  // is what the chips advise, so the banner must not be telling him to take load off.
  const range = repsTarget ? parseRepRange(repsTarget) : null;
  // "AT the top of the range" is a question about the LAST session, not about the window. The
  // first cut took `Math.max` over all four, so one good session four weeks ago suppressed the
  // banner for a lifter who had since fallen back and stuck: range 5-8, a session at 185x8 then
  // three at 185x5, and the plateau went unreported because of the 8 he could no longer do.
  // Reps sliding backwards at a flat weight is a stall in the plainest sense.
  const earnedTheJump = !!range && range.high > 0 && (recentRaw[0]?.topReps || 0) >= range.high;
  if (weightFlat && !progressed && e1rmNotProgressing && !earnedTheJump) {
    const dl = unit === "lbs" ? Math.round((maxTop * 0.9) / 5) * 5 : Math.round((maxTop * 0.9) / 2.5) * 2.5;
    return {
      stalled: true,
      sessions: recent.length,
      topWeight: maxTop,
      deloadWeight: dl,
      reason: `Stalled at ${maxTop} ${unit} for ${recent.length} sessions`,
      suggestion: `Try a deload: drop to ~${dl} ${unit} and rebuild with clean reps`,
    };
  }
  return { stalled: false };
}


// Progressive overload — double progression model
// Returns { type, weight, reps, note, deltaWeight, deltaReps, reason }
// The smallest jump a real gym can make. Everything else snaps to a multiple of this.
function plateStep(unit) { return unit === "lbs" ? 5 : 2.5; }


// How much to add, scaled to the load. A flat +5 lb is ~1.5% on a 315 deadlift (too timid, you
// stall on the calendar not the bar) and 20% on a 25 lb lateral raise (impossible to sustain).
// ~2.5% per session is the standard week-to-week jump; snap it to a real plate and clamp so the
// suggestion never becomes a 4-plate leap on a heavy lift.
function loadIncrement(weight, unit) {
  const step = plateStep(unit);
  const snapped = Math.round((weight * 0.025) / step) * step;
  return Math.max(step, Math.min(step * 4, snapped));
}


// The last N sessions of one exercise, newest first, reduced to the set at `setIndex` (falling
// back to that session's last working set). This is what makes the engine trend-aware instead of
// judging everything off a single previous session — without it, three failed attempts at the same
// weight each produce the same cheerful "+5" and the user never gets told to back off.
function getExerciseTrend(store, exName, unit, setIndex = 0, n = 4) {
  const out = [];
  const dates = Object.keys(store.history || {}).sort().reverse();
  const todayMs = new Date(dKey() + "T12:00:00").getTime();
  for (const d of dates) {
    if (out.length >= n) break;
    for (const sess of Object.values(store.history[d] || {})) {
      const ex = sess.exercises?.find(e => e.name === exName);
      if (!ex) continue;
      const working = (ex.sets || []).filter(s => s.type !== "warmup" &&
        (s.done === true || (s.done === undefined && parseFloat(s.reps) > 0)));
      if (!working.length) continue;
      const s = working[setIndex] || working[working.length - 1];
      const w = cvt(parseFloat(s.weight) || 0, sess.unit || "lbs", unit);
      if (!w) continue;
      const rpe = parseFloat(s.rpe);
      out.push({ date: d, w, r: parseFloat(s.reps) || 0, rpe: (!isNaN(rpe) && rpe > 0) ? rpe : null,
        daysSince: Math.max(0, Math.floor((todayMs - new Date(d + "T12:00:00").getTime()) / 86400000)) });
      break;
    }
  }
  return out;
}

function suggestNextSet(store, exName, repsTarget, unit, setIndex = 0) {
  const last = getLastExerciseSession(store, exName);
  if (!last) return null;

  const range = parseRepRange(repsTarget);
  const lastInUserUnit = last.sets.map(s => ({ w: cvt(s.w, last.unit, unit), r: s.r }));
  const setMatch = lastInUserUnit[setIndex] || lastInUserUnit[lastInUserUnit.length - 1];
  if (!setMatch || !setMatch.w) return null;

  const lastWeight = setMatch.w;
  const lastReps = setMatch.r;
  const step = plateStep(unit);
  const inc = loadIncrement(lastWeight, unit);
  const trend = getExerciseTrend(store, exName, unit, setIndex, 4);
  const lastRpe = trend[0]?.rpe ?? null;
  // RPE 9.5+ is a grinder — at or next to failure. Adding load on top of that is how people get
  // hurt and how a program stalls; consolidate instead. RPE <=6.5 means there was plenty left.
  const grinder = lastRpe != null && lastRpe >= 9.5;
  const easy = lastRpe != null && lastRpe <= 6.5;
  // On light isolation work the smallest plate is a huge relative jump (5 lb on a 20 lb raise is
  // 25%). Earn it with reps first, and only jump once you're clear of the top of the range.
  const jumpIsBig = lastWeight > 0 && (step / lastWeight) > 0.10;

  // Deload if it's been 14+ days
  if (last.daysSince >= 14) {
    const dl = unit === "lbs" ? Math.round((lastWeight * 0.9) / 5) * 5 : Math.round((lastWeight * 0.9) / 2.5) * 2.5;
    return {
      type: "deload",
      weight: dl,
      reps: range ? range.low : lastReps,
      note: "Deload (off " + last.daysSince + "d)",
      deltaWeight: dl - lastWeight,
      reason: "Back after a break — start lighter",
    };
  }

  // STALL — ONE verdict for the whole exercise, shared with the plateau banner.
  //
  // This used to run its own test per SET INDEX: "has this row gained reps since three sessions
  // ago". Two rows of the same exercise therefore reached opposite conclusions routinely — set 1
  // steady at 12 reps said "deload to 35" while set 2, which had gone 11 → 12, said "40x13" in the
  // row directly below. Whether you have plateaued is a fact about the lift; asking it once and
  // handing every row the same answer is the only way the screen can be coherent.
  //
  // Still gated on `range` for the reason the per-set version was: without a target there is
  // nothing to be stuck short of. `detectDeloadNeeded` re-checks the exercise-wide progress
  // signals (total reps and volume, not just the top set), so a lifter adding reps anywhere in the
  // run is never told to back off.
  if (range && detectDeloadNeeded(store, exName, unit, repsTarget).stalled) {
    // Scale from THIS set's own weight rather than the exercise's top weight — on a descending or
    // drop-set arrangement a single flat number for every row would be a different workout, not a
    // deload of the one being done.
    const dl = Math.max(step, Math.round((lastWeight * 0.9) / step) * step);
    return {
      type: "deload",
      weight: dl,
      reps: range.high,
      note: `−${+(lastWeight - dl).toFixed(1)} ${unit}`,
      deltaWeight: dl - lastWeight,
      reason: `Stuck at ${lastWeight} ${unit} for 4 sessions — drop 10% and build back`,
    };
  }

  // Double progression — judged PER-SET against the matching set from last session.
  // Old logic checked `every set hit the range top`, which meant a fatigued last set
  // (e.g. 5 reps on a 6-8 range) blocked the suggestion to add weight on set 1 — even
  // when set 1 cleanly hit 8 last time. Real progression is per-set.
  if (range) {
    const setHitTop = lastReps >= range.high;
    // Hit the top but it was a grinder — bank the rep quality before adding load.
    if (setHitTop && grinder) {
      return {
        type: "match",
        weight: lastWeight,
        reps: lastReps,
        note: "repeat",
        deltaReps: 0,
        reason: `Last one was an RPE ${lastRpe} grind — repeat it before adding weight`,
      };
    }
    // Light isolation work: keep earning reps until you're clearly past the top of the range,
    // because the smallest jump available is a >10% increase in load.
    if (setHitTop && jumpIsBig && lastReps < range.high + 2) {
      const target = Math.min(range.high + 2, lastReps + 1);
      return {
        type: "reps",
        weight: lastWeight,
        reps: target,
        note: "same weight",
        deltaReps: target - lastReps,
        reason: `+${step} ${unit} is a big jump here — get ${target} first`,
      };
    }
    if (setHitTop) {
      // The matching set hit the top of the range last time → add weight.
      // If they went way past the top (e.g. 15 reps on a 5-8 range), bump weight
      // but keep reps realistic instead of dropping all the way to range.low.
      const overshoot = lastReps - range.high;
      if (overshoot >= 4) {
        return {
          type: "weight",
          weight: lastWeight + inc,
          reps: Math.max(range.high, lastReps - 2),
          note: `+${inc} ${unit}`,
          deltaWeight: inc,
          reason: `Way above target reps — add ${inc} ${unit}, keep reps high`,
        };
      }
      // Plenty left in the tank — take a double jump rather than creeping.
      const bump = easy ? Math.min(step * 4, inc * 2) : inc;
      return {
        type: "weight",
        weight: lastWeight + bump,
        reps: range.low,
        note: `+${bump} ${unit}`,
        deltaWeight: bump,
        reason: easy
          ? `Hit ${range.high} at RPE ${lastRpe} — add ${bump} ${unit}`
          : `Hit ${range.high} on this set — add ${bump} ${unit}`,
      };
    } else {
      // Same weight, push for more reps — but never suggest a jump of more than 2 reps
      // over last session ("did 8 → do 14" isn't progression advice). If the program's
      // range starts far above what they did, build toward it gradually.
      // A 0-rep "last session" carries no information — getLastExerciseSession accepts a set
      // ticked done with a blank reps box, and `parseFloat("") || 0` makes it 0. The `lastReps + 2`
      // cap then wins the min() and the app advises "Build toward 8 — aim for 2". Same family as
      // the sim_deload0 fix, which guarded detectDeloadNeeded and left this path alone: when
      // there's no real rep count, start at the bottom of the range instead of two above nothing.
      const target = lastReps > 0
        ? Math.min(range.high, Math.max(range.low, lastReps + 1), lastReps + 2)
        : range.low;
      return {
        type: "reps",
        weight: lastWeight,
        reps: target,
        note: `same weight`,
        deltaReps: target - lastReps,
        reason: target > lastReps
          ? (target < range.low ? `Build toward ${range.low} — aim for ${target}` : `Push for ${target} reps`)
          : `Match last session`,
      };
    }
  }

  // No range: simple bump on +2 reps — unless it was a grind, or the only available jump is
  // disproportionate to the load (same reasoning as the ranged path above).
  if (lastReps >= 10 && !grinder && !jumpIsBig) {
    return {
      type: "weight",
      weight: lastWeight + inc,
      reps: Math.max(lastReps - 2, 5),
      note: `+${inc} ${unit}`,
      deltaWeight: inc,
      reason: `Strong last time — add ${inc} ${unit}`,
    };
  }
  if (lastReps >= 10 && grinder) {
    return {
      type: "match",
      weight: lastWeight,
      reps: lastReps,
      note: "repeat",
      deltaReps: 0,
      reason: `RPE ${lastRpe} last time — repeat before adding weight`,
    };
  }
  return {
    type: "match",
    weight: lastWeight,
    reps: lastReps + 1,
    note: `+1 rep`,
    deltaReps: 1,
    reason: `Push for one more rep`,
  };
}


// ACUTE : CHRONIC WORKLOAD RATIO — Garmin's "training load", and the best-established
// injury-risk signal in sports science. It compares what you've done THIS week against what your
// body is conditioned for (the 28-day average). A sharp spike is what hurts people, not hard
// training per se.
//
// Load is session volume normalised to one unit. Absolute magnitude doesn't matter — this is a
// ratio of a lifter against their own history, so bodyweight/exercise selection cancel out.
//
// Returns null rather than a misleading number when there isn't enough history to mean anything:
// the chronic average is the denominator, and four sessions spread over ten days is not a
// "28-day average". Bands are the standard ones (0.8 / 1.3 / 1.5).
// Guards. These exist to make the function REFUSE rather than mislead, and the first version of
// them was defeated by a single old row: `oldestMs` was taken over ALL history while the sums came
// only from the 28-day window, so six sessions on ONE day plus one row from 400 days ago passed
// every check and returned "4.00 — Spike — this is where injuries happen". A confident red injury
// warning computed from one training day is the worst failure this screen can have, and anyone
// with imported history who comes back from a break hits it. So the checks now all look INSIDE
// the window, and the chronic baseline must have older days in it to be a baseline at all.
const ACWR_MIN_SESSIONS = 6;      // ...in the 28-day window

const ACWR_MIN_DAYS = 4;          // ...spread over at least this many distinct days

const ACWR_MIN_OLDER_DAYS = 2;    // ...at least this many of them OUTSIDE the acute week

function trainingLoadRatio(store, unit = "lbs") {
  const hist = store?.history || {};
  // Bucket by CALENDAR DAY, not by elapsed milliseconds. Anchoring both ends at local noon makes
  // today = 0 and yesterday = 1 whatever the clock says; the previous version compared a noon
  // timestamp against `Date.now()`, so before local noon today's own session had a NEGATIVE age
  // and was silently dropped by the future-date guard — the ratio ignored the morning workout that
  // most changes it, then jumped a band at 12:00 with no new data. Noon anchoring also absorbs DST
  // (a 23- or 25-hour day still rounds to one day apart).
  const nd = new Date();
  const todayNoon = new Date(nd.getFullYear(), nd.getMonth(), nd.getDate(), 12).getTime();
  const dayMs = 864e5;
  let acute = 0, chronic = 0, sessions28 = 0;
  const daysInWindow = new Set(), olderDays = new Set();
  for (const [dk, day] of Object.entries(hist)) {
    const ts = new Date(dk + "T12:00:00").getTime();
    if (isNaN(ts)) continue;
    const ageDays = Math.round((todayNoon - ts) / dayMs);
    if (ageDays < 0 || ageDays > 28) continue;      // future-dated rows and anything older
    let dayHadVolume = false;
    for (const sess of Object.values(day || {})) {
      const v = cvt(sessionVolume(sess), sess.unit || "lbs", unit);
      if (v <= 0) continue;
      chronic += v; sessions28++; dayHadVolume = true;
      if (ageDays <= 7) acute += v;
    }
    if (dayHadVolume) { daysInWindow.add(ageDays); if (ageDays > 7) olderDays.add(ageDays); }
  }
  if (sessions28 < ACWR_MIN_SESSIONS || daysInWindow.size < ACWR_MIN_DAYS
      || olderDays.size < ACWR_MIN_OLDER_DAYS || chronic <= 0) return null;
  const acutePerDay = acute / 7;
  const chronicPerDay = chronic / 28;
  if (chronicPerDay <= 0) return null;
  const ratio = Math.round((acutePerDay / chronicPerDay) * 100) / 100;
  const band =
    ratio < 0.8 ? { status: "low",     label: "Detraining",  note: "Well under your usual load — an easy week is fine, but a longer dip loses fitness." } :
    ratio <= 1.3 ? { status: "optimal", label: "Sweet spot",  note: "This week matches what your body is conditioned for." } :
    ratio <= 1.5 ? { status: "caution", label: "Ramping up",  note: "Noticeably above your usual — fine briefly, worth easing if it holds." } :
                   { status: "high",    label: "Spike",       note: "Well above what you're conditioned for. This is where injuries happen." };
  return { ratio, acutePerDay: Math.round(acutePerDay), chronicPerDay: Math.round(chronicPerDay), sessions28, ...band };
}


export { ACWR_MIN_DAYS, ACWR_MIN_OLDER_DAYS, ACWR_MIN_SESSIONS, bestPair, exerciseProgressed, getExerciseSessions, getExerciseTrend, loadIncrement, parseRepRange, plateStep, topSet, calc1RM, detectDeloadNeeded, epley1RM, getLastExerciseSession, getSetPRTypes, historyMaxPRs, isOneSidedBarbell, matchesSession, postWorkoutPayload, progSetCount, progSetsReps, sessionPRNames, sessionVolume, sessionWins, suggestNextSet, trainingLoadRatio };
