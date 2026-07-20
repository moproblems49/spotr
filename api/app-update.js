// Vercel serverless function: self-hosted OTA update endpoint for @capgo/capacitor-updater.
// The native app POSTs { app_id, device_id, version_name/version, platform } here on launch
// (autoUpdate mode). We answer with either the latest bundle descriptor or "no update".
//
// ── HOW TO PUBLISH AN OTA UPDATE (no Mac needed) ─────────────────────────────────
// 1. Build the production web bundle:  npm run build  (with the real .env values)
// 2. Zip the CONTENTS of dist/ so index.html sits at the ZIP ROOT:
//      cd dist && zip -r ../public/bundles/seshd-<NEW_VERSION>.zip . && cd ..
// 3. Set LATEST_VERSION below to "<NEW_VERSION>" (any new unique string, e.g. "2026-07-22a").
// 4. Delete the previous zip from public/bundles/ (keep the repo lean).
// 5. Commit + push to main → Vercel deploys both this endpoint and the zip →
//    every installed app downloads it in the background and applies it on next launch.
// Rollback safety: the app calls notifyAppReady() on boot; if a bundle is so broken the app
// can't boot, the plugin auto-reverts to the previous bundle. To force-rollback everyone,
// set LATEST_VERSION back to an older published version (and restore its zip).
// NEVER OTA a change that needs new native plugins/capabilities — that requires a real
// TestFlight build (cap sync + archive on the Mac).

const LATEST_VERSION = null; // e.g. "2026-07-22a" — null = no OTA update published yet
const BUNDLE_BASE = "https://spotr-drab.vercel.app/bundles";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(200).end();

  let current = "";
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    current = String(b.version_name || b.version || "");
  } catch { /* GET or malformed body — treat as unknown current version */ }

  // No published bundle, or the device already runs it → "no update" (version: null is the
  // documented no-op reply for capacitor-updater's self-hosted contract).
  if (!LATEST_VERSION || current === LATEST_VERSION) {
    return res.status(200).json({ version: null, message: "up to date" });
  }
  return res.status(200).json({
    version: LATEST_VERSION,
    url: `${BUNDLE_BASE}/seshd-${LATEST_VERSION}.zip`,
  });
}
