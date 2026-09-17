// Lazy-loaded: the onboarding wizard is shown exactly ONCE per new user (gated on
// store.seenOnboarding / seshd_onboarded), so for the overwhelming majority of app opens
// (every returning user) this code is dead weight in the initial bundle. Split out so it
// only downloads for the signup flow that actually needs it.
//
// PROGRAM_TEMPLATES / recommendTemplateId stay defined in App.jsx (exported from there, not
// duplicated here) because they're ALSO used by App.jsx's own onboarding-completion handler
// and the "Browse templates" sheet — see the ReferenceError history on PROGRAM_TEMPLATES in
// App.jsx right above its definition before touching either.
import { useState } from "react";
import { Icon, SeshdLogo, Avatar, PROGRAM_TEMPLATES, recommendTemplateId, F, KB_SAFE_INSET, useBodyMapData, bodyGreys, BODY_FUSE } from "../App.jsx";

export default function Onboarding({ C, onComplete, suggestedUsers = [] }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ goal: null, daysPerWeek: null });
  const [followIds, setFollowIds] = useState(() => new Set());

  // ★ THE THREE INTRO CARDS ARE GONE — THEY MOVED TO THE WELCOME SCREEN (AuthScreen), IN FRONT OF
  // SIGNUP. They were a sales pitch delivered to someone who had already downloaded the app and
  // typed in a password: the person is sold, and three taps of "here is what this is" sit between
  // them and their first set. On the welcome screen the same copy is still doing a job, and it
  // merged with the feature list already there rather than being appended (two pitches for one app
  // is the N-copies class in content form — they had already drifted, each naming things the other
  // did not). Measured: the wizard went 8 screens / 9 taps to 4 / 5.
  // ★ GOAL + DAYS + SEX/AGE ARE ONE SCREEN (Sep 16 2026). They were three, each with its own
  // heading and its own tap, and they are all the same question — "what should we set you up
  // with" — asked in instalments. Three screens buy nothing here: none of the answers changes
  // which questions follow, so there is no branching to justify pacing them, and a wizard that
  // paginates a form with eight taps of content is just a form behind three taps of chrome.
  // The step count is what a new user pays before their first set, so it is worth the density.
  // Measured: 8 screens / 9 taps -> 4 / 5 (the intro cards) -> 2 / 2 (this).
  //
  // ★ AND THE LAYOUT IS DENSE ON PURPOSE, BECAUSE STACKED FULL-WIDTH BUTTONS DO NOT FIT.
  // Eight options at the old one-per-row size is ~500px of buttons before the labels, headings
  // or the age field. Goal is a 2x2 grid and days is a single 4-across row (the labels are one
  // character, and a row reads as the scale it is). This screen has a REAL scroll container with
  // the Continue button in a STATIC footer outside it, so overflowing on a short phone costs a
  // scroll and can never strand the CTA — unlike the welcome screen, which has no scroller and
  // where a fourth row was therefore refused outright. Do not move Continue into the scroller.
  const GOALS = [
    { v:"strength", label:"Get stronger" },
    { v:"muscle",   label:"Build muscle" },
    { v:"lean",     label:"Get lean" },
    { v:"general",  label:"Stay healthy" },
  ];
  // ★ "How long have you been lifting?" WAS DELETED (Sep 16 2026) BECAUSE NOTHING READ IT.
  // It wrote answers.experience, and the only reader of store.onboardingAnswers in the whole app
  // is recommendTemplateId — which destructured `experience` and never mentioned it again. So
  // every new signup answered a question that could not change one pixel of what they got: the
  // dead-UI class in QUESTION form, and invisible to sim_deadui because the setter IS called and
  // the value IS stored. Nothing reads it. When auditing a form, trace each field to a READER.
  // 5 means "5 or more" — recommendTemplateId's last branch is `else`, so nothing above 5 exists.
  const DAYS = [2, 3, 4, 5];
  // step layout: [setup form][follow suggestions][closing]
  const hasFollowStep = suggestedUsers.length > 0;
  const totalSteps = 1 + (hasFollowStep ? 1 : 0) + 1;
  const closingStep = totalSteps - 1;
  const followStep = hasFollowStep ? closingStep - 1 : -1;
  const inForm = step === 0;
  const inFollowStep = step === followStep;
  const inClosing = step === closingStep;
  // ★ ONLY GOAL AND DAYS ARE REQUIRED. Those two are the ONLY inputs recommendTemplateId reads,
  // so without them there is no program to start anyone on — the wizard genuinely cannot finish.
  // Sex and age are not in that class: both only tune the strength standards (and sex picks the
  // body-map silhouette), both are changeable in Settings, and both have an honest answer for
  // "unset". Gating Continue on sex forced a physiological disclosure to use a workout tracker,
  // which is the pattern Garmin / Whoop / Oura all abandoned: two physiological options plus a
  // way to decline, because there is no third baseline to offer but there is no reason to demand
  // one either. Seshd goes one better — `computeStrengthScore` has a real "other" that averages
  // the male and female bodyweight-aware thresholds, so the third option is not a euphemism for
  // "we picked male anyway".
  const formReady = !!answers.goal && !!answers.daysPerWeek;

  function next() {
    if (step < totalSteps - 1) setStep(step + 1);
    else onComplete(answers, Array.from(followIds));
  }
  function back() { if (step > 0) setStep(step - 1); }
  // No auto-advance any more: with one merged form there is nothing to advance INTO until every
  // answer is in, and jumping the moment the last one is tapped would take the screen away from
  // someone still deciding whether to change an earlier answer. Continue is the only way forward.
  // Picking a binary sex CLEARS any bodyMap left over from a previous "Other" tap — the
  // sub-question only exists under Other, and a stale value would silently outrank the sex
  // the user just chose.
  const set = (key, v) => setAnswers(a => ({ ...a, [key]: v, ...(key === "sex" && v !== "other" ? { bodyMap: null } : {}) }));
  function toggleFollowSuggestion(id) {
    setFollowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }


  // Personalized closing copy from their answers
  const goalLabel = { strength:"getting stronger", muscle:"building muscle", lean:"getting lean", general:"staying healthy" }[answers.goal] || "your goals";
  const dpw = answers.daysPerWeek || 3;
  const recProgram = PROGRAM_TEMPLATES.find(t => t.id === recommendTemplateId(answers));
  // Keyboard handling for the one step that has a real text input (Age, on the sex/age step).
  // Same bug and same fix as AuthScreen and NewPasswordScreen: Capacitor's `native` keyboard
  // resize mode SHRINKS the webview, so this `justifyContent:"center"` column re-centres itself
  // a beat after the field is tapped and the whole step visibly jumps — measured 178px of drift
  // here, the largest of the three, and this is the step EVERY new signup walks through. `typing`
  // switches the content column to top-aligned while a field is focused so there is nothing left
  // to re-centre. The rAF blur-guard re-checks document.activeElement because blur fires BEFORE
  // the next focus, so reacting immediately would unpin for a frame on every field change.
  // The step also gains `overflowY:auto` while typing: it had NO scrollable container at all, so
  // if the keyboard ever covered the Continue button there was no way to reach it — the shape of
  // the App Store 2.1(a) rejection. Continue currently rides above the keyboard as a flex sibling,
  // so this is a safety net rather than a fix for a live symptom.
  const [typing, setTyping] = useState(false);

  return (
    <div style={{ position:"fixed", ...KB_SAFE_INSET, background:C.bg, zIndex:600, display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto", fontFamily:F }}>
      {/* Back button — available after the first screen */}
      {step > 0 && !inClosing && (
        <button onClick={back} aria-label="Back" style={{ position:"absolute", top:"calc(env(safe-area-inset-top) + 16px)", left:18, background:"none", border:"none", fontSize:24, color:C.sub, cursor:"pointer", fontFamily:F, zIndex:2, padding:12 }}>‹</button>
      )}
      <div
        onFocus={e => { if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) setTyping(true); }}
        onBlur={() => { requestAnimationFrame(() => {
          const el = typeof document !== "undefined" ? document.activeElement : null;
          if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) setTyping(false);
        }); }}
        style={{ flex:1, minHeight:0, display:"flex", flexDirection:"column", alignItems:"center",
          overflowY:"auto", WebkitOverflowScrolling:"touch",
          padding:"40px 32px", textAlign:"center", boxSizing:"border-box" }}>
        {/* Centred by this wrapper's `margin:auto`, NOT by justifyContent on the scroller above.
            Two reasons, both documented in CLAUDE.md: a centring flex parent that is ALSO the
            scroll container clips whichever edge overflows (the alignItems:center backdrop bug),
            and auto margins collapse to 0 on their own once there is no spare space — so on a
            step tall enough to overflow, the keyboard opening changes nothing and `typing` is a
            no-op. `typing` only matters on the steps that still fit, where it stops the content
            re-centring into the shrunken box. Switching justifyContent instead was measured
            leaving 34px of residual jump; this leaves none. */}
        <div style={{ width:"100%", display:"flex", flexDirection:"column", alignItems:"center", margin: typing ? "0" : "auto 0" }}>
        {/* 48 elsewhere, 24 on the form — that step carries four sections and the margin is
            competing with them for the same vertical budget on a short phone. */}
        <div style={{ marginBottom: inForm ? 24 : 48 }}>
          <SeshdLogo C={C} big/>
        </div>
        {inClosing ? (
          <div key="closing" className="seshd-enter" style={{ width:"100%", maxWidth:340 }}>
            <div style={{ width:88, height:88, borderRadius:24, background:C.primary, color:C.onPrimary, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:28, marginLeft:"auto", marginRight:"auto" }}>
              <Icon name="check" size={42} color="#fff" strokeWidth={2}/>
            </div>
            <div style={{ fontSize:28, fontWeight:800, color:C.text, marginBottom:12, letterSpacing:-0.6, lineHeight:1.15 }}>You're all set</div>
            <div style={{ fontSize:15, color:C.sub, lineHeight:1.5, marginBottom:8 }}>
              We'll tailor things around {goalLabel}, {dpw} days a week.{recProgram ? <> We've started you on <strong style={{ color:C.text, fontWeight:700 }}>{recProgram.name}</strong> — tweak it anytime.</> : ""} Your progress builds from here.
            </div>
          </div>
        ) : inFollowStep ? (
          <div key="follow" className="seshd-enter" style={{ width:"100%", maxWidth:340 }}>
            <div style={{ fontSize:24, fontWeight:800, color:C.text, marginBottom:8, letterSpacing:-0.5, lineHeight:1.2 }}>Follow some lifters</div>
            <div style={{ fontSize:14, color:C.sub, marginBottom:20, lineHeight:1.4 }}>Your feed is more fun with friends in it. You can always follow more people later.</div>
            <div style={{ background:C.surface, borderRadius:16, border:`1px solid ${C.border}`, overflow:"hidden", maxHeight:340, overflowY:"auto", textAlign:"left" }}>
              {suggestedUsers.map((u, idx) => {
                const picked = followIds.has(u.id);
                return (
                  <div key={u.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderBottom: idx < suggestedUsers.length-1 ? `1px solid ${C.divider}` : "none" }}>
                    <Avatar user={u} size={40} C={C}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{u.username}</div>
                      <div style={{ fontSize:12, color:C.sub, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{u.name}</div>
                    </div>
                    {/* C.primary/C.onPrimary, not C.accent + hardcoded white — same bug, same fix
                        as DiscoverScreen.jsx's Follow buttons (see its comment). */}
                    <button onClick={() => toggleFollowSuggestion(u.id)} style={{
                      padding:"7px 16px", borderRadius:20, fontSize:12, fontWeight:700, flexShrink:0,
                      background: picked ? "transparent" : C.primary,
                      color: picked ? C.text : C.onPrimary,
                      border: `1.5px solid ${picked ? C.border : C.primary}`,
                      cursor:"pointer", fontFamily:F
                    }}>{picked ? "Following" : "Follow"}</button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div key="form" className="seshd-enter" style={{ width:"100%", maxWidth:340, textAlign:"left" }}>
            <div style={{ fontSize:24, fontWeight:800, color:C.text, marginBottom:8, letterSpacing:-0.5, lineHeight:1.2, textAlign:"center" }}>Let's set you up</div>
            <div style={{ fontSize:14, color:C.sub, marginBottom:26, lineHeight:1.4, textAlign:"center" }}>This picks your starting program and tailors your strength standards. You can change any of it later.</div>

            <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:10 }}>Main goal</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:22 }}>
              {GOALS.map(o => {
                const sel = answers.goal === o.v;
                return (
                  <button key={o.v} onClick={() => set("goal", o.v)} aria-pressed={sel} style={{
                    padding:"15px 8px", borderRadius:14, cursor:"pointer", fontFamily:F,
                    background: sel ? C.primary : C.surface,
                    border:`1.5px solid ${sel ? C.accent : C.border}`,
                    color: sel ? C.onPrimary : C.text,
                    fontSize:14, fontWeight:600, textAlign:"center",
                    transition:"all 0.15s cubic-bezier(0.22, 1, 0.36, 1)",
                  }}>{o.label}</button>
                );
              })}
            </div>

            <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:10 }}>Days a week</div>
            <div style={{ display:"flex", gap:8, marginBottom:22 }}>
              {DAYS.map(d => {
                const sel = answers.daysPerWeek === d;
                return (
                  <button key={d} onClick={() => set("daysPerWeek", d)} aria-pressed={sel}
                    aria-label={d === 5 ? "5 or more days a week" : `${d} days a week`} style={{
                    flex:1, padding:"15px 4px", borderRadius:14, cursor:"pointer", fontFamily:F,
                    background: sel ? C.primary : C.surface,
                    border:`1.5px solid ${sel ? C.accent : C.border}`,
                    color: sel ? C.onPrimary : C.text,
                    fontSize:15, fontWeight:700, textAlign:"center",
                    transition:"all 0.15s cubic-bezier(0.22, 1, 0.36, 1)",
                  }}>{d === 5 ? "5+" : d}</button>
                );
              })}
            </div>

            {/* ★ THREE OPTIONS, MATCHING SETTINGS — WHICH HAS HAD THEM ALL ALONG. The Strength
                Score card's own SexToggle is Male / Female / Other and `computeStrengthScore`
                implements "other" as the midpoint of the male and female bodyweight-aware
                thresholds. Onboarding offered two and REQUIRED one, so the same question had two
                different answer sets in one app and the narrower one was the one every new user
                met: the N-copies-drift class, in a form. `bodyType` stays binary (there is no
                third body map and tracing one is licensed-art work), which is why onComplete
                writes body_type only for male/female — and, when the answer is "other", for
                whichever silhouette the user picks in the conditional Body map row below.
                ★ THE LABEL IS "Sex", NOT "Biological sex". With only two options "Biological" was
                doing real work — it said the question is about physiology rather than identity. The
                moment a third option exists it stops being accurate ("Other" is not a biological
                sex) and starts contradicting the control under it. Apple Health and Hevy, the two
                most-scrutinised precedents here, both label it exactly "Sex" with Female/Male/Other
                for the same reason. The "why we ask" work moved to the caption, which is where it
                belonged all along. */}
            <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:4 }}>Sex <span style={{ color:C.muted, fontWeight:500 }}>(optional)</span></div>
            <div style={{ fontSize:11, color:C.muted, marginBottom:10, lineHeight:1.4 }}>Sets your strength standards. Other uses a neutral baseline.</div>
            <div style={{ display:"flex", gap:8, marginBottom:22 }}>
              {[["male","Male"],["female","Female"],["other","Other"]].map(([v,label]) => {
                const sel = answers.sex === v;
                return (
                  <button key={v} onClick={() => set("sex", sel ? null : v)} aria-pressed={sel} style={{
                    flex:1, padding:"15px 8px", borderRadius:14, cursor:"pointer", fontFamily:F,
                    background: sel ? C.primary : C.surface, border:`1.5px solid ${sel ? C.accent : C.border}`,
                    color: sel ? C.onPrimary : C.text, fontSize:15, fontWeight:600,
                    transition:"all 0.15s cubic-bezier(0.22, 1, 0.36, 1)",
                  }}>{label}</button>
                );
              })}
            </div>

            {/* ★ "OTHER" ASKS WHICH FIGURE TO DRAW, RATHER THAN SILENTLY DRAWING THE MALE ONE.
                The strength side has a real third answer — computeStrengthScore averages the two
                bodyweight-aware tables — but the body map does not: there are exactly two
                silhouettes and tracing a third is licensed-art work. So the honest split is TWO
                questions that collapse into one for almost everybody: a binary sex answers both,
                and "Other" answers the standards and hands the silhouette back to the user.
                Before this, picking Other fell through MuscleHeatmap's bodyType -> strengthSex ->
                male fallback, so the caption above claimed this field set your body map and the
                one option that most needed it got male with no say. Left unanswered it still
                falls back to male, which is exactly the old behaviour and never worse.
                The aria-labels say "body map" because "Male"/"Female" alone, read out two rows
                under an identical pair, is ambiguous — the days row sets one for the same
                reason. */}
            {answers.sex === "other" && (
              <BodyMapPick C={C} value={answers.bodyMap} onPick={(v) => set("bodyMap", v)}/>
            )}

            <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:10 }}>Age <span style={{ color:C.muted, fontWeight:500 }}>(optional)</span></div>
            <input type="text" inputMode="numeric" autoComplete="off" autoCorrect="off" spellCheck={false} data-1p-ignore data-lpignore="true" placeholder="e.g. 28" min="14" max="99"
              aria-label="Age"
              value={answers.age || ""}
              onChange={e => { const a = parseInt(e.target.value); setAnswers(p => ({ ...p, age: (a > 0 && a < 100) ? a : null })); }}
              style={{ width:"100%", padding:"15px 16px", borderRadius:14, border:`1.5px solid ${C.border}`, background:C.surface, color:C.text, fontSize:15, fontWeight:600, fontFamily:F, outline:"none", boxSizing:"border-box" }}/>
          </div>
        )}
        </div>
      </div>
      <div style={{ padding:"0 32px 44px" }}>
        <div style={{ display:"flex", gap:6, justifyContent:"center", marginBottom:24 }}>
          {Array.from({ length: totalSteps }).map((_,i) => <div key={i} style={{ width:i===step?22:6, height:6, borderRadius:3, background:i===step?C.text:C.border, transition:"all 0.3s cubic-bezier(0.22, 1, 0.36, 1)" }}/>)}
        </div>
        {inForm && (
          <button onClick={next} disabled={!formReady} style={{
            width:"100%", background: formReady ? C.text : C.surface, color: formReady ? C.bg : C.muted,
            border:"none", borderRadius:14, padding:"16px", fontSize:15, fontWeight:700,
            cursor: formReady ? "pointer" : "not-allowed", fontFamily:F, letterSpacing:-0.2
          }}>
            Continue
          </button>
        )}
        {inFollowStep && (
          <button onClick={next} style={{
            width:"100%", background:C.text, color:C.bg, border:"none", borderRadius:14, padding:"16px",
            fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:F, letterSpacing:-0.2
          }}>
            {followIds.size > 0 ? `Continue (${followIds.size} selected)` : "Skip for now"}
          </button>
        )}
        {inClosing && (
          <button onClick={() => onComplete(answers, Array.from(followIds))} style={{
            width:"100%", background:C.primary, color:C.onPrimary, border:"none", borderRadius:14, padding:"16px",
            fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:F, letterSpacing:-0.2
          }}>
            Let's go
          </button>
        )}
      </div>
    </div>
  );
}

// ★ THE PICKER SHOWS THE ACTUAL FIGURES, NOT THE WORDS "Male" / "Female".
// The question is literally "which of these two drawings do we put on your muscle map", and the
// two drawings are the only honest answer to it — the words are a description of a picture the
// app already owns. Front view only: the back adds no information here (the silhouettes differ in
// the same way from either side) and two figures per tile halves the size of each.
//
// ★ THE MUSCLES ARE ALL GREEN BECAUSE GREEN IS WHAT "FULLY RECOVERED" LOOKS LIKE ON THIS MAP
// (_readyColor's t=1 end, i.e. C.green), so the tile previews the real screen rather than
// inventing a swatch. C.green — never a literal — is the one value calibrated to clear 4.5:1 on
// BOTH themes against bg and surface; a hardcoded #34d399 measures 1.91:1 on the light theme's
// card, which is the documented "re-measure every hardcoded colour when the surface changes"
// trap. The tile background therefore stays C.surface in BOTH states: inverting it to C.primary
// the way the text rows above do would flip the ground under the figure and put the green (and
// the derived silhouette grey, which is mixed from C.bg) on a surface neither was calibrated for.
// Selection is carried by the accent ring and the label instead, which is also what every
// image picker does.
//
// ★ IT IS A SEPARATE COMPONENT SO THE 109 KB (gzipped) bodyMapData CHUNK IS FETCHED ONLY WHEN
// SOMEBODY TAPS "Other". A hook cannot be conditional, so the condition has to sit at the
// component boundary — calling useBodyMapData() in Onboarding itself would make every new signup
// download the body map to render a wizard that never shows it. Until the chunk lands (or if it
// fails) the tiles render their labels alone, so the row is answerable either way and never
// empty.
function BodyMapPick({ C, value, onPick }) {
  const bm = useBodyMapData();
  const bodyCol = bodyGreys(C).body;
  const sepCol = C?.isDark ? "#2a2a30" : "#ffffff";
  const VB = "48 6 168 408"; // the front box BodyMap uses; the male hand reaches x=214.7
  const H = 104, W = Math.round(H * 168 / 408);

  // ★ THE SLOT RESERVES ITS HEIGHT WHETHER OR NOT THE FIGURE HAS ARRIVED. The chunk is ~109 kB
  // gzipped and lands whenever the link allows; measured on a deliberately slow server the tile
  // sat at 41px for 1.55s and then became 153px, moving the Age field 112px DOWN under the user's
  // finger. A fallback that renders nothing still has to occupy the space the real thing will.
  const Fig = ({ sex }) => {
    const f = bm && (bm.BODYMAPS[sex] || bm.BODYMAP_MALE) && (bm.BODYMAPS[sex] || bm.BODYMAP_MALE).front;
    if (!f) return <div style={{ width:W, height:H }} aria-hidden="true"/>;
    return (
      <svg viewBox={VB} width={W} height={H} style={{ display:"block" }} aria-hidden="true">
        {f._body && <>
          {/* two passes, same as BodyMap: the fat half-opacity stroke fuses the floating fiber
              shapes into one silhouette, then the solid pass draws it. */}
          <path d={f._body} fill={bodyCol} fillOpacity={0.55} stroke={bodyCol} strokeOpacity={0.55} strokeWidth={BODY_FUSE} strokeLinejoin="round"/>
          <path d={f._body} fill={bodyCol} stroke={bodyCol} strokeWidth={3} strokeLinejoin="round"/>
        </>}
        {Object.keys(f).filter(k => k !== "_body").map(mk => (
          <path key={mk} d={f[mk]} fill={C.green} stroke={sepCol} strokeWidth={0.5} strokeLinejoin="round"/>
        ))}
      </svg>
    );
  };

  return (
    <div className="seshd-enter" style={{ marginBottom:22 }}>
      <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:4 }}>Body map</div>
      <div style={{ fontSize:11, color:C.muted, marginBottom:10, lineHeight:1.4 }}>Which figure we draw on your muscle map. It doesn't change your strength standards.</div>
      <div style={{ display:"flex", gap:8 }}>
        {[["male","Male"],["female","Female"]].map(([v,label]) => {
          const sel = value === v;
          return (
            <button key={v} onClick={() => onPick(sel ? null : v)} aria-pressed={sel}
              data-body-map-option={v}
              // "Male" alone, read out two rows under an identical pair, is ambiguous — the sex
              // row above says the same two words. The days row sets a label for the same reason.
              aria-label={`${label} body map`} style={{
              flex:1, padding:"12px 8px 10px", borderRadius:14, cursor:"pointer", fontFamily:F,
              display:"flex", flexDirection:"column", alignItems:"center", gap:8,
              // accentInk, not accent: the ring is the ONLY signal of selection here (the tile
              // background deliberately does not flip), and on the light theme C.accent as a thin
              // line on a near-white card measures ~3.1:1 — a hairline pass, which this repo has
              // already been bitten by. accentInk is 7:1 there and is simply accent on dark.
              background: C.surface, border:`2px solid ${sel ? C.accentInk : C.border}`,
              color: sel ? C.accentInk : C.text, fontSize:13, fontWeight:sel ? 700 : 600,
              transition:"all 0.15s cubic-bezier(0.22, 1, 0.36, 1)",
            }}>
              <Fig sex={v}/>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
