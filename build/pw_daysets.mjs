// A TILE LABELLED "total sets" MUST COUNT SETS.
//
// Mo's Push B day showed "8 exercises · 71 total sets". Eight exercises cannot be 71 sets. The tile
// was `exercises.reduce((a,ex) => a + (parseInt(ex.reps)||3), 0)` — it read the REPS field, so
// parseInt("10-15") contributed 10 and the number was the sum of the low end of every rep range.
// His real answer was about 24.
//
// ★ THE REASON THIS SURVIVED: the built-in program templates write reps as "4x5-8", and on that
// shape parseInt grabs the leading SET count, so the tile is accidentally right. Every template
// day looks correct, and so does any fixture copied from one — the first fixture written for this
// audit read a perfectly plausible "20" for exactly that reason. The bug only appears for a day
// whose reps are a bare range like "10-15", which is what the day editor writes and what Mo has.
// So this suite seeds BOTH shapes and asserts both, because a one-shape test cannot see the bug.
//
// Shown red against the pre-fix code: the bare-range day reported 60 instead of 18.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

// Day A — bare rep ranges, the shape the day editor writes and the shape that broke.
// No explicit `sets`, no leading "N x", so every exercise is progSetCount's default of 3 → 18.
const BARE = ["5–7", "10–15", "15–20", "10–12", "12–15", "8–12"];
const BARE_EXPECT = 3 * BARE.length;                    // 18
const BARE_BUGGY  = BARE.reduce((a, r) => a + parseInt(r), 0);  // 60 — what the old code printed

// Day B — the template shape, where the old code was accidentally right. Pinned so a "fix" that
// simply swaps one wrong reading for another still has to satisfy the case that always worked.
const LEAD = [["4×5–8",4], ["3×8–12",3], ["3×10–12",3], ["5×5",5], ["3×12–15",3]];
const LEAD_EXPECT = LEAD.reduce((a, [,n]) => a + n, 0); // 18

// Day C — an explicit numeric `sets` field must win over anything in the reps string.
const EXPLICIT = [{ reps:"10–15", sets:5 }, { reps:"8–12", sets:4 }];
const EXPLICIT_EXPECT = 9;

const PROGRAM = { id:"prog-x", name:"Audit Program", days:[
  { id:"dA", name:"Bare Ranges Day",  exercises: BARE.map((r,i) => ({ name:["Barbell Bench Press","Incline DB Press","Lateral Raises (DB)","Machine Chest Press","Cable Fly (Low-to-High)","Tricep Rope Pushdown"][i], reps:r, rest:"90" })) },
  { id:"dB", name:"Template Shape Day", exercises: LEAD.map(([r],i) => ({ name:["Barbell Back Squat","Leg Press","Romanian Deadlift","Seated Leg Curl","Standing Calf Raise (Machine)"][i], reps:r, rest:"90" })) },
  { id:"dC", name:"Explicit Sets Day", exercises: EXPLICIT.map((e,i) => ({ name:["Barbell Row","Barbell Curl"][i], ...e, rest:"90" })) },
]};

const browser = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const page = await browser.newPage({ viewport:{ width:428, height:926 }, deviceScaleFactor:2, hasTouch:true, isMobile:true });
page.setDefaultTimeout(6000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0,160)); });

await page.addInitScript(([me, prog]) => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
    programs:[prog], activeProgramId: prog.id, history:{}, workoutDates:{}, weeklyTarget:4,
    bodyLog:[], prs:{}, prEvents:[], posts:[], profile:{ username:"momo", name:"Mo" },
    users:[{ id: me, username:"momo", name:"Mo", followers:[], following:[] }] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
}, [ME, PROGRAM]);
await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
  body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
await page.route("**/rest/v1/**", r => r.abort());
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil:"domcontentloaded" });
await page.waitForTimeout(3200);

// Open a day's PREVIEW by tapping its card on the Workout tab. Not the program card (that opens the
// editor) and not the card's own Edit/Start buttons — the preview is the card body itself.
async function openDay(name) {
  await page.evaluate(() => { const b=[...document.querySelectorAll("button")]
    .find(x=>x.offsetParent && /^(Close|Back|‹)$/i.test((x.getAttribute("aria-label")||x.textContent||"").trim())); b&&b.click(); });
  await page.waitForTimeout(500);
  const hit = await page.evaluate(n => {
    const x = [...document.querySelectorAll("button")].filter(e => e.offsetParent)
      .find(e => (e.textContent||"").includes(n) && !/^(Edit|Start)/.test((e.textContent||"").trim()));
    if (x) { x.click(); return true; } return false;
  }, name);
  await page.waitForTimeout(1200);
  return hit;
}
// Read the tile by its LABEL, then take the value rendered directly above it.
const readTile = label => page.evaluate(l => {
  const lab = [...document.querySelectorAll("div")].find(d => (d.textContent||"").trim() === l);
  if (!lab) return null;
  const v = lab.previousElementSibling;
  return v ? v.textContent.trim() : null;
}, label);

for (const [dayName, expect, note] of [
  ["Bare Ranges Day",   BARE_EXPECT,     `bare ranges — the shape that broke (old code printed ${BARE_BUGGY})`],
  ["Template Shape Day", LEAD_EXPECT,    "leading N× — the shape the old code got right by accident"],
  ["Explicit Sets Day",  EXPLICIT_EXPECT,"an explicit numeric sets field must win over the reps string"],
]) {
  const opened = await openDay(dayName);
  const body = await page.evaluate(() => document.body.innerText);
  check(`${dayName}: the preview opened`, opened && /total sets/i.test(body),
    body.slice(0,110).replace(/\n/g," | "));
  if (!opened || !/total sets/i.test(body)) continue;
  // The rep chip must read "N×range" — the SAME N the tile totals. Mo's day showed a bare "5–7"
  // because the chip rendered ex.reps raw, so a program written with bare ranges never showed a set
  // count anywhere on this screen.
  // ANCHORED AT BOTH ENDS. `/^\d+×\d/` (unanchored at the tail) also matches the redesigned "Last"
  // line, whose span reads like "225×9   220×6   215×6" — a single string of several pairs. This
  // fixture seeds no history so that span never renders today and the check has always passed, but
  // it is a booby trap: adding history to the fixture would spuriously fail the chip COUNT with a
  // message about rep chips, pointing at the wrong thing entirely. `$` after the range makes a chip
  // the only thing that can match, and is strictly TIGHTER than before — nothing that matched
  // previously stops matching.
  const chips = await page.evaluate(() => [...document.querySelectorAll("span")]
    .map(e => (e.textContent||"").trim())
    .filter(t => /^\d+×[\d–—-]+$/.test(t)).slice(0, 8));
  const got = await readTile("total sets");
  const ex  = await readTile("exercises");
  console.log(`   ${dayName}: ${ex} exercises · ${got} total sets   (${note})`);
  check(`${dayName}: "total sets" reads ${expect}`, String(got) === String(expect), `got ${got}`);
  console.log(`   ${dayName}: rep chips -> ${chips.join(", ") || "(none matched N×…)"}`);
  check(`${dayName}: every rep chip shows sets × reps, not a bare range`,
    chips.length === Number(ex), `${chips.length} of ${ex} chips matched N×… : ${chips.join(", ")}`);
  const chipSum = chips.reduce((a, t) => a + parseInt(t), 0);
  check(`${dayName}: the chips' set counts add up to the "total sets" tile (${expect})`,
    chipSum === Number(expect), `chips total ${chipSum}, tile says ${got}`);
}

// The tile must never exceed a sane ceiling for its own exercise count — the shape of the original
// symptom ("8 exercises, 71 sets"). A generic guard, so a future rewrite that reads some other
// field is caught even if it happens to miss the three cases above.
await openDay("Bare Ranges Day");
const ex = Number(await readTile("exercises")), sets = Number(await readTile("total sets"));
check("a day's set total stays under 10 sets per exercise (the '8 exercises, 71 sets' shape)",
  ex > 0 && sets > 0 && sets / ex < 10, `${sets} sets over ${ex} exercises = ${(sets/ex).toFixed(1)} per exercise`);

await browser.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
process.exit(fails ? 1 : 0);
