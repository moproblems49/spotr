// A PASSWORD-RECOVERY LINK MUST NOT LEAVE A SESSION BEHIND UNLESS THE PASSWORD WAS ACTUALLY SET.
//
// The recovery link lands with `#access_token=…&refresh_token=…&type=recovery`, and the app used to
// `saveSession()` it immediately — writing the Keychain / Preferences / localStorage copies — and
// only THEN show the set-password screen. Two facts make that a real takeover path rather than a
// tidiness issue: a recovery link opens in SAFARI, not the app (the AASA file claims only /u/* and
// /p/*), and sessions on this project carry `not_after = NULL`, i.e. they never expire. So starting
// a reset on a borrowed or shared computer and walking away without finishing left a permanent,
// fully-signed-in session in that browser for the next person who opened the site.
//
// The session is held in MEMORY during the recovery screen and persisted only once updatePassword
// has returned. A reload mid-recovery therefore drops it and the user needs a fresh link — which is
// the correct trade: the link is single-use by design and a new one is one tap away.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, hasTouch: true, isMobile: true });
page.setDefaultTimeout(5000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });

let passwordPuts = 0;
// ROUTE ORDER IS LOAD-BEARING: Playwright gives precedence to the MOST RECENTLY registered
// matching route, so the catch-all must be registered FIRST and the specific one after it.
// Registered the other way round, the catch-all swallowed `PUT /auth/v1/user`, the control below
// went red at 0 calls, and check 5 still passed — which is exactly why the control exists.
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: ME, email: "m@e.com" } }) }));
await page.route("**/auth/v1/user**", r => {
  if (r.request().method() === "PUT") { passwordPuts++; return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: ME }) }); }
  return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: ME, email: "m@e.com" }) });
});
await page.route("**/rest/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

// Land exactly as a real recovery email does.
await page.goto(`http://127.0.0.1:${PORT}/#access_token=RECOVERY_AT&refresh_token=RECOVERY_RT&expires_in=3600&type=recovery`,
  { waitUntil: "load", timeout: 20000 });
await page.waitForTimeout(2500);

const onScreen = await page.evaluate(() => document.body.innerText || "");
check("1. the set-new-password screen is shown", /Set a new password/i.test(onScreen), onScreen.slice(0, 120));

// The fragment must already be gone — a token sitting in the URL is readable by anything that
// reads location (analytics, a service worker, the browser's own history).
check("2. the tokens are stripped from the URL", !/access_token/i.test(await page.evaluate(() => location.href)),
  await page.evaluate(() => location.href));

const stored = () => page.evaluate(() => localStorage.getItem("seshd_session"));
const before = await stored();
check("3. NO session is persisted while the password is still unset", !before,
  before ? `seshd_session present: ${String(before).slice(0, 40)}…` : "");

// Now actually set the password.
await page.locator('input[placeholder="New password"]').fill("newpassword123");
await page.locator('input[placeholder="Repeat new password"]').fill("newpassword123");
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].filter(x => x.offsetParent)
  .find(x => !/back|cancel/i.test(x.textContent || "")); b && b.click(); });
await page.waitForTimeout(2000);

// CONTROL: without this, checks 3 and 5 pass on a build where the form simply never submits.
check("4. [control] the password change actually reached the server", passwordPuts > 0, `PUT /auth/v1/user calls: ${passwordPuts}`);
const after = await stored();
check("5. the session IS persisted once the password has been set", !!after,
  after ? "" : "seshd_session still absent — the user would be signed out after a successful reset");

await browser.close();
console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
