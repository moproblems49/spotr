// PROGRAM_TEMPLATES MUST EXIST, AND THE TWO SCREENS THAT READ IT MUST RENDER.
//
// Commit 90927ed ("Remove the PR celebration popup after a workout") deleted the whole
// `const PROGRAM_TEMPLATES = [...]` array while leaving THREE references to it. A bare identifier
// with no binding is a ReferenceError — not `undefined` — so every one of them threw, and React's
// error boundary swallowed each into "Something went sideways":
//
//   1. `Onboarding` reads it at the TOP OF THE COMPONENT BODY, so the screen threw before it
//      painted. Every brand-new signup got the error screen instead of the first slide.
//   2. The onboarding COMPLETION handler reads it to seed the starter program.
//   3. "Browse templates" on the Workout tab — the primary CTA for a user with no program.
//
// Nothing caught it: no sim drives onboarding as a fresh user (they all seed `seshd_onboarded`),
// and no test had ever opened the templates sheet. Both paths are covered here.
//
// This file goes RED on 90927ed..d232377 with "Something went sideways" on both checks.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const CRASH = /went sideways|unexpected error/i;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

// `onboarded` is the whole point of the first case: leaving `seshd_onboarded` unset is what puts
// the app on the new-user path. Every other suite in this repo sets it, which is exactly why this
// crash shipped.
async function open({ onboarded }) {
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(5000);
  page.on("console", m => { const t = m.text();
    if (/ReferenceError|is not defined/.test(t)) console.log("   [console]", t.split("\n")[0].slice(0, 120)); });
  await page.addInitScript(([me, ob]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
      programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
      profile: { username:"momo", name:"Mo" },
      users: [{ id: me, username:"momo", name:"Mo", followers: [], following: [] }] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
    localStorage.setItem("seshd_custom_merge_v1", "1");
    if (ob) localStorage.setItem("seshd_onboarded", "1");
  }, [ME, onboarded]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
    body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
  await page.route("**/rest/v1/**", r => r.fulfill({ status:200, contentType:"application/json", body:"[]" }));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil:"domcontentloaded" });
  await page.waitForTimeout(2600);
  return page;
}
const body = p => p.evaluate(() => document.body.innerText);

// ── 1. A brand-new user reaches onboarding, not the error boundary ───────────────────────────
{
  const page = await open({ onboarded: false });
  const t = await body(page);
  check("a fresh signup renders onboarding instead of crashing", !CRASH.test(t),
    t.slice(0, 90).replace(/\n/g, " | "));
  check("it is really the onboarding screen", /track every rep|main goal|Continue/i.test(t),
    t.slice(0, 90).replace(/\n/g, " | "));
  // Walk a few steps: the completion handler reads PROGRAM_TEMPLATES too, so a crash can also
  // land one screen later than the first.
  for (let i = 0; i < 6; i++) {
    const hit = await page.evaluate(() => {
      const bs = [...document.querySelectorAll("button")].map(x => ({ x, t: (x.textContent || "").trim() }));
      const p = bs.find(o => /^(continue|next|get started)$/i.test(o.t)) || bs.find(o => /^(build muscle|3|intermediate)$/i.test(o.t));
      if (p) { p.x.click(); return p.t; } return null;
    });
    if (!hit) break;
    await page.waitForTimeout(650);
    if (CRASH.test(await body(page))) break;
  }
  const t2 = await body(page);
  check("walking through onboarding does not crash", !CRASH.test(t2), t2.slice(0, 90).replace(/\n/g, " | "));
  await page.close();
}

// ── 2. "Browse templates" opens the Starter Templates sheet ──────────────────────────────────
{
  const page = await open({ onboarded: true });
  await page.getByLabel("Workout").first().click().catch(() => {});
  await page.waitForTimeout(1100);
  const found = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => /browse templates/i.test((x.textContent || "").trim()));
    if (b) { b.click(); return true; } return false;
  });
  check("the Browse templates button is on the Workout tab", found);
  await page.waitForTimeout(900);
  const t = await body(page);
  check("Browse templates does not crash the app", !CRASH.test(t), t.slice(0, 90).replace(/\n/g, " | "));
  check("the Starter Templates sheet opened", /Starter Templates/i.test(t), t.slice(0, 90).replace(/\n/g, " | "));
  // The array must actually have entries — an empty one would render a blank sheet and still
  // satisfy every check above.
  const names = await page.evaluate(() => (document.body.innerText.match(/Full Body|Upper \/ Lower|Push \/ Pull \/ Legs|StrongLifts|Bro Split/gi) || []));
  console.log(`   templates listed: ${JSON.stringify([...new Set(names)])}`);
  check("real templates are listed in the sheet", new Set(names).size >= 3, JSON.stringify(names));
  await page.close();
}

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
