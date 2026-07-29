// PROFILE HEADER — opening someone's profile from a followers list put the back chevron UNDER the
// status-bar clock (the status bar overlays the WebView, and the cover's buttons used a hardcoded
// top:8), and the stat row read "1 Workouts".
// Asserts the cover and its two buttons account for env(safe-area-inset-top), and that the counts
// pluralise at 1 and at 0/many.
import React from "react";
import { JSDOM } from "jsdom";
import { createRoot } from "react-dom/client";
import { act } from "react";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let fails = 0;
const check = (l,c,d)=>{ if(c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d?" — "+d:""}`);} };

const todayKey = (d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`)(new Date());

// nPosts / nFollowers drive the pluralisation cases.
async function run(label, nPosts, nFollowers, expect) {
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

  // "me" follows maya, so tapping her from the following list opens her profile with a Back button.
  const users = [
    { id:"u1", username:"mo", name:"Mo", unit:"lbs", theme:"dark", following:["u2"] },
    { id:"u2", username:"maya_lifts", name:"Maya Chen", bio:"Squat-first powerlifter", unit:"lbs" },
  ];
  window.localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId:"u1", theme:"dark", users, history:{} }));
  window.localStorage.setItem("seshd_session", JSON.stringify({ access_token:"tok", refresh_token:"r", expires_in:3600, user:{ id:"u1", email:"t@t.com" } }));
  window.localStorage.setItem("seshd_onboarded","1"); window.localStorage.setItem("seshd_custom_merge_v1","1");

  const posts = Array.from({ length: nPosts }, (_, i) => ({
    id: "p"+i, user_id:"u2", type:"workout", created_at:new Date(Date.now()-i*864e5).toISOString(),
    text:"", workout:{ name:"Squat Day", duration:3600, volume:12800, exercises:[] } }));
  const followerRows = [
    { follower_id:"u1", following_id:"u2" },                                   // Mo follows Maya
    ...Array.from({ length: Math.max(0, nFollowers - 1) }, (_, i) => ({ follower_id:"f"+i, following_id:"u2" })),
  ];
  global.fetch = window.fetch = async (url, opts) => {
    const u=String(url), m=(opts?.method||"GET").toUpperCase();
    const ok=(b,s=200)=>({ok:s<400,status:s,json:async()=>b,text:async()=>JSON.stringify(b)});
    if (u.includes("/auth/v1/token")) return ok({ access_token:"tok", user:{id:"u1"} });
    if (u.includes("/auth/v1/user")) return ok({ id:"u1" });
    if (m!=="GET") return ok([]);
    // Other users load from public_profiles, not profiles (a stub that only answers /profiles
    // renders an empty social UI — this has bitten sims before).
    if (/\/rest\/v1\/public_profiles\?/.test(u)) return ok([{ id:"u2", username:"maya_lifts", name:"Maya Chen",
      bio:"Squat-first powerlifter", unit:"lbs", is_public:true }]);
    if (/\/rest\/v1\/profiles\?/.test(u)) return ok([{ id:"u1", username:"mo", name:"Mo", unit:"lbs", is_public:true, seen_onboarding:true, theme:"dark" }]);
    if (/\/rest\/v1\/posts\?/.test(u)) return ok(posts);
    if (/\/rest\/v1\/follows\?/.test(u)) return ok(followerRows);
    if (u.includes("/rest/v1/")) return ok([]);
    return ok({});
  };
  const App = (await import(`./app.mjs?p=${label}`)).default;
  const container=document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  act(()=>{ root.render(React.createElement(App,{})); });
  await act(async()=>{ await new Promise(r=>setTimeout(r,1600)); });
  const qa=(s)=>Array.from(document.querySelectorAll(s));
  const settle=async(ms=500)=>{ await act(async()=>{ await new Promise(r=>setTimeout(r,ms)); }); };
  const click=(el)=>{ if(el) act(()=>el.dispatchEvent(new window.MouseEvent("click",{bubbles:true,cancelable:true}))); };

  // Profile tab -> Following list -> tap Maya, which is the path Mo took.
  click(qa('button[aria-label="Profile"]')[0]); await settle(600);
  click(qa("button").find(b => /Following/.test(b.textContent||"") && /\d/.test(b.textContent||""))); await settle(600);
  click(qa("*").find(e => (e.textContent||"").trim() === "maya_lifts" || (e.textContent||"").trim() === "Maya Chen")); await settle(2000);
  if (process.env.DBG) {
    console.log("  buttons:", qa("button").map(b=>(b.getAttribute("aria-label")||b.textContent||"").trim().slice(0,26)).filter(Boolean).join(" | "));
    console.log("  body:", (document.body.textContent||"").replace(/\s+/g," ").slice(0,320));
  }
  expect({ qa, check });
  dom.window.close();
}

// The stat NUMBER is an <AnimatedNumber> whose tween doesn't settle deterministically under jsdom
// (it was still mid-pulse after 2s), so don't assert against it. Assert the user-visible string
// instead — which is exactly what Mo saw: "1 Workouts". textContent concatenates the number and
// label divs with no space, hence "1Workouts".
const grammatical = (check, label) => {
  const txt = (document.body.textContent || "").replace(/\s+/g, " ");
  check(`${label}: never renders "1 Workouts"`, !/1Workouts/.test(txt));
  check(`${label}: never renders "1 Followers"`, !/1Followers/.test(txt));
  check(`${label}: never renders "1 Following" as "1 Followings"`, !/1Followings/.test(txt));
};

await run("one", 1, 1, ({ qa, check }) => {
  // The reported bug: the back chevron rendered underneath the status-bar clock.
  const back = qa('button[aria-label="Back"]').find(b => /position:\s*absolute/.test(b.getAttribute("style")||""));
  check("the floating cover Back button is rendered", !!back);
  const st = back ? (back.getAttribute("style")||"") : "";
  check("Back button clears the status bar (safe-area inset)", /safe-area-inset-top/.test(st), st.slice(0,120));
  const cover = back ? back.parentElement : null;
  check("the cover grows by the inset so 132px stays visible",
    !!cover && /safe-area-inset-top/.test(cover.getAttribute("style")||""), (cover&&cover.getAttribute("style")||"").slice(0,120));
  grammatical(check, "1 follower");
  // Singular must actually be reachable, or the check above passes vacuously.
  // No \b here: "1Follower" runs straight into the next stat's digit ("0Following"), and both
  // sides of that join are word characters, so a word boundary never matches.
  check("the singular form IS used at a count of 1", /1Follower(?!s)/.test((document.body.textContent||"").replace(/\s+/g," ")));
});

await run("many", 4, 6, ({ qa, check }) => {
  grammatical(check, "6 followers");
  const txt = (document.body.textContent || "").replace(/\s+/g, " ");
  check("plural is used for counts above 1", /6Followers/.test(txt), txt.slice(0,160));
});

await run("zero", 0, 1, ({ qa, check }) => {
  grammatical(check, "0 workouts");
  check("zero uses the plural", /0Workouts/.test((document.body.textContent||"").replace(/\s+/g," ")));
});

console.log(`\n${fails===0?"ALL PASS":fails+" FAIL(S)"}`);
process.exit(fails?1:0);
