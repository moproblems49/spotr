// STEPS + ACTIVE ENERGY IN THE BODY BATTERY SHEET. They drive the drain curve and the bedtime
// gate but were never shown anywhere, so the ~2x duplicate-source bug was invisible for as long as
// it existed. Asserts they render with today's numbers, sit next to the drain they cause, are
// hidden when the reading is stale (yesterday's sync must not be presented as today's), and are
// hidden when there's no Health data at all.
import React from "react";
import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { act as reactAct } from "react";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let fails = 0;
const check = (l,c,d)=>{ if(c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d?" — "+d:""}`);} };

const dayKey = (off=0) => { const d=new Date(); d.setDate(d.getDate()-off);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

async function run(label, activity, expect) {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url:"https://app.test/", pretendToBeVisual:true });
  const { window } = dom;
  global.window=window; global.document=window.document;
  Object.defineProperty(global,"navigator",{value:window.navigator,configurable:true});
  global.localStorage=window.localStorage; global.CustomEvent=window.CustomEvent; global.HTMLElement=window.HTMLElement;
  global.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),0); global.cancelAnimationFrame=(id)=>clearTimeout(id);
  window.matchMedia=window.matchMedia||(()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}));
  window.ResizeObserver=window.ResizeObserver||class{observe(){}unobserve(){}disconnect(){}};
  window.IntersectionObserver=window.IntersectionObserver||class{observe(){}unobserve(){}disconnect(){}};
  window.scrollTo=window.scrollTo||(()=>{}); window.HTMLElement.prototype.scrollIntoView=()=>{};
  navigator.vibrate=()=>{};

  const todayKey = dayKey(0);
  const finishedAt = Date.now() - 3*36e5;
  const sets = Array.from({length:12}, () => ({ weight:"185", reps:"6", done:true, rpe:"8" }));
  const history = { [todayKey]: { s1: { name:"Push", finishedAt, duration:3600, exercises:[{ name:"Bench Press", sets }] } } };
  const store = { currentUserId:"u1", theme:"dark",
    users:[{ id:"u1", username:"mo", name:"Mo", unit:"lbs", theme:"dark" }], history,
    recovery: { recoveryScore:0.8, hrv:44, hrvBaseline:33, restingHr:58, rhrBaseline:61, sleepHours:7.5,
      sleepStart:new Date(Date.now()-9*36e5).toISOString(), sleepEnd:new Date(Date.now()-1*36e5).toISOString() } };
  if (activity) store.activity = activity;
  window.localStorage.setItem("seshd_v1", JSON.stringify(store));
  window.localStorage.setItem("seshd_session", JSON.stringify({ access_token:"tok", refresh_token:"ref", expires_in:3600, user:{ id:"u1", email:"t@t.com" } }));
  window.localStorage.setItem("seshd_onboarded","1"); window.localStorage.setItem("seshd_custom_merge_v1","1");
  window.localStorage.setItem("seshd_health_connected","1");
  const HIST=[{ id:"s1", user_id:"u1", workout_date: todayKey, day_name:"Push", unit:"lbs", duration_secs:3600,
    note:"", created_at:new Date(finishedAt).toISOString(), exercises:[{ name:"Bench Press", sets }] }];
  global.fetch = window.fetch = async (url, opts) => {
    const u=String(url), m=(opts?.method||"GET").toUpperCase();
    const ok=(b,s=200)=>({ok:s<400,status:s,json:async()=>b,text:async()=>JSON.stringify(b)});
    if (u.includes("/auth/v1/token")) return ok({ access_token:"tok", user:{id:"u1"} });
    if (u.includes("/auth/v1/user")) return ok({ id:"u1" });
    if (m!=="GET") return ok([]);
    if (/\/rest\/v1\/workout_history\?/.test(u)) return ok(HIST);
    if (/\/rest\/v1\/profiles\?/.test(u)) return ok([{ id:"u1", username:"mo", name:"Mo", unit:"lbs", is_public:true, seen_onboarding:true, theme:"dark" }]);
    if (u.includes("/rest/v1/")) return ok([]);
    return ok({});
  };
  const App = (await import(`./app.mjs?v=${label}`)).default;
  const container=document.createElement("div"); document.body.appendChild(container);
  reactAct(()=>{ createRoot(container).render(React.createElement(App,{})); });
  await reactAct(async()=>{ await new Promise(r=>setTimeout(r,1500)); });
  const qa=(s)=>Array.from(document.querySelectorAll(s));
  const settle=async(ms=400)=>{ await reactAct(async()=>{ await new Promise(r=>setTimeout(r,ms)); }); };
  const click=(el)=>{ if(el) reactAct(()=>el.dispatchEvent(new window.MouseEvent("click",{bubbles:true,cancelable:true}))); };

  click(qa('button[aria-label="Profile"]')[0]); await settle(500);
  click(qa("button").find(b=>(b.textContent||"").trim()==="Body")); await settle(500);
  const card = qa("div").find(d => (d.textContent||"").includes("BODY BATTERY") && /cursor:\s*pointer/i.test(d.getAttribute("style")||""));
  click(card); await settle(500);

  // Stat boxes are the uppercase labels inside the sheet's 2-column grid. Identify them by
  // STRUCTURE (uppercase label + a sibling value), not by an exact letter-spacing value — pinning
  // the selector to `0.6px` meant a routine tightening of the box padding/typography failed nine
  // assertions that had nothing to do with the change.
  const boxes = qa("div").filter(d => /text-transform:\s*uppercase/.test(d.getAttribute("style")||"")
    && d.children.length === 0 && !!d.nextElementSibling);
  const labels = boxes.map(d => (d.textContent||"").trim());
  const valueOf = (lbl) => { const b = boxes.find(d => (d.textContent||"").trim() === lbl);
    return b ? (b.nextElementSibling?.textContent||"").trim() : null; };
  console.log(`\n── ${label} ──  boxes: ${labels.join(" | ")}`);
  expect({ labels, valueOf, check });
  dom.window.close();
}

// 1) Fresh reading today → both boxes render with the real numbers.
await run("today", { date: dayKey(0), steps: 8432, activeKcal: 517 }, ({ labels, valueOf, check }) => {
  check("Steps box renders", labels.includes("Steps"), labels.join("|"));
  check("Steps shows today's count, formatted", valueOf("Steps") === "8,432", `got "${valueOf("Steps")}"`);
  check("Active energy box renders", labels.includes("Active energy"), labels.join("|"));
  check("Active energy shows kcal", valueOf("Active energy") === "517", `got "${valueOf("Active energy")}"`);
  check("it sits alongside the drain it causes", labels.includes("Activity drain"), labels.join("|"));
  check("the existing vitals are untouched", labels.includes("Resting HR") && labels.includes("HRV"), labels.join("|"));
});

// 2) Yesterday's sync must NOT be shown as today's.
await run("stale", { date: dayKey(1), steps: 8432, activeKcal: 517 }, ({ labels, check }) => {
  check("a stale reading shows no Steps box", !labels.includes("Steps"), labels.join("|"));
  check("a stale reading shows no Active energy box", !labels.includes("Active energy"), labels.join("|"));
  check("the sheet still renders its other stats", labels.includes("Morning charge"), labels.join("|"));
});

// 3) No Health activity at all (web, or permission never granted) → nothing extra, no crash.
await run("none", null, ({ labels, check }) => {
  check("no activity data → no Steps box", !labels.includes("Steps"), labels.join("|"));
  check("no activity data → no Active energy box", !labels.includes("Active energy"), labels.join("|"));
  check("sheet still renders", labels.includes("Morning charge"), labels.join("|"));
});

// 4) Steps recorded but no active energy → only the box that has data.
await run("stepsonly", { date: dayKey(0), steps: 1200, activeKcal: 0 }, ({ labels, valueOf, check }) => {
  check("steps-only shows Steps", labels.includes("Steps") && valueOf("Steps") === "1,200", `got "${valueOf("Steps")}"`);
  check("steps-only hides Active energy", !labels.includes("Active energy"), labels.join("|"));
});

console.log(`\n${fails===0?"ALL PASS":fails+" FAIL(S)"}`);
process.exit(fails?1:0);
