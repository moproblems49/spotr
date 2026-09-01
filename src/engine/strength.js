// STRENGTH & MUSCLE ANALYTICS — the strength score, per-muscle strength vs standards, weekly
// muscle volume, per-muscle readiness, and days-since-trained.
//
// Extracted from App.jsx verbatim; the maths is unchanged. Sits directly on top of exercises.js
// (name → muscle resolution) and workout.js (volume/1RM primitives): everything here reduces a
// history to per-muscle numbers some screen draws. Pure and device-free — no React, no HealthKit.
// The strength standards tables and their lookup ladder (weight-class interpolation, age factor,
// level bands) are module-private: nothing outside this file should ever read them directly, the
// score/level functions are the interface.
import { dateKeyOf, dKey, LBS_PER_KG, cvt, freshRecovery } from "./core.js";
import { resolveMuscle, getMuscle, getExerciseSecondaries, _regionsFor, _cleanMuscle } from "./exercises.js";
import { calc1RM } from "./workout.js";

// Weighted weekly training volume per body-map region. Each completed working set credits its
// exercise's primary muscle fully and each secondary muscle at half. Returns { "view:Region": sets }
// plus the total and a per-muscle summary used for the "most trained" caption.
function weeklyMuscleVolume(store, days = 7) {
  const cutoff = new Date(); cutoff.setHours(0,0,0,0); cutoff.setDate(cutoff.getDate() - (days - 1));
  const region = {}; const byMuscle = {}; let totalSets = 0;
  const add = (mn, w) => {
    const regs = _regionsFor(mn);
    regs.forEach(([v, r]) => { const k = v + ":" + r; region[k] = (region[k] || 0) + w; });
    // Normalize through _cleanMuscle before keying byMuscle — a PRIMARY credit arrives as
    // "Rear Delts" (every exercise's muscle: field) while a SECONDARY credit arrives as
    // "RearDelts" (every EXERCISE_SECONDARIES entry), and without this they silently split into
    // two separate keys. daysSinceMuscleTrained already normalizes; this writer didn't, so a
    // lifter's dedicated rear-delt work never made it into the Shoulders total below.
    if (regs.length) { const key = _cleanMuscle(mn); byMuscle[key] = (byMuscle[key] || 0) + w; }
  };
  const hist = store.history || {};
  for (const d of Object.keys(hist)) {
    if (new Date(d + "T12:00:00") < cutoff) continue;
    for (const sess of Object.values(hist[d] || {})) {
      for (const ex of (sess.exercises || [])) {
        const done = (ex.sets || []).filter(s => s.type !== "warmup" && (s.done === true || (s.done === undefined && parseFloat(s.reps) > 0))).length;
        if (!done) continue;
        totalSets += done;
        const primary = (typeof getMuscle === "function" && getMuscle(ex.name)) || (typeof resolveMuscle === "function" && resolveMuscle(ex.name)) || "";
        add(primary, done);
        const secs = getExerciseSecondaries(ex.name);
        secs.forEach(mn => add(mn, done * 0.5));
      }
    }
  }
  let max = 0; for (const k in region) max = Math.max(max, region[k]);
  return { region, byMuscle, totalSets, max };
}


// Per-region recovery readiness (0 = just trained / fatigued, 1 = fully recovered / ready), based on
// time since the muscle was last trained and that session's volume, lightly modified by recent sleep
// (poor sleep slows recovery). Regions with no recent training are treated as fully ready.
function muscleReadiness(store) {
  const now = Date.now();
  // v2 model: every recent session contributes fatigue that decays EXPONENTIALLY
  // (fast recovery early, slower tail), instead of only counting the most recent
  // session with a linear ramp. Two leg days close together now stack fatigue.
  const hits = {};   // "view:region" -> array of { ts, vol, rpeSum, rpeN } (merged per day)
  const freq28 = {}; // "view:region" -> distinct training days in the last 28 days
  const add = (mn, ts, w, rpeSum, rpeN, intMult) => {
    _regionsFor(mn).forEach(([v, r]) => {
      const k = v + ":" + r;
      const arr = hits[k] || (hits[k] = []);
      const same = arr.find(h => h.ts === ts);
      if (same) { same.vol += w; same.rpeSum += rpeSum; same.rpeN += rpeN; same.intSum += (intMult || 1) * w; same.intN += w; }
      else arr.push({ ts, vol: w, rpeSum, rpeN, intSum: (intMult || 1) * w, intN: w });
    });
  };
  const hist = store.history || {};
  for (const d of Object.keys(hist)) {
    const ts = new Date(d + "T12:00:00").getTime();
    if (isNaN(ts) || now - ts > 28 * 864e5) continue;
    for (const sess of Object.values(hist[d] || {})) {
      for (const ex of (sess.exercises || [])) {
        const working = (ex.sets || []).filter(s => s.type !== "warmup" && (s.done === true || (s.done === undefined && parseFloat(s.reps) > 0)));
        const done = working.length;
        if (!done) continue;
        let rpeSum = 0, rpeN = 0;
        working.forEach(s => { const r = parseFloat(s.rpe); if (!isNaN(r) && r > 0) { rpeSum += r; rpeN++; } });
        // Intensity proxy for lifters who don't log RPE: low-rep heavy work is more
        // fatiguing per set than high-rep pump work, and sets near your PR cost more.
        let repSum = 0, repN = 0, topW = 0;
        working.forEach(s => {
          const rr = parseFloat(s.reps); if (!isNaN(rr) && rr > 0) { repSum += rr; repN++; }
          const ww = parseFloat(s.weight); if (!isNaN(ww) && ww > topW) topW = ww;
        });
        const avgReps = repN ? repSum / repN : null;
        let intMult = avgReps == null ? 1 : avgReps <= 3 ? 1.15 : avgReps <= 5 ? 1.10 : avgReps <= 8 ? 1.05 : avgReps <= 12 ? 1.0 : avgReps <= 20 ? 0.95 : 0.9;
        const prLbs = (store.prs || {})[ex.name];
        if (prLbs > 0 && topW > 0) {
          const topLbs = (sess.unit === "kg") ? topW * LBS_PER_KG : topW;
          const ratio = topLbs / prLbs;
          if (ratio >= 0.92) intMult += 0.08; else if (ratio >= 0.85) intMult += 0.04; else if (ratio < 0.6) intMult -= 0.05;
        }
        intMult = Math.max(0.9, Math.min(1.2, intMult));
        const primary = (typeof getMuscle === "function" && getMuscle(ex.name)) || (typeof resolveMuscle === "function" && resolveMuscle(ex.name)) || "";
        add(primary, ts, done, rpeSum, rpeN, intMult);
        const secs = getExerciseSecondaries(ex.name);
        secs.forEach(mn => add(mn, ts, done * 0.5, rpeSum, rpeN, intMult));
      }
    }
  }
  // Adaptive recovery: learn from whether the lifter holds performance on short rest.
  // recoverFast > 1 means they bounce back quicker than default; < 1 means slower.
  const adaptiveRecovery = (() => {
    try {
      const sessions = [];
      for (const d of Object.keys(hist)) {
        const ts = new Date(d + "T12:00:00").getTime();
        if (isNaN(ts) || now - ts > 28 * 864e5) continue;
        for (const sess of Object.values(hist[d] || {})) {
          for (const ex of (sess.exercises || [])) {
            const w = Math.max(0, ...(ex.sets || []).filter(s => s.type !== "warmup" && s.done).map(s => parseFloat(s.weight) || 0));
            if (w > 0 && ex.name) sessions.push({ ts, name: ex.name, w });
          }
        }
      }
      sessions.sort((a, b) => a.ts - b.ts);
      // For each exercise repeated within 72h, did the weight hold or rise?
      let holds = 0, drops = 0;
      const byName = {};
      for (const s of sessions) {
        const prev = byName[s.name];
        if (prev && (s.ts - prev.ts) < 72 * 36e5 && (s.ts - prev.ts) > 12 * 36e5) {
          if (s.w >= prev.w * 0.97) holds++; else drops++;
        }
        byName[s.name] = s;
      }
      const total = holds + drops;
      if (total < 4) return 1; // not enough signal — stay at default
      const holdRate = holds / total;
      // 80%+ hold rate → recovers ~15% faster; 40% → ~15% slower.
      return Math.max(0.85, Math.min(1.15, 0.7 + holdRate * 0.55));
    } catch (e) { return 1; }
  })();
  let recMod = adaptiveRecovery;
  // ★ THE SAME 36h GATE THE BODY BATTERY USES. Gating charge0 and leaving this ungated made ONE
  // SHEET internally inconsistent: the headline correctly fell back to the training-recency
  // estimate while the driver tiles beside it still printed a week-old HRV and "Today's pulse 48
  // bpm", and the muscle map stayed coloured by a stale recoveryScore. Previously the whole screen
  // was wrong-but-consistent; a partial fix is worse than that, because the two halves now
  // contradict each other. `freshRecovery` lives in core.js precisely so this module can reach it
  // — strength.js must never import health.js, and the layering is asserted by the extractor.
  const rec = freshRecovery(store, new Date());
  if (rec && typeof rec.recoveryScore === "number") {
    recMod *= (0.8 + 0.4 * rec.recoveryScore); // HRV recovery layered on the adaptive base
  } else if (rec && typeof rec.sleepHours === "number") {
    if (rec.sleepHours < 6) recMod *= 0.9;
    else if (rec.sleepHours >= 8) recMod *= 1.08;
  }
  recMod = Math.max(0.7, Math.min(1.35, recMod));
  // Larger muscles recover slower than small ones (multiplier on recovery time).
  // Big compound-movement muscles (quads/hams/glutes/back/chest) are deliberately
  // slow here: a real hypertrophy session should NOT read fully green ~24h later —
  // performance + DOMS recovery for these is typically 48-72h. Small muscles
  // (arms/calves/abs) bounce back closer to a day.
  const RATE = { Quads:1.6, Hamstrings:1.6, Glutes:1.55, Lats:1.5, LowerBack:1.45, Traps:1.2, Chest:1.25, Shoulders:1.15, "Rear Delts":1.0, Biceps:0.85, Triceps:0.85, Forearms:0.75, Calves:0.9, Abs:0.8, Obliques:0.8 };
  const readiness = {};
  let usedRpe = false;
  for (const k in hits) {
    const region = k.split(":")[1];
    const rate = RATE[region] || 1;
    // Repeated-bout effect: muscles trained often recover faster.
    const freq = (freq28[k] = hits[k].length);
    const freqMult = freq >= 8 ? 0.85 : freq >= 5 ? 0.92 : 1;
    let residual = 0;
    for (const { ts, vol, rpeSum, rpeN, intSum, intN } of hits[k]) {
      const avgRpe = rpeN > 0 ? rpeSum / rpeN : null;
      if (avgRpe) usedRpe = true;
      // With RPE: explicit effort. Without: the rep-range + PR-proximity proxy.
      const rpeMult = avgRpe ? Math.max(0.85, Math.min(1.25, 0.6 + 0.06 * avgRpe)) : (intN > 0 ? intSum / intN : 1);
      const hoursSince = (now - ts) / 36e5;
      // Same volume->hours scaling as v1, converted to an exponential time constant
      // (~95% recovered at the old "fully recovered" mark).
      const tau = ((40 + Math.min(vol, 20) * 2.2) * rate * freqMult * rpeMult / recMod) / 3;
      const fatigue0 = Math.min(1.4, 0.45 + vol / 14) * rpeMult;
      residual += fatigue0 * Math.exp(-hoursSince / tau);
    }
    readiness[k] = Math.max(0, Math.min(1, 1 - residual));
  }
  return { readiness, recMod, rec, usedRpe, anyData: Object.keys(hits).length > 0 };
}


// Strength score — rates the user's main lifts relative to bodyweight against population
// standards, returning a level (Untrained→World Class) per lift plus an overall, by sex.
// For the 8 main lifts covered by STRENGTH_WEIGHT_CLASS_LBS below (both sexes), thresholds
// are real sourced data (Symmetric Strength, no-age 1RM standards) interpolated by the user's
// actual bodyweight — NOT a fixed bodyweight-multiple, because the real ratio shifts with
// bodyweight (e.g. male Back Squat Untrained is ~0.80x BW at 150 lb but ~0.62x BW at 250 lb).
// The fixed-ratio numbers below are the FALLBACK for the accessory lifts with no weight-class
// table (no published standard exists for these): Romanian Deadlift and Hip Thrust (scored),
// plus Standing Calf Raise (NOT scored — it's listed in STRENGTH_MAP_ONLY_LIFTS so the muscle-
// balance body map can shade the calves region, but it never counts toward the strength score).
// Their Proficient values are the geometric mean of Intermediate/Advanced (a midpoint
// multiplicative step) since that tier isn't independently sourced for these lifts.
const STRENGTH_STANDARDS_BY_SEX = {
  male: {
    "Barbell Bench Press":     { Novice:0.5, Intermediate:0.75, Proficient:0.97, Advanced:1.25, Exceptional:1.5, Elite:1.75, WorldClass:2.45 },
    "Barbell Back Squat":      { Novice:0.75, Intermediate:1.25, Proficient:1.48, Advanced:1.75, Exceptional:2.1, Elite:2.5, WorldClass:3.55 },
    "Deadlift":                { Novice:1.0, Intermediate:1.5, Proficient:1.84, Advanced:2.25, Exceptional:2.6, Elite:3.0, WorldClass:4.0 },
    "Sumo Deadlift":           { Novice:1.0, Intermediate:1.5, Proficient:1.82, Advanced:2.2, Exceptional:2.5, Elite:2.9, WorldClass:3.8 },
    "Overhead Press (Barbell)":{ Novice:0.35, Intermediate:0.55, Proficient:0.66, Advanced:0.8, Exceptional:0.95, Elite:1.1, WorldClass:1.5 },
    "Incline Bench Press":     { Novice:0.4, Intermediate:0.6, Proficient:0.77, Advanced:1.0, Exceptional:1.2, Elite:1.45, WorldClass:2.1 },
    "Front Squat":             { Novice:0.55, Intermediate:0.95, Proficient:1.15, Advanced:1.4, Exceptional:1.65, Elite:2.0, WorldClass:2.85 },
    "Barbell Row":             { Novice:0.5, Intermediate:0.75, Proficient:0.91, Advanced:1.1, Exceptional:1.3, Elite:1.5, WorldClass:2.05 },
    "Romanian Deadlift":       { Novice:0.6, Intermediate:1.0, Proficient:1.26, Advanced:1.6, Exceptional:1.9, Elite:2.2, WorldClass:3.0 },
    "Hip Thrust":              { Novice:1.0, Intermediate:1.5, Proficient:1.84, Advanced:2.25, Exceptional:2.6, Elite:3.0, WorldClass:4.0 },
    "Standing Calf Raise":     { Novice:1.0, Intermediate:1.7, Proficient:2.06, Advanced:2.5, Exceptional:2.9, Elite:3.4, WorldClass:4.6 },
  },
  female: {
    "Barbell Bench Press":     { Novice:0.3, Intermediate:0.5, Proficient:0.63, Advanced:0.8, Exceptional:0.95, Elite:1.1, WorldClass:1.5 },
    "Barbell Back Squat":      { Novice:0.5, Intermediate:0.9, Proficient:1.1, Advanced:1.35, Exceptional:1.6, Elite:1.9, WorldClass:2.65 },
    "Deadlift":                { Novice:0.65, Intermediate:1.1, Proficient:1.39, Advanced:1.75, Exceptional:2.1, Elite:2.5, WorldClass:3.55 },
    "Sumo Deadlift":           { Novice:0.65, Intermediate:1.1, Proficient:1.37, Advanced:1.7, Exceptional:2.05, Elite:2.45, WorldClass:3.55 },
    "Overhead Press (Barbell)":{ Novice:0.2, Intermediate:0.35, Proficient:0.44, Advanced:0.55, Exceptional:0.65, Elite:0.8, WorldClass:1.15 },
    "Incline Bench Press":     { Novice:0.25, Intermediate:0.4, Proficient:0.51, Advanced:0.65, Exceptional:0.8, Elite:0.95, WorldClass:1.4 },
    "Front Squat":             { Novice:0.4, Intermediate:0.7, Proficient:0.88, Advanced:1.1, Exceptional:1.35, Elite:1.6, WorldClass:2.35 },
    "Barbell Row":             { Novice:0.3, Intermediate:0.5, Proficient:0.61, Advanced:0.75, Exceptional:0.9, Elite:1.1, WorldClass:1.6 },
    "Romanian Deadlift":       { Novice:0.4, Intermediate:0.75, Proficient:0.95, Advanced:1.2, Exceptional:1.45, Elite:1.7, WorldClass:2.4 },
    "Hip Thrust":              { Novice:0.75, Intermediate:1.25, Proficient:1.54, Advanced:1.9, Exceptional:2.2, Elite:2.6, WorldClass:3.55 },
    "Standing Calf Raise":     { Novice:0.6, Intermediate:1.15, Proficient:1.46, Advanced:1.85, Exceptional:2.25, Elite:2.7, WorldClass:3.95 },
  },
};

// Real Symmetric Strength weight-class standards (no age, 1-rep maxes, lbs), per sex, for the
// 8 main lifts they publish a comparable standard for. Keys are anchor bodyweights (lb); each
// value array is [Untrained, Novice, Intermediate, Proficient, Advanced, Exceptional, Elite,
// World Class]. computeStrengthScore interpolates between anchors by the user's actual
// bodyweight (and linearly extrapolates past the ends using the nearest segment's slope)
// instead of using a single fixed ratio, since the real ratio is NOT constant across bodyweight.
const STRENGTH_WEIGHT_CLASS_LBS = {
  male: {
    "Barbell Back Squat":       { 150:[120,180,240,300,350,395,445,495], 208:[145,220,295,365,425,490,550,610], 250:[155,235,315,390,455,520,585,650] },
    "Front Squat":              { 150:[95,145,190,240,280,320,360,395],  208:[115,175,235,295,340,390,440,490], 250:[125,190,250,315,365,420,470,520] },
    "Deadlift":                 { 150:[135,205,275,345,400,455,515,570], 208:[170,250,335,420,490,560,630,700], 250:[180,270,360,450,525,600,675,750] },
    "Sumo Deadlift":            { 150:[135,205,275,345,400,455,515,570], 208:[170,250,335,420,490,560,630,700], 250:[180,270,360,450,525,600,675,750] },
    "Barbell Bench Press":      { 150:[90,135,180,225,260,295,335,370],  208:[110,165,220,275,320,365,410,455], 250:[115,175,235,295,340,390,440,485] },
    "Incline Bench Press":      { 150:[75,110,145,185,215,245,275,305],  208:[90,135,180,225,260,300,335,375],  250:[95,145,190,240,280,320,360,400] },
    "Overhead Press (Barbell)": { 150:[60,85,115,145,170,195,215,240],   208:[70,105,140,180,205,235,265,295],  250:[75,115,150,190,220,255,285,315] },
    "Barbell Row":              { 150:[75,110,145,180,210,240,270,305],  208:[90,135,180,225,260,295,335,370],  250:[95,145,190,240,280,320,360,395] },
  },
  female: {
    "Barbell Back Squat":       { 100:[65,100,135,165,195,225,250,280],  130:[80,120,165,205,240,270,305,340],  180:[100,155,205,255,295,340,380,425] },
    "Front Squat":              { 100:[55,80,105,135,155,180,200,225],   130:[65,100,130,165,190,220,245,270],  180:[80,120,165,205,240,270,305,340] },
    "Deadlift":                 { 100:[80,120,160,200,230,265,300,330],  130:[95,145,195,245,285,325,365,405],  180:[120,180,245,305,355,405,455,505] },
    "Sumo Deadlift":            { 100:[80,120,160,200,230,265,300,330],  130:[95,145,195,245,285,325,365,405],  180:[120,180,245,305,355,405,455,505] },
    "Barbell Bench Press":      { 100:[45,70,90,115,130,150,170,190],    130:[55,85,110,140,160,185,210,230],   180:[70,105,140,175,200,230,260,290] },
    "Incline Bench Press":      { 100:[35,55,75,95,110,125,140,155],     130:[45,70,90,115,130,150,170,190],    180:[55,85,115,140,165,190,215,235] },
    "Overhead Press (Barbell)": { 100:[30,45,60,75,85,100,110,125],      130:[35,55,70,90,105,120,135,150],     180:[45,65,90,110,130,150,170,185] },
    "Barbell Row":              { 100:[40,65,85,105,125,140,160,175],    130:[50,75,105,130,150,170,195,215],   180:[65,95,130,160,190,215,240,270] },
  },
};

const STRENGTH_WC_LEVEL_KEYS = ["Novice","Intermediate","Proficient","Advanced","Exceptional","Elite","WorldClass"];

// Interpolates (or extrapolates past the table's ends) this lift's level thresholds at a given
// bodyweight for the given sex, then expresses them as bodyweight ratios so the result drops
// into the same ratio-based scoring path as the fixed-table lifts. Returns null if this
// sex/lift has no real weight-class data (caller should fall back to the fixed-ratio table).
function weightClassRatios(sex, lift, bwLbs) {
  const table = (STRENGTH_WEIGHT_CLASS_LBS[sex] || {})[lift];
  if (!table || !bwLbs || bwLbs <= 0) return null;
  const anchors = Object.keys(table).map(Number).sort((a, b) => a - b);
  let lo = anchors[0], hi = anchors[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    if (bwLbs >= anchors[i]) { lo = anchors[i]; hi = anchors[i + 1]; }
  }
  const t = (bwLbs - lo) / (hi - lo);
  const loVals = table[lo], hiVals = table[hi];
  const out = {};
  STRENGTH_WC_LEVEL_KEYS.forEach((key, i) => {
    const idx = i + 1; // index 0 in the arrays is Untrained, which has no standards key
    const abs = loVals[idx] + t * (hiVals[idx] - loVals[idx]);
    out[key] = Math.max(0, abs) / bwLbs;
  });
  return out;
}

// Builds the effective standards object for a sex at this bodyweight: real weight-class ratios
// where available, the fixed-ratio fallback (accessory lifts) otherwise.
function standardsForBw(sex, bwLbs) {
  const base = STRENGTH_STANDARDS_BY_SEX[sex] || STRENGTH_STANDARDS_BY_SEX.male;
  const out = {};
  for (const lift of Object.keys(base)) {
    out[lift] = weightClassRatios(sex, lift, bwLbs) || base[lift];
  }
  return out;
}

const STRENGTH_LIFT_ALIASES = {
  "Barbell Bench Press": ["Bench Press","Flat Barbell Bench","Flat Bench"],
  "Barbell Back Squat": ["Back Squat","Low Bar Squat","High Bar Squat","Squat"],
  "Deadlift": ["Conventional Deadlift","Trap Bar Deadlift","Hex Bar Deadlift"],
  "Sumo Deadlift": ["Sumo Pull","Sumo DL"],
  "Overhead Press (Barbell)": ["Overhead Press","OHP","Standing Barbell OHP","Standing OHP","Standing Press","Strict Press","Military Press","Barbell OHP","Barbell Overhead Press"],
  "Incline Bench Press": ["Incline Barbell Press","Incline Bench","Incline Press"],
  "Front Squat": ["Barbell Front Squat"],
  "Barbell Row": ["Bent-Over Row","Barbell Bent-Over Row","Pendlay Row","Bent Over Barbell Row","BB Row"],
  "Romanian Deadlift": ["RDL","Barbell RDL","Stiff-Leg Deadlift","Stiff Leg Deadlift"],
  "Hip Thrust": ["Barbell Hip Thrust","Glute Bridge","Barbell Glute Bridge"],
};

const STRENGTH_LEVELS = ["Untrained","Novice","Intermediate","Proficient","Advanced","Exceptional","Elite","World Class"];

// Control points (one per STRENGTH_LEVELS index) for the headline 0-100 score. A straight linear
// mapping pins 100 to World Class (literal world-record territory), which makes everyday strong
// lifters score punishingly low. This curve front-loads the range so the levels most people
// actually occupy (Novice..Advanced) are spread across more of 0-100, while Elite/World Class
// still sit at the top — the level LABELS themselves are unaffected, only this display number.
// Tuned to be motivating for the average trained lifter: a solid Intermediate (genuinely above
// the typical gym-goer) lands ~60, Advanced ~84 — not the "45/100 feels like a fail" of before.
// Elite/World Class barely move (97/100), so the top of the scale still means what it says.
const STRENGTH_SCORE_CURVE = [0, 38, 60, 73, 84, 92, 97, 100];

// Converts a raw strength level fraction (levelIdx / 7, as stored in regionFrac) to the
// DISPLAY fraction used for map coloring and the "Lagging" cutoff — through the same curve
// as the headline score, so every strength surface tells one story. Raw lvl/7 painted an
// Intermediate lifter (a solid, above-average gym-goer) at 29% = angry red; through the
// curve they sit at 0.60 = amber-green, matching their 60/100 score. The analytic values
// underneath (imbalance detection) stay raw — only what the user SEES is curved.
function _strengthDisplayFrac(frac) {
  const lvl = Math.max(0, Math.min(STRENGTH_SCORE_CURVE.length - 1, Math.round((frac || 0) * (STRENGTH_LEVELS.length - 1))));
  return STRENGTH_SCORE_CURVE[lvl] / 100;
}


// Movement patterns: lifts that compete for the SAME slot in the score. The strongest
// lift in each pattern represents you — so front + back squat don't both drag the average
// (your best squat counts), and incline vs flat bench pick the better one.
const STRENGTH_PATTERNS = {
  "Squat":    ["Barbell Back Squat", "Front Squat"],
  "Bench":    ["Barbell Bench Press", "Incline Bench Press"],
  "Deadlift": ["Deadlift", "Sumo Deadlift"],
  "Press":    ["Overhead Press (Barbell)"],
  "Row":      ["Barbell Row"],
  "RDL":      ["Romanian Deadlift"],
  "Hinge":    ["Hip Thrust"],
};


// The headline 0-100 score / overall level averages only the user's BEST this-many patterns,
// dropping their weakest few. Lifts you train hard as accessories for reps (often a hinge or
// the press) score low and drag the average on shaky data; counting each person's strongest
// patterns keeps the number representative without singling out specific lifts. All winners
// still appear in `lifts` (per-lift list + body map) regardless of whether they're counted.
const STRENGTH_SCORE_TOP_N = 5;


// Lifts evaluated for the muscle-balance body map ONLY — they get a level so their region can
// be shaded, but are deliberately excluded from STRENGTH_PATTERNS so they never count toward
// the strength score (no real per-bodyweight standard exists, so scoring them would dilute it).
const STRENGTH_MAP_ONLY_LIFTS = ["Standing Calf Raise"];


// Age multiplier on strength standards. Strength peaks ~20-30; after 35 it declines ~1%/yr,
// accelerating past 50. Below 18, standards are slightly lower too. The thresholds are
// MULTIPLIED by this factor (≤1 outside the prime years), so an older or younger lifter
// reaches each level at a proportionally lower ratio — age-fair scoring rather than
// comparing a 55-year-old to a 25-year-old's numbers.
function ageStrengthFactor(age) {
  if (!age || age < 1) return 1;
  if (age < 18) return 0.92 + (age - 14) * 0.02;        // 14→0.92 .. 18→1.0
  if (age <= 30) return 1;                               // prime
  if (age <= 35) return 1 - (age - 30) * 0.005;          // gentle
  if (age <= 50) return 0.975 - (age - 35) * 0.01;       // ~1%/yr
  return Math.max(0.6, 0.825 - (age - 50) * 0.014);      // steeper past 50
}

function levelForRatio(standards, lift, ratio, ageFactor = 1) {
  const s = standards[lift];
  if (!s) return "Untrained";
  const f = ageFactor || 1;
  if (ratio >= s.WorldClass * f) return "World Class";
  if (ratio >= s.Elite * f) return "Elite";
  if (ratio >= s.Exceptional * f) return "Exceptional";
  if (ratio >= s.Advanced * f) return "Advanced";
  if (ratio >= s.Proficient * f) return "Proficient";
  if (ratio >= s.Intermediate * f) return "Intermediate";
  if (ratio >= s.Novice * f) return "Novice";
  return "Untrained";
}


// The strength-score curve on your profile: replay the score as it stood at a series of past
// cutoffs. Raw current-PR fallbacks are excluded so an old snapshot cannot see future bests,
// and `asOf` makes the stale-lift decay relative to each snapshot rather than to today.
// Module level and exported because it was inline in ProfileScreen, where the only way to
// check it was to look at the chart and squint.
function strengthScoreHistory(store, unit, sex, now) {

    const hist = store.history || {};
    const dates = Object.keys(hist).sort();
    if (dates.length < 2) return null;
    const firstMs = new Date(dates[0] + "T12:00:00").getTime();
    // Adaptive granularity. The threshold used to be 12 weeks, which is far too early: at 84
    // days a monthly chart has only THREE month-ends to draw, so an account that had just
    // crossed the line went from a dozen weekly points to a nearly empty chart. Monthly only
    // earns its place once there are enough months to make a curve — about eight.
    const spanDays = (now.getTime() - firstMs) / 864e5;
    const weekly = spanDays < 240;
    const snapshots = [];
    if (weekly) {
      const nWeeks = Math.min(11, Math.floor(spanDays / 7));
      for (let i = nWeeks; i >= 1; i--) snapshots.push(new Date(now.getTime() - i * 7 * 864e5));
    } else {
      for (let i = 11; i >= 1; i--) {
        const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0); // last day of that month
        if (mEnd.getTime() >= firstMs) snapshots.push(mEnd);
      }
    }
    snapshots.push(now);
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const pts = snapshots.map((d, i) => {
      const cutoff = dateKeyOf(d);
      const histCut = {};
      for (const k of dates) { if (k <= cutoff) histCut[k] = hist[k]; }
      if (!Object.keys(histCut).length) return null;
      // THE STRENGTH SCORE IS BODYWEIGHT-RELATIVE, so a snapshot needs a weight — but dropping
      // every snapshot before your FIRST weigh-in threw away real training history. Measured on
      // live data: first workout 10 May, first body-log entry 4 June, so the 31 May snapshot was
      // discarded and a three-month-old account with 58 workouts drew THREE points. Bodyweight
      // moves slowly; the earliest weight on record is a far better stand-in than nothing.
      let bodyLog = (store.bodyLog || []).filter(bp => (bp.date || "") <= cutoff);
      if (!bodyLog.length) {
        const earliest = [...(store.bodyLog || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
        if (!earliest) return null;
        bodyLog = [{ ...earliest, date: cutoff }];
      }
      const snap = computeStrengthScore(
        { ...store, history: histCut, bodyLog, prs: {}, prEvents: (store.prEvents || []).filter(e => (e.date || "") <= cutoff) },
        unit, sex, d.getTime()
      );
      if (!snap.ready) return null;
      return { value: snap.score, date: cutoff, label: i === snapshots.length - 1 ? "Now" : (weekly ? `${d.getMonth()+1}/${d.getDate()}` : MONTHS[d.getMonth()]) };
    }).filter(Boolean);
    return pts.length >= 2 ? pts : null;
}

// sex: "male" | "female" | "other". Standards are physiological, so "other" uses the midpoint
// of the male/female thresholds (a neutral baseline) rather than forcing a binary choice.
// Returns { overall, score (0-100), lifts:[{lift, best, ratio, level}], bodyweight, sex } or
// { ready:false } if there isn't enough data (no bodyweight or no main-lift PRs).
function computeStrengthScore(store, unit, sex = "male", asOf = null) {
  const nowMs = asOf || Date.now();
  const bodyLog = [...(store.bodyLog || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const bw = bodyLog.length ? parseFloat(bodyLog[0].weight) : null;
  if (!bw || bw <= 0) return { ready: false, reason: "no_bodyweight" };
  // Bodyweight drives every ratio below — flag when it's stale so a months-old weigh-in
  // doesn't silently masquerade as today's number.
  const bwDate = bodyLog[0].date;
  const bodyweightAgeDays = bwDate ? Math.round((nowMs - new Date(bwDate + "T12:00:00").getTime()) / 864e5) : null;
  // The weight-class table is in lbs, so the real-data interpolation needs bodyweight in lbs
  // regardless of the user's display unit.
  const bwLbs = unit === "kg" ? bw * LBS_PER_KG : bw;
  let standards;
  if (sex === "other") {
    // Average the male & female bodyweight-aware thresholds for a neutral baseline.
    const m = standardsForBw("male", bwLbs), f = standardsForBw("female", bwLbs);
    standards = {};
    for (const lift of Object.keys(m)) {
      standards[lift] = {};
      for (const lvl of Object.keys(m[lift])) {
        standards[lift][lvl] = (m[lift][lvl] + f[lift][lvl]) / 2;
      }
    }
  } else {
    standards = standardsForBw(sex, bwLbs);
  }
  const prs = store.prs || {};
  // Normalize for tolerant matching — strips parentheticals like "(heavy)", punctuation, casing.
  const norm = (s) => (s || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  // Keyword signatures so a PR logged under almost any sensible name still maps to a scored lift.
  // Exclusions prevent double-counting (e.g. incline bench must not also count as flat bench).
  const LIFT_KEYWORDS = {
    "Barbell Bench Press": (n) => n.includes("bench") && !n.includes("incline") && !n.includes("decline") && !n.includes("close grip") && !n.includes("db") && !n.includes("dumbbell") && !n.includes("smith") && !n.includes("machine") && !n.includes("floor"),
    "Barbell Back Squat": (n) => n.includes("squat") && !n.includes("front") && !n.includes("hack") && !n.includes("goblet") && !n.includes("split") && !n.includes("sissy") && !n.includes("bulgarian") && !n.includes("smith") && !n.includes("machine") && !n.includes("belt") && !n.includes("pendulum"),
    "Deadlift": (n) => n.includes("deadlift") && !n.includes("romanian") && !n.includes("rdl") && !n.includes("stiff") && !n.includes("single") && !n.includes("sumo"),
    "Sumo Deadlift": (n) => n.includes("sumo") && n.includes("deadlift"),
    "Overhead Press (Barbell)": (n) => (n.includes("overhead press") || n.includes("ohp") || n.includes("military") || (n.includes("strict press")) || (n.includes("shoulder press") && n.includes("barbell"))) && !n.includes("db") && !n.includes("dumbbell") && !n.includes("machine"),
    "Incline Bench Press": (n) => n.includes("incline") && (n.includes("bench") || n.includes("press")) && !n.includes("db") && !n.includes("dumbbell") && !n.includes("machine") && !n.includes("smith"),
    "Front Squat": (n) => n.includes("front squat"),
    "Barbell Row": (n) => (n.includes("barbell row") || n.includes("bent over row") || n.includes("bent-over row") || n.includes("pendlay") || (n.includes("bb row"))) && !n.includes("db") && !n.includes("dumbbell") && !n.includes("cable") && !n.includes("machine") && !n.includes("seated"),
    "Romanian Deadlift": (n) => n.includes("romanian") || n.includes("rdl") || n.includes("stiff leg") || n.includes("stiff-leg"),
    "Hip Thrust": (n) => n.includes("hip thrust") || n.includes("glute bridge"),
    // Standing/smith calf raises only — seated and leg-press variants load very differently.
    // Map-only (see STRENGTH_MAP_ONLY_LIFTS): shades the calves region, not part of the score.
    "Standing Calf Raise": (n) => n.includes("calf") && (n.includes("raise") || n.includes("press")) && !n.includes("seated") && !n.includes("leg press") && !n.includes("single") && !n.includes("donkey"),
  };
  // Strength standards are defined against a 1-REP MAX. store.prs holds the heaviest raw weight
  // lifted (any rep count), which understates strength for higher-rep PRs. So we estimate 1RM
  // from the best set in history per lift (Epley via calc1RM), which is the correct comparison.
  const histUnit = unit;
  const liftBestE1RM = {}; // canonical lift -> best estimated 1RM (in display unit)
  const scanMatch = (name) => {
    for (const canonical of Object.keys(standards)) {
      const kw = LIFT_KEYWORDS[canonical];
      const aliasNames = [canonical, ...(STRENGTH_LIFT_ALIASES[canonical] || [])];
      if (aliasNames.includes(name) || (kw && kw(norm(name)))) return canonical;
    }
    return null;
  };
  for (const d of Object.keys(store.history || {})) {
    for (const sess of Object.values(store.history[d] || {})) {
      const sUnit = sess.unit || histUnit;
      for (const ex of (sess.exercises || [])) {
        if (!ex.name) continue;
        const canonical = scanMatch(ex.name);
        if (!canonical) continue;
        for (const s of (ex.sets || [])) {
          if (s.type === "warmup") continue;
          const done = s.done === true || (s.done === undefined && parseFloat(s.reps || s.r) > 0);
          if (!done) continue;
          const w = parseFloat(s.weight ?? s.w);
          const r = parseInt(s.reps ?? s.r);
          if (!w || !r || r < 1) continue;
          // Epley is unreliable past ~10 reps (a 20-rep set wildly inflates e1RM), so cap
          // the rep input — high-rep sets still count, just conservatively.
          const e1rmRaw = calc1RM(w, Math.min(r, 10));
          if (!e1rmRaw) continue;
          // Normalize to the display unit used for bodyweight comparison.
          let e1rm = sUnit === unit ? e1rmRaw : cvt(e1rmRaw, sUnit, unit);
          // A max from 8 months ago overstates current strength after a layoff — decay
          // bests older than 4 months by ~1.2%/month, floored at 85%.
          const ageDays = (nowMs - new Date(d + "T12:00:00").getTime()) / 864e5;
          if (ageDays > 120) e1rm *= Math.max(0.85, 1 - (ageDays - 120) * 0.0004);
          if (!liftBestE1RM[canonical] || e1rm > liftBestE1RM[canonical]) liftBestE1RM[canonical] = e1rm;
        }
      }
    }
  }
  // Fallback: if history has no matching sets but a stored PR exists, use the raw PR (better than
  // nothing — treats it as a 1RM, slightly conservative for high-rep PRs). Unlike the e1RM-from-
  // history path above, store.prs has no date on its own — so look up the matching prEvents entry
  // (logged at the moment the PR was hit) to find when it happened and apply the same staleness
  // decay, instead of letting an old PR silently overstate current strength forever.
  const prEvents = store.prEvents || [];
  const prDate = (name, weightLbs) => {
    let best = null;
    for (const e of prEvents) {
      if (e.name === name && Math.abs((e.weightLbs || 0) - weightLbs) < 0.6) {
        if (!best || e.date > best) best = e.date;
      }
    }
    return best;
  };
  const bestPR = (canonical) => {
    if (liftBestE1RM[canonical]) return liftBestE1RM[canonical];
    const names = [canonical, ...(STRENGTH_LIFT_ALIASES[canonical] || [])];
    const exactPairs = names.map(n => [n, prs[n]]).filter(([, v]) => v != null && v > 0);
    const kw = LIFT_KEYWORDS[canonical];
    const fuzzyPairs = kw ? Object.entries(prs).filter(([name, v]) => v != null && v > 0 && kw(norm(name))) : [];
    const all = [...exactPairs, ...fuzzyPairs].map(([name, lbs]) => {
      const date = prDate(name, lbs);
      let val = lbs;
      if (date) {
        const ageDays = (nowMs - new Date(date + "T12:00:00").getTime()) / 864e5;
        if (ageDays > 120) val *= Math.max(0.85, 1 - (ageDays - 120) * 0.0004);
      }
      // prs are stored in lbs; convert to display unit if needed.
      return unit === "lbs" ? val : cvt(val, "lbs", unit);
    });
    return all.length ? Math.max(...all) : null;
  };
  // Age-fair scaling: scale standards by the user's age (if known).
  const age = (() => {
    const a = parseInt(store.age || store.profileAge);
    if (a > 0 && a < 100) return a;
    if (store.birthYear) { const y = new Date().getFullYear() - parseInt(store.birthYear); if (y > 0 && y < 100) return y; }
    return null;
  })();
  const ageFactor = ageStrengthFactor(age);
  // Score each MOVEMENT PATTERN by its best-performing lift, so logging a light variant
  // (e.g. a few easy front squats) never drags down a strong main lift.
  const lifts = [];
  const scoredWinners = []; // {lvlIdx, score} for every pattern with data — top N drive the score
  const usedLifts = new Set();
  for (const [pattern, candidates] of Object.entries(STRENGTH_PATTERNS)) {
    let winner = null;
    for (const lift of candidates) {
      if (!standards[lift]) continue;
      const best = bestPR(lift);
      if (best == null) continue;
      const ratio = best / bw;
      const lvlIdx = STRENGTH_LEVELS.indexOf(levelForRatio(standards, lift, ratio, ageFactor));
      // "Best" = highest level achieved; tiebreak by ratio-within-standard.
      const score = lvlIdx + Math.min(0.99, ratio / (standards[lift].Elite * (ageFactor || 1)));
      if (!winner || score > winner.score) {
        winner = { lift, best, ratio: Math.round(ratio * 100) / 100, level: levelForRatio(standards, lift, ratio, ageFactor), lvlIdx, score, pattern };
      }
    }
    if (winner) {
      // Continuous position within the level band (0-1) so the bar reflects how close the
      // lift is to the next tier, instead of every lift at a level rendering an identical bar.
      // World Class has no upper threshold, so extend its band 25% past the cutoff for the bar.
      const s = standards[winner.lift], f = ageFactor || 1;
      const bounds = [0, s.Novice * f, s.Intermediate * f, s.Proficient * f, s.Advanced * f, s.Exceptional * f, s.Elite * f, s.WorldClass * f, s.WorldClass * f * 1.25];
      const lo = bounds[winner.lvlIdx], hi = bounds[winner.lvlIdx + 1];
      const within = hi > lo ? Math.min(1, Math.max(0, (winner.ratio - lo) / (hi - lo))) : 1;
      const pct = Math.min(100, Math.round(((winner.lvlIdx + within) / (STRENGTH_LEVELS.length - 1)) * 1000) / 10);
      lifts.push({ lift: winner.lift, best: winner.best, ratio: winner.ratio, level: winner.level, pattern: winner.pattern, pct });
      usedLifts.add(winner.lift);
      // `cont` = the lift's CONTINUOUS level position (integer level + how far it is
      // into the band toward the next tier), the same measure the per-lift bar shows.
      // The headline score averages this — NOT the bare integer level — so the number
      // reflects real progress within a level and doesn't snap onto the level anchors
      // (why an all-Intermediate lifter used to read exactly 60).
      scoredWinners.push({ lvlIdx: winner.lvlIdx, cont: winner.lvlIdx + within, score: winner.score });
    }
  }
  if (!scoredWinners.length) return { ready: false, reason: "no_lifts" };
  // Average only the user's strongest patterns (drop the weakest few). Rank by the continuous
  // `score` (level + ratio-within-band) so ties between same-level lifts break on the closer one.
  const topWinners = scoredWinners.sort((a, b) => b.score - a.score).slice(0, STRENGTH_SCORE_TOP_N);
  const counted = topWinners.length;
  const avgIdx = topWinners.reduce((sum, w) => sum + w.cont, 0) / counted;
  const overall = STRENGTH_LEVELS[Math.round(avgIdx)] || "Untrained";
  // Curved 0-100 score — see STRENGTH_SCORE_CURVE. Interpolates between the two control points
  // straddling avgIdx (same piecewise-linear approach as the per-lift bar % below).
  const cps = STRENGTH_SCORE_CURVE;
  const lo = Math.max(0, Math.min(cps.length - 1, Math.floor(avgIdx)));
  const hi = Math.min(cps.length - 1, lo + 1);
  const t = avgIdx - lo;
  const score = Math.min(100, Math.round(cps[lo] + t * (cps[hi] - cps[lo])));
  // Map-only lifts (e.g. calf raise): give them a level for the muscle-balance body map, but
  // keep them out of `lifts`/`counted`/`overall` so they never affect the strength score.
  const mapLifts = [];
  for (const lift of STRENGTH_MAP_ONLY_LIFTS) {
    if (!standards[lift]) continue;
    const best = bestPR(lift);
    if (best == null) continue;
    mapLifts.push({ lift, level: levelForRatio(standards, lift, best / bw, ageFactor) });
  }
  // Surface any individually high-leveled lifts so single big lifts get recognised even
  // when the rounded overall is lower.
  const advancedIdx = STRENGTH_LEVELS.indexOf("Advanced");
  const topLifts = lifts.filter(l => STRENGTH_LEVELS.indexOf(l.level) >= advancedIdx)
    .sort((a, b) => STRENGTH_LEVELS.indexOf(b.level) - STRENGTH_LEVELS.indexOf(a.level));
  return { ready: true, overall, score, lifts, mapLifts, bodyweight: bw, bodyweightAgeDays, counted, sex, age, ageFactor, topLifts };
}


// Maps each body-map region to the lift(s) that best represent its strength. Abs is intentionally
// absent — no standard lift loads it directly, so it renders as "no data" rather than mirroring an
// unrelated lift. Several entries are proxies (biceps via rows, triceps via pressing, forearms via
// heavy pulls/grip) since there's no isolation standard. Calves is sourced from a map-only lift
// (see STRENGTH_MAP_ONLY_LIFTS): it shades here without counting toward the strength score.
const MUSCLE_STRENGTH_LIFTS = {
  Chest: ["Barbell Bench Press", "Incline Bench Press"],
  Shoulders: ["Overhead Press (Barbell)"],
  Quads: ["Barbell Back Squat", "Front Squat"],
  Lats: ["Barbell Row", "Deadlift"],
  Hamstrings: ["Romanian Deadlift", "Deadlift"],
  Glutes: ["Hip Thrust", "Barbell Back Squat", "Deadlift", "Romanian Deadlift"],
  Triceps: ["Barbell Bench Press", "Overhead Press (Barbell)"],
  Biceps: ["Barbell Row"],
  Forearms: ["Deadlift", "Barbell Row"],
  Traps: ["Deadlift", "Barbell Row"],
  LowerBack: ["Deadlift", "Romanian Deadlift"],
  "Rear Delts": ["Barbell Row"],
  Calves: ["Standing Calf Raise"],
};


// Per-region strength fraction (0 = Untrained, 1 = Elite) vs bodyweight standards, for the weakness
// map. Returns { ready, regionFrac:{Region:0..1}, overall, score } or { ready:false, reason }.
function muscleStrength(store, unit, sex) {
  const ss = computeStrengthScore(store, unit, sex);
  if (!ss.ready) return { ready: false, reason: ss.reason };
  const liftLevel = {};
  ss.lifts.forEach(l => {
    const lvl = STRENGTH_LEVELS.indexOf(l.level);
    liftLevel[l.lift] = lvl;
    // The score works in patterns (variants compete for one slot — only the winner appears in
    // ss.lifts), but the body map references exact lift names. Propagate the winning level to
    // every sibling in the same pattern so a region keyed on "Deadlift" still gets credit when
    // the user's best is "Sumo Deadlift" (same for Front vs Back Squat, Incline vs Flat Bench).
    for (const candidates of Object.values(STRENGTH_PATTERNS)) {
      if (candidates.includes(l.lift)) candidates.forEach(c => { liftLevel[c] = lvl; });
    }
  });
  // Map-only lifts (e.g. calf raise) shade their region without being part of the score.
  (ss.mapLifts || []).forEach(l => { liftLevel[l.lift] = STRENGTH_LEVELS.indexOf(l.level); });
  const denom = STRENGTH_LEVELS.length - 1;
  const regionFrac = {};
  for (const [region, lifts] of Object.entries(MUSCLE_STRENGTH_LIFTS)) {
    let best = null;
    lifts.forEach(lift => { if (liftLevel[lift] != null) best = Math.max(best == null ? -1 : best, liftLevel[lift]); });
    if (best != null) regionFrac[region] = best / denom;
  }
  // Imbalance checks (only when both sides have data). Flags meaningful gaps (>~0.6 / ~0.8 of
  // a level) — thresholds expressed as a fraction of denom so they stay level-equivalent
  // regardless of how many tiers STRENGTH_LEVELS has.
  const avg = (keys) => { const vs = keys.map(k => regionFrac[k]).filter(v => v != null); return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null; };
  const imbalances = [];
  const push = avg(["Chest", "Shoulders", "Triceps"]), pull = avg(["Lats", "Biceps"]);
  if (push != null && pull != null && Math.abs(push - pull) >= 0.6 / denom) {
    imbalances.push(push > pull ? "Pull is lagging your push" : "Push is lagging your pull");
  }
  const quad = regionFrac["Quads"], post = avg(["Hamstrings", "Glutes"]);
  if (quad != null && post != null && Math.abs(quad - post) >= 0.6 / denom) {
    imbalances.push(quad > post ? "Hamstrings/glutes lag your quads" : "Quads lag your hamstrings/glutes");
  }
  // Lower body vs upper body — a common neglect pattern worth surfacing.
  const upper = avg(["Chest", "Shoulders", "Lats", "Biceps", "Triceps"]);
  const lower = avg(["Quads", "Hamstrings", "Glutes"]);
  if (upper != null && lower != null && Math.abs(upper - lower) >= 0.8 / denom) {
    imbalances.push(upper > lower ? "Legs are lagging your upper body" : "Upper body lags your legs");
  }
  return { ready: true, regionFrac, overall: ss.overall, score: ss.score, imbalances, bodyweightAgeDays: ss.bodyweightAgeDays };
}


// Days since each muscle was last trained (primary + secondary credit), keyed by muscle name.
// ONE definition: the coach summary needs it and so does the readiness card, and it must be a
// CALENDAR-day count anchored at local noon on both ends — deriving it from muscleReadiness's
// fatigue timestamps instead gave 0 days for a session logged yesterday, because those timestamps
// exist to decay fatigue, not to count days.
function daysSinceMuscleTrained(store) {
  const out = {};
  const todayMs = new Date(dKey() + "T12:00:00").getTime();
  const hist = store?.history || {};
  // Newest first, so the first time a muscle is seen is its most recent session.
  for (const d of Object.keys(hist).sort().reverse()) {
    const ts = new Date(d + "T12:00:00").getTime();
    if (isNaN(ts)) continue;
    const daysAgo = Math.max(0, Math.round((todayMs - ts) / 86400000));
    for (const s of Object.values(hist[d] || {})) {
      for (const ex of (s.exercises || [])) {
        const worked = (ex.sets || []).some(st => st.type !== "warmup"
          && (st.done === true || (st.done === undefined && parseFloat(st.reps) > 0)));
        if (!worked) continue;
        const muscles = new Set();
        // getMuscle, not resolveMuscle: `getMuscle` consults the custom-exercise registry and
        // `resolveMuscle` does not, so a user-created exercise was INVISIBLE here while its two
        // siblings in this same file (lines 38 and 96) resolved it fine. Measured: a custom "Back"
        // exercise trained today gave weeklyMuscleVolume {Back: 4} and muscle readiness fatigue,
        // while this returned {} — so the AI coach was told that muscle had never been trained,
        // on the same store where the heatmap showed it trained today.
        const p = (typeof getMuscle === "function" && getMuscle(ex.name)) || resolveMuscle(ex.name);
        if (p) muscles.add(p);
        for (const sec of getExerciseSecondaries(ex.name)) muscles.add(_cleanMuscle(sec));
        for (const m of muscles) if (out[m] == null) out[m] = daysAgo;
      }
    }
  }
  return out;
}

// Exported: only what App.jsx and src/lazy/ actually import. The standards tables, weight-class
// ladder, score curve and pattern maps stay PRIVATE — the score/level functions are the interface,
// and a future caller that wants the raw tables should be forced to come through them.
export { STRENGTH_LEVELS, _strengthDisplayFrac, computeStrengthScore, strengthScoreHistory, muscleStrength, muscleReadiness, weeklyMuscleVolume, daysSinceMuscleTrained };
