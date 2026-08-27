// Leaf primitives shared by every engine module and by App.jsx.
//
// This file exists so the engine modules never have to import from App.jsx — a circular import
// between a 20k-line module and its own helpers is exactly the kind of fragile wiring that breaks
// differently under Vite than it does under esbuild. Nothing in here imports anything: keep it
// that way, and this stays the safe bottom of the dependency graph.
//
// dateKeyOf/dateFromKey are a matched pair and must stay together — a bare "YYYY-MM-DD" parses as
// midnight UTC, which reads as the PREVIOUS EVENING everywhere west of Greenwich, so dateFromKey
// anchors at local noon. Four call sites once used the bare parse and reported every session a day
// early. workingDone is the one definition of "a set that counts" (done, and not a warmup; a set
// with no type is legacy and still counts).

const IS_DEV = !!(import.meta.env && import.meta.env.DEV); // true in `vite dev`, false in production builds

const devWarn = (...args) => { if (IS_DEV) console.warn(...args); };

const devError = (...args) => { if (IS_DEV) console.error(...args); };


// Get the most recent COMPLETED session for an exercise (across all sets)
// Working sets only: marked done, and not a warmup. Volume and set counts have to agree
// everywhere, and they didn't — the finish summary excluded warmups while History, the feed,
// Profile and the weekly stats all counted them, so the SAME workout read a few thousand pounds
// heavier depending on which screen you were looking at. One definition, used by all of them.
function workingDone(sets) { return (sets || []).filter(s => s.done && s.type !== "warmup"); }

// ONE local-date key. This exact template literal was written out THIRTEEN times across App.jsx
// — Body Battery, the activity reads, the RHR trend, the body-weight log, the streak, the
// strength-score snapshots. All thirteen were byte-identical, so nothing had drifted yet, but the
// volume maths had eight copies and two of those HAD diverged. Accepts a Date or an epoch ms.
function dateKeyOf(t) { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

// THE INVERSE, AND IT IS NOT `new Date(key)`. A bare "2026-08-10" is parsed by the spec as midnight
// UTC, and every getter that reads it back — getDate(), toLocaleDateString() — is LOCAL. West of
// Greenwich that lands on the previous EVENING, so the whole day reads one earlier: a Monday
// session displayed as "Aug 9" in the exercise's Recent list and "8/9" on the chart axis, while
// the chart's own hold-to-read tooltip (which already parsed at local noon) correctly said
// "Mon, Aug 10". Noon is the safe anchor — no timezone on Earth is 12 hours from UTC in a way that
// moves the date, and it survives DST. Accepts a full timestamp too, since some rows carry
// `created_at` rather than a date key.
function dateFromKey(v) {
  const str = String(v ?? "");
  return new Date(str.length <= 10 ? str + "T12:00:00" : str);
}


// Local-date key YYYY-MM-DD. MUST use local components, not toISOString() (which is
// UTC and shifts the day for users in positive-UTC timezones, misaligning the
// heatmap/calendar and day-grouping of workouts).
const dKey = (d = new Date()) => {
  const dt = (d instanceof Date) ? d : new Date(d);
  return dateKeyOf(dt);
};


const LBS_TO_KG = 0.453592;

const LBS_PER_KG = 1 / LBS_TO_KG; // 2.2046 — single source of truth for kg→lbs (replaces scattered 2.205 literals)


function cvt(w, from, to) {
  if (!w || from === to) return w;
  const n = parseFloat(w);
  if (isNaN(n)) return w;
  if (from === "lbs" && to === "kg") return Math.round(n * LBS_TO_KG * 10) / 10;
  if (from === "kg" && to === "lbs") return Math.round(n / LBS_TO_KG * 10) / 10;
  return n;
}



// ═════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═════════════════════════════════════════════════════════════════════════════
const uid = () => Math.random().toString(36).slice(2,10);

export { IS_DEV, devWarn, devError, dateKeyOf, dateFromKey, workingDone, dKey, LBS_TO_KG, LBS_PER_KG, cvt, uid };
