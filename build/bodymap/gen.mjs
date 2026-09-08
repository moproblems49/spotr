import fs from 'fs'; import {spline,mirror,xform,pl,band} from './kit.mjs';
const CX=132;
// =================== FRONT (design frame: shoulders top 47.5, ground 386) ===================
// arm: shoulder joint (170,66) -> elbow (188,138) -> wrist (194,197)
const upperArm={ c: y=>170+21*(y-66)/72, w: pl([[78,6],[95,7.8],[108,8.2],[125,7.4],[138,6.6]]) };
const foreArm ={ c: y=>191+5*(y-138)/59, w: pl([[138,6.6],[150,7.4],[165,6.4],[182,4.4],[197,2.2]]) };
// leg: hip (152,200) -> knee (148,296) -> ankle (147,386)
const thigh={ c: y=>152-4*(y-200)/96, w: pl([[198,20.5],[222,21],[248,19],[275,15.8],[296,13]]) };
const shin ={ c: y=>148-1*(y-296)/90, w: pl([[296,12.5],[312,12.8],[332,13],[352,10.5],[372,8],[386,6.5]]) };
// torso outer half-width (right edge x = CX + tw(y)) — the OBLIQUE's outer edge is built from this so the waist is real
const tw=pl([[96,30.5],[110,28.5],[130,25.5],[148,23.5],[162,25],[176,30],[188,36],[198,39.5]]);

const R={}, F={list:[]}; const add=(k,pts)=>{(R[k]??=[]).push(pts);}; const fill=pts=>F.list.push(pts);
// ---- neck filler + traps
fill([[127.5,29,0.2],[136.5,29,0.2],[139.5,40],[142,50],[132,53],[122,50],[124.5,40]]);
add('Traps',[[137,37.5],[143,39],[152,44],[159,49],[161.5,53.5],[157.5,56],[149,53],[141.5,48],[137,43]]);
// ---- deltoid: ovoid cap, widest high, tapering down INTO the arm (bottom overlaps the bicep top)
add('Shoulders',[[160.5,49.5],[167,47.5],[173.5,48.5],[178.5,53],[181,60],[180.5,68],[178.5,76],[175,82],[170.5,84],[167.5,80],[165.5,70],[163,60]]);
// ---- chest: soft pec — full at the outer-lower corner, sloping in toward the sternum, rounded underside
add('Chest',[[135,60],[144,57.5],[153,59],[160.5,62.5],[163.5,71],[164.5,81],[160.5,91],[151,96.5],[141,95.5],[135.5,90],[134,76]]);
// ---- armpit filler
fill([[163,80],[169,84],[170,94],[162,93]]);
fill([[130,57],[134,57],[134,90],[135,150],[134,197],[130,197]]);
fill([[143,50],[158,52],[161.5,58],[144.5,59]]);
// ---- upper arm: biceps belly (medial ~72%) + brachialis filler (lateral)
add('Biceps',band({limb:upperArm,y0:85,y1:136,fL:0.04,fR:0.7,taperTop:0.6,taperBot:0.5,cap:0.4}));
fill(band({limb:upperArm,y0:88,y1:137,fL:0.72,fR:0.97,taperTop:0.5,taperBot:0.5,cap:0.4}));
// ---- forearm: extensor mass (lateral, longer) + flexor mass (medial); elbow + wrist fillers
add('Forearms',band({limb:foreArm,y0:140,y1:187,fL:0.47,fR:0.97,taperTop:0.6,taperBot:0.85,cap:0.4,capBot:0.45}));
add('Forearms',band({limb:foreArm,y0:142,y1:181,fL:0.03,fR:0.45,taperTop:0.6,taperBot:0.8,cap:0.4,capBot:0.45}));
fill([[190.5,185],[196.5,185],[197.8,191],[197,196.5],[195.3,198],[192.5,195.5],[190.8,190]]);
fill(band({limb:foreArm,y0:132,y1:142,fL:0.1,fR:0.9,taperTop:0.85,taperBot:0.85,cap:0.3}));
// ---- abs: 2 soft blocks per side, flat-ish junction (no lens)
add('Abs',[[134.5,101,0.15],[143,100],[147.5,104],[148,124],[147,146,0.15],[143.5,148.5,0.15],[134.5,148.5,0.15]]);
add('Abs',[[134.5,152,0.15],[143.5,152,0.15],[147,155,0.15],[146.5,175],[144,188],[140.5,194.5],[136,196],[134.5,194,0.15]]);
// ---- obliques: lateral leaf whose outer edge IS the torso profile (waist), wider under the chest, narrowing to the hip
add('Obliques',(()=>{const o=[];for(const y of [102,112,124,138,152,164,174]) o.push([CX+tw(y)-1.5,y]); const inner=[[147.5,179],[148.5,168],[149.5,156],[149.5,142],[149.5,128],[149.8,114],[151,104]]; return [[155,100.5],...o,[156,180],...inner];})());
// ---- pelvis: lower, smaller; hip fillers follow the profile
fill([[122,192],[132,192],[142,192],[149,196],[150,206],[141,213],[132,209],[123,213],[114,206],[115,196]]);
fill([[151,182],[158,179],[164,182],[169,189],[172.5,198],[170,204],[160,203],[152,198],[150,192]]);
// ---- quads: VL, RF, VM; adductor filler inner-upper
add('Quads',band({limb:thigh,y0:193,y1:287,fL:0.6,fR:0.97,taperTop:0.65,taperBot:0.45,cap:0.4,capTop:0.28}));
add('Quads',band({limb:thigh,y0:197,y1:282,fL:0.3,fR:0.58,taperTop:0.65,taperBot:0.5,cap:0.45,capTop:0.28}));
add('Quads',band({limb:thigh,y0:240,y1:291,fL:0.05,fR:0.28,taperTop:0.45,taperBot:0.55,cap:0.45}));
fill(band({limb:thigh,y0:206,y1:236,fL:0.06,fR:0.26,taperTop:0.55,taperBot:0.5,cap:0.35}));
fill(band({limb:shin,y0:286,y1:309,fL:0.1,fR:0.9,taperTop:0.8,taperBot:0.8,cap:0.3}));
// ---- calves front: tibialis anterior (lateral, narrower) + gastroc medial head (fuller); ankle filler to 386
add('Calves',band({limb:shin,y0:307,y1:374,fL:0.6,fR:0.96,taperTop:0.55,taperBot:0.45,cap:0.4}));
add('Calves',band({limb:shin,y0:309,y1:364,fL:0.04,fR:0.57,taperTop:0.55,taperBot:0.5,cap:0.45}));
fill(band({limb:shin,y0:366,y1:384.5,fL:0.1,fR:0.9,taperTop:0.8,taperBot:0.85,cap:0.3}));

// =================== BACK (designed in the same frame, then fitted to the male back by a uniform similarity) ===================
const upperArmB={ c: y=>170+24*(y-66)/72, w: upperArm.w }, foreArmB={ c: y=>194+5*(y-138)/59, w: foreArm.w };
const RB={}, FB={list:[]}; const addB=(k,pts)=>{(RB[k]??=[]).push(pts);}; const fillB=pts=>FB.list.push(pts);
fillB([[127.5,29,0.2],[136.5,29,0.2],[140,43],[124,43]]);
// traps: kite from the neck to the shoulder point, tail down to ~y118 beside the spine
addB('Traps',[[133,37,0.15],[142,39.5],[152,46.5],[160,55],[159.5,60],[151,67],[142,80],[136.5,96],[135.5,104,0],[133,106,0]]);
// rear delt: same trimmed cap, top 47.5
addB('Rear Delts',[[160.5,49.5],[167,47.5],[173.5,48.5],[178.5,53],[181,60],[180.5,68],[178.5,76],[175,82],[170.5,84],[167,80],[165,70],[162.5,60]]);
// lats: fan from the armpit down and in to the lower back; outer edge follows the torso profile
addB('Lats',[[141,86],[149,83],[158,83.5],[165.5,87.5],[161,93.5],[158,100],[155,110],[152.5,124],[150,138],[147.5,152],[145.5,164],[143.5,169,0.15],[146.5,169.5,0.15],[145.5,160],[145,146],[144.5,132],[144,116],[143.5,102],[142,92]]);
// lower back: erector strip between the lats, from the trap tail to the sacrum
addB('LowerBack',[[134,110,0.15],[139,109.5],[140.5,122],[141.5,140],[141.5,158],[140.5,175],[139.5,184],[137,188,0],[134,188.5,0]]);
// glutes: round, full, wider than the waist
addB('Glutes',[[134,194,0],[144,193],[154,194.5],[162,198.5],[168,205],[172.5,214],[173,225],[168.5,233.5],[158,238.5],[146,239.5],[137,236.5],[134,231,0]]);
addB('Glutes',[[146,184],[155,180],[163,182],[169,190],[170.5,198,0.2],[165,197.5,0.2],[156.5,192.5,0.2],[146,190,0.2]]);
// armpit + hip fillers
fillB([[161,79],[168,84],[170,94],[161,92]]); fillB([[150,62],[161,60],[165,70],[164,84],[149,84],[143,76]]); fillB([[130,100],[134,100],[134.5,150],[134,192],[130,192]]); fillB([[124,184],[140,184],[142,196],[132,200],[122,196]]); fillB([[142,163],[150,162],[153.5,176],[144,181],[140.5,172]]); fillB([[146,165],[158,169],[166,177],[165,184],[150,185],[143.5,179]]);


// triceps: long head (medial) + lateral head; elbow filler
addB('Triceps',band({limb:upperArmB,y0:86,y1:131,fL:0.03,fR:0.54,taperTop:0.6,taperBot:0.6,cap:0.4}));
addB('Triceps',band({limb:upperArmB,y0:88,y1:133,fL:0.57,fR:0.97,taperTop:0.6,taperBot:0.6,cap:0.4}));
fillB(band({limb:foreArmB,y0:128,y1:142,fL:0.1,fR:0.9,taperTop:0.8,taperBot:0.85,cap:0.3}));
addB('Forearms',band({limb:foreArmB,y0:140,y1:187,fL:0.47,fR:0.97,taperTop:0.6,taperBot:0.85,cap:0.4,capBot:0.45}));
addB('Forearms',band({limb:foreArmB,y0:142,y1:181,fL:0.03,fR:0.45,taperTop:0.6,taperBot:0.8,cap:0.4,capBot:0.45}));
fillB([[193.5,185],[199.5,185],[200.8,191],[200,196.5],[198.3,198],[195.5,195.5],[193.8,190]]);
// hamstrings: biceps femoris (lateral) + semi (medial)
addB('Hamstrings',band({limb:thigh,y0:243,y1:300,fL:0.52,fR:0.96,taperTop:0.5,taperBot:0.5,cap:0.45}));
addB('Hamstrings',band({limb:thigh,y0:243,y1:302,fL:0.05,fR:0.5,taperTop:0.5,taperBot:0.5,cap:0.45}));
fillB(band({limb:shin,y0:296,y1:308,fL:0.12,fR:0.88,taperTop:0.8,taperBot:0.8,cap:0.3}));
// calves back: medial head (bigger) + lateral head; soleus/achilles filler to ground
addB('Calves',band({limb:shin,y0:309,y1:358,fL:0.04,fR:0.5,taperTop:0.5,taperBot:0.5,cap:0.45}));
addB('Calves',band({limb:shin,y0:309,y1:352,fL:0.53,fR:0.96,taperTop:0.5,taperBot:0.5,cap:0.45}));
fillB(band({limb:shin,y0:355,y1:384.5,fL:0.3,fR:0.7,taperTop:0.9,taperBot:0.8,cap:0.3}));

function assemble(R,F,cx,tf){ const T=p=>tf?xform(p,tf):p; const out={}; const body=[];
  for(const k of Object.keys(R)){ const subs=[]; for(const pts of R[k]){ subs.push(spline(T(mirror(pts,cx)))); subs.push(spline(T(pts))); } out[k]=subs.join(' '); body.push(...subs); }
  for(const pts of F.list){ body.push(spline(T(mirror(pts,cx)))); body.push(spline(T(pts))); }
  out._body=body.join(' '); return out; }
const fr=assemble(R,F,CX); const front={_body:fr._body}; for(const k of ['Traps','Shoulders','Chest','Biceps','Forearms','Abs','Obliques','Quads','Calves']) front[k]=fr[k];
// back fit: male back shoulder-top 59.8, ground 378.9; our frame: 47.5 -> 386.0. s = (378.9-59.8)/(386-47.5)
const s=(378.9-59.8)/(386-47.5), BCX=106;
const bk=assemble(RB,FB,CX,(x,y)=>[BCX+(x-CX)*s, 378.9-(386-y)*s]); const back={_body:bk._body}; for(const k of ['Traps','Rear Delts','Lats','Triceps','Forearms','LowerBack','Glutes','Hamstrings','Calves']) back[k]=bk[k];
fs.writeFileSync('female_new.json',JSON.stringify({front,back}));
console.log('ok scale',s.toFixed(4));
