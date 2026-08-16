// THE ONBOARDING STARTER PROGRAM MUST SURVIVE THE NEXT DATA LOAD.
//
// Onboarding picks a template matched to the answers and seeds it as the user's first program, so
// they land on a ready-to-start plan instead of "No active program". It used to do that with a
// bare `setStore` — local only, never written to the `programs` table, and `profiles
// .active_program_id` never patched. `loadUserData` then overwrites BOTH keys wholesale from the
// server:
//
//     programs: appPrograms,
//     activeProgramId: activeProgram?.id || null,
//
// …so the starter plan evaporated on the next background refresh (the focus/visibilitychange
// handler) or the next launch. Every new signup, silently, minutes after finishing onboarding.
//
// This drives the real onboarding flow and asserts the program is POSTed to the server, that the
// active id is patched onto the profile, and — the part that actually bit — that it is still
// there after a loadUserData that returns what the server now holds.
//
// Goes red on the previous commit: 0 POSTs to /programs, and the program is gone after reload.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
const SERVER_PROG_ID = "44444444-4444-4444-8444-444444444444";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(6000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });

// Server state the stub maintains, so a later GET reflects what onboarding actually wrote.
// seenOnboarding starts FALSE — returning true made the app skip onboarding entirely and the
// first draft measured a screen the wizard had never run on.
const server = { programs: [], activeProgramId: null, programPosts: [], profilePatches: [], seenOnboarding: false };

await page.addInitScript(me => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
    programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
    profile: { username:"momo", name:"Mo" }, users: [{ id: me, username:"momo", name:"Mo", followers:[], following:[] }] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
  localStorage.setItem("seshd_custom_merge_v1", "1");
  // seshd_onboarded deliberately unset -> the new-user path.
}, ME);
await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
  body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
await page.route("**/rest/v1/**", async r => {
  const req = r.request(), u = req.url(), m = req.method();
  const J = b => r.fulfill({ status:200, contentType:"application/json", body: JSON.stringify(b) });
  let body = null; try { body = JSON.parse(req.postData() || "null"); } catch {}
  if (/\/rest\/v1\/programs/.test(u)) {
    if (m === "POST") {
      const p = Array.isArray(body) ? body[0] : body;
      server.programPosts.push(p);
      const row = { id: SERVER_PROG_ID, user_id: ME, name: p?.name, days: p?.days };
      server.programs.push(row);
      return J([row]);
    }
    if (m === "PATCH") {
      const p = Array.isArray(body) ? body[0] : body;
      server.programs = server.programs.map(x => ({ ...x, ...(p || {}) }));
      return J(server.programs);
    }
    return J(server.programs);
  }
  if (/\/rest\/v1\/profiles/.test(u)) {
    if (m === "PATCH") {
      const p = Array.isArray(body) ? body[0] : body;
      server.profilePatches.push(p);
      if (p && "active_program_id" in p) server.activeProgramId = p.active_program_id;
      if (p && p.seen_onboarding) server.seenOnboarding = true;
      return J([{ id: ME }]);
    }
    return J([{ id: ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark",
      seen_onboarding: server.seenOnboarding, active_program_id: server.activeProgramId }]);
  }
  if (/\/rest\/v1\/public_profiles/.test(u))
    return J([{ id: ME, username:"momo", name:"Mo", is_public:true }]);
  return J([]);
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

const body = () => page.evaluate(() => document.body.innerText);
check("onboarding renders for a brand-new signup", /track every rep|main goal|Continue/i.test(await body()),
  (await body()).slice(0, 100).replace(/\n/g, " | "));

// Walk the whole wizard: click any advancing control until onboarding is gone.
for (let i = 0; i < 26; i++) {
  const hit = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const bs = [...document.querySelectorAll("button")].filter(vis).map(x => ({ x, t: (x.textContent || "").trim() }));
    // The wizard's answer buttons are free-form copy ("Just starting", "1–3 years", "3 days"),
    // so an allow-list of labels stalls the walk the moment a new question is added — the first
    // draft died at "How long have you been lifting?". Click the advance control when there is
    // one, otherwise the FIRST answer option: anything that is not the back chevron, not a nav
    // label, and sits in the sheet body.
    // "A bit about you" requires a Biological sex choice before Continue does anything — a
    // Continue-first walker taps a no-op forever there (it burned 20 iterations in one run).
    // Answer that screen before reaching for the advance control.
    if (/Biological sex/i.test(document.body.innerText) && !window.__pickedSex) {
      const m = bs.find(o => /^male$/i.test(o.t));
      if (m) { window.__pickedSex = true; m.x.click(); return "Male"; }
    }
    const pick = bs.find(o => /^(get started|continue|next|finish|done|let's go|start|create my plan)$/i.test(o.t))
      || bs.filter(o => o.t && o.t.length > 1 && o.t.length < 40
                   && !/^‹|^back$|^skip$|^cancel$/i.test(o.t)
                   && !/^(home|workout|discover|profile|activity|messages|exercises|history|1rm)$/i.test(o.t))[0];
    if (pick) { pick.x.click(); return pick.t; }
    return null;
  });
  if (!hit) break;
  await page.waitForTimeout(450);
  // Onboarding is a full-screen overlay; once it's gone the wizard is done and anything else on
  // screen is the app proper.
  if (!/main goal|been lifting|days a week|bit about you|track every rep|know your body|coached weekly/i.test(await body())) break;
}
await page.waitForTimeout(2500);

console.log(`  POSTs to /programs: ${server.programPosts.length}`);
console.log(`  profile patches carrying active_program_id: ${server.profilePatches.filter(p => p && "active_program_id" in p).length}`);
check("the starter program was POSTed to the server", server.programPosts.length > 0,
  JSON.stringify(server.programPosts).slice(0, 160));
check("the POSTed program has real days", !!(server.programPosts[0]?.days?.length),
  JSON.stringify(server.programPosts[0] || {}).slice(0, 160));
check("profiles.active_program_id was patched", server.activeProgramId === SERVER_PROG_ID,
  `activeProgramId=${server.activeProgramId}`);

const beforeReload = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("seshd_v1") || "{}");
  return { n: (s.programs || []).length, active: s.activeProgramId };
});
console.log(`  local store right after onboarding: ${beforeReload.n} program(s), active=${beforeReload.active}`);
check("a program exists locally right after onboarding", beforeReload.n > 0, JSON.stringify(beforeReload));

// THE ACTUAL REGRESSION: survive a full reload, which runs loadUserData and overwrites both keys
// from the server. This is what a background refresh or a relaunch does.
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(3200);
const afterReload = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("seshd_v1") || "{}");
  return { n: (s.programs || []).length, active: s.activeProgramId };
});
console.log(`  local store after reload: ${afterReload.n} program(s), active=${afterReload.active}`);
check("the starter program SURVIVES a reload", afterReload.n > 0, JSON.stringify(afterReload));
check("it is still the active program after a reload", !!afterReload.active, JSON.stringify(afterReload));

const txt = await body();
check("the app does not land on an empty 'no program' state",
  !/start your first program|no active program/i.test(txt), txt.slice(0, 140).replace(/\n/g, " | "));

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
