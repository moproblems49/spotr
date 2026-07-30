// Swiping back from someone's profile must reveal the screen underneath, not a black gap.
//
// The profile used to be an EARLY RETURN from AppInner, so while it was open the rest of the app
// wasn't rendered at all. Dragging it aside exposed the bare page background — solid black, where
// iOS shows the screen you're returning to. It's an overlay inside the shell now, so whatever was
// behind it stays mounted. This drives the real edge-swipe and samples the pixels it uncovers.
import { chromium } from "playwright-core";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(5000);

const ME = "u1", THEM = "u2";
await page.addInitScript(([me, them]) => {
  localStorage.setItem("seshd_v1", JSON.stringify({
    programs: [], history: {}, prEvents: [], bodyLog: [], unit: "lbs",
    profile: { username: "momo", name: "Mo" },
    users: [{ id: them, username: "maya_lifts", name: "Maya Chen", bio: "Squat-first powerlifter", followers: [me], following: [] }],
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, [ME, THEM]);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));
// The app reads OTHER users from public_profiles (not profiles) — answer that one so search can
// find someone to open; everything else fails gracefully and the seeded local store renders.
await page.route("**/rest/v1/public_profiles**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify([{ id: THEM, username: "maya_lifts", name: "Maya Chen", bio: "Squat-first powerlifter", avatar_url: null, is_public: true }]) }));
await page.route("**/rest/v1/**", r => r.abort());

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

await page.goto("http://127.0.0.1:8199/", { waitUntil: "load", timeout: 20000 });
await page.waitForTimeout(1400);

// Discover tab (the magnifier, 3rd in the bottom nav) → search → open the result's profile.
// The bottom nav is a floating pill of four icon buttons with no accessible names; click the
// magnifier by position (3rd of 4, ~y 892 on a 926-tall viewport).
// Let the "couldn't load your data" toast clear first — it sits over the nav and eats the click.
await page.waitForTimeout(6000);
await page.mouse.click(264, 869);
await page.waitForTimeout(1000);
await page.screenshot({ path: "build/shot_discover.png" });
console.log("PLACEHOLDERS:", JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll("input")].map(i=>i.placeholder))));
const searchBox = page.locator('input[placeholder*="earch"]').first();
await searchBox.click();
await searchBox.fill("maya");
await page.waitForTimeout(900);
await page.screenshot({ path: "build/shot_search.png" });
await page.getByText("maya_lifts", { exact: false }).first().click();
await page.waitForTimeout(1000);
await page.screenshot({ path: "build/shot_profile.png" });

const onProfile = await page.evaluate(() => /Maya Chen|maya_lifts/.test(document.body.innerText));
check("a profile is open", onProfile);

// Drive the edge swipe by hand: start within 32px of the left edge, drag right, HOLD mid-gesture.
await page.touchscreen.tap(5, 500).catch(() => {});
const held = await page.evaluate(async () => {
  const fire = (type, x, y) => {
    const t = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: y });
    document.elementFromPoint(Math.min(x, innerWidth - 1), y)?.dispatchEvent(
      new TouchEvent(type, { touches: type === "touchend" ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
  };
  fire("touchstart", 8, 500);
  for (let x = 20; x <= 220; x += 20) { fire("touchmove", x, 500); await new Promise(r => setTimeout(r, 25)); }
  await new Promise(r => setTimeout(r, 150));
  // Did the drag actually engage? EdgeSwipeBack writes the transform straight onto its own node.
  const moved = [...document.querySelectorAll("div")]
    .map(d => d.style.transform).filter(t => /translateX\(\d/.test(t || ""));
  // What is UNDER the point the profile has uncovered? elementsFromPoint gives the whole stack.
  const stack = document.elementsFromPoint(40, 500).slice(0, 8).map(e => (e.innerText || "").slice(0, 40).replace(/\n/g, "/"));
  const out = { moved, stack, bodyLen: document.body.innerText.length };
  return out;
});
console.log("UNCOVERED STRIP:", JSON.stringify(held));
check("the edge-swipe actually moved the profile", held.moved.some(t => parseInt(t.match(/\d+/)[0]) > 100), JSON.stringify(held.moved));
// THE fix: under the uncovered strip there must be the screen you're going back to (the shell and
// the search results behind it) — not just the profile and a bare page background.
check("the screen underneath is revealed, not a black gap",
  held.stack.slice(1).some(t => /SESHD|PEOPLE/.test(t)), JSON.stringify(held.stack));
await page.waitForTimeout(400);
await page.screenshot({ path: "build/shot_swipeback.png" });

// The decisive check: while the profile is slid aside, is the rest of the app rendered behind it?
const behind = await page.evaluate(() => {
  // The tab track / bottom nav only exist when the shell is mounted.
  return { hasNav: !!document.querySelector('[aria-label="Home"],[aria-label="Profile"],[aria-label="Discover"]'),
           overlays: document.querySelectorAll('[data-no-tab-swipe]').length };
});
console.log("SHELL BEHIND:", JSON.stringify(behind));
check("the app shell is still mounted behind the profile", behind.hasNav, JSON.stringify(behind));

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
