// DELETING A POST MUST DELETE ITS PHOTO. Nothing in the app ever issued a storage DELETE — a
// removed post's image sat in the bucket forever, public or private, unreachable through the UI
// and invisible to the user. Two surfaces:
//
//   1. Your own FEED post (PostCard "···" -> Delete) — the image is a full public-bucket URL.
//   2. A GROUP post (GroupDetail "···" -> Delete post) — the image is a bare private-bucket path.
//
// Shown red against the pre-fix code: the posts/group_posts row is deleted but no storage DELETE
// ever fires, in either case.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
const GID = "33333333-3333-4333-8333-333333333333";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

// ── 1. Feed post, public bucket ──────────────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(6000);
  const storageWrites = [];
  const restWrites = [];
  page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });

  const IMG_PATH = `${ME}/1700000000000-abcxyz.jpg`;
  const IMG_URL = `https://stub.supabase.co/storage/v1/object/public/images/${IMG_PATH}`;

  await page.addInitScript(([me, imgUrl]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
      programs: [], history: {}, workoutDates: {}, weeklyTarget: 3, prEvents: [], bodyLog: [],
      prs: {}, profile: { username:"momo", name:"Mo" },
      posts: [{ id:"p1", userId: me, type:"photo", caption:"gym day", imageData: imgUrl,
        createdAt: Date.now() - 36e5, kudos: [], comments: [], unit:"lbs" }],
      users: [{ id: me, username:"momo", name:"Mo", followers: [], following: [] }] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
  }, [ME, IMG_URL]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
    body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
  await page.route("**/storage/v1/object/**", r => {
    storageWrites.push({ method: r.request().method(), url: r.request().url() });
    r.fulfill({ status:200, contentType:"application/json", body: "{}" });
  });
  await page.route("**/rest/v1/**", r => {
    const req = r.request(), u = req.url(), m = req.method();
    if (m !== "GET") restWrites.push({ url: u, method: m });
    if (/\/rest\/v1\/(public_)?profiles\?/.test(u))
      return r.fulfill({ status:200, contentType:"application/json",
        body: JSON.stringify([{ id: ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark", seen_onboarding:true }]) });
    if (/\/rest\/v1\/posts\?/.test(u) && m === "GET")
      return r.fulfill({ status:200, contentType:"application/json",
        body: JSON.stringify([{ id:"p1", user_id: ME, type:"photo", caption:"gym day", image_url: IMG_URL,
          created_at: new Date(Date.now() - 36e5).toISOString(), unit:"lbs", kudos:[], comments:[] }]) });
    r.fulfill({ status:200, contentType:"application/json", body:"[]" });
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.getByLabel("Home").first().click().catch(() => {});
  await page.waitForTimeout(1200);

  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => (x.textContent||"").trim() === "⋯"); b && b.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^delete$/i.test((x.textContent||"").trim())); b && b.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^delete$/i.test((x.textContent||"").trim())); b && b.click(); });
  await page.waitForTimeout(1200);

  const postDelete = restWrites.find(w => w.method === "DELETE" && /\/rest\/v1\/posts\?/.test(w.url));
  check("1. the post row is deleted", !!postDelete, JSON.stringify(restWrites.map(w => w.url)));

  const imgDelete = storageWrites.find(w => w.method === "DELETE" && w.url.includes(IMG_PATH));
  check("2. its storage object is deleted too", !!imgDelete, JSON.stringify(storageWrites));
  check("3. the delete targets the PUBLIC images bucket, not group-images",
    !!imgDelete && imgDelete.url.includes("/object/images/"), imgDelete && imgDelete.url);

  await page.close();
}

// ── 2. Group post, private bucket ────────────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(6000);
  const storageWrites = [];
  page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });

  const GROUP_PATH = `${GID}/1700000000000-defuvw.jpg`;

  await page.addInitScript(([me, gid]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
      programs: [], history: {}, workoutDates: {}, weeklyTarget: 3, prEvents: [], bodyLog: [], prs: {},
      posts: [], profile: { username:"momo", name:"Mo" },
      groups: [{ id: gid, name: "Seshd Crew", members: [me] }],
      users: [{ id: me, username:"momo", name:"Mo", followers: [], following: [] }] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
  }, [ME, GID]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
    body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
  await page.route("**/storage/v1/object/**", r => {
    storageWrites.push({ method: r.request().method(), url: r.request().url() });
    if (r.request().method() === "GET") return r.fulfill({ status:200, contentType:"image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64") });
    r.fulfill({ status:200, contentType:"application/json", body: "{}" });
  });
  await page.route("**/rest/v1/**", r => {
    const u = r.request().url(), m = r.request().method();
    if (/\/rest\/v1\/groups\?/.test(u))
      return r.fulfill({ status:200, contentType:"application/json",
        body: JSON.stringify([{ id: GID, name: "Seshd Crew", description:"", icon:"🏋️", created_by: ME, member_ids:[ME] }]) });
    if (/\/rest\/v1\/(public_)?profiles\?/.test(u))
      return r.fulfill({ status:200, contentType:"application/json",
        body: JSON.stringify([{ id: ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark", seen_onboarding:true }]) });
    if (/\/rest\/v1\/group_posts\?/.test(u) && m === "GET")
      return r.fulfill({ status:200, contentType:"application/json",
        body: JSON.stringify([{ id:"gp1", group_id: GID, user_id: ME, type:"photo", caption:"crew day",
          image_url: GROUP_PATH, created_at: new Date(Date.now() - 36e5).toISOString(), reactions:{} }]) });
    if (m === "DELETE") return r.fulfill({ status:200, contentType:"application/json", body:"[]" });
    r.fulfill({ status:200, contentType:"application/json", body:"[]" });
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // Reach the group: Discover -> Groups -> the seeded group.
  await page.getByLabel("Discover").first().click().catch(() => {});
  await page.waitForTimeout(1000);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button, div")].find(x => /groups/i.test((x.textContent||"").trim()) && (x.textContent||"").trim().length < 12); b && b.click(); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button, div")].find(x => (x.textContent||"").trim() === "Seshd Crew"); b && b.click(); });
  await page.waitForTimeout(1200);

  const opened = await page.evaluate(() => /crew day/i.test(document.body.innerText));
  check("4. the group post is on screen", opened, (await page.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\n/g, " | "));

  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => (x.textContent||"").trim() === "⋯" || (x.textContent||"").trim() === "···"); b && b.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /delete post/i.test((x.textContent||"").trim())); b && b.click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /tap again to confirm/i.test((x.textContent||"").trim())); b && b.click(); });
  await page.waitForTimeout(1200);

  const imgDelete = storageWrites.find(w => w.method === "DELETE" && w.url.includes(GROUP_PATH));
  check("5. its storage object is deleted from the PRIVATE group-images bucket",
    !!imgDelete && imgDelete.url.includes("/object/group-images/"), JSON.stringify(storageWrites.map(w => w.method + " " + w.url)));

  await page.close();
}

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
