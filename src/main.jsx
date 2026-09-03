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
// ★★ `resize: "none"` IS HELD BACK — IT BURIED THREE FIELDS, AND THE PREMISE BELOW WAS WRONG.
// The reasoning WAS: the only thing that cannot move out of the keyboard's way is something PINNED
// to the bottom, i.e. the chat composer, so publish the height as `--seshd-kb` and let the composer
// pad by it. MEASURED, and false. WebKit's focus-scroll only rescues a field with a SCROLLABLE
// ancestor, and this app's overlays are `position:fixed` boxes sized to the LAYOUT viewport — which
// `none` stops shrinking. So their content re-flows down into the keyboard's area with nothing to
// scroll. Same field, same code, two modes (402x874 vs the 402x538 `native` produces, keyboard 336):
//     Settings -> Send feedback textarea   bottom 463 -> 799   (261px under, NO scrollable ancestor)
//     Edit Profile -> bio textarea         bottom 464 -> 596
//     Edit Profile -> age "e.g. 28"        bottom 541 -> 673
// The Edit Profile pair is the instructive one: at 538 the modal's content OVERFLOWED, so it had a
// scroller and WebKit could lift them; at 874 it fits, so the scroller is gone and nothing can.
// That sweep covered 4 screens out of ~72 inputs, so treat those three as a lower bound.
// Going back to `none` therefore needs the containers to end at the keyboard line — a global
// `height: calc(... - var(--seshd-kb, 0px))` on every full-screen fixed overlay and bottom sheet,
// which reproduces `native`'s geometry in CSS without its native re-layout jump — plus a guard that
// sweeps EVERY input at both viewports. `build/pw_kbinset.mjs` is that sweep. Until then the black
// box stays, and its real fix is `Keyboard.autoBackdropColor: "dom"` (already in
// capacitor.config.json, needs a Mac `cap sync`), not this.
// The listeners below stay: publishing `--seshd-kb` costs nothing and is what the eventual fix
// consumes. NOTHING reads it today — the composer's consumption was reverted with this, because
// under `native` the webview shrinks AND the composer would pad, lifting it twice.
try {
  const K = window.Capacitor?.Plugins?.Keyboard;
  if (K) {
    K.setResizeMode?.({ mode: "none" })?.catch?.(() => {});
    const setKb = (px, ms) => {
      const el = document.documentElement;
      // Custom properties live in inline style, and AppInner's scroll-lock effect REPLACES
      // documentElement.style.cssText wholesale. MEASURED: it therefore wipes any value set here
      // at boot — `--seshd-kb` reads as "" after mount, not "0px". That is harmless and is why
      // every consumer must use the `var(--seshd-kb, 0px)` FALLBACK rather than relying on an
      // initial value, and why no initial set is made here. It is safe for the live keyboard
      // height because that effect has [] deps and runs once at mount, before any field can be
      // focused — but if it ever gains deps and re-runs, it would blank a raised keyboard inset
      // mid-gesture. Keep it [] or move this variable off documentElement.
      el.style.setProperty("--seshd-kb-ms", (ms || 250) + "ms");
      el.style.setProperty("--seshd-kb", px + "px");
    };
    K.addListener?.("keyboardWillShow", info => setKb(Math.round(info?.keyboardHeight || 0), info?.keyboardAnimationDuration ? Math.round(info.keyboardAnimationDuration * 1000) : 250));
    K.addListener?.("keyboardWillHide", info => setKb(0, info?.keyboardAnimationDuration ? Math.round(info.keyboardAnimationDuration * 1000) : 250));
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
