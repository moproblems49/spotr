// THE REDEEM RPCs ARE RATE-LIMITED SERVER-SIDE, AND THE REFUSAL HAS TO REACH THE USER.
//
// `redeem_program_by_code` / `redeem_workout_code` are SECURITY DEFINER, callable by anon, and
// bypass RLS by design. Share codes were lengthened to 8 chars, but LENGTH ONLY RAISES THE COST OF
// GUESSING — PostgREST function calls bypass Supabase Auth's throttling entirely, so the limit had
// to live inside the function (10 failed attempts/min, 60/hour, keyed on auth.uid() or client IP,
// counting FAILURES only so a successful redeem never counts against you).
//
// PostgREST reports a raised exception as a plain 400, indistinguishable from a malformed request,
// so the client matches on the message text. This asserts the two branches stay distinguishable:
// a refusal must say "wait a minute" (actionable), and an ordinary wrong code must still say
// "Code not found" — collapsing either into the generic "Couldn't look up code" is the regression.
//
// Structurally RED before the fix: the catch discarded the server message for every error.
import { chromium } from "playwright-core";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l,c,d) => { if (c) console.log(`  PASS ${l}`); else { fails++; console.log(`  FAIL ${l}${d?" — "+d:""}`); } };
const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const CASES = [
  ["rate-limited", 400, {code:"P0001", message:"Too many invalid codes — wait a minute and try again."}, /too many invalid codes/i],
  ["bad code",     200, [],                                                                              /code not found/i],
];
for (const [label, status, body, want] of CASES) {
  const page = await b.newPage({ viewport:{width:428,height:926}, deviceScaleFactor:2, hasTouch:true, isMobile:true });
  page.setDefaultTimeout(6000);
  page.on("pageerror", e => { fails++; console.log("  PAGEERROR:", e.message.slice(0,140)); });
  await page.addInitScript(me => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId:me, theme:"dark", unit:"lbs", programs:[], profile:{username:"momo",name:"Mo"} }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{id:me} }));
    localStorage.setItem("seshd_onboarded","1"); localStorage.setItem("seshd_custom_merge_v1","1");
  }, ME);
  await page.route("**/auth/v1/**", r => r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({access_token:"t",user:{id:ME}})}));
  // CATCH-ALL FIRST. Playwright gives precedence to the MOST RECENTLY registered matching route,
  // so registering the broad one last swallows the specific stub — the first draft of this probe
  // did exactly that and every call came back 200, which made the bad-code case pass vacuously
  // (the catch-all's [] happens to BE the bad-code reply) and the rate-limit case fail for a
  // reason that had nothing to do with the app.
  await page.route("**/rest/v1/**", r => r.fulfill({status:200,contentType:"application/json",body:"[]"}));
  await page.route("**/rest/v1/rpc/redeem_program_by_code", r => r.fulfill({status, contentType:"application/json", body:JSON.stringify(body)}));
  await page.goto("http://127.0.0.1:8199/", { waitUntil:"domcontentloaded" });
  await page.waitForTimeout(3000);
  const tapped = await page.evaluate(() => { const t=[...document.querySelectorAll("button")].filter(x=>x.offsetParent).find(x=>/Browse templates/i.test(x.textContent||"")); if(!t) return false; t.click(); return true; });
  await page.waitForTimeout(1400);
  const opened = await page.evaluate(() => { const t=[...document.querySelectorAll("button")].filter(x=>x.offsetParent).find(x=>/Have a code\?/i.test(x.textContent||"")); if(!t) return false; t.click(); return true; });
  await page.waitForTimeout(700);
  const typed = await page.evaluate(() => {
    const i=[...document.querySelectorAll("input")].filter(x=>x.offsetParent).find(x=>/IGNITE/i.test(x.placeholder||""));
    if(!i) return false;
    const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;
    set.call(i,"IGNITE-ABCD1234"); i.dispatchEvent(new Event("input",{bubbles:true})); i.focus(); return true; });
  check(`[${label}] reached the code field (templates=${tapped} row=${opened})`, typed);
  if (!typed) { await page.close(); continue; }
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1300);
  const txt = await page.evaluate(() => document.body.innerText);

  check(`[${label}] shows the right message`, want.test(txt), JSON.stringify((txt.match(/[^\n]*(?:code|Couldn)[^\n]*/i)||[])[0]||"").slice(0,90));
  await page.close();
}
await b.close();
console.log(fails ? `${fails} FAIL(S)` : "ok");
process.exit(fails ? 1 : 0);
