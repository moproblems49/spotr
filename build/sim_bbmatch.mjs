// BODY BATTERY number-vs-curve match: at 2:10am after a workout the previous afternoon, the
// headline (computeBodyBattery.level) must COUNT the workout (workoutDrain>0, not reset to 0 at
// midnight) and the 24h curve's LAST point must EQUAL the headline (pinned).
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url:"https://app.test/" });
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(global,"navigator",{value:dom.window.navigator,configurable:true});
global.localStorage = dom.window.localStorage;
let fails=0; const check=(l,c,d)=>{ if(c) console.log("PASS "+l); else { fails++; console.log("FAIL "+l+(d?" — "+d:"")); } };

// Freeze "now" at 2:10am on day D (local).
const D = new Date(2026, 6, 22, 2, 10, 0); // Jul 22 02:10 local
const RealDate = Date;
global.Date = class extends RealDate { constructor(...a){ if(!a.length) return new RealDate(D.getTime()); return new RealDate(...a); } static now(){ return D.getTime(); } };

const mod = await import("./app.mjs");
const { computeBodyBattery, computeBodyBatteryTimeline } = mod;
check("both fns exported", typeof computeBodyBattery==="function" && typeof computeBodyBatteryTimeline==="function");

// Woke D-1 07:00 (19h ago, within 20h → wakeAnchor). Slept 7.5h. Workout finished D-1 14:00.
const wake = new RealDate(2026,6,21,7,0).getTime();
const workoutFin = new RealDate(2026,6,21,14,0).getTime();
const ydKey = "2026-07-21";
const store = {
  unit:"lbs",
  recovery: { recoveryScore:0.85, hrv:44, hrvBaseline:33, restingHr:60, rhrBaseline:62, sleepHours:7.5,
    sleepStart: new RealDate(2026,6,20,23,30).toISOString(), sleepEnd: new RealDate(wake).toISOString() },
  history: { [ydKey]: { w1: { dayName:"Push", finishedAt: workoutFin, duration: 3600,
    exercises:[{ name:"Bench", sets: Array.from({length:12},()=>({ weight:"135", reps:"8", done:true, rpe:8 })) }] } } },
};

const bb = computeBodyBattery(store);
check("workout counted despite being 'yesterday' at 2am (workoutDrain>0)", bb.workoutDrain > 0, `workoutDrain=${bb.workoutDrain}`);
check("headline level is drained (not stuck near morning charge)", bb.level < bb.charge0 - 15, `level=${bb.level} charge0=${bb.charge0}`);

const tl = computeBodyBatteryTimeline(store);
check("timeline computed", !!tl && tl.points.length >= 2);
const last = tl.points[tl.points.length-1];
check("curve endpoint is a DRAIN point at 2am (not recharge)", last.phase !== "recharge", `phase=${last.phase}`);
check("curve endpoint EQUALS the headline number (pinned)", last.level === Math.round(Math.max(5,Math.min(100,bb.level))), `endpoint=${last.level} headline=${bb.level}`);

global.Date = RealDate;
console.log(fails? fails+" FAIL(S)":"ALL PASS"); process.exit(fails?1:0);
