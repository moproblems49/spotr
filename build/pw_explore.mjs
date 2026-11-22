// EXPLORE ON DISCOVER (Mo, Nov 18): recent posts from PUBLIC accounts you don't follow.
//
// Who may appear is RLS's call (a private stranger's posts never come back from `posts`); this
// suite guards the CLIENT half, against a stub that returns every kind of row a real server could:
//   * strangers' posts appear, mine / followed / blocked / stories do not;
//   * a photo or PR leads, newest first within each group (a plain newer post sits AFTER them);
//   * a tile opens the REAL post (the shared-link overlay), not a dead preview;
//   * with nothing from strangers, the section is absent — no empty box;
//   * the Settings copy says a public profile can appear in Explore.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME  = "11111111-1111-4111-8111-111111111111";
const PAL = "22222222-2222-4222-8222-222222222222"; // I follow them
const STR = "33333333-3333-4333-8333-333333333333"; // stranger, public
const BLK = "77777777-7777-4777-8777-777777777777"; // stranger, but I blocked them
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const ago = h => new Date(Date.now() - h * 36e5).toISOString();
const IMG = "https://stub.supabase.co/storage/v1/object/public/images/s/photo.jpg";
const row = (id, user_id, h, extra = {}) => ({ id, user_id, type: "workout", caption: "", image_url: null, unit: "lbs", is_pr: false,
  client_id: null, created_at: ago(h), kudos: [], comments: [],
  workout: { name: "Session " + id.slice(0, 2), duration: 3600, volume: 9000, exercises: [{ name: "Bench Press", sets: [{ w: 185, r: 5 }] }] }, ...extra });
const P = id => id.padEnd(8, "0") + "-0000-4000-8000-000000000000";
const S_PHOTO = P("a1"), S_PR = P("a2"), S_PLAIN = P("a3"), S_STORY = P("a4");
const ROWS = [
  row(S_PLAIN, STR, 1, { workout: { name: "Easy Pull", duration: 2400, volume: 7200, exercises: [{ name: "Barbell Row", sets: [{ w: 135, r: 8 }] }] } }),
  row(S_PHOTO, STR, 30, { image_url: IMG, type: "photo", workout: null, caption: "Gym views" }),
  row(S_PR, STR, 50, { is_pr: true, workout: { name: "Heavy Legs", duration: 3600, volume: 15000, exercises: [{ name: "Back Squat", isPR: true, sets: [{ w: 315, r: 3 }] }] } }),
  row(S_STORY, STR, 2, { type: "story", image_url: IMG, workout: null }),
  row(P("b1"), PAL, 3),    // followed: belongs in the home feed, not Explore
  row(P("c1"), ME, 4),     // mine
  row(P("d1"), BLK, 5),    // blocked
];
let strangerRows = true;   // flip to model "only me and people I follow have posted"
// Extra older stranger posts so the full feed has a second page to load.
const BULK = Array.from({ length: 34 }, (_, i) => row(P("e" + String(i).padStart(2, "0")), STR, 100 + i, { workout: { name: "Bulk " + i, duration: 1800, volume: 1000, exercises: [{ name: "Deadlift", sets: [{ w: 225, r: 5 }] }] } }));
let withBulk = false;
const writes = [];
const gets = [];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
async function boot() {
  const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(5000);
  page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });
  await page.addInitScript(([me]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: "dark", unit: "lbs", isPublic: true, programs: [], history: {},
      workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [], profile: { username: "momo", name: "Mo" }, users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", user: { id: me } }));
    localStorage.setItem("seshd_onboarded", "1"); localStorage.setItem("seshd_custom_merge_v1", "1");
  }, [ME]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "tok", user: { id: ME } }) }));
  await page.route("**/storage/v1/**", r => r.abort());
  await page.route("**/rest/v1/**", r => {
    const u = r.request().url(), m = r.request().method();
    const json = b => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    gets.push(u);
    if (m !== "GET") { writes.push({ m, u, body: r.request().postData() }); return json([]); }
    const idm = u.match(/posts\?id=eq\.([0-9a-f-]+)/);
    if (idm) return json(ROWS.filter(x => x.id === idm[1]));
    if (/\/posts\?select=id,user_id,type/.test(u)) {   // the Explore query — honour its own filters
      let out = [...ROWS, ...(withBulk ? BULK : [])].filter(x => strangerRows || (x.user_id !== STR));
      if (/type=neq\.story/.test(u)) out = out.filter(x => x.type !== "story");
      out.sort((a, b) => b.created_at.localeCompare(a.created_at));
      const off = +(u.match(/offset=(\d+)/)?.[1] || 0), lim = +(u.match(/limit=(\d+)/)?.[1] || 1000);
      return json(out.slice(off, off + lim));
    }
    if (/\/posts\?/.test(u)) return json([]);
    if (/blocked_users\?/.test(u)) return json([{ blocked_id: BLK }]);
    if (/follows\?/.test(u)) return json([{ follower_id: ME, following_id: PAL, status: "accepted" }]);
    if (/public_profiles\?/.test(u)) return json([
      { id: ME, username: "momo", name: "Mo", bio: "", avatar_url: "", is_public: true },
      { id: PAL, username: "pally", name: "Pally", bio: "", avatar_url: "", is_public: true },
      { id: STR, username: "liftlady", name: "Lift Lady", bio: "", avatar_url: "", is_public: true },
      { id: BLK, username: "blocky", name: "Blocky", bio: "", avatar_url: "", is_public: true }]);
    if (/profiles\?/.test(u)) return json([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]);
    return json([]);
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
  await page.waitForTimeout(2600);
  await page.locator('button[aria-label="Discover"]').first().click();
  await page.waitForTimeout(1500);
  return page;
}

// ── strangers have posted ──────────────────────────────────────────────────────────────
{
  const page = await boot();
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  const ids = await page.evaluate(() => [...document.querySelectorAll("[data-explore-post]")].map(b => b.dataset.explorePost));
  check("Explore renders on Discover", ids.length > 0, JSON.stringify(ids));
  check("only strangers' posts: not mine, not followed, not blocked, no stories",
    ids.length === 3 && ids.every(id => [S_PHOTO, S_PR, S_PLAIN].includes(id)), JSON.stringify(ids));
  check("a photo and a PR lead; the newer plain post comes after them",
    ids[0] === S_PHOTO && ids[1] === S_PR && ids[2] === S_PLAIN, JSON.stringify(ids));
  const tiles = await page.evaluate(() => [...document.querySelectorAll("[data-explore-post]")].map(b => ({
    img: !!b.querySelector("img"), text: b.innerText.replace(/\s+/g, " ").trim() })));
  check("the photo post shows its photo", tiles[0]?.img === true, JSON.stringify(tiles[0]));
  check("the PR post carries a PR badge and its author", /PR/.test(tiles[1]?.text || "") && /@liftlady/.test(tiles[1]?.text || ""), JSON.stringify(tiles[1]));
  check("a workout tile names the session", /Easy Pull/.test(tiles[2]?.text || ""), JSON.stringify(tiles[2]));
  await page.locator(`[data-explore-post="${S_PLAIN}"]`).click();
  await page.waitForTimeout(1500);
  // What is PAINTED at the centre of the screen, scoped to the layer it belongs to — innerText of
  // the whole body would also report Discover underneath (an overlay does not remove the DOM).
  const opened = await page.evaluate(() => {
    let el = document.elementFromPoint(200, 300);
    while (el && el !== document.body) {
      const cs = getComputedStyle(el);
      if ((cs.position === "fixed" || cs.position === "absolute") && parseInt(cs.zIndex) >= 60) return el.innerText.replace(/\s+/g, " ").slice(0, 200);
      el = el.parentElement;
    }
    return null;
  });
  check("tapping a tile opens that post on top of Discover", !!opened && /Barbell Row/.test(opened) && !/Explore/i.test(opened), String(opened));
  // Explore sits above the leaderboard, where a new account sees it without scrolling past dashes.
  const order = await page.evaluate(() => {
    const t = document.body.innerText; return { ex: t.search(/EXPLORE/i), lb: t.search(/LEADERBOARD/i) };
  });
  check("Explore comes before the leaderboard", order.ex >= 0 && (order.lb < 0 || order.ex < order.lb), JSON.stringify(order));
  await page.close();
}
// ── tiles carry the poster's photo and the session's shape; See all opens the full feed ────
{
  withBulk = true;
  const page = await boot();
  const t = await page.evaluate(() => [...document.querySelectorAll("[data-explore-post]")].map(b => ({
    av: !!b.querySelector("[data-explore-avatar]"), meta: b.querySelector("[data-explore-meta]")?.innerText || "" })));
  check("the strip is capped at three rows of three", t.length === 9, String(t.length));
  check("every tile shows the poster's avatar", t.length > 0 && t.every(x => x.av), JSON.stringify(t.map(x => x.av)));
  check("a workout tile says how many exercises and how long", t.some(x => /^1 exercise · \d+m$/.test(x.meta)), JSON.stringify(t.map(x => x.meta)));
  await page.locator("[data-explore-all]").click();
  await page.waitForTimeout(1200);
  const feed = () => page.evaluate(() => [...document.querySelectorAll("[data-explore-card]")].map(c => c.dataset.exploreCard));
  const f1 = await feed();
  check("See all opens the Explore feed", f1.length > 0, String(f1.length));
  check("the feed holds only strangers' posts (none of mine, followed, blocked, or stories)",
    f1.length > 0 && !f1.some(id => [P("b1"), P("c1"), P("d1"), S_STORY].includes(id)), JSON.stringify(f1.slice(0, 6)));
  check("the feed is newest first", f1[0] === S_PLAIN && f1[1] === S_PHOTO && f1[2] === S_PR, JSON.stringify(f1.slice(0, 3)));
  const card = await page.evaluate(id => document.querySelector(`[data-explore-card="${id}"]`)?.innerText.replace(/\s+/g, " ") || "", S_PR);
  check("a feed card is the full post: author, session and its exercises", /liftlady|Lift Lady/.test(card) && /Heavy Legs/.test(card) && /Back Squat/.test(card), card);
  // Kudos IN the feed, without opening the post — and it must reach the server, not just the screen.
  writes.length = 0;
  await page.locator(`[data-explore-card="${S_PR}"] button[aria-label="Give kudos"]`).click();
  await page.waitForTimeout(700);
  check("tapping kudos in the feed writes a kudos for THAT post", writes.some(w => w.m === "POST" && /\/kudos/.test(w.u) && (w.body || "").includes(S_PR)), JSON.stringify(writes));
  // Comments open inline, and a comment sent there reaches the server.
  await page.locator(`[data-explore-card="${S_PR}"] button[aria-label="Comments"]`).click();
  await page.waitForTimeout(400);
  const box = page.locator(`[data-explore-card="${S_PR}"] input, [data-explore-card="${S_PR}"] textarea`).first();
  check("tapping the comment icon opens comments right in the feed", await box.count() > 0, "");
  if (await box.count()) {
    await box.fill("nice squat");
    await box.press("Enter");
    await page.waitForTimeout(700);
    check("...and a comment typed there reaches the server", writes.some(w => w.m === "POST" && /\/comments/.test(w.u) && (w.body || "").includes("nice squat")), JSON.stringify(writes.map(w => w.u)));
  }
  // A foreground refresh must not evict these posts — or kudos goes silently dead (the shared-post scar).
  // The foreground refresh is throttled to once per 30s, so firing it sooner is a silent no-op
  // (pw_switch's scar) — wait the throttle out, then PROVE the refresh ran before trusting the check.
  await page.waitForTimeout(31000);
  gets.length = 0;
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(1200);
  check("[control] the foreground refresh actually ran", gets.some(u => /\/profiles\?/.test(u)), String(gets.length));
  writes.length = 0;
  await page.locator(`[data-explore-card="${S_PLAIN}"] button[aria-label="Give kudos"]`).click();
  await page.waitForTimeout(700);
  check("[after a refresh] kudos in the feed still writes", writes.some(w => /\/kudos/.test(w.u) && (w.body || "").includes(S_PLAIN)), JSON.stringify(writes));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace(/\.png$/, "_feed.png") });
  // Page 1 is 30 raw rows; 3 of them are filtered out locally, so the second page must be fetched.
  await page.locator("[data-explore-more]").click();
  await page.waitForTimeout(1200);
  const f2 = await feed();
  check("Load more fetches the next page", f2.length === 37 && new Set(f2).size === f2.length, `${f1.length} -> ${f2.length}`);
  check("...and the button goes away at the end", !(await page.locator("[data-explore-more]").count()), "");
  await page.close();
  withBulk = false;
}
// ── nothing from strangers ────────────────────────────────────────────────────────────
{
  strangerRows = false;
  const page = await boot();
  const n = await page.evaluate(() => ({ section: !!document.querySelector("[data-explore]"), body: /suggested people|no one to suggest/i.test(document.body.innerText) }));
  check("[control] Discover still rendered", n.body, JSON.stringify(n));
  check("with only my own and followed posts, there is no Explore box at all", !n.section, JSON.stringify(n));
  await page.close();
}
await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
