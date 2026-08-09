// Drives the REAL program-day editor in Chromium: open a program, tap REORDER, drag the first
// exercise below the third, tap Done, and check the order in the editor list AND in the persisted
// store. jsdom can't do this — dnd-kit needs real pointer events.
import { chromium } from "playwright-core";

const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PROG = {
  id: "prog-1", name: "No Mercy PPL",
  days: [{
    id: "day-1", name: "Legs A",
    exercises: [
      { name: "Barbell Back Squat", sets: 3, reps: "5-8", rest: "180" },
      { name: "Leg Extension", reps: "3×12-15" },      // no `sets` — the "0 sets" case
      { name: "Leg Press", reps: "4×10-12" },          // no `sets`
      { name: "Seated Leg Curl", reps: "3×12" },       // no `sets`
      { name: "Standing Calf Raise", reps: "4×15" },   // no `sets`
    ],
  }],
};
const STORE = {
  programs: [PROG], activeProgramId: "prog-1", history: {}, prEvents: [],
  bodyLog: [], profile: { username: "momo", name: "Mo" }, unit: "lbs",
};

const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);
await page.addInitScript(([store]) => {
  localStorage.setItem("seshd_v1", JSON.stringify(store));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: "u1", email: "mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, [STORE]);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: "u1", email: "mo@example.com" } }) }));
await page.route("**/rest/v1/**", r => r.abort());

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

await page.goto("http://127.0.0.1:8199/", { waitUntil: "load", timeout: 20000 });
await page.waitForTimeout(1200);

// Workout tab → Programs sub-tab → open the program.
await page.getByText("1 days · 5 exercises").click({ timeout: 8000 });
await page.waitForTimeout(800);
await page.screenshot({ path: "build/shot_editor.png" });

// The set-count fallback: what does the editor stepper say vs the reorder row?
// ── The editor list is directly sortable: drag the muscle tile of row 0 down past row 1 ──────
const handles = page.getByRole("button", { name: "Drag to reorder" });
check("every exercise card has a drag handle", await handles.count() === 5, String(await handles.count()));
{
  const a = await handles.nth(0).boundingBox();
  const c = await handles.nth(2).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + (c.y - a.y) * i / 10); await page.waitForTimeout(25); }
  await page.mouse.up();
  await page.waitForTimeout(600);
  const inline = await page.evaluate(() =>
    [...document.querySelectorAll("input")].map(i => i.value).filter(v => /Squat|Leg (Extension|Press|Curl)|Calf/.test(v)));
  console.log("AFTER IN-LIST DRAG:", JSON.stringify(inline));
  check("dragging the handle reorders the list in place", inline[0] !== "Barbell Back Squat", JSON.stringify(inline));
  // Put it back so the rest of the run starts from the known order.
  const a2 = await handles.nth(2).boundingBox();
  const c2 = await handles.nth(0).boundingBox();
  await page.mouse.move(a2.x + a2.width / 2, a2.y + a2.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(a2.x + a2.width / 2, a2.y + a2.height / 2 + (c2.y - a2.y) * i / 10); await page.waitForTimeout(25); }
  await page.mouse.up();
  await page.waitForTimeout(600);
}

// Typing must still work in a card that is now draggable — the handle is the tile, not the card.
const repsField = page.locator('input[placeholder="8–12"]').first();
await repsField.click();
await repsField.fill("6-9");
await page.waitForTimeout(200);
check("the reps field is still editable inside a draggable card", await repsField.inputValue() === "6-9", await repsField.inputValue());
await repsField.fill("5-8");
await page.waitForTimeout(200);

const reorderBtn = page.getByRole("button", { name: "Reorder exercises" });
check("the reorder button moved into the day bar", await reorderBtn.count() === 1, String(await reorderBtn.count()));
check("the dead day-move arrows are gone",
  await page.getByRole("button", { name: /^Move day/ }).count() === 0);
// Start must be fully on screen, not pushed past the edge.
// Two "Start ›" exist — the day card on the screen behind, and the editor's. Take the editor's.
const startBox = await page.evaluate(() => {
  const bar = [...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === "Reorder exercises")?.parentElement;
  const btn = [...(bar?.querySelectorAll("button") || [])].find(b => b.textContent.includes("Start"));
  if (!btn) return null;
  const r = btn.getBoundingClientRect();
  return { x: r.x, width: r.width, right: r.right };
});
const vw = page.viewportSize().width;
console.log("START BUTTON:", JSON.stringify(startBox), "viewport", vw);
check("the Start button sits fully within the screen",
  startBox && startBox.x >= 0 && startBox.x + startBox.width <= vw, JSON.stringify(startBox));

await reorderBtn.click();
await page.waitForTimeout(500);
await page.screenshot({ path: "build/shot_reorder.png" });

const rowText = async () => page.evaluate(() => {
  const modal = [...document.querySelectorAll("div")].find(d => d.textContent?.includes("DRAG TO MOVE") && d.style.position === "fixed");
  if (!modal) return null;
  const list = modal.querySelector('[style*="overflow"]') || modal;
  return [...list.querySelectorAll("div")]
    .filter(d => d.style.touchAction === "none" && d.style.borderRadius === "14px")
    .map(d => d.innerText.replace(/\n/g, " | ").trim());
});
const before = await rowText();
console.log("ROWS BEFORE:", JSON.stringify(before, null, 1));
check("reorder modal lists all 5 exercises", before?.length === 5, String(before?.length));
check("no row reads '0 sets'", !before?.some(t => /\b0 sets\b/.test(t)), JSON.stringify(before));
check("no row ends with a dangling separator", !before?.some(t => /·\s*$/.test(t)), JSON.stringify(before));

// Drag row 0 (Barbell Back Squat) down past row 2.
const rows = page.locator('div[style*="touch-action: none"]').filter({ hasText: /set/ });
const n = await rows.count();
const boxes = [];
for (let i = 0; i < n; i++) boxes.push(await rows.nth(i).boundingBox());
const src = boxes[0], dst = boxes[2];
await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
await page.mouse.down();
for (let s = 1; s <= 12; s++) {
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2 + (dst.y + dst.height / 2 - src.y - src.height / 2) * s / 12);
  await page.waitForTimeout(30);
}
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(600);
await page.screenshot({ path: "build/shot_after_drag.png" });

const after = await rowText();
console.log("ROWS AFTER: ", JSON.stringify(after, null, 1));
check("the dragged exercise moved in the reorder list",
  after && after[0] && !/Barbell Back Squat/.test(after[0]), JSON.stringify(after));

// Done → the main editor list must show the same order.
await page.getByRole("button", { name: "Done" }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: "build/shot_after_done.png" });
const EXPECTED = ["Leg Extension", "Leg Press", "Barbell Back Squat", "Seated Leg Curl", "Standing Calf Raise"];
const editorOrder = await page.evaluate(() =>
  [...document.querySelectorAll("input")].map(i => i.value).filter(v => /Squat|Leg (Extension|Press|Curl)|Calf/.test(v)));
console.log("EDITOR ORDER:", JSON.stringify(editorOrder));
check("the main editor's NAME fields show the new order",
  JSON.stringify(editorOrder) === JSON.stringify(EXPECTED), JSON.stringify(editorOrder));

// The reps field is controlled, the name field mirrors its prop into local state — they must not
// disagree. "Barbell Back Squat" is the only row carrying a bare rep range and rest 180.
const pairs = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll("input").forEach(i => {
    if (!/Squat|Leg (Extension|Press|Curl)|Calf/.test(i.value)) return;
    const card = i.closest('div[style*="border-radius: 16px"]');
    const fields = card ? [...card.querySelectorAll("input")].map(x => x.value) : [];
    out.push(fields);
  });
  return out;
});
console.log("NAME/REPS/REST:", JSON.stringify(pairs));
const squat = pairs.find(p => p[0] === "Barbell Back Squat");
check("the name and the reps beside it belong to the same exercise",
  squat && squat[1] === "5-8", JSON.stringify(squat));

// And it must persist to the store (this is the "doesn't stick" claim).
await page.waitForTimeout(500);
const persisted = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("seshd_v1") || "{}");
  return s.programs?.[0]?.days?.[0]?.exercises?.map(e => e.name);
});
console.log("PERSISTED: ", JSON.stringify(persisted));
check("the reorder is persisted to the store",
  JSON.stringify(persisted) === JSON.stringify(EXPECTED), JSON.stringify(persisted));

// Set counts must agree between the editor stepper and the reorder list.
const steppers = await page.evaluate(() =>
  [...document.querySelectorAll("span")].filter(s => s.previousElementSibling?.textContent === "−")
    .map(s => s.textContent));
console.log("STEPPERS:  ", JSON.stringify(steppers));
check("the editor stepper reads the count out of the reps string",
  JSON.stringify(steppers) === JSON.stringify(["3", "4", "3", "3", "4"]), JSON.stringify(steppers));

// ── EVERY DRAG HANDLE MUST BE touch-action: none ─────────────────────────────────────────────
// dnd-kit's TouchSensor documents this as a REQUIREMENT on the handle, and it is the one property
// this file could not otherwise defend. Everything above drives the screen with `page.mouse`,
// which activates the PointerSensor on 6px of MOVEMENT and never touches the 200ms press-and-hold
// that a phone uses — so when this handle was changed to `pan-y`, every assertion above stayed
// green while hold-to-reorder was dead on device. `pan-y` hands WebKit the VERTICAL axis, a
// reorder drag is vertical, and a preventDefault after the browser has claimed the scroll cannot
// take it back. Chromium here has no real compositor scroll competing, so it cannot reproduce the
// symptom — but it can read the property, and the property is the bug.
const handleTA = await page.evaluate(() =>
  [...document.querySelectorAll('[aria-label="Drag to reorder"]')].map(h => getComputedStyle(h).touchAction));
console.log("HANDLE touch-action:", JSON.stringify(handleTA));
check("every drag handle is touch-action:none, as dnd-kit's TouchSensor requires",
  handleTA.length > 0 && handleTA.every(t => t === "none"), JSON.stringify(handleTA));

// ── AND THE HOLD ITSELF, WITH A REAL FINGER ──────────────────────────────────────────────────
// A 320ms stationary press, then a vertical drag, dispatched as real TouchEvents. This exercises
// the TouchSensor path the mouse drags above skip entirely.
{
  const names = () => page.evaluate(() =>
    [...document.querySelectorAll("input")].map(i => i.value).filter(v => /Squat|Extension|Press|Curl|Raise/.test(v)));
  const before = await names();
  const hs = page.getByRole("button", { name: "Drag to reorder" });
  const b0 = await hs.nth(0).boundingBox(), b2 = await hs.nth(2).boundingBox();
  await page.evaluate(async ([p0, p2]) => {
    const el = document.elementFromPoint(p0.x + p0.width / 2, p0.y + p0.height / 2);
    if (!el) return;
    const x = p0.x + p0.width / 2, y = p0.y + p0.height / 2, ty = p2.y + p2.height / 2;
    const T = (t, cy) => { const tt = new Touch({ identifier: 1, target: el, clientX: x, clientY: cy });
      return new TouchEvent(t, { bubbles: true, cancelable: true,
        touches: t === "touchend" ? [] : [tt], targetTouches: t === "touchend" ? [] : [tt], changedTouches: [tt] }); };
    el.dispatchEvent(T("touchstart", y));
    await new Promise(r => setTimeout(r, 320));                       // clear the 200ms delay
    for (let i = 1; i <= 10; i++) { el.dispatchEvent(T("touchmove", y + (ty - y) * i / 10)); await new Promise(r => setTimeout(r, 22)); }
    el.dispatchEvent(T("touchend", ty));
    await new Promise(r => setTimeout(r, 500));
  }, [b0, b2]);
  const after = await names();
  console.log("HOLD-DRAG:  ", JSON.stringify(before), "->", JSON.stringify(after));
  check("press-and-hold then drag reorders the list", JSON.stringify(before) !== JSON.stringify(after),
    "the order did not change");
}

await b.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
