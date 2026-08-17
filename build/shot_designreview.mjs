// A broad screenshot pass for a design/accessibility review: feed, live workout, profile,
// discover — dark + light. Reuses the seeding pattern from shot_pumppic.mjs / pw_workoutexit.mjs.
import { chromium } from "playwright-core";

const ME = "11111111-1111-4111-8111-111111111111";
const PHOTO = "https://stub.supabase.co/storage/v1/object/public/images/x.jpg";
const JPG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAEAAQABAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiiigAooooAKKKKACiiigAooooAKKKKACiiigD//2Q==",
  "base64");

const sess = {
  dayName: "Push A", startedAt: Date.now() - 1800000, unit: "lbs",
  exercises: Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`,
    name: ["Barbell Bench Press", "Incline Dumbbell Press", "Cable Fly (Neutral)",
           "Lateral Raises (DB)", "Tricep Pushdown"][i],
    sets: Array.from({ length: 4 }, (_, j) => ({ id: `s${i}_${j}`, weight: String(135 + j * 10),
      reps: "8", done: j < 2, type: "normal" })) })),
};
const posts = [
  { id: "p1", userId: ME, type: "workout", caption: "Chest day. Felt strong.", imageData: PHOTO,
    createdAt: Date.now() - 36e5, kudos: [], comments: [], unit: "lbs", isPR: true,
    workout: { name: "Push A · Chest/Shoulders", duration: 3720, volume: 14250, exercises: [
      { name: "Barbell Bench Press", isPR: true, sets: [{ w: 225, r: 5 }, { w: 235, r: 5 }, { w: 245, r: 3 }] },
      { name: "Incline Dumbbell Press", isPR: false, sets: [{ w: 80, r: 10 }, { w: 80, r: 9 }] },
    ] } },
  { id: "p2", userId: "22222222-2222-4222-8222-222222222222", type: "text", caption: "Rest day. Recovering.",
    createdAt: Date.now() - 72e5, kudos: [], comments: [], unit: "lbs" },
];
const history = {};
for (let d = 1; d <= 20; d++) {
  const dk = (() => { const x = new Date(Date.now() - d * 864e5);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; })();
  history[dk] = { [`h${d}`]: { id: `h${d}`, dayName: "Push A", unit: "lbs", durationSecs: 3400,
    exercises: sess.exercises.map(e => ({ id: e.id, name: e.name, sets: e.sets.map(s => ({ ...s, done: true })) })) } };
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

async function shot(theme, tab, name, opts = {}) {
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(6000);
  await page.addInitScript(([me, th, live, hist, posts_, sessData]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: th, unit: "lbs",
      programs: [], history: hist, workoutDates: {}, weeklyTarget: 4, prEvents: [], bodyLog: [],
      prs: { "Barbell Bench Press": 245 }, posts: posts_,
      profile: { username: "momo", name: "Mo", bio: "Powerlifting · 3 yrs" },
      users: [{ id: me, username: "momo", name: "Mo", followers: ["a", "b", "c"], following: ["a"] }] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: me } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
    if (live) {
      localStorage.setItem("seshd_active_session", JSON.stringify(sessData));
      localStorage.setItem("seshd_wstart", String(Date.now() - 1800000));
    }
  }, [ME, theme, opts.live || false, history, posts, sess]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "t", user: { id: ME } }) }));
  await page.route("**/storage/v1/**", r => r.fulfill({ status: 200, contentType: "image/jpeg", body: JPG }));
  await page.route("**/rest/v1/**", r => {
    const u = r.request().url();
    const J = b => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (/\/rest\/v1\/(public_)?profiles\?/.test(u))
      return J([{ id: ME, username: "momo", name: "Mo", unit: "lbs", theme, seen_onboarding: true, is_public: true, bio: "Powerlifting · 3 yrs" }]);
    if (/\/rest\/v1\/posts\?/.test(u))
      return J(posts.map(p => ({ id: p.id, user_id: p.userId, type: p.type, caption: p.caption,
        image_url: p.imageData || null, created_at: new Date(p.createdAt).toISOString(), unit: p.unit,
        is_pr: p.isPR || false, kudos: [], comments: [], workout: p.workout || null })));
    return J([]);
  });
  await page.goto("http://127.0.0.1:8199/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2800);
  if (tab) { await page.getByLabel(tab).first().click().catch(() => {}); await page.waitForTimeout(1400); }
  await page.screenshot({ path: `build/${name}.png` });
  console.log(`${name}.png`);
  await page.close();
}

for (const theme of ["dark", "light"]) {
  await shot(theme, "Home", `shot_review_feed_${theme}`);
  await shot(theme, "Workout", `shot_review_tracker_${theme}`, { live: true });
  await shot(theme, "Discover", `shot_review_discover_${theme}`);
  await shot(theme, "Profile", `shot_review_profile_${theme}`);
}
await browser.close();
