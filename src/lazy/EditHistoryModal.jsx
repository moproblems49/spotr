// Lazy-loaded: editing a past logged workout. Opened only from a History row's edit action, so
// most sessions never touch it — but it carries a lot of correctness-critical PR/post-sync logic,
// so every dependency here is traced precisely rather than guessed (see the ReferenceError history
// in the comment on `eu` below — this exact function has crashed the whole app once already).
import { useState, useMemo } from "react";
import { devError } from "../engine/core.js";
import { F, MONO, uid, EXERCISE_DB, _exNorm, sb, toast, haptic, cvt, historyMaxPRs, matchesSession, postWorkoutPayload, CreateExercisePicker, confirmAction } from "../App.jsx";

export default function EditHistoryModal({ editing, unit, C, token, currentUserId, store, setStore, onClose }) {
  const { date, sid, sess } = editing;
  const [exercises, setExercises] = useState(() => JSON.parse(JSON.stringify(sess.exercises || [])));
  const [saving, setSaving] = useState(false);
  const [newExName, setNewExName] = useState("");
  const [showExSuggest, setShowExSuggest] = useState(false);

  function updateSet(ei, si, patch) {
    setExercises(p => p.map((ex, i) => i !== ei ? ex : {
      ...ex,
      sets: ex.sets.map((s, j) => j !== si ? s : { ...s, ...patch })
    }));
  }

  function addExercise(name) {
    const nm = (name || newExName).trim();
    if (!nm) return;
    setExercises(p => [...p, {
      id: uid(), name: nm,
      sets: [{ id: uid(), weight: "", reps: "", done: true, type: "normal" }],
    }]);
    setNewExName("");
    setShowExSuggest(false);
  }

  function removeExercise(ei) {
    setExercises(p => p.filter((_, i) => i !== ei));
  }

  function moveExercise(ei, dir) {
    setExercises(p => {
      const ni = ei + dir;
      if (ni < 0 || ni >= p.length) return p;
      const next = [...p];
      [next[ei], next[ni]] = [next[ni], next[ei]];
      return next;
    });
  }

  // Autocomplete suggestions from the exercise DB. Memoized so typing doesn't
  // re-spread + rescan the full ~590-entry library twice on every keystroke.
  const exLibrary = useMemo(() => [...(store.customExercises || []), ...EXERCISE_DB], [store.customExercises]);
  const { exSuggestions, exactMatch } = useMemo(() => {
    const q = newExName.trim().toLowerCase();
    if (!q) return { exSuggestions: [], exactMatch: false };
    const qNorm = _exNorm(newExName);
    const suggestions = [];
    let exact = false;
    for (const e of exLibrary) {
      if (suggestions.length < 6 && e.name.toLowerCase().includes(q)) suggestions.push(e);
      if (!exact && _exNorm(e.name) === qNorm) exact = true;
    }
    return { exSuggestions: suggestions, exactMatch: exact };
  }, [newExName, exLibrary]);
  const [showCreateEx, setShowCreateEx] = useState(false);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    // 1. Update local history
    setStore(prev => {
      const dayHistory = { ...(prev.history[date] || {}) };
      if (dayHistory[sid]) {
        dayHistory[sid] = { ...dayHistory[sid], exercises };
      }
      return { ...prev, history: { ...prev.history, [date]: dayHistory } };
    });
    // 2. Patch DB row.
    // If this session hasn't reached the server yet it is sitting in seshd_pending_workouts, and a
    // PATCH matching zero rows returns 204 with no error — so the edit reported "Workout updated",
    // the queued copy kept the ORIGINAL numbers, and the correction died on the next loadUserData.
    // History even offers Edit on these (they render with a SYNCING badge). Retag the queue, the
    // way mergeExerciseNames already does.
    try {
      const pending = JSON.parse(localStorage.getItem("seshd_pending_workouts") || "[]");
      let touched = false;
      for (const p of pending) {
        if (String(p?.sid) !== String(sid) || !p?.data) continue;
        p.data.exercises = exercises
          .filter(ex => ex?.name && (ex.sets || []).some(s => s.done))
          .map(ex => ({ name: ex.name, sets: (ex.sets || []).filter(s => s.done)
            .map(s => ({ weight: s.weight, reps: s.reps, done: true, type: s.type, ...(s.rpe != null ? { rpe: s.rpe } : {}) })) }));
        // The queued entry also carries the PR map captured at finish, and the flush upserts every
        // entry of it. Retagging only the exercises left the PRE-EDIT weight in there, so the flush
        // re-POSTed the mistyped 315 and the max-wins merge restored it on the next launch —
        // silently undoing the correction that was just made. loadUserData re-derives real PRs from
        // history anyway, so dropping the map is the safe move.
        delete p.data.prs;
        touched = true;
      }
      if (touched) localStorage.setItem("seshd_pending_workouts", JSON.stringify(pending));
    } catch {}
    try {
      if (token && !String(sid).startsWith("local_")) {
        await sb.query(`workout_history?id=eq.${sid}`, {
          method: "PATCH",
          body: JSON.stringify({ exercises })
        }, token);
      }
    } catch (e) {
      devError("edit workout failed:", e);
      toast("Saved locally — couldn't sync to server", "error");
      setSaving(false);
      onClose();
      return;
    }
    // 2b. Recompute raw-weight PRs from the edited sets and raise any that now beat the stored PR.
    // Editing a past workout used to patch only the history row, leaving personal_records (the cache
    // the History "Personal Records" strip + leaderboard read) stale below a set just corrected
    // upward — e.g. fixing a 145 to the 155 you actually lifted wouldn't move your PR.
    // The session's OWN unit anchors everything below — the PR recompute in 2b AND the three
    // payload rebuilds in 3/4/5. It was declared inside 2b's try block, so those three uses were a
    // ReferenceError: step 3 threw during a setStore updater (i.e. in render) and took the whole
    // app to "Something went sideways", while steps 4 and 5 threw into their own catch and left the
    // feed post and every group post stale. EVERY edit of a past workout crashed. Mo hit it on
    // 2026-08-01 (client_errors: "Can't find variable: eu"), which is how it was found.
    // Keep this ABOVE the try.
    const eu = sess.unit || store.unit || "lbs";
    try {
      const editedPRs = {};
      exercises.forEach(ex => {
        if (!ex?.name) return;
        (ex.sets || []).forEach(s => {
          const done = s?.done === true || (s?.done === undefined && parseFloat(s?.reps) > 0);
          if (!done || s?.type === "warmup") return;
          const wt = parseFloat(s.weight), r = parseInt(s.reps);
          if (!wt || wt <= 0 || !r || r < 1) return;
          const lbs = eu === "lbs" ? wt : cvt(wt, "kg", "lbs");
          if (lbs > (editedPRs[ex.name] || 0)) editedPRs[ex.name] = lbs;
        });
      });
      // AN EDIT CAN LOWER A PR, so recompute the affected exercises against the history as it
      // will be AFTER this edit — the closure's store.history still holds the old sets. Every name
      // that appeared before or after is in scope: renaming or deleting an exercise has to release
      // the PR it was holding just as much as retyping its weight does.
      //
      // ONLY exercises this edit actually CHANGED. Scoping it to every exercise in the session
      // destroys legitimately-higher personal_records rows for lifts the user never touched:
      // loadUserData's history reconcile "only ever raises", so a stored PR sitting above the local
      // history max is a supported state (live data has several — e.g. a Leg Press row at 360 with
      // a history max of 340). Editing the bench in that session would have dragged Leg Press down
      // to 340, and the equal-to-PR comparison then mints a false PR badge on the rebuilt card.
      // Keyed name -> LIST of signatures, one per row. Keying a single signature per name loses a
      // session that lists the same exercise twice — "top single + back-off sets" is an ordinary
      // way to log — because only the LAST row survived, so editing an earlier duplicate looked
      // like no change at all: `affected` came out empty and the whole unwind silently no-opped,
      // leaving the stale PR standing. That is worse than the over-broad version it replaced.
      const setsSig = (ex) => JSON.stringify((ex?.sets || []).map(s =>
        [s?.weight ?? "", s?.reps ?? "", !!s?.done, s?.type || "normal"]));
      const sigsByName = (list) => {
        const m = {};
        (list || []).forEach(ex => { if (ex?.name) (m[ex.name] = m[ex.name] || []).push(setsSig(ex)); });
        return m;
      };
      const beforeByName = sigsByName(sess.exercises);
      const afterByName = sigsByName(exercises);
      const affected = new Set(
        [...new Set([...Object.keys(beforeByName), ...Object.keys(afterByName)])]
          .filter(n => JSON.stringify(beforeByName[n] || []) !== JSON.stringify(afterByName[n] || []))
      );
      const nextHistory = {
        ...(store.history || {}),
        [date]: { ...((store.history || {})[date] || {}), [sid]: { ...sess, exercises } },
      };
      const trueMax = historyMaxPRs(nextHistory, [...affected]);
      const curPrs = store.prs || {};
      const changed = Object.entries(trueMax).filter(([name, w]) => Math.round(w) !== Math.round(curPrs[name] || 0));
      if (changed.length) {
        setStore(prev => {
          const nextPrs = { ...(prev.prs || {}) };
          const nextE1 = { ...(prev.prsE1rm || {}) };
          const nextVol = { ...(prev.prsVolume || {}) };
          changed.forEach(([name, w]) => {
            // 0 = no working sets left for this lift anywhere; drop it rather than pin it at zero.
            if (w > 0) nextPrs[name] = w; else { delete nextPrs[name]; delete nextE1[name]; delete nextVol[name]; }
          });
          return { ...prev, prs: nextPrs, prsE1rm: nextE1, prsVolume: nextVol };
        });
        if (token && currentUserId) {
          changed.forEach(([name, w]) => {
            const path = `personal_records?user_id=eq.${currentUserId}&exercise_name=eq.${encodeURIComponent(name)}`;
            if (w > 0) {
              sb.queueWrite(`personal_records`, { method:"POST", headers_extra: { "Prefer": "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: currentUserId, exercise_name: name, weight_lbs: w }) }, token).catch(()=>{});
            } else {
              // The server row must go too, or loadUserData's max-wins merge resurrects it.
              sb.queueWrite(path, { method: "DELETE" }, token).catch(()=>{});
            }
          });
        }
      }
      // PR EVENTS are judged on their own terms, not on whether the stored PR moved. Driving this
      // off `changed` missed the case where you correct a mistyped 315 down but genuinely hit 315
      // for that lift on another day: the stored max doesn't move, so nothing fired, and the event
      // claiming "315 on THIS session" survived for Wrapped to keep reporting.
      //
      // The rule: for an exercise this edit touched, an event against THIS session only stands if
      // the session still contains a working set at least that heavy.
      if (affected.size) {
        const stillHolds = (ev) => {
          const ex = (exercises || []).find(x => x?.name === ev?.name);
          if (!ex) return false;
          const evLbs = Number(ev?.weightLbs ?? ev?.weight ?? 0);
          if (!isFinite(evLbs) || evLbs <= 0) return false;
          return (ex.sets || []).some(st => {
            const done = st?.done === true || (st?.done === undefined && parseFloat(st?.reps) > 0);
            if (!done || st?.type === "warmup") return false;
            const wt = parseFloat(st.weight);
            if (!isFinite(wt) || wt <= 0) return false;
            const lbs = eu === "lbs" ? wt : cvt(wt, "kg", "lbs");
            return lbs >= evLbs - 0.5;
          });
        };
        // Compute OUTSIDE the updater and issue the write after it. A setState updater is
        // render-phase: StrictMode invokes it twice in dev and React may re-run it on a render
        // restart, so a network call in there double-fires.
        const keptPrEvents = (store.prEvents || [])
          .filter(e => !(e.sid === sid && affected.has(e.name) && !stillHolds(e)));
        if (keptPrEvents.length !== (store.prEvents || []).length) {
          setStore(prev => ({ ...prev, prEvents: keptPrEvents }));
          // loadUserData prefers the server's pr_events, so a local-only filter is undone on the
          // next launch. Both delete paths already PATCH it.
          if (token && currentUserId) {
            sb.queueWrite(`profiles?id=eq.${currentUserId}`, { method:"PATCH", body: JSON.stringify({ pr_events: keptPrEvents }) }, token).catch(() => {});
          }
        }
      }
    } catch (e) { devError("PR recompute on edit failed:", e); }
    // 3. Update the feed post built from THIS session (see matchesSession).
    setStore(prev => {
      const newPosts = (prev.posts || []).map(p => {
        if (p.userId !== currentUserId) return p;
        if (!matchesSession(p, sid, sess, date)) return p;
        // Rebuild the post.workout.exercises to reflect new numbers
        const rebuilt = postWorkoutPayload(exercises, prev.prs, null, eu);
        return { ...p, workout: { ...p.workout, exercises: rebuilt.exercises, volume: rebuilt.volume } };
      });
      return { ...prev, posts: newPosts };
    });
    // 4. Patch that same post on the server.
    try {
      if (token) {
        const match = (store.posts || []).find(p =>
          p.userId === currentUserId && matchesSession(p, sid, sess, date)
        );
        if (match && !String(match.id).startsWith("hist_")) {
          // Recompute the workout payload to mirror local state
          const rebuilt = postWorkoutPayload(exercises, store.prs, null, eu);
          await sb.query(`posts?id=eq.${match.id}`, {
            method: "PATCH",
            body: JSON.stringify({ workout: { ...(match.workout || {}), exercises: rebuilt.exercises, volume: rebuilt.volume } })
          }, token);
        }
      }
    } catch (e) {
      devError("post sync failed:", e);
    }
    // 5. Patch the GROUP posts built from this session (same workout shared to groups).
    try {
      if (token) {
        const myGroups = (store.groups || []).filter(g =>
          (g.members || g.member_ids || []).includes(currentUserId)
        );
        if (myGroups.length > 0) {
          // Recompute the workout payload once (same shape used for feed posts)
          const rebuilt = postWorkoutPayload(exercises, store.prs, null, eu);

          // For each group I'm in, fetch my recent workout posts and patch the matching one.
          // Run all groups in parallel — sequential awaits would be slow for users in many groups.
          await Promise.all(myGroups.map(async (g) => {
            try {
              const rows = await sb.query(
                `group_posts?group_id=eq.${g.id}&user_id=eq.${currentUserId}&type=eq.workout&select=id,workout,created_at,client_id&order=created_at.desc`,
                {}, token
              ).catch(() => []);
              const match = (rows || []).find(gp => matchesSession({ ...gp, type: "workout" }, sid, sess, date));
              if (match) {
                await sb.query(`group_posts?id=eq.${match.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ workout: { ...(match.workout || {}), exercises: rebuilt.exercises, volume: rebuilt.volume } })
                }, token);
              }
            } catch (e) { devError(`group post sync failed for group ${g.id}:`, e); }
          }));
        }
      }
    } catch (e) {
      devError("group post sync failed:", e);
    }
    toast("Workout updated", "success");
    haptic("complete");
    setSaving(false);
    onClose();
  }

  return (
    <div data-fullscreen-overlay="true" style={{
      position:"fixed", inset:0, background:C.bg, zIndex:600,
      maxWidth:480, margin:"0 auto", display:"flex", flexDirection:"column",
    }}>
      <div style={{ padding:"calc(env(safe-area-inset-top) + 14px) 16px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1px solid ${C.divider}` }}>
        <button onClick={onClose} style={{ background:"none", border:"none", color:C.sub, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:F }}>Cancel</button>
        <div style={{ fontSize:15, fontWeight:700, color:C.text, letterSpacing:-0.2 }}>Edit workout</div>
        <button onClick={handleSave} disabled={saving} style={{ background:"none", border:"none", color:C.text, fontSize:14, fontWeight:700, cursor: saving ? "default" : "pointer", fontFamily:F, opacity: saving ? 0.5 : 1 }}>{saving ? "..." : "Save"}</button>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"12px 14px 32px" }}>
        <div style={{ fontSize:11, color:C.sub, marginBottom:10, letterSpacing:0.4, fontWeight:600 }}>{sess.dayName} · {new Date(date + "T12:00:00").toLocaleDateString()} · logged in {(sess.unit || unit || "lbs").toLowerCase()}</div>
        {exercises.map((ex, ei) => (
          <div key={ei} style={{ marginBottom:18, background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"12px 12px 8px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <div style={{ fontSize:14, fontWeight:700, color:C.text, letterSpacing:-0.2 }}>{ex.name || "Unnamed"}</div>
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <button onClick={() => moveExercise(ei, -1)} disabled={ei === 0} style={{ background:"none", border:"none", color: ei === 0 ? C.muted : C.sub, fontSize:16, fontWeight:700, cursor: ei === 0 ? "default" : "pointer", fontFamily:F, padding:"2px 6px", opacity: ei === 0 ? 0.35 : 1 }}>↑</button>
                <button onClick={() => moveExercise(ei, 1)} disabled={ei === exercises.length - 1} style={{ background:"none", border:"none", color: ei === exercises.length - 1 ? C.muted : C.sub, fontSize:16, fontWeight:700, cursor: ei === exercises.length - 1 ? "default" : "pointer", fontFamily:F, padding:"2px 6px", opacity: ei === exercises.length - 1 ? 0.35 : 1 }}>↓</button>
                <button onClick={() => confirmAction({
                  title: `Remove ${ex.name || "this exercise"}?`,
                  message: "This removes it — and its logged sets — from this past workout. Tap Save afterward to make it permanent.",
                  confirmLabel: "Remove", destructive: true,
                  onConfirm: () => removeExercise(ei),
                })} style={{ background:"none", border:"none", color:C.muted, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F, padding:"2px 4px" }}>Remove</button>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"30px 1fr 1fr 28px", gap:8, alignItems:"center", marginBottom:6 }}>
              <div style={{ fontSize:10, color:C.muted, fontWeight:700, letterSpacing:0.5 }}>SET</div>
              {/* The SESSION's unit, not the app's. The boxes hold the session's raw numbers, so
                  labelling the column with store.unit told a lbs-mode user that a 143 logged in kg
                  was 143 LBS — and "correcting" it to 315 writes 315 KG, 694 lbs, into the log and
                  the PR. History itself was already right; only the editor lied. */}
              <div style={{ fontSize:10, color:C.muted, fontWeight:700, letterSpacing:0.5 }}>{(sess.unit || unit || "lbs").toUpperCase()}</div>
              <div style={{ fontSize:10, color:C.muted, fontWeight:700, letterSpacing:0.5 }}>REPS</div>
              <div/>
            </div>
            {(ex.sets || []).map((s, si) => (
              <div key={si} style={{ display:"grid", gridTemplateColumns:"30px 1fr 1fr 28px", gap:8, alignItems:"center", marginBottom:6 }}>
                <div style={{ fontSize:13, color:C.sub, fontWeight:700, fontFamily:MONO }}>{si + 1}</div>
                <input type="text" inputMode="decimal" pattern="[0-9]*\\.?[0-9]*" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} name={`w-${ei}-${si}`} data-1p-ignore data-lpignore="true" data-form-type="other" enterKeyHint="next" value={s.weight || ""} onFocus={e => e.target.select()} onChange={e => updateSet(ei, si, { weight: e.target.value.replace(/[^0-9.]/g, "") })}
                  style={{ width:"100%", background:C.bg, border:`1.5px solid ${C.divider}`, borderRadius:8, padding:"7px 8px", fontSize:14, fontWeight:700, color:C.text, textAlign:"center", outline:"none", fontFamily:MONO, boxSizing:"border-box" }}
                />
                <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} name={`r-${ei}-${si}`} data-1p-ignore data-lpignore="true" data-form-type="other" enterKeyHint="done" value={s.reps || ""} onFocus={e => e.target.select()} onChange={e => updateSet(ei, si, { reps: e.target.value.replace(/[^0-9]/g, "") })}
                  style={{ width:"100%", background:C.bg, border:`1.5px solid ${C.divider}`, borderRadius:8, padding:"7px 8px", fontSize:14, fontWeight:700, color:C.text, textAlign:"center", outline:"none", fontFamily:MONO, boxSizing:"border-box" }}
                />
                <button onClick={() => {
                  const removeNow = () => setExercises(p => p.map((x, i) => i !== ei ? x : { ...x, sets: x.sets.filter((_, j) => j !== si) }));
                  // Same "only confirm when there's real data at risk" rule the live workout's own
                  // remove buttons use — a blank/never-filled row doesn't need a prompt.
                  if (s.weight || s.reps) {
                    confirmAction({ title:"Delete this set?", message:"This removes it from the workout. Tap Save afterward to make it permanent.", confirmLabel:"Delete", destructive:true, onConfirm:removeNow });
                  } else { removeNow(); }
                }} aria-label="Delete set" style={{ background:"none", border:"none", color:C.sub, fontSize:18, cursor:"pointer", padding:0 }}>×</button>
              </div>
            ))}
            <button onClick={() => setExercises(p => p.map((x, i) => i !== ei ? x : { ...x, sets: [...x.sets, { id: uid(), weight: "", reps: "", done: true, type: "normal" }] }))}
              style={{ width:"100%", marginTop:4, background:"transparent", border:`1px dashed ${C.border}`, borderRadius:8, padding:"7px", fontSize:12, color:C.sub, cursor:"pointer", fontFamily:F, fontWeight:600 }}>
              + Add set
            </button>
          </div>
        ))}

        {/* Add a new exercise — for when one was forgotten during the workout */}
        <div style={{ marginTop:4, position:"relative" }}>
          <div style={{ fontSize:11, color:C.sub, fontWeight:600, letterSpacing:0.4, marginBottom:8 }}>ADD AN EXERCISE</div>
          <div style={{ display:"flex", gap:8 }}>
            <input
              value={newExName}
              onChange={e => { setNewExName(e.target.value); setShowExSuggest(true); }}
              onFocus={() => setShowExSuggest(true)}
              placeholder="Exercise name..."
              style={{ flex:1, background:C.bg, border:`1.5px solid ${C.divider}`, borderRadius:10, padding:"10px 12px", fontSize:14, color:C.text, outline:"none", fontFamily:F, boxSizing:"border-box" }}
            />
            <button onClick={() => addExercise()} disabled={!newExName.trim()} style={{
              background: newExName.trim() ? C.primary : C.divider, color: newExName.trim() ? C.onPrimary : C.muted,
              border:"none", borderRadius:10, padding:"10px 16px", fontSize:14, fontWeight:700,
              cursor: newExName.trim() ? "pointer" : "default", fontFamily:F, flexShrink:0,
            }}>Add</button>
          </div>
          {showExSuggest && exSuggestions.length > 0 && (
            <div style={{ marginTop:6, background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
              {exSuggestions.map((e, i) => (
                <button key={e.name} onClick={() => addExercise(e.name)} style={{
                  width:"100%", textAlign:"left", background:"none", border:"none",
                  borderTop: i > 0 ? `1px solid ${C.divider}` : "none",
                  padding:"10px 12px", fontSize:13, color:C.text, cursor:"pointer", fontFamily:F,
                  display:"flex", justifyContent:"space-between", alignItems:"center",
                }}>
                  <span>{e.name}</span>
                  <span style={{ fontSize:11, color:C.muted }}>{e.muscle}</span>
                </button>
              ))}
            </div>
          )}
          {/* Offer to create a custom exercise (with muscle) when the name isn't in the library */}
          {newExName.trim().length >= 2 && !exactMatch && !showCreateEx && (
            <button onClick={() => { setShowCreateEx(true); setShowExSuggest(false); haptic("tap"); }} style={{
              marginTop:6, width:"100%", textAlign:"left", padding:"10px 12px", borderRadius:10,
              background: C.accentSoft,
              border:`1px dashed ${C.accent}`, color:C.accent, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:F,
            }}>+ Create "{newExName.trim()}" as a custom exercise</button>
          )}
          {showCreateEx && (
            <CreateExercisePicker
              name={newExName.trim()} C={C} store={store} setStore={setStore}
              currentUserId={currentUserId} token={token}
              onCreate={(entry) => { setShowCreateEx(false); addExercise(entry.name); }}
              onCancel={() => setShowCreateEx(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
