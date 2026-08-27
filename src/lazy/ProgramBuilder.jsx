// Lazy-loaded: the "Build Your Own" custom program flow, opened only when a user explicitly
// chooses to build a program from scratch rather than starting a template — most sessions
// never touch it, so it was dead weight in the eager bundle for everyone else.
import { useState } from "react";
import { progSetCount } from "../engine/workout.js";
import { getExEntry } from "../engine/exercises.js";
import { uid } from "../engine/core.js";
import { F, MONO, toast, haptic, MuscleIcon, NoteField, ExercisePickerSheet } from "../App.jsx";

export default function ProgramBuilder({ C, onCancel, onSave }) {
  const [name, setName] = useState("");
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [days, setDays] = useState([{ id: uid(), name: "Day 1", exercises: [] }]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);

  const REST_OPTIONS = [{s:90,label:"1.5m"},{s:120,label:"2m"},{s:180,label:"3m"},{s:300,label:"5m"}];

  function addDay() {
    const newDay = { id: uid(), name: `Day ${days.length + 1}`, exercises: [] };
    setDays(ds => [...ds, newDay]);
    setActiveDayIdx(days.length);
  }
  function removeDay(idx) {
    if (days.length <= 1) return;
    setDays(ds => ds.filter((_, i) => i !== idx));
    setActiveDayIdx(i => Math.min(i, days.length - 2));
  }
  function updateDayName(idx, newName) {
    setDays(ds => ds.map((d, i) => i === idx ? { ...d, name: newName } : d));
  }
  function addExercise(exName) {
    if (!exName) return;
    setDays(ds => ds.map((d, i) => i !== activeDayIdx ? d : {
      ...d,
      exercises: [...d.exercises, { name: exName, sets: 3, reps: "8–12", rest: 90, note: "" }]
    }));
  }
  function updateEx(exIdx, patch) {
    setDays(ds => ds.map((d, i) => i !== activeDayIdx ? d : {
      ...d,
      exercises: d.exercises.map((ex, j) => j !== exIdx ? ex : { ...ex, ...patch })
    }));
  }
  function removeEx(exIdx) {
    setDays(ds => ds.map((d, i) => i !== activeDayIdx ? d : {
      ...d,
      exercises: d.exercises.filter((_, j) => j !== exIdx)
    }));
  }
  function save() {
    if (!name.trim()) { toast("Give your program a name", "error"); return; }
    const validDays = days.filter(d => d.exercises.length > 0);
    if (!validDays.length) { toast("Add at least one exercise", "error"); return; }
    onSave({ id: uid(), name: name.trim(), days: validDays.map(d => ({ ...d, id: uid() })) });
  }

  const activeDay = days[activeDayIdx] || days[0];
  function moveDay(dir) {
    const ni = activeDayIdx + dir;
    if (ni < 0 || ni >= days.length) return;
    setDays(ds => { const next = [...ds]; [next[activeDayIdx], next[ni]] = [next[ni], next[activeDayIdx]]; return next; });
    setActiveDayIdx(ni);
    haptic("tap");
  }
  const isDark = C.isDark ?? (C.bg === "#0a0a0c");
  const surface = C.surface;
  const border = C.border;
  const inputBg = isDark ? C.bg : "#fff";
  const labelClr = C.sub;
  const bodyClr = C.text;

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden", background:C.bg }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"calc(env(safe-area-inset-top) + 16px) 18px 14px", borderBottom:`1px solid ${border}`, flexShrink:0 }}>
        <button onClick={onCancel} style={{ fontSize:14, color:labelClr, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Cancel</button>
        <input
          value={name} onChange={e => setName(e.target.value)}
          placeholder="Program name..."
          style={{ flex:1, margin:"0 14px", background:"transparent", border:"none", fontSize:16, fontWeight:700, color:bodyClr, outline:"none", fontFamily:F, textAlign:"center" }}
        />
        <button onClick={save} style={{ fontSize:14, fontWeight:700, color:C.onPrimary, background:C.primary, border:"none", borderRadius:8, padding:"7px 16px", cursor:"pointer", fontFamily:F }}>Save</button>
      </div>

      {/* Day tabs */}
      <div data-no-tab-swipe style={{ display:"flex", gap:6, padding:"12px 18px", borderBottom:`1px solid ${border}`, overflowX:"auto", flexShrink:0, touchAction:"pan-x" }}>
        {days.map((d, i) => (
          <button key={d.id} onClick={() => setActiveDayIdx(i)} style={{
            padding:"7px 16px", borderRadius:20, border:"none", cursor:"pointer", fontFamily:F,
            fontSize:12, fontWeight:600, whiteSpace:"nowrap", flexShrink:0,
            background: activeDayIdx === i ? C.primary : (isDark ? C.divider : "#EEF2F7"),
            color: activeDayIdx === i ? C.onPrimary : labelClr,
          }}>{d.name}</button>
        ))}
        <button onClick={addDay} style={{
          padding:"7px 14px", borderRadius:20, border:`1.5px dashed ${isDark ? "#333" : "#CBD5E1"}`,
          background:"none", cursor:"pointer", fontFamily:F, fontSize:12, fontWeight:600,
          color:C.text, whiteSpace:"nowrap", flexShrink:0
        }}>+ Day</button>
      </div>

      {/* Active day */}
      <div style={{ flex:1, overflowY:"auto", padding:"12px 18px 100px" }}>
        {/* Day name edit */}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
          {days.length > 1 && (
            <div style={{ display:"flex", gap:2 }}>
              <button onClick={() => moveDay(-1)} disabled={activeDayIdx === 0} aria-label="Move day left" style={{ background:inputBg, border:`1px solid ${border}`, borderRadius:8, padding:"10px 11px", color: activeDayIdx === 0 ? C.muted : bodyClr, fontSize:13, cursor: activeDayIdx === 0 ? "default" : "pointer", fontFamily:F, opacity: activeDayIdx === 0 ? 0.4 : 1 }}>‹</button>
              <button onClick={() => moveDay(1)} disabled={activeDayIdx === days.length - 1} aria-label="Move day right" style={{ background:inputBg, border:`1px solid ${border}`, borderRadius:8, padding:"10px 11px", color: activeDayIdx === days.length - 1 ? C.muted : bodyClr, fontSize:13, cursor: activeDayIdx === days.length - 1 ? "default" : "pointer", fontFamily:F, opacity: activeDayIdx === days.length - 1 ? 0.4 : 1 }}>›</button>
            </div>
          )}
          <input
            value={activeDay.name} onChange={e => updateDayName(activeDayIdx, e.target.value)}
            style={{ flex:1, background:inputBg, border:`1px solid ${border}`, borderRadius:10, padding:"10px 14px", fontSize:14, fontWeight:600, color:bodyClr, outline:"none", fontFamily:F }}
          />
          {days.length > 1 && (
            <button onClick={() => removeDay(activeDayIdx)} style={{ background:"none", border:`1px solid ${isDark?"#333":"#FCA5A5"}`, borderRadius:8, padding:"10px 12px", color:"#EF4444", fontSize:12, cursor:"pointer", fontFamily:F, whiteSpace:"nowrap" }}>Remove Day</button>
          )}
        </div>

        {/* Exercise cards */}
        {activeDay.exercises.map((ex, ei) => {
          const exInfo = getExEntry(ex.name);
          return (
            <div key={ei} style={{ background:inputBg, border:`1px solid ${border}`, borderRadius:16, padding:"14px", marginBottom:12, boxShadow: isDark ? "none" : "0 1px 2px rgba(24,22,16,0.04), 0 6px 18px rgba(24,22,16,0.07)" }}>
              {/* Exercise name row */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                <div style={{ width:36, height:36, borderRadius:10, background: isDark ? "#252525" : "#EEF2F7", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <MuscleIcon muscle={exInfo?.muscle||""} size={22} name={ex.name} C={C}/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:bodyClr }}>{ex.name}</div>
                  {exInfo?.muscle && <div style={{ fontSize:11, color:labelClr, marginTop:1 }}>{exInfo.muscle}</div>}
                </div>
                <button onClick={() => removeEx(ei)} aria-label="Remove exercise" style={{ background:"none", border:"none", color:"#EF4444", fontSize:20, cursor:"pointer", padding:"0 4px", lineHeight:1 }}>×</button>
              </div>

              {/* Sets / Reps / Rest row */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:600, color:labelClr, letterSpacing:0.5, marginBottom:4 }}>SETS</div>
                  <div style={{ display:"flex", alignItems:"center", gap:4, background: isDark?"#111":"#F1F5F9", borderRadius:8, padding:"6px 10px" }}>
                    <button onClick={() => updateEx(ei,{sets:Math.max(1,progSetCount(ex)-1)})} style={{ background:"none", border:"none", color:C.text, fontSize:18, cursor:"pointer", lineHeight:1, padding:0, fontWeight:700 }}>−</button>
                    <span style={{ flex:1, textAlign:"center", fontSize:16, fontWeight:700, color:bodyClr, fontFamily:MONO }}>{progSetCount(ex)}</span>
                    <button onClick={() => updateEx(ei,{sets:progSetCount(ex)+1})} style={{ background:"none", border:"none", color:C.text, fontSize:18, cursor:"pointer", lineHeight:1, padding:0, fontWeight:700 }}>+</button>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:10, fontWeight:600, color:labelClr, letterSpacing:0.5, marginBottom:4 }}>REPS</div>
                  <input value={ex.reps||""} onChange={e => updateEx(ei,{reps:e.target.value})} placeholder="8–12"
                    style={{ width:"100%", background: isDark?"#111":"#F1F5F9", border:"none", borderRadius:8, padding:"8px 10px", fontSize:13, fontWeight:600, color:bodyClr, outline:"none", fontFamily:F, boxSizing:"border-box", textAlign:"center" }}/>
                </div>
                <div>
                  <div style={{ fontSize:10, fontWeight:600, color:labelClr, letterSpacing:0.5, marginBottom:4 }}>REST</div>
                  <select value={ex.rest||90} onChange={e => updateEx(ei,{rest:parseInt(e.target.value)})}
                    style={{ width:"100%", background: isDark?"#111":"#F1F5F9", border:"none", borderRadius:8, padding:"8px 6px", fontSize:12, fontWeight:600, color:bodyClr, outline:"none", fontFamily:F, cursor:"pointer" }}>
                    {REST_OPTIONS.map(o => <option key={o.s} value={o.s}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Note */}
              <NoteField value={ex.note||""} onChange={e => updateEx(ei,{note:e.target.value})} placeholder="Add a note (optional)..."
                style={{ width:"100%", background:"transparent", border:"none", borderTop:`1px solid ${border}`, padding:"8px 0 0", fontSize:12, color:labelClr, outline:"none", fontFamily:F }}/>
            </div>
          );
        })}

        {/* Add exercise */}
        <button onClick={() => setShowExercisePicker(true)} style={{
          width:"100%", background:inputBg, border:`1.5px dashed ${isDark?C.accent+"55":"#BFDBFE"}`,
          borderRadius:16, padding:"14px", cursor:"pointer", fontFamily:F,
          fontSize:14, fontWeight:700, color:C.accent, textAlign:"center",
        }}>+ Add Exercise</button>
        <ExercisePickerSheet open={showExercisePicker} onClose={() => setShowExercisePicker(false)}
          onSelect={v => addExercise(v)} C={C}/>
      </div>
    </div>
  );
}
