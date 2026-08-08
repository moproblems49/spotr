// NO DEBUG READOUT ON THE AUTH SCREENS. A TestFlight-phase diagnostic ("d1 · boot:… · save:…")
// sat pinned to the bottom of the welcome and sign-in screens for months, and removing it before
// submission was a line on a checklist — exactly the kind of thing that gets missed. This asserts
// it stays gone.
//
// The two localStorage keys it read are SEEDED here on purpose: a surviving readout must show up
// loudly rather than render blank and pass. And each screen is checked for having actually
// rendered first, because "text not found" is what an error page returns too.
import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const pg = await b.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2 });
pg.setDefaultTimeout(4000);
await pg.addInitScript(() => {
  // The diagnostic read these two — seed them so a surviving readout would be LOUD, not blank.
  localStorage.setItem("seshd_boot_diag", "boot:PROBE");
  localStorage.setItem("seshd_kc_save", "save:PROBE");
});
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };
for (const [name, go] of [
  ["welcome", async () => {}],
  ["sign-in", async () => { await pg.getByText(/sign in|log in/i).first().click().catch(()=>{}); }],
]) {
  await pg.goto("http://127.0.0.1:8199/", { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  await go();
  await pg.waitForTimeout(700);
  const body = await pg.evaluate(() => document.body.innerText);
  // Fixture reached the screen? A blank page would pass a "text absent" check vacuously.
  check(`${name}: the screen actually rendered`, body.trim().length > 20, JSON.stringify(body.slice(0,60)));
  check(`${name}: no d1 diagnostic line`, !/\bd1\b/.test(body) && !body.includes("PROBE"),
    JSON.stringify((body.match(/.*(d1|PROBE).*/) || [""])[0]));
  await pg.screenshot({ path: `build/shot_authdiag_${name}.png` });
}
await b.close();
console.log(fails ? `${fails} FAIL(S)` : "ALL PASS");
process.exit(fails ? 1 : 0);
