// NO UI MAY BE UNREACHABLE, AND NO COMPONENT MAY BE ORPHANED.
//
// Two features shipped fully built with no way to open them:
//
//   showGroupShare      — a complete "send this workout to groups only" picker plus its
//                         finishWorkout fast path. `setShowGroupShare(true)` existed in no commit.
//                         Dead from 2026-07-05 until it was wired on 2026-08-16.
//   ExerciseMergeTool   — an 89-line Settings tool, its own comment calling it one, never rendered.
//                         It merges free-typed exercise names into library entries, which is the
//                         documented fix for names that contribute nothing to the muscle map and
//                         split their PRs.
//
// Both were invisible to every test because a test can only exercise UI it can reach. The check is
// static instead: build/deadui_scan.mjs walks the AST for useState setters that can never open
// what they gate, and for PascalCase functions nobody references.
//
// COVERS src/lazy/*.jsx TOO, as of the Aug 20 code-splitting pass. deadui_scan.mjs excludes each
// file's own `export default function X` from the "unused component" check (that's a false
// positive by construction — see the comment at its exclusion), so only the "unreachable state"
// half of the check runs meaningfully on a lazy file; that half is exactly as valid there as in
// App.jsx (a useState gate that nothing can ever open is the same bug regardless of which file it
// lives in).
//
// Runs the scan over the JSX-transformed file(s) and fails on any finding.
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const BUILD = dirname(fileURLToPath(import.meta.url));
const ROOT = join(BUILD, "..");
const tmp = mkdtempSync(join(tmpdir(), "deadui-"));

const lazyDir = join(ROOT, "src", "lazy");
let lazyFiles = [];
try { lazyFiles = readdirSync(lazyDir).filter(f => f.endsWith(".jsx")).map(f => join("src", "lazy", f)); } catch {}

const targets = ["src/App.jsx", ...lazyFiles];
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
  const r = spawnSync(process.execPath, [join(BUILD, "deadui_scan.mjs"), out], { encoding: "utf8" });
  const outText = (r.stdout || "").trim();
  if (outText) console.log(`[${rel}]\n${outText}`);
  if (r.status === 0) {
    console.log(`PASS ${rel}: no unreachable UI state, no orphaned components`);
  } else {
    console.log(`FAIL ${rel}: something is built but cannot be reached — see above`);
    overallCode = 1;
  }
}

rmSync(tmp, { recursive: true, force: true });
if (overallCode === 0) console.log(`\nPASS all ${targets.length} file(s) clean`);
process.exit(overallCode);
