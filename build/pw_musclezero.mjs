// A ZERO IS DATA AND MUST BE VISIBLE. The Volume map painted an untrained muscle with _heatColor(0),
// which returned the body silhouette's own literal — so "trained this muscle zero times" and "this
// isn't a muscle" rendered at 1.00:1, byte-identical, separated only by a 0.5px seam. The list under
// the map calls the zero out by name ("Biceps 0") while the picture could not show it; Mo reported
// the uncoloured muscles blending in. This asserts the two fills stay distinguishable.
//
// Structurally RED on pre-fix code: there, the zero-muscle fill and the body fill are the same
// string, so both the inequality and the contrast check fail.
import { chromium } from "playwright-core";
const ME="11111111-1111-4111-8111-111111111111";
let fails=0;
const check=(l,c,d)=>{ if(c) console.log(`  PASS ${l}`); else { fails++; console.log(`  FAIL ${l}${d?" — "+d:""}`); } };

const lin=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
const lum=([r,g,b])=>0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
const ratio=(a,b)=>{const L1=lum(a),L2=lum(b);return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);};
const parse=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number);

const mk=(name,n)=>({name,sets:Array.from({length:n},()=>({weight:"100",reps:"10",done:true}))});
// A push/legs week with REAL zeros: nothing hits Biceps. A fixture that trains everything cannot
// see this bug at all — the whole failure only exists on an untrained region.
//
// The history KEY is derived from the same clock as finishedAt, never hardcoded: weeklyMuscleVolume
// windows on the KEY against a Date.now()-based 7-day cutoff, so a fixed "2026-08-25" literal aged
// out of the window five days after it was written and the whole map went empty — two spurious reds
// whose message ("missing data hooks") pointed at exactly the wrong cause. Inverse of the pw_datekey
// rule: there a Date.now() fixture drifted across a fixed boundary; here a fixed fixture drifted
// across a Date.now() boundary. Either way, fixture dates and the code's clock must share a source.
//
// Every exercise name below is verified against the library — "Triceps Pushdown" and "Back Squat"
// were plausible-looking near-misses that resolve to NO muscle (the documented demo-corpus class),
// which silently made Quads a second untested zero and left Triceps trained only via 0.5x secondary
// credit. Resolve names through getExEntry before trusting a muscle fixture.
const SESS_AT = Date.now()-2*864e5;
const _d = new Date(SESS_AT);
const SESS_KEY = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,"0")}-${String(_d.getDate()).padStart(2,"0")}`;
const sess={id:"s1",finishedAt:SESS_AT,duration:3600,unit:"lbs",exercises:[
  mk("Overhead Press (Barbell)",10),mk("Lateral Raises (Cable)",10),mk("Tricep Rope Pushdown",11),
  mk("Barbell Bench Press",8),mk("Barbell Back Squat",8),mk("Standing Calf Raise",6),mk("Romanian Deadlift",4)]};
const store={currentUserId:ME,unit:"lbs",theme:"dark",programs:[],history:{[SESS_KEY]:{s1:sess}},
  workoutDates:{},weeklyTarget:4,bodyLog:[],prs:{},prEvents:[],posts:[],bodyType:"male",
  profile:{username:"momo",name:"Mo"},users:[{id:ME,username:"momo",name:"Mo",followers:[],following:[]}]};

const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
for(const theme of ["dark","light"]){
  const p=await b.newPage({viewport:{width:428,height:926},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  p.setDefaultTimeout(6000);
  p.on("pageerror",e=>{fails++;console.log("  PAGEERROR:",e.message.slice(0,160));});
  await p.addInitScript(([st,th])=>{localStorage.setItem("seshd_v1",JSON.stringify({...st,theme:th}));
    localStorage.setItem("seshd_session",JSON.stringify({access_token:"t",user:{id:st.currentUserId}}));
    localStorage.setItem("seshd_onboarded","1");localStorage.setItem("seshd_custom_merge_v1","1");},[store,theme]);
  await p.route("**/auth/v1/**",r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({access_token:"t",user:{id:ME}})}));
  await p.route("**/rest/v1/**",r=>r.abort());
  await p.goto("http://127.0.0.1:8199/",{waitUntil:"domcontentloaded"});
  await p.waitForTimeout(3000);
  await p.evaluate(()=>{const x=[...document.querySelectorAll("button")].find(e=>(e.getAttribute("aria-label")||"")==="Profile");x&&x.click();});
  await p.waitForTimeout(1800);
  // The map opens on Readiness; the zero-blend only exists on VOLUME.
  const onVolume=await p.evaluate(()=>{const t=[...document.querySelectorAll("button")].find(e=>(e.textContent||"").trim()==="Volume");
    if(!t) return false; t.click(); return true;});
  check(`[${theme}] reached the Volume map`, onVolume);          // fixture-reached-the-screen guard
  if(!onVolume){ await p.close(); continue; }
  await p.waitForTimeout(800);

  const m=await p.evaluate(()=>{
    const body=document.querySelector('path[data-body="1"]');
    const bi=document.querySelector('path[data-muscle="Biceps"]');
    // a trained region, to prove the fixture really produced volume somewhere
    const tri=document.querySelector('path[data-muscle="Triceps"]');
    if(!body||!bi) return null;
    const f=el=>getComputedStyle(el).fill;
    return { body:f(body), zero:f(bi), trained:tri?f(tri):null,
             listSaysZero:/Biceps\s*0/.test(document.body.innerText) };
  });
  check(`[${theme}] found body + zero-muscle paths`, !!m, "missing data hooks");
  if(!m){ await p.close(); continue; }
  check(`[${theme}] the list really reports Biceps 0 (fixture is a true zero)`, m.listSaysZero===true);
  check(`[${theme}] zero-volume muscle is NOT the body colour`, m.zero!==m.body, `both ${m.body}`);
  const r=ratio(parse(m.zero),parse(m.body));
  check(`[${theme}] zero vs body is perceptible (>=1.2:1)`, r>=1.2, `${r.toFixed(2)}:1`);
  check(`[${theme}] a trained muscle still differs from an untrained one`, m.trained && m.trained!==m.zero, `trained=${m.trained} zero=${m.zero}`);

  // ALL THREE MODES, not just Volume. Mo: "the silhouette for Strength and when you click
  // exercises is not the same as the fixed one in Volume." He was right — this fix originally
  // reached only the paths that go through _heatColor, so Strength's "no standard" branch and the
  // exercise-detail map still returned the raw body colour and whole regions vanished into the
  // silhouette. Same one-fix-didn't-get-copied shape as the palette twins, so the check now
  // sweeps every mode instead of trusting the one that prompted it.
  for (const mode of ["Readiness", "Volume", "Strength"]) {
    const clicked = await p.evaluate(mo => { const b=[...document.querySelectorAll("button")].filter(x=>x.offsetParent).find(x=>(x.textContent||"").trim()===mo); if(!b) return false; b.click(); return true; }, mode);
    await p.waitForTimeout(700);
    if (!clicked) { check(`[${theme}] ${mode} tab exists`, false); continue; }
    const r2 = await p.evaluate(() => {
      const body = document.querySelector('path[data-body="1"]');
      const ms = [...document.querySelectorAll('path[data-muscle]')];
      if (!body || !ms.length) return null;
      const bf = getComputedStyle(body).fill;
      return { bf, invisible: ms.filter(x => getComputedStyle(x).fill === bf).map(x => x.getAttribute("data-muscle")) };
    });
    check(`[${theme}] ${mode}: no muscle is painted the exact body colour`,
      r2 && r2.invisible.length === 0,
      r2 ? `${r2.invisible.length} invisible: ${r2.invisible.slice(0,5).join(", ")}` : "map not found");
  }
  await p.close();
}
await b.close();
console.log(fails?`${fails} FAIL(S)`:"ok");
process.exit(fails?1:0);
