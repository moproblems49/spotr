// VO2MAX + WORKOUT HR + OVERNIGHT SIGNALS — seed store.recovery with the new fields and a
// history workout carrying hr_summary, then assert the Body screen shows the VO₂ Max trend card
// and the elevated-signals warning, and the History tab shows the per-workout heart-rate line.
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

const yd = new Date(Date.now() - 24*36e5);
const ydKey = `${yd.getFullYear()}-${String(yd.getMonth()+1).padStart(2,"0")}-${String(yd.getDate()).padStart(2,"0")}`;
const sets = Array.from({length:10}, () => ({ weight:"135", reps:"8", done:true }));
// Seed recovery (survives loadUserData via ...prev) with the new fields; resp + wristTemp elevated.
window.localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId:"u1", theme:"dark",
  users:[{id:"u1",username:"mo",name:"Mo",unit:"lbs",theme:"dark"}],
  recovery: { recoveryScore:0.9, hrv:44, hrvBaseline:33, restingHr:58, rhrBaseline:61, sleepHours:7.6,
    vo2Max:45.2, vo2MaxSeries:[42,42.5,43,44,44.6,45.2], vo2MaxDelta:3.2,
    resp:18.5, respBaseline:14.5, wristTemp:36.9, wristTempBaseline:36.4 } }));
window.localStorage.setItem("seshd_session", JSON.stringify({ access_token:"tok", refresh_token:"ref", expires_in:3600, user:{id:"u1", email:"t@t.com"} }));
window.localStorage.setItem("seshd_onboarded","1"); window.localStorage.setItem("seshd_custom_merge_v1","1");

const HISTORY_ROWS = [{ id:"w1", user_id:"u1", workout_date: ydKey, day_name:"Push", unit:"lbs",
  duration_secs: 3600, note:"", created_at: yd.toISOString(),
  hr_summary: { avg:142, peak:176, min:64, samples:800 },
  exercises: [{ name:"Bench Press", sets }] }];

global.fetch = window.fetch = async (url, opts) => {
  const u=String(url), m=(opts?.method||"GET").toUpperCase();
  const ok=(b,s=200)=>({ok:s<400,status:s,json:async()=>b,text:async()=>JSON.stringify(b)});
  if (u.includes("/auth/v1/token")) return ok({ access_token:"tok", user:{id:"u1"} });
  if (u.includes("/auth/v1/user")) return ok({ id:"u1" });
  if (m!=="GET") return ok([]);
  if (/\/rest\/v1\/workout_history\?/.test(u)) return ok(HISTORY_ROWS);
  if (/\/rest\/v1\/profiles\?/.test(u)) return ok([{ id:"u1", username:"mo", name:"Mo", unit:"lbs", is_public:true, seen_onboarding:true, theme:"dark" }]);
  if (/\/rest\/v1\/public_profiles/.test(u)) return ok([]);
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
const settle=async(ms=250)=>{ await act(async()=>{ await new Promise(r=>setTimeout(r,ms)); }); };
const btnByText=(t)=>qa("button").find(b=>(b.textContent||"").trim()===t);

// Profile → Body screen (readiness) — VO₂ Max card + signals.
click(qa('button[aria-label="Profile"]')[0]); await settle(500);
click(btnByText("Body")); await settle(500);
const txt = document.body.textContent || "";
check("VO₂ Max card renders (label + value)", /Cardio fitness/i.test(txt) && txt.includes("45.2"), `slice: ${txt.slice(0,80)}`);
check("VO₂ Max shows the 6-month trend delta", /\+3\.2 over 6 months/.test(txt));
check("elevated overnight signals show a heads-up warning", /Heads up/i.test(txt) && /breathing rate up/i.test(txt), `has-signals`);

// Tracker tab → History sub-tab — per-workout HR line.
click(qa('button[aria-label="Workout"]')[0]); await settle(500);
click(btnByText("History")); await settle(500);
const txt2 = document.body.textContent || "";
check("History shows the workout heart-rate summary", /142 avg/.test(txt2) && /176 peak/.test(txt2), `slice: ${txt2.slice(0,120)}`);

console.log(`\n${fails===0?"ALL PASS":fails+" FAIL(S)"}`);
process.exit(fails?1:0);
