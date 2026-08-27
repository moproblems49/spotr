// The Day Preview share modal was hardcoded dark (black bg, white ink, rgba(255,255,255,·) surfaces)
// on BOTH themes — a jarring black card on the light app — and took no focus on open, so a VoiceOver
// user who tapped Share was left reading the exercise list underneath. sim_a11y can't see this: it
// sweeps theme TOKENS, and this modal paints from hardcoded literals (the documented blind spot, same
// as the plate-colour work). This guard asserts the modal is now theme-aware and a focusable dialog.
//
// Structurally RED on the pre-fix code: the old card had no role="dialog" (so the query returns null
// and every check fails) and hardcoded #0A0A0A on both themes (so the light card would be near-black
// and the two-theme backgrounds would be identical).
import { chromium } from "playwright-core";
const ME = "11111111-1111-4111-8111-111111111111";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`  PASS ${l}`); else { fails++; console.log(`  FAIL ${l}${d ? " — " + d : ""}`); } };

// Alpha-composited WCAG contrast. The muted captions/kicker/chevron paint dark ink at a low alpha
// over the light card — an alpha calibrated over the dark card's near-black fails AA over white, and
// nothing else in the battery can see it (sim_a11y sweeps theme tokens; this modal uses literals).
const lin = c => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); };
const lum = ([r,g,b]) => 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
const ratio = (a,b) => { const L1=lum(a),L2=lum(b); return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05); };
const parse = s => (s.match(/[\d.]+/g)||[]).map(Number); // "rgba(r, g, b, a)" -> [r,g,b,a?]
const over = (fg, bg) => { const a = fg[3] ?? 1; return [0,1,2].map(i => fg[i]*a + bg[i]*(1-a)); };

const EX = [{ name:"Overhead Press (Barbell)", reps:"4×5–7", rest:"90" }];
const PROGRAM = { id:"prog-x", name:"Push/Pull", days:[{ id:"dA", name:"Push B · Shoulders/Arms", exercises:EX }] };

const browser = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const cardBg = {};
for (const theme of ["dark","light"]) {
  const page = await browser.newPage({ viewport:{ width:428, height:926 }, deviceScaleFactor:2, hasTouch:true, isMobile:true });
  page.setDefaultTimeout(6000);
  page.on("pageerror", e => { fails++; console.log("  PAGEERROR:", e.message.slice(0,160)); });
  await page.addInitScript(([me,prog,th]) => {
    localStorage.setItem("seshd_v1", JSON.stringify({ currentUserId:me, theme:th, unit:"lbs",
      programs:[prog], activeProgramId:prog.id, history:{}, workoutDates:{}, weeklyTarget:4,
      bodyLog:[], prs:{}, prEvents:[], posts:[], profile:{username:"momo",name:"Mo"},
      users:[{id:me,username:"momo",name:"Mo",followers:[],following:[]}] }));
    localStorage.setItem("seshd_session", JSON.stringify({ access_token:"t", user:{id:me} }));
    localStorage.setItem("seshd_onboarded","1"); localStorage.setItem("seshd_custom_merge_v1","1");
  }, [ME,PROGRAM,theme]);
  await page.route("**/auth/v1/**", r => r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({access_token:"t",user:{id:ME}})}));
  await page.route("**/rest/v1/**", r => r.abort());
  await page.goto("http://127.0.0.1:8199/", { waitUntil:"domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const x=[...document.querySelectorAll("button")].filter(e=>e.offsetParent)
    .find(e=>(e.textContent||"").includes("Push B") && !/^(Edit|Start)/.test((e.textContent||"").trim())); x&&x.click(); });
  await page.waitForTimeout(1300);
  await page.evaluate(() => { const root=[...document.querySelectorAll("[data-fullscreen-overlay]")].pop();
    const sh=[...root.querySelectorAll("button")].find(b=>(b.getAttribute("aria-label")||"")==="Share"); sh&&sh.click(); });
  await page.waitForTimeout(400);
  const info = await page.evaluate(() => {
    const card = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!card) return null;
    // For each muted target return its own color plus the STACK of translucent bg layers from the
    // element up to (and including) the first opaque one, so the node side can composite the true
    // effective background rather than assume plain white.
    const bgStack = el => {
      const layers = [];
      let n = el;
      while (n && n !== document.body) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) {
          layers.push(c);
          if (!/rgba/.test(c) || /,\s*1\)\s*$/.test(c)) break; // opaque layer reached
        }
        n = n.parentElement;
      }
      return layers;
    };
    const grab = pred => { const e = [...card.querySelectorAll("*")].find(pred); if (!e) return null;
      const cs = getComputedStyle(e); return { color: cs.color, stack: bgStack(e) }; };
    return {
      bg: getComputedStyle(card).backgroundColor,
      focused: document.activeElement === card,
      hasPicker: /This workout/.test(card.textContent||""),
      caption: grab(e => /^Push\/Pull · \d+ days$|· \d+ exercises$/.test((e.textContent||"").trim())),
      kicker:  grab(e => (e.textContent||"").trim() === "SHARE"),
      chevron: (() => { const svg = card.querySelector("svg"); if (!svg) return null;
        const cs = getComputedStyle(svg); return { color: cs.color, stack: [] }; })(),
    };
  });
  check(`[${theme}] share dialog exists (role=dialog, aria-modal)`, !!info, "no dialog found");
  check(`[${theme}] dialog receives focus on open`, info?.focused === true);
  check(`[${theme}] picker renders`, info?.hasPicker === true);
  cardBg[theme] = info?.bg;

  // Contrast only matters where it flips — the light card. Composite each muted text over its real
  // background stack (over white as the base) and assert AA: 4.5:1 for the caption/kicker text,
  // 3:1 for the chevron graphical glyph. Goes red on the pre-boost light alphas (caption 4.03,
  // kicker 3.54, chevron 2.61) which look fine on dark and fail on white.
  if (theme === "light" && info) {
    const effBg = stack => { let bg = [255,255,255]; for (const layer of stack.slice().reverse()) bg = over(parse(layer), bg); return bg; };
    const measure = (t) => t ? ratio(over(parse(t.color), effBg(t.stack)), effBg(t.stack)) : 0;
    const cap = measure(info.caption), kik = measure(info.kicker);
    const chv = info.chevron ? ratio(over(parse(info.chevron.color), [255,255,255]), [255,255,255]) : 0;
    check(`[light] muted caption clears AA text (4.5:1)`, cap >= 4.5, `${cap.toFixed(2)}:1`);
    check(`[light] kicker label clears AA text (4.5:1)`, kik >= 4.5, `${kik.toFixed(2)}:1`);
    check(`[light] disclosure chevron clears 3:1 graphical`, chv >= 3, `${chv.toFixed(2)}:1`);
  }
  await page.close();
}
check("card bg differs between themes (theme-aware, not hardcoded)", cardBg.dark && cardBg.light && cardBg.dark !== cardBg.light, `dark=${cardBg.dark} light=${cardBg.light}`);
check("light card is NOT the old near-black #0A0A0A", !/^rgba?\(1[0-9], 1[0-9], 1[0-9]/.test(cardBg.light || ""), `light=${cardBg.light}`);

await browser.close();
console.log(fails ? `${fails} FAIL(S)` : "ok");
process.exit(fails ? 1 : 0);
