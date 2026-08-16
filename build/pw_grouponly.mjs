// "SAVE THIS WORKOUT AND SEND IT ONLY TO GROUPS, SKIP THE FEED" MUST ACTUALLY WORK.
//
// There are TWO implementations of this idea in the file and only one is reachable:
//
//   * The post-finish SUMMARY has group checkboxes plus a "Groups Only" button. This is the live
//     path and what this suite pins.
//   * `showGroupShare` — a pre-finish picker reached from the Finish modal — has a complete sheet,
//     a complete `finishWorkout(false, {groupIds, groupOnly:true})` fast path, and even a "Back"
//     button returning to the Finish modal. But `setShowGroupShare(true)` HAS NEVER EXISTED in any
//     commit: the state, the handler and the sheet all landed in 02ab7f3 (2026-07-05) without a
//     trigger. It has been dead for its entire life.
//
// The distinction matters because the dead path is the one that SKIPS the summary, and the live
// path is the one that goes through it — so "does groups-only work" cannot be answered by reading
// the finishWorkout signature. It has to be driven.
//
// What must hold: picking a group and pressing "Groups Only" posts with groupOnly:true and a
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
check("the post-finish summary appears", /Share to Feed|Groups Only|Don't share/i.test(sumTxt),
  sumTxt.slice(0, 120).replace(/\n/g, " | "));
check("the summary offers a Groups Only control", /Groups Only/i.test(sumTxt),
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

const label = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => /groups only/i.test((x.textContent||"").trim()));
  return b ? (b.textContent || "").trim() : null;
});
console.log(`  Groups Only button now reads: ${JSON.stringify(label)}`);
check("selecting a group is reflected on the button", label && /\(1\)/.test(label), String(label));

wrote.posts.length = 0; wrote.group_posts.length = 0;
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /groups only/i.test((x.textContent||"").trim())); b && b.click(); });
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

// ── The ONE-TAP path: Finish -> "Save & send to groups" -> pick -> Send, skipping the summary ──
// This is the path that was dead for its whole life. It must reach the same outcome as the
// summary's "Groups Only" (group post, no feed post, workout still saved) WITHOUT showing the
// summary at all — that skip is the entire reason it exists.
{
  const p2 = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  p2.setDefaultTimeout(5000);
  p2.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });
  const w2 = { posts: [], group_posts: [], workout_history: [] };
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
    const req = r.request(), u = req.url(), m = req.method();
    const J = b => r.fulfill({ status:200, contentType:"application/json", body: JSON.stringify(b) });
    if (m === "POST" || m === "PATCH") {
      let body = null; try { body = JSON.parse(req.postData() || "null"); } catch {}
      if (/\/rest\/v1\/group_posts/.test(u)) w2.group_posts.push(body);
      else if (/\/rest\/v1\/posts/.test(u)) w2.posts.push(body);
      else if (/\/rest\/v1\/workout_history/.test(u)) w2.workout_history.push(body);
      return J([Array.isArray(body) ? body[0] : (body || {})]);
    }
    if (/\/rest\/v1\/(public_)?profiles\?/.test(u))
      return J([{ id: ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark", seen_onboarding:true }]);
    if (/\/rest\/v1\/groups\?/.test(u)) return J([{ id: GID, name:"Seshd Crew", member_ids:[ME], created_by: ME }]);
    return J([]);
  });
  await p2.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await p2.waitForTimeout(2600);

  await p2.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^finish$/i.test((x.textContent||"").trim())); b && b.click(); });
  await p2.waitForTimeout(700);
  const hasBtn = await p2.evaluate(() => [...document.querySelectorAll("button")].some(x => /save & send to groups/i.test((x.textContent||"").trim())));
  check("[one-tap] the Finish modal offers 'Save & send to groups'", hasBtn,
    (await p2.evaluate(() => document.body.innerText)).slice(0,120).replace(/\n/g," | "));

  await p2.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /save & send to groups/i.test((x.textContent||"").trim())); b && b.click(); });
  await p2.waitForTimeout(800);
  const pickerTxt = await p2.evaluate(() => document.body.innerText);
  check("[one-tap] it opens the group picker", /Send to groups/i.test(pickerTxt), pickerTxt.slice(0,120).replace(/\n/g," | "));

  const pick2 = await p2.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find(e => !e.children.length && /Seshd Crew/.test(e.textContent || ""));
    if (!el) return "no row";
    let n = el; while (n && n !== document.body) { if (getComputedStyle(n).cursor === "pointer") { n.click(); return "clicked"; } n = n.parentElement; }
    return "no clickable ancestor";
  });
  await p2.waitForTimeout(400);
  check("[one-tap] a group can be selected", pick2 === "clicked", pick2);

  await p2.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^send to \d+ group/i.test((x.textContent||"").trim())); b && b.click(); });
  await p2.waitForTimeout(2600);

  console.log(`  [one-tap] group_posts: ${w2.group_posts.length}, posts(feed): ${w2.posts.length}, workout_history: ${w2.workout_history.length}`);
  const gp2 = w2.group_posts.flat().filter(Boolean);
  check("[one-tap] a group post was written", gp2.length > 0, JSON.stringify(w2.group_posts).slice(0,200));
  check("[one-tap] it targets the selected group", gp2.some(p => p && p.group_id === GID), JSON.stringify(gp2[0]||{}).slice(0,200));
  check("[one-tap] NO feed post was created", w2.posts.flat().filter(Boolean).length === 0, JSON.stringify(w2.posts).slice(0,200));
  check("[one-tap] the workout was still saved to history", w2.workout_history.length > 0, JSON.stringify(w2.workout_history).slice(0,150));
  // THE SUMMARY MUST BE SKIPPED *AND* THE WORKOUT MUST BE OVER.
  // The absence test alone passed against a severe bug: the fast path ended in a bare `return`
  // that never cleared the session, so the app sat on the LIVE WORKOUT SCREEN — timer reset to
  // 00:00, sets still ticked, no tab bar — which contains neither "Share to Feed" nor
  // "Don't share" and therefore satisfied "the summary is skipped" perfectly. Absence tests
  // cannot tell "moved on correctly" from "stuck somewhere else"; assert the destination.
  const afterTxt = await p2.evaluate(() => document.body.innerText);
  check("[one-tap] the summary screen is skipped", !/Share to Feed|Don't share/i.test(afterTxt),
    afterTxt.slice(0,120).replace(/\n/g," | "));
  const ended = await p2.evaluate(() => ({
    live: !!document.querySelector('[data-no-tab-swipe]')
       || [...document.querySelectorAll("button")].some(b => /^finish$/i.test((b.textContent||"").trim())),
    nav: !!document.querySelector('[aria-label="Home"]'),
    session: !!localStorage.getItem("seshd_active_session"),
    txt: document.body.innerText.slice(0,110).replace(/\n/g," | "),
  }));
  console.log(`  [one-tap] after send: live-workout=${ended.live} nav=${ended.nav} storedSession=${ended.session}`);
  check("[one-tap] the live workout screen is gone", !ended.live, ended.txt);
  check("[one-tap] the bottom nav is back", ended.nav, ended.txt);
  check("[one-tap] the stored session was cleared", !ended.session, ended.txt);
  await p2.close();
}

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
