// Guard for the derived female body map. BODYMAP_FEMALE is generated from BODYMAP_MALE by
// build/bodymap_female_warp.mjs; a hand edit to one female path (or a regenerate that was never
// committed) puts the coloured muscle regions out of registration with the silhouette, and nothing
// in the app can see that — the map renders, just with the colour in the wrong place.
//   1. every female path is byte-identical to what the generator produces from the CURRENT male map;
//   2. every female path stays inside the viewBoxes the app draws it in (a widened pelvis or a hand
//      that escapes the box is silently clipped on device);
//   3. front/back key sets match the male's, and every path keeps the male's y-extent (height is not
//      warped — the fixed viewBoxes and the FRONT/BACK labels depend on both figures being the same height).
import { BODYMAP_MALE as M, BODYMAP_FEMALE as F } from "../src/bodyMapData.js";
import { buildFemale } from "./bodymap_female_warp.mjs";
let fails = 0; const ok = (c, msg) => { console.log((c ? "  ok   " : "  FAIL ") + msg); if (!c) fails++; };
const G = buildFemale(M);
const bbox = d => { const n = d.match(/-?\d*\.?\d+/g).map(Number); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (let i = 0; i < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); } return { x0, x1, y0, y1 }; };
// tightest box each view is ever drawn in: BodyMap front "48 6 168 408", WrappedModal front "46 6 160 408", back "26 6 160 408"
const BOX = { front: { x0: 48, x1: 206, y0: 6, y1: 414 }, back: { x0: 26, x1: 186, y0: 6, y1: 414 } };
for (const v of ["front", "back"]) {
  ok(JSON.stringify(Object.keys(F[v])) === JSON.stringify(Object.keys(M[v])), `${v}: female has the male's ${Object.keys(M[v]).length} keys in the same order`);
  for (const k of Object.keys(M[v])) {
    ok(F[v][k] === G[v][k], `${v}/${k}: byte-identical to generator output`);
    const b = bbox(F[v][k]), m = bbox(M[v][k]), B = BOX[v];
    ok(b.x0 >= B.x0 && b.x1 <= B.x1 && b.y0 >= B.y0 && b.y1 <= B.y1, `${v}/${k}: inside viewBox (x ${b.x0}..${b.x1} in ${B.x0}..${B.x1})`);
    ok(Math.abs(b.y0 - m.y0) < 0.06 && Math.abs(b.y1 - m.y1) < 0.06, `${v}/${k}: y-extent equals the male's (${b.y0}..${b.y1})`);
  }
}
console.log(fails ? `FAIL all (${fails} failures)` : "PASS all: female body map matches its generator, fits its viewBoxes, keeps the male height");
process.exit(fails ? 1 : 0);
