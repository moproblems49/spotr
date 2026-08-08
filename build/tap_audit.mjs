// APPLE HIG: 44x44pt MINIMUM HIT AREA for any control. This walks the app's main screens and
// measures every interactive element, reporting anything a thumb will miss.
//
// It measures the element's own box PLUS whatever its padding/negative-margin arrangement gives
// it — the geometry a finger actually lands on — not the icon inside. Elements smaller than the
// bar are grouped by their label + size so one repeated row (a set stepper appearing 12 times)
// reports once rather than flooding the list.
//
// KNOWN-OK EXEMPTIONS are explicit and few. Inline text links inside a sentence cannot be 44px
// without wrecking the paragraph, and Apple does not require it of them; everything else is a
// real finding.
import { chromium } from "playwright-core";

const MIN = 44;
const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

const day = new Date();
const kd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
const S = (w, r, n = 3) => Array.from({ length: n }, () => ({ weight: String(w), reps: String(r), done: true, type: "normal" }));
const ROW = {
  id: "sess-1", user_id: ME, workout_date: kd, day_name: "Push A", unit: "lbs",
  duration_secs: 3620, created_at: new Date(Date.now() - 36e5).toISOString(),
  exercises: [{ name: "Barbell Bench Press", sets: S(245, 5) }, { name: "Overhead Press", sets: S(135, 8) }],
};
const SESSION = {
  dayName: "Push A", unit: "lbs",
  exercises: [
    { name: "Barbell Bench Press", sets: [
      { weight: "225", reps: "5", done: true, type: "normal" },
      { weight: "225", reps: "5", done: false, type: "normal" }] },
    { name: "Overhead Press", sets: [{ weight: "135", reps: "8", done: false, type: "normal" }] },
  ],
};

async function open({ active = null } = {}) {
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(4000);
  await page.addInitScript(([me, s]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({
      currentUserId: me, theme: "dark", unit: "lbs", programs: [], history: {}, workoutDates: {},
      prEvents: [], bodyLog: [], prs: { "Barbell Bench Press": 200 }, posts: [],
      profile: { username: "momo", name: "Mo" },
      users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
    }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: me, email: "m@e.com" } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
    if (s) { localStorage.setItem("seshd_active_session", JSON.stringify(s)); localStorage.setItem("seshd_wstart", String(Date.now() - 9e5)); }
  }, [ME, active]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "t", refresh_token: "r", user: { id: ME, email: "m@e.com" } }) }));
  await page.route("**/rest/v1/**", r => {
    const u = r.request().url();
    let body = "[]";
    if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u))
      body = JSON.stringify([{ id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark" }]);
    else if (/\/rest\/v1\/workout_history\?/.test(u)) body = JSON.stringify([ROW]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  return page;
}

// Everything a finger can hit, measured by HIT-TESTING rather than by reading the element's box.
//
// This matters: the fix for a small control here is an invisible pseudo-element that widens the
// region receiving the touch WITHOUT changing the element's geometry. A getBoundingClientRect()
// audit cannot see that at all — it reported 81 failures both before and after the first fix
// landed. So probe outward from the centre and ask what the OS would actually hit.
const SCAN = (min) => {
  const out = [];
  const sel = 'button, a, [role="button"], input[type="checkbox"], select, [onclick]';
  const half = min / 2;
  document.querySelectorAll(sel).forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    if (r.bottom < 0 || r.top > innerHeight) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.pointerEvents === "none") return;
    const inSentence = el.tagName === "A" && cs.display.startsWith("inline")
      && (el.parentElement?.textContent || "").trim().length > (el.textContent || "").trim().length + 12;
    if (inSentence) return;

    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const owns = (x, y) => {
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit));
    };
    if (!owns(cx, cy)) return;   // covered by an overlay — not this screen's problem
    // How far out from the centre does this control still receive the touch?
    const reach = (dx, dy) => { let n = 0; while (n < half && owns(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
    const w = reach(-1, 0) + reach(1, 0), h = reach(0, -1) + reach(0, 1);
    if (w >= min - 1 && h >= min - 1) return;
    const label = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 34) || "(icon only)";
    out.push({ label, w, h, tag: el.tagName });
  });
  return out;
};

// THE HAZARD THE FIX INTRODUCES. An invisible halo is still an invisible thing on top of the
// layout: if it covers a NEIGHBOURING control's centre, that neighbour becomes untappable and
// nothing about the screen looks wrong. This asks, for every control, whether its own centre
// still resolves to itself — a "no" means something is sitting over it.
const STEAL = () => {
  const out = [];
  const sel = 'button, a, [role="button"], input[type="checkbox"], select';
  const els = [...document.querySelectorAll(sel)].filter(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // Bound BOTH axes. Checking only top/bottom let horizontally-scrolled filter chips through:
    // their centres sit outside the viewport, elementFromPoint returns null, and the tool reported
    // nine "stolen" controls that were simply off-screen.
    return r.width > 1 && r.height > 1
      && r.top >= 0 && r.bottom <= innerHeight
      && r.left >= 0 && r.right <= innerWidth
      && cs.visibility !== "hidden" && cs.pointerEvents !== "none";
  });
  // PROBE THE WHOLE BOX, NOT JUST THE CENTRE. Centre-only reported "zero stolen" while a halo was
  // genuinely covering the right 2px of a neighbour: an audit found that clicking inside the
  // rest-time picker's own visible box opened the exercise overflow menu instead. A halo eats a
  // control from the EDGE inward, so the centre is the last thing it takes and the worst possible
  // place to look. A 9x9 grid over each control's own rectangle catches it.
  const N = 9;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    let lost = 0, total = 0, thief = null;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = r.left + (r.width * (i + 0.5)) / N;
        const y = r.top + (r.height * (j + 0.5)) / N;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        total++;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit) || hit.contains(el))) continue;
        lost++;
        if (!thief) thief = hit ? ((hit.getAttribute("aria-label") || hit.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30) || hit.tagName) : "nothing";
      }
    }
    if (!total || !lost) continue;
    const pct = Math.round((lost / total) * 100);
    const label = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30) || "(icon only)";
    out.push({ label, thief, pct });
  }
  return out;
};

const stolen = [];
const screens = [];
async function sweep(page, name) {
  for (const t of await page.evaluate(STEAL)) stolen.push({ ...t, screen: name });
  const found = await page.evaluate(SCAN, MIN);
  const seen = new Map();
  for (const f of found) {
    const k = `${f.label}|${f.w}x${f.h}`;
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  screens.push({ name, items: [...seen.entries()].map(([k, n]) => {
    const [label, size] = k.split("|");
    const [w, h] = size.split("x").map(Number);
    return { label, w, h, n, worst: Math.min(w, h) };
  }).sort((a, b) => a.worst - b.worst) });
}

// ── Tour ──
let page = await open();
await sweep(page, "Tracker / Workout tab");
for (const [label, name] of [["Exercises", "Tracker / Exercises"], ["History", "Tracker / History"]]) {
  const btn = page.getByRole("button", { name: new RegExp(`^${label}$`) }).first();
  if (await btn.count()) { await btn.click().catch(() => {}); await page.waitForTimeout(700); await sweep(page, name); }
}
for (const [aria, name] of [["Home", "Feed"], ["Discover", "Discover"], ["Profile", "Profile"]]) {
  const btn = page.getByLabel(aria).first();
  if (await btn.count()) { await btn.click().catch(() => {}); await page.waitForTimeout(900); await sweep(page, name); }
}
await page.close();

page = await open({ active: SESSION });
await sweep(page, "LIVE WORKOUT");
await page.close();
await browser.close();

// ── Report ──
let total = 0, worstAll = 99;
for (const s of screens) {
  if (!s.items.length) { console.log(`\n${s.name}: all controls >= ${MIN}px`); continue; }
  console.log(`\n${s.name}:`);
  for (const it of s.items) {
    total += it.n;
    worstAll = Math.min(worstAll, it.worst);
    console.log(`  ${String(it.w).padStart(3)}x${String(it.h).padStart(3)}  ${it.n > 1 ? `x${it.n} ` : "   "} ${it.label}`);
  }
}
console.log(`\n${total} control(s) under ${MIN}x${MIN}; smallest dimension seen: ${worstAll}px`);
if (stolen.length) {
  console.log(`\n${stolen.length} CONTROL(S) WITH PART OF THEIR BOX COVERED — a hit halo may be stealing taps:`);
  for (const t of stolen) console.log(`  [${t.screen}] "${t.label}" — ${t.pct}% of its box covered by "${t.thief}"`);
} else {
  console.log("no control has any part of its box covered by another element");
}
