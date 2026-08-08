// SWIPE-TO-DELETE A SET — drive a real left-swipe touch gesture on a SetRow inside an active
// workout and assert: (a) the red delete hint background is actually revealed mid-gesture,
// (b) releasing past the 60px threshold removes that set, (c) a "Set deleted" toast offers Undo,
// (d) Undo puts the set back, and (e) a single-set exercise renders NO delete affordance
// (onDelete is undefined there by design). Self-contained JSDOM.
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
// Exercise 1 has THREE sets (swipe-delete enabled). Exercise 2 has ONE (deliberately disabled).
const SESSION = {
  dayId: null, dayName: "Push", programId: null, startedAt: now,
  exercises: [
    { id:"e1", name:"Bench Press", reps:"3×8", note:"", sets:[
      { id:"s1", weight:"135", reps:"8", done:false, type:"normal" },
      { id:"s2", weight:"145", reps:"6", done:false, type:"normal" },
      { id:"s3", weight:"155", reps:"5", done:false, type:"normal" },
    ]},
    { id:"e2", name:"Lat Pulldown", reps:"1×10", note:"", sets:[
      { id:"t1", weight:"100", reps:"10", done:false, type:"normal" },
    ]},
  ],
};
window.localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId:"u1", theme:"dark",
  users:[{ id:"u1", username:"mo", name:"Mo", unit:"lbs", theme:"dark" }], history:{} }));
window.localStorage.setItem("seshd_session", JSON.stringify({ access_token:"tok", refresh_token:"ref", expires_in:3600, user:{ id:"u1", email:"t@t.com" } }));
window.localStorage.setItem("seshd_onboarded","1"); window.localStorage.setItem("seshd_custom_merge_v1","1");
window.localStorage.setItem("seshd_active_session", JSON.stringify(SESSION));
window.localStorage.setItem("seshd_wstart", String(now));

global.fetch = window.fetch = async (url, opts) => {
  const u=String(url), m=(opts?.method||"GET").toUpperCase();
  const ok=(b,s=200)=>({ok:s<400,status:s,json:async()=>b,text:async()=>JSON.stringify(b)});
  if (u.includes("/auth/v1/token")) return ok({ access_token:"tok", user:{id:"u1"} });
  if (u.includes("/auth/v1/user")) return ok({ id:"u1" });
  if (m!=="GET") return ok([]);
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
const settle=async(ms=200)=>{ await act(async()=>{ await new Promise(r=>setTimeout(r,ms)); }); };

// A SetRow is the wrapper div carrying data-no-tab-swipe; the swipe target is its LAST child
// (the row content div that owns onTouchStart/Move/End), and the red hint is the child whose
// background is the delete red.
const setRows = () => qa("div[data-no-tab-swipe]").filter(d =>
  Array.from(d.children).some(c => /touch-action:\s*pan-y/i.test(c.getAttribute("style")||"")));
const deleteHintOf = (row) => Array.from(row.children).find(c => /rgba\(239,\s*68,\s*68/i.test(c.getAttribute("style")||""));
const swipeTargetOf = (row) => Array.from(row.children).find(c => /touch-action:\s*pan-y/i.test(c.getAttribute("style")||""));

const rows0 = setRows();
check("workout is live with 4 set rows (3 + 1)", rows0.length === 4, `found ${rows0.length}`);

const row = rows0[1]; // 2nd set of Bench Press
const target = swipeTargetOf(row);
const hint = deleteHintOf(row);
check("multi-set row renders the red delete hint layer", !!hint, "no #EF4444 child");
check("hint starts fully transparent (idle)", hint && String(hint.style.opacity) === "0", `opacity=${hint&&hint.style.opacity}`);
// (e) single-set exercise: LAST row belongs to Lat Pulldown, which has one set → no hint at all.
check("single-set row has NO delete hint (swipe-delete disabled by design)", !deleteHintOf(rows0[3]));

const touch = (type, x) => act(() => {
  const ev = new window.Event(type, { bubbles:true, cancelable:true });
  const t = { clientX:x, clientY:100, identifier:0, target };
  ev.touches = type === "touchend" ? [] : [t];
  ev.changedTouches = [t];
  target.dispatchEvent(ev);
});

// A DELETE NOW NEEDS A THIRD OF THE ROW, not 60px. 60px is about an eighth of the screen — inside
// the range of a scroll wobble or a mistimed drag past a set — so Mo asked for a much longer
// throw as a second line of defence. jsdom reports a 0-width row, so deleteSwipeThreshold falls
// back to its 380px assumption: 127px here. The swipe-RIGHT that completes a set is deliberately
// untouched at 60px; that one is not destructive and is the fast path mid-workout.
const COMMIT = 150;                    // comfortably past a third
const UNDER  = 95;                     // past the OLD 60px threshold, short of the new one
const X0 = 300;
touch("touchstart", X0);
touch("touchmove", X0 - 12);           // crosses the 6px threshold → first-frame setState
await settle(60);
const opAfterFirst = parseFloat(hint.style.opacity || "0");
touch("touchmove", X0 - 40);           // direct DOM writes from here on
const opMid = parseFloat(hint.style.opacity || "0");
touch("touchmove", X0 - COMMIT);
const opCommitted = parseFloat(hint.style.opacity || "0");
const rowShift = (swipeTargetOf(row) || {}).style?.transform || "";

check("hint becomes visible on the first swiping frame", opAfterFirst > 0, `opacity=${opAfterFirst}`);
check("hint opacity grows with the drag (12px < 40px)", opMid > opAfterFirst, `${opAfterFirst} -> ${opMid}`);
check("hint is fully opaque past the commit threshold", opCommitted === 1, `opacity=${opCommitted}`);
check("row tracks the finger (translateX follows the drag)", new RegExp(`translateX\\(-${COMMIT}px\\)`).test(rowShift), `transform="${rowShift}"`);

// THE NEW GUARD: a swipe that would have deleted under the old rule must now do nothing. Without
// this the threshold could be quietly lowered again and every other check here would still pass.
// Note onTouchEnd reads the dx recorded by the last touchMOVE, not the coordinate on touchend —
// the first cut of this check released at 95px after moving to 150 and "deleted", which was the
// test lying, not the app.
touch("touchmove", X0 - UNDER);
touch("touchend", X0 - UNDER);
await settle(300);
check(`a ${UNDER}px swipe — past the OLD 60px rule — no longer deletes`, setRows().length === 4,
  `found ${setRows().length}`);

touch("touchstart", X0);
touch("touchmove", X0 - 12);
await settle(60);
touch("touchmove", X0 - COMMIT);
touch("touchend", X0 - COMMIT);
await settle(300);

const rows1 = setRows();
check("the swiped set is deleted (4 rows -> 3)", rows1.length === 3, `found ${rows1.length}`);
const stored = JSON.parse(window.localStorage.getItem("seshd_active_session") || "{}");
const benchIds = (stored.exercises?.[0]?.sets || []).map(s => s.id);
check("deleted set is gone from the persisted session", JSON.stringify(benchIds) === JSON.stringify(["s1","s3"]), `sets=${JSON.stringify(benchIds)}`);

const bodyTxt = document.body.textContent || "";
check('"Set deleted" toast appears', /Set deleted/.test(bodyTxt));
const undoBtn = qa("button").find(b => (b.textContent||"").trim() === "Undo");
check('toast offers an "Undo" action', !!undoBtn);

// (d) Undo restores the set at its original index.
if (undoBtn) { act(()=>undoBtn.dispatchEvent(new window.MouseEvent("click",{bubbles:true,cancelable:true}))); }
await settle(300);
const restored = JSON.parse(window.localStorage.getItem("seshd_active_session") || "{}");
const afterUndo = (restored.exercises?.[0]?.sets || []).map(s => s.id);
check("Undo restores the set in its original position", JSON.stringify(afterUndo) === JSON.stringify(["s1","s2","s3"]), `sets=${JSON.stringify(afterUndo)}`);

// PROBE: a short swipe that never reaches the threshold must NOT delete anything.
await settle(200);
const rowsP = setRows();
const rowP = rowsP[1], targetP = swipeTargetOf(rowP);
const touchP = (type, x) => act(() => {
  const ev = new window.Event(type, { bubbles:true, cancelable:true });
  const t = { clientX:x, clientY:100, identifier:0, target:targetP };
  ev.touches = type === "touchend" ? [] : [t];
  ev.changedTouches = [t];
  targetP.dispatchEvent(ev);
});
touchP("touchstart", X0); touchP("touchmove", X0 - 12); await settle(40);
touchP("touchmove", X0 - 35); touchP("touchend", X0 - 35);
await settle(300);
check("a 35px swipe (under threshold) does not delete", setRows().length === 4, `found ${setRows().length}`);

console.log(`\n${fails===0?"ALL PASS":fails+" FAIL(S)"}`);
process.exit(fails?1:0);
