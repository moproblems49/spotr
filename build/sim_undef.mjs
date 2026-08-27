// NO IDENTIFIER IN App.jsx (OR src/lazy/*.jsx) MAY RESOLVE TO NOTHING.
//
// Two shipped bugs of this exact shape were found on 2026-08-15, both invisible to the whole
// battery and to esbuild (which resolves imports, not free variables):
//
//   PROGRAM_TEMPLATES — deleted by 90927ed as collateral damage while three references stayed.
//                       Read at the top of the Onboarding component body, so EVERY new signup
//                       got the error boundary instead of the first screen. Live for 12 days.
//   todayMs           — read twice in buildCoachContext, declared only inside a DIFFERENT
//                       function. The second read is unconditional, so the weekly review always
//                       threw, and the caller's catch turned it into a silent "error" state.
//
// A free identifier is a ReferenceError, not undefined, and this app swallows those everywhere —
// error boundaries, and the many `catch (e) {}` blocks the conventions file warns about. So the
// whole class needs a static check rather than another test per feature.
//
// COVERS src/lazy/*.jsx TOO, as of the Aug 20 code-splitting pass — those files gained a
// hand-written `import {...} from "../App.jsx"` list each, which is exactly the kind of
// free-identifier-prone edit this check exists for, and a cold-context audit specifically flagged
// that this file only checked App.jsx. undef_scan.mjs treats `import` specifiers as real bindings
// (acorn's own module scoping), so it can't tell you an imported name isn't ACTUALLY exported from
// App.jsx — that half is covered by `npm run build` (a real SyntaxError on a bad/missing export).
// This half catches the free-variable case: something referenced that's neither a prop, a local,
// an import, nor a known global.
//
// Transforms the JSX away with esbuild (each file independently — a lazy file's relative import of
// "../App.jsx" doesn't need to resolve for this scan, since imported names are just bindings to
// acorn), then runs build/undef_scan.mjs over each result.
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const BUILD = dirname(fileURLToPath(import.meta.url));
const ROOT = join(BUILD, "..");
const tmp = mkdtempSync(join(tmpdir(), "undef-"));

const lazyDir = join(ROOT, "src", "lazy");
let lazyFiles = [];
try { lazyFiles = readdirSync(lazyDir).filter(f => f.endsWith(".jsx")).map(f => join("src", "lazy", f)); } catch {}

// src/engine/*.js must be in here. Extracting the health engine out of App.jsx moved ~1,500 lines
// of the most-simulated code in the repo OUT of this guard, which is the standing alarm for the
// dominant ReferenceError class ("run it after deleting anything"). A scan that silently stops
// covering code as that code moves is worse than no scan, because the green tick still appears.
const engineDir = join(ROOT, "src", "engine");
let engineFiles = [];
try { engineFiles = readdirSync(engineDir).filter(f => f.endsWith(".js")).map(f => join("src", "engine", f)); } catch {}

const targets = ["src/App.jsx", ...lazyFiles, ...engineFiles];
let overallCode = 0;

for (const rel of targets) {
  const out = join(tmp, basename(rel) + ".transformed.js");
  const t = spawnSync("npx", ["esbuild", rel, "--loader:.jsx=jsx", "--format=esm",
    "--jsx=automatic", `--outfile=${out}`], { cwd: ROOT, encoding: "utf8" });
  if (t.status !== 0) {
    console.log(`FAIL could not transform ${rel}`);
    console.log((t.stderr || "").split("\n").slice(0, 6).join("\n"));
    overallCode = 1;
    continue;
  }
  const r = spawnSync(process.execPath, [join(BUILD, "undef_scan.mjs"), out], { encoding: "utf8" });
  process.stdout.write((r.stdout || "").trimEnd() ? `[${rel}] ${(r.stdout || "").trim()}\n` : "");
  if (r.status === 0) {
    console.log(`PASS ${rel}: every identifier resolves to a binding or a known global`);
  } else {
    console.log(`FAIL ${rel}: references at least one identifier that is not defined anywhere`);
    overallCode = 1;
  }
}

rmSync(tmp, { recursive: true, force: true });
if (overallCode === 0) console.log(`\nPASS all ${targets.length} file(s) clean`);
process.exit(overallCode);
