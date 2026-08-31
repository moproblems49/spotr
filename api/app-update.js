// Vercel serverless function: self-hosted OTA update endpoint for @capgo/capacitor-updater.
// The native app POSTs { app_id, device_id, version_name/version, platform } here on launch
// (autoUpdate mode). We answer with either the latest bundle descriptor or "no update".
//
// ── HOW TO PUBLISH AN OTA UPDATE (no Mac needed) ─────────────────────────────────
// STEPS ARE IN EXECUTION ORDER. Do not reorder them — step 1 being first is the whole point.
// 1. DELETE the previous zip from public/bundles/ FIRST, before building anything.
//      rm -f public/bundles/seshd-<OLD_VERSION>.zip
//    Vite copies public/ into dist/, so a zip still sitting in public/bundles/ when you build
//    gets baked INTO the new bundle — every release would carry the previous one inside it
//    (measured once: a 1.9MB bundle shipped at 3.8MB, and every phone downloaded both).
//    If you already built, `rm -f dist/bundles/*.zip` before zipping.
// 2. Build the production web bundle with the REAL .env values:  npm run build
//    Then confirm it is not a stub build, or sign-in breaks for everyone:
//      grep -roh 'https://[a-z0-9]*\.supabase\.co' dist/assets/*.js   # must be zwsoxvekobvtvsphesef
// 3. Zip the CONTENTS of dist/ so index.html sits at the ZIP ROOT. USE A SUBSHELL —
//    the parentheses are load-bearing, not style:
//      ( cd dist && zip -rq ../public/bundles/seshd-<NEW_VERSION>.zip . )
//    A bare `cd dist && zip … && cd ..` strands the shell in dist/ if ANY link of the chain
//    fails, and in an agent session the cwd persists into the next command — which has already
//    caused a later `rm -f .env.local` to run in the wrong directory and silently miss.
//    A subshell cannot change the caller's cwd at all, success or failure.
// 4. Verify the zip: index.html at the root, and NO nested zip inside it.
//      unzip -l public/bundles/seshd-<NEW>.zip | grep -E '^ +[0-9]+.*\.zip$'   # must print nothing
//    (Don't grep bare '\.zip$' — unzip's own "Archive:  …zip" header line matches it and reads
//    as a false positive. Size is the faster tell: correct ~1.9MB, doubled ~3.8MB.)
// 5. Set LATEST_VERSION below to "<NEW_VERSION>" (any new unique string, e.g. "2026-07-22a").
// 6. DELETE .env.local — always, and check it is actually gone with an ABSOLUTE path.
//    A stub-built bundle published later breaks sign-in for every user.
// 7. Commit + push to main → Vercel deploys both this endpoint and the zip →
//    every installed app downloads it in the background and applies it on next launch.
// Rollback safety: the app calls notifyAppReady() on boot; if a bundle is so broken the app
// can't boot, the plugin auto-reverts to the previous bundle. To force-rollback everyone,
// set LATEST_VERSION back to an older published version (and restore its zip).
// NEVER OTA a change that needs new native plugins/capabilities — that requires a real
// TestFlight build (cap sync + archive on the Mac).

const LATEST_VERSION = "2026-08-31k"; // null = no OTA update published
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
  // NEVER add a `message` field here. The plugin's getLatest() REJECTS the call whenever the
  // response carries a non-empty message (CapacitorUpdaterPlugin.swift: `else if let message =
  // res.message ... rejectCall`), so a friendly "up to date" string surfaced in the app as
  // "couldn't reach the update server". Auto-update ignores `message`, which is why background
  // updates still worked and only the manual check appeared broken.
  if (!LATEST_VERSION || current === LATEST_VERSION) {
    return res.status(200).json({ version: null });
  }
  return res.status(200).json({
    version: LATEST_VERSION,
    url: `${BUNDLE_BASE}/seshd-${LATEST_VERSION}.zip`,
  });
}
