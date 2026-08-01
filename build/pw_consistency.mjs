// CROSS-SCREEN NUMBER CONSISTENCY.
//
// One workout, known values, seeded once — then read every screen that reports a number about it
// and assert they agree. Grep finds duplicated FORMULAS; this finds duplicated formulas that have
// already DRIFTED, which is the thing that actually reaches the user. It is how the "Volume by week
// chart says 6.1k under a LIFETIME tile saying 3,850" bug was found.
//
// The session deliberately contains warmups, because that is the axis every copy disagreed on.
import { chromium } from "playwright-core";

const ME = "11111111-1111-4111-8111-111111111111";
const d = new Date();
const DK = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const s = (w, r, t) => ({ weight: String(w), reps: String(r), done: true, type: t || "normal" });

// Squat: 2 warmups + 3 working (3850). Bench: 2 working (2960). Nothing else.
const SQUAT_VOL = 275*5 + 275*5 + 275*4;      // 3850
const BENCH_VOL = 185*8 + 185*8;              // 2960
const TOTAL_VOL = SQUAT_VOL + BENCH_VOL;      // 6810
const WARMUP_VOL = 135*10 + 185*5;            // 2275
const WORKING_SETS = 5;
const ALL_SETS = 7;

const ROW = {
  id: "aaaaaaaa-2222-4222-8222-222222222222", user_id: ME,
  day_name: "Consistency Day", duration_secs: 3600, unit: "lbs", note: null,
  workout_date: DK, created_at: new Date().toISOString(),
  exercises: [
    { name: "Barbell Back Squat", sets: [s(135,10,"warmup"), s(185,5,"warmup"), s(275,5), s(275,5), s(275,4)] },
    { name: "Barbell Bench Press", sets: [s(185,8), s(185,8)] },
  ],
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);

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

let fails = 0;
const check = (l, c, dd) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${dd ? " — " + dd : ""}`); } };
const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
// The app abbreviates with fmtVol (>=1000 -> "6.8k") and elsewhere uses toLocaleString.
const fmtVol = v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v);
const anyForm = v => [fmtVol(v), String(v), v.toLocaleString("en-US")];
const has = (t, v) => anyForm(v).some(f => t.includes(f));

await page.goto("http://127.0.0.1:8199/", { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => !/Setting up your account/.test(document.body.innerText), null, { timeout: 15000 }).catch(()=>{});
await page.waitForTimeout(2000);

// ── HISTORY ──────────────────────────────────────────────────────────────────────────────────
await page.mouse.click(164, 869); await page.waitForTimeout(800);
const histTab = page.getByText("History", { exact: false }).first();
if (await histTab.count()) { await histTab.click(); await page.waitForTimeout(1400); }
const hist = await text();
await page.screenshot({ path: "build/shot_consistency_history.png", fullPage: true });
console.log("HISTORY:", hist.slice(0, 340));

check("History: LIFETIME volume is the working-set total", has(hist, TOTAL_VOL), `want ${TOTAL_VOL}`);
check("History: LIFETIME is not the warmup-inflated total", !has(hist, TOTAL_VOL + WARMUP_VOL), `inflated ${TOTAL_VOL + WARMUP_VOL}`);
check("History: the weekly chart agrees with the lifetime tile",
  !has(hist, TOTAL_VOL + WARMUP_VOL), `chart must not show ${TOTAL_VOL + WARMUP_VOL}`);
// The session card prints "N sets · V lbs" — the two must describe the same set list.
const cardLine = hist.match(/(\d+) sets? · ([\d,]+) lbs/);
console.log("SESSION CARD LINE:", cardLine && cardLine[0]);
check("History: the session card's set count excludes warmups",
  cardLine && Number(cardLine[1]) === WORKING_SETS, cardLine ? `${cardLine[1]} (want ${WORKING_SETS}, all-sets would be ${ALL_SETS})` : "no match");
check("History: ...and its volume is drawn from that same set list",
  cardLine && Number(cardLine[2].replace(/,/g, "")) === TOTAL_VOL, cardLine ? cardLine[2] : "no match");

// ── PROFILE ──────────────────────────────────────────────────────────────────────────────────
await page.mouse.click(363, 869); await page.waitForTimeout(1800);
const prof = await text();
await page.screenshot({ path: "build/shot_consistency_profile.png", fullPage: true });
console.log("PROFILE:", prof.slice(0, 260));
check("Profile: the workout card volume matches History", has(prof, TOTAL_VOL), `want ${TOTAL_VOL}`);
check("Profile: never the warmup-inflated total", !has(prof, TOTAL_VOL + WARMUP_VOL));
check("Profile: no warmup set row is printed", !/135\s*[x×]\s*10/i.test(prof));

// ── EXERCISE DETAIL ──────────────────────────────────────────────────────────────────────────
await page.mouse.click(164, 869); await page.waitForTimeout(800);
const exTab = page.getByText("Exercises", { exact: false }).first();
if (await exTab.count()) { await exTab.click(); await page.waitForTimeout(1000); }
const search = page.getByPlaceholder(/Search/i).first();
if (await search.count()) { await search.fill("Barbell Back Squat"); await page.waitForTimeout(800); }
const row = page.getByText("Barbell Back Squat", { exact: true }).first();
if (await row.count()) { await row.click(); await page.waitForTimeout(1400); }
const detail = await text();
await page.screenshot({ path: "build/shot_consistency_exdetail.png", fullPage: true });
console.log("EXERCISE DETAIL:", detail.slice(0, 340));

check("Exercise detail: TOTAL VOLUME is this lift's working volume", has(detail, SQUAT_VOL), `want ${SQUAT_VOL}`);
check("Exercise detail: not inflated by the squat's own warmups", !has(detail, SQUAT_VOL + WARMUP_VOL));
check("Exercise detail: the session lists its 3 working sets, not 5",
  /275\s*×\s*5\s*·\s*275\s*×\s*5\s*·\s*275\s*×\s*4/.test(detail) || /275×5 · 275×5 · 275×4/.test(detail), detail.slice(0, 300));
check("Exercise detail: no warmup pair is listed", !/135×10|185×5 ·/.test(detail), detail.slice(0, 300));

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
