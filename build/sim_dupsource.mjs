// DUPLICATE HEALTHKIT SOURCES — an iPhone and an Apple Watch both record steps for the same walk.
// The plugin reads with HKSampleQuery, which returns every source's samples unmerged, and the app
// summed them: inflated step/calorie totals, and phantom "active" hours that push the Body Battery
// bedtime gate later (it treats 120+ steps in an hour as proof you were awake).
// Same class as the sleep double-count; this is the pre-existing instance found by sweeping for it.
import { dominantSource } from "./app.mjs";

let fails = 0;
const check = (l,c,d)=>{ if(c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d?" — "+d:""}`);} };
const sum = (a) => a.reduce((x,s)=>x+(parseFloat(s.value)||0),0);
const S = (src, val, hour) => ({ sourceName: src, value: val, startDate: new Date(2026,6,29,hour).toISOString() });

// A day's walking, seen by both devices.
const watch = [S("Apple Watch", 3000, 9), S("Apple Watch", 4000, 14), S("Apple Watch", 1000, 19)];
const phone = [S("iPhone",      2600, 9), S("iPhone",      3500, 14), S("iPhone",       900, 19)];

check("raw sum double-counts", sum([...watch, ...phone]) === 15000, `${sum([...watch,...phone])}`);
const merged = dominantSource([...watch, ...phone]);
check("dedup keeps ONE source", new Set(merged.map(s=>s.sourceName)).size === 1, `${[...new Set(merged.map(s=>s.sourceName))]}`);
check("dedup keeps the more complete source (Watch, 8000)", sum(merged) === 8000, `${sum(merged)}`);
check("total is now plausible, not ~2x", sum(merged) < sum([...watch,...phone]) * 0.6);

// A single source must pass through completely untouched.
check("single source is unchanged", dominantSource(watch).length === 3 && sum(dominantSource(watch)) === 8000);
check("single source returns the same array contents", JSON.stringify(dominantSource(phone)) === JSON.stringify(phone));

// Samples with no sourceName group together rather than being dropped.
const noSrc = [{ value: 500 }, { value: 700 }];
check("missing sourceName still sums", sum(dominantSource(noSrc)) === 1200, `${sum(dominantSource(noSrc))}`);
const mixed = [...noSrc, S("Apple Watch", 5000, 9)];
check("named source beats unnamed when it's bigger", sum(dominantSource(mixed)) === 5000, `${sum(dominantSource(mixed))}`);

// Degenerate input.
check("empty array safe", dominantSource([]).length === 0);
check("null safe", dominantSource(null).length === 0);
check("undefined safe", dominantSource(undefined).length === 0);

// The bedtime gate is the reason this matters: 120+ steps in an hour reads as "awake".
// Two quiet sources that each sit under the threshold must not add up to crossing it.
const quiet = [{ sourceName:"iPhone", value:70, startDate:new Date(2026,6,29,23).toISOString() },
               { sourceName:"Apple Watch", value:65, startDate:new Date(2026,6,29,23).toISOString() }];
check("two quiet sources don't fake an ACTIVE hour (would be 135 summed)", sum(dominantSource(quiet)) < 120, `${sum(dominantSource(quiet))}`);

console.log(`\n${fails===0?"ALL PASS":fails+" FAIL(S)"}`);
process.exit(fails?1:0);
