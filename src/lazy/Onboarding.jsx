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
import { Icon, SeshdLogo, Avatar, PROGRAM_TEMPLATES, recommendTemplateId, F } from "../App.jsx";

export default function Onboarding({ C, onComplete, suggestedUsers = [] }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ goal: null, experience: null, daysPerWeek: null });
  const [followIds, setFollowIds] = useState(() => new Set());

  // Intro screens followed by quick personalization questions.
  const introScreens = [
    { icon:"barbell", title:"Track every rep", body:"Swipe to log sets in seconds. Seshd remembers your last weights and suggests what to lift next." },
    { icon:"activity", title:"Know your body", body:"See which muscles you've trained, how recovered you are, and how your lifts measure up to real strength standards." },
    { icon:"spark", title:"Coached weekly", body:"A weekly review reads your training and tells you exactly what to work on — plus streaks and friends to keep you consistent." },
  ];
  const questions = [
    { key:"goal", q:"What's your main goal?", opts:[
      { v:"strength", label:"Get stronger" },
      { v:"muscle", label:"Build muscle" },
      { v:"lean", label:"Get lean" },
      { v:"general", label:"Stay healthy" },
    ]},
    { key:"experience", q:"How long have you been lifting?", opts:[
      { v:"new", label:"Just starting" },
      { v:"some", label:"Less than a year" },
      { v:"experienced", label:"1–3 years" },
      { v:"advanced", label:"3+ years" },
    ]},
    { key:"daysPerWeek", q:"How many days a week can you train?", opts:[
      { v:2, label:"2 days" },
      { v:3, label:"3 days" },
      { v:4, label:"4 days" },
      { v:5, label:"5+ days" },
    ]},
    { key:"profile", q:"A bit about you", profile:true },
  ];
  // step layout: [intro screens][questions][follow suggestions][closing]
  const hasFollowStep = suggestedUsers.length > 0;
  const totalSteps = introScreens.length + questions.length + (hasFollowStep ? 1 : 0) + 1;
  const closingStep = totalSteps - 1;
  const followStep = hasFollowStep ? closingStep - 1 : -1;
  const inIntro = step < introScreens.length;
  const qIndex = step - introScreens.length;
  const inQuestions = qIndex >= 0 && qIndex < questions.length;
  const inFollowStep = step === followStep;
  const inClosing = step === closingStep;

  function next() {
    if (step < totalSteps - 1) setStep(step + 1);
    else onComplete(answers, Array.from(followIds));
  }
  function back() { if (step > 0) setStep(step - 1); }
  function pick(key, v) {
    setAnswers(a => ({ ...a, [key]: v }));
    // Auto-advance shortly after a tap for a snappy feel (into the next question or the closing screen)
    setTimeout(() => setStep(s => Math.min(s + 1, closingStep)), 220);
  }
  function toggleFollowSuggestion(id) {
    setFollowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const s = inIntro ? introScreens[step] : null;
  const question = inQuestions ? questions[qIndex] : null;

  // Personalized closing copy from their answers
  const goalLabel = { strength:"getting stronger", muscle:"building muscle", lean:"getting lean", general:"staying healthy" }[answers.goal] || "your goals";
  const dpw = answers.daysPerWeek || 3;
  const recProgram = PROGRAM_TEMPLATES.find(t => t.id === recommendTemplateId(answers));

  return (
    <div style={{ position:"fixed", inset:0, background:C.bg, zIndex:600, display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto", fontFamily:F }}>
      {/* Back button — available after the first screen */}
      {step > 0 && !inClosing && (
        <button onClick={back} aria-label="Back" style={{ position:"absolute", top:"calc(env(safe-area-inset-top) + 16px)", left:18, background:"none", border:"none", fontSize:24, color:C.sub, cursor:"pointer", fontFamily:F, zIndex:2, padding:12 }}>‹</button>
      )}
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 32px", textAlign:"center" }}>
        <div style={{ marginBottom:48 }}>
          <SeshdLogo C={C} big/>
        </div>
        {inIntro ? (
          <>
            <div key={step} className="seshd-enter" style={{
              width:88, height:88, borderRadius:24, background:C.text, color:C.bg,
              display:"flex", alignItems:"center", justifyContent:"center", marginBottom:28
            }}>
              <Icon name={s.icon} size={40} color={C.bg} strokeWidth={1.7}/>
            </div>
            <div className="seshd-enter" style={{ fontSize:30, fontWeight:800, color:C.text, marginBottom:12, letterSpacing:-0.8, lineHeight:1.1 }}>{s.title}</div>
            <div className="seshd-enter" style={{ fontSize:15, color:C.sub, lineHeight:1.5, maxWidth:300 }}>{s.body}</div>
          </>
        ) : inClosing ? (
          <div key="closing" className="seshd-enter" style={{ width:"100%", maxWidth:340 }}>
            <div style={{ width:88, height:88, borderRadius:24, background:C.primary, color:C.onPrimary, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:28, marginLeft:"auto", marginRight:"auto" }}>
              <Icon name="check" size={42} color="#fff" strokeWidth={2}/>
            </div>
            <div style={{ fontSize:28, fontWeight:800, color:C.text, marginBottom:12, letterSpacing:-0.6, lineHeight:1.15 }}>You're all set</div>
            <div style={{ fontSize:15, color:C.sub, lineHeight:1.5, marginBottom:8 }}>
              We'll tailor things around {goalLabel}, {dpw} days a week.{recProgram ? <> We've set you up with a <strong style={{ color:C.text, fontWeight:700 }}>{recProgram.name}</strong> program to start — tweak it anytime.</> : ""} Your progress builds from here.
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
        ) : (inQuestions && question.profile) ? (
          <div key="profile" className="seshd-enter" style={{ width:"100%", maxWidth:340 }}>
            <div style={{ fontSize:24, fontWeight:800, color:C.text, marginBottom:8, letterSpacing:-0.5, lineHeight:1.2 }}>{question.q}</div>
            <div style={{ fontSize:14, color:C.sub, marginBottom:24, lineHeight:1.4 }}>This tailors your strength standards and recovery estimates. You can change it later.</div>
            <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:10 }}>Biological sex</div>
            <div style={{ display:"flex", gap:10, marginBottom:24 }}>
              {[["male","Male"],["female","Female"]].map(([v,label]) => {
                const sel = answers.sex === v;
                return (
                  <button key={v} onClick={() => setAnswers(a => ({ ...a, sex: v }))} style={{
                    flex:1, padding:"16px", borderRadius:14, cursor:"pointer", fontFamily:F,
                    background: sel ? C.primary : C.surface, border:`1.5px solid ${sel ? C.accent : C.border}`,
                    color: sel ? C.onPrimary : C.text, fontSize:15, fontWeight:600,
                  }}>{label}</button>
                );
              })}
            </div>
            <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:10 }}>Age <span style={{ color:C.muted, fontWeight:500 }}>(optional)</span></div>
            <input type="text" inputMode="numeric" autoComplete="off" autoCorrect="off" spellCheck={false} data-1p-ignore data-lpignore="true" placeholder="e.g. 28" min="14" max="99"
              value={answers.age || ""}
              onChange={e => { const a = parseInt(e.target.value); setAnswers(p => ({ ...p, age: (a > 0 && a < 100) ? a : null })); }}
              style={{ width:"100%", padding:"15px 16px", borderRadius:14, border:`1.5px solid ${C.border}`, background:C.surface, color:C.text, fontSize:15, fontWeight:600, fontFamily:F, outline:"none", boxSizing:"border-box" }}/>
          </div>
        ) : (
          <div key={step} className="seshd-enter" style={{ width:"100%", maxWidth:340 }}>
            <div style={{ fontSize:24, fontWeight:800, color:C.text, marginBottom:24, letterSpacing:-0.5, lineHeight:1.2 }}>{question.q}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {question.opts.map(opt => {
                const selected = answers[question.key] === opt.v;
                return (
                  <button key={String(opt.v)} onClick={() => pick(question.key, opt.v)} style={{
                    width:"100%", padding:"16px 18px", borderRadius:14, cursor:"pointer", fontFamily:F,
                    background: selected ? C.primary : C.surface,
                    border:`1.5px solid ${selected ? C.accent : C.border}`,
                    color: selected ? C.onPrimary : C.text,
                    fontSize:15, fontWeight:600, textAlign:"left", transition:"all 0.15s cubic-bezier(0.22, 1, 0.36, 1)",
                  }}>{opt.label}</button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div style={{ padding:"0 32px 44px" }}>
        <div style={{ display:"flex", gap:6, justifyContent:"center", marginBottom:24 }}>
          {Array.from({ length: totalSteps }).map((_,i) => <div key={i} style={{ width:i===step?22:6, height:6, borderRadius:3, background:i===step?C.text:C.border, transition:"all 0.3s cubic-bezier(0.22, 1, 0.36, 1)" }}/>)}
        </div>
        {inIntro && (
          <button onClick={next} style={{
            width:"100%", background:C.text, color:C.bg, border:"none", borderRadius:14, padding:"16px",
            fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:F, letterSpacing:-0.2
          }}>
            Continue
          </button>
        )}
        {inQuestions && question.profile && (
          <button onClick={next} disabled={!answers.sex} style={{
            width:"100%", background: answers.sex ? C.text : C.surface, color: answers.sex ? C.bg : C.muted,
            border:"none", borderRadius:14, padding:"16px", fontSize:15, fontWeight:700,
            cursor: answers.sex ? "pointer" : "not-allowed", fontFamily:F, letterSpacing:-0.2
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
