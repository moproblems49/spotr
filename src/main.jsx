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

// ★ STOP THE WEBVIEW SHRINKING OUT FROM UNDER THE KEYBOARD, AND HANDLE THE INSET OURSELVES.
// This is what a native app does, and it is why a native keyboard never shows a black box:
// the view stays full height, the keyboard slides OVER it, and the app makes room by adjusting
// insets. Capacitor defaults to `resize: "native"`, which physically shrinks the WKWebView —
// so on iOS 26, whose keyboard is translucent, the glass ends up sampling the bare UIWindow
// (black) instead of the page. Measured on a device recording: the surround darkened on the exact
// frame the page re-laid out. `resize: "none"` removes the shrink, so there is real content behind
// the glass again and the whole class of bug goes away.
//
// ★★★ `resize:"none"` IS OFF, AND THE REASON IS IN THE PLUGIN'S OWN SOURCE — NOT A JUDGEMENT CALL.
// The Instagram pattern (stop the webview shrinking, publish the keyboard height, let the UI ride
// up) is entirely OTA-able and was implemented in full: `KB_SAFE_INSET` moves every full-screen
// fixed backdrop holding a text input up to the keyboard line. That handles overlays. It CANNOT
// handle a field inside an ordinary SCROLLER, and the assumption that WebKit would handle those
// itself is FALSE HERE:
//   * `Keyboard.m:195-199` unconditionally does `removeObserver:self.webView` for
//     UIKeyboardWillShow/WillHide/WillChangeFrame/DidChangeFrame. The webview is never told a
//     keyboard exists.
//   * Under `native` the plugin SHRINKS the frame, so a low field falls outside the shortened
//     scroller and inner scroll-into-view lifts it. Under `none` the layout viewport still runs
//     behind the keyboard, the field is already "in view", and nothing scrolls.
// Measured consequence on the app's core flow: a live workout with 11 exercises has TWENTY inputs
// (every "Add note..." and per-exercise rename) below the keyboard line with nothing able to lift
// them, and Edit History has 13. That is far worse than the black box `none` was meant to cure.
// Making `none` viable therefore needs a FOCUS SHIM — on focus, scroll the field's own scroller so
// it clears the keyboard, and pad that scroller so the last item can still get there. That is a new
// subsystem, it cannot be verified anywhere in this repo (no WebKit engine, no software keyboard),
// and it should be built deliberately with a device in hand, not bolted on.
//
// EVERYTHING ELSE STAYS AND IS INERT BY CONSTRUCTION. `KB_SAFE_INSET` and the chat composer read
// `var(--seshd-kb, 0px)`, so as long as this file never PUBLISHES the variable they all resolve to
// 0 and behave exactly as they did before any of this work. That is the both-or-neither invariant
// `build/pw_kbinset.mjs` enforces: it is not "no consumers", it is "the variable is not published
// unless resize is none" — because under `native` the webview shrinks AND a consumer would inset,
// lifting everything twice.
// The black box around the keyboard is therefore still present, and its real fix is
// `Keyboard.autoBackdropColor:"dom"` (already in capacitor.config.json, needs a Mac `cap sync`).
try {
  const K = window.Capacitor?.Plugins?.Keyboard;
  if (K) {
    // Deliberately NOT calling setResizeMode: the default is `native`, which is what we want until
    // the focus shim above exists. Do not re-enable one without the other.
    void K;
  }
} catch { /* web, or plugin not synced natively */ }

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
