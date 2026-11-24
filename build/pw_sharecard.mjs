// "SHARE AS IMAGE" ON THE FINISH SHEET, AND THE /?p= LINK FROM THE LANDING PAGE.
//
// The image is the growth half of sharing: it ends with an App Store footer + QR, and the share
// sheet gets the App Store link as text. What this asserts is the HAND-OFF to the share sheet —
// a real PNG of the right size, plus the link — because a button that rasterises nothing, or
// shares without the link, looks perfectly fine on screen. navigator.share is stubbed to capture
// what the app actually sends.
// The second half: the /p/ landing page (api/post-landing.js) sends non-app visitors to
// `/?p=<uuid>`; the SPA must open the post from that query exactly as it does from /p/<uuid>.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
const POST = "44444444-4444-4444-8444-444444444444";
const APP_STORE = "https://apps.apple.com/us/app/seshd-gym-log-lift-tracker/id6780334417";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

let _n = 0; const uid = () => `u${++_n}`;
const S = n => Array.from({ length: n }, () => ({ id: uid(), weight: "135", reps: "8", done: true, type: "normal" }));
const SESSION = { dayName: "Pull A", unit: "lbs", startedAt: Date.now() - 18e5, exercises: [
  { id: uid(), name: "Barbell Row", reps: "5-8", sets: S(3) },
  { id: uid(), name: "T-Bar Row", reps: "8-10", sets: S(3) },
] };
const POST_ROW = { id: POST, user_id: ME, type: "workout", caption: "Leg day from a link", image_url: null,
  unit: "lbs", is_pr: false, client_id: null, created_at: new Date(Date.now() - 6e5).toISOString(),
  workout: { name: "Legs", duration: 3600, volume: 12000, exercises: [{ name: "Back Squat", sets: [{ w: 225, r: 5 }] }] },
  kudos: [], comments: [] };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
async function boot({ active, path, signedOut = false, history = [] }) {
  const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(5000);
  page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });
  await page.addInitScript(([me, sess, active, signedOut]) => {
    if (signedOut) { window.__shared = []; return; }
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
      programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [], groups: [],
      profile: { username:"momo", name:"Mo" }, users: [{ id: me, username:"momo", name:"Mo", followers:[], following:[] }] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
    if (active) { localStorage.setItem("seshd_active_session", JSON.stringify(sess)); localStorage.setItem("seshd_wstart", String(Date.now() - 18e5)); }
    // Capture exactly what the app hands the share sheet.
    window.__shared = [];
    navigator.canShare = () => true;
    navigator.share = async (d) => {
      const f = d.files && d.files[0];
      let w = 0, h = 0, size = 0, type = "";
      if (f) { size = f.size; type = f.type;
        const url = URL.createObjectURL(f); const img = new Image();
        await new Promise(r => { img.onload = r; img.onerror = r; img.src = url; }); w = img.naturalWidth; h = img.naturalHeight; }
      window.__shared.push({ text: d.text || "", title: d.title || "", name: f && f.name, size, type, w, h });
    };
  }, [ME, SESSION, active, signedOut]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json", body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
  await page.route("**/rest/v1/**", r => {
    const u = r.request().url();
    const J = b => r.fulfill({ status:200, contentType:"application/json", body: JSON.stringify(b) });
    if (r.request().method() !== "GET") return J([{}]);
    if (/\/rest\/v1\/(public_)?profiles\?/.test(u)) return J([{ id: ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark", seen_onboarding:true }]);
    if (/\/rest\/v1\/posts\?id=eq\./.test(u)) return J(u.includes(POST) ? [POST_ROW] : []);
    if (/\/rest\/v1\/workout_history\?/.test(u)) return J(u.includes("offset=") && !/offset=0(&|$)/.test(u) ? [] : history);
    return J([]);
  });
  await page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  return page;
}

// ── 1. Share as image ───────────────────────────────────────────────────────────────────────
const page = await boot({ active: true, path: "/" });
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^finish$/i.test((x.textContent||"").trim())); b && b.click(); });
await page.waitForTimeout(700);
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^finish workout$/i.test((x.textContent||"").trim())); b && b.click(); });
await page.waitForTimeout(2200);
check("[control] the finish sheet is up", await page.evaluate(() => !!document.getElementById("workout-card")));
const btn = await page.evaluate(() => { const b = document.querySelector("[data-share-image]"); return b ? (b.textContent||"").trim() : null; });
check("1a. the finish sheet offers Share as image", btn === "Share as image", String(btn));
await page.evaluate(() => document.querySelector("[data-share-image]")?.click());
await page.waitForFunction(() => window.__shared.length > 0, null, { timeout: 6000 }).catch(() => {});
const sh = await page.evaluate(() => window.__shared);
check("1b. tapping it hands exactly one share to the share sheet", sh.length === 1, JSON.stringify(sh));
const s0 = sh[0] || {};
check("1c. the shared file is a real PNG", s0.type === "image/png" && s0.size > 20000, `${s0.type} ${s0.size}B`);
check("1d. it is the 1080x1350 card", s0.w === 1080 && s0.h === 1350, `${s0.w}x${s0.h}`);
check("1e. the share carries the App Store link", (s0.text || "").includes(APP_STORE), s0.text);
await page.close();

// ── 2. /?p=<uuid> opens the post ────────────────────────────────────────────────────────────
const p2 = await boot({ active: false, path: `/?p=${POST}` });
const shown = await p2.evaluate(() => document.body.innerText.includes("Leg day from a link"));
check("2a. /?p=<uuid> opens the shared post", shown);
check("2b. the query is cleared so a refresh doesn't reopen it", await p2.evaluate(() => location.search === "" && location.pathname === "/"), await p2.evaluate(() => location.href));
await p2.close();
const p3 = await boot({ active: false, path: `/?p=not-a-uuid` });
check("2c. a malformed ?p= opens nothing", !(await p3.evaluate(() => document.body.innerText.includes("isn't available"))));
await p3.close();

// ── 3. A visitor WITHOUT an account (the landing page's whole audience) sees the post ────────
// The first cut fetched the post and rendered only the welcome screen, because the no-session
// early return never drew the post overlay. "View in browser" was a dead end for exactly the
// people the landing page exists for.
const p4 = await boot({ active: false, path: `/?p=${POST}`, signedOut: true });
check("3a. a signed-out visitor sees the shared post", await p4.evaluate(() => document.body.innerText.includes("Leg day from a link")));
const join = p4.locator("[data-post-join] button");
check("3b. it offers a way to join", (await join.count()) === 1);
if (await join.count()) {
  await join.click(); await p4.waitForTimeout(700);
  const under = await p4.evaluate(() => { const e = document.elementFromPoint(201, 437); return !e?.closest('[data-fullscreen-overlay]'); });
  check("3c. Join closes the post onto the welcome/sign-up screen", under && /Track everything|Create|Sign in/i.test(await p4.innerText("body")));
}
await p4.close();

// ── 4. The Wrapped recap leaves the app WITH the App Store footer ───────────────────────────
// The 1350-tall recap card is full, so "Share as image" now sends the 1080x1920 story frame with
// the App Store line + QR in the space under the card (the in-app story keeps the plain frame).
// RED on the old code: it shared the bare 1080x1350 card.
const lastWeek = (() => { const n = new Date(); const dow = (n.getDay() + 6) % 7;
  const d = new Date(n.getFullYear(), n.getMonth(), n.getDate() - dow - 4);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })();
const HROW = { id: "55555555-5555-4555-8555-555555555555", user_id: ME, workout_date: lastWeek, day_name: "Push A", unit: "lbs",
  created_at: new Date(lastWeek + "T18:00:00").toISOString(), duration_secs: 3000,
  exercises: [{ name: "Barbell Bench Press", sets: [{ weight: "185", reps: "8", done: true, type: "normal" }, { weight: "185", reps: "7", done: true, type: "normal" }] }] };
const p5 = await boot({ active: false, path: "/", history: [HROW] });
await p5.evaluate(() => document.querySelector('button[aria-label="Home"]')?.click());
await p5.waitForTimeout(900);
const recap = p5.getByRole("button", { name: "Share recap" });
check("[control] the weekly recap card offers Share recap", (await recap.count()) === 1);
if (await recap.count()) {
  await recap.click(); await p5.waitForTimeout(1200);
  await p5.evaluate(() => document.querySelector("[data-share-main]")?.click());
  await p5.waitForFunction(() => window.__shared.length > 0, null, { timeout: 8000 }).catch(() => {});
  const w = (await p5.evaluate(() => window.__shared))[0] || {};
  check("4a. Wrapped's Share as image sends the 1080x1920 frame (room for the footer)", w.w === 1080 && w.h === 1920, `${w.w}x${w.h}`);
  check("4b. ...as a real PNG", w.type === "image/png" && w.size > 20000, `${w.type} ${w.size}B`);
  check("4c. ...with the App Store link as text", (w.text || "").includes(APP_STORE), w.text);
}
await p5.close();

await browser.close();
console.log(fails ? `FAIL ${fails}` : "ALL PASS");
process.exit(fails ? 1 : 0);
