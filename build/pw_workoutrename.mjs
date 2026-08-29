// THE LIVE WORKOUT'S NAME IS EDITABLE, AND THE NEW NAME IS WHAT GETS SAVED.
//
// `dayName` used to be stamped once at start (`day?.name || "Quick Workout"`) with no way to
// change it, so every Quick Start produced a post whose headline was a placeholder — which is
// what Mo noticed on the feed card.
//
// This asserts the EFFECT, not the control: it is easy to render an input that edits a copy of
// the name and never reaches the write. So it types a name, finishes, and reads what actually
// left the client — the same reason pw_deleteaccount stopped asserting on a flag.
import { chromium } from "playwright-core";
const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l,c,d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d?" — "+d:""}`); } };

const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const page = await b.newPage({ viewport:{width:428,height:926}, deviceScaleFactor:2, hasTouch:true, isMobile:true });
page.setDefaultTimeout(6000);
const writes = [];
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0,140)); });

await page.addInitScript(me => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId:me, theme:"dark", unit:"lbs",
    profile:{username:"momo",name:"Mo"}, users:[{id:me,username:"momo",name:"Mo",followers:[],following:[]}],
    programs:[], history:{}, workoutDates:{}, prs:{}, prEvents:[], posts:[] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{id:me} }));
  localStorage.setItem("seshd_onboarded","1"); localStorage.setItem("seshd_custom_merge_v1","1");
  localStorage.setItem("seshd_active_session", JSON.stringify({ id:"s1", dayId:null, dayName:"Quick Workout",
    startedAt: Date.now()-600000,
    exercises:[{ id:"e1", name:"Barbell Bench Press", sets:[{ id:"s1", weight:"185", reps:"5", done:true, type:"normal" }] }] }));
  localStorage.setItem("seshd_wstart", String(Date.now()-600000));
}, ME);
await page.route("**/auth/v1/**", r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({access_token:"t",user:{id:ME}})}));
await page.route("**/rest/v1/**", r => {
  const m = r.request().method();
  if (m !== "GET") writes.push({ method:m, url:r.request().url(), body:r.request().postDataJSON?.() ?? null });
  r.fulfill({status:200,contentType:"application/json",body:"[]"});
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil:"domcontentloaded" });
await page.waitForTimeout(3000);

const field = page.getByLabel("Workout name");
const hasField = await field.count() > 0;
check("1. the live header exposes an editable workout name", hasField);
// Degrade cleanly rather than throwing: without the field every later step would blow up on
// .fill() with a TimeoutError, which reads as a broken harness rather than a missing feature.
// Report the whole set as failed and stop — a red-proof should say WHAT is wrong, not stack-trace.
if (!hasField) {
  for (const l of ["2. it starts as the placeholder name",
                   "3. typing updates the field",
                   "4. clearing it falls back rather than saving an empty name",
                   "5. the RENAMED workout is what reaches the server",
                   "6. ...and what is stored locally"]) check(l, false, "no editable name field");
  await b.close();
  console.log(`\n${fails} FAIL(S)`);
  process.exit(1);
}
check("2. it starts as the placeholder name", (await field.inputValue()) === "Quick Workout",
  await field.inputValue().catch(() => "(none)"));

await field.fill("Leg Day");
await page.waitForTimeout(300);
check("3. typing updates the field", (await field.inputValue()) === "Leg Day");

// Blank must not persist — an empty headline is worse than a generic one.
await field.fill("");
await field.blur();
await page.waitForTimeout(300);
check("4. clearing it falls back rather than saving an empty name",
  (await field.inputValue()).trim().length > 0, `got ${JSON.stringify(await field.inputValue())}`);

await field.fill("Leg Day");
await page.waitForTimeout(200);

// Finish, and read what actually left the client.
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>/^Finish$/.test((x.textContent||"").trim())); b&&b.click(); });
await page.waitForTimeout(800);
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>/^Finish workout$/.test((x.textContent||"").trim())); b&&b.click(); });
await page.waitForTimeout(2500);

const saved = writes.find(w => /workout_history/.test(w.url));
const savedName = saved && saved.body && (Array.isArray(saved.body) ? saved.body[0] : saved.body)?.day_name;
check("5. the RENAMED workout is what reaches the server",
  savedName === "Leg Day", `workout_history day_name = ${JSON.stringify(savedName)}`);

const local = await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem("seshd_v1") || "{}");
  const days = Object.values(st.history || {});
  const sess = days.flatMap(d => Object.values(d || {}));
  return sess.map(x => x && x.dayName);
});
check("6. ...and what is stored locally", local.includes("Leg Day"), JSON.stringify(local));

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
