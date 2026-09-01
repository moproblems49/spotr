// A MISSING PROFILE ROW MUST NOT RESET A SETTING TO ITS DEFAULT.
//
// `loadUserData` reads the user's own `profiles` row and rebuilds the settings block from it.
// Four fields were `me?.x || <constant>` — so when that row came back absent (an empty response,
// a failed fetch, an RLS refusal) the constant won and the user's own choice was discarded:
// the whole app flipped back to the light theme, kg users were switched to lbs, and four
// notification toggles the user had turned OFF came back on.
//
// This is NOT the `_lastSettingsEditAt` race that pw_switch [race] covers. That one guards a 20s
// window right after an edit; this fires whenever the row is missing, however old the edit is.
import { chromium } from "playwright-core";

const ME = "11111111-1111-4111-8111-111111111111";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

// `profileRow: null` is the bug's trigger — the profiles GET answers with NO row.
async function boot(profileRow) {
  const page = await b.newPage({ viewport: { width: 428, height: 926 }, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(5000);
  await page.addInitScript((me) => {
    // The user's own choices, already saved on the device and NOT the defaults for any of them.
    localStorage.setItem("seshd_v1", JSON.stringify({
      currentUserId: me, theme: "midnight", unit: "kg", defaultRestTime: 210,
      notificationPrefs: { messages: false, kudos: true, comments: true, follows: true },
      programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: [],
      posts: [], profile: { username: "momo", name: "Mo" },
      users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
    }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "m@e.com" } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
    // Push _lastSettingsEditAt's 20s window firmly into the past: this check must prove the
    // MISSING-ROW guard, not accidentally pass because a recent-edit guard was still open.
  }, ME);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "m@e.com" } }) }));
  await page.route("**/rest/v1/**", r => {
    const u = r.request().url();
    if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u) && r.request().method() === "GET")
      return r.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify(profileRow ? [profileRow] : []) });
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8199}/`, { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(2800);
  const state = await page.evaluate(() => {
    let store = {};
    try { store = JSON.parse(localStorage.getItem("seshd_v1") || "{}"); } catch (e) {}
    const shell = document.querySelector("#root > div");
    return { theme: store.theme, unit: store.unit, rest: store.defaultRestTime,
             msgPref: store.notificationPrefs ? store.notificationPrefs.messages : undefined,
             bg: shell ? getComputedStyle(shell).backgroundColor : null };
  });
  await page.close();
  return state;
}

// ── Control: the row EXISTS and agrees with the device. Establishes what "unchanged" looks like,
//    so the real check below compares against a measured value rather than a hardcoded colour.
const ok = await boot({ id: ME, username: "momo", name: "Mo", unit: "kg", theme: "midnight",
  default_rest_time: 210, is_public: true, seen_onboarding: true,
  notification_prefs: { messages: false, kudos: true, comments: true, follows: true } });
check("0. control: the app loads with the user's own settings", ok.theme === "midnight" && ok.unit === "kg", JSON.stringify(ok));

// ── The bug: the profiles GET answers with NO row at all.
const gone = await boot(null);
check("1. a missing profile row does not reset the theme", gone.theme === "midnight", `theme=${gone.theme}`);
check("2. a missing profile row does not reset the unit", gone.unit === "kg", `unit=${gone.unit}`);
check("3. a missing profile row does not reset the rest timer", gone.rest === 210, `rest=${gone.rest}`);
check("4. a missing profile row does not switch notifications back on", gone.msgPref === false, `messages=${gone.msgPref}`);
// The rendered shell must match the control too — a store value that never reaches the paint
// would be a pass on paper and a light-themed app on screen.
check("5. the app is still PAINTED in the chosen theme", gone.bg && gone.bg === ok.bg, `${gone.bg} vs control ${ok.bg}`);

// ── 6. PROGRESS PHOTOS. Same class, different key: every write PATCHes `body_log` with
//    `photoData: null` (photos are large and live on-device by design), so the server copy is
//    ALWAYS photo-less. Taking it wholesale deleted the photo on the next foreground, and the
//    store-save effect then wrote the photo-less array back over the local one — gone permanently,
//    not just until reload. The local copy is authoritative for the photo.
{
  const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const page = await b.newPage({ viewport: { width: 428, height: 926 }, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(5000);
  await page.addInitScript(([me, photo]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({
      currentUserId: me, theme: "dark", unit: "lbs",
      bodyLog: [{ id: "b1", date: "2026-08-01", weight: 180, measurements: {}, photoData: photo }],
      programs: [], history: {}, workoutDates: {}, prEvents: [], prs: [], posts: [],
      profile: { username: "momo", name: "Mo" },
      users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }],
    }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: me, email: "m@e.com" } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
  }, [ME, PHOTO]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "tok", refresh_token: "ref", user: { id: ME, email: "m@e.com" } }) }));
  await page.route("**/rest/v1/**", r => {
    const u = r.request().url();
    if (/\/rest\/v1\/(profiles|public_profiles)\?/.test(u) && r.request().method() === "GET")
      // Exactly what the server really holds: the same entry, with the photo stripped.
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{
        id: ME, username: "momo", name: "Mo", unit: "lbs", is_public: true, seen_onboarding: true, theme: "dark",
        body_log: [{ id: "b1", date: "2026-08-01", weight: 180, measurements: {}, photoData: null }] }]) });
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto(`http://127.0.0.1:${process.env.PORT || 8199}/`, { waitUntil: "load", timeout: 20000 });
  await page.waitForTimeout(2800);
  const got = await page.evaluate(() => {
    let st = {}; try { st = JSON.parse(localStorage.getItem("seshd_v1") || "{}"); } catch (e) {}
    const e = (st.bodyLog || [])[0] || {};
    return { entries: (st.bodyLog || []).length, weight: e.weight, hasPhoto: !!e.photoData };
  });
  check("6. the server's weight still wins", got.entries === 1 && got.weight === 180, JSON.stringify(got));
  check("7. but the local progress photo SURVIVES the refresh", got.hasPhoto, JSON.stringify(got));
  await page.close();
}

await b.close();
console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
