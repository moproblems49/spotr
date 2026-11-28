// Cardio rows are minutes + DISTANCE, a plank is SECONDS (Muse, Nov 28): the distance field needs a
// working "." (it was blank, so 1.2 mi became 12), a hold row says "sec", and the feed card prints
// a run as "15 min · 1.2 mi" rather than "15×1".
import { chromium } from "playwright-core";
const ME = "11111111-1111-4111-8111-111111111111";
const set = (w, r) => ({ id: "s" + Math.random(), weight: w, reps: r, done: false, type: "normal" });
const SESSION = { dayName: "Cardio + Core", unit: "lbs", exercises: [
  { id: "e1", name: "Treadmill Run", sets: [set("", "")] },
  { id: "e2", name: "Plank", sets: [set("", "")] },
]};
const POST = { id: "p1", userId: ME, type: "workout", createdAt: new Date(Date.now() - 6e5).toISOString(), caption: "", kudos: [], comments: [], unit: "lbs",
  workout: { name: "Cardio + Core", duration: 866, volume: 0, exercises: [
    { name: "Treadmill Run", isPR: false, sets: [{ w: 15, r: 1.2 }] },
    { name: "Plank", isPR: false, sets: [{ w: 0, r: 60 }, { w: 25, r: 45 }] },
    { name: "Barbell Bench Press", isPR: false, sets: [{ w: 135, r: 8 }] } ] } };
const d = new Date(); const DK = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const ds = (w, r) => ({ weight: String(w), reps: String(r), done: true, type: "normal" });
const ROW = { id: "aaaaaaaa-5555-4555-8555-555555555555", user_id: ME, day_name: "Cardio + Core", duration_secs: 866, unit: "lbs", note: null,
  workout_date: DK, created_at: new Date(Date.now() - 6e5).toISOString(),
  exercises: [{ name: "Treadmill Run", sets: [ds(15, 1.2)] }, { name: "Plank", sets: [ds(0, 60), ds(25, 45)] }, { name: "Barbell Bench Press", sets: [ds(135, 8)] }] };
let fails = 0;
const check = (l, c, d) => { console.log(`${c ? "PASS" : "FAIL"} ${l}${!c && d ? " — " + d : ""}`); if (!c) fails++; };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
async function page(withSession) {
  const p = await b.newPage({ viewport: { width: 428, height: 926 }, hasTouch: true, isMobile: true });
  p.setDefaultTimeout(3000);
  await p.addInitScript(([me, s, post, ws]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [post], profile: { username: "momo" }, users: [], following: [] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: me } }));
    localStorage.setItem("seshd_onboarded", "1"); localStorage.setItem("seshd_custom_merge_v1", "1");
    if (ws) { localStorage.setItem("seshd_active_session", JSON.stringify(s)); localStorage.setItem("seshd_wstart", String(Date.now() - 6e5)); }
  }, [ME, SESSION, POST, withSession]);
  await p.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: '{"access_token":"t","user":{"id":"' + ME + '"}}' }));
  if (withSession) await p.route("**/rest/v1/**", r => r.abort());
  else await p.route("**/rest/v1/**", r => {
    const u = r.request().url();
    let body = "[]";
    if (/\/rest\/v1\/workout_history\?/.test(u)) body = JSON.stringify([ROW]);
    else if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u)) body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await p.goto("http://127.0.0.1:8199/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2200);
  return p;
}
const press = (p, label) => p.evaluate((l) => {
  const pad = [...document.querySelectorAll("div")].filter(d => getComputedStyle(d).position === "fixed" && getComputedStyle(d).zIndex === "450").pop();
  const k = pad && [...pad.querySelectorAll("button")].find(x => (x.textContent || "").trim() === l);
  if (!k) return false; k.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); return true;
}, label);

// 1. distance field takes a decimal
let p = await page(true);
const rows = await p.evaluate(() => document.querySelectorAll('[data-set-field="reps"]').length);
check("[control] the workout rendered both rows", rows === 2, `reps fields ${rows}`);
await p.evaluate(() => document.querySelectorAll('[data-set-field="reps"]')[0].click());
await p.waitForTimeout(500);
const padLabel = await p.evaluate(() => /\bMI\b/.test(document.body.innerText));
check("[control] the pad opened on the distance field", padLabel);
const typed = [await press(p, "1"), await press(p, "."), await press(p, "2")];
await p.waitForTimeout(300);
check("the distance pad has a working decimal key", typed[1], JSON.stringify(typed));
const dist = await p.evaluate(() => (document.querySelectorAll('[data-set-field="reps"]')[0].textContent || "").trim());
check("typing 1 . 2 logs 1.2 mi, not 12", dist === "1.2", `field reads "${dist}"`);
await p.evaluate(() => document.querySelector('button[aria-label="Hide keypad"]')?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
await p.waitForTimeout(700);

// 2. a plank row says sec, and its pad says SECONDS
const plankLabel = await p.evaluate(() => {
  const f = document.querySelectorAll('[data-set-field="reps"]')[1];
  return (f?.parentElement?.textContent || "").replace(f.textContent, "").trim();
});
check("a plank row labels its second box sec", plankLabel === "sec", `got "${plankLabel}"`);
await p.evaluate(() => document.querySelectorAll('[data-set-field="reps"]')[1].click());
await p.waitForTimeout(500);
check("the plank pad is labelled SECONDS", await p.evaluate(() => /SECONDS/.test(document.body.innerText)));
await p.close();

// 3. the workout card (own profile — same PostCard the feed uses, built by postWorkoutPayload)
p = await page(false);
await p.mouse.click(363, 869); await p.waitForTimeout(2000);
const ledger = await p.evaluate(() => [...document.querySelectorAll("[data-set-kind]")].map(e => e.textContent.replace(/\s+/g, " ").trim()));
check("the feed card prints the run as minutes and distance", ledger.includes("15min · 1.2 mi"), JSON.stringify(ledger));
check("the feed card prints the holds as seconds", ledger.includes("60s") && ledger.includes("45s · +25"), JSON.stringify(ledger));
check("[control] the bench set still prints as weight × reps", await p.evaluate(() => /135\s*×\s*8/.test(document.body.innerText)));
const vol = await p.evaluate(() => { const l = [...document.querySelectorAll("div")].find(x => x.textContent === "VOL"); return l?.previousElementSibling?.textContent || null; });
check("the card's VOL is the bench alone (1,080), not bench + minutes + seconds", vol && /^1(,080|\.1k)/.test(vol), `VOL reads ${vol}`);
await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
