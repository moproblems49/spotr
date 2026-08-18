// Mo: "during a workout, can we make where the top scrolls up while we scroll down, but shows
// again if we scroll the other way." The header (Discard/timer/Finish + the sets/volume/tools row)
// now collapses via max-height on scroll-down and reopens on scroll-up, with a floor: scrolled back
// near the top of the exercise list, it is ALWAYS visible regardless of the last motion's direction
// (never leave a lifter unable to see Discard/Finish at the one moment they're most likely to want
// them). One state flip per direction CHANGE, not per scroll pixel — see the comment beside
// topBarHidden in WorkoutTracker for why, and the gesture-perf house-style note in CLAUDE.md this
// follows (PullToRefresh, SetRow swipe: setState on threshold-cross only).
//
// Drives the REAL running app: starts a live workout with enough exercises to actually scroll.
import { chromium } from "playwright-core";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const EXS = ["Barbell Bench Press","Incline DB Press","Machine Chest Press","Cable Fly (Low-to-High)",
  "Lateral Raises (DB)","Tricep Rope Pushdown","Barbell Back Squat","Leg Press","Romanian Deadlift",
  "Seated Leg Curl","Standing Calf Raise (Machine)"];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(6000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0,160)); });

await page.addInitScript(([me, exs]) => {
  const sess = { id: "live1", dayName: "Push A", exercises: exs.map((name,i) => ({
    id: "ex"+i, name, sets: [{ weight:"135", reps:"8", done:false, type:"working" }] })) };
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
    programs: [], history: {}, workoutDates: {}, weeklyTarget:3, bodyLog: [], prs: {}, prEvents: [],
    posts: [], profile: { username:"momo", name:"Mo" },
    users: [{ id: me, username:"momo", name:"Mo", followers: [], following: [] }] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
  localStorage.setItem("seshd_active_session", JSON.stringify(sess));
  localStorage.setItem("seshd_wstart", String(Date.now() - 600000));
}, [ME, EXS]);
await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
  body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
await page.route("**/rest/v1/**", r => r.abort());
await page.goto(`http://127.0.0.1:${process.env.PORT || 8199}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

const body = await page.evaluate(() => document.body.innerText);
check("0. the live workout screen is up", /Discard/.test(body) && /Push A/.test(body),
  body.slice(0,120).replace(/\n/g," | "));

async function scrollTo(y) {
  await page.evaluate(target => {
    const scroller = [...document.querySelectorAll("div")].find(d => {
      const cs = getComputedStyle(d);
      return cs.overflowY === "auto" && d.scrollHeight > d.clientHeight + 40;
    });
    if (scroller) { scroller.scrollTop = target; scroller.dispatchEvent(new Event("scroll", { bubbles:true })); }
  }, y);
  // The collapse/expand is a CSS max-height transition (280ms). Read AFTER it settles, not
  // mid-transition — a mid-transition value is neither the open nor closed endpoint.
  await page.waitForTimeout(400);
}
async function readWrapMaxH() {
  return page.evaluate(() => {
    const discard = [...document.querySelectorAll("button")].find(b => (b.textContent||"").trim() === "Discard");
    let wrap = discard, hops = 0;
    while (wrap && getComputedStyle(wrap).maxHeight === "none" && hops < 8) { wrap = wrap.parentElement; hops++; }
    return wrap ? getComputedStyle(wrap).maxHeight : null;
  });
}
const closed = h => parseFloat(h) < 2;   // 0px, allowing for sub-pixel rounding
const open   = h => parseFloat(h) > 80;  // real header content is >100px; 80 leaves margin

const info0 = await page.evaluate(() => {
  const scroller = [...document.querySelectorAll("div")].find(d => {
    const cs = getComputedStyle(d);
    return cs.overflowY === "auto" && d.scrollHeight > d.clientHeight + 40;
  });
  return { scrollerFound: !!scroller, scrollH: scroller?.scrollHeight, clientH: scroller?.clientHeight };
});
check("1. the exercises scroller is actually scrollable (fixture has enough rows)",
  info0.scrollerFound && info0.scrollH > info0.clientH + 40, JSON.stringify(info0));

const openH = await readWrapMaxH();
check("2. header starts open", open(openH), `got ${openH}`);

await scrollTo(20); await scrollTo(60); await scrollTo(140);
check("3. scrolling down collapses the header", closed(await readWrapMaxH()));

await scrollTo(90); await scrollTo(40);
check("4. scrolling back up reopens the header", open(await readWrapMaxH()));

await scrollTo(140);
check("5. scrolling down again re-collapses it", closed(await readWrapMaxH()));

await scrollTo(5);
check("6. at the top of the list the header is ALWAYS visible, regardless of the last motion",
  open(await readWrapMaxH()));

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
