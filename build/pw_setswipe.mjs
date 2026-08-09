// THE SIM PROVES THE FALLBACK; ONLY A REAL BROWSER PROVES THE MEASUREMENT.
//
// `deleteSwipeThreshold(width)` is `max(70, round(width/3))` with a `|| 380` fallback, and jsdom
// reports width 0 for every element — so `sim_setswipe` exercises `deleteSwipeThreshold(0)` = 127px
// and nothing else. The one genuinely new mechanic in the commit that introduced it ("measure the
// ROW at gesture start rather than assuming a width") is the one thing that sim cannot see: point
// the ref at the wrong node, measure `window.innerWidth`, measure a collapsed parent — it stays
// green. An audit found exactly that gap. This pins the measured values in a rendered browser:
// 400px row -> 133px, and the delete must fire just past it and not just under it.
//
// It also pins the thing the same audit found broken: the red hint used to saturate at 0.75x the
// threshold, so 33px of travel looked fully committed and deleted nothing.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

// SEED THE REAL SHAPE: every path in the app stamps `id: uid()` on a set and an exercise, and the
// delete matches on those ids. A fixture without them made ONE swipe wipe all 6 rows — which looked
// like a catastrophic app bug and was the fixture being unrealistic. `ID_LESS` below deliberately
// keeps the unrealistic shape, to pin the fallback that now covers it.
let _n = 0; const uid = () => `u${++_n}`;
const S = n => Array.from({ length: n }, () => ({ id: uid(), weight: "135", reps: "8", done: false, type: "normal" }));
const SESSION = { dayName: "Push A", unit: "lbs", exercises: [
  { id: uid(), name: "Barbell Bench Press", reps: "5-8", sets: S(5) },
  { id: uid(), name: "Overhead Press",      reps: "5-8", sets: S(1) },   // one set => swipe-delete is OFF
] };
const ID_LESS = { dayName: "Push A", unit: "lbs", exercises: [
  { name: "Barbell Bench Press", reps: "5-8",
    sets: Array.from({ length: 4 }, () => ({ weight: "135", reps: "8", done: false, type: "normal" })) },
] };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
async function newPage(sess) {
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);
await page.addInitScript(([me, s]) => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: "dark", unit: "lbs",
    programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
    profile: { username: "momo", name: "Mo" }, users: [] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
  localStorage.setItem("seshd_active_session", JSON.stringify(s));
  localStorage.setItem("seshd_wstart", String(Date.now() - 6e5));
}, [ME, sess]);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "t", user: { id: ME } }) }));
await page.route("**/rest/v1/**", r => r.abort());
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
return page;
}
let page = await newPage(SESSION);

// `page.mouse` DOES NOT FIRE TOUCH HANDLERS — a swipe check written with it once "passed" against
// a screenshot of a screen that had not moved. Dispatch real TouchEvents, and note that onTouchEnd
// reads the last touchMOVE, so the release must happen AT the distance under test.
//
// FRAMES MUST BE SPACED IN REAL TIME. The gesture commits one setState on its first frame (to flip
// the CSS transition off) and only then starts writing transforms straight to the node. Firing
// every touchmove inside ONE page.evaluate gives React no tick to flush that, so the direct-write
// path never engages and the row reports 0px of travel — which the first draft of this file read
// as "the clamp works". Await between frames.
//
// A SetRow is a wrapper `[data-no-tab-swipe]` holding [green hint, red hint (ONLY when the row is
// deletable), content]. The transform lives on the content node, so measuring the wrapper also
// reports 0px for every swipe.
async function swipe(nth, dist, steps = 12) {
  await page.evaluate(nth => {
    const w = document.querySelectorAll("[data-no-tab-swipe]")[nth];
    const el = w?.lastElementChild;
    if (!el) { window.__bad = true; return; }
    const r = el.getBoundingClientRect();
    window.__bad = false; window.__w = w; window.__el = el;
    window.__y = r.top + r.height / 2; window.__x = r.left + r.width - 12; window.__rw = r.width;
    window.__T = (t, cx) => { const tt = new Touch({ identifier: 1, target: el, clientX: cx, clientY: window.__y });
      return new TouchEvent(t, { bubbles: true, cancelable: true,
        touches: t === "touchend" ? [] : [tt], targetTouches: t === "touchend" ? [] : [tt], changedTouches: [tt] }); };
  }, nth);
  if (await page.evaluate(() => window.__bad)) return { err: "no node" };
  await page.evaluate(() => window.__el.dispatchEvent(window.__T("touchstart", window.__x)));
  for (let i = 1; i <= steps; i++) {
    await page.evaluate(d => window.__el.dispatchEvent(window.__T("touchmove", window.__x - d)), (dist * i) / steps);
    await page.waitForTimeout(18);
  }
  await page.waitForTimeout(140);   // let the 0.08s hint transition settle before reading it
  const held = await page.evaluate(() => {
    const hint = [...window.__w.children].find(c => getComputedStyle(c).backgroundColor.startsWith("rgba(239, 68, 68"));
    return { tf: getComputedStyle(window.__el).transform,
             op: hint ? parseFloat(getComputedStyle(hint).opacity) : null, rw: window.__rw };
  });
  await page.evaluate(d => window.__el.dispatchEvent(window.__T("touchend", window.__x - d)), dist);
  return { ...held, moved: Math.abs(parseFloat((held.tf || "").split(",")[4] || "0")) };
}

const countRows = () => page.evaluate(() => document.querySelectorAll("[data-no-tab-swipe]").length);

const geom = await page.evaluate(() => {
  const el = document.querySelectorAll("[data-no-tab-swipe]")[0]?.lastElementChild;
  return { n: document.querySelectorAll("[data-no-tab-swipe]").length, w: el?.getBoundingClientRect().width };
});
console.log(`  ${geom.n} swipeable rows, first is ${Math.round(geom.w)}px wide`);
check("the fixture rendered swipeable set rows", geom.n >= 5 && geom.w > 300, JSON.stringify(geom));

// THE MEASUREMENT ITSELF. A 400px row must want ~133px, NOT the sim's 127px fallback and NOT a
// viewport-derived 143px. Anything outside a couple of px means the wrong node is being measured.
const want = Math.max(70, Math.round(geom.w / 3));
console.log(`  measured row ${Math.round(geom.w)}px -> threshold should be ${want}px`);
check("the threshold is a third of the ROW, not of the viewport",
  Math.abs(want - Math.round(geom.w / 3)) <= 1 && want !== Math.round(428 / 3), String(want));

const before = await countRows();
// CONTROL: the same helper must actually move a deletable row, or every "did not delete" below is
// meaningless. This is the assertion the first draft lacked.
const ctl = await swipe(0, want - 8);
check("the swipe helper actually drags the row", ctl.moved > want - 20, `moved ${Math.round(ctl.moved)}px`);
await page.waitForTimeout(450);
const afterUnder = await countRows();
check("just UNDER the threshold does not delete", afterUnder === before, `${before} -> ${afterUnder}`);

await swipe(0, want + 12);
await page.waitForTimeout(600);
const afterOver = await countRows();
check("just OVER the threshold does delete", afterOver === before - 1, `${before} -> ${afterOver}`);

// THE HINT MUST NOT LIE. At 75% of the threshold the row must NOT already be solid red — that was
// a 33px band that looked fully armed and did nothing.
const r75 = await swipe(0, Math.round(want * 0.75));
await page.waitForTimeout(400);
console.log(`  hint opacity at 75% of the throw: ${r75.op}`);
check("the row is not fully red before the commit point", r75.op !== null && parseFloat(r75.op) < 0.95, String(r75.op));

// A ROW THAT CANNOT BE DELETED MUST NOT OFFER THE LONG THROW. The last exercise has one set, so
// swipe-delete is deliberately off; it used to slide 173px over bare background and spring back.
const rows = await countRows();
const single = await swipe(rows - 1, 170);
const px = single.moved;
console.log(`  one-set row dragged 170px -> actually moved ${Math.round(px)}px`);
check("a row with no delete barely moves instead of sliding off the card", px <= 30, `${Math.round(px)}px`);

// A SESSION WITH NO SET IDS MUST DELETE ONE ROW, NOT ALL OF THEM.
// This needs a SECOND PAGE, not a reload: addInitScript re-runs on every navigation, so writing
// the new session into localStorage and reloading just re-seeds the original one over the top.
// The first version of this check did exactly that and silently re-tested the id-full path — it
// printed a confident PASS about a fixture that had never loaded.
await page.close();
page = await newPage(ID_LESS);
const idlessBefore = await countRows();
check("the id-less fixture rendered", idlessBefore === 4, `${idlessBefore} rows (want 4)`);
await swipe(0, 150);
await page.waitForTimeout(600);
const idlessAfter = await countRows();
console.log(`  id-less session: ${idlessBefore} rows -> ${idlessAfter} after one delete swipe`);
check("an id-less session loses exactly one set, not the whole exercise",
  idlessAfter === idlessBefore - 1, `${idlessBefore} -> ${idlessAfter}`);

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
