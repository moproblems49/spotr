// HISTORY'S PER-EXERCISE LINE MUST NOT INVENT A STRAIGHT SET.
//
// History printed `${count} × ${firstSet.reps} reps · ${topWeight}`, so a bench session of
// 185×8, 155×10 (drop), 185×6 read "3 × 8 reps · 185 lbs" — three sets of eight at 185, which
// never happened (Muse, Nov 23 2026). historySetsSummary is the one definition now: the compact
// form only when every set really is identical, otherwise the sets in the order performed.
const _ls = new Map();
globalThis.localStorage = { getItem: k => (_ls.has(k) ? _ls.get(k) : null), setItem: (k, v) => _ls.set(k, String(v)), removeItem: k => _ls.delete(k) };
globalThis.window = undefined;
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const { historySetsSummary: f } = await import("./app.mjs");
const S = (w, r, type) => ({ weight: String(w), reps: String(r), done: true, ...(type ? { type } : {}) });

const varied = f([S(185, 8), S(155, 10, "drop"), S(185, 6)], "lbs");
check("varied sets are listed as performed", varied === "185×8 · 155×10 · 185×6 lbs", varied);
check("...and never claim a straight 3 × 8", !/3 × 8/.test(varied), varied);
const same = f([S(185, 8), S(185, 8), S(185, 8)], "lbs");
check("[control] identical sets keep the compact form", same === "3 × 8 reps · 185 lbs", same);
const sameW = f([S(185, 8), S(185, 7), S(185, 6)], "lbs");
check("same weight, falling reps is NOT a straight set", sameW === "185×8 · 185×7 · 185×6 lbs", sameW);
const bw = f([S("", 12), S("", 10)], "lbs");
check("bodyweight sets with different reps list the reps", bw === "12 · 10 reps", bw);
const bwSame = f([S("", 12), S("", 12)], "kg");
check("identical bodyweight sets show no weight", bwSame === "2 × 12 reps", bwSame);
const long = f([1, 2, 3, 4, 5, 6].map(i => S(100 + i * 5, 5)), "kg");
check("a long list is capped with +N, in the session's unit", long === "105×5 · 110×5 · 115×5 · 120×5 +2 kg", long);
const mixed = f([S(20, 10), S("", 12)], "lbs");
check("a weighted set beside a bodyweight one says BW", mixed === "20×10 · BW×12 lbs", mixed);
check("{w,r} pairs are accepted too", f([{ w: 100, r: 5 }, { w: 90, r: 8 }], "kg") === "100×5 · 90×8 kg");
check("no sets -> empty", f([], "lbs") === "" && f(undefined) === "");
console.log(fails ? `${fails} FAIL(S)` : "ok");
process.exit(fails ? 1 : 0);
