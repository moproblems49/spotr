// THE FINISH SHEET'S SHARE CARD MUST NOT CLIP ITS OWN CONTENT.
//
// The card carried `aspectRatio:"4/5"` for the look, with `overflow:hidden`. Measured on a real
// 4-exercise session: 621px of content forced into a 451px box, so the last 170px were silently
// cut -- and what got cut was the PER-EXERCISE PR LIST, on a card whose own headline is "NEW PR!".
// Nothing looked broken; the card just ended early, which is why it shipped and sat.
//
// Why this is a suite and not a note: the failure is INVISIBLE to every other check. Nothing
// rasterises #workout-card (the id is vestigial -- the shared image is built by the SVG builders),
// no sim renders it, and a screenshot of a clipped card looks like a card that simply ends. The
// only thing that can see it is comparing scrollHeight against clientHeight on the real element.
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "8199";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

let _n = 0; const uid = () => `u${++_n}`;
const S = n => Array.from({ length: n }, () => ({ id: uid(), weight: "135", reps: "8", done: true, type: "normal" }));
// FOUR exercises on purpose: a one-exercise session produces short enough content that the old
// ratio happened to fit, so a thin fixture cannot see this bug at all.
const SESSION = { dayName: "Pull A", unit: "lbs", startedAt: Date.now() - 18e5, exercises: [
  { id: uid(), name: "Barbell Row", reps: "5-8", sets: S(4) },
  { id: uid(), name: "T-Bar Row", reps: "8-10", sets: S(4) },
  { id: uid(), name: "Cable Shrug", reps: "12-15", sets: S(4) },
  { id: uid(), name: "High Row (Machine)", reps: "8-10", sets: S(4) },
] };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
page.setDefaultTimeout(5000);
page.on("pageerror", e => { fails++; console.log("PAGEERROR:", e.message.slice(0, 160)); });

await page.addInitScript(([me, sess]) => {
  localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId: me, theme:"dark", unit:"lbs",
    programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [], groups: [],
    profile: { username:"momo", name:"Mo" }, users: [{ id: me, username:"momo", name:"Mo", followers:[], following:[] }] }));
  localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{ id: me } }));
  localStorage.setItem("seshd_onboarded", "1");
  localStorage.setItem("seshd_custom_merge_v1", "1");
  localStorage.setItem("seshd_active_session", JSON.stringify(sess));
  localStorage.setItem("seshd_wstart", String(Date.now() - 18e5));
}, [ME, SESSION]);
await page.route("**/auth/v1/**", r => r.fulfill({ status:200, contentType:"application/json",
  body: JSON.stringify({ access_token:"t", user:{ id: ME } }) }));
await page.route("**/rest/v1/**", r => {
  const u = r.request().url();
  const J = b => r.fulfill({ status:200, contentType:"application/json", body: JSON.stringify(b) });
  if (r.request().method() !== "GET") return J([{}]);
  if (/\/rest\/v1\/(public_)?profiles\?/.test(u))
    return J([{ id: ME, username:"momo", name:"Mo", unit:"lbs", theme:"dark", seen_onboarding:true }]);
  return J([]);
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2600);

await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^finish$/i.test((x.textContent||"").trim())); b && b.click(); });
await page.waitForTimeout(700);
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^finish workout$/i.test((x.textContent||"").trim())); b && b.click(); });
await page.waitForTimeout(2600);

const M = await page.evaluate(() => {
  const card = document.getElementById("workout-card");
  if (!card) return null;
  const cs = getComputedStyle(card), r = card.getBoundingClientRect();
  const cut = [...card.querySelectorAll("*")]
    .filter(e => !e.children.length && (e.textContent || "").trim())
    .filter(e => e.getBoundingClientRect().bottom > r.bottom + 1)
    .map(e => (e.textContent || "").trim().slice(0, 22));
  return { clipped: card.scrollHeight - card.clientHeight, cut,
           h: Math.round(r.height), aspectRatio: cs.aspectRatio, flexShrink: cs.flexShrink,
           text: card.innerText };
});

check("the share card is on screen after finishing", !!M, "no #workout-card");
if (M) {
  // The load-bearing assertion. Everything else is context for a failure message.
  check("the card clips NONE of its own content", M.clipped === 0, `${M.clipped}px cut: ${M.cut.slice(0,6).join(", ")}`);
  check("no text node falls outside the card's box", M.cut.length === 0, M.cut.slice(0,6).join(", "));
  // The card must not be able to collapse under a flex ancestor: `overflow:hidden` makes its flex
  // min-height compute to 0, which is the shape of the iOS-only report this came from.
  check("the card cannot be flex-collapsed (flex-shrink:0)", M.flexShrink === "0", `flex-shrink:${M.flexShrink}`);
  check("its height is content-driven, not a fixed ratio", M.aspectRatio === "auto", `aspect-ratio:${M.aspectRatio}`);
  // The PR list is the section the ratio was actually eating.
  check("the per-exercise PR section renders inside the card", /PERSONAL RECORDS/i.test(M.text || ""),
    (M.text || "").slice(0, 80).replace(/\n/g, " | "));

  // ── The footer must not eat the content area ────────────────────────────────────────────────
  // The panel is `max-height:90dvh` with a STATIC footer and a `flex:1` scroller, so every pixel
  // the footer reserves comes straight out of the scroller. A 160px bottom pad (added to clear a
  // toast that fired over this sheet) took 128px from the scroller, which moved the scroll fold
  // from below the share card to THROUGH its stats row and left a visible band of empty sheet
  // under the last button. That reads as "the card is squished and there's dead space at the
  // bottom" — two symptoms, one padding value — and NOTHING else in the battery could see it:
  // the card's own scrollHeight/clientHeight are equal the whole time, because the card is fine.
  // It is the space it is given that is wrong.
  const L = await page.evaluate(() => {
    const card = document.getElementById("workout-card");
    const sc = card && card.parentElement;
    const panel = sc && sc.parentElement;
    const footer = sc && sc.nextElementSibling;
    if (!sc || !panel || !footer) return null;
    return {
      panelH: Math.round(panel.getBoundingClientRect().height),
      scrollerH: Math.round(sc.getBoundingClientRect().height),
      footerH: Math.round(footer.getBoundingClientRect().height),
      footerPadBottom: parseFloat(getComputedStyle(footer).paddingBottom) || 0,
    };
  });
  check("the finish sheet's footer/scroller split is measurable", !!L, "structure changed");
  if (L) {
    check("the footer reserves no absurd bottom padding", L.footerPadBottom < 60,
      `padding-bottom is ${L.footerPadBottom}px — every pixel here is taken from the scroller`);
    // 56% was the broken split; 74% is the fixed one. 65% sits between them and is not a tuned
    // number pinned to today's content — it fails only if the footer grows dramatically again.
    check("the scrolling area keeps the majority of the sheet",
      L.scrollerH / L.panelH > 0.65,
      `scroller ${L.scrollerH} of panel ${L.panelH} = ${Math.round(100 * L.scrollerH / L.panelH)}%`);
  }
}

await browser.close();
console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
