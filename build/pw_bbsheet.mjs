// THE BODY BATTERY SHEET MUST NOT PUSH ITS OWN HEADER UNDER THE CLOCK.
//
// It is a BOTTOM-anchored sheet (align-items:flex-end). Once steps, active energy, HRV and resting
// HR were added to it the content grew past the viewport, and a bottom-anchored child taller than
// its container has its TOP pushed off-screen — the title and the score ended up behind the status
// bar. Same class as the align-items:center clipping in the conventions: fix the SHEET (cap it and
// let it scroll inside itself), never the content.
//
// env() insets are 0 in Chromium, so this measures the sheet's top edge against the viewport and
// checks it declares the inset, rather than trying to observe a real notch.
import { chromium } from "playwright-core";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);

const ME = "11111111-1111-4111-8111-111111111111";
await page.addInitScript((me) => {
  const now = Date.now();
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
    prEvents: [], bodyLog: [], prs: {}, posts: [], profile: { username: "momo", name: "Mo" },
    users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
    // Everything populated, so the sheet is at its TALLEST — that is the failing case.
    recovery: { recoveryScore: 0.42, sleepHours: 6.2, hrv: 31, hrvBaseline: 34, restingHr: 62,
                sleepStart: new Date(now - 14*36e5).toISOString(), sleepEnd: new Date(now - 8*36e5).toISOString() },
    activity: { date: new Date().toISOString().slice(0,10), steps: 8421, activeKcal: 512 },
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

await page.goto("http://127.0.0.1:8199/", { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => !/Setting up your account/.test(document.body.innerText), null, { timeout: 15000 }).catch(()=>{});
await page.waitForTimeout(1800);

await page.mouse.click(363, 869);          // Profile tab
await page.waitForTimeout(1600);
const card = page.getByText("BODY BATTERY", { exact: false }).first();
check("the Body Battery card is on the profile", await card.count() > 0);
await card.click();
await page.waitForTimeout(1000);
await page.screenshot({ path: "build/shot_bbsheet.png" });

const m = await page.evaluate(() => {
  const back = [...document.querySelectorAll("div")].find(d =>
    d.style.position === "fixed" && /rgba\(0, 0, 0, 0\.6\)/.test(d.style.background || "") &&
    /Body Battery/i.test(d.innerText || ""));
  if (!back) return null;
  const sheet = back.firstElementChild;
  const r = sheet.getBoundingClientRect();
  const cs = getComputedStyle(sheet);
  const title = [...sheet.querySelectorAll("span")].find(s => /^Body Battery$/i.test(s.textContent.trim()));
  return {
    sheetTop: Math.round(r.top), sheetBottom: Math.round(r.bottom), vh: innerHeight,
    // The scroll may live on the panel itself OR, when the sheet carries a drag handle, on an
    // inner wrapper — Sheet moves it there deliberately, because a handle inside a momentum
    // scroller is claimed by iOS before any JS runs. Assert that SOMETHING in the sheet scrolls,
    // not that one particular node does; nothing scrolling is still a failure.
    overflowY: cs.overflowY,
    scrollsSomewhere: [sheet, ...sheet.querySelectorAll("*")].some(el => {
      const oy = getComputedStyle(el).overflowY;
      return oy === "auto" || oy === "scroll";
    }),
    declaresTopInset: /safe-area-inset-top/.test(sheet.getAttribute("style") || ""),
    titleTop: title ? Math.round(title.getBoundingClientRect().top) : null,
  };
});
console.log("SHEET:", JSON.stringify(m));

check("the sheet is open", !!m);
check("its top edge stays on screen (header not pushed above the viewport)",
  m && m.sheetTop >= 0, JSON.stringify(m));
check("the title is visible, not off the top", m && m.titleTop !== null && m.titleTop >= 0, JSON.stringify(m));
check("the sheet reserves the status-bar inset in its own height",
  m && m.declaresTopInset, JSON.stringify(m));
check("over-tall content scrolls INSIDE the sheet rather than overflowing it",
  m && m.scrollsSomewhere, JSON.stringify(m));
check("it still sits on the bottom edge (it is a bottom sheet)",
  m && Math.abs(m.sheetBottom - m.vh) <= 1, JSON.stringify(m));

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
