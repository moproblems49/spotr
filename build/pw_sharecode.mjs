// MINTING A SHARE CODE MUST NOT SPEND THE OWNER'S OWN RATE-LIMIT BUDGET.
//
// The redeem RPCs are rate-limited server-side and count FAILED lookups. The old collision check
// looked the freshly-minted code up first — a lookup that by definition MISSES — so every share
// recorded a failed attempt against the SHARER's bucket: minting ten codes in a minute locked the
// owner out of redeeming anything, and filled the abuse ledger with legitimate owner activity.
// Both columns are already UNIQUE in the DB, so the constraint was always the real guard and the
// pre-check could never do better. Found by a cold-context audit of the rate-limiting work.
//
// Asserts the mint (a) still produces a code and writes it, and (b) issues ZERO redeem RPC calls.
import { chromium } from "playwright-core";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l,c,d) => { if (c) console.log(`  PASS ${l}`); else { fails++; console.log(`  FAIL ${l}${d?" — "+d:""}`); } };
const PROG = { id:"11111111-2222-4333-8444-555555555555", name:"PPL · 6 Day", days:[
  { id:"d1", name:"Push A", exercises:[{ name:"Barbell Bench Press", reps:"4×5-8" }] }] };

const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const page = await b.newPage({ viewport:{width:428,height:926}, deviceScaleFactor:2, hasTouch:true, isMobile:true });
page.setDefaultTimeout(6000);
page.on("pageerror", e => { fails++; console.log("  PAGEERROR:", e.message.slice(0,140)); });

const redeemCalls = [], patches = [];
await page.addInitScript(([me,prog]) => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId:me, theme:"dark", unit:"lbs",
    programs:[prog], activeProgramId:prog.id, profile:{username:"momo",name:"Mo"} }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{id:me} }));
  localStorage.setItem("seshd_onboarded","1"); localStorage.setItem("seshd_custom_merge_v1","1");
}, [ME, PROG]);
await page.route("**/auth/v1/**", r => r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({access_token:"t",user:{id:ME}})}));
await page.route("**/rest/v1/**", r => {
  const q = r.request(), u = q.url();
  if (/rpc\/redeem_/.test(u)) redeemCalls.push(u);
  if (q.method() === "PATCH" && /programs\?/.test(u)) patches.push(q.postData() || "");
  // SEED THROUGH THE STUB. loadUserData REPLACES `programs` wholesale from the server, so a
  // localStorage-only fixture renders "Start your first program" and the share control never
  // exists — the first draft of this probe failed that way and its zero-redeem-calls check
  // passed vacuously because nothing had happened at all.
  let body = "[]";
  if (q.method() === "GET" && /\/rest\/v1\/profiles\?/.test(u))
    body = JSON.stringify([{ id:ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark",
      seen_onboarding:true, weekly_target:3, pr_events:[], active_program_id:PROG.id }]);
  else if (q.method() === "GET" && /\/rest\/v1\/programs\?/.test(u))
    body = JSON.stringify([{ id:PROG.id, user_id:ME, name:PROG.name, days:PROG.days,
      is_active:true, created_at:new Date().toISOString() }]);
  r.fulfill({ status:200, contentType:"application/json", body });
});
await page.goto("http://127.0.0.1:8199/", { waitUntil:"domcontentloaded" });
await page.waitForTimeout(3200);

// Open the program, then its share control.
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].filter(x=>x.offsetParent)
  .find(x=>/PPL · 6 Day/.test(x.textContent||"") && !/^(Edit|Start)/.test((x.textContent||"").trim())); b&&b.click(); });
await page.waitForTimeout(1300);
const shared = await page.evaluate(() => { const b=[...document.querySelectorAll("button")].filter(x=>x.offsetParent)
  .find(x=>(x.getAttribute("aria-label")||"")==="Share program"); if(!b) return false; b.click(); return true; });
await page.waitForTimeout(1600);
check("reached the share control", shared);
const txt = await page.evaluate(() => document.body.innerText);
check("a share code was minted and shown", /IGNITE-[A-Z0-9]{8}/.test(txt), (txt.match(/IGNITE-[A-Z0-9]*/)||["none"])[0]);
check("the code was written to the server", patches.some(p => /share_code/.test(p)), JSON.stringify(patches).slice(0,90));
check("minting spends ZERO redeem-RPC calls (no self-inflicted rate-limit hit)",
  redeemCalls.length === 0, `${redeemCalls.length} redeem call(s) made`);
await b.close();
console.log(fails ? `${fails} FAIL(S)` : "ok");
process.exit(fails ? 1 : 0);
