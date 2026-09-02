// THE PUBLIC /u/ PAGE MUST NOT PUBLISH A FINISH TIMESTAMP.
// workout_history carries created_at (the exact finish instant) and duration_secs; subtracting
// one from the other gives the arrival time of every session, and a handful of sessions gives a
// weekly absence window readable by anyone holding the public anon key. The table is now
// owner+accepted-follower only and this page reads the column-limited `public_workouts` view.
//
// This suite guards the CLIENT half. The RLS half is proven by role-sim (row counts), which no
// browser test can see; what a browser CAN see is which endpoint the page calls and what it asks
// for -- and a regression here would silently start requesting a table that returns [] , so the
// page would look "empty" rather than broken, which is exactly the failure nobody reports.
import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:8199";
const UID = "11111111-2222-3333-4444-555555555555";
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) fails++; };

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 428, height: 926 } });
page.setDefaultTimeout(4000);

const asked = [];
await page.route("**/rest/v1/**", async (route) => {
  const url = route.request().url();
  asked.push(url);
  if (url.includes("/public_profiles")) {
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify([{ id: UID, username: "lifter", name: "Test Lifter", bio: "bio", avatar_url: null }]) });
  }
  if (url.includes("/public_workouts")) {
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify([{ id: "w1", day_name: "Push A", unit: "lbs", workout_date: "2026-08-14",
        exercises: [{ name: "Bench", sets: [{ weight: "185", reps: "8", done: true, type: "normal" }] }] }]) });
  }
  // Anything else (notably workout_history) answers EMPTY, so a regression renders a blank
  // list rather than throwing -- which is why the endpoint assertions below carry the real signal.
  return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
});

await page.goto(`${BASE}/#/u/${UID}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => /RECENT WORKOUTS|isn't available|not found/i.test(document.body.innerText), null, { timeout: 6000 }).catch(() => {});
const text = await page.evaluate(() => document.body.innerText);

const wq = asked.find(u => u.includes("/public_workouts"));
check(!!wq, "the page queries public_workouts");
check(!asked.some(u => u.includes("/workout_history")), "it does NOT query workout_history (the table strangers can no longer read)");
if (wq) {
  check(!/created_at/.test(wq), `the request asks for no created_at (${wq.split("?")[1] || ""})`);
  check(!/duration_secs|hr_summary/.test(wq), "the request asks for no duration_secs / hr_summary");
  check(/order=workout_date/.test(wq), "it orders by workout_date, not a timestamp");
}
check(/Test Lifter|@lifter/.test(text), "the profile still renders (fixture reached the screen)");
check(/RECENT WORKOUTS/.test(text), "the recent-workouts section still renders");
check(/Push A/.test(text), "the workout row renders its name");
check(/Aug 14/.test(text), "the workout row renders its DATE from workout_date alone");
// A day is all a stranger gets: no clock time may appear anywhere on the page.
check(!/\b\d{1,2}:\d{2}\b/.test(text), "no clock time (HH:MM) appears anywhere on the public page");

await browser.close();
console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
