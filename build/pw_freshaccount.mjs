// A GENUINELY FRESH ACCOUNT — signed in, onboarded, and holding nothing else. Every screen in
// this app computes numbers from history/PRs/health, and the failure mode of "no data yet" is a
// number derived from nothing (NaN, Infinity, a division by zero) or a screen that renders as a
// void. Three of the four bugs that shipped on the new-user path (PROGRAM_TEMPLATES,
// import-by-code, the onboarding starter program) were only ever reachable BEFORE the account had
// any data, which is exactly the state no other suite here seeds: pw_journey walks signup and then
// immediately logs a workout, and every other fixture starts with history already in the store.
//
// The Weekly Review check is the one with the most history behind it: that feature had NEVER once
// run (a `todayMs` ReferenceError swallowed into the caller's catch), and a zero-data account is
// where it is first opened, so it is asserted on its real copy rather than on "the modal opened".
import { chromium } from "playwright-core";
const ME = "22222222-2222-4222-8222-222222222222";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`  PASS ${l}`); else { fails++; console.log(`  FAIL ${l}${d ? " — " + d : ""}`); } };

// The tells of a number computed from nothing. "null"/"undefined" as rendered TEXT are included
// because a template literal over a missing field prints them rather than throwing.
const JUNK = /\bNaN\b|\bInfinity\b|\bundefined\b|\[object Object\]|▲ 0%|▼ 0%/;

const browser = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const page = await browser.newPage({ viewport:{ width:428, height:926 }, deviceScaleFactor:2, hasTouch:true, isMobile:true });
page.setDefaultTimeout(5000);
const errs = [];
page.on("pageerror", e => errs.push(e.message.slice(0, 200)));

await page.addInitScript((me) => {
  // Deliberately minimal: no history, no prs, no prEvents, no programs, no posts, no bodyLog,
  // no activityHourly. Anything this store does NOT carry is a field some screen has to survive
  // being absent — adding a convenience default here would switch off the whole point of the file.
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme:"dark", unit:"lbs", profile:{ username:"newbie", name:"New Bie" },
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id:me } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, ME);
// An empty 200 rather than an abort: the server genuinely HAS nothing for this account, and
// loadUserData replacing 28 store keys with empty arrays is part of what is under test.
await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ access_token:"t", user:{ id:ME } }) }));
await page.route("**/rest/v1/**", r => r.fulfill({ status:200, contentType:"application/json", body:"[]" }));
await page.goto("http://127.0.0.1:8199/", { waitUntil:"domcontentloaded" });
await page.waitForTimeout(3500);

// The bottom nav buttons are icon-only — aria-label is the only handle.
const nav = async (label) => {
  const ok = await page.evaluate(l => {
    const b = [...document.querySelectorAll("button")].filter(x => x.offsetParent)
      .find(x => (x.getAttribute("aria-label") || "") === l);
    if (!b) return false; b.click(); return true;
  }, label);
  await page.waitForTimeout(1100);
  return ok;
};
const tap = async (text) => {
  const ok = await page.evaluate(t => {
    const b = [...document.querySelectorAll("button,[role=button]")].filter(x => x.offsetParent)
      .find(x => (x.textContent || "").trim().toLowerCase().includes(t.toLowerCase()));
    if (!b) return false; b.click(); return true;
  }, text);
  await page.waitForTimeout(1100);
  return ok;
};
const body = () => page.evaluate(() => document.body.innerText);

// 1 — every tab renders, carries its own empty-state copy, and prints no junk number.
// The copy strings are asserted individually because "the screen has text on it" passes on a
// screen that rendered the WRONG empty state, and three of these templates were deliberately
// made different from each other (the generic-empty-state finding) — a regression that collapses
// them back onto one template would still put text on all three.
const TABS = [
  ["Workout",  "tracker",  [/Quick Start/, /Start your first program/]],
  ["Home",     "feed",     [/Your feed is empty/]],
  ["Discover", "discover", [/No one to suggest yet|Find your crew/]],
  ["Profile",  "profile",  [/Log a few workouts and this fills in/]],
];
for (const [label, id, needles] of TABS) {
  check(`nav "${label}" exists`, await nav(label));
  const t = await body();
  for (const n of needles) check(`[${id}] renders its empty state ${n}`, n.test(t));
  const junk = t.match(JUNK);
  check(`[${id}] no number computed from nothing`, !junk, junk && `found "${junk[0]}"`);
}

// 2 — History's stat tiles must read a real 0, not blank and not NaN. A tile whose value is
// missing entirely renders as an empty box that looks like a loading state forever.
await nav("Workout"); await tap("History");
const hist = await body();
check("[history] empty log state", /No workouts logged yet/.test(hist));
for (const tile of ["TOTAL", "THIS MONTH", "LIFETIME LBS"])
  check(`[history] "${tile}" tile reads 0`, new RegExp(`0\\s*\\|?\\s*${tile}`).test(hist.split("\n").join(" | ")), hist.slice(0,200));

// 3 — Weekly Review. Zero data must produce the "come back Sunday" copy, NOT the silent error
// state its ReferenceError used to produce (which rendered as a generic failure with no cause).
await nav("Profile");
check("Weekly Review opens", await tap("Weekly Review"));
const wr = await page.evaluate(() => {
  const c = [...document.querySelectorAll("div")].filter(d => {
    const s = getComputedStyle(d);
    return s.position === "fixed" && (+s.zIndex || 0) >= 100 && d.offsetHeight > 200;
  });
  return c.length ? c[c.length - 1].innerText : "";
});
check("[weekly review] zero-data copy, not an error state", /weekly review lands on Sunday/i.test(wr), JSON.stringify(wr.slice(0, 160)));
check("[weekly review] no junk", !JUNK.test(wr));

// 4 — Body Battery on an account with no HealthKit and no workouts. It must say "Est. start"
// (it is an estimate — claiming "Woke at" would assert a measurement that does not exist), and
// the level must be a finite integer in range rather than the NaN a zero-history walk can yield.
await page.keyboard.press("Escape"); await page.waitForTimeout(700);
await nav("Profile");
const bb = (await body()).match(/BODY BATTERY[\s\S]{0,120}/);
const lvl = bb && bb[0].match(/(\d+)\/100/);
check("[body battery] renders a level", !!lvl, bb ? bb[0].replace(/\n/g, " | ") : "no card");
check("[body battery] level is a sane 0-100 integer", lvl && +lvl[1] >= 0 && +lvl[1] <= 100, lvl && lvl[1]);
check('[body battery] says "Est. start" not "Woke at" with no health data', /Est\. start \d+/.test(bb ? bb[0] : ""), bb ? bb[0].replace(/\n/g," | ") : "");

// 5 — Strength score must stay GATED behind its unlock copy rather than printing a number
// derived from a bodyweight that was never logged.
const prof = await body();
check("[strength score] gated on bodyweight, no invented number",
  /Log your bodyweight in Body tracking/.test(prof) && !/STRENGTH SCORE[\s\S]{0,60}\b\d{2,}\b/.test(prof));

check("no uncaught errors anywhere on the fresh-account walk", errs.length === 0, errs.join(" ;; "));
await browser.close();
console.log(fails ? `${fails} FAIL(S)` : "ok");
process.exit(fails ? 1 : 0);
