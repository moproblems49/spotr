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
             kind: el.dataset.decor,
             // NOT childElementCount: the layer's own <style> tag is a child, so that number
             // reads one higher than the ornament count it looks like.
             kids: [...el.children].filter(e => e.tagName !== "STYLE").length };
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
    // A single probe point only catches the container losing pointerEvents — a single CHILD
    // flipped back to auto is invisible to it unless that child happens to cover the sample.
    // Sweep a grid, and assert the property on every descendant as well as the outcome.
    const hit = await page.evaluate(() => {
      const pts = [];
      for (let x = 20; x < 420; x += 50) for (let y = 60; y < 900; y += 60) {
        const el = document.elementFromPoint(x, y);
        if (el && el.closest(".seshd-decor")) pts.push([x, y]);
      }
      return pts;
    });
    check("4g. no point on the screen taps the decoration instead of the app", hit.length === 0, JSON.stringify(hit.slice(0, 4)));
    const autos = await page.evaluate(() => [...document.querySelectorAll(".seshd-decor *")]
      .filter(e => getComputedStyle(e).pointerEvents !== "none").map(e => e.tagName).slice(0, 5));
    check("4g2. every descendant of the layer is pointer-transparent too", autos.length === 0, JSON.stringify(autos));
  }
  await page.close();
  // Every seasonal theme brings its OWN ornaments. A shared kind, or a theme whose decor silently
  // renders nothing, is exactly the "capability built, call site never wired" shape that let
  // showGroupShare ship dead for six weeks.
  for (const [theme, kind] of [["spring","petals"],["summer","summer"],["fall","leaves"],["winter","snow"]]) {
    const { page: ps } = await boot(theme);
    const got = await ps.evaluate(() => {
      const el = document.querySelector(".seshd-decor");
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { kind: el.dataset.decor,
               kids: [...el.children].filter(x => x.tagName !== "STYLE").length,
               pe: cs.pointerEvents, z: +cs.zIndex, parent: el.parentElement.tagName };
    });
    // Every seasonal kind gets the full contract, not just halloween — a per-kind conditional
    // render bug in only one of them would otherwise pass 4b-4e, which only ever boot halloween.
    check(`4i. ${theme} renders its own "${kind}" ornaments, portaled and pointer-transparent`,
      got && got.kind === kind && got.kids >= 4 && got.pe === "none"
      && got.z > 70 && got.z < 300 && got.parent === "BODY", JSON.stringify(got));
    await ps.close();
  }
  // ── 4j. The SEASONAL MARK on the three landing CTAs. Separate mechanism from the decor layer
  //     (it is part of a card, not a floating layer), so it needs its own check — and an <svg>
  //     contributes no textContent, so this has to select on the data hook.
  // Each button gets its OWN glyph — one mark repeated three times is wallpaper, which is the
  // thing this was changed away from, so assert the three are DISTINCT as well as correct.
  const SLOTS = {
    halloween: { start: "pumpkin", friends: "ghost",     groups: "spider" },
    winter:    { start: "snowman", friends: "snowflake", groups: "fir" },
    spring:    { start: "blossom", friends: "butterfly", groups: "sprout" },
    fall:      { start: "leaf",    friends: "acorn",     groups: "tree" },
    summer:    { start: "sun",     friends: "wave",      groups: "palm" },
  };
  for (const [theme, want] of Object.entries(SLOTS)) {
    const { page: pm } = await boot(theme);
    const readMarks = () => pm.evaluate(() => [...document.querySelectorAll("[data-theme-mark]")]
      .map(e => ({ kind: e.dataset.themeMark, pe: getComputedStyle(e).pointerEvents })));
    const onTracker = await readMarks();
    check(`4j. ${theme}: Quick Start is marked with a "${want.start}"`,
      onTracker.length === 1 && onTracker[0].kind === want.start, JSON.stringify(onTracker));
    check(`4j2. ${theme}'s mark cannot eat the tap on the primary action`,
      onTracker.every(m => m.pe === "none"), JSON.stringify(onTracker));
    const disc = pm.locator('[aria-label="Discover"]').first();
    if (await disc.count()) {
      await disc.click({ force: true });
      await pm.waitForTimeout(1200);
      const onDiscover = (await readMarks()).map(m => m.kind);
      check(`4j3. ${theme}: Friends Activity and Groups get their own glyphs`,
        onDiscover.length === 2 && onDiscover.includes(want.friends) && onDiscover.includes(want.groups),
        JSON.stringify(onDiscover));
      check(`4j4. ${theme}: the three buttons do not share one glyph`,
        new Set([want.start, ...onDiscover]).size === 3, JSON.stringify([want.start, ...onDiscover]));
      // ── 4m. PLANTED MARKS. A glyph with a base (palm/tree/fir/sprout) grows OUT OF the card's
      //     bottom-right corner: its stem must be cropped by the card edge, its top must stay
      //     inside, and the card must actually clip. A glyph without a base (halloween's spider)
      //     must stay a top-right sticker. Nothing else in this file can see the difference —
      //     4j3 only checks WHICH glyph renders, so the whole placement mode was unguarded.
      const PLANTED = ["palm", "tree", "fir", "sprout"];
      const geo = await pm.evaluate(() => [...document.querySelectorAll("[data-theme-mark]")].map(e => {
        const card = e.closest("button").getBoundingClientRect();
        // Measure the INK, not the element box. A planted glyph can be ROTATED about its base
        // (the palm leans 25deg), and a rotated box includes empty corners — the summer palm's
        // box overshoots the card top by 30px while every drawn frond is inside it. Each <path>
        // inherits the ancestor transform, so its own client rect is already in screen space:
        // the union of the paths is the real ink.
        // Every drawn shape, not just <path>: winter's fir draws its trunk as a <rect> and the
        // fall tree its crown as <circle>s, so a path-only union measured the wrong ink and
        // reported the fir as not reaching the card edge when it does.
        const ps = [...e.querySelectorAll("path,rect,circle,ellipse,polygon,line")]
          .map(x => x.getBoundingClientRect()).filter(x => x.width || x.height);
        const ink = { top: Math.min(...ps.map(x => x.top)), bottom: Math.max(...ps.map(x => x.bottom)) };
        return { kind: e.dataset.themeMark, planted: e.dataset.themeMarkPlant === "true",
                 belowCard: +(ink.bottom - card.bottom).toFixed(1),
                 aboveCard: +(card.top - ink.top).toFixed(1),
                 clips: getComputedStyle(e.closest("button")).overflow };
      }));
      const g = geo.find(m => m.kind === want.groups);
      if (!g) { fails++; console.log(`FAIL 4m. ${theme}: no Groups mark to measure`); }
      else if (PLANTED.includes(want.groups)) {
        check(`4m. ${theme}: the "${want.groups}" is planted, not a sticker`, g.planted, JSON.stringify(g));
        check(`4m2. ${theme}: its stem is cropped by the card's bottom edge`, g.belowCard > 2, JSON.stringify(g));
        check(`4m3. ${theme}: its top stays inside the card`, g.aboveCard < 0, JSON.stringify(g));
        check(`4m4. ${theme}: the card actually clips it`, g.clips === "hidden", JSON.stringify(g));
      } else {
        check(`4m5. ${theme}: a "${want.groups}" has no base, so it stays a sticker`,
          !g.planted && g.belowCard < 0, JSON.stringify(g));
      }
    } else { fails++; console.log(`FAIL 4j3. ${theme}: could not reach the Discover tab`); }
    await pm.close();
  }
  // ── 4l. Summer's palm is the one ornament with its OWN layer, and its z is the whole point:
  //     it must sit BELOW the floating nav (50) so the trunks pass behind the pill instead of
  //     drawing over the Home button, which is what happens at the decor layer's 150.
  {
    const { page: ps } = await boot("summer");
    const back = await ps.evaluate(() => {
      const el = document.querySelector(".seshd-decor-back");
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { z: +cs.zIndex, pe: cs.pointerEvents, parent: el.parentElement.tagName,
               aria: el.getAttribute("aria-hidden"), paths: el.querySelectorAll("path").length,
               autos: [...el.querySelectorAll("*")].filter(e => getComputedStyle(e).pointerEvents !== "none").length };
    });
    check("4l. summer renders the palm layer", !!back, String(back));
    if (back) {
      check("4l2. it is portaled to <body>", back.parent === "BODY", back.parent);
      check("4l3. it sits BELOW the nav so the trunks pass behind the pill", back.z > 0 && back.z < 50, String(back.z));
      check("4l4. it cannot eat a tap", back.pe === "none" && back.autos === 0, JSON.stringify(back));
      check("4l5. it is hidden from screen readers", back.aria === "true", String(back.aria));
      check("4l6. it actually draws the scene", back.paths >= 15, String(back.paths));
      // The nav must still be the topmost thing where they overlap — the pill spans y 868-918.
      const navOnTop = await ps.evaluate(() => {
        const el = document.elementFromPoint(390, 892);
        return el ? !el.closest(".seshd-decor-back") : false;
      });
      check("4l7. the nav bar is still on top where the palm overlaps it", navOnTop);
    }
    await ps.close();
  }
  {
    const { page: pd } = await boot("dark");
    check("4k2. a non-seasonal theme renders no palm layer",
      await pd.evaluate(() => document.querySelectorAll(".seshd-decor-back").length === 0));
    check("4k. a non-seasonal theme renders no mark",
      await pd.evaluate(() => document.querySelectorAll("[data-theme-mark]").length === 0));
    await pd.close();
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
