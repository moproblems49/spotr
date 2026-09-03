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

// Who reads the variable, ignoring comment lines (a comment naming it is documentation, not a consumer).
const consumers = [];
const walk = d => { for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
  if (e.isDirectory()) walk(join(d, e.name));
  else if (/\.(jsx?|css)$/.test(e.name)) {
    const f = join(d, e.name); if (f.endsWith("src/main.jsx")) continue;
    readFileSync(join(ROOT, f), "utf8").split("\n").forEach((l, i) => {
      const t = l.trimStart();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
      if (/var\(\s*--seshd-kb/.test(l)) consumers.push(`${f}:${i + 1}`);
    });
  }
} };
walk("src");

console.log(`pw_kbinset — resize:"none" ${resizeNone ? "PRESENT" : "absent"}, --seshd-kb consumers: ${consumers.length}`);

if (!resizeNone) {
  check("no consumer of --seshd-kb while resize is native (both or neither)",
    consumers.length === 0, consumers.join(", ") || "none");
  console.log(`\n${fails ? fails + " FAILING" : "ALL PASS"} — ${checks} checks (geometry sweep not applicable: resize is native, the webview shrinks itself)`);
  process.exit(fails ? 1 : 0);
}

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
await p.route("**/rest/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

const buried = () => p.evaluate(LINE => {
  const out = [];
  for (const el of document.querySelectorAll("input,textarea")) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) continue;
    let n = el.parentElement, fixed = false, scrollable = false, d = 0;
    while (n && n !== document.documentElement && d < 30) {
      const s = getComputedStyle(n);
      if (!fixed && s.position === "fixed") fixed = true;
      if (!scrollable && (s.overflowY === "auto" || s.overflowY === "scroll") && n.scrollHeight > n.clientHeight + 2) scrollable = true;
      n = n.parentElement; d++;
    }
    // Under the keyboard AND unrescuable: a fixed box with nothing to scroll.
    if (r.bottom > LINE && fixed && !scrollable)
      out.push(`"${(el.placeholder || el.type || el.tagName).slice(0, 24)}" bottom=${Math.round(r.bottom)}`);
  }
  return out;
}, LINE);

const home = async () => { await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1900); };
const tap = async (sel, ms = 900) => { const l = p.locator(sel).first(); if (!await l.count()) return false; await l.click({ force: true }).catch(() => {}); await p.waitForTimeout(ms); return true; };
const scene = async (name, reach, marker) => {
  await home(); await reach();
  const txt = await p.evaluate(() => document.body.innerText);
  // A scene we never reached proves nothing — say so rather than passing vacuously.
  if (marker && !txt.includes(marker)) { check(`${name} reached`, false, `"${marker}" absent — fixture broke, verdict unknown`); return; }
  const bad = await buried();
  check(`${name}: no input buried under the keyboard`, bad.length === 0, bad.join("; "));
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

await b.close();
console.log(`\n${fails ? fails + " FAILING" : "ALL PASS"} — ${checks} checks`);
process.exit(fails ? 1 : 0);
