// A PHOTO POST MUST NOT LOOK EMPTY WHILE ITS IMAGE LOADS (Muse, Nov 24: "blank posts in Explore —
// only author/time + kudos/comments/share"). Those posts were caption-less photo posts whose image
// was still in flight: a lazy <img> has no height until its bytes arrive, so the header sat right
// on the action row. PostImage reserves a tinted slot while loading and falls back to the photo
// placeholder if the load fails, instead of collapsing to nothing.
import { chromium } from "playwright-core";
const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
const PAL = "22222222-2222-4222-8222-222222222222";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const ago = h => new Date(Date.now() - h * 36e5).toISOString();
const HOLD = "https://stub.supabase.co/storage/v1/object/public/images/p/slow.jpg";
const BAD = "https://stub.supabase.co/storage/v1/object/public/images/p/missing.jpg";
const row = (id, img, h) => ({ id, user_id: PAL, type: "photo", caption: "", image_url: img, unit: "lbs", is_pr: false,
  client_id: null, created_at: ago(h), kudos: [], comments: [], workout: null });
const ROWS = [row("a1000000-0000-4000-8000-000000000000", HOLD, 1), row("b1000000-0000-4000-8000-000000000000", BAD, 2)];
// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
page.setDefaultTimeout(5000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });
await page.addInitScript(([me, pal]) => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {},
    workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [], profile: { username: "momo", name: "Mo" },
    users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [pal] }, { id: pal, username: "pally", name: "Pally", followers: [me], following: [] }] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", user: { id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, [ME, PAL]);
let release = null;
const held = new Promise(res => { release = res; });
await page.route("**/storage/v1/**", async r => {
  const u = r.request().url();
  if (u.includes("missing.jpg")) return r.fulfill({ status: 404, body: "nope" });
  if (u.includes("slow.jpg")) { await held; return r.fulfill({ status: 200, contentType: "image/png", body: PNG }); }
  return r.abort();
});
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "tok", user: { id: ME } }) }));
await page.route("**/rest/v1/**", r => {
  const u = r.request().url();
  const J = b => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
  if (r.request().method() !== "GET") return J([]);
  if (/\/posts\?/.test(u) && u.includes(PAL)) return J(ROWS);
  if (/\/posts\?/.test(u)) return J([]);
  if (/follows\?/.test(u)) return J([{ follower_id: ME, following_id: PAL, status: "accepted" }]);
  if (/public_profiles\?|\/profiles\?/.test(u)) return J([
    { id: ME, username: "momo", name: "Mo", is_public: true, seen_onboarding: true, theme: "dark", unit: "lbs" },
    { id: PAL, username: "pally", name: "Pally", is_public: true }]);
  return J([]);
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2800);
await page.getByLabel("Home").first().click().catch(() => {});
await page.waitForTimeout(2200);

const loadingSlot = await page.evaluate(() => {
  const el = document.querySelector('[data-post-image="loading"]');
  return el ? Math.round(el.getBoundingClientRect().height) : null;
});
check("1. a photo whose image has not arrived holds a visible slot (not 0px)", loadingSlot != null && loadingSlot >= 200, `slot height ${loadingSlot}`);
const failed = await page.evaluate(() => document.querySelectorAll('[data-photo-placeholder]').length);
check("2. a photo that fails to load shows the photo placeholder, not nothing", failed >= 1, `placeholders ${failed}`);
const failedLabel = await page.evaluate(() => [...document.querySelectorAll('[data-photo-placeholder]')].some(e => /couldn't load/i.test(e.getAttribute("aria-label") || "")));
check("2b. ...labelled for a screen reader", failedLabel);
release();
await page.waitForTimeout(1200);
const after = await page.evaluate(() => {
  const ok = document.querySelector('[data-post-image="ok"]');
  return { ok: !!ok, loading: document.querySelectorAll('[data-post-image="loading"]').length };
});
check("3. once the image arrives the slot becomes the image", after.ok && after.loading === 0, JSON.stringify(after));
await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
