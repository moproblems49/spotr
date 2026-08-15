// NO IDENTIFIER IN App.jsx MAY RESOLVE TO NOTHING.
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
// Transforms the JSX away with esbuild, then runs build/undef_scan.mjs over the result.
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const BUILD = dirname(fileURLToPath(import.meta.url));
const ROOT = join(BUILD, "..");
const tmp = mkdtempSync(join(tmpdir(), "undef-"));
const out = join(tmp, "app.transformed.js");
let code = 1;
try {
  const t = spawnSync("npx", ["esbuild", "src/App.jsx", "--loader:.jsx=jsx", "--format=esm",
    "--jsx=automatic", `--outfile=${out}`], { cwd: ROOT, encoding: "utf8" });
  if (t.status !== 0) {
    console.log("FAIL could not transform src/App.jsx");
    console.log((t.stderr || "").split("\n").slice(0, 6).join("\n"));
  } else {
    const r = spawnSync(process.execPath, [join(BUILD, "undef_scan.mjs"), out], { encoding: "utf8" });
    process.stdout.write(r.stdout || "");
    if (r.status === 0) { console.log("PASS every identifier in App.jsx resolves to a binding or a known global"); code = 0; }
    else console.log("FAIL App.jsx references at least one identifier that is not defined anywhere");
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(code);
