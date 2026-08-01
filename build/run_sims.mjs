#!/usr/bin/env node
// Run the whole sim battery and report one verdict. Use this before any commit that touches
// workout, health, profile, feed or gesture code.
//
//   node build/run_sims.mjs             rebuild the bundle, then run everything
//   node build/run_sims.mjs --no-build  skip the rebuild if you just built
//   node build/run_sims.mjs --pw        ALSO run the Playwright suites (adds ~2min)
//
// The pw_* suites drive the REAL app in Chromium and cover what jsdom can't see: drag-and-drop
// reorder, overlays resolving against a transformed track, safe-area ownership, and cross-screen
// number agreement. They were opt-in-by-memory for a while and that is exactly how a suite rots —
// `--pw` builds dist with stub env, serves it on :8199, runs them, and tears the server down.
//
// It rebuilds by default rather than trusting whatever is on disk: a STALE build/app.mjs is the
// single most common cause of a false failure here. It also runs each sim bare and reads its real
// exit code — piping a sim into `tail` reports TAIL's status, not the sim's, which has masked a
// genuine failure in this repo before.
import { readdirSync, writeFileSync, rmSync } from "fs";
import { execFileSync, spawnSync, spawn } from "child_process";
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

// ── Playwright suites (opt-in: they need a built dist and a local server) ─────────────────────
if (process.argv.includes("--pw")) {
  const ENV = join(REPO, ".env.local");
  let server;
  try {
    process.stdout.write("\nBuilding dist (stub env) ... ");
    // Stub creds ONLY — this dist is for the test server and must never be published. It is
    // deleted again immediately so a later real build can't pick it up.
    writeFileSync(ENV, "VITE_SUPABASE_URL=https://stub.supabase.co\nVITE_SUPABASE_ANON_KEY=stubkey\nVITE_POSTHOG_KEY=\n");
    execFileSync("npm", ["run", "build"], { cwd: REPO, stdio: "pipe" });
    console.log("ok");
  } catch (e) {
    console.log("FAILED\n" + (e.stdout || "") + (e.stderr || ""));
    process.exit(1);
  } finally {
    try { rmSync(ENV, { force: true }); } catch {}
  }

  server = spawn("python3", ["-m", "http.server", "8199"], { cwd: join(REPO, "dist"), stdio: "ignore", detached: true });
  const stop = () => { try { process.kill(-server.pid); } catch {} };
  process.on("exit", stop);
  await new Promise(r => setTimeout(r, 1500));

  const pws = readdirSync(BUILD).filter(f => f.startsWith("pw_") && f.endsWith(".mjs")).sort();
  console.log("");
  for (const f of pws) {
    process.stdout.write(`  ${f.padEnd(26)}`);
    const r = spawnSync(process.execPath, [f], { cwd: BUILD, encoding: "utf8" });
    if (r.status === 0) console.log("PASS");
    else { console.log("FAIL"); failed.push({ f, out: (r.stdout || "") + (r.stderr || "") }); }
  }
  stop();
  console.log(`\n${pws.length} Playwright suites`);
}

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
