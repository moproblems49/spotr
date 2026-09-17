// ONE definition of "drive a brand-new signup through the onboarding wizard".
//
// ★ WHY THIS IS A MODULE AND NOT A COPY IN EACH SUITE. pw_journey, pw_starterprog and
// pw_templates each carried their own walker, and when the wizard went 8 screens -> 4 -> 2 every
// copy had to be found and changed by hand. Two of them matched on copy that no longer existed,
// ORed against copy that did (`/track every rep|main goal|Continue/`), so they silently narrowed
// to whatever survived instead of going red — the N-copies-drift class, in test code.
//
// ★ AND THE OLD LOOPS ONLY FINISHED BY ACCIDENT. Their continue-condition was
// `/main goal|days a week|bit about you/`, and the CLOSING card reads "…4 days a week", so the
// loop kept going there purely because that phrase happened to appear on a screen the regex was
// never written for — which is the only reason "Let's go" was ever clicked and the starter
// program ever reached the stub server. Here the wizard's screens are named explicitly.
// ★ NO FIELD LABEL IN HERE. The first version listed "Biological sex" as a wizard screen and as
// the form gate below, so renaming that one label to "Sex" would have silently taken the walker
// off the form — it would answer nothing, Continue would stay disabled, and all three suites would
// fail six screens later pointing at the wrong thing. Match the HEADINGS, which name the screens
// rather than their contents.
export const OB_SCREENS = /Let's set you up|Follow some lifters|You're all set/i;
// The merged setup form is exactly the screen whose heading is "Let's set you up".
const OB_FORM = /Let's set you up/i;

/**
 * Clicks through the wizard and returns { clicked, finished }.
 * `finished` is the load-bearing half: a fixture whose selectors stop matching leaves the form
 * un-answered, Continue disabled, and the walk spinning — assert on it rather than assuming.
 */
export async function walkOnboarding(page, opts = {}) {
  const goal = opts.goal || /^Build muscle$/i;
  const days = opts.days || /^4$/;
  const sex  = opts.sex  || /^Male$/i;
  const maxSteps = opts.maxSteps || 26;
  const settle = opts.settle ?? 450;
  const clicked = [];
  let finished = false;

  for (let i = 0; i < maxSteps; i++) {
    // Check we are still in the wizard BEFORE clicking anything. Onboarding is an early return in
    // AppInner, so while it shows nothing else is mounted and body text is purely its own; once it
    // completes these strings are gone. Checking first means the walker can never click a button
    // in the app proper that happens to share a label with an advance control.
    const txt = await page.evaluate(() => document.body.innerText);
    if (!OB_SCREENS.test(txt)) { finished = true; break; }

    const hit = await page.evaluate(([g, d, s, f]) => {
      const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const bs = [...document.querySelectorAll("button")].filter(vis)
        .map(x => ({ x, t: (x.textContent || "").trim() }));
      const once = ([src, flags], flag) => {
        if (window[flag]) return null;
        const m = bs.find(o => new RegExp(src, flags).test(o.t));
        if (!m) return null;
        window[flag] = true; m.x.click(); return m.t;
      };
      // The merged setup form — answer ONE field per pass so each click gets its own settle.
      // Continue is disabled until all three are in, and HTMLButtonElement.click() on a disabled
      // button dispatches NOTHING, so a Continue-first walker taps a no-op until it runs out of
      // iterations. The pre-merge version burned 20 passes on the sex step exactly that way.
      if (new RegExp(f[0], f[1]).test(document.body.innerText)) {
        const r = once(g, "__obGoal") || once(d, "__obDays") || once(s, "__obSex");
        if (r) return r;
      }
      const go = bs.find(o => /^(continue|let's go|skip for now)$/i.test(o.t) && !o.x.disabled);
      if (go) { go.x.click(); return go.t; }
      return null;
    }, [[goal.source, goal.flags], [days.source, days.flags], [sex.source, sex.flags],
        [OB_FORM.source, OB_FORM.flags]]);

    if (!hit) break;
    clicked.push(hit);
    await page.waitForTimeout(settle);
  }
  if (!finished) {
    const txt = await page.evaluate(() => document.body.innerText);
    finished = !OB_SCREENS.test(txt);
  }
  return { clicked, finished };
}
