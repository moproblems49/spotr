// THE SIM PROVES THE MATHS; THIS PROVES THE SCREEN.
//
// The stall verdict now depends on the exercise's rep TARGET, which reaches `detectDeloadNeeded`
// through a memo in WorkoutTracker keyed on the session's exercise list. A pure-function sim
// cannot see that wiring at all: pass the target nowhere and every assertion in sim_stallcoherent
// still passes while the live banner keeps firing. So seed Mo's real history, start his real
// workout, and read what is actually painted.
//
// Fixture is the Lateral Raises (Cable) history from his phone, Aug 8 — every session better than
// the last, and the shipped app answered with "Plateau detected · deload to 35" over the top of
// chips that said "40x13".
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
const EX = "Lateral Raises (Cable)";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const kd = n => { const d = new Date(Date.now() - n * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const sets = p => p.map(([w, r]) => ({ weight: String(w), reps: String(r), done: true, type: "normal" }));
const HISTORY = Object.fromEntries([
  [2,  [[40, 12], [40, 12], [40, 10], [40, 10]]],
  [9,  [[40, 12], [40, 12], [40, 10], [40, 9]]],
  [19, [[40, 12], [40, 11], [40, 10], [40, 8]]],
  [26, [[40, 12], [40, 11], [40, 10], [40, 8]]],
  [33, [[40, 11], [40, 10], [40, 10], [40, 8]]],
].map(([n, p], i) => [kd(n), { [`s${i}`]: { id: `s${i}`, dayName: "Push B", unit: "lbs", exercises: [{ name: EX, reps: "12-15", sets: sets(p) }] } }]));

// The live session: four empty working sets, which is what makes the chips render at all.
const SESSION = {
  dayName: "Push B · Shoulders/Arms", unit: "lbs",
  exercises: [{ name: EX, reps: "12-15",
    sets: Array.from({ length: 4 }, () => ({ weight: "", reps: "", done: false, type: "normal" })) }],
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);
await page.addInitScript(([me, hist, sess]) => {
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: hist,
    workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
    profile: { username: "momo", name: "Mo" },
    users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: me, email: "m@e.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
  localStorage.setItem("seshd_active_session", JSON.stringify(sess));
  localStorage.setItem("seshd_wstart", String(Date.now() - 12e5));
}, [ME, HISTORY, SESSION]);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: ME, email: "m@e.com" } }) }));
// ABORT rest so loadUserData fails gracefully and does NOT overwrite the seeded history — it
// replaces the local store with the server copy, which has bitten two fixtures here before.
await page.route("**/rest/v1/**", r => r.abort());
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);

// THE FIXTURE MUST HAVE REACHED THE SCREEN. A tour that quietly renders the wrong thing and then
// reports "no banner found" is the failure mode this file exists to avoid. Note the exercise name
// is an INPUT VALUE, not text — the first draft of this check looked in innerText, found nothing,
// and called a correctly-rendered screen a failure.
const names = await page.evaluate(() => [...document.querySelectorAll("input")].map(i => i.value));
check("the live workout actually rendered", names.some(v => /Lateral Raises/i.test(v)), JSON.stringify(names));

const banner = await page.getByText(/Plateau detected/i).count();
console.log(`  banner: ${banner ? "PLATEAU DETECTED" : "quiet"}`);
check("no plateau banner on a lifter whose volume rose every session", banner === 0);

// The progression chips are BUTTONS; their up/down arrow is an SVG, so it is not in textContent.
// Matching "40x12"-shaped text across all elements instead pulls in the greyed Previous column and
// double-counts every button through its parent div — the first draft found 12 chips on a screen
// showing 4. A deload chip is one whose weight is BELOW the 40 he actually lifted.
const chips = await page.evaluate(() => [...document.querySelectorAll("button")]
  .map(el => (el.textContent || "").trim())
  .filter(t => /^\d+\s*[x×]\s*\d+$/.test(t)));
console.log(`  chips: ${chips.join("  ")}`);
check("all four sets got a suggestion", chips.length === 4, `${chips.length}: ${chips.join(" ")}`);
const weights = chips.map(t => parseInt(t.match(/(\d+)\s*[x×]/)?.[1] || "0", 10));
check("not one row tells him to drop the weight", weights.every(w => w >= 40), weights.join(" "));
check("the rows agree with each other", new Set(weights).size === 1, weights.join(" "));

await page.screenshot({ path: "shot_stall.png" });
await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
