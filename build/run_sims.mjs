#!/usr/bin/env node
// Run the whole sim battery and report one verdict. Use this before any commit that touches
// workout, health, profile, feed or gesture code.
//
//   node build/run_sims.mjs             rebuild the bundle, then run everything
//   node build/run_sims.mjs --no-build  skip the rebuild if you just built
//
// It rebuilds by default rather than trusting whatever is on disk: a STALE build/app.mjs is the
// single most common cause of a false failure here. It also runs each sim bare and reads its real
// exit code — piping a sim into `tail` reports TAIL's status, not the sim's, which has masked a
// genuine failure in this repo before.
import { readdirSync } from "fs";
import { execFileSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const BUILD = dirname(fileURLToPath(import.meta.url));
const REPO = join(BUILD, "..");

if (!process.argv.includes("--no-build")) {
  process.stdout.write("Rebuilding build/app.mjs ... ");
  try {
    execFileSync("npx", ["esbuild", "src/App.jsx", "--bundle", "--format=esm", "--loader:.jsx=jsx",
      "--jsx=automatic", "--outfile=build/app.mjs", "--external:react", "--external:react-dom",
      "--external:react-dom/client", "--external:react/jsx-runtime",
      `--define:import.meta.env.VITE_SUPABASE_URL="https://stub.supabase.co"`,
      `--define:import.meta.env.VITE_SUPABASE_ANON_KEY="stubkey"`,
      `--define:import.meta.env.VITE_POSTHOG_KEY=""`,
      "--define:import.meta.env.DEV=false"], { cwd: REPO, stdio: "pipe" });
    console.log("ok\n");
  } catch (e) {
    console.log("FAILED\n" + (e.stdout || "") + (e.stderr || ""));
    process.exit(1);
  }
}

const sims = readdirSync(BUILD).filter(f => f.startsWith("sim_") && f.endsWith(".mjs")).sort();
const failed = [];
const t0 = Date.now();
for (const f of sims) {
  process.stdout.write(`  ${f.padEnd(26)}`);
  const r = spawnSync(process.execPath, [f], { cwd: BUILD, encoding: "utf8" });
  if (r.status === 0) {
    console.log("PASS");
  } else {
    console.log("FAIL");
    failed.push({ f, out: (r.stdout || "") + (r.stderr || "") });
  }
}

console.log(`\n${sims.length} sims in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (failed.length) {
  for (const { f, out } of failed) {
    console.log(`\n----- ${f} -----`);
    const lines = out.split("\n").filter(l => /^FAIL|Error|error:/.test(l));
    console.log((lines.length ? lines : out.split("\n").slice(-15)).join("\n"));
  }
  console.log(`\n${failed.length} FAILING: ${failed.map(x => x.f).join(", ")}`);
  process.exit(1);
}
console.log("ALL PASS");
