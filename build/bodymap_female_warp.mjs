// BODYMAP_FEMALE generator. The female body map is NOT hand-drawn: it is BODYMAP_MALE put through one
// y-dependent horizontal warp, applied identically to `_body` and all nine muscle-region paths of a view,
// so the coloured regions stay in registration with the silhouette BY CONSTRUCTION (the male map is the
// only hand-drawn art). Shape decisions live in PROFILE below; the reasoning is recorded in CLAUDE.md.
//
//   node build/bodymap_female_warp.mjs           # check: regenerate and diff against src/bodyMapData.js (exit 1 on drift)
//   node build/bodymap_female_warp.mjs --write   # regenerate and rewrite the BODYMAP_FEMALE line in place
//
// The map, per view, in male viewBox units with u = |x - cx|:
//   u' = st(y)·u                                   for u <= B(y)            (torso / legs: scale about the centre line)
//   u' = st·B + sg(y)·(u - B)                       for B < u <= B + g(y)    (the gap between torso and hanging arm)
//   u' = st·B + sg·g + sa(y)·(u - B - g)            beyond                   (the arm itself)
// Continuous and every slope > 0  =>  monotone in u, so nothing can cross or overlap. y is untouched
// (front and back stay the same height as the male, which is what keeps the app's fixed viewBoxes valid).
// B/g were read off the raw male raster (the torso edge and the inner edge of the hanging arm per row);
// above y≈112 the upper arm is fused to the torso so all three slopes collapse to st.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/bodyMapData.js");

export const PROFILE = {
  // torso/leg scale about the centre line, by y. Shoulders ~0.73 of male, waist 0.66, pelvis 1.055, knee 0.84.
  st: [[20, 0.80], [40, 0.76], [50, 0.72], [65, 0.735], [80, 0.735], [95, 0.72], [112, 0.70], [128, 0.68], [148, 0.66], [162, 0.69], [180, 0.86], [200, 1.02], [215, 1.055], [235, 1.055], [255, 0.98], [272, 0.91], [290, 0.85], [305, 0.84], [320, 0.85], [400, 0.85]],
  front: { cx: 131.6,
    B:  [[112, 34], [120, 40], [130, 40], [150, 42], [170, 42], [180, 46], [195, 46]],
    g:  [[112, 2], [120, 9], [130, 11], [150, 13], [170, 22], [180, 22], [195, 22]],
    sg: [[112, 0.70], [130, 0.7], [150, 0.7], [170, 0.5], [200, 0.45]],
    sa: [[112, 0.70], [130, 0.62], [150, 0.55], [200, 0.55]] },
  back: { cx: 106.3,
    B:  [[112, 34], [130, 41], [150, 40], [170, 40], [180, 42], [195, 44]],
    g:  [[112, 2], [130, 8], [150, 10], [170, 16], [180, 18], [195, 20]],
    sg: [[112, 0.70], [130, 0.7], [150, 0.7], [170, 0.5], [200, 0.45]],
    sa: [[112, 0.70], [130, 0.62], [150, 0.55], [200, 0.55]] },
};

// smoothstep-interpolated piecewise stops, clamped at both ends
export function pl(stops) {
  return y => {
    if (y <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) if (y <= stops[i][0]) {
      const [y0, v0] = stops[i - 1], [y1, v1] = stops[i], t = (y - y0) / (y1 - y0), s = t * t * (3 - 2 * t);
      return v0 + (v1 - v0) * s;
    }
    return stops[stops.length - 1][1];
  };
}
export function makeMap(view, P = PROFILE) {
  const V = P[view], st = pl(P.st), sg = pl(V.sg), sa = pl(V.sa), B = pl(V.B), g = pl(V.g);
  return (x, y) => {
    const u = Math.abs(x - V.cx), s = Math.sign(x - V.cx) || 0, b = B(y), gg = g(y);
    const up = u <= b ? st(y) * u : u <= b + gg ? st(y) * b + sg(y) * (u - b) : st(y) * b + sg(y) * gg + sa(y) * (u - b - gg);
    return [V.cx + s * up, y];
  };
}
// Absolute M/L/C/Z only. Throws on anything else so an unknown (e.g. relative) command can never pass through unwarped.
export function warpPath(d, f) {
  const toks = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g); const out = []; let i = 0;
  const fmt = n => { const s = n.toFixed(1); return s === "-0.0" ? "0.0" : s; };
  while (i < toks.length) {
    const c = toks[i++]; const need = { M: 2, L: 2, C: 6, Z: 0 }[c];
    if (need == null) throw new Error("unsupported path command " + c);
    if (need === 0) { out.push("Z"); continue; }
    const groups = [];
    do { const grp = []; for (let k = 0; k < need; k++) { const t = toks[i++]; if (t == null || /[A-Za-z]/.test(t)) throw new Error("short args for " + c); grp.push(+t); } groups.push(grp); }
    while (i < toks.length && !/^[A-Za-z]$/.test(toks[i]));
    out.push(groups.map((grp, j) => { const pts = []; for (let k = 0; k < grp.length; k += 2) { const [x, y] = f(grp[k], grp[k + 1]); pts.push(fmt(x) + "," + fmt(y)); } return (j === 0 ? c : "") + pts.join(" "); }).join(" "));
  }
  return out.join(" ");
}
export function buildFemale(MALE, P = PROFILE) {
  const out = {};
  for (const view of ["front", "back"]) { const f = makeMap(view, P); out[view] = {}; for (const k of Object.keys(MALE[view])) out[view][k] = warpPath(MALE[view][k], f); }
  return out;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { BODYMAP_MALE } = await import(FILE);
  const line = "export const BODYMAP_FEMALE = " + JSON.stringify(buildFemale(BODYMAP_MALE)) + ";";
  const lines = fs.readFileSync(FILE, "utf8").split("\n");
  const idx = lines.findIndex(l => l.startsWith("export const BODYMAP_FEMALE = "));
  if (idx < 0) { console.error("BODYMAP_FEMALE export line not found"); process.exit(2); }
  if (process.argv.includes("--write")) { lines[idx] = line; fs.writeFileSync(FILE, lines.join("\n")); console.log("wrote BODYMAP_FEMALE (", line.length, "chars )"); }
  else if (lines[idx] === line) console.log("PASS bodymap_female_warp: src/bodyMapData.js BODYMAP_FEMALE matches the generator byte-for-byte");
  else { console.log("FAIL bodymap_female_warp: BODYMAP_FEMALE in src/bodyMapData.js differs from the generator output (regenerate with --write, or the profile changed)"); process.exit(1); }
}
