// WEEKLY REVIEW WAITS FOR A WEEK OF TRAINING (Mo, Nov 28).
// A brand-new account got its first review on day one, written from one session, and it read as a
// stale summary of a week still in progress. trainedForAWeek is the gate the generator uses.
const _ls = new Map();
globalThis.localStorage = { getItem: k => (_ls.has(k) ? _ls.get(k) : null), setItem: (k, v) => _ls.set(k, String(v)), removeItem: k => _ls.delete(k) };
globalThis.window = undefined;
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
const { trainedForAWeek } = await import("./app.mjs");
const dk = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const NOW = new Date(2026, 10, 29, 9, 0).getTime();           // a Sunday morning, local
const day = n => dk(NOW - n * 864e5);
const hist = (...ago) => Object.fromEntries(ago.map(n => [day(n), { ["s" + n]: { exercises: [] } }]));
check("[control] no history -> no review", trainedForAWeek({ history: {} }, NOW) === false);
check("first session today -> no review", trainedForAWeek({ history: hist(0) }, NOW) === false);
check("first session 6 days ago -> no review yet", trainedForAWeek({ history: hist(6, 2, 0) }, NOW) === false);
check("first session exactly 7 days ago -> review", trainedForAWeek({ history: hist(7, 1) }, NOW) === true);
check("long history -> review", trainedForAWeek({ history: hist(60, 30, 2) }, NOW) === true);
check("an empty day key does not count as training", trainedForAWeek({ history: { [day(30)]: {}, [day(1)]: { s: {} } } }, NOW) === false);
// "0bad" sorts BEFORE every real key, so without the guard it becomes the first day, yields NaN
// days and blocks the review forever. Expecting TRUE is what makes this check able to fail.
check("a malformed key is ignored, not crashed on", trainedForAWeek({ history: { "0bad": { s: {} }, [day(30)]: { s: {} } } }, NOW) === true);
// 23:00 seven local days ago still counts as seven days (local-day comparison, not instants).
const late = new Date(NOW - 7 * 864e5); late.setHours(23, 0, 0, 0);
check("a late-evening first session seven days ago counts", trainedForAWeek({ history: { [dk(late.getTime())]: { s: {} } } }, NOW) === true);
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
