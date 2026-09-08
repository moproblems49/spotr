// geometry kit for drawing the female map
const f1=v=>{const s=(Math.round(v*10)/10).toFixed(1);return s;};
// closed Catmull-Rom -> absolute cubic path. pts: [[x,y],...] (may carry a 3rd elem: tension 0..1 per point, 0 = corner)
export function spline(pts,tension=0.5){
  const n=pts.length; const P=i=>pts[(i+n)%n]; let d=`M${f1(P(0)[0])},${f1(P(0)[1])}`;
  for(let i=0;i<n;i++){const p0=P(i-1),p1=P(i),p2=P(i+1),p3=P(i+2);
    const t1=p1[2]==null?tension:p1[2], t2=p2[2]==null?tension:p2[2];
    const c1=[p1[0]+(p2[0]-p0[0])*t1/3, p1[1]+(p2[1]-p0[1])*t1/3];
    const c2=[p2[0]-(p3[0]-p1[0])*t2/3, p2[1]-(p3[1]-p1[1])*t2/3];
    d+=` C${f1(c1[0])},${f1(c1[1])} ${f1(c2[0])},${f1(c2[1])} ${f1(p2[0])},${f1(p2[1])}`;}
  return d+' Z'; }
export const mirror=(pts,cx)=>pts.map(p=>[2*cx-p[0],p[1],...p.slice(2)]).reverse();
// affine similarity (used for back view fit)
export const xform=(pts,fn)=>pts.map(p=>{const q=fn(p[0],p[1]);return [q[0],q[1],...p.slice(2)];});
// piecewise-linear interpolation helper from [[y,v],...] sorted by y
export const pl=tbl=>y=>{ if(y<=tbl[0][0])return tbl[0][1]; for(let i=1;i<tbl.length;i++){ if(y<=tbl[i][0]){const [y0,v0]=tbl[i-1],[y1,v1]=tbl[i]; const t=(y-y0)/(y1-y0); const s=t*t*(3-2*t); return v0+(v1-v0)*s;} } return tbl.at(-1)[1]; };
// band: a muscle cut from a limb. limb={c:y=>centreX, w:y=>halfWidth}. f = fraction across the width (0 = left/min-x edge, 1 = right/max-x edge)
// fL,fR may be numbers or functions of t (0 at top,1 at bottom). cap = end rounding as fraction of end width.
export function band({limb,y0,y1,fL,fR,n=7,taperTop=0.5,taperBot=0.5,cap=0.4,capTop,capBot,skewTop=0,skewBot=0}){
  const FL=typeof fL==='function'?fL:()=>fL, FR=typeof fR==='function'?fR:()=>fR;
  const edge=(t,side)=>{ const y=y0+(y1-y0)*t; const l=FL(t),r=FR(t),m=(l+r)/2,h=(r-l)/2;
    // taper: shrink toward the mid fraction near the ends
    const k = t<0.5 ? taperTop+(1-taperTop)*Math.sin(Math.PI*t)**0.7 : taperBot+(1-taperBot)*Math.sin(Math.PI*t)**0.7;
    const fr = m + (side<0?-h:h)*k; return [limb.c(y)+(2*fr-1)*limb.w(y), y]; };
  const L=[],R=[]; for(let i=0;i<=n;i++){const t=i/n; L.push(edge(t,-1)); R.push(edge(t,1));}
  // caps: push a dome point beyond each end, midway between edges
  const ct=capTop==null?cap:capTop, cb=capBot==null?cap:capBot;
  const top=[ (L[0][0]+R[0][0])/2 + skewTop, y0 - ct*Math.abs(R[0][0]-L[0][0]) ];
  const bot=[ (L[n][0]+R[n][0])/2 + skewBot, y1 + cb*Math.abs(R[n][0]-L[n][0]) ];
  return [top, ...R, bot, ...L.reverse()]; }
// a simple closed blob from a list of points (for torso pieces etc)
export const poly=pts=>pts;
