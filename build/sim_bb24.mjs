// BODY BATTERY 24H — the detail sheet's chart must span the full trailing 24 hours (not just
// sleep-start→now), draw multiple phase segments (yesterday drain / overnight recharge / today
// drain) without a line crossing the recharge dip, show hour/level gridlines, render the stat
// boxes in a 2-column grid, and swap the "Connect Apple Health" prompts for "connected —
// waiting for data" copy once the health-connected flag is set.
import React from "react";
import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { writeFileSync } from "node:fs";
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
window.localStorage.setItem("seshd_session", JSON.stringify({ access_token:"tok", refresh_token:"ref", expires_in:3600, user:{id:"u1", email:"t@t.com"} }));
window.localStorage.setItem("seshd_custom_merge_v1","1");
window.localStorage.setItem("seshd_onboarded","1");

// One workout YESTERDAY (history must come from the fetch stub — loadUserData wipes local seeds).
// It makes the Body screen's 7-day check pass AND puts a training dip in yesterday's drain phase.
const yd = new Date(Date.now() - 24*36e5);
const ydKey = `${yd.getFullYear()}-${String(yd.getMonth()+1).padStart(2,"0")}-${String(yd.getDate()).padStart(2,"0")}`;
const ydFinish = new Date(yd.getFullYear(), yd.getMonth(), yd.getDate(), 17, 30).toISOString();
const sets = Array.from({length:10}, () => ({ weight:"135", reps:"8", done:true }));
const HISTORY_ROWS = [{ id:"w1", user_id:"u1", workout_date: ydKey, day_name:"Push", unit:"lbs",
  duration_secs: 3600, note:"", created_at: ydFinish,
  exercises: [{ name:"Bench Press", sets }] }];

global.fetch = window.fetch = async (url, opts) => {
  const u=String(url), m=(opts?.method||"GET").toUpperCase();
  const ok=(b,s=200)=>({ok:s<400,status:s,json:async()=>b,text:async()=>JSON.stringify(b)});
  if (u.includes("/auth/v1/token")) return ok({ access_token:"tok", refresh_token:"ref", expires_in:3600, user:{id:"u1"} });
  if (u.includes("/auth/v1/user")) return ok({ id:"u1", email:"t@t.com" });
  if (m!=="GET") return ok([]);
  if (/\/rest\/v1\/workout_history\?/.test(u)) return ok(HISTORY_ROWS);
  if (/\/rest\/v1\/profiles\?/.test(u)) return ok([{ id:"u1", username:"mo", name:"Mo", unit:"lbs", is_public:true, seen_onboarding:true }]);
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

// Navigate: Profile tab → Body screen (default mode is "readiness", which holds the battery card).
click(qa('button[aria-label="Profile"]')[0]); await settle(500);
click(btnByText("Body")); await settle(500);
const bbCardSpan = qa("span").find(s => (s.textContent||"").trim() === "BODY BATTERY");
check("Body Battery card present on Body screen", !!bbCardSpan, `body: ${(document.body.textContent||"").slice(0,120)}`);

const openSheet = async () => { click(bbCardSpan); await settle(300); };
await openSheet();
check("battery detail sheet opened (24H header)", (document.body.textContent||"").includes("BODY BATTERY · 24H"));

// ── 24h axis ── tick labels should span the trailing 24 hours: 5 ticks 6h apart.
const nowMs = Date.now();
const tickBox = qa("div").find(d => (d.getAttribute("style")||"").match(/height:\s*12px/) && d.querySelectorAll("span").length >= 4);
const labels = tickBox ? Array.from(tickBox.querySelectorAll("span")).map(s => (s.textContent||"").trim()) : [];
check("5 axis ticks rendered", labels.length === 5, `labels=${JSON.stringify(labels)}`);
const fmtHour = h => h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;
const utcH = new Date(nowMs).getHours();
if (utcH === 22 || utcH === 23) {
  check("ticks span am AND pm (24h window, structural)", labels.some(l=>l.endsWith("a")) && labels.some(l=>l.endsWith("p")), `labels=${JSON.stringify(labels)}`);
} else {
  let prev = null;
  const expected = [0,0.25,0.5,0.75,1].map(f => {
    const full = fmtHour(new Date(nowMs - 24*36e5 + f*24*36e5).getHours());
    const lab = full === prev ? "" : full; prev = full; return lab;
  });
  check("tick labels cover the exact trailing 24h", JSON.stringify(labels) === JSON.stringify(expected), `got=${JSON.stringify(labels)} want=${JSON.stringify(expected)}`);
}

// ── Multi-segment curve + gridlines (taller 300x110 chart) ──
const chartSvg = qa("svg").find(s => s.getAttribute("viewBox") === "0 0 300 110");
check("chart svg present at new 300x110 size", !!chartSvg);
const strokes = chartSvg ? Array.from(chartSvg.querySelectorAll("path[stroke]")).filter(p => p.getAttribute("stroke") !== "none") : [];
const greens = strokes.filter(p => p.getAttribute("stroke") === "#4ade80");
check("multiple phase segments drawn (≥2 stroked paths)", strokes.length >= 2, `strokes=${strokes.length}`);
check("has a recharge (green) segment", greens.length >= 1);
check("has a drain (non-green) segment", strokes.length - greens.length >= 1);
const gridLines = chartSvg ? chartSvg.querySelectorAll("line").length : 0;
check("hour + level gridlines drawn (≥30 lines)", gridLines >= 30, `lines=${gridLines}`);

// ── Stat boxes in a 2-column grid ──
const grid = qa("div").find(d => /grid-template-columns:\s*1fr 1fr/.test(d.getAttribute("style")||"") && (d.textContent||"").includes("Morning charge"));
check("stat boxes render in a 2-column grid", !!grid);

// ── Connect copy: NOT connected → prompts ──
const txt1 = document.body.textContent || "";
check("not-connected: chart footnote prompts to connect", txt1.includes("Connect Apple Health for sleep-based recharge accuracy"));
check("not-connected: bottom box prompts to connect", txt1.includes("Connect Apple Health on iPhone for readings"));

// Dump the rendered chart for a visual screenshot (real markup, real coords).
if (chartSvg && tickBox) {
  const html = `<body style="margin:0;background:#0a0a0a;padding:24px"><div style="width:360px">${chartSvg.outerHTML}<div style="position:relative;height:14px;margin-top:4px">${tickBox.innerHTML}</div></div></body>`;
  writeFileSync(new URL("./bb24_chart.html", import.meta.url), html);
}

// ── Connected → copy switches ──
click(btnByText("Close")); await settle(250);
window.localStorage.setItem("seshd_health_connected","1");
await openSheet();
const txt2 = document.body.textContent || "";
check("connected: footnote says connected/waiting-for-sleep", txt2.includes("Apple Health connected — the recharge curve sharpens"));
check("connected: bottom box says connected/waiting-for-readings", txt2.includes("Apple Health is connected — readings switch to your real HRV"));
check("connected: no 'Connect Apple Health' prompt remains", !txt2.includes("Connect Apple Health"));

console.log(`\n${fails===0?"ALL PASS":fails+" FAIL(S)"}`);
process.exit(fails?1:0);
