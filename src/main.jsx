// Kill old service worker caches
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  });
  caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App, { hydrateFromNative } from './App.jsx'

// OTA updates (@capgo/capacitor-updater): confirm this bundle boots, or the plugin
// auto-reverts to the previous bundle after appReadyTimeout (10s). Must run on EVERY
// launch, as early as possible. Guarded global — no-op on web or before the plugin
// has been synced into the native build.
try { window.Capacitor?.Plugins?.CapacitorUpdater?.notifyAppReady?.().catch(() => {}) } catch { /* web */ }

// Hide the grey iOS keyboard accessory bar (the ` < > Done ` strip above the system keyboard for
// web inputs) — the last big "this is a website" tell. Reached through the Capacitor bridge rather
// than an `import`, the same way notifyAppReady above is: the native plugin registers itself on
// window.Capacitor.Plugins once `npx cap sync ios` has run, so no JS import is needed and the web
// build stays free of a dependency it cannot use. Optional chaining means this is an instant no-op
// on web, and on any installed build that predates the plugin being synced in.
//
// This does NOT affect the weight/reps fields — those are DIVs driven by the in-app NumberPad on
// purpose (a real input attracts the iOS 18 autofill pill), so no system keyboard appears for them.
// It applies to the real inputs: exercise notes, custom rest seconds, search, chat, profile edit
// and sign-in.
try { window.Capacitor?.Plugins?.Keyboard?.setAccessoryBarVisible?.({ isVisible: false })?.catch?.(() => {}) } catch { /* web */ }

// Native boot hydration MUST complete before React mounts: it pulls durable data from iOS
// Preferences into localStorage, installs the write-through mirror, and loads the auth session
// from the iOS Keychain. Without awaiting it, the first render sees empty storage and the app
// boots signed-out on every launch. Instant no-op on web. `.finally` so a hydration error can
// never leave the app unmounted.
hydrateFromNative().catch(() => {}).then(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
