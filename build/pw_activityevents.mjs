// ACTIVITY IS NO LONGER ONLY "WHO TOUCHED MY POSTS".
//
// Every row on that screen used to be derived from `store.posts`, which can only ever answer
// "who engaged with something I posted". Three real facts were therefore invisible:
//
//   • a FOLLOW is not attached to a post — yet Settings carries a "Follows" notification toggle
//     and the push webhook has always fired one, so the app promised a notification it had
//     nowhere to put. Miss the push and the follow left no trace anywhere;
//   • a LIKE ON MY COMMENT lives on someone else's post, which is only in `store.posts` at all if
//     it happens to be on the newest feed page;
//   • a COACH REDEEMING MY CODE is not social at all, and it is the highest-consequence grant the
//     app issues — that person can now read my entire training history and PRs.
//
// WHAT THIS FILE IS REALLY GUARDING is the shape of the fix rather than the five new strings: the
// badge and the list were two independent passes and had already drifted once (the count included
// events whose actor was unknown while the list dropped them, so a badge of 1 sat over a screen
// reading "No activity yet"). Section 3 is the one that would catch a regression back to two
// passes; the rest would stay green through it.
//
// FIXTURE NOTES, both of them documented traps in CLAUDE.md:
//   • loadUserData REPLACES the store from the server, so everything must come from the stub —
//     seeding `seshd_v1` alone renders an empty list and every assertion passes for the wrong
//     reason;
//   • the ONE-TIME RE-BASELINE marks whatever exists as already seen on first launch, so the
//     badge would read 0 no matter how many rows there are. The flag is pre-set here to defeat
//     it, which is also why it has to be bumped whenever the count changes meaning.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME    = "11111111-1111-4111-8111-111111111111";
const FOLLOWER = "22222222-2222-4222-8222-222222222222"; // accepted follow
const ASKER    = "33333333-3333-4333-8333-333333333333"; // pending follow request
const LIKER    = "44444444-4444-4444-8444-444444444444"; // liked my comment
const REPLIER  = "55555555-5555-4555-8555-555555555555"; // commented after me
const COACH    = "66666666-6666-4666-8666-666666666666"; // redeemed my coach code
const BLOCKED  = "77777777-7777-4777-8777-777777777777"; // I blocked them; must never appear

// Whether the post I commented on is currently on the newest-30 feed page. THIS IS THE WHOLE
// POINT OF SECTION 7: it is the only thing that decides whether one comment is a `mention` (found
// by the pass over store.posts) or a `reply` (found by the pass over commentPeers), and it is not
// under the user's control — it changes as other people post.
let postOnFeed = false;

const t = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const MY_COMMENT_AT = t(6 * 3600e3);

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 428, height: 926 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.setDefaultTimeout(4000);

// Every write the client makes, so a local-only optimistic update can be told from a real one.
const writes = [];

await page.addInitScript((me) => {
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
    prEvents: [], bodyLog: [], prs: {}, posts: [], groups: [], users: [],
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: me, email: "m@e.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
  // Defeat the one-time re-baseline so the badge reports the real count (see the header).
  localStorage.setItem("seshd_activity_rebaselined_v4", "1");
  localStorage.setItem("seshd_seen_activity_count", "0");
}, ME);

await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: ME, email: "m@e.com" } }) }));

await page.route("**/rest/v1/**", r => {
  const req = r.request();
  const u = req.url();
  const m = req.method();
  if (m !== "GET") {
    writes.push({ method: m, url: u, body: req.postData() || "" });
    return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  }
  let body = "[]";
  if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u)) {
    body = JSON.stringify([
      { id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" },
      { id: FOLLOWER, username: "kai",   name: "Kai",   is_public: true },
      { id: ASKER,    username: "dana",  name: "Dana",  is_public: true },
      { id: LIKER,    username: "sam",   name: "Sam",   is_public: true },
      { id: REPLIER,  username: "tess",  name: "Tess",  is_public: true },
      { id: COACH,    username: "coachj", name: "Coach J", is_public: true },
      // MUST be a KNOWN profile. Omitting them made section 6 vacuous: buildActivityEvents drops
      // any event whose actor is not in store.users, so the rows disappeared for the wrong reason
      // and the check passed against a build with no block filter at all.
      { id: BLOCKED,  username: "troll", name: "Troll", is_public: true },
    ]);
  } else if (/\/rest\/v1\/blocked_users\?/.test(u)) {
    body = JSON.stringify([{ blocked_id: BLOCKED }]);
  } else if (/\/rest\/v1\/posts\?/.test(u)) {
    const mine = {
      id: "p-mine", user_id: ME, caption: "my post", type: "text", created_at: t(4 * 3600e3),
      // Both shapes of engagement, both from someone I have blocked.
      kudos: [{ user_id: BLOCKED }],
      comments: [{ id: "c-blocked", user_id: BLOCKED, text: "BLOCKED-TEXT", likes: [], created_at: t(3 * 3600e3) }],
    };
    const theirs = {
      id: "p-theirs", user_id: REPLIER, caption: "their post", type: "text", created_at: t(10 * 3600e3),
      kudos: [], comments: [{ id: "peer-after", user_id: REPLIER, text: "@momo agreed", likes: [], created_at: t(1 * 3600e3) }],
    };
    body = JSON.stringify(postOnFeed ? [mine, theirs] : [mine]);
  } else if (/\/rest\/v1\/follows\?/.test(u)) {
    // Both directions of the same table: one accepted follow, one still pending.
    body = JSON.stringify([
      { follower_id: FOLLOWER, following_id: ME, status: "accepted", created_at: t(2 * 3600e3) },
      { follower_id: ASKER,    following_id: ME, status: "pending",  created_at: t(1 * 3600e3) },
    ]);
  } else if (/\/rest\/v1\/coach_links\?/.test(u)) {
    body = JSON.stringify([{ id: "link-1", coach_id: COACH, redeemed_at: t(30 * 60e3) }]);
  } else if (/\/rest\/v1\/comments\?/.test(u) && /user_id=eq\./.test(u)) {
    // MY comments, with the post's owner embedded. `postOwnerId !== me` is what makes the post
    // below eligible for replies at all.
    body = JSON.stringify([{
      id: "myc-1", post_id: "p-theirs", text: "nice work", likes: [LIKER],
      created_at: MY_COMMENT_AT, posts: { id: "p-theirs", user_id: REPLIER },
    }]);
  } else if (/\/rest\/v1\/comments\?/.test(u)) {
    // Other people on that same post. The EARLIER one must not count as a reply to me.
    body = JSON.stringify([
      { id: "peer-after",  post_id: "p-theirs", user_id: REPLIER, text: "@momo agreed", created_at: t(1 * 3600e3) },
      { id: "peer-before", post_id: "p-theirs", user_id: REPLIER, text: "first post", created_at: t(9 * 3600e3) },
    ]);
  }
  r.fulfill({ status: 200, contentType: "application/json", body });
});

const bodyText = () => page.evaluate(() => document.body.innerText);
const rows = () => page.getByLabel("Dismiss").count();
const openActivity = async () => {
  if (/No activity yet|Show \d+ hidden|started following you|liked your/.test(await bodyText())) return;
  await page.getByLabel("Activity").click();
  await page.waitForTimeout(800);
};

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

// ── 0. THE BADGE, READ BEFORE THE SCREEN IS OPENED ───────────────────────────────────────────
// Opening Activity marks everything seen, so this is the only moment the badge is observable.
const badge = await page.evaluate(() => {
  const btn = document.querySelector('button[aria-label="Activity"]');
  const sp = btn && btn.querySelector("span");
  return sp ? sp.textContent.trim() : null;
});

await openActivity();
const txt = await bodyText();
check("[control] the activity screen rendered with real rows", /Activity/.test(txt) && !/No activity yet/.test(txt),
  JSON.stringify(txt.slice(0, 160)));

// ── 1. THE FIVE NEW EVENT TYPES EACH RENDER ──────────────────────────────────────────────────
check("1a a new follower is reported",        /kai\s+started following you/i.test(txt), JSON.stringify(txt.slice(0, 300)));
check("1b a follow REQUEST is distinguished from a follow", /dana\s+wants to follow you/i.test(txt));
check("1c a like on MY comment is reported",  /sam\s+liked your comment/i.test(txt));
check("1d a reply is reported",               /tess\s+replied/i.test(txt));
// The wording is the point: this row exists to say what the coach can now SEE.
check("1e a coach redemption names the access it granted",
  /redeemed your coach code/i.test(txt) && /workouts and PRs/i.test(txt), JSON.stringify(txt.slice(0, 400)));

// ── 2. A REPLY IS ONLY A REPLY IF IT CAME AFTER ME ───────────────────────────────────────────
// The fixture seeds a comment on the same post from BEFORE my own. A test with only the later
// one cannot see this — it would pass against code that reports every comment on the post.
// GATED ON REPLIES EXISTING AT ALL. An absence check is satisfied by the flow never running:
// against the pre-change build, where no reply rows render, "first post is absent" was true and
// this reported PASS for a screen with nothing on it.
const repliesRendered = /agreed/.test(txt);
check("2b a reply that came AFTER mine is reported", repliesRendered);
check("2a ...and one that PREDATES mine is not", repliesRendered && !/first post/.test(txt),
  repliesRendered ? JSON.stringify(txt.slice(0, 400)) : "no reply rows rendered — cannot judge");

// ── 3. THE BADGE IS THE LIST'S LENGTH ────────────────────────────────────────────────────────
// The regression this catches is a return to two independent passes. Every other check in this
// file would stay green through that; only comparing the two numbers can see it.
const n = await rows();
check("3a every event drew exactly one dismissible row", n === 5, `rows=${n}`);
check("3b the badge read the same number the list shows", badge === String(n), `badge=${badge} rows=${n}`);

// ── 4. A DISMISS KEY IDENTIFIES EXACTLY ONE ROW ──────────────────────────────────────────────
// The documented failure is a key that collides: dismissing one row hid two.
if (n === 0) {
  check("4a dismissing removes exactly one row", false, "no rows on screen to dismiss");
  check("4b ...and the header offers it back", false, "no rows on screen to dismiss");
} else {
  await page.getByLabel("Dismiss").first().click();
  await page.waitForTimeout(400);
  const afterDismiss = await rows();
  check("4a dismissing removes exactly one row", afterDismiss === n - 1, `${n} -> ${afterDismiss}`);
  check("4b ...and the header offers it back", /Show 1 hidden/.test(await bodyText()));
}

// ── 5. ACCEPT WRITES TO THE SERVER ───────────────────────────────────────────────────────────
// A local-only setStore is the dominant bug class in this app: the request would look approved
// and be pending again on the next foreground. Assert the WRITE, not the toast.
writes.length = 0;
const acceptBtn = page.getByRole("button", { name: "Accept" });
const hasAccept = await acceptBtn.count() > 0;
if (hasAccept) { await acceptBtn.click(); await page.waitForTimeout(600); }
const patch = hasAccept ? writes.find(w => w.method === "PATCH" && /\/follows\?/.test(w.url)) : null;
check("5a Accept PATCHes the follows row", !!patch, JSON.stringify(writes.slice(0, 3)));
check("5b ...naming both sides of the row and setting accepted",
  !!patch && patch.url.includes(ASKER) && patch.url.includes(ME) && /"status"\s*:\s*"accepted"/.test(patch.body),
  patch ? `${patch.url} ${patch.body}` : "no patch");
// Accepting must turn the row into a follow IN PLACE, not leave the question on screen.
const afterAccept = hasAccept ? await bodyText() : "";
check("5c the answered request stops asking", hasAccept && !/wants to follow you/.test(afterAccept),
  hasAccept ? JSON.stringify(afterAccept.slice(0, 300)) : "no Accept button on screen");
check("5d ...and reads as a follower instead", hasAccept && /dana\s+started following you/i.test(afterAccept),
  hasAccept ? "" : "no Accept button on screen");

// ── 6. A BLOCKED PERSON REACHES NEITHER THE SCREEN NOR THE BADGE ─────────────────────────────
// The server cannot do this for us: the `comments` SELECT policy applies is_blocked_between to the
// POST'S OWNER only, never to the comment's AUTHOR, so a blocked account's comment text arrives
// legitimately. The fixture blocks someone who has both kudos'd and commented on my own post, so
// an unfiltered build renders TWO extra rows and counts them.
check("6a a blocked user's comment text never renders", !/BLOCKED-TEXT/.test(txt), JSON.stringify(txt.slice(0, 400)));
check("6b ...and neither does their kudos or comment row",
  !/liked your post/.test(txt) && !/commented:/.test(txt), JSON.stringify(txt.slice(0, 400)));
// The badge is read before the screen is opened, so this also proves the COUNT excludes them —
// a filter applied only at render time would leave a badge nobody can clear.
check("6c ...and the badge did not count them either", badge === "5", `badge=${badge}`);

// ── 7. ONE COMMENT MUST NOT HAVE TWO DISMISSAL KEYS ──────────────────────────────────────────
// A comment on a post I do not own is a `mention` while that post is on the newest-30 feed page
// and a `reply` once it ages off — and which one it is depends on other people's posting, not on
// anything the user did. Keyed by TYPE, dismissing it in one state left a key that stopped
// matching in the other, so it returned un-dismissed with the "Show N hidden" affordance gone.
// This drives the real transition rather than asserting on the key string.
{
  const freshRows = await rows();
  // State B: post is OFF the feed, so the comment arrives via commentPeers and reads as a reply.
  postOnFeed = false;
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await openActivity();
  const asReply = await bodyText();
  check("7a [control] off the feed, the comment reads as a reply", /replied/.test(asReply) && !/mentioned you/.test(asReply),
    JSON.stringify(asReply.slice(0, 300)));

  // Dismiss THAT row specifically. The first draft used a `:has-text` locator plus `.last()`,
  // which silently fell through to "the last Dismiss button on screen" — a different row
  // entirely (rows are sorted newest-first, so that was the oldest event). It reported PASS,
  // because a row HAD been dismissed; it was simply the wrong one, and 7d then failed for a
  // reason that had nothing to do with the app. Target by the row's own text.
  const before = await rows();
  const hiddenBefore = Number((/Show (\d+) hidden/.exec(await bodyText()) || [0, 0])[1]);
  const idx = await page.evaluate(() => [...document.querySelectorAll('button[aria-label="Dismiss"]')]
    .findIndex(b => (b.parentElement?.textContent || "").includes("replied")));
  check("7b [control] the reply row was actually located", idx >= 0, `idx=${idx}`);
  if (idx >= 0) await page.getByLabel("Dismiss").nth(idx).click();
  await page.waitForTimeout(400);
  const hid = await rows();
  check("7b2 dismissing it hides it", hid === before - 1, `${before} -> ${hid}`);

  // State A: the post comes back onto the feed, so the SAME comment is now found as a mention.
  postOnFeed = true;
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await openActivity();
  const nowTxt = await bodyText();
  check("7c [control] on the feed, that comment is now a mention, not a reply",
    !/replied/.test(nowTxt), JSON.stringify(nowTxt.slice(0, 300)));
  check("7d ...and it is STILL dismissed rather than back as a new row",
    !/mentioned you/.test(nowTxt), JSON.stringify(nowTxt.slice(0, 300)));
  // Derived, not hard-coded: section 4 already dismissed a row, so the absolute number depends
  // on what ran before. What must hold is that the reply's dismissal SURVIVED the type change.
  const hiddenNow = Number((/Show (\d+) hidden/.exec(nowTxt) || [0, 0])[1]);
  check("7e ...and it is still counted as hidden", hiddenNow === hiddenBefore + 1,
    `hidden ${hiddenBefore} -> ${hiddenNow}`);
  void freshRows;
}

console.log(fails === 0 ? "\nPASS pw_activityevents" : `\nFAIL pw_activityevents (${fails})`);
await browser.close();
process.exit(fails === 0 ? 0 : 1);
