// ICON-ONLY BUTTONS NEED AN ACCESSIBLE NAME. A sighted user reads the icon; a VoiceOver user hears
// nothing unless the button has visible text, an aria-label, or a title. This walks every
// jsx("button", {...}) / jsxs("button", {...}) call in the JSX-transformed bundle and flags ones
// whose props carry neither a text-bearing child nor an aria-label/title.
import { readFileSync } from "fs";
import * as acorn from "acorn";

const FILE = process.argv[2] || "/tmp/app.transformed.js";
const src = readFileSync(FILE, "utf8");
const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", locations: true });

const findings = [];
let totalButtons = 0;

function propsOf(objExpr) {
  const out = {};
  if (!objExpr || objExpr.type !== "ObjectExpression") return out;
  for (const p of objExpr.properties) {
    if (p.type !== "Property") continue;
    const key = p.key.type === "Identifier" ? p.key.name : (p.key.value ?? null);
    if (key) out[key] = p.value;
  }
  return out;
}

// Does this value look like it will render VISIBLE TEXT at runtime? Conservative: a string
// literal with real characters, a template literal, or a JSXText-equivalent (string) child. A
// bare identifier/expression (e.g. a variable, or another component) can't be judged statically,
// so those are NOT flagged — this scanner only reports what it can prove is icon-only.
function hasProvableText(node) {
  if (!node) return false;
  if (node.type === "Literal" && typeof node.value === "string" && node.value.trim()) return true;
  if (node.type === "TemplateLiteral") return node.quasis.some(q => (q.value.raw || "").trim());
  if (node.type === "ArrayExpression") return node.elements.some(hasProvableText);
  return false;
}

// Looser check for aria-label/title SPECIFICALLY: `aria-label={cond ? "Real label" : undefined}`
// is a correct, common pattern for a button whose action is itself conditional (e.g. only
// clickable when a name exists) — the label and the clickability are gated on the SAME condition,
// so when the button does nothing, VoiceOver correctly reads nothing extra either. Accept a
// ConditionalExpression whose CONSEQUENT has provable text, regardless of the alternate.
function hasAcceptableAriaLabel(node) {
  if (hasProvableText(node)) return true;
  if (node?.type === "ConditionalExpression") return hasProvableText(node.consequent);
  return false;
}

// Does this child look PROVABLY icon-only (a call to a known icon-shaped component/tag, with
// nothing else)? Named component calls (Icon, svg, PostKindIcon, MuscleIcon, etc.)
function isIconLikeCall(node) {
  if (!node || node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (callee.type !== "Identifier" || !/^(jsx|jsxs)$/.test(callee.name)) return false;
  const typeArg = node.arguments[0];
  const typeName = typeArg?.type === "Literal" ? typeArg.value
    : typeArg?.type === "Identifier" ? typeArg.name : null;
  if (!typeName) return false;
  return typeName === "svg" || /Icon$/.test(typeName);
}

function walk(node, parent) {
  if (!node || typeof node.type !== "string") return;

  if (node.type === "CallExpression" && node.callee.type === "Identifier"
      && /^(jsx|jsxs)$/.test(node.callee.name)) {
    const typeArg = node.arguments[0];
    const typeName = typeArg?.type === "Literal" ? typeArg.value : null;
    if (typeName === "button") {
      totalButtons++;
      const props = propsOf(node.arguments[1]);
      const hasAriaLabel = !!props["aria-label"] && hasAcceptableAriaLabel(props["aria-label"]);
      const hasTitle = !!props.title && hasAcceptableAriaLabel(props.title);
      const children = props.children;
      const childList = children?.type === "ArrayExpression" ? children.elements
        : children ? [children] : [];
      const hasTextChild = childList.some(hasProvableText);
      // Only flag when EVERY child is provably icon-shaped (svg/*Icon) and none is provable text,
      // and neither aria-label nor title is present. Anything with a non-provable child (a
      // variable, a ternary, another named component that might render text) is left alone —
      // false negatives are fine here, false positives waste the reader's trust.
      const allChildrenIconLike = childList.length > 0 && childList.every(isIconLikeCall);
      if (!hasAriaLabel && !hasTitle && !hasTextChild && allChildrenIconLike) {
        findings.push({ line: node.loc.start.line });
      }
    }
  }

  for (const k of Object.keys(node)) {
    if (k === "type" || k === "loc" || k === "start" || k === "end") continue;
    const v = node[k];
    if (Array.isArray(v)) for (const c of v) walk(c, node);
    else if (v && typeof v.type === "string") walk(v, node);
  }
}
walk(ast, null);

console.log(`Scanned ${totalButtons} <button> elements.`);
if (findings.length) {
  console.log(`\n${findings.length} icon-only button(s) with no aria-label/title (line numbers are in the TRANSFORMED file, cross-reference by content):`);
  findings.slice(0, 60).forEach(f => console.log(`  transformed-line ${f.line}`));
} else {
  console.log("No provably icon-only buttons without an accessible name.");
}
console.log(`\n(This only reports what it can PROVE is icon-only — buttons whose children are variables, ternaries, or non-Icon components are skipped rather than guessed at.)`);
