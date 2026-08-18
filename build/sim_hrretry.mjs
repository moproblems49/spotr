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

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
