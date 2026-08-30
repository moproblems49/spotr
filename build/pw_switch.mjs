// Settings' five booleans are SWITCHES, not two-segment "On | Off" pickers. A segmented control
// is for choosing among alternatives you can name, and "Off" is not an alternative — it is the
// absence of the thing. Four identical On/Off pills also made the heaviest elements on the screen
// four controls all sitting in their default state.
//
// The check that matters most here is the LIGHT-THEME KNOB. It is white on a pale track, and the
// knob's position is what identifies the switch's state — the first cut measured 1.18:1, and a
// single fixed rim alpha cannot fix it, because the value that clears light (0.5 → 3.37:1) drops
// the dark knob from 4.64:1 to 1.63:1. Nothing else in the battery can see this: sim_a11y sweeps
// theme TOKENS and this control paints its knob from literals (the documented blind spot, same as
// the plate colours and the share modal's muted text).
import { chromium } from "playwright-core";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`  PASS ${l}`); else { fails++; console.log(`  FAIL ${l}${d ? " — " + d : ""}`); } };

const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
const parse = s => (s.match(/[\d.]+/g) || []).map(Number);
const over = (fg, bg) => { const a = fg[3] ?? 1; return [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a)); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

for (const theme of ["dark", "light"]) {
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(6000);
  page.on("pageerror", e => { fails++; console.log("  PAGEERROR:", e.message.slice(0, 160)); });
  await page.addInitScript(([me, th]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: th, unit: "lbs",
      profile: { username: "momo", name: "Mo" }, weeklyTarget: 3 }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: me } }));
    localStorage.setItem("seshd_onboarded", "1"); localStorage.setItem("seshd_custom_merge_v1", "1");
  }, [ME, theme]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "t", user: { id: ME } }) }));
  const writes = [];
  await page.route("**/rest/v1/**", r => {
    const q = r.request();
    if (q.method() === "PATCH") writes.push(q.postData() || "");
    // Seed THROUGH the stub: loadUserData replaces the store with the server copy, so a
    // localStorage-only fixture renders defaults rather than what it seeded. One switch is
    // deliberately OFF, because a fixture where everything is on cannot see the off-state at all.
    let body = "[]";
    if (/\/rest\/v1\/profiles\?/.test(q.url()) && q.method() === "GET")
      body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", theme, is_public: true,
        seen_onboarding: true, weekly_target: 3, pr_events: [],
        notification_prefs: { messages: true, kudos: true, comments: false, follows: true } }]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await page.goto("http://127.0.0.1:8199/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3200);
  await page.evaluate(() => { const p = [...document.querySelectorAll("button")].filter(x => x.offsetParent).find(x => (x.getAttribute("aria-label") || "") === "Profile"); p && p.click(); });
  await page.waitForTimeout(900);
  await page.evaluate(() => { const s = [...document.querySelectorAll("button")].filter(x => x.offsetParent).find(x => (x.getAttribute("aria-label") || "") === "Settings"); s && s.click(); });
  await page.waitForTimeout(1300);

  const info = await page.evaluate(() => {
    const sw = [...document.querySelectorAll('[role="switch"]')];
    const read = (el) => {
      const knob = el.querySelector("span");
      const cs = getComputedStyle(el), ks = getComputedStyle(knob);
      return { label: el.getAttribute("aria-label"), checked: el.getAttribute("aria-checked"),
        track: cs.backgroundColor, knob: ks.backgroundColor, shadow: ks.boxShadow,
        w: Math.round(el.getBoundingClientRect().width) };
    };
    return { switches: sw.map(read),
      // The old control rendered literal On/Off buttons; they must be gone from this screen.
      onOffButtons: [...document.querySelectorAll("button")].filter(b => /^(On|Off)$/.test((b.textContent || "").trim())).length };
  });

  check(`[${theme}] five booleans render as switches`, info.switches.length === 5, `found ${info.switches.length}`);
  check(`[${theme}] no leftover "On"/"Off" segmented buttons`, info.onOffButtons === 0, `${info.onOffButtons} found`);
  const labels = info.switches.map(s => s.label).join(",");
  check(`[${theme}] all five are labelled for a screen reader`,
    ["Public profile", "Messages", "Kudos", "Comments", "New followers"].every(l => labels.includes(l)), labels);
  const off = info.switches.find(s => s.checked === "false");
  const on = info.switches.find(s => s.checked === "true");
  check(`[${theme}] the seeded OFF pref renders off`, off && off.label === "Comments", off && off.label);

  // The knob must be distinguishable from its own track. Composite the rim over the knob fill
  // the way the browser paints it, then measure against the track.
  if (off) {
    const rim = (off.shadow.match(/inset[^,)]*rgba?\([^)]*\)|rgba?\([^)]*\)\s+0px\s+0px\s+0px\s+1px\s+inset/i) || [])[0] || "";
    const rimCol = rim ? parse(rim.replace(/inset/i, "")).slice(0, 4) : null;
    const knobRGB = parse(off.knob).slice(0, 3);
    const edge = rimCol && rimCol.length >= 4 ? over(rimCol, knobRGB) : knobRGB;
    const r = ratio(edge, parse(off.track).slice(0, 3));
    check(`[${theme}] OFF knob edge is visible against its track (3:1)`, r >= 3, `${r.toFixed(2)}:1`);
  }
  // The state signal itself: the track fill must differ hugely between on and off.
  if (on && off) {
    const r = ratio(parse(on.track).slice(0, 3), parse(off.track).slice(0, 3));
    check(`[${theme}] on/off tracks are unmistakable (3:1)`, r >= 3, `${r.toFixed(2)}:1`);
  }

  // It must actually work, not just look right: toggling writes the whole prefs object.
  await page.evaluate(() => { const k = [...document.querySelectorAll('[role="switch"]')].find(s => s.getAttribute("aria-label") === "Kudos"); k && k.click(); });
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => { const k = [...document.querySelectorAll('[role="switch"]')].find(s => s.getAttribute("aria-label") === "Kudos"); return k && k.getAttribute("aria-checked"); });
  check(`[${theme}] toggling flips aria-checked`, after === "false", after);
  const w = writes.filter(x => /notification_prefs/.test(x)).pop() || "";
  check(`[${theme}] toggling writes to the server (not a local-only setState)`, /"kudos":false/.test(w), w.slice(0, 90));
  await page.close();
}
// ── The race the switch inherited from the control it replaced ───────────────────────────────
// A settings edit is an optimistic setStore + an immediate queueWrite, and `loadUserData` REPLACES
// its keys wholesale from the server. Six sibling fields carry a 20s "an edit just happened"
// guard; notificationPrefs was the one field with that exact shape and no guard, so a foreground
// refresh landing before the PATCH re-served the stale value and the switch flipped back under
// the user's finger. The write is durable, so it self-heals later — which is what makes it read
// as a glitch rather than a failure, and why nothing reported it.
//
// TIMING IS LOAD-BEARING HERE. The foreground refresh is throttled to once per 30s, so firing
// visibilitychange sooner is a SILENT NO-OP: the first draft of this check did that and passed
// against the broken build. Wait past the throttle BEFORE the edit — which is also the realistic
// shape of the bug (app open a while, change a setting, background/foreground).
{
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(6000);
  await page.addInitScript(me => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: "dark", unit: "lbs", weeklyTarget: 3, profile: { username: "momo", name: "Mo" } }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: me } }));
    localStorage.setItem("seshd_onboarded", "1"); localStorage.setItem("seshd_custom_merge_v1", "1");
  }, ME);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "t", user: { id: ME } }) }));
  // The server ALWAYS serves kudos:true — it has not yet received the PATCH. That IS the race.
  await page.route("**/rest/v1/**", r => {
    const q = r.request(); let body = "[]";
    if (/\/rest\/v1\/profiles\?/.test(q.url()) && q.method() === "GET")
      body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", theme: "dark", is_public: true,
        seen_onboarding: true, weekly_target: 3, pr_events: [],
        notification_prefs: { messages: true, kudos: true, comments: true, follows: true } }]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await page.goto("http://127.0.0.1:8199/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3200);
  await page.waitForTimeout(31000);                      // outlast the 30s refresh throttle
  await page.evaluate(() => { const p = [...document.querySelectorAll("button")].filter(x => x.offsetParent).find(x => (x.getAttribute("aria-label") || "") === "Profile"); p && p.click(); });
  await page.waitForTimeout(900);
  await page.evaluate(() => { const s = [...document.querySelectorAll("button")].filter(x => x.offsetParent).find(x => (x.getAttribute("aria-label") || "") === "Settings"); s && s.click(); });
  await page.waitForTimeout(1200);
  const readKudos = () => page.evaluate(() => { const k = [...document.querySelectorAll('[role="switch"]')].find(s => s.getAttribute("aria-label") === "Kudos"); return k && k.getAttribute("aria-checked"); });
  // Read WHICH unit is selected, not the selected button's colour: this section also switches the
  // THEME, which repaints the whole palette, so an absolute-colour comparison fails for a reason
  // that has nothing to do with the unit. A relative reading is theme-independent.
  const readUnit = () => page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter(x => x.offsetParent && /^(LBS|KG)$/i.test((x.textContent||"").trim()));
    const filled = btns.find(b => !/rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(b).backgroundColor));
    return filled ? filled.textContent.trim().toUpperCase() : null;
  });
  const readTheme = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  // ALL THREE EDITS, THEN ONE REFRESH. The foreground refresh is throttled to once per 30s, so a
  // second visibilitychange a few seconds after the first is a SILENT NO-OP — an earlier draft
  // made the edits, refreshed, made more edits and refreshed again, and those later checks passed
  // against a build with the guards deleted because no refresh ever ran. One refresh after all the
  // edits tests every field and cannot be thrown by the throttle.
  check("[race] Kudos starts on, from the server", await readKudos() === "true");
  await page.evaluate(() => { const k = [...document.querySelectorAll('[role="switch"]')].find(s => s.getAttribute("aria-label") === "Kudos"); k && k.click(); });
  await page.waitForTimeout(450);
  check("[race] Kudos reads off immediately after the tap", await readKudos() === "false");

  const unitBefore = await readUnit();
  await page.evaluate(() => { const b=[...document.querySelectorAll("button")].filter(x=>x.offsetParent).find(x=>/^KG$/i.test((x.textContent||"").trim())); b && b.click(); });
  await page.waitForTimeout(450);
  const unitPicked = await readUnit();
  check("[race] tapping KG visibly selects it", unitPicked === "KG" && unitBefore !== "KG", `${unitBefore} -> ${unitPicked}`);

  const themeBefore = await readTheme();
  // Appearance is a LIST now, not two pills — the row's text is "LightWarm off-white canvas", so
  // the old exact /^Light$/ match found nothing and clicked nothing while the check blamed the app.
  // Select on the stable hook instead. And the list is a DISCLOSURE that starts closed, so the
  // rows do not exist until it is opened — assert that, or a silent no-op click reads as a pass.
  await page.evaluate(() => { const d=document.querySelector("[data-theme-disclosure]"); d && d.click(); });
  await page.waitForTimeout(400);
  check("[race] opening Appearance reveals the theme rows",
    await page.evaluate(() => !!document.querySelector('[data-theme-option="light"]')));
  await page.evaluate(() => { const b=document.querySelector('[data-theme-option="light"]'); b && b.click(); });
  await page.waitForTimeout(600);
  const themePicked = await readTheme();
  check("[race] switching to Light visibly changes the app", themePicked !== themeBefore, `${themeBefore} -> ${themePicked}`);

  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(2600);
  check("[race] Kudos STAYS off through a refresh serving the stale value", await readKudos() === "false");
  check("[race] the unit choice SURVIVES that refresh", await readUnit() === "KG");
  check("[race] the theme choice SURVIVES that refresh", await readTheme() === themePicked);
  await page.close();
}

await browser.close();
console.log(fails ? `${fails} FAIL(S)` : "ok");
process.exit(fails ? 1 : 0);
