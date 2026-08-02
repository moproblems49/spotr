// THE RECOVERY SCORE MUST BE WINNABLE AND STILL HONEST.
//
// Both heart terms used to map "exactly at your own baseline" to 0.5, so a completely normal day
// scored 57% and any ordinary wobble fell into "Take it easy". Measured before the fix: HRV 5%
// under baseline + resting HR 2% over + 6.5h sleep = 37%. Mo reported precisely that while feeling
// great. A baseline IS your typical day — scoring it half guarantees the number lives in the red,
// the same flaw the Body Battery scale had.
//
// This pins BOTH ends, because the failure mode of "fixing" a score like this is making it
// flattering: if a wrecked day no longer reads as wrecked, the number can't do its one job.
//
// The formula lives inside readRecovery, which needs a device, so the scoring maths is replicated
// here — and the replica is checked against the SHIPPED constants below so the two can't drift.
import { readFileSync } from "fs";

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

// ── Pin the replica to the real source ───────────────────────────────────────────────────────
const src = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const hrvLine = src.split("\n").find(l => /ratio - 0\.\d+\) \/ 0\.\d+\)\), 0\.5\]/.test(l)) || "";
const rhrLine = src.split("\n").find(l => /1\.\d+ - ratio\) \/ 0\.\d+\)\), 0\.25\]/.test(l)) || "";
const hrvNums = (hrvLine.match(/0\.\d+/g) || []).slice(0, 2);
const rhrNums = (rhrLine.match(/1\.\d+|0\.\d+/g) || []).slice(0, 2);
check("the shipped HRV mapping is (ratio - 0.78) / 0.30",
  hrvNums[0] === "0.78" && hrvNums[1] === "0.30", hrvLine.trim().slice(0, 120));
check("the shipped RHR mapping is (1.075 - ratio) / 0.10",
  rhrNums[0] === "1.075" && rhrNums[1] === "0.10", rhrLine.trim().slice(0, 120));

const H = r => Math.max(0, Math.min(1, (r - Number(hrvNums[0])) / Number(hrvNums[1])));
const R = r => Math.max(0, Math.min(1, (Number(rhrNums[0]) - r) / Number(rhrNums[1])));
const S = h => h >= 8 ? 1 : h >= 7 ? 0.78 : h >= 6 ? 0.5 : h >= 5 ? 0.28 : 0.12;
const score = (hrvRatio, rhrRatio, sleepH) =>
  Math.round((0.5 * H(hrvRatio) + 0.25 * R(rhrRatio) + 0.25 * S(sleepH)) * 100);
// recoveryVerdict's bands, kept in step with src/App.jsx.
const verdict = t => t >= 78 ? "Ready to push" : t >= 62 ? "Ready" : t >= 45 ? "Moderate" : "Take it easy";

const show = (l, hr, rr, sh) => { const s = score(hr, rr, sh);
  console.log(`  ${l.padEnd(36)} ${String(s).padStart(3)}%  ${verdict(s)}`); return s; };

// ── THE TOP END: a normal day must not read as a warning ─────────────────────────────────────
console.log("normal:");
const baseline7 = show("at baseline, 7h sleep", 1.0, 1.0, 7);
const baseline8 = show("at baseline, 8h sleep", 1.0, 1.0, 8);
const mosCase   = show("HRV -5%, RHR +2%, 6.5h", 0.95, 1.02, 6.5);
const mildDip   = show("HRV -7%, RHR +3%, 6h", 0.93, 1.03, 6);

check("being exactly at your own baseline reads as Ready, not Moderate", baseline7 >= 62, `${baseline7}%`);
check("...and a full night on top of that can reach the top band", baseline8 >= 78, `${baseline8}%`);
check("an ordinary small dip is not 'Take it easy'", mosCase >= 45, `${mosCase}%`);
check("...nor is a slightly worse one", mildDip >= 45, `${mildDip}%`);

// ── THE BOTTOM END: a wrecked day must still say so, or the number is decoration ──────────────
console.log("wrecked:");
const wrecked = show("HRV -18%, RHR +6%, 4.5h", 0.82, 1.06, 4.5);
const ill     = show("HRV -25%, RHR +8%, 5h", 0.75, 1.08, 5);
const noSleep = show("at baseline HR but 3h sleep", 1.0, 1.0, 3);

check("a genuinely wrecked day stays under 40%", wrecked < 40, `${wrecked}%`);
check("...and an illness pattern is lower still", ill < wrecked, `${ill}% vs ${wrecked}%`);
check("...and the 'Take it easy' copy still fires for both",
  verdict(wrecked) === "Take it easy" && verdict(ill) === "Take it easy");
check("three hours of sleep is visibly penalised even with perfect HR",
  noSleep < 62, `${noSleep}%`);

// ── Monotonic in every input, or the number means nothing ────────────────────────────────────
const hrvSweep = [0.75, 0.85, 0.95, 1.0, 1.05, 1.15].map(r => score(r, 1.0, 7));
const rhrSweep = [1.10, 1.05, 1.0, 0.95].map(r => score(1.0, r, 7));
const slpSweep = [4, 5, 6, 7, 8].map(h => score(1.0, 1.0, h));
console.log("sweeps:", JSON.stringify({ hrvSweep, rhrSweep, slpSweep }));
check("rises with HRV", hrvSweep.every((v, i) => i === 0 || v >= hrvSweep[i - 1]), JSON.stringify(hrvSweep));
check("rises as resting HR falls", rhrSweep.every((v, i) => i === 0 || v >= rhrSweep[i - 1]), JSON.stringify(rhrSweep));
check("rises with sleep", slpSweep.every((v, i) => i === 0 || v >= slpSweep[i - 1]), JSON.stringify(slpSweep));

// The bands must be reachable in both directions — a score that can never leave one band is noise.
const all = [baseline7, baseline8, mosCase, mildDip, wrecked, ill, noSleep].map(verdict);
check("the scale actually uses more than one band", new Set(all).size >= 3, JSON.stringify(all));

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
