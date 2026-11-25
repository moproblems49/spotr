// ESTIMATED START MUST NOT MOVE WHEN YOU FINISH A WORKOUT (Muse, Nov 24).
//
// With no Apple Health data the morning charge is estimated from days since your last workout.
// It used to count from NOW, so finishing a session at noon flipped "trained yesterday" (74) to
// "trained today" (70): the sheet's "Est. start" changed mid-workout and the session was charged
// twice — once as a lower start and again as training drain — so the breakdown under the
// number could not reconcile with the before/after values. The start describes how you WOKE; only
// sessions finished before the wake anchor may move it.
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://app.test/" });
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.localStorage = dom.window.localStorage;
let fails = 0; const check = (l, c, d) => { if (c) console.log("PASS " + l); else { fails++; console.log("FAIL " + l + (d ? " — " + d : "")); } };

const RealDate = Date;
let NOW = new RealDate(2026, 6, 22, 11, 0, 0).getTime();
global.Date = class extends RealDate { constructor(...a) { if (!a.length) return new RealDate(NOW); return new RealDate(...a); } static now() { return NOW; } };
const at = (h, m = 0, dayOff = 0) => new RealDate(2026, 6, 22 + dayOff, h, m, 0).getTime();

const { computeBodyBattery } = await import("./app.mjs");
check("0. engine exports computeBodyBattery", typeof computeBodyBattery === "function");

const keyOf = (t) => { const d = new RealDate(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const sets = (n) => Array.from({ length: n }, () => ({ weight: "135", reps: "8", done: true, type: "normal" }));
const sess = (id, endMs, n) => ({ id, finishedAt: endMs, duration: 3600, exercises: [{ name: "Barbell Bench Press", sets: sets(n) }] });
const withSess = (...ss) => { const h = {}; for (const s of ss) { const k = keyOf(s.finishedAt); (h[k] ||= {})[s.id] = s; } return { history: h }; };

const yest = sess("y", at(18, 0, -1), 20);
const today = sess("t", at(12, 0), 28);

// 1. The start is the same before and after today's session.
NOW = at(11, 0);
const before = computeBodyBattery(withSess(yest));
NOW = at(13, 30);
const after = computeBodyBattery(withSess(yest, today));
check("1a. no-health start = 74 the morning after a training day", before.charge0 === 74, `got ${before.charge0}`);
check("1b. Est. start does NOT change after finishing a workout today", after.charge0 === before.charge0, `${before.charge0} -> ${after.charge0}`);
check("1c. today's session is charged as training drain instead", after.workoutDrain > 0, `workoutDrain ${after.workoutDrain}`);
check("1d. the breakdown reconciles: start - awake - training - activity + rest = level",
  after.charge0 - after.baselineDrain - after.workoutDrain - after.activityDrain + after.restRecharge === after.level || Math.abs(after.charge0 - after.baselineDrain - after.workoutDrain - after.activityDrain + after.restRecharge - after.level) <= 1,
  JSON.stringify(after));

// 2. Same baseline all day: with no new workout the level can only fall (no activity data = no rest credit).
NOW = at(18, 47);
const evening = computeBodyBattery(withSess(yest, today));
check("2a. the evening uses the same start as right after training", evening.charge0 === after.charge0, `${after.charge0} vs ${evening.charge0}`);
check("2b. the level does not rise later in the day with no rest data", evening.level <= after.level, `${after.level} -> ${evening.level}`);

// 3. A session finished BEFORE this morning's wake (after midnight) is how you woke: it moves the start.
const late = sess("l", at(0, 54), 20);
NOW = at(11, 0);
const afterLate = computeBodyBattery(withSess(yest, late));
check("3a. a pre-wake session today lowers the start (trained 'today' as of waking)", afterLate.charge0 === 70, `got ${afterLate.charge0}`);
check("3b. ...and is not charged a second time as training drain", afterLate.workoutDrain === 0, `workoutDrain ${afterLate.workoutDrain}`);

// 4. Rest days still raise the floor.
NOW = at(11, 0);
const rested = computeBodyBattery(withSess(sess("o", at(18, 0, -4), 20)));
check("4. four rest days -> 82", rested.charge0 === 82, `got ${rested.charge0}`);
const none = computeBodyBattery({ history: {} });
check("4b. no history at all -> 82", none.charge0 === 82, `got ${none.charge0}`);

console.log(fails ? `FAIL ${fails}` : "PASS all");
process.exit(fails ? 1 : 0);
