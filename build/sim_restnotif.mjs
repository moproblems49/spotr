// NO SYSTEM BANNER WHEN YOU'RE LOOKING AT THE WORKOUT SCREEN.
//
// Mo: "I still get rest timer notifications even when I'm looking at the workout screen."
//
// A native local notification is scheduled UP FRONT when rest starts, so the alert still lands if
// the phone locks — a JS timer can't fire while iOS has the WebView suspended. The in-app path then
// cancelled it at completion, which is a race the banner WINS: iOS fires at T, the 250ms interval
// notices at T+0..250ms, and the cancel arrives after the banner is already on screen.
//
// The fix cancels a few seconds EARLY whenever the app is visible, and re-arms if the app is
// backgrounded before the end (where a banner becomes the only way to find out).
//
// This models the scheduler/visibility contract directly — the real one lives behind a Capacitor
// plugin that doesn't exist off-device, so a jsdom mount can't observe it.
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

// ── A tiny model of the native scheduler ─────────────────────────────────────────────────────
function makeOS() {
  return {
    pending: null,          // { firesAt }
    banners: 0,             // system alerts the USER actually saw
    schedule(atMs) { this.pending = { firesAt: atMs }; },
    cancel() { this.pending = null; },
    // Advance the clock to `now`, firing anything due.
    tick(now) { if (this.pending && this.pending.firesAt <= now) { this.banners++; this.pending = null; } },
  };
}

// The app's rest period, driven at the real 250ms cadence.
function runRest({ totalSecs, visibleAt, preCancel }) {
  const os = makeOS();
  const t0 = 0;
  os.schedule(t0 + totalSecs * 1000);          // scheduled up front, as the app does
  let preCancelled = false, chimed = false;
  for (let now = 0; now <= totalSecs * 1000 + 1000; now += 250) {
    const visible = visibleAt(now);
    const remaining = Math.max(0, totalSecs - Math.floor((now - t0) / 1000));
    // Re-arm on background (visibilitychange -> hidden) if we'd cancelled while visible.
    if (!visible && !os.pending && remaining >= 1) os.schedule(t0 + totalSecs * 1000);
    // THE FIX: cancel early, with margin, while on screen.
    if (preCancel && visible && remaining <= 3 && !preCancelled) { preCancelled = true; os.cancel(); }
    os.tick(now);                               // the OS fires on its own schedule
    if (remaining <= 0 && !chimed) {
      chimed = true;
      if (visible) os.cancel();                 // the OLD behaviour: cancel only at completion
    }
  }
  return { banners: os.banners, chimed };
}

const ALWAYS_VISIBLE = () => true;
const ALWAYS_HIDDEN = () => false;

// ── On screen the whole rest: in-app chime only, no banner ───────────────────────────────────
const onScreen = runRest({ totalSecs: 90, visibleAt: ALWAYS_VISIBLE, preCancel: true });
console.log("on-screen:", JSON.stringify(onScreen));
check("looking at the workout screen produces NO system banner", onScreen.banners === 0, `${onScreen.banners} banner(s)`);
check("...and the in-app chime still fires", onScreen.chimed);

// The same run WITHOUT the pre-emptive cancel is the bug Mo reported.
const oldWay = runRest({ totalSecs: 90, visibleAt: ALWAYS_VISIBLE, preCancel: false });
console.log("on-screen, cancel-at-completion only:", JSON.stringify(oldWay));
check("the old cancel-at-completion approach DOES leak a banner (bug reproduced)", oldWay.banners === 1, JSON.stringify(oldWay));

// ── Backgrounded the whole rest: the banner is the only signal, it must fire ──────────────────
const backgrounded = runRest({ totalSecs: 90, visibleAt: ALWAYS_HIDDEN, preCancel: true });
console.log("backgrounded:", JSON.stringify(backgrounded));
check("with the app backgrounded the banner still fires", backgrounded.banners === 1, JSON.stringify(backgrounded));

// ── The tricky one: on screen most of the rest, backgrounded right at the end ─────────────────
// The pre-emptive cancel has already run, so this only works if backgrounding RE-ARMS.
const leaveLate = runRest({ totalSecs: 90, visibleAt: now => now < 88_000, preCancel: true });
console.log("left the app at 88s of 90:", JSON.stringify(leaveLate));
check("backgrounding late re-arms the banner", leaveLate.banners === 1, JSON.stringify(leaveLate));

// ── And the reverse: backgrounded early, back on screen before the end ────────────────────────
const returnEarly = runRest({ totalSecs: 90, visibleAt: now => now > 40_000, preCancel: true });
console.log("returned to the app at 40s of 90:", JSON.stringify(returnEarly));
check("coming back to the app suppresses the banner again", returnEarly.banners === 0, JSON.stringify(returnEarly));

// ── A short rest must behave too (margin is 3s; a 2s rest is shorter than the margin) ─────────
const shortRest = runRest({ totalSecs: 2, visibleAt: ALWAYS_VISIBLE, preCancel: true });
console.log("2s rest on screen:", JSON.stringify(shortRest));
check("a rest shorter than the cancel margin still produces no banner", shortRest.banners === 0, JSON.stringify(shortRest));

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
