// EVERY SETTINGS ROW'S TEXT STARTS AT THE SAME LEFT EDGE, AND THE SECTIONS COME IN A FIXED ORDER.
// Mo, from his phone: "Coaching and Import are pushed off." They were <button>s, and a button's
// default `text-align` is CENTER — a block child inherits it, so the two-line rows rendered their
// titles centred over a left-hugging subtitle. The one-line rows hid the same bug because a lone
// child in a space-between flex row is only as wide as its text. AppVersionRow and
// HealthConnectRow already carried `textAlign:"left"`; the rows written after them never got it —
// one guard that didn't get copied. So this measures the INK (a Range over each row's first text
// node), not the box: the box of a mis-aligned title is exactly where it should be.
import { chromium } from "playwright-core";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`  PASS ${l}`); else { fails++; console.log(`  FAIL ${l}${d ? " — " + d : ""}`); } };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
// 402 is Mo's device width; 375 narrows the rows so a long subtitle wraps.
for (const width of [402, 375]) {
  const page = await browser.newPage({ viewport: { width, height: 874 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(6000);
  page.on("pageerror", e => { fails++; console.log("  PAGEERROR:", e.message.slice(0, 160)); });
  await page.addInitScript(me => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: "light", unit: "lbs", profile: { username: "momo", name: "Mo" }, weeklyTarget: 3 }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: me, email: "mo@example.com" } }));
    localStorage.setItem("seshd_onboarded", "1"); localStorage.setItem("seshd_custom_merge_v1", "1");
  }, ME);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "t", user: { id: ME, email: "mo@example.com" } }) }));
  await page.route("**/rest/v1/**", r => {
    const q = r.request(); let body = "[]";
    // Two custom exercises so the Custom exercises disclosure renders and its count summary is checked.
    if (/\/rest\/v1\/profiles\?/.test(q.url()) && q.method() === "GET")
      body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", theme: "light", is_public: true, seen_onboarding: true, weekly_target: 3, pr_events: [],
        custom_exercises: [{ name: "Zercher Carry Thing", muscle: "Core" }, { name: "Yoke Press Thing", muscle: "Shoulders" }],
        notification_prefs: { messages: true, kudos: true, comments: false, follows: true } }]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await page.goto("http://127.0.0.1:8199/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3200);
  await page.evaluate(() => { const p = [...document.querySelectorAll("button")].filter(x => x.offsetParent).find(x => x.getAttribute("aria-label") === "Profile"); p && p.click(); });
  await page.waitForTimeout(900);
  await page.evaluate(() => { const s = [...document.querySelectorAll("button")].filter(x => x.offsetParent).find(x => x.getAttribute("aria-label") === "Settings"); s && s.click(); });
  await page.waitForTimeout(1300);
  const info = await page.evaluate(() => {
    const done = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Done");
    const scroller = done && [...done.parentElement.parentElement.children].find(el => getComputedStyle(el).overflowY === "auto");
    if (!scroller) return null;
    const heads = [...scroller.children].filter(el => /^[A-Z][A-Z ]+$/.test((el.textContent || "").trim()) && el.children.length === 0).map(el => el.textContent.trim());
    const firstInk = (el) => {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => n.textContent.trim() ? 1 : 3 });
      const n = w.nextNode(); if (!n) return null;
      const r = document.createRange(); r.selectNodeContents(n); return { text: n.textContent.trim().slice(0, 30), left: r.getBoundingClientRect().left };
    };
    // Every full-width row BUTTON in the cards (theme options and segmented pills are not rows).
    const rows = [...scroller.querySelectorAll("button")].filter(b => b.getBoundingClientRect().width > 250 && !b.hasAttribute("data-theme-option"))
      .map(b => { const ink = firstInk(b); // Measured against the CARD, not the button: the Appearance disclosure is a padding-less
        // button inside a padded row, which is correct and would read as 0 against its own box.
        const card = b.closest("div[style*=\"border-radius: 12px\"]");
        return ink && card && { ...ink, rowLeft: card.getBoundingClientRect().left + 1 }; }).filter(Boolean);
    return { heads, rows };
  });
  check(`[${width}] settings opened`, !!info && info.rows.length >= 8, JSON.stringify(info && info.rows.length));
  if (!info) continue;
  const want = ["PREFERENCES", "TRAINING", "PRIVACY", "YOUR DATA", "SUPPORT", "ACCOUNT"];
  check(`[${width}] sections in order`, JSON.stringify(info.heads) === JSON.stringify(want), JSON.stringify(info.heads));
  for (const want of ["Coaching", "Import workouts", "Send feedback", "Export my data", "Sign Out", "Delete account"])
    check(`[${width}] row "${want}" is present`, info.rows.some(r => r.text.startsWith(want)));
  // ── Disclosures: Notifications and Custom exercises start COLLAPSED, say what is inside, and open.
  const disc = await page.evaluate(() => [...document.querySelectorAll("[data-disclosure]")].map(b => ({
    hook: b.getAttribute("data-disclosure"), name: b.getAttribute("aria-label"), expanded: b.getAttribute("aria-expanded"), text: (b.textContent || "").trim() })));
  const notif = disc.find(d => d.hook === "notifications"), cust = disc.find(d => d.hook === "custom-exercises");
  check(`[${width}] Notifications is a collapsed disclosure`, notif && notif.expanded === "false", JSON.stringify(notif));
  // One pref is seeded OFF, so the summary must count it — "All on" here would be a lie.
  check(`[${width}] its summary counts the switches that are on`, notif && /4 of 5 on/.test(notif.text), notif && notif.text);
  check(`[${width}] Custom exercises is a collapsed disclosure with its count`, cust && cust.expanded === "false" && /2$/.test(cust.text), JSON.stringify(cust));
  // The accessible name must say what the summary MEANS — a bare "2" or "Off" does not.
  check(`[${width}] disclosures have spoken names`, notif && notif.name === "Notifications, 4 of 5 on" && cust && cust.name === "Custom exercises, 2 saved", JSON.stringify([notif && notif.name, cust && cust.name]));
  const hiddenBefore = await page.evaluate(() => ({ kudos: !!document.querySelector('[role="switch"][aria-label="Kudos"]'), ex: /Zercher Carry Thing/.test(document.body.innerText) }));
  check(`[${width}] collapsed means absent from the DOM`, !hiddenBefore.kudos && !hiddenBefore.ex, JSON.stringify(hiddenBefore));
  await page.evaluate(() => document.querySelectorAll("[data-disclosure]").forEach(b => b.click()));
  await page.waitForTimeout(300);
  const shownAfter = await page.evaluate(() => ({ switches: document.querySelectorAll('[role="switch"]').length, ex: /Zercher Carry Thing/.test(document.body.innerText),
    expanded: [...document.querySelectorAll("[data-disclosure]")].map(b => b.getAttribute("aria-expanded")) }));
  check(`[${width}] tapping opens both`, shownAfter.expanded.every(e => e === "true") && shownAfter.switches === 6 && shownAfter.ex, JSON.stringify(shownAfter));
  const off = info.rows.filter(r => Math.abs(r.left - r.rowLeft - 14) > 1.5);
  check(`[${width}] every row's text starts at the card's 14px inset`, off.length === 0,
    JSON.stringify(off.map(r => [r.text, Math.round(r.left - r.rowLeft)])));
  await page.close();
}
await browser.close();
console.log(fails ? `FAIL pw_settingsrows (${fails})` : "PASS pw_settingsrows");
process.exit(fails ? 1 : 0);
