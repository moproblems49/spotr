import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  F, MONO, RADIUS, Icon, Avatar, sb, toast, confirmAction, SectionLabel,
  EdgeSwipeBack, mintShareCode, KB_SAFE_INSET,
} from "../App.jsx";
import { dateFromKey, workingDone } from "../engine/core.js";
import { sessionVolume } from "../engine/workout.js";

// ── COACHING: a revocable, read-only grant over ONE athlete's training log ────────────────────
// Deliberately NOT a follow. A follow is social, reads as mutual, and grants the feed and profile;
// a coaching relationship needs none of that and needs one thing a follow cannot give — the
// athlete revoking, alone, instantly, without it being a social act.
//
// SCOPE IS TWO TABLES: workout_history and personal_records. Not posts, not messages, not the
// body log, not the private profile columns. Verified by role-sim rather than asserted: a coach
// reading the athlete's DMs with a third party returns 0 rows, and so does the base profile row.
// If this ever grows a third table, re-run that probe — the value of a narrow grant is that
// handing the code to the wrong person is survivable.
//
// The code itself is the bearer credential, so redemption goes through `redeem_coach_code`
// (SECURITY DEFINER, rate-limited by the same guard the program/workout codes use) rather than a
// table write. It claims atomically in the WHERE clause, so a leaked code cannot be redeemed twice
// and two simultaneous redeemers resolve to one winner without a read-then-write race.

const CARD = (C) => ({
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: RADIUS.card,
  padding: 14, display: "flex", flexDirection: "column", gap: 10,
});

function fmtWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts), now = new Date();
  const days = Math.round((now - d) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── The athlete's own log, as a coach sees it ────────────────────────────────────────────────
// A coach is not a follower, so ProfileScreen shows them nothing useful (`profileHistoryItems` is
// `isMe ? … : []` by design — an unposted workout must never leak into someone else's feed). This
// is the read-only view that makes the grant worth having: sessions newest first, every working
// set with its weight and reps, which is what someone programming for you actually needs.
function AthleteLog({ C, athlete, token, onBack, unit }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await sb.query(
          `workout_history?user_id=eq.${athlete.athlete_id}&select=id,day_name,exercises,unit,workout_date,duration_secs&order=workout_date.desc&limit=40`,
          {}, token);
        if (!dead) setRows(Array.isArray(r) ? r : []);
      } catch (e) {
        // An empty result and a failed request are different facts and must not render the same
        // sentence — "they have not logged anything" is a claim about the athlete, and saying it
        // when the request merely failed is the documented false-statement trap.
        if (!dead) { setRows([]); setErr("Couldn't load their log — check your connection."); }
      }
    })();
    return () => { dead = true; };
  }, [athlete.athlete_id, token]);

  return (
    // ★ THE PANEL'S POSITIONING BELONGS ON THE EdgeSwipeBack WRAPPER, AND THE WHOLE THING HAS TO
    // BE PORTALED — this screen shipped doing neither, and the symptom was that tapping Coaching
    // in Settings closed Settings and appeared to do nothing at all.
    // Two documented traps stacked on top of each other:
    //   1. `EdgeSwipeBack` sets `willChange:"transform"` on its wrapper, which makes it a
    //      CONTAINING BLOCK for `position:fixed` descendants. The panel was fixed INSIDE it, so
    //      it resolved against that wrapper instead of the viewport. Measured: z-index 61, width
    //      402 (correct), at y=1469 with height 0 — laid out against an in-flow, zero-height
    //      wrapper sitting inside ProfileScreen's scrolled content, i.e. far below the screen.
    //   2. ProfileScreen renders inside the tab-swipe track, and the standing rule is that any
    //      `position:fixed` overlay in that track must `createPortal` to `document.body`, because
    //      the track's own transform is a second containing block.
    // Every other EdgeSwipeBack caller in the app passes its layout through the wrapper's `style`
    // and sits inside an already-positioned parent; this one passed no style at all. Matching the
    // convention fixes both traps at once.
    createPortal(
    <EdgeSwipeBack onBack={onBack} style={{
      position: "fixed", ...KB_SAFE_INSET, background: C.bg, zIndex: 62,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div data-no-tab-swipe data-fullscreen-overlay="true" style={{
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          padding: "calc(env(safe-area-inset-top) + 10px) 14px 10px",
          borderBottom: `1px solid ${C.divider}`,
        }}>
          <button onClick={onBack} aria-label="Back" className="seshd-hit" style={{
            fontSize: 20, color: C.text, background: "none", border: "none",
            cursor: "pointer", padding: "12px 14px 12px 6px",
          }}>‹</button>
          <Avatar user={{ name: athlete.name, username: athlete.username, avatarUrl: athlete.avatar_url }} size={32} C={C} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {athlete.name || athlete.username}
            </div>
            <div style={{ fontSize: 11, color: C.sub }}>@{athlete.username}</div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 100px", display: "flex", flexDirection: "column", gap: 10 }}>
          {rows === null && <div style={{ fontSize: 13, color: C.sub, textAlign: "center", padding: 30 }}>Loading…</div>}
          {err && <div style={{ fontSize: 13, color: C.red, textAlign: "center", padding: 20 }}>{err}</div>}
          {rows !== null && !err && rows.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>No sessions yet</div>
              <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.45 }}>
                Their workouts will appear here as they log them.
              </div>
            </div>
          )}
          {(rows || []).map(w => {
            const u = w.unit || unit || "lbs";
            const exs = Array.isArray(w.exercises) ? w.exercises : [];
            const vol = sessionVolume({ exercises: exs }, u);
            const sets = exs.reduce((a, ex) => a + workingDone(ex.sets || []).length, 0);
            return (
              <div key={w.id} style={CARD(C)}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {w.day_name || "Workout"}
                  </div>
                  <div style={{ fontSize: 11, color: C.sub, flexShrink: 0, fontFamily: MONO }}>
                    {w.workout_date ? dateFromKey(w.workout_date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.sub, fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
                  {sets} set{sets === 1 ? "" : "s"} · {Math.round(vol).toLocaleString()} {u.toUpperCase()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {exs.map((ex, i) => {
                    const done = workingDone(ex.sets || []);
                    if (!done.length) return null;
                    return (
                      <div key={i} style={{ borderTop: i > 0 ? `1px solid ${C.divider}` : "none", paddingTop: i > 0 ? 7 : 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{ex.name || "Exercise"}</div>
                        <div style={{ fontSize: 12, color: C.sub, fontFamily: MONO, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
                          {done.map((s, j) => `${s.weight || 0}×${s.reps || 0}`).join("   ")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </EdgeSwipeBack>, document.body)
  );
}

export default function CoachScreen({ C, currentUserId, token, unit, onBack }) {
  const [myCoaches, setMyCoaches] = useState(null);   // people who can see MY log
  const [myAthletes, setMyAthletes] = useState(null); // people whose log I can see
  const [minting, setMinting] = useState(false);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    try {
      // Both directions come from one table, so one read answers both questions. The profile
      // join is on `public_profiles` — never the base `profiles` table, which is owner-only.
      const rows = await sb.query(
        "coach_links?select=id,athlete_id,coach_id,code,created_at,redeemed_at,revoked_at&revoked_at=is.null&order=created_at.desc",
        {}, token);
      const list = Array.isArray(rows) ? rows : [];
      const ids = [...new Set(list.flatMap(r => [r.athlete_id, r.coach_id]).filter(Boolean).filter(id => id !== currentUserId))];
      let people = {};
      if (ids.length) {
        const ps = await sb.query(
          `public_profiles?id=in.(${ids.join(",")})&select=id,username,name,avatar_url`, {}, token);
        for (const p of (Array.isArray(ps) ? ps : [])) people[p.id] = p;
      }
      setMyCoaches(list.filter(r => r.athlete_id === currentUserId)
        .map(r => ({ ...r, person: r.coach_id ? people[r.coach_id] : null })));
      setMyAthletes(list.filter(r => r.coach_id === currentUserId)
        .map(r => ({ ...r, person: people[r.athlete_id] })));
    } catch (e) {
      setMyCoaches([]); setMyAthletes([]);
      toast("Couldn't load your coaching links");
    }
  }, [currentUserId, token]);

  useEffect(() => { load(); }, [load]);

  async function invite() {
    if (minting) return;
    setMinting(true);
    try {
      // Same minting helper as program/workout codes: the DB's UNIQUE constraint is the collision
      // guard, so there is no pre-check to spend the owner's own rate-limit budget on.
      const code = await mintShareCode("COACH", (c) => sb.query("coach_links", {
        method: "POST", body: JSON.stringify({ athlete_id: currentUserId, code: c }),
      }, token));
      await load();
      try {
        await navigator.clipboard?.writeText(code);
        toast("Code copied — send it to your coach", "success");
      } catch { toast(`Your code: ${code}`, "success"); }
    } catch (e) {
      toast("Couldn't create a code — try again");
    } finally { setMinting(false); }
  }

  function revoke(link, who) {
    confirmAction({
      title: who ? `Remove ${who}?` : "Delete this code?",
      message: who
        ? `${who} will immediately lose access to your training log. They won't be told.`
        : "The code stops working. Anyone you already sent it to won't be able to use it.",
      // `confirmLabel`, not `confirmText` — the wrong key is silently ignored and the sheet falls
      // back to a generic "Confirm", which is exactly the wrong word on a destructive action.
      confirmLabel: who ? "Remove" : "Delete code",
      destructive: true,
      onConfirm: async () => {
        try {
          // A revoke is an UPDATE, not a DELETE, so the athlete keeps a record that the link
          // existed. `is_active_coach_of` requires revoked_at IS NULL, so access stops the moment
          // this lands — verified by role-sim: 73 rows before, 0 after.
          await sb.query(`coach_links?id=eq.${link.id}`, {
            method: "PATCH", body: JSON.stringify({ revoked_at: new Date().toISOString() }),
          }, token);
          await load();
          toast(who ? "Access removed" : "Code deleted", "success");
        } catch (e) { toast("Couldn't remove that — try again"); }
      },
    });
  }

  if (viewing) {
    return <AthleteLog C={C} athlete={viewing} token={token} unit={unit}
      onBack={() => setViewing(null)} />;
  }

  const pending = (myCoaches || []).filter(r => !r.redeemed_at);
  const active = (myCoaches || []).filter(r => r.redeemed_at);

  return (
    // ★ THE PANEL'S POSITIONING BELONGS ON THE EdgeSwipeBack WRAPPER, AND THE WHOLE THING HAS TO
    // BE PORTALED — this screen shipped doing neither, and the symptom was that tapping Coaching
    // in Settings closed Settings and appeared to do nothing at all.
    // Two documented traps stacked on top of each other:
    //   1. `EdgeSwipeBack` sets `willChange:"transform"` on its wrapper, which makes it a
    //      CONTAINING BLOCK for `position:fixed` descendants. The panel was fixed INSIDE it, so
    //      it resolved against that wrapper instead of the viewport. Measured: z-index 61, width
    //      402 (correct), at y=1469 with height 0 — laid out against an in-flow, zero-height
    //      wrapper sitting inside ProfileScreen's scrolled content, i.e. far below the screen.
    //   2. ProfileScreen renders inside the tab-swipe track, and the standing rule is that any
    //      `position:fixed` overlay in that track must `createPortal` to `document.body`, because
    //      the track's own transform is a second containing block.
    // Every other EdgeSwipeBack caller in the app passes its layout through the wrapper's `style`
    // and sits inside an already-positioned parent; this one passed no style at all. Matching the
    // convention fixes both traps at once.
    createPortal(
    <EdgeSwipeBack onBack={onBack} style={{
      position: "fixed", ...KB_SAFE_INSET, background: C.bg, zIndex: 61,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div data-no-tab-swipe data-fullscreen-overlay="true" style={{
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
          padding: "calc(env(safe-area-inset-top) + 10px) 14px 10px",
          borderBottom: `1px solid ${C.divider}`,
        }}>
          <button onClick={onBack} aria-label="Back" className="seshd-hit" style={{
            fontSize: 20, color: C.text, background: "none", border: "none",
            cursor: "pointer", padding: "12px 14px 12px 6px",
          }}>‹</button>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Coaching</div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px 100px", display: "flex", flexDirection: "column", gap: 22 }}>

          {/* ── People who can see MY log ─────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionLabel C={C}>WHO CAN SEE MY TRAINING</SectionLabel>
            <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.5, marginTop: -4 }}>
              Send a coach a code and they can see your workouts — sets, weights and reps. They
              can't see your posts, messages or anything else, and you can remove them any time.
            </div>

            {myCoaches === null && <div style={{ fontSize: 13, color: C.sub }}>Loading…</div>}

            {active.map(r => (
              <div key={r.id} style={{ ...CARD(C), flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Avatar user={{ name: r.person?.name, username: r.person?.username, avatarUrl: r.person?.avatar_url }} size={34} C={C} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.person?.name || r.person?.username || "A coach"}
                  </div>
                  <div style={{ fontSize: 11, color: C.sub }}>since {fmtWhen(r.redeemed_at)}</div>
                </div>
                <button onClick={() => revoke(r, r.person?.name || r.person?.username || "This coach")}
                  style={{
                    background: "none", border: `1px solid ${C.border}`, borderRadius: RADIUS.pill,
                    color: C.red, fontSize: 12, fontWeight: 600, padding: "7px 12px",
                    cursor: "pointer", fontFamily: F, flexShrink: 0,
                  }}>Remove</button>
              </div>
            ))}

            {pending.map(r => (
              <div key={r.id} style={{ ...CARD(C), gap: 8 }}>
                <div style={{ fontSize: 11, color: C.sub, letterSpacing: 0.4 }}>WAITING TO BE USED</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: 0.5 }}>
                    {r.code}
                  </div>
                  <button onClick={async () => {
                    try { await navigator.clipboard?.writeText(r.code); toast("Code copied", "success"); }
                    catch { toast(`Your code: ${r.code}`); }
                  }} style={{
                    background: "none", border: `1px solid ${C.border}`, borderRadius: RADIUS.pill,
                    color: C.text, fontSize: 12, fontWeight: 600, padding: "7px 12px", cursor: "pointer", fontFamily: F,
                  }}>Copy</button>
                  <button onClick={() => revoke(r, null)} style={{
                    background: "none", border: "none", color: C.sub, fontSize: 12,
                    padding: "7px 4px", cursor: "pointer", fontFamily: F,
                  }}>Delete</button>
                </div>
              </div>
            ))}

            {myCoaches !== null && active.length === 0 && pending.length === 0 && (
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
                Nobody can see your training log right now.
              </div>
            )}

            <button onClick={invite} disabled={minting} style={{
              background: C.primary, color: C.onPrimary, border: "none",
              borderRadius: RADIUS.pill, padding: "13px 16px", fontSize: 14, fontWeight: 700,
              cursor: minting ? "default" : "pointer", fontFamily: F, opacity: minting ? 0.6 : 1,
            }}>{minting ? "Creating…" : "Create a coach code"}</button>
          </div>

          {/* ── People whose log I can see ────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionLabel C={C}>ATHLETES I COACH</SectionLabel>
            {myAthletes === null && <div style={{ fontSize: 13, color: C.sub }}>Loading…</div>}
            {myAthletes !== null && myAthletes.length === 0 && (
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
                None yet. When someone sends you a coach code, enter it under
                {" "}<span style={{ color: C.text, fontWeight: 600 }}>Import a program by code</span>{" "}
                on the Workout tab.
              </div>
            )}
            {(myAthletes || []).map(r => (
              <button key={r.id} onClick={() => setViewing({
                athlete_id: r.athlete_id, username: r.person?.username,
                name: r.person?.name, avatar_url: r.person?.avatar_url,
              })} style={{
                ...CARD(C), flexDirection: "row", alignItems: "center", gap: 10,
                cursor: "pointer", textAlign: "left", width: "100%",
              }}>
                <Avatar user={{ name: r.person?.name, username: r.person?.username, avatarUrl: r.person?.avatar_url }} size={34} C={C} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.person?.name || r.person?.username || "Athlete"}
                  </div>
                  <div style={{ fontSize: 11, color: C.sub }}>since {fmtWhen(r.redeemed_at)}</div>
                </div>
                <span style={{ color: C.muted, fontSize: 18, flexShrink: 0 }}>›</span>
              </button>
            ))}
          </div>

        </div>
      </div>
    </EdgeSwipeBack>, document.body)
  );
}
