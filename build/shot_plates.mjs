// Screenshot the plate stack in both themes and both units, so the colour change can be LOOKED at.
// Measurement (sim_platecolors) proves the hex values; only a render proves the yellow disc is
// actually visible on the light theme, which is the thing that went wrong on the first attempt.
// Not a suite — it asserts nothing beyond "the stack rendered". Lives here rather than in the
// battery on purpose (a script that cannot fail does not belong in the battery); the assertions
// are in sim_platecolors.
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const PORT = process.env.PORT || "8199";
const OUT = "/tmp/claude-0/-home-user-spotr/3440bec9-ce0f-5edd-b04a-6a0acfe4e512/scratchpad/plateshots";
mkdirSync(OUT, { recursive: true });
const ME = "11111111-1111-4111-8111-111111111111";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

for (const theme of ["dark", "light"]) {
  for (const unit of ["lbs", "kg"]) {
    const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    page.setDefaultTimeout(4000);
    page.on("pageerror", e => console.log("  PAGEERROR:", e.message.slice(0, 120)));
    // A live session on a barbell lift. The weights are chosen so the YELLOW plate appears, since
    // that is the one that failed contrast on the light theme and the whole reason for the rim.
    // The breakdown is greedy heaviest-first, so a weight has to be picked to land in the right
    // remainder bucket — 3×45 a side (315 lbs) draws nothing but blue and proves nothing.
    //   220 lbs → 45 + 35 + 5 + 2.5 a side over a 45 bar  (blue, YELLOW, purple, pink)
    //   105 kg  → 25 + 15 + 2.5 a side over a 20 bar      (red, YELLOW, purple)
    const weight = unit === "kg" ? "105" : "220";
    await page.addInitScript(([me, theme, unit, weight]) => {
      localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme, unit,
        programs: [], history: {}, workoutDates: {}, weeklyTarget: 3, bodyLog: [], prs: {},
        prEvents: [], posts: [], profile: { username: "momo", name: "Mo" },
        users: [{ id: me, username: "momo", name: "Mo", followers: [], following: [] }] }));
      localStorage.setItem("seshd_session", JSON.stringify({ access_token: "t", user: { id: me } }));
      localStorage.setItem("seshd_onboarded", "1");
      localStorage.setItem("seshd_custom_merge_v1", "1");
      localStorage.setItem("seshd_wstart", String(Date.now() - 600000));
      localStorage.setItem("seshd_active_session", JSON.stringify({
        id: "sess-plates", startedAt: Date.now() - 600000, name: "Plate check", unit,
        exercises: [{ name: "Barbell Bench Press", sets: [
          { weight, reps: "5", done: true, type: "working" },
          { weight, reps: "5", done: false, type: "working" },
        ] }],
      }));
    }, [ME, theme, unit, weight]);
    await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ access_token: "t", user: { id: ME } }) }));
    await page.route("**/rest/v1/**", r => r.abort());
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    // Confirm the fixture actually reached the screen before believing the shot (CLAUDE.md rule).
    const seen = await page.evaluate(() => {
      const t = document.body.innerText;
      return { perSide: /PER SIDE/i.test(t), bench: /Bench Press/i.test(t) };
    });
    console.log(`${theme}/${unit}: benchOnScreen=${seen.bench} plateStack=${seen.perSide}`);
    if (!seen.perSide) console.log(`  !! the plate stack did not render — the shot is worthless`);

    // Crop tight to the plate row so the discs are big enough to judge.
    const box = await page.evaluate(() => {
      const el = [...document.querySelectorAll("span")].find(s => /PER SIDE|LOADED/i.test(s.textContent || ""));
      const row = el && el.parentElement && el.parentElement.parentElement;
      if (!row) return null;
      const r = row.getBoundingClientRect();
      return { x: Math.max(0, r.x - 4), y: Math.max(0, r.y - 4), width: Math.min(428, r.width + 8), height: r.height + 8 };
    });
    await page.screenshot({ path: `${OUT}/plates-${theme}-${unit}.png`, clip: box || undefined });
    console.log(`  -> plates-${theme}-${unit}.png${box ? "" : " (full page — no crop box found)"}`);
    await page.close();
  }
}
await browser.close();
console.log("\nshots in " + OUT);
