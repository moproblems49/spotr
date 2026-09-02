// THE OTA BUNDLE MUST CONTAIN EVERY ASSET THE APP ACTUALLY LOADS — AND NOTHING ELSE.
//
// The publish recipe excludes web-only art (PWA manifest icons, the App Store 1024, the OG image)
// because the native shell never requests any of it: measured, that art was 1,414 kB of a 1,898 kB
// bundle, downloaded by every phone on every update for nothing. The risk of an exclude list is
// the obvious one — excluding something the app DOES load 404s it on device, where no test here
// would see it. So this asserts the two halves separately:
//   1. every runtime-referenced asset is IN the zip  (the safety half)
//   2. the known web-only art is OUT of it           (the saving half)
//
// Reference extraction reads the BUILT output, not the source: rolldown emits string literals in
// BACKTICKS, so a grep for "/icon-192.png" with double quotes finds nothing and reports a clean
// bill for a bundle that is missing the file. That mistake has been made here twice.
//
// ★ IT ALSO ASSERTS `BUNDLE_SHA256` IN api/app-update.js MATCHES THIS ZIP, AND THAT HALF IS THE
// MOST DANGEROUS THING IN THE PUBLISH RECIPE. The plugin DELETES a bundle whose hash disagrees
// with the one the endpoint served, so a stale or hand-edited constant does not degrade to "no
// verification" -- it bricks OTA for EVERY phone at once, silently, with the app still looking
// perfectly healthy on screen and each device re-downloading and re-rejecting forever. Nothing
// else in this repo can see that: the web build never calls the endpoint, and no sim or Playwright
// suite downloads a bundle. This check is the only thing standing between a one-character typo and
// every installed app being permanently stuck on an old version.
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const zip = process.argv[2], dist = process.argv[3] || "dist";
if (!zip) { console.error("usage: node build/ota_assets_check.mjs <bundle.zip> [distDir]"); process.exit(2); }

const WEB_ONLY = ["icon-1024.png", "icon-512.png", "icon-maskable-512.png",
                  "apple-touch-icon.png", "og-image.png", "favicon.svg"];

const inZip = new Set(execSync(`unzip -Z1 ${JSON.stringify(zip)}`, { encoding: "utf8" }).split("\n").filter(Boolean));

// Runtime references from the built JS/CSS. Both quote styles AND backticks.
// ★ THE TWO SOURCES ARE KEPT APART ON PURPOSE. A file linked from index.html can legitimately be
// absent (the manifest and the apple-touch-icon are read by BROWSERS, never by the WKWebView), but
// a file the built JS names is loaded by the app itself and excluding it is a 404 on device. One
// merged set plus one exemption list would let a genuine JS reference to og-image.png be waved
// through by the exemption written for the html link -- the "exemption that hides the bug" shape.
const jsRefs = new Set();
const assetDir = join(dist, "assets");
for (const f of readdirSync(assetDir)) {
  const src = readFileSync(join(assetDir, f), "utf8");
  for (const m of src.matchAll(/["'`](\/[A-Za-z0-9_.\-]+\.(?:png|svg|jpg|webp|ico|json))["'`]/g)) jsRefs.add(m[1].slice(1));
}
const htmlRefs = new Set();
for (const m of readFileSync(join(dist, "index.html"), "utf8").matchAll(/(?:href|src)="(\/[A-Za-z0-9_.\-]+\.[a-z]+)"/g))
  htmlRefs.add(m[1].slice(1));

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) fails++; };

check(jsRefs.size > 0, `found ${jsRefs.size} runtime asset reference(s) in the built JS/CSS`);
// The app's own code names these, so every one must ship -- NO exemption list applies here.
for (const r of [...jsRefs].sort()) check(inZip.has(r), `JS-referenced asset "${r}" is in the bundle`);
// index.html links the manifest and the apple touch icon for the WEB build; the native shell never
// reads either, so those alone may be absent. Anything else the html links must still ship.
for (const r of [...htmlRefs].sort()) {
  if (WEB_ONLY.includes(r) || r === "manifest.json") continue;
  check(inZip.has(r), `html-linked asset "${r}" is in the bundle`);
}
for (const w of WEB_ONLY) check(!inZip.has(w), `web-only "${w}" is excluded from the bundle`);
check(![...inZip].some(n => n.endsWith(".zip")), "no nested .zip inside the bundle");

// --- OTA integrity: the served checksum must be this zip's -------------------------------------
// Read the constants out of the endpoint rather than keeping a copy here: a guard that hardcodes
// the value under test is testing its copy, not the thing that ships.
const endpointSrc = readFileSync("api/app-update.js", "utf8");
const shaLine = endpointSrc.match(/const BUNDLE_SHA256 = "([0-9a-f]*)";/);
const verLine = endpointSrc.match(/const LATEST_VERSION = "([^"]*)";/);
check(!!shaLine, "api/app-update.js declares BUNDLE_SHA256 (shape unchanged)");
check(!!verLine, "api/app-update.js declares LATEST_VERSION (shape unchanged)");
if (shaLine && verLine) {
  const actual = createHash("sha256").update(readFileSync(zip)).digest("hex");
  check(shaLine[1].length === 64, `BUNDLE_SHA256 is a 64-char hex sha256 (got ${shaLine[1].length})`);
  check(shaLine[1] === actual, `BUNDLE_SHA256 matches the zip (served ${shaLine[1].slice(0, 12)}... / real ${actual.slice(0, 12)}...)`);
  // The version and the filename must agree too, or the endpoint hands out a URL for one bundle
  // and the hash of another -- which fails in exactly the same all-phones way.
  check(zip.endsWith(`seshd-${verLine[1]}.zip`), `LATEST_VERSION "${verLine[1]}" names the zip being checked (${zip})`);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
