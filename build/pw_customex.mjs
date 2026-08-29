// REMOVING A CUSTOM EXERCISE IS DESTRUCTIVE TO HISTORY, AND IT USED TO HAPPEN ON ONE TAP.
//
// A custom exercise is what makes its name resolve to a muscle. Delete it and every past workout
// that used the name keeps its volume but stops resolving — measured on the engine, a 4-set
// session went from {Back: 4} to {} in weeklyMuscleVolume the moment the registry lost it, so
// those sets silently vanish from the muscle map, muscle readiness and "most trained" while still
// appearing in History. That is the documented library-invisible-name failure, reachable from a
// Settings button, and both Remove and "Clear all" fired immediately with no confirmation.
//
// Destructive controls in this app go through confirmAction. These two now do, and the message is
// SPECIFIC: it counts the real logged workouts at stake rather than saying "are you sure".
import { chromium } from "playwright-core";
const ME = "11111111-1111-4111-8111-111111111111";
const NAME = "Zercher Yoke Carry 9000";
let fails = 0;
const check = (l,c,d) => { if (c) console.log(`  PASS ${l}`); else { fails++; console.log(`  FAIL ${l}${d?" — "+d:""}`); } };
const dk = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const sets = n => Array.from({length:n},()=>({weight:"100",reps:"8",done:true,type:"normal"}));
const CUSTOM = [{ id:"c1", name:NAME, muscle:"Back", equipment:"Machine" }];
const HIST = { [dk(new Date())]: { s1: { dayName:"Pull", duration:3000, unit:"lbs", finishedAt:Date.now(),
  exercises:[{ name:NAME, sets:sets(4) }] } } };

const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const page = await b.newPage({ viewport:{width:428,height:926}, deviceScaleFactor:2, hasTouch:true, isMobile:true });
page.setDefaultTimeout(6000);
page.on("pageerror", e => { fails++; console.log("  PAGEERROR:", e.message.slice(0,140)); });
const writes = [];
await page.addInitScript(([me,cx,h]) => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId:me, theme:"dark", unit:"lbs",
    customExercises:cx, history:h, profile:{username:"momo",name:"Mo"} }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{id:me} }));
  localStorage.setItem("seshd_onboarded","1"); localStorage.setItem("seshd_custom_merge_v1","1");
}, [ME, CUSTOM, HIST]);
await page.route("**/auth/v1/**", r => r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({access_token:"t",user:{id:ME}})}));
await page.route("**/rest/v1/**", r => {
  const q = r.request(); if (q.method()==="PATCH") writes.push(q.postData()||"");
  let body = "[]";
  // Seed through the stub: loadUserData replaces customExercises and history wholesale.
  if (q.method()==="GET" && /\/rest\/v1\/profiles\?/.test(q.url()))
    body = JSON.stringify([{ id:ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark",
      seen_onboarding:true, weekly_target:3, pr_events:[], custom_exercises:CUSTOM }]);
  else if (q.method()==="GET" && /\/rest\/v1\/workout_history/.test(q.url()))
    body = JSON.stringify(Object.entries(HIST).flatMap(([d,by]) => Object.entries(by).map(([sid,s]) =>
      ({ id:sid, user_id:ME, workout_date:d, day_name:s.dayName, exercises:s.exercises,
         duration_secs:s.duration, unit:s.unit, created_at:new Date(s.finishedAt).toISOString() }))));
  r.fulfill({ status:200, contentType:"application/json", body });
});
await page.goto("http://127.0.0.1:8199/", { waitUntil:"domcontentloaded" });
await page.waitForTimeout(3200);
await page.evaluate(() => { const p=[...document.querySelectorAll("button")].filter(x=>x.offsetParent).find(x=>(x.getAttribute("aria-label")||"")==="Profile"); p&&p.click(); });
await page.waitForTimeout(900);
await page.evaluate(() => { const s=[...document.querySelectorAll("button")].filter(x=>x.offsetParent).find(x=>(x.getAttribute("aria-label")||"")==="Settings"); s&&s.click(); });
await page.waitForTimeout(1300);
// Scroll the settings sheet to the custom-exercises section.
await page.evaluate(() => { const c=[...document.querySelectorAll("*")].filter(el=>{const cs=getComputedStyle(el);
  return /auto|scroll/.test(cs.overflowY)&&el.scrollHeight>el.clientHeight+8&&el.clientHeight>200;});
  const el=c.sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight))[0]; if(el) el.scrollTop=el.scrollHeight; });
await page.waitForTimeout(600);

const bodyText = () => page.evaluate(() => document.body.innerText);
check("the custom exercise is listed in Settings", (await bodyText()).includes(NAME));

// Tap Remove — it must NOT delete immediately.
const tapped = await page.evaluate(() => { const b=[...document.querySelectorAll("button")].filter(x=>x.offsetParent&&(x.textContent||"").trim()==="Remove")[0]; if(!b) return false; b.click(); return true; });
check("Remove button found", tapped);
await page.waitForTimeout(700);
const afterTap = await bodyText();
check("Remove asks first (does not delete on one tap)", /Remove .*\?/.test(afterTap) || /will stay in your history/.test(afterTap), afterTap.slice(0,120));
check("the warning names how many logged workouts are affected", /1 logged workout/.test(afterTap), (afterTap.match(/[^\n]*logged workout[^\n]*/)||[""])[0]);
check("the warning explains the real consequence (muscle map)", /muscle map/i.test(afterTap));
check("nothing was written to the server before confirming", writes.filter(w=>/custom_exercises/.test(w)).length === 0, JSON.stringify(writes).slice(0,80));

// Cancel keeps it.
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].filter(x=>x.offsetParent&&/^Keep$/.test((x.textContent||"").trim()))[0]; b&&b.click(); });
await page.waitForTimeout(700);
check("cancelling keeps the exercise", (await bodyText()).includes(NAME));
check("cancelling wrote nothing", writes.filter(w=>/custom_exercises/.test(w)).length === 0);

// Confirm actually removes it.
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].filter(x=>x.offsetParent&&(x.textContent||"").trim()==="Remove")[0]; b&&b.click(); });
await page.waitForTimeout(700);
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].filter(x=>x.offsetParent&&/^Remove$/.test((x.textContent||"").trim())).pop(); b&&b.click(); });
await page.waitForTimeout(900);
check("confirming removes it and writes to the server", writes.some(w=>/custom_exercises/.test(w)), JSON.stringify(writes).slice(0,80));

await b.close();
console.log(fails ? `${fails} FAIL(S)` : "ok");
process.exit(fails ? 1 : 0);
