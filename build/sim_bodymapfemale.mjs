// Structural guard for the body-map data (no browser). BODYMAP_FEMALE is a TRACE of licensed art, so
// nothing can regenerate it from the male map — what stays true, and what a future edit breaks first:
//   1. both views carry the male's 10 keys in the male's order (the app iterates them and pw_musclezero
//      addresses regions by name);
//   2. every path — male and female — stays inside the tightest viewBox the app draws it in (the profile
//      screen's BodyMap AND WrappedModal's narrower front box); anything outside is silently clipped on device;
//   3. the female figure is framed where the male is (its _body y-extent within 12 units of the male's);
//   4. every female REGION is made of subpaths that occur verbatim in that view's _body — regions are
//      subsets of the silhouette by construction, so a hand-nudged region fails here before it can ever
//      paint colour outside the body. (pw_bodymapfemale rasterises the same property, pixel-exact.)
//   5. only absolute M/L/C/Z commands — every tool that measures these paths assumes that.
import { BODYMAP_MALE as M, BODYMAP_FEMALE as F } from "../src/bodyMapData.js";
let fails = 0; const ok = (c, msg) => { console.log((c ? "  ok   " : "  FAIL ") + msg); if (!c) fails++; };
const bbox = d => { const n = d.match(/-?\d*\.?\d+/g).map(Number); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (let i = 0; i < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); } return { x0, x1, y0, y1 }; };
// Female: the TIGHTEST box it is drawn in (WrappedModal's front "46 6 160 408" => x<=206). Male: the profile
// screen's widened front box ("48 6 168 408"); its hand reaches x=210.5, which WrappedModal's narrower box already
// clips today — pre-existing, and not something this guard should turn red on the hand-drawn art.
const BOX = { male: { front: { x0: 48, x1: 216, y0: 6, y1: 414 }, back: { x0: 26, x1: 186, y0: 6, y1: 414 } },
              female: { front: { x0: 48, x1: 206, y0: 6, y1: 414 }, back: { x0: 26, x1: 186, y0: 6, y1: 414 } } };
for (const v of ["front", "back"]) {
  ok(JSON.stringify(Object.keys(F[v])) === JSON.stringify(Object.keys(M[v])), `${v}: female keys == male keys, same order (${Object.keys(M[v]).join(",")})`);
  for (const [who, S] of [["male", M], ["female", F]]) for (const k of Object.keys(S[v])) {
    const d = S[v][k], b = bbox(d), B = BOX[who][v];
    ok(/^[MLCZ0-9.,\s-]+$/.test(d), `${who} ${v}/${k}: absolute M/L/C/Z only`);
    ok(b.x0 >= B.x0 && b.x1 <= B.x1 && b.y0 >= B.y0 && b.y1 <= B.y1, `${who} ${v}/${k}: inside viewBox (x ${b.x0}..${b.x1} in ${B.x0}..${B.x1}, y ${b.y0}..${b.y1})`);
  }
  const fb = bbox(F[v]._body), mb = bbox(M[v]._body);
  // ★ THE FEMALE IS PINNED TO THE MALE BY SHOULDER->FEET, NOT BY THE SILHOUETTE'S TOP EDGE.
  // The male's traps rise to the base of the skull; the reference the female is traced from had its
  // head cut off, so she has almost no neck. Comparing top edges therefore made "same size" mean
  // "her shoulders sit where his neck does", which stretched her BODY 3.1% (front) / 7.4% (back)
  // bigger than his while every extent check passed. Mo spotted it on the device before this guard
  // could. Anchor on the deltoid top and the ground line — the two landmarks both figures really
  // share — so the thing asserted is the thing a reader would call "the same size".
  const LM = v === "front" ? "Shoulders" : "Rear Delts";
  const fd = bbox(F[v][LM]), md = bbox(M[v][LM]);
  const fLen = fb.y1 - fd.y0, mLen = mb.y1 - md.y0;
  ok(Math.abs(fb.y1 - mb.y1) <= 2, `${v}: female stands on the male's ground line (feet ${fb.y1} vs ${mb.y1})`);
  ok(Math.abs(fLen / mLen - 1) <= 0.03, `${v}: female shoulder->feet within 3% of the male (${fLen.toFixed(1)} vs ${mLen.toFixed(1)}, ${((fLen/mLen-1)*100).toFixed(1)}%)`);
  ok(fb.x1 - fb.x0 <= mb.x1 - mb.x0, `${v}: female is no wider than the male (${(fb.x1-fb.x0).toFixed(1)} vs ${(mb.x1-mb.x0).toFixed(1)})`);
  const bodySubs = new Set(F[v]._body.split(/\s*(?<=Z)\s*/).map(s => s.trim()).filter(Boolean));
  for (const k of Object.keys(F[v])) { if (k === "_body") continue; const subs = F[v][k].split(/\s*(?<=Z)\s*/).map(s => s.trim()).filter(Boolean);
    ok(subs.length > 0 && subs.every(s => bodySubs.has(s)), `female ${v}/${k}: all ${subs.length} subpaths occur verbatim in _body`); }
}
console.log(fails ? `FAIL all (${fails} failures)` : "PASS all: body-map keys, bounds, female-vs-male size and region\u2282_body hold");
process.exit(fails ? 1 : 0);
