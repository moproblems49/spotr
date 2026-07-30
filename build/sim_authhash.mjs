// AUTH TOKENS NEVER LINGER IN THE URL.
//
// OAuth callbacks and password-recovery links land with the tokens in the URL FRAGMENT
// (#access_token=…&refresh_token=…&type=recovery). Whoever holds those two values owns the
// account. The fragment used to be cleared inside a React effect, AFTER an `await fetch` to
// /auth/v1/user — and PostHog's automatic pageview capture reads window.location.href verbatim
// into `$current_url` on load. That window was wide enough to ship a working account takeover to
// a third-party analytics store for every user who ever reset a password.
//
// It's now captured and stripped at MODULE LOAD, before a component mounts or any script inits.
// These checks pin that, and pin that ordinary hash routes are left alone.
import { JSDOM } from "jsdom";

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const RECOVERY = "#access_token=LIVE-TOKEN-abc&refresh_token=LIVE-REFRESH-xyz&expires_in=3600&type=recovery";

// Load the app module with a recovery fragment already in the URL, exactly as the email link
// delivers it. Importing the module IS the event under test.
async function bootWith(hash) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
    url: "https://spotr-drab.vercel.app/" + hash, pretendToBeVisual: true,
  });
  const w = dom.window;
  globalThis.window = w; globalThis.document = w.document;
  Object.defineProperty(globalThis, "navigator", { value: w.navigator, configurable: true });
  Object.defineProperty(globalThis, "location", { value: w.location, configurable: true });
  globalThis.localStorage = w.localStorage; globalThis.sessionStorage = w.sessionStorage;
  globalThis.HTMLElement = w.HTMLElement; globalThis.Image = w.Image;
  globalThis.requestAnimationFrame = cb => setTimeout(cb, 0);
  globalThis.cancelAnimationFrame = () => {};
  globalThis.matchMedia = w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" });
  // Fresh module instance per boot — the strip happens once, at import.
  await import(`./app.mjs?authhash=${encodeURIComponent(hash)}`);
  return w;
}

// ── 1. A recovery link: the tokens are gone from the URL the moment the module has loaded ────
let w = await bootWith(RECOVERY);
check("the fragment is stripped at module load", w.location.hash === "", JSON.stringify(w.location.hash));
check("no access_token anywhere in the URL", !w.location.href.includes("access_token"), w.location.href);
check("no refresh_token anywhere in the URL", !w.location.href.includes("refresh_token"), w.location.href);
check("...and this is what an analytics pageview would now see", !/token/i.test(w.location.href), w.location.href);
check("the page itself is unchanged (same path)", w.location.pathname === "/", w.location.pathname);

// The whole point: window.location is what PostHog's $current_url reads. If a fragment survives
// here, it survives into the analytics store.
check("document.URL carries no token either", !/access_token/.test(w.document.URL), w.document.URL);

// ── 2. An OAuth callback (same shape, no type=recovery) ──────────────────────────────────────
w = await bootWith("#access_token=OAUTH-abc&refresh_token=OAUTH-xyz&expires_in=3600");
check("an OAuth callback fragment is stripped too", w.location.hash === "", w.location.hash);

// ── 3. Ordinary hash ROUTES must survive — the app uses #/u/<username> for profile links ─────
w = await bootWith("#/u/maya_lifts");
check("a profile deep-link hash is left alone", w.location.hash === "#/u/maya_lifts", w.location.hash);

w = await bootWith("");
check("no hash at all is a no-op", w.location.hash === "", w.location.hash);

// A hash that merely mentions the word must not be eaten — only a real token fragment.
w = await bootWith("#/u/access_token_fan");
check("a username that merely contains the word is left alone", w.location.hash === "#/u/access_token_fan", w.location.hash);

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
