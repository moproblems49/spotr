// UX TOUR — walks the app as a new user would and screenshots every screen, so the critique is
// based on what's actually on the glass rather than on reading the source.
// Pass "new" for an empty brand-new account, "loaded" for one with history/programs/social.
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const MODE = process.argv[2] || "new";
const OUT = `build/tour_${MODE}`;
mkdirSync(OUT, { recursive: true });

const ME = "11111111-1111-4111-8111-111111111111";
const PAL = "22222222-2222-4222-8222-222222222222";

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const hist = {};
if (MODE === "loaded") {
  for (let i = 1; i <= 24; i++) {
    const d = new Date(Date.now() - i * 3 * 864e5);
    hist[dayKey(d)] = { [`s${i}`]: {
      dayName: ["Push A · Heavy Chest","Pull A · Back Width","Legs A · Quad Focus"][i % 3],
      duration: 3200 + i * 30, unit: "lbs", finishedAt: d.getTime(),
      exercises: [
        { name: "Barbell Bench Press", sets: [{weight:String(185+i),reps:"5",done:true,type:"normal"},{weight:String(185+i),reps:"5",done:true,type:"normal"},{weight:String(185+i),reps:"4",done:true,type:"normal"}] },
        { name: "Barbell Back Squat", sets: [{weight:String(245+i*2),reps:"5",done:true,type:"normal"},{weight:String(245+i*2),reps:"5",done:true,type:"normal"}] },
        { name: "Lat Pulldown (Wide)", sets: [{weight:String(120+i),reps:"10",done:true,type:"normal"}] },
      ] } };
  }
}
const PROG = { id:"p1", name:"PPL · 6 Day", days:[
  { id:"d1", name:"Push A · Heavy Chest", exercises:[
    { name:"Barbell Bench Press", sets:4, reps:"5-7", rest:"180" },
    { name:"Incline DB Press", reps:"3×8-10" },
    { name:"Lateral Raises (DB)", reps:"4×15-20" }]},
  { id:"d2", name:"Pull A · Back Width", exercises:[
    { name:"Weighted Pull-Ups", reps:"4×6-8" },
    { name:"Seated Cable Row (Narrow)", reps:"3×10" }]},
  { id:"d3", name:"Legs A · Quad Focus", exercises:[
    { name:"Barbell Back Squat", reps:"4×5-8" },
    { name:"Leg Press", reps:"3×10-12" }]},
]};

const store = MODE === "loaded"
  ? { currentUserId: ME, theme:"dark", unit:"lbs", weeklyTarget:3, programs:[PROG], activeProgramId:"p1",
      history: hist, prEvents:[], bodyLog:[{ date: dayKey(new Date()), weight: 178 }], prs:{ "Barbell Bench Press":225,"Barbell Back Squat":315 },
      profile:{ username:"momo", name:"Mo" },
      users:[{ id:ME, username:"momo", name:"Mo", bio:"5 years in. Chasing a 4-plate squat.", followers:[PAL], following:[PAL] },
             { id:PAL, username:"maya_lifts", name:"Maya Chen", bio:"Squat-first powerlifter", followers:[ME], following:[ME] }] }
  : { currentUserId: ME, theme:"dark", unit:"lbs", programs:[], history:{}, prEvents:[], bodyLog:[], prs:{},
      profile:{ username:"momo", name:"Mo" }, users:[{ id:ME, username:"momo", name:"Mo", followers:[], following:[] }] };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);
await page.addInitScript(([s, me]) => {
  localStorage.setItem("seshd_v1", JSON.stringify(s));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"tok", refresh_token:"ref", user:{ id: me, email:"mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, [store, ME]);
await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
  body: JSON.stringify({ access_token:"tok", refresh_token:"ref", user:{ id: ME, email:"mo@example.com" } }) }));
await page.route("**/rest/v1/**", r => {
  const u = r.request().url();
  let body = "[]";
  if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u)) {
    body = JSON.stringify(store.users.map(x => ({ ...x, unit:"lbs", is_public:true, seen_onboarding:true, theme:"dark" })));
  }
  r.fulfill({ status:200, contentType:"application/json", body });
});

let n = 0;
const shot = async (label, wait = 500) => {
  await page.waitForTimeout(wait);
  n++;
  const name = `${String(n).padStart(2,"0")}_${label}`;
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log("shot", name);
};
const tapNav = async (i) => { await page.mouse.click([65,164,264,363][i], 869); await page.waitForTimeout(700); };
const tapText = async (t, wait = 700) => {
  const el = page.getByText(t, { exact: false }).first();
  if (await el.count()) { await el.click().catch(()=>{}); await page.waitForTimeout(wait); return true; }
  return false;
};
// Escape closes nothing in this app — full-screen views have their own back chevron and sheets
// have a Done/Close. Try the real controls, topmost first.
const goBack = async () => {
  for (const attempt of [
    () => page.locator('button[aria-label="Back"]').locator("visible=true").last().click({ timeout: 1200 }),
    () => page.getByRole("button", { name: "Done" }).locator("visible=true").last().click({ timeout: 1200 }),
    () => page.locator('button[aria-label="Close"]').locator("visible=true").last().click({ timeout: 1200 }),
    () => page.getByText("‹", { exact: true }).last().click({ timeout: 1200 }),
    () => page.getByText("Cancel", { exact: true }).last().click({ timeout: 1200 }),
  ]) { try { await attempt(); await page.waitForTimeout(600); return true; } catch {} }
  return false;
};

await page.goto("http://127.0.0.1:8199/", { waitUntil:"load", timeout:20000 });
await page.waitForFunction(() => !/Setting up your account/.test(document.body.innerText), null, { timeout: 15000 }).catch(()=>{});
await page.waitForTimeout(1200);

await shot("home_tracker", 900);
await tapText("Exercises"); await shot("exercises");
// open an exercise detail
const firstEx = page.getByText("Barbell Bench Press", { exact: true }).first();
if (await firstEx.count()) { await firstEx.click().catch(()=>{}); await shot("exercise_detail", 900); await goBack(); }
await tapText("History"); await shot("history");
await tapText("Workout");

if (MODE === "new") {
  await tapText("Browse Templates"); await shot("templates");
  await goBack();
  await tapText("Build Your Own"); await shot("builder");
  await goBack();
  await tapText("1RM Calc"); await shot("rm_calc");
  await goBack();
  await tapText("Plates"); await shot("plates");
  await goBack();
}

// Quick Start → live workout
await tapNav(1); await page.waitForTimeout(500);
if (await tapText("Quick Start", 1200)) {
  await shot("live_workout_empty", 900);
  const box = page.getByPlaceholder("Search exercises...").first();
  if (await box.count()) {
    await box.click(); await box.pressSequentially("Barbell Bench", { delay: 40 });
    await page.waitForTimeout(600); await shot("exercise_picker");
    await page.getByText("Barbell Bench Press", { exact:true }).first().click().catch(()=>{});
    await shot("live_workout_loaded", 900);
  }
}

// Social side
await tapNav(0); await shot("feed");
await tapNav(2); await shot("discover");
await tapNav(3); await shot("profile", 900);
await tapText("Body"); await shot("body_screen", 900);
await goBack();
await tapNav(3);
const settings = page.locator('button[aria-label="Settings"]').first();
if (await settings.count()) { await settings.click(); await shot("settings", 900);
  await page.mouse.wheel(0, 700); await shot("settings_scrolled", 500);
  await tapText("Done"); }

await b.close();
console.log(`\n${n} screenshots in ${OUT}`);
