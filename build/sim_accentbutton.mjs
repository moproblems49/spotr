// TEXT PAINTED ON A SOLID C.accent FILL MUST NOT BE A HARDCODED "#fff" OR C.onPrimary/C.onAccent.
//
// Mo: "buttons that are lime, you can barely see the white text" — and a screenshot of the New
// Post Share button reading as a near-invisible light pill. Traced to three overlapping bugs, all
// the same root cause: `background:C.accent` (volt) paired with text that assumes the fill is
// always dark.
//   1. Hardcoded `color:"#fff"` — fails 1.31:1 on the DARK theme, because C.accent there is a light
//      lime, not a dark colour. Found on 10 buttons/badges (Share, confirmAction, Import & Set
//      Active x2, Choose close friends, switchTab, the story-viewer name/bio, two badge circles).
//   2. `color:C.onPrimary` on a `background:C.accent` fill — a MISMATCHED pair. C.onPrimary is
//      calibrated for C.primary (near-black on light, near-white on dark), not for C.accent (a
//      lime FILL on both themes). Its light value is white, which is 3.09:1 on the light accent
//      fill. Found on 6 more sites (ONE REP MAX slab, Save x2, Use photo, avatar initials, the
//      plus-avatar-edit badge).
//   3. The Share button's INACTIVE state was hardcoded white on C.divider — 1.18:1 on the light
//      theme, worse than the active-state bug it was sitting next to.
//
// Fix: every BUTTON that filled with C.accent switched to the neutral C.primary/C.onPrimary pair
// (matching Save/Edit-toggle/Start-Workout, already established this session). Every INFORMATIONAL
// element that stays on the accent fill (the ONE REP MAX slab, avatar initials, badge circles, the
// story fallback) uses the `C.isDark ? C.onAccent : C.text` idiom Avatar() already established —
// onAccent's dark value already equals onPrimary's dark value, so this only changes light theme.
//
// This is a source-level check: it can't render every one of these onto a real accent-lime pixel
// and measure it (that's what shot-based audits are for), but it CAN assert the two textual
// patterns that caused every one of these bugs never recur.
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "src/App.jsx"), "utf8");
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

// 1. No `background:C.accent` within the same style object as a hardcoded `color:"#fff"`.
const accentSites = [...src.matchAll(/background:\s*C\.accent(?!Soft|Ink|2)\b/g)];
let hardcodedWhite = 0;
for (const m of accentSites) {
  const window = src.slice(Math.max(0, m.index - 60), m.index + 260);
  const objEnd = window.indexOf("}}");
  const scoped = objEnd === -1 ? window : window.slice(0, objEnd);
  if (/color:\s*"#fff"/.test(scoped)) hardcodedWhite++;
}
check("1. no background:C.accent style object also hardcodes color:\"#fff\"",
  hardcodedWhite === 0, `${hardcodedWhite} site(s) still pair a hardcoded white with the accent fill`);

// 2. No `background:C.accent` paired with `color:C.onPrimary` — the mismatched-token bug.
let mismatchedOnPrimary = 0;
for (const m of accentSites) {
  const window = src.slice(Math.max(0, m.index - 60), m.index + 260);
  const objEnd = window.indexOf("}}");
  const scoped = objEnd === -1 ? window : window.slice(0, objEnd);
  if (/color:\s*C\.onPrimary\b/.test(scoped)) mismatchedOnPrimary++;
}
check("2. no background:C.accent style object pairs color:C.onPrimary (mismatched token)",
  mismatchedOnPrimary === 0, `${mismatchedOnPrimary} site(s) still pair the wrong ink token`);

console.log(`   (${accentSites.length} background:C.accent sites scanned)`);
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
