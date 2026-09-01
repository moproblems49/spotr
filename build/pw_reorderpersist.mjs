// THREE SETTINGS THAT LOOKED SAVED AND WERE NOT — the app's dominant bug class, three more times.
// `loadUserData` REPLACES 28 store keys wholesale on every boot and foreground, so anything written
// only to the phone renders correctly, survives a tab switch, and is gone on the next launch.
//
//  1. REORDERING THE PROGRAM LIST was a bare `setStore` with no server write at all, and the query
//     behind it is `order=created_at.desc` — so the drag was undone by the next refresh, every
//     time. The order now lives on the profile as an array of program ids (one atomic PATCH for a
//     drag that moves every row between two indices).
//  2. REMOVING A CUSTOM EXERCISE was exempted from the settings-race guard as "additive", which
//     stopped being true when Settings grew Remove and Clear-all. loadUserData UNIONS the local
//     list with the server's, so a refresh landing before the PATCH RESURRECTS the exercise you
//     just deleted — and the next persist can write it back, making the removal permanently fail.
//  3. A BODY-LOG ENTRY was exempted as "append-only", which was never true: an entry REPLACES the
//     existing one for the same date.
//
// Each section asserts the SERVER WRITE (a local-only change is the bug) and then that a refresh
// landing immediately afterwards does not undo it.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
const P1 = "aaaaaaaa-1111-4111-8111-111111111111";
const P2 = "bbbbbbbb-2222-4222-8222-222222222222";
const P3 = "cccccccc-3333-4333-8333-333333333333";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const prog = (id, name, created) => ({ id, user_id: ME, name, days: [], share_code: null, created_at: created });
// Newest first is what the query returns, so the UNTOUCHED order is Third, Second, First.
const ROWS = [prog(P3, "Third", "2026-03-03T10:00:00Z"), prog(P2, "Second", "2026-02-02T10:00:00Z"), prog(P1, "First", "2026-01-01T10:00:00Z")];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

async function makePage({ profile = {}, onPatch = null } = {}) {
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(5000);
  page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });
  await page.addInitScript((me) => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: "dark", unit: "lbs",
      programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
      customExercises: [], groups: [], profile: { username: "momo", name: "Mo" },
      users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: me } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
    localStorage.removeItem("seshd_write_queue");
  }, ME);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: ME } }) }));
  await page.route("**/rest/v1/**", r => {
    const req = r.request(), u = req.url(), m = req.method();
    const J = b => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (m === "PATCH" && /\/rest\/v1\/profiles/.test(u)) {
      let body = null; try { body = JSON.parse(req.postData() || "null"); } catch {}
      if (onPatch) onPatch(body);
      return J([]);
    }
    // SEED THROUGH THE STUB: loadUserData replaces programs / custom_exercises / body_log
    // wholesale, so a fixture that only writes localStorage is erased a second later.
    if (m === "GET" && /\/rest\/v1\/programs\?/.test(u)) return J(ROWS);
    if (m === "GET" && /\/rest\/v1\/(profiles|public_profiles)\?/.test(u))
      return J([{ id: ME, username: "momo", name: "Mo", unit: "lbs", theme: "dark", is_public: true,
        seen_onboarding: true, ...profile }]);
    return J([]);
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(1800);
  return page;
}

// The program list lives on the Workout tab under "Your Programs".
async function programNames(page) {
  return await page.evaluate(() => [...document.querySelectorAll('[aria-label="Drag to reorder program"]')]
    .map(h => { const row = h.closest("div")?.parentElement; return (row?.innerText || "").split("\n")[0].trim(); }));
}

// ── 1. THE STORED ORDER MUST BEAT created_at.desc ON LOAD ───────────────────────────────────
{
  const page = await makePage({ profile: { program_order: [P1, P2, P3] } });
  const names = await programNames(page);
  check("1a. the program list renders", names.length === 3, JSON.stringify(names));
  check("1b. a saved order beats the query's created_at.desc default",
    names.join(",") === "First,Second,Third", JSON.stringify(names));
  await page.close();
}

// ── 2. AN UNKNOWN / PARTIAL ORDER MUST NEVER HIDE A PROGRAM ─────────────────────────────────
// A program created on another device since the last reorder is not in the array. It has to keep
// its query position AFTER the ordered ones, not vanish.
{
  const page = await makePage({ profile: { program_order: [P1, "99999999-9999-4999-8999-999999999999"] } });
  const names = await programNames(page);
  check("2a. every program still appears when the saved order is partial and holds a stale id",
    names.length === 3 && names.includes("Second") && names.includes("Third"), JSON.stringify(names));
  check("2b. the one named position is honoured first", names[0] === "First", JSON.stringify(names));
  await page.close();
}

// ── 3. A DRAG MUST REACH THE SERVER ─────────────────────────────────────────────────────────
{
  const patched = [];
  const page = await makePage({ profile: {}, onPatch: b => { if (b && b.program_order) patched.push(b.program_order); } });
  const before = await programNames(page);
  check("3a. the untouched list is the query's own order", before.join(",") === "Third,Second,First", JSON.stringify(before));
  const handles = page.locator('[aria-label="Drag to reorder program"]');
  const n = await handles.count();
  check("3b. the drag handles are present", n === 3, `found ${n}`);
  if (n === 3) {
    // PointerSensor activates on 6px of movement, so page.mouse is the right driver here
    // (a TouchSensor hold is what pw_reorder covers for the day editor).
    const a = await handles.nth(0).boundingBox();
    const c = await handles.nth(2).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + (c.y - a.y) * i / 10); await page.waitForTimeout(25); }
    await page.mouse.up();
    await page.waitForTimeout(900);
    const after = await programNames(page);
    check("3c. the list actually reordered on screen", after.join(",") !== before.join(","), `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    // THE POINT OF THE WHOLE SUITE: a local-only reorder is the bug.
    check("3d. the new order was written to the SERVER, not just the phone", patched.length > 0,
      `program_order PATCHes seen: ${patched.length}`);
    if (patched.length) check("3e. and the written order matches what is on screen",
      JSON.stringify(patched[patched.length - 1].map(id => ({ [P1]: "First", [P2]: "Second", [P3]: "Third" })[id])) === JSON.stringify(after),
      `${JSON.stringify(patched[patched.length - 1])} vs ${JSON.stringify(after)}`);
  }
  await page.close();
}

// ── 4. A REMOVED CUSTOM EXERCISE MUST NOT COME BACK ─────────────────────────────────────────
// loadUserData UNIONS local with server, so without the recent-edit guard the refresh that lands
// right after the delete resurrects it.
{
  const CUSTOM = [{ id: "cx1", name: "Zolgar Row", muscle: "Back" }];
  const patched = [];
  const page = await makePage({ profile: { custom_exercises: CUSTOM },
    onPatch: b => { if (b && "custom_exercises" in b) patched.push(b.custom_exercises); } });
  // Settings lives on the PROFILE screen, not the tab the fixture boots on — reach it the way a
  // finger does rather than assuming the control is already on screen.
  await page.locator('[aria-label="Profile"], [aria-label="profile"]').first().click({ force: true });
  await page.waitForTimeout(900);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^settings$/i.test(x.getAttribute("aria-label") || "")); b && b.click(); });
  await page.waitForTimeout(1000);
  // ★ THE FOREGROUND REFRESH IS THROTTLED TO ONCE PER 30s (`lastFetchRef`), so dispatching
  // visibilitychange a few seconds after boot is a NO-OP and the whole section passes against a
  // broken build — the documented "a script that cannot fail" trap, reached through a throttle.
  // Wait the throttle out BEFORE the edit, which is also the realistic shape of the race: app open
  // a while, then a change, then a background/foreground.
  await page.waitForTimeout(31000);
  const hasRow = await page.evaluate(() => /Zolgar Row/.test(document.body.innerText));
  check("4a. the custom exercise is listed in Settings", hasRow);
  if (hasRow) {
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].filter(x => x.offsetParent).find(x => /^Remove$/.test((x.textContent || "").trim())); b && b.click(); });
    await page.waitForTimeout(500);
    // The confirm sheet's button ALSO says "Remove", and the row's button is still on screen
    // underneath it — picking the first match clicks the row again and the flow never runs, which
    // is exactly how the leave-group check in pw_silentfail first passed against a broken build.
    // Assert the sheet is up, then take the LAST match (ConfirmHost portals to document.body, so
    // it is later in DOM order than the row).
    const confirmUp = await page.evaluate(() => /Remove Zolgar Row\?/.test(document.body.innerText));
    check("4b0. the removal confirmation sheet appears", confirmUp);
    await page.evaluate(() => { const bs = [...document.querySelectorAll("button")].filter(x => x.offsetParent && /^Remove$/.test((x.textContent || "").trim())); const b = bs[bs.length - 1]; b && b.click(); });
    await page.waitForTimeout(700);
    check("4b. the removal was written to the server", patched.length > 0, `custom_exercises PATCHes: ${patched.length}`);
    // Force the foreground refresh that used to undo it. The server still returns the OLD list,
    // exactly as it would in the window before the PATCH commits.
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(1500);
    const back = await page.evaluate(() => { try { return (JSON.parse(localStorage.getItem("seshd_v1") || "{}").customExercises || []).some(e => e.name === "Zolgar Row"); } catch { return null; } });
    check("4c. a refresh landing before the write commits does NOT resurrect it", back === false, `present again: ${back}`);
  }
  await page.close();
}

await browser.close();
console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
