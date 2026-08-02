// EDITING A PAST WORKOUT MUST NOT CRASH THE APP.
//
// `EditHistoryModal.handleSave` declared `const eu = sess.unit || store.unit || "lbs"` INSIDE step
// 2b's try block, then used it in steps 3, 4 and 5 (the local post rebuild and the two server post
// patches). Step 3's use sits inside a setStore updater, so the ReferenceError was thrown during
// React's render phase and the ErrorBoundary replaced the entire app with "Something went sideways".
// Steps 4 and 5 threw into their own catch, so the feed post and every group post silently stayed
// stale while the history row took the edit.
//
// EVERY edit of a past workout did this, for ~4 weeks. Mo hit it on his phone 2026-08-01 18:46
// (client_errors: "Can't find variable: eu", source ErrorBoundary, iPhone OS 18_7) and it left one
// real feed card 29% below its history row.
//
// Shown red against 9f869d4 before being trusted.
import { chromium } from "playwright-core";

const ME = "11111111-1111-4111-8111-111111111111";
const SID = "aaaaaaaa-3333-4333-8333-333333333333";
const d = new Date();
const DK = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const s = (w, r) => ({ weight: String(w), reps: String(r), done: true, type: "normal" });

const ROW = {
  id: SID, user_id: ME, day_name: "Push Day A", duration_secs: 3600, unit: "lbs", note: null,
  workout_date: DK, created_at: new Date().toISOString(),
  exercises: [{ name: "Barbell Bench Press", sets: [s(135, 5), s(135, 5)] }],
};

// THE SESSION MUST ALSO HAVE BEEN SHARED. `eu`'s first use sits inside the `.map` over existing
// posts in step 3, so with no matching post the map body never runs and the crash never fires —
// the first version of this test passed against the broken code for exactly that reason. Mo's real
// sequence was post at 18:36, edit at 18:46.
const POST_ROW = {
  id: "bbbbbbbb-3333-4333-8333-333333333333", user_id: ME, type: "workout", caption: "",
  image_url: null, location: null, run: null, yoga: null, achievement: null, unit: "lbs",
  is_pr: false, client_id: SID, created_at: new Date().toISOString(),
  workout: { name: "Push Day A", duration: 3600, volume: 1350,
    exercises: [{ name: "Barbell Bench Press", isPR: false, sets: [{ w: 135, r: 5 }, { w: 135, r: 5 }] }] },
};

let fails = 0;
const check = (l, c, dd) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${dd ? " — " + dd : ""}`); } };

const PORT = process.env.PORT || "8199";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);

const writes = [];
await page.addInitScript((me) => {
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
    prEvents: [], bodyLog: [], prs: {}, posts: [], profile: { username: "momo", name: "Mo" },
    users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, ME);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));
await page.route("**/rest/v1/**", r => {
  const req = r.request(), u = req.url(), m = req.method();
  if (m !== "GET") writes.push({ method: m, url: u.split("/rest/v1/")[1], body: req.postData() || "" });
  let body = "[]";
  if (m === "GET" && /\/rest\/v1\/workout_history\?/.test(u)) body = JSON.stringify([ROW]);
  else if (m === "GET" && /\/rest\/v1\/posts\?/.test(u)) body = JSON.stringify([POST_ROW]);
  else if (m === "GET" && /\/rest\/v1\/(profiles|public_profiles)\?/.test(u))
    body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]);
  r.fulfill({ status: 200, contentType: "application/json", body });
});

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 20000 });
await page.waitForTimeout(2500);

// Tracker tab → History sub-tab.
await page.mouse.click(164, 869);
await page.waitForTimeout(900);
const histTab = page.getByText("History", { exact: true }).locator("visible=true").first();
if (await histTab.count()) { await histTab.click(); await page.waitForTimeout(1300); }

// Open the session's overflow → Edit.
const dots = page.getByText("···", { exact: true }).locator("visible=true").first();
if (await dots.count()) { await dots.click(); await page.waitForTimeout(600); }
const editBtn = page.getByText("Edit", { exact: false }).locator("visible=true").first();
check("the Edit control is reachable from a History session", await editBtn.count() > 0);
if (await editBtn.count()) { await editBtn.click(); await page.waitForTimeout(900); }

// Change the first weight 135 → 150 and save.
const weightBoxes = page.locator('input[inputmode="decimal"], input[inputmode="numeric"]').locator("visible=true");
const n = await weightBoxes.count();
check("the edit modal rendered its weight inputs", n > 0, `found ${n}`);
if (n > 0) { await weightBoxes.first().fill("150"); await page.waitForTimeout(250); }
const saveBtn = page.getByText("Save", { exact: false }).locator("visible=true").first();
if (await saveBtn.count()) { await saveBtn.click(); }
await page.waitForTimeout(1800);

const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
await page.screenshot({ path: "/home/user/spotr/build/_edithistory.png" });

// ── THE BUG ──────────────────────────────────────────────────────────────────────────────────
check("saving an edit does not crash the app", !/Something went sideways/.test(body), body.slice(0, 200));
check("...and no ReferenceError is reported to client_errors",
  !writes.some(w => /client_errors/.test(w.url) && /is not defined|Can't find variable/.test(w.body)),
  JSON.stringify(writes.filter(w => /client_errors/.test(w.url)).map(w => w.body).slice(0, 2)));

// ── The edit must actually land ──────────────────────────────────────────────────────────────
const patch = writes.find(w => w.method === "PATCH" && /workout_history\?id=eq\./.test(w.url));
check("the history row is patched with the corrected weight", !!patch && /"150"/.test(patch.body),
  patch ? patch.body.slice(0, 160) : "no PATCH issued");
check("the corrected weight is on screen afterwards", /150/.test(body), body.slice(0, 300));

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
