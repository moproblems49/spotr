// BODYMAP_FEMALE generator — vectorises Mo's licensed reference raster (front + back female figures, dark
// muscle shapes separated by light gaps on white) into the app's body-map format.
//
//   node build/bodymap_trace.mjs <ref.jpg>            # trace, compare against src/bodyMapData.js, exit 1 on drift
//   node build/bodymap_trace.mjs <ref.jpg> --write    # trace and rewrite the BODYMAP_FEMALE line in place
//
// THE RASTER IS DELIBERATELY NOT IN THIS REPO: the repo is public and the art is licensed for use in the app,
// not for redistribution. Mo holds the file. Without it this script cannot run, which is why the standing
// guards (sim_bodymapfemale, pw_bodymapfemale) pin properties of the OUTPUT instead of regenerating it.
//
// Pipeline: supersample 4x -> threshold (luminance < TH) -> 4-connected components (each muscle is its own
// island in this art) -> marching-squares outline -> moving-average smooth -> Douglas-Peucker -> closed
// Catmull-Rom cubics -> uniform fit of the figure's height onto the male's y-extent -> per-view ARM PULL-IN:
// the reference holds its arms out wide (hand-to-hand 133 px = 218 map units) and the app's front viewBox is
// 158 wide, so a 3-zone monotone map in u=|x-cx| (torso untouched, torso-arm gap compressed by sg, arm by sa)
// brings the hands inside the frame. Applied to EVERY path of a view, so regions and _body share geometry.
// Regions are assembled from the component table in PROFILE (ids come from the labelled component map the
// tracer can dump; pairs are left/right mirrors). bodyOnly = kneecap bits: in _body, no region, as the male.
// ★ THE HANDS ARE DELIBERATELY UNASSIGNED (front 99/103/107/100/104/108, back 97/98/101/102/105/106).
// The reference draws splayed hands with fingers; the MALE map has none — its arm tapers to a point at
// the wrist — and Mo asked for the two to match. Because _body is the UNION of every assigned component,
// dropping an id from its region removes it from the silhouette too, which is exactly what is wanted here:
// one deletion, not a region edit plus a separate silhouette edit. Identified by geometry, not by eye —
// the hand components sit BELOW the forearm (source y 87-111 vs 52-86) and further from the centre line.
// They also read as part of the FOREARM muscle when coloured, which is the bug Mo reported as
// "fix the forearm": the orange region ran all the way into the fingers.
import { chromium } from "playwright-core"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url";
const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/bodyMapData.js");
const refPath = process.argv[2]; if (!refPath || !fs.existsSync(refPath)) { console.error("usage: node build/bodymap_trace.mjs <ref.jpg> [--write]"); process.exit(2); }
export const PROFILE = {
  TH: 110, EPS: 1.6, SMOOTH: 2,
  // ★ ARM_SMOOTH — WHY THE ARM MUSCLES GET A WIDER SMOOTHING WINDOW THAN EVERYTHING ELSE.
  // Mo, from his phone: "the female biceps are pointy, need to look more like the male."
  // Measured rather than eyeballed: on the MALE map no arm-muscle outline has an interior corner
  // under 45 degrees (sharpest 92-111), while the traced female had spikes at 7, 9, 15 and 16
  // degrees — needle points, which is exactly what reads as "pointy". The cause is resolution, not
  // the tracer: the reference is 360x224, so a female arm is ~10 source px wide and each muscle in
  // it is a 3-4 px sliver; marching squares around a sliver that thin yields hairline barbs that
  // SMOOTH:2 cannot blunt. A wider moving average on the DENSE outline (before Douglas-Peucker,
  // while there are still hundreds of points) rounds the facets and pulls the barbs in, without
  // collapsing the shape the way post-simplification smoothing would.
  // Applied ONLY to the arm components — the torso and legs are wide enough in the source to trace
  // cleanly at SMOOTH:2, and widening it globally would round detail that is genuinely there.
  // Smoothing alone was TRIED AND MEASURED AND DID NOT WORK (9 left spikes at 2/15/17/28 deg, one
  // WORSE than before): a needle is not a high-frequency wiggle, so a moving average shortens it
  // without widening it. ARM_SMOOTH stays mild — it rounds the facets — and ARM_MIN_ANGLE does the
  // actual declawing on the SIMPLIFIED polygon, where a needle finally shows up as one 2-degree
  // vertex (on the dense outline every angle is ~180 deg, so nothing there can see it).
  ARM_SMOOTH: 5, ARM_MIN_ANGLE: 50,
  scale: (386.5 - 24.3) / (223.8 - 2.8), refYTop: 2.8, yTop: 24.3,
  // st: mild proportion tune on top of the trace (set to [[0, 1]] for the untouched reference proportions) — shoulders/ribs in, pelvis + upper thigh out, knees in
  st: [[20, 0.95], [45, 0.93], [95, 0.93], [125, 0.96], [150, 0.97], [170, 1.02], [190, 1.07], [240, 1.07], [275, 1.0], [300, 0.96], [330, 0.98], [400, 0.98]],
  // ★★ fit is anchored on the SHOULDER LINE and the GROUND, *not* on the silhouette's top edge —
  // matching top edges was wrong and Mo caught it: "female back has no neck, so it being the same
  // height as male means it's actually bigger." He is right, and it measures. The male's traps rise
  // to a point at the base of the skull (26.6 units of neck above his deltoids on the back); the
  // reference's back figure had its head cut off by the image edge, so the female has 2.9. Matching
  // the OUTER extents therefore put her SHOULDERS where his NECK is and stretched the body to fill
  // the gap: measured shoulder-top -> feet she was +3.1% front, +7.4% back. Both views now scale
  // UNIFORMLY so shoulder->feet equals the male's, anchored at the feet so both stand on one ground
  // line. The empty band left above her shoulders is the neck she does not have, and leaving it
  // empty is what keeps the two BODIES the same size. Landmark: Shoulders front / Rear Delts back.
  front: { refCx: 117.5, cx: 131.6, fit: { k: 0.96311, yTop: 36.41 },
    B:  [[100, 37], [110, 30], [140, 30], [160, 40], [210, 40]],
    g:  [[100, 3],  [110, 20], [140, 20], [160, 42], [210, 42]],
    sg: [[98, 1.0], [112, 0.45], [150, 0.45], [172, 0.19], [400, 0.19]],
    sa: [[98, 1.0], [112, 0.85], [400, 0.8]],
    regions: {
      Traps: [15, 19, 23, 24, 31, 32], Shoulders: [28, 33, 27, 34], Chest: [37, 38],
      Biceps: [43, 55, 44, 56], Forearms: [65, 80, 66, 81],
      Abs: [49, 50, 57, 58, 63, 64, 73, 74, 82, 83, 62, 61], Obliques: [69, 70],
      Quads: [87, 92, 114, 122, 88, 91, 93, 113, 123], Calves: [137, 135, 136, 138, 143, 144] },
    bodyOnly: [125, 126, 129, 130, 131, 132] },
  // Same anchoring as front (see above). k and yTop are DERIVED from the measured landmarks, not guessed.
  // the untuned back traced to 32.9..390.2, so k = 345.7/357.3 and yTop solves for a 33.2 top.
  back: { refCx: 266.3, cx: 106.3, fit: { k: 0.90067, yTop: 49.35 },
    B:  [[100, 36], [116, 33], [150, 36], [165, 45], [210, 45]],
    g:  [[100, 3],  [116, 18], [150, 30], [165, 40], [210, 40]],
    sg: [[98, 1.0], [112, 0.45], [150, 0.45], [172, 0.3], [400, 0.3]],
    sa: [[98, 1.0], [112, 0.85], [400, 0.8]],
    regions: {
      Traps: [25, 26], "Rear Delts": [29, 30, 35, 36], Lats: [41, 42], Triceps: [39, 40, 45, 46, 54, 53],
      Forearms: [67, 68, 75, 76], LowerBack: [71, 72, 78, 79], Glutes: [84, 85, 94, 95],
      Hamstrings: [116, 117, 118, 119, 120, 121, 124], Calves: [127, 128, 133, 134, 139, 140, 141, 142] } },
};

const P = PROFILE;
const ref = "data:image/jpeg;base64," + fs.readFileSync(refPath).toString("base64");
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.setContent(`<body style="margin:0;background:#fff"><canvas id="c"></canvas></body>`);
// ---- in-browser: label + trace every component; return outlines in source-pixel coords (4x resolution) ----
const traced = await page.evaluate(async ({ src, TH, S, EPS, SMOOTH, ARM_SMOOTH, ARM_MIN_ANGLE, ARM_IDS }) => {
  const ARM = new Set(ARM_IDS || []);
  const img = new Image(); img.src = src; await img.decode();
  const c = document.getElementById("c"); c.width = img.width * S; c.height = img.height * S; const x = c.getContext("2d"); x.drawImage(img, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data; const W = c.width, H = c.height;
  const lum = i => 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const lab = new Int32Array(W * H); let n = 0; const comps = []; const st = new Int32Array(W * H);
  for (let p = 0; p < W * H; p++) { if (lab[p] || lum(p) >= TH) continue; n++; let sp = 0; st[sp++] = p; lab[p] = n; let area = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    while (sp) { const q = st[--sp]; const qx = q % W, qy = (q / W) | 0; area++; x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, qy); y1 = Math.max(y1, qy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = qx + dx, ny = qy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const r2 = ny * W + nx; if (lab[r2] || lum(r2) >= TH) continue; lab[r2] = n; st[sp++] = r2; } }
    comps.push({ id: n, area: area / (S * S), x0, x1, y0, y1 }); }
  // outline: marching-squares edges on pixel corners, chained into loops; keep the largest loop (outer boundary)
  const outline = (k, bb) => {
    const at = (px, py) => px >= 0 && py >= 0 && px < W && py < H && lab[py * W + px] === k;
    const edges = new Map(); const key = (px, py) => px + "," + py;
    const add = (ax, ay, bx, by) => { const kk = key(ax, ay); if (!edges.has(kk)) edges.set(kk, []); edges.get(kk).push([bx, by]); };
    for (let py = bb.y0; py <= bb.y1; py++) for (let px = bb.x0; px <= bb.x1; px++) if (at(px, py)) {
      if (!at(px, py - 1)) add(px, py, px + 1, py); if (!at(px + 1, py)) add(px + 1, py, px + 1, py + 1);
      if (!at(px, py + 1)) add(px + 1, py + 1, px, py + 1); if (!at(px - 1, py)) add(px, py + 1, px, py); }
    const loops = [];
    for (const [k0] of edges) { let cur = k0; const pts = []; while (edges.has(cur) && edges.get(cur).length) { const [nx, ny] = edges.get(cur).shift(); const [cx, cy] = cur.split(",").map(Number); pts.push([cx, cy]); cur = key(nx, ny); if (cur === k0) break; } if (pts.length > 2) loops.push(pts); }
    let best = null, bestA = -1; for (const L of loops) { let a = 0; for (let i = 0; i < L.length; i++) { const p = L[i], q = L[(i + 1) % L.length]; a += p[0] * q[1] - q[0] * p[1]; } a = Math.abs(a); if (a > bestA) { bestA = a; best = L; } }
    return best;
  };
  const smooth = (pts, w) => pts.map((_, i) => { let sx = 0, sy = 0; for (let j = -w; j <= w; j++) { const p = pts[(i + j + pts.length) % pts.length]; sx += p[0]; sy += p[1]; } return [sx / (2 * w + 1), sy / (2 * w + 1)]; });
  const dp = (pts, eps) => { // closed polyline: split at the two farthest-apart points, DP each half
    const dist = (p, a, bq) => { const dx = bq[0] - a[0], dy = bq[1] - a[1]; const L = dx * dx + dy * dy || 1; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L; t = Math.max(0, Math.min(1, t)); const ex = a[0] + t * dx - p[0], ey = a[1] + t * dy - p[1]; return Math.sqrt(ex * ex + ey * ey); };
    const rec = (arr) => { if (arr.length < 3) return arr; let im = 0, dm = -1; for (let i = 1; i < arr.length - 1; i++) { const dd = dist(arr[i], arr[0], arr[arr.length - 1]); if (dd > dm) { dm = dd; im = i; } } if (dm <= eps) return [arr[0], arr[arr.length - 1]]; const L = rec(arr.slice(0, im + 1)), R = rec(arr.slice(im)); return L.slice(0, -1).concat(R); };
    let i0 = 0, i1 = 0, dm = -1; for (let i = 0; i < pts.length; i += Math.max(1, (pts.length / 60) | 0)) for (let j = i + 1; j < pts.length; j += Math.max(1, (pts.length / 60) | 0)) { const dd = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2; if (dd > dm) { dm = dd; i0 = i; i1 = j; } }
    const A = pts.slice(i0, i1 + 1), B = pts.slice(i1).concat(pts.slice(0, i0 + 1));
    const ra = rec(A), rb = rec(B); return ra.slice(0, -1).concat(rb.slice(0, -1));
  };
  // Iteratively drop the sharpest vertex while any interior angle is below minDeg. Removing a
  // needle's tip joins its two near-parallel flanks, so the barb is consumed a vertex at a time.
  // Floored at 70% of the original vertices (and 8 absolute) so this can blunt a spike but can
  // never dissolve the muscle's real silhouette.
  const declaw = (pts, minDeg) => {
    const lim = Math.cos(minDeg * Math.PI / 180);
    let P = pts.slice(); const floor = Math.max(7, Math.ceil(pts.length * 0.45));
    for (let guard = 0; guard < 300 && P.length > floor; guard++) {
      let worst = -1, worstC = -2;
      for (let i = 0; i < P.length; i++) {
        const a = P[(i - 1 + P.length) % P.length], c = P[i], e = P[(i + 1) % P.length];
        const v1 = [a[0] - c[0], a[1] - c[1]], v2 = [e[0] - c[0], e[1] - c[1]];
        const n1 = Math.hypot(v1[0], v1[1]), n2 = Math.hypot(v2[0], v2[1]);
        if (n1 < 1e-6 || n2 < 1e-6) continue;
        const cs = (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2);
        if (cs > lim && cs > worstC) { worst = i; worstC = cs; }
      }
      if (worst === -1) break;
      P.splice(worst, 1);
    }
    return P;
  };
  const out = {};
  for (const cc of comps) { if (cc.area < 1) continue; let pts = outline(cc.id, cc); if (!pts) continue; const sw = ARM.has(cc.id) ? (ARM_SMOOTH || SMOOTH) : SMOOTH; if (sw) pts = smooth(pts, sw); pts = dp(pts, EPS); if (ARM.has(cc.id) && ARM_MIN_ANGLE) pts = declaw(pts, ARM_MIN_ANGLE); out[cc.id] = { area: cc.area, pts: pts.map(p => [p[0] / S, p[1] / S]), box: [cc.x0 / S, cc.y0 / S, cc.x1 / S, cc.y1 / S] }; }
  return out;
}, { src: ref, TH: P.TH, S: 4, EPS: P.EPS, SMOOTH: P.SMOOTH, ARM_SMOOTH: P.ARM_SMOOTH, ARM_MIN_ANGLE: P.ARM_MIN_ANGLE,
     ARM_IDS: ["front","back"].flatMap(v => ["Biceps","Triceps","Forearms"]
       .flatMap(r => (P[v].regions[r] || []))) });
await b.close();

// ---- Node: assemble views ----
const pl = stops => y => { if (y <= stops[0][0]) return stops[0][1]; for (let i = 1; i < stops.length; i++) if (y <= stops[i][0]) { const [y0, v0] = stops[i - 1], [y1, v1] = stops[i], t = (y - y0) / (y1 - y0), s = t * t * (3 - 2 * t); return v0 + (v1 - v0) * s; } return stops[stops.length - 1][1]; };
const fmt = n => { const s = n.toFixed(1); return s === "-0.0" ? "0.0" : s; };
function makeXform(view) {
  // ★ fit = a per-view UNIFORM extra scale + its own top anchor, and it must stay UNIFORM.
  // The reference's back figure has its head cut off by the image edge and its feet sit lower, so
  // one shared y-scale left the female back 3.4% TALLER than the male's with the feet 11.3 units
  // below his — the female read BIGGER than the male in the same viewBox, which the app renders
  // both sexes into unchanged. Scaling y alone would fix the height and stretch the figure
  // horizontally against it; this repo's own rule is that the female map scales UNIFORMLY to
  // preserve anatomy, so k multiplies BOTH axes and yTop re-anchors the top.
  const V = P[view], fit = V.fit || {}, s = P.scale * (fit.k ?? 1), yTop = fit.yTop ?? P.yTop;
  const B = pl(V.B), g = pl(V.g), sg = pl(V.sg), sa = pl(V.sa), st = pl(P.st || [[0, 1]]);
  return ([rx, ry]) => {
    const y = yTop + (ry - P.refYTop) * s; const u = Math.abs(rx - V.refCx) * s, sign = Math.sign(rx - V.refCx) || 0;
    const bb = B(y), gg = g(y), k = st(y); // torso scale k on the torso zone; the arm zones ride on its edge unchanged
    const up = u <= bb ? k * u : u <= bb + gg ? k * bb + sg(y) * (u - bb) : k * bb + sg(y) * gg + sa(y) * (u - bb - gg);
    return [V.cx + sign * up, y];
  };
}
// closed Catmull-Rom -> cubic Bézier subpath
function subpath(pts) {
  const n = pts.length; if (n < 3) return "";
  let d = `M${fmt(pts[0][0])},${fmt(pts[0][1])}`;
  for (let i = 0; i < n; i++) { const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${fmt(c1[0])},${fmt(c1[1])} ${fmt(c2[0])},${fmt(c2[1])} ${fmt(p2[0])},${fmt(p2[1])}`; }
  return d + " Z";
}
const FEMALE = {}; const used = new Set(); const missing = [];
for (const view of ["front", "back"]) {
  const xf = makeXform(view); const V = P[view]; const paths = {}; const all = [];
  for (const [region, ids] of Object.entries(V.regions)) { const parts = [];
    for (const id of ids) { const t = traced[id]; if (!t) { missing.push(view + ":" + region + ":#" + id); continue; } if (used.has(id)) throw new Error("component #" + id + " assigned twice"); used.add(id);
      const sp = subpath(t.pts.map(xf)); parts.push(sp); all.push(sp); }
    paths[region] = parts.join(" "); }
  for (const id of (V.bodyOnly || [])) { const t = traced[id]; if (!t) { missing.push(view + ":bodyOnly:#" + id); continue; } if (used.has(id)) throw new Error("component #" + id + " assigned twice"); used.add(id); all.push(subpath(t.pts.map(xf))); }
  FEMALE[view] = { _body: all.join(" "), ...paths };
}
if (missing.length) console.log("MISSING components:", missing.join(" "));
const unassigned = Object.entries(traced).filter(([id]) => !used.has(+id)).map(([id, t]) => ({ id: +id, area: t.area, box: t.box }));
console.log("assigned", used.size, "components; unassigned", unassigned.length, "(total area", unassigned.reduce((a, c) => a + c.area, 0).toFixed(0), "px):", unassigned.filter(c => c.area >= 6).map(c => `#${c.id}(${Math.round(c.area)}px @${c.box[0].toFixed(0)},${c.box[1].toFixed(0)})`).join(" "));
// bounds report
for (const view of ["front", "back"]) { let xs = [], ys = []; for (const k of Object.keys(FEMALE[view])) { const nums = FEMALE[view][k].match(/-?\d*\.?\d+/g).map(Number); for (let i = 0; i < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]); } }
  console.log(`${view}: x ${Math.min(...xs).toFixed(1)}..${Math.max(...xs).toFixed(1)}  y ${Math.min(...ys).toFixed(1)}..${Math.max(...ys).toFixed(1)}  chars ${FEMALE[view]._body.length}`); }
const line = "export const BODYMAP_FEMALE = " + JSON.stringify(FEMALE) + ";";
const lines = fs.readFileSync(FILE, "utf8").split("\n"); const idx = lines.findIndex(l => l.startsWith("export const BODYMAP_FEMALE = "));
if (idx < 0) { console.error("BODYMAP_FEMALE export line not found"); process.exit(2); }
if (process.argv.includes("--write")) { lines[idx] = line; fs.writeFileSync(FILE, lines.join("\n")); console.log("wrote BODYMAP_FEMALE (", line.length, "chars )"); }
else if (lines[idx] === line) console.log("PASS bodymap_trace: src/bodyMapData.js BODYMAP_FEMALE matches the tracer byte-for-byte");
else { console.log("FAIL bodymap_trace: BODYMAP_FEMALE differs from the tracer output (regenerate with --write, or the profile changed)"); process.exit(1); }
