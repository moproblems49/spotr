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
// ★★★ THE KEYBOARD RIDES UP WITH THE APP INSTEAD OF SQUASHING IT — AND THE FOCUS SHIM IS THE
// PIECE iOS WILL NOT DO FOR US. `resize:"none"` stops the WKWebView shrinking when the keyboard
// opens, which is what removes the layout jump AND the black box (the shrink is what exposes the
// bare UIWindow behind the translucent iOS 26 keyboard). Its cost is that nothing moves out of the
// keyboard's way by itself, and the reason is mechanical rather than a guess:
// `@capacitor/keyboard`'s `Keyboard.m:195-199` unconditionally does `removeObserver:self.webView`
// for UIKeyboardWillShow/WillHide/WillChangeFrame, so the webview is never told a keyboard exists.
// Under `native` that is invisible — the plugin shrinks the frame, a low field falls outside its
// scroller, and inner scroll-into-view lifts it. Under `none` the layout viewport still runs behind
// the keyboard, the field is already "in view", and nothing scrolls.
// TWO mechanisms cover the two shapes, and BOTH are needed — an earlier attempt shipped only the
// first and buried 20 fields in a single workout:
//   * a field in a FIXED overlay  -> `KB_SAFE_INSET` (src/App.jsx) ends the overlay at the
//     keyboard line, so the field comes up with it. Nothing to scroll there.
//   * a field in a SCROLLER       -> this shim scrolls it clear, and pads the scroller so even its
//     LAST row can get there (without the pad, max-scroll leaves the last row at the physical
//     bottom and no amount of scrolling exposes it).
const KB_MARGIN = 14;                       // breathing room between the field and the keys
const _padded = new Map();                  // scroller -> its original inline padding-bottom
// ★ THE CSS VARIABLE IS THE SINGLE SOURCE OF TRUTH, NOT A JS COPY. The first cut kept the height
// in a module `let` that only the native listener set — so the shim could not run anywhere without
// a real device, and the guard (which simulates the keyboard exactly as the plugin does, by setting
// `--seshd-kb`) measured a shim that was inert by construction and reported 10 buried fields. One
// source means simulating the keyboard drives the real code path.
const _kbHeight = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--seshd-kb")) || 0;

const _scrollerOf = (el) => {
  let n = el.parentElement;
  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && n.scrollHeight > n.clientHeight + 2) return n;
    n = n.parentElement;
  }
  return null;                              // no scroller: a fixed overlay, KB_SAFE_INSET owns it
};

const _releasePads = () => {
  for (const [el, orig] of _padded) el.style.paddingBottom = orig;
  _padded.clear();
};

const _liftFocused = () => {
  const kb = _kbHeight();
  if (!kb) return;
  const el = document.activeElement;
  if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return;
  const line = window.innerHeight - kb;
  const over = el.getBoundingClientRect().bottom + KB_MARGIN - line;
  if (over <= 0) return;                    // already clear
  const sc = _scrollerOf(el);
  if (!sc) return;
  if (!_padded.has(sc)) {
    // Remember the INLINE value so it is restored exactly; the computed one is what we add to.
    _padded.set(sc, sc.style.paddingBottom || "");
    const base = parseFloat(getComputedStyle(sc).paddingBottom) || 0;
    sc.style.paddingBottom = (base + kb) + "px";
  }
  sc.scrollTop += over;                     // reads layout after the pad, so the last row can reach
};

try {
  const K = window.Capacitor?.Plugins?.Keyboard;
  if (K) {
    K.setResizeMode?.({ mode: "none" })?.catch?.(() => {});
    const setKb = (px) => {
      // NOTE: the plugin sends ONLY `{keyboardHeight}` (Keyboard.m:259-262) — there is no
      // `keyboardAnimationDuration`, so the transition is the 250ms fallback, not the keyboard's
      // own. Do not describe it as following the keyboard.
      document.documentElement.style.setProperty("--seshd-kb", px + "px");
    };
    K.addListener?.("keyboardWillShow", info => {
      setKb(Math.round(info?.keyboardHeight || 0));
      // A frame, so the KB_SAFE_INSET containers have re-laid-out before anything is measured.
      requestAnimationFrame(() => requestAnimationFrame(_liftFocused));
    });
    K.addListener?.("keyboardWillHide", () => { _releasePads(); setKb(0); });
  }
} catch { /* web, or plugin not synced natively */ }

// Registered UNCONDITIONALLY, not inside the `if (K)` above: moving between fields with the
// keyboard already up fires no `keyboardWillShow`, and keeping this outside the Capacitor check is
// also what makes the shim reachable in a browser. It is inert wherever `--seshd-kb` is unset,
// which is every web session and every build where resize is `native`.
if (typeof document !== "undefined") {
  document.addEventListener("focusin", () => {
    if (_kbHeight()) requestAnimationFrame(_liftFocused);
  }, { passive: true, capture: true });
}

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
