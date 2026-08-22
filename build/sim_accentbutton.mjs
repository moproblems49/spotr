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
//
// SCANS src/App.jsx AND src/lazy/*.jsx. It was App.jsx-only for a while, which is exactly how two
// Follow buttons in DiscoverScreen.jsx (extracted to src/lazy/ during the code-splitting pass)
// carried this same bug — background:C.accent + hardcoded color:"#fff" in a ternary, the precise
// shape check 5 below already exists to catch — completely invisible to this file because it never
// read anything outside App.jsx. A design-critique pass found it by reading the component, not by
// running this. Any new lazy-loaded screen is covered automatically since this globs the directory.
import { readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  { path: "src/App.jsx", src: readFileSync(join(ROOT, "src/App.jsx"), "utf8") },
  ...readdirSync(join(ROOT, "src/lazy"))
    .filter(f => f.endsWith(".jsx"))
    .map(f => ({ path: `src/lazy/${f}`, src: readFileSync(join(ROOT, "src/lazy", f), "utf8") })),
];

let fails = 0;
let totalAccentSites = 0, totalPropSites = 0, totalBgValueSites = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

for (const { path, src } of targets) {
  // 1. No `background:C.accent` within the same style object as a hardcoded `color:"#fff"`.
  const accentSites = [...src.matchAll(/background:\s*C\.accent(?!Soft|Ink|2)\b/g)];
  totalAccentSites += accentSites.length;
  let hardcodedWhite = 0;
  for (const m of accentSites) {
    const window = src.slice(Math.max(0, m.index - 60), m.index + 260);
    const objEnd = window.indexOf("}}");
    const scoped = objEnd === -1 ? window : window.slice(0, objEnd);
    if (/color:\s*"#fff"/.test(scoped)) hardcodedWhite++;
  }
  check(`[${path}] 1. no background:C.accent style object also hardcodes color:"#fff"`,
    hardcodedWhite === 0, `${hardcodedWhite} site(s) still pair a hardcoded white with the accent fill`);

  // 2. No `background:C.accent` paired with `color:C.onPrimary` — the mismatched-token bug.
  let mismatchedOnPrimary = 0;
  for (const m of accentSites) {
    const window = src.slice(Math.max(0, m.index - 60), m.index + 260);
    const objEnd = window.indexOf("}}");
    const scoped = objEnd === -1 ? window : window.slice(0, objEnd);
    if (/color:\s*C\.onPrimary\b/.test(scoped)) mismatchedOnPrimary++;
  }
  check(`[${path}] 2. no background:C.accent style object pairs color:C.onPrimary (mismatched token)`,
    mismatchedOnPrimary === 0, `${mismatchedOnPrimary} site(s) still pair the wrong ink token`);

  // 3. The same two mistakes in PROP form. Checks 1-2 only look inside `{{ ... }}` style objects,
  // which is a real blind spot: NumberPad's Next key — the button pressed after every single set —
  // passed the accent fill and the wrong ink as PROPS (`bg={C.accent} color={C.onPrimary}`), which
  // is 3.09:1 on the light theme, and both checks above reported the file clean for months. An audit
  // found it by reading the component, not by running this.
  const propSites = [...src.matchAll(/bg=\{\s*C\.accent(?!Soft|Ink|2)\b\s*\}/g)];
  totalPropSites += propSites.length;
  let badProps = 0;
  for (const m of propSites) {
    // Props sit on one element; a ~200-char window covers the tag without spilling into the next.
    const scoped = src.slice(Math.max(0, m.index - 120), m.index + 120);
    if (/color=\{\s*C\.onPrimary\s*\}/.test(scoped) || /color=\{?\s*"#fff"/.test(scoped)) badProps++;
  }
  check(`[${path}] 3. no bg={C.accent} element pairs color={C.onPrimary} or a hardcoded white`,
    badProps === 0, `${badProps} site(s) pass the accent fill with the wrong ink as props`);

  // 4. `Icon` defaults to currentColor, so an explicit color prop OVERRIDES the parent's ink. The
  // avatar-edit badge's fix shipped inert for exactly this reason: the wrapper was corrected to
  // `C.isDark ? C.onAccent : C.text` while the Icon inside kept `color={C.onPrimary}`, so nothing
  // changed and check 2 above reported the site as fixed. An accent-filled wrapper must not hand its
  // icon a contradicting colour.
  let overriddenIcon = 0;
  for (const m of accentSites) {
    const scoped = src.slice(m.index, m.index + 420);
    const tagEnd = scoped.indexOf("</div>");
    const el = tagEnd === -1 ? scoped : scoped.slice(0, tagEnd);
    if (/C\.isDark\s*\?\s*C\.onAccent/.test(el) && /<Icon[^>]*color=\{\s*C\.onPrimary\s*\}/.test(el)) overriddenIcon++;
  }
  check(`[${path}] 4. no accent-filled wrapper is undone by an Icon color prop that overrides its ink`,
    overriddenIcon === 0, `${overriddenIcon} site(s) set the right ink then override it on the Icon`);

  // 5. C.accent ANYWHERE inside a `background:` VALUE EXPRESSION, not just immediately after the
  // colon — checks 1/2 only match `background:\s*C.accent` and so are blind to a ternary
  // (`background:(isFollowing||requestPending)?"transparent":C.accent`), which is exactly how the
  // Profile Follow button's 1.31:1/3.09:1 pairing survived both checks for months (and, separately,
  // how DiscoverScreen.jsx's own Follow buttons survived — this file not scanning src/lazy/ at all
  // until now). Scoped to the `background:`/`color:` VALUE (up to the next comma or closing brace),
  // not the whole style object, so a ternary's accent branch and a ternary's white/onPrimary branch
  // in the SAME declaration are what gets flagged — deliberately a little eager (it can't correlate
  // which ternary branch pairs with which), matching this file's existing bias toward over-flagging
  // something a human then reads once, over staying silent on a real bug.
  // Strip comments first — a source-level regex this broad ("background:" followed by loose text)
  // will otherwise match prose describing an already-fixed bug (this file has several: past fixes
  // are documented in comments that literally contain the old `background:BLUE`/`color:"#fff"`
  // strings as evidence of what shipped). Block comments only; this codebase's style-object lines
  // don't contain `//`.
  const srcNoComments = src.replace(/\/\*[\s\S]*?\*\//g, m => " ".repeat(m.length));
  const bgValueSites = [...srcNoComments.matchAll(/background:\s*([^,}]+)/g)]
    .filter(m => /C\.accent(?!Soft|Ink|2)\b/.test(m[1]));
  totalBgValueSites += bgValueSites.length;
  let ternaryMismatch = 0;
  for (const m of bgValueSites) {
    const window = srcNoComments.slice(Math.max(0, m.index - 60), m.index + 320);
    const objEnd = window.indexOf("}}");
    const scoped = objEnd === -1 ? window : window.slice(0, objEnd);
    const colorMatch = scoped.match(/color:\s*([^,}]+)/);
    if (!colorMatch) continue;
    if (/"#fff"|C\.onPrimary\b/.test(colorMatch[1])) ternaryMismatch++;
  }
  check(`[${path}] 5. no C.accent inside a background: VALUE EXPRESSION (incl. a ternary branch) pairs with a color: expression containing "#fff"/C.onPrimary`,
    ternaryMismatch === 0, `${ternaryMismatch} site(s) hide the check-1/2 bug inside a ternary`);
}

console.log(`   (${targets.length} file(s) scanned: ${targets.map(t => t.path).join(", ")})`);
console.log(`   (${totalAccentSites} background:C.accent sites + ${totalPropSites} bg={C.accent} prop sites + ${totalBgValueSites} background-value-expression sites scanned)`);
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
