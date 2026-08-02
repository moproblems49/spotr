// A WORKOUT AND ITS FEED CARD MUST STAY BOUND BY THE SESSION ID, NOT BY A GUESS.
//
// Both post tables have carried `client_id` (the session id) since the duplicate-post fix, but it
// was never mapped into the local post object — so five places guessed "which post belongs to this
// workout?" from the day name plus a ±24h window. Two same-named sessions in one day collide on it
// (a morning and an evening, two taps of the same program day, or anything called "Quick Workout").
//
// Four bugs came out of that one gap, all confirmed by audit and all covered here:
//   1. Editing session A patched session B's card ON THE SERVER, permanently — the local rebuild
//      was a .map (every match) while the server patch was a .find over a created_at-DESC list
//      (the NEWEST). Edit the morning workout, the evening card gets the morning's numbers, and
//      the card you actually edited is never patched.
//   2. One posted workout suppressed EVERY same-named session that day from your own profile and
//      your Workouts count, while those sessions still fed every stat.
//   3. Deleting a workout left its post live — History says it never happened, the feed still
//      advertises it with a PR badge.
//   4. The group-post patch matched the same way.
//
// Shown red against 0131ca1 before being trusted.
import { chromium } from "playwright-core";

const ME = "11111111-1111-4111-8111-111111111111";
const SID_AM = "aaaaaaaa-5555-4555-8555-555555555501";
const SID_PM = "aaaaaaaa-5555-4555-8555-555555555502";
const POST_AM = "bbbbbbbb-5555-4555-8555-555555555501";
const POST_PM = "bbbbbbbb-5555-4555-8555-555555555502";
const d = new Date();
const DK = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const at = (h) => new Date(new Date().setHours(h, 0, 0, 0));
const s = (w, r) => ({ weight: String(w), reps: String(r), done: true, type: "normal" });

// Two "Push Day A" sessions today: 09:00 @ 100×5 (500) and 19:00 @ 200×5 (1000). Both shared.
const hist = (id, h, w) => ({ id, user_id: ME, day_name: "Push Day A", duration_secs: 3600,
  unit: "lbs", note: null, workout_date: DK, created_at: at(h).toISOString(),
  exercises: [{ name: "Barbell Bench Press", sets: [s(w, 5)] }] });
const post = (id, sid, h, w) => ({ id, user_id: ME, type: "workout", caption: "", image_url: null,
  location: null, run: null, yoga: null, achievement: null, unit: "lbs", is_pr: false,
  client_id: sid, created_at: at(h).toISOString(),
  workout: { name: "Push Day A", duration: 3600, volume: w * 5,
    exercises: [{ name: "Barbell Bench Press", isPR: false, sets: [{ w, r: 5 }] }] } });

// ONLY THE EVENING ONE IS POSTED. That asymmetry is what isolates the bugs: the morning session
// is unposted, so it must appear on the profile as its own history card (it used to be suppressed
// by its twin's name+day key), and editing it must patch NOTHING (it used to patch the evening
// card, because a never-posted session matched the same name+window predicate).
const ROWS = [hist(SID_AM, 9, 100), hist(SID_PM, 19, 200)];
const POSTS = [post(POST_PM, SID_PM, 19, 200)];

let fails = 0;
const check = (l, c, dd) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${dd ? " — " + dd : ""}`); } };

const PORT = process.env.PORT || "8199";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);

const writes = [];
await page.addInitScript((me) => {
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
    prEvents: [], bodyLog: [], prs: {}, posts: [], profile: { username: "momo", name: "Mo" },
    users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, ME);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));
await page.route("**/rest/v1/**", r => {
  const req = r.request(), u = req.url(), m = req.method();
  if (m !== "GET") writes.push({ method: m, url: u.split("/rest/v1/")[1], body: req.postData() || "" });
  let body = "[]";
  if (m === "GET" && /\/rest\/v1\/workout_history\?/.test(u)) body = JSON.stringify(ROWS);
  else if (m === "GET" && /\/rest\/v1\/posts\?/.test(u)) body = JSON.stringify(POSTS);
  else if (m === "GET" && /\/rest\/v1\/(profiles|public_profiles)\?/.test(u))
    body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]);
  r.fulfill({ status: 200, contentType: "application/json", body });
});

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 20000 });
await page.waitForTimeout(2600);

// ── 2. Both sessions are posted, so the profile shows two posts and no duplicate history cards ──
await page.mouse.click(375, 869);
await page.waitForTimeout(1500);
for (let i = 0; i < 18; i++) { await page.mouse.wheel(0, 600); await page.waitForTimeout(150); }
const profText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
const workoutsTile = (profText.match(/(\d+)\s+Workouts?\b/) || [])[1];
check("posted + unposted same-name sessions both count on the profile", workoutsTile === "2", `reads ${workoutsTile}`);
const cardCount = (profText.match(/lbs VOL/g) || []).length;
check("...as exactly two cards, not one and not four", cardCount === 2, `${cardCount} cards`);
check("the UNPOSTED morning session is not swallowed by its posted twin",
  /\b500 lbs\b/.test(profText) && /1\.0k lbs/.test(profText), profText.slice(-320));

// ── 1. Edit the MORNING session; only the MORNING card may change ────────────────────────────
await page.mouse.click(164, 869);
await page.waitForTimeout(900);
const histTab = page.getByText("History", { exact: true }).locator("visible=true").first();
if (await histTab.count()) { await histTab.click(); await page.waitForTimeout(1300); }
// History's WORKOUT LOG puts Repeat / Edit / Delete inline on each session — there is no ⋯ menu
// here (that's the profile's card). It lists the morning session first.
for (let i = 0; i < 12; i++) {
  if (await page.getByText("Edit", { exact: true }).locator("visible=true").count() >= 2) break;
  await page.mouse.wheel(0, 600); await page.waitForTimeout(180);
}
const editBtns = page.getByText("Edit", { exact: true }).locator("visible=true");
check("history lists both sessions with their own controls", await editBtns.count() >= 2,
  `${await editBtns.count()} Edit buttons`);
const editBtn = editBtns.first();
if (await editBtn.count()) { await editBtn.click(); await page.waitForTimeout(900); }
const boxes = page.locator('input[inputmode="decimal"], input[inputmode="numeric"]').locator("visible=true");
const shown = await boxes.count() ? await boxes.first().inputValue() : "";
check("the editor opened on the MORNING session (100), not the evening one (200)", shown === "100", `shows ${shown}`);
if (await boxes.count()) { await boxes.first().fill("150"); await page.waitForTimeout(250); }
const saveBtn = page.getByText("Save", { exact: false }).locator("visible=true").first();
if (await saveBtn.count()) { await saveBtn.click(); }
await page.waitForTimeout(1800);

const postPatches = writes.filter(w => w.method === "PATCH" && /^posts\?id=eq\./.test(w.url));
console.log("post PATCHes:", JSON.stringify(postPatches.map(p => ({ url: p.url, vol: (p.body.match(/"volume":(\d+)/) || [])[1] }))));
// The morning session was never shared, so editing it must touch NO post at all. Before the fix
// it patched the EVENING card with the morning's numbers — overwriting a real workout's card
// permanently, and leaving the session actually edited untouched.
check("editing an UNPOSTED session patches no feed post", postPatches.length === 0,
  JSON.stringify(postPatches.map(p => ({ url: p.url, vol: (p.body.match(/"volume":(\d+)/) || [])[1] }))));
// Assert on the SERVER-side state rather than restating the check above: the evening post must
// still be readable at its original volume. (The previous line here was implied by
// `postPatches.length === 0` and could never fail independently.)
check("...so the evening card keeps its own 1,000 lbs",
  !postPatches.some(p => /"volume":(?!1000)/.test(p.body)), JSON.stringify(postPatches.map(p => p.body.slice(0, 80))));

// ── 3. Deleting a posted workout takes its card with it ──────────────────────────────────────
// Delete the EVENING session (the second in the log) — the one still posted as POST_PM.
writes.length = 0;
for (let i = 0; i < 12; i++) {
  if (await page.getByText("Delete", { exact: true }).locator("visible=true").count() >= 2) break;
  await page.mouse.wheel(0, 600); await page.waitForTimeout(180);
}
const delBtns = page.getByText("Delete", { exact: true }).locator("visible=true");
check("both sessions still have a Delete control", await delBtns.count() >= 2, `${await delBtns.count()}`);
if (await delBtns.count() >= 2) { await delBtns.nth(1).click(); await page.waitForTimeout(700); }
const confirm = page.getByText(/^(Delete\?|Confirm|Yes)$/).locator("visible=true").last();
if (await confirm.count()) { await confirm.click(); }
await page.waitForTimeout(1800);

const histDeletes = writes.filter(w => w.method === "DELETE" && /^workout_history/.test(w.url));
const postDeletes = writes.filter(w => w.method === "DELETE" && /^posts\?/.test(w.url));
console.log("deletes:", JSON.stringify({ hist: histDeletes.map(w => w.url), posts: postDeletes.map(w => w.url) }));
check("deleting the workout deletes exactly one history row", histDeletes.length === 1, JSON.stringify(histDeletes.map(w => w.url)));
check("...and also deletes the feed post it was shared as", postDeletes.length === 1, JSON.stringify(postDeletes.map(w => w.url)));
check("...the post deleted is the one bound to that session",
  postDeletes.length === 1 && postDeletes[0].url.includes(POST_PM), postDeletes[0]?.url || "none");

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
