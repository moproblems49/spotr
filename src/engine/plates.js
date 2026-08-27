// BAR & PLATE MATHS — what physically goes on the bar: plate-per-side calculation, the IWF/IPF
// competition colour code, and warmup-set generation (which is bar-loading maths too: it snaps to
// real plates).
//
// Extracted from App.jsx verbatim. The colour maps are keyed PER UNIT because a number that means
// two things in two units is wrong for one of them — 25 is green in pounds and RED in kilos; that
// shipped as a real bug (see CLAUDE.md's plate-colour entry) and plateColor(p, unit) is the fix.
// The plate lists and colour maps are module-private; sim_platecolors reads the lists from THIS
// file's source text (it names the path), so if these constants move again, move that sim's path
// in the same commit.
import { uid } from "./core.js";

// Reusable plate-per-side calculator
// Returns array of { p, count } or null if unachievable
const BARBELL_BAR_LBS = 45;

const BARBELL_BAR_KG = 20;

const PLATES_LBS_LIST = [45, 35, 25, 10, 5, 2.5];

const PLATES_KG_LIST = [25, 20, 15, 10, 5, 2.5, 1.25];

// Plate disc colours, following the IWF/IPF competition colour code — which is what any gym with
// colour-coded bumpers actually has on the rack: in KILOS 25 is red, 20 blue, 15 yellow, 10 green;
// the POUND plates that mirror them are 45 blue, 35 yellow, 25 green.
// ★ THIS IS KEYED ON THE UNIT AS WELL AS THE NUMBER, AND IT HAS TO BE. `25` is a different colour
// in the two systems (25 lb is green, 25 kg is red) and so is `10` (10 lb white, 10 kg green), so
// the single numeric map this replaced could only ever be right for one unit — it painted a 25kg
// plate green and a 45lb plate red, neither of which matches any federation.
// The small change plates are deliberately NOT accurate: in real life 10 lb and 5 kg are white,
// 2.5 lb is black and 1.25 kg is chrome, and a white disc vanishes against the light theme's
// near-white card while a black one vanishes against the dark theme. They get distinct theme-safe
// values instead, running grey → purple → pink as they get lighter. Colour is never the only cue —
// every swatch in the legend sits beside its own "3×45" label, and disc HEIGHT already scales with
// weight — so a substitution here costs nothing an accurate colour would have bought.
const PLATE_COLORS_LBS = { 45:"#3b82f6", 35:"#eab308", 25:"#22c55e", 10:"#a1a1aa", 5:"#8b5cf6", 2.5:"#ec4899" };

const PLATE_COLORS_KG  = { 25:"#ef4444", 20:"#3b82f6", 15:"#eab308", 10:"#22c55e", 5:"#a1a1aa", 2.5:"#8b5cf6", 1.25:"#ec4899" };

// Returns null (not a colour) for an unknown plate so each caller keeps its own fallback token.
function plateColor(p, unit) {
  return (unit === "kg" ? PLATE_COLORS_KG : PLATE_COLORS_LBS)[p] || null;
}

function calcPlatesPerSide(totalWeight, unit, oneSided = false, barWeightOverride = null) {
  const t = parseFloat(totalWeight);
  const plates = unit === "kg" ? PLATES_KG_LIST : PLATES_LBS_LIST;
  if (oneSided) {
    // No bar subtraction, no halving — the entered weight IS the plate weight on one end.
    if (!t || t <= 0) return null;
    let remaining = t;
    const result = [];
    for (const p of plates) {
      const count = Math.floor(remaining / p);
      if (count > 0) {
        result.push({ p, count });
        remaining = Math.round((remaining - p * count) * 1000) / 1000;
      }
    }
    if (!result.length) return null;
    // Attach the un-loadable remainder (per side) so the UI can show "≈ closest" instead of
    // silently giving nothing when the exact weight isn't achievable with standard plates.
    result.leftover = remaining > 0.01 ? remaining : 0;
    return result;
  }
  const bar = barWeightOverride != null ? barWeightOverride : (unit === "kg" ? BARBELL_BAR_KG : BARBELL_BAR_LBS);
  if (!t || t <= bar) return null;
  let remaining = (t - bar) / 2;
  const result = [];
  for (const p of plates) {
    const count = Math.floor(remaining / p);
    if (count > 0) {
      result.push({ p, count });
      remaining = Math.round((remaining - p * count) * 1000) / 1000;
    }
  }
  if (!result.length) return null;
  // leftover = weight per side that couldn't be made with standard plates (0 if exact).
  result.leftover = remaining > 0.01 ? remaining : 0;
  return result;
}

// Generate warmup sets ramping up to a working weight.
// Returns 4 sets: empty bar, then ~45%, ~65%, ~85% of working weight, each rounded
// to the nearest achievable weight given standard plates. Reps taper as weight rises.
// Used by the opt-in "Add warmup" button on compound barbell lifts.
function generateWarmupSets(workingWeight, unit, barWeightOverride = null) {
  const w = parseFloat(workingWeight);
  if (!w || w <= 0) return [];
  const bar = barWeightOverride != null ? barWeightOverride : (unit === "kg" ? BARBELL_BAR_KG : BARBELL_BAR_LBS);
  // Smallest increment we can actually load (plate × 2 sides)
  const minPlate = unit === "kg" ? 1.25 : 2.5;
  const step = minPlate * 2;
  // Round a target weight to the nearest achievable barbell load (>= bar)
  const roundToBar = (target) => {
    if (target <= bar) return bar;
    const rounded = Math.round((target - bar) / step) * step + bar;
    return Math.max(bar, rounded);
  };
  // Only warm up if the working weight is meaningfully above the bar
  if (w <= bar + step) return [];
  const ramp = [
    { pct: 0, reps: 8 },     // empty bar
    { pct: 0.45, reps: 5 },
    { pct: 0.65, reps: 3 },
    { pct: 0.85, reps: 2 },
  ];
  const sets = [];
  let lastWeight = -1;
  for (const r of ramp) {
    const target = r.pct === 0 ? bar : roundToBar(w * r.pct);
    // Skip if this warmup weight equals the working weight or duplicates the previous step
    if (target >= w || target === lastWeight) continue;
    lastWeight = target;
    sets.push({ id: uid(), weight: String(target), reps: String(r.reps), done: false, type: "warmup" });
  }
  return sets;
}


export { plateColor, calcPlatesPerSide, generateWarmupSets };
