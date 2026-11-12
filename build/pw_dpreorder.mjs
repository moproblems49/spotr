// HOLD-AND-DRAG REORDER IN THE DAY PREVIEW'S EDIT MODE (Mo, Nov 12: "when editing a workout day,
// be able to reorder exercises by hold and drag").
//
// The program editor has had dnd-kit reordering for months; the Day Preview's Edit mode — the one
// you reach by tapping a day and then "Edit" — never did, so the only way to change the order of a
// day was to delete and re-add exercises. This suite drives the real gesture and asserts the EFFECT:
//   * every grip is `touch-action:none` (a `pan-y` grip is dead on iOS while every Chromium check
//     passes — pw_reorder's scar, so the PROPERTY is asserted, not just the gesture);
//   * a 320ms stationary hold then a vertical drag, as real TouchEvents, reorders the list;
//   * a note typed on a row TRAVELS with that row (index keys + a component mirroring a prop into
//     state is how a reorder "doesn't stick" in this repo — the fields would stay put);
//   * "Done" persists the new order into the program, not just the screen.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const NAMES = ["Barbell Bench Press", "Incline DB Press", "Lateral Raises (DB)", "Tricep Rope Pushdown"];
const PROGRAM = { id:"prog-x", name:"Reorder Program", days:[
  { id:"dA", name:"Push Day", exercises: NAMES.map(n => ({ name:n, reps:"3×8–12", rest:"90", note:"" })) },
]};

const browser = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const page = await browser.newPage({ viewport:{ width:428, height:926 }, deviceScaleFactor:1, hasTouch:true, isMobile:true });
page.setDefaultTimeout(6000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0,160)); });

await page.addInitScript(([me, prog]) => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
    programs:[prog], activeProgramId: prog.id, history:{}, workoutDates:{}, weeklyTarget:4,
    bodyLog:[], prs:{}, prEvents:[], posts:[], profile:{ username:"momo", name:"Mo" },
    users:[{ id: me, username:"momo", name:"Mo", followers:[], following:[] }] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, [ME, PROGRAM]);
await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
  body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
// Program PATCHes are answered and RECORDED (the save is asserted on what reached the server, not
// on a toast); everything else is aborted so the seeded local store keeps rendering.
const programPatches = [];
await page.route("**/rest/v1/**", r => {
  const req = r.request();
  if (req.method() === "PATCH" && /\/rest\/v1\/programs\?/.test(req.url())) {
    try { programPatches.push(JSON.parse(req.postData() || "{}")); } catch (e) {}
    return r.fulfill({ status:200, contentType:"application/json", body:"[]" });
  }
  if (req.method() === "PATCH") { programPatches.push({ _other: req.url() }); return r.fulfill({ status:200, contentType:"application/json", body:"[]" }); }
  return r.abort();
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil:"domcontentloaded" });
await page.waitForTimeout(3200);

// Open the day's PREVIEW (the card body, not its Edit/Start buttons), then the preview's own Edit.
const opened = await page.evaluate(() => {
  const x = [...document.querySelectorAll("button")].filter(e => e.offsetParent)
    .find(e => (e.textContent||"").includes("Push Day") && !/^(Edit|Start)/.test((e.textContent||"").trim()));
  if (x) { x.click(); return true; } return false;
});
await page.waitForTimeout(1200);
const edited = await page.evaluate(() => {
  const ov = document.querySelector("[data-fullscreen-overlay]") || document;
  const b = [...ov.querySelectorAll("button")].find(e => e.offsetParent && (e.textContent||"").trim() === "Edit");
  if (b) { b.click(); return true; } return false;
});
await page.waitForTimeout(800);
const order = () => page.evaluate(() => [...document.querySelectorAll("[data-dp-grip]")]
  .map(g => (g.getAttribute("aria-label")||"").replace(/^Drag to reorder /, "")));
const before = await order();
check("the Day Preview opened and entered edit mode", opened && edited && before.length === NAMES.length,
  `opened=${opened} edited=${edited} grips=${JSON.stringify(before)}`);

if (before.length === NAMES.length) {
  const ta = await page.evaluate(() => [...document.querySelectorAll("[data-dp-grip]")].map(g => getComputedStyle(g).touchAction));
  check("every grip is touch-action:none, as dnd-kit's TouchSensor requires on iOS",
    ta.every(t => t === "none"), JSON.stringify(ta));

  // Type a note on the FIRST row, so we can see whether it travels with the row it belongs to.
  const firstNote = page.locator("[data-dp-row]").first().locator("textarea");
  await firstNote.fill("pause at the chest");
  await page.waitForTimeout(200);

  // A 320ms stationary press on grip 0, then a vertical drag to grip 2, as real TouchEvents.
  const boxes = await page.evaluate(() => [...document.querySelectorAll("[data-dp-grip]")].map(g => {
    const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }));
  await page.evaluate(async ([p0, p2]) => {
    const el = document.elementFromPoint(p0.x, p0.y);
    if (!el) return;
    const T = (t, cy) => { const tt = new Touch({ identifier: 1, target: el, clientX: p0.x, clientY: cy });
      return new TouchEvent(t, { bubbles: true, cancelable: true,
        touches: t === "touchend" ? [] : [tt], targetTouches: t === "touchend" ? [] : [tt], changedTouches: [tt] }); };
    el.dispatchEvent(T("touchstart", p0.y));
    await new Promise(r => setTimeout(r, 320));
    for (let i = 1; i <= 12; i++) { el.dispatchEvent(T("touchmove", p0.y + (p2.y + 12 - p0.y) * i / 12)); await new Promise(r => setTimeout(r, 22)); }
    el.dispatchEvent(T("touchend", p2.y + 12));
    await new Promise(r => setTimeout(r, 500));
  }, [boxes[0], boxes[2]]);
  const after = await order();
  console.log("HOLD-DRAG:", JSON.stringify(before), "->", JSON.stringify(after));
  check("press-and-hold then drag reorders the exercises", JSON.stringify(after) !== JSON.stringify(before)
    && after.length === before.length && [...after].sort().join() === [...before].sort().join(), JSON.stringify(after));
  check("the dragged exercise moved DOWN the list", after.indexOf(NAMES[0]) > 0, JSON.stringify(after));

  // The note must sit on whichever row now holds the bench press.
  const noteOwner = await page.evaluate(() => {
    const row = [...document.querySelectorAll("[data-dp-row]")].find(r => r.querySelector("textarea")?.value === "pause at the chest");
    return row ? (row.querySelector("[data-dp-grip]").getAttribute("aria-label")||"").replace(/^Drag to reorder /, "") : null;
  });
  check("the note typed on a row travels with that row", noteOwner === NAMES[0], `note sits on ${noteOwner}`);

  // A tap that does not hold must NOT start a drag: a quick touch on a grip leaves the order alone.
  const before2 = await order();
  await page.evaluate(([p]) => {
    const el = document.elementFromPoint(p.x, p.y); if (!el) return;
    const tt = new Touch({ identifier: 2, target: el, clientX: p.x, clientY: p.y });
    el.dispatchEvent(new TouchEvent("touchstart", { bubbles:true, cancelable:true, touches:[tt], targetTouches:[tt], changedTouches:[tt] }));
    const tt2 = new Touch({ identifier: 2, target: el, clientX: p.x, clientY: p.y + 120 });
    el.dispatchEvent(new TouchEvent("touchmove", { bubbles:true, cancelable:true, touches:[tt2], targetTouches:[tt2], changedTouches:[tt2] }));
    el.dispatchEvent(new TouchEvent("touchend", { bubbles:true, cancelable:true, touches:[], targetTouches:[], changedTouches:[tt2] }));
  }, [boxes[1]]);
  await page.waitForTimeout(400);
  check("[control] a quick swipe with no hold does not reorder (the 200ms hold is what arms it)",
    JSON.stringify(await order()) === JSON.stringify(before2), JSON.stringify(await order()));

  // Done -> saved into the program, not just the screen.
  await page.evaluate(() => {
    const ov = document.querySelector("[data-fullscreen-overlay]") || document;
    const b = [...ov.querySelectorAll("button")].find(e => e.offsetParent && (e.textContent||"").trim() === "Done");
    b && b.click();
  });
  let saved = null;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    saved = await page.evaluate(() => {
      try { const st = JSON.parse(localStorage.getItem("seshd_v1") || "{}");
        const p = (st.programs || []).find(x => x.id === "prog-x"); return p ? p.days[0].exercises.map(e => e.name) : null; }
      catch (e) { return null; }
    });
    if (saved && JSON.stringify(saved) === JSON.stringify(after)) break;
  }
  check("Done saves the new order into the program", JSON.stringify(saved) === JSON.stringify(after),
    `stored ${JSON.stringify(saved)}`);
  const sent = programPatches.filter(b => b.days).map(b => b.days[0].exercises.map(e => e.name));
  check("...and the new order reaches the server", sent.some(o => JSON.stringify(o) === JSON.stringify(after)),
    JSON.stringify(sent));
  // Editing a day is not activating its program — Done used to PATCH active_program_id too.
  check("Done does not touch the active program", !programPatches.some(b => b._other && /profiles/.test(b._other)),
    JSON.stringify(programPatches.filter(b => b._other)));
}

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
