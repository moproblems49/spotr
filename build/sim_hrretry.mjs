// A WATCH THAT HASN'T SYNCED YET MUST GET A SECOND CHANCE, NOT A PERMANENT MISS.
//
// Mo: "avg and peak heart rate hasn't showing in last 2 workouts." The History card already knows
// how to render both (`♥ {avg} avg · {peak} peak` — that line was NOT the bug, it's been there all
// along). The write side was: read HeartRate samples once, at the exact moment "Finish" is tapped,
// and if fewer than 3 samples come back, give up forever. Apple Watch -> iPhone HealthKit sync is
// not instant, so a watch that finished recording seconds before Finish commonly hasn't synced to
// the phone's store yet — the read comes back empty, and nothing ever re-checks. That is exactly
// the shape of "worked before, not on my last two" (the two most recent are the ones whose watch
// sync hadn't caught up by read time).
//
// attachWorkoutHr() now retries once, ~90s later, re-querying up to THAT moment. This sim proves
// the retry actually fires and actually attaches the data, using a stubbed HealthKit that returns
// EMPTY on the first read (simulating unsynced watch data) and REAL samples on the second — the
// exact scenario a one-shot read can never recover from. delayMs is overridden to keep the sim fast;
// the retry MECHANISM under test is identical regardless of the real 90s value.
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BUILD = dirname(fileURLToPath(import.meta.url));
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
global.window = dom.window;
global.document = dom.window.document;
try { Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true }); } catch { /* Node 22's own navigator getter can't always be replaced; window.navigator is what matters here anyway */ }

// Stub HealthKit: call 1 returns too few samples (unsynced watch), call 2 returns a real reading.
let readCalls = 0;
window.Capacitor = {
  isNativePlatform: () => true,
  Plugins: {
    Health: {
      readSamples: async (opts) => {
        readCalls++;
        if (opts.dataType !== "heartRate") return { samples: [] };
        if (readCalls === 1) return { samples: [] };  // watch hasn't synced yet
        return { samples: [120, 135, 128, 140, 131].map(v => ({ value: String(v) })) };
      },
    },
  },
};

const { readWorkoutHeartRate, attachWorkoutHr } = await import(join(BUILD, "app.mjs"));

check("0. readWorkoutHeartRate alone: first call (unsynced watch) returns null",
  await readWorkoutHeartRate(Date.now() - 3600000, Date.now()) === null);
check("0b. readWorkoutHeartRate alone: second call (synced) returns real avg/peak",
  (await readWorkoutHeartRate(Date.now() - 3600000, Date.now()))?.avg === 131,
  `expected avg 131, readCalls so far=${readCalls}`);
readCalls = 0; // reset for the real test below

// ── The actual scenario: attachWorkoutHr, with a fake setStore/sb/token capturing every call ──
const sid = "sess-1", dk = "2026-08-18";
let storeUpdates = 0, lastHrSeen = null, patchCalls = [];
const setStore = fn => {
  storeUpdates++;
  const fakePrev = { history: { [dk]: { [sid]: { name: "Push A" } } } };
  const next = fn(fakePrev);
  lastHrSeen = next.history[dk][sid].hrSummary;
};
// Deliberately has NO `query` method, unlike the real sb. That makes checks 1-5 a live regression
// test for patchSharedCardHr's try/catch: the first version of that function let a synchronous
// throw escape into attachWorkoutHr's own catch, which reads ANY failure as "the HealthKit read
// failed" — so it queued a pointless retry and resolved NULL for a session whose heart rate it had
// already found and written to both the store and workout_history. Check 2 went red on it.
const sb = { queueWrite: (path, opts) => { patchCalls.push({ path, body: JSON.parse(opts.body) }); return Promise.resolve(); } };

const donePromise = attachWorkoutHr({
  wStartMs: Date.now() - 3600000, sid, dk, setStore,
  getToken: () => "faketoken", currentUserId: "me", isGuest: false, sb,
  delayMs: 30, // real code uses 90000; the mechanism is identical, only the wait is shortened
});

// Immediately after the call returns (before the retry has had time to fire), the first read
// (empty samples) must NOT have attached anything — this is the "right after finish" moment.
await new Promise(r => setTimeout(r, 5));
check("1. immediately after finish (watch not yet synced): no hrSummary attached, no PATCH sent",
  storeUpdates === 0 && patchCalls.length === 0,
  `storeUpdates=${storeUpdates} patchCalls=${patchCalls.length}`);

// Wait past the retry delay.
const hr = await donePromise;
check("2. the retry fires and attaches the real reading",
  hr?.avg === 131 && hr?.peak === 140, `got ${JSON.stringify(hr)}`);
check("3. setStore was called with the session's hrSummary set",
  lastHrSeen?.avg === 131 && lastHrSeen?.peak === 140, `lastHrSeen=${JSON.stringify(lastHrSeen)}`);
check("4. exactly one PATCH went out, to the right row, carrying hr_summary",
  patchCalls.length === 1 && patchCalls[0].path === `workout_history?id=eq.${sid}` && patchCalls[0].body.hr_summary?.avg === 131,
  JSON.stringify(patchCalls));
check("5. exactly two HealthKit reads happened (immediate + one retry, not a loop)",
  readCalls === 2, `readCalls=${readCalls}`);

// ── If the watch NEVER syncs (both reads empty), the retry must give up cleanly — no third call. ──
readCalls = 0;
window.Capacitor.Plugins.Health.readSamples = async () => { readCalls++; return { samples: [] }; };
let storeUpdates2 = 0;
const hr2 = await attachWorkoutHr({
  wStartMs: Date.now() - 3600000, sid: "sess-2", dk, setStore: () => { storeUpdates2++; },
  getToken: () => "faketoken", currentUserId: "me", isGuest: false, sb, delayMs: 20,
});
check("6. if the watch never syncs, attachWorkoutHr resolves null after exactly one retry (2 reads), not a loop",
  hr2 === null && readCalls === 2, `hr2=${hr2} readCalls=${readCalls}`);
check("6b. and never touches the store", storeUpdates2 === 0, `storeUpdates2=${storeUpdates2}`);

// ── backfillMissingHr: closes the gap attachWorkoutHr's own retry can't — the app backgrounded
// or was killed before the 90s retry fired, so the session never got a second attempt at all.
// This runs on every loadUserData (boot + foreground), scanning appHistory for recent sessions
// missing hrSummary and reconstructing their start time from finishedAt - duration (workout_history
// has no separate start-time column). Mo: "I don't know if it was supposed to show in the last 2
// workouts now or just future workouts" — the honest answer without this is "future only"; this is
// what makes it also catch up sessions that already finished before the fix, next time he opens
// the app, as long as they're within the last 24h.
const { backfillMissingHr } = await import(join(BUILD, "app.mjs"));
readCalls = 0;
window.Capacitor.Plugins.Health.readSamples = async (opts) => {
  readCalls++;
  if (opts.dataType !== "heartRate") return { samples: [] };
  return { samples: [150, 160, 155, 165].map(v => ({ value: String(v) })) }; // watch has synced by now
};
const now = Date.now();
const appHistory = {
  "2026-08-18": {
    // Missing hrSummary, finished 2h ago (well inside the 24h window) — should backfill.
    "sess-recent": { dayName: "Push A", duration: 3600, finishedAt: now - 2 * 3600000 },
    // Already has hrSummary — must be left alone (no redundant read).
    "sess-has-hr": { dayName: "Pull A", duration:3000, finishedAt: now - 3 * 3600000, hrSummary: { avg: 99, peak: 110 } },
    // Missing hrSummary but 30h old — outside the window, must NOT be retried forever.
    "sess-old": { dayName: "Legs A", duration: 2800, finishedAt: now - 30 * 3600000 },
  },
};
let backfillSets = [];
const backfillStore = fn => {
  const fakePrev = { history: JSON.parse(JSON.stringify(appHistory)) };
  const next = fn(fakePrev);
  // Only count a session as "backfilled" if it GAINED hrSummary — a naive scan for "does the
  // resulting snapshot have hrSummary" would also match sess-has-hr, which had it BEFORE this ran.
  for (const [dk, day] of Object.entries(next.history)) for (const [sid, sess] of Object.entries(day)) {
    const before = appHistory[dk]?.[sid];
    if (sess.hrSummary && !(before && before.hrSummary)) backfillSets.push(sid);
  }
};
backfillMissingHr(appHistory, { setStore: backfillStore,
  getToken: () => "faketoken", currentUserId: "me", isGuest: false, sb });
await new Promise(r => setTimeout(r, 150)); // the read is async; let it settle (no 90s retry needed here — it succeeds on the first try)
check("7. a recent session missing hrSummary gets backfilled", backfillSets.includes("sess-recent"),
  `backfillSets=${JSON.stringify(backfillSets)}`);
check("8. a session that already has hrSummary is left alone (no redundant write)",
  !backfillSets.includes("sess-has-hr"));
check("9. a session older than the 24h window is not retried", !backfillSets.includes("sess-old"));
check("10. exactly one HealthKit read happened (only the one eligible session)", readCalls === 1, `readCalls=${readCalls}`);

// ── A late HR must also reach the card already SHARED for that session ────────────────────────
// A post's `workout` jsonb is a SNAPSHOT frozen at share time, so heart rate arriving afterwards
// (the 90s retry, or the backfill on the next foreground) never reached it: History showed the HR
// and the feed showed none for the same workout. ProfileScreen hid half of this by re-attaching
// from local history at render time for `isMe` — which is precisely why it looked right on your
// own profile and wrong to everybody else. A local-only patch with no server write is the
// dominant bug class in this app, so the fix writes to both post tables, keyed on client_id.
readCalls = 0;
window.Capacitor.Plugins.Health.readSamples = async (opts) => {
  readCalls++;
  if (opts.dataType !== "heartRate") return { samples: [] };
  return { samples: [130, 140, 135, 150].map(v => ({ value: String(v) })) };
};
const shareSid = "sess-shared";
const reads = [], writes = [];
const sbShare = {
  query: (path, opts, tok) => {
    reads.push(path);
    // Model the real shape: one shared feed post for this session, already on the server, whose
    // frozen workout jsonb has NO hrSummary. group_posts has nothing for it.
    if (/^posts\?/.test(path)) return Promise.resolve([{ id: "post-1", workout: { name: "Push A", volume: 3850, exercises: [] } }]);
    return Promise.resolve([]);
  },
  queueWrite: (path, opts) => { writes.push({ path, body: JSON.parse(opts.body) }); return Promise.resolve(); },
};
await attachWorkoutHr({
  wStartMs: Date.now() - 3600000, sid: shareSid, dk: "2026-08-18",
  setStore: () => {}, getToken: () => "faketoken", currentUserId: "me", isGuest: false,
  sb: sbShare, delayMs: 20,
});
await new Promise(r => setTimeout(r, 120)); // the card lookup is a separate async hop

const cardWrite = writes.find(w => /^posts\?id=eq\./.test(w.path));
check("11. the already-shared feed card is patched with the late heart rate",
  !!cardWrite && cardWrite.body.workout?.hrSummary?.avg === 139,
  `writes=${JSON.stringify(writes.map(w => w.path))}`);
check("12. ...merged into the existing card, not replacing it (volume/name survive)",
  cardWrite && cardWrite.body.workout?.volume === 3850 && cardWrite.body.workout?.name === "Push A",
  JSON.stringify(cardWrite?.body?.workout));
check("13. both post tables are checked, keyed on client_id and scoped to workout posts",
  reads.some(p => /^posts\?client_id=eq\.sess-shared&type=eq\.workout/.test(p)) &&
  reads.some(p => /^group_posts\?client_id=eq\.sess-shared&type=eq\.workout/.test(p)),
  JSON.stringify(reads));
check("14. a table with no shared card for this session gets no write",
  !writes.some(w => /^group_posts\?id=/.test(w.path)), JSON.stringify(writes.map(w => w.path)));
// A card that ALREADY carries hrSummary must not be rewritten — a redundant PATCH on every
// foreground would churn the feed row (and its updated_at) for no change.
writes.length = 0;
const sbAlready = {
  query: () => Promise.resolve([{ id: "post-9", workout: { name: "Push A", hrSummary: { avg: 111, peak: 120 } } }]),
  queueWrite: (path, opts) => { writes.push({ path, body: JSON.parse(opts.body) }); return Promise.resolve(); },
};
await attachWorkoutHr({
  wStartMs: Date.now() - 3600000, sid: "sess-already", dk: "2026-08-18",
  setStore: () => {}, getToken: () => "faketoken", currentUserId: "me", isGuest: false,
  sb: sbAlready, delayMs: 20,
});
await new Promise(r => setTimeout(r, 120));
check("15. a card that already carries HR is left alone (no redundant PATCH)",
  !writes.some(w => /\?id=eq\.post-9/.test(w.path)), JSON.stringify(writes.map(w => w.path)));

// ── The backfill must read the SESSION's window, not "start -> now" ──────────────────────────
// The stub above ignores opts.startDate/endDate entirely, which is exactly why checks 7-10 could
// not see this: backfillMissingHr passed the session's start but left the end at Date.now(), so a
// 1h workout read hours later averaged every heart-rate sample from the workout's start to the
// present moment and wrote a whole-DAY summary onto that session — plausible-looking, wrong, and
// permanent, since the backfill skips anything that already has an hrSummary. This section records
// the window the app actually asks HealthKit for and pins it to the session.
let windows = [];
window.Capacitor.Plugins.Health.readSamples = async (opts) => {
  windows.push({ start: new Date(opts.startDate).getTime(), end: new Date(opts.endDate).getTime() });
  if (opts.dataType !== "heartRate") return { samples: [] };
  return { samples: [130, 140, 135, 150].map(v => ({ value: String(v) })) };
};
const nowW = Date.now();
const finishedAt = nowW - 8 * 3600000;   // finished 8 hours ago
const durationS = 3600;                  // ran for exactly one hour
backfillMissingHr(
  { "2026-08-18": { "sess-window": { dayName: "Push A", duration: durationS, finishedAt } } },
  { setStore: () => {}, getToken: () => "faketoken", currentUserId: "me", isGuest: false, sb: sbShare });
await new Promise(r => setTimeout(r, 120));

// readWorkoutHeartRate pads the window by exactly 60s on EACH side (so a watch that starts
// recording a moment late still counts), which is why these tolerances are 61s and the expected
// span is the duration + 2 minutes rather than the bare duration.
const PAD = 60000;
const hrWin = windows.find(w => Math.abs(w.start - (finishedAt - durationS * 1000 - PAD)) <= 61000);
const spanH = hrWin ? (hrWin.end - hrWin.start) / 3600000 : null;
check("16. the backfill reads from the session's own start", !!hrWin,
  `windows=${JSON.stringify(windows)}`);
check("17. ...and ends at the session's END, not at 'now' 8 hours later",
  hrWin && Math.abs(hrWin.end - (finishedAt + PAD)) <= 61000,
  hrWin ? `window ended ${((hrWin.end - finishedAt)/3600000).toFixed(2)}h after the session did` : "no window");
check("18. so the queried span matches the workout's duration (1h + padding), not the whole day",
  spanH != null && Math.abs(spanH - (durationS * 1000 + 2 * PAD) / 3600000) < 0.05,
  spanH == null ? "no window" : `queried ${spanH.toFixed(2)}h for a ${(durationS/3600).toFixed(2)}h session`);

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
