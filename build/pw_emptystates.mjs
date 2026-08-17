// THE THREE REPEATED "GENERIC AI EMPTY STATE" CARDS NO LONGER SHARE ONE TEMPLATE.
//
// A design critique (screenshots + review) found the same recipe — centered icon-in-a-square,
// bold headline, muted subtext, one button — used identically on three unrelated screens: the
// Workout tab's "Start your first program", Discover's "Find your crew", and the profile's
// "Log some workouts..." muscle-balance block. Each is redesigned differently:
//   - Workout tab: left-aligned header row, inline actions, sits directly under Quick Start
//     rather than as a second competing hero card.
//   - Discover: no icon at all (it duplicated the Groups tile's icon two rows above it), and a
//     REAL "Share your profile" button that reuses the profile screen's own share flow, instead
//     of a passive sentence with no action behind it.
//   - Profile: previews the actual feature (five colored, labeled bars, dimmed) instead of a
//     floating unrelated paragraph.
// Also: the Discover "Friends Activity"/"Groups" tiles show real counts once there's something to
// count, instead of a static caption forever.
//
// Shown red against the pre-change code below.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(6000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });

await page.addInitScript((me) => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: "dark", unit: "lbs",
    programs: [], history: {}, workoutDates: {}, weeklyTarget: 3, prEvents: [], bodyLog: [], prs: {},
    posts: [], isPublic: true, profile: { username: "momo", name: "Mo" },
    users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, ME);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "t", user: { id: ME } }) }));
await page.route("**/rest/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: /\/(public_)?profiles\?/.test(r.request().url())
    ? JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", theme: "dark", seen_onboarding: true, is_public: true }]) : "[]" }));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3200);
const body = () => page.evaluate(() => document.body.innerText);
const iconOnlyHero = () => page.evaluate(() => {
  // The old recipe's tell: a >=48px near-square rounded icon tile with NOTHING else at that
  // size on the same row/column — i.e. an isolated icon square, not an icon inline with text.
  return [...document.querySelectorAll("div")].some(d => {
    const r = d.getBoundingClientRect();
    if (r.width < 44 || r.width > 60 || Math.abs(r.width - r.height) > 4) return false;
    const cs = getComputedStyle(d);
    return parseFloat(cs.borderRadius) > 8 && d.children.length === 1 && d.children[0].tagName === "svg"
      && d.querySelector("svg")?.getAttribute("width") && Number(d.querySelector("svg").getAttribute("width")) >= 20;
  });
});

// ── 1. Workout tab ────────────────────────────────────────────────────────────────────────────
await page.getByLabel("Workout").first().click().catch(() => {});
await page.waitForTimeout(1200);
const wkBody = await body();
check("1a. the workout empty state is present", /Start your first program/.test(wkBody));
check("1b. no isolated icon-square hero on the Workout tab", !(await iconOnlyHero()));
check("1c. Browse templates is reachable", /Browse templates/.test(wkBody));
check("1d. build-your-own is reachable", /or build your own/.test(wkBody));
// The real, precise signal for this screen: the old layout stacked "Browse templates" and
// "or build your own" as two centered, vertically-separate rows; the new one puts them side by
// side on the same row. Compare vertical position rather than guess at a shape.
const sameRow = await page.evaluate(() => {
  const bt = [...document.querySelectorAll("button")].find(x => /^browse templates$/i.test((x.textContent || "").trim()));
  const link = [...document.querySelectorAll("button")].find(x => /or build your own/i.test((x.textContent || "").trim()));
  if (!bt || !link) return null;
  const a = bt.getBoundingClientRect(), b = link.getBoundingClientRect();
  return Math.abs(a.top - b.top) < 12;
});
check("1e. the two actions sit on the same row, not stacked as a centered hero", sameRow === true, `sameRow=${sameRow}`);

// ── 2. Discover ──────────────────────────────────────────────────────────────────────────────
await page.getByLabel("Discover").first().click().catch(() => {});
await page.waitForTimeout(1200);
const dcBody = await body();
check("2a. the discover empty state is present", /No one to suggest yet/.test(dcBody));
check("2b. no isolated icon-square hero on Discover", !(await iconOnlyHero()));
check("2c. a real, clickable Share button is offered (not just a sentence)", /Share your profile/.test(dcBody));
const shareClicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => /share your profile/i.test((x.textContent || "").trim()));
  if (!b) return false; b.click(); return true;
});
await page.waitForTimeout(600);
check("2d. the share button actually does something (toast fired)", shareClicked && /copied|Turn on/i.test(await body()));

// ── 3. Profile — the muscle-balance skeleton ────────────────────────────────────────────────
await page.getByLabel("Profile").first().click().catch(() => {});
await page.waitForTimeout(1200);
const prBody = await body();
check("3a. the section keeps its heading in the empty state", /Muscle balance/i.test(prBody));
check("3b. all five muscle groups preview as rows", ["Push", "Pull", "Legs", "Core", "Cardio"].every(g => prBody.includes(g)));
check("3c. no bare floating paragraph replaces the feature preview",
  !/Log some workouts to see how your training volume is distributed/i.test(prBody));

// ── 4. Tile personalization (following > 0 shows a real count) ─────────────────────────────
// loadUserData REPLACES store.users/following from the SERVER on every reload — seeding
// localStorage alone doesn't survive it. The follows table is what actually drives it.
await page.unroute("**/rest/v1/**");
await page.route("**/rest/v1/**", r => {
  const u = r.request().url();
  const J = b => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  if (/\/rest\/v1\/follows\?/.test(u))
    return J([
      { follower_id: ME, following_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "accepted" },
      { follower_id: ME, following_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", status: "accepted" },
    ]);
  if (/\/rest\/v1\/(public_)?profiles\?/.test(u))
    return J([{ id: ME, username: "momo", name: "Mo", unit: "lbs", theme: "dark", seen_onboarding: true, is_public: true }]);
  return J([]);
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2800);
await page.getByLabel("Discover").first().click().catch(() => {});
await page.waitForTimeout(1200);
check("4. the Friends Activity tile shows a real count once you're following someone",
  /2 following/.test(await body()), (await body()).slice(0, 200).replace(/\n/g, " | "));

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
