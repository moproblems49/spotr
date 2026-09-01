// A WRITE THAT FAILED MUST NOT LOOK LIKE A WRITE THAT SUCCEEDED.
//
// Four sites shared one shape: an optimistic setStore, a server write whose failure was discarded
// (an empty catch, or a bare fetch whose `res.ok` was never read), and no way for the user to find
// out. That is the dominant bug class in this app wearing a new hat — `loadUserData` REPLACES 28
// store keys wholesale from the server on every boot and foreground, so a local-only change looks
// perfectly saved, survives a tab switch, and is silently gone on the next launch.
//
//   1/2. createGroup      — a refused insert left the optimistic row in the list holding a LOCAL
//                           `uid()` id. Not just a broken group: that id is spliced into the
//                           unread-dot query's `in.()` on a uuid column, so one failed create
//                           22P02'd the whole query and killed the dot for EVERY group.
//   3.   updateGroupMembers — `enforce_group_creator_manages` refuses a non-creator's membership
//                           rewrite, and a bare fetch RESOLVES on 4xx, so the change appeared to
//                           stick and vanished on the next foreground.
//   4.   the _silent program save — a rest tweak / day reorder / added exercise fired one PATCH
//                           and gave up, so offline or a dead token lost the edit entirely.
//
// Sections 1-3 assert the ROLLBACK and the message; section 4 asserts the edit reached the durable
// write queue, which is what makes it survive. Section 2 is a CONTROL: it runs the same flow
// against a server that accepts, so a broken fixture shows up as a red control rather than as a
// false pass on the failure cases.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME  = "11111111-1111-4111-8111-111111111111";
const PAL = "22222222-2222-4222-8222-222222222222";   // the group's creator, not me
const GID = "33333333-3333-4333-8333-333333333333";
const PID = "44444444-4444-4444-8444-444444444444";   // program id
const REALGID = "55555555-5555-4555-8555-555555555555";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const PROGRAM = {
  id: PID, name: "PPL", days: [
    { id: "d1", name: "Push A", exercises: [{ name: "Barbell Bench Press", reps: "4×5-8", rest: 90 }] },
  ],
};
let _n = 0; const uid = () => `u${++_n}`;
const SESSION = {
  dayName: "Push A", unit: "lbs", startedAt: Date.now() - 9e5,
  programId: PID, dayId: "d1",
  exercises: [{ id: uid(), name: "Barbell Bench Press", reps: "5-8", rest: 90,
    sets: [{ id: uid(), weight: "135", reps: "8", done: true, type: "normal" }] }],
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

// `groupsRefused` decides whether the stub accepts writes to /groups; `programsRefused` likewise.
const attempted = { groupPatch: 0, groupPost: 0 };
async function makePage({ groupsRefused = true, programsRefused = true, withSession = false, groups = [] } = {}) {
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(5000);
  page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });
  await page.addInitScript(([me, groups_, prog, sess, withSession_]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({
      currentUserId: me, theme: "dark", unit: "lbs",
      programs: [prog], activeProgramId: prog.id,
      history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
      groups: groups_,
      profile: { username: "momo", name: "Mo" },
      users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
    }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: me } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
    localStorage.removeItem("seshd_write_queue");
    if (withSession_) {
      localStorage.setItem("seshd_active_session", JSON.stringify(sess));
      localStorage.setItem("seshd_wstart", String(Date.now() - 9e5));
    }
  }, [ME, groups, PROGRAM, SESSION, withSession]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: ME } }) }));
  await page.route("**/rest/v1/**", r => {
    const req = r.request(), u = req.url(), m = req.method();
    const J = b => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (/\/rest\/v1\/groups/.test(u) && (m === "POST" || m === "PATCH")) {
      if (m === "PATCH") attempted.groupPatch++; else attempted.groupPost++;
      // 403 is what RLS / enforce_group_creator_manages actually answers. The point of the whole
      // suite is that the client never even LOOKED at this status.
      if (groupsRefused) return r.fulfill({ status: 403, contentType: "application/json",
        body: JSON.stringify({ code: "42501", message: "new row violates row-level security policy" }) });
      if (m === "POST") return J([{ id: REALGID, name: "Test Crew", description: "", created_by: ME, member_ids: [ME], icon: "🏋️" }]);
      return J([]);
    }
    if (/\/rest\/v1\/programs/.test(u) && m === "PATCH" && programsRefused)
      return r.fulfill({ status: 403, contentType: "application/json",
        body: JSON.stringify({ code: "42501", message: "refused" }) });
    // ★ SEED THROUGH THE STUB, NOT ONLY THROUGH localStorage. loadUserData REPLACES `programs`
    // and `groups` wholesale from the server on boot, so a fixture that only writes them into
    // seshd_v1 has them wiped a second later — which made section 3 report "the group is not on
    // screen" and section 4 silently skip the save entirely (no matching program to patch), both
    // blaming the app for a fixture gap.
    if (/\/rest\/v1\/programs\?/.test(u) && m === "GET")
      return J([{ id: PROGRAM.id, user_id: ME, name: PROGRAM.name, days: PROGRAM.days, created_at: new Date().toISOString() }]);
    if (/\/rest\/v1\/groups\?/.test(u) && m === "GET")
      return J(groups.map(g => ({ id: g.id, name: g.name, description: g.description || "",
        icon: g.icon || "🏋️", created_by: g.createdBy || ME, member_ids: g.member_ids || g.members || [] })));
    // Everything else: an empty 200. loadUserData degrades gracefully and the seeded store renders.
    return J([]);
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(1400);
  return page;
}

const storeOf = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("seshd_v1") || "{}"); } catch { return {}; } });
// A toast is transient, so a single sample cannot tell "never shown" from "shown and gone".
// Poll the whole window the way the audit of the host dead-zone had to.
async function waitForToast(page, re, ms = 3500) {
  const end = Date.now() + ms;
  let seen = "";
  while (Date.now() < end) {
    const t = await page.evaluate(() => document.body.innerText || "");
    if (re.test(t)) return { hit: true, text: t.split("\n").find(l => re.test(l)) || "" };
    seen = t;
    await page.waitForTimeout(120);
  }
  return { hit: false, text: seen.slice(0, 200) };
}

// Reach Discover → Groups and open the create sheet.
async function openCreateSheet(page) {
  await page.locator('[aria-label="Discover"], [aria-label="discover"]').first().click({ force: true });
  await page.waitForTimeout(500);
  const groupsTile = page.getByText(/^Groups$/).first();
  if (await groupsTile.count()) { await groupsTile.click({ force: true }); await page.waitForTimeout(500); }
  const btn = page.getByRole("button", { name: /^Create Group$/ }).first();
  if (!(await btn.count())) return false;
  await btn.click({ force: true });
  await page.waitForTimeout(400);
  return true;
}

// ── 1. A REFUSED CREATE MUST NOT LEAVE THE GROUP IN THE LIST ───────────────────────────────
{
  const page = await makePage({ groupsRefused: true });
  const opened = await openCreateSheet(page);
  check("1a. the create-group sheet opens", opened, "could not reach Discover → Groups → Create Group");
  if (opened) {
    await page.locator('input').first().fill("Test Crew");
    await page.getByRole("button", { name: /^Create$/ }).first().click({ force: true });
    const toastSeen = await waitForToast(page, /Couldn't create the group/i);
    const st = await storeOf(page);
    const groups = st.groups || [];
    check("1b. the refused group is NOT left in the list", groups.length === 0,
      `store.groups = ${JSON.stringify(groups.map(g => g.id))}`);
    check("1c. no non-uuid group id survives (the 22P02 unread-dot poisoner)",
      !groups.some(g => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(g.id))),
      JSON.stringify(groups.map(g => g.id)));
    check("1d. the user is told it failed", toastSeen.hit, toastSeen.text);
  }
  await page.close();
}

// ── 2. CONTROL: the same flow against a server that ACCEPTS must still work ──────────────────
{
  const page = await makePage({ groupsRefused: false });
  const opened = await openCreateSheet(page);
  check("2a. [control] the create-group sheet opens", opened);
  if (opened) {
    await page.locator('input').first().fill("Test Crew");
    await page.getByRole("button", { name: /^Create$/ }).first().click({ force: true });
    await page.waitForTimeout(900);
    const st = await storeOf(page);
    const groups = st.groups || [];
    check("2b. [control] an accepted group IS kept, with the server's uuid",
      groups.length === 1 && groups[0].id === REALGID, JSON.stringify(groups.map(g => g.id)));
    const t = await page.evaluate(() => document.body.innerText || "");
    check("2c. [control] no failure message on the happy path", !/Couldn't create the group/i.test(t));
  }
  await page.close();
}

// ── 3. A REFUSED MEMBERSHIP CHANGE MUST REVERT ──────────────────────────────────────────────
// Leaving a group someone ELSE created is the reachable membership write. The stub refuses it the
// way the DB guard would; the member must still be in the group afterwards.
{
  const page = await makePage({ groupsRefused: true,
    groups: [{ id: GID, name: "Seshd Crew", description: "", createdBy: PAL, members: [PAL, ME], member_ids: [PAL, ME] }] });
  await page.locator('[aria-label="Discover"], [aria-label="discover"]').first().click({ force: true });
  await page.waitForTimeout(500);
  const groupsTile = page.getByText(/^Groups$/).first();
  if (await groupsTile.count()) { await groupsTile.click({ force: true }); await page.waitForTimeout(500); }
  const card = page.getByText(/^Seshd Crew$/).first();
  const reachable = await card.count() > 0;
  check("3a. the seeded group is on screen", reachable);
  if (reachable) {
    await card.click({ force: true });
    await page.waitForTimeout(900);
    // Leave Group lives under GroupDetail's own "Members" tab, not on the feed it opens on.
    const membersTab = page.getByRole("button", { name: /^Members$/ }).first();
    check("3b0. the group's Members tab is reachable", await membersTab.count() > 0);
    if (await membersTab.count()) { await membersTab.click({ force: true }); await page.waitForTimeout(400); }
    const leave = page.getByText(/Leave Group/i).first();
    const hasLeave = await leave.count() > 0;
    check("3b. the Leave Group control is reachable", hasLeave);
    if (hasLeave) {
      attempted.groupPatch = 0;
      await leave.click({ force: true });
      await page.waitForTimeout(500);
      // It goes through confirmAction. `Leave Group` is the page button underneath, so the
      // confirm's own button must be matched EXACTLY — matching either one made the first draft
      // click the page button again, fire nothing, and report "still a member" as a PASS. A check
      // that is satisfied by the flow never running is worth nothing.
      const confirm = page.getByRole("button", { name: /^Leave$/ }).first();
      const hasConfirm = await confirm.count() > 0;
      check("3b1. the leave confirmation sheet appears", hasConfirm);
      if (hasConfirm) await confirm.click({ force: true });
      const toastSeen = await waitForToast(page, /creator can change who's in it|Couldn't update the group/i);
      // PROOF THE FLOW ACTUALLY RAN. Without this, 3c passes on a build where the button does
      // nothing at all — the same vacuous shape the rest of this battery has been bitten by.
      check("3b2. the leave actually attempted a server write", attempted.groupPatch > 0,
        `PATCH /groups attempts = ${attempted.groupPatch}`);
      const st = await storeOf(page);
      const g = (st.groups || []).find(x => x.id === GID);
      const members = g ? (g.members || g.member_ids || []) : [];
      check("3c. a refused leave does NOT drop the member locally", members.includes(ME),
        `members = ${JSON.stringify(members)}`);
      check("3d. the user is told the change didn't stick", toastSeen.hit, toastSeen.text);
    }
  }
  await page.close();
}

// ── 4. A REFUSED _silent PROGRAM SAVE MUST LAND IN THE DURABLE QUEUE ────────────────────────
// The per-exercise rest picker inside a live program workout is the reachable _silent path. The
// PATCH is refused; the edit must still be recorded for flushWriteQueue to replay on reconnect.
{
  const page = await makePage({ programsRefused: true, withSession: true });
  const restBtn = page.locator('button[title="Rest time for this exercise"]').first();
  const reachable = await restBtn.count() > 0;
  check("4a. the per-exercise rest picker is reachable in a live program workout", reachable);
  if (reachable) {
    await restBtn.click({ force: true });
    await page.waitForTimeout(300);
    const opt = page.getByRole("button", { name: /^3m$/ }).first();
    const hasOpt = await opt.count() > 0;
    check("4b. the 3m rest option renders", hasOpt);
    if (hasOpt) {
      await opt.click({ force: true });
      await page.waitForTimeout(1200);
      const q = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("seshd_write_queue") || "[]"); } catch { return []; } });
      const entry = q.find(i => i.path === `programs?id=eq.${PID}` && i.method === "PATCH");
      check("4c. the refused edit is queued for retry, not discarded", !!entry,
        `queue = ${JSON.stringify(q.map(i => `${i.method} ${i.path}`))}`);
      let rest = null;
      try { rest = (JSON.parse(entry?.body || "{}").days || [])[0]?.exercises?.[0]?.rest; } catch {}
      check("4d. and the queued body carries the new rest value", rest === 180, `rest = ${rest}`);
    }
  }
  await page.close();
}

// ── 5. A PARTIAL GUEST MIGRATION MUST NOT REPORT ITSELF AS A WHOLE ONE ──────────────────────
// The most destructive member of this family. Every per-row upload caught its own error and
// carried on, so a run where the workouts were refused still cleared `seshd_guest` and toasted
// "Your progress is saved to your account". The data was not merely un-uploaded: loadUserData
// REPLACES `history` wholesale from the server on the next foreground, so the guest's local copy
// of the refused sessions was overwritten by the server's shorter list and the workouts were gone
// from the phone too. Nothing in this battery drove migrateGuestData at all before this section —
// pw_journey walks signup but never from a guest with data.
{
  const attempts = { history: 0 };
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(5000);
  page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });
  await page.addInitScript((me) => {
    const day = (d) => { const t = new Date(Date.now() - d * 864e5); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`; };
    localStorage.setItem("seshd_v1", JSON.stringify({
      currentUserId: me, theme: "dark", unit: "lbs", programs: [], prs: {}, prEvents: [],
      bodyLog: [], posts: [], groups: [], users: [],
      history: {
        [day(2)]: { "aaaaaaaa-1111-4111-8111-111111111111": { dayName: "Push A", unit: "lbs", duration: 1800,
          exercises: [{ name: "Barbell Bench Press", sets: [{ weight: "135", reps: "8", done: true, type: "normal" }] }] } },
        [day(4)]: { "bbbbbbbb-1111-4111-8111-111111111111": { dayName: "Pull A", unit: "lbs", duration: 1800,
          exercises: [{ name: "Barbell Row", sets: [{ weight: "115", reps: "8", done: true, type: "normal" }] }] } },
      },
      workoutDates: {},
    }));
    localStorage.setItem("seshd_guest", "1");
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
    localStorage.removeItem("seshd_session");
    localStorage.removeItem("seshd_write_queue");
  }, ME);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: ME, email: "n@e.com" } }) }));
  await page.route("**/rest/v1/**", r => {
    const req = r.request(), u = req.url(), m = req.method();
    if (/\/rest\/v1\/workout_history/.test(u) && m === "POST") {
      attempts.history++;
      // A 403 the server ANSWERED — not a transport failure, so the durable queue correctly
      // declines it and the row is genuinely lost. That is the case the user must be told about.
      return r.fulfill({ status: 403, contentType: "application/json",
        body: JSON.stringify({ code: "42501", message: "refused" }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(2000);

  const banner = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => /save progress/i.test(x.textContent || ""));
    if (b) { b.click(); return true; } return false;
  });
  check("5a. the guest banner's Save progress button is reachable", banner);
  if (banner) {
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
      for (const i of [...document.querySelectorAll("input")].filter(x => x.offsetParent)) {
        const ph = (i.placeholder || "").toLowerCase();
        if (i.type === "password") set(i, "testpass123");
        else if (/email/.test(ph) || i.type === "email") set(i, "newuser@example.com");
        else if (/user/.test(ph)) set(i, "momo");
        else set(i, "New User");
      }
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].filter(x => x.offsetParent)
      .find(x => /^(create account|sign up|continue)$/i.test((x.textContent || "").trim())); b && b.click(); });
    const toastSeen = await waitForToast(page, /didn't transfer|Your progress is saved/i, 6000);
    // PROOF THE MIGRATION ACTUALLY RAN, so the assertions below cannot pass vacuously on a build
    // where the signup never reached it. Two sessions x (first attempt + one retry) = 4.
    check("5b. the migration actually tried to upload the guest workouts", attempts.history >= 2,
      `workout_history POST attempts = ${attempts.history}`);
    check("5c. it retries a failed row once before giving up", attempts.history >= 4,
      `workout_history POST attempts = ${attempts.history} (expected 4: 2 rows x 2 attempts)`);
    check("5d. a partial migration does NOT claim the progress was saved",
      toastSeen.hit && !/Your progress is saved/i.test(toastSeen.text), toastSeen.text);
    check("5e. and it says what didn't transfer", /didn't transfer/i.test(toastSeen.text), toastSeen.text);
  }
  await page.close();
}

await browser.close();
console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
