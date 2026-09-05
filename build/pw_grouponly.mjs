// "SAVE THIS WORKOUT AND SEND IT ONLY TO GROUPS, SKIP THE FEED" MUST ACTUALLY WORK.
//
// There is now exactly ONE route to it, and that is the point of this suite.
//
//   * The post-finish SUMMARY has group checkboxes plus a "Groups only" button. This is it.
//   * `showGroupShare` — a pre-finish picker reached from the Finish modal's "Save & send to
//     groups" — was a SECOND implementation of the same outcome. It landed in 02ab7f3
//     (2026-07-05) with no trigger at all and sat dead for six weeks; a trigger was added, and
//     then Mo removed the button on Sep 4 as redundant ("we get asked to 'save & send to groups',
//     which feels redundant"). The picker, its state, the `groupShare` parameter and its
//     finishWorkout fast path were deleted WITH it — leaving them would have recreated the exact
//     dead-UI shape this file was written about.
//
// So this suite pins two things: the live path works, and the second route has not grown back.
// Two call sites for one destination is how they drift; the first pair already did.
//
// What must hold: picking a group and pressing "Groups only" posts with groupOnly:true and a
// non-empty groupIds, and does NOT create a feed post.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
const GID = "33333333-3333-4333-8333-333333333333";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

let _n = 0; const uid = () => `u${++_n}`;
const S = n => Array.from({ length: n }, () => ({ id: uid(), weight: "135", reps: "8", done: true, type: "normal" }));
const SESSION = { dayName: "Push A", unit: "lbs", startedAt: Date.now() - 18e5, exercises: [
  { id: uid(), name: "Barbell Bench Press", reps: "5-8", sets: S(3) },
] };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(5000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });

// Capture what actually gets POSTed, and to which table. group_posts = groups; posts = the feed.
const wrote = { posts: [], group_posts: [], workout_history: [] };
await page.addInitScript(([me, gid, sess]) => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
    programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
    groups: [{ id: gid, name: "Seshd Crew", members: [me] }],
    profile: { username:"momo", name:"Mo" }, users: [{ id: me, username:"momo", name:"Mo", followers:[], following:[] }] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
  localStorage.setItem("seshd_active_session", JSON.stringify(sess));
  localStorage.setItem("seshd_wstart", String(Date.now() - 18e5));
}, [ME, GID, SESSION]);
await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
  body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
await page.route("**/rest/v1/**", r => {
  const req = r.request(), u = req.url(), m = req.method();
  const J = b => r.fulfill({ status:200, contentType:"application/json", body: JSON.stringify(b) });
  if (m === "POST" || m === "PATCH") {
    let body = null; try { body = JSON.parse(req.postData() || "null"); } catch {}
    if (/\/rest\/v1\/group_posts/.test(u)) wrote.group_posts.push(body);
    else if (/\/rest\/v1\/posts/.test(u)) wrote.posts.push(body);
    else if (/\/rest\/v1\/workout_history/.test(u)) wrote.workout_history.push(body);
    return J([Array.isArray(body) ? body[0] : (body || {})]);
  }
  if (/\/rest\/v1\/(public_)?profiles\?/.test(u))
    return J([{ id: ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark", seen_onboarding:true }]);
  if (/\/rest\/v1\/groups\?/.test(u)) return J([{ id: GID, name:"Seshd Crew", member_ids:[ME], created_by: ME }]);
  return J([]);
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2600);

// NO SOURCE-TEXT ASSERTION HERE. An earlier draft grepped the shipped bundle for
// `setShowGroupShare(true)` to prove the trigger existed. The bundle is MINIFIED, so that
// identifier is renamed away and the regex can never match — it "passed" while asserting the
// absence of the trigger, and would have gone on passing no matter what the app did. The
// [one-tap] section below drives the button instead, which is the only thing that can tell the
// two states apart.

// ── The live path: finish -> summary -> pick group -> Groups Only ────────────────────────────
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^finish$/i.test((x.textContent||"").trim())); b && b.click(); });
await page.waitForTimeout(700);
check("Finish modal opens", await page.evaluate(() => /Finish workout\?/i.test(document.body.innerText)));

await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^finish workout$/i.test((x.textContent||"").trim())); b && b.click(); });
await page.waitForTimeout(2600);
const sumTxt = await page.evaluate(() => document.body.innerText);
// NOT `|Feed|` — that is a substring of the alternative beside it, so it adds nothing here, and
// it matches the HOME TAB's own "Your feed is empty" (measured). A marker that another screen
// also renders cannot say which screen you are on; `Groups only` is the tight alternative.
check("the post-finish summary appears", /Share to Feed|Groups only|Don't share/i.test(sumTxt),
  sumTxt.slice(0, 120).replace(/\n/g, " | "));
check("the summary offers a groups-only control",
  await page.evaluate(() => !!document.querySelector('[data-share-target="groups"]')),
  sumTxt.slice(0, 120).replace(/\n/g, " | "));

// Selecting a group is a PREREQUISITE — the button toasts an error with none picked.
const picked = await page.evaluate(() => {
  const el = [...document.querySelectorAll("*")].find(e => !e.children.length && /Seshd Crew/.test(e.textContent || ""));
  if (!el) return "no group row";
  let n = el; while (n && n !== document.body) { if (getComputedStyle(n).cursor === "pointer") { n.click(); return "clicked"; } n = n.parentElement; }
  return "no clickable ancestor";
});
await page.waitForTimeout(500);
console.log(`  group row: ${picked}`);
check("the group checkbox row is present and selectable", picked === "clicked", picked);

// MATCH THE HOOK, NOT THE LABEL — the two share buttons are a side-by-side pair now and their
// text depends on whether the user is in a group. `data-share-target` is the contract.
const label = await page.evaluate(() => {
  const b = document.querySelector('[data-share-target="groups"]');
  return b ? (b.textContent || "").trim() : null;
});
console.log(`  Groups Only button now reads: ${JSON.stringify(label)}`);
check("selecting a group is reflected on the button", label && /\(1\)/.test(label), String(label));

wrote.posts.length = 0; wrote.group_posts.length = 0;
await page.evaluate(() => { const b = document.querySelector('[data-share-target="groups"]'); b && b.click(); });
await page.waitForTimeout(2200);

console.log(`  writes -> group_posts: ${wrote.group_posts.length}, posts(feed): ${wrote.posts.length}, workout_history: ${wrote.workout_history.length}`);
const gp = wrote.group_posts.flat().filter(Boolean);
check("a group post was written", gp.length > 0, JSON.stringify(wrote.group_posts).slice(0, 200));
check("the group post carries the workout", gp.some(p => p && p.workout), JSON.stringify(gp[0] || {}).slice(0, 200));
check("it targets the selected group", gp.some(p => p && (p.group_id === GID)), JSON.stringify(gp[0] || {}).slice(0, 200));
// The whole point: no feed post.
check("NO feed post was created", wrote.posts.flat().filter(Boolean).length === 0,
  JSON.stringify(wrote.posts).slice(0, 200));
check("the workout was still saved to history", wrote.workout_history.length > 0,
  JSON.stringify(wrote.workout_history).slice(0, 150));

// ★ A WRITE IS NOT A DESTINATION. Every check above is satisfied by a share that posts correctly
// and then leaves the user sitting on the summary with the session still live — and the history
// row is written at FINISH, before the share, so even "the workout was saved" cannot see it.
// The deleted `[one-tap]` half carried exactly these three assertions, with a comment explaining
// that an absence test cannot tell "moved on correctly" from "stuck somewhere else". They only
// ever covered the deleted path, so nothing regressed — but the live path had never had them,
// and it is the only path now. Red-proofed by deleting the handler's own
// `setShowWorkoutSummary(false); setWorkoutSummary(null); setSession(null);` — every other check
// in this file stays green — the three that survive all go red, naming the live workout screen
// with its timer reset to 00:00, which is the exact symptom CLAUDE.md records for this shape.
// A FOURTH was written and removed: "the bottom nav is back" CANNOT fail here, because the nav
// is visible during a workout now (a deliberate fix), so it is green on both builds.
const ended = await page.evaluate(() => ({
  summary: /Don't share|Undo finish/i.test(document.body.innerText),
  live: [...document.querySelectorAll("button")].some(b => /^finish$/i.test((b.textContent||"").trim())),
  session: !!localStorage.getItem("seshd_active_session"),
  txt: document.body.innerText.slice(0,110).replace(/\n/g," | "),
}));
check("the summary sheet closed after sharing", !ended.summary, ended.txt);
check("the live workout screen is gone", !ended.live, ended.txt);
check("the stored session was cleared", !ended.session, ended.txt);

// ── There must be no SECOND route to groups-only ─────────────────────────────────────────────
// The Finish confirm used to carry "Save & send to groups", which opened its own picker and
// reached the same outcome one screen earlier. Asserting its absence is not tidiness: while it
// existed, "does groups-only work" could not be answered without driving both, and the two
// implementations had already drifted (one skipped the summary, one did not). This is the
// duplicated-formula rule applied to a user journey.
{
  const p2 = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  p2.setDefaultTimeout(5000);
  p2.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });
  await p2.addInitScript(([me, gid, sess]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
      programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
      groups: [{ id: gid, name: "Seshd Crew", members: [me] }],
      profile: { username:"momo", name:"Mo" }, users: [{ id: me, username:"momo", name:"Mo", followers:[], following:[] }] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
    localStorage.setItem("seshd_active_session", JSON.stringify(sess));
    localStorage.setItem("seshd_wstart", String(Date.now() - 18e5));
  }, [ME, GID, SESSION]);
  await p2.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
    body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
  await p2.route("**/rest/v1/**", r => {
    const u = r.request().url();
    const J = b => r.fulfill({ status:200, contentType:"application/json", body: JSON.stringify(b) });
    if (r.request().method() !== "GET") return J([{}]);
    if (/\/rest\/v1\/(public_)?profiles\?/.test(u))
      return J([{ id: ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark", seen_onboarding:true }]);
    // The group has to come from the STUB — loadUserData replaces `groups` wholesale on boot, so a
    // group seeded only into localStorage is gone before the confirm renders, and the confirm would
    // then be groupless for a reason that has nothing to do with what is being asserted.
    if (/\/rest\/v1\/groups\?/.test(u)) return J([{ id: GID, name:"Seshd Crew", member_ids:[ME], created_by: ME }]);
    return J([]);
  });
  await p2.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await p2.waitForTimeout(2600);

  await p2.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^finish$/i.test((x.textContent||"").trim())); b && b.click(); });
  await p2.waitForTimeout(700);
  const D = await p2.evaluate(() => {
    const t = [...document.querySelectorAll("div")].find(d => /^Finish workout\?$/.test((d.textContent||"").trim()));
    const panel = t && t.parentElement;
    return panel ? [...panel.querySelectorAll("button")].map(b => (b.textContent||"").trim()) : null;
  });
  // ★ THE CONTROL HAS TO PROVE THE GROUP REACHED THE APP, AND `D.length > 0` DOES NOT.
  // The deleted button was gated on the user being in a group, so a GROUPLESS fixture renders
  // exactly two buttons on the OLD code too — measured: with the group removed from both the
  // seed and the stub, all three checks below PASS against the build that still ships
  // "Save & send to groups". A non-zero button count is true of any confirm and says nothing.
  // So the control is the summary's own groups control, which renders ONLY when the store holds
  // a group the user is in — the same gate the deleted button used. It is asserted AFTER the
  // labels are captured, so a store that never got its group fails here rather than quietly
  // making the absence checks meaningless.
  check("[one-route] the finish confirm is open", !!D && D.length > 0,
    (await p2.evaluate(() => document.body.innerText)).slice(0,120).replace(/\n/g," | "));
  await p2.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^finish workout$/i.test((x.textContent||"").trim())); b && b.click(); });
  await p2.waitForTimeout(2600);
  check("[one-route] the store really held a group (control)",
    await p2.evaluate(() => !!document.querySelector('[data-share-target="groups"]')),
    (await p2.evaluate(() => document.body.innerText)).slice(0,120).replace(/\n/g," | "));
  if (D) {
    check("[one-route] the confirm offers no second groups route", !D.some(l => /group/i.test(l)),
      D.join(" | "));
    check("[one-route] it is just finish-or-keep-going", D.length === 2, D.join(" | "));
  }
  await p2.close();
}

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
