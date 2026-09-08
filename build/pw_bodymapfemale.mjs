// Pixel guard for the body maps: every muscle region's INK must lie inside its own view's _body, for both
// sexes. The app paints regions in colour on top of the grey silhouette; a region drifting outside it
// paints colour in space (and nothing else in the repo can see that — the map still renders). Also pins
// that no region has vanished or shrunk to a sliver: an untrained muscle is painted with emptyMuscleCol
// and must still read as a region.
// Rasterises via canvas in Chromium (no server needed). Red-proofed: a +3 unit shift of one female region
// reports ~2% outside and fails; an emptied region fails the area floor.
import { chromium } from "playwright-core";
import { BODYMAP_MALE, BODYMAP_FEMALE } from "../src/bodyMapData.js";
let fails = 0; const check = (l, c, d) => { if (c) console.log(`  PASS ${l}`); else { fails++; console.log(`  FAIL ${l}${d ? " — " + d : ""}`); } };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage(); await page.setContent("<body></body>");
const r = await page.evaluate(({ M, F }) => {
  const S = 4, W = 240 * S, H = 400 * S, out = {};
  const raster = (d, lw) => { const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d", { willReadFrequently: true }); x.setTransform(S, 0, 0, S, 0, 0); const p = new Path2D(d); x.fillStyle = "#000"; x.fill(p); if (lw) { x.strokeStyle = "#000"; x.lineWidth = lw; x.lineJoin = "round"; x.stroke(p); } return x.getImageData(0, 0, W, H).data; };
  for (const [n, Sx] of [["male", M], ["female", F]]) for (const v of ["front", "back"]) {
    const body = raster(Sx[v]._body, 3); let bodyA = 0; for (let i = 3; i < body.length; i += 4) if (body[i] > 40) bodyA++;
    out[n + ":" + v] = { bodyA, regions: {} };
    for (const k of Object.keys(Sx[v])) { if (k === "_body") continue; const reg = raster(Sx[v][k], 0.5); let tot = 0, outside = 0;
      for (let i = 3; i < reg.length; i += 4) if (reg[i] > 40) { tot++; if (body[i] <= 40) outside++; }
      out[n + ":" + v].regions[k] = { tot, outsidePct: 100 * outside / Math.max(1, tot), areaPct: 100 * tot / Math.max(1, bodyA) }; }
  }
  return out;
}, { M: BODYMAP_MALE, F: BODYMAP_FEMALE });
await b.close();
for (const key of Object.keys(r)) for (const [k, q] of Object.entries(r[key].regions)) {
  check(`${key}/${k}: ink inside _body (${q.outsidePct.toFixed(2)}% outside)`, q.outsidePct <= 0.05);
  // smallest legitimate region measured: female front Traps ≈ 1.5% of the silhouette; the floor sits well under it
  check(`${key}/${k}: region has real area (${q.areaPct.toFixed(1)}% of body)`, q.areaPct >= 0.6);
}
console.log(fails ? `FAIL all (${fails} failures)` : "PASS all: every region's ink is inside its silhouette, both sexes, both views");
process.exit(fails ? 1 : 0);
