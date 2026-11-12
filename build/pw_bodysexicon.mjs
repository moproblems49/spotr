// THE MUSCLE MAP'S BODY SWITCH IS ♂ / ♀ ICONS, NOT WORDS (Mo, Nov 12: "Let's just go with B").
// Asserts the switch is two icon buttons with the WORD kept as the accessible name, that the icons
// are drawn (an SVG, never the U+2642/U+2640 text glyphs, which iOS can render as colour emoji),
// that both states clear the 3:1 graphical floor on both themes, and that tapping ♀ really switches
// the map AND writes body_type to the server (a local-only setStore is this app's dominant bug class).
import { chromium } from "playwright-core";
const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
const SHOT = process.env.SHOT || "";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const lum = h => { const c = h.match(/\d+(\.\d+)?/g).slice(0,3).map(v => { v = +v / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const browser = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
for (const theme of ["dark", "light"]) {
  const page = await browser.newPage({ viewport:{ width:402, height:874 }, deviceScaleFactor: SHOT ? 3 : 1, hasTouch:true, isMobile:true });
  page.setDefaultTimeout(5000);
  page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0,160)); });
  const patches = [];
  await page.addInitScript(([me, theme]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme, unit:"lbs", bodyType:"male",
      programs:[], history:{}, workoutDates:{}, weeklyTarget:3, bodyLog:[], prs:{}, prEvents:[], posts:[],
      profile:{ username:"momo", name:"Mo" }, users:[{ id: me, username:"momo", name:"Mo", followers:[], following:[] }] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
    localStorage.setItem("seshd_onboarded", "1"); localStorage.setItem("seshd_custom_merge_v1", "1");
  }, [ME, theme]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json", body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
  await page.route("**/rest/v1/**", r => {
    const q = r.request();
    if (q.method() === "PATCH") { try { patches.push(JSON.parse(q.postData() || "{}")); } catch (e) {} return r.fulfill({ status:200, contentType:"application/json", body:"[]" }); }
    return r.abort();
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil:"domcontentloaded" });
  await page.waitForTimeout(2800);
  await page.locator('button[aria-label="Profile"]').first().click();
  await page.waitForTimeout(1200);
  const sw = page.locator("[data-body-sex]");
  await sw.first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);
  const info = await page.evaluate(() => [...document.querySelectorAll("[data-body-sex]")].map(b => ({
    val: b.dataset.bodySex, label: b.getAttribute("aria-label"), pressed: b.getAttribute("aria-pressed"),
    text: (b.textContent || "").trim(), svg: !!b.querySelector("svg"),
    ink: getComputedStyle(b).color, fill: getComputedStyle(b).backgroundColor,
    track: getComputedStyle(b.parentElement).backgroundColor })));
  check(`[${theme}] the switch renders as two buttons`, info.length === 2, JSON.stringify(info));
  if (info.length !== 2) { await page.close(); continue; }
  check(`[${theme}] no words on the switch, and no ♂/♀ text glyphs (iOS can draw them as emoji)`,
    info.every(i => i.text === "" && i.svg), JSON.stringify(info.map(i => i.text)));
  check(`[${theme}] each icon keeps its word as the accessible name`,
    info[0].label === "Male body map" && info[1].label === "Female body map", JSON.stringify(info.map(i => i.label)));
  check(`[${theme}] the seeded male body is the pressed one`, info[0].pressed === "true" && info[1].pressed === "false", JSON.stringify(info.map(i => i.pressed)));
  const on = ratio(info[0].ink, info[0].fill), off = ratio(info[1].ink, info[1].track);
  check(`[${theme}] both icons clear the 3:1 graphical floor (selected ${on.toFixed(2)}, unselected ${off.toFixed(2)})`, on >= 3 && off >= 3);
  if (SHOT) {
    const card = page.locator("[data-body-sex]").first().locator("xpath=ancestor::div[contains(@style,'border-radius: 18px')][1]");
    await card.screenshot({ path: `${SHOT}-${theme}.png` }).catch(e => console.log("shot failed", e.message));
  }
  await sw.nth(1).click();
  await page.waitForTimeout(600);
  const pressed = await page.evaluate(() => [...document.querySelectorAll("[data-body-sex]")].map(b => b.getAttribute("aria-pressed")));
  check(`[${theme}] tapping ♀ selects it`, pressed[0] === "false" && pressed[1] === "true", JSON.stringify(pressed));
  check(`[${theme}] ...and writes body_type to the server`, patches.some(p => p.body_type === "female"), JSON.stringify(patches));
  await page.close();
}
await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
