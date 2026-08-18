// THE TYPE AND RADIUS SCALES MUST NOT SILENTLY DRIFT BACK.
//
// A design pass found 37 distinct font sizes (including 48 uses of HALF-PIXEL sizes like 12.5px)
// and 26 distinct corner radii, 9 of them used three times or fewer. Both read as arbitrary rather
// than designed. The half-pixel sizes were snapped to integers and the arbitrary card-tier radii
// onto the scale; `TYPE` and `RADIUS` were added as the tokens new code should reach for.
//
// Nothing else in the battery can catch a regression here — a stray 12.5px renders fine, breaks no
// test, and is invisible in a screenshot. So this is a source-level check, and deliberately narrow:
// it asserts only what is unambiguous (no half-pixel type; the tokens still exist), NOT that every
// call site uses a token. Blanket-enforcing the tokens would fail on the ~800 legitimate existing
// literals and on the intentionally-off-scale display numerals.
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "src/App.jsx"), "utf8");
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

// ── 1. No half-pixel font sizes ──────────────────────────────────────────────────────────────
const halfPx = [...src.matchAll(/fontSize:\s*([0-9]+\.5)(?![0-9])/g)].map(m => m[1]);
check("no half-pixel font sizes (8.5/12.5/… are invisible next to their neighbour and arbitrary)",
  halfPx.length === 0,
  halfPx.length ? `${halfPx.length} found: ${[...new Set(halfPx)].sort().join(", ")}` : "");

// ── 1b. No 8px or 9px font sizes ─────────────────────────────────────────────────────────────
// Retired on request (Aug 2026): both sit below an 11px "undersized UI text" floor. 62 sites (17
// at 8, 45 at 9 — stat-tile labels, section kickers, axis labels, badge text) were snapped UP to
// 10 (`tiny`), never down, so nothing shrank. `micro: 9` stays defined as a token (see the comment
// above it) but must never be reintroduced as a literal.
const tiny89 = [...src.matchAll(/fontSize:\s*([89])(?![0-9])/g)].map(m => m[1]);
check("no 8px or 9px literal font sizes (retired below the 11px floor, snapped up to 10)",
  tiny89.length === 0,
  tiny89.length ? `${tiny89.length} found: ${[...new Set(tiny89)].sort().join(", ")}` : "");

// ── 2. The tokens still exist and keep their documented shape ────────────────────────────────
const typeMatch = src.match(/const TYPE = \{([^}]*)\}/);
const radiusMatch = src.match(/const RADIUS = \{([^}]*)\}/);
check("the TYPE scale token exists", !!typeMatch);
check("the RADIUS scale token exists", !!radiusMatch);
if (typeMatch) {
  const keys = [...typeMatch[1].matchAll(/(\w+):/g)].map(m => m[1]);
  check("TYPE keeps its eight documented steps",
    ["micro","tiny","small","base","body","lg","xl","hero"].every(k => keys.includes(k)), keys.join(","));
}
if (radiusMatch) {
  const keys = [...radiusMatch[1].matchAll(/(\w+):/g)].map(m => m[1]);
  check("RADIUS keeps its six documented steps",
    ["xs","sm","md","lg","xl","pill"].every(k => keys.includes(k)), keys.join(","));
}

// ── 3. The one-off card-tier radii stay retired ──────────────────────────────────────────────
// 13/15/28 were each used once or twice and had no relationship to any other value. Deliberately
// NOT checked here: 17, 19, 22, 26, 44 and 2-5 — those are circle and capsule geometry (half of a
// 34px button, half of an 88px avatar, half-height on a 6px bar), not card corners, and snapping
// them onto a card scale would change their shape for no design gain.
for (const v of [13, 15, 28]) {
  const hits = [...src.matchAll(new RegExp(`borderRadius:\\s*${v}(?![0-9])`, "g"))].length;
  check(`the arbitrary ${v}px card radius stays retired`, hits === 0, `${hits} use(s) reintroduced`);
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
