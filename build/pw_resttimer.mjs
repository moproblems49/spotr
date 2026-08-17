// THE REST TIMER MUST BE THE SAME APP, MINIMISED OR NOT.
//
// The full-screen timer shipped in a colour language of its own — a slate-900 NAVY card, cyan
// numerals with a cyan glow, a blue label and a PURPLE Skip button, none of which appear anywhere
// else in Seshd. Minimise/expand switched visual language mid-gesture. Worse in light theme: the
// card is dark in BOTH themes, but its chips used the theme tokens, so they flipped to white on
// navy and the SELECTED chip went dark — "on" read as "off".
//
// The card is now the same inverted slab as the minimised bar, with fixed light values on it and
// ACCENT_ON_SLAB for the ring (C.accent there is the daylight lime, which goes olive on a dark
// slab). This pins that: no navy, no cyan, no purple, in either theme.
import { chromium } from "playwright-core";
const ME="11111111-1111-4111-8111-111111111111";
const S=n=>Array.from({length:n},(_,i)=>({id:"s"+i,weight:"135",reps:"8",done:false,type:"normal"}));
const SESSION={dayName:"Push A",unit:"lbs",exercises:[{id:"e1",name:"Barbell Bench Press",reps:"5-8",sets:S(4)}]};
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
for (const theme of ["dark","light"]) {
  const p=await b.newPage({viewport:{width:428,height:926},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  await p.addInitScript(([me,s,th])=>{localStorage.setItem("seshd_v1",JSON.stringify({currentUserId:me,theme:th,unit:"lbs",programs:[],history:{},workoutDates:{},prEvents:[],bodyLog:[],prs:{},posts:[],profile:{username:"momo"},users:[]}));localStorage.setItem("seshd_session",JSON.stringify({access_token:"t",user:{id:me}}));localStorage.setItem("seshd_onboarded","1");localStorage.setItem("seshd_custom_merge_v1","1");localStorage.setItem("seshd_active_session",JSON.stringify(s));localStorage.setItem("seshd_wstart",String(Date.now()-6e5));},[ME,SESSION,theme]);
  await p.route("**/auth/v1/**",r=>r.fulfill({status:200,contentType:"application/json",body:'{"access_token":"t","user":{"id":"'+ME+'"}}'}));
  await p.route("**/rest/v1/**",r=>r.abort());
  await p.goto("http://127.0.0.1:8199/",{waitUntil:"domcontentloaded"});
  await p.waitForTimeout(2200);
  const ticked=await p.evaluate(()=>{const w=document.querySelectorAll("[data-no-tab-swipe]")[0];const t=[...w.querySelectorAll("button")].find(x=>{const c=getComputedStyle(x);return x.getBoundingClientRect().width===32&&c.borderRadius==="9px";});if(t){t.click();return true}return false;});
  await p.waitForTimeout(1200);
  const seen=await p.evaluate(()=>/TAP TO PAUSE|TAP TO RESUME/i.test(document.body.innerText));
  console.log(`${theme}: ticked=${ticked} timerVisible=${seen}`);
  check(`[${theme}] the timer opened`, seen);
  if(!seen){ await p.close(); continue; }
  const paint = await p.evaluate(() => {
    const txt = [...document.querySelectorAll("div")].find(d => /^\d\d:\d\d$/.test((d.textContent||"").trim()) && parseFloat(getComputedStyle(d).fontSize) > 40);
    // Locate the card by its WIDTH, not its corner radius. This used to say
    // `div[style*="border-radius: 28px"]` — and when the RADIUS scale retired the one-off 28px in
    // favour of RADIUS.xl (24), the locator matched nothing, `card` came back null, and the suite
    // went red reporting a colour failure on a card whose colour had not changed. Never pin a
    // locator to a value some other pass is entitled to restyle; this test is about the card's
    // PAINT, so anchor it on geometry the test doesn't care about.
    const card = txt && txt.closest('div[style*="max-width: 380px"]');
    const skip = [...document.querySelectorAll("button")].find(b => (b.textContent||"").trim() === "Skip");
    const ring = document.querySelector("svg circle[stroke-dasharray]");
    return {
      numerals: txt ? getComputedStyle(txt).color : null,
      card: card ? getComputedStyle(card).backgroundColor : null,
      skip: skip ? getComputedStyle(skip).backgroundColor : null,
      ring: ring ? ring.getAttribute("stroke") : null,
    };
  });
  console.log(`  ${theme}:`, JSON.stringify(paint));
  // rgb parse helper: a "cool" colour here means blue/purple dominates, which is the whole bug.
  const cool = c => { const m = /(\d+), (\d+), (\d+)/.exec(c || ""); if (!m) return false;
    const [r,g,bl] = m.slice(1).map(Number); return bl > r + 24 && bl > g + 24; };
  check(`[${theme}] the numerals are not cyan`, !cool(paint.numerals), paint.numerals);
  // PIN THE CARD, DO NOT SNIFF IT. The "is it cool-toned" heuristic below passes on slate-900
  // navy — rgb(15,23,42) has only 19 more blue than green, under any sane threshold — so it
  // reported the original card as fine. The two slab values are known; assert them.
  const SLAB = { dark: "rgba(38, 38, 46, 0.97)", light: "rgba(20, 20, 24, 0.97)" };
  check(`[${theme}] the card is the inverted slab, not a colour of its own`,
    paint.card === SLAB[theme], `${paint.card} (want ${SLAB[theme]})`);
  check(`[${theme}] Skip is not purple`, !cool(paint.skip), paint.skip);
  // The ring must be the SLAB accent in both themes, never the light theme's daylight lime.
  check(`[${theme}] the ring uses the slab accent`, paint.ring === "#c8f135", String(paint.ring));
  await p.screenshot({path:`shot_resttimer_${theme}.png`});
  await p.close();
}
await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
