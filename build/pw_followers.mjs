// The followers/following sheet must cover the whole screen, not part of it.
//
// It's a `position:fixed; inset:0` backdrop, which is supposed to resolve against the VIEWPORT.
// Moving the profile into an in-shell overlay put it inside EdgeSwipeBack, which carries
// `will-change: transform` — and will-change:transform makes an element a containing block for
// fixed-position descendants exactly like a real transform does. So the backdrop started resolving
// against that panel instead of the viewport: it covered only part of the height and the profile
// showed through underneath, still scrollable.
import { chromium } from "playwright-core";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(5000);

const ME = "u1", THEM = "u2";
await page.addInitScript(([me, them]) => {
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, unit: "lbs", programs: [], history: {}, prEvents: [], bodyLog: [],
    profile: { username: "momo", name: "Mo" },
    users: [
      { id: me, username: "momo", name: "Mo", following: [them], followers: [them] },
      { id: them, username: "maya_lifts", name: "Maya Chen", followers: [me], following: [me] },
    ],
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, [ME, THEM]);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));
await page.route("**/rest/v1/**", r => r.abort());

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

await page.goto("http://127.0.0.1:8199/", { waitUntil: "load", timeout: 20000 });
await page.waitForTimeout(1300);
await page.waitForTimeout(5500); // let the "couldn't load" toast clear off the nav

// Profile tab (4th of 4 in the floating nav), then the Followers stat.
await page.mouse.click(363, 869);
await page.waitForTimeout(900);
await page.getByText(/Follower/).first().click();
await page.waitForTimeout(700);
await page.screenshot({ path: "build/shot_followers.png" });

const m = await page.evaluate(() => {
  const back = [...document.querySelectorAll("div")].find(d =>
    /rgba\(0, 0, 0, 0\.6\)/.test(d.style.background || "") && d.style.position === "fixed");
  if (!back) return null;
  const r = back.getBoundingClientRect();
  return { top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width),
           vh: innerHeight, vw: innerWidth,
           parentWillChange: getComputedStyle(back.parentElement).willChange,
           inBody: back.parentElement === document.body };
});
console.log("BACKDROP:", JSON.stringify(m));
check("the followers sheet is open", !!m);
check("its backdrop covers the full viewport height",
  m && m.height >= m.vh - 1 && m.top <= 0.5, JSON.stringify(m));
check("...and the full width", m && m.width >= m.vw - 1, JSON.stringify(m));

// Nothing behind it should be reachable: the profile must not scroll while the sheet is up.
const scrolled = await page.evaluate(async () => {
  const sc = [...document.querySelectorAll("div")].find(d => d.scrollHeight > d.clientHeight + 40 &&
    /auto|scroll/.test(getComputedStyle(d).overflowY) && !d.closest('[style*="rgba(0, 0, 0, 0.6)"]'));
  if (!sc) return { found: false };
  const before = sc.scrollTop;
  sc.dispatchEvent(new WheelEvent("wheel", { deltaY: 300, bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  return { found: true, before, after: sc.scrollTop };
});
console.log("BEHIND-SCROLL:", JSON.stringify(scrolled));

// The dim area must not initiate a scroll, and the list must not chain its overscroll to the
// screen behind when it hits either end.
const containment = await page.evaluate(() => {
  const back = [...document.querySelectorAll("div")].find(d =>
    /rgba\(0, 0, 0, 0\.6\)/.test(d.style.background || "") && d.style.position === "fixed");
  const list = back?.querySelector('[style*="overflow-y: auto"], [style*="overflowY"]')
    || [...(back?.querySelectorAll("div") || [])].find(d => /auto|scroll/.test(getComputedStyle(d).overflowY));
  return { backdropTouchAction: back ? getComputedStyle(back).touchAction : null,
           listOverscroll: list ? getComputedStyle(list).overscrollBehavior : null };
});
console.log("CONTAINMENT:", JSON.stringify(containment));
check("the dimmed area can't start a scroll", containment.backdropTouchAction === "none", JSON.stringify(containment));
check("the list doesn't chain its overscroll to the screen behind",
  /contain/.test(containment.listOverscroll || ""), JSON.stringify(containment));
// PULL-TO-REFRESH. React bubbles events along the COMPONENT tree, so a drag inside the portaled
// sheet still reaches the profile's PullToRefresh handlers and pulled the page behind it. Drag
// down from inside the list and check the profile doesn't start refreshing.
const pulled = await page.evaluate(async () => {
  const card = [...document.querySelectorAll("div")].find(d => /Followers ·/.test(d.innerText || "") && d.style.borderRadius === "20px");
  const target = card || document.body;
  const r = target.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2), y0 = Math.round(r.top + 60);
  const fire = (type, y) => {
    const t = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: y });
    document.elementFromPoint(x, Math.min(y, innerHeight - 1))?.dispatchEvent(
      new TouchEvent(type, { touches: type === "touchend" ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
  };
  fire("touchstart", y0);
  for (let dy = 20; dy <= 200; dy += 20) { fire("touchmove", y0 + dy); await new Promise(r => setTimeout(r, 25)); }
  await new Promise(r => setTimeout(r, 120));
  // The pull writes translateY straight onto the refresh indicator / content nodes.
  const pulledNodes = [...document.querySelectorAll("div")]
    .map(d => d.style.transform).filter(t => /translateY\((?!0px)\d/.test(t || ""));
  fire("touchend", y0 + 200);
  return pulledNodes;
});
console.log("PULL BEHIND:", JSON.stringify(pulled));
check("dragging down inside the sheet does not pull-to-refresh the profile behind it",
  pulled.length === 0, JSON.stringify(pulled));

// NB: body.style.overflow is pinned "hidden" for the whole app by AppInner, so it says nothing
// about whether this sheet contains its scroll. What actually contains it is the backdrop covering
// the full viewport — asserted above — so that touches can't reach the profile at all.
// Tap the backdrop itself (its onClick closes the sheet); there are many "Close" buttons in the
// app and picking the wrong one silently does nothing.
await page.mouse.click(10, 10);
await page.waitForTimeout(500);
check("the sheet closes when its backdrop is tapped",
  await page.evaluate(() => ![...document.querySelectorAll("div")].some(d =>
    /rgba\(0, 0, 0, 0\.6\)/.test(d.style.background || "") && d.style.position === "fixed")));
check("the profile is still there underneath",
  await page.evaluate(() => /Workouts/.test(document.body.innerText)));

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
