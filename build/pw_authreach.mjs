// THE APP STORE REJECTION GUARD. Apple rejected this app under Guideline 2.1(a) (Aug 25 2026,
// iPad Air 11" M3 / iPadOS 26.6): "Unable to scroll down the Create your account page (unable to
// locate Sign in button)". The sign-in/sign-up toggle existed ONLY at the bottom of the scrollable
// form, below four fields, the Create Account button and the Terms paragraph — and with the
// software keyboard open the scroll container's maxScroll measured 0, so there was genuinely
// nothing to scroll and the control was unreachable. The fix was a second toggle in the header row,
// ABOVE the scroll container, so it can never be scroll-gated. Nothing guarded that fix until this
// file, which is how a rejection-causing bug gets reintroduced by an unrelated layout change.
//
// WHY THIS ASSERTS WHAT IT DOES:
// - Hit-testing with elementFromPoint, never getBoundingClientRect math. Rect math produced one
//   confidently WRONG conclusion during this very investigation (it "proved" a container overflow
//   was clipping the toggle; hit-testing showed the overflow sat harmlessly below the last
//   element). A rect can be on-screen and still be covered by something.
// - ZERO scrolling before every reachability check. That is the whole point: the reviewer could not
//   scroll. A check that scrolls first would pass on the exact build Apple rejected.
// - The cramped viewports are not decoration. They stand in for the keyboard eating the lower half
//   of the screen, which is the state the reviewer was actually in (headless Chromium has no
//   software keyboard, so shrinking the viewport is the closest honest approximation).
import { chromium } from "playwright-core";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

// Is this element the top thing at its own centre? Returns true only if the point actually hits
// the element or something inside it — i.e. a real finger there would reach it.
const hitTest = (pg, label) => pg.evaluate((lbl) => {
  const btns = [...document.querySelectorAll("button")];
  const el = btns.find(x => x.textContent.trim() === lbl);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  // Off-viewport entirely → unreachable without scrolling, which is the bug.
  if (cy < 0 || cy > window.innerHeight || cx < 0 || cx > window.innerWidth) {
    return { found: true, onScreen: false, hit: false, top: r.top, vh: window.innerHeight };
  }
  const at = document.elementFromPoint(cx, cy);
  return { found: true, onScreen: true, hit: !!(at && (at === el || el.contains(at) || at.contains(el))),
    top: r.top, vh: window.innerHeight };
}, label);

// 428x926 iPhone; 820x1180 iPad portrait (the reported device, in iPhone compat the app is narrower
// but this is the stricter native-iPad case); 375x480 and 390x420 stand in for "keyboard is open
// and has eaten the bottom half".
for (const [name, vp] of [
  ["iphone-428x926", { width: 428, height: 926 }],
  ["ipad-820x1180", { width: 820, height: 1180 }],
  ["cramped-375x480", { width: 375, height: 480 }],
  ["keyboard-390x420", { width: 390, height: 420 }],
]) {
  const pg = await b.newPage({ viewport: vp, deviceScaleFactor: 2 });
  pg.setDefaultTimeout(4000);
  await pg.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await pg.route("**/rest/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await pg.goto("http://127.0.0.1:8199/", { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);

  // Welcome → Create an account. Reached the way a user does, not by seeding state: the bug was
  // about what a real arrival at this screen looks like.
  await pg.evaluate(() => {
    const el = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "Create an account");
    if (el) el.click();
  });
  await pg.waitForTimeout(700);

  // Fixture check — "button not found" is also what a crashed render returns.
  const heading = await pg.evaluate(() => document.querySelector("h1")?.textContent?.trim() || "");
  check(`${name}: signup form actually rendered`, /create your account/i.test(heading), JSON.stringify(heading));

  // THE REJECTION CONDITION ITSELF: no scrolling has happened, and none is required.
  const toggle = await hitTest(pg, "Sign in");
  check(`${name}: header "Sign in" toggle exists`, toggle.found);
  check(`${name}: header toggle is on screen with NO scrolling`, toggle.onScreen === true,
    `top=${toggle.top} viewportH=${toggle.vh}`);
  check(`${name}: header toggle is hit-testable (not covered)`, toggle.hit === true, JSON.stringify(toggle));

  // Reachability is worthless if the control is inert — prove it actually switches mode.
  await pg.evaluate(() => {
    const el = [...document.querySelectorAll("button")].find(x => x.textContent.trim() === "Sign in");
    if (el) el.click();
  });
  await pg.waitForTimeout(400);
  const after = await pg.evaluate(() => document.querySelector("h1")?.textContent?.trim() || "");
  check(`${name}: tapping it switches to sign-in`, /welcome back/i.test(after), JSON.stringify(after));

  // And back the other way, so a user who lands on sign-in can still reach sign-up.
  const back = await hitTest(pg, "Sign up");
  check(`${name}: reverse "Sign up" toggle also reachable`, back.found && back.onScreen && back.hit, JSON.stringify(back));

  await pg.screenshot({ path: `build/shot_authreach_${name}.png` });
  await pg.close();
}

await b.close();
console.log(fails ? `\n${fails} FAIL(S)` : "\nALL PASS");
process.exit(fails ? 1 : 0);
