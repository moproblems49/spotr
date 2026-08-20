// FIND UI THAT NOTHING CAN REACH.
//
// `showGroupShare` had a complete picker sheet, a complete finishWorkout fast path, and a "Back"
// button returning to the Finish modal it was never opened from. `setShowGroupShare(true)` did not
// exist in ANY commit — the whole feature shipped in 02ab7f3 and sat dead for six weeks. The tell
// was mechanical: the setter was called, but only ever with `false`.
//
// Two checks, both on the JSX-transformed file (so `<Foo/>` has become `jsx(Foo, …)` and every
// component use is a plain identifier reference):
//
//   1. UNREACHABLE STATE — a useState setter that is never called with anything that could open
//      whatever it gates. Only reported when the setter never ESCAPES as a value (passed as a
//      prop, stored in a ref), because once it escapes it can be called under another name and
//      nothing here can follow it.
//   2. UNUSED COMPONENTS — a PascalCase function declared and never referenced.
//
// Usage:  node build/deadui_scan.mjs [transformed.js]
// Exits 1 if anything is found.
import { readFileSync } from "fs";
import * as acorn from "acorn";

const FILE = process.argv[2] || "/tmp/app.transformed.js";
const ast = acorn.parse(readFileSync(FILE, "utf8"), { ecmaVersion: "latest", sourceType: "module", locations: true });

const states = new Map();      // setterName -> { state, line }
const setterCalls = new Map(); // setterName -> [{ kind, line }]
const escaped = new Set();     // setter referenced as a value, not called
const ambiguous = new Set();   // setter name declared by more than one useState — cannot conclude
const declaredFns = new Map(); // PascalCase fn name -> line
const idRefs = new Map();      // identifier -> count of non-declaration references

const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

// How "openable" is this argument? A literal false/null/undefined/0 can only ever CLOSE.
function argKind(a) {
  if (!a) return "none";                                   // setX() — closes
  if (a.type === "Literal") {
    if (a.value === false || a.value === null || a.value === 0 || a.value === "") return "falsy";
    return "truthy";
  }
  if (a.type === "Identifier" && a.name === "undefined") return "falsy";
  if (a.type === "UnaryExpression" && a.operator === "!" ) return "dynamic";
  return "dynamic";                                        // variable, object, arrow, ternary…
}

// Identifiers that are BINDING SITES, not references. Collected up front because a destructured
// setter (`const [showX, setShowX] = useState(false)`) sits inside an ArrayPattern, whose parent is
// the pattern and NOT the VariableDeclarator — so a naive "is parent a declarator?" test treats the
// binding as a reference, marks the setter as escaped, and skips it. That is precisely how the
// first version of this scanner failed to catch showGroupShare, the bug it was written for.
const bindings = new Set();
function collectPattern(n) {
  if (!n || typeof n.type !== "string") return;
  if (n.type === "Identifier") { bindings.add(n); return; }
  for (const k of Object.keys(n)) {
    if (k === "type" || k === "loc" || k === "start" || k === "end") continue;
    const v = n[k];
    if (Array.isArray(v)) v.forEach(collectPattern);
    else if (v && typeof v.type === "string") collectPattern(v);
  }
}
function preScan(node) {
  if (!node || typeof node.type !== "string") return;
  if (node.type === "VariableDeclarator") collectPattern(node.id);
  if (/Function(Declaration|Expression)|ArrowFunctionExpression/.test(node.type))
    (node.params || []).forEach(collectPattern);
  for (const k of Object.keys(node)) {
    if (k === "type" || k === "loc" || k === "start" || k === "end") continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach(preScan);
    else if (v && typeof v.type === "string") preScan(v);
  }
}
preScan(ast);

function walk(node, parent) {
  if (!node || typeof node.type !== "string") return;

  // const [x, setX] = useState(...)
  if (node.type === "VariableDeclarator" && node.id?.type === "ArrayPattern"
      && node.init?.type === "CallExpression"
      && ((node.init.callee.type === "Identifier" && /^useState$/.test(node.init.callee.name))
          || (node.init.callee.type === "MemberExpression" && node.init.callee.property?.name === "useState"))) {
    const [s, setter] = node.id.elements || [];
    if (s?.type === "Identifier" && setter?.type === "Identifier") {
      // THE INITIAL VALUE COUNTS AS AN OPENING. `useState(true)` is already "open" at mount, so a
      // setter that only ever receives `false` is correct there, not dead — `authLoading` is the
      // boot spinner and was reported as unreachable until this was taken into account. Only state
      // that starts CLOSED and can never be opened is a finding.
      const initTruthy = argKind(node.init.arguments[0]) !== "falsy"
        && argKind(node.init.arguments[0]) !== "none";
      // Keyed by NAME, globally — and 20 setter names in this file are declared more than once
      // (setLoading x4, setError x3 …). A second, live declaration used to overwrite the first,
      // masking a genuinely dead one and reporting the wrong line. Track the duplicates and refuse
      // to draw a conclusion about any name that is declared more than once.
      if (states.has(setter.name)) ambiguous.add(setter.name);
      states.set(setter.name, { state: s.name, line: node.loc.start.line, initTruthy });
    }
  }

  // `export default function X(){}` is used BY CONSTRUCTION — its whole job is to be imported
  // elsewhere (src/lazy/*.jsx, since the Aug 20 code-splitting pass), and that reference is
  // invisible to a single-file scan (a dynamic `import()` never writes the identifier "X" anywhere
  // in the importing file either — App.jsx just calls it "X" locally after `lazy(() =>
  // import(...))`, no name from the source module crosses the boundary as text this scanner could
  // find). Without this exclusion every one of those files would report its own default export as
  // an unused component, every single time — a guaranteed false positive, not a real finding.
  const isDefaultExport = parent?.type === "ExportDefaultDeclaration";
  if (node.type === "FunctionDeclaration" && node.id && /^[A-Z]/.test(node.id.name) && !isDefaultExport)
    declaredFns.set(node.id.name, node.loc.start.line);
  // ALSO cover `const X = memo(function X(){})`, `const X = () => …` and `const X = function(){}`.
  // Only FunctionDeclarations were considered at first, which left 95 of this file's PascalCase
  // components invisible — PostCard, SetRow, ExerciseInput and MuscleIcon are all memo(...), so
  // orphaning any of them kept the scan green.
  if (node.type === "VariableDeclarator" && node.id?.type === "Identifier"
      && /^[A-Z]/.test(node.id.name) && node.init) {
    const i = node.init;
    const isComp = i.type === "ArrowFunctionExpression" || i.type === "FunctionExpression"
      || (i.type === "CallExpression" && i.callee.type === "Identifier" && /^(memo|forwardRef)$/.test(i.callee.name));
    if (isComp) declaredFns.set(node.id.name, node.loc.start.line);
  }

  if (node.type === "CallExpression" && node.callee.type === "Identifier") {
    const n = node.callee.name;
    if (!setterCalls.has(n)) setterCalls.set(n, []);
    setterCalls.get(n).push({ kind: argKind(node.arguments[0]), line: node.loc.start.line });
  }

  if (node.type === "Identifier" && parent) {
    const p = parent.type;
    const isDecl = bindings.has(node)
      || (p === "FunctionDeclaration" && parent.id === node)
      || (p === "VariableDeclarator" && parent.id === node)
      || (p === "MemberExpression" && parent.property === node && !parent.computed)
      || (p === "Property" && parent.key === node && !parent.computed);
    const isCallee = p === "CallExpression" && parent.callee === node;
    if (!isDecl) {
      bump(idRefs, node.name);
      // A setter used anywhere that is NOT the callee of a call has escaped: it is being passed
      // somewhere and may be invoked under a different name.
      if (!isCallee) escaped.add(node.name);
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

// ── 1. Setters that can never open anything ──────────────────────────────────────────────────
const unreachable = [];
for (const [setter, info] of states) {
  if (escaped.has(setter)) continue;                       // passed around — can't conclude
  if (ambiguous.has(setter)) continue;                     // name reused — see the note above
  const calls = setterCalls.get(setter) || [];
  if (!calls.length) {
    // Never called AND never read is just an unused declaration, not an unreachable feature.
    // Distinguish them: the dangerous case is state with UI behind it that nothing can open.
    const reads = (idRefs.get(info.state) || 0);
    unreachable.push({ setter, ...info,
      why: reads > 0 ? `setter never called, but the state is read ${reads}x — UI that cannot open`
                     : "declared and never used at all (dead variable)" });
    continue;
  }
  if (info.initTruthy) continue;                           // starts open — see argKind note above
  const canOpen = calls.some(c => c.kind === "truthy" || c.kind === "dynamic");
  if (!canOpen) unreachable.push({ setter, ...info, why: `called ${calls.length}x, always with a falsy value` });
}

// ── 2. Components declared and never used ────────────────────────────────────────────────────
const unusedFns = [];
for (const [name, line] of declaredFns) {
  if ((idRefs.get(name) || 0) === 0) unusedFns.push({ name, line });
}

let bad = 0;
if (unreachable.length) {
  bad += unreachable.length;
  console.log(`${unreachable.length} piece(s) of state that nothing can open:\n`);
  for (const u of unreachable) console.log(`  line ${u.line}: ${u.state} / ${u.setter} — ${u.why}`);
  console.log();
}
if (unusedFns.length) {
  bad += unusedFns.length;
  console.log(`${unusedFns.length} component(s) declared and never referenced:\n`);
  for (const f of unusedFns) console.log(`  line ${f.line}: ${f.name}`);
  console.log();
}
if (!bad) console.log("No unreachable UI state and no unused components.");
// Say what was NOT examined, so a clean run is not read as "no dead UI anywhere". This covers one
// shape: boolean useState gates whose setter is called directly, plus unreferenced components.
// It cannot see UI gated on a ref or a reducer, a setter passed to a child that never calls it,
// a component referenced only from inside already-dead UI (there is no reachability closure), or
// a lazy `useState(() => false)` initialiser.
console.log(`  (scanned ${states.size} useState pairs, ${ambiguous.size} skipped as duplicate names, ` +
  `${escaped.size ? [...escaped].filter(n => states.has(n)).length : 0} skipped as escaped; ` +
  `${declaredFns.size} component declarations)`);
process.exit(bad ? 1 : 0);
