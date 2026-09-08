// Path geometry on the parsed-EPS representation: a subpath is [["M",x,y],["L",x,y],["C",x1,y1,x2,y2,x,y],...]
// implicitly closed. Everything below preserves the artist's Béziers; the only place a curve is
// altered is where a cut chord splits one, via de Casteljau (exact, not resampled).

export const startOf = sub => [ +sub[0][1], +sub[0][2] ];
export function endOf(seg, prev){ const c = seg.slice(1); return c.length ? [ +c[c.length-2], +c[c.length-1] ] : prev; }

// segment i of a closed subpath, as {p0, seg} with p0 the point it starts from
export function segments(sub){
  const out = []; let p = startOf(sub);
  for(let i=1;i<sub.length;i++){ out.push({ p0:p, seg:sub[i] }); p = endOf(sub[i], p); }
  // implicit closing line back to the start
  const s = startOf(sub);
  if(Math.hypot(p[0]-s[0], p[1]-s[1]) > 1e-6) out.push({ p0:p, seg:["L", s[0], s[1]] });
  return out;
}
const lerp = (a,b,t) => [ a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t ];
export function pointAt({p0,seg}, t){
  if(seg[0]==="L") return lerp(p0, [ +seg[1], +seg[2] ], t);
  const p1=[+seg[1],+seg[2]], p2=[+seg[3],+seg[4]], p3=[+seg[5],+seg[6]];
  const a=lerp(p0,p1,t), b=lerp(p1,p2,t), c=lerp(p2,p3,t), d=lerp(a,b,t), e=lerp(b,c,t);
  return lerp(d,e,t);
}
// de Casteljau split -> [firstHalfSeg, secondHalfSeg] (each in the same ["L"|"C",...] form)
export function splitSeg({p0,seg}, t){
  if(seg[0]==="L"){ const m = pointAt({p0,seg}, t); return [["L",m[0],m[1]], ["L",+seg[1],+seg[2]]]; }
  const p1=[+seg[1],+seg[2]], p2=[+seg[3],+seg[4]], p3=[+seg[5],+seg[6]];
  const a=lerp(p0,p1,t), b=lerp(p1,p2,t), c=lerp(p2,p3,t), d=lerp(a,b,t), e=lerp(b,c,t), m=lerp(d,e,t);
  return [ ["C",a[0],a[1],d[0],d[1],m[0],m[1]], ["C",e[0],e[1],c[0],c[1],p3[0],p3[1]] ];
}
// flatten to points, carrying (segIndex, t) so a hit can be turned back into an exact split
export function flatten(sub, per=24){
  const segs = segments(sub), pts=[];
  segs.forEach((s,i)=>{ const n = s.seg[0]==="L" ? 1 : per;
    for(let k=0;k<n;k++){ const t=k/n; pts.push({ p: pointAt(s,t), i, t }); } });
  return { segs, pts };
}
export function area(sub){ const {pts}=flatten(sub,12); let a=0;
  for(let i=0;i<pts.length;i++){ const p=pts[i].p, q=pts[(i+1)%pts.length].p; a += p[0]*q[1]-q[0]*p[1]; }
  return a/2; }
export function centroid(sub){ const {pts}=flatten(sub,12); let a=0,cx=0,cy=0;
  for(let i=0;i<pts.length;i++){ const p=pts[i].p, q=pts[(i+1)%pts.length].p, f=p[0]*q[1]-q[0]*p[1];
    a+=f; cx+=(p[0]+q[0])*f; cy+=(p[1]+q[1])*f; }
  a/=2; return a===0 ? pts[0].p : [cx/(6*a), cy/(6*a)]; }
export function reverse(sub){
  const segs = segments(sub); const out=[["M", ...segs[segs.length-1].p0 ]]; // start at the last seg's start? no:
  // walk backwards: the reversed path starts at the END of the last segment == the subpath start
  const pts=[]; let p=startOf(sub);
  const list = segs.map(s=>{ const e = endOf(s.seg,s.p0); const r={from:s.p0,to:e,seg:s.seg}; return r; });
  const res=[["M", list[list.length-1].to[0], list[list.length-1].to[1]]];
  for(let i=list.length-1;i>=0;i--){ const L=list[i];
    if(L.seg[0]==="L") res.push(["L", L.from[0], L.from[1]]);
    else res.push(["C", +L.seg[3],+L.seg[4], +L.seg[1],+L.seg[2], L.from[0], L.from[1]]); }
  return res;
}
export const ccw = sub => area(sub) > 0 ? sub : reverse(sub);

// intersect segment a1..a2 with b1..b2 -> t along a, or null
function segInt(a1,a2,b1,b2){
  const d1=[a2[0]-a1[0],a2[1]-a1[1]], d2=[b2[0]-b1[0],b2[1]-b1[1]];
  const den = d1[0]*d2[1]-d1[1]*d2[0]; if(Math.abs(den)<1e-12) return null;
  const t = ((b1[0]-a1[0])*d2[1]-(b1[1]-a1[1])*d2[0])/den;
  const u = ((b1[0]-a1[0])*d1[1]-(b1[1]-a1[1])*d1[0])/den;
  return (t>=0&&t<=1&&u>=0&&u<=1) ? t : null;
}
// Cut a closed subpath with the chord c1..c2, discarding the arc nearest `dropNear`.
// Returns a new closed subpath, or null if the chord does not cross exactly twice.
export function cutChord(sub, c1, c2, dropNear){
  const { segs, pts } = flatten(sub, 24);
  const hits=[];
  for(let k=0;k<pts.length;k++){
    const A=pts[k], B=pts[(k+1)%pts.length];
    const t = segInt(A.p, B.p, c1, c2); if(t===null) continue;
    // convert to (segIndex, t) inside that segment
    const nextSameSeg = B.i===A.i;
    const tEnd = nextSameSeg ? B.t : 1;
    hits.push({ i:A.i, t: A.t + (tEnd - A.t)*t, gi:k });
  }
  // dedupe hits that are the same crossing found twice
  const uniq=[]; for(const h of hits){ if(!uniq.some(u=>u.i===h.i && Math.abs(u.t-h.t)<1e-6)) uniq.push(h); }
  if(uniq.length!==2) return { err:`${uniq.length} crossings` };
  uniq.sort((a,b)=> a.i-b.i || a.t-b.t);
  const [A,B] = uniq;
  // arc1 = A..B (forward), arc2 = B..A (forward, wrapping)
  const arc1 = arcBetween(segs,A,B), arc2 = arcBetween(segs,B,A);
  const dist = arc => Math.min(...flatten(arc,6).pts.map(q=>Math.hypot(q.p[0]-dropNear[0], q.p[1]-dropNear[1])));
  return dist(arc1) < dist(arc2) ? arc2 : arc1;   // keep the arc FURTHER from the thing being dropped
}
export const xf = (sub, f) => sub.map(seg => { const o=[seg[0]]; const c=seg.slice(1);
  for(let i=0;i<c.length;i+=2){ const q=f(+c[i], +c[i+1]); o.push(q[0], q[1]); } return o; });
export const dOf = sub => sub.map(seg => seg[0] + seg.slice(1).map(v=>{
  const r = Math.round(+v*10)/10; return String(r); }).join(",")).join(" ") + " Z";
export function bb(subs){ let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const sub of subs) for(const seg of sub){ const c=seg.slice(1);
    for(let i=0;i<c.length;i+=2){ const x=+c[i],y=+c[i+1];
      if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } }
  return {x0,y0,x1,y1}; }

// exact sub-arc of a closed subpath between two (segIndex,t) params, walking forward
export function arcBetween(segs, from, to){
  const out=[]; const start = pointAt(segs[from.i], from.t); out.push(["M", start[0], start[1]]);
  if(from.i===to.i && to.t>from.t){
    const [ , after ] = splitSeg(segs[from.i], from.t);
    const tt = (to.t-from.t)/(1-from.t);
    out.push(splitSeg({p0:start, seg:after}, tt)[0]);
  } else {
    out.push(splitSeg(segs[from.i], from.t)[1]);
    for(let i=(from.i+1)%segs.length; i!==to.i; i=(i+1)%segs.length) out.push(segs[i].seg);
    out.push(splitSeg(segs[to.i], to.t)[0]);
  }
  return out;
}
// Clip a closed subpath to the half-plane dot(p,n) <= d, keeping every curve except the two the
// boundary splits. Returns the clipped subpath, the original (wholly inside), or null (wholly outside).
export function clipHalf(sub, n, d, per=24){
  const { segs, pts } = flatten(sub, per);
  const f = p => p[0]*n[0] + p[1]*n[1] - d;
  if(pts.every(q=>f(q.p) <= 0)) return sub;
  if(pts.every(q=>f(q.p) >= 0)) return null;
  const hits=[];
  for(let k=0;k<pts.length;k++){
    const A=pts[k], Bp=pts[(k+1)%pts.length], fa=f(A.p), fb=f(Bp.p);
    if(fa===0 || (fa<0)===(fb<0)) continue;
    const u = fa/(fa-fb), tEnd = (Bp.i===A.i) ? Bp.t : 1;
    hits.push({ i:A.i, t: A.t + (tEnd-A.t)*u, into: fa>0 });   // into = crossing INTO the kept side
  }
  if(hits.length<2 || hits.length%2) return null;
  hits.sort((a,b)=> a.i-b.i || a.t-b.t);
  const out=[];
  for(let k=0;k<hits.length;k++){
    if(!hits[k].into) continue;
    const nxt = hits[(k+1)%hits.length];
    const arc = arcBetween(segs, hits[k], nxt);
    if(out.length){ const s=arc[0]; out.push(["L", s[1], s[2]]); arc.shift(); }
    out.push(...arc);
  }
  return out.length>1 ? out : null;
}
