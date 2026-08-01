// HIDING THE NAV DURING A WORKOUT MUST NOT STRAND YOU.
//
// The declutter pass hides the top bar AND the bottom nav while a workout is in progress on the
// tracker tab (`workoutActive && tab === "tracker"`). That removes the app's primary navigation, so
// the escape routes have to be proven, not assumed: the tab swipe still works, the nav comes back
// on any other tab, it hides again on return, and Cancel/Finish restore it.
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

await page.getByText("Quick Start", { exact: false }).first().click();
await page.waitForTimeout(1200);
check("a workout is running", await inWorkout());
check("the nav hides during a workout", !(await navVisible()));
await page.screenshot({ path: "build/shot_chrome_inworkout.png" });

// ESCAPE ROUTE 1: the tab swipe must still work with no nav on screen.
await swipe(360, 60);
const leftBySwipe = !(await inWorkout());
check("you can SWIPE off the workout screen even with the nav hidden", leftBySwipe,
  leftBySwipe ? "" : "still on the workout screen — this would strand the user");
check("the nav comes back on another tab", await navVisible());
await page.screenshot({ path: "build/shot_chrome_othertab.png" });

// ESCAPE ROUTE 2: navigate back to the tracker — the workout must still be there and the nav hide
// again (the tracker panel was unmounted while away, so this exercises remount).
await page.mouse.click(164, 869);
await page.waitForTimeout(1400);
check("the workout survived leaving and returning", await inWorkout());
check("the nav hides again on return", !(await navVisible()));

// ESCAPE ROUTE 3: Cancel restores the chrome.
page.once("dialog", d => d.accept());
await page.getByText("Cancel", { exact: true }).first().click();
await page.waitForTimeout(1200);
check("Cancel ends the workout", !(await inWorkout()));
check("the nav is restored after cancelling", await navVisible());
await page.screenshot({ path: "build/shot_chrome_after.png" });

// And the top bar must be back too (it is hidden by the same condition).
check("the top bar is restored as well",
  await page.evaluate(() => /SESHD/.test(document.body.innerText)));

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
