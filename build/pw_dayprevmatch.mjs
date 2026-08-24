// Red-proofed for the "DayPreviewModal matches by name, not id" bug found in the Aug 24 audit.
// Two programs can easily share a day name (every new program's first day defaults to "Day 1"),
// and the old code matched `store.programs.find(p => p.days?.some(d => d.name === previewDay.day.name))`
// — the FIRST program in the array with a same-named day wins, regardless of which one the user
// actually opened. Seeded so the OTHER program (sharing the day name) sorts first in the array,
// which reproduces the corruption deterministically against the old code.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(6000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 200)); });

const PROG_B = { id: "progB-decoy", name: "Program B (decoy)", days: [
  { id: "dayB1", name: "Day 1", exercises: [{ name: "Back Squat", reps: "3×5" }] },
] };
const PROG_A = { id: "progA-active", name: "Program A (active)", days: [
  { id: "dayA1", name: "Day 1", exercises: [{ name: "Bench Press", reps: "3×8-12" }] },
] };

const writes = [];

await page.addInitScript(({ me, progB, progA }) => {
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs",
    // PROG_B listed FIRST on purpose — the old name-matching code always finds the FIRST array
    // entry with a matching day name, so this ordering is what makes the corruption deterministic.
    programs: [progB, progA], activeProgramId: progA.id,
    workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [], history: {},
    weeklyTarget: 3, isPublic: false, customExercises: [],
    profile: { username: "momo", name: "Mo" },
    users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, { me: ME, progB: PROG_B, progA: PROG_A });

await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "t", user: { id: ME } }) }));
await page.route("**/rest/v1/**", r => {
  const req = r.request(), u = req.url(), m = req.method();
  const J = b => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  if (m === "POST" || m === "PATCH" || m === "DELETE") {
    let body = null; try { body = JSON.parse(req.postData() || "null"); } catch {}
    writes.push({ url: u, method: m, body: Array.isArray(body) ? body[0] : body });
    return J([{ id: "x" }]);
  }
  if (/\/rest\/v1\/(public_)?profiles\?/.test(u))
    return J([{ id: ME, username: "momo", name: "Mo", unit: "lbs", theme: "dark", seen_onboarding: true, weekly_target: 3, is_public: false, active_program_id: PROG_A.id }]);
  if (/\/rest\/v1\/programs/.test(u)) return J([PROG_B, PROG_A]);
  return J([]);
});

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

// Open the active program's "Day 1" preview from the Workout tab.
const opened = await page.evaluate(() => {
  const rows = [...document.querySelectorAll("button")];
  const row = rows.find(b => /Bench Press/.test(b.textContent || "") && /Day 1/.test(b.textContent || ""));
  if (row) { row.click(); return true; }
  return false;
});
check("opened Program A's Day 1 preview", opened);
await page.waitForTimeout(600);

// DayPreviewModal is a `data-fullscreen-overlay` sitting OVER the still-mounted Workout tab
// underneath it (this app deliberately never unmounts the screen behind an overlay — see the
// EdgeSwipeBack conventions). Scope every subsequent query to the overlay itself, or a raw
// document-wide `find` on button text grabs the underlying page's identically-labeled "Edit"
// button instead of the modal's own toggle — a fragile-selector trap, not an app bug, and worth
// leaving this comment so the next person editing this test doesn't reintroduce it.
const overlay = '[data-fullscreen-overlay="true"]';

const enteredEdit = await page.evaluate((sel) => {
  const root = document.querySelector(sel);
  if (!root) return false;
  const b = [...root.querySelectorAll("button")].find(x => (x.textContent || "").trim() === "Edit");
  if (b) { b.click(); return true; }
  return false;
}, overlay);
check("entered edit mode", enteredEdit);
await page.waitForTimeout(400);

const repsInput = page.locator(`${overlay} input[placeholder="3×8–12"]`).first();
await repsInput.fill("5×5 CHANGED").catch(() => {});
await page.waitForTimeout(200);

const savedDone = await page.evaluate((sel) => {
  const root = document.querySelector(sel);
  if (!root) return false;
  const b = [...root.querySelectorAll("button")].find(x => (x.textContent || "").trim() === "Done");
  if (b) { b.click(); return true; }
  return false;
}, overlay);
check("tapped Done to save", savedDone);
await page.waitForTimeout(600);

const progPatch = writes.find(w => w.method === "PATCH" && /\/programs\?/.test(w.url));
check("a program PATCH fired", !!progPatch, JSON.stringify(writes.map(w => w.url)));
if (progPatch) {
  const targetsCorrectId = progPatch.url.includes("progA-active");
  const targetsDecoy = progPatch.url.includes("progB-decoy");
  check("PATCH targets Program A (the one actually opened), not the decoy", targetsCorrectId && !targetsDecoy,
    `url=${progPatch.url}`);
  const bodyHasEdit = progPatch.body && JSON.stringify(progPatch.body).includes("CHANGED");
  check("the saved body carries the actual edit", !!bodyHasEdit);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAIL(S)`);
await browser.close();
process.exit(fails === 0 ? 0 : 1);
