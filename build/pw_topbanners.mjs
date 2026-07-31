// Only ONE shell banner may reserve the status-bar area.
//
// The offline bar, the guest banner and the top bar each padded by env(safe-area-inset-top)
// independently. Any two on screen at once — offline + guest, or offline while signed in — stacked
// two full status bars of dead space, which is the empty band Mo saw above "Guest mode".
//
// env() insets are 0 in Chromium, so measuring padding directly proves nothing. Instead this reads
// the inline styles and counts how many visible shell banners ASK for the inset.
import { chromium } from "playwright-core";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

// Count elements whose own inline padding requests the top inset. The top bar and the two banners
// are the only shell chrome that ever should.
const countInsetOwners = (page) => page.evaluate(() => {
  const out = [];
  document.querySelectorAll("div").forEach(d => {
    const st = d.getAttribute("style") || "";
    if (!/safe-area-inset-top/.test(st)) return;
    const r = d.getBoundingClientRect();
    if (r.top > 220 || r.width < 200) return;          // shell chrome only, at the very top
    if (d.querySelector("div[style*='safe-area-inset-top']")) return; // ancestors don't count
    out.push({ text: (d.innerText || "").split("\n")[0].slice(0, 34), top: Math.round(r.top), pad: (d.getAttribute("style").match(/padding:[^;]*/) || [""])[0].slice(0, 60) });
  });
  return out;
});

async function scenario(label, { guest, offline }) {
  const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(5000);
  await page.addInitScript(([g]) => {
    // currentUserId + a users entry are needed or the signed-in boot sits on "Setting up your
    // account..." forever with /rest/v1 aborted, and the shell never renders.
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: "u1", programs: [], history: {}, prEvents: [], bodyLog: [], unit: "lbs",
      profile: { username: "momo", name: "Mo" }, users: [{ id: "u1", username: "momo", name: "Mo", followers: [], following: [] }] }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
    if (g) { localStorage.setItem("seshd_guest", "1"); }
    else { localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: "u1", email: "mo@example.com" } })); }
  }, [guest]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: "u1", email: "mo@example.com" } }) }));
  // ANSWER the boot queries rather than aborting them — an aborted signed-in boot sits on
  // "Setting up your account..." and the shell (the thing under test) never renders at all.
  await page.route("**/rest/v1/**", r => {
    const u = r.request().url();
    const body = /\/rest\/v1\/(profiles|public_profiles)\?/.test(u)
      ? JSON.stringify([{ id: "u1", username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true }])
      : "[]";
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await page.goto("http://127.0.0.1:8199/", { waitUntil: "load", timeout: 20000 });
  // With /rest/v1 aborted, a signed-in boot sits on "Setting up your account..." until
  // loadUserData's silent retry gives up. Wait for the shell rather than guessing a duration.
  await page.waitForFunction(() => !/Setting up your account/.test(document.body.innerText), null, { timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  if (offline) {
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
      window.dispatchEvent(new Event("offline"));
    });
    await page.waitForTimeout(500);
  }
  const owners = await countInsetOwners(page);
  if (process.env.DBG) console.log("  DBG body:", (await page.evaluate(()=>document.body.innerText)).slice(0,120).replace(/\n/g," | "));
  const sawOfflineBar = await page.evaluate(() => /Offline — your workout/.test(document.body.innerText));
  const sawGuestBanner = await page.evaluate(() => /Guest mode/.test(document.body.innerText));
  console.log(`${label}: owners=${owners.length} ${JSON.stringify(owners)} offlineBar=${sawOfflineBar} guestBanner=${sawGuestBanner}`);
  check(`${label}: exactly one element reserves the status bar`, owners.length === 1, JSON.stringify(owners));
  await page.screenshot({ path: `build/shot_banner_${label}.png`, clip: { x: 0, y: 0, width: 428, height: 260 } });
  await page.close();
  return { owners, sawOfflineBar, sawGuestBanner };
}

const a = await scenario("signedin-online", { guest: false, offline: false });
check("signed in and online, the top bar owns it", a.owners[0]?.text?.includes("SESHD"), JSON.stringify(a.owners));

const c = await scenario("signedin-offline", { guest: false, offline: true });
check("offline bar is shown when offline", c.sawOfflineBar);
check("...and it takes ownership from the top bar", /Offline/.test(c.owners[0]?.text || ""), JSON.stringify(c.owners));

const d = await scenario("guest-online", { guest: true, offline: false });
check("guest banner is shown in guest mode", d.sawGuestBanner);
check("...and it owns the inset while online", /Guest mode/.test(d.owners[0]?.text || ""), JSON.stringify(d.owners));

// The exact combination in Mo's screenshot.
const e = await scenario("guest-offline", { guest: true, offline: true });
check("guest + offline still shows both bars", e.sawOfflineBar && e.sawGuestBanner);
check("...and only the offline bar (the topmost) reserves the status bar",
  /Offline/.test(e.owners[0]?.text || ""), JSON.stringify(e.owners));

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
