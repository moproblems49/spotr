// A WORKOUT MUST NOT STRAND YOU ON THE TRACKER TAB.
//
// The declutter pass hid the top bar AND the bottom nav while a workout was in progress
// (`workoutActive && tab === "tracker"`), leaving the tab SWIPE as the only way off the screen.
// This suite was written to prove that escape route held — and it did, from y=500, which is where
// it happened to swipe. It does not hold everywhere: `handleSwipeStart` bails on anything inside
// `[data-no-tab-swipe]`, which is every SetRow, so on a real 6-exercise session 61% of the screen
// height silently refused to start a gesture. Mo reported that as the swipe feeling "laggy".
//
// The nav is visible during a workout now (the exercise scroller already padded by NAV_CLEARANCE
// the whole time, so it was never actually covering set rows). The TOP bar stays hidden — the
// workout has its own header — so that half of the declutter is still asserted here.
//
// The flag lives in AppInner but is driven by an effect inside WorkoutTracker — and the swipe track
// UNMOUNTS the non-current tab, so the flag has to survive an unmount/remount cycle correctly.
import { chromium } from "playwright-core";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);

const ME = "11111111-1111-4111-8111-111111111111";
await page.addInitScript((me) => {
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
    prEvents: [], bodyLog: [], prs: {}, posts: [], profile: { username: "momo", name: "Mo" },
    users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, ME);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));
await page.route("**/rest/v1/**", r => {
  const u = r.request().url();
  const body = /\/rest\/v1\/(profiles|public_profiles)\?/.test(u)
    ? JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }])
    : "[]";
  r.fulfill({ status: 200, contentType: "application/json", body });
});

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

// The floating nav is the container holding the four aria-labelled tab buttons.
const navVisible = () => page.evaluate(() => {
  const btn = [...document.querySelectorAll('button[aria-label]')]
    .find(b => ["Home","Tracker","Discover","Profile"].includes(b.getAttribute("aria-label")));
  if (!btn) return false;
  const r = btn.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom <= innerHeight + 1;
});
const inWorkout = () => page.evaluate(() => /Finish/.test(document.body.innerText));
// The top bar is the piece still hidden during a workout. Read it by its wordmark.
const topBarVisible = () => page.evaluate(() => /SESHD/.test(document.body.innerText));
// Horizontal swipe on the tab track.
const swipe = async (fromX, toX) => {
  await page.evaluate(async ([x0, x1]) => {
    const y = 500;
    const el = document.elementFromPoint(x0, y);
    const t = (cx) => new Touch({ identifier: 1, target: el, clientX: cx, clientY: y });
    el.dispatchEvent(new TouchEvent("touchstart", { touches: [t(x0)], changedTouches: [t(x0)], bubbles: true, cancelable: true }));
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const cx = x0 + (x1 - x0) * (i / steps);
      el.dispatchEvent(new TouchEvent("touchmove", { touches: [t(cx)], changedTouches: [t(cx)], bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 16));
    }
    el.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [t(x1)], bubbles: true, cancelable: true }));
  }, [fromX, toX]);
  await page.waitForTimeout(900);
};

await page.goto("http://127.0.0.1:8199/", { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => !/Setting up your account/.test(document.body.innerText), null, { timeout: 15000 }).catch(()=>{});
await page.waitForTimeout(1800);

check("the nav is visible before a workout starts", await navVisible());
check("the top bar is visible before a workout starts", await topBarVisible());

await page.getByText("Quick Start", { exact: false }).first().click();
await page.waitForTimeout(1200);
check("a workout is running", await inWorkout());
check("the nav STAYS VISIBLE during a workout — it is the reliable way off the tab", await navVisible());
// The top bar STAYS now. It is an in-flow flex child above the swipe track, so hiding it per-tab
// made the incoming panel of every swipe 47px too tall for the whole gesture (95px on a notched
// phone) and snapped on commit. The workout header stopped claiming the status-bar inset in the
// same change, so there is still exactly one owner.
check("the top bar STAYS VISIBLE during a workout — the shell must not change shape per tab", await topBarVisible());
await page.screenshot({ path: "build/shot_chrome_inworkout.png" });

// ESCAPE ROUTE 1: the tab swipe must still work with no nav on screen.
await swipe(360, 60);
const leftBySwipe = !(await inWorkout());
check("the tab swipe still works from a swipeable part of the screen", leftBySwipe,
  leftBySwipe ? "" : "still on the workout screen");
check("the nav is on another tab too", await navVisible());
check("the top bar comes back on another tab", await topBarVisible());
const trackH = () => page.evaluate(() => {
  const t = [...document.querySelectorAll("div")].find(d => d.style.width === "300%");
  return t ? Math.round(t.getBoundingClientRect().height) : null;
});
const hAway = await trackH();
await page.screenshot({ path: "build/shot_chrome_othertab.png" });

// ESCAPE ROUTE 2: navigate back to the tracker — the workout must still be there and the nav hide
// again (the tracker panel was unmounted while away, so this exercises remount).
await page.mouse.click(164, 869);
await page.waitForTimeout(1400);
check("the workout survived leaving and returning", await inWorkout());
check("the nav is still there on return", await navVisible());
check("the top bar is still there on return", await topBarVisible());
const hBack = await trackH();
check("the swipe track is the same height on the tracker as on the other tab",
  hAway != null && hAway === hBack, `other ${hAway} vs tracker ${hBack}`);

// ESCAPE ROUTE 3: Discard restores the chrome. It confirms first now (destroying a logged session
// used to happen on the first tap), so the sheet has to be answered.
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => /^(discard|cancel)$/i.test((x.textContent||"").trim()));
  b && b.click();
});
await page.waitForTimeout(700);
check("Discard asks before destroying the session", /discard this workout\?/i.test(await page.evaluate(() => document.body.innerText)));
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => /^discard workout$/i.test((x.textContent||"").trim()));
  b && b.click();
});
await page.waitForTimeout(1200);
check("confirming ends the workout", !(await inWorkout()));
check("the nav is still there after discarding", await navVisible());
await page.screenshot({ path: "build/shot_chrome_after.png" });

// And the top bar must be back too (it is hidden by the same condition).
check("the top bar is restored as well", await topBarVisible());

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
