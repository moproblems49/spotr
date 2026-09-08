#!/usr/bin/env node
// Regenerate BODYMAP_FEMALE in src/bodyMapData.js from the licensed Illustrator artwork.
//
//   node build/bodymap/gen.mjs <path-to/AdobeStock_858843878.ai> [--write]
//
// ★ THE ARTWORK IS NOT IN THIS REPO AND MUST NOT BE ADDED. This repo is public and the file is
// licensed for the app, not for redistribution — same rule as every other credential/asset in
// CLAUDE.md. Mo holds it; the path is an argument.
//
// WHAT THIS DOES, AND WHY EACH STEP EXISTS:
//  1. read the artist's own Béziers out of the EPS (eps.mjs) — no raster, no tracing anywhere.
//     Three earlier attempts traced raster references and all three failed the same way: a
//     ~200px-tall figure cannot carry ~78 individually-shaped muscles per view, so they came out
//     as slivers with hairline barbs. This file has them as real vector paths.
//  2. pick out the two female figures and their silhouettes by colour + x-band.
//  3. CUT head, hands and feet, because the male map has none of them and the pair must match.
//     Each cut is a CHORD across the outline (geom.cutChord): find where the outline crosses it,
//     drop the arc containing the part being removed, close with the straight chord. Everything
//     else keeps the artist's curves exactly; only the two split segments are recomputed, and by
//     de Casteljau rather than resampling.
//  4. drop head/hand/foot MUSCLES, and trim the few that straddle a cut (geom.clipHalf) — a shape
//     poking past the trimmed silhouette would paint outside the body, which pw_bodymapfemale
//     asserts against at pixel level.
//  5. assign each muscle to one of the male map's nine region names by position. The bands were
//     READ OFF an indexed render of the real shapes, not guessed, and they follow the MALE map's
//     own conventions so the pair reads as one family — notably that its "Obliques" are the
//     serratus digitations flanking the abs.
//  6. bring the ARMS IN. Anchored on the landmarks both figures share, she comes out 5.6% wider
//     than the male and past the tightest viewBox the app draws her in, so she would be clipped on
//     device. Scaling down would break the shoulder->feet match and squeezing x would distort every
//     muscle, so instead a y-dependent map leaves the torso identical, compresses only the EMPTY
//     GAP between torso and arm, and translates the arm rigidly. No muscle shape is deformed, and
//     the shift self-ramps to zero at the shoulder because there the gap closes.
//  7. fit UNIFORMLY on deltoid top + ground line — never on outer extent. This figure has no head,
//     so matching bounding boxes would put her shoulders where his neck is and stretch the body to
//     fill the gap (that shipped once, measured +7.4% on the back, and Mo spotted it on the device).
//  8. emit. _body is the cut silhouette PLUS every region subpath, so `region ⊂ _body` holds
//     VERBATIM and registration cannot drift; sim_bodymapfemale asserts exactly that.
import fs from "fs";
import path from "path";
import { readEPS } from "./eps.mjs";
import { bb, ccw, centroid, clipHalf, cutChord, dOf, flatten, xf } from "./geom.mjs";

const AI = process.argv[2];
const WRITE = process.argv.includes("--write");
if(!AI || !fs.existsSync(AI)){ console.error("usage: node build/bodymap/gen.mjs <AdobeStock_858843878.ai> [--write]"); process.exit(2); }
const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const log = (...a) => console.log(...a);

// ── 1-2. figures ────────────────────────────────────────────────────────────────────────────────
const MUSCLE_K = "0.677,0.609,0.599,0.476";
const key = c => (c || [0,0,0,0]).map(v => (+v).toFixed(3)).join(",");
const shapes = readEPS(AI);
for(const s of shapes){ const q = bb(s.p); s.b = [q.x0, q.y0, q.x1, q.y1]; }
const muscles = shapes.filter(s => key(s.c) === MUSCLE_K);
// The female BACK silhouette shares a fill with the artboard background, so it is the second
// subpath of that shape rather than a shape of its own.
const bgShape   = shapes.find(s => s.p.length === 2 && s.b[2] > 3900);
const frontSil  = shapes.find(s => key(s.c).startsWith("0.267") && s.p.length === 1 && s.b[0] > 2200 && s.b[2] < 3100 && (s.b[3]-s.b[1]) > 1000);
const FIG = {
  front: { sil: frontSil.p[0], muscles: muscles.filter(s => { const c=(s.b[0]+s.b[2])/2; return c >= 2000 && c < 3060; }).map(s => s.p[0]) },
  back:  { sil: bgShape.p[1],  muscles: muscles.filter(s => { const c=(s.b[0]+s.b[2])/2; return c >= 3060; }).map(s => s.p[0]) },
};
log(`parsed ${shapes.length} shapes; female front ${FIG.front.muscles.length} muscles, back ${FIG.back.muscles.length}`);

// ── scanline profile, the measurement every landmark comes from ─────────────────────────────────
function scan(sil, step = 3){
  const { pts } = flatten(sil, 24), B = bb([sil]), rows = [];
  for(let y = B.y0 + 0.5; y <= B.y1; y += step){
    const xs = [];
    for(let k = 0; k < pts.length; k++){ const a = pts[k].p, b = pts[(k+1) % pts.length].p;
      if((a[1]-y) * (b[1]-y) < 0) xs.push(a[0] + (b[0]-a[0]) * (y-a[1]) / (b[1]-a[1])); }
    xs.sort((p,q) => p-q);
    const runs = []; for(let i = 0; i+1 < xs.length; i += 2) runs.push([xs[i], xs[i+1]]);
    rows.push({ y, runs });
  }
  return { rows, B };
}
// ── 3. landmarks + cuts ─────────────────────────────────────────────────────────────────────────
function landmarks(sil){
  const { rows, B } = scan(sil, 2), cx = (B.x0+B.x1)/2, H = B.y1-B.y0;
  const rowAt = y => rows.reduce((b,r) => Math.abs(r.y-y) < Math.abs(b.y-y) ? r : b, rows[0]);
  let neck = null;                                     // narrowest single run below the skull
  for(const r of rows){ const f = (r.y-B.y0)/H; if(f < 0.11 || f > 0.22 || r.runs.length !== 1) continue;
    const w = r.runs[0][1]-r.runs[0][0]; if(!neck || w < neck.w) neck = { y:r.y, w, run:r.runs[0] }; }
  const armRuns = side => rows.filter(r => r.runs.length >= 3).map(r => {
    const cand = r.runs.filter(u => side < 0 ? u[1] < cx-110 : u[0] > cx+110);
    const u = side < 0 ? cand[0] : cand[cand.length-1];
    return u ? { y:r.y, u, w:u[1]-u[0] } : null; }).filter(Boolean);
  const wristOf = side => { const a = armRuns(side);   // last minimum before the hand flares
    for(let i = 4; i < a.length-1; i++) if(a[i+1].w > a[i].w*1.08 && a[i].y > B.y0 + 0.38*H) return a[i];
    return a[a.length-1]; };
  const axisOf = (side, w) => { const a = armRuns(side);
    const up = a.reduce((b,r) => Math.abs(r.y-(w.y-26)) < Math.abs(b.y-(w.y-26)) ? r : b, a[0]);
    const d = [(w.u[0]+w.u[1])/2 - (up.u[0]+up.u[1])/2, w.y - up.y], L = Math.hypot(...d);
    return [d[0]/L, d[1]/L]; };
  let ankle = null;                                    // narrowest leg run above the foot flare
  for(const r of rows){ const f = (r.y-B.y0)/H; if(f < 0.85 || f > 0.96) continue;
    const L = r.runs.filter(u => u[1] < cx)[0]; if(!L) continue;
    const w = L[1]-L[0]; if(!ankle || w <= ankle.w) ankle = { y:r.y, w }; }
  const wl = wristOf(-1), wr = wristOf(1);
  return { B, cx, H, neck, wl, wr, al: axisOf(-1,wl), ar: axisOf(1,wr), ankle, rowAt };
}
function cutSil(sil, L){
  const steps = [{ name:"head", c1:[L.neck.run[0]-70, L.neck.y], c2:[L.neck.run[1]+70, L.neck.y],
                   drop:[(L.neck.run[0]+L.neck.run[1])/2, L.B.y0] }];
  for(const [side, w, ax] of [[-1, L.wl, L.al], [1, L.wr, L.ar]]){
    const c = [(w.u[0]+w.u[1])/2, w.y], per = [-ax[1], ax[0]], R = w.w*1.4;   // chord ⊥ to the arm axis
    steps.push({ name: side < 0 ? "hand L" : "hand R",
      c1:[c[0]-per[0]*R, c[1]-per[1]*R], c2:[c[0]+per[0]*R, c[1]+per[1]*R],
      drop:[c[0]+ax[0]*70, c[1]+ax[1]*70] });
  }
  for(const leg of L.rowAt(L.ankle.y).runs.filter(u => u[1]-u[0] < 90)){
    const mid = (leg[0]+leg[1])/2;
    steps.push({ name:`foot ${mid < L.cx ? "L" : "R"}`, c1:[mid-52, L.ankle.y], c2:[mid+52, L.ankle.y], drop:[mid, L.B.y1] });
  }
  let p = sil;
  for(const s of steps){ const r = cutChord(p, s.c1, s.c2, s.drop);
    if(!r || r.err) throw new Error(`cut ${s.name}: ${r ? r.err : "failed"}`); p = r; }
  if(steps.length !== 5) throw new Error(`expected 5 cuts, made ${steps.length}`);
  return ccw(p);
}
// ── 4. which muscles survive the cuts ───────────────────────────────────────────────────────────
function keepMuscles(list, L){
  const kept = [], why = {};
  for(const m of list){
    const c = centroid(m), B2 = bb([m]); let drop = null;
    if(B2.y1 < L.neck.y + 4) drop = "head";
    else if(B2.y0 > L.ankle.y - 4) drop = "foot";
    else for(const [w, ax] of [[L.wl, L.al], [L.wr, L.ar]]){
      const wc = [(w.u[0]+w.u[1])/2, w.y];
      const along = (c[0]-wc[0])*ax[0] + (c[1]-wc[1])*ax[1];
      const perp  = Math.abs((c[0]-wc[0])*-ax[1] + (c[1]-wc[1])*ax[0]);
      if(along > 0 && perp < 90) drop = "hand";
    }
    if(drop){ why[drop] = (why[drop]||0)+1; continue; }
    let t = m;
    t = clipHalf(t, [0,-1], -L.neck.y)  ?? t;    // keep y >= neck cut
    t = clipHalf(t, [0, 1],  L.ankle.y) ?? t;    // keep y <= ankle cut
    kept.push(ccw(t));
  }
  return { kept, why };
}
// ── 5. regions ──────────────────────────────────────────────────────────────────────────────────
const ORDER = {
  front: ["Traps","Shoulders","Chest","Biceps","Forearms","Abs","Obliques","Quads","Calves"],
  back:  ["Traps","Rear Delts","Lats","Triceps","Forearms","LowerBack","Glutes","Hamstrings","Calves"],
};
const BAND = {
  front: x => {
    if(x.part[0] === "a") return x.v <= 0.24 ? "Biceps" : "Forearms";
    if(x.part[0] === "l") return x.v <= 0.75 ? "Quads" : "Calves";
    if(x.v <= 0.115) return Math.abs(x.u) >= 0.20 ? "Shoulders" : "Traps";
    if(x.v <= 0.16)  return "Chest";
    // below the pubis the torso column is adductor/pectineus — leg movers, and the app has no
    // Adductors region (the male art simply leaves this area grey, so there is no precedent).
    if(x.v > 0.43)   return "Quads";
    return Math.abs(x.u) <= 0.105 ? "Abs" : "Obliques";
  },
  back: x => {
    if(x.part[0] === "a") return x.v <= 0.27 ? "Triceps" : "Forearms";
    if(x.part[0] === "l") return x.v <= 0.75 ? "Hamstrings" : "Calves";
    if(x.v <= 0.12) return Math.abs(x.u) >= 0.21 ? "Rear Delts" : "Traps";
    if(x.v <= 0.33) return (x.v > 0.25 && Math.abs(x.u) <= 0.09) ? "LowerBack" : "Lats";
    return "Glutes";
  },
};
function classify(sil, kept){
  const B = bb([sil]), H = B.y1-B.y0, CX = (B.x0+B.x1)/2, { rows } = scan(sil, 3);
  const rowAt = y => rows.reduce((b,r) => Math.abs(r.y-y) < Math.abs(b.y-y) ? r : b, rows[0]);
  return kept.map(m => {
    const c = centroid(m), v = (c[1]-B.y0)/H, r = rowAt(c[1]).runs;
    const i = r.findIndex(u => c[0] >= u[0]-2 && c[0] <= u[1]+2);
    const part = r.length >= 3 ? (i === 0 || i === r.length-1 ? "arm" : "torso")
               : r.length === 2 ? (v > 0.45 ? "leg" : "arm") : "torso";
    return { m, v, u: (c[0]-CX)/(B.x1-B.x0), part };
  });
}
// ── 6. arms in ──────────────────────────────────────────────────────────────────────────────────
function narrower(sil, shift){
  const { rows } = scan(sil, 3), B = bb([sil]), cx = (B.x0+B.x1)/2;
  const info = rows.map(r => {
    const arms = r.runs.filter(u => Math.abs((u[0]+u[1])/2 - cx) > 180);
    const body = r.runs.filter(u => !arms.includes(u));
    return { y: r.y,
      b: (body.length ? Math.max(...body.map(u => Math.max(Math.abs(u[0]-cx), Math.abs(u[1]-cx)))) : 0) + 2,
      a: arms.length ? Math.min(...arms.map(u => Math.min(Math.abs(u[0]-cx), Math.abs(u[1]-cx)))) - 2 : null };
  });
  const at = y => info.reduce((p,c) => Math.abs(c.y-y) < Math.abs(p.y-y) ? c : p, info[0]);
  return (x, y) => {
    const r = at(y), d = x-cx, ad = Math.abs(d), sg = Math.sign(d) || 1;
    if(r.a === null || r.a <= r.b) return [x, y];
    const S = Math.min(shift, (r.a-r.b) * 0.85);       // never let the gap invert
    const nd = ad <= r.b ? ad
             : ad >= r.a ? ad - S
             : r.b + (ad-r.b) * ((r.a-r.b-S) / (r.a-r.b));
    return [cx + sg*nd, y];
  };
}
// ── 7-8. fit + emit ─────────────────────────────────────────────────────────────────────────────
const TARGET_W = { front: 146, back: 145 };  // a little under the male's, so "no wider" holds with margin
const mbox = d => { const n = d.match(/-?\d*\.?\d+/g).map(Number);
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  for(let i=0;i<n.length;i+=2){ x0=Math.min(x0,n[i]); x1=Math.max(x1,n[i]); y0=Math.min(y0,n[i+1]); y1=Math.max(y1,n[i+1]); }
  return { x0,x1,y0,y1 }; };
const MALE = (await import(`file://${ROOT}/src/bodyMapData.js`)).BODYMAP_MALE;
const map = {};
for(const view of ["front","back"]){
  const L = landmarks(FIG[view].sil);
  const sil = cutSil(FIG[view].sil, L);
  const { kept, why } = keepMuscles(FIG[view].muscles, L);
  const cls = classify(sil, kept);
  const regions = Object.fromEntries(ORDER[view].map(r => [r, []]));
  for(const x of cls) regions[BAND[view](x)].push(x.m);
  for(const r of ORDER[view]) if(!regions[r].length) throw new Error(`${view}/${r} is empty`);
  const LM = view === "front" ? "Shoulders" : "Rear Delts";
  const mb = mbox(MALE[view]._body), md = mbox(MALE[view][LM]), mLen = mb.y1 - md.y0;
  const fb0 = bb([sil]), fd0 = bb(regions[LM]);
  const s = mLen / (fb0.y1 - fd0.y0), ty = mb.y1 - s*fb0.y1;
  let lo = 0, hi = 120, shift = 0;                     // solve the arm shift for the target width
  for(let i = 0; i < 40; i++){ shift = (lo+hi)/2;
    const b = bb([xf(sil, narrower(sil, shift))]);
    if(s * (b.x1-b.x0) > TARGET_W[view]) lo = shift; else hi = shift; }
  const nf = narrower(sil, shift), fbN = bb([xf(sil, nf)]);
  const tx = (mb.x0+mb.x1)/2 - s*(fbN.x0+fbN.x1)/2;
  const T = sub => xf(xf(sub, nf), (x,y) => [s*x+tx, s*y+ty]);
  const tSil = T(sil), tReg = Object.fromEntries(ORDER[view].map(r => [r, regions[r].map(T)]));
  map[view] = { _body: [tSil, ...ORDER[view].flatMap(r => tReg[r])].map(dOf).join(" ") };
  for(const r of ORDER[view]) map[view][r] = tReg[r].map(dOf).join(" ");
  const fb = bb([tSil]), fd = bb(tReg[LM]);
  log(`${view}: kept ${kept.length} (dropped ${JSON.stringify(why)})  scale ${s.toFixed(5)}  armShift ${shift.toFixed(1)}`);
  log(`   x ${fb.x0.toFixed(1)}..${fb.x1.toFixed(1)} (w ${(fb.x1-fb.x0).toFixed(1)} vs male ${(mb.x1-mb.x0).toFixed(1)})  y ${fb.y0.toFixed(1)}..${fb.y1.toFixed(1)}  ground d=${Math.abs(fb.y1-mb.y1).toFixed(2)}  shoulder->feet ${(((fb.y1-fd.y0)/mLen-1)*100).toFixed(2)}%`);
  log(`   ` + ORDER[view].map(r => `${r}:${tReg[r].length}`).join(" "));
}
// self-check the properties the guards rest on, before anything is written
for(const v of ["front","back"]){
  const body = new Set(map[v]._body.split(/\s*(?<=Z)\s*/).map(s => s.trim()).filter(Boolean));
  for(const k of Object.keys(map[v])){
    if(!/^[MLCZ0-9.,\s-]+$/.test(map[v][k])) throw new Error(`${v}/${k}: non M/L/C/Z command`);
    if(k === "_body") continue;
    const subs = map[v][k].split(/\s*(?<=Z)\s*/).map(s => s.trim()).filter(Boolean);
    if(!subs.length || !subs.every(s => body.has(s))) throw new Error(`${v}/${k}: not verbatim in _body`);
  }
}
log("self-check ok: verbatim subpaths + absolute M/L/C/Z only");

const line = "export const BODYMAP_FEMALE = " + JSON.stringify(map) + ";";
if(WRITE){
  const f = `${ROOT}/src/bodyMapData.js`;
  const src = fs.readFileSync(f, "utf8").split("\n");
  const i = src.findIndex(l => l.startsWith("export const BODYMAP_FEMALE ="));
  if(i < 0) throw new Error("BODYMAP_FEMALE line not found");
  src[i] = line;
  fs.writeFileSync(f, src.join("\n"));
  log(`wrote src/bodyMapData.js line ${i+1} (${line.length} chars)`);
} else log(`dry run — ${line.length} chars; pass --write to update src/bodyMapData.js`);
