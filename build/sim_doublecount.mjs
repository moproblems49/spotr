// TWO "MEASURED WRONG" BUGS found by sweeping for the duplicate/double-count class.
//
// 1. VOLUME COUNTED WARMUPS ON SOME SCREENS BUT NOT OTHERS. The finish summary excluded warmups;
//    History, the feed, Profile, the live in-progress number and the weekly/lifetime stats all
//    counted them. The same workout therefore read heavier in History than on the summary that
//    saved it. sessionVolume() is now the single definition.
//
// 2. APPLE HEALTH CALORIES COULD BE WRITTEN TWICE FOR ONE SESSION. "Undo finish & edit" then
//    finish again is a normal flow, and a glitched-then-retried finish is one that really happened.
//    The workout_history row was idempotent (same sid, upsert); this write was not, so the Move
//    ring got the session twice — external data we can't clean up.
// The health guard reads/writes localStorage, which bare node lacks — provide a minimal one
// BEFORE importing the bundle (module-level code in the app reads globals at import time).
const _ls = new Map();
globalThis.localStorage = {
  getItem: k => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => _ls.set(k, String(v)),
  removeItem: k => _ls.delete(k),
};
const { sessionVolume, workingDone, alreadyWroteHealth, markWroteHealth } = await import("./app.mjs");

let fails = 0;
const check = (l,c,d)=>{ if(c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d?" — "+d:""}`);} };

// A realistic session: two warmup sets then three working sets, on two exercises.
const sess = { exercises: [
  { name:"Bench Press", sets:[
    { weight:"45",  reps:"10", done:true, type:"warmup" },
    { weight:"95",  reps:"5",  done:true, type:"warmup" },
    { weight:"185", reps:"5",  done:true, type:"normal" },
    { weight:"185", reps:"5",  done:true, type:"normal" },
    { weight:"185", reps:"4",  done:true, type:"normal" },
  ]},
  { name:"Row", sets:[
    { weight:"70",  reps:"10", done:true, type:"warmup" },
    { weight:"135", reps:"8",  done:true, type:"normal" },
    { weight:"135", reps:"8",  done:true, type:"normal" },
    { weight:"135", reps:"8",  done:false, type:"normal" },  // not completed
  ]},
]};

const working = 185*5 + 185*5 + 185*4 + 135*8 + 135*8;   // 2590 + 2160 = 4750
const warmups = 45*10 + 95*5 + 70*10;                     // 450 + 475 + 700 = 1625

check("volume counts working sets only", sessionVolume(sess) === working, `${sessionVolume(sess)} vs ${working}`);
check("warmups are excluded", sessionVolume(sess) !== working + warmups, `${sessionVolume(sess)}`);
check("incomplete sets are excluded", sessionVolume(sess) === working);
console.log(`     (warmups would have added ${warmups} lbs — ${(100*warmups/working).toFixed(0)}% inflation)`);
check("the inflation was material, not rounding", warmups / working > 0.2);

check("workingDone drops warmups and undone sets", workingDone(sess.exercises[1].sets).length === 2,
  `${workingDone(sess.exercises[1].sets).length}`);

// Degenerate shapes must not throw — these run on every History row, including legacy ones.
check("null session is 0", sessionVolume(null) === 0);
check("session with no exercises is 0", sessionVolume({}) === 0);
check("exercise with no sets is 0", sessionVolume({ exercises:[{ name:"X" }] }) === 0);
check("non-numeric weights are ignored", sessionVolume({ exercises:[{ sets:[{ weight:"", reps:"5", done:true }] }] }) === 0);
check("workingDone(undefined) is empty", workingDone(undefined).length === 0);
// A set with no explicit type is a working set (legacy rows predate the type field).
check("legacy sets with no type still count", sessionVolume({ exercises:[{ sets:[{ weight:"100", reps:"5", done:true }] }] }) === 500);

// ── The Apple Health write guard ─────────────────────────────────────────────────────────────
globalThis.localStorage.removeItem("seshd_health_written");
const sid = "sess-abc-123";
check("a fresh session has not been written", !alreadyWroteHealth(sid));
markWroteHealth(sid);
check("after writing, the same sid is blocked", alreadyWroteHealth(sid));
check("marking twice is harmless", (markWroteHealth(sid), alreadyWroteHealth(sid)));
check("a DIFFERENT session still writes", !alreadyWroteHealth("sess-xyz-999"));
check("no sid never blocks and never records", !alreadyWroteHealth(null) && (markWroteHealth(null), true));
// Survives a reload: the flag lives in localStorage, not memory.
check("the guard is persisted, not in-memory",
  JSON.parse(globalThis.localStorage.getItem("seshd_health_written")).includes(sid));
// The list is capped so it can't grow without bound.
for (let i = 0; i < 80; i++) markWroteHealth("s" + i);
const stored = JSON.parse(globalThis.localStorage.getItem("seshd_health_written"));
check("the written-list stays bounded", stored.length <= 50, `${stored.length}`);
check("the most recent sessions are the ones kept", stored.includes("s79"));

console.log(`\n${fails===0?"ALL PASS":fails+" FAIL(S)"}`);
process.exit(fails?1:0);
