// MUSE, NOV 27 + MO'S ASK, three fixes driven through the real app:
//  1. A text-only post (New Post writes type "photo" with no image) drew a gray broken-image tile.
//  2. Your own profile header says WORKOUTS and counted every card, so a text post read as a
//     workout ("Workouts 5" beside History's 4).
//  3. Tapping an Activity row did nothing; it now opens the post it is about (a follow row opens
//     the person), and the Dismiss button still only dismisses.
// Everything comes from the stub, because loadUserData replaces the store from the server.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME  = "11111111-1111-4111-8111-111111111111";
const KAI = "22222222-2222-4222-8222-222222222222";
const P_WORK = "aaaaaaa1-0000-4000-8000-000000000000";
const P_TEXT = "aaaaaaa2-0000-4000-8000-000000000000";
const SID1 = "bbbbbbb1-0000-4000-8000-000000000000";   // shared as P_WORK
const SID2 = "bbbbbbb2-0000-4000-8000-000000000000";   // unposted
const t = ms => new Date(Date.now() - ms).toISOString();
const dk = d => { const x = new Date(Date.now() - d * 864e5); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; };
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const set = (w, r) => ({ weight: String(w), reps: String(r), done: true, type: "normal" });
const HISTORY = [
  { id: SID1, user_id: ME, day_name: "Push", duration_secs: 3000, unit: "lbs", note: null, workout_date: dk(2), created_at: t(2 * 864e5),
    exercises: [{ name: "Barbell Bench Press", sets: [set(185, 5)] }] },
  { id: SID2, user_id: ME, day_name: "Legs", duration_secs: 3000, unit: "lbs", note: null, workout_date: dk(1), created_at: t(1 * 864e5),
    exercises: [{ name: "Barbell Back Squat", sets: [set(225, 5)] }] },
];
const POSTS = [
  { id: P_WORK, user_id: ME, type: "workout", caption: "Push done", image_url: null, unit: "lbs", is_pr: false, client_id: SID1,
    created_at: t(2 * 864e5 - 60e3), kudos: [{ user_id: KAI }], comments: [{ id: "c1", user_id: KAI, text: "beast mode", likes: [], created_at: t(3600e3) }],
    workout: { name: "Push", duration: 3000, volume: 925, exercises: [{ name: "Barbell Bench Press", sets: [{ w: 185, r: 5 }] }] } },
  { id: P_TEXT, user_id: ME, type: "photo", caption: "The only bad workout is the one that didn't happen.", image_url: null,
    created_at: t(600e3), kudos: [], comments: [], workout: null },
];
const postFetches = [];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });
await page.addInitScript(me => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
    prEvents: [], bodyLog: [], prs: {}, posts: [], groups: [], users: [] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: me, email: "m@e.com" } }));
  localStorage.setItem("seshd_onboarded", "1"); localStorage.setItem("seshd_custom_merge_v1", "1");
  localStorage.setItem("seshd_activity_rebaselined_v4", "1"); localStorage.setItem("seshd_seen_activity_count", "0");
}, ME);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: ME, email: "m@e.com" } }) }));
await page.route("**/storage/v1/**", r => r.abort());
await page.route("**/rest/v1/**", r => {
  const u = r.request().url();
  const J = b => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  if (r.request().method() !== "GET") return J([]);
  if (/\/(profiles|public_profiles)\?/.test(u)) return J([
    { id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" },
    { id: KAI, username: "kai", name: "Kai", is_public: true }]);
  if (/\/workout_history\?/.test(u) && u.includes(ME)) return J(HISTORY);
  const idm = u.match(/\/posts\?id=eq\.([0-9a-f-]+)/);
  if (idm) { postFetches.push(idm[1]); return J(POSTS.filter(p => p.id === idm[1])); }
  if (/\/posts\?/.test(u)) { const um = u.match(/user_id=eq\.([0-9a-f-]+)/); return J(um ? POSTS.filter(p => p.user_id === um[1]) : POSTS); }
  if (/\/follows\?/.test(u)) return J([
    { follower_id: KAI, following_id: ME, status: "accepted", created_at: t(2 * 3600e3) },
    { follower_id: ME, following_id: KAI, status: "accepted", created_at: t(2 * 3600e3) }]);
  return J([]);
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
await page.waitForTimeout(2500);

// ── 1 + 2: my own profile ──
await page.locator('button[aria-label="Profile"]').first().click({ force: true });
await page.waitForTimeout(1500);
const prof = await page.evaluate(() => {
  const lab = [...document.querySelectorAll("div")].find(e => /^Workouts?$/.test(e.textContent.trim()) && e.children.length === 0);
  return {
    count: lab ? (lab.previousElementSibling?.textContent || "").trim() : null,
    quote: /The only bad workout/.test(document.body.innerText),
    placeholders: document.querySelectorAll("[data-photo-placeholder]").length,
  };
});
check("[control] the text post renders on my profile", prof.quote);
check("a text-only post draws no broken-image tile", prof.placeholders === 0, `placeholders=${prof.placeholders}`);
check("Workouts counts workouts only (1 posted + 1 unposted = 2)", prof.count === "2", `count=${prof.count}`);

// A text post reads like Threads: the words are the body under the header, larger, not a
// "username caption" line under the action row.
const tp = await page.evaluate(() => {
  const body = document.querySelector("[data-text-post-body]");
  if (!body) return { body: false };
  let card = body.parentElement;
  while (card && !card.querySelector('button[aria-label="Share"]')) card = card.parentElement;
  const share = card?.querySelector('button[aria-label="Share"]');
  const dup = [...(card?.querySelectorAll("div") || [])].filter(d => d !== body && d.children.length && /The only bad workout/.test(d.textContent) && !d.contains(body)).length;
  return { body: /The only bad workout/.test(body.textContent), size: parseFloat(getComputedStyle(body).fontSize),
           above: share ? body.getBoundingClientRect().bottom <= share.getBoundingClientRect().top : false, dup };
});
check("a text post renders its words as the post body", tp.body, JSON.stringify(tp));
check("...at body size (>=16px), not caption size", tp.size >= 16, `size=${tp.size}`);
check("...above the action row", tp.above);
check("...and not repeated as a caption line below it", tp.dup === 0, `dup=${tp.dup}`);

// ── 3: Activity rows open what they are about ──
await page.getByLabel("Activity").click();
await page.waitForTimeout(900);
const rowCount = await page.locator("[data-activity-row]").count();
check("[control] Activity lists kudos, comment and follow rows", rowCount >= 3, `rows=${rowCount}`);

// Dismiss must not open anything.
const f0 = postFetches.length;
await page.locator('[data-activity-row="kudos"] [aria-label="Dismiss"]').first().click();
await page.waitForTimeout(600);
const overlayOpen = () => page.evaluate(() => !!document.querySelector('[data-fullscreen-overlay="true"][style*="z-index: 70"]'));
check("Dismiss only dismisses (no post opens)", !(await overlayOpen()) && postFetches.length === f0);

// Tapping a comment row opens that post over Activity.
await page.locator('[data-activity-row="comment"]').first().click();
await page.waitForTimeout(1200);
check("tapping a comment row opens the post", await overlayOpen(), `fetches=${JSON.stringify(postFetches)}`);
check("...the post it is about", postFetches.includes(P_WORK));
const painted = await page.evaluate(() => { const el = document.elementFromPoint(214, 460); return !!el?.closest('[data-fullscreen-overlay="true"]'); });
check("...and the post is on top, not behind Activity", painted);

// Close it (Back), then a follow row opens the person.
await page.getByLabel("Back").last().click({ force: true }).catch(() => {});
await page.waitForTimeout(700);
check("[control] Back returns to Activity", await page.locator("[data-activity-row]").count() > 0 && !(await overlayOpen()));
await page.locator('[data-activity-row="follow"]').first().click();
await page.waitForTimeout(1200);
// The profile is a portaled overlay; ask what is PAINTED, since innerText also reports Activity.
const onProfile = await page.evaluate(() => {
  const hit = [...document.querySelectorAll("*")].find(e => e.children.length === 0 && e.textContent.trim() === "@kai");
  if (!hit) return false;
  const r = hit.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!top && (top === hit || hit.contains(top) || top.contains(hit));
});
check("tapping a follow row opens that person's profile", onProfile);

await browser.close();
console.log(fails ? `${fails} FAIL(S)` : "ALL PASS");
process.exit(fails ? 1 : 0);
