// PARTIAL TAB SWIPE — "screen rerenders if I swipe to the side a little bit and let go but not
// actually enough to switch tabs". The slide-in keyframe used to be driven by a condition that
// stays TRUE at rest (prevTab && swipeX===0 && !swipeRelease && source!=="swipe"), so a small
// swipe flipped animation-name to "none" for the drag and back to the keyframe on release — and
// none → name RESTARTS a CSS animation. The screen slid in again for no reason.
// Asserts: a tap-switch plays the slide ONCE and disarms; an under-threshold swipe leaves the
// tab alone AND never re-arms the animation; a real swipe still switches tabs.
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
Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });

window.localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId:"u1", theme:"dark",
  users:[{ id:"u1", username:"mo", name:"Mo", unit:"lbs", theme:"dark" }], history:{} }));
window.localStorage.setItem("seshd_session", JSON.stringify({ access_token:"tok", refresh_token:"ref", expires_in:3600, user:{ id:"u1", email:"t@t.com" } }));
window.localStorage.setItem("seshd_onboarded","1"); window.localStorage.setItem("seshd_custom_merge_v1","1");
global.fetch = window.fetch = async (url, opts) => {
  const u=String(url), m=(opts?.method||"GET").toUpperCase();
  const ok=(b,s=200)=>({ok:s<400,status:s,json:async()=>b,text:async()=>JSON.stringify(b)});
  if (u.includes("/auth/v1/token")) return ok({ access_token:"tok", user:{id:"u1"} });
  if (u.includes("/auth/v1/user")) return ok({ id:"u1" });
  if (m!=="GET") return ok([]);
  if (/\/rest\/v1\/profiles\?/.test(u)) return ok([{ id:"u1", username:"mo", name:"Mo", unit:"lbs", is_public:true, seen_onboarded:true, seen_onboarding:true, theme:"dark" }]);
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
const click=(el)=>{ if(el) act(()=>el.dispatchEvent(new window.MouseEvent("click",{bubbles:true,cancelable:true}))); };

// The 3-panel track is the element with width:300% and marginLeft:-100%; its CENTER child is the
// panel that carries the slide-in animation.
const track = () => qa("div").find(d => { const s=d.getAttribute("style")||"";
  return /width:\s*300%/.test(s) && /margin-left:\s*-100%/.test(s); });
const centerAnim = () => { const t=track(); return t ? (t.children[1].style.animation || "none") : null; };
// The bottom nav marks the current tab with full opacity (inactive siblings render at 0.45).
const NAV_LABELS = ["Home","Tracker","Discover","Profile"];
const navBtn = (label) => qa("button").find(b => (b.getAttribute("aria-label")||"") === label);
const activeTabLabel = () => {
  for (const l of NAV_LABELS) { const b = navBtn(l);
    if (b && /opacity:\s*1\b/.test(b.getAttribute("style")||"")) return l; }
  return null;
};

check("3-panel swipe track is mounted", !!track());

// ── A tap switch arms the slide, then disarms itself ─────────────────────────────────────────
const profileBtn = navBtn("Profile");
check("nav button found", !!profileBtn);
click(profileBtn); await settle(30);
const animDuringTap = centerAnim();
check("tap switch plays the slide-in keyframe", /slideIn/.test(animDuringTap||""), `animation="${animDuringTap}"`);
await settle(420);
const animAfterTap = centerAnim();
check("slide disarms once played", !/slideIn/.test(animAfterTap||""), `animation="${animAfterTap}"`);

// ── The reported bug: a small swipe that does NOT switch tabs ────────────────────────────────
// The touch container is the outermost app div (100dvh, max-width 480) — it owns onTouchStart/End
// and the non-passive native touchmove listener wired via setSwipeContainer.
const el = qa("div").find(d => { const s=d.getAttribute("style")||"";
  return /height:\s*100dvh/.test(s) && /max-width:\s*480px/.test(s); });
check("touch container found", !!el);
const tabBefore = activeTabLabel();
// Moves must be SPACED IN TIME. The release rule is `velocity > 0.18 || |dx| > 25% of width`, and
// firing every touchmove in the same millisecond makes velocity enormous — a 45px drag then
// "passes" as a flick, which is a harness artifact, not app behaviour. gapMs spreads the gesture
// over a realistic duration so the distance rule is what decides.
const mkTouch=(type,x)=>{ const ev=new window.Event(type,{bubbles:true,cancelable:true});
  const t={clientX:x,clientY:300,identifier:0,target:el};
  ev.touches = type==="touchend" ? [] : [t]; ev.changedTouches=[t]; return ev; };
const swipe = async (dxs, gapMs=0) => {
  act(()=>el.dispatchEvent(mkTouch("touchstart",200)));
  for (const dx of dxs) { act(()=>el.dispatchEvent(mkTouch("touchmove",200+dx))); if (gapMs) await settle(gapMs); }
  act(()=>el.dispatchEvent(mkTouch("touchend",200+dxs[dxs.length-1])));
};
let armedDuringDrag = false;
const swipeWatch = async (dxs, gapMs) => {
  act(()=>el.dispatchEvent(mkTouch("touchstart",200)));
  for (const dx of dxs) { act(()=>el.dispatchEvent(mkTouch("touchmove",200+dx)));
    const t=track(); if (t && t.style.transform && t.style.transform !== "none") armedDuringDrag = true;
    await settle(gapMs); }
  act(()=>el.dispatchEvent(mkTouch("touchend",200+dxs[dxs.length-1])));
};
// A deliberate 45px drag over ~450ms: 11% of the width and ~0.1 px/ms — under BOTH thresholds.
await swipeWatch([12, 30, 45], 150);
check("the small swipe really did drag the track (not refused outright)", armedDuringDrag);
await settle(60);
const animMidRelease = centerAnim();
await settle(420);
const animAfterSwipe = centerAnim();
const tabAfter = activeTabLabel();

check("small swipe does NOT switch tabs", tabAfter === tabBefore, `${tabBefore} -> ${tabAfter}`);
check("small swipe does NOT re-arm the slide mid-release", !/slideIn/.test(animMidRelease||""), `animation="${animMidRelease}"`);
check("small swipe does NOT replay the slide after settling", !/slideIn/.test(animAfterSwipe||""), `animation="${animAfterSwipe}"`);

// AUDIT REGRESSION: two switches the SAME direction inside 320ms used to set an identical
// slideAnim value, so React bailed, the effect never re-ran, and the FIRST switch's timer disarmed
// the SECOND slide part-way through. Tab order is feed/tracker/discover/profile, so Home → Discover
// → Profile is two rightward moves in a row.
click(navBtn("Home")); await settle(400);
click(navBtn("Discover"));
await settle(200);
click(navBtn("Profile"));      // same direction, well inside the 320ms disarm window
await settle(140);             // the first switch's timer has now come due
check("a second same-direction switch is not cut short by the first one's timer",
  /slideIn/.test(centerAnim()||""), `animation="${centerAnim()}"`);
await settle(400);
check("...and it still disarms once IT has played", !/slideIn/.test(centerAnim()||""), `animation="${centerAnim()}"`);

// ── A real swipe still works ─────────────────────────────────────────────────────────────────
await swipe([20, 80, 160, 220], 60); // 55% of the width — over the distance threshold
await settle(500);
check("a full swipe still changes tab", activeTabLabel() !== tabBefore, `still on ${activeTabLabel()}`);
// ...and the swipe-driven switch must not ALSO play the keyframe (that was a double-animation).
check("swipe-driven switch does not replay the keyframe", !/slideIn/.test(centerAnim()||""), `animation="${centerAnim()}"`);

console.log(`\n${fails===0?"ALL PASS":fails+" FAIL(S)"}`);
process.exit(fails?1:0);
