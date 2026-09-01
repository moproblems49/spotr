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

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
