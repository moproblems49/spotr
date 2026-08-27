// THE HEALTH / RECOVERY ENGINE — recovery scoring, Body Battery, sleep, HRV and activity.
//
// Extracted from App.jsx verbatim; the maths is unchanged. This is the most heavily simulated code
// in the repo (sim_recovery*, sim_bb*, sim_sleep*, sim_hrv*, sim_wakeanchor, sim_stepscale, …) and
// the comments below are the record of what each rule is defending against — several of them cost
// a real bug to learn. Read them before changing a constant.
//
// Everything here is PURE and device-free: no React, no HealthKit plugin calls. The device-side
// readers (readRecovery, readTodayActivity, …) stay in App.jsx and hand their samples in, which is
// what makes readRecoveryFrom(H, now) testable at all.
import { devWarn, dateKeyOf, dateFromKey, workingDone } from "./core.js";

// Plain-language verdict for a 0..1 recovery score. The scale is intentionally conservative
// (a solid day lands ~0.70–0.85; 0.90+ means well above your own baseline), so a low-80s reading
// is "Strong", not mediocre — the label exists to communicate that.
const READY_TO_PUSH = 0.78;   // also the ceiling a thin read is held under — see recoveryScoreFrom

function recoveryVerdict(t) {
  if (t >= READY_TO_PUSH) return "Ready to push";
  if (t >= 0.62) return "Ready";
  if (t >= 0.45) return "Moderate";
  return "Take it easy";
}


// What ONE session costs the battery. Used by the headline number AND the 24h curve — they had
// drifted (the curve still charged the old 6 + 0.9/set after the headline moved to 4 + 0.6/set),
// so the chart dived to ~10 while the number beside it read 23. Same class as every other
// duplicated formula in this file: one definition, both callers.
function sessionDrain(sets, avgRpe) {
  return Math.max(4, Math.min(24, Math.round(4 + sets * 0.6 + (avgRpe ? (avgRpe - 7) * 2 : 0))));
}


// Garmin-style "hours until recovered" for the most recent finished workout. Reuses sessionDrain
// (the one workout-drain formula, already shared by the Body Battery headline and its 24h curve)
// rather than inventing a second training-stress number — see the "one workout-drain formula"
// convention. Null when there's no finished session to base an estimate on. Exported for the sim
// harness.
// NO UI CALLER as of Aug 27. This shipped as a second line under the readiness pill and was
// removed: a workout-scoped number sitting in the middle of a day-scoped card read as random,
// and sharing the word "recover" with the pill above it made the pair look self-contradictory.
// Kept (and still covered by sim_recoverytime) because the maths is sound and this belongs with
// the WORKOUT surface if it comes back — not re-parked on the readiness card.
function recoveryTimeHours(store, rec, now) {
  // Newest date-key first: once a day HAS a session, no earlier day can beat it, so this can
  // break out early instead of scanning the whole history (same pattern as SortableDayCard's
  // lastDone / getLastExerciseSession, applied here for the same reason).
  const dates = Object.keys(store.history || {}).sort().reverse();
  let best = null;
  for (const dk of dates) {
    for (const sess of Object.values(store.history[dk] || {})) {
      const endMs = sess.finishedAt || dateFromKey(dk).getTime();
      if (endMs > now.getTime()) continue; // guard a bad future-dated row, same as the drain curve
      if (!best || endMs > best.endMs) best = { sess, endMs };
    }
    if (best) break;
  }
  if (!best) return null;
  let sets = 0, rpeSum = 0, rpeN = 0;
  for (const ex of (best.sess.exercises || [])) {
    for (const s of workingDone(ex.sets)) {
      sets++; const r = parseFloat(s.rpe); if (!isNaN(r) && r > 0) { rpeSum += r; rpeN++; }
    }
  }
  if (!sets) return null;
  const avgRpe = rpeN ? rpeSum / rpeN : null;
  const drain = sessionDrain(sets, avgRpe); // 4-24

  // Map drain onto a base recovery WINDOW in hours: an easy accessory session (drain 4) is
  // basically done by the next morning (~8h); a maximal session (drain 24) can carry real fatigue
  // for a couple of days (~64h). Linear between those anchors — no exercise-science claim beyond
  // "harder session, longer window," tracking the same training-stress number Body Battery
  // already uses rather than a second, disconnected one.
  const baseHours = 8 + (drain - 4) * 2.8;

  // Scale by how recovered you already are: well-recovered (recoveryScore near 1) needs less of
  // the base window than under-recovered (near 0) — 0.5x at a perfect score, 1.5x at zero. Only
  // scale when a score actually exists; the unscaled base is still a reasonable generic estimate,
  // closer to the truth than showing nothing.
  const scale = (rec && typeof rec.recoveryScore === "number") ? 1.5 - rec.recoveryScore : 1;
  const totalHours = baseHours * scale;

  const elapsedHours = (now.getTime() - best.endMs) / 36e5;
  return Math.max(0, Math.round(totalHours - elapsedHours));
}


// DAYTIME RECOVERY. Garmin's battery climbs back during calm periods because a watch feeds it a
// continuous heart-rate stream. We don't have that — but HealthKit's per-hour step/energy buckets
// are enough to tell a still afternoon from a walk, which is the distinction that matters.
//
// Only counted when the buckets were synced TODAY: without fresh data we cannot tell "resting"
// from "no data", and assuming rest would hand a free recharge to everyone without a watch. A
// missing bucket for a past hour DOES count as still (a quiet hour records nothing), but only once
// some other bucket today has data — that proves the read actually returned something.
const REST_STEPS_PER_H = 250;   // sedentary; a walk to the kitchen won't break this

const REST_KCAL_PER_H = 40;     // active energy, above resting burn

// "You were demonstrably up and moving in this hour." Used by BOTH sleep gates — the bedtime one
// that pushes an estimated bedtime later, and the wake one that pulls an estimated wake earlier.
// It is one constant on purpose: two copies of the same threshold drift, and these two gates have
// to agree about what counts as awake or they will disagree about where the day starts.
const AWAKE_STEPS_PER_H = 120;

const REST_RECHARGE_PER_H = 2;  // net ≈ +1.1/h once the 0.9/h awake drain is netted off

function restfulHourRecharge(store, hourStartMs, todayKey) {
  if (store?.activityHourlyDate !== todayKey) return 0;
  const hourly = store.activityHourly;
  if (!hourly) return 0;
  const anyData = Object.values(hourly).some(a => a && (a.steps || a.kcal));
  if (!anyData) return 0;
  const d = new Date(hourStartMs);
  const k = dateKeyOf(d);
  if (k !== todayKey) return 0;   // buckets are hour-of-day for TODAY only
  const a = hourly[d.getHours()];
  const steps = a?.steps || 0, kcal = a?.kcal || 0;
  if (steps > REST_STEPS_PER_H || kcal > REST_KCAL_PER_H) return 0;
  return REST_RECHARGE_PER_H;
}


// A HARD CEILING MAKES THE TOP OF THE SCALE FLAT, AND A FLAT SCALE STOPS SAYING ANYTHING.
// Activity drain was `Math.min(18, raw)`, and raw hits 18 at roughly 14k steps plus 880 kcal —
// a long hike or a busy shift on your feet, not an outlier. Measured on the shipped code, every
// one of these reported the SAME Body Battery: 14.6k steps, 22k, 36.6k, 58.5k, 87.8k. A moderate
// day and an ultramarathon were indistinguishable, and the chart agreed with the number only
// because both had adopted the same flat model.
//
// So: linear up to the knee, then compressed but still RISING, asymptotic to `max`. Diminishing
// returns are the honest shape here — the tenth hour on your feet does cost less than the first —
// but they should be diminishing, not zero.
//   raw   9 -> 9.0     (an ordinary day is untouched; the knee is above where most days land)
//   raw  18 -> 17.0     ~14.6k steps
//   raw  27 -> 22.3     ~22k steps
//   raw  45 -> 26.6     ~36.6k steps
//   raw 107 -> 29.8     ~88k steps
// Both computeBodyBattery and computeBodyBatteryTimeline go through this — the whole point of
// the previous round of fixes was that the headline and the chart must share one model.
// Linear to `knee`, then compressed but still RISING, asymptotic to `max`. Used for BOTH daily
// drains, because a hard ceiling makes the top of a scale flat and a flat scale stops saying
// anything — which is the same complaint twice, once about steps and once about training.
function softCap(raw, knee, max) {
  if (!(raw > knee)) return Math.max(0, raw || 0);
  const span = max - knee;
  return knee + span * (1 - Math.exp(-(raw - knee) / span));
}

// PER HOUR, the same shape as the daily cap. The curve used a hard `Math.min(6, …)`, which is a
// flat ceiling on an hour exactly as `min(18, …)` was on a day: an athlete doing 12k steps and
// 600 kcal in one hour raws out at 13.3 and was recorded as 6 — the same as a brisk 45-minute
// walk. The knee sits at 4 (about 7,200 steps in an hour), so an ordinary hour is untouched and
// only a genuinely hard one compresses, toward 9 rather than stopping at 6.
const HOUR_KNEE = 4, HOUR_MAX = 9;

const softCapHour = (raw) => softCap(raw, HOUR_KNEE, HOUR_MAX);


// THE ONE ACTIVITY MODEL, shared by the headline and the 24h curve.
//
// They used to compute this differently and that is why they diverged: the curve summed per-hour
// buckets (clamped at 6 each) while the headline worked from whole-day totals with no per-hour
// limit at all, so on a hard day the headline charged 28 where the curve could only deliver ~21
// and the endpoint pin absorbed the difference in the last few pixels. The old hard `min(18, …)`
// hid it because both sides saturated on exactly 18; a soft cap never saturates, so it surfaced.
//
// Targeting `bb.activityDrain` from the curve WAS TRIED and made it worse — it forces 7/hour
// through a 6/hour model, so the line falls further and the pin corrects more (3 points -> 11 on
// the same fixture). The fix has to be a shared MODEL, not a shared answer.
//
// STEPS BEFORE THE ESTIMATED WAKE PROVE YOU WERE ALREADY UP — the mirror of the bedtime gate in
// computeBodyBatteryTimeline. The 07:00 anchor is a GUESS, used whenever no watch recorded a
// sleep window (every phone-only user, every night). Both models start their day there, so an
// early riser's 05:30 gym session and a night-shift worker's entire shift fell outside the day
// they belonged to: the headline charged nothing for them and the curve never drew them.
//
// Same asymmetry the bedtime gate states: steps can prove you were AWAKE, never that you were
// asleep. So this only ever moves the anchor EARLIER, only within today, and only when the anchor
// is an estimate in the first place — a real HealthKit window is measured, and beats a guess.
// THE ONE TEST FOR "IS THIS SLEEP WINDOW TRUSTWORTHY". Both Body Battery models decide where your
// day starts, and they used to decide it DIFFERENTLY: the curve ran the full battery of checks
// below, while the headline accepted any `sleepEnd` inside 20h — no start, no ordering, no span
// sanity. So a corrupt window sent them to different anchors and they reported different days.
// Measured on the same store (heavy activity 08:00-10:00, read 20:30):
//
//   window 23:00 -> 11:00 claiming 7.5h sleep   headline 77, chart 56   gap 21
//   sleepEnd present with no sleepStart          headline 77, chart 56   gap 21
//   sleepEnd BEFORE sleepStart                   headline 62, chart 56   gap  6
//
// The headline was the flattering side every time: it believed a late wake, so it charged fewer
// awake hours AND excluded the morning's activity from its window. Trusting it is the failure —
// the checks are right, only one of the two was running them.
//
// Defence in depth for a bad window already written to the store: before pickSleepBlock existed,
// an evening nap merged with last night could persist as "7am -> 8pm", and it would keep driving
// both models until the next HealthKit sync overwrote it. Length alone can't catch that (13h is
// not obviously absurd, and night-shift sleep is legitimately a daytime block) — but a MERGED
// window is always far longer than the sleep it claims to contain, so cross-check the two. A real
// night is its sleep hours plus a little tossing and turning; 13h of window around 7.5h of sleep
// is two blocks stitched together.
// A SINGLE SLEEP EPISODE. `pickSleepBlock` already splits on any gap over an hour, so a window it
// writes today is one episode by construction — this is defence in depth against a window ALREADY
// PERSISTED from before that existed (the "bed 7am, up 8pm" merge). 12h, because almost nobody
// sleeps in one unbroken stretch longer than that, and a window that long has a wake time we
// cannot trust. Deliberately NOT MAX_SLEEP_SPAN_H (16), which pickSleepBlock uses for a different
// job — sanity-filtering raw blocks, where being generous costs nothing.
const MAX_ANCHOR_SPAN_H = 12;

// How much longer than the sleep it contains a window may be. THIS RULE CANNOT TELL A MERGED
// WINDOW FROM A BROKEN NIGHT, so it has to be generous. At +3 it rejected genuinely measured
// windows: a day sleeper in bed 08:00-17:00 who actually slept 5.7h (four ~50-minute awakenings,
// produced end-to-end through readRecoveryFrom) failed 9 > 8.7 and lost a correct 17:00 wake time
// to the guessed 07:00 one — 8 points of phantom drain, and it opened a 5-9 point headline-vs-
// chart gap where there had been none, because the two models' FALLBACK anchors disagree. Since
// in-window gaps are capped at an hour each, +4 still catches the merges (a 12h window around
// 7.5h of sleep) while sparing every fragmented-night shape measured.
const ANCHOR_SLACK_H = 4;

function trustedSleepWindow(store, now) {
  const ss = store?.recovery?.sleepStart ? new Date(store.recovery.sleepStart) : null;
  const se = store?.recovery?.sleepEnd ? new Date(store.recovery.sleepEnd) : null;
  if (!ss || !se || !(se.getTime() > ss.getTime())) return null;   // also rejects Invalid Date
  const spanH = (se - ss) / 36e5;
  if (!(spanH >= 1 && spanH <= MAX_ANCHOR_SPAN_H)) return null;
  // COERCE. `sleepH + 3` on a string CONCATENATES: `13 > "93"` is false, so a 13h merged window
  // sailed through with sleepHours "9" while "6.5" was correctly rejected — arbitrary rather than
  // degrading gracefully. Unreachable from readRecoveryFrom today, which always writes a number.
  const sleepH = Number(store?.recovery?.sleepHours);
  // A missing or zero sleepHours means there is nothing to cross-check against — NOT that the
  // window is fine. The span ceiling above is what bounds it in that case; the old `if (sleepH &&`
  // let a 14h window with sleepHours 0 anchor the entire day.
  if (Number.isFinite(sleepH) && sleepH > 0 && spanH > sleepH + ANCHOR_SLACK_H) return null;
  if (!(se <= now) || !((now - se) < 20 * 36e5)) return null;   // measured, and actually last night
  return { start: ss, end: se };
}

function earliestActiveHourToday(store, now) {
  if (!store?.activityHourly || store.activityHourlyDate !== dateKeyOf(now)) return null;
  const toH = now.getHours();
  for (let h = 0; h <= toH; h++) {
    const a = store.activityHourly[h];
    if (!a) continue;
    if ((a.steps || 0) >= AWAKE_STEPS_PER_H || (a.kcal || 0) > REST_KCAL_PER_H) {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h).getTime();
    }
  }
  return null;
}

// THE WINDOW IS ONLY AS HONEST AS THE ANCHOR. Bounding to [wake, now] is right — movement while
// you were genuinely asleep is the watch on the nightstand, not your day — but it becomes a FLAT
// SCALE the moment the anchor is a guess. With the estimated 07:00 anchor and a shift walked
// 03:00-06:59, read at 20:30, every one of these reported the SAME battery (71) and the SAME
// drain (-8): 6,500 / 14,500 / 26,500 / 42,500 / 66,500 / 106,500 steps. A 6.5k day and a 106k
// day were indistinguishable — the exact failure this era was fixing, reintroduced by windowing
// rather than by clamping, and invisible because the sheet still prints the day's full step count
// beside the un-charged drain. `earliestActiveHourToday` above is the fix: make the anchor tell
// the truth and the bound below costs nothing. Do NOT instead widen this window to the whole day
// — the curve's drain phase starts at the anchor, so the headline would charge hours the chart
// never draws, and a real (measured) sleep window would start counting the nightstand again.
//
// The window WRAPS when the anchor is yesterday (pre-dawn). A plain `h < fromH || h > toH`
// excludes EVERY hour in that case, so this returned null all night and the per-hour model was
// simply not in effect between midnight and the wake hour.
//
// Returns null when the hourly buckets can't be trusted — missing, or not today's — so the caller
// falls back to whole-day totals. "No data" must never read as "no activity".
function activityRawSinceWake(store, wakeMs, now) {
  const hourly = store.activityHourly;
  if (!hourly || store.activityHourlyDate !== dateKeyOf(now)) return null;
  const fromH = new Date(Math.max(wakeMs, now.getTime() - 24 * 36e5)).getHours();
  const toH = now.getHours();
  const inWindow = (h) => (fromH <= toH ? h >= fromH && h <= toH : h >= fromH || h <= toH);
  let total = 0, anyInWindow = false, anyToday = false;
  for (const [k, v] of Object.entries(hourly)) {
    if (!v || !(v.steps || v.kcal)) continue;
    anyToday = true;
    const h = Number(k);
    // A non-numeric key must be SKIPPED, not waved through. `Number.isFinite(NaN)` is false, so
    // an `&&` guard here would short-circuit and count the bucket unconditionally — outside the
    // very window it exists to enforce.
    if (!Number.isFinite(h) || !inWindow(h)) continue;
    total += softCapHour((v.steps ? v.steps / 1800 : 0) + (v.kcal ? v.kcal / 90 : 0));
    anyInWindow = true;
  }
  // AN EMPTY WINDOW IS ZERO, NOT UNKNOWN — provided the read itself returned something today.
  // Returning null here sent the headline to the whole-day fallback, which charges what you did
  // BEFORE you slept. Measured on a night-shift nurse (on her feet 00:00-08:00, asleep 09:00-
  // 16:00, window trusted by both models): read at 16:05, one minute after waking, the chart said
  // 89 and the headline 72 — a 17-point gap that healed itself on the next hour boundary, when
  // the first bucket finally landed inside [wake, now]. It scales with how active you were before
  // bed. No buckets AT ALL is still null: that is a failed read, and "no data" must never read as
  // "no activity".
  return anyInWindow ? total : (anyToday ? 0 : null);
}

const ACTIVITY_KNEE = 12, ACTIVITY_MAX = 30;

const softCapActivity = (raw) => softCap(raw, ACTIVITY_KNEE, ACTIVITY_MAX);

// THE WORKOUT CEILING WAS A HARD 32/DAY, and `sessionDrain` already caps ONE session at 24 — so
// two hard sessions (24+24=48) and three (72) both landed on exactly 32. A two-a-day and a
// three-a-day were indistinguishable, the same flat top the steps cap had. The knee sits at 24,
// i.e. at one maximal session, so a single workout of any size is completely unaffected: only
// people who train twice in a day see any change at all.
//   raw 16 (an ordinary 20-set session) -> 16.0   unchanged
//   raw 24 (one maximal session)        -> 24.0   unchanged
//   raw 40 (a big session + a small one)-> 33.5
//   raw 48 (two maximal sessions)       -> 38.0
//   raw 72 (three maximal sessions)     -> 42.2
const WORKOUT_KNEE = 24, WORKOUT_MAX = 44;

const softCapWorkout = (raw) => softCap(raw, WORKOUT_KNEE, WORKOUT_MAX);

function computeBodyBattery(store) {
  const now = new Date();
  const todayKey = dateKeyOf(now);
  const rec = store.recovery;
  const hasRecovery = rec && typeof rec.recoveryScore === "number";
  let charge0;
  if (hasRecovery) {
    charge0 = Math.round(55 + rec.recoveryScore * 45);
    // Sleep modifier on top of HRV recovery — a smooth sliding scale centered at 7.5h.
    // 4h→−8, 6h→−5.25, 7h→−1.75, 7.5h→0, 8h→+2.5, 9h+→+7.
    //
    // This is DELIBERATELY gentle, because sleep is already ~25% of recoveryScore: a short night
    // has therefore pulled the number down once before this line runs. The old −16 floor made it
    // count twice, and that double-penalty was the single biggest reason a bad night plus a normal
    // session bottomed the score out (4h + hard session read 7/100). Keep this a nudge; if sleep
    // needs more weight, change its weight inside recoveryScore, not here.
    //
    // ...AND THE NUDGE CANNOT MANUFACTURE A PERFECT MORNING. `55 + score * 45` already reaches 100
    // at a perfect score, so adding up to +7 on top and clamping meant every score from ~0.91
    // upward printed the same 100 — the flat top Mo asked about. Sleep is a quarter of the score
    // that produced charge0 in the first place, so letting it push PAST that score is counting it
    // twice in the flattering direction; the same argument the −16 floor lost on the way down.
    // It can still take a good night the rest of the way UP TO what the score earned, and a short
    // night still bites below it.
    if (rec.sleepHours != null) {
      const d = rec.sleepHours - 7.5;
      const sleepMod = d >= 0 ? Math.min(7, d * 5) : Math.max(-8, d * 3.5);
      // SCALE THE POSITIVE NUDGE BY THE HEADROOM LEFT, don't clamp it to the score.
      // The first cut capped the result at `Math.min(earned, …)` where `earned` was the SAME
      // expression as the pre-nudge charge0 — so the min could only ever bite downward and the
      // `d >= 0` branch became dead code. Measured at score 0.70: 7.5h, 8.5h, 9h and 10h ALL
      // produced 87, and a well-slept day lost 7 points against the previous build. The goal was
      // only ever to stop a good night MANUFACTURING a perfect morning, not to stop it helping.
      // Sixty percent of the remaining room does both: at charge0 87 there is room for the full
      // +7 (a long night still pays), at 96 it is worth about +2 (98, not 100), and 100 stays
      // reachable only from a score that had almost got there on its own.
      const room = Math.max(0, 100 - charge0);
      const applied = sleepMod >= 0 ? Math.min(sleepMod, room * 0.6) : sleepMod;
      charge0 = Math.max(10, Math.min(100, Math.round(charge0 + applied)));
    }
  } else if (rec && typeof rec.sleepHours === "number") {
    charge0 = Math.max(40, Math.min(90, Math.round(40 + rec.sleepHours * 6)));
  } else {
    // No health data: infer from recent training. Rest days raise the floor.
    const daysSinceWorkout = (() => {
      const now_ = Date.now();
      for (let d = 0; d < 14; d++) {
        // History keys are LOCAL dates — toISOString() is UTC and shifts a day for
        // evening users west of Greenwich, which made "trained today" read as yesterday.
        const dt = new Date(now_ - d * 864e5);
        const k = dateKeyOf(dt);
        if (Object.keys((store.history || {})[k] || {}).length > 0) return d;
      }
      return 14;
    })();
    charge0 = Math.min(88, 70 + Math.min(daysSinceWorkout, 2) * 4 + (daysSinceWorkout >= 3 ? 4 : 0));
  }
  // Baseline awake drain: ~0.9/h since wake. Real wake time from HealthKit when fresh
  // (within 20h — actually last night); otherwise assume 7am, rolling to yesterday's 7am
  // pre-dawn so awakeHours rolls over instead of resetting (honest late-night reading).
  const trusted_ = trustedSleepWindow(store, now);
  let wakeAnchor;
  if (trusted_) {
    wakeAnchor = trusted_.end;
  } else {
    wakeAnchor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7);
    if (now < wakeAnchor) wakeAnchor.setDate(wakeAnchor.getDate() - 1); // yesterday's 7am
    // ...and steps before it prove the guess was late. Only when the anchor is TODAY's 7am —
    // pre-dawn it has rolled back to yesterday, and today's buckets are all after it anyway.
    const ea = earliestActiveHourToday(store, now);
    if (ea != null && ea < wakeAnchor.getTime() && dateKeyOf(wakeAnchor) === dateKeyOf(now)) {
      wakeAnchor = new Date(ea);
    }
  }
  const awakeHours = Math.max(0, (now - wakeAnchor) / 36e5);
  let baselineDrain = Math.min(18, Math.round(awakeHours * 0.9));
  // Workout drain from sessions SINCE WAKE — spans yesterday+today keys and filters by
  // finishedAt >= wake, so a reading after midnight still counts the day's training (the headline
  // used to read only the calendar `todayKey`, which reset the drain to 0 at 12am and dropped the
  // 'Training drain' box — the exact number-vs-curve mismatch Mo saw at 2am).
  const wakeMs = wakeAnchor.getTime();
  const keyFor = dateKeyOf;   // dateKeyOf takes a Date or epoch ms
  const winKeys = [...new Set([keyFor(wakeMs), todayKey])];
  let workoutDrain = 0;
  const sessionSpans = [];   // {startMs, endMs, drain} — the recharge walk below needs WHEN, not just how much
  for (const dk of winKeys) {
    for (const sess of Object.values((store.history || {})[dk] || {})) {
      if (sess.finishedAt != null && sess.finishedAt < wakeMs) continue; // finished before this wake window
      let sets = 0, rpeSum = 0, rpeN = 0;
      for (const ex of (sess.exercises || [])) {
        for (const s of (ex.sets || [])) {
          if (s.type === "warmup") continue;
          if (s.done === true || (s.done === undefined && parseFloat(s.reps) > 0)) {
            sets++;
            const r = parseFloat(s.rpe); if (!isNaN(r) && r > 0) { rpeSum += r; rpeN++; }
          }
        }
      }
      if (!sets) continue;
      const avgRpe = rpeN ? rpeSum / rpeN : null;
      // A normal 20-26 set session used to cost 24-30 of a scale whose realistic top is ~85 — a
      // third of the whole battery for one ordinary workout, which is what made training on a
      // mediocre night collapse the score. 4 + 0.6/set puts a 20-set session at 16 and a 26-set
      // one at ~20, in line with what the wearables charge for an hour of lifting, and RPE still
      // moves it either way. The point of this number is to tell you when to back off; it can't
      // do that if every session lands in the red.
      const d = sessionDrain(sets, avgRpe);
      const endMs = sess.finishedAt || new Date(dk + "T12:00:00").getTime();
      // A workout that hasn't happened yet must not drain anything. The filter above only trims
      // the PAST side (before the wake anchor), so a row dated later today was charged in full:
      // measured, at 05:00 with a session finishing at 11:00 the headline already read 50 with
      // workoutDrain 16. Reachable through device-clock skew, and certainly through a legacy
      // guest row with no finishedAt, which anchors to local NOON and so drains from midnight.
      // Same guard trainingLoadRatio needed, for the same reason.
      if (endMs > now.getTime()) continue;
      workoutDrain += d;
      // `Math.max(endMs, endMs + 1)` — a 1ms extension that is always taken — pushed the span into
      // the NEXT hour, and the rest walk's `ov > 0` test then marked that whole hour as training
      // and skipped its 2-point rest credit. The curve uses a strict overlap and a 1-minute floor,
      // so the two disagreed by 2 points per session whose end landed on an hour boundary: +2/+4/+6
      // for one/two/three sessions, and 0 when the same sessions ended at :20 instead. Rare for a
      // real finishedAt, but GUARANTEED for a legacy or guest-migrated row, which anchors to noon.
      sessionSpans.push({ startMs: endMs - (sess.duration || 0) * 1000, endMs: Math.max(endMs, (endMs - (sess.duration || 0) * 1000) + 60000), drain: d });
    }
  }
  // ROUND. sessionDrain returns integers and the old `Math.min(32, …)` kept it that way, so
  // nothing downstream rounded — the soft cap returns a float and the headline rendered
  // "37.023884238244044". Caught by the sim printing the raw level.
  workoutDrain = Math.round(softCapWorkout(workoutDrain));
  // Activity drain from steps/active energy (dampened when a workout is logged,
  // since the workout's own energy is already counted above).
  let activityDrain = 0, hasActivity = false;
  const act = store.activity;
  if (act && act.date === todayKey && (act.steps || act.activeKcal)) {
    hasActivity = true;
    // PER HOUR when HealthKit gave us buckets, whole-day totals when it didn't. Same function the
    // curve uses, over the same hours, so the two cannot disagree by construction.
    const perHour = activityRawSinceWake(store, wakeMs, now);
    activityDrain = perHour != null ? perHour
      : (act.steps ? act.steps / 1800 : 0) + (act.activeKcal ? act.activeKcal / 90 : 0);
    if (workoutDrain > 0) activityDrain *= 0.6;
    activityDrain = Math.round(softCapActivity(activityDrain));
  }
  // Daytime recovery from genuinely still hours since waking, walked IN ORDER.
  //
  // Order matters and summing first does not work: a still hour while the battery sits at charge0
  // stores nothing (you cannot fill a full tank), so banking every still hour and clamping the
  // TOTAL at the end let a restful morning refund an afternoon workout — measured, a 20-set
  // session was erased completely by an evening of sitting still, and the headline drifted 7-9
  // points above the curve, which caps hour by hour. This mirrors the curve's own walk: drop the
  // hour's drain first, then credit only what there is room for.
  //
  // The hour a session overlaps is NOT a rest hour, however still the phone was — a lifter's phone
  // sits in a locker recording ~0 steps for exactly that hour. And only COMPLETED hours count, or
  // the number ticks up the instant a new hour begins.
  let restRecharge = 0;
  {
    const spanH = Math.max(1, (now.getTime() - wakeMs) / 36e5);
    const actPerHour = activityDrain / spanH;
    // ...AND SPEND THE ACTIVITY IN THE HOURS IT ACTUALLY HAPPENED. Smearing the day's activity
    // evenly across the waking span is fine for someone who pottered about all day and wrong for
    // anyone whose effort is CONCENTRATED — which is every runner, cyclist and hiker. On a 4-hour
    // trail run it charged the quiet morning ~1.6/h of activity that never happened, dropped the
    // level early, and thereby manufactured room for rest credit the battery had no space for:
    // the headline banked +20 of rest where the curve, which applies activity hour by hour, banked
    // about 2. That was the whole remaining endpoint gap once the two activity models were
    // unified — measured, the last drawn point sat 11 below the headline on exactly this shape.
    // Falls back to the smear when there are no buckets, because no data must not read as no
    // activity.
    const totalRaw = activityRawSinceWake(store, wakeMs, now);
    const actScale = (totalRaw != null && totalRaw > 0) ? activityDrain / totalRaw : null;
    const actForHour = (t) => {
      if (actScale == null) return actPerHour;
      const v = store.activityHourly?.[new Date(t).getHours()];
      if (!v || !(v.steps || v.kcal)) return 0;
      return softCapHour((v.steps ? v.steps / 1800 : 0) + (v.kcal ? v.kcal / 90 : 0)) * actScale;
    };
    let lvl = charge0;
    // WALK FROM THE WAKE TIME ITSELF, exactly as the curve's phase D does. `Math.ceil(wakeMs /
    // 36e5) * 36e5` snaps to a UTC hour boundary, which is only a local one in whole-offset zones.
    // In Nepal (+5:45) a 07:00 local wake rounded to 07:45 local, so every step of this walk read
    // the hourly buckets half an hour out of phase: measured, the headline banked 19 of rest
    // recharge against the chart's 21 and printed 89 under a chart ending at 91. India, Nepal,
    // Newfoundland, the Chathams and Lord Howe are all sub-hour offsets.
    for (let t = wakeMs; t + 36e5 <= now.getTime(); t += 36e5) {
      lvl -= 0.9 + actForHour(t);
      let inWorkout = false;
      for (const sp of sessionSpans) {
        const ov = Math.max(0, Math.min(sp.endMs, t + 36e5) - Math.max(sp.startMs, t));
        if (ov > 0) { inWorkout = true; lvl -= sp.drain * (ov / Math.max(1, sp.endMs - sp.startMs)); }
      }
      if (inWorkout) continue;
      const c = restfulHourRecharge(store, t, todayKey);
      if (c > 0) {
        const applied = Math.min(c, charge0 - lvl);
        if (applied > 0) { lvl += applied; restRecharge += applied; }
      }
    }
  }
  const spent = charge0 - baselineDrain - workoutDrain - activityDrain;
  restRecharge = Math.round(Math.max(0, Math.min(restRecharge, charge0 - spent)));
  const level = Math.max(5, Math.min(100, spent + restRecharge));
  // THE CARD PRINTS THESE TERMS, SO THEY MUST ADD UP TO THE NUMBER BESIDE THEM. `level` is
  // floored at 5 but the parts were not, so on a genuinely terrible day the line read
  // "Woke at 49 · −24 training · −18 activity · −13 today" — which sums to −6 — under a headline
  // of 5. The floor is a real modelling decision (a battery doesn't go negative), so the honest
  // fix is to absorb it into the largest drain rather than leave the arithmetic broken.
  // sim_bbcliff checks this reconciliation on one gentle fixture, which never reaches the floor.
  let shortfall = level - (spent + restRecharge);
  if (shortfall > 0) {
    for (const k of ["activityDrain", "workoutDrain", "baselineDrain"]) {
      if (shortfall <= 0) break;
      const cut = Math.min(shortfall, k === "activityDrain" ? activityDrain : k === "workoutDrain" ? workoutDrain : baselineDrain);
      if (k === "activityDrain") activityDrain -= cut; else if (k === "workoutDrain") workoutDrain -= cut; else baselineDrain -= cut;
      shortfall -= cut;
    }
  }
  return { level, charge0, baselineDrain, workoutDrain, activityDrain, restRecharge, hasRecovery, hasActivity };
}


// Hour-by-hour Body Battery curve from wake (or 7am) to now, walked one hour at a time instead
// of collapsed into computeBodyBattery()'s single end-of-day number. There's no continuous
// heart-rate stream without a paired Apple Watch, so this can't show real recovery bounces like
// Garmin's chart — it's an honest, monotonically-draining curve driven by elapsed time, each
// today session's real start/end timestamps, and real per-hour step/active-energy samples from
// HealthKit (store.activityHourly, from readHourlyActivity()) when available. Always spans the
// full trailing 24 hours: previous night's recharge tail → yesterday's drain → last night's
// recharge → today's drain, so the "24H" header is literally true at any time of day.
function computeBodyBatteryTimeline(store) {
  const now = new Date();
  const bb = computeBodyBattery(store);

  // 24h window: last night's REAL sleep window from HealthKit when it's fresh (wake
  // within the last 20h — i.e. actually last night), otherwise the 10pm→7am estimate.
  // Night-shift schedules work automatically once Apple Health is connected.
  // Same trust test the headline uses — see trustedSleepWindow. These two must never disagree
  // about where the day starts, or the number and the chart beneath it describe different days.
  const realWindow = trustedSleepWindow(store, now);
  let sleepStart, wakeTime;
  if (realWindow) {
    sleepStart = realWindow.start;
    wakeTime = realWindow.end;
  } else {
    // Estimate: yesterday ~10pm → today 7am. Pre-dawn (now < 7am) we're still
    // mid-recharge: the recharge loop caps at `now` and the drain phase is skipped,
    // so wakeTime stays today 7am (the recharge target) rather than rolling back —
    // rolling it back would put wakeTime before sleepStart and invert the curve.
    sleepStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 22);
    sleepStart.setDate(sleepStart.getDate() - 1);
    wakeTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7);
    // Steps overrule the 10pm default (how the wearable apps do it, phone-only: Garmin's
    // battery only rises when the body is measurably calm; Whoop/Oura recharge the DETECTED
    // sleep episode). Steps can prove you were AWAKE — never that you were asleep — so
    // evidence only pushes bedtime LATER (a late night out), capped at 4am, never earlier.
    // Yesterday's 8pm-midnight steps come from activityPrevEvening; post-midnight from
    // activityHourly (today's hour-of-day buckets).
    const ACTIVE_STEPS = AWAKE_STEPS_PER_H;
    // The persisted buckets carry no date of their own — only trust them when the last
    // HealthKit sync ran TODAY (activityHourlyDate). Stale buckets from a previous open
    // would otherwise steer the gate off the wrong night (e.g. last opened 11pm yesterday,
    // opened again 9am: yesterday's 0-3h steps would read as last night's).
    const gateTodayKey = dateKeyOf(now);
    const activityFresh = store.activityHourlyDate === gateTodayKey;
    const stepsInHour = (t) => {
      if (!activityFresh) return 0; // no fresh evidence — keep the 10pm default
      const d = new Date(t), h = d.getHours();
      if (d.getDate() === now.getDate() && d.getMonth() === now.getMonth()) return (store.activityHourly?.[h]?.steps) || 0;
      return (store.activityPrevEvening?.[h]) || 0;
    };
    const gateEnd = Math.min(now.getTime(), new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4).getTime());
    for (let t = sleepStart.getTime(); t < gateEnd; t += 36e5) {
      if (stepsInHour(t) >= ACTIVE_STEPS) sleepStart = new Date(Math.min(t + 36e5, gateEnd));
    }
    // YOU ARE NOT ASLEEP WHILE READING THIS. Pre-dawn, with no real HealthKit window, the estimate
    // above claims you went to bed at 10pm and draws a rising recharge — while computeBodyBattery
    // rolls its wake anchor back to yesterday 7am and keeps DRAINING. The endpoint pin can't
    // reconcile them because it deliberately skips recharge points, so at 05:30 the headline read
    // 40 and the curve beneath it ended at 71. The app being open is direct evidence of being
    // awake, and it's the one signal that needs no permission — so push the estimated bedtime to
    // now and let the drain continue, which is the honest reading and the one the headline takes.
    if (now < wakeTime) sleepStart = new Date(Math.max(sleepStart.getTime(), now.getTime()));
    // ...and the same evidence pulls the estimated WAKE earlier, so the drain phase actually
    // covers the hours you were up. Kept strictly after sleepStart — a wakeTime at or before it
    // inverts the curve, which is the trap the pre-dawn note above records. That guard is also
    // why this does NOT rescue every shape: when activity runs straight through the estimated
    // night (03:00-07:00, no watch), the BEDTIME gate has already consumed those same steps and
    // pushed sleepStart to its 04:00 cap, so the pull-back is refused and the chart still under-
    // draws there. The headline is right in that case and the endpoint pin absorbs the rest —
    // the same place pre-commit code stood. Measured: early riser (gym 05:30-06:30) headline
    // 73 -> 58 with the chart tracking 75 -> 60, gap 2; the 03:00-07:00 shift keeps a ~20 gap.
    const easMs = earliestActiveHourToday(store, now);
    if (easMs != null && easMs < wakeTime.getTime() && easMs > sleepStart.getTime()) {
      wakeTime = new Date(easMs);
    }
  }

  // The chart always spans the full trailing 24 hours (the header says "24H" — make it true).
  const windowStartMs = now.getTime() - 24 * 36e5;

  // HealthKit sleep hours will replace the 7.5h estimate when connected.
  const hasSleepData = !!(store.recovery?.sleepHours);
  const sleepHours = hasSleepData ? Math.min(9, Math.max(5, store.recovery.sleepHours)) : 7.5;
  const rechargeTotal = Math.min(40, Math.max(15, Math.round(sleepHours * 4)));
  let sleepStartLevel = Math.max(10, Math.min(55, bb.charge0 - rechargeTotal));
  // PRE-DAWN, AWAKE, NO REAL SLEEP WINDOW: the terminal point of the backward walk IS the
  // present moment, so it must carry the present LEVEL.
  //
  // The Aug-1 fix pushed the estimated bedtime to `now` so the curve would stop drawing a
  // recharge for sleep that hasn't happened. That was right, but it left the chart with nothing
  // after it: phase C needs `sleepStart < min(now, wakeTime)` and phase D needs `now > wakeTime`,
  // and pre-dawn both are false. So the last drawn point became phase A+B's terminal — a
  // CONSTANT, `sleepStartLevel`, with no relationship to today at all. It doesn't move between
  // 03:00 and 06:30, and because it is tagged "drain" the endpoint pin then yanks it to the
  // headline: measured on a rested rest day, the real endpoint sat at 55 while the headline read
  // 81, and the 26-point difference was drawn across ~6px at the right edge. Every night, for
  // every phone-only user, and worst for the best-rested — 0.5/7h gave 10 points, 1.0/8.5h gave
  // 27. sim_bbdiverge sweeps exactly these hours but asserts on the PINNED value, so it is a
  // tautology there; sim_bbcliff had the right shape and excluded pre-dawn on a stated basis that
  // was simply wrong (it claimed the last two points straddle a phase change — both are "drain").
  const awakePreDawn = !realWindow && now < wakeTime;
  if (awakePreDawn) sleepStartLevel = bb.level;

  // Workout sessions for the drain phases — same per-session drain formula as
  // computeBodyBattery. The 24h window can touch up to three calendar dates
  // (yesterday, today, and the day before across a midnight boundary).
  const keyOf = dateKeyOf;
  const dateKeys = [...new Set([keyOf(new Date(windowStartMs)), keyOf(new Date(windowStartMs + 12 * 36e5)), keyOf(now)])];
  const buckets = dateKeys.map(k => (store.history || {})[k] || {});
  // Legacy rows without finishedAt anchor to NOON OF THEIR OWN DATE (same fallback
  // loadUserData uses) — falling back to `now` would model a workout from two days ago as
  // ending this second and dent today's drain curve.
  const sessions = dateKeys.flatMap((k, i) => Object.values(buckets[i]).map(sess => {
    const endMs = sess.finishedAt || new Date(k + "T12:00:00").getTime();
    const startMs = endMs - (sess.duration || 0) * 1000;
    let sets = 0, rpeSum = 0, rpeN = 0;
    for (const ex of (sess.exercises || [])) {
      for (const s of (ex.sets || [])) {
        if (s.type === "warmup") continue;
        if (s.done === true || (s.done === undefined && parseFloat(s.reps) > 0)) {
          sets++; const r = parseFloat(s.rpe); if (!isNaN(r) && r > 0) { rpeSum += r; rpeN++; }
        }
      }
    }
    if (!sets) return null;
    if (endMs > now.getTime()) return null;   // see the headline's guard — not yet trained
    const avgRpe = rpeN ? rpeSum / rpeN : null;
    const drain = sessionDrain(sets, avgRpe);
    return { startMs, endMs: Math.max(endMs, startMs + 60000), drain };
  })).filter(Boolean);
  // THE CURVE MUST HONOUR THE SAME DAILY CAP AS THE HEADLINE. computeBodyBattery clamps total
  // workout drain to 32/day; the curve applied every session in full, so two 34-set sessions cost
  // 48 on the chart against 32 in the number — the chart read 35 under a headline of 50 and the
  // endpoint pin yanked it 15 points at the last pixel. Two-a-days and split sessions are normal
  // here. Scale proportionally rather than truncating the last session, so the shape is right.
  // ...SCOPED TO THE SAME SESSIONS THE HEADLINE CAPS: those since you woke. The curve gathers up
  // to three date keys to fill a 24h window, so it was summing YESTERDAY's training into today's
  // scale factor and shrinking today's whole line. Measured at 20:00 with a 34-set session today:
  // adding a 30-set session yesterday evening lifted the curve 8 points above the headline — and
  // adding one at 08:30 yesterday did the same even though it falls outside the window and is
  // never drawn at all. Back-to-back training days are normal here, so this fired constantly.
  {
    const wakeMs = wakeTime.getTime();
    const todays = sessions.filter(x => x.endMs >= wakeMs);
    const raw = todays.reduce((a, x) => a + x.drain, 0);
    const target = softCapWorkout(raw);
    if (raw > 0 && target < raw) { const k = target / raw; todays.forEach(x => { x.drain *= k; }); }
  }

  const hourlyActivity = store.activityHourly;
  const hourlyIsFresh = store.activityHourlyDate === keyOf(now);
  // Proportional scale that holds the curve's summed activity drain to whatever the headline
  // charges — see softCapActivity. One model, two walks.
  const activityScale = (() => {
    // Scale the hourly drains so their sum is exactly what the headline charges. `total` is the
    // same figure computeBodyBattery derives from the same buckets over the same hours, so this
    // is one model evaluated twice rather than two models hoping to agree.
    //
    // THE TWO NULL CASES ARE NOT THE SAME CASE. Stale/absent buckets means we know nothing and
    // must not scale (1). Fresh buckets that sum to nothing means a genuinely still day, and on a
    // day with a WORKOUT the damp still applies — a lifter's step count is already discounted
    // because the session drain covers the effort. Collapsing both onto 1 dropped the damp
    // exactly when the curve was walking real hours: measured on a night-shift fixture (session
    // at 01:00, activity every hour since midnight, read 06:30) the chart walked down to 17 under
    // a headline of 38 and the pin closed 21 points, where the old code closed 6.
    const damp = sessions.length ? 0.6 : 1;
    const total = activityRawSinceWake(store, wakeTime.getTime(), now);
    if (total == null) return 1;
    if (!(total > 0)) return damp;
    return softCapActivity(total * damp) / total;
  })();
  const points = [];
  const clampLvl = (l) => Math.round(Math.max(5, Math.min(100, l)));

  // Per-hour drain shared by yesterday's and today's drain segments. `useActivity` only for
  // today's hours — hourlyActivity is TODAY'S per-hour steps/kcal, keyed by hour-of-day, so
  // applying it to yesterday's same-numbered hours would double today's movement into yesterday.
  const drainForHour = (hourStart, hourEnd, useActivity) => {
    let drain = 0.9 * ((hourEnd - hourStart) / 36e5);
    for (const s of sessions) {
      const overlapMs = Math.max(0, Math.min(s.endMs, hourEnd) - Math.max(s.startMs, hourStart));
      if (overlapMs > 0) drain += s.drain * (overlapMs / Math.max(1, s.endMs - s.startMs));
    }
    if (useActivity && hourlyIsFresh && keyOf(new Date(hourStart)) === keyOf(now)) {
      // Freshness + same-day gate, matching the headline's `act.date === todayKey` and
      // restfulHourRecharge's own check. Without it the curve applied YESTERDAY's buckets as
      // today's drain (a whole day of phantom sag, then a 15-point cliff where the endpoint pin
      // snapped back to the headline), and applied today's hour-of-day buckets to yesterday's
      // same-numbered hours whenever phase D spanned a midnight.
      const act = hourlyActivity?.[new Date(hourStart).getHours()];
      if (act && (act.steps || act.kcal)) {
        const a = (act.steps ? act.steps / 1800 : 0) + (act.kcal ? act.kcal / 90 : 0);
        // `activityScale` holds the curve to the headline's 18/day ceiling. The headline caps the
        // DAY; the curve capped each HOUR at 6 with no daily limit, so a 30k-step hike cost 35 on
        // the chart against 18 in the number (45k steps: 58 vs 18), and the pin then jumped the
        // last point 17-40 points. Long hikes and physical jobs are ordinary for this audience.
        drain += softCapHour(a) * activityScale;
      }
      // A still hour RECHARGES — the delta goes negative and the curve ticks back up. Same rule
      // the headline uses, so the chart and the big number tell the same story.
      //
      // ...but NOT an hour you were training in. The headline already refuses this (`if (inWorkout)
      // continue`) on the documented grounds that a phone in a locker records ~0 steps and is not
      // evidence of rest. The curve credited it anyway, so every workout hour was 2 points cheaper
      // on the chart than in the number — 8 points across a 4h session.
      const inWorkout = sessions.some(x => Math.min(x.endMs, hourEnd) > Math.max(x.startMs, hourStart));
      if (!inWorkout) drain -= restfulHourRecharge(store, hourStart, keyOf(now));
    }
    return drain;
  };
  const pushPt = (ts, level, phase) => points.push({ ts, hour: new Date(ts).getHours(), level: clampLvl(level), phase });

  // Phase A+B — yesterday: drain from the previous wake down to last night's sleep, anchored
  // BACKWARD so it lands exactly on sleepStartLevel where the recharge curve picks up (walking
  // backward from the known endpoint sidesteps needing yesterday's unknown morning charge).
  const prevWakeMs = wakeTime.getTime() - 24 * 36e5;
  const preStartMs = Math.max(windowStartMs, prevWakeMs);
  if (sleepStart.getTime() > preStartMs) {
    const hours = [];
    for (let t = preStartMs; t < sleepStart.getTime(); t += 36e5) {
      hours.push({ start: t, end: Math.min(t + 36e5, sleepStart.getTime()) });
    }
    const drains = hours.map(h => drainForHour(h.start, h.end, false));
    const levels = new Array(hours.length);
    let acc = 0;
    for (let i = hours.length - 1; i >= 0; i--) { acc += drains[i]; levels[i] = sleepStartLevel + acc; }
    // Previous night's recharge tail — only when the window reaches back before yesterday's
    // wake (i.e. it's currently night/early morning). Same sqrt shape, rising into the level
    // yesterday's drain starts from.
    if (windowStartMs < prevWakeMs && hours.length) {
      const prevWakeLevel = Math.min(100, levels[0]);
      const prevSleepStartMs = sleepStart.getTime() - 24 * 36e5;
      const prevLow = Math.max(10, Math.min(55, prevWakeLevel - rechargeTotal));
      const span = Math.max(1, prevWakeMs - prevSleepStartMs);
      for (let t = windowStartMs; ; t += 30 * 60000) {
        const ct = Math.min(t, prevWakeMs);
        const frac = Math.max(0, Math.min(1, (ct - prevSleepStartMs) / span));
        pushPt(ct, prevLow + Math.sqrt(frac) * (prevWakeLevel - prevLow), "recharge");
        if (t >= prevWakeMs) break;
      }
    }
    for (let i = 0; i < hours.length; i++) pushPt(hours[i].start, levels[i], "drain");
    pushPt(sleepStart.getTime(), sleepStartLevel, "drain");
  }

  // Phase C — last night's recharge, 30-min intervals, sqrt curve. Skipped entirely when the
  // steps gate says sleep hasn't started yet (still out at 1am — the drain just continues).
  const sleepDurMs = wakeTime.getTime() - sleepStart.getTime();
  const phaseEnd1 = Math.min(now.getTime(), wakeTime.getTime());
  if (sleepStart.getTime() < phaseEnd1) {
    for (let t = sleepStart.getTime(); ; t += 30 * 60000) {
      const ct = Math.min(t, phaseEnd1);
      const frac = sleepDurMs > 0 ? Math.max(0, Math.min(1, (ct - sleepStart.getTime()) / sleepDurMs)) : 1;
      pushPt(ct, sleepStartLevel + Math.sqrt(frac) * (bb.charge0 - sleepStartLevel), "recharge");
      if (t >= phaseEnd1) break;
    }
  }

  // Phase D — today: wake → now, hourly intervals. The wake anchor keeps the drain line
  // meeting the recharge line's endpoint exactly (no gap at the peak).
  if (now > wakeTime) {
    let level = bb.charge0;
    pushPt(wakeTime.getTime(), level, "drain");
    const hoursElapsed = Math.ceil((now - wakeTime) / 36e5);
    for (let h = 0; h < hoursElapsed; h++) {
      const hourStart = wakeTime.getTime() + h * 36e5;
      const ts = Math.min(hourStart + 36e5, now.getTime());
      // Ceiling is the wake-time charge — rest can give back what the day took, never more.
      level = Math.max(5, Math.min(bb.charge0, level - drainForHour(hourStart, ts, true)));
      pushPt(ts, level, "drain");
    }
  }

  // Clip to the 24h window (the recharge loop can start up to 2h before it late in the evening).
  const clipped = points.filter(p => p.ts >= windowStartMs);
  // Pin the LAST point to the headline number so the curve's end and the big "50/100" always
  // agree (they used to be two independent models that diverged badly past midnight). Only nudge
  // the final drain point — the recharge phases keep their shape.
  if (clipped.length >= 2 && clipped[clipped.length - 1].phase !== "recharge") {
    clipped[clipped.length - 1] = { ...clipped[clipped.length - 1], level: clampLvl(bb.level) };
  }
  return clipped.length >= 2 ? { points: clipped, wakeTimeMs: wakeTime.getTime(), sleepStartMs: sleepStart.getTime(), hasSleepData } : null;
}

// Reduce a pile of HealthKit sleep samples to ONE night. HealthKit hands back many short
// per-stage samples, and an evening nap (or a brief "asleep" detection while you sat still)
// lands in the same lookback as last night. The old rule — keep everything ending within 14h of
// the newest end, then take min(start)/max(end) — MERGED those into a window that described
// neither: last night's tail fragment started ~7am and the evening nap ended ~8pm, so the app
// reported "you slept 7am to 8pm". Group into contiguous blocks instead and pick one.
// Minutes per sleep STAGE inside a window, de-duplicated by UNION of intervals. More than one
// source can write the same night (Apple Watch plus a sleep app), and naively summing samples is
// exactly what once turned an 8h night into "16h" — same hazard pickSleepBlock guards for totals.
// How much the STAGE COMPOSITION of a night moves its duration factor. Typical adult proportions
// are ~16% deep and ~21% REM, so q = 1 at typical and the multiplier is exactly 1.0 — most people
// see no change. Range is [0.85, 1.15]: poor composition costs at most 15%, excellent gains at most
// 15%. Duration is applied by the CALLER and still gates, so great stages can't rescue a short
// night. Lives here as one exported definition because a sim that re-implements the formula would
// pass against any constants, including wrong ones.
function sleepQualityMult(deepMin, remMin, totalMin) {
  if (!(totalMin > 0)) return 1;
  const q = 0.5 * ((deepMin || 0) / totalMin / 0.16) + 0.5 * ((remMin || 0) / totalMin / 0.21);
  if (!isFinite(q)) return 1;
  return 0.85 + 0.15 * Math.min(2, Math.max(0, q));
}

function stageMinutes(samples, startMs, endMs) {
  const byStage = { deep: [], rem: [], core: [] };
  for (const s of samples || []) {
    if (s.startMs == null || s.endMs == null || s.endMs <= s.startMs) continue;
    const a = Math.max(s.startMs, startMs), b = Math.min(s.endMs, endMs);
    if (b <= a) continue;
    const st = (s.stage || "").toLowerCase();
    const key = st === "deep" ? "deep" : st === "rem" ? "rem"
      : (st === "light" || st === "core") ? "core" : null;   // bare "asleep" carries no stage
    if (key) byStage[key].push([a, b]);
  }
  const out = { deep: 0, rem: 0, core: 0 };
  for (const k of Object.keys(byStage)) {
    let total = 0, curEnd = -Infinity;
    for (const [a, b] of byStage[k].sort((x, y) => x[0] - y[0])) {
      const from = Math.max(a, curEnd);
      if (b > from) { total += b - from; curEnd = b; }
    }
    out[k] = Math.round(total / 60000);
  }
  return out;
}

const SLEEP_GAP_MIN = 60;      // a gap this short is a brief wake INSIDE one night, not a new sleep

const MIN_MAIN_SLEEP_H = 2.5;  // anything shorter is a nap, never "last night"

const MAX_SLEEP_SPAN_H = 16;   // no real night spans longer — that's duplicated/garbage data

function pickSleepBlock(samples) {
  const clean = (samples || [])
    .filter(s => s && s.startMs != null && s.endMs != null && s.endMs > s.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  if (!clean.length) return null;
  // Track the reported minutes AND the union of the intervals actually covered. More than one
  // source can write the same night (Apple Watch plus a sleep app, each with its own sourceName),
  // and simply summing turned one 8h night into "16h of sleep in an 8h window". Taking the smaller
  // of the two is right in both directions: it discards duplicate coverage, and it still respects a
  // sample that reports LESS sleep than its own span (an aggregate row net of time awake).
  const blocks = [];
  for (const s of clean) {
    const b = blocks[blocks.length - 1];
    if (b && s.startMs - b.endMs <= SLEEP_GAP_MIN * 60000) {
      b.reported += s.minutes || 0;
      b.coveredMs += Math.max(0, s.endMs - Math.max(s.startMs, b.covEnd));
      b.covEnd = Math.max(b.covEnd, s.endMs);
      b.endMs = Math.max(b.endMs, s.endMs);
    } else {
      blocks.push({ startMs: s.startMs, endMs: s.endMs, reported: s.minutes || 0,
        coveredMs: s.endMs - s.startMs, covEnd: s.endMs });
    }
  }
  for (const b of blocks) b.minutes = Math.min(b.reported, b.coveredMs / 60000);
  const sane = blocks.filter(b => (b.endMs - b.startMs) <= MAX_SLEEP_SPAN_H * 36e5);
  const pool = sane.length ? sane : blocks;
  const main = pool.filter(b => b.minutes >= MIN_MAIN_SLEEP_H * 60);
  // Most RECENT real sleep wins, so night-shift schedules work on their own. If the lookback
  // only caught naps, take the longest rather than inventing a night out of a 20-minute doze.
  if (main.length) return main.reduce((a, b) => (b.endMs > a.endMs ? b : a));
  return pool.reduce((a, b) => (b.minutes > a.minutes ? b : a));
}

// A "night" is the local noon-to-noon bucket a sample falls in: shift the timestamp back 12h and
// take its date, so 23:40 and 03:10 are the same night rather than two. Used for the HRV pool and
// for the baseline, which must agree or the baseline can end up containing the night it scores.
const NIGHT_SHIFT_MS = 12 * 36e5;

const nightKeyOf = (t) => dateKeyOf(t - NIGHT_SHIFT_MS);

// A sample in the small hours proves you were ASLEEP in that bucket, as opposed to awake on the
// sofa at 22:30 — which is the whole distinction the pin has to make.
const isSmallHours = (t) => { const h = new Date(t).getHours(); return h < 9; };


// Group samples by key and return the newest group, preferring groups that satisfy `qualifies`.
function newestGroup(pool, keyFn, qualifies) {
  const groups = new Map();
  for (const s of pool) {
    if (s == null || s.t == null) continue;
    const k = keyFn(s.t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const keys = [...groups.keys()].sort();
  if (!keys.length) return [];
  if (qualifies) {
    const q = keys.filter(k => groups.get(k).some(s => qualifies(s.t)));
    if (q.length) return groups.get(q[q.length - 1]);
  }
  return groups.get(keys[keys.length - 1]);
}


// Reduce a pool of {v,t} HRV samples to the SINGLE most recent night.
// Prefers HealthKit's real sleep window; if that's missing, takes the newest noon-to-noon bucket
// that contains a small-hours sample. Exported for the sim harness — pure, no HealthKit needed.
//
// THE ORIGINAL FALLBACK WAS "everything within 14h of the newest sample", which produced a cliff
// every evening for anyone whose phone has no HealthKit sleep rows (no watch worn to bed, or a
// device that writes only an undifferentiated total). The pool on that path is the overnight-hour
// filter, which starts at 22:00 — so the moment the clock passed 22:00, a sample taken awake on
// the sofa became "newest", and 14h back from 22:30 reached only to 08:30 that morning. The whole
// night fell out and the score was computed from the sofa: measured, 75% at 21:00 -> 88% at 22:45,
// and it swings the other way just as easily if the evening reading is low. The direction isn't
// the point; that the number moves on no new information is.
//
// THE SECOND ATTEMPT — contiguous blocks split on a 3h gap, requiring 2h of span to count as a
// night — WAS WRONG IN THREE WAYS, all of them because it assumed HRV samples are dense. They are
// not: an Apple Watch typically writes a handful a night, hours apart. Measured on the shipped
// build, three separate failures with no fixture change beyond realistic spacing:
//   * a night whose samples span under 2h never qualified, so the sofa block won anyway and the
//     cliff was untouched — 3 samples 40 minutes apart still jumped 75% -> 88% at 22:45;
//   * a real night split by one >3h gap (watch on the charger at 2am) produced an early block that
//     qualified and a late one that didn't, so the EARLY half won — and the 20h staleness guard
//     then measured age from the early half's end and deleted HRV entirely at 21:46, taking a
//     genuinely wrecked 28ms night from 38% to 76% on no new data;
//   * four samples at 23:20/02:40/03:10/06:50 fragmented into three blocks and the pin returned
//     ONE of them, so "the median ignores a single odd reading" stopped being true.
// Bucketing by night has none of these failure modes because it doesn't care how many samples
// there are or how they're spaced. The small-hours test is what keeps two sofa readings from
// passing as a night, and it lets a genuinely in-progress night take over the moment you have
// actually slept into it, which is correct — that IS new information.
function pinToLastNight(pool, sleepStartIso, sleepEndIso) {
  if (!pool || pool.length < 2) return pool || [];
  const ss = sleepStartIso ? new Date(sleepStartIso).getTime() : NaN;
  const se = sleepEndIso ? new Date(sleepEndIso).getTime() : NaN;
  if (!isNaN(ss) && !isNaN(se) && se > ss) {
    const inSleep = pool.filter(s => s.t != null && s.t >= ss && s.t <= se);
    if (inSleep.length) return inSleep;
  }
  const withT = pool.filter(s => s.t != null);
  if (withT.length < 2) return pool;
  const g = newestGroup(withT, nightKeyOf, isSmallHours);
  return g.length ? g : pool;
}


// A PERSONAL BASELINE IS A MEDIAN OF NIGHTS (or days), NOT OF RAW SAMPLES, AND IT MUST NOT
// CONTAIN THE NIGHT IT IS BEING COMPARED AGAINST.
//
// Both faults were live. `hrvBaseline` was `median(every sample in the last 60 days)` — which
// includes the night currently being scored, so on the FIRST night with a watch the baseline IS
// that night and the ratio is exactly 1.000 no matter what happened: a genuinely wrecked first
// night read 58% "Moderate" instead of the floor. The self-comparison decays as history builds,
// but not evenly — nights differ wildly in SAMPLE COUNT (one row on a night you took the watch off
// at 3am, sixty on a full one), and a raw-sample median is dominated by whichever nights happened
// to produce the most rows. Collapsing each night to its own median first gives every night one
// vote, which is what "your normal" means.
//
// THE EXCLUSION IS BY KEY, NOT BY TIMESTAMP, and that distinction is a bug I shipped. Cutting at
// "the first sample of the scored pool" let the SAME night's pre-sleep samples through — the
// overnight filter starts at 22:00, so a 22:15 reading taken awake sits before a 23:30 bedtime and
// survived the cutoff. It then landed under the scored night's own key as an extra group, and
// awake HRV runs low, so the baseline was dragged down and the score up every time. Measured:
// baseline 60 -> 57.5, score 0.56 -> 0.65. Worse, it could satisfy the small-sample guard with the
// scored night itself — two prior nights plus tonight's pre-sleep readings made `periods` 3, which
// flipped the score from a capped 0.75 to 0.26. Dropping whole KEYS cannot do either.
// Returns { value, periods } — `periods` is the real small-sample guard: a baseline built from one
// or two nights is noise, and the caller refuses to score against it.
const medianOf = (a) => { if (!a || !a.length) return null; const x = [...a].sort((p, q) => p - q); const m = Math.floor(x.length / 2); return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2; };

function personalBaseline(samples, cutoffKey, nightly) {
  const groups = {};
  for (const s of (samples || [])) {
    if (s == null || s.t == null || isNaN(s.v)) continue;
    const key = nightly ? nightKeyOf(s.t) : dateKeyOf(s.t);
    if (cutoffKey && key >= cutoffKey) continue;
    (groups[key] = groups[key] || []).push(s.v);
  }
  const keys = Object.keys(groups);
  if (!keys.length) return { value: null, periods: 0 };
  return { value: medianOf(keys.map(k => medianOf(groups[k]))), periods: keys.length };
}

const MIN_BASELINE_PERIODS = 3;


// Overnight window for HRV: samples taken roughly during sleep (10pm–9am local) are the cleanest
// recovery signal — daytime HRV is noisier (movement, stress, caffeine), which is why Whoop/Garmin/
// Oura read it overnight.
const isOvernightSample = (t) => { if (t == null) return false; const h = new Date(t).getHours(); return h >= 22 || h < 9; };


// EVERY DECISION ABOUT WHICH HRV SAMPLES COUNT, IN ONE PLACE. Takes the 36h pool and the 60-day
// history as [{v,t}] and returns the two numbers the score compares. Pure and exported, because
// readRecovery needs a device and three separate bugs lived in exactly this logic.
//
// 1. WHICH WINDOW. Today and the baseline must be the same KIND of reading. The old rule fell back
//    to "all samples on both sides" whenever either side had no overnight data, and called that
//    apples-to-apples — but `hrvAll` is only 36h, so on a night the watch sat on the charger it is
//    daytime-only, while the 60-day history is overwhelmingly overnight. Comparing the two reports
//    a collapse that did not happen: measured, 75% -> 38% purely for taking the watch off.
//      both overnight    -> night vs night
//      baseline has none -> all vs all (this user never wears it at night — consistent)
//      today has none    -> NO READING. Say nothing about HRV rather than substituting a daytime
//                           one; the caller renormalises over the signals it does have, the same
//                           way a missing signal is excluded rather than scored as zero.
// 2. STALENESS. The 36h lookback still reaches into the night BEFORE last, so skipping one night
//    leaves the overnight filter non-empty from that older night and a two-day-old reading gets
//    reported as this morning's. Same 20h elapsed-hours rule as the sleep block — never a clock
//    anchor, which lands in a different place relative to last night depending on when you look.
// 3. SELF-REFERENCE. The baseline excludes the night being scored (see personalBaseline).
const STALE_HRV_MS = 20 * 36e5;

function hrvReading(hrvAll, hrvHist, sleepStartIso, sleepEndIso, nowMs) {
  const all = hrvAll || [], hist = hrvHist || [];
  let stale = false;

  // One attempt at a comparison: reduce today's samples to a reading, build the baseline from the
  // SAME kind of samples, and refuse the whole thing if either half doesn't hold up.
  const attempt = (todaySamples, histSamples, pin, nightly) => {
    if (!todaySamples.length) return null;
    let pool = pin ? pinToLastNight(todaySamples, sleepStartIso, sleepEndIso)
                   : newestGroup(todaySamples, dateKeyOf, null);
    if (!pool.length) return null;
    // A reading older than 20h is not today's. The 36h lookback still reaches the night BEFORE
    // last, so skipping one night would otherwise resurrect a two-day-old reading as this
    // morning's — the same trap already closed for the sleep block, on the same rule. Elapsed
    // hours, never a clock anchor: a clock-anchored cutoff sits in a different place relative to
    // last night depending on when the app is opened.
    const newestT = pool.reduce((m, x) => (x.t != null && x.t > m ? x.t : m), 0);
    if (!newestT || (nowMs - newestT) > STALE_HRV_MS) { stale = true; return null; }
    // Exclude the scored bucket ITSELF from its own baseline, by key — see personalBaseline.
    const cutoffKey = nightly ? nightKeyOf(newestT) : dateKeyOf(newestT);
    const base = personalBaseline(histSamples, cutoffKey, nightly);
    if (base.periods < MIN_BASELINE_PERIODS) return null;
    // MEDIAN on both sides, deliberately. Today's figure used to be a mean while the baseline was
    // a median, so the two halves of the ratio weren't the same statistic. Pinning to one night
    // makes the pool small enough that a single odd reading (a wake-up, a bad contact) would
    // otherwise visibly move the score.
    return { hrv: Math.round(medianOf(pool.map(x => x.v))), baseline: base.value, nights: base.periods };
  };

  // OVERNIGHT ONLY. THE DAYTIME FALLBACK IS DELETED — it made things worse in four separate ways,
  // every one of them in the flattering direction, which is the exact failure it was built to stop.
  //
  // The reasoning that produced it was: "watch off overnight -> no HRV -> the score ROSE, so keep
  // the signal by comparing daytime to a daytime baseline." The first half of that was a real bug.
  // But it is ALREADY FIXED, in the right place: recoveryScoreFrom now ceilings an unknown HRV at
  // what a typical one would have scored, so a missing signal can no longer flatter anybody. With
  // that in place the fallback bought nothing and cost this, all measured on the shipped code:
  //
  //   * `attempt(overnight) || attempt(daytime)` cannot tell "no overnight reading" from "a good
  //     overnight reading whose baseline is only two nights old". Every user's first three nights
  //     in the watch land there. Measured: a genuinely wrecked 28ms night (against an overnight
  //     normal of 58) was DISCARDED and yesterday's 38ms afternoon served in its place — 0.58
  //     "Moderate" where the truth was 0.21, and higher even than the 0.42 that saying nothing
  //     would have given. Worse than both alternatives, on the day it matters most.
  //   * The daytime pool was never pinned, so it GREW all day and the median walked with it. One
  //     ordinary low reading (coffee, a stressful commute) took a user from "Ready" at 08:30 to
  //     "Take it easy" at 10:30 and back to "Ready" by 15:30. `pinToLastNight` exists precisely
  //     because the score used to drift; this reintroduced the drift, three times larger than the
  //     evening cliff that motivated the pin in the first place.
  //   * `isOvernightSample` cuts at 09:00, so a 09:15 reading during a lie-in counts as DAYTIME —
  //     and the daytime path never consults the sleep window, so the app held proof the user was
  //     still asleep and could not use it. Asleep HRV runs ~60% above their daytime normal, so
  //     that single sample became "61ms, above your usual 38" and the best score of the day.
  //   * All morning it served YESTERDAY afternoon as today, up to 20h old, with `stale` false and
  //     nothing in the UI to say so — the same trap the staleness rule closed for the overnight
  //     path, reintroduced one day shallower.
  //
  // A daytime-only wearer now sees no HRV tile, which is the honest answer: at real sampling
  // density their daytime reading swung across three verdict bands within one day, so it was
  // noise wearing a number's clothes. The score simply renormalises over resting HR and sleep,
  // held under what a typical HRV day would have scored.
  const res = attempt(all.filter(s => isOvernightSample(s.t)), hist.filter(s => isOvernightSample(s.t)), true, true);
  // `stale` only means something when we ended up with NOTHING.
  return res
    ? { hrv: res.hrv, baseline: res.baseline, nights: res.nights, stale: false }
    : { hrv: null, baseline: null, nights: 0, stale };
}


// THE RECOVERY SCORE, one definition. Takes a readRecovery-shaped object and returns 0..1,
// or null when no signal is present. Pure and exported: readRecovery needs a device, so this
// used to be replicated inside sim_recovery_scale and pinned to the source with regexes.
function recoveryScoreFrom(rec) {
  if (!rec) return null;
  // Recovery score 0..1 from whatever signals are available, weighted toward HRV.
  //
  // CENTRING: being exactly AT your own baseline must read as FINE, not as half.
  // Both heart terms used to map ratio 1.0 to 0.5, so a completely normal day scored 57% and any
  // ordinary wobble fell into "Take it easy": measured, HRV 5% under baseline + RHR 2% over +
  // 6.5h sleep = 37%. Mo reported exactly that reading while feeling great, and he was right.
  // A baseline is by definition your typical day; scoring it 50% guarantees the number spends most
  // of its life in the red, which is the same flaw the Body Battery scale had.
  //
  // Recentred so ratio 1.0 lands near 0.75 (in line with how Whoop/Oura/Garmin present "at
  // baseline"), WITHOUT softening the bottom: the floor still bites hard, and sim_recovery_scale
  // pins both ends — a genuinely wrecked day must stay under 40% or the number can no longer do
  // the one job it has.
  // THE TOP OF THE SCALE HAS TO BE EARNED. Both heart terms used to CLAMP: HRV hit a perfect 1.0
  // at just 8% above your own baseline, and resting HR at 2.5% below it. Everything past that —
  // +12%, +20%, double your baseline — scored identically, so "100/100 Body Battery" was reachable
  // on a good night rather than an exceptional one, and three genuinely different mornings all
  // reported the same number. Mo asked whether 100 was too generous; it was.
  //
  // Above baseline the curve is compressed and asymptotic instead of clamped, so it keeps rising
  // and only approaches 1.0 for a reading that is genuinely remarkable. BELOW baseline nothing
  // changes at all — the floor still bites exactly as hard, and a day at your own normal scores
  // precisely what it scored before, which is the same rule the activity soft-cap follows.
  const softTop = (linear, over, scale) => over <= 0 ? linear
    : linear + (1 - linear) * (1 - Math.exp(-over / scale));
  const comps = [];
  if (rec.hrv != null && rec.hrvBaseline) {
    const ratio = rec.hrv / rec.hrvBaseline;                  // <1 = HRV suppressed = under-recovered
    const atBase = (1 - 0.78) / 0.30;
    comps.push([ratio <= 1
      ? Math.max(0, Math.min(1, (ratio - 0.78) / 0.30))
      : softTop(atBase, ratio - 1, 0.18), 0.5]);
  }
  if (rec.restingHr != null && rec.rhrBaseline) {
    const ratio = rec.restingHr / rec.rhrBaseline;            // >1 = elevated RHR = under-recovered
    const atBase = (1.075 - 1) / 0.10;
    comps.push([ratio >= 1
      ? Math.max(0, Math.min(1, (1.075 - ratio) / 0.10))
      : softTop(atBase, 1 - ratio, 0.06), 0.25]);
  }
  if (rec.sleepHours != null) {
    const sh = rec.sleepHours;
    let sf = sh >= 8 ? 1 : sh >= 7 ? 0.78 : sh >= 6 ? 0.5 : sh >= 5 ? 0.28 : 0.12;
    // STAGE QUALITY. Duration still gates — five perfect hours are still five hours — but two
    // eight-hour nights are not equal if one had 20 minutes of deep sleep and the other 90.
    // Typical adult proportions are ~16% deep and ~21% REM of total sleep; `q` is 1.0 at those,
    // so a typical night is NEUTRAL and only genuinely poor or genuinely good composition moves
    // the number (±15% of the duration factor). Skipped entirely when the device reported no
    // stages, because unknown must not read as bad.
    if (rec.sleepDeepMin != null && sh > 0) {
      sf = Math.max(0, Math.min(1, sf * sleepQualityMult(rec.sleepDeepMin, rec.sleepRemMin, sh * 60)));
    }
    comps.push([sf, 0.25]);
  }
  if (!comps.length) return null;
  const wsum = comps.reduce((a, [, w]) => a + w, 0);
  const wtotal = comps.reduce((a, [v, w]) => a + v * w, 0);
  let score = wtotal / wsum;
  // RENORMALISING OVER THE SIGNALS PRESENT IS RIGHT — a missing one must never read as zero — BUT
  // IT ALSO MEANS AN ABSENT SIGNAL IS SCORED AS WHATEVER THE OTHERS SAY. Two consequences, both
  // measured, both in the flattering direction:
  //
  //   * A phone with no watch reports nothing but sleep duration, and eight hours in bed alone
  //     produced "100% — Ready to push", stated with exactly the confidence of a full read.
  //   * Worse, DROPPING HRV RAISED THE SCORE. At-baseline HRV maps to 0.73 while at-baseline
  //     resting HR maps to 0.75 and 8h sleep to 1.0, so a day where the watch failed to record
  //     HRV scored 87% against the same day's 80% with a complete, perfectly normal read. "We
  //     could not measure half your recovery" outranking "we measured it and it's fine" is the
  //     precise opposite of what this number is for.
  //
  // So an unknown HRV is ceilinged at what a TYPICAL one would have produced. Not substituted —
  // substituting would also lift a genuinely bad day — just used as the upper bound, which is all
  // "we don't know" entitles you to.
  if (rec.hrv == null || !rec.hrvBaseline) {
    const typical = Math.max(0, Math.min(1, (1 - 0.78) / 0.30));   // HRV exactly at baseline
    score = Math.min(score, (wtotal + typical * 0.5) / (wsum + 0.5));
  }
  // ...and a thin read cannot reach the top band at all. Deliberately pinned just under
  // recoveryVerdict's "Ready to push" threshold rather than written as a literal, so the two can't
  // drift apart. A FLAT `Math.min(score, 0.75)` was the first cut and it flattened the scale: the
  // sleep factor is >=0.78 for any night past 7h, so 7h, 8h and 9h all clamped to exactly 0.75 and
  // a phone-only user's number stopped telling them anything at all. Scaling the ceiling with the
  // weight present keeps the ordering intact — what a thin read loses is the top of the range,
  // not its ability to distinguish one night from another.
  const ceiling = wsum >= 0.75 ? 1 : wsum >= 0.5 ? 0.9 : READY_TO_PUSH - 0.01;
  score = Math.min(score, ceiling);
  return Math.round(score * 100) / 100;
}


// THE WHOLE RECOVERY PIPELINE, with HealthKit injected. Split out of readRecovery so it can be
// RUN rather than grepped: `sim_healthinputs` used to assert that certain regexes still matched
// this file, which can only notice if someone deletes a line — it could not catch the read cap
// silently truncating a night, a median turning back into a raw sample, or a stale block being
// accepted, because none of those change the text it was matching. `H` is any object with
// `readSamples({ dataType, startDate, endDate, limit, ascending })`; `now` is a Date.
// Returns { hrv: number|null, restingHr: number|null, sleepHours: number|null, capturedAt: iso },
// with each field null when that signal is genuinely absent — a MISSING signal is excluded from
// the score, never scored as zero (see recoveryScoreFrom).
async function readRecoveryFrom(H, now) {
  const endIso = now.toISOString();
  const startIso = new Date(now.getTime() - 1000 * 60 * 60 * 36).toISOString(); // last 36h
  // Overnight window for HRV: samples taken roughly during sleep (10pm–9am local) are the cleanest
  // recovery signal — daytime HRV is noisier (movement, stress, caffeine), which is why Whoop/Garmin/
  // Oura read it overnight. We isolate overnight HRV for BOTH today and the 60-day baseline so the
  // ratio stays apples-to-apples. If nothing is tagged overnight, we fall back to all samples.
  // (the overnight rule and the whole window decision now live in hrvReading, module level)

  // LIMIT 200 SILENTLY TRUNCATED THE NIGHT. The window is 36h — two nights — and the plugin
  // returns NEWEST FIRST, so hitting the cap drops the OLDEST rows: the beginning of last night.
  // An Apple Watch writes one row per stage segment (~30-60/night) and any second sleep source
  // (AutoSleep, Pillow, Sleep Cycle) doubles that, so the cap is reachable on ordinary setups.
  // Measured: a true 8.0h night reported as 6.7h at 240 rows and 5.7h at 280 — and because
  // sleepHours is a quarter of the recovery score, that alone took 87% down to 52%. Nothing
  // throws; the night just looks short, and sleepStart is wrong too, so the Body Battery recharge
  // window inherits the error. `ascending: false` is passed explicitly rather than relying on the
  // plugin's default, because two places below depend on the ordering.
  async function read(dataType, limit = 2000) {
    try {
      const r = await H.readSamples({ dataType, startDate: startIso, endDate: endIso, limit, ascending: false });
      const rows = (r && r.samples) ? r.samples : [];
      if (rows.length >= limit) devWarn(`health read hit the ${limit}-row cap for ${dataType} — the window may be truncated`);
      return rows;
    } catch (e) { return []; }
  }

  const out = { hrv: null, restingHr: null, sleepHours: null, capturedAt: endIso };

  // HRV (ms) — collect samples now; we decide the overnight-vs-all window JOINTLY with the baseline
  // below so today and the baseline always use the SAME window (never daytime-today vs overnight-baseline).
  let hrvAll = [];
  const hrv = await read("heartRateVariability");
  if (hrv.length) {
    hrvAll = hrv.map(s => ({ v: parseFloat(s.value), t: s.startDate ? new Date(s.startDate).getTime() : null })).filter(s => !isNaN(s.v));
  }
  // Resting HR (bpm) — most recent
  const rhr = await read("restingHeartRate");
  if (rhr.length) {
    // MEDIAN of the recent samples, not whichever row happens to be first. HealthKit does not
    // deduplicate and third-party sleep apps write restingHeartRate too, so a single raw sample is
    // "whichever source wrote last": measured, a watch reading 51 (exactly at baseline, 76%) became
    // 39% when a second app wrote 68 an hour later, and 89% when it wrote 44. The baseline it is
    // compared against is a 60-day MEDIAN, so today's figure has to be a median as well or the two
    // halves of the ratio aren't the same statistic — the same trap already fixed for HRV.
    // ...OF THE MOST RECENT DAY, NOT OF THE WHOLE 36h WINDOW. A median over the raw window was the
    // first cut and it quietly blended two days: an Apple Watch writes roughly ONE resting-HR
    // reading per morning, and a 36h lookback at 09:00 reaches back to 21:00 the day before
    // yesterday, so the window normally holds two — and the median of two numbers is their
    // average. Measured: yesterday 66 with today 62 displayed 64, and yesterday 70 with today 58
    // ALSO displayed 64. Mo saw exactly that. Grouping by day keeps the defence the median was
    // added for (several sources writing the same morning) without averaging across days.
    const rhrPts = rhr.map(x => ({ v: parseFloat(x.value), t: x.startDate ? new Date(x.startDate).getTime() : null }))
      .filter(x => !isNaN(x.v) && x.t != null);
    // BY NIGHT (noon-to-noon), NOT BY CALENDAR DAY. A calendar bucket splits at midnight, so a
    // single stray sample at 00:05 forms a group of ONE and becomes the whole reading — and the
    // median of one sample is that raw sample, which is exactly the "whichever source wrote last"
    // failure the median was added to prevent, just reachable across a date boundary instead of
    // within a window. Measured: watch 52 yesterday morning + a second source writing 80 at 00:05
    // reported 80. The rest of this file already buckets overnight signals noon-to-noon for the
    // same reason; the baseline below matches.
    const todayRhr = newestGroup(rhrPts, nightKeyOf, null);
    if (todayRhr.length) {
      out.restingHr = Math.round(medianOf(todayRhr.map(x => x.v)));
      // Age of the reading, so the UI can say "today" only when it's earned that — a watch that
      // hasn't synced yet means the newest group on hand can still be a night or more old. This is
      // NOT a nightKeyOf(now) comparison: nightKeyOf shifts by 12h to bucket NIGHTTIME samples, so
      // calling it on an arbitrary "now" during the day answers "which night is coming up tonight",
      // not "was this reading today" — a first cut of this used that comparison and it labeled a
      // 7am reading "yesterday" when checked that same afternoon.
      // A flat "hours since sample <= 20" cutoff (the second cut) has the SAME bug in the other
      // direction: checked at 3am with no new reading synced yet, a genuinely-yesterday 8am sample
      // is only 19h old and reads "today". "Today" means the reading's LOCAL CALENDAR DAY matches
      // now's, so compare calendar-day keys — anchored at local noon via dateFromKey, same as the
      // day-badge pattern elsewhere in this file (dKey()-based "Today"/"Yesterday"/"Nd ago"), which
      // survives DST because noon is never 12h from a zone transition.
      const newestT = Math.max(...todayRhr.map(x => x.t));
      const dayDiff = Math.round((dateFromKey(dateKeyOf(now.getTime())).getTime() - dateFromKey(dateKeyOf(newestT)).getTime()) / 86400000);
      out.restingHrAgeDays = Math.max(0, dayDiff);
    }
  }
  // Sleep — most recent night only. The 36h lookback can span two nights, so cluster:
  // keep asleep samples whose end falls within 14h of the latest sample's end. Also keep
  // the actual bed/wake TIMESTAMPS (sleepStart/sleepEnd) — the body battery uses them so
  // the recharge window and the awake-drain clock follow the user's real schedule instead
  // of an assumed 10pm-7am (night-shift lifters exist).
  const sleep = await read("sleep");
  if (sleep.length) {
    // ACCEPT BOTH "light" AND "core" — they are the same stage under two names, and this filter
    // is the ONLY input pickSleepBlock and stageMinutes ever see. The installed plugin maps
    // HKCategoryValueSleepAnalysis.asleepCore to "light" (Health.swift), so "core" never arrives
    // today; the dependency is pinned "^8.7.1" though, and adopting Apple's own naming is exactly
    // the sort of thing a minor bump does. Dropping it here is CATASTROPHIC and silent: core is
    // most of a night, so the surviving deep/REM fragments fall more than SLEEP_GAP_MIN apart,
    // pickSleepBlock splits them into blocks that all miss MIN_MAIN_SLEEP_H, and a 7.8h night is
    // reported as a 50-minute one with zero deep sleep. Nothing throws — the numbers just look
    // short. stageMinutes already handles both spellings; now the two agree.
    const asleepSamples = sleep.filter(s => {
      const st = (s.sleepState || "").toLowerCase();
      return st === "asleep" || st === "rem" || st === "deep" || st === "light" || st === "core";
    }).map(s => {
      const stage = (s.sleepState || "").toLowerCase();
      const startMs = s.startDate ? new Date(s.startDate).getTime() : null;
      const endMs = s.endDate ? new Date(s.endDate).getTime() : null;
      const span = (startMs != null && endMs != null && endMs > startMs) ? (endMs - startMs) / 60000 : 0;
      // `value` is DURATION IN MINUTES for every sleep row from this plugin (Health.swift writes
      // durationMinutes). `min(v, span)` therefore just guards the one real case: an aggregate row
      // reporting LESS sleep than its own span, i.e. net of time awake. (An older comment here
      // claimed per-stage rows carry a stage CODE in `value` — they don't, and if they ever did,
      // `min` would pick the code (3/4/5) as the minutes and collapse the night. Left as `min`
      // because it is correct for the payload we actually get; revisit if the plugin changes.)
      const v = parseFloat(s.value);
      return { startMs, endMs, stage, minutes: (!isNaN(v) && v > 0) ? (span ? Math.min(v, span) : v) : span };
    });
    const block = pickSleepBlock(asleepSamples);
    // AN ALL-NIGHTER MUST NOT REPORT THE NIGHT BEFORE. pickSleepBlock takes the most recent real
    // sleep in a 36h window with no recency check, so someone who didn't sleep last night was
    // handed the previous night's 7.5h and scored 76% — identical to having actually slept it.
    // The stale window also flows into pinToLastNight (no HRV inside a 24h-old window) and the
    // Body Battery recharge phase. Anything that ended before yesterday's 18:00 is not last night.
    // Elapsed hours, not a clock anchor. The first cut of this used "before the last local 18:00,
    // minus 24h" and the hour sweep in sim_healthinputs caught it accepting a 24-hour-stale block
    // at every hour from 08:00 to 17:00 — a clock-anchored cutoff lands in a different place
    // relative to last night depending on when you open the app. 20h keeps a night you woke from
    // this morning however late in the evening you look, and drops one you woke from yesterday.
    const STALE_SLEEP_MS = 20 * 36e5;
    if (block && (now.getTime() - block.endMs) > STALE_SLEEP_MS) {
      devWarn("health: most recent sleep block is stale (>24h old) — treating sleep as unknown");
    } else if (block) {
      if (block.minutes > 0) out.sleepHours = Math.round((block.minutes / 60) * 10) / 10;
      out.sleepStart = new Date(block.startMs).toISOString();
      out.sleepEnd = new Date(block.endMs).toISOString();
      // Per-stage minutes for the chosen night. We were reading these and throwing them away:
      // eight broken hours scored identically to eight restorative ones, and DEEP sleep is what
      // actually drives physical recovery. Absent (deep and REM both 0) means the device reported
      // an undifferentiated "asleep" — unknown, not bad, so quality is skipped in that case.
      const st = stageMinutes(asleepSamples, block.startMs, block.endMs);
      if (st.deep > 0 || st.rem > 0) {
        out.sleepDeepMin = st.deep; out.sleepRemMin = st.rem; out.sleepCoreMin = st.core;
      }
    }
  }

  // ── Personal baselines from the last 60 days (HRV + resting HR) ──
  // A reading only means something relative to YOUR normal, so we compare today to a 60-day median.
  const baseStartIso = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 60).toISOString();
  async function readRange(dataType) {
    try {
      const r = await H.readSamples({ dataType, startDate: baseStartIso, endDate: endIso, limit: 1000 });
      return (r && r.samples) ? r.samples.map(s => ({ v: parseFloat(s.value), t: s.startDate ? new Date(s.startDate).getTime() : null })).filter(s => !isNaN(s.v)) : [];
    } catch (e) { return []; }
  }
  const median = (arr) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const hrvHist = await readRange("heartRateVariability");
  const rhrHist = await readRange("restingHeartRate");
  // Which HRV samples count as "last night" and what "your normal" is — see hrvReading.
  const hr = hrvReading(hrvAll, hrvHist, out.sleepStart, out.sleepEnd, now.getTime());
  if (hr.stale) devWarn("health: newest HRV night is stale (>20h old) — treating HRV as unknown");
  if (hr.hrv != null) out.hrv = hr.hrv;
  out.hrvBaseline = hr.baseline;
  // Resting HR gets the same treatment: one value per DAY, and every day the 36h window that fed
  // out.restingHr touched is excluded, so today's reading isn't part of the median it's compared
  // against. By whole DAY KEY, not by timestamp — a timestamp cutoff leaves the partial remainder
  // of that day in as its own group, which is exactly the leak that let the scored night vote on
  // its own HRV baseline.
  const rhrBase = personalBaseline(rhrHist, nightKeyOf(now.getTime() - 1000 * 60 * 60 * 36), true);
  out.rhrBaseline = rhrBase.periods >= MIN_BASELINE_PERIODS ? rhrBase.value : null;
  // Now a real count of NIGHTS behind the baseline, not a row count. It used to be
  // `max(hrvHist.length, rhrHist.length)` — samples, not days — under a name that reads as days.
  out.baselineDays = Math.max(hr.nights, rhrBase.periods);

  // Resting-HR trend — a resting pulse that drifts DOWN over weeks is a classic getting-fitter
  // signal. Collapse the 60-day history to one median per day, then down-sample to ~12 points for
  // a sparkline. rhrTrendDelta is latest − oldest (negative = improving).
  if (rhrHist.length >= 4) {
    const perDay = {};
    for (const s of rhrHist) {
      if (s.t == null) continue;
      const d = new Date(s.t);
      const key = dateKeyOf(d);
      (perDay[key] = perDay[key] || []).push(s.v);
    }
    const days = Object.keys(perDay).sort();
    const dayVals = days.map(k => median(perDay[k]));
    if (dayVals.length >= 4) {
      const step = Math.max(1, Math.ceil(dayVals.length / 12));
      out.rhrSeries = dayVals.filter((_, i) => i % step === 0 || i === dayVals.length - 1).map(v => Math.round(v));
      out.rhrTrendDelta = Math.round(dayVals[dayVals.length - 1] - dayVals[0]);
    }
  }

  const rs = recoveryScoreFrom(out);
  if (rs != null) out.recoveryScore = rs;

  // ── VO₂ Max trend (cardio fitness) — Apple estimates it ~weekly from outdoor walks/runs.
  // Build a compact series over ~6 months for a sparkline + current value + change since oldest.
  try {
    const vo2StartIso = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 183).toISOString();
    const vr = await H.readSamples({ dataType: "vo2Max", startDate: vo2StartIso, endDate: endIso, limit: 400 });
    const vs = ((vr && vr.samples) || []).map(s => ({ v: parseFloat(s.value), t: s.startDate ? new Date(s.startDate).getTime() : null }))
      .filter(s => !isNaN(s.v) && s.v > 0 && s.t).sort((a, b) => a.t - b.t);
    if (vs.length) {
      out.vo2Max = Math.round(vs[vs.length - 1].v * 10) / 10;
      out.vo2MaxDelta = Math.round((vs[vs.length - 1].v - vs[0].v) * 10) / 10;
      const step = Math.max(1, Math.ceil(vs.length / 12)); // down-sample to ~12 points for a clean sparkline
      out.vo2MaxSeries = vs.filter((_, i) => i % step === 0 || i === vs.length - 1).map(s => Math.round(s.v * 10) / 10);
    }
  } catch (e) {}

  // ── Overnight illness / overtraining signals — respiratory rate + wrist temperature. Both drift
  // ABOVE your normal when the body is fighting something or badly under-recovered (Oura/Whoop use
  // them as early-warning). Report last night vs a 30-day median so it's personal, not absolute.
  try {
    const sigStartIso = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString();
    const lastNightMs = now.getTime() - 1000 * 60 * 60 * 20;
    for (const [dt, key] of [["respiratoryRate", "resp"], ["appleSleepingWristTemperature", "wristTemp"]]) {
      const rr = await H.readSamples({ dataType: dt, startDate: sigStartIso, endDate: endIso, limit: 1000 });
      const rows = ((rr && rr.samples) || []).map(s => ({ v: parseFloat(s.value), t: s.startDate ? new Date(s.startDate).getTime() : null })).filter(s => !isNaN(s.v) && s.t);
      if (!rows.length) continue;
      const recent = rows.filter(s => s.t >= lastNightMs);
      // `rows[rows.length - 1]` was the OLDEST sample, not the newest — the plugin returns
      // newest-first. So on any night the watch wasn't worn, "last night" became a reading up to
      // 30 days old: an illness a month ago kept firing "breathing rate up (21 vs 14/min) — your
      // body may be fighting something" every day since. Sort explicitly rather than trusting
      // order, since this is the second place that assumption has bitten.
      const newest = rows.reduce((a, b) => (b.t > a.t ? b : a), rows[0]);
      const latest = recent.length ? recent.reduce((a, b) => a + b.v, 0) / recent.length : newest.v;
      const base = median(rows.map(s => s.v));
      out[key] = Math.round(latest * 10) / 10;
      out[key + "Baseline"] = base != null ? Math.round(base * 10) / 10 : null;
    }
  } catch (e) {}

  if (out.hrv == null && out.restingHr == null && out.sleepHours == null && out.vo2Max == null) return null;
  return out;
}


export { ACTIVITY_KNEE, ANCHOR_SLACK_H, AWAKE_STEPS_PER_H, HOUR_KNEE, MAX_ANCHOR_SPAN_H, MAX_SLEEP_SPAN_H, MIN_BASELINE_PERIODS, MIN_MAIN_SLEEP_H, NIGHT_SHIFT_MS, READY_TO_PUSH, REST_KCAL_PER_H, REST_RECHARGE_PER_H, REST_STEPS_PER_H, SLEEP_GAP_MIN, STALE_HRV_MS, WORKOUT_KNEE, activityRawSinceWake, earliestActiveHourToday, hrvReading, isOvernightSample, isSmallHours, medianOf, newestGroup, nightKeyOf, personalBaseline, pickSleepBlock, pinToLastNight, recoveryScoreFrom, recoveryTimeHours, recoveryVerdict, restfulHourRecharge, sessionDrain, sleepQualityMult, softCap, softCapActivity, softCapHour, softCapWorkout, stageMinutes, trustedSleepWindow, computeBodyBattery, computeBodyBatteryTimeline, readRecoveryFrom };
