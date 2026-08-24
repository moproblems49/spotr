// Lazy-loaded: bodyweight, measurements, progress photos over time. Only rendered when
// ProfileScreen's showBody flag is set (its "Body" button) — most sessions never open it.
import { useState, useMemo } from "react";
import {
  F, MONO, Icon, ExerciseVolumeChart, toast, haptic, uid, dKey, posNum,
  loadSession, sb, devError,
} from "../App.jsx";

const MEASURE_FIELDS = [
  { key:"chest", label:"Chest" },
  { key:"waist", label:"Waist" },
  { key:"hips", label:"Hips" },
  { key:"arms", label:"Arms" },
  { key:"thighs", label:"Thighs" },
  { key:"calves", label:"Calves" },
  { key:"bodyFat", label:"Body Fat %" },
];

export default function BodyTrackingScreen({ store, setStore, currentUserId, unit, C, onClose }) {
  const log = useMemo(() => [...(store.bodyLog || [])].sort((a, b) => a.date.localeCompare(b.date)), [store.bodyLog]);
  const [adding, setAdding] = useState(false);
  const [metricSel, setMetricSel] = useState("weight"); // user's selection; may not have data yet
  // Draft entry
  const [draftWeight, setDraftWeight] = useState("");
  const [draftMeasures, setDraftMeasures] = useState({});
  const [draftPhoto, setDraftPhoto] = useState(null);
  const lenUnit = unit === "kg" ? "cm" : "in";

  const latest = log.length ? log[log.length - 1] : null;
  const first = log.length ? log[0] : null;

  // The selected metric may have no data yet (e.g. user logged only a measurement, leaving
  // the default "weight" empty). Fall back to the first metric that actually has data so the
  // chart never renders an empty/wrong-context state.
  const metricHasData = (k) => k === "weight" ? log.some(e => e.weight != null) : log.some(e => e.measurements?.[k] != null);
  const metric = metricHasData(metricSel) ? metricSel
    : (["weight", ...MEASURE_FIELDS.map(m => m.key)].find(metricHasData) || "weight");
  const setMetric = setMetricSel;

  // Chart data for the selected metric
  const chartData = log
    .map(e => {
      const d = new Date(e.date + "T12:00:00");
      const label = `${d.getMonth()+1}/${d.getDate()}`;
      const value = metric === "weight" ? e.weight : e.measurements?.[metric];
      return value != null && value !== "" ? { label, date: e.date, value: parseFloat(value) } : null;
    })
    .filter(Boolean);

  function saveEntry() {
    const hasWeight = draftWeight !== "";
    const hasMeasure = Object.values(draftMeasures).some(v => v !== "" && v != null);
    if (!hasWeight && !hasMeasure && !draftPhoto) { toast("Add a weight, measurement, or photo", "error"); return; }
    const cleanWeight = hasWeight ? posNum(draftWeight, 2000) : null;
    if (hasWeight && cleanWeight == null) { toast("Enter a valid weight", "error"); return; }
    const cleanMeasures = Object.fromEntries(
      Object.entries(draftMeasures)
        .map(([k, v]) => [k, posNum(v, 500)])
        .filter(([, v]) => v != null)
    );
    const entry = {
      id: uid(),
      date: dKey(),
      weight: cleanWeight,
      measurements: cleanMeasures,
      photoData: draftPhoto || null,
    };
    setStore(p => {
      // Replace any existing entry for today, else append
      const existing = (p.bodyLog || []).filter(e => e.date !== entry.date);
      const nextLog = [...existing, entry];
      // Persist to the server so it survives re-login / new devices. Strip photoData (large).
      const tok = (typeof loadSession === "function" && loadSession()?.access_token);
      if (tok && currentUserId) {
        sb.queueWrite(`profiles?id=eq.${currentUserId}`, { method:"PATCH", body: JSON.stringify({ body_log: nextLog.map(b => ({ ...b, photoData: null })) }) }, tok)
          .catch(e => devError("body_log save error:", e));
      }
      return { ...p, bodyLog: nextLog };
    });
    haptic("success");
    toast("Logged", "success");
    setAdding(false);
    setDraftWeight(""); setDraftMeasures({}); setDraftPhoto(null);
  }

  function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) { toast("Photo too large (max 6MB)", "error"); return; }
    const reader = new FileReader();
    reader.onload = () => setDraftPhoto(reader.result);
    reader.readAsDataURL(file);
  }

  // Photos with dates, newest first, for the progress strip
  const photos = log.filter(e => e.photoData).slice().reverse();
  const metricLabel = metric === "weight" ? `Weight (${unit})` : (MEASURE_FIELDS.find(m => m.key === metric)?.label || metric) + (metric === "bodyFat" ? "" : ` (${lenUnit})`);

  return (
    <div style={{ position:"fixed", inset:0, background:C.bg, zIndex:500, display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto", paddingTop:"env(safe-area-inset-top)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderBottom:`1px solid ${C.divider}`, flexShrink:0 }}>
        <button onClick={onClose} aria-label="Back" style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.text, padding:"11px 14px 11px 2px", fontFamily:F }}>‹</button>
        <div style={{ flex:1, fontSize:16, fontWeight:700, color:C.text }}>Body</div>
        {!adding && <button onClick={() => setAdding(true)} style={{ background:C.primary, color:C.onPrimary, border:"none", borderRadius:9, padding:"7px 14px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:F }}>+ Log</button>}
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"16px", overscrollBehavior:"contain" }}>
        {adding ? (
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:12 }}>New entry · {new Date().toLocaleDateString("en",{month:"short",day:"numeric"})}</div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.sub, letterSpacing:0.5, marginBottom:5 }}>BODYWEIGHT ({unit.toUpperCase()})</div>
              <input type="text" inputMode="decimal" autoComplete="off" autoCorrect="off" spellCheck={false} data-1p-ignore data-lpignore="true" value={draftWeight} onChange={e => setDraftWeight(e.target.value)} placeholder={latest?.weight ? String(latest.weight) : "0"}
                style={{ width:"100%", background:C.bg, border:`1.5px solid ${C.divider}`, borderRadius:10, padding:"10px 12px", fontSize:16, fontWeight:700, color:C.text, outline:"none", fontFamily:MONO, boxSizing:"border-box" }}/>
            </div>
            <div style={{ fontSize:11, fontWeight:700, color:C.sub, letterSpacing:0.5, marginBottom:8 }}>MEASUREMENTS ({lenUnit.toUpperCase()})</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
              {MEASURE_FIELDS.map(m => (
                <div key={m.key}>
                  <div style={{ fontSize:11, color:C.sub, marginBottom:3 }}>{m.label}</div>
                  <input type="text" inputMode="decimal" autoComplete="off" autoCorrect="off" spellCheck={false} data-1p-ignore data-lpignore="true" value={draftMeasures[m.key] || ""} onChange={e => setDraftMeasures(d => ({ ...d, [m.key]: e.target.value }))} placeholder={latest?.measurements?.[m.key] != null ? String(latest.measurements[m.key]) : "—"}
                    style={{ width:"100%", background:C.bg, border:`1.5px solid ${C.divider}`, borderRadius:9, padding:"8px 10px", fontSize:14, fontWeight:600, color:C.text, outline:"none", fontFamily:MONO, boxSizing:"border-box" }}/>
                </div>
              ))}
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.sub, letterSpacing:0.5, marginBottom:8 }}>PROGRESS PHOTO (private)</div>
              {draftPhoto ? (
                <div style={{ position:"relative", display:"inline-block" }}>
                  <img src={draftPhoto} alt="" style={{ width:90, height:120, objectFit:"cover", borderRadius:10 }}/>
                  <button onClick={() => setDraftPhoto(null)} aria-label="Remove photo" style={{ position:"absolute", top:4, right:4, background:"rgba(0,0,0,0.6)", color:"#fff", border:"none", borderRadius:"50%", width:22, height:22, cursor:"pointer", fontSize:12 }}>×</button>
                </div>
              ) : (
                <label style={{ display:"inline-flex", alignItems:"center", gap:7, background:C.bg, border:`1.5px dashed ${C.border}`, borderRadius:10, padding:"12px 16px", cursor:"pointer", color:C.sub, fontSize:13, fontWeight:600 }}>
                  <Icon name="plus" size={15} color="currentColor"/> Add photo
                  <input type="file" accept="image/*" onChange={onPhoto} style={{ display:"none" }}/>
                </label>
              )}
              <div style={{ fontSize:10, color:C.muted, marginTop:6 }}>Photos stay on your device — never shared or posted.</div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => { setAdding(false); setDraftWeight(""); setDraftMeasures({}); setDraftPhoto(null); }} style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, color:C.sub, borderRadius:10, padding:"11px", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:F }}>Cancel</button>
              <button onClick={saveEntry} style={{ flex:2, background:C.primary, color:C.onPrimary, border:"none", borderRadius:10, padding:"11px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:F }}>Save entry</button>
            </div>
          </div>
        ) : log.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 20px", color:C.sub }}>
            <div style={{ marginBottom:14, display:"flex", justifyContent:"center" }}><Icon name="trending-up" size={40} color="currentColor"/></div>
            <div style={{ fontSize:17, fontWeight:700, color:C.text, marginBottom:6 }}>Track your body</div>
            <div style={{ fontSize:13, lineHeight:1.5, marginBottom:20 }}>Log your weight, measurements, and progress photos to see how your body changes over time.</div>
            <button onClick={() => setAdding(true)} style={{ background:C.primary, color:C.onPrimary, border:"none", borderRadius:10, padding:"11px 22px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:F }}>Log your first entry</button>
          </div>
        ) : (
          <>
            {/* Summary: current + change since first */}
            <div style={{ display:"flex", gap:10, marginBottom:16 }}>
              <div className="seshd-float" style={{ flex:1, background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:14 }}>
                <div style={{ fontSize:11, color:C.sub, fontWeight:700, letterSpacing:0.5, marginBottom:4 }}>CURRENT</div>
                <div style={{ fontSize:26, fontWeight:800, color:C.text, fontFamily:MONO, letterSpacing:-1 }}>{latest?.weight != null ? latest.weight : "—"}<span style={{ fontSize:13, color:C.sub, marginLeft:3 }}>{unit}</span></div>
              </div>
              {first && latest && first.weight != null && latest.weight != null && first.id !== latest.id && (
                <div className="seshd-float" style={{ flex:1, background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:14 }}>
                  <div style={{ fontSize:11, color:C.sub, fontWeight:700, letterSpacing:0.5, marginBottom:4 }}>CHANGE</div>
                  {(() => {
                    const diff = Math.round((latest.weight - first.weight) * 10) / 10;
                    const up = diff > 0;
                    // Weight change stays neutral — the app is goal-agnostic (a decrease is good
                    // when cutting, an increase is good when bulking), so no red/green signal.
                    return <div style={{ fontSize:26, fontWeight:800, fontFamily:MONO, letterSpacing:-1, color:C.text }}>{up ? "+" : ""}{diff}<span style={{ fontSize:13, color:C.sub, marginLeft:3 }}>{unit}</span></div>;
                  })()}
                </div>
              )}
            </div>

            {/* Metric selector */}
            <div data-no-tab-swipe style={{ display:"flex", gap:6, overflowX:"auto", marginBottom:12, paddingBottom:4, touchAction:"pan-x" }}>
              {[{key:"weight",label:"Weight"}, ...MEASURE_FIELDS].map(m => {
                const has = m.key === "weight" ? log.some(e => e.weight != null) : log.some(e => e.measurements?.[m.key] != null);
                if (!has) return null;
                return (
                  <button key={m.key} onClick={() => setMetric(m.key)} style={{
                    flexShrink:0, padding:"6px 13px", borderRadius:20, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F,
                    background: metric === m.key ? C.primary : C.surface, color: metric === m.key ? C.onPrimary : C.sub,
                    border:`1px solid ${metric === m.key ? C.primary : C.border}`,
                  }}>{m.label}</button>
                );
              })}
            </div>

            {/* Chart */}
            <div className="seshd-float" style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:"16px 12px 8px", marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.sub, padding:"0 4px 8px" }}>{metricLabel}</div>
              <ExerciseVolumeChart data={chartData} unit={unit} C={C}/>
            </div>

            {/* Progress photos */}
            {photos.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.sub, letterSpacing:0.5, marginBottom:8 }}>PROGRESS PHOTOS</div>
                <div data-no-tab-swipe style={{ display:"flex", gap:8, overflowX:"auto", touchAction:"pan-x", paddingBottom:4 }}>
                  {photos.map(e => (
                    <div key={e.id} style={{ flexShrink:0 }}>
                      <img src={e.photoData} alt="" style={{ width:100, height:134, objectFit:"cover", borderRadius:10, display:"block" }}/>
                      <div style={{ fontSize:10, color:C.sub, textAlign:"center", marginTop:4 }}>{new Date(e.date + "T12:00:00").toLocaleDateString("en",{month:"short",day:"numeric"})}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Entry history */}
            <div style={{ fontSize:12, fontWeight:700, color:C.sub, letterSpacing:0.5, marginBottom:8 }}>HISTORY</div>
            {[...log].reverse().map(e => (
              <div key={e.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 14px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, marginBottom:6 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.text, display:"flex", alignItems:"center", gap:6 }}>
                    {new Date(e.date + "T12:00:00").toLocaleDateString("en",{weekday:"short",month:"short",day:"numeric"})}
                    {e.source === "health" && <span style={{ fontSize:10, fontWeight:700, letterSpacing:0.3, color:C.muted, border:`1px solid ${C.border}`, borderRadius:5, padding:"1px 5px" }}>Apple Health</span>}
                  </div>
                  <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>
                    {[e.weight != null ? `${e.weight} ${unit}` : null, ...Object.entries(e.measurements||{}).map(([k,v]) => `${MEASURE_FIELDS.find(m=>m.key===k)?.label||k} ${v}`)].filter(Boolean).join(" · ") || "Photo only"}
                  </div>
                </div>
                {e.photoData && <img src={e.photoData} alt="" style={{ width:36, height:48, objectFit:"cover", borderRadius:7 }}/>}
                <button onClick={() => { setStore(p => { const nextLog = (p.bodyLog||[]).filter(x => x.id !== e.id); const tok = (typeof loadSession === "function" && loadSession()?.access_token); if (tok && currentUserId) { sb.queueWrite(`profiles?id=eq.${currentUserId}`, { method:"PATCH", body: JSON.stringify({ body_log: nextLog.map(b=>({...b, photoData:null})) }) }, tok).catch(()=>{}); } // Remember a deleted date so the Apple-Health auto-sync doesn't resurrect it every 15 min.
                  const skip = Array.from(new Set([...(p.bodyLogHealthSkip || []), e.date])); return { ...p, bodyLog: nextLog, bodyLogHealthSkip: skip }; }); haptic("tap"); }} style={{ background:"none", border:"none", color:C.muted, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:F }}>Delete</button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
