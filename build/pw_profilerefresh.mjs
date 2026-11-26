// A STRANGER'S PROFILE MUST SURVIVE A REFRESH (Mo, Nov 26: opened an account through Explore,
// refreshed, and it read "0 Posts / hasn't posted yet"). The profile merges that person's posts into
// store.posts; a refresh wipes store.posts down to PINNED ids and loadFeed only fetches people you
// follow, so a stranger's posts vanished. Fixed by pinning them while the profile is open (owner
// "profile"). Drives the real path: open a post by a stranger, tap the author, refresh, count.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME  = "11111111-1111-4111-8111-111111111111";
const STR = "33333333-3333-4333-8333-333333333333";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const ago = h => new Date(Date.now() - h * 36e5).toISOString();
const P = n => `aaaaaaa${n}-0000-4000-8000-000000000000`;
const row = (id, h, name) => ({ id, user_id: STR, type: "workout", caption: "", image_url: null, unit: "lbs", is_pr: false,
  client_id: null, created_at: ago(h), kudos: [], comments: [],
  workout: { name, duration: 3600, volume: 9000, exercises: [{ name: "Barbell Bench Press", sets: [{ w: 185, r: 5 }] }] } });
const ROWS = [row(P(1), 2, "Push Day"), row(P(2), 30, "Leg Day"), row(P(3), 60, "Pull Day")];
let refreshes = 0;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
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
  if (m !== "GET") return json([]);
  if (/workout_history\?/.test(u)) refreshes++;
  const idm = u.match(/posts\?id=eq\.([0-9a-f-]+)/);
  if (idm) return json(ROWS.filter(x => x.id === idm[1]));
  if (new RegExp(`posts\\?user_id=eq\\.${STR}`).test(u)) return json(ROWS);   // the profile's own fetch
  if (/\/posts\?/.test(u)) return json([]);                                     // home feed: I follow nobody
  if (/public_profiles\?/.test(u)) return json([
    { id: ME, username: "momo", name: "Mo", bio: "", avatar_url: "", is_public: true },
    { id: STR, username: "alexlifts", name: "Alex Test", bio: "", avatar_url: "", is_public: true }]);
  if (/profiles\?/.test(u)) return json([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]);
  return json([]);
});
await page.goto(`http://127.0.0.1:${PORT}/?p=${P(1)}`, { waitUntil: "load" });
await page.waitForTimeout(2500);
if (process.env.DBG) { console.log((await page.evaluate(()=>document.body.innerText)).slice(0,600)); }

// Tap the author on the opened post — the way a user reaches a stranger from a post.
const author = page.getByText("alexlifts", { exact: true }).last();
check("[control] the post opened with its author", await author.count() > 0);
await author.click({ force: true });
await page.waitForTimeout(1500);

const postsCount = () => page.evaluate(() => {
  const lab = [...document.querySelectorAll("div,span")].find(e => e.textContent.trim() === "Posts" && e.children.length === 0);
  return lab ? (lab.previousElementSibling?.textContent || "").trim() : null;
});
const before = await postsCount();
check("[control] the stranger's profile shows their posts", before === "3", `count=${before}`);

// The foreground refresh is throttled to once per 30s; wait it out so the refresh actually runs.
await page.waitForTimeout(31000);
const r0 = refreshes;
await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
await page.waitForTimeout(3000);
check("[control] the refresh actually ran", refreshes > r0, `history fetches ${r0} -> ${refreshes}`);
const after = await postsCount();
check("after a refresh the profile still shows the posts", after === "3", `count=${after}`);
const empty = await page.evaluate(() => /hasn't posted yet/.test(document.body.innerText));
check("...and does not say they haven't posted", !empty);

await browser.close();
console.log(fails ? `${fails} FAIL(S)` : "ALL PASS");
process.exit(fails ? 1 : 0);
