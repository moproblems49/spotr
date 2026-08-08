// THE ACTIVITY SCREEN: YOU CAN ALWAYS GET OUT, NOTHING EXPIRES, AND DISMISSALS STICK.
//
// Activity is opened from the heart in the top bar and is NOT one of the four swipe tabs, so the
// tab gesture cannot reach it — for a long time there was no back affordance at all. Adding one
// introduced a trap immediately: the top bar stays visible ON the Activity screen, so tapping the
// heart a second time recorded "activity" as the tab to go back TO, and Back then did nothing.
// Measured before the fix: two taps and the only way out was the nav bar.
//
// The other two properties are Mo's, and they pull against each other:
//   • activity NEVER expires — a like from a year ago is still the only record it happened, so
//     nothing may be binned on a timer;
//   • which means a dismissal must persist FOREVER, since the event behind it never ages out.
//     Pruning dismissals by age (which an earlier cut did) would resurrect every row the user had
//     deliberately cleared.
//
// FIXTURE NOTE: loadUserData REPLACES the localStorage-seeded store with the server copy, so the
// posts have to come from the fetch stub. Seeding only `seshd_v1` renders an empty Activity list
// and every assertion below then passes for the wrong reason.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
const FR = "22222222-2222-4222-8222-222222222222";
const OLD = new Date(Date.now() - 400 * 864e5).toISOString();   // 13 months
const NEW = new Date(Date.now() - 3600e3).toISOString();

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 428, height: 926 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.setDefaultTimeout(4000);

await page.addInitScript((me) => {
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
    prEvents: [], bodyLog: [], prs: {}, posts: [], groups: [],
    profile: { username: "momo", name: "Mo" }, users: [],
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: me, email: "m@e.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, ME);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: ME, email: "m@e.com" } }) }));
await page.route("**/rest/v1/**", r => {
  const u = r.request().url();
  let body = "[]";
  if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u)) {
    body = JSON.stringify([
      { id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" },
      { id: FR, username: "kai", name: "Kai", is_public: true },
    ]);
  } else if (/\/rest\/v1\/posts\?/.test(u)) {
    body = JSON.stringify([
      { id: "pOld", user_id: ME, caption: "ancient", type: "text", created_at: OLD,
        kudos: [{ user_id: FR }], comments: [{ id: "cOld", user_id: FR, text: "old comment", likes: [], created_at: OLD }] },
      { id: "pNew", user_id: ME, caption: "fresh", type: "text", created_at: NEW,
        kudos: [{ user_id: FR }], comments: [] },
    ]);
  }
  r.fulfill({ status: 200, contentType: "application/json", body });
});

const bodyText = () => page.evaluate(() => document.body.innerText);
const onActivity = async () => /No activity yet|Show \d+ hidden|liked your post|commented:/.test(await bodyText());
const openActivity = async () => { await page.getByLabel("Activity").click(); await page.waitForTimeout(800); };

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1700);

// ── 0. The fixture has to have reached the screen ────────────────────────────────────────────
await openActivity();
const t0 = await bodyText();
check("the activity screen rendered with real rows", /kai/.test(t0), JSON.stringify(t0.slice(0, 140)));

// ── 1. NOTHING EXPIRES ───────────────────────────────────────────────────────────────────────
check("a 13-month-old comment is still listed", /old comment/.test(t0), JSON.stringify(t0.slice(0, 200)));
const total = await page.getByLabel("Dismiss").count();
check("...and every event is present (2 kudos + 1 comment)", total === 3, String(total));

// ── 2. THERE IS ALWAYS A WAY OUT, even after a second tap on the heart ───────────────────────
await openActivity();                       // the trap: heart tapped again while already here
check("still on activity after a second heart tap", await onActivity());
await page.getByLabel("Back").first().click();
await page.waitForTimeout(800);
check("Back leaves the screen even after the second tap", !(await onActivity()), await bodyText().then(t => JSON.stringify(t.slice(0, 90))));

// ── 3. DISMISSAL STICKS ACROSS A RELOAD ──────────────────────────────────────────────────────
await openActivity();
await page.getByLabel("Dismiss").last().click();
await page.waitForTimeout(400);
check("dismissing hides that row", await page.getByLabel("Dismiss").count() === total - 1);
check("...and the header offers it back", /Show 1 hidden/.test(await bodyText()));

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1700);
await openActivity();
const after = await page.getByLabel("Dismiss").count();
check("the dismissal survives a reload", after === total - 1, `${total} -> ${after}`);
check("...and it is still offered back", /Show 1 hidden/.test(await bodyText()));

// ── 4. RESTORING BRINGS IT BACK ──────────────────────────────────────────────────────────────
await page.getByRole("button", { name: /Show 1 hidden/ }).click();
await page.waitForTimeout(400);
check("restoring returns the dismissed row", await page.getByLabel("Dismiss").count() === total,
  String(await page.getByLabel("Dismiss").count()));

// ── 5. A DISMISS KEY MUST IDENTIFY EXACTLY ONE ROW ───────────────────────────────────────────
// Two kudos rows for the same post and the same actor previously produced an identical key, so
// one click removed both. Kudos are keyed on (post, actor) only — no timestamp, because they
// carry none of their own and inherit post.createdAt, which resurrects a dismissal if the post is
// ever re-serialised a millisecond apart.
{
  const p2 = await ctx.newPage();
  p2.setDefaultTimeout(4000);
  await p2.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: ME, email: "m@e.com" } }) }));
  await p2.route("**/rest/v1/**", r => {
    const u = r.request().url();
    let body = "[]";
    if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u)) {
      body = JSON.stringify([
        { id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" },
        { id: FR, username: "kai", name: "Kai", is_public: true },
      ]);
    } else if (/\/rest\/v1\/posts\?/.test(u)) {
      // Two comments from the same person with NO id, same timestamp — the shape that collided.
      body = JSON.stringify([{ id: "pX", user_id: ME, caption: "x", type: "text", created_at: NEW,
        kudos: [{ user_id: FR }],
        comments: [{ user_id: FR, text: "first", likes: [], created_at: NEW },
                   { user_id: FR, text: "second", likes: [], created_at: NEW }] }]);
    }
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await p2.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await p2.waitForTimeout(1700);
  await p2.getByLabel("Activity").click(); await p2.waitForTimeout(800);
  const before = await p2.getByLabel("Dismiss").count();
  check("three distinct rows from id-less comments", before === 3, String(before));
  await p2.getByLabel("Dismiss").first().click();
  await p2.waitForTimeout(400);
  const now2 = await p2.getByLabel("Dismiss").count();
  check("dismissing one hides exactly one", now2 === before - 1, `${before} -> ${now2}`);
  await p2.close();
}

await browser.close();
console.log(fails ? `${fails} FAIL(S)` : "ALL PASS");
process.exit(fails ? 1 : 0);
