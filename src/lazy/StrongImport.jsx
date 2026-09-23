import { useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  F, MONO, RADIUS, sb, toast, markSettingsEdit, EdgeSwipeBack, KB_SAFE_INSET,
  ExercisePickerSheet, SectionLabel,
} from "../App.jsx";
import { devError } from "../engine/core.js";
import { getMuscle } from "../engine/exercises.js";
import { parseStrongExport, resolveImportNames, strongToSessions } from "../engine/strongimport.js";

// ── IMPORT FROM STRONG ──────────────────────────────────────────────────────────────────────────
// The single biggest reason someone with years of Strong history will not switch: their PRs and
// charts ARE the value, and starting from zero throws them away. This screen turns a Strong CSV
// export into ordinary Seshd sessions.
//
// THE ONE RULE: NOTHING IS WRITTEN UNTIL EVERY EXERCISE HAS AN ANSWER. An exercise name Seshd
// cannot resolve still imports and still shows in History, while `getMuscle` returns nothing --
// so the muscle map, weekly volume, readiness and "most trained" silently get zero from it. That
// is the demo-corpus scar in CLAUDE.md at the scale of a whole training history. So an unmatched
// name must be pointed at a library exercise, a custom exercise, or explicitly skipped.
//
// Lazy-loaded: a person runs this once, ever.

const SKIP = "\u0000skip";
const BATCH = 50;

export default function StrongImport({ C, store, setStore, token, currentUserId, unit: defaultUnit, onBack, onDone }) {
  const fileRef = useRef(null);
  const [stage, setStage] = useState("pick"); // pick | review | importing | done
  const [err, setErr] = useState("");
  const [parsed, setParsed] = useState(null); // { workouts, skippedSets }
  const [auto, setAuto] = useState({});       // raw -> { name, how, exact }
  const [chosen, setChosen] = useState({});   // raw -> library name | SKIP (user answers + overrides)
  const [unit, setUnit] = useState(defaultUnit || "lbs");
  const [picking, setPicking] = useState(null); // raw name currently being mapped
  const [showMatched, setShowMatched] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });

  // Sets per raw exercise name, so the list can lead with what matters most.
  const setCounts = useMemo(() => {
    const m = {};
    (parsed?.workouts || []).forEach(w => w.exercises.forEach(e => { m[e.rawName] = (m[e.rawName] || 0) + e.sets.length; }));
    return m;
  }, [parsed]);
  const rawNames = useMemo(() => Object.keys(setCounts).sort((a, b) => setCounts[b] - setCounts[a]), [setCounts]);
  const answerFor = (raw) => chosen[raw] ?? auto[raw]?.name ?? null;
  const unanswered = rawNames.filter(r => !answerFor(r));
  const matchedAuto = rawNames.filter(r => auto[r] && chosen[r] === undefined);

  const range = useMemo(() => {
    const ds = (parsed?.workouts || []).map(w => w.date.slice(0, 10)).sort();
    return ds.length ? [ds[0], ds[ds.length - 1]] : null;
  }, [parsed]);
  const totalSets = rawNames.reduce((a, r) => a + setCounts[r], 0);
  // The button's count must be what will actually be WRITTEN. A workout made up only of skipped
  // exercises has nothing left to import -- measured on a real export, the label read 328 while
  // 327 landed. A label is a claim about a number.
  const importCount = (parsed?.workouts || []).filter(w => w.exercises.some(e => answerFor(e.rawName) !== SKIP)).length;

  // How many of these are already in Seshd (a re-import): the ids are deterministic, so they
  // upsert onto the same rows rather than duplicating -- worth SAYING, or a second run looks scary.
  const alreadyIn = useMemo(() => {
    if (!parsed) return 0;
    const have = new Set();
    Object.values(store.history || {}).forEach(day => Object.keys(day || {}).forEach(id => have.add(id)));
    const nameMap = Object.fromEntries(rawNames.map(r => [r, "x"]));
    try {
      return strongToSessions(parsed.workouts, { userId: currentUserId, unit, nameMap }).filter(s => have.has(s.id)).length;
    } catch { return 0; }
  }, [parsed, store.history, currentUserId, unit, rawNames]);

  const onFile = async (file) => {
    setErr("");
    if (!file) return;
    try {
      const text = await file.text();
      const res = parseStrongExport(text);
      if (!res.workouts.length) throw new Error("No workouts found in that file.");
      const names = [...new Set(res.workouts.flatMap(w => w.exercises.map(e => e.rawName)))];
      setAuto(resolveImportNames(names).matched);
      setChosen({});
      setParsed(res);
      setStage("review");
    } catch (e) {
      setErr(e?.message || "Couldn't read that file.");
    }
  };

  const runImport = async () => {
    if (unanswered.length || !parsed || !importCount) return;
    const nameMap = {};
    rawNames.forEach(r => { const a = answerFor(r); if (a && a !== SKIP) nameMap[r] = a; });
    // Skipped exercises are removed BEFORE conversion, and a workout left with nothing is dropped.
    const workouts = parsed.workouts
      .map(w => ({ ...w, exercises: w.exercises.filter(e => nameMap[e.rawName]) }))
      .filter(w => w.exercises.length);
    const sessions = strongToSessions(workouts, { userId: currentUserId, unit, nameMap });
    const rows = sessions.map(s => ({
      id: s.id, user_id: currentUserId, day_name: s.dayName, exercises: s.exercises,
      duration_secs: s.duration || 0, unit: s.unit, note: "",
      workout_date: s.date, created_at: new Date(s.finishedAt).toISOString(),
    }));
    setStage("importing");
    setProgress({ done: 0, total: rows.length, failed: 0 });

    // History rows, in batches. `on_conflict=id` + merge-duplicates makes each batch an UPSERT, so
    // a retry (or a whole second import of the same file) rewrites the same rows instead of
    // adding copies. A failed batch is counted and REPORTED -- never toasted as success.
    let done = 0, failed = 0;
    const okIds = new Set();
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const send = () => sb.query("workout_history?on_conflict=id", {
        method: "POST", headers_extra: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(chunk),
      }, token);
      let ok = false;
      try { await send(); ok = true; }
      catch (e) {
        try { await send(); ok = true; } // one retry: the dominant failure is transient
        catch (e2) { failed += chunk.length; devError("strong import batch:", e2); }
      }
      if (ok) chunk.forEach(r => okIds.add(r.id));
      done += chunk.length;
      setProgress({ done, total: rows.length, failed });
    }
    // Only what the server CONFIRMED goes any further. A session whose batch failed is left out of
    // the local store and the notes, so nothing on screen claims a workout the server doesn't hold.
    const saved = sessions.filter(s => okIds.has(s.id));

    // Notes go to the PRIVATE profiles.workout_notes map -- never into the exercises jsonb, which
    // followers and a public profile can read. Awaited BEFORE the refresh below, because
    // loadUserData REPLACES workoutNotes from the server: refreshing first would wipe these.
    const importedNotes = {};
    saved.forEach(s => { if (Object.keys(s.notes).length) importedNotes[s.id] = s.notes; });
    let notesFailed = false;
    if (Object.keys(importedNotes).length) {
      const merged = { ...(store.workoutNotes || {}), ...importedNotes };
      markSettingsEdit();
      setStore(p => ({ ...p, workoutNotes: { ...(p.workoutNotes || {}), ...importedNotes } }));
      try {
        await sb.query(`profiles?id=eq.${currentUserId}`, { method: "PATCH", body: JSON.stringify({ workout_notes: merged }) }, token);
      } catch (e) { notesFailed = true; devError("strong import notes:", e); }
    }

    // Show them immediately; the refresh then re-reads the server (which rebuilds PRs from history).
    setStore(p => {
      const h = { ...(p.history || {}) };
      saved.forEach(s => {
        h[s.date] = { ...(h[s.date] || {}), [s.id]: {
          dayName: s.dayName, exercises: s.exercises, duration: s.duration, unit: s.unit, note: "", finishedAt: s.finishedAt,
        } };
      });
      return { ...p, history: h };
    });
    setProgress({ done: rows.length, total: rows.length, failed });
    setStage("done");
    try { await onDone?.(); } catch (e) { devError("strong import refresh:", e); }
    if (failed) toast(`${rows.length - failed} of ${rows.length} imported — run it again to finish`);
    else if (notesFailed) toast("Workouts imported — notes didn't save, run it again");
    else toast(`Imported ${rows.length} workout${rows.length === 1 ? "" : "s"}`);
  };

  const Row = ({ raw, answer, how, onTap }) => {
    const muscle = answer && answer !== SKIP ? getMuscle(answer) : null;
    return (
      <div data-import-row={raw} style={{ display: "flex", alignItems: "center", gap: 4, borderTop: `1px solid ${C.divider}` }}>
      <button onClick={onTap} style={{
        flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none",
        padding: "11px 2px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontFamily: F,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{raw}</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {!answer ? "Choose an exercise" : answer === SKIP ? "Skipped — won't be imported" : `→ ${answer}${muscle ? ` · ${muscle}` : ""}${how ? " (best guess)" : ""}`}
          </div>
        </div>
        <span style={{ fontSize: 11, color: C.sub, fontFamily: MONO, flexShrink: 0 }}>{setCounts[raw]} set{setCounts[raw] === 1 ? "" : "s"}</span>
        <span style={{ fontSize: 14, color: C.sub, flexShrink: 0 }}>›</span>
      </button>
      {answer !== SKIP && (
        <button onClick={() => setChosen(c => ({ ...c, [raw]: SKIP }))} aria-label={`Skip ${raw}`} style={{
          background: "none", border: "none", padding: "11px 6px 11px 8px", cursor: "pointer", fontFamily: F,
          fontSize: 12, fontWeight: 600, color: C.sub, flexShrink: 0,
        }}>Skip</button>
      )}
      </div>
    );
  };

  const primaryBtn = (disabled) => ({
    width: "100%", padding: "14px", borderRadius: RADIUS.md, border: "none", fontFamily: F,
    fontSize: 15, fontWeight: 700, cursor: disabled ? "default" : "pointer",
    background: disabled ? C.divider : C.primary, color: disabled ? C.sub : C.onPrimary,
  });

  return createPortal(
    <EdgeSwipeBack onBack={stage === "importing" ? () => {} : onBack} style={{
      position: "fixed", ...KB_SAFE_INSET, background: C.bg, zIndex: 62,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div data-no-tab-swipe data-fullscreen-overlay="true" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: F }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
          padding: "calc(env(safe-area-inset-top) + 10px) 14px 10px", borderBottom: `1px solid ${C.divider}`,
        }}>
          <button onClick={onBack} disabled={stage === "importing"} aria-label="Back" className="seshd-hit" style={{
            fontSize: 20, color: C.text, background: "none", border: "none", cursor: "pointer", padding: "12px 14px 12px 6px",
            opacity: stage === "importing" ? 0.3 : 1,
          }}>‹</button>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Import from Strong</div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 40px", display: "flex", flexDirection: "column", gap: 14 }}>
          {stage === "pick" && (
            <>
              <div style={{ fontSize: 14, color: C.text, lineHeight: 1.5 }}>
                Bring your whole Strong history across — workouts, sets, warm-ups and notes. Your PRs and charts rebuild from it.
              </div>
              <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.5 }}>
                In Strong, open <b style={{ color: C.text }}>Settings → Export Data</b>, save the CSV file, then choose it here.
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv,text/comma-separated-values"
                onChange={e => { onFile(e.target.files?.[0]); e.target.value = ""; }}
                style={{ display: "none" }} data-strong-file/>
              <button onClick={() => fileRef.current?.click()} style={primaryBtn(false)}>Choose Strong export</button>
              {err && <div role="alert" style={{ fontSize: 13, color: C.red, lineHeight: 1.45 }}>{err}</div>}
              <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.5 }}>
                Safe to run more than once — importing the same file again updates those workouts instead of adding copies.
              </div>
            </>
          )}

          {stage === "review" && parsed && (
            <>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.text, fontFamily: MONO }}>{parsed.workouts.length} workouts</div>
                <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>
                  {totalSets.toLocaleString()} sets · {rawNames.length} exercises{range ? ` · ${range[0].slice(0, 4)}–${range[1].slice(0, 4)}` : ""}
                </div>
                {alreadyIn > 0 && (
                  <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>
                    {alreadyIn} of these are already in Seshd and will be updated, not duplicated.
                  </div>
                )}
              </div>

              <div>
                <SectionLabel C={C}>Weights are in</SectionLabel>
                <div role="radiogroup" aria-label="Weight unit" style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  {["lbs", "kg"].map(u => (
                    <button key={u} role="radio" aria-checked={unit === u} onClick={() => setUnit(u)} style={{
                      flex: 1, padding: "10px", borderRadius: RADIUS.sm, fontFamily: F, fontSize: 14, fontWeight: 700, cursor: "pointer",
                      border: `1px solid ${unit === u ? C.primary : C.border}`,
                      background: unit === u ? C.primary : "transparent", color: unit === u ? C.onPrimary : C.text,
                    }}>{u}</button>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>Strong exports in whatever unit you used there.</div>
              </div>

              {unanswered.length > 0 && (
                <div data-import-needs>
                  <SectionLabel C={C}>{unanswered.length} need{unanswered.length === 1 ? "s" : ""} a choice</SectionLabel>
                  <div style={{ fontSize: 12, color: C.sub, margin: "6px 0 4px", lineHeight: 1.45 }}>
                    Seshd couldn't match these for certain. Pick the exercise, create your own, or skip it — a wrong guess would put those sets on the wrong muscle.
                  </div>
                  {unanswered.map(r => <Row key={r} raw={r} answer={null} onTap={() => setPicking(r)}/>)}
                </div>
              )}

              {rawNames.some(r => chosen[r] !== undefined) && (
                <div>
                  <SectionLabel C={C}>Your choices</SectionLabel>
                  {rawNames.filter(r => chosen[r] !== undefined).map(r =>
                    <Row key={r} raw={r} answer={chosen[r]} onTap={() => setPicking(r)}/>)}
                </div>
              )}

              {matchedAuto.length > 0 && (
                <div>
                  <button onClick={() => setShowMatched(v => !v)} aria-expanded={showMatched} style={{
                    background: "none", border: "none", padding: "4px 0", cursor: "pointer", fontFamily: F,
                    display: "flex", alignItems: "center", gap: 6, color: C.text, fontSize: 13, fontWeight: 700,
                  }}>
                    {matchedAuto.length} matched automatically
                    <span style={{ color: C.sub, fontWeight: 600 }}>{showMatched ? "Hide" : "Review"}</span>
                  </button>
                  {showMatched && matchedAuto.map(r =>
                    <Row key={r} raw={r} answer={auto[r].name} how={!auto[r].exact} onTap={() => setPicking(r)}/>)}
                </div>
              )}
            </>
          )}

          {(stage === "importing" || stage === "done") && (
            <div style={{ padding: "30px 4px", textAlign: "center" }} aria-live="polite">
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text, fontFamily: MONO }}>
                {progress.done} / {progress.total}
              </div>
              <div style={{ height: 6, borderRadius: 3, background: C.divider, overflow: "hidden", margin: "14px 0" }}>
                <div style={{
                  height: "100%", background: C.accent, transformOrigin: "left center", willChange: "transform",
                  transform: `scaleX(${progress.total ? progress.done / progress.total : 0})`, transition: "transform 0.2s linear",
                }}/>
              </div>
              <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.5 }}>
                {stage === "importing" ? "Importing — keep Seshd open." :
                  progress.failed ? `${progress.total - progress.failed} imported, ${progress.failed} didn't save. Run the import again to finish — nothing will be duplicated.` :
                  "Done. Your PRs and charts now include your Strong history."}
              </div>
              {stage === "done" && <button onClick={onBack} style={{ ...primaryBtn(false), marginTop: 18 }}>Done</button>}
            </div>
          )}
        </div>

        {stage === "review" && (
          <div style={{ flexShrink: 0, padding: "12px 16px calc(env(safe-area-inset-bottom) + 12px)", borderTop: `1px solid ${C.divider}` }}>
            <button onClick={runImport} disabled={unanswered.length > 0 || importCount === 0} style={primaryBtn(unanswered.length > 0 || importCount === 0)} data-import-go>
              {unanswered.length ? `Choose ${unanswered.length} more to import` : `Import ${importCount} workout${importCount === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
      </div>

      <ExercisePickerSheet open={!!picking} onClose={() => setPicking(null)} C={C} store={store} setStore={setStore}
        currentUserId={currentUserId} token={token}
        onSelect={v => { if (picking) setChosen(c => ({ ...c, [picking]: v })); setPicking(null); }}/>
    </EdgeSwipeBack>,
    document.body
  );
}
