// A PRIVATE ACCOUNT NOW REQUIRES APPROVAL.
//
// Following was unilateral and instant, and workout_history / personal_records / posts are all
// readable by any FOLLOWER — so "Private profile" was a speed bump, not a setting. Proven against
// live data before the fix: a stranger saw 0 workouts, tapped Follow, and immediately read 55
// workouts, 53 PRs and 65 posts.
//
// Server side is enforced by a trigger (the client cannot post its own status) plus an
// `f.status = 'accepted'` clause in every content policy — role-simulated separately. These checks
// pin the CLIENT half: only accepted follows count as following, a pending one reads "Requested",
// and accept/decline hit the right rows.
import { JSDOM } from "jsdom";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const ME = "11111111-1111-4111-8111-111111111111";
const PRIV = "22222222-2222-4222-8222-222222222222";   // private account I've requested
const ASKER = "33333333-3333-4333-8333-333333333333";  // wants to follow ME

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://app.test/", pretendToBeVisual: true });
const { window } = dom;
global.window = window; global.document = window.document;
Object.defineProperty(global, "navigator", { value: window.navigator, configurable: true });
global.localStorage = window.localStorage; global.CustomEvent = window.CustomEvent; global.HTMLElement = window.HTMLElement;
global.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
global.cancelAnimationFrame = id => clearTimeout(id);
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver = window.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
window.scrollTo = window.scrollTo || (() => {});
window.HTMLElement.prototype.scrollIntoView = () => {};
navigator.vibrate = () => {};

window.localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: ME, theme: "dark", history: {}, users: [
  { id: ME, username: "momo", name: "Mo" },
  { id: PRIV, username: "private_pat", name: "Pat" },
  { id: ASKER, username: "asker_al", name: "Al" },
] }));
window.localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "r", expires_in: 3600, user: { id: ME, email: "mo@example.com" } }));
window.localStorage.setItem("seshd_onboarded", "1");
window.localStorage.setItem("seshd_custom_merge_v1", "1");

// The server's view: I have a PENDING request out to PRIV, and ASKER has a PENDING one in to me.
const FOLLOW_ROWS = [
  { follower_id: ME, following_id: PRIV, status: "pending" },
  { follower_id: ASKER, following_id: ME, status: "pending" },
];
const writes = [];
global.fetch = window.fetch = async (url, opts) => {
  const u = String(url), m = (opts?.method || "GET").toUpperCase();
  let body = null; try { body = opts?.body ? JSON.parse(opts.body) : null; } catch {}
  if (m !== "GET") writes.push({ url: u, method: m, body });
  const ok = (b, s = 200) => ({ ok: s < 400, status: s, json: async () => b, text: async () => JSON.stringify(b) });
  if (u.includes("/auth/v1/token")) return ok({ access_token: "tok", user: { id: ME } });
  if (u.includes("/auth/v1/user")) return ok({ id: ME });
  if (/\/rest\/v1\/follows\?select/.test(u)) return ok(FOLLOW_ROWS);
  if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u)) return ok([
    { id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" },
    { id: PRIV, username: "private_pat", name: "Pat", is_public: false },
    { id: ASKER, username: "asker_al", name: "Al", is_public: true },
  ]);
  if (u.includes("/rest/v1/")) return ok([]);
  return ok({});
};

const App = (await import("./app.mjs?followreq=1")).default;
const container = document.createElement("div"); document.body.appendChild(container);
act(() => { createRoot(container).render(React.createElement(App, {})); });
await act(async () => { await new Promise(r => setTimeout(r, 1800)); });

const qa = (s) => Array.from(document.querySelectorAll(s));
const settle = async (ms = 500) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const click = (el) => { if (el) act(() => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }))); };

// ── 1. A pending request must NOT be counted as following ────────────────────────────────────
click(qa('button[aria-label="Profile"]')[0]); await settle(700);
const txt = () => (document.body.textContent || "").replace(/\s+/g, " ");
check("a pending outgoing request is not counted as Following", !/1 ?Following/.test(txt()), txt().slice(0, 200));
check("a pending incoming request is not counted as a Follower", !/1 ?Followers?(?![a-z])/.test(txt()), txt().slice(0, 200));

// ── 2. The incoming request is actionable from my own followers list ─────────────────────────
click(qa("button").find(b => /Follower/.test(b.textContent || ""))); await settle(600);
const body = txt();
check("my followers list shows the pending request", /REQUEST/.test(body), body.slice(0, 260));
check("...naming who it's from", /asker_al/.test(body));
check("...with an explanation, not just a name", /wants to follow you/.test(body));
const accept = qa("button").find(b => (b.textContent || "").trim() === "Accept");
const decline = qa("button").find(b => (b.textContent || "").trim() === "Decline");
check("Accept and Decline are both offered", !!accept && !!decline);

// ── 3. Accepting PATCHes the right row to accepted ───────────────────────────────────────────
writes.length = 0;
click(accept); await settle(600);
const patch = writes.find(w => w.method === "PATCH" && w.url.includes("follows"));
console.log("ACCEPT WRITE:", JSON.stringify(patch));
check("Accept sends a PATCH on the follows row", !!patch, JSON.stringify(writes));
check("...setting status to accepted", patch?.body?.status === "accepted", JSON.stringify(patch?.body));
check("...targeting the asker's row into MY account, not my own outgoing one",
  !!patch && patch.url.includes(`follower_id=eq.${ASKER}`) && patch.url.includes(`following_id=eq.${ME}`), patch?.url);
check("the request disappears from the list once accepted", !/wants to follow you/.test(txt()));

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
