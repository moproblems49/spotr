// Swiping back out of a DM must reveal the Messages list, not a black gap.
//
// Mo, from the device: "When I'm in a DM swiping to go back shows a black screen not what's
// behind." The chat was an EARLY RETURN from AppInner, so while it was open NOTHING else was
// rendered; EdgeSwipeBack translates its own node aside and the strip it uncovers was the bare
// `#0a0a0a` that index.css paints on the root. That colour was chosen precisely so this strip
// would not flash WebView WHITE — index.css's own comment names this exact gesture — but a
// mitigation is not a fix, and black-instead-of-white is still a black screen.
//
// Same defect and same fix as pw_swipeback's profile case. This is the DM half, which that suite
// never covered, and it is the reason the class survived a suite written for it.
import { chromium } from "playwright-core";

const ME = "11111111-1111-4111-8111-111111111111";
const PAL = "22222222-2222-4222-8222-222222222222";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(5000);
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });

await page.addInitScript(([me, pal]) => {
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
    prEvents: [], bodyLog: [], prs: {}, posts: [], profile: { username: "momo", name: "Mo" },
    users: [{ id: me, username: "momo", name: "Mo", followers: [pal], following: [pal] },
            { id: pal, username: "pally", name: "Pally", followers: [me], following: [me] }],
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, [ME, PAL]);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));
await page.route("**/rest/v1/**", r => {
  const u = r.request().url();
  if (/follows\?/.test(u)) return r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify([{ follower_id: ME, following_id: PAL, status: "accepted" }, { follower_id: PAL, following_id: ME, status: "accepted" }]) });
  if (/messages/.test(u)) return r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify([{ id: "m1", sender_id: PAL, recipient_id: ME, text: "yo", created_at: new Date().toISOString(), read_at: null }]) });
  if (/public_profiles\?/.test(u)) return r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify([{ id: ME, username: "momo", name: "Mo", is_public: true }, { id: PAL, username: "pally", name: "Pally", is_public: true }]) });
  if (/profiles\?/.test(u)) return r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]) });
  r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
});

await page.goto(`http://127.0.0.1:${process.env.PORT || 8199}/`, { waitUntil: "load", timeout: 20000 });
await page.waitForTimeout(2600);

// Reach the chat the way a finger does — Messages, then the thread.
const msgs = page.locator('[aria-label="Messages"]').first();
check("1. the Messages button exists", await msgs.count() > 0);
await msgs.click({ force: true });
await page.waitForTimeout(1200);
const pal = page.getByText("Pally", { exact: false }).first();
check("2. the Messages list shows the thread", await pal.count() > 0);
await pal.click({ force: true });
await page.waitForTimeout(1500);
// The chat is open when its composer is on screen. Do NOT judge this from innerText: the app
// underneath is mounted now (that is the fix), and innerText reports covered DOM.
check("3. the chat opened", await page.locator('[placeholder="Message…"], [placeholder="Message..."]').count() > 0);

const held = await page.evaluate(async () => {
  const fire = (type, x, y) => {
    const t = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: y });
    document.elementFromPoint(Math.min(x, innerWidth - 1), y)?.dispatchEvent(
      new TouchEvent(type, { touches: type === "touchend" ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
  };
  fire("touchstart", 8, 500);
  for (let x = 20; x <= 220; x += 20) { fire("touchmove", x, 500); await new Promise(r => setTimeout(r, 25)); }
  await new Promise(r => setTimeout(r, 150));
  const moved = [...document.querySelectorAll("div")].map(d => d.style.transform).filter(t => /translateX\(\d/.test(t || ""));
  // The whole stack under a point the chat has vacated.
  const stack = document.elementsFromPoint(40, 500).slice(0, 8).map(e => (e.innerText || "").slice(0, 50).replace(/\n/g, "/"));
  return { moved, stack };
});
console.log("UNCOVERED STRIP:", JSON.stringify(held));

// Assert the drag ENGAGED first — otherwise "something is underneath" would be trivially true of
// a chat that never moved, and the suite would pass on the broken build for the wrong reason.
check("4. the edge-swipe actually moved the chat",
  held.moved.some(t => parseInt(t.match(/\d+/)[0]) > 100), JSON.stringify(held.moved));
// THE fix: the Messages list is what you are going back to, so it must be in the uncovered strip.
// Match on the list's own "MESSAGES" heading and NOTHING else. The first draft accepted /Pally/
// too and PASSED on the broken build — the chat's own header contains the peer's name, so the
// check was reading the very screen it was supposed to see PAST. A marker that both screens
// render cannot distinguish them.
check("5. the Messages list is revealed, not a black gap",
  held.stack.slice(1).some(t => /MESSAGES/.test(t)), JSON.stringify(held.stack));
const behind = await page.evaluate(() => ({
  hasNav: !!document.querySelector('[aria-label="Home"],[aria-label="Profile"],[aria-label="Discover"]'),
}));
check("6. the app shell is still mounted behind the chat", behind.hasNav, JSON.stringify(behind));

await page.screenshot({ path: "build/shot_chatswipe.png" });
await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
