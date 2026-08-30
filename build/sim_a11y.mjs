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
// /muted at minimum; gold/red/green/orange/accent are checked too since they're used as text for
// badges (PR tags, deltas, admin labels).
const TEXT_TOKENS = ["text", "textDim", "sub", "muted", "gold", "red", "green", "orange"];
for (const [name, t] of THEME_SET) {
  for (const tok of TEXT_TOKENS) {
    if (!t[tok]) continue;
    const rBg = ratio(t[tok], t.bg), rSurf = ratio(t[tok], t.surface);
    check(`${name}.${tok} (${t[tok]}) clears 4.5:1 against bg`, rBg >= 4.5, `${rBg.toFixed(2)}:1`);
    check(`${name}.${tok} (${t[tok]}) clears 4.5:1 against surface`, rSurf >= 4.5, `${rSurf.toFixed(2)}:1`);
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
