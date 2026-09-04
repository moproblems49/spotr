// A PHOTO ATTACHED TO A WORKOUT MUST REACH THE SAME POST AS THE WORKOUT, AND A PRIVATE SHARE MUST
// STAY PRIVATE.
//
// The finish sheet can attach one optional photo (the pump pic). Three things have to hold:
//
//   1. It rides on the SAME row as the workout card — one post, image above the numbers, not a
//      separate photo post. PostCard's image block used to be gated on `type === "photo"`, so a
//      workout post could carry an image_url and render nothing at all.
//   2. Both render together. No carousel, no swipe: the card is the point of the post and must not
//      be hidden behind a gesture.
//   3. A GROUPS-ONLY share must never touch the public `images` bucket. Group photos belong in the
//      membership-gated `group-images` bucket. handleNewPost uploaded to the public bucket
//      unconditionally — harmless while nothing could send a photo and groupIds together, and a
//      real leak the moment the finish sheet could.
//
// Shown red against the pre-change code: §2 fails (no <img> on the card) and §4 fails (the public
// bucket receives the photo on a groups-only share).
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
const GID = "33333333-3333-4333-8333-333333333333";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

// A tiny real PNG, so the FileReader/compressImage path runs on actual image bytes.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII=",
  "base64");

const sess = {
  dayName: "Push A", startedAt: Date.now() - 1800000, unit: "lbs",
  exercises: [{ id: "e0", name: "Barbell Bench Press",
    sets: [{ id: "s0", weight: "225", reps: "5", done: true, type: "normal" },
           { id: "s1", weight: "225", reps: "5", done: true, type: "normal" }] }],
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

// `groupsOnly` picks which finish button is pressed.
async function run(groupsOnly) {
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(6000);
  const uploads = [];   // every storage object write, by bucket
  const rows = [];      // every REST write
  page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });

  await page.addInitScript(([me, s, gid]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
      programs: [], history: {}, workoutDates: {}, weeklyTarget: 3, prEvents: [], bodyLog: [],
      prs: {}, posts: [], profile: { username:"momo", name:"Mo" },
      groups: [{ id: gid, name: "Seshd Crew", members: [me] }],
      users: [{ id: me, username:"momo", name:"Mo", followers: [], following: [] }] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", refresh_token:"r", user:{ id: me } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
    localStorage.setItem("seshd_active_session", JSON.stringify(s));
    localStorage.setItem("seshd_wstart", String(Date.now() - 1800000));
  }, [ME, sess, GID]);

  await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
    body: JSON.stringify({ access_token:"t", refresh_token:"r", user:{ id: ME } }) }));
  await page.route("**/storage/v1/object/**", r => {
    const u = r.request().url(), m = r.request().method();
    const bucket = (u.match(/\/storage\/v1\/object\/(?:sign\/)?([a-z-]+)\//) || [])[1] || "?";
    // Only WRITES are uploads. A GET on /object/public/... is the feed rendering the image back,
    // and counting it as an upload would make the private-bucket assertions meaningless.
    if (m !== "GET") uploads.push({ bucket, method: m, url: u });
    // Serve real PNG bytes on reads so the <img> actually lays out — an <img> pointed at a JSON
    // body has zero height, and a zero-height image is indistinguishable from no image at all.
    if (m === "GET") return r.fulfill({ status:200, contentType:"image/png", body: PNG });
    r.fulfill({ status:200, contentType:"application/json", body: JSON.stringify({ Key: "ok" }) });
  });
  await page.route("**/rest/v1/**", r => {
    const req = r.request(), u = req.url(), m = req.method();
    let body = null; try { body = JSON.parse(req.postData() || "null"); } catch {}
    const one = Array.isArray(body) ? body[0] : body;
    const table = (u.match(/\/rest\/v1\/([a-z_]+)/) || [])[1] || "?";
    if (m !== "GET") rows.push({ table, method: m, body: one });
    if (m === "POST" && /\/rest\/v1\/(posts|group_posts|workout_history)/.test(u))
      return r.fulfill({ status:200, contentType:"application/json",
        body: JSON.stringify([{ ...(one || {}), id: "00000000-0000-4000-8000-00000000000" + rows.length,
          created_at: new Date().toISOString() }]) });
    // loadUserData REPLACES store.groups with the server's rows, so a group seeded only into
    // localStorage is erased before the finish sheet renders — the group list and the groups-only
    // button then simply do not exist, and the whole private-share leg silently tests nothing.
    if (/\/rest\/v1\/groups\?/.test(u))
      return r.fulfill({ status:200, contentType:"application/json",
        body: JSON.stringify([{ id: GID, name: "Seshd Crew", description: "", icon: "🏋️",
          created_by: ME, member_ids: [ME] }]) });
    if (/\/rest\/v1\/(public_)?profiles\?/.test(u))
      return r.fulfill({ status:200, contentType:"application/json",
        body: JSON.stringify([{ id: ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark", seen_onboarding:true }]) });
    r.fulfill({ status:200, contentType:"application/json", body:"[]" });
  });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3200);
  await page.getByLabel("Workout").first().click().catch(() => {});
  await page.waitForTimeout(1400);

  // Finish -> the summary sheet.
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^finish$/i.test((x.textContent||"").trim())); b && b.click(); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^finish workout$/i.test((x.textContent||"").trim())); b && b.click(); });
  await page.waitForTimeout(2800);

  const summary = await page.evaluate(() => document.body.innerText);
  check(`[${groupsOnly ? "groups-only" : "feed"}] 0. the finish sheet offers a photo`,
    /add a photo/i.test(summary), summary.slice(0, 160).replace(/\n/g, " | "));

  // Attach the photo through the real file input. Guarded so a build with NO picker (the code this
  // replaced) reports a clean red across every downstream check instead of dying on a stack trace
  // at check 0 and hiding the other ten.
  try {
    await page.locator('input[type="file"]').last()
      .setInputFiles({ name: "pump.png", mimeType: "image/png", buffer: PNG }, { timeout: 4000 });
  } catch { console.log("   (no file input on the finish sheet — continuing so the rest still reports)"); }
  await page.waitForTimeout(1200);
  // "any data:image on the page" is NOT a preview — the app already renders data-URI avatars and
  // muscle icons, and that loose form passed against a build with no picker at all. Require a
  // data-URI image laid out at preview size.
  const previewed = await page.evaluate(() => {
    return [...document.querySelectorAll("img")].some(i => {
      if (!(i.src || "").startsWith("data:image")) return false;
      const r = i.getBoundingClientRect();
      return r.width > 150 && r.height > 60;
    });
  });
  check(`[${groupsOnly ? "groups-only" : "feed"}] 1. the picked photo previews on the sheet`, previewed);

  if (groupsOnly) {
    // Select the group, then use the groups-only button.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button, div")].find(x => (x.textContent||"").trim() === "Seshd Crew");
      b && b.click();
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      // MATCH THE HOOK, NOT THE LABEL. The two share buttons became a side-by-side pair, and
      // their text now depends on whether the user is in a group ("Feed" vs "Share to Feed") —
      // so the old /share to feed/ selector silently stopped matching and this suite blamed the
      // app. `data-share-target` is the contract; restyle around it.
      const b = document.querySelector('[data-share-target="groups"]');
      b && b.click();
    });
  } else {
    await page.evaluate(() => {
      const b = document.querySelector('[data-share-target="feed"]');
      b && b.click();
    });
  }
  await page.waitForTimeout(3000);

  // Land on the feed so §5 can read the rendered card rather than raw HTML.
  await page.getByLabel("Home").first().click().catch(() => {});
  await page.waitForTimeout(1800);
  const rendered = await page.evaluate(() => {
    // The workout card is identified by its own VOL stat label; walk up to the nearest ancestor
    // that ALSO contains an <img>, and require that ancestor to be a single post, not the whole
    // feed — so "an image somewhere on the page" cannot pass for "an image on this post".
    const volLabel = [...document.querySelectorAll("div")].find(d => (d.textContent || "").trim() === "VOL");
    if (!volLabel) return { card: false };
    let n = volLabel;
    for (let i = 0; i < 12 && n; i++) {
      const imgs = [...n.querySelectorAll("img")].filter(im => {
        const r = im.getBoundingClientRect();
        return r.width > 40 && r.height > 40;      // excludes the avatar
      });
      if (imgs.length) {
        const r = imgs[0].getBoundingClientRect();
        const v = volLabel.getBoundingClientRect();
        return { card: true, imgAboveCard: r.top < v.top, imgH: Math.round(r.height) };
      }
      n = n.parentElement;
    }
    return { card: true, imgAboveCard: false, imgH: 0 };
  });
  await page.close();
  return { uploads, rows, rendered };
}

// ── FEED SHARE ───────────────────────────────────────────────────────────────────────────────
{
  const { uploads, rows, rendered } = await run(false);
  // NOTE: rows entries are {table, method, body} wrappers — read `.body`, not the wrapper.
  const post = (rows.find(r => r.table === "posts" && r.method === "POST") || {}).body;
  console.log(`   uploads: ${JSON.stringify(uploads.map(u => u.bucket))}`);
  check("2. the photo uploaded to the public images bucket", uploads.some(u => u.bucket === "images"),
    JSON.stringify(uploads.map(u => u.bucket)));
  check("3. ONE post row was written, carrying BOTH the image and the workout",
    !!post && !!post.image_url && !!post.workout && post.type === "workout",
    JSON.stringify(post && { type: post.type, image_url: !!post.image_url, workout: !!post.workout }));
  check("4. no second, photo-only post was created",
    rows.filter(r => r.table === "posts" && r.method === "POST").length === 1,
    `posts written: ${rows.filter(r => r.table === "posts" && r.method === "POST").length}`);
  // Both on screen at once, in one post — the whole design decision. No carousel, no gesture:
  // the photo sits directly ABOVE the card, which is what makes the numbers unmissable.
  console.log(`   rendered: ${JSON.stringify(rendered)}`);
  check("5. the feed post renders the photo and the workout card together",
    rendered.card && rendered.imgH > 40, JSON.stringify(rendered));
  check("6. the photo is ABOVE the workout card, not below or behind it",
    rendered.imgAboveCard === true, JSON.stringify(rendered));
}

// ── GROUPS-ONLY SHARE ────────────────────────────────────────────────────────────────────────
{
  const { uploads, rows } = await run(true);
  const gp = (rows.find(r => r.table === "group_posts" && r.method === "POST") || {}).body;
  console.log(`   uploads: ${JSON.stringify(uploads.map(u => u.bucket))}`);
  check("7. a groups-only share writes a group post carrying the image and the workout",
    !!gp && !!gp.image_url && !!gp.workout, JSON.stringify(gp && { image_url: gp.image_url, workout: !!gp.workout }));
  check("8. it uploaded to the PRIVATE group-images bucket", uploads.some(u => u.bucket === "group-images"),
    JSON.stringify(uploads.map(u => u.bucket)));
  check("9. and NEVER to the public images bucket", !uploads.some(u => u.bucket === "images"),
    JSON.stringify(uploads.map(u => u.bucket)));
  check("10. the stored value is a private PATH, not a public URL",
    !!gp && typeof gp.image_url === "string" && !/^https?:/.test(gp.image_url) && gp.image_url.startsWith(GID + "/"),
    JSON.stringify(gp && gp.image_url));
  check("11. no feed post was created by a groups-only share",
    !rows.some(r => r.table === "posts" && r.method === "POST"),
    JSON.stringify(rows.filter(r => r.table === "posts").map(r => r.method)));
}

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
