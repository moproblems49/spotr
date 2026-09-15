// ★ A STREAK NUMBER THAT SURVIVES A WEEK THE USER KNOWS THEY MISSED READS AS A BUG UNLESS THE CARD
// SAYS OTHERWISE. One missed week is forgiven now (STREAK_GRACE_EVERY_WEEKS), which is the whole
// point — a streak that cannot survive being ill stops being a reason to come back at exactly the
// moment the user needs one. But the count then covers a week they remember skipping, so the card
// carries the explanation: the kicker reads STREAK SAVED instead of STREAK AT RISK.
//
// sim_streakgrace proves the MATHS. Only a browser can prove the card is wired to it — the engine
// could be perfect and the card still read STREAK AT RISK, or render nothing at all, and nothing
// else in the battery would notice.
//
// FIXTURE: seeded through the STUB, not localStorage. loadUserData REBUILDS workoutDates wholesale
// from workout_history rows on the first foreground, so a localStorage-only seed is replaced by {}
// and the card returns null — which would make every check below pass or fail for reasons that have
// nothing to do with the app. Dates are derived from Date.now() because the engine walks back from
// the real clock: a hardcoded date would drift out of its week and fail with a message pointing at
// exactly the wrong cause (the pw_musclezero scar).
import { chromium } from "playwright-core";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`  PASS ${l}`); else { fails++; console.log(`  FAIL ${l}${d ? " — " + d : ""}`); } };

const dk = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
// Monday 00:00 local of the week containing `ms` — the same boundary weekStart() uses, so the
// fixture and the code agree about which week a day belongs to by construction.
const mondayOf = (ms) => { const d = new Date(ms); d.setHours(12,0,0,0); const off = d.getDay() === 0 ? 6 : d.getDay() - 1; d.setDate(d.getDate() - off); return d.getTime(); };
const THIS_MON = mondayOf(Date.now());

// Week 1 back: ONE workout — the ill week, short of the target of 2. Weeks 2..11 back: 2 each.
// This week: none yet. So the run is TEN counted weeks reached THROUGH a forgiven one, and the
// three numbers that could show up are all diagnostic: 0 = no grace, 10 = correct, 11 = the
// forgiven week was wrongly credited as trained.
const rows = [];
let n = 0;
const addWeek = (weeksAgo, days) => {
  for (let i = 0; i < days; i++) {
    const t = THIS_MON - weeksAgo * 7 * 864e5 + i * 864e5;
    rows.push({ id: `w${n++}`, user_id: ME, workout_date: dk(t), created_at: new Date(t).toISOString(),
      day_name: "Push", exercises: [{ name: "Barbell Bench Press", sets: [{ weight: "135", reps: "8", done: true }] }],
      duration_secs: 3000, unit: "lbs", note: "" });
  }
};
addWeek(1, 1);                       // the ill week — short of the target of 2
for (let w = 2; w <= 11; w++) addWeek(w, 2);

const PROFILE = { id: ME, username: "momo", name: "Mo", unit: "lbs", theme: "dark", seen_onboarding: true,
  weekly_target: 2, is_public: false, pr_events: [], custom_exercises: [], program_order: [],
  notification_prefs: {}, weekly_target_history: [] };

const store = { currentUserId: ME, unit: "lbs", theme: "dark", programs: [], history: {}, workoutDates: {},
  weeklyTarget: 2, prs: {}, prEvents: [], posts: [], bodyLog: [], customExercises: [],
  profile: { username: "momo", name: "Mo" }, users: [{ id: ME, username: "momo", name: "Mo", followers: [], following: [] }] };

const J = (o) => ({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
p.setDefaultTimeout(6000);
p.on("pageerror", e => { fails++; console.log("  PAGEERROR:", e.message.slice(0, 160)); });
await p.addInitScript(st => {
  localStorage.setItem("seshd_v1", JSON.stringify(st));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: st.currentUserId } }));
  localStorage.setItem("seshd_onboarded", "1"); localStorage.setItem("seshd_custom_merge_v1", "1");
}, store);
await p.route("**/auth/v1/**", r => r.fulfill(J({ access_token: "t", user: { id: ME } })));
await p.route("**/rest/v1/**", r => {
  const u = r.request().url();
  if (/workout_history/.test(u)) return r.fulfill(J(rows));
  if (/profiles/.test(u))        return r.fulfill(J([PROFILE]));
  return r.fulfill(J([]));
});
await p.goto("http://127.0.0.1:8199/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(3500);

// The card reads its numbers off the store, so a fixture that never reached the store would make
// every assertion below meaningless. Check it arrived before believing anything else.
const seeded = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("seshd_v1") || "{}").workoutDates || {}).length);
check("[control] the stub's workout history reached the store", seeded === 21, `workoutDates=${seeded}, expected 21`);

const card = await p.evaluate(() => {
  const flame = [...document.querySelectorAll("div")].filter(d =>
    /WEEKLY STREAK|STREAK AT RISK|STREAK SAVED|THIS WEEK/.test((d.textContent || "").trim()) && d.children.length <= 2);
  const kickerEl = flame.find(d => /^(WEEKLY STREAK|STREAK AT RISK|STREAK SAVED|THIS WEEK)$/.test((d.textContent || "").trim()));
  if (!kickerEl) return null;
  const box = kickerEl.closest("div[style*='border-radius']") || kickerEl.parentElement.parentElement;
  return { kicker: kickerEl.textContent.trim(), text: (box.textContent || "").replace(/\s+/g, " ").trim() };
});
check("[control] the streak card renders at all", !!card, "no kicker found — the card returns null with no streak, so a 0 here means the engine, not the copy");

if (card) {
  const shown = Number((card.text.match(/(\d+)\s*wk/) || [])[1]);
  check("the ill week did NOT reset the streak to zero", shown > 0, `card="${card.text}"`);
  check("the run reaches through the forgiven week", shown === 10, `shown=${shown}, expected 10`);
  check("the forgiven week is not COUNTED as trained", shown !== 11, `shown=${shown}`);
  check("the card explains why the streak survived", card.kicker === "STREAK SAVED", `kicker="${card.kicker}"`);
}

await b.close();
console.log(fails === 0 ? "PASS streak card" : `FAIL ${fails} streak-card check(s)`);
process.exit(fails === 0 ? 0 : 1);
