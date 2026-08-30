// SHARE ON A FEED POST SENDS THE POST TO PEOPLE YOU FOLLOW, AND THE RECIPIENT CAN OPEN IT.
//
// Mo: "When clicking on share under a feed post, that should share with friends or groups."
// It used to open the OS share sheet carrying `window.location.href` — which inside the native
// shell is `capacitor://localhost/`, a dead scheme nobody else can open. So the button was both
// the wrong interaction AND broken.
//
// What this asserts, and why each one rather than "the sheet opened":
//  - the sheet lists people I FOLLOW (not followers, not everyone in store.users)
//  - Send actually POSTs a `messages` row per recipient — a local-only send is the dominant bug
//    class in this app, so the check is on the WRITE, not on the toast
//  - the message carries a /p/<uuid> link, which is the whole privacy design: a link carries no
//    content, so the recipient still has to pass the poster's own RLS
//  - the recipient's chat renders it as a tappable card, not a raw URL
//  - tapping it opens the post view, and a post the server refuses renders "isn't available"
//    rather than an error or a blank screen
import { chromium } from "playwright-core";

const ME   = "11111111-1111-4111-8111-111111111111";
const PAL  = "22222222-2222-4222-8222-222222222222"; // I follow them
const STR  = "33333333-3333-4333-8333-333333333333"; // follows me, I do NOT follow back
const POST = "44444444-4444-4444-8444-444444444444";
const AUTH = "55555555-5555-4555-8555-555555555555"; // the post's author

const POST_ROW = {
  id: POST, user_id: AUTH, type: "workout", caption: "Leg day", image_url: null,
  unit: "lbs", is_pr: false, client_id: null, created_at: new Date().toISOString(),
  workout: { name: "Legs", duration: 3600, volume: 12000, exercises: [{ name: "Back Squat", sets: [{ w: 225, r: 5 }] }] },
  kudos: [], comments: [],
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 200)); });

const sent = [];      // every messages POST body the client actually made
let postVisible = true; // flip to model "RLS says you can't see this"

await page.addInitScript((ids) => {
  const [me, pal, str, auth] = ids;
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
    prEvents: [], bodyLog: [], prs: {}, posts: [], profile: { username: "momo", name: "Mo" },
    users: [
      { id: me,  username: "momo",  name: "Mo",     followers: [str], following: [pal, auth] },
      { id: pal, username: "pally", name: "Pally",  followers: [me],  following: [] },
      { id: str, username: "strang", name: "Strang", followers: [],   following: [me] },
      // AUTH is deliberately ABSENT: the post view must resolve them from public_profiles.
    ],
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, [ME, PAL, STR, AUTH]);

await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));

await page.route("**/rest/v1/**", async r => {
  const req = r.request();
  const u = req.url();
  const m = req.method();
  if (/\/rest\/v1\/messages/.test(u) && m === "POST") {
    const body = JSON.parse(req.postData() || "{}");
    sent.push(body);
    return r.fulfill({ status: 201, contentType: "application/json",
      body: JSON.stringify([{ ...body, id: "msg_" + sent.length, created_at: new Date().toISOString(), read_at: null }]) });
  }
  if (/\/rest\/v1\/messages/.test(u)) {
    // the chat thread: replay what was sent
    return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify(sent.map((s, i) => ({ ...s, id: "msg_" + (i + 1), created_at: new Date().toISOString(), read_at: null }))) });
  }
  if (/\/rest\/v1\/posts\?id=eq\./.test(u)) {
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(postVisible ? [POST_ROW] : []) });
  }
  if (/\/rest\/v1\/posts\?/.test(u)) {
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([POST_ROW]) });
  }
  if (/\/rest\/v1\/follows\?/.test(u) && m === "GET") {
    // loadUserData REBUILDS following/followers from this table and replaces store.users
    // wholesale, so a fixture that only seeds localStorage loses its social graph on the first
    // foreground — the documented seed-through-the-stub rule.
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      { follower_id: ME,  following_id: PAL,  status: "accepted" },
      { follower_id: ME,  following_id: AUTH, status: "accepted" },
      { follower_id: STR, following_id: ME,   status: "accepted" },
    ]) });
  }
  if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u)) {
    // Answer by id — a stub that returns the same row for every lookup cannot tell a
    // resolved author from an unresolved one.
    if (u.includes(`id=eq.${AUTH}`)) {
      return r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify([{ id: AUTH, username: "lifter", name: "Lifter", bio: "", avatar_url: "", is_public: true }]) });
    }
    if (/public_profiles/.test(u) && !/id=eq\./.test(u)) {
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
        { id: ME,  username: "momo",   name: "Mo",     bio: "", avatar_url: "", is_public: true },
        { id: PAL, username: "pally",  name: "Pally",  bio: "", avatar_url: "", is_public: true },
        { id: STR, username: "strang", name: "Strang", bio: "", avatar_url: "", is_public: true },
      ]) });
    }
    return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]) });
  }
  r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
});

const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));

await page.goto(`http://127.0.0.1:${process.env.PORT || 8199}/`, { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => !/Setting up your account/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2200);

// ── Reach the feed ────────────────────────────────────────────────────────────
const home = page.locator('[aria-label="Home"], [aria-label="Feed"]').first();
if (await home.count()) { await home.click({ force: true }); await page.waitForTimeout(1200); }
let t = await text();
check("0. the feed rendered the seeded post", /Leg day/.test(t), t.slice(0, 220));

// ── 1. Share opens the in-app picker, not the OS sheet ───────────────────────
const share = page.locator('button[aria-label="Share"]').first();
check("1a. the post carries a Share button", await share.count() > 0);
await share.click({ force: true });
await page.waitForTimeout(700);
t = await text();
check("1b. tapping Share opens a 'Send to' sheet", /Send to/.test(t), t.slice(0, 260));

// ── 2. It lists who I FOLLOW, and nobody else ────────────────────────────────
// The two absence checks are only meaningful while the sheet is actually open — otherwise they
// pass on a build where Share does nothing at all, which is exactly the build this suite exists
// to fail. Gate them on the sheet, and SKIP loudly rather than passing quietly.
const sheetOpen = /Send to/.test(t);
check("2a. someone I follow is listed", sheetOpen && /Pally/.test(t), t.slice(0, 300));
if (!sheetOpen) { fails++; console.log("FAIL 2b/2c. cannot judge the recipient list — the sheet never opened"); }
else {
  check("2b. a follower I do NOT follow back is absent", !/Strang/.test(t), t.slice(0, 300));
  check("2c. I am not offered as a recipient", !/@momo/.test(t), t.slice(0, 300));
}

// ── 3. Send writes a real message row per recipient ──────────────────────────
const palPick = page.getByText("Pally", { exact: false }).first();
if (await palPick.count()) { await palPick.click({ force: true }); await page.waitForTimeout(300); }
const sendBtn = page.getByRole("button", { name: /^Send to \d+$/ }).first();
const canSend = await sendBtn.count() > 0;
check("3a. the Send button counts the picked recipients", canSend);
if (canSend) { await sendBtn.click({ force: true }); await page.waitForTimeout(1200); }

check("3b. exactly one messages row was POSTed", sent.length === 1, JSON.stringify(sent));
const msg = sent[0] || {};
check("3c. it is addressed to the person I picked", msg.recipient_id === PAL, JSON.stringify(msg));
check("3d. it is from me", msg.sender_id === ME, JSON.stringify(msg));
const linkRe = new RegExp(`/p/${POST}`);
check("3e. it carries a /p/<postId> link, not the workout itself", linkRe.test(msg.text || ""), msg.text);
// The whole privacy argument: a link, not a copy. If the card's own numbers ever leak into the
// message body this check goes red and the design has quietly changed.
check("3f. it does NOT embed the workout's contents", !/225|12000|Back Squat/.test(msg.text || ""), msg.text);

t = await text();
check("3g. the sheet closed and confirmed", !/Send to/.test(t) && /Sent to 1 person/i.test(t), t.slice(0, 240));

// ── 4. The recipient's chat renders it as a card, not a raw URL ──────────────
const msgsBtn = page.locator('[aria-label="Messages"]').first();
if (await msgsBtn.count()) { await msgsBtn.click({ force: true }); await page.waitForTimeout(1000); }
const palRow = page.getByText("Pally", { exact: false }).first();
if (await palRow.count()) { await palRow.click({ force: true }); await page.waitForTimeout(1400); }
t = await text();
check("4a. the chat thread opened", /Pally/.test(t), t.slice(0, 200));
check("4b. the shared post shows as a card, not a bare link", /TAP TO VIEW/.test(t), t.slice(0, 300));
check("4c. the raw URL is not printed at the user", !/https?:\/\//.test(t), t.slice(0, 300));

// ── 5. Tapping it opens the post ─────────────────────────────────────────────
const cardBtn = page.locator('button[aria-label^="Open shared post"]').first();
const haveCard = await cardBtn.count() > 0;
check("5a. the card is a real button with an accessible name", haveCard);
if (haveCard) { await cardBtn.click({ force: true }); await page.waitForTimeout(1600); }
t = await text();
check("5b. the post view opened", /Leg day/.test(t), t.slice(0, 300));
// Real check, not a restatement of the fixture: AUTH was never in store.users, so this name
// can only be on screen because the post view fetched public_profiles for them.
check("5c. it resolves an author the client had never loaded", /Lifter|lifter/.test(t), t.slice(0, 300));

// ── 6. A post the server refuses reads as unavailable, not as an error ───────
await page.evaluate(() => document.querySelectorAll('[data-fullscreen-overlay] button[aria-label="Back"]').forEach(b => b.click()));
await page.waitForTimeout(600);
postVisible = false;
await page.evaluate((id) => window.dispatchEvent(new CustomEvent("seshd:open-post", { detail: { id } })), POST);
await page.waitForTimeout(1600);
t = await text();
check("6a. an invisible post says so plainly", /isn't available/i.test(t), t.slice(0, 300));
check("6b. it explains why without blaming the reader", /private/i.test(t), t.slice(0, 300));

await page.screenshot({ path: "build/shot_sharepost.png", fullPage: false });
console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
await b.close();
process.exit(fails === 0 ? 0 : 1);
