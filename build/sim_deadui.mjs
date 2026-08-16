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
// Runs the scan over the JSX-transformed file and fails on any finding.
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const BUILD = dirname(fileURLToPath(import.meta.url));
const ROOT = join(BUILD, "..");
const tmp = mkdtempSync(join(tmpdir(), "deadui-"));
const out = join(tmp, "app.transformed.js");
let code = 1;
try {
  const t = spawnSync("npx", ["esbuild", "src/App.jsx", "--loader:.jsx=jsx", "--format=esm",
    "--jsx=automatic", `--outfile=${out}`], { cwd: ROOT, encoding: "utf8" });
  if (t.status !== 0) {
    console.log("FAIL could not transform src/App.jsx");
    console.log((t.stderr || "").split("\n").slice(0, 6).join("\n"));
  } else {
    const r = spawnSync(process.execPath, [join(BUILD, "deadui_scan.mjs"), out], { encoding: "utf8" });
    process.stdout.write(r.stdout || "");
    if (r.status === 0) { console.log("PASS no unreachable UI state, no orphaned components"); code = 0; }
    else console.log("FAIL something is built but cannot be reached — see above");
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(code);
