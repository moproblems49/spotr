// THE SAME SESSION MUST CARRY THE SAME DATE EVERYWHERE ON THE SCREEN.
//
// Mo, from his phone: the date under RECENT and the date on the progress chart disagreed by a day
// for the same workout. Reproduced exactly — a Monday 2026-08-10 session showed as:
//
//   RECENT list        Aug 9      <- wrong
//   chart axis         8/9        <- wrong
//   chart tooltip      Mon, Aug 10  <- right
//
// A bare "2026-08-10" is parsed by the spec as midnight UTC, and getDate()/toLocaleDateString()
// read back LOCAL. West of Greenwich that is the previous evening, so the day reads one earlier.
// The tooltip was the only one already anchoring at local noon, which is why it alone was right.
//
// This runs in America/New_York on purpose: in UTC and every zone east of it the bug is invisible,
// which is how it shipped. It fails on the previous commit with "Aug 9" / "8/9".
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
const EX = "Preacher Curl Machine";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

// Fixed dates, not relative ones: the whole point is the exact calendar day, and a fixture built
// from Date.now() would drift across the boundary this test exists to police.
const sets = p => p.map(([w, r], i) => ({ id: `s${i}`, weight: String(w), reps: String(r), done: true, type: "normal" }));
const HISTORY = {
  "2026-08-10": { h3: { id: "h3", dayName: "Pull B", unit: "lbs", durationSecs: 3600,
    exercises: [{ id: "e1", name: EX, sets: sets([[60, 12], [60, 10], [60, 9]]) }] } },
  "2026-07-31": { h2: { id: "h2", dayName: "Pull B", unit: "lbs", durationSecs: 3600,
    exercises: [{ id: "e1", name: EX, sets: sets([[60, 11], [60, 9], [60, 8]]) }] } },
  "2026-07-13": { h1: { id: "h1", dayName: "Pull A", unit: "lbs", durationSecs: 3600,
    exercises: [{ id: "e1", name: EX, sets: sets([[55, 10], [55, 9]]) }] } },
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2,
  hasTouch: true, isMobile: true, timezoneId: "America/New_York" });
page.setDefaultTimeout(4000);
await page.addInitScript(([me, hist]) => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: "dark", unit: "lbs",
    programs: [], history: hist, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
    profile: { username: "momo", name: "Mo" }, users: [] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, [ME, HISTORY]);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "t", user: { id: ME } }) }));
await page.route("**/rest/v1/**", r => r.abort());
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);

// The exercise library lives on the Exercises sub-tab; tapping a row opens its detail screen.
// Click the row's clickable ANCESTOR, not the text node — the first draft clicked the bare text,
// reported "opened=true" and stayed on the tab it started on, then measured that screen instead.
{
  const b = page.getByRole("button", { name: /^Exercises$/ }).first();
  if (await b.count()) { await b.click().catch(() => {}); await page.waitForTimeout(900); }
}
const search = page.locator('input[placeholder*="Search" i]').first();
if (await search.count()) { await search.fill(EX.slice(0, 12)); await page.waitForTimeout(700); }
const opened = await page.evaluate(name => {
  const leaf = [...document.querySelectorAll("*")].find(e => !e.children.length && (e.textContent || "").trim() === name);
  if (!leaf) return "no row";
  let n = leaf;
  while (n && n !== document.body) {
    const c = getComputedStyle(n);
    if (n.tagName === "BUTTON" || c.cursor === "pointer") { n.click(); return "clicked " + n.tagName; }
    n = n.parentElement;
  }
  leaf.click(); return "clicked leaf";
}, EX);
await page.waitForTimeout(1400);

const body = await page.evaluate(() => document.body.innerText);
check("the exercise detail screen opened", /RECENT/i.test(body) && /Progress/i.test(body),
  `opened=${opened} ${body.slice(0, 110).replace(/\n/g, " | ")}`);

// RECENT rows and the chart's own axis labels.
const seen = await page.evaluate(() => {
  const txt = document.body.innerText;
  return {
    recent: [...txt.matchAll(/\b(Aug|Jul)\s+(\d{1,2})\b/g)].map(m => `${m[1]} ${m[2]}`),
    axis: [...txt.matchAll(/\b(\d{1,2})\/(\d{1,2})\b/g)].map(m => `${m[1]}/${m[2]}`),
  };
});
console.log("  RECENT:", JSON.stringify(seen.recent), " AXIS:", JSON.stringify(seen.axis));

// The newest session is 2026-08-10. Every surface must say so.
check("RECENT shows the real session date, not the day before",
  seen.recent.includes("Aug 10") && !seen.recent.includes("Aug 9"), JSON.stringify(seen.recent));
check("RECENT gets the older sessions right too",
  seen.recent.includes("Jul 31") && seen.recent.includes("Jul 13"), JSON.stringify(seen.recent));
check("the chart axis agrees with RECENT",
  seen.axis.includes("8/10") && !seen.axis.includes("8/9"), JSON.stringify(seen.axis));

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
