// Lazy-loaded: the AI program-builder wizard is opened deliberately from a dedicated affordance,
// not part of any core flow, and carries a large embedded fallback-program library (five full
// programs' worth of exercises/reps, used only if the AI call fails) that was dead weight in the
// eager bundle for every session that never opens it.
import { useState, useEffect, useRef } from "react";
import { devWarn, uid } from "../engine/core.js";
import { Sheet, Icon, F, EASE_NAV, aiAuthHeaders, aiEndpoint } from "../App.jsx";

export default function AICoachModal({ open, C, onClose, onImport, store }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [freeText, setFreeText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  // Now always-mounted (Sheet owns the unmount timing for the exit animation), so the wizard's
  // own state no longer resets for free the way it did when the parent mounted/unmounted this on
  // every open/close. Reopening a stale in-progress or completed session would otherwise resume
  // exactly where you left off — fine for some flows, wrong for "answer 5 questions", which reads
  // as broken if step 4 shows up before step 1 ever did.
  // `generating` MUST be in this list. It only ever clears in generateProgram's finally, so a
  // wizard closed mid-request reopened straight onto "Building your program…" with no way back —
  // the reset cleared step/answers/result around it, leaving a spinner for a request whose answers
  // no longer existed. Bumping the epoch here is what makes that abandoned request harmless.
  const openEpochRef = useRef(0);
  useEffect(() => {
    if (open) {
      openEpochRef.current++;
      setStep(0); setAnswers({}); setResult(null); setFreeText(""); setGenError(null); setGenerating(false);
    }
  }, [open]);

  const questions = [
    {
      key:"goal", label:"What's your main goal?",
      options:[
        { id:"muscle", label:"Build Muscle", desc:"Hypertrophy focus, moderate reps" },
        { id:"strength", label:"Get Stronger", desc:"Heavy compounds, low reps" },
        { id:"fat_loss", label:"Lose Fat", desc:"Higher volume, circuits" },
        { id:"general", label:"General Fitness", desc:"Balanced, all-around" },
      ]
    },
    {
      key:"days", label:"How many days can you train per week?",
      options:[
        { id:"3", label:"3 Days", desc:"Full body or push/pull split" },
        { id:"4", label:"4 Days", desc:"Upper/lower or PPL+" },
        { id:"5", label:"5 Days", desc:"Classic bro split or PPL" },
        { id:"6", label:"6 Days", desc:"Full PPL double" },
      ]
    },
    {
      key:"level", label:"What's your experience level?",
      options:[
        { id:"beginner", label:"Beginner", desc:"Under 1 year lifting" },
        { id:"intermediate", label:"Intermediate", desc:"1–3 years" },
        { id:"advanced", label:"Advanced", desc:"3+ years, know your lifts" },
      ]
    },
    {
      key:"equipment", label:"What equipment do you have?",
      options:[
        { id:"full", label:"Full Gym", desc:"Barbells, cables, machines" },
        { id:"home", label:"Home Gym", desc:"Barbell + bench + rack" },
        { id:"dumbbells", label:"Dumbbells Only", desc:"Adjustable or fixed set" },
      ]
    },
    {
      key:"focus", label:"Any specific focus area?",
      options:[
        { id:"none", label:"No Preference", desc:"Balanced program" },
        { id:"upper", label:"Upper Body", desc:"More chest, back, arms" },
        { id:"legs", label:"Legs", desc:"Quad/glute/hamstring focus" },
        { id:"posterior", label:"Posterior Chain", desc:"Glutes, hamstrings, back" },
      ]
    },
  ];

  // Program library — used as a FALLBACK if the AI generation fails, so the user is never
  // left empty-handed (important given API availability can vary in production).
  function buildProgramFallback() {
    const { goal, days, level, equipment, focus } = answers;

    // Define programs for key combinations
    const PROGRAMS = {
      "muscle-6-advanced-full": {
        name:"6-Day PPL · Advanced", icon:"🔥",
        days:[
          { name:"Push A · Chest Heavy", exercises:[
            { name:"Barbell Bench Press", reps:"4×5–7", note:"Rest-pause last set" },
            { name:"Incline DB Press", reps:"3×8–10", note:"2 sec negative" },
            { name:"Cable Fly (Low-to-High)", reps:"3×12", note:"Drop set" },
            { name:"Seated DB Shoulder Press", reps:"3×10" },
            { name:"Lateral Raises (DB)", reps:"4×15–20" },
            { name:"Tricep Rope Pushdown", reps:"3×12–15" },
          ]},
          { name:"Pull A · Back Width", exercises:[
            { name:"Weighted Pull-Ups", reps:"4×6–8", note:"Dead hang" },
            { name:"Lat Pulldown (Wide)", reps:"3×10–12" },
            { name:"Seated Cable Row (Narrow)", reps:"3×10" },
            { name:"Face Pulls", reps:"3×15" },
            { name:"Barbell Curl", reps:"3×10" },
            { name:"Hammer Curl", reps:"3×12" },
          ]},
          { name:"Legs A · Quad", exercises:[
            { name:"Barbell Back Squat", reps:"4×5–8" },
            { name:"Leg Press", reps:"3×10–12" },
            { name:"Leg Extension", reps:"3×12–15", note:"Drop set" },
            { name:"Romanian Deadlift", reps:"3×10" },
            { name:"Lying Leg Curl", reps:"3×12" },
            { name:"Standing Calf Raise", reps:"4×15" },
          ]},
          { name:"Push B · Shoulders", exercises:[
            { name:"Overhead Press (Barbell)", reps:"4×5–7" },
            { name:"Arnold Press", reps:"3×10" },
            { name:"Lateral Raises (DB)", reps:"4×12–15" },
            { name:"Incline DB Press", reps:"3×10" },
            { name:"Skull Crushers (EZ Bar)", reps:"3×10" },
            { name:"Tricep Rope Pushdown", reps:"3×15" },
          ]},
          { name:"Pull B · Thickness", exercises:[
            { name:"Barbell Row", reps:"4×5–7" },
            { name:"T-Bar Row", reps:"3×8" },
            { name:"Single-Arm DB Row", reps:"3×10" },
            { name:"Rear Delt Fly (DB)", reps:"3×15" },
            { name:"EZ Bar Curl", reps:"3×10" },
            { name:"Cable Curl", reps:"3×12" },
          ]},
          { name:"Legs B · Posterior", exercises:[
            { name:"Deadlift", reps:"4×4–6" },
            { name:"Romanian Deadlift", reps:"3×8" },
            { name:"Bulgarian Split Squat", reps:"3×10" },
            { name:"Hip Thrust", reps:"3×10" },
            { name:"Seated Leg Curl", reps:"3×12" },
            { name:"Seated Calf Raise", reps:"3×15" },
          ]},
        ]
      },
      "muscle-4-intermediate-full": {
        name:"Upper/Lower Hypertrophy · 4 Day", icon:"💪",
        days:[
          { name:"Upper A · Push Focus", exercises:[
            { name:"Barbell Bench Press", reps:"4×8–10" },
            { name:"Overhead Press (Barbell)", reps:"3×10" },
            { name:"Incline DB Press", reps:"3×10–12" },
            { name:"Lateral Raises (DB)", reps:"3×15" },
            { name:"Tricep Rope Pushdown", reps:"3×12" },
          ]},
          { name:"Lower A · Quad Focus", exercises:[
            { name:"Barbell Back Squat", reps:"4×8" },
            { name:"Leg Press", reps:"3×12" },
            { name:"Leg Extension", reps:"3×15" },
            { name:"Romanian Deadlift", reps:"3×10" },
            { name:"Standing Calf Raise", reps:"4×15" },
          ]},
          { name:"Upper B · Pull Focus", exercises:[
            { name:"Barbell Row", reps:"4×8" },
            { name:"Pull-Ups", reps:"3×8–10" },
            { name:"Seated Cable Row (Narrow)", reps:"3×12" },
            { name:"Face Pulls", reps:"3×15" },
            { name:"Barbell Curl", reps:"3×10" },
            { name:"Hammer Curl", reps:"3×12" },
          ]},
          { name:"Lower B · Posterior", exercises:[
            { name:"Deadlift", reps:"4×5" },
            { name:"Bulgarian Split Squat", reps:"3×10" },
            { name:"Hip Thrust", reps:"3×12" },
            { name:"Lying Leg Curl", reps:"3×12" },
            { name:"Seated Calf Raise", reps:"3×15" },
          ]},
        ]
      },
      "strength-3-intermediate-full": {
        name:"3-Day Powerbuilding", icon:"🏋️",
        days:[
          { name:"Day A · Squat + Push", exercises:[
            { name:"Barbell Back Squat", reps:"5×5", note:"Work up to heavy 5" },
            { name:"Barbell Bench Press", reps:"4×5" },
            { name:"Overhead Press (Barbell)", reps:"3×8" },
            { name:"Lateral Raises (DB)", reps:"3×15" },
            { name:"Tricep Rope Pushdown", reps:"3×12" },
          ]},
          { name:"Day B · Deadlift + Pull", exercises:[
            { name:"Deadlift", reps:"3×3", note:"Heavy triples" },
            { name:"Barbell Row", reps:"4×5" },
            { name:"Pull-Ups", reps:"3×8" },
            { name:"Barbell Curl", reps:"3×10" },
          ]},
          { name:"Day C · Volume", exercises:[
            { name:"Barbell Back Squat", reps:"3×8", note:"Lighter, more volume" },
            { name:"Barbell Bench Press", reps:"3×8" },
            { name:"Barbell Row", reps:"3×8" },
            { name:"Overhead Press (Barbell)", reps:"3×8" },
            { name:"Romanian Deadlift", reps:"3×10" },
          ]},
        ]
      },
      "general-3-beginner-full": {
        name:"Beginner Full Body · 3 Day", icon:"🌱",
        days:[
          { name:"Full Body A", exercises:[
            { name:"Barbell Back Squat", reps:"3×8" },
            { name:"Barbell Bench Press", reps:"3×8" },
            { name:"Barbell Row", reps:"3×8" },
            { name:"Overhead Press (Barbell)", reps:"3×10" },
            { name:"Standing Calf Raise", reps:"3×15" },
          ]},
          { name:"Full Body B", exercises:[
            { name:"Deadlift", reps:"3×5" },
            { name:"Incline DB Press", reps:"3×10" },
            { name:"Pull-Ups", reps:"3×6–8" },
            { name:"Lateral Raises (DB)", reps:"3×12" },
            { name:"Barbell Curl", reps:"3×10" },
          ]},
          { name:"Full Body C", exercises:[
            { name:"Leg Press", reps:"3×10" },
            { name:"Barbell Bench Press", reps:"3×10" },
            { name:"Seated Cable Row (Narrow)", reps:"3×10" },
            { name:"Overhead Press (Barbell)", reps:"3×10" },
            { name:"Romanian Deadlift", reps:"3×10" },
          ]},
        ]
      },
      "fat_loss-4-intermediate-full": {
        name:"Fat Loss · 4 Day Circuit", icon:"🔥",
        days:[
          { name:"Upper Circuit A", exercises:[
            { name:"Barbell Bench Press", reps:"4×12" },
            { name:"Barbell Row", reps:"4×12" },
            { name:"Overhead Press (Barbell)", reps:"3×12" },
            { name:"Pull-Ups", reps:"3×10" },
            { name:"Lateral Raises (DB)", reps:"3×15" },
            { name:"Tricep Rope Pushdown", reps:"3×15" },
            { name:"Barbell Curl", reps:"3×15" },
          ]},
          { name:"Lower Circuit A", exercises:[
            { name:"Barbell Back Squat", reps:"4×12" },
            { name:"Romanian Deadlift", reps:"3×12" },
            { name:"Leg Press", reps:"3×15" },
            { name:"Lying Leg Curl", reps:"3×15" },
            { name:"Standing Calf Raise", reps:"4×20" },
          ]},
          { name:"Upper Circuit B", exercises:[
            { name:"Incline DB Press", reps:"4×12" },
            { name:"Single-Arm DB Row", reps:"4×12" },
            { name:"Lateral Raises (DB)", reps:"4×15" },
            { name:"Face Pulls", reps:"3×15" },
            { name:"Hammer Curl", reps:"3×15" },
            { name:"Skull Crushers (EZ Bar)", reps:"3×12" },
          ]},
          { name:"Lower Circuit B", exercises:[
            { name:"Deadlift", reps:"4×8" },
            { name:"Bulgarian Split Squat", reps:"3×12" },
            { name:"Hip Thrust", reps:"3×15" },
            { name:"Leg Extension", reps:"3×15" },
            { name:"Seated Calf Raise", reps:"4×20" },
          ]},
        ]
      },
    };

    // Build lookup key, fallback gracefully
    const key = `${goal}-${days}-${level}-${equipment}`;
    let selected = PROGRAMS[key];

    // Fallback chain
    if (!selected) {
      // Try without level
      const keyNoLevel = `${goal}-${days}-intermediate-${equipment}`;
      selected = PROGRAMS[keyNoLevel];
    }
    if (!selected) {
      // Fallback to general
      selected = PROGRAMS["general-3-beginner-full"];
    }

    // Convert to program format
    return {
      id: uid(),
      name: selected.name,
      days: selected.days.map(d => ({
        ...d, id: uid(),
        exercises: d.exercises.map(ex =>
          typeof ex === "string"
            ? { name:ex, reps:"8–12", note:"" }
            : { name:ex.name, reps:ex.reps||"8–12", note:ex.note||"" }
        )
      }))
    };
  }

  // AI program builder — sends the structured answers + the user's free-text description to
  // Claude and asks for a custom program in the exact shape the app consumes. Falls back to the
  // table version on any failure (bad/empty/non-JSON response, network/API error in production).
  async function buildProgramAI() {
    const { goal, days, level, equipment, focus } = answers;
    const sys = "You are an expert strength coach building a workout program inside the Seshd app. " +
      "Return ONLY valid JSON (no markdown, no prose) in EXACTLY this shape: " +
      '{"name":"string","days":[{"name":"string","exercises":[{"name":"string","reps":"string like 4×8–10","note":"optional short cue"}]}]}. ' +
      "Rules: the number of days must match the requested training days. Use real, common exercise " +
      "names. reps format like '3×10' or '4×8–10'. Keep notes short or empty — plain technique cues " +
      "a lifter would actually say, no hype. Program and day names should be plain and descriptive " +
      "(e.g. 'Upper/Lower 4-Day', 'Push A') — no marketing-speak like 'Ultimate' or 'Shred'. " +
      "Respect the user's equipment and experience. 4-7 exercises per day. No commentary outside the JSON.";
    const profile = {
      goal, daysPerWeek: days, experience: level, equipment, focusArea: focus,
      description: freeText || "(none provided)",
      unit: store?.unit || "lbs",
    };
    const hdrs = aiAuthHeaders();
    if (!hdrs) throw new Error("auth_required"); // guest → caller falls back to the table program
    const res = await fetch(aiEndpoint(), {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: sys,
        messages: [{ role: "user", content: "Build a program for this lifter:\n" + JSON.stringify(profile) }],
      }),
    });
    if (!res.ok) throw new Error("api_" + res.status);
    const data = await res.json();
    let text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
    text = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text); // throws on bad JSON → caught by caller → fallback
    if (!parsed || !Array.isArray(parsed.days) || !parsed.days.length) throw new Error("bad_shape");
    // Normalize into the app's program format (same as the fallback output).
    return {
      id: uid(),
      name: parsed.name || "Custom Program",
      days: parsed.days.map(d => ({
        id: uid(),
        name: d.name || "Day",
        exercises: (d.exercises || []).map(ex => ({
          name: typeof ex === "string" ? ex : (ex.name || "Exercise"),
          reps: (ex && ex.reps) ? ex.reps : "8–12",
          note: (ex && ex.note) ? ex.note : "",
        })),
      })),
    };
  }

  // Generate: try AI first, fall back to the table version so the user always gets a program.
  //
  // The epoch guard exists because this component NO LONGER UNMOUNTS between opens. Closing
  // mid-generation used to destroy the component and take the pending request's setState calls
  // with it; now the request keeps running and would land on a wizard that has since been reset,
  // producing a "Your program is ready" screen built from answers the user already abandoned —
  // and Import & Set Active would write that program for real. Every open bumps the epoch, so a
  // response from a previous session is dropped instead of applied.
  async function generateProgram() {
    const epoch = openEpochRef.current;
    setGenerating(true);
    setGenError(null);
    try {
      const ai = await buildProgramAI();
      if (openEpochRef.current !== epoch) return;
      setResult(ai);
    } catch (e) {
      devWarn("AI program gen failed, using fallback:", e);
      if (openEpochRef.current !== epoch) return;
      setGenError("ai_unavailable");
      setResult(buildProgramFallback());
    } finally {
      if (openEpochRef.current === epoch) setGenerating(false);
    }
  }

  const q = questions[step];

  return (
    // BACKDROP IS DELIBERATELY INERT. The pre-<Sheet> markup was a bare `<div>` with no onClick,
    // so tapping the dim strip above the panel did nothing — and that matters more here than on
    // any other sheet, because this is a five-question wizard whose answers are wiped by the
    // reset-on-open effect below. Wiring Sheet's onClose to the backdrop turned one stray thumb
    // at 4-of-5 questions into "start over", which is exactly the kind of silent data loss the
    // old markup avoided. Cancel / ‹ Back still close it via the component's own onClose prop.
    <Sheet open={!!open} onClose={() => {}} z={250}
      panelStyle={{ background:C.bg, borderRadius:"16px 16px 0 0", maxHeight:"85dvh", display:"flex", flexDirection:"column", borderTop:`1px solid ${C.border}` }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.divider}` }}>
          {/* THE HEADER CONTROL MUST MATCH THE SCREEN THAT IS ACTUALLY SHOWING. The render below
              is `result ? … : generating ? … : step >= questions.length ? … : question`, so on the
              result and generating screens NOTHING reads `step`. The old handler decremented it
              anyway, which changed nothing visible: five dead taps to walk step 5 down to 0, a
              sixth to close. That was survivable while the backdrop still dismissed the sheet, and
              became a trap the moment the backdrop was made inert to protect the answers.
              From the result, step back to the questions so a single answer can be changed —
              previously the only way was to cancel and redo all five. */}
          <button onClick={() => {
            if (result) { setResult(null); setGenError(null); return; }
            if (generating) { onClose(); return; }   // abandon; the epoch guard drops the response
            if (step > 0) { setStep(s => s - 1); return; }
            onClose();
          }} style={{ fontSize:14, color:C.text, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>
            {(result || step > 0) && !generating ? "‹ Back" : "Cancel"}
          </button>
          <div style={{ fontSize:12, color:C.sub }}>{result ? "Review" : generating ? "" : `Step ${step + 1} of ${questions.length + 1}`}</div>
          <div style={{ width:60 }}/>
        </div>

        {result ? (
          // Show result
          <div style={{ overflowY:"auto", flex:1, padding:20 }}>
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <div style={{ marginBottom:10, display:"flex", justifyContent:"center" }}><Icon name="check" size={36} color={C.accent}/></div>
              <div style={{ fontSize:18, fontWeight:700, color:C.text }}>Your program is ready</div>
              <div style={{ fontSize:13, color:C.sub, marginTop:4 }}>{result.name}</div>
              {genError === "ai_unavailable" && (
                <div style={{ fontSize:11, color:C.sub, marginTop:8, padding:"8px 12px", background:C.divider, borderRadius:8, lineHeight:1.4 }}>
                  AI was unavailable, so we built you a solid template-based program matching your answers.
                </div>
              )}
            </div>
            {result.days.map((d, i) => (
              <div key={i} style={{ padding:"10px 14px", background:C.divider, borderRadius:10, marginBottom:8 }}>
                <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{d.name}</div>
                <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>{d.exercises.length} exercises</div>
              </div>
            ))}
            <button onClick={() => onImport(result)} style={{
              width:"100%", background:C.primary,
              color:C.onPrimary, border:"none", borderRadius:12, padding:"14px",
              fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:F, marginTop:12
            }}>Import & Set Active</button>
          </div>
        ) : generating ? (
          // Generating state
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40, gap:14 }}>
            <div style={{ fontSize:15, fontWeight:700, color:C.text }}>Building your program…</div>
            <div style={{ fontSize:12, color:C.sub, textAlign:"center", maxWidth:240, lineHeight:1.5 }}>Designing a plan around your goals, equipment, and notes.</div>
          </div>
        ) : step >= questions.length ? (
          // Free-text step — describe needs in your own words, then generate
          <div style={{ overflowY:"auto", flex:1, padding:20 }}>
            <div style={{ background:C.divider, borderRadius:4, height:4, marginBottom:20, overflow:"hidden" }}>
              <div style={{ width:"100%", height:"100%", background:C.accent }}/>
            </div>
            <div style={{ fontSize:17, fontWeight:700, color:C.text, marginBottom:6 }}>Anything else? (optional)</div>
            <div style={{ fontSize:13, color:C.sub, marginBottom:14, lineHeight:1.5 }}>
              Tell the AI anything specific — injuries to work around, exercises you love or hate, a weak point to bring up, time limits per session. The more you say, the more tailored your program.
            </div>
            <textarea
              value={freeText}
              onChange={e => setFreeText(e.target.value)}
              placeholder="e.g. Bad left shoulder so no flat barbell bench. Want bigger arms and a stronger deadlift. 45 min sessions max."
              style={{
                width:"100%", minHeight:110, resize:"vertical", borderRadius:12, padding:"12px 14px",
                background:C.surface, border:`1px solid ${C.border}`, color:C.text, fontSize:14,
                fontFamily:F, lineHeight:1.5, boxSizing:"border-box", marginBottom:16,
              }}
            />
            <button onClick={generateProgram} style={{
              width:"100%", background:C.primary,
              color:C.onPrimary, border:"none", borderRadius:12, padding:"14px",
              fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:F,
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            }}>Generate my program</button>
          </div>
        ) : (
          // Show question
          <div style={{ overflowY:"auto", flex:1, padding:20 }}>
            {/* Progress bar */}
            <div style={{ background:C.divider, borderRadius:4, height:4, marginBottom:20, overflow:"hidden" }}>
              {/* scaleX, not width — the fifth progress bar in the app, and the one the earlier
                  animate-transform pass missed. Animating width forces layout + paint every frame;
                  the parent already clips with overflow:hidden + a radius, so the rounded end still
                  reads correctly. Found by `npx impeccable detect`. */}
              <div style={{ width:"100%", height:"100%", background:C.accent, transformOrigin:"left center", transform:`scaleX(${Math.max(0, Math.min(1, (step) / (questions.length + 1)))})`, transition:`transform 0.3s ${EASE_NAV}`, willChange:"transform" }}/>
            </div>
            <div style={{ fontSize:17, fontWeight:700, color:C.text, marginBottom:16 }}>{q.label}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {q.options.map(opt => (
                <button key={opt.id} onClick={() => {
                  const newAnswers = { ...answers, [q.key]: opt.id };
                  setAnswers(newAnswers);
                  // Advance to the next question, or to the free-text step after the last one.
                  setStep(s => s + 1);
                }} style={{
                  background:answers[q.key] === opt.id ? C.accentSoft : C.divider,
                  border:`1.5px solid ${answers[q.key] === opt.id ? C.accent : "transparent"}`,
                  borderRadius:12, padding:"14px 16px", cursor:"pointer",
                  display:"flex", alignItems:"center", gap:12, textAlign:"left", fontFamily:F
                }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{opt.label}</div>
                    <div style={{ fontSize:12, color:C.sub, marginTop:2 }}>{opt.desc}</div>
                  </div>
                  {answers[q.key] === opt.id && <span style={{ color:C.accent, fontSize:18 }}>✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}
    </Sheet>
  );
}
