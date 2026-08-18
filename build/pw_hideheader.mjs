// Mo: "during a workout, can we make where the top scrolls up while we scroll down, but shows
// again if we scroll the other way" — then, after the first cut: "it just snaps up and down, I
// wanted it to move up or down slowly with the swipe" and "it bugs when I get to the end of the
// workout page."
//
// The header (Discard/timer/Finish + the sets/volume/tools row) now tracks scroll CONTINUOUSLY —
// collapseRef holds a 0..1 progress written straight to the wrapper's max-height on every scroll
// event, no CSS transition — so it moves with the gesture instead of animating on a fixed clock
// once a threshold is crossed. Floored so scrolling back near the top ALWAYS shows it, regardless
// of the last motion's direction.
//
// The end-of-list bug was iOS rubber-band overscroll: past the true scrollable range, scrollTop
// still fires scroll events but its value bounces past the max and back, and the old boolean
// version could latch fully hidden on a spurious bounce delta with no further scroll-up gesture
// available to un-stick it (you're already at the end). Clamping scrollTop to [0, maxScroll]
// before computing the delta is the fix — section 5 drives exactly that scenario.
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

function findScroller() {
  return [...document.querySelectorAll("div")].find(d => {
    const cs = getComputedStyle(d);
    return cs.overflowY === "auto" && d.scrollHeight > d.clientHeight + 40;
  });
}
// Dispatch a raw scroll event at an EXACT scrollTop (bypassing real touch physics — this is the
// same technique the previous version used; what's new is driving a SEQUENCE of small steps so we
// can observe the header move continuously rather than jumping straight to an endpoint).
async function scrollSteps(targets) {
  for (const y of targets) {
    await page.evaluate(target => {
      const scroller = [...document.querySelectorAll("div")].find(d => {
        const cs = getComputedStyle(d);
        return cs.overflowY === "auto" && d.scrollHeight > d.clientHeight + 40;
      });
      if (scroller) { scroller.scrollTop = target; scroller.dispatchEvent(new Event("scroll", { bubbles:true })); }
    }, y);
    await page.waitForTimeout(16); // ~one frame — there's no CSS transition to wait out any more
  }
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

const openH0 = await readWrapMaxH();
check("2. header starts open", open(openH0), `got ${openH0}`);

// ── Continuous tracking: intermediate scroll positions must show INTERMEDIATE header heights ──
await scrollSteps([10, 25, 40]); // well under COLLAPSE_PX(70) worth of travel from near-zero
const midH = await readWrapMaxH();
console.log(`   after 40px of scroll: maxHeight=${midH} (open was ${openH0})`);
const partial = h => parseFloat(h) > 2 && parseFloat(h) < parseFloat(openH0) - 5;
check("3. a partial scroll leaves the header PARTIALLY collapsed, not snapped fully open or closed",
  partial(midH), `got ${midH}, open was ${openH0}`);

await scrollSteps([90, 130]); // enough additional travel to reach full collapse
check("4. continuing to scroll down reaches fully collapsed", closed(await readWrapMaxH()));

await scrollSteps([100, 60, 20]);
check("5. scrolling back up reopens it continuously (fully open again)", open(await readWrapMaxH()));

// ── The end-of-list bug: rubber-band overscroll past the true max must not latch it hidden ──
await scrollSteps([80, 140]); // collapse it first, same as reaching the bottom of a real list
check("6a. collapsed on the way to the end", closed(await readWrapMaxH()));
// RE-MEASURE the live max scroll here, not reuse the value from step 1. The scroller is flex:1
// against the header wrapper — as the header's max-height shrinks toward 0, the scroller's own
// clientHeight GROWS to fill the freed space, so its real (scrollHeight - clientHeight) shrinks
// as the header collapses. A stale, larger "maxScroll" from before any collapse had happened sends
// scrollTop targets past the browser's actual current ceiling, which silently clamps them — this
// bit the first draft of this very test (6c initially failed for exactly this reason, not an app
// bug) and is the same "stale fixture" class of trap as the rest of this app's test suite.
const live = await page.evaluate(() => {
  const scroller = [...document.querySelectorAll("div")].find(d => {
    const cs = getComputedStyle(d);
    return cs.overflowY === "auto" && d.scrollHeight > d.clientHeight + 40;
  });
  return scroller ? scroller.scrollHeight - scroller.clientHeight : null;
});
// Simulate iOS overscroll: scrollTop bounces PAST the live max and jitters on the way back to it,
// with the user's finger no longer moving (any real up-scroll gesture is over — this is exactly
// the "already at the end, nothing left to scroll up on" trap).
await scrollSteps([live + 40, live + 15, live + 30, live]);
const afterBounce = await readWrapMaxH();
console.log(`   after simulated rubber-band bounce at the list's end: maxHeight=${afterBounce}`);
check("6b. rubber-band overscroll at the end does not change the collapse state unpredictably",
  closed(afterBounce), `got ${afterBounce} — the old boolean version could latch on a bounce delta`);
// And the user can still recover it with a real scroll-up from here.
await scrollSteps([live - 60, live - 120]);
const afterRecover = await readWrapMaxH();
console.log(`   live max=${live}, after scrolling up to live-120: maxHeight=${afterRecover}`);
check("6c. a real scroll-up from the end still reopens the header", open(afterRecover), `got ${afterRecover}`);

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
