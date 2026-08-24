// Red-proofed for the regression an audit caught in this session's own earlier fix: enabling
// canCreate on ProgramDetailView's ExercisePickerSheet (by passing setStore) turned on the
// "+ Create as custom exercise" flow for the first time in this view, but ProgramDetailView never
// received currentUserId — so saveCustomExercise's `if (tok && currentUserId)` guard silently
// skipped the server write. The fix threads currentUserId through; this confirms the PATCH
// actually fires with the real user id, not undefined.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(6000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 200)); });

const PROG = { id: "progA-active", name: "Program A", days: [
  { id: "dayA1", name: "Day 1", exercises: [{ name: "Bench Press", reps: "3×8-12" }] },
] };
const writes = [];

await page.addInitScript(({ me, prog }) => {
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs",
    programs: [prog], activeProgramId: prog.id,
    workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [], history: {},
    weeklyTarget: 3, isPublic: false, customExercises: [],
    profile: { username: "momo", name: "Mo" },
    users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, { me: ME, prog: PROG });

await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "t", user: { id: ME } }) }));
await page.route("**/rest/v1/**", r => {
  const req = r.request(), u = req.url(), m = req.method();
  const J = b => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  if (m === "PATCH" || m === "POST") {
    let body = null; try { body = JSON.parse(req.postData() || "null"); } catch {}
    writes.push({ url: u, method: m, body });
    return J([{ id: "x" }]);
  }
  if (/\/rest\/v1\/(public_)?profiles\?/.test(u))
    return J([{ id: ME, username: "momo", name: "Mo", unit: "lbs", theme: "dark", seen_onboarding: true, weekly_target: 3, is_public: false, active_program_id: PROG.id }]);
  if (/\/rest\/v1\/programs/.test(u)) return J([PROG]);
  return J([]);
});

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

// Open the active program's day editor via the day card's bottom "Edit" button.
const openedEditor = await page.evaluate(() => {
  const rows = [...document.querySelectorAll("button")];
  const row = rows.find(b => (b.textContent || "").trim() === "Edit");
  if (row) { row.click(); return true; }
  return false;
});
check("opened the program day editor", openedEditor);
await page.waitForTimeout(700);

// Tap "+ Add Exercise".
const openedPicker = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => /\+ Add Exercise/i.test(x.textContent || ""));
  if (b) { b.click(); return true; }
  return false;
});
check("opened the exercise picker sheet", openedPicker);
await page.waitForTimeout(500);

// Type a name that won't match the library. Two "Search exercises..." inputs exist at this point
// — the row's OWN inline rename field (ExerciseInput, first in DOM order) and the picker sheet's
// own search box (portaled, appended later) — `.first()` grabs the WRONG one (confirmed: it
// silently renamed "Bench Press" instead of searching the sheet). The sheet's is `.last()`.
const searchInput = page.locator('input[placeholder*="Search" i]').last();
await searchInput.fill("Sandbag Zercher Carry Custom").catch(() => {});
await page.waitForTimeout(400);

const createOfferShown = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => /Create ".*" as a custom exercise/i.test(x.textContent || ""));
  return !!b;
});
check("the create-as-custom-exercise option is offered (canCreate is on)", createOfferShown);

const tappedCreate = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => /Create ".*" as a custom exercise/i.test(x.textContent || ""));
  if (b) { b.click(); return true; }
  return false;
});
check("tapped the create-as-custom-exercise option", tappedCreate);
await page.waitForTimeout(400);

// Pick "Traps" specifically — it's in CreateExercisePicker's CUSTOM_MUSCLE_GROUPS list but NOT
// in the sheet's own category-filter chip row (All/Chest/Back/Shoulders/Biceps/Triceps/Quads/
// Hamstrings/Glutes/Calves/Core), so there's no ambiguity about which "Chest"-shaped button a
// generic muscle-name regex might otherwise hit.
const pickedMuscle = await page.evaluate(() => {
  const chip = [...document.querySelectorAll("button")].find(b => (b.textContent||"").trim() === "Traps");
  if (chip) { chip.click(); return true; }
  return false;
});
check("picked the Traps muscle-group chip (CreateExercisePicker-only)", pickedMuscle);
await page.waitForTimeout(300);

const tappedCreateAdd = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => (x.textContent || "").trim() === "Create & add");
  if (b && !b.disabled) { b.click(); return true; }
  return false;
});
check("tapped 'Create & add'", tappedCreateAdd);
await page.waitForTimeout(600);

const customExPatch = writes.find(w => w.method === "PATCH" && /\/profiles\?/.test(w.url) && w.body && w.body.custom_exercises);
check("a profiles PATCH carrying custom_exercises actually fired", !!customExPatch,
  JSON.stringify(writes.map(w => ({ url: w.url, method: w.method }))));
if (customExPatch) {
  check("the PATCH targets the REAL signed-in user, not 'undefined'", customExPatch.url.includes(`id=eq.${ME}`), customExPatch.url);
  const names = (customExPatch.body.custom_exercises || []).map(e => e.name);
  check("the new custom exercise is actually in the saved payload", names.some(n => /Sandbag Zercher/i.test(n)), JSON.stringify(names));
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAIL(S)`);
await browser.close();
process.exit(fails === 0 ? 0 : 1);
