// TWO FIXES THAT SHIPPED DOING NOTHING. Both were written, tested, committed and published in
// 7ff9389 — and both were inert. This is the suite that would have caught them.
//
//   A. The persisted idle-gap stamp used the key "seshd_last_activity", which is on
//      cleanupStaleLocalStorage's sweep list. loadStore() runs that sweep on EVERY launch, before
//      WorkoutTracker mounts and reads it — so the stamp was deleted before it could be used and a
//      9h-abandoned workout still recorded 32,403s. Renamed to "seshd_wlast_activity".
//
//   B. The mid-workout unit conversion listened for a CustomEvent inside WorkoutTracker, but the
//      tab-swipe track mounts only the CURRENT tab and the unit toggle lives in the Profile tab's
//      Settings sheet — so the listener was always unmounted when the event fired. A 225 lb bench
//      was still written as 225 KG. The toggle now rewrites the persisted session directly.
//
// The lesson both share: a fix is not verified until the ACTUAL user path runs it. Both had green
// tests that exercised the helper rather than the route to it.
//
// Red against 7ff9389 on the two load-bearing checks (32,403s recorded; weight unchanged at 225).
import { chromium } from "playwright-core";
const ME="11111111-1111-4111-8111-111111111111";
const PORT=process.env.PORT||"8199";
let fails=0; const check=(l,c,d)=>{if(c)console.log(`PASS ${l}`);else{fails++;console.log(`FAIL ${l}${d?" — "+d:""}`);}};
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});

// ── A. the persisted idle-gap stamp must survive boot ──────────────────────────────────────
{
  const page=await b.newPage({viewport:{width:428,height:926},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  page.setDefaultTimeout(4000);
  const sess={dayName:"Pull A",startedAt:Date.now()-9*36e5,unit:"lbs",exercises:[{id:"e1",name:"Barbell Row",sets:[{id:"s1",weight:"185",reps:"8",done:true,type:"normal"}]}]};
  const stamp=Date.now()-8.05*36e5;
  await page.addInitScript(([me,s,st])=>{
    localStorage.setItem("seshd_v1",JSON.stringify({currentUserId:me,theme:"dark",unit:"lbs",programs:[],history:{},workoutDates:{},prEvents:[],bodyLog:[],prs:{},posts:[],profile:{username:"momo",name:"Mo"},users:[{id:me,username:"momo",name:"Mo",followers:[],following:[]}]}));
    localStorage.setItem("seshd_session",JSON.stringify({access_token:"tok",refresh_token:"ref",user:{id:me,email:"m@e.com"}}));
    localStorage.setItem("seshd_onboarded","1"); localStorage.setItem("seshd_custom_merge_v1","1");
    localStorage.setItem("seshd_active_session",JSON.stringify(s));
    localStorage.setItem("seshd_wstart",String(Date.now()-9*36e5));
    localStorage.setItem("seshd_last_activity",String(st));    // old key
    localStorage.setItem("seshd_wlast_activity",String(st));   // new key
  },[ME,sess,stamp]);
  await page.route("**/auth/v1/**",r=>r.fulfill({status:200,contentType:"application/json",body:"{}"}));
  const writes=[];
  await page.route("**/rest/v1/**",r=>{const req=r.request(),u=req.url(),m=req.method();
    if(m!=="GET")writes.push({m,u:u.split("/rest/v1/")[1],b:req.postData()||""});
    let body="[]";
    if(m==="GET"&&/(profiles|public_profiles)\?/.test(u))body=JSON.stringify([{id:ME,username:"momo",name:"Mo",unit:"lbs",is_public:true,seen_onboarding:true,theme:"dark"}]);
    else if(m==="POST"&&/workout_history/.test(u)){try{body=JSON.stringify([JSON.parse(req.postData()||"{}")]);}catch{body="[]";}}
    r.fulfill({status:200,contentType:"application/json",body});});
  await page.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:"load",timeout:20000});
  await page.waitForTimeout(2600);
  const survived=await page.evaluate(()=>localStorage.getItem("seshd_wlast_activity"));
  check("the idle-gap stamp survives boot (not swept by cleanupStaleLocalStorage)", !!survived, String(survived));
  const fin=page.getByText(/^Finish/).locator("visible=true").first();
  if(await fin.count()){await fin.click();await page.waitForTimeout(900);}
  const c=page.getByText(/^Finish workout$/).locator("visible=true").last();
  if(await c.count()){await c.click();}
  await page.waitForTimeout(2200);
  const post=writes.find(w=>w.m==="POST"&&/workout_history/.test(w.u));
  const dur=post?JSON.parse(post.b).duration_secs:-1;
  console.log("recorded duration:",dur,"s");
  check("a 9h-abandoned workout is capped, not recorded as nine hours", dur>0&&dur<7200, `${dur}s`);
  await page.close();
}

// ── B. flipping units in Settings must convert the LIVE workout ────────────────────────────
{
  const page=await b.newPage({viewport:{width:428,height:926},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  page.setDefaultTimeout(4000);
  const sess={dayName:"Push",startedAt:Date.now()-9e5,unit:"lbs",exercises:[{id:"e1",name:"Barbell Bench Press",sets:[{id:"s1",weight:"225",reps:"5",done:true,type:"normal"}]}]};
  await page.addInitScript(([me,s])=>{
    localStorage.setItem("seshd_v1",JSON.stringify({currentUserId:me,theme:"dark",unit:"lbs",programs:[],history:{},workoutDates:{},prEvents:[],bodyLog:[],prs:{},posts:[],profile:{username:"momo",name:"Mo"},users:[{id:me,username:"momo",name:"Mo",followers:[],following:[]}]}));
    localStorage.setItem("seshd_session",JSON.stringify({access_token:"tok",refresh_token:"ref",user:{id:me,email:"m@e.com"}}));
    localStorage.setItem("seshd_onboarded","1"); localStorage.setItem("seshd_custom_merge_v1","1");
    localStorage.setItem("seshd_active_session",JSON.stringify(s));
    localStorage.setItem("seshd_wstart",String(Date.now()-9e5));
  },[ME,sess]);
  await page.route("**/auth/v1/**",r=>r.fulfill({status:200,contentType:"application/json",body:"{}"}));
  await page.route("**/rest/v1/**",r=>{const u=r.request().url(),m=r.request().method();let body="[]";
    if(m==="GET"&&/(profiles|public_profiles)\?/.test(u))body=JSON.stringify([{id:ME,username:"momo",name:"Mo",unit:"lbs",is_public:true,seen_onboarding:true,theme:"dark"}]);
    r.fulfill({status:200,contentType:"application/json",body});});
  await page.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:"load",timeout:20000});
  await page.waitForTimeout(2600);
  // TAP the nav. This used to swipe twice at y=500, with a comment saying "the tab bar is hidden
  // during a workout" — no longer true, and the swipe was the wrong tool anyway: handleSwipeStart
  // bails inside [data-no-tab-swipe], so a fixed y-coordinate lands on a set row as soon as the
  // layout shifts by a row's height. It broke exactly that way when the top bar came back. What
  // this section actually tests is the unit conversion, so reach Settings the way a user does.
  await page.getByLabel("Profile").first().click().catch(()=>{});
  await page.waitForTimeout(1200);
  const gear=page.locator('[aria-label="Settings"]').first();
  check("Settings is reachable mid-workout via the nav", await gear.count()>0);
  if(await gear.count()){await gear.click();await page.waitForTimeout(1200);}
  const kg=page.getByText("KG",{exact:true}).first();
  await kg.scrollIntoViewIfNeeded().catch(()=>{});
  check("the KG toggle is reachable", await kg.count()>0);
  if(await kg.count()){await kg.click();await page.waitForTimeout(1400);}
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem("seshd_active_session")||"{}"));
  const w=stored?.exercises?.[0]?.sets?.[0]?.weight;
  console.log("weight in the persisted live session after lbs->kg:",w);
  check("a 225 lb set becomes 102 kg, not 225 kg", Math.abs(parseFloat(w)-102.1)<1, String(w));
  await page.close();
}
await b.close();
console.log(`\n${fails===0?"ALL PASS":fails+" FAIL(S)"}`);
process.exit(fails?1:0);
