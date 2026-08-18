// The "+ Add Exercise" flow must add an exercise when you COMMIT a name — not on every keystroke.
//
// ExerciseInput fires onChange per character, and both "add" boxes originally wired that straight
// into an add-an-exercise handler. Typing "Bench Press" in Build Your Own therefore created an
// exercise literally named "B" on the first keystroke, and the caller's `key={…exercises.length}`
// remount wiped the box — so the remaining characters went nowhere, the dropdown could never
// filter, and adding an exercise by typing was impossible.
//
// "Build Your Own" now opens ExercisePickerSheet (a large sheet, not the small inline dropdown —
// Mo: "should we just sorta copy Strong app... what we have now doesn't look that great") behind a
// "+ Add Exercise" button, so these checks drive: tap the button, then the same commit-only
// contract inside the sheet's own search field.
import { chromium } from "playwright-core";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(5000);
await page.addInitScript(() => {
  localStorage.setItem("seshd_v1", JSON.stringify({ programs: [], history: {}, prEvents: [], bodyLog: [], profile: { username: "momo" }, unit: "lbs" }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: "u1", email: "mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
});
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: "u1", email: "mo@example.com" } }) }));
await page.route("**/rest/v1/**", r => r.abort());

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

await page.goto("http://127.0.0.1:8199/", { waitUntil: "load", timeout: 20000 });
await page.waitForTimeout(1200);
await page.getByText("Build Your Own").click();
await page.waitForTimeout(600);

// One exercise row per "SETS" LABEL (exact text — a container whose textContent merely *starts*
// with "SETS" matches every ancestor too, which silently double-counted once a second card
// existed). Walk up from the label to the card and read its first line.
const rowNames = () => page.evaluate(() => {
  const labels = [...document.querySelectorAll("div")].filter(d => d.textContent === "SETS");
  return labels.map(l => {
    let n = l;
    for (let i = 0; i < 6 && n; i++) { n = n.parentElement; if (n && n.style.borderRadius === "16px") break; }
    return (n?.innerText || "").trim().split("\n")[0];
  });
});

await page.getByText("+ Add Exercise", { exact: true }).click();
await page.waitForTimeout(500);
check("the sheet opened", await page.getByText("Add Exercise", { exact: true }).isVisible());

const box = page.getByPlaceholder("Search exercises...").last();
await box.click();
await box.pressSequentially("Bench Press", { delay: 50 });
await page.waitForTimeout(400);

check("typing does not add anything yet", (await rowNames()).length === 0, JSON.stringify(await rowNames()));
check("the whole typed name survives in the box", await box.inputValue() === "Bench Press", await box.inputValue());

// The dropdown should now be filtered by what was typed.
const suggestions = await page.evaluate(() =>
  [...document.querySelectorAll("div")].filter(d => d.style.fontSize === "15px" && d.style.fontWeight === "600").map(d => d.textContent).slice(0, 6));
console.log("SUGGESTIONS:", JSON.stringify(suggestions));
check("the sheet's list filtered to what was typed", suggestions.some(s => /bench press/i.test(s || "")), JSON.stringify(suggestions));

// Picking one commits it, and only it — and closes the sheet (this is a big pop-up sheet now,
// not an always-open inline box, so "clears itself" became "closes itself").
// force:true: the row's 44pt .seshd-hit hit-area halo (see CLAUDE.md) paints on top of its own
// text per normal CSS stacking order — a real tap lands on the invisible halo and bubbles to the
// row's own onClick exactly the way this force click does; Playwright's strict actionability check
// just can't tell that the "intercepting" element IS the ancestor that owns the handler.
await page.getByText("Barbell Bench Press", { exact: true }).first().click({ force: true });
await page.waitForTimeout(600);
await page.screenshot({ path: "build/shot_addex.png", fullPage: true });
let rows = await rowNames();
console.log("ROWS:", JSON.stringify(rows));
check("picking a suggestion adds exactly one exercise", rows.length === 1, JSON.stringify(rows));
check("...with the full name, not one letter", /Barbell Bench Press/.test(rows[0] || ""), JSON.stringify(rows));
check("the sheet closed itself after a pick", !(await page.getByPlaceholder("Search exercises...").last().isVisible().catch(() => false)), "sheet's search box still visible");

// Enter must commit a typed name too, otherwise only library exercises could ever be added —
// re-open the sheet for the second exercise since a pick closes it.
await page.getByText("+ Add Exercise", { exact: true }).click();
await page.waitForTimeout(500);
const box2 = page.getByPlaceholder("Search exercises...").last();
await box2.click();
await box2.pressSequentially("Sandbag Carry", { delay: 40 });
await page.waitForTimeout(250);
await box2.press("Enter");
await page.waitForTimeout(600);
await page.screenshot({ path: "build/shot_addex2.png", fullPage: true });
rows = await rowNames();
console.log("ROWS:", JSON.stringify(rows));
check("Enter commits a typed custom name", rows.length === 2 && /Sandbag Carry/.test(rows[1] || ""), JSON.stringify(rows));
check("Enter also closed the sheet", !(await page.getByPlaceholder("Search exercises...").last().isVisible().catch(() => false)), "sheet's search box still visible");

// Build Your Own's rows show a static name (no per-row rename field here — that's the day
// editor's job), so the only "Search exercises..." field left on screen should be none at all:
// the sheet is closed and there's nothing else claiming that placeholder.
const nameFields = page.locator('input[placeholder="Search exercises..."]');
console.log("name field count:", await nameFields.count());
check("no leftover sheet search field once closed", await nameFields.count() === 0, String(await nameFields.count()));

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
