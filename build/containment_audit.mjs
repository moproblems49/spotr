// THE CONTAINMENT PASS, STEP 1 — MEASURE BEFORE CRITIQUING.
//
// The design critique named "less containment / fewer rounded cards" as the app's remaining
// "generic AI" tell, and Mo parked it to discuss. Before touching a single style, this walks the
// real screens and counts what is actually on the glass, because MY OWN READ OF THIS WAS WRONG
// LAST TIME: I reported "everything is the same large radius" from memory, and measuring found the
// opposite problem (26 distinct radii — arbitrariness, not sameness) plus LOW containment on the
// screens I had called over-contained. Two of the three findings I would have acted on were false.
//
// What counts as a container here: a visible element with a corner radius AND a boundary the eye
// can see — a background that differs from what is behind it, a real border, or a shadow. That is
// the definition the "rounded card" critique is actually about. Each one is classified by size
// (card / tile / chip) and, crucially, by NESTING DEPTH: a card inside a card inside a card is the
// thing that reads as assembled-from-a-kit, and a flat count cannot see it.
//
// It also inventories TYPOGRAPHY on the same walk (the deferred type pass needs the same
// treatment): every distinct size/weight/spacing/transform combination actually rendered.
//
// NOT a battery suite on purpose — it asserts nothing, it measures. Per CLAUDE.md, a script that
// cannot fail does not belong in the battery; the FINDINGS become suites, the probe does not.
// Named *_audit.mjs so run_sims.mjs (which globs sim_* / pw_*) never picks it up.
//
// Usage: node build/containment_audit.mjs [before|after]
// Output: build/containment_<mode>/*.png + inventory.json + a printed ranking.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, rmSync } from "fs";

const MODE = process.argv[2] || "before";
const OUT = `build/containment_${MODE}`;
// Wipe first: screenshots are numbered by order, so a re-run after the tour changes shape leaves
// the old run interleaved with the new under the same numbers (a stale mixed directory once hid a
// run whose navigation had silently failed).
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const ME = "11111111-1111-4111-8111-111111111111";
const PAL = "22222222-2222-4222-8222-222222222222";
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

// A LOADED account, because an empty app hides most of the accent. History drives the charts and
// the streak, PRs drive the badges, a program drives the day cards, a follow drives the feed.
const hist = {};
for (let i = 1; i <= 24; i++) {
  const d = new Date(Date.now() - i * 3 * 864e5);
  hist[dayKey(d)] = { [`s${i}`]: {
    dayName: ["Push A · Heavy Chest", "Pull A · Back Width", "Legs A · Quad Focus"][i % 3],
    duration: 3200 + i * 30, unit: "lbs", finishedAt: d.getTime(),
    exercises: [
      { name: "Barbell Bench Press", sets: [{ weight: String(185 + i), reps: "5", done: true, type: "normal" }, { weight: String(185 + i), reps: "5", done: true, type: "normal" }, { weight: String(185 + i), reps: "4", done: true, type: "normal" }] },
      { name: "Barbell Back Squat", sets: [{ weight: String(245 + i * 2), reps: "5", done: true, type: "normal" }, { weight: String(245 + i * 2), reps: "5", done: true, type: "normal" }] },
      { name: "Lat Pulldown (Wide)", sets: [{ weight: String(120 + i), reps: "10", done: true, type: "normal" }] },
    ] } };
}
const PROG = { id: "p1", name: "PPL · 6 Day", days: [
  { id: "d1", name: "Push A · Heavy Chest", exercises: [
    { name: "Barbell Bench Press", sets: 4, reps: "5-7", rest: "180" },
    { name: "Incline DB Press", reps: "3×8-10" },
    { name: "Lateral Raises (DB)", reps: "4×15-20" }] },
  { id: "d2", name: "Pull A · Back Width", exercises: [
    { name: "Weighted Pull-Ups", reps: "4×6-8" },
    { name: "Seated Cable Row (Narrow)", reps: "3×10" }] },
  { id: "d3", name: "Legs A · Quad Focus", exercises: [
    { name: "Barbell Back Squat", reps: "4×5-8" },
    { name: "Leg Press", reps: "3×10-12" }] },
] };
const store = {
  currentUserId: ME, theme: "dark", unit: "lbs", weeklyTarget: 3, programs: [PROG], activeProgramId: "p1",
  history: hist, prEvents: [], bodyLog: [{ date: dayKey(new Date()), weight: 178 }],
  prs: { "Barbell Bench Press": 225, "Barbell Back Squat": 315 },
  profile: { username: "momo", name: "Mo" },
  // A recovery reading, so the readiness card and Body Battery render with real numbers rather
  // than their empty states — those two screens are where the accent is densest.
  recovery: { hrv: 58, hrvBaseline: 55, restingHr: 49, rhrBaseline: 51, sleepHours: 7.6,
    sleepDeepMin: 76, sleepRemMin: 96, recoveryScore: 0.79, capturedAt: new Date().toISOString(),
    sleepStart: new Date(Date.now() - 9 * 36e5).toISOString(), sleepEnd: new Date(Date.now() - 1.4 * 36e5).toISOString() },
  activity: { date: dayKey(new Date()), steps: 7400, activeKcal: 480 },
  users: [{ id: ME, username: "momo", name: "Mo", bio: "5 years in. Chasing a 4-plate squat.", followers: [PAL], following: [PAL] },
          { id: PAL, username: "maya_lifts", name: "Maya Chen", bio: "Squat-first powerlifter", followers: [ME], following: [ME] }],
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(4000);
await page.addInitScript(([s, me]) => {
  localStorage.setItem("seshd_v1", JSON.stringify(s));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "mo@example.com" } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, [store, ME]);
await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
  body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "mo@example.com" } }) }));
await page.route("**/rest/v1/**", r => {
  const u = r.request().url();
  let body = "[]";
  // SEED THROUGH THE STUB. loadUserData replaces the local store with the server copy, so a
  // localStorage-only fixture renders the EMPTY app — the first run of this tour captured
  // "Start your first program" and reported 5 accented elements on the busiest screen.
  if (/\/rest\/v1\/profiles\?/.test(u)) {
    body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true,
      seen_onboarding: true, theme: "dark", bio: "5 years in. Chasing a 4-plate squat.",
      weekly_target: 3, pr_events: [] }]);
  } else if (/\/rest\/v1\/public_profiles\?/.test(u)) {
    body = JSON.stringify(store.users.map(x => ({ ...x, unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" })));
  } else if (/\/rest\/v1\/programs\?/.test(u)) {
    body = JSON.stringify([{ id: "p1", user_id: ME, name: PROG.name, days: PROG.days,
      is_active: true, created_at: new Date().toISOString() }]);
  } else if (/\/rest\/v1\/workout_history\?/.test(u)) {
    body = JSON.stringify(Object.entries(hist).flatMap(([date, byId]) =>
      // COLUMN NAMES ARE `workout_date` / `duration_secs`. Getting them wrong keys every session
      // under `undefined`, and the app renders "Invalid Date" / "NaNmo ago" — which reads exactly
      // like an app bug in a screenshot. Checked against loadUserData rather than guessed.
      Object.entries(byId).map(([sid, s]) => ({ id: sid, user_id: ME, workout_date: date,
        day_name: s.dayName, exercises: s.exercises, duration_secs: s.duration, unit: s.unit,
        created_at: new Date(s.finishedAt).toISOString() }))));
  } else if (/\/rest\/v1\/personal_records\?/.test(u)) {
    body = JSON.stringify(Object.entries(store.prs).map(([name, weight]) =>
      ({ user_id: ME, exercise: name, weight, unit: "lbs" })));
  }
  r.fulfill({ status: 200, contentType: "application/json", body });
});


// ── The measurement ──────────────────────────────────────────────────────────────────────────
const inventory = [];
const typography = [];

const collect = (screen) => page.evaluate((screen) => {
  const containers = [], type = [];

  // SCOPE TO THE TOPMOST OVERLAY. An overlay does not remove the DOM beneath it, and the first
  // run of this tour counted both: exercise_detail reported 44 containers, of which SIXTEEN were
  // the Exercises tab's category chips (All/Chest/Back/...) sitting underneath, plus the nav bar
  // and the streak badge. Settings and the Body Battery sheet are overlays over the profile and
  // were inflated the same way — so the "most contained screen" ranking was partly measuring
  // stacked DOM rather than what the eye sees. This is the exact trap CLAUDE.md documents twice.
  // The nav bar and top bar are fixed too, hence the height floor: an overlay is a screen-sized
  // thing, a nav bar is 50px.
  const overlayRoot = (() => {
    const cands = [...document.querySelectorAll("[data-fullscreen-overlay], div")].filter(el => {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "absolute") return false;
      if ((+cs.zIndex || 0) < 40) return false;
      const r = el.getBoundingClientRect();
      if (r.height <= 240 || r.width <= 200) return false;
      // A CLICK-CATCHER IS NOT AN OVERLAY. The `···` overflow menus render a childless
      // `position:fixed; inset:0; zIndex:50` backdrop purely to catch the next tap. It clears
      // every other filter, so opening one would make it the root and the screen would report
      // ~0 containers — a confident, wrong zero. Require the candidate to actually contain
      // something.
      return el.childElementCount > 0;
    });
    if (!cands.length) return null;
    // Highest z wins; on a tie prefer the LAST in document order, which is the one painted on top
    // (a stable sort would otherwise hand back the lower of two equal-z overlays).
    return cands.sort((a, b) => (+getComputedStyle(a).zIndex || 0) - (+getComputedStyle(b).zIndex || 0)).pop();
  })();
  const root = overlayRoot || document.body;
  const scoped = overlayRoot ? `overlay z=${getComputedStyle(overlayRoot).zIndex}` : "page";

  // The effective background behind an element: walk up until something actually paints. Without
  // this, every child of a card looks like it has "a background differing from its parent" the
  // moment the parent is transparent, and the count triples.
  const effBg = (el) => {
    let n = el.parentElement;
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
      n = n.parentElement;
    }
    return "rgb(0, 0, 0)";
  };
  const visibleBorder = (cs) => {
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      const w = parseFloat(cs[`border${side}Width`]);
      const c = cs[`border${side}Color`];
      if (w >= 0.5 && c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return true;
    }
    return false;
  };

  const isContainer = new WeakSet();
  const all = [...root.querySelectorAll("*")];

  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    if (r.bottom < 0 || r.top > window.innerHeight) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0" || cs.display === "none") continue;

    // TYPOGRAPHY: leaf text nodes only — an ancestor's textContent is the whole screen.
    const txt = el.childElementCount === 0 ? (el.textContent || "").trim() : "";
    if (txt) {
      type.push({ screen, size: parseFloat(cs.fontSize), weight: cs.fontWeight,
        spacing: cs.letterSpacing === "normal" ? 0 : Math.round(parseFloat(cs.letterSpacing) * 100) / 100,
        transform: cs.textTransform, family: (cs.fontFamily.split(",")[0] || "").replace(/["']/g, ""),
        text: txt.slice(0, 30) });
    }

    // CONTAINMENT: a radius plus a boundary the eye can actually see.
    const radius = Math.max(...["TopLeft", "TopRight", "BottomRight", "BottomLeft"]
      .map(c => parseFloat(cs[`border${c}Radius`]) || 0));
    if (radius < 4) continue;
    const bg = cs.backgroundColor;
    const painted = bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg) && bg !== effBg(el);
    const shadow = cs.boxShadow && cs.boxShadow !== "none";
    if (!painted && !shadow && !visibleBorder(cs)) continue;

    isContainer.add(el);
    // Nesting depth: how many container ancestors this one sits inside. Counted against the set
    // built so far, which is safe because querySelectorAll is document order (ancestors first).
    let depth = 0;
    for (let p = el.parentElement; p; p = p.parentElement) if (isContainer.has(p)) depth++;

    const area = Math.round(r.width * r.height);
    const kind = (r.width >= 200 && r.height >= 44) ? "card"
               : (r.height <= 34 || area < 3000) ? "chip" : "tile";
    containers.push({ screen, kind, radius, depth, w: Math.round(r.width), h: Math.round(r.height), area,
      painted: !!painted, shadow: !!shadow, border: visibleBorder(cs),
      tag: el.tagName.toLowerCase(), role: el.getAttribute("role") || (el.tagName === "BUTTON" ? "button" : ""),
      text: (el.textContent || "").trim().slice(0, 40).replace(/\s+/g, " ") });
  }
  return { containers, type, scoped };
}, screen);

let n = 0;
const shot = async (label, wait = 600) => {
  await page.waitForTimeout(wait);
  n++;
  const name = `${String(n).padStart(2, "0")}_${label}`;
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const got = await collect(label);
  inventory.push(...got.containers);
  typography.push(...got.type);
  const cards = got.containers.filter(c => c.kind === 'card').length;
  const deep = got.containers.reduce((m, c) => Math.max(m, c.depth), 0);
  console.log(`  ${name.padEnd(28)} ${String(got.containers.length).padStart(3)} containers  ${String(cards).padStart(2)} cards  depth ${deep}  [${got.scoped}]`);
};
// Scroll the app's real scroller. `body` is pinned `overflow:hidden` for the app's whole
// lifetime (AppInner), so scrolling happens in inner containers and page.mouse.wheel is a no-op —
// the first run of this tour reported five "scrolled" screens that were byte-identical to their
// unscrolled twins. Pick the tallest genuinely-scrollable element and drive it directly, then
// report whether it actually moved so a silent failure can't be read as data.
const scrollBy = async (dy) => {
  const moved = await page.evaluate((dy) => {
    const cands = [...document.querySelectorAll("*")].filter(el => {
      const cs = getComputedStyle(el);
      return /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 8 && el.clientHeight > 200;
    });
    if (!cands.length) return null;
    const el = cands.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];
    const before = el.scrollTop;
    el.scrollTop = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, before + dy));
    return { before, after: el.scrollTop };
  }, dy);
  await page.waitForTimeout(450);
  if (!moved) { console.log("     (nothing scrollable here)"); return false; }
  if (moved.before === moved.after) { console.log(`     (already at the end, ${moved.after})`); return false; }
  return true;
};
const tapNav = async (i) => { await page.mouse.click([65, 164, 264, 363][i], 869); await page.waitForTimeout(700); };
const tapText = async (t, wait = 700) => {
  const el = page.getByText(t, { exact: false }).first();
  if (await el.count()) { await el.click().catch(() => {}); await page.waitForTimeout(wait); return true; }
  return false;
};
const goBack = async () => {
  for (const attempt of [
    () => page.locator('button[aria-label="Back"]').locator("visible=true").last().click({ timeout: 1200 }),
    () => page.getByRole("button", { name: "Done" }).locator("visible=true").last().click({ timeout: 1200 }),
    () => page.locator('button[aria-label="Close"]').locator("visible=true").last().click({ timeout: 1200 }),
    () => page.getByText("‹", { exact: true }).last().click({ timeout: 1200 }),
  ]) { try { await attempt(); await page.waitForTimeout(600); return true; } catch {} }
  return false;
};

await page.goto("http://127.0.0.1:8199/", { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => !/Setting up your account/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1400);

console.log(`\n${MODE.toUpperCase()} — walking the app\n`);
await shot("tracker_home", 900);
await scrollBy(600); await shot("tracker_scrolled", 400);
await scrollBy(600); await shot("tracker_scrolled2", 400);
await scrollBy(-1400);
await tapText("Exercises"); await shot("exercises");
const firstEx = page.getByText("Barbell Bench Press", { exact: true }).first();
if (await firstEx.count()) { await firstEx.click().catch(() => {}); await shot("exercise_detail", 900); await goBack(); }
await tapText("History"); await shot("history");
await scrollBy(700); await shot("history_scrolled", 400);
await scrollBy(-700);
await tapText("Workout"); await shot("workout_tab", 700);

// SOCIAL SCREENS FIRST. The live workout is a full takeover with NO TAB BAR, so every tapNav
// after Quick Start silently does nothing — the first run of this tour captured the workout
// screen four more times under the names feed/discover/profile and reported them as data.
await tapNav(0); await shot("feed", 900);
await tapNav(2); await shot("discover", 900);
await tapNav(3); await shot("profile", 900);
// Body Battery sheet — it lives HERE, on your own profile, not on the tracker tab. Inherited that
// bug verbatim from accent_audit.mjs, and it is the exact failure CLAUDE.md documents: a script
// that looked for this sheet on the tracker tab clicked nothing and reported success anyway.
if (await tapText("BODY BATTERY", 1000)) { await shot("body_battery_sheet", 900); await goBack(); await tapNav(3); }
else console.log("     !! Body Battery sheet never opened");
await scrollBy(700); await shot("profile_scrolled", 400);
await scrollBy(-700);
if (await tapText("Body", 900)) { await shot("body_screen", 900); await goBack(); await tapNav(3); }
const settings = page.locator('button[aria-label="Settings"]').first();
if (await settings.count()) {
  await settings.click(); await shot("settings", 900);
  await scrollBy(800); await shot("settings_scrolled", 400);
  await tapText("Done", 600);
}

// ...and the live workout LAST, because there is no way back to the tabs except cancelling it.
await tapNav(1); await page.waitForTimeout(400);
if (await tapText("Quick Start", 1200)) {
  await shot("live_workout_empty", 900);
  const box = page.getByPlaceholder("Search exercises...").first();
  if (await box.count()) {
    await box.click(); await box.pressSequentially("Barbell Bench", { delay: 40 });
    await page.waitForTimeout(600); await shot("exercise_picker");
    await page.getByText("Barbell Bench Press", { exact: true }).first().click().catch(() => {});
    await shot("live_workout_loaded", 900);
  }
}

// Every screen must be DISTINCT — identical accent counts on consecutive screens is the tell that
// navigation silently failed, which is exactly how the first run produced four fake screens.
const sig = {};
for (const h of inventory) (sig[h.screen] = sig[h.screen] || []).push(`${h.kind}|${h.radius}|${h.text}`);
const seen = new Map();
for (const [s2, arr] of Object.entries(sig)) {
  const k = arr.sort().join("~");
  if (seen.has(k)) console.log(`\n!! ${s2} is IDENTICAL to ${seen.get(k)} — navigation failed, not real data`);
  else seen.set(k, s2);
}


await b.close();

// ── Report ───────────────────────────────────────────────────────────────────────────────────
writeFileSync(`${OUT}/inventory.json`, JSON.stringify({ containers: inventory, typography }, null, 1));

const byScreen = {}, byKind = {}, byRadius = {}, byDepth = {};
for (const c of inventory) {
  (byScreen[c.screen] = byScreen[c.screen] || { n: 0, maxDepth: 0, cards: 0 });
  byScreen[c.screen].n++;
  byScreen[c.screen].maxDepth = Math.max(byScreen[c.screen].maxDepth, c.depth);
  if (c.kind === "card") byScreen[c.screen].cards++;
  byKind[c.kind] = (byKind[c.kind] || 0) + 1;
  byRadius[c.radius] = (byRadius[c.radius] || 0) + 1;
  byDepth[c.depth] = (byDepth[c.depth] || 0) + 1;
}

console.log(`\n${"=".repeat(78)}`);
console.log(`CONTAINMENT — ${inventory.length} containers across ${n} screens`);
console.log("=".repeat(78));
console.log("\nBY SCREEN (most contained first) — cards = full-width rounded blocks");
console.log("   all  cards  deepest-nesting  screen");
for (const [k, v] of Object.entries(byScreen).sort((a, b) => b[1].cards - a[1].cards || b[1].n - a[1].n))
  console.log(`  ${String(v.n).padStart(4)}  ${String(v.cards).padStart(5)}  ${String(v.maxDepth).padStart(15)}  ${k}`);

console.log("\nBY KIND");
for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log("\nNESTING DEPTH (a container inside a container inside a container is the real tell)");
for (const [k, v] of Object.entries(byDepth).sort((a, b) => +a[0] - +b[0])) console.log(`  depth ${k}: ${v}`);
console.log("\nRADII IN USE (distinct values, and how often)");
for (const [k, v] of Object.entries(byRadius).sort((a, b) => +a[0] - +b[0])) console.log(`  ${String(k).padStart(5)}px  ${v}`);

// ── Typography ───────────────────────────────────────────────────────────────────────────────
const combos = {}, sizes = {}, families = {};
for (const t of typography) {
  combos[`${t.size}/${t.weight}/${t.spacing}/${t.transform}`] = (combos[`${t.size}/${t.weight}/${t.spacing}/${t.transform}`] || 0) + 1;
  sizes[t.size] = (sizes[t.size] || 0) + 1;
  families[t.family] = (families[t.family] || 0) + 1;
}
console.log(`\n${"=".repeat(78)}`);
console.log(`TYPOGRAPHY — ${Object.keys(combos).length} distinct size/weight/spacing/transform combos, ${Object.keys(sizes).length} distinct sizes`);
console.log("=".repeat(78));
console.log("\nSIZES ACTUALLY RENDERED");
for (const [k, v] of Object.entries(sizes).sort((a, b) => +a[0] - +b[0])) console.log(`  ${String(k).padStart(5)}px  ${String(v).padStart(4)} nodes`);
console.log("\nFAMILIES");
for (const [k, v] of Object.entries(families).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log("\nTOP 20 COMBOS (size/weight/letter-spacing/transform)");
for (const [k, v] of Object.entries(combos).sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log(`\nfull inventory: ${OUT}/inventory.json`);
