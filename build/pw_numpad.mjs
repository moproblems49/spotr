// THE TWO STEPPERS MUST STAY TOGETHER, ON THE RIGHT.
//
// They used to sit at opposite ends of the pad with the value between them, so the two controls
// you alternate between were a full screen-width apart and one was always out of thumb reach
// one-handed, mid-set. This pins the arrangement: both in the right-hand third, adjacent, minus
// still left of plus, and each still a 44pt target with a real gap between them (two 48px buttons
// touching would be one 96px smear to a thumb).
import { chromium } from "playwright-core";
const ME="11111111-1111-4111-8111-111111111111";
const S=n=>Array.from({length:n},(_,i)=>({id:"s"+i,weight:"135",reps:"8",done:false,type:"normal"}));
const SESSION={dayName:"Push A",unit:"lbs",exercises:[{id:"e1",name:"Barbell Bench Press",reps:"5-8",sets:S(3)}]};
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
const p=await b.newPage({viewport:{width:428,height:926},deviceScaleFactor:2,hasTouch:true,isMobile:true});
await p.addInitScript(([me,s])=>{localStorage.setItem("seshd_v1",JSON.stringify({currentUserId:me,theme:"dark",unit:"lbs",programs:[],history:{},workoutDates:{},prEvents:[],bodyLog:[],prs:{},posts:[],profile:{username:"momo"},users:[]}));localStorage.setItem("seshd_session",JSON.stringify({access_token:"t",user:{id:me}}));localStorage.setItem("seshd_onboarded","1");localStorage.setItem("seshd_custom_merge_v1","1");localStorage.setItem("seshd_active_session",JSON.stringify(s));localStorage.setItem("seshd_wstart",String(Date.now()-6e5));},[ME,SESSION]);
await p.route("**/auth/v1/**",r=>r.fulfill({status:200,contentType:"application/json",body:'{"access_token":"t","user":{"id":"'+ME+'"}}'}));
await p.route("**/rest/v1/**",r=>r.abort());
await p.goto("http://127.0.0.1:8199/",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(2200);
// Tap the weight field (a DIV, not an input) to open the pad.
const opened=await p.evaluate(()=>{const w=document.querySelectorAll("[data-no-tab-swipe]")[0];
  const d=[...w.querySelectorAll("div")].find(x=>/^135$/.test((x.textContent||"").trim())&&x.children.length===0);
  if(d){d.click();return true}return false;});
await p.waitForTimeout(900);
const geo=await p.evaluate(()=>{
  // Find them by GLYPH, not only by aria-label. Labelling them was part of the same change, so a
  // label-only lookup reports "not found" against the old build — a red result, but for the wrong
  // reason: it never measures where the old buttons actually sat. By glyph it measures both.
  const pad=[...document.querySelectorAll("div")].filter(d=>getComputedStyle(d).position==="fixed"&&getComputedStyle(d).zIndex==="450").pop();
  const btns=pad?[...pad.querySelectorAll("button")]:[];
  const minus=btns.find(b=>(b.textContent||"").trim()==="\u2212");
  const plus=btns.find(b=>(b.textContent||"").trim()==="+");
  if(!minus||!plus) return {miss:true, padOpen:/REPS|LBS/.test(document.body.innerText)};
  const m=minus.getBoundingClientRect(), pl=plus.getBoundingClientRect();
  return {minusX:Math.round(m.left), plusX:Math.round(pl.left), gap:Math.round(pl.left-m.right),
          minusW:Math.round(m.width), h:Math.round(m.height), vw:innerWidth};
});
console.log("opened:",opened,"geo:",JSON.stringify(geo));
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
check("the number pad opened", opened && !geo.miss, JSON.stringify(geo));
if (!geo.miss) {
  check("both steppers are in the right-hand third of the pad",
    geo.minusX > geo.vw * 0.66 && geo.plusX > geo.vw * 0.66, `minus ${geo.minusX}, plus ${geo.plusX} of ${geo.vw}`);
  check("minus is still left of plus", geo.minusX < geo.plusX, `${geo.minusX} vs ${geo.plusX}`);
  check("they are adjacent, not split across the pad", geo.gap > 0 && geo.gap <= 16, `${geo.gap}px apart`);
  check("...but not so close a thumb cannot separate them", geo.gap >= 8, `${geo.gap}px apart`);
  check("each is still a 44pt target", geo.minusW >= 44 && geo.h >= 44, `${geo.minusW}x${geo.h}`);
}
// The dismiss key must actually close the pad, and must NOT sit under Next.
const dz = await p.evaluate(() => {
  const btn = document.querySelector('button[aria-label="Hide keypad"]');
  const next = [...document.querySelectorAll("button")].find(b => (b.textContent||"").trim() === "Next");
  if (!btn || !next) return { miss: true, hasBtn: !!btn, hasNext: !!next };
  const a = btn.getBoundingClientRect(), b = next.getBoundingClientRect();
  return { dismissTop: Math.round(a.top), nextTop: Math.round(b.top), w: Math.round(a.width), h: Math.round(a.height),
           sameColumn: Math.abs(a.left - b.left) < 4 };
});
console.log("  dismiss key:", JSON.stringify(dz));
check("the pad has a dismiss key", !dz.miss, JSON.stringify(dz));
if (!dz.miss) {
  check("dismiss sits ABOVE Next, not under it", dz.dismissTop < dz.nextTop, `${dz.dismissTop} vs ${dz.nextTop}`);
  check("it is a 44pt target", dz.w >= 44 && dz.h >= 44, `${dz.w}x${dz.h}`);
  await p.screenshot({path:"shot_numpad.png"});

  // THE EXIT MUST TRAVEL, NOT BLINK. Sample the pad mid-flight: it has to still be mounted a
  // moment after the tap, already moving, and only then unmount. A pad that vanishes on the
  // frame passes a naive "is it gone" check just as well, which is why the mid-flight sample
  // is the assertion that matters.
  const padY = () => p.evaluate(() => {
    const pad = [...document.querySelectorAll("div")].find(d => { const c = getComputedStyle(d);
      return c.position === "fixed" && c.zIndex === "450"; });
    if (!pad) return null;
    const m = /matrix\(1, 0, 0, 1, [-\d.]+, ([-\d.]+)\)/.exec(getComputedStyle(pad).transform);
    return { y: m ? Math.round(parseFloat(m[1])) : 0, transition: getComputedStyle(pad).transition.slice(0, 40) };
  });
  const atRest = await padY();
  console.log("  pad at rest:", JSON.stringify(atRest));
  check("the pad sits at its resting position while open", atRest && Math.abs(atRest.y) < 4, JSON.stringify(atRest));
  check("...and carries a transform transition", (atRest?.transition || "").includes("transform"), atRest?.transition);

  await p.evaluate(() => document.querySelector('button[aria-label="Hide keypad"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  await p.waitForTimeout(70);
  const midFlight = await padY();
  console.log("  pad 70ms after the tap:", JSON.stringify(midFlight));
  check("the pad is still mounted mid-exit (it animates, not blinks)", midFlight !== null, "already unmounted");
  check("...and has started travelling downward", midFlight && midFlight.y > 8, JSON.stringify(midFlight));

  // AND THE SHAPE OF THE MOTION, not just that it moves. The first attempt at this exit used
  // EASE_NAV, the app's decelerate curve — correct for something ARRIVING, wrong for something
  // leaving: it covered 69% of the travel in the first 41% of the time, which is what Mo saw as
  // "snapping". The second attempt used the literal mirror of that curve and overshot the other
  // way, sitting near-still for 160ms of a 240ms exit. A front-loaded exit is the failure mode,
  // so assert the pad is still in the FIRST THIRD of its journey a third of the way through.
  const early = midFlight && midFlight.y;
  const padH = await p.evaluate(() => {
    const pad = [...document.querySelectorAll("div")].find(d => { const c = getComputedStyle(d);
      return c.position === "fixed" && c.zIndex === "450"; });
    return pad ? Math.round(pad.getBoundingClientRect().height) : 0;
  });
  const pctAt70 = padH ? Math.round((early / padH) * 100) : -1;
  console.log(`  travelled ${pctAt70}% of the way in the first 70ms of a 240ms exit`);
  check("the exit is not front-loaded (it accelerates away, it does not lurch)",
    pctAt70 > 0 && pctAt70 < 35, `${pctAt70}%`);

  await p.waitForTimeout(700);
  const gone = await p.evaluate(() => !document.querySelector('button[aria-label="Hide keypad"]'));
  check("tapping it dismisses the pad", gone);
}
await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
