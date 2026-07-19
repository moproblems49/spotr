// BEDTIME STEPS GATE — computeBodyBatteryTimeline's estimated bedtime (10pm) must be pushed
// later past hours with real steps (a late night out: steps prove AWAKE), capped at 4am, and
// the recharge phase must not appear before the gated bedtime. No step data → unchanged 10pm.
// Quiet evening (steps ~0) must NOT move bedtime (steps can't prove asleep), and data stamped
// with a stale date must be ignored entirely.
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url:"https://app.test/", pretendToBeVisual:true });
const { window } = dom;
global.window=window; global.document=window.document;
Object.defineProperty(global,"navigator",{value:window.navigator,configurable:true});
global.localStorage=window.localStorage; global.CustomEvent=window.CustomEvent; global.HTMLElement=window.HTMLElement;
let fails = 0;
const check = (l,c,d)=>{ if(c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d?" — "+d:""}`);} };

const { computeBodyBatteryTimeline } = await import("./app.mjs");
check("computeBodyBatteryTimeline exported", typeof computeBodyBatteryTimeline === "function");

const now = new Date();
const H = 36e5;
const todayAt = (h) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h).getTime();
const y22 = todayAt(22) - 24*H; // yesterday 10pm — the default estimated bedtime
const t4a = todayAt(4);         // today 4am — the gate cap
const fmt = (ts) => new Date(ts).toString().slice(16,21);

// Recharge points of the modeled night = recharge phase within [yesterday 8pm, today noon].
const nightRecharge = (tl) => tl.points.filter(p => p.phase === "recharge" && p.ts >= y22 - 2*H && p.ts <= todayAt(12));
const firstNightRecharge = (tl) => { const r = nightRecharge(tl); return r.length ? r[0].ts : null; };

// Gate only trusts data stamped with TODAY's date (stale buckets must not steer the night).
const todayKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
const ydKey = (() => { const d = new Date(now.getTime() - 24*H); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })();

// ── Case 1: no step data → bedtime stays 10pm ──
const tl1 = computeBodyBatteryTimeline({ history:{} });
check("baseline: timeline computed", !!tl1 && tl1.points.length >= 2);
const span1 = tl1.points[tl1.points.length-1].ts - tl1.points[0].ts;
check("baseline: spans ~24h", span1 > 23.4*H && span1 <= 24.05*H, `span=${(span1/H).toFixed(1)}h`);
check("baseline: no future points", tl1.points.every(p => p.ts <= Date.now()+1000));
const fr1 = firstNightRecharge(tl1);
check("baseline: recharge starts at the 10pm default", fr1 !== null && Math.abs(fr1 - y22) < 31*60000, `first recharge at ${fr1 && fmt(fr1)}`);

// ── Case 2: quiet evening (steps ≈ 0 all night) → bedtime unchanged (steps can't prove sleep) ──
const quietHours = Array.from({length:24}, () => ({ steps: 0, kcal: 0 }));
const tl2 = computeBodyBatteryTimeline({ history:{}, activityHourlyDate: todayKey, activityHourly: quietHours, activityPrevEvening: { 20:10, 21:0, 22:5, 23:0 } });
const fr2 = firstNightRecharge(tl2);
check("quiet night: bedtime stays 10pm", fr2 !== null && Math.abs(fr2 - y22) < 31*60000, `first recharge at ${fr2 && fmt(fr2)}`);

// ── Case 3: night out — steps 10pm→2am → bedtime pushed past the active hours, capped 4am ──
const outHours = Array.from({length:24}, () => ({ steps: 0, kcal: 0 }));
outHours[0] = { steps: 800, kcal: 30 };  // 12-1am walking
outHours[1] = { steps: 600, kcal: 20 };  // 1-2am walking
const tl3 = computeBodyBatteryTimeline({ history:{}, activityHourlyDate: todayKey, activityHourly: outHours, activityPrevEvening: { 22: 900, 23: 1200 } });
const fr3 = firstNightRecharge(tl3);
const expected3 = todayAt(2); // last active hour is 1-2am → bedtime 2am
check("night out: recharge starts ~2am (after last active hour), not 10pm", fr3 !== null && Math.abs(fr3 - expected3) < 31*60000, `first recharge at ${fr3 && fmt(fr3)} want ~${fmt(expected3)}`);
check("night out: NO recharge during the active 10pm-2am stretch", nightRecharge(tl3).every(p => p.ts >= expected3 - 31*60000), `earliest=${fmt(firstNightRecharge(tl3))}`);
check("night out: drain covers the 10pm-2am stretch instead", tl3.points.some(p => p.phase === "drain" && p.ts > y22 && p.ts < expected3));

// ── Case 4: rager until dawn — active through 3-4am → capped at 4am, curve stays sane ──
const rageHours = Array.from({length:24}, () => ({ steps: 0, kcal: 0 }));
for (const h of [0,1,2,3]) rageHours[h] = { steps: 700, kcal: 25 };
const tl4 = computeBodyBatteryTimeline({ history:{}, activityHourlyDate: todayKey, activityHourly: rageHours, activityPrevEvening: { 20:500, 21:600, 22: 900, 23: 1200 } });
const fr4 = firstNightRecharge(tl4);
check("rager: bedtime capped at 4am", fr4 !== null && Math.abs(fr4 - t4a) < 31*60000, `first recharge at ${fr4 && fmt(fr4)} want ~${fmt(t4a)}`);
check("rager: points still monotonic in time", tl4.points.every((p,i,a) => i===0 || p.ts >= a[i-1].ts));
check("rager: levels stay in 5..100", tl4.points.every(p => p.level >= 5 && p.level <= 100));

// ── Case 5: SAME night-out data but stamped with YESTERDAY's date → stale, gate must ignore ──
const tl5 = computeBodyBatteryTimeline({ history:{}, activityHourlyDate: ydKey, activityHourly: outHours, activityPrevEvening: { 22: 900, 23: 1200 } });
const fr5 = firstNightRecharge(tl5);
check("stale-stamped data: gate ignored, bedtime stays 10pm", fr5 !== null && Math.abs(fr5 - y22) < 31*60000, `first recharge at ${fr5 && fmt(fr5)}`);

console.log(`\n${fails===0?"ALL PASS":fails+" FAIL(S)"}`);
process.exit(fails?1:0);
