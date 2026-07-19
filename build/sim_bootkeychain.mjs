// BOOT KEYCHAIN — replicates main.jsx's boot exactly on a "native" device: the auth session
// exists ONLY in the iOS Keychain (SecureStoragePlugin stub), localStorage is empty (as after
// an app kill, since saveSession scrubs the localStorage copy). Boot must: await
// hydrateFromNative() → session restored → app renders SIGNED IN (no welcome/auth screen).
// This is the exact path that was broken on TestFlight (main.jsx never called hydration →
// sign-in required on every launch). Also checks the Preferences mirror + store hydration.
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

// ── Native environment stubs ──
// Keychain: holds the ONLY copy of the session (like a real device after relaunch).
const SESSION = { access_token:"tok", refresh_token:"ref", expires_in:3600, user:{ id:"u1", email:"t@t.com" } };
const keychain = { seshd_session: JSON.stringify(SESSION) };
// Preferences: holds the durable copy of app data (store + flags), localStorage starts EMPTY.
const prefs = {
  seshd_onboarded: "1",
  seshd_custom_merge_v1: "1",
};
window.Capacitor = {
  isNativePlatform: () => true,
  Plugins: {
    Preferences: {
      keys: async () => ({ keys: Object.keys(prefs) }),
      get: async ({ key }) => ({ value: Object.prototype.hasOwnProperty.call(prefs, key) ? prefs[key] : null }),
      set: async ({ key, value }) => { prefs[key] = value; },
      remove: async ({ key }) => { delete prefs[key]; },
    },
    SecureStoragePlugin: {
      get: async ({ key }) => {
        if (!Object.prototype.hasOwnProperty.call(keychain, key)) throw new Error("Item with given key does not exist");
        return { value: keychain[key] };
      },
      set: async ({ key, value }) => { keychain[key] = value; return { value: true }; },
      remove: async ({ key }) => { delete keychain[key]; return { value: true }; },
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

// ── Boot exactly like main.jsx: import → await hydrateFromNative() → render ──
const mod = await import("./app.mjs");
const App = mod.default;
check("hydrateFromNative is exported", typeof mod.hydrateFromNative === "function");
await mod.hydrateFromNative();

// After hydration (before render): Preferences flags must be in localStorage.
check("prefs hydrated into localStorage (onboarded flag)", window.localStorage.getItem("seshd_onboarded") === "1");
check("boot diag recorded a Keychain hit", (window.localStorage.getItem("seshd_boot_diag")||"") === "kc:hit", `diag=${window.localStorage.getItem("seshd_boot_diag")}`);

const container=document.createElement("div"); document.body.appendChild(container);
const root=createRoot(container);
act(()=>{ root.render(React.createElement(App,{})); });
await act(async()=>{ await new Promise(r=>setTimeout(r,1500)); });

// The app must boot SIGNED IN: no auth/welcome screen, real app chrome present.
const text = document.body.textContent || "";
check("no 'Welcome back' sign-in screen", !text.includes("Welcome back"));
check("no 'Create your account' screen", !text.includes("Create your account"));
const navPresent = !!document.querySelector('button[aria-label="Home"]') || !!document.querySelector('button[aria-label="Profile"]');
check("app chrome (tab nav) rendered — booted into the app", navPresent, `body: ${text.slice(0,100)}`);

// Write-through mirror: a seshd_* localStorage write must land in native Preferences.
window.localStorage.setItem("seshd_mirror_test", "42");
await act(async()=>{ await new Promise(r=>setTimeout(r,100)); });
check("write-through mirror installed (seshd_* writes reach Preferences)", prefs.seshd_mirror_test === "42", `prefs keys=${Object.keys(prefs).join(",")}`);

// Session stayed keychain-only: hydration must NOT have re-created a plaintext localStorage copy.
check("no plaintext session left in localStorage", window.localStorage.getItem("seshd_session") === null);

console.log(`\n${fails===0?"ALL PASS":fails+" FAIL(S)"}`);
process.exit(fails?1:0);
