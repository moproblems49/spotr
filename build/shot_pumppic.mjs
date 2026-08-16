// One screenshot of the finished thing: a feed post carrying a pump pic above its workout card.
import { chromium } from "playwright-core";
const ME = "11111111-1111-4111-8111-111111111111";
const PHOTO = "https://stub.supabase.co/storage/v1/object/public/images/x.jpg";
// A gym-ish placeholder so the shot reads as a photo rather than a grey box.
const JPG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAEAAQABAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiiigAooooAKKKKACiiigAooooAKKKKACiiigD//2Q==",
  "base64");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
for (const theme of ["dark", "light"]) {
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(6000);
  await page.addInitScript(([me, photo, th]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme: th, unit:"lbs",
      programs: [], history: {}, workoutDates: {}, weeklyTarget: 3, prEvents: [], bodyLog: [], prs: {},
      profile: { username:"momo", name:"Mo" },
      users: [{ id: me, username:"momo", name:"Mo", followers: [], following: [] }],
      posts: [{ id:"p1", userId: me, type:"workout", caption:"Chest day. Felt strong.",
        imageData: photo, createdAt: Date.now() - 36e5, kudos: [], comments: [], unit:"lbs", isPR: true,
        workout: { name:"Push A · Chest/Shoulders", duration: 3720, volume: 14250, exercises: [
          { name:"Barbell Bench Press", isPR:true, sets:[{w:225,r:5},{w:235,r:5},{w:245,r:3}] },
          { name:"Incline Dumbbell Press", isPR:false, sets:[{w:80,r:10},{w:80,r:9}] },
          { name:"Lateral Raises (DB)", isPR:false, sets:[{w:25,r:15},{w:25,r:14}] },
        ] } }] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
    localStorage.setItem("seshd_onboarded", "1");
    localStorage.setItem("seshd_custom_merge_v1", "1");
  }, [ME, PHOTO, theme]);
  await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
    body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
  await page.route("**/storage/v1/**", r => r.fulfill({ status:200, contentType:"image/jpeg", body: JPG }));
  // loadFeed REPLACES store.posts with the server's rows, so aborting REST leaves an empty feed
  // and the shot is of the empty state. Serve the post from the "server" instead.
  await page.route("**/rest/v1/**", r => {
    const u = r.request().url();
    const J = b => r.fulfill({ status:200, contentType:"application/json", body: JSON.stringify(b) });
    if (/\/rest\/v1\/(public_)?profiles\?/.test(u))
      return J([{ id: ME, username:"momo", name:"Mo", unit:"lbs", theme, seen_onboarding:true, is_public:true }]);
    if (/\/rest\/v1\/posts\?/.test(u))
      return J([{ id:"p1", user_id: ME, type:"workout", caption:"Chest day. Felt strong.",
        image_url: PHOTO, created_at: new Date(Date.now() - 36e5).toISOString(), unit:"lbs", is_pr:true,
        kudos: [], comments: [],
        workout: { name:"Push A · Chest/Shoulders", duration: 3720, volume: 14250, exercises: [
          { name:"Barbell Bench Press", isPR:true, sets:[{w:225,r:5},{w:235,r:5},{w:245,r:3}] },
          { name:"Incline Dumbbell Press", isPR:false, sets:[{w:80,r:10},{w:80,r:9}] },
          { name:"Lateral Raises (DB)", isPR:false, sets:[{w:25,r:15},{w:25,r:14}] } ] } }]);
    return J([]);
  });
  await page.goto("http://127.0.0.1:8199/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.getByLabel("Home").first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `build/shot_pumppic_${theme}.png` });
  console.log(`shot_pumppic_${theme}.png`);
  await page.close();
}
await browser.close();
