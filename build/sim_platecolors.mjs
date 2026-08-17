// THE PLATE LEGEND MUST MATCH THE PLATES IN A REAL GYM, AND MUST DEPEND ON THE UNIT.
//
// Mo: "for plate colors, let's try 45lb be blue, 35lb be yellow, 25lb be green, I think this
// matches most gyms." He's right, and it's a standard, not a preference: the IWF/IPF competition
// colour code is 25kg red / 20 blue / 15 yellow / 10 green, and the pound plates that mirror those
// are 45 blue / 35 yellow / 25 green. The app had shipped 45 RED and 35 blue, which is nothing.
//
// ★ The real bug underneath it was that the colour map was keyed on the NUMBER ALONE while being
// shared by both unit systems. `25` is green in pounds and RED in kilos; `10` is white in pounds
// and GREEN in kilos. One numeric map cannot satisfy both, so it was wrong for kg users by
// construction — a 25kg plate rendered green. `plateColor(p, unit)` is keyed on both now.
//
// Shown red against the pre-fix code: 45lb was #ef4444 (red) and 35lb was #3b82f6 (blue), so the
// standard-colour checks fail; and plateColor didn't exist at all, so the import throws — which is
// why section 0 measures the OLD map's own values rather than relying on an import error.
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BUILD = dirname(fileURLToPath(import.meta.url));
const ROOT = join(BUILD, "..");
const { plateColor } = await import("./app.mjs");
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

// ── 1. The competition colour code, both directions ──────────────────────────────────────────
const BLUE = "#3b82f6", YELLOW = "#eab308", GREEN = "#22c55e", RED = "#ef4444";
const STANDARD = [
  ["lbs", 45, BLUE,   "blue"],
  ["lbs", 35, YELLOW, "yellow"],
  ["lbs", 25, GREEN,  "green"],
  ["kg",  25, RED,    "red"],
  ["kg",  20, BLUE,   "blue"],
  ["kg",  15, YELLOW, "yellow"],
  ["kg",  10, GREEN,  "green"],
];
for (const [unit, p, hex, name] of STANDARD) {
  const got = plateColor(p, unit);
  check(`1. ${p} ${unit} is ${name} (${hex}), the competition colour`, got === hex, `got ${got}`);
}

// ── 2. The same NUMBER must resolve differently in the two systems ────────────────────────────
// This is the check the old single-map code could never pass, and the reason the bug existed.
check("2. 25 is a different colour in lbs and kg (green vs red — a single numeric map can't do this)",
  plateColor(25, "lbs") !== plateColor(25, "kg"),
  `lbs ${plateColor(25, "lbs")} / kg ${plateColor(25, "kg")}`);
check("2b. 10 is a different colour in lbs and kg (10kg is green, 10lb is not)",
  plateColor(10, "lbs") !== plateColor(10, "kg"),
  `lbs ${plateColor(10, "lbs")} / kg ${plateColor(10, "kg")}`);

// ── 3. Every plate the calculator can hand back has a colour, and no two share one ────────────
// A plate with no entry falls through to C.muted/C.accent at the call site, so two DIFFERENT
// plates would paint the same and the legend would be lying. Read the lists from source so adding
// a plate size to the app fails here until it's given a colour.
const src = readFileSync(join(ROOT, "src/App.jsx"), "utf8");
const listOf = name => {
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(src);
  if (!m) throw new Error(`could not find ${name} in src/App.jsx`);
  return m[1].split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
};
for (const [unit, listName] of [["lbs", "PLATES_LBS_LIST"], ["kg", "PLATES_KG_LIST"]]) {
  const list = listOf(listName);
  const missing = list.filter(p => !plateColor(p, unit));
  check(`3. every ${unit} plate (${list.join("/")}) has a colour`, missing.length === 0,
    missing.length ? `no colour for ${missing.join(", ")}` : "");
  const seen = new Map();
  const dupes = [];
  for (const p of list) {
    const c = plateColor(p, unit);
    if (!c) continue;
    if (seen.has(c)) dupes.push(`${seen.get(c)} and ${p} both ${c}`);
    else seen.set(c, p);
  }
  check(`3b. no two ${unit} plates share a colour`, dupes.length === 0, dupes.join("; "));
}

// ── 4. Every swatch has to be VISIBLE in BOTH themes ─────────────────────────────────────────
// The first cut of this change asserted a flat 3:1 fill contrast (the WCAG floor for a graphical
// object) against both surfaces of both themes, and it FAILED on the correct answer: a saturated
// yellow, which is exactly what a 35lb/15kg plate is, measures 1.76:1 against the light theme's
// near-white card. There is no way to satisfy that bar and stay yellow — the yellow that clears
// 3:1 on white is olive-brown. So the discs carry a RIM (`PLATE_RING`), the same way a real bumper
// plate does, and the rim is what separates disc from surface. Two things are asserted instead:
//   (a) every disc render site actually paints the rim — without it the light theme loses the
//       yellow plate entirely, which is the bug this section exists to prevent; and
//   (b) no fill is NEAR-IDENTICAL to a surface (1.2:1), because a rim around a disc the same
//       colour as the card behind it reads as an empty outline. This is the bar that still rejects
//       the literally-accurate white 10lb/5kg plate, which was the original reason to measure.
const ringSites = [...src.matchAll(/boxShadow:\s*PLATE_RING/g)].length;
const colourSites = [...src.matchAll(/background:\s*plateColor\(|background:color,/g)].length;
console.log(`   plate discs painted: ${colourSites}, of which rimmed: ${ringSites}`);
check("4. every plate disc paints the rim that makes it visible on the light theme",
  ringSites >= colourSites && ringSites > 0, `${ringSites} rims for ${colourSites} discs`);
function hexToRgb(hex) { const n = parseInt(hex.replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function relLum([r, g, b]) {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const [R, G, B] = [f(r), f(g), f(b)]; return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
const ratio = (a, b) => { const L1 = relLum(hexToRgb(a)), L2 = relLum(hexToRgb(b));
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1]; return (hi + 0.05) / (lo + 0.05); };
function extractTheme(label) {
  const start = src.indexOf(`  ${label}: {`);
  if (start === -1) throw new Error(`could not find THEMES.${label}`);
  const end = src.indexOf("\n  },", start);
  const block = src.slice(start, end === -1 ? start + 3000 : end);
  const t = {};
  for (const m of block.matchAll(/(\w+):\s*"(#[0-9a-fA-F]{6})"/g)) t[m[1]] = m[2];
  return t;
}
const themes = { dark: extractTheme("dark"), light: extractTheme("light") };
let worst = { r: 99, where: "" };
for (const [unit, listName] of [["lbs", "PLATES_LBS_LIST"], ["kg", "PLATES_KG_LIST"]]) {
  for (const p of listOf(listName)) {
    const c = plateColor(p, unit);
    if (!c) continue;
    for (const [tname, t] of Object.entries(themes)) {
      for (const surf of ["bg", "surface"]) {
        const r = ratio(c, t[surf]);
        if (r < worst.r) worst = { r, where: `${p}${unit} ${c} on ${tname}.${surf} ${t[surf]}` };
      }
    }
  }
}
console.log(`   weakest swatch/surface separation: ${worst.r.toFixed(2)}:1 (${worst.where})`);
check("4b. no plate fill is near-identical to a theme surface (a rimmed disc the colour of the card is an empty outline)",
  worst.r >= 1.2, `weakest ${worst.r.toFixed(2)}:1 — ${worst.where}`);

// ── 5. One definition, not two ───────────────────────────────────────────────────────────────
// PlateCalcModal carried its own byte-identical copy of the map. Two copies of one legend is how
// the calculator and the live workout's barbell come to disagree about what colour a 35 is.
const inlineMaps = [...src.matchAll(/\{\s*45:\s*"#[0-9a-fA-F]{6}"/g)].length;
check("5. the colour map is defined once (no inline copy in the calculator modal)",
  inlineMaps <= 1, `${inlineMaps} literal plate-colour maps found`);

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
