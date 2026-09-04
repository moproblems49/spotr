// pw_kbinset — the guard for the keyboard-inset class.
//
// `Keyboard.resize:"none"` stops the WKWebView shrinking when the keyboard opens. That kills the
// layout drift a shrinking webview causes, and it costs something nobody expected: this app's
// overlays are `position:fixed` boxes sized to the LAYOUT viewport, so when that stops shrinking
// their content re-flows DOWN into the area the keyboard covers. WebKit's focus-scroll can only
// rescue a field that has a scrollable ancestor; a fixed box that now fits its content has none.
// Measured when `none` was first tried (402x874 vs the 402x538 `native` produces, keyboard 336):
//   Settings -> feedback textarea  bottom 463 -> 799   Edit Profile -> bio 464 -> 596, age 541 -> 673
// None of those is "pinned to the bottom", which was the premise the first attempt reasoned from.
//
// So this suite is CONDITIONAL ON THE SOURCE, and both branches assert something real:
//   * `none` present  -> drive the app at the FULL viewport and fail on any text input whose bottom
//     falls below the keyboard line inside a fixed container with nothing to scroll.
//   * `none` absent   -> assert nothing CONSUMES `--seshd-kb`. The two must ship together or not at
//     all: under `native` the webview shrinks AND a consumer would pad, lifting the field twice.
import { chromium } from "playwright-core";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = 8199, W = 402, VH = 874, KB = 336, LINE = VH - KB;
let fails = 0, checks = 0;
const check = (label, ok, detail = "") => {
  checks++; if (!ok) fails++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
};

const main = readFileSync(join(ROOT, "src/main.jsx"), "utf8");
// Tolerant of spacing/quotes; only matches a live call, not one inside a // comment line.
const resizeNone = main.split("\n").some(l =>
  !l.trimStart().startsWith("//") && /setResizeMode/.test(l) && /["']none["']/.test(l));

// ★ THE PAIRING INVARIANT IS ABOUT PUBLISHING, NOT CONSUMING. Every consumer reads
// `var(--seshd-kb, 0px)`, so with the variable never published they all resolve to 0 and are inert
// — which is exactly how the KB_SAFE_INSET plumbing can stay in the tree while resize is `native`.
// What must never coexist is `native` (the webview shrinks itself) WITH a published height (the
// consumers inset as well), because that lifts everything twice. So the thing to police is the
// publisher in src/main.jsx, not the readers.
const publishes = main.split("\n").some(l =>
  !l.trimStart().startsWith("//") && /setProperty\(\s*["']--seshd-kb/.test(l));

console.log(`pw_kbinset — resize:"none" ${resizeNone ? "PRESENT" : "absent"}, --seshd-kb published: ${publishes}`);

// ── STRUCTURAL: every full-screen fixed backdrop that CONTAINS a text input must carry the inset.
// This is the half that actually scales. Driving screens can only ever cover the handful a fixture
// can reach — the first sweep found 3 buried fields in 4 screens and a static scan then found TEN
// more backdrops in the same class. Enforcing the shape means a NEW modal with an input cannot
// quietly ship without it, which is the way this regression would come back.
const jsxFiles = () => {
  const out = ["src/App.jsx"];
  for (const f of readdirSync(join(ROOT, "src/lazy"))) if (f.endsWith(".jsx")) out.push("src/lazy/" + f);
  if (out.length < 2) throw new Error("src/lazy vanished — this guard would silently stop covering it");
  return out;
};
// ★ A FLOOR PER FILE, NOT A SUBTREE PARSE. Deciding "does this backdrop contain an input" by
// walking JSX was tried three ways and was wrong every time: the indentation walk stopped at the
// element's own header, the brace walk hit the style object's closing braces, and widening it to
// catch `Sheet` (whose input arrives via `{children}`) made it over-report five innocent sites.
// A parse that is wrong in BOTH directions is worse than no parse — it hides real gaps behind
// noise. So this asserts the thing it can decide with certainty: none of the backdrops already
// converted may quietly lose the inset. It fails on a REVERT (the regression that matters) and
// stays quiet when a site is legitimately added. Raise a number here deliberately when you convert
// another backdrop; if you ADD a full-screen backdrop with a text input and resize:"none" is ever
// re-enabled, the geometry scenes below are what will catch it.
const FLOOR = {
  "src/App.jsx": 11,
  "src/lazy/BodyTrackingScreen.jsx": 1,
  "src/lazy/EditHistoryModal.jsx": 1,
  "src/lazy/GroupDetail.jsx": 1,
  "src/lazy/Onboarding.jsx": 1,
};
const short = [];
for (const [f, min] of Object.entries(FLOOR)) {
  const n = (readFileSync(join(ROOT, f), "utf8").match(/\.\.\.KB_SAFE_INSET/g) || []).length;
  if (n < min) short.push(`${f} has ${n}, expected >= ${min}`);
}
check("no converted backdrop has lost KB_SAFE_INSET", short.length === 0, short.join("; "));

if (!resizeNone) {
  check("the keyboard height is not published while resize is native (both or neither)",
    !publishes, publishes ? "src/main.jsx publishes --seshd-kb with resize:none absent" : "not published");
  console.log(`\n${fails ? fails + " FAILING" : "ALL PASS"} — ${checks} checks (geometry sweep not applicable: resize is native, the webview shrinks itself)`);
  process.exit(fails ? 1 : 0);
}
check("the keyboard height IS published while resize is none", publishes,
  "resize:none without a publisher leaves every inset at 0");

// --- resize:"none" is live: the geometry sweep must pass. ---
const ME = "11111111-1111-4111-8111-111111111111";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: W, height: VH }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
p.setDefaultTimeout(3500);
await p.addInitScript(me => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, prs: {}, posts: [], users: [{ id: me, username: "momo", name: "Momo" }], groups: [] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
}, ME);
await p.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "t", user: { id: ME } }) }));
// A FAT history row on purpose: EditHistoryModal renders a weight+reps pair per set, so a
// two-set session fits above the keyboard and cannot see this bug at all. The audit measured 13
// buried fields on a 6-exercise session.
const DK = new Date().toISOString().slice(0, 10);
const HIST_ROW = {
  id: "cccccccc-1111-4111-8111-111111111111", user_id: ME, day_name: "Pull Day", duration_secs: 3600,
  unit: "lbs", note: null, workout_date: DK, created_at: new Date().toISOString(),
  exercises: ["Barbell Row","Lat Pulldown","Seated Cable Row","Face Pull","Barbell Curl","Hammer Curl"]
    .map(name => ({ name, sets: [{ weight: 135, reps: 8, done: true, type: "normal" },
                                 { weight: 135, reps: 8, done: true, type: "normal" }] })),
};
await p.route("**/rest/v1/**", r => {
  const u = r.request().url();
  let body = "[]";
  if (r.request().method() === "GET" && /\/rest\/v1\/workout_history\?/.test(u)) body = JSON.stringify([HIST_ROW]);
  r.fulfill({ status: 200, contentType: "application/json", body });
});

// ★ RAISE THE KEYBOARD BEFORE MEASURING. `--seshd-kb` is published by the native plugin's
// keyboardWillShow, which does not exist in Chromium — so without this the variable is unset, the
// `var(--seshd-kb, 0px)` fallback wins, every container keeps its full height and the guard
// measures the geometry as if no keyboard were open. It could then never go green however correct
// the fix, and its red would be meaningless. Setting the variable is exactly what the plugin does.
const raiseKeyboard = () => p.evaluate(KB => {
  const el = document.documentElement;
  el.style.setProperty("--seshd-kb-ms", "0ms");     // skip the transition; measure the resting state
  el.style.setProperty("--seshd-kb", KB + "px");
}, KB);

// ★ FOCUS EACH FIELD BEFORE MEASURING IT. The app now lifts a focused field itself (the focus
// shim in src/main.jsx), because iOS will not — measuring an UNFOCUSED field tests the layout
// nobody types into and would report a buried field that is fine in practice, or miss a shim that
// silently does nothing. Focusing is also what a finger does, so this is the real question:
// "after I tap this field, can I see it?"
const buried = async (LINE) => {
  const bad = [];
  const n = await p.evaluate(() => document.querySelectorAll("input,textarea").length);
  for (let i = 0; i < n; i++) {
    const r = await p.evaluate(async ({ i, LINE }) => {
      const el = document.querySelectorAll("input,textarea")[i];
      if (!el) return null;
      const box = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (box.width < 8 || box.height < 8 || cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return null;
      el.focus();
      // The shim runs on focusin via rAF; give it two frames plus a beat to settle.
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(res, 40))));
      const after = el.getBoundingClientRect();
      return after.bottom > LINE
        ? `"${(el.placeholder || el.type || el.tagName).slice(0, 24)}" bottom=${Math.round(after.bottom)} (was ${Math.round(box.bottom)})`
        : null;
    }, { i, LINE });
    if (r) bad.push(r);
  }
  return bad;
};

const home = async () => { await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1900); };
const tap = async (sel, ms = 900) => { const l = p.locator(sel).first(); if (!await l.count()) return false; await l.click({ force: true }).catch(() => {}); await p.waitForTimeout(ms); return true; };
const scene = async (name, reach, marker) => {
  await home(); await reach();
  const txt = await p.evaluate(() => document.body.innerText);
  if (marker && !txt.includes(marker)) { check(`${name} reached`, false, `"${marker}" absent — fixture broke, verdict unknown`); return; }
  await raiseKeyboard();
  await p.waitForTimeout(180);
  // ★ THE MARKER ALONE IS NOT ARRIVAL. Every marker used here ("Send feedback", "Edit profile",
  // "Search exercises") is also the TEXT OF THE ROW OR BUTTON THAT OPENS the thing — rendered
  // before the sheet/modal/picker exists. So a scene whose second tap silently missed still had
  // its marker present, reported zero visible inputs, and PASSED with nothing under test. The real
  // precondition is that the container actually opened, and the observable proof of that is a
  // visible text input.
  const seen = await p.evaluate(() => [...document.querySelectorAll("input,textarea")]
    .filter(el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return r.width > 8 && r.height > 8 && cs.display !== "none" && cs.visibility !== "hidden"; }).length);
  if (seen === 0) { check(`${name} reached`, false, "no visible input — the container never opened, verdict unknown"); return; }
  const bad = await buried(LINE);
  check(`${name}: no input buried under the keyboard (${seen} visible)`, bad.length === 0, bad.join("; "));
};

await scene("Settings > feedback", async () => {
  await tap('button[aria-label="Profile"]', 1100); await tap('button[aria-label="Settings"]', 1100);
  await p.evaluate(() => { let best = null;
    for (const el of document.querySelectorAll("*")) { const s = getComputedStyle(el);
      if ((s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 40 && (!best || el.clientHeight > best.clientHeight)) best = el; }
    if (best) best.scrollTop = best.scrollHeight; });
  await p.waitForTimeout(400); await tap("text=/feedback/i", 900);
}, "Send feedback");

await scene("Profile > Edit profile", async () => {
  await tap('button[aria-label="Profile"]', 1100); await tap("text=/^Edit profile$/i", 900);
}, "Edit profile");

await scene("Workout > exercise picker", async () => {
  await tap("text=/Quick Start/i", 1200); await tap("text=/add exercise/i", 1100);
}, "Search exercises");

// ★ THE SCROLLER SCENES — the ones KB_SAFE_INSET cannot help and the shim exists for.
// A live workout is the app's core typing surface: every exercise carries an "Add note..." field
// and a rename field, and an audit measured TWENTY of them below the keyboard line with nothing
// able to lift them. A thin fixture cannot see this — with two exercises everything fits above the
// keyboard — so seed enough to push fields well down the page.
const seedWorkout = async () => {
  const sess = {
    dayName: "Push Day", startedAt: Date.now() - 1800000, unit: "lbs",
    exercises: ["Barbell Bench Press","Incline Dumbbell Press","Cable Fly","Overhead Press",
                "Lateral Raise","Triceps Pushdown","Skullcrusher","Dips","Push-Up","Chest Press (Machine)"]
      .map((name, i) => ({ id: "e" + i, name, sets: [{ id: "s" + i, weight: "100", reps: "8", done: false, type: "normal" }] })),
  };
  await p.addInitScript(s => {
    localStorage.setItem("seshd_active_session", JSON.stringify(s));
    localStorage.setItem("seshd_wstart", String(Date.now() - 1800000));
  }, sess);
};
await seedWorkout();
await scene("Live workout > exercise notes", async () => {
  // The workout resumes on boot; scroll the list so the lower exercises' fields are on screen.
  await p.evaluate(() => { let best = null;
    for (const el of document.querySelectorAll("*")) { const cs = getComputedStyle(el);
      if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 40 && (!best || el.clientHeight > best.clientHeight)) best = el; }
    if (best) best.scrollTop = best.scrollHeight; });
  await p.waitForTimeout(500);
}, "Discard");

// The live-workout seed above persists for the page, and a resumed workout hides History. Init
// scripts run in order, so a later one clearing the key wins — otherwise this scene can never
// arrive and would report a fixture failure that looks like an app bug.
await p.addInitScript(() => { localStorage.removeItem("seshd_active_session"); localStorage.removeItem("seshd_wstart"); });
await scene("Edit History > set fields", async () => {
  await tap('button[aria-label="Workout"]', 900);
  const hist = p.getByText("History", { exact: true }).locator("visible=true").first();
  if (await hist.count()) { await hist.click({ force: true }).catch(() => {}); await p.waitForTimeout(1200); }
  const dots = p.getByText("···", { exact: true }).locator("visible=true").first();
  if (await dots.count()) { await dots.click({ force: true }).catch(() => {}); await p.waitForTimeout(600); }
  const edit = p.getByText("Edit", { exact: false }).locator("visible=true").first();
  if (await edit.count()) { await edit.click({ force: true }).catch(() => {}); await p.waitForTimeout(1000); }
  await p.evaluate(() => { let best = null;
    for (const el of document.querySelectorAll("*")) { const cs = getComputedStyle(el);
      if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 40 && (!best || el.clientHeight > best.clientHeight)) best = el; }
    if (best) best.scrollTop = best.scrollHeight; });
  await p.waitForTimeout(400);
}, "Pull Day");

await b.close();
console.log(`\n${fails ? fails + " FAILING" : "ALL PASS"} — ${checks} checks`);
process.exit(fails ? 1 : 0);
