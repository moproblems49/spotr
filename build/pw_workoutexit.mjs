// THERE MUST ALWAYS BE A WAY OUT OF A WORKOUT, AND DISCARDING ONE MUST ASK FIRST.
//
// Two problems Mo reported in one message, and they turned out to be the same screen:
//
//   * "swiping to a different tab mid workout feels laggy" — it was not slow, it was NOT FIRING.
//     `handleSwipeStart` bails on `[data-no-tab-swipe]`, which is every SetRow, so on a
//     6-exercise session 61% of the screen height silently refused to start a swipe. The bottom
//     nav was hidden during a workout, so that failing swipe was the ONLY way off the tab.
//   * "we need an Are you sure? when clicking cancel on top left of a workout" — the control was
//     one mis-tap from destroying a whole session, with no confirmation and no undo.
//
// Both legs assert the SHIPPED behaviour through the real screen, and both go red on the code
// they replaced (nav gate present -> §1 fails; bare onClick -> §2 fails).
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const sess = {
  dayName: "Push A", startedAt: Date.now() - 1800000, unit: "lbs",
  exercises: Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`,
    name: ["Barbell Bench Press","Overhead Press (Barbell)","Incline Dumbbell Press",
           "Lateral Raises (DB)","Cable Fly (Neutral)","Tricep Pushdown"][i],
    sets: Array.from({ length: 4 }, (_, j) => ({ id:`s${i}_${j}`, weight:String(135+j*10),
      reps:"8", done: j < 2, type:"normal" })) })),
};
// 12 sets are ticked done above (2 per exercise x 6) — the confirm copy must name that number, so
// a wrong count here is a real failure rather than a fixture detail.
const DONE_SETS = 12;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(6000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });

await page.addInitScript(([me, s]) => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
    programs: [], history: {}, workoutDates: {}, weeklyTarget: 3, prEvents: [], bodyLog: [], prs: {},
    posts: [], profile: { username:"momo", name:"Mo" },
    users: [{ id: me, username:"momo", name:"Mo", followers: [], following: [] }] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
  localStorage.setItem("seshd_active_session", JSON.stringify(s));
  localStorage.setItem("seshd_wstart", String(Date.now() - 1800000));
}, [ME, sess]);
await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
  body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
await page.route("**/rest/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
  body: /\/(public_)?profiles\?/.test(r.request().url())
    ? JSON.stringify([{ id: ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark", seen_onboarding:true }]) : "[]" }));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3200);
await page.getByLabel("Workout").first().click().catch(() => {});
await page.waitForTimeout(1400);

const body = () => page.evaluate(() => document.body.innerText);
// The exercise names live in ExerciseInput VALUES, not in innerText, so "is a workout running"
// is read from the live header instead — the day name plus the running set counter, which only
// the tracker renders.
const inWorkout = async () => /\d+\/\d+ sets/.test(await body()) && /Push A/.test(await body());
check("0. the live workout screen is up", await inWorkout(),
  (await body()).slice(0, 120).replace(/\n/g, " | "));

// ── 1. There is a visible, tappable way off the tracker tab ──────────────────────────────────
// Not "the nav element exists in the DOM" — an offscreen or covered nav would pass that. Hit-test
// each nav button's centre and require the button itself to answer, then click one and confirm the
// tab actually changed. (An overlay eating the tap is exactly how a nav can look present and be
// dead; the app has shipped that before.)
const navProbe = await page.evaluate(() => {
  const btns = ["Home", "Workout", "Discover", "Profile"]
    .map(l => [...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === l))
    .filter(Boolean);
  return btns.map(b => {
    const r = b.getBoundingClientRect();
    if (!r.width || !r.height) return { label: b.getAttribute("aria-label"), hit: false, why: "zero-size" };
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    return { label: b.getAttribute("aria-label"),
             hit: !!top && (top === b || b.contains(top)),
             onScreen: cy > 0 && cy < window.innerHeight,
             why: top ? (top.getAttribute("aria-label") || top.tagName) : "nothing" };
  });
});
console.log(`   nav probe: ${JSON.stringify(navProbe)}`);
check("1. the bottom nav is reachable during a workout",
  navProbe.length === 4 && navProbe.every(p => p.hit && p.onScreen), JSON.stringify(navProbe));

const switched = await (async () => {
  await page.getByLabel("Discover").first().click().catch(() => {});
  await page.waitForTimeout(1000);
  return !(await inWorkout());
})();
check("2. tapping a nav icon actually leaves the tracker tab", switched,
  (await body()).slice(0, 110).replace(/\n/g, " | "));

// Back to the workout for the discard leg.
await page.getByLabel("Workout").first().click().catch(() => {});
await page.waitForTimeout(1200);
check("3. the workout is still in progress after leaving and returning", await inWorkout(),
  (await body()).slice(0, 110).replace(/\n/g, " | "));

// ── 2. Discarding a workout asks first ───────────────────────────────────────────────────────
const label = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => /^(discard|cancel)$/i.test((x.textContent||"").trim()));
  return b ? (b.textContent||"").trim() : null;
});
check("4. the top-left control reads 'Discard', not the ambiguous 'Cancel'", label === "Discard", `found ${JSON.stringify(label)}`);

await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => /^(discard|cancel)$/i.test((x.textContent||"").trim()));
  b && b.click();
});
await page.waitForTimeout(700);
const sheet = await body();
check("5. tapping it opens a confirmation instead of discarding", /discard this workout\?/i.test(sheet),
  sheet.slice(0, 160).replace(/\n/g, " | "));
check(`6. the confirmation names what is at stake (${DONE_SETS} logged sets)`,
  new RegExp(`${DONE_SETS} sets`).test(sheet), sheet.slice(0, 220).replace(/\n/g, " | "));
check("7. the safe option is worded like the Finish sheet's ('Keep going')", /keep going/i.test(sheet));

// Backing out must leave the session untouched.
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => /^keep going$/i.test((x.textContent||"").trim()));
  b && b.click();
});
await page.waitForTimeout(800);
check("8. choosing 'Keep going' keeps the workout", await inWorkout(),
  (await body()).slice(0, 110).replace(/\n/g, " | "));
const stillStored = await page.evaluate(() => !!localStorage.getItem("seshd_active_session"));
check("9. and the live session is still on the device", stillStored);

// Confirming must actually discard it.
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => /^(discard|cancel)$/i.test((x.textContent||"").trim()));
  b && b.click();
});
await page.waitForTimeout(700);
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => /^discard workout$/i.test((x.textContent||"").trim()));
  b && b.click();
});
await page.waitForTimeout(1200);
check("10. confirming discards the workout", !(await inWorkout()),
  (await body()).slice(0, 110).replace(/\n/g, " | "));
const gone = await page.evaluate(() => !localStorage.getItem("seshd_active_session"));
check("11. and clears the stored session", gone);

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
