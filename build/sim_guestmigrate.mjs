// GUEST → ACCOUNT MIGRATION MUST BE IDEMPOTENT.
//
// It used to POST every local session with no id, so each run inserted a fresh copy. The run only
// clears `seshd_guest` at the very end, after dozens of awaited requests, so any interruption left
// the flag set and re-migrated everything next launch. A real account reached 202 rows for 55
// workouts — and because loadUserData keys history by ROW ID, every copy survived into the local
// store and inflated volume, streaks, the workout count and Body Battery's training drain ~3.7x.
//
// These checks drive the real signup-from-guest flow twice and pin: each session is sent with its
// own id, upserted on that id, dated at noon local (not midnight UTC), and a second run writes the
// SAME ids rather than new ones.
import { JSDOM } from "jsdom";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Guest history: one session keyed by a legacy short uid(), one by a proper uuid.
const LEGACY_SID = "a1b2c3d4";
const UUID_SID = "11111111-2222-4333-8444-555555555555";
const HISTORY = {
  "2026-07-20": { [LEGACY_SID]: { dayName: "Push A", exercises: [{ name: "Bench", sets: [{ weight: "135", reps: "8", done: true, type: "normal" }] }], duration: 3000, unit: "lbs" } },
  "2026-07-22": { [UUID_SID]: { dayName: "Pull A", exercises: [{ name: "Row", sets: [{ weight: "155", reps: "8", done: true, type: "normal" }] }], duration: 2800, unit: "lbs" } },
};

async function runMigration(label) {
  // Drive the BOOT migration path: an auth callback landing while `seshd_guest` is still set is
  // exactly the interrupted-migration replay this has to survive. AUTH_CALLBACK is captured at
  // module load, so the fragment must be on the URL before the dynamic import below.
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>",
    { url: "https://app.test/#access_token=tok&refresh_token=r&expires_in=3600", pretendToBeVisual: true });
  const { window } = dom;
  global.window = window; global.document = window.document;
  Object.defineProperty(global, "navigator", { value: window.navigator, configurable: true });
  global.localStorage = window.localStorage; global.CustomEvent = window.CustomEvent;
  global.HTMLElement = window.HTMLElement; global.Image = window.Image;
  global.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  global.cancelAnimationFrame = id => clearTimeout(id);
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = window.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = window.scrollTo || (() => {});
  window.HTMLElement.prototype.scrollIntoView = () => {};
  navigator.vibrate = () => {};

  // A GUEST with local history, mid-signup: the app migrates on the next authenticated boot.
  window.localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: "guest", history: HISTORY, users: [], programs: [], prs: {} }));
  window.localStorage.setItem("seshd_guest", "1");
  window.localStorage.setItem("seshd_onboarded", "1");
  window.localStorage.setItem("seshd_custom_merge_v1", "1");
  window.localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "r", expires_in: 3600, user: { id: "newuser", email: "mo@example.com" } }));

  const writes = [];
  global.fetch = window.fetch = async (url, opts) => {
    const u = String(url), m = (opts?.method || "GET").toUpperCase();
    let body = null; try { body = opts?.body ? JSON.parse(opts.body) : null; } catch {}
    if (m !== "GET") writes.push({ url: u, method: m, body, prefer: (opts?.headers || {})["Prefer"] });
    const ok = (b, s = 200) => ({ ok: s < 400, status: s, json: async () => b, text: async () => JSON.stringify(b) });
    if (u.includes("/auth/v1/token")) return ok({ access_token: "tok", refresh_token: "r", user: { id: "newuser" } });
    if (u.includes("/auth/v1/user")) return ok({ id: "newuser" });
    if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u)) return ok([{ id: "newuser", username: "mo", unit: "lbs", seen_onboarding: true }]);
    if (u.includes("/rest/v1/")) return ok([]);
    return ok({});
  };

  const App = (await import(`./app.mjs?gm=${label}`)).default;
  const container = document.createElement("div"); document.body.appendChild(container);
  act(() => { createRoot(container).render(React.createElement(App, {})); });
  await act(async () => { await new Promise(r => setTimeout(r, 2500)); });

  const hist = writes.filter(w => w.url.includes("workout_history") && w.method === "POST");
  dom.window.close();
  return hist;
}

const first = await runMigration("one");
console.log("RUN 1 history writes:", first.length, JSON.stringify(first.map(w => ({ id: w.body?.id, d: w.body?.workout_date, created: w.body?.created_at }))));

check("both guest sessions are migrated", first.length === 2, String(first.length));
check("every row carries an explicit id", first.length > 0 && first.every(w => !!w.body?.id), JSON.stringify(first.map(w => w.body?.id)));
check("...and every id is a real UUID the uuid column will accept",
  first.length > 0 && first.every(w => UUID_RE.test(w.body?.id || "")), JSON.stringify(first.map(w => w.body?.id)));
check("a session already keyed by a UUID keeps that id",
  first.some(w => w.body?.id === UUID_SID), JSON.stringify(first.map(w => w.body?.id)));
check("the legacy short-key session is given a UUID instead of being sent as-is",
  first.length > 0 && !first.some(w => w.body?.id === LEGACY_SID));
check("the write upserts on id rather than blind-inserting",
  first.length > 0 && first.every(w => /on_conflict=id/.test(w.url)), first.map(w => w.url).join(" , "));
check("...with the merge-duplicates preference set",
  first.length > 0 && first.every(w => /merge-duplicates/.test(w.prefer || "")), JSON.stringify(first.map(w => w.prefer)));
check("each row keeps its own workout date",
  first.map(w => w.body?.workout_date).sort().join(",") === "2026-07-20,2026-07-22",
  JSON.stringify(first.map(w => w.body?.workout_date)));
// midnight UTC put every migrated workout on the previous evening for anyone west of Greenwich.
check("created_at is noon local on the workout's own date, not midnight UTC",
  first.length > 0 && first.every(w => {
    const d = new Date(w.body?.created_at);
    return d.getHours() === 12 && `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` === w.body?.workout_date;
  }), JSON.stringify(first.map(w => w.body?.created_at)));

// THE POINT: an interrupted migration re-runs. It must overwrite, not accumulate.
const second = await runMigration("two");
console.log("RUN 2 history writes:", second.length, JSON.stringify(second.map(w => w.body?.id)));
check("a second run still writes exactly one row per session", second.length === 2, String(second.length));
check("a second run reuses the SAME uuid for the already-uuid session",
  second.some(w => w.body?.id === UUID_SID), JSON.stringify(second.map(w => w.body?.id)));
check("every second-run write is an upsert, so nothing accumulates",
  second.length > 0 && second.every(w => /on_conflict=id/.test(w.url) && /merge-duplicates/.test(w.prefer || "")));

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
