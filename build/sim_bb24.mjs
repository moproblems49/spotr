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

// ── Garmin-style clock axis ── hourly dots (green across the sleep stretch), a bigger dot +
// label every 3 clock-hours.
const dotSpans = qa("span").filter(s => /border-radius:\s*999px/.test(s.getAttribute("style")||"") && /translate\(-50%, -50%\)/.test(s.getAttribute("style")||""));
check("hourly dot row rendered (≥20 dots over 24h)", dotSpans.length >= 20, `dots=${dotSpans.length}`);
const greenDots = dotSpans.filter(s => /background:\s*(rgb\(74,\s*222,\s*128\)|#4ade80)/i.test(s.getAttribute("style")||""));
check("sleep stretch dots are green", greenDots.length >= 3, `green=${greenDots.length}`);
const bigDots = dotSpans.filter(s => /width:\s*5px/.test(s.getAttribute("style")||""));
check("bigger dots at 3-hour marks (7-9 of them)", bigDots.length >= 7 && bigDots.length <= 9, `big=${bigDots.length}`);
const hourLabels = qa("span").map(s => (s.textContent||"").trim()).filter(t => /^(12|[1-9]|1[01])[ap]$/.test(t));
check("3-hourly labels present (≥6)", hourLabels.length >= 6, `labels=${JSON.stringify(hourLabels)}`);
const labelHour = (t) => { const n = parseInt(t, 10); const pm = t.endsWith("p"); return (n === 12 ? 0 : n) + (pm ? 12 : 0); };
check("every label sits on a 3-hour clock mark", hourLabels.every(t => labelHour(t) % 3 === 0), `labels=${JSON.stringify(hourLabels)}`);
check("labels span am AND pm (24h window)", hourLabels.some(l=>l.endsWith("a")) && hourLabels.some(l=>l.endsWith("p")));

// ── Multi-segment curve + gridlines (taller 300x110 chart) ──
const chartSvg = qa("svg").find(s => s.getAttribute("viewBox") === "0 0 300 110");
check("chart svg present at new 300x110 size", !!chartSvg);
const strokes = chartSvg ? Array.from(chartSvg.querySelectorAll("path[stroke]")).filter(p => p.getAttribute("stroke") !== "none") : [];
const greens = strokes.filter(p => p.getAttribute("stroke") === "#4ade80");
check("multiple phase segments drawn (≥2 stroked paths)", strokes.length >= 2, `strokes=${strokes.length}`);
check("has a recharge (green) segment", greens.length >= 1);
check("has a drain (non-green) segment", strokes.length - greens.length >= 1);
const gridLines = chartSvg ? chartSvg.querySelectorAll("line").length : 0;
check("light gridlines drawn (level 10s + 3h verticals, ≥15 lines)", gridLines >= 15 && gridLines <= 25, `lines=${gridLines}`);

// ── Stat boxes in a 2-column grid ──
const grid = qa("div").find(d => /grid-template-columns:\s*1fr 1fr/.test(d.getAttribute("style")||"") && (d.textContent||"").includes("Morning charge"));
check("stat boxes render in a 2-column grid", !!grid);

// ── Connect copy: NOT connected → prompts ──
const txt1 = document.body.textContent || "";
check("not-connected: chart footnote prompts to connect", txt1.includes("Connect Apple Health for sleep-based recharge accuracy"));
check("not-connected: bottom box prompts to connect", txt1.includes("Connect Apple Health on iPhone for readings"));

// Dump the rendered chart + axis rows for a visual screenshot (real markup, real coords).
const chartWrap = chartSvg && chartSvg.parentElement;
if (chartWrap) {
  const html = `<body style="margin:0;background:#111;padding:24px"><div style="width:360px">${chartWrap.outerHTML}</div></body>`;
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
