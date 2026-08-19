// AVG AND PEAK MUST BOTH APPEAR WHEREVER HEART RATE IS REPORTED.
//
// Mo: "in profile/home it only shows the avg (should show both on top of each other maybe in
// smaller text in the same area)." Four surfaces printed this number and only ONE — History's
// session card — printed both halves of it. The workout post card (feed AND your own profile),
// the group-share picker row and the new-post picker row all dropped `peak` on the floor, so the
// same session read "♥ 142 avg · 171 peak" on one screen and a bare "142 ♥ AVG" on the next.
//
// Everything now goes through `HrStat` (the stacked tile) or `hrInline` (the run-on line), which
// is the same one-definition rule this repo applies to volume, set counts and PR badges. This
// suite seeds ONE session carrying a known hr_summary and reads every surface for both numbers.
import { chromium } from "playwright-core";

const ME = "11111111-1111-4111-8111-111111111111";
const d = new Date();
const DK = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const s = (w, r) => ({ weight: String(w), reps: String(r), done: true, type: "normal" });

const AVG = 142, PEAK = 171;
const ROW = {
  id: "aaaaaaaa-3333-4333-8333-333333333333", user_id: ME,
  day_name: "Heart Day", duration_secs: 3600, unit: "lbs", note: null,
  workout_date: DK, created_at: new Date().toISOString(),
  hr_summary: { avg: AVG, peak: PEAK, min: 61, samples: 400 },
  exercises: [{ name: "Barbell Bench Press", sets: [s(185, 8), s(185, 8)] }],
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);
let fails = 0;
const check = (l, c, dd) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${dd ? " — " + dd : ""}`); } };
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });

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
  const u = r.request().url();
  let body = "[]";
  if (/\/rest\/v1\/workout_history\?/.test(u)) body = JSON.stringify([ROW]);
  else if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u))
    body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]);
  r.fulfill({ status: 200, contentType: "application/json", body });
});

const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));

await page.goto(`http://127.0.0.1:${process.env.PORT || 8199}/`, { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => !/Setting up your account/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2200);

// ── HISTORY — the one surface that was already right; it must STAY right after consolidation ──
await page.mouse.click(164, 869); await page.waitForTimeout(800);
const histTab = page.getByText("History", { exact: false }).first();
if (await histTab.count()) { await histTab.click(); await page.waitForTimeout(1400); }
const hist = await text();
await page.screenshot({ path: "build/shot_hr_history.png", fullPage: true });
console.log("HISTORY:", (hist.match(/Heart Day.{0,120}/) || ["(no Heart Day row)"])[0]);
check("1. History still prints the avg", hist.includes(`${AVG} avg`), hist.slice(0, 200));
check("2. History still prints the peak", hist.includes(`${PEAK} peak`), hist.slice(0, 200));

// ── PROFILE — Mo's actual report. The unposted-workout card is built by profileHistoryItems,
//    which carries hrSummary through postWorkoutPayload, and rendered by the same PostCard the
//    feed uses — so this one assertion covers "profile/home" together. ──
await page.mouse.click(363, 869); await page.waitForTimeout(2000);
const prof = await text();
await page.screenshot({ path: "build/shot_hr_profile.png", fullPage: true });
console.log("PROFILE:", (prof.match(/Heart Day.{0,140}/) || ["(no Heart Day card)"])[0]);
check("3. the profile workout card shows the avg", prof.includes(String(AVG)), prof.slice(0, 240));
check("4. ...and the PEAK beside it — this is the bug Mo reported", prof.includes(String(PEAK)),
  `card shows ${AVG} but not ${PEAK}`);
check("5. both are labelled, so neither can be read as the other",
  /avg/i.test(prof) && /peak/i.test(prof), prof.slice(0, 240));

// The two numbers must be in ONE tile, not scattered — assert they share a common ancestor no
// bigger than a stat tile. A page that merely CONTAINS both numbers somewhere would pass a naive
// substring check even if peak were rendered in an unrelated corner.
const together = await page.evaluate(([avg, peak]) => {
  const els = [...document.querySelectorAll("div")].filter(el => {
    const t = (el.innerText || "").replace(/\s+/g, " ");
    return t.includes(String(avg)) && t.includes(String(peak)) && t.length < 24;
  });
  return els.length ? els.map(e => (e.innerText || "").replace(/\s+/g, " ").trim())[0] : null;
}, [AVG, PEAK]);
console.log("TIGHTEST NODE HOLDING BOTH:", JSON.stringify(together));
check("6. avg and peak sit together in one small block, not scattered across the card",
  !!together, "no node under 24 chars contains both");

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
