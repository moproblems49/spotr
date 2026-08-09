// THE THREE REGRESSIONS THE ACTIVITY-OVERLAY COMMIT SHIPPED, AND pw_activity COULD NOT SEE.
//
// `pw_activity.mjs` passes 16/16 against all three of these: it never touches the bottom nav, the
// badge, or loadFeed's pagination. Each check below goes red against commit fc57ed5.
//
//  1. The nav floats at zIndex 50 over the overlay's 40, and `switchTab` closed `showMessages` but
//     not `showActivity` — so a nav tap switched the tab UNDERNEATH and the screen never changed.
//  2. "Load older posts" used `store.posts.length` as its offset, and the store now also holds up
//     to 200 of your OWN posts that were never in the global list. The offset overshot by exactly
//     that many and a whole window of other people's posts became unreachable.
//  3. `seenActivityCount` is a persisted COUNT whose MEANING changed; its one-time re-baseline key
//     was not bumped, so a caught-up user gets a phantom badge on first launch.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
const FR = "22222222-2222-4222-8222-222222222222";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const iso = d => new Date(Date.now() - d * 864e5).toISOString();
// 2 recent own posts, 60 days of a friend's posts, then 40 old own posts underneath them.
const SERVER = [
  ...Array.from({ length: 2 }, (_, i) => ({ id: `own-new-${i}`, user_id: ME, caption: `mine ${i}`, created_at: iso(i), kudos: [], comments: [] })),
  ...Array.from({ length: 60 }, (_, i) => ({ id: `fr-${i + 3}`, user_id: FR, caption: `friend day ${i + 3}`, created_at: iso(i + 3), kudos: [], comments: [] })),
  // Kudos from the friend on the FIRST FIVE of these. They sit at global offset ~62, so they are
  // NOT on the first feed page — only the own-posts query returns them. That is what makes the
  // activity count change meaning between the old build and the new one, and without it the badge
  // check is vacuous: the first draft gave every post `kudos: []`, so the count was 0 either way
  // and the check passed against the very code it was written to fail.
  ...Array.from({ length: 40 }, (_, i) => ({ id: `own-old-${i}`, user_id: ME, caption: `old mine ${i}`,
    created_at: iso(i + 70), kudos: i < 5 ? [{ user_id: FR }] : [], comments: [] })),
].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const offsets = [];

async function open({ seenCount = null, rebaselined = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(4000);
  await page.addInitScript(([me, fr, seen, reb]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: "dark", unit: "lbs",
      programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
      profile: { username: "momo", name: "Mo" },
      users: [{ id: me, username: "momo", name: "Mo", followers: [fr], following: [fr] },
              { id: fr, username: "friend", name: "Friend", followers: [me], following: [me] }] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: me } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
    if (seen != null) localStorage.setItem("seshd_seen_activity_count", String(seen));
    if (reb) localStorage.setItem("seshd_activity_rebaselined_v2", "1");
  }, [ME, FR, seenCount, rebaselined]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "t", user: { id: ME } }) }));
  const ME_ID = ME, FR_ID = FR;
  await page.route("**/rest/v1/**", r => {
    const u = r.request().url();
    const J = b => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (/\/rest\/v1\/(public_)?profiles\?/.test(u))
      return J([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" },
                { id: FR, username: "friend", name: "Friend", is_public: true }]);
    // WITHOUT THIS the app sees you following nobody, the feed shows only your OWN posts, and the
    // whole point of the section below — a window of OTHER people's posts going unreachable —
    // cannot be observed. The first run of this file failed exactly that way.
    if (/\/rest\/v1\/follows\?/.test(u))
      return J([{ follower_id: ME_ID, following_id: FR_ID, status: "accepted" },
                { follower_id: FR_ID, following_id: ME_ID, status: "accepted" }]);
    if (/\/rest\/v1\/posts\?/.test(u)) {
      if (/user_id=eq\./.test(u)) return J(SERVER.filter(p => p.user_id === ME).slice(0, 200));
      const off = parseInt(new URL(u).searchParams.get("offset") || "0", 10);
      const lim = parseInt(new URL(u).searchParams.get("limit") || "30", 10);
      offsets.push(off);
      return J(SERVER.slice(off, off + lim));
    }
    return J([]);
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  return page;
}

// ── 1. The bottom nav must escape the Activity overlay ───────────────────────────────────────
{
  const page = await open();
  await page.getByLabel("Home").first().click().catch(() => {});
  await page.waitForTimeout(900);
  await page.getByLabel("Activity").first().click().catch(() => {});
  await page.waitForTimeout(1000);
  // DETECT THE OVERLAY BY SOMETHING ONLY IT SAYS. The first draft tested `/Activity/i` against the
  // whole body — and the FEED contains the words "Your friends' activity", so it matched a screen
  // where the overlay had never opened. Every later assertion in this section was then measuring
  // the feed, and the whole section passed against the build it was written to fail.
  const onActivity = async () => page.evaluate(() =>
    /No activity yet|Show \d+ hidden|liked your post|commented:/.test(document.body.innerText));
  check("Activity opened", await onActivity(),
    (await page.evaluate(() => document.body.innerText)).slice(0, 100).replace(/\n/g, " | "));
  await page.getByLabel("Profile").first().click().catch(() => {});
  await page.waitForTimeout(1000);
  // DO NOT JUDGE THIS FROM innerText. An overlay covers the screen but does NOT remove the DOM
  // underneath it, and innerText reports covered text just the same — so "Edit profile" is present
  // whether or not the nav tap actually escaped. Two earlier drafts of this check passed against
  // the broken build for exactly that reason: first by testing for the ABSENCE of the word
  // "Activity" (the feed says "Your friends' activity", so it matched a screen where the overlay
  // had never opened), then by testing for the PRESENCE of profile text that was there regardless.
  // The overlay's Dismiss buttons exist only inside the Activity list, so their count is the
  // question actually being asked: is the overlay still mounted?
  const still = await page.evaluate(() => ({
    dismissRows: document.querySelectorAll('[aria-label="Dismiss"]').length,
    hitCentre: (document.elementFromPoint(214, 420)?.closest('[data-no-tab-swipe]') ? "overlay" : "page"),
    txt: document.body.innerText.slice(0, 70).replace(/\n/g, " | "),
  }));
  console.log(`  after tapping Profile: ${still.dismissRows} activity rows still mounted, centre hits the ${still.hitCentre}`);
  check("a bottom-nav tap closes the Activity overlay", still.dismissRows === 0, `${still.dismissRows} rows left`);
  await page.close();
}

// ── 2. Pagination must not skip a window of other people's posts ─────────────────────────────
{
  offsets.length = 0;
  const page = await open();
  await page.getByLabel("Home").first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const seeded = await page.evaluate(() => /friend day/i.test(document.body.innerText));
  if (!seeded) console.log("  BODY:", (await page.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\n/g, " | "));
  check("the feed fixture reached the screen", seeded);
  const more = page.getByText(/Load older posts/i).first();
  if (await more.count()) { await more.click(); await page.waitForTimeout(1500); }
  console.log(`  offsets requested: [${offsets.join(", ")}]`);
  check("the second page asks for the next GLOBAL page, not store.posts.length",
    offsets[1] === 30, `got ${offsets[1]}`);
  const days = await page.evaluate(() => [...document.body.innerText.matchAll(/friend day (\d+)/g)].map(m => +m[1]));
  const top = days.length ? Math.max(...days) : 0;
  console.log(`  friend posts visible after loading older: up to day ${top}`);
  check("posts from the second global page are reachable", top > 30, `max day ${top}`);
  await page.close();
}

// ── 3. No phantom badge for a user who was already caught up ─────────────────────────────────
// Seeded exactly as an existing tester arrives on the update: re-baselined under v2, seen count
// written when the count only covered feed-page posts.
{
  const page = await open({ seenCount: 1, rebaselined: true });
  await page.getByLabel("Home").first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const badge = await page.evaluate(() => {
    const h = document.querySelector('[aria-label="Activity"]');
    return h ? (h.textContent || "").trim() : "NO HEART";
  });
  console.log(`  badge on the heart: ${JSON.stringify(badge)}`);
  check("a caught-up existing user sees no phantom badge after the update",
    badge === "" || badge === "NO HEART", badge);
  await page.close();
}

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
