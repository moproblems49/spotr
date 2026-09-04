// pw_nativebuild — the app must report its NATIVE build, not only its OTA bundle.
//
// These answer different questions and only one of them was ever visible. `_bundleId` is the
// over-the-air bundle: it changes several times a day and carries all the web code. The native
// build is the SHELL the App Store installed; it changes only on a Mac day and is what decides
// whether push notifications, HealthKit and universal links work at all.
//
// Settings showed only the bundle, so "which native build is on this phone?" could not be answered
// from the app — and on Sep 4 that was exactly the question blocking a release decision, because a
// shell built before the entitlements landed cannot register for push however current the bundle
// is. Crash reports had the same blind spot: `app_version` carried the bundle alone, so a
// native-shell failure was unattributable.
import { chromium } from "playwright-core";
const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0, checks = 0;
const check = (label, ok, detail = "") => { checks++; if (!ok) fails++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
p.setDefaultTimeout(4000);

// Stub the two native plugins the way a device supplies them, so the REAL boot path runs. A guard
// that reads a JS value the app sets for itself would test nothing; this drives getInfo().
await p.addInitScript(me => {
  window.Capacitor = { Plugins: {
    App: { getInfo: () => Promise.resolve({ version: "1.0", build: "9", id: "com.seshd.app", name: "Seshd" }) },
    CapacitorUpdater: { current: () => Promise.resolve({ bundle: { version: "2026-09-04b" } }) },
  } };
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, prs: {}, posts: [], users: [{ id: me, username: "momo", name: "Momo" }], groups: [] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
}, ME);
await p.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "t", user: { id: ME } }) }));
await p.route("**/rest/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2400);

await p.locator('button[aria-label="Profile"]').first().click({ force: true }).catch(() => {});
await p.waitForTimeout(900);
await p.locator('button[aria-label="Settings"]').first().click({ force: true }).catch(() => {});
await p.waitForTimeout(1000);

const row = await p.evaluate(() => {
  for (const el of document.querySelectorAll("button")) if (el.innerText.includes("App version")) return el.innerText.replace(/\n/g, " | ");
  return "";
});
// Reaching the row is the precondition — without it every assertion below is vacuous.
check("the App version row is on screen", !!row, row ? "" : "Settings did not open");
if (row) {
  check("it reports the OTA bundle", /2026-09-04b/.test(row), row);
  check("it reports the NATIVE build too", /app 1\.0 \(9\)/.test(row), row);
}
await b.close();
console.log(`\n${fails ? fails + " FAILING" : "ALL PASS"} — ${checks} checks`);
process.exit(fails ? 1 : 0);
