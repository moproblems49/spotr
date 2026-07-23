// BODY BATTERY SCRUB + BEDTIME MARKER — open the Body Battery detail sheet, assert the 24h
// chart renders, a 💤 marker sits at last night's bedtime, and holding (touch) on the graph
// shows a numeric readout that tracks the finger. Self-contained JSDOM (no bootstrap dep).
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

const now = Date.now();
const todayKey = (d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`)(new Date(now));
// A workout finished ~3h ago (this morning) so the day curve visibly drains.
const finishedAt = now - 3*36e5;
const sets = Array.from({length:12}, () => ({ weight:"185", reps:"6", done:true, rpe:"8" }));
const history = { [todayKey]: { s1: { name:"Push", finishedAt, duration:3600, exercises:[{ name:"Bench Press", sets }] } } };
// Last night's real sleep window (bedtime ~9h ago, wake ~1h ago) → 💤 in-window, realWindow true.
const sleepStart = new Date(now - 9*36e5).toISOString();
const sleepEnd = new Date(now - 1*36e5).toISOString();
window.localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId:"u1", theme:"dark",
  users:[{id:"u1",username:"mo",name:"Mo",unit:"lbs",theme:"dark"}],
  history,
  recovery: { recoveryScore:0.8, hrv:44, hrvBaseline:33, restingHr:58, rhrBaseline:61, sleepHours:7.5,
    sleepStart, sleepEnd } }));
window.localStorage.setItem("seshd_session", JSON.stringify({ access_token:"tok", refresh_token:"ref", expires_in:3600, user:{id:"u1", email:"t@t.com"} }));
window.localStorage.setItem("seshd_onboarded","1"); window.localStorage.setItem("seshd_custom_merge_v1","1");
window.localStorage.setItem("seshd_health_connected","1");

const HISTORY_ROWS = [{ id:"s1", user_id:"u1", workout_date: todayKey, day_name:"Push", unit:"lbs",
  duration_secs:3600, note:"", created_at:new Date(finishedAt).toISOString(),
  exercises:[{ name:"Bench Press", sets }] }];
global.fetch = window.fetch = async (url, opts) => {
  const u=String(url), m=(opts?.method||"GET").toUpperCase();
  const ok=(b,s=200)=>({ok:s<400,status:s,json:async()=>b,text:async()=>JSON.stringify(b)});
  if (u.includes("/auth/v1/token")) return ok({ access_token:"tok", user:{id:"u1"} });
  if (u.includes("/auth/v1/user")) return ok({ id:"u1" });
  if (m!=="GET") return ok([]);
  if (/\/rest\/v1\/workout_history\?/.test(u)) return ok(HISTORY_ROWS);
  if (/\/rest\/v1\/profiles\?/.test(u)) return ok([{ id:"u1", username:"mo", name:"Mo", unit:"lbs", is_public:true, seen_onboarding:true, theme:"dark" }]);
  if (u.includes("/rest/v1/")) return ok([]);
  return ok({});
};
const App = (await import("./app.mjs")).default;
const container=document.createElement("div"); document.body.appendChild(container);
const root=createRoot(container);
act(()=>{ root.render(React.createElement(App,{})); });
await act(async()=>{ await new Promise(r=>setTimeout(r,1500)); });
const qa=(s)=>Array.from(document.querySelectorAll(s));
const click=(el)=>{ if(el) act(()=>el.dispatchEvent(new window.MouseEvent("click",{bubbles:true,cancelable:true}))); };
const settle=async(ms=300)=>{ await act(async()=>{ await new Promise(r=>setTimeout(r,ms)); }); };
const btnByText=(t)=>qa("button").find(b=>(b.textContent||"").trim()===t);

click(qa('button[aria-label="Profile"]')[0]); await settle(500);
click(btnByText("Body")); await settle(500);
// Open the Body Battery detail sheet (the card whose text starts with BODY BATTERY).
const card = qa("div").find(d => (d.textContent||"").includes("BODY BATTERY") && d.getAttribute("style") && /cursor:\s*pointer/i.test(d.getAttribute("style")||"") );
check("Body Battery card is present on the Body screen", !!card);
click(card); await settle(500);

const svg = qa('svg').find(s => s.getAttribute("viewBox") === "0 0 300 110");
check("24h Body Battery chart renders (svg viewBox 0 0 300 110)", !!svg, `svgs: ${qa('svg').length}`);
const detailTxt = document.body.textContent || "";
check("bedtime 💤 marker renders (sleep in window)", detailTxt.includes("💤"), `no zzz`);
check("hold-to-read hint copy present", /Hold anywhere on the graph/i.test(detailTxt));

// Drive the scrub: stub the wrap rect (jsdom returns 0-width), dispatch touches at 3 x's.
const wrap = svg.parentElement;
wrap.getBoundingClientRect = () => ({ left:0, top:0, width:300, height:150, right:300, bottom:150, x:0, y:0 });
const touchAt = (x) => act(() => {
  const ev = new window.Event("touchstart", { bubbles:true, cancelable:true });
  ev.touches = [{ clientX:x, clientY:70 }];
  wrap.dispatchEvent(ev);
});
const readout = () => {
  // The floating tooltip is the MONO number that appears only while scrubbing.
  const el = qa("div").find(d => {
    const st = d.getAttribute("style")||"";
    return /JetBrains Mono/.test(st) && /font-weight:\s*800/.test(st) && /font-size:\s*15px/.test(st) && /^[0-9]{1,3}$/.test((d.textContent||"").trim());
  });
  return el ? parseInt((el.textContent||"").trim(),10) : null;
};
touchAt(20); await settle(60);   const early = readout();
touchAt(150); await settle(60);  const mid = readout();
touchAt(285); await settle(60);  const late = readout();
check("holding shows a numeric readout (0–100)", early!=null && early>=5 && early<=100, `early=${early}`);
check("readout tracks the finger (early vs late differ)", early!=null && late!=null && early!==late, `early=${early} mid=${mid} late=${late}`);
// End of the curve should equal the headline number (pinned) — read the big /100 in the sheet.
const headEl = qa("span").find(s => /\/100/.test(s.textContent||"") && /font-size:\s*32px/.test(s.getAttribute("style")||""));
const headline = headEl ? parseInt((headEl.textContent||"").match(/\d+/)[0],10) : null;
check("late readout (curve end) equals the headline number", headline!=null && late!=null && Math.abs(late-headline)<=1, `late=${late} headline=${headline}`);

console.log(`\n${fails===0?"ALL PASS":fails+" FAIL(S)"}`);
process.exit(fails?1:0);
