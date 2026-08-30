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
const GRP  = "66666666-6666-4666-8666-666666666666"; // a group I'm in
const BLK  = "77777777-7777-4777-8777-777777777777"; // I follow them AND I have blocked them
// ★ A post the FEED NEVER RETURNS. Section 7 has to open one of these or it proves nothing: the
// bug is that handleKudos does `store.posts.find(...)`, and a post already loaded by the feed is
// found with or without the fix. A shared link routinely points at a post the client has never
// seen — someone you don't follow, or one that has fallen off the newest page.
const POST2 = "88888888-8888-4888-8888-888888888888";
const STRANGER = "99999999-9999-4999-8999-999999999999";

const POST2_ROW = {
  id: POST2, user_id: STRANGER, type: "workout", caption: "Pull day", image_url: null,
  // 10 minutes old ON PURPOSE: loadFeed carries only posts under 2 minutes old, so a "just now"
  // fixture makes the eviction check vacuous — the post would survive for the wrong reason.
  unit: "lbs", is_pr: false, client_id: null, created_at: new Date(Date.now() - 10*60*1000).toISOString(),
  workout: { name: "Pull", duration: 3000, volume: 9000, exercises: [{ name: "Barbell Row", sets: [{ w: 135, r: 8 }] }] },
  kudos: [], comments: [],
};

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

const sent = [];       // every messages POST body the client actually made
const groupSent = [];  // every group_posts POST body
const kudosSent = [];  // every kudos POST body
const kudosWrites = []; // every kudos write, either direction
let postVisible = true; // flip to model "RLS says you can't see this"

await page.addInitScript((ids) => {
  const [me, pal, str, auth, grp, blk] = ids;
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
    prEvents: [], bodyLog: [], prs: {}, posts: [], profile: { username: "momo", name: "Mo" },
    blockedUsers: [blk],
    groups: [{ id: grp, name: "Seshd Crew", member_ids: [me, pal], members: [me, pal] }],
    users: [
      { id: me,  username: "momo",  name: "Mo",     followers: [str], following: [pal, auth] },
      { id: pal, username: "pally", name: "Pally",  followers: [me],  following: [] },
      { id: blk, username: "blocky", name: "Blocky", followers: [me],  following: [] },
      { id: str, username: "strang", name: "Strang", followers: [],   following: [me] },
      // AUTH is deliberately ABSENT: the post view must resolve them from public_profiles.
    ],
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, [ME, PAL, STR, AUTH, GRP, BLK]);

await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));

await page.route("**/rest/v1/**", async r => {
  const req = r.request();
  const u = req.url();
  const m = req.method();
  if (/\/rest\/v1\/kudos/.test(u) && m === "POST") {
    const body = JSON.parse(req.postData() || "{}");
    kudosSent.push(body); kudosWrites.push("POST");
    return r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([{ ...body, id: "k_" + kudosSent.length }]) });
  }
  if (/\/rest\/v1\/kudos/.test(u) && m === "DELETE") {
    kudosWrites.push("DELETE");
    return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  }
  if (/\/rest\/v1\/group_posts/.test(u) && m === "POST") {
    const body = JSON.parse(req.postData() || "{}");
    groupSent.push(body);
    return r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([{ ...body, id: "gp_" + groupSent.length, created_at: new Date().toISOString() }]) });
  }
  if (/\/rest\/v1\/groups\?/.test(u) && m === "GET") {
    return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify([{ id: GRP, name: "Seshd Crew", created_by: ME, member_ids: [ME, PAL] }]) });
  }
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
    if (u.includes(POST2)) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([POST2_ROW]) });
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(postVisible ? [POST_ROW] : []) });
  }
  if (/\/rest\/v1\/posts\?/.test(u)) {
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([POST_ROW]) });
  }
  if (/\/rest\/v1\/blocked_users\?/.test(u) && m === "GET") {
    // loadUserData REPLACES store.blockedUsers from this table, so seeding it into localStorage
    // alone is wiped on the first foreground — same trap as the social graph below.
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ blocked_id: BLK }]) });
  }
  if (/\/rest\/v1\/follows\?/.test(u) && m === "GET") {
    // loadUserData REBUILDS following/followers from this table and replaces store.users
    // wholesale, so a fixture that only seeds localStorage loses its social graph on the first
    // foreground — the documented seed-through-the-stub rule.
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      // A self-follow row exists ON PURPOSE: without it "I am not offered as a recipient" is
      // satisfied by the fixture rather than by the app's own `u.id !== currentUserId` guard,
      // which could then be deleted with the check still green.
      { follower_id: ME,  following_id: ME,   status: "accepted" },
      { follower_id: ME,  following_id: PAL,  status: "accepted" },
      { follower_id: ME,  following_id: AUTH, status: "accepted" },
      { follower_id: STR, following_id: ME,   status: "accepted" },
      { follower_id: ME,  following_id: BLK,  status: "accepted" },
    ]) });
  }
  if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u)) {
    // Answer by id — a stub that returns the same row for every lookup cannot tell a
    // resolved author from an unresolved one.
    if (u.includes(`id=eq.${STRANGER}`)) {
      return r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify([{ id: STRANGER, username: "stranger", name: "Stranger", bio: "", avatar_url: "", is_public: true }]) });
    }
    if (u.includes(`id=eq.${AUTH}`)) {
      return r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify([{ id: AUTH, username: "lifter", name: "Lifter", bio: "", avatar_url: "", is_public: true }]) });
    }
    if (/public_profiles/.test(u) && !/id=eq\./.test(u)) {
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
        { id: ME,  username: "momo",   name: "Mo",     bio: "", avatar_url: "", is_public: true },
        { id: PAL, username: "pally",  name: "Pally",  bio: "", avatar_url: "", is_public: true },
        { id: STR, username: "strang", name: "Strang", bio: "", avatar_url: "", is_public: true },
        { id: BLK, username: "blocky", name: "Blocky", bio: "", avatar_url: "", is_public: true },
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
  check("2d. a person I follow but have BLOCKED is absent", !/Blocky/.test(t), t.slice(0, 300));
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
check("3g. the sheet closed and confirmed", !/Send to/.test(t) && /\bSent\b/.test(t), t.slice(0, 240));

// ── 3h-3k. Groups are offered and a group share writes a real group_posts row ────────────────
await share.click({ force: true });
await page.waitForTimeout(700);
t = await text();
check("3h. groups I'm in are offered alongside people", /Seshd Crew/.test(t), t.slice(0, 320));
const grpRow = page.getByText("Seshd Crew", { exact: false }).first();
if (await grpRow.count()) { await grpRow.click({ force: true }); await page.waitForTimeout(300); }
const sendBtn2 = page.getByRole("button", { name: /^Send to \d+$/ }).first();
const canSend2 = await sendBtn2.count() > 0;
check("3i. picking a group arms Send", canSend2);
if (canSend2) { await sendBtn2.click({ force: true }); await page.waitForTimeout(1200); }
check("3j. exactly one group_posts row was written", groupSent.length === 1, JSON.stringify(groupSent));
const gp = groupSent[0] || {};
check("3k. it targets the group I picked, as a text post carrying the link",
  gp.group_id === GRP && gp.type === "text" && linkRe.test(gp.caption || ""), JSON.stringify(gp));
check("3l. the group post does NOT copy the workout", !gp.workout && !/225|12000|Back Squat/.test(gp.caption || ""), JSON.stringify(gp));
// A group share must not also fire a DM — the two pickers are separate lists on purpose.
check("3m. sharing to a group sent no extra DM", sent.length === 1, JSON.stringify(sent));

// ── 3n. Copy link is available at the bottom, and copies the post's own URL ──────────────────
await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
await share.click({ force: true });
await page.waitForTimeout(700);
const copyBtn = page.getByRole("button", { name: /Copy link/i }).first();
check("3n. a Copy link row sits under the picker", await copyBtn.count() > 0);
if (await copyBtn.count()) {
  await copyBtn.click({ force: true });
  await page.waitForTimeout(700);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  check("3o. it copies the post's link, not the app's own address", linkRe.test(clip) && !/capacitor:/.test(clip), clip);
  t = await text();
  check("3p. it closes the sheet and confirms", !/Send to/.test(t) && /Link copied/i.test(t), t.slice(0, 200));
}

// ── 4. The recipient's chat renders it as a card, not a raw URL ──────────────
const msgsBtn = page.locator('[aria-label="Messages"]').first();
if (await msgsBtn.count()) { await msgsBtn.click({ force: true }); await page.waitForTimeout(1000); }
const palRow = page.getByText("Pally", { exact: false }).first();
if (await palRow.count()) { await palRow.click({ force: true }); await page.waitForTimeout(1400); }
t = await text();
check("4a. the chat thread opened", /Pally/.test(t), t.slice(0, 200));
check("4b. the shared post shows as a card, not a bare link", /TAP TO VIEW/.test(t), t.slice(0, 300));
// Scoped to the CHAT, not the whole document: the Messages list is mounted behind an open chat
// now (it used to be an early return), and `innerText` reports covered DOM. Judging this from the
// body would be the documented overlay trap. The list's own preview is checked at 4d.
const chatText = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[placeholder="Message…"],[placeholder="Message..."]')][0];
  const root = el ? el.closest("div[style]")?.parentElement?.parentElement : null;
  return (root || document.body).innerText.replace(/\s+/g, " ");
});
check("4c. the raw URL is not printed in the thread", !/https?:\/\//.test(chatText), chatText.slice(0, 300));
check("4d. nor in the Messages list preview", !/https?:\/\/\S*\/p\//.test(t), t.slice(0, 300));

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

// ── 7. The actions ON the post view work — they were dead, and this is the screen the whole
//       feature exists to produce. handleKudos/handleComment open with a store.posts lookup, and
//       a post opened from a shared link is by definition one the client never loaded. ──────────
postVisible = true;
await page.evaluate((id) => window.dispatchEvent(new CustomEvent("seshd:open-post", { detail: { id } })), POST2);
await page.waitForTimeout(1800);
t = await text();
check("7a. a post the feed never loaded opens", /Pull day/.test(t), t.slice(0, 200));
const flame = page.locator('[data-fullscreen-overlay] button[aria-label="Give kudos"]').first();
const haveFlame = await flame.count() > 0;
check("7b. the post view offers kudos", haveFlame);
if (haveFlame) {
  await flame.click({ force: true });
  await page.waitForTimeout(1200);
  check("7c. a kudos row actually reached the server", kudosSent.length === 1, JSON.stringify(kudosSent));
  check("7d. it is for this post, from me", (kudosSent[0] || {}).post_id === POST2 && (kudosSent[0] || {}).user_id === ME, JSON.stringify(kudosSent));
}

// ── 8. Inside a CHAT, the overlay's own hosts exist. sharePostTo/reportContent/confirmAction are
//       module-level setters into components that the chatPeerId early return unmounted, so every
//       one of them was a silent no-op on the one screen shared posts arrive at. ────────────────
await page.evaluate(() => { const b = document.querySelector('[data-fullscreen-overlay] button[aria-label="Back"]'); if (b) b.click(); });
await page.waitForTimeout(500);
const msgs2 = page.locator('[aria-label="Messages"]').first();
if (await msgs2.count()) { await msgs2.click({ force: true }); await page.waitForTimeout(1000); }
const pal2 = page.getByText("Pally", { exact: false }).first();
if (await pal2.count()) { await pal2.click({ force: true }); await page.waitForTimeout(1400); }
const card2 = page.locator('button[aria-label^="Open shared post"]').first();
if (await card2.count()) { await card2.click({ force: true }); await page.waitForTimeout(1700); }
t = await text();
check("8a. the post opened from inside the chat", /Leg day/.test(t), t.slice(0, 220));
const shareInOverlay = page.locator('[data-fullscreen-overlay] button[aria-label="Share"]').first();
const haveShare2 = await shareInOverlay.count() > 0;
check("8b. the overlay has its Share button here too", haveShare2);
if (haveShare2) {
  await shareInOverlay.click({ force: true });
  await page.waitForTimeout(800);
  t = await text();
  check("8c. Share works inside a chat — the host is mounted on this return", /Send to/.test(t), t.slice(0, 240));
}

// ── 9. A chat opened from a PROFILE must be on top of it. The chat sat at z55 under the profile
//       overlay's z60 and `onMessage` never closes the profile, so Message opened an INVISIBLE
//       chat that still polled and PATCHed `read_at` on incoming DMs. Reload first: the earlier
//       sections leave overlays open, and a probe that starts from accumulated state measures
//       whatever it happens to land on. ────────────────────────────────────────────────────────
await page.goto(`http://127.0.0.1:${process.env.PORT || 8199}/`, { waitUntil: "load", timeout: 20000 });
await page.waitForTimeout(2600);
await page.evaluate((id) => window.dispatchEvent(new CustomEvent("seshd:open-post", { detail: { id } })), POST);
await page.waitForTimeout(1800);
// Tapping the author in the overlay closes it and opens the profile (onUserClick). The card
// renders the USERNAME, not the display name, so match that.
const authorTap = page.locator('[data-fullscreen-overlay]').getByText(/^lifter$/i).first();
if (await authorTap.count()) { await authorTap.click({ force: true }); await page.waitForTimeout(1900); }
t = await text();
const onProfile = /Followers/i.test(t) && /Following/i.test(t);
check("9a. tapping a feed author opens their profile", onProfile, t.slice(0, 220));
if (onProfile) {
  const msgBtn = page.getByRole("button", { name: /^Message$/i }).first();
  const haveMsg = await msgBtn.count() > 0;
  check("9b. the profile offers Message", haveMsg);
  if (haveMsg) {
    await msgBtn.click({ force: true });
    await page.waitForTimeout(1600);
    // elementFromPoint, not innerText: the documented overlay trap means the chat's text is
    // reported whether or not it is actually visible. Ask what is PAINTED at the composer.
    const onTop = await page.evaluate(() => {
      const el = document.querySelector('[placeholder="Message…"],[placeholder="Message..."]');
      if (!el) return "no-composer";
      const r = el.getBoundingClientRect();
      if (!r.width) return "composer-not-laid-out";
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return (el === top || el.contains(top)) ? "on-top" : "COVERED by " + (top ? top.tagName + "." + String(top.className).slice(0,30) : "?");
    });
    check("9c. the chat opens ON TOP of the profile, not beneath it", onTop === "on-top", String(onTop));
  }
}

// ── 11. An overlay must never mount UNDERNEATH one already on screen. The reachable case: from a
//        DM, open the shared post (z70 over the chat's z65), then tap the poster's name. That used
//        to clear postView but NOT chatPeerId, so the profile (z60) mounted under the chat — the
//        user tapped a name, the post closed, the chat reappeared, and the profile was invisible
//        until they closed the chat and landed somewhere they never chose. Every entry point goes
//        through presentChat/presentProfile now, which dismiss whatever could paint over the
//        thing being presented. ─────────────────────────────────────────────────────────────────
await page.goto(`http://127.0.0.1:${process.env.PORT || 8199}/`, { waitUntil: "load", timeout: 20000 });
await page.waitForTimeout(2600);
const msgs11 = page.locator('[aria-label="Messages"]').first();
if (await msgs11.count()) { await msgs11.click({ force: true }); await page.waitForTimeout(1100); }
const pal11 = page.getByText("Pally", { exact: false }).first();
if (await pal11.count()) { await pal11.click({ force: true }); await page.waitForTimeout(1400); }
const card11 = page.locator('button[aria-label^="Open shared post"]').first();
const haveCard11 = await card11.count() > 0;
check("11a. a shared post is reachable from the chat", haveCard11);
if (haveCard11) {
  await card11.click({ force: true });
  await page.waitForTimeout(1700);
  check("11b. the post opened over the chat", /Leg day/.test(await text()));
  const author11 = page.locator('[data-fullscreen-overlay]').getByText(/^lifter$/i).first();
  if (await author11.count()) { await author11.click({ force: true }); await page.waitForTimeout(1900); }
  // Ask what is PAINTED, not what innerText reports — an overlay does not remove the DOM beneath
  // it, so a hidden profile still shows up in the text of the page.
  const vis = await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find(n => n.children.length === 0 && /^Followers$/i.test((n.textContent||"").trim()));
    if (!el) return "no-profile";
    const r = el.getBoundingClientRect();
    if (!r.width) return "profile-not-laid-out";
    const top = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
    // The label sits INSIDE a button, so the topmost node at that point is legitimately its own
    // ancestor. Visible means the hit lands anywhere on the same branch — either direction.
    const sameBranch = top && (top === el || el.contains(top) || top.contains(el));
    return sameBranch ? "visible" : "COVERED by " + (top ? top.tagName + "." + String(top.className).slice(0,24) : "?");
  });
  check("11c. tapping the author shows the profile, not an invisible one under the chat",
    vis === "visible", String(vis));
}

await page.screenshot({ path: "build/shot_sharepost.png", fullPage: false });
// ── 10. The merged post must SURVIVE a feed refresh, or every action on it dies again. The carry
//        filter keeps only posts under 2 minutes old and a shared post never is, so the merge was
//        undone by the next foreground refresh while the overlay kept rendering from its snapshot
//        — looking fine, writing nothing. POST2 is seeded 10 minutes old for exactly this. ─────
await page.goto(`http://127.0.0.1:${process.env.PORT || 8199}/`, { waitUntil: "load", timeout: 20000 });
await page.waitForTimeout(2600);
await page.evaluate((id) => window.dispatchEvent(new CustomEvent("seshd:open-post", { detail: { id } })), POST2);
await page.waitForTimeout(1800);
t = await text();
check("10a. the shared post opened", /Pull day/.test(t), t.slice(0, 200));
// Isolate: does kudos work BEFORE any refresh? If this fails too, the merge never happened on
// this path and the eviction is not the cause.
kudosWrites.length = 0;
const flamePre = page.locator('[data-fullscreen-overlay] button[aria-label="Give kudos"]').first();
if (await flamePre.count()) { await flamePre.click({ force: true }); await page.waitForTimeout(1400); }
// The foreground refresh is throttled to 30s, so a visibilitychange fired now is a no-op — wait
// it out or this check passes for the wrong reason.
await page.waitForTimeout(31000);
kudosWrites.length = 0;
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await page.waitForTimeout(3000);
const flame2 = page.locator('[data-fullscreen-overlay] button[aria-label="Give kudos"]').first();
const haveFlame2 = await flame2.count() > 0;
check("10b. the post view is still up after the refresh", haveFlame2 && /Pull day/.test(await text()));
if (haveFlame2) { await flame2.click({ force: true }); await page.waitForTimeout(1400); }
check("10c. kudos still reaches the server after a feed refresh", kudosWrites.length === 1, JSON.stringify(kudosWrites));

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
await b.close();
process.exit(fails === 0 ? 0 : 1);
