// AN IMPORTED PROGRAM MUST REACH THE SERVER, NOT JUST THE SCREEN.
//
// "Have a code? Import a program" POSTed `{ id: uid(), name, days }` to `programs`. Two hard
// failures in one request, verified against the live schema:
//
//   programs.id      uuid, NOT NULL   <- uid() is 8-char base36 -> 22P02
//   programs.user_id uuid, NOT NULL   <- was never sent at all
//
// The only handler was `.catch(devError)` (dev-only logging), and the success toast fired
// unconditionally before it. So the app said "Program imported", showed the program, and the next
// loadUserData — which overwrites `programs` and `activeProgramId` wholesale from the server —
// erased it. Exactly the shape of the onboarding starter-program bug: a local-only write standing
// in front of a hard overwrite.
//
// This asserts the POST is well-formed (no client id, real user_id), that the local store adopts
// the SERVER's uuid, that active_program_id is patched to it, and that the program survives a
// reload. Goes red on the previous commit.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
const SERVER_PROG_ID = "55555555-5555-4555-8555-555555555555";
const CODE = "IGNITE-TEST01";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const isUuid = v => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(6000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });

const server = { programs: [], activeProgramId: null, posts: [], rejected: [] };

await page.addInitScript(me => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
    programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
    profile: { username:"momo", name:"Mo" }, users: [{ id: me, username:"momo", name:"Mo", followers:[], following:[] }] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, ME);
await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
  body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
await page.route("**/rest/v1/**", r => {
  const req = r.request(), u = req.url(), m = req.method();
  const J = (b, s = 200) => r.fulfill({ status:s, contentType:"application/json", body: JSON.stringify(b) });
  let body = null; try { body = JSON.parse(req.postData() || "null"); } catch {}

  // The share-code lookup is an RPC.
  if (/\/rest\/v1\/rpc\/redeem_program_by_code/.test(u)) {
    return J([{ kind:"program", name:"Imported PPL", days:[
      { name:"Push", exercises:[{ name:"Barbell Bench Press", reps:"4×8" }] },
      { name:"Pull", exercises:[{ name:"Barbell Row", reps:"4×8" }] },
    ] }]);
  }
  if (/\/rest\/v1\/programs/.test(u)) {
    if (m === "POST") {
      const p = Array.isArray(body) ? body[0] : body;
      server.posts.push(p);
      // MODEL THE REAL SCHEMA. Rejecting exactly what Postgres rejects is what makes this test
      // able to fail — a stub that accepts anything would have passed against the broken code.
      if (p && "id" in p && !isUuid(p.id)) { server.rejected.push({ why:"22P02 invalid uuid", got:p.id }); return J({ code:"22P02", message:"invalid input syntax for type uuid" }, 400); }
      if (!p || !p.user_id) { server.rejected.push({ why:"user_id NOT NULL", got:p }); return J({ code:"23502", message:"null value in column user_id" }, 400); }
      const row = { id: SERVER_PROG_ID, user_id: p.user_id, name: p.name, days: p.days };
      server.programs.push(row);
      return J([row]);
    }
    return J(server.programs);
  }
  if (/\/rest\/v1\/profiles/.test(u)) {
    if (m === "PATCH") {
      const p = Array.isArray(body) ? body[0] : body;
      if (p && "active_program_id" in p) server.activeProgramId = p.active_program_id;
      return J([{ id: ME }]);
    }
    return J([{ id: ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark",
      seen_onboarding:true, active_program_id: server.activeProgramId }]);
  }
  if (/\/rest\/v1\/public_profiles/.test(u)) return J([{ id: ME, username:"momo", name:"Mo", is_public:true }]);
  return J([]);
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2600);

// Reach the import box: Workout tab -> Browse templates -> "Have a code?"
await page.getByLabel("Workout").first().click().catch(() => {});
await page.waitForTimeout(900);
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /browse templates/i.test((x.textContent||"").trim())); b && b.click(); });
await page.waitForTimeout(700);
const openedBox = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /have a code/i.test((x.textContent||"").trim())); if (b) { b.click(); return true; } return false; });
await page.waitForTimeout(600);
check("the import-code box opens", openedBox, (await page.evaluate(() => document.body.innerText)).slice(0,120).replace(/\n/g," | "));

const typed = await page.evaluate(code => {
  const i = [...document.querySelectorAll("input")].find(x => x.offsetParent !== null);
  if (!i) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(i, code);
  i.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}, CODE);
check("the code field accepts input", typed);
await page.waitForTimeout(300);
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^(look ?up|find|check|import|continue)$/i.test((x.textContent||"").trim())); b && b.click(); });
await page.waitForTimeout(1200);
const previewTxt = await page.evaluate(() => document.body.innerText);
check("the shared program preview appears", /Imported PPL/i.test(previewTxt), previewTxt.slice(0,140).replace(/\n/g," | "));

// The button reads "Import & make active" — an anchored allow-list of short labels missed it
// entirely and the first run reported 0 POSTs, which looks identical to the bug under test.
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^import\b/i.test((x.textContent||"").trim())); b && b.click(); });
await page.waitForTimeout(2200);

console.log(`  POSTs to /programs: ${server.posts.length}, server-side rejections: ${server.rejected.length}`);
if (server.rejected.length) console.log(`  rejected: ${JSON.stringify(server.rejected).slice(0,200)}`);
check("the program POST was accepted by the schema", server.rejected.length === 0 && server.programs.length > 0,
  JSON.stringify(server.rejected).slice(0, 200));
check("the POST does not send a client-minted id", server.posts.length > 0 && !("id" in (server.posts[0] || {})),
  JSON.stringify(server.posts[0] || {}).slice(0, 160));
check("the POST sends user_id", !!(server.posts[0]?.user_id), JSON.stringify(server.posts[0] || {}).slice(0, 160));
check("profiles.active_program_id was patched to the server id", server.activeProgramId === SERVER_PROG_ID,
  `activeProgramId=${server.activeProgramId}`);

const local = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("seshd_v1") || "{}");
  return { ids: (s.programs || []).map(p => p.id), active: s.activeProgramId };
});
console.log(`  local program ids: ${JSON.stringify(local.ids)}, active=${local.active}`);
check("the local store adopted the server's uuid", local.ids.includes(SERVER_PROG_ID), JSON.stringify(local));

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
const after = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("seshd_v1") || "{}");
  return { n: (s.programs || []).length, active: s.activeProgramId };
});
console.log(`  after reload: ${after.n} program(s), active=${after.active}`);
check("the imported program SURVIVES a reload", after.n > 0, JSON.stringify(after));
check("it is still active after a reload", after.active === SERVER_PROG_ID, JSON.stringify(after));

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
