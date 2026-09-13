// sim_otabuiltin — the OTA endpoint's reply to a device that is still on its BUILTIN bundle.
//
// Why this exists: a fresh App Store install reports version_name "builtin", which can never equal
// LATEST_VERSION, so before 2026-09-13 the endpoint offered the bundle to every new downloader —
// ~500 kB downloaded on launch 1 and applied on launch 2, for code the binary already contained.
// That is the "relaunch twice" symptom. The fix suppresses the offer when the device's build number
// is at or past the archive that baked LATEST_VERSION in.
//
// THE LOAD-BEARING HALF IS THE FAIL-SAFE, NOT THE SUPPRESSION. A wrong suppression strands every
// store install on stale code, silently, with the app looking healthy — strictly worse than the bug
// it replaces. So the checks below spend most of their weight on the directions that MUST still
// update: an older build, a published OTA newer than the baked-in one, a missing/garbage
// version_code, and any device that has already taken an OTA.
//
// It drives the REAL handler with the request shape the plugin actually sends
// (InternalUtils.swift InfoObject.toParameters), not a copy of its logic.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(path.join(ROOT, "api/app-update.js"), "utf8");
const handler = (await import(path.join(ROOT, "api/app-update.js"))).default;

const grab = (name) => {
  const m = SRC.match(new RegExp(`const ${name} = ("[^"]*"|null)`));
  if (!m) throw new Error(`could not read ${name} out of api/app-update.js`);
  return m[1] === "null" ? null : m[1].slice(1, -1);
};
const LATEST = grab("LATEST_VERSION");
const bm = SRC.match(/const BUILTIN_BUNDLE = \{\s*build:\s*(\d+),\s*version:\s*"([^"]*)"/);
if (!bm) throw new Error("could not read BUILTIN_BUNDLE out of api/app-update.js");
const BUILTIN = { build: Number(bm[1]), version: bm[2] };

let fails = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`PASS ${label}`);
  else { fails++; console.log(`FAIL ${label}${detail ? " — " + detail : ""}`); }
};

// The plugin POSTs this shape. version_name is "builtin" until the device takes its first OTA.
async function ask({ version_name, version_code, version_build = "1.0.1" }) {
  const req = { method: "POST", body: { app_id: "com.seshd.app", device_id: "d", platform: "ios",
                                        version_name, version_code, version_build } };
  let payload = null;
  const res = {
    setHeader() {}, status() { return res; },
    json(b) { payload = b; return res; }, end() { return res; },
  };
  await handler(req, res);
  return payload;
}

const offered = (r) => !!(r && r.version);

// ── The fix itself ───────────────────────────────────────────────────────────
const atBuild = await ask({ version_name: "builtin", version_code: String(BUILTIN.build) });
check("1 builtin at the baked-in build is NOT offered the bundle it already has",
      !offered(atBuild), JSON.stringify(atBuild));

const laterBuild = await ask({ version_name: "builtin", version_code: String(BUILTIN.build + 4) });
check("2 a LATER build is not offered it either (>= not ==)",
      !offered(laterBuild), JSON.stringify(laterBuild));

// ── Every direction that must still receive an update ────────────────────────
const olderBuild = await ask({ version_name: "builtin", version_code: String(BUILTIN.build - 1) });
check("3 an OLDER store build IS still offered the bundle",
      offered(olderBuild) && olderBuild.version === LATEST, JSON.stringify(olderBuild));

const noCode = await ask({ version_name: "builtin", version_code: undefined });
check("4 a builtin device that sends no version_code IS still offered it",
      offered(noCode), JSON.stringify(noCode));

const junkCode = await ask({ version_name: "builtin", version_code: "not-a-number" });
check("5 a non-numeric version_code IS still offered it",
      offered(junkCode), JSON.stringify(junkCode));

const onOldOta = await ask({ version_name: "2026-01-01a", version_code: String(BUILTIN.build) });
check("6 a device already on an OLDER OTA bundle is still offered the new one",
      offered(onOldOta), JSON.stringify(onOldOta));

const onLatest = await ask({ version_name: LATEST, version_code: String(BUILTIN.build) });
check("7 a device already on LATEST is told 'no update' (unchanged behaviour)",
      !offered(onLatest), JSON.stringify(onLatest));

// ── The fail-safe, MEASURED rather than asserted about the source text ───────
// The state that matters is a FUTURE one: an OTA published after the last archive, with
// BUILTIN_BUNDLE left pointing at the older bundle. Build that state by importing a copy of the
// real module with LATEST_VERSION moved on, and drive it. A regex over the source would only
// prove the gate is written, not that it governs the reply.
const staleDir = await fs.mkdtemp(path.join(os.tmpdir(), "otabuiltin-"));
const stalePath = path.join(staleDir, "app-update.stale.mjs");
const staleSrc = SRC.replace(`const LATEST_VERSION = "${LATEST}"`,
                             'const LATEST_VERSION = "9999-99-99z"');
if (staleSrc === SRC) throw new Error("could not move LATEST_VERSION for the fail-safe check");
await fs.writeFile(stalePath, staleSrc, "utf8");
const staleHandler = (await import(pathToFileURL(stalePath).href)).default;
let stalePayload = null;
await staleHandler(
  { method: "POST", body: { version_name: "builtin", version_code: String(BUILTIN.build + 4) } },
  { setHeader() {}, status() { return this; }, json(b) { stalePayload = b; return this; }, end() { return this; } }
);
await fs.rm(staleDir, { recursive: true, force: true });
check("8 [fail-safe] a NEWER OTA than the baked-in one IS offered to a builtin device",
      offered(stalePayload) && stalePayload.version === "9999-99-99z",
      `a stale BUILTIN_BUNDLE must cost a redundant download, never a missed update — got ${JSON.stringify(stalePayload)}`);
check("9 [control] BUILTIN_BUNDLE.version currently names the published bundle",
      BUILTIN.version === LATEST,
      `builtin=${BUILTIN.version} latest=${LATEST} — fine if an OTA shipped since the last archive, ` +
      `but then checks 1-2 are vacuous and new installs take a redundant download`);

// ── The reply must otherwise be untouched ────────────────────────────────────
check("10 an offered reply still carries url + checksum",
      offered(olderBuild) && typeof olderBuild.url === "string" &&
      olderBuild.url.endsWith(`seshd-${LATEST}.zip`) && /^[0-9a-f]{64}$/.test(olderBuild.checksum || ""),
      JSON.stringify(olderBuild));
check("11 a no-update reply carries version:null and NO message field",
      onLatest && onLatest.version === null && !("message" in onLatest),
      JSON.stringify(onLatest));

console.log(fails ? `\nFAIL sim_otabuiltin (${fails})` : "\nPASS sim_otabuiltin");
process.exit(fails ? 1 : 0);
