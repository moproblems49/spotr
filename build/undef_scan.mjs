// FIND IDENTIFIERS THAT RESOLVE TO NOTHING — the PROGRAM_TEMPLATES bug class.
//
// A bare identifier with no binding is a ReferenceError at the moment it is evaluated, and every
// one of the app's swallowing catches / error boundaries turns that into a blank screen or a
// silent no-op instead of a stack trace. `PROGRAM_TEMPLATES` sat undefined on main for twelve
// days that way, taking out onboarding for every new signup.
//
// Nothing in the toolchain reports this: esbuild resolves IMPORTS, not free variables, and the
// app has no linter. So: transform the JSX away (esbuild), parse with acorn, walk the scopes, and
// report any reference that binds to neither a local, a module import, nor a known global.
//
// Usage:  node build/undef_scan.mjs [transformed.js]
// Exits 1 if anything unresolved is found.
import { readFileSync } from "fs";
import * as acorn from "acorn";

const FILE = process.argv[2] || "/tmp/app.transformed.js";
const src = readFileSync(FILE, "utf8");
const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", locations: true });

// Globals the app legitimately uses. Anything NOT here and not declared is reported.
const GLOBALS = new Set([
  "globalThis","window","document","navigator","location","history","screen","console","localStorage",
  "sessionStorage","fetch","Headers","Request","Response","FormData","Blob","File","FileReader","URL",
  "URLSearchParams","AbortController","AbortSignal","WebSocket","EventSource","XMLHttpRequest",
  "setTimeout","clearTimeout","setInterval","clearInterval","requestAnimationFrame","cancelAnimationFrame",
  "requestIdleCallback","queueMicrotask","structuredClone","reportError",
  "Object","Array","String","Number","Boolean","Symbol","BigInt","Math","JSON","Date","RegExp","Error",
  "TypeError","RangeError","SyntaxError","ReferenceError","EvalError","URIError","AggregateError",
  "Promise","Map","Set","WeakMap","WeakSet","WeakRef","Proxy","Reflect","Intl","Function",
  "ArrayBuffer","SharedArrayBuffer","DataView","Int8Array","Uint8Array","Uint8ClampedArray","Int16Array",
  "Uint16Array","Int32Array","Uint32Array","Float32Array","Float64Array","BigInt64Array","BigUint64Array",
  "parseInt","parseFloat","isNaN","isFinite","encodeURIComponent","decodeURIComponent","encodeURI","decodeURI",
  "NaN","Infinity","undefined","escape","unescape","atob","btoa","crypto","performance","alert","confirm","prompt",
  "Image","Audio","Video","Option","Event","CustomEvent","MouseEvent","KeyboardEvent","TouchEvent","Touch",
  "PointerEvent","DOMPoint","DOMRect","DOMParser","XMLSerializer","Node","Element","HTMLElement","SVGElement",
  "Storage","IntersectionObserver","ResizeObserver","MutationObserver","PerformanceObserver",
  "CanvasRenderingContext2D","OffscreenCanvas","createImageBitmap","matchMedia","getComputedStyle",
  "process","module","exports","require","__dirname","__filename","Buffer","global","arguments",
  "Capacitor","importScripts","self","top","parent","frames","opener","name","status","onerror",
  "Notification","PushManager","ServiceWorker","caches","indexedDB","BroadcastChannel","MessageChannel",
]);

// ── scope machinery ──────────────────────────────────────────────────────────────────────────
const scopes = [{ vars: new Set(), fn: true, node: ast }];
const cur = () => scopes[scopes.length - 1];
function declare(name, kind) {
  if (!name) return;
  if (kind === "var" || kind === "function") {
    for (let i = scopes.length - 1; i >= 0; i--) { scopes[i].vars.add(name); if (scopes[i].fn) break; }
  } else cur().vars.add(name);
}
function resolved(name) {
  for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].vars.has(name)) return true;
  return GLOBALS.has(name);
}
// Every binding introduced by a destructuring/param pattern.
function bindPattern(node, kind) {
  if (!node) return;
  switch (node.type) {
    case "Identifier": declare(node.name, kind); break;
    case "ObjectPattern": for (const p of node.properties)
      bindPattern(p.type === "RestElement" ? p.argument : p.value, kind); break;
    case "ArrayPattern": for (const e of node.elements) if (e) bindPattern(e, kind); break;
    case "AssignmentPattern": bindPattern(node.left, kind); break;
    case "RestElement": bindPattern(node.argument, kind); break;
  }
}
// Hoist declarations visible in a body BEFORE walking it, so mutual/forward references resolve
// (the app calls plenty of functions declared further down the file).
function hoist(body) {
  for (const n of body || []) {
    if (!n) continue;
    if (n.type === "FunctionDeclaration" && n.id) declare(n.id.name, "function");
    else if (n.type === "ClassDeclaration" && n.id) declare(n.id.name, "let");
    else if (n.type === "VariableDeclaration") for (const d of n.declarations) bindPattern(d.id, n.kind);
    else if (n.type === "ImportDeclaration") for (const s of n.specifiers) declare(s.local.name, "let");
    else if (n.type === "ExportNamedDeclaration" && n.declaration) hoist([n.declaration]);
    else if (n.type === "ExportDefaultDeclaration" && n.declaration &&
             (n.declaration.type === "FunctionDeclaration" || n.declaration.type === "ClassDeclaration") &&
             n.declaration.id) declare(n.declaration.id.name, "function");
    else if (n.type === "LabeledStatement") hoist([n.body]);
    // var hoists out of blocks/loops/try, so recurse through statement containers
    else if (n.type === "BlockStatement") hoistVarsOnly(n.body);
    else if (n.type === "IfStatement") { hoistVarsOnly([n.consequent]); if (n.alternate) hoistVarsOnly([n.alternate]); }
    else if (/^(For|While|DoWhile)/.test(n.type)) hoistVarsOnly([n.body, n.init].filter(Boolean));
    else if (n.type === "TryStatement") { hoistVarsOnly([n.block, n.handler && n.handler.body, n.finalizer].filter(Boolean)); }
    else if (n.type === "SwitchStatement") for (const c of n.cases) hoistVarsOnly(c.consequent);
  }
}
function hoistVarsOnly(body) {
  for (const n of body || []) {
    if (!n) continue;
    if (n.type === "VariableDeclaration" && n.kind === "var") for (const d of n.declarations) bindPattern(d.id, "var");
    else if (n.type === "FunctionDeclaration" && n.id) declare(n.id.name, "var");
    else if (n.type === "BlockStatement") hoistVarsOnly(n.body);
    else if (n.type === "IfStatement") { hoistVarsOnly([n.consequent]); if (n.alternate) hoistVarsOnly([n.alternate]); }
    else if (/^(For|While|DoWhile)/.test(n.type)) hoistVarsOnly([n.body, n.init].filter(Boolean));
    else if (n.type === "TryStatement") hoistVarsOnly([n.block, n.handler && n.handler.body, n.finalizer].filter(Boolean));
    else if (n.type === "SwitchStatement") for (const c of n.cases) hoistVarsOnly(c.consequent);
    else if (n.type === "LabeledStatement") hoistVarsOnly([n.body]);
  }
}

const unresolved = new Map();   // name -> first {line, col}
const KEYS = n => Object.keys(n).filter(k => k !== "type" && k !== "loc" && k !== "start" && k !== "end");

function walk(node, parent) {
  if (!node || typeof node.type !== "string") return;
  const t = node.type;

  // Scope creators
  if (t === "FunctionDeclaration" || t === "FunctionExpression" || t === "ArrowFunctionExpression") {
    if (t !== "ArrowFunctionExpression" && node.id && t === "FunctionExpression") { /* named fn expr: id visible inside */ }
    scopes.push({ vars: new Set(), fn: true, node });
    if (t === "FunctionExpression" && node.id) declare(node.id.name, "let");
    for (const p of node.params) bindPattern(p, "let");
    if (node.body.type === "BlockStatement") { hoist(node.body.body); for (const s of node.body.body) walk(s, node); }
    else walk(node.body, node);
    scopes.pop(); return;
  }
  if (t === "BlockStatement") {
    scopes.push({ vars: new Set(), fn: false, node });
    hoist(node.body); for (const s of node.body) walk(s, node);
    scopes.pop(); return;
  }
  if (t === "CatchClause") {
    scopes.push({ vars: new Set(), fn: false, node });
    if (node.param) bindPattern(node.param, "let");
    hoist(node.body.body); for (const s of node.body.body) walk(s, node);
    scopes.pop(); return;
  }
  if (t === "ForStatement" || t === "ForInStatement" || t === "ForOfStatement") {
    scopes.push({ vars: new Set(), fn: false, node });
    if (node.init) { if (node.init.type === "VariableDeclaration") { for (const d of node.init.declarations) bindPattern(d.id, node.init.kind); for (const d of node.init.declarations) if (d.init) walk(d.init, node); } else walk(node.init, node); }
    if (node.left) { if (node.left.type === "VariableDeclaration") { for (const d of node.left.declarations) bindPattern(d.id, node.left.kind); } else walk(node.left, node); }
    if (node.right) walk(node.right, node);
    if (node.test) walk(node.test, node);
    if (node.update) walk(node.update, node);
    walk(node.body, node);
    scopes.pop(); return;
  }
  if (t === "ClassDeclaration" || t === "ClassExpression") {
    if (node.id) declare(node.id.name, "let");
    if (node.superClass) walk(node.superClass, node);
    scopes.push({ vars: new Set(), fn: false, node });
    walk(node.body, node); scopes.pop(); return;
  }
  if (t === "VariableDeclaration") {
    for (const d of node.declarations) { bindPattern(d.id, node.kind); if (d.init) walk(d.init, node); }
    return;
  }
  // Reference sites
  if (t === "Identifier") {
    if (parent) {
      const p = parent.type;
      // not a reference: property names, non-computed members, labels, keys
      if (p === "MemberExpression" && parent.property === node && !parent.computed) return;
      if (p === "Property" && parent.key === node && !parent.computed) return;
      if (p === "PropertyDefinition" && parent.key === node && !parent.computed) return;
      if (p === "MethodDefinition" && parent.key === node && !parent.computed) return;
      if (p === "LabeledStatement" || p === "BreakStatement" || p === "ContinueStatement") return;
      if (p === "ExportSpecifier" || p === "ImportSpecifier" || p === "ImportDefaultSpecifier"
          || p === "ImportNamespaceSpecifier") return;
      if (p === "MetaProperty") return;
    }
    if (!resolved(node.name) && !unresolved.has(node.name))
      unresolved.set(node.name, { line: node.loc.start.line, col: node.loc.start.column });
    return;
  }
  if (t === "MemberExpression") { walk(node.object, node); if (node.computed) walk(node.property, node); return; }
  if (t === "Property") { if (node.computed) walk(node.key, node); walk(node.value, node); return; }

  for (const k of KEYS(node)) {
    const v = node[k];
    if (Array.isArray(v)) for (const c of v) walk(c, node);
    else if (v && typeof v.type === "string") walk(v, node);
  }
}

hoist(ast.body);
for (const s of ast.body) walk(s, ast);

const found = [...unresolved.entries()].sort((a, b) => a[1].line - b[1].line);
if (!found.length) { console.log("No unresolved identifiers."); process.exit(0); }
console.log(`${found.length} unresolved identifier(s) in ${FILE}:\n`);
for (const [name, at] of found) console.log(`  ${String(at.line).padStart(6)}:${at.col}  ${name}`);
console.log("\nEach is a ReferenceError the moment that line runs.");
process.exit(1);
