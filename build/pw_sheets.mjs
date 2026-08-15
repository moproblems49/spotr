// EVERY SHEET MUST OPEN, TRAVEL, AND CLOSE.
//
// The app had 19 bottom sheets: two animated in, none animated out. Adding motion is only safe if
// the sheet still DISMISSES — a sheet you cannot close is far worse than one that pops. So each
// case here opens the sheet, samples it mid-exit to prove it travels rather than blinks, and then
// asserts it is genuinely gone.
import { chromium } from "playwright-core";
const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 140)); });
await page.addInitScript(me => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
    programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
    profile: { username:"momo", name:"Mo" }, users: [{ id: me, username:"momo", name:"Mo", followers: [], following: [] }] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, ME);
await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
  body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
await page.route("**/rest/v1/**", r => r.abort());
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil:"domcontentloaded" });
await page.waitForTimeout(2200);

// The panel of the topmost sheet: a fixed backdrop's transformed child.
const panel = () => page.evaluate(() => {
  const backs = [...document.querySelectorAll("div")].filter(d => {
    const c = getComputedStyle(d);
    return c.position === "fixed" && d.getBoundingClientRect().height > 600 && parseInt(c.zIndex||"0",10) >= 200;
  });
  for (const b of backs.reverse()) {
    const p = [...b.children].find(c => /matrix|translate/.test(getComputedStyle(c).transform));
    if (p) { const m = /matrix\(1, 0, 0, 1, [-\d.]+, ([-\d.]+)\)/.exec(getComputedStyle(p).transform);
      return { y: m ? Math.round(parseFloat(m[1])) : 0, h: Math.round(p.getBoundingClientRect().height) }; }
  }
  return null;
});

async function sheetCase(name, open, close, marker) {
  await open();
  await page.waitForTimeout(700);
  const seen = await page.evaluate(m => new RegExp(m, "i").test(document.body.innerText), marker);
  check(`${name}: opens`, seen);
  if (!seen) return;
  const rest = await panel();
  check(`${name}: sits at rest while open`, rest && Math.abs(rest.y) < 4, JSON.stringify(rest));
  await close();
  await page.waitForTimeout(80);
  const mid = await panel();
  check(`${name}: travels out (still mounted, moving)`, mid && mid.y > 8, JSON.stringify(mid));
  await page.waitForTimeout(600);
  const gone = await page.evaluate(m => !new RegExp(m, "i").test(document.body.innerText), marker);
  check(`${name}: actually closes`, gone);
}

await page.getByLabel("Profile").first().click().catch(() => {});
await page.waitForTimeout(1200);

await sheetCase("Settings",
  () => page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>/settings/i.test(x.getAttribute("aria-label")||"")); b && b.click(); }),
  () => page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>(x.textContent||"").trim()==="Done"); b && b.click(); }),
  "Appearance|Account|Units");

// Templates lives on the Workout tab; create-group on Discover. Both are boolean-gated sheets
// migrated to <Sheet>, so both must travel out and then genuinely disappear.
await page.getByLabel("Home").first().click().catch(() => {});
await page.waitForTimeout(600);
await page.getByLabel("Discover").first().click().catch(() => {});
await page.waitForTimeout(900);
// STEP INTO GroupsScreen FIRST. The create-group sheet lives there, not on Discover, and the
// entry point's button has NO clean label — its textContent is the card's two lines run together,
// "GroupsPrivate crews". An earlier draft matched /^groups$/ and /new group/ against the Discover
// screen, clicked nothing, and reported "Create group: opens" as a FAIL — the locator was the bug,
// not the sheet. Match the card by prefix, then look for the create control inside.
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>/^groups/i.test((x.textContent||"").trim())); b && b.click(); });
await page.waitForTimeout(1000);
await sheetCase("Create group",
  () => page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>/new group|\+ *group|create group|^\+$/i.test((x.textContent||"").trim())); b && b.click(); }),
  () => page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>/^cancel$/i.test((x.textContent||"").trim())); b && b.click(); }),
  "New Group");

// Templates: the Workout tab's entry point is "Browse templates" (only shown while the user has no
// program — this fixture deliberately seeds `programs: []` so it is reachable). The sheet's own
// header says "Starter Templates", and it closes on its "Cancel" text button.
await page.getByLabel("Workout").first().click().catch(() => {});
await page.waitForTimeout(1000);
console.log("  [diag] on Workout tab:", await page.evaluate(()=>({
  browse: [...document.querySelectorAll("button")].some(x=>/browse templates/i.test((x.textContent||"").trim())),
  txt: document.body.innerText.slice(0,140).replace(/\n/g," | ") })));
await sheetCase("Templates",
  () => page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>/browse templates/i.test((x.textContent||"").trim())); b && b.click(); }),
  () => page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>/^cancel$/i.test((x.textContent||"").trim())); b && b.click(); }),
  "Starter Templates");

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
