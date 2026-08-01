// AUDIT PROBE for the declutter/finish-summary era (commits 853a0f0..HEAD).
// Two things the diff read suggests are broken; this drives the real app to settle them.
//   1. The "×" remove-exercise button moved into the overflow menu, and that menu button is
//      gated on `ex.name`. Quick Start seeds an exercise with name:"" and "+ Add exercise"
//      appends more of the same — so a blank row may have no way to be removed at all.
//   2. The 1RM table's weight column switched to Math.round(oneRM*p)/100, which yields one
//      decimal place (205.2 lbs) where the old code gave whole numbers.
import { chromium } from "playwright-core";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);

const ME = "11111111-1111-4111-8111-111111111111";
await page.addInitScript((me) => {
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
    prEvents: [], bodyLog: [], prs: {}, profile: { username: "momo", name: "Mo" },
    users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, ME);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));
await page.route("**/rest/v1/**", r => {
  const u = r.request().url();
  const body = /\/rest\/v1\/(profiles|public_profiles)\?/.test(u)
    ? JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }])
    : "[]";
  r.fulfill({ status: 200, contentType: "application/json", body });
});

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

await page.goto("http://127.0.0.1:8199/", { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => !/Setting up your account/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);

// ── 1RM TABLE ────────────────────────────────────────────────────────────────────────────────
await page.getByText("1RM", { exact: true }).first().click();
await page.waitForTimeout(500);
const inputs = page.locator('input[inputmode="decimal"]');
await inputs.nth(0).fill("185");
await inputs.nth(1).fill("5");
await page.waitForTimeout(500);
await page.screenshot({ path: "build/audit_1rm.png" });

const weights = await page.evaluate(() => {
  const out = [];
  for (const d of document.querySelectorAll("div")) {
    const t = (d.textContent || "").trim();
    // the weight cell is a leaf: "205.2 lbs"
    if (d.children.length === 0 && /^[\d.]+ (lbs|kg)$/.test(t)) out.push(t);
  }
  return out;
});
console.log("1RM WEIGHT CELLS:", JSON.stringify(weights));
const fractional = weights.filter(w => /\./.test(w));
check("the training-percentage table shows loadable whole numbers, not 205.2 lbs",
  fractional.length === 0, `${fractional.length} fractional: ${JSON.stringify(fractional.slice(0, 6))}`);

await page.locator('button[aria-label="Close"]').locator("visible=true").last().click();
await page.waitForTimeout(400);

// ── BLANK EXERCISE REMOVAL ───────────────────────────────────────────────────────────────────
await page.getByText("Quick Start", { exact: false }).first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: "build/audit_blank.png" });

const probe = await page.evaluate(() => {
  const txt = document.body.innerText;
  const btns = [...document.querySelectorAll("button")].map(b => ({
    label: b.getAttribute("aria-label") || "", text: (b.textContent || "").trim().slice(0, 24),
  }));
  return {
    inWorkout: /Finish|Cancel/.test(txt),
    hasOverflow: btns.some(b => b.label === "More exercise options"),
    hasRemove: btns.some(b => b.label === "Remove exercise" || b.text === "Remove exercise" || b.text === "×"),
  };
});
console.log("BLANK ROW:", JSON.stringify(probe));
check("Quick Start lands in a live workout", probe.inWorkout, JSON.stringify(probe));
check("a blank (unnamed) exercise row can still be removed",
  probe.hasRemove || probe.hasOverflow, JSON.stringify(probe));

// Add a second blank row the way a user would, then re-check.
const addBtn = page.getByText("Add exercise", { exact: false }).first();
if (await addBtn.count()) { await addBtn.click(); await page.waitForTimeout(600); }
const after = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")].map(b => ({
    label: b.getAttribute("aria-label") || "", text: (b.textContent || "").trim().slice(0, 24) }));
  return { overflow: btns.filter(b => b.label === "More exercise options").length,
           remove: btns.filter(b => b.label === "Remove exercise" || b.text === "×").length };
});
console.log("AFTER + ADD EXERCISE:", JSON.stringify(after));
await page.screenshot({ path: "build/audit_blank2.png" });
check("...and so can a second one added by mistake",
  after.overflow + after.remove > 0, JSON.stringify(after));

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
