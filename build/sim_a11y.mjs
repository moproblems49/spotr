// TWO STANDING ACCESSIBILITY CHECKS, so a future edit can't silently reintroduce either class.
//
// 1. Every theme text token clears WCAG AA (4.5:1) against BOTH the app background and the raised
//    surface. Found by real math (not eyeballing): before this fix, dark `muted` was 3.73:1/3.22:1,
//    light `muted` was 2.25:1/2.45:1, light `sub` was 4.39:1/4.78:1, light `gold`-as-text was
//    2.70:1 — all real failures on real content (body-map labels, PR tags, section kickers), not
//    decorative pixels the WCAG exemption would cover.
// 2. No icon-only <button> ships with no aria-label/title — a screen-reader user gets literally
//    nothing from one. Reuses build/a11y_scan.mjs's AST walk over the JSX-transformed bundle.
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { jsxFiles } from "./source_files.mjs";

const BUILD = dirname(fileURLToPath(import.meta.url));
const ROOT = join(BUILD, "..");
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

// ── 1. Contrast ──────────────────────────────────────────────────────────────────────────────
function hexToRgb(hex) { const h = hex.replace("#", ""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function relLum([r, g, b]) {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const [R, G, B] = [f(r), f(g), f(b)]; return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function ratio(h1, h2) {
  const L1 = relLum(hexToRgb(h1)), L2 = relLum(hexToRgb(h2));
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1]; return (hi + 0.05) / (lo + 0.05);
}

const src = (await import("fs")).readFileSync(join(ROOT, "src/App.jsx"), "utf8");
// Pull the THEMES object's dark/light blocks out with a targeted parse rather than eval'ing the
// 25k-line file: grab each token's hex value by name within each theme's braces.
function extractTheme(label) {
  const start = src.indexOf(`  ${label}: {`);
  if (start === -1) throw new Error(`could not find THEMES.${label} in src/App.jsx`);
  const end = src.indexOf("\n  },", start);
  const block = src.slice(start, end === -1 ? start + 3000 : end);
  const t = {};
  for (const m of block.matchAll(/(\w+):\s*"(#[0-9a-fA-F]{6})"/g)) t[m[1]] = m[2];
  return t;
}
// ★ SWEEP EVERY REGISTERED THEME, NOT THE TWO THIS FILE HAPPENS TO KNOW. Themes are plural now,
// and a guard that enumerates a hardcoded pair silently stops covering the palette someone just
// added — the same blindness that let src/lazy/ go unchecked for weeks (see CLAUDE.md). The list
// is read from THEME_META in the source, so adding a theme automatically extends this check and
// a theme that fails contrast cannot ship green.
// Scope the id scan to THEME_META's own block — an unscoped `{id:…,label:…}` match picks up
// report reasons, set types and tab names too (it found 24 "themes" on the first run and threw).
const metaStart = src.indexOf("const THEME_META = [");
if (metaStart === -1) throw new Error("THEME_META not found in src/App.jsx");
const metaBlock = src.slice(metaStart, src.indexOf("\n];", metaStart));
const themeIds = [...metaBlock.matchAll(/id:\s*"(\w+)"/g)].map(m => m[1]);
check("THEME_META was found and lists at least the two original themes",
  themeIds.includes("dark") && themeIds.includes("light"), JSON.stringify(themeIds));
const THEME_SET = themeIds.map(id => [id, extractTheme(id)]);
const dark = extractTheme("dark");
const light = extractTheme("light");

// Tokens that are actually used as TEXT color on real (non-decorative) content — text/textDim/sub
// /muted at minimum; gold/red/green/orange are checked too since they're used as text for badges
// (PR tags, deltas, admin labels). `accentInk` is in the list because it IS the accent-as-text
// token; bare `accent` is deliberately absent — it is a FILL and fails as text on the light theme
// by design, which is the whole reason accentInk exists. (This comment used to claim accent was
// swept and it never was; a guard whose stated coverage and real coverage disagree is how the
// next blind spot survives.)
const TEXT_TOKENS = ["text", "textDim", "sub", "muted", "gold", "red", "green", "orange", "accentInk"];
for (const [name, t] of THEME_SET) {
  for (const tok of TEXT_TOKENS) {
    if (!t[tok]) continue;
    const rBg = ratio(t[tok], t.bg), rSurf = ratio(t[tok], t.surface);
    check(`${name}.${tok} (${t[tok]}) clears 4.5:1 against bg`, rBg >= 4.5, `${rBg.toFixed(2)}:1`);
    check(`${name}.${tok} (${t[tok]}) clears 4.5:1 against surface`, rSurf >= 4.5, `${rSurf.toFixed(2)}:1`);
  }
}

// ── 1b. INK ON A FILL ───────────────────────────────────────────────────────────────────────
// ★ THE CHECK THAT WOULD HAVE CAUGHT THE ACCENT-INK BUG. The sweep above asks whether a token
// reads on the app's two BACKGROUNDS. It cannot see content painted on a coloured FILL, and that
// is where a nine-theme palette set actually breaks: `C.isDark ? C.onAccent : C.text` used isDark
// as a proxy for "is this theme's accent light?", which was true for two themes and false the
// moment a LIGHT theme shipped a DARK accent — Arctic 3.08:1, Spring 2.64:1, Summer 2.75:1 on
// real 11-46px text. Every pair below is an ink and the fill it is actually painted on, so a new
// palette whose ink does not clear its own fill fails here rather than in someone's gym.
const FILL_PAIRS = [
  ["accentFillInk", "accent",  "content on the accent fill (avatar initials, the 1RM slab, how-to step badges)"],
  ["onAccent",      "green",   "the done-tick on a green fill"],
  ["onAccent",      "accent2", "the PR tag"],
  ["onPrimary",     "primary", "filled primary buttons"],
  // The streak badge was hardcoded white on orange-500 (2.80:1 on every theme). C.orange is dark
  // on every light palette and light on every dark one, so C.onAccent is its exact complement —
  // the same pairing the done-tick uses on C.green.
  ["onAccent",      "orange",  "the streak badge on an orange fill"],
];
for (const [name, t] of THEME_SET) {
  for (const [ink, fill, what] of FILL_PAIRS) {
    if (!t[ink] || !t[fill]) { check(`${name} declares both ${ink} and ${fill}`, false, `${ink}=${t[ink]} ${fill}=${t[fill]}`); continue; }
    const r = ratio(t[ink], t[fill]);
    check(`${name}.${ink} (${t[ink]}) clears 4.5:1 on ${fill} — ${what}`, r >= 4.5, `${r.toFixed(2)}:1`);
  }
}

// ── 1c. THE REST-TIMER SLAB ─────────────────────────────────────────────────────────────────
// The rest bar is near-black on EVERY theme, so its accent is a separate token from `accent`.
// The two slab fills are PARSED out of App.jsx rather than copied here — a guard that hardcodes
// its own copy of the value under test is testing its copy (the documented replica anti-pattern).
// If that line ever changes shape this throws loudly instead of silently checking nothing.
{
  const m = src.match(/background:\s*C\.isDark\s*\?\s*"rgba\((\d+),\s*(\d+),\s*(\d+),[^"]*\)"\s*:\s*"rgba\((\d+),\s*(\d+),\s*(\d+),[^"]*\)"/);
  if (!m) throw new Error("could not find the rest-bar slab fills in src/App.jsx — has that line changed?");
  const slabs = [[+m[1], +m[2], +m[3]], [+m[4], +m[5], +m[6]]];
  const lumOf = rgb => relLum(rgb);
  const ratioRgb = (hex, rgb) => {
    const L1 = relLum(hexToRgb(hex)), L2 = lumOf(rgb);
    const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1]; return (hi + 0.05) / (lo + 0.05);
  };
  for (const [name, t] of THEME_SET) {
    check(`${name} declares accentSlab`, !!t.accentSlab, String(t.accentSlab));
    if (!t.accentSlab) continue;
    for (const slab of slabs) {
      const r = ratioRgb(t.accentSlab, slab);
      check(`${name}.accentSlab (${t.accentSlab}) clears 3:1 on the rest slab rgb(${slab})`, r >= 3, `${r.toFixed(2)}:1`);
    }
  }
}

// ── 1d. THE BODY SILHOUETTE'S DERIVED GREYS ─────────────────────────────────────────────────
// A muscle trained ZERO times must read as a region with nothing in it, not vanish into the body —
// that bug shipped once at 1.00:1. The two greys are now MIXED from each palette's own bg toward
// its own text, so the fractions are PARSED out of App.jsx rather than copied here; a guard that
// keeps its own copy of the formula is testing its copy.
{
  const m = src.match(/body:\s*_mixHex\(bg,\s*ink,\s*dark\s*\?\s*([\d.]+)\s*:\s*([\d.]+)\),\s*empty:\s*_mixHex\(bg,\s*ink,\s*dark\s*\?\s*([\d.]+)\s*:\s*([\d.]+)\)/);
  if (!m) throw new Error("could not parse bodyGreys' mix fractions from src/App.jsx — has it changed?");
  const [bD, bL, eD, eL] = m.slice(1, 5).map(Number);
  const mix = (from, to, t) => {
    const [a, b] = [hexToRgb(from), hexToRgb(to)];
    return "#" + [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t).toString(16).padStart(2, "0")).join("");
  };
  for (const [name, t] of THEME_SET) {
    const dark = /isDark:\s*true/.test(src.slice(src.indexOf(`  ${name}: {`), src.indexOf("\n  },", src.indexOf(`  ${name}: {`))));
    const body = mix(t.bg, t.text, dark ? bD : bL), empty = mix(t.bg, t.text, dark ? eD : eL);
    check(`${name}: the silhouette is visible against the canvas`, ratio(body, t.bg) >= 1.35, `${ratio(body, t.bg).toFixed(2)}:1`);
    check(`${name}: an untrained muscle is a visible step off the silhouette`, ratio(empty, body) >= 1.2, `${ratio(empty, body).toFixed(2)}:1`);
  }
}

// ── 2. Icon-only buttons need an accessible name ────────────────────────────────────────────
// COVERAGE: this scanned src/App.jsx alone until Aug 27 2026 and so went quietly blind as screens
// moved into src/lazy/ — ten files of real UI, several of them full of icon buttons, policed by
// nothing while this check still printed PASS. (Same class as the sim_undef gap the engine split
// found.) It sweeps every JSX file now. src/engine/*.js is deliberately NOT scanned: those modules
// are pure logic and contain no JSX at all, so there is nothing there for this to see.
const jsxTargets = jsxFiles();
const tmp = mkdtempSync(join(tmpdir(), "a11y-"));
try {
  const dirty = [];
  for (const rel of jsxTargets) {
    const out = join(tmp, rel.replace(/[\/.]/g, "_") + ".js");
    const t = spawnSync("npx", ["esbuild", rel, "--loader:.jsx=jsx", "--format=esm",
      "--jsx=automatic", `--outfile=${out}`], { cwd: ROOT, encoding: "utf8" });
    if (t.status !== 0) { check(`could transform ${rel} for the button scan`, false, (t.stderr || "").slice(0, 200)); continue; }
    const r = spawnSync(process.execPath, [join(BUILD, "a11y_scan.mjs"), out], { encoding: "utf8" });
    const stdout = r.stdout || "";
    if (!/No provably icon-only buttons/.test(stdout)) {
      dirty.push(rel);
      console.log(`  ── ${rel}`);
      console.log(stdout.trim().split("\n").map(l => "    " + l).join("\n"));
    }
  }
  check(`no icon-only <button> ships without an accessible name (${jsxTargets.length} JSX file(s) scanned)`,
    dirty.length === 0, dirty.length ? `findings in: ${dirty.join(", ")}` : "");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
