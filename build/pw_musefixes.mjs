// FIVE THINGS A TESTER (Muse) HIT ON NOV 23, EACH PINNED BY WHAT REACHES THE SERVER OR THE SCREEN.
// 1. Guest -> account: a guest program with a short uid() id 22P02'd on `programs.id` (uuid), so the
//    toast said "1 item didn't transfer" and the next refresh deleted the program. Measured in the
//    Postgres log of a real sign-in. Its id must be re-minted as a uuid, and active_program_id with it.
// 2. Guest -> account: a workout from this morning was stamped noon TODAY, i.e. in the future, and
//    the profile card read "-40306s". created_at must never be later than now.
// 3. The weekly card counts TRAINING DAYS but captioned them "workouts", so two sessions in a day
//    read "1/3 workouts". The caption must say days.
// 4. The home feed paged the newest posts from EVERYONE and then hid strangers, so a page could
//    render nothing ("Load older posts does nothing"). The query must ask for you + follows only.
// 5. The number pad showed "—" over a field the row was showing last time's value in.
import { chromium } from "playwright-core";
const ME = "11111111-1111-4111-8111-111111111111", F = "22222222-2222-4222-8222-222222222222";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const dk = (t) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;

// ── 1+2. guest migration ─────────────────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
  page.setDefaultTimeout(5000);
  page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });
  const seen = { programs: [], patches: [], history: [], saved: [] };
  const finishedAt = Date.now() - 3600e3;   // an hour ago — earlier than noon for most of the day
  await page.addInitScript(([me, fin, today]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({
      currentUserId: me, theme: "dark", unit: "lbs", prs: {}, prEvents: [], bodyLog: [], posts: [], groups: [], users: [],
      programs: [{ id: "k3x9q2m", name: "My Split", days: [{ id: "d1", name: "Push", exercises: [] }] }],
      activeProgramId: "k3x9q2m",
      history: { [today]: { "aaaaaaaa-1111-4111-8111-111111111111": { dayName: "Push A", unit: "lbs", duration: 1800, finishedAt: fin,
        exercises: [{ name: "Barbell Bench Press", sets: [{ weight: "135", reps: "8", done: true, type: "normal" }] }] } } },
      workoutDates: {},
    }));
    localStorage.setItem("seshd_guest", "1"); localStorage.setItem("seshd_onboarded", "1"); localStorage.setItem("seshd_custom_merge_v1", "1");
    localStorage.removeItem("seshd_session"); localStorage.removeItem("seshd_write_queue");
  }, [ME, finishedAt, dk(new Date(finishedAt))]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: ME, email: "n@e.com", identities: [{ id: "x" }] } }) }));
  await page.route("**/rest/v1/**", r => {
    const req = r.request(), u = req.url(), m = req.method();
    let body = {}; try { body = JSON.parse(req.postData() || "{}"); } catch {}
    if (/\/rest\/v1\/programs/.test(u) && m === "POST") {
      seen.programs.push(body.id);
      // Model the real column: a non-uuid id is a 22P02, exactly what the Postgres log showed.
      if (!UUID.test(String(body.id))) return r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "22P02", message: "invalid input syntax for type uuid" }) });
    }
    if (/\/rest\/v1\/programs/.test(u) && m === "POST") seen.saved.push(body);
    if (/\/rest\/v1\/programs\?/.test(u) && m === "GET") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(seen.saved) });
    if (/\/rest\/v1\/profiles/.test(u) && m === "PATCH") seen.patches.push(body);
    if (/\/rest\/v1\/profiles\?/.test(u) && m === "GET") { const ap = seen.patches.find(p => "active_program_id" in p);
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: ME, username: "momo", seen_onboarding: true, active_program_id: ap ? ap.active_program_id : null }]) }); }
    if (/\/rest\/v1\/workout_history/.test(u) && m === "POST") seen.history.push(body);
    return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto("http://127.0.0.1:8199/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const banner = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /save progress/i.test(x.textContent || "")); b && b.click(); return !!b; });
  check("1a. guest banner reachable", banner);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    for (const i of [...document.querySelectorAll("input")].filter(x => x.offsetParent)) {
      const ph = (i.placeholder || "").toLowerCase();
      if (i.type === "password") set(i, "testpass123"); else if (/email/.test(ph) || i.type === "email") set(i, "n@e.com");
      else if (/user/.test(ph)) set(i, "momo"); else set(i, "New User");
    }
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].filter(x => x.offsetParent).find(x => /^(create account|sign up|continue)$/i.test((x.textContent || "").trim())); b && b.click(); });
  await page.waitForTimeout(3500);
  check("1b. [control] the migration ran", seen.programs.length > 0 && seen.history.length > 0, JSON.stringify({ p: seen.programs.length, h: seen.history.length }));
  check("1c. the guest program is uploaded with a uuid id", seen.programs.length > 0 && seen.programs.every(id => UUID.test(String(id))), JSON.stringify(seen.programs));
  const ap = seen.patches.find(p => "active_program_id" in p);
  check("1d. the active program PATCH names that same uuid", ap && ap.active_program_id === seen.programs[0], JSON.stringify(ap));
  const local = await page.evaluate(() => { try { const s = JSON.parse(localStorage.getItem("seshd_v1")); return { ids: (s.programs || []).map(p => p.id), active: s.activeProgramId }; } catch { return null; } });
  check("1e. the phone holds the same id, so the program survives the next refresh", local && local.ids.includes(seen.programs[0]) && local.active === seen.programs[0], JSON.stringify(local));
  const ca = seen.history[0] && Date.parse(seen.history[0].created_at);
  check("2a. a migrated workout is never stamped in the future", ca && ca <= Date.now() + 1000, seen.history[0] && seen.history[0].created_at);
  check("2b. and it carries the session's own finish time", ca && Math.abs(ca - finishedAt) < 1000, seen.history[0] && seen.history[0].created_at);
  await page.close();
}

// ── 3+4. weekly caption and the feed query ──────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 402, height: 874 }, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(5000);
  page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });
  const today = dk(new Date()); const postGets = [];
  const row = (id, h) => ({ id, user_id: ME, day_name: "Push", unit: "lbs", duration_secs: 1800, workout_date: today,
    created_at: new Date(Date.now() - h * 3600e3).toISOString(), exercises: [{ name: "Barbell Bench Press", sets: [{ weight: "135", reps: "8", done: true }] }] });
  await page.addInitScript(me => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: "dark", unit: "lbs", weeklyTarget: 3 }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: me } }));
    localStorage.setItem("seshd_onboarded", "1"); localStorage.setItem("seshd_custom_merge_v1", "1");
  }, ME);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "t", user: { id: ME } }) }));
  await page.route("**/rest/v1/**", r => {
    const u = r.request().url(); let body = "[]";
    if (/\/profiles\?/.test(u)) body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", theme: "dark", weekly_target: 3, seen_onboarding: true }]);
    else if (/\/workout_history\?/.test(u)) body = JSON.stringify([row("aaaaaaaa-0000-4000-8000-000000000001", 3), row("aaaaaaaa-0000-4000-8000-000000000002", 1)]);
    else if (/\/follows\?follower_id=eq\./.test(u)) body = JSON.stringify([{ following_id: F }]);
    else if (/\/follows\?/.test(u)) body = JSON.stringify([{ follower_id: ME, following_id: F, status: "accepted" }]);
    else if (/\/posts\?/.test(u)) postGets.push(decodeURIComponent(u));
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await page.goto("http://127.0.0.1:8199/"); await page.waitForTimeout(3500);
  const card = await page.evaluate(() => { const k = [...document.querySelectorAll("div")].find(d => d.children.length === 0 && /^THIS WEEK$/.test(d.textContent.trim())); return k ? k.parentElement.textContent : null; });
  check("3a. [control] the weekly card rendered", !!card, card);
  check("3b. it counts training days and says so", card && /1\/3\s*days/.test(card) && !/workouts?/i.test(card), card);
  const page0 = postGets.find(u => /offset=0/.test(u) && !/user_id=eq\./.test(u));
  check("4a. [control] the feed page was requested", !!page0, JSON.stringify(postGets));
  check("4b. the feed page asks only for you + people you follow", page0 && page0.includes(`user_id=in.(${ME},${F})`), page0);
  await page.close();
}

// ── 5. the number pad shows last time's value instead of a dash ─────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(5000);
  page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });
  const SESSION = { dayName: "Push A", unit: "lbs", exercises: [{ id: "e1", name: "Barbell Bench Press", reps: "5-8", sets: [{ id: "s0", weight: "", reps: "", done: false, type: "normal" }, { id: "s1", weight: "", reps: "", done: false, type: "normal" }] }] };
  await page.addInitScript(([me, s, d]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: "dark", unit: "lbs", programs: [], workoutDates: { [d]: true }, prEvents: [], bodyLog: [], prs: {}, posts: [], users: [],
      history: { [d]: { "x1": { dayName: "Push A", unit: "lbs", exercises: [{ name: "Barbell Bench Press", sets: [{ weight: "185", reps: "8", done: true, type: "normal" }, { weight: "175", reps: "7", done: true, type: "normal" }] }] } } } }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: me } }));
    localStorage.setItem("seshd_onboarded", "1"); localStorage.setItem("seshd_custom_merge_v1", "1");
    localStorage.setItem("seshd_active_session", JSON.stringify(s)); localStorage.setItem("seshd_wstart", String(Date.now() - 6e5));
  }, [ME, SESSION, "2026-01-05"]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "t", user: { id: ME } }) }));
  await page.route("**/rest/v1/**", r => r.abort());
  await page.goto("http://127.0.0.1:8199/"); await page.waitForTimeout(2500);
  const read = async (field, idx) => {
    await page.evaluate(([f, i]) => document.querySelectorAll(`[data-set-field="${f}"]`)[i]?.click(), [field, idx]);
    await page.waitForTimeout(500);
    return page.evaluate(() => { const pad = [...document.querySelectorAll("div")].filter(d => getComputedStyle(d).position === "fixed" && getComputedStyle(d).zIndex === "450").pop();
      if (!pad) return null; const v = [...pad.querySelectorAll("div")].find(d => getComputedStyle(d).fontSize === "20px" && getComputedStyle(d).fontWeight === "800"); return v ? v.textContent.trim() : "?"; });
  };
  const w0 = await read("weight", 0);
  check("5a. [control] the pad opened", w0 != null, String(w0));
  check("5b. an empty weight shows last time's 185, not a dash", w0 === "185", String(w0));
  const r1 = await read("reps", 1);
  check("5c. the second set's reps show last time's 7", r1 === "7", String(r1));
  await page.close();
}

await browser.close();
console.log(fails ? `FAIL ${fails} check(s)` : "ALL PASS");
process.exit(fails ? 1 : 0);
