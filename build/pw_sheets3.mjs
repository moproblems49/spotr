// THE THREE SHEETS THAT WERE PREVIOUSLY LEFT ENTRANCE-ONLY: battery detail, AICoachModal,
// AICoachSheet. All three used to be unmounted entirely by their PARENT's `{showX && <Comp/>}`,
// which is why they couldn't get an exit animation without restructuring — the parent tearing the
// component down gives Sheet's own internal unmount timer no frames to run in. Fixed by always
// rendering the component and passing `open` as a prop, letting Sheet own the timing internally
// (same shape ReportHost already used, since it was always mounted by ITS parent).
//
// AICoachModal is a multi-step wizard with its own internal state (step/answers/result) that used
// to reset for free on every mount. Always-mounting it needed an explicit reset-on-open effect —
// this suite proves that actually fires (answer a question, close, reopen, confirm step 0 again),
// not just that the sheet opens and closes.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const panel = (page) => page.evaluate(() => {
  const backs = [...document.querySelectorAll("div")].filter(d => {
    const c = getComputedStyle(d);
    return c.position === "fixed" && d.getBoundingClientRect().height > 200 && parseInt(c.zIndex||"0",10) >= 200;
  });
  for (const b of backs.reverse()) {
    const p = [...b.children].find(c => /matrix|translate/.test(getComputedStyle(c).transform));
    if (p) { const m = /matrix\(1, 0, 0, 1, [-\d.]+, ([-\d.]+)\)/.exec(getComputedStyle(p).transform);
      return { y: m ? Math.round(parseFloat(m[1])) : 0, h: Math.round(p.getBoundingClientRect().height) }; }
  }
  return null;
});

// ── 1. Battery detail (Profile screen) ────────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(4000);
  page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });
  await page.addInitScript(me => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
      programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
      recovery: { hrv: 42, restingHr: 58, sleepHours: 7.2, recoveryScore: 0.7 },
      profile: { username:"momo", name:"Mo" }, users: [{ id: me, username:"momo", name:"Mo", followers:[], following:[] }] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
  }, ME);
  await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
    body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
  await page.route("**/rest/v1/**", r => r.fulfill({ status:200, contentType:"application/json", body:"[]" }));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2400);
  await page.getByLabel("Profile").first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll("*")].find(e => !e.children.length && /BODY BATTERY/i.test((e.textContent||"").trim()));
    let n = b; while (n && n !== document.body) { if (n.onclick || getComputedStyle(n).cursor === "pointer") { n.click(); return true; } n = n.parentElement; }
    return false;
  });
  await page.waitForTimeout(700);
  const txt = await page.evaluate(() => document.body.innerText);
  check("Battery detail: opens", opened && /Morning charge|Body Battery/i.test(txt), `clicked=${opened} ${txt.slice(0,90).replace(/\n/g," | ")}`);
  if (/Morning charge/i.test(txt)) {
    const rest = await panel(page);
    check("Battery detail: sits at rest while open", rest && Math.abs(rest.y) < 4, JSON.stringify(rest));
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^close$/i.test((x.textContent||"").trim())); b && b.click(); });
    await page.waitForTimeout(80);
    const mid = await panel(page);
    check("Battery detail: travels out", mid && mid.y > 8, JSON.stringify(mid));
    await page.waitForTimeout(600);
    const gone = await page.evaluate(() => !/Morning charge/i.test(document.body.innerText));
    check("Battery detail: actually closes", gone);
  }
  await page.close();
}

// ── 2. AICoachModal (Workout tab -> Browse templates -> AI Coach) — plus the reset-on-reopen ────
{
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(4000);
  page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });
  await page.addInitScript(me => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
      programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
      profile: { username:"momo", name:"Mo" }, users: [{ id: me, username:"momo", name:"Mo", followers:[], following:[] }] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
  }, ME);
  await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
    body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
  await page.route("**/rest/v1/**", r => r.fulfill({ status:200, contentType:"application/json", body:"[]" }));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2400);
  await page.getByLabel("Workout").first().click().catch(() => {});
  await page.waitForTimeout(900);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /browse templates/i.test((x.textContent||"").trim())); b && b.click(); });
  await page.waitForTimeout(700);
  const aiOpened = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /program builder/i.test((x.textContent||"").trim())); if (b) { b.click(); return true; } return false; });
  await page.waitForTimeout(700);
  const txt = await page.evaluate(() => document.body.innerText);
  check("AICoachModal: opens", aiOpened && /Step 1 of|main goal/i.test(txt), `clicked=${aiOpened} ${txt.slice(0,90).replace(/\n/g," | ")}`);
  if (/Step 1 of|main goal/i.test(txt)) {
    const rest = await panel(page);
    check("AICoachModal: sits at rest while open", rest && Math.abs(rest.y) < 4, JSON.stringify(rest));
    // Answer the first question to advance to step 2, THEN close via Cancel/Back — proves the
    // reset-on-open effect actually fires, not just that the sheet mechanically opens.
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /build muscle/i.test((x.textContent||"").trim())); b && b.click(); });
    await page.waitForTimeout(400);
    const step2 = await page.evaluate(() => document.body.innerText);
    check("AICoachModal: advances to step 2 after answering", /step 2 of|how many days/i.test(step2), step2.slice(0,80).replace(/\n/g," | "));
    // The top-left control reads "‹ Back" while step > 0 (steps backward within the wizard) and
    // only reads "Cancel" (closes the sheet) once back at step 0 — clicking whatever matches
    // /back|cancel/ at step 2 just returns to step 1, which is exactly what the first draft of
    // this check did, and it reported the sheet as "not traveling out" because it never actually
    // asked it to close. Step back to step 0 first, THEN close.
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^.\s*back$/i.test((x.textContent||"").trim())); b && b.click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^cancel$/i.test((x.textContent||"").trim())); b && b.click(); });
    await page.waitForTimeout(80);
    const mid = await panel(page);
    check("AICoachModal: travels out", mid && mid.y > 8, JSON.stringify(mid));
    await page.waitForTimeout(600);
    const closedTxt = await page.evaluate(() => document.body.innerText);
    check("AICoachModal: actually closes", !/main goal|how many days/i.test(closedTxt), closedTxt.slice(0,80).replace(/\n/g," | "));
    // Reopen: must start at step 1 again, NOT resume "how many days" from the aborted attempt.
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /browse templates/i.test((x.textContent||"").trim())); b && b.click(); });
    await page.waitForTimeout(600);
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /program builder/i.test((x.textContent||"").trim())); b && b.click(); });
    await page.waitForTimeout(600);
    const reopenTxt = await page.evaluate(() => document.body.innerText);
    check("AICoachModal: reopening resets to step 1 (not resumed mid-wizard)",
      /step 1 of|main goal/i.test(reopenTxt) && !/how many days/i.test(reopenTxt), reopenTxt.slice(0,90).replace(/\n/g," | "));
  }
  await page.close();
}

// ── 3. AICoachSheet (Profile -> Weekly Review) ───────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(4000);
  page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });
  await page.addInitScript(me => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
      programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
      weeklyReview: { weekKey: "2026-08-09", date: "2026-08-15", summary: "Solid week. Bench moved up, legs held steady.",
        actions: [{ id:"a1", text:"Add a fourth set to squats", done:false }],
        stats: { sessions: 4, volume: 12500, prs: 2, topSet: { weight: 225, reps: 5 } } },
      profile: { username:"momo", name:"Mo" }, users: [{ id: me, username:"momo", name:"Mo", followers:[], following:[] }] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
  }, ME);
  await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
    body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
  await page.route("**/rest/v1/**", r => r.fulfill({ status:200, contentType:"application/json", body:"[]" }));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2400);
  await page.getByLabel("Profile").first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const opened = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /weekly review/i.test((x.textContent||"").trim())); if (b) { b.click(); return true; } return false; });
  await page.waitForTimeout(700);
  const txt = await page.evaluate(() => document.body.innerText);
  check("AICoachSheet: opens", opened && /Weekly Review/i.test(txt) && /Solid week/i.test(txt), `clicked=${opened} ${txt.slice(0,100).replace(/\n/g," | ")}`);
  if (/Solid week/i.test(txt)) {
    const rest = await panel(page);
    check("AICoachSheet: sits at rest while open", rest && Math.abs(rest.y) < 4, JSON.stringify(rest));
    await page.evaluate(() => { const b = [...document.querySelectorAll('[aria-label="Close"]')][0]; b && b.click(); });
    await page.waitForTimeout(80);
    const mid = await panel(page);
    check("AICoachSheet: travels out", mid && mid.y > 8, JSON.stringify(mid));
    await page.waitForTimeout(600);
    const gone = await page.evaluate(() => !/Solid week/i.test(document.body.innerText));
    check("AICoachSheet: actually closes", gone);
  }
  await page.close();
}

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
