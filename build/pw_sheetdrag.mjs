// Swipe DOWN on a sheet's grab handle closes it; a short drag snaps back.
//
// Mo asked for this on the Body Battery sheet. It lives in `Sheet` rather than that one caller so
// all nineteen sheets can opt in, and follows the house gesture pattern (one setState to drop the
// CSS transition, then direct DOM writes, outcome committed once on release). The handle carries
// touchAction:"none" for the documented iOS reason — leaving the vertical axis to WebKit lets it
// claim the gesture and a later preventDefault cannot take it back.
import { chromium } from "playwright-core";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l,c,d) => { if (c) console.log(`  PASS ${l}`); else { fails++; console.log(`  FAIL ${l}${d?" — "+d:""}`); } };
const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const page = await b.newPage({ viewport:{width:428,height:926}, deviceScaleFactor:2, hasTouch:true, isMobile:true });
page.setDefaultTimeout(6000);
page.on("pageerror", e => { fails++; console.log("  PAGEERROR:", e.message.slice(0,140)); });
await page.addInitScript(me => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId:me, theme:"dark", unit:"lbs", profile:{username:"momo",name:"Mo"} }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{id:me} }));
  localStorage.setItem("seshd_onboarded","1"); localStorage.setItem("seshd_custom_merge_v1","1");
}, ME);
await page.route("**/auth/v1/**", r => r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({access_token:"t",user:{id:ME}})}));
await page.route("**/rest/v1/**", r => r.fulfill({status:200,contentType:"application/json",body:"[]"}));
await page.goto("http://127.0.0.1:8199/", { waitUntil:"domcontentloaded" });
await page.waitForTimeout(3200);
await page.evaluate(() => { const p=[...document.querySelectorAll("button")].filter(x=>x.offsetParent).find(x=>(x.getAttribute("aria-label")||"")==="Profile"); p&&p.click(); });
await page.waitForTimeout(1100);

const openSheet = async () => {
  await page.evaluate(() => { const e=[...document.querySelectorAll("*")].find(x=>(x.textContent||"").trim()==="BODY BATTERY"&&x.childElementCount===0); e&&e.closest("div[style]")?.click(); });
  await page.waitForTimeout(900);
};
const sheetOpen = () => page.evaluate(() => !!document.querySelector('[data-sheet-handle="1"]'));
const drag = async (dy, steps = 8) => {
  const box = await page.evaluate(() => { const h=document.querySelector('[data-sheet-handle="1"]'); if(!h) return null; const r=h.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; });
  if (!box) return false;
  const id = 1;
  await page.evaluate(([x,y,id]) => { const h=document.querySelector('[data-sheet-handle="1"]');
    h.dispatchEvent(new TouchEvent("touchstart",{bubbles:true,touches:[new Touch({identifier:id,target:h,clientX:x,clientY:y})]})); }, [box.x, box.y, id]);
  for (let i=1;i<=steps;i++) {
    await page.evaluate(([x,y,id]) => { const h=document.querySelector('[data-sheet-handle="1"]');
      h.dispatchEvent(new TouchEvent("touchmove",{bubbles:true,touches:[new Touch({identifier:id,target:h,clientX:x,clientY:y})]})); }, [box.x, box.y + (dy*i)/steps, id]);
    await page.waitForTimeout(16);
  }
  return true;
};
const endDrag = () => page.evaluate(() => { const h=document.querySelector('[data-sheet-handle="1"]');
  h && h.dispatchEvent(new TouchEvent("touchend",{bubbles:true,touches:[]})); });
const panelY = () => page.evaluate(() => { const h=document.querySelector('[data-sheet-handle="1"]'); if(!h) return null;
  const p=h.parentElement; const m=/translateY\(([-\d.]+)px\)/.exec(getComputedStyle(p).transform.includes("matrix") ? "" : getComputedStyle(p).transform);
  const t=getComputedStyle(p).transform; if(t.startsWith("matrix")) return parseFloat(t.split(",")[5]); return m?parseFloat(m[1]):0; });

await openSheet();
check("sheet opens and renders a drag handle", await sheetOpen());
check("handle is touch-action:none (iOS would otherwise claim the drag)",
  await page.evaluate(() => getComputedStyle(document.querySelector('[data-sheet-handle="1"]')).touchAction) === "none");

// 1. A SHORT drag must snap back, not close.
await drag(40);
const midY = await panelY();
check("panel follows the finger during the drag", midY > 20, `translateY=${midY}`);
await endDrag();
await page.waitForTimeout(600);
check("a short drag SNAPS BACK (sheet stays open)", await sheetOpen());
check("panel returned to rest", Math.abs(await panelY()) < 3, `translateY=${await panelY()}`);

// 2. A long drag past the threshold closes it.
await drag(160);
await endDrag();
await page.waitForTimeout(900);
check("a long drag past the threshold CLOSES the sheet", !(await sheetOpen()));

// 3. Still reopenable afterwards (the close path must not leave the panel stuck off-screen).
await openSheet();
check("sheet reopens cleanly after a drag-close", await sheetOpen());
check("reopened panel is at rest, not stuck at the drag offset", Math.abs(await panelY()) < 3, `translateY=${await panelY()}`);

// 4. ★ THE HANDLE MUST NOT LIVE INSIDE A SCROLLING CONTAINER.
// This is the property that was actually broken, and it is iOS-only in EFFECT: a touch beginning
// inside a momentum scroller is claimed by WebKit's compositor before any JS runs, and
// touch-action on a child cannot take it back. Chromium happily dragged the handle throughout, so
// checks 1-3 passed on a build where the gesture did nothing on a real phone. Chromium cannot
// reproduce the gesture — but it CAN verify the structure, which is the same lesson as the
// pan-y reorder grip: the property is the bug, so assert the property.
await openSheet();
const structure = await page.evaluate(() => {
  const h = document.querySelector('[data-sheet-handle="1"]');
  if (!h) return { found:false };
  const panel = h.parentElement;
  let scrollingAncestor = null;
  for (let el = h.parentElement; el && el !== document.body; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if (oy === "auto" || oy === "scroll") { scrollingAncestor = el.tagName + "." + (el.className || "(no class)"); break; }
  }
  return { found:true, scrollingAncestor, touchAction: getComputedStyle(h).touchAction,
           panelDisplay: getComputedStyle(panel).display };
});
check("handle exists on the reopened sheet", structure.found);
check("handle is NOT inside a scrolling container (iOS would claim the gesture)",
  structure.scrollingAncestor === null,
  `nearest scrolling ancestor: ${structure.scrollingAncestor}`);
check("handle still declares touch-action:none", structure.touchAction === "none", structure.touchAction);

// 5. The sheets that opted in must ACTUALLY have a handle — it was opt-in and only ONE of fifteen
// sheets had ever passed the prop, which is why "it doesn't work on any other sheet" was correct.
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>/^Close$/.test((x.textContent||"").trim())); b&&b.click(); });
await page.waitForTimeout(700);
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>(x.getAttribute("aria-label")||"")==="Settings"); b&&b.click(); });
await page.waitForTimeout(900);
const settings = await page.evaluate(() => {
  const h = document.querySelector('[data-sheet-handle="1"]');
  if (!h) return { found:false };
  let scrollingAncestor = null;
  for (let el = h.parentElement; el && el !== document.body; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if (oy === "auto" || oy === "scroll") { scrollingAncestor = el.tagName; break; }
  }
  return { found:true, isSettings: /Settings/.test(h.parentElement.textContent || ""), scrollingAncestor };
});
check("a SECOND sheet (Settings) also has a drag handle", settings.found && settings.isSettings,
  JSON.stringify(settings));
check("and its handle is outside the scroller too", settings.scrollingAncestor === null,
  `nearest scrolling ancestor: ${settings.scrollingAncestor}`);

await b.close();
console.log(fails ? `${fails} FAIL(S)` : "ok");
process.exit(fails ? 1 : 0);
