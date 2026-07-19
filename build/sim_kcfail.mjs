// BROKEN-KEYCHAIN SURVIVAL — a device where the SecureStoragePlugin exists but its methods
// FAIL must still boot signed in from the localStorage/Preferences fallback, keep that copy
// (old code nulled a successfully-parsed session when the migration write threw), and record
// a readable boot diagnostic. This is the paranoia-rule regression test for saveSession/
// hydrateSessionFromKeychain.
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

// Relaunch state: session survives ONLY in localStorage (as after a failed keychain save),
// with the onboarded flags present.
const SESSION = { access_token:"tok", refresh_token:"ref", expires_in:3600, user:{ id:"u1", email:"t@t.com" } };
window.localStorage.setItem("seshd_session", JSON.stringify(SESSION));
window.localStorage.setItem("seshd_onboarded","1");
window.localStorage.setItem("seshd_custom_merge_v1","1");

const prefs = {};
window.Capacitor = {
  isNativePlatform: () => true,
  Plugins: {
    Preferences: {
      keys: async () => ({ keys: Object.keys(prefs) }),
      get: async ({ key }) => ({ value: Object.prototype.hasOwnProperty.call(prefs, key) ? prefs[key] : null }),
      set: async ({ key, value }) => { prefs[key] = value; },
      remove: async ({ key }) => { delete prefs[key]; },
    },
    // BROKEN keychain: every method rejects.
    SecureStoragePlugin: {
      get: async () => { throw new Error("keychain unavailable (sim)"); },
      set: async () => { throw new Error("keychain unavailable (sim)"); },
      remove: async () => { throw new Error("keychain unavailable (sim)"); },
    },
  },
};

global.fetch = window.fetch = async (url, opts) => {
  const u=String(url), m=(opts?.method||"GET").toUpperCase();
  const ok=(b,s=200)=>({ok:s<400,status:s,json:async()=>b,text:async()=>JSON.stringify(b)});
  if (u.includes("/auth/v1/token")) return ok({ access_token:"tok2", refresh_token:"ref2", expires_in:3600, user:{id:"u1"} });
  if (u.includes("/auth/v1/user")) return ok({ id:"u1", email:"t@t.com" });
  if (m!=="GET") return ok([]);
  if (/\/rest\/v1\/profiles\?/.test(u)) return ok([{ id:"u1", username:"mo", name:"Mo", unit:"lbs", is_public:true, seen_onboarding:true }]);
  if (/\/rest\/v1\/public_profiles/.test(u)) return ok([]);
  if (u.includes("/rest/v1/")) return ok([]);
  return ok({});
};

const mod = await import("./app.mjs");
await mod.hydrateFromNative();

// Diagnostics recorded and honest about the failure.
const diag = window.localStorage.getItem("seshd_boot_diag") || "";
check("boot diag records the keychain miss + localStorage hit", /kc:miss\(.*\).*ls:hit/.test(diag), `diag=${diag}`);

// The parsed session must survive a failing migration write — localStorage copy KEPT.
check("localStorage session copy kept (not scrubbed on failed migration)", window.localStorage.getItem("seshd_session") !== null);

const container=document.createElement("div"); document.body.appendChild(container);
const root=createRoot(container);
act(()=>{ root.render(React.createElement(mod.default,{})); });
await act(async()=>{ await new Promise(r=>setTimeout(r,1500)); });
const text = document.body.textContent || "";
check("boots SIGNED IN despite broken keychain", !text.includes("Welcome back") && !text.includes("Start Tracking"), `body: ${text.slice(0,100)}`);
check("app chrome rendered", !!document.querySelector('button[aria-label="Home"]') || !!document.querySelector('button[aria-label="Profile"]'));

console.log(`\n${fails===0?"ALL PASS":fails+" FAIL(S)"}`);
process.exit(fails?1:0);
