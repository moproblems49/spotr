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
// ★★ THE ENDPOINT HAS TWO LEGITIMATE STATES AND THE FIRST VERSION OF THIS GUARD ONLY KNEW ONE.
// The suppression fires only while BUILTIN_BUNDLE.version === LATEST_VERSION, so it is live between
// a Mac-day archive and the next OTA publish, and DORMANT from that publish until the next archive.
// Since a bundle ships with essentially every change here and Mac days are rare, dormant is the
// NORMAL state — and a guard that asserts the suppression against the real module therefore went
// red the moment an OTA was published and stayed red until a Mac day. A guard whose red means
// "normal" is noise that masks the next real red, which is the disease this repo keeps treating.
//
// So the suppression is now tested against a SYNTHETIC ALIGNED module (the mirror of the synthetic
// STALE one check 8 already built), which makes those checks run on EVERY invocation instead of
// only in the rare aligned window — strictly more coverage, not less. What the REAL module is asked
// is a different question: does it behave correctly for the constants it actually has? Both states
// have a right answer and check 9 pins whichever one applies.
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

// Build a variant of the REAL module with substitutions applied, so a hypothetical configuration
// can be DRIVEN rather than reasoned about. Every substitution must actually apply — a silent
// no-op would leave the variant identical to the real module and the check would pass for the
// wrong reason, which is the "assert the string changed" scar.
const tmpDirs = [];
async function variant(subs) {
  let src = SRC;
  for (const [from, to] of subs) {
    const next = src.replace(from, to);
    if (next === src) throw new Error(`substitution did not apply: ${from}`);
    src = next;
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "otabuiltin-"));
  tmpDirs.push(dir);
  const file = path.join(dir, "app-update.variant.mjs");
  await fs.writeFile(file, src, "utf8");
  const h = (await import(pathToFileURL(file).href)).default;
  return async (params) => askWith(h, params);
}
async function askWith(h, { version_name, version_code, version_build = "1.0.1" }) {
  const req = { method: "POST", body: { app_id: "com.seshd.app", device_id: "d", platform: "ios",
                                        version_name, version_code, version_build } };
  let payload = null;
  const res = { setHeader() {}, status() { return res; },
                json(b) { payload = b; return res; }, end() { return res; } };
  await h(req, res);
  return payload;
}

// ── The suppression, tested in the state where it is SUPPOSED to fire ────────
// i.e. the post-Mac-day alignment. When the real constants already agree this IS the real module.
const ALIGNED = BUILTIN.version === LATEST
  ? ask
  : await variant([[/const BUILTIN_BUNDLE = \{[^}]*\}/,
                    `const BUILTIN_BUNDLE = { build: ${BUILTIN.build}, version: "${LATEST}" }`]]);

const atBuild = await ALIGNED({ version_name: "builtin", version_code: String(BUILTIN.build) });
check("1 [aligned] builtin at the baked-in build is NOT offered the bundle it already has",
      !offered(atBuild), JSON.stringify(atBuild));

const laterBuild = await ALIGNED({ version_name: "builtin", version_code: String(BUILTIN.build + 4) });
check("2 [aligned] a LATER build is not offered it either (>= not ==)",
      !offered(laterBuild), JSON.stringify(laterBuild));

// ── Every direction that must still receive an update ────────────────────────
// These run against ALIGNED too: with the suppression DORMANT they are all trivially true, so
// asserting them on the real module in the normal state would prove nothing about over-reach.
const olderBuild = await ALIGNED({ version_name: "builtin", version_code: String(BUILTIN.build - 1) });
check("3 [aligned] an OLDER store build IS still offered the bundle",
      offered(olderBuild) && olderBuild.version === LATEST, JSON.stringify(olderBuild));

const noCode = await ALIGNED({ version_name: "builtin", version_code: undefined });
check("4 [aligned] a builtin device that sends no version_code IS still offered it",
      offered(noCode), JSON.stringify(noCode));

const junkCode = await ALIGNED({ version_name: "builtin", version_code: "not-a-number" });
check("5 [aligned] a non-numeric version_code IS still offered it",
      offered(junkCode), JSON.stringify(junkCode));

// ── The real module, in whatever state it is actually in ─────────────────────
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
const stale = await variant([[`const LATEST_VERSION = "${LATEST}"`, 'const LATEST_VERSION = "9999-99-99z"']]);
const stalePayload = await stale({ version_name: "builtin", version_code: String(BUILTIN.build + 4) });
check("8 [fail-safe] a NEWER OTA than the baked-in one IS offered to a builtin device",
      offered(stalePayload) && stalePayload.version === "9999-99-99z",
      `a stale BUILTIN_BUNDLE must cost a redundant download, never a missed update — got ${JSON.stringify(stalePayload)}`);

// ── The REAL module must match its OWN constants ─────────────────────────────
// Both states are legitimate and each has exactly one right answer, so this is an assertion rather
// than a reminder. ALIGNED (just archived) → a current builtin device is suppressed. DORMANT (an
// OTA shipped since) → that same device MUST be offered the bundle, because the binary does not
// contain it. Getting this wrong in the dormant direction is the strand-every-install failure.
const aligned = BUILTIN.version === LATEST;
const realAtBuild = await ask({ version_name: "builtin", version_code: String(BUILTIN.build) });
check(`9 the live config behaves like what it is (${aligned ? "ALIGNED" : "OTA pending a Mac day"})`,
      aligned ? !offered(realAtBuild) : (offered(realAtBuild) && realAtBuild.version === LATEST),
      `builtin=${BUILTIN.version} latest=${LATEST} → ${JSON.stringify(realAtBuild)}`);
if (!aligned) {
  console.log(`NOTE  BUILTIN_BUNDLE names ${BUILTIN.version} while ${LATEST} is published, so new`);
  console.log(`      store installs take one redundant ~500 kB download until the next archive.`);
  console.log(`      That is the fail-safe working; set BUILTIN_BUNDLE on the next Mac day.`);
}

// ── The reply must otherwise be untouched ────────────────────────────────────
check("10 an offered reply still carries url + checksum",
      offered(onOldOta) && typeof onOldOta.url === "string" &&
      onOldOta.url.endsWith(`seshd-${LATEST}.zip`) && /^[0-9a-f]{64}$/.test(onOldOta.checksum || ""),
      JSON.stringify(onOldOta));
check("11 a no-update reply carries version:null and NO message field",
      onLatest && onLatest.version === null && !("message" in onLatest),
      JSON.stringify(onLatest));

for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });

console.log(fails ? `\nFAIL sim_otabuiltin (${fails})` : "\nPASS sim_otabuiltin");
process.exit(fails ? 1 : 0);
