// A horizontal drag inside the program editor must NOT reach the tab swipe.
//
// Mo hit this dragging an exercise to reorder: the app appeared to zoom in and slid to another
// tab. The zoom wasn't zoom. The editor is a `position:fixed` full-screen overlay rendered INSIDE
// the tab-swipe track, and a fixed element inside a TRANSFORMED ancestor resolves against that
// ancestor — so the moment the track took a transform, `right:0` meant the right edge of the
// 3-panel track and the overlay stretched to three screen widths. Everything looked scaled up and
// cut off, and the tab underneath was showing through the gap.
//
// These checks pin: the track never moves from a drag inside the editor, and the overlay keeps its
// own width while a drag is in flight.
import { chromium } from "playwright-core";

const PROG = {
  id: "prog-1", name: "No Mercy PPL",
  days: [{ id: "day-1", name: "Pull A", exercises: [
    { name: "Deadlift", sets: 3, reps: "8-12", rest: "180" },
    { name: "Lat Pulldown (Wide)", sets: 4, reps: "10-12" },
    { name: "Seated Cable Row (Wide)", sets: 3, reps: "5-7" },
  ] }],
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(5000);
await page.addInitScript(([prog]) => {
  localStorage.setItem("seshd_v1", JSON.stringify({ programs: [prog], activeProgramId: "prog-1", history: {}, prEvents: [], bodyLog: [], profile: { username: "momo", name: "Mo" }, unit: "lbs" }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: "u1", email: "mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, [PROG]);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: "u1", email: "mo@example.com" } }) }));
await page.route("**/rest/v1/**", r => r.abort());

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

await page.goto("http://127.0.0.1:8199/", { waitUntil: "load", timeout: 20000 });
await page.waitForTimeout(1300);
await page.getByText("1 days · 3 exercises").click();
await page.waitForTimeout(800);

const overlay = () => page.evaluate(() => {
  const o = document.querySelector('[data-fullscreen-overlay]');
  const track = [...document.querySelectorAll("div")].find(d => /translateX/.test(d.style.transform || "") && d.children.length === 3);
  return { overlayW: o ? Math.round(o.getBoundingClientRect().width) : null,
           trackTransform: track ? track.style.transform : "none" };
});

const before = await overlay();
console.log("BEFORE:", JSON.stringify(before), "viewport", page.viewportSize().width);
check("the editor overlay is one screen wide to start with",
  before.overlayW !== null && before.overlayW <= 480, JSON.stringify(before));

// Drag sideways from the middle of an exercise card, exactly as a reorder drag wanders.
const card = await page.getByText("Lat Pulldown (Wide)").first().boundingBox();
const mid = await page.evaluate(async ([x, y]) => {
  const fire = (type, cx, cy) => {
    const t = new Touch({ identifier: 1, target: document.body, clientX: cx, clientY: cy });
    document.elementFromPoint(Math.max(1, Math.min(cx, innerWidth - 1)), cy)?.dispatchEvent(
      new TouchEvent(type, { touches: type === "touchend" ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
  };
  fire("touchstart", x, y);
  for (let dx = 20; dx <= 160; dx += 20) { fire("touchmove", x - dx, y); await new Promise(r => setTimeout(r, 25)); }
  await new Promise(r => setTimeout(r, 100));
  const o = document.querySelector('[data-fullscreen-overlay]');
  const track = [...document.querySelectorAll("div")].find(d => /translateX/.test(d.style.transform || "") && d.children.length === 3);
  const out = { overlayW: o ? Math.round(o.getBoundingClientRect().width) : null,
                trackTransform: track ? track.style.transform : "none" };
  fire("touchend", x - 160, y);
  return out;
}, [card.x + card.width / 2, card.y + card.height / 2]);

console.log("MID-DRAG:", JSON.stringify(mid));
check("the tab track does not move from a drag inside the editor",
  mid.trackTransform === "none" || /translateX\(0/.test(mid.trackTransform), mid.trackTransform);
check("the editor overlay keeps its own width mid-drag (no 3x blow-up)",
  mid.overlayW !== null && mid.overlayW <= 480, JSON.stringify(mid));

await page.waitForTimeout(500);
await page.screenshot({ path: "build/shot_editordrag.png" });
const after = await overlay();
console.log("AFTER:", JSON.stringify(after));
check("still on the editor afterwards, at normal size",
  after.overlayW !== null && after.overlayW <= 480, JSON.stringify(after));
check("the editor is still the screen showing",
  await page.getByText("Lat Pulldown (Wide)").count() > 0);

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
