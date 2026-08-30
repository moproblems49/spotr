// THEMES ARE PLURAL: the picker lists them, choosing one repaints AND persists, and an unknown
// key cannot crash the app.
//
// That last one is the reason this file exists. `THEMES[store.theme]` was safe while the only two
// values came from a two-option toggle; once themes can be added — or REMOVED in a later release
// while a phone still has one saved, or synced down from `profiles.theme` — an unknown key
// resolves to `undefined` and the next `C.bg` throws at the top of the component. That is a boot
// crash on every launch, the same shape as the PROGRAM_TEMPLATES outage in CLAUDE.md.
import { chromium } from "playwright-core";

const ME = "11111111-1111-4111-8111-111111111111";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

async function boot(theme, { collectWrites = false } = {}) {
  const page = await b.newPage({ viewport: { width: 428, height: 926 }, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(5000);
  const writes = [];
  await page.addInitScript(([me, th]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({
      currentUserId: me, theme: th, unit: "lbs", programs: [], history: {}, workoutDates: {},
      prEvents: [], bodyLog: [], prs: {}, posts: [], profile: { username: "momo", name: "Mo" },
      users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
    }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "m@e.com" } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
  }, [ME, theme]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "m@e.com" } }) }));
  await page.route("**/rest/v1/**", r => {
    const req = r.request();
    if (collectWrites && req.method() === "PATCH") { try { writes.push(JSON.parse(req.postData() || "{}")); } catch (e) {} }
    if (/profiles\?/.test(req.url()) && req.method() === "GET")
      return r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme }]) });
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8199}/`, { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(2600);
  return { page, writes };
}
const bodyBg = p => p.evaluate(() => getComputedStyle(document.querySelector("#root > div") || document.body).backgroundColor);
const txt = p => p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));

// ── 1. An unknown theme key must not crash the app ──────────────────────────────────────────
{
  const { page } = await boot("chartreuse-deluxe");   // never existed
  const t = await txt(page);
  check("1a. an unknown theme key does not hit the error boundary", !/Something went sideways/i.test(t), t.slice(0, 140));
  check("1b. the app renders normally on the fallback", /Workout|Quick Start/i.test(t), t.slice(0, 140));
  await page.close();
}

// ── 2. The picker lists every registered theme ──────────────────────────────────────────────
{
  const { page, writes } = await boot("dark", { collectWrites: true });
  const beforeBg = await bodyBg(page);
  const prof = page.locator('[aria-label="Profile"]').first();
  if (await prof.count()) { await prof.click({ force: true }); await page.waitForTimeout(1400); }
  const gear = page.locator('[aria-label="Settings"]').first();
  if (await gear.count()) { await gear.click({ force: true }); await page.waitForTimeout(1100); }
  const t = await txt(page);
  const reached = /Appearance/i.test(t);
  check("2a. Settings opened", reached, t.slice(0, 160));
  if (reached) {
    // Count the rows by their hook, not by finding the words in the page text — "Dark" appears in
    // plenty of other copy, and a text match would pass on a picker that rendered nothing.
    const ids = await page.evaluate(() => [...document.querySelectorAll("[data-theme-option]")].map(e => e.dataset.themeOption));
    check("2b. every registered theme has a row", ["light","dark","midnight"].every(x => ids.includes(x)), JSON.stringify(ids));
    check("2c. and no more than the registry lists", ids.length === 3, JSON.stringify(ids));

    // ── 3. Choosing one repaints AND persists. A local-only setStore is this app's dominant bug
    //      class, so assert the WRITE, not just the pixels. ──────────────────────────────────
    const mid = page.locator('[data-theme-option="midnight"]').first();
    if (await mid.count()) {
      await mid.click({ force: true });
      await page.waitForTimeout(1200);
      const afterBg = await bodyBg(page);
      check("3a. picking a theme actually repaints the app", afterBg !== beforeBg, `${beforeBg} -> ${afterBg}`);
      const themeWrite = writes.find(w => w && w.theme);
      check("3b. the choice reached the server", !!themeWrite, JSON.stringify(writes.slice(0, 3)));
      check("3c. it persisted the theme that was picked", themeWrite?.theme === "midnight", JSON.stringify(themeWrite));
    } else { fails++; console.log("FAIL 3. could not find the Midnight row to pick"); }
  }
  await page.close();
}

await b.close();
console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
