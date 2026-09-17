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

const BASE_PROFILE = { id: ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark", seen_onboarding: false };
let server = { profilePatches: [], seenOnboarding: false, profile: { ...BASE_PROFILE } };
const resetServer = () => { server.profilePatches = []; server.seenOnboarding = false; server.profile = { ...BASE_PROFILE }; };

// seshd_onboarded is REMOVED here, not merely left unset: onComplete writes it, and this file
// runs the wizard three times in one browser. Init scripts run on every navigation, so this is
// what puts each scenario back on the new-user path.
// The theme comes off the URL (?t=light) rather than being hardcoded: init scripts run on EVERY
// navigation and cannot be removed, so a hardcoded one silently re-seeds dark over anything a
// later step sets — which is how section 8's "light" pass first ran entirely in the dark theme.
await page.addInitScript(me => {
  const _t = new URLSearchParams(location.search).get("t") || "dark";
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:_t, unit:"lbs",
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
      // ★ THE GET MUST REFLECT THE PATCH. A stub whose read ignores its own writes is not a
      // server — and here it actively lies: loadUserData resolves strengthSex as
      // `me?.strength_sex || (sameUser ? prev.strengthSex : null) || "male"`, so a GET that omits
      // the column falls through to the hard "male" default and the suite reports local/server
      // drift that only its own fixture created. Same class as pw_journey's stub modelling the
      // real column types: a stub that accepts anything cannot tell you anything.
      Object.assign(server.profile, p || {});
      return J([{ ...server.profile }]);
    }
    return J([{ ...server.profile }]);
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
// ★ BOTH READS POLL FOR QUIESCENCE INSTEAD OF SAMPLING ONCE, AND BOTH HAD TO.
// onComplete AWAITS handleSaveProgram (plus a 1200ms retry on failure) BEFORE it issues the
// profiles PATCH, and `saveStore` persists on a later tick again — so the instant walkOnboarding
// returns, the server write can still be in flight and localStorage still holds the PRE-onboarding
// snapshot. Measured: at t+0 the persisted store read strengthSex "male" (loadUserData's hard
// default) and only at t+500ms did it settle to the real answer. A single sample there reported
// local/server drift that did not exist — the same "a fixed settle is a guess about something you
// do not own" class as pw_kbinset's one-pixel flake, on storage rather than layout.
const onboardPatch = async () => {
  for (let i = 0; i < 24; i++) {
    const p = server.profilePatches.find(x => x && "seen_onboarding" in x);
    if (p) return p;
    await page.waitForTimeout(250);
  }
  return null;
};
// Waits for the persisted store to STOP CHANGING rather than for the value under test to appear —
// waiting for the expected answer would make the check unable to fail.
const settledStore = async () => {
  let last = null;
  for (let i = 0; i < 24; i++) {
    const cur = await page.evaluate(() => { try { return localStorage.getItem("seshd_v1") || ""; } catch { return ""; } });
    if (cur && cur === last) break;
    last = cur;
    await page.waitForTimeout(250);
  }
  try { return JSON.parse(last || "{}"); } catch { return {}; }
};

async function fresh() {
  resetServer();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
}

// ---------------------------------------------------------------- 1. the field itself
await fresh();
check("[control] onboarding renders for a brand-new signup", /Let's set you up/i.test(await body()),
  (await body()).slice(0, 120).replace(/\n/g, " | "));
// ★ ANCHORED AT BOTH ENDS. "Sex" is a substring of "Biological sex", so an unanchored /Sex/i would
// pass against the very build this rename replaced — the documented accidentally-right-regex class.
// ^ and the optional marker together can only match the new label on its own line.
check("1a the sex field is still on the form", /^Sex\b/im.test(await body()),
  (await body()).match(/^[^\n]*\bsex\b[^\n]*/im)?.[0]);
check("1b it is marked optional", /^Sex\s*\(optional\)/im.test(await body()),
  (await body()).match(/^[^\n]*\bsex\b[^\n]*/im)?.[0]);
check("1b2 the old label is gone", !/Biological sex/i.test(await body()));
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
const pA = await onboardPatch();
check("2d the onboarding profile write happened", !!pA, JSON.stringify(server.profilePatches));
check("2e ...and carries NO strength_sex", pA && !("strength_sex" in pA), JSON.stringify(pA));
check("2f ...and NO body_type", pA && !("body_type" in pA), JSON.stringify(pA));

// ---------------------------------------------------------------- 3. "Other", body map skipped
// RED on the pre-Other code: there is no Other button, so the walk answers nothing and finishes
// blank. The Body map row is a SUB-QUESTION of Other, so it can only exist once Other is picked.
await fresh();
check("[control] onboarding renders again", /Let's set you up/i.test(await body()));
check("3a0 the Body map row is ABSENT before any sex is picked", !/^Body map$/im.test(await body()),
  (await body()).slice(0, 400).replace(/\n/g, " | "));
await tap("^Build muscle$"); await page.waitForTimeout(250);
await tap("^4$");            await page.waitForTimeout(250);
await tap("^Other$");        await page.waitForTimeout(350);
check("3a1 picking Other REVEALS the Body map row", /^Body map$/im.test(await body()),
  (await body()).slice(0, 500).replace(/\n/g, " | "));
check("3a2 ...with both silhouettes, labelled so a screen reader can tell them from the sex row",
  await page.evaluate(() => ["Male body map", "Female body map"].every(l =>
    [...document.querySelectorAll("button")].some(b => b.getAttribute("aria-label") === l))));
check("3a3 ...and nothing auto-picked one", await page.evaluate(() =>
  ![...document.querySelectorAll('button[aria-pressed="true"]')]
    .some(b => /body map$/i.test(b.getAttribute("aria-label") || ""))));
// ★ A SECOND TAP ON A CHOSEN SEX CLEARS IT — the field is optional, and toggling off is the only
// way to un-answer once you have answered. Deliberate, and worth pinning: the first draft of this
// section tapped Other by hand and then let the walker tap it again, which DESELECTED it and made
// the app look like it had dropped the answer. Un-answering also has to take the sub-question with
// it, or a stale silhouette outlives the sex that revealed it.
await tap("^Other$"); await page.waitForTimeout(300);
check("3a4 a second tap clears the answer", await page.evaluate(() =>
  ![...document.querySelectorAll('button[aria-pressed="true"]')].some(b => /^other$/i.test((b.textContent||"").trim()))));
check("3a5 ...and takes the Body map row with it", !/^Body map$/im.test(await body()));
const walkB = await walkOnboarding(page, { sex: /^Other$/i });
check("[control] the wizard completes with Other and no silhouette picked", walkB.finished, JSON.stringify(walkB.clicked));
const pB = await onboardPatch();
check("3b strength_sex is written as other", pB && pB.strength_sex === "other", JSON.stringify(pB));
// Unanswered sub-question -> the documented bodyType -> strengthSex -> male fallback, i.e. exactly
// the pre-existing behaviour. What must never happen is body_type:"other", which the column cannot
// mean and which loadUserData would then re-serve from `prev` forever on that device.
check("3c body_type is NOT written when the silhouette is left blank", pB && !("body_type" in pB), JSON.stringify(pB));

// ---------------------------------------------------------------- 4. "Other" + a silhouette
// This is the whole point of the row: the standards go neutral AND the user picks the figure.
// RED before the row existed: there is no "Female body map" control, so body_type stays absent.
await fresh();
const walkD = await walkOnboarding(page, { sex: /^Other$/i, bodyMap: /^Female body map$/i });
check("[control] the wizard completes with Other + a silhouette", walkD.finished, JSON.stringify(walkD.clicked));
check("4a the silhouette was actually tapped", walkD.clicked.some(t => /female body map/i.test(t)), JSON.stringify(walkD.clicked));
const pD = await onboardPatch();
check("4b strength_sex is still other (the silhouette must not change the standards)",
  pD && pD.strength_sex === "other", JSON.stringify(pD));
check("4c body_type is written as the picked silhouette", pD && pD.body_type === "female", JSON.stringify(pD));
// ★ THE LOCAL HALF, WHICH IS THE HALF THAT ACTUALLY DRIFTED. The bug this file was written for was
// two spellings of one value in one handler — the server PATCH used the raw answers.sex while the
// setStore used a sanitised copy. A suite that only reads server.profilePatches cannot see a
// reintroduction of that drift in the setStore direction: every check would stay green while the
// PHONE stored bodyType:"other", which loadUserData re-serves from `prev` forever. Read both.
const localD = await settledStore();
check("4d the LOCAL store agrees with the server on strengthSex", localD.strengthSex === "other", JSON.stringify({ local: localD.strengthSex, server: pD && pD.strength_sex }));
check("4e ...and on bodyType", localD.bodyType === "female", JSON.stringify({ local: localD.bodyType, server: pD && pD.body_type }));

// ---------------------------------------------------------------- 5. the binary path is intact
await fresh();
const walkC = await walkOnboarding(page, { sex: /^Female$/i });
check("[control] the wizard completes picking Female", walkC.finished, JSON.stringify(walkC.clicked));
const pC = await onboardPatch();
check("5a strength_sex is written as female", pC && pC.strength_sex === "female", JSON.stringify(pC));
check("5b body_type is written as female too", pC && pC.body_type === "female", JSON.stringify(pC));
const localC = await settledStore();
check("5c the LOCAL store agrees on both", localC.strengthSex === "female" && localC.bodyType === "female", JSON.stringify(localC.strengthSex + "/" + localC.bodyType));

// ---------------------------------------------------------------- 6. a binary answer asks nothing extra
await fresh();
await tap("^Build muscle$"); await page.waitForTimeout(250);
await tap("^4$");            await page.waitForTimeout(250);
await tap("^Other$");        await page.waitForTimeout(350);
check("[control] Body map is showing under Other", /^Body map$/im.test(await body()));
await tap("^Male$");         await page.waitForTimeout(350);
check("6a switching Other -> a binary sex HIDES the Body map row", !/^Body map$/im.test(await body()),
  (await body()).slice(0, 500).replace(/\n/g, " | "));

// ---------------------------------------------------------------- 7. Continue is still GATED
// ★ THE NEGATIVE CONTROL. Every check above asserts Continue is ENABLED, so deleting `formReady`
// outright would leave this suite — and pw_journey / pw_starterprog / pw_templates — entirely
// green, because the walker answers the form fields before it ever looks for Continue. A user
// could then Continue with nothing answered and recommendTemplateId({}) would hand them the
// 3-day default with nothing on screen saying it was a guess. Assert the gate in both directions.
await fresh();
check("7a Continue is DISABLED with nothing answered", (await btn("^Continue$"))?.disabled === true,
  JSON.stringify(await btn("^Continue$")));
await tap("^Build muscle$"); await page.waitForTimeout(250);
check("7b ...still disabled with only a goal", (await btn("^Continue$"))?.disabled === true,
  JSON.stringify(await btn("^Continue$")));
await tap("^4$");            await page.waitForTimeout(250);
check("7c ...and enabled once goal AND days are in", (await btn("^Continue$"))?.disabled === false,
  JSON.stringify(await btn("^Continue$")));

// ---------------------------------------------------------------- 8. the row shows the FIGURES
// ★ THE TILES DRAW THE REAL SILHOUETTES, NOT THE WORDS "Male" / "Female". The question is literally
// "which of these two drawings goes on your muscle map", so the drawings are the answer to it, and
// a regression to a text-only pair would keep every check above green — 3a2 matches aria-labels,
// which the words-only version also had. This section is the only thing that can see it.
//
// It also pins the two properties that make the figures shippable at all:
//   * the bodyMapData chunk (~109 kB gzipped) is fetched ONLY once somebody taps Other. A hook
//     cannot be conditional, which is why the picker is its own component — calling
//     useBodyMapData() in Onboarding itself would make EVERY new signup download the body map to
//     render a wizard that never shows it.
//   * the muscle fill clears contrast on BOTH themes. It must be C.green (theme-resolved), never
//     a literal: #34d399 is 8.8:1 on the dark card and 1.79:1 on the light one, the documented
//     "re-measure every hardcoded colour when the surface changes" trap. Measuring only the dark
//     theme — which every other check in this file runs on — cannot see that, so this loops.
const bmRequests = [];
page.on("request", r => { if (/bodyMapData/.test(r.url())) bmRequests.push(r.url().split("/").pop()); });

const contrast = (fg, bg) => page.evaluate(([f, b]) => {
  const px = c => { const d = document.createElement("div"); d.style.color = c; document.body.appendChild(d);
    const v = getComputedStyle(d).color.match(/[\d.]+/g).slice(0, 3).map(Number); d.remove(); return v; };
  const L = ([r, g, bl]) => { const t = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * t(r) + 0.7152 * t(g) + 0.0722 * t(bl); };
  const a = L(px(f)), c = L(px(b));
  return (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05);
}, [fg, bg]);

for (const theme of ["dark", "light"]) {
  server.profile = { ...BASE_PROFILE, theme };     // loadUserData replaces theme from the server row
  bmRequests.length = 0;
  await page.goto(`http://127.0.0.1:${PORT}/?t=${theme}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  // ★ THE THEME MUST ACTUALLY HAVE FLIPPED, OR THE LIGHT PASS IS THE DARK PASS RUN TWICE — which
  // is exactly the hardcoded-colour bug this loop exists to catch, made invisible. Assert the
  // painted background, not the value we asked for.
  const painted = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const isDarkPaint = painted.match(/\d+/g).slice(0,3).map(Number).reduce((a,b)=>a+b,0) < 200;
  check(`[control] ${theme}: onboarding renders IN THIS THEME`,
    /Let's set you up/i.test(await body()) && isDarkPaint === (theme === "dark"), `${theme} painted ${painted}`);
  await tap("^Build muscle$"); await page.waitForTimeout(250);
  await tap("^4$");            await page.waitForTimeout(250);
  check(`8a ${theme}: the body map chunk is NOT fetched before Other is tapped`, bmRequests.length === 0,
    JSON.stringify(bmRequests));
  await tap("^Other$");
  for (let i = 0; i < 20 && !bmRequests.length; i++) await page.waitForTimeout(250);
  check(`8b ${theme}: tapping Other fetches it`, bmRequests.length > 0, JSON.stringify(bmRequests));

  // The chunk arrives asynchronously and the tiles render their labels alone until it does, so
  // poll rather than guessing a settle — the documented "a fixed setTimeout is a guess about
  // something you do not own" class.
  let tiles = [];
  for (let i = 0; i < 24; i++) {
    tiles = await page.evaluate(() => [...document.querySelectorAll("[data-body-map-option]")].map(b => {
      const svg = b.querySelector("svg"), paths = svg ? [...svg.querySelectorAll("path")] : [];
      return { v: b.dataset.bodyMapOption, paths: paths.length,
        d: paths.map(p => (p.getAttribute("d") || "").length).join(","),
        fill: paths.length ? paths[paths.length - 1].getAttribute("fill") : null,
        h: svg ? Math.round(svg.getBoundingClientRect().height) : 0,
        bg: getComputedStyle(b).backgroundColor };
    }));
    if (tiles.length === 2 && tiles.every(t => t.paths > 1)) break;
    await page.waitForTimeout(250);
  }
  check(`8c ${theme}: both tiles draw a real figure, not the words alone`,
    tiles.length === 2 && tiles.every(t => t.paths > 1), JSON.stringify(tiles.map(t => ({ v: t.v, paths: t.paths }))));
  // Two tiles both rendering the male glyph would satisfy "a figure renders" and tell the user
  // nothing — the same class as pw_themes asserting six DISTINCT ghosts rather than six indices.
  check(`8d ${theme}: the two figures are different drawings`,
    tiles.length === 2 && tiles[0].d && tiles[0].d !== tiles[1].d,
    JSON.stringify(tiles.map(t => t.d.slice(0, 40))));
  check(`8e ${theme}: the figure is big enough to read`, tiles.every(t => t.h >= 80), JSON.stringify(tiles.map(t => t.h)));
  const r = (tiles[0] && tiles[0].fill) ? await contrast(tiles[0].fill, tiles[0].bg) : 0;
  check(`8f ${theme}: the muscle fill clears AA on this theme's card`, !!(tiles[0] && tiles[0].fill) && r >= 4.5,
    `${tiles[0] && tiles[0].fill} on ${tiles[0] && tiles[0].bg} = ${r.toFixed(2)}:1`);
}

await browser.close();
console.log(fails ? `FAIL ${fails} check(s)` : "PASS all checks");
process.exit(fails ? 1 : 0);
