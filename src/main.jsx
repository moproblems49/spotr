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
