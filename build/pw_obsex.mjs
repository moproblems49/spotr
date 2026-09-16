// ONBOARDING'S SEX FIELD: OPTIONAL, AND THREE OPTIONS THAT EACH MEAN SOMETHING.
//
// Two defects shipped together and this drives both.
//
// (1) THE FIELD WAS REQUIRED. `formReady` included `!!answers.sex`, so Continue stayed disabled
//     until a brand-new user made a physiological disclosure to use a workout tracker. Only goal
//     and daysPerWeek actually gate anything — they are the ONLY fields recommendTemplateId
//     reads — and sex is changeable in Settings afterwards.
//
// (2) ONBOARDING OFFERED TWO OPTIONS AND SETTINGS OFFERED THREE. The Strength Score card's
//     SexToggle has been Male / Female / Other for as long as computeStrengthScore has had its
//     "other" branch (the midpoint of the male and female bodyweight-aware thresholds). So the
//     same question had two answer sets in one app, and the narrower one was the one every new
//     user met. The N-copies-drift class, in a form.
//
// The half that must NOT drift the other way: `bodyType` is binary (there is no third body map),
// so "other" must write strength_sex and NOT body_type. Writing body_type:"other" would store a
// value that column can never mean, and MuscleHeatmap's documented bodyType -> strengthSex ->
// male fallback already covers an unset one.
//
// Red-proofs against the previous commit: Continue is disabled with sex unanswered, and there is
// no "Other" button to click at all.
import { chromium } from "playwright-core";
import { walkOnboarding } from "./ob_walk.mjs";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.setDefaultTimeout(6000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });

let server = { profilePatches: [], seenOnboarding: false };
const resetServer = () => { server.profilePatches = []; server.seenOnboarding = false; };

// seshd_onboarded is REMOVED here, not merely left unset: onComplete writes it, and this file
// runs the wizard three times in one browser. Init scripts run on every navigation, so this is
// what puts each scenario back on the new-user path.
await page.addInitScript(me => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
    programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [],
    profile: { username:"momo", name:"Mo" }, users: [{ id: me, username:"momo", name:"Mo", followers:[], following:[] }] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
  localStorage.setItem("seshd_custom_merge_v1", "1");
  localStorage.removeItem("seshd_onboarded");
}, ME);
await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
  body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
await page.route("**/rest/v1/**", async r => {
  const req = r.request(), u = req.url(), m = req.method();
  const J = b => r.fulfill({ status:200, contentType:"application/json", body: JSON.stringify(b) });
  let body = null; try { body = JSON.parse(req.postData() || "null"); } catch {}
  if (/\/rest\/v1\/programs/.test(u)) {
    if (m === "POST") return J([{ id:"44444444-4444-4444-8444-444444444444", user_id: ME, name:(Array.isArray(body)?body[0]:body)?.name }]);
    return J([]);
  }
  if (/\/rest\/v1\/profiles/.test(u)) {
    if (m === "PATCH") {
      const p = Array.isArray(body) ? body[0] : body;
      server.profilePatches.push(p || {});
      if (p && p.seen_onboarding) server.seenOnboarding = true;
      return J([{ id: ME }]);
    }
    return J([{ id: ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark", seen_onboarding: server.seenOnboarding }]);
  }
  if (/\/rest\/v1\/public_profiles/.test(u)) return J([{ id: ME, username:"momo", name:"Mo", is_public:true }]);
  return J([]);
});

const body = () => page.evaluate(() => document.body.innerText);
const btn = (rx) => page.evaluate(src => {
  const re = new RegExp(src, "i");
  const b = [...document.querySelectorAll("button")].filter(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .find(x => re.test((x.textContent || "").trim()));
  return b ? { text:(b.textContent||"").trim(), disabled: !!b.disabled } : null;
}, rx);
const tap = (rx) => page.evaluate(src => {
  const re = new RegExp(src, "i");
  const b = [...document.querySelectorAll("button")].filter(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .find(x => re.test((x.textContent || "").trim()));
  if (!b || b.disabled) return false; b.click(); return true;
}, rx);
const onboardPatch = () => server.profilePatches.find(p => p && "seen_onboarding" in p) || null;

async function fresh() {
  resetServer();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
}

// ---------------------------------------------------------------- 1. the field itself
await fresh();
check("[control] onboarding renders for a brand-new signup", /Let's set you up/i.test(await body()),
  (await body()).slice(0, 120).replace(/\n/g, " | "));
check("1a the sex field is still on the form", /Biological sex/i.test(await body()));
check("1b it is marked optional", /Biological sex\s*\(optional\)/i.test(await body()),
  (await body()).match(/Biological sex[^\n]*/i)?.[0]);
for (const label of ["Male", "Female", "Other"]) {
  check(`1c "${label}" is offered`, !!(await btn(`^${label}$`)));
}
// Matched on the caption's OWN sentence, not "strength standards" — that phrase is also in the
// form's heading sub-copy, so the obvious regex passed against a build with no caption at all.
check("1d the caption explains what Other means", /Other uses a neutral baseline/i.test(await body()),
  (await body()).slice(0, 400).replace(/\n/g, " | "));

// ---------------------------------------------------------------- 2. skipping it is allowed
// RED on the old code: formReady required sex, so Continue stays disabled here forever.
await tap("^Build muscle$"); await page.waitForTimeout(250);
await tap("^4$");            await page.waitForTimeout(250);
const cont = await btn("^Continue$");
check("2a Continue exists with goal+days answered and sex blank", !!cont);
check("2b ...and it is ENABLED (sex is not a gate)", cont && cont.disabled === false, JSON.stringify(cont));
// Sex really is unanswered at this point — a check that passed because something auto-selected
// one would be reporting on the wrong state.
check("2c ...and nothing auto-selected a sex", await page.evaluate(() =>
  ![...document.querySelectorAll('button[aria-pressed="true"]')].some(b => /^(male|female|other)$/i.test((b.textContent||"").trim()))));

const walkA = await walkOnboarding(page, { sex: /^__no_such_button__$/ }); // matches nothing on purpose
check("[control] the wizard completes with sex left blank", walkA.finished, JSON.stringify(walkA.clicked));
const pA = onboardPatch();
check("2d the onboarding profile write happened", !!pA, JSON.stringify(server.profilePatches));
check("2e ...and carries NO strength_sex", pA && !("strength_sex" in pA), JSON.stringify(pA));
check("2f ...and NO body_type", pA && !("body_type" in pA), JSON.stringify(pA));

// ---------------------------------------------------------------- 3. "Other" is a real answer
// RED on the old code: there is no Other button, so the walk answers nothing and finishes blank.
await fresh();
check("[control] onboarding renders again", /Let's set you up/i.test(await body()));
const walkB = await walkOnboarding(page, { sex: /^Other$/i });
check("[control] the wizard completes picking Other", walkB.finished, JSON.stringify(walkB.clicked));
check("3a Other was actually tapped", walkB.clicked.some(t => /^other$/i.test(t)), JSON.stringify(walkB.clicked));
const pB = onboardPatch();
check("3b strength_sex is written as other", pB && pB.strength_sex === "other", JSON.stringify(pB));
check("3c body_type is NOT written (no third body map)", pB && !("body_type" in pB), JSON.stringify(pB));

// ---------------------------------------------------------------- 4. the binary path is intact
await fresh();
const walkC = await walkOnboarding(page, { sex: /^Female$/i });
check("[control] the wizard completes picking Female", walkC.finished, JSON.stringify(walkC.clicked));
const pC = onboardPatch();
check("4a strength_sex is written as female", pC && pC.strength_sex === "female", JSON.stringify(pC));
check("4b body_type is written as female too", pC && pC.body_type === "female", JSON.stringify(pC));

await browser.close();
console.log(fails ? `FAIL ${fails} check(s)` : "PASS all checks");
process.exit(fails ? 1 : 0);
