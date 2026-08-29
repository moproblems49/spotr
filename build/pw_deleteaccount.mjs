// DELETING AN ACCOUNT MUST NOT STRAND — OR PREMATURELY DESTROY — A GROUP PHOTO.
//
// `group-images` keys objects under `{groupId}/`, so the delete-account edge function (which
// sweeps `{userId}/` prefixes) cannot reach them. The CLIENT handles those, and the ORDER is the
// whole contract, per the house rule "DESTROY THE ROW FIRST, THE OBJECT SECOND — AND ONLY IF THE
// ROW ACTUALLY DIED":
//
//   LOOK UP the paths before the row-delete loop (they live only in `group_posts.image_url`),
//   DESTROY the objects after it, and only if the `group_posts` DELETE actually succeeded.
//
// The first version shipped inverted — objects destroyed, then rows deleted — so a `group_posts`
// DELETE that 403s or times out (20s, and this flow makes 14 sequential calls) left every OTHER
// member of the group staring at a permanently broken image the poster could never repair, because
// their account was on its way out. Nothing in the battery drove account deletion at all, so the
// change shipped under a green tick that could not have gone red. This is that guard.
//
// Red-proofs against the inverted order: section 1 fails ("image destroyed anyway").
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
const GID = "33333333-3333-4333-8333-333333333333";
const GROUP_PATH = `${GID}/1700000000000-acctdel.jpg`;
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

// Drive Settings -> Delete account -> type DELETE -> Delete forever.
// `rowDeleteStatus` decides whether the group_posts DELETE succeeds, which is the whole variable
// under test. Returns what the client did, so each section asserts on real traffic.
async function runDeleteFlow(rowDeleteStatus) {
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(6000);
  const storage = [];
  const rest = [];
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(e.message));

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

  // Catch-all FIRST — Playwright gives precedence to the most recently registered matching route,
  // so a catch-all added last would swallow every specific stub below it.
  await page.route("**/rest/v1/**", r => {
    const u = r.request().url(), m = r.request().method();
    rest.push({ method: m, url: u });
    const J = b => r.fulfill({ status:200, contentType:"application/json", body: JSON.stringify(b) });
    if (m === "DELETE" && /\/rest\/v1\/group_posts/.test(u)) {
      if (rowDeleteStatus !== 200) return r.fulfill({ status: rowDeleteStatus,
        contentType:"application/json", body: JSON.stringify({ message: "denied" }) });
      return r.fulfill({ status: 204, body: "" });
    }
    if (m === "DELETE") return r.fulfill({ status: 204, body: "" });
    // The lookup the client does before the loop. Modelled with the real column name so a client
    // that stopped selecting image_url would read undefined rather than a path.
    if (/\/rest\/v1\/group_posts\?/.test(u) && m === "GET")
      return J([{ image_url: GROUP_PATH }]);
    if (/\/rest\/v1\/(public_)?profiles\?/.test(u))
      return J([{ id: ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark", seen_onboarding:true }]);
    return J([]);
  });
  await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
    body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
  await page.route("**/functions/v1/delete-account", r => r.fulfill({ status:200,
    contentType:"application/json", body: JSON.stringify({ ok:true, filesDeleted:0 }) }));
  await page.route("**/storage/v1/object/**", r => {
    storage.push({ method: r.request().method(), url: r.request().url() });
    if (r.request().method() === "GET") return r.fulfill({ status:200, contentType:"image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64") });
    r.fulfill({ status:200, contentType:"application/json", body: "{}" });
  });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.getByLabel("Profile").first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.getByLabel("Settings").first().click().catch(() => {});
  await page.waitForTimeout(1000);

  // Settings scrolls; the control is near the bottom.
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => /delete account/i.test(x.textContent || ""));
    if (!b) return false;
    b.scrollIntoView(); b.click(); return true;
  });
  await page.waitForTimeout(700);

  const typed = await page.evaluate(() => {
    const i = [...document.querySelectorAll("input")].find(x => (x.placeholder || "") === "DELETE");
    if (!i) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(i, "DELETE");
    i.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  });
  await page.waitForTimeout(400);
  const confirmed = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => /delete forever/i.test(x.textContent || ""));
    if (!b || b.disabled) return false;
    b.click(); return true;
  });
  await page.waitForTimeout(2500);

  await page.close();
  return { storage, rest, opened, typed, confirmed, pageErrors };
}

// ── 1. A FAILED group_posts DELETE MUST NOT DESTROY THE IMAGE ────────────────────────────────
{
  const r = await runDeleteFlow(403);
  // Fixture integrity first — every assertion below is meaningless if the flow never ran.
  check("1a. the delete-account modal opened", r.opened);
  check("1b. DELETE was typed into the confirm field", r.typed);
  check("1c. 'Delete forever' was enabled and clicked", r.confirmed);
  check("1d. the client looked up group image paths before deleting",
    r.rest.some(x => x.method === "GET" && /group_posts\?/.test(x.url)),
    "no group_posts GET — the lookup half is missing, so 1e proves nothing");
  check("1e. a REJECTED group_posts delete does NOT destroy the group image",
    !r.storage.some(x => x.method === "DELETE" && x.url.includes("acctdel")),
    "image was destroyed despite the row delete failing");
  check("1f. no page errors during the flow", r.pageErrors.length === 0, r.pageErrors[0]);
}

// ── 2. A SUCCESSFUL row delete DOES destroy the image ────────────────────────────────────────
// Without this the fix could be "never delete anything", which would pass section 1 and reinstate
// the storage leak the whole change exists to close.
{
  const r = await runDeleteFlow(200);
  check("2a. the flow ran to confirmation", r.opened && r.typed && r.confirmed);
  check("2b. a SUCCESSFUL group_posts delete DOES destroy the group image",
    r.storage.some(x => x.method === "DELETE" && x.url.includes("acctdel")),
    "row deleted but image left behind — the storage leak is back");
  check("2c. the image delete targets the group-images bucket, by bare path",
    r.storage.some(x => x.method === "DELETE" && /\/storage\/v1\/object\/group-images\//.test(x.url)));
  check("2d. no page errors during the flow", r.pageErrors.length === 0, r.pageErrors[0]);
}

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
