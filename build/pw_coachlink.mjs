// pw_coachlink — the coach link is a revocable, read-only grant over one athlete's training log.
//
// The DB half (RLS, atomic claim, revocation, escalation) is proven by role-sims, which a browser
// cannot see. What THIS guards is the client half, where the failure mode is quiet: a mint that
// never reaches the server, a revoke that only updates local state, or a screen that renders an
// empty list because the query names a table that no longer exists. All three would look fine.
import { chromium } from "playwright-core";
const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
const COACH = "22222222-2222-4222-8222-222222222222";
let fails = 0, checks = 0;
const check = (label, ok, detail = "") => {
  checks++; if (!ok) fails++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
p.setDefaultTimeout(4000);

const writes = [];
let links = [];   // the stub's coach_links table, so a revoke has to actually persist to show up

await p.addInitScript(me => {
  localStorage.setItem("seshd_v1", JSON.stringify({
    currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, prs: {}, posts: [],
    profile: { username: "momo", name: "Mo" },
    users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
  }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", user: { id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
}, ME);

await p.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "tok", user: { id: ME } }) }));

await p.route("**/rest/v1/**", r => {
  const req = r.request(), u = req.url(), m = req.method();
  if (m !== "GET") writes.push({ method: m, url: u.split("/rest/v1/")[1], body: req.postData() || "" });
  let body = "[]";
  if (/\/rest\/v1\/coach_links/.test(u)) {
    if (m === "POST") {
      const row = JSON.parse(req.postData() || "{}");
      links.push({ id: "link-1", athlete_id: row.athlete_id, coach_id: null, code: row.code,
        created_at: new Date().toISOString(), redeemed_at: null, revoked_at: null });
      body = JSON.stringify([links[links.length - 1]]);
    } else if (m === "PATCH") {
      const patch = JSON.parse(req.postData() || "{}");
      links = links.map(l => ({ ...l, ...patch }));
      body = JSON.stringify(links);
    } else {
      // The real query filters revoked_at=is.null server-side; model that, or a revoke would
      // still appear on screen and the check would pass against a broken client.
      body = JSON.stringify(links.filter(l => !l.revoked_at));
    }
  } else if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u)) {
    body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]);
  }
  r.fulfill({ status: 200, contentType: "application/json", body });
});

await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2400);

// Reach it the way a finger does.
await p.locator('button[aria-label="Profile"]').first().click({ force: true }).catch(() => {});
await p.waitForTimeout(900);
await p.locator('button[aria-label="Settings"]').first().click({ force: true }).catch(() => {});
await p.waitForTimeout(900);
const row = p.getByText("Coaching", { exact: true }).locator("visible=true").first();
check("a Coaching row exists in Settings", await row.count() > 0);
if (await row.count()) { await row.click({ force: true }).catch(() => {}); await p.waitForTimeout(1100); }

const txt = () => p.evaluate(() => document.body.innerText);
let t = await txt();
// ★ TEXT IS NOT ARRIVAL, AND THIS CHECK LEARNED IT THE HARD WAY. It used to be
// `/WHO CAN SEE MY TRAINING/.test(document.body.innerText)` — reasoned, correctly, to be
// stronger than matching "Coaching" (which the Settings ROW also says). It was still wrong, and
// it stayed GREEN through a build where tapping Coaching did visibly nothing: the panel WAS in
// the DOM, so its heading WAS in innerText, but `EdgeSwipeBack`'s `willChange:transform` had
// made it the containing block for the panel's `position:fixed`, and the whole screen laid out
// at y=1469 with height 0 — far below the viewport, painting nothing. `innerText` reports DOM
// that is off-screen exactly as happily as it reports DOM that is covered.
// So arrival is a HIT TEST now: the panel must be the thing actually painted at real points on
// the screen. Five points, not one, because a partially-mispositioned panel can still cover the
// middle.
const paint = await p.evaluate(() => {
  const panel = [...document.querySelectorAll("div")]
    .find(d => { const s = getComputedStyle(d); return s.position === "fixed" && +s.zIndex >= 60 && d.offsetHeight > 200; });
  if (!panel) return { ok:false, why:"no full-height fixed panel on screen" };
  const r = panel.getBoundingClientRect();
  const pts = [[Math.round(innerWidth/2), 120], [Math.round(innerWidth/2), Math.round(innerHeight/2)],
               [Math.round(innerWidth/2), innerHeight - 120], [30, 60]];
  const miss = pts.filter(([x,y]) => { const e = document.elementFromPoint(x,y); return !(e && (e === panel || panel.contains(e))); });
  return { ok: miss.length === 0 && r.top < 4 && r.height > innerHeight * 0.8,
           why: `rect y=${Math.round(r.top)} h=${Math.round(r.height)}, ${miss.length} of ${pts.length} points not the panel` };
});
const arrived = /WHO CAN SEE MY TRAINING/i.test(t) && paint.ok;
check("the Coaching screen opened AND is painted on screen", arrived,
  paint.ok ? "heading absent — fixture broke, verdict unknown" : paint.why);

if (arrived) {
  check("it explains the scope in plain words",
    /can't see your posts, messages/i.test(t), t.slice(0, 120).replace(/\n/g, " | "));
  check("it starts by saying nobody has access",
    /Nobody can see your training log/i.test(t));

  const mint = p.getByText(/^Create a coach code$/).locator("visible=true").first();
  check("there is a way to create a code", await mint.count() > 0);
  // ★ `force: true` SKIPS SCROLLING INTO VIEW. This button sits at the bottom of a scrollable
  // column, so the forced click dispatched at a coordinate outside the viewport and whatever was
  // there received it — no error, no request, and the check read as "minting does not work".
  // Scroll first, then click normally.
  if (await mint.count()) {
    await mint.scrollIntoViewIfNeeded().catch(() => {});
    await mint.click().catch(async () => { await mint.evaluate(el => el.click()); });
    await p.waitForTimeout(1400);
  }

  // The write is the assertion. A local-only mint would render a code and persist nothing —
  // this app's dominant bug class.
  const posted = writes.find(w => w.method === "POST" && w.url.startsWith("coach_links"));
  check("minting POSTs the link to the server", !!posted, posted ? posted.url : "no POST seen");
  if (posted) {
    const sent = JSON.parse(posted.body || "{}");
    check("the client never sends coach_id or redeemed_at (only the RPC may set them)",
      sent.coach_id === undefined && sent.redeemed_at === undefined, posted.body.slice(0, 90));
    check("the code carries the COACH- prefix", /^COACH-[A-Z0-9]{8}$/.test(sent.code || ""), sent.code);
  }

  t = await txt();
  check("the new code is shown so it can be sent", /COACH-[A-Z0-9]{8}/.test(t));
  check("it is labelled as not yet used", /WAITING TO BE USED/i.test(t));

  // Revoke, through the real confirm sheet.
  const del = p.getByText(/^Delete$/).locator("visible=true").first();
  check("an unused code can be deleted", await del.count() > 0);
  if (await del.count()) {
    await del.scrollIntoViewIfNeeded().catch(() => {});
    await del.click().catch(async () => { await del.evaluate(el => el.click()); });
    await p.waitForTimeout(700);
    const confirm = p.getByText(/^Delete code$/).locator("visible=true").first();
    check("deleting asks first", await confirm.count() > 0);
    if (await confirm.count()) {
      await confirm.click().catch(async () => { await confirm.evaluate(el => el.click()); });
      await p.waitForTimeout(1400);
    }
  }
  const patched = writes.find(w => w.method === "PATCH" && w.url.startsWith("coach_links"));
  check("revoking PATCHes revoked_at to the server", !!patched && /revoked_at/.test(patched.body || ""),
    patched ? patched.body.slice(0, 70) : "no PATCH seen");
  // Both of the next two are satisfied by NOTHING HAVING HAPPENED, so they are only meaningful
  // once a code was really minted — otherwise they report success for a dead flow.
  const minted = writes.some(w => w.method === "POST" && w.url.startsWith("coach_links"));
  check("a revoked link is a PATCH, never a DELETE (the athlete keeps the record)",
    minted && !writes.some(w => w.method === "DELETE" && w.url.startsWith("coach_links")),
    minted ? "" : "nothing was minted, so this proves nothing");

  t = await txt();
  check("the deleted code leaves the screen",
    minted && !/COACH-[A-Z0-9]{8}/.test(t),
    minted ? "" : "nothing was minted, so this proves nothing");
}

await b.close();
console.log(`\n${fails ? fails + " FAILING" : "ALL PASS"} — ${checks} checks`);
process.exit(fails ? 1 : 0);
