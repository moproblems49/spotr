// Read the artist's own vector paths out of the licensed Illustrator file.
// ★ THE ART IS NOT IN THIS REPO AND MUST NOT BE. The repo is public; the file is licensed for the
// app, not for redistribution. Mo holds it; this takes its path as an argument.
// The prolog defines: mo=moveto, li=lineto, cv=curveto, cp=closepath, f/ef=fill, cmyk=set colour.
// Measured on AdobeStock_858843878.ai: 328 mo / 328 cp / 327 fills — essentially ONE closed subpath
// per fill, ~78 muscle shapes per figure, which is the same order of detail as the male map's 82.
// So there is NO TRACING anywhere in this pipeline; every curve below is the illustrator's own.
import fs from "fs";
export function readEPS(file){
  const raw = fs.readFileSync(file);
  // The PostScript body ends where Illustrator's private (compressed) section begins.
  const end = raw.indexOf(Buffer.from("%AI9_PrivateDataBegin"));
  const ps = raw.subarray(0, end < 0 ? raw.length : end).toString("latin1");
  const body = ps.slice(ps.indexOf("%%EndPageSetup"));
  const shapes = []; let cur = [], sub = [], colour = null;
  const flush = () => { if(sub.length > 1) cur.push(sub); sub = []; };
  for(const line of body.split("\n")){
    const t = line.trim().split(/\s+/); if(!t[0]) continue;
    const op = t[t.length-1], a = t.slice(0,-1).map(Number);
    if(a.some(Number.isNaN)) { if(op==="cp"){ flush(); } continue; }
    if(op==="cmyk" && a.length>=4) colour = a.slice(-4);
    else if(op==="mo" && a.length>=2){ flush(); sub = [["M", a.at(-2), a.at(-1)]]; }
    else if(op==="li" && a.length>=2) sub.push(["L", a.at(-2), a.at(-1)]);
    else if(op==="cv" && a.length>=6) sub.push(["C", ...a.slice(-6)]);
    else if(op==="cp") flush();
    else if(op==="f"||op==="ef"||op==="F"||op==="B"||op==="b"){ flush(); if(cur.length) shapes.push({ c: colour, p: cur }); cur = []; }
  }
  return shapes;
}
