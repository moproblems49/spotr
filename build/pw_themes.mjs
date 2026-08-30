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
    // ── 2b. The list is a DISCLOSURE and starts CLOSED. Assert the closed state FIRST: the rows
    //     are conditionally rendered, not display:none, precisely so this check can fail — a
    //     hidden-but-present row is still clickable by el.click() and would let every check below
    //     pass against a build where the disclosure never opens.
    const idsClosed = await page.evaluate(() => [...document.querySelectorAll("[data-theme-option]")].map(e => e.dataset.themeOption));
    check("2b. the theme list starts collapsed", idsClosed.length === 0, JSON.stringify(idsClosed));
    const disc = page.locator("[data-theme-disclosure]").first();
    check("2c. the Appearance row is a disclosure", await disc.count() > 0);
    // The collapsed row must still answer "which theme am I on" — otherwise collapsing it hides
    // the one fact the control exists to report.
    check("2d. the collapsed row names the current theme", /Appearance\s*Dark/i.test(await txt(page)), (await txt(page)).slice(0, 200));
    await disc.click({ force: true });
    await page.waitForTimeout(500);
    // Count the rows by their hook, not by finding the words in the page text — "Dark" appears in
    // plenty of other copy, and a text match would pass on a picker that rendered nothing.
    const ids = await page.evaluate(() => [...document.querySelectorAll("[data-theme-option]")].map(e => e.dataset.themeOption));
    const ALL = ["light","arctic","dark","midnight","spring","summer","fall","winter","halloween"];
    check("2e. opening it reveals every registered theme", ALL.every(x => ids.includes(x)), JSON.stringify(ids));
    check("2f. and no more than the registry lists", ids.length === ALL.length, JSON.stringify(ids));
    check("2g. the occasion themes sit under their own heading", /SEASONAL/.test(await txt(page)));
    // ★ A `//` COMMENT IN JSX CHILD POSITION IS TEXT, AND THE APP SHIPPED IT ON SCREEN. Wrapping
    // each row in a <Fragment> moved a normal JS comment into children position, so the picker
    // rendered four copies of "// data-theme-option is the selector contract…" to real users.
    // Every other check here selects on the data attribute, so the whole suite stayed green.
    const pickerText = await page.evaluate(() => {
      const d = document.querySelector("[data-theme-disclosure]");
      return d && d.parentElement ? d.parentElement.innerText : "";
    });
    check("2h. no source comment leaked into the picker as text",
      !/\/\/|\/\*|data-theme-option/.test(pickerText), pickerText.slice(0, 160));

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

// ── 4. A theme may bring ORNAMENTS, and the layer must not be able to eat a tap. Halloween is
//      the first theme with a `decor` kind; every constraint here is a documented trap in
//      CLAUDE.md (portaled out of the swipe track, pointer-transparent, capped below the sheets).
{
  const { page } = await boot("halloween");
  const d = await page.evaluate(() => {
    const el = document.querySelector(".seshd-decor");
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { z: +cs.zIndex, pe: cs.pointerEvents, parent: el.parentElement.tagName,
             svgs: el.querySelectorAll("svg").length, aria: el.getAttribute("aria-hidden"),
             kind: el.dataset.decor, kids: el.childElementCount };
  });
  check("4a. the Halloween theme renders a decor layer", !!d, String(d));
  check("4a2. and it declares its own kind", d && d.kind === "halloween", String(d && d.kind));
  if (d) {
    check("4b. it is portaled to <body>, not left inside the swipe track", d.parent === "BODY", d.parent);
    check("4c. it cannot eat a tap", d.pe === "none", d.pe);
    check("4d. it sits above the nav-level overlays and below the sheets", d.z > 70 && d.z < 300, String(d.z));
    check("4e. it is hidden from screen readers", d.aria === "true", String(d.aria));
    check("4f. it actually draws ornaments", d.svgs >= 5, String(d.svgs));
    // The point of pointerEvents:none is that a real tap lands on the app underneath. Probe the
    // centre of the screen, which the ghosts drift across.
    const hit = await page.evaluate(() => {
      const el = document.elementFromPoint(214, 400);
      return el ? !el.closest(".seshd-decor") : false;
    });
    check("4g. a tap at the screen centre reaches the app, not the decoration", hit);
  }
  await page.close();
  // Every seasonal theme brings its OWN ornaments. A shared kind, or a theme whose decor silently
  // renders nothing, is exactly the "capability built, call site never wired" shape that let
  // showGroupShare ship dead for six weeks.
  for (const [theme, kind] of [["spring","petals"],["summer","summer"],["fall","leaves"],["winter","snow"]]) {
    const { page: ps } = await boot(theme);
    const got = await ps.evaluate(() => {
      const el = document.querySelector(".seshd-decor");
      return el ? { kind: el.dataset.decor, kids: el.childElementCount, pe: getComputedStyle(el).pointerEvents } : null;
    });
    check(`4i. ${theme} renders its own "${kind}" ornaments`,
      got && got.kind === kind && got.kids >= 5 && got.pe === "none", JSON.stringify(got));
    await ps.close();
  }
  // And a theme with no `decor` must render no layer at all.
  const { page: p2 } = await boot("dark");
  check("4h. an undecorated theme renders no decor layer",
    await p2.evaluate(() => !document.querySelector(".seshd-decor")));
  await p2.close();
}

await b.close();
console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
