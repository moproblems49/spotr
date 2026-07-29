// HOLD-TO-READ ON THE STRENGTH SCORE CHART — Mo asked for the date on hold. Implemented on the
// shared ExerciseVolumeChart, so the exercise-progress and body-log charts get it too.
// Asserts the readout appears on touch, names a real DATE (not the axis shorthand "Now"/"Jul"),
// tracks the finger across points, and clears on release.
import React from "react";
import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { act } from "react";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let fails = 0;
const check = (l,c,d)=>{ if(c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d?" — "+d:""}`);} };
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url:"https://app.test/", pretendToBeVisual:true });
const { window } = dom;
global.window=window; global.document=window.document;
Object.defineProperty(global,"navigator",{value:window.navigator,configurable:true});
global.localStorage=window.localStorage; global.CustomEvent=window.CustomEvent; global.HTMLElement=window.HTMLElement;
global.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),0); global.cancelAnimationFrame=(id)=>clearTimeout(id);
window.matchMedia=window.matchMedia||(()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}));
window.ResizeObserver=window.ResizeObserver||class{observe(){}unobserve(){}disconnect(){}};
window.IntersectionObserver=window.IntersectionObserver||class{observe(){}unobserve(){}disconnect(){}};
window.scrollTo=window.scrollTo||(()=>{}); window.HTMLElement.prototype.scrollIntoView=window.HTMLElement.prototype.scrollIntoView||(()=>{});
navigator.vibrate=navigator.vibrate||(()=>{});

// ~10 weeks of history so the strength chart takes the WEEKLY branch and has several points,
// plus a body log (computeStrengthScore needs bodyweight) and a steady progression.
const dayKey = (off) => { const d = new Date(); d.setDate(d.getDate()-off);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const history = {}, bodyLog = [];
for (let w = 10; w >= 0; w--) {
  for (const dayOff of [w*7, w*7 + 3]) {
    if (dayOff < 0) continue;
    const wt = String(135 + (10 - w) * 5);
    history[dayKey(dayOff)] = { ["s"+dayOff]: { name:"Push", finishedAt: Date.now() - dayOff*864e5, duration:3600,
      exercises:[
        { name:"Bench Press", sets: Array.from({length:4},()=>({ weight:wt, reps:"5", done:true, type:"normal" })) },
        { name:"Back Squat",  sets: Array.from({length:4},()=>({ weight:String(+wt+45), reps:"5", done:true, type:"normal" })) },
        { name:"Deadlift",    sets: Array.from({length:3},()=>({ weight:String(+wt+90), reps:"5", done:true, type:"normal" })) },
      ] } };
  }
  bodyLog.push({ id:"b"+w, date: dayKey(w*7), weight: 180 });
}
window.localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId:"u1", theme:"dark",
  users:[{ id:"u1", username:"mo", name:"Mo", unit:"lbs", theme:"dark" }],
  history, bodyLog, strengthSex:"male", birthYear:1995 }));
window.localStorage.setItem("seshd_session", JSON.stringify({ access_token:"tok", refresh_token:"ref", expires_in:3600, user:{ id:"u1", email:"t@t.com" } }));
window.localStorage.setItem("seshd_onboarded","1"); window.localStorage.setItem("seshd_custom_merge_v1","1");
const HIST_ROWS = Object.entries(history).map(([dk, sess]) => { const sid = Object.keys(sess)[0];
  return { id: sid, user_id:"u1", workout_date: dk, day_name:"Push", unit:"lbs", duration_secs:3600, note:"",
    created_at: new Date(sess[sid].finishedAt).toISOString(), exercises: sess[sid].exercises }; });
global.fetch = window.fetch = async (url, opts) => {
  const u=String(url), m=(opts?.method||"GET").toUpperCase();
  const ok=(b,s=200)=>({ok:s<400,status:s,json:async()=>b,text:async()=>JSON.stringify(b)});
  if (u.includes("/auth/v1/token")) return ok({ access_token:"tok", user:{id:"u1"} });
  if (u.includes("/auth/v1/user")) return ok({ id:"u1" });
  if (m!=="GET") return ok([]);
  if (/\/rest\/v1\/workout_history\?/.test(u)) return ok(HIST_ROWS);
  if (/\/rest\/v1\/profiles\?/.test(u)) return ok([{ id:"u1", username:"mo", name:"Mo", unit:"lbs", is_public:true,
    seen_onboarding:true, theme:"dark", body_log: bodyLog, strength_sex:"male" }]);
  if (u.includes("/rest/v1/")) return ok([]);
  return ok({});
};
const App = (await import("./app.mjs")).default;
const container=document.createElement("div"); document.body.appendChild(container);
const root=createRoot(container);
act(()=>{ root.render(React.createElement(App,{})); });
await act(async()=>{ await new Promise(r=>setTimeout(r,1500)); });

const qa=(s)=>Array.from(document.querySelectorAll(s));
const settle=async(ms=250)=>{ await act(async()=>{ await new Promise(r=>setTimeout(r,ms)); }); };
const click=(el)=>{ if(el) act(()=>el.dispatchEvent(new window.MouseEvent("click",{bubbles:true,cancelable:true}))); };

click(qa('button[aria-label="Profile"]')[0]); await settle(600);

// The chart wrapper is the scrub host: data-no-tab-swipe + a child svg on the 320x116 viewBox.
const charts = () => qa("div[data-no-tab-swipe]").filter(d =>
  Array.from(d.children).some(c => c.tagName === "svg" && c.getAttribute("viewBox") === "0 0 320 116"));
let wraps = charts();
check("a strength-score chart is on the Profile screen", wraps.length >= 1, `found ${wraps.length}`);
if (!wraps.length) { console.log("\n1 FAIL(S)"); process.exit(1); }

const wrap = wraps[0];
wrap.getBoundingClientRect = () => ({ left:0, top:0, width:320, height:116, right:320, bottom:116, x:0, y:0 });
const touch = (type, x) => act(() => {
  const ev = new window.Event(type, { bubbles:true, cancelable:true });
  const t = { clientX:x, clientY:50, identifier:0, target:wrap };
  ev.touches = type === "touchend" ? [] : [t]; ev.changedTouches = [t];
  wrap.dispatchEvent(ev);
});
// The readout is the MONO value line INSIDE the absolutely-positioned tooltip — position:absolute
// sits on the tooltip wrapper, the mono styling on its first child, so they never match one node.
const readout = () => {
  // Scoped to the chart wrapper: the mono/800 combination also occurs elsewhere on the Profile
  // screen, and a document-wide search matched one of those even with no tooltip on screen.
  const el = Array.from(wrap.querySelectorAll("div")).find(d => { const st = d.getAttribute("style")||"";
    return /JetBrains Mono/.test(st) && /font-weight:\s*800/.test(st) && /font-size:\s*14px/.test(st); });
  if (!el) return null;
  const tip = el.parentElement;
  return { value: (el.textContent||"").trim(), date: (tip.lastElementChild.textContent||"").trim() };
};

check("no readout before touching", readout() === null);

touch("touchstart", 60); await settle(60);
const early = readout();
check("holding shows a readout", !!early, "no tooltip");
check("readout carries a real date, not the axis shorthand",
  !!early && /\w{3},?\s+\w{3}\s+\d{1,2}/.test(early.date) && early.date !== "Now",
  `date="${early && early.date}"`);
check("readout carries a value", !!early && /\d/.test(early.value), `value="${early && early.value}"`);

touch("touchmove", 300); await settle(60);
const late = readout();
check("readout tracks the finger to another point", !!late && late.date !== early.date, `${early && early.date} -> ${late && late.date}`);
check("the last point resolves to a date too (labelled 'Now' on the axis)", !!late && late.date !== "Now", `date="${late && late.date}"`);

touch("touchend", 300); await settle(60);
check("readout clears on release", readout() === null);

console.log(`\n${fails===0?"ALL PASS":fails+" FAIL(S)"}`);
process.exit(fails?1:0);
