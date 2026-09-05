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
    programs: [], history: {}, workoutDates: {}, prEvents: [], bodyLog: [], prs: {}, posts: [], groups: [{ id:"g1", name:"Seshd Crew", member_ids:[me], members:[me] }],
    profile: { username:"momo", name:"Mo" }, users: [{ id: me, username:"momo", name:"Mo", followers:[], following:[] }] }));
  // A GROUP IS PART OF THE FIXTURE, NOT DECORATION. The share row is two-up only when there is a
  // second destination to sit beside; with no groups the slot holds a full sentence of hint copy
  // and stays full width. A groupless fixture therefore cannot see the two-up layout at all.
  // NOTE the seed below is INERT — `loadUserData` replaces `groups` wholesale from the server, so
  // the two-up layout comes ENTIRELY from the `/rest/v1/groups` stub further down. Measured:
  // emptying this array changes nothing; removing the stub route fails four checks. It is kept
  // only so the pre-load render is not briefly groupless.
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
  // THE GROUP HAS TO COME FROM THE STUB, NOT localStorage. `loadUserData` replaces `groups`
  // wholesale from the server on boot, so a group seeded only into `seshd_v1` is gone by the time
  // the sheet renders -- which showed up here as "Share to Feed" (the no-groups, full-width
  // layout) and read as a broken app rather than a thin fixture.
  if (/\/rest\/v1\/groups\?/.test(u))
    return J([{ id:"g1", name:"Seshd Crew", member_ids:[ME], created_by: ME }]);
  return J([]);
});
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2600);

await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /^finish$/i.test((x.textContent||"").trim())); b && b.click(); });
await page.waitForTimeout(700);
// ── The finish CONFIRM is a centred dialog, and it offers exactly two answers ────────────────
// It was a bottom sheet with a third button ("Save & send to groups") that reached the same
// outcome as the summary's own "Groups only" — a second call site for one destination, and the
// only thing keeping the `showGroupShare` picker alive. Anchored at the bottom it also left a
// band of empty sheet under "Keep going". Both are asserted here because a revert to either
// shape is silent: every other check in this file passes on the bottom-sheet version.
const D = await page.evaluate(() => {
  const t = [...document.querySelectorAll("div")].find(d => /^Finish workout\?$/.test((d.textContent||"").trim()));
  const panel = t && t.parentElement;
  // WALK UP TO THE REAL BACKDROP RATHER THAN ASSUMING IT IS THE PANEL'S PARENT. `Sheet`
  // interposes an inner wrapper when a caller passes `dragHandle`, so `parentElement` is the
  // backdrop today only because this one does not. That is not a false PASS — neither
  // "flex-end" nor "normal" equals "center" — but it would fail a correctly-centred dialog
  // while printing an alignItems value that describes nothing, which is a misdiagnosis waiting
  // for whoever adds a drag handle here. The backdrop is the fixed, full-viewport ancestor.
  let back = panel && panel.parentElement;
  while (back && back !== document.body && getComputedStyle(back).position !== "fixed") back = back.parentElement;
  if (!panel || !back || back === document.body) return null;
  const pr = panel.getBoundingClientRect(), br = back.getBoundingClientRect();
  return {
    align: getComputedStyle(back).alignItems,
    // Gap above vs below the card. A bottom sheet has ~0 below; a centred dialog has both.
    above: Math.round(pr.top - br.top), below: Math.round(br.bottom - pr.bottom),
    inset: Math.round(pr.left - br.left),
    labels: [...panel.querySelectorAll("button")].map(b => (b.textContent||"").trim()),
  };
});
check("the finish confirm renders", !!D, "no 'Finish workout?' dialog");
if (D) {
  check("it is centred, not anchored to the bottom edge",
    D.align === "center" && D.below > 40 && Math.abs(D.above - D.below) < 40,
    `align:${D.align} above:${D.above} below:${D.below}`);
  check("the card is inset from the screen edges", D.inset >= 14, `left inset ${D.inset}px`);
  check("it offers exactly two answers", D.labels.length === 2, D.labels.join(" | "));
  check("the redundant groups shortcut is gone",
    !D.labels.some(l => /send to groups/i.test(l)), D.labels.join(" | "));
}

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
  // The PR list is the section the ratio was actually eating. NOTE THIS IS A PRESENCE CHECK ONLY
  // AND IS DELIBERATELY NOT THE CLIPPING GUARD: the HEADING sits inside the box while its
  // CONTENTS spill out, so this stayed PASS through the whole red proof. The two checks above
  // (clipped === 0, and no text node outside the box) are the load-bearing ones — do not read a
  // green here as evidence the section is whole.
  check("the per-exercise PR section is present", /PERSONAL RECORDS/i.test(M.text || ""),
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
      // Every button in the footer, with the row it sits on. Two buttons whose vertical centres
      // are within 6px are on the same row — cheaper and more honest than reading the DOM shape,
      // which a restyle is free to change.
      btns: [...footer.querySelectorAll("button")].map(b => {
        const r = b.getBoundingClientRect();
        return { t: (b.textContent||"").trim(), mid: Math.round(r.top + r.height / 2), w: Math.round(r.width) };
      }),
      footerW: Math.round(footer.getBoundingClientRect().width),
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

    // ── Two rows, not four ───────────────────────────────────────────────────────────────────
    // Four full-width stacked exits is what produced the 199px footer. The pairing is also the
    // hierarchy: row one is the two share DESTINATIONS, row two the two ways to leave without
    // sharing. Assert by measured geometry so a restyle that keeps the shape stays green.
    const rows = [...new Set(L.btns.map(b => b.mid))].sort((a, b) => a - b)
      .reduce((acc, m) => (acc.some(x => Math.abs(x - m) <= 6) ? acc : [...acc, m]), []);
    const rowOf = b => rows.findIndex(m => Math.abs(m - b.mid) <= 6);
    const feed = L.btns.find(b => /feed/i.test(b.t));
    const groups = L.btns.find(b => /groups only/i.test(b.t));
    const dont = L.btns.find(b => /don't share/i.test(b.t));
    const undo = L.btns.find(b => /undo finish/i.test(b.t));
    check("all four footer actions are present",
      !!(feed && groups && dont && undo), L.btns.map(b => b.t).join(" | "));
    if (feed && groups && dont && undo) {
      check("the two share destinations share one row", rowOf(feed) === rowOf(groups),
        `feed mid ${feed.mid}, groups mid ${groups.mid}`);
      // AN EQUALITY BOUND PLUS AN UPPER BOUND IS NOT "HALF EACH". The first version was
      // `|feed - groups| < 40 && feed < footer*0.62`, which two 80px buttons floating in the
      // middle of a 402px footer satisfy perfectly — proven by setting both to `flex:0 0 80px`
      // and watching it pass. The pair has to FILL the row, so the lower bound is the load-
      // bearing half: each button is at least 40% of the footer, and together they cover at
      // least 85% of it (the rest is the 18px side padding and the 8px gap).
      check("each takes about half the footer width",
        Math.abs(feed.w - groups.w) < 40 && feed.w < L.footerW * 0.62
          && feed.w > L.footerW * 0.40 && groups.w > L.footerW * 0.40
          && (feed.w + groups.w) > L.footerW * 0.85,
        `feed ${feed.w}px, groups ${groups.w}px, footer ${L.footerW}px`);
      check("the two non-share exits share one row", rowOf(dont) === rowOf(undo),
        `don't-share mid ${dont.mid}, undo mid ${undo.mid}`);
      check("the footer is two rows, not four", rows.length === 2, `${rows.length} rows`);
    }
  }
}

await browser.close();
console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
