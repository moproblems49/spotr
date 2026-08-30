// Lazy-loaded: the Discover tab (search, leaderboard, suggested people, plus its two pushed
// sub-screens Groups and Friends Activity, and the Exercise Detail sheet reached from search).
// Not the default landing tab, so this only needs to load once someone actually switches to it.
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { cvt, dKey, dateFromKey, devWarn, uid } from "../engine/core.js";import { sessionVolume } from "../engine/workout.js";
import { EXERCISE_DB } from "../engine/exercises.js";
import { calcWeeklyStreak } from "../engine/insights.js";
import { F, MONO, Icon, Avatar, MuscleIcon, Skeleton, Sheet, NAV_CLEARANCE, toast, haptic, sb, shareLink, getDiscoverSubTab, setDiscoverSubTabValue, SUPABASE_URL, SUPABASE_KEY, ExerciseDetail, SectionLabel, FlatRow, ThemeMark } from "../App.jsx";

// GROUP DETAIL — lazy-loaded (src/lazy/GroupDetail.jsx). Most sessions never open a group.
const GroupDetail = lazy(() => import("./GroupDetail.jsx"));

export default function DiscoverScreen({ store, setStore, currentUserId, onUserClick, setTab, C, token, onFollow }) {
  const [q, setQ] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [subTab, _setSubTab] = useState(() => getDiscoverSubTab());
  const setSubTab = useCallback((v) => {
    const next = typeof v === "function" ? v(getDiscoverSubTab()) : v;
    setDiscoverSubTabValue(next);
    _setSubTab(next);
  }, []);
  const [viewingExercise, setViewingExercise] = useState(null);
  const [showAllLifts, setShowAllLifts] = useState(false);
  const [boardMode, setBoardMode] = useState("all"); // "all" | "close" — which leaderboard is shown
  const [showCloseFriendPicker, setShowCloseFriendPicker] = useState(false);
  const me = store.users.find(u => u.id === currentUserId);
  const following = me?.following || [];
  const closeFriends = (store.closeFriends || []).filter(id => following.includes(id)); // stay in sync with who you follow
  const CLOSE_FRIENDS_MAX = 10;
  function toggleCloseFriend(id) {
    setStore(prev => {
      const cur = (prev.closeFriends || []).filter(fid => (prev.users.find(u=>u.id===currentUserId)?.following||[]).includes(fid));
      if (cur.includes(id)) return { ...prev, closeFriends: cur.filter(x => x !== id) };
      if (cur.length >= CLOSE_FRIENDS_MAX) return prev; // cap reached
      return { ...prev, closeFriends: [...cur, id] };
    });
  }
  const unit = store.unit || "lbs"; // DiscoverScreen isn't passed `unit`; read it from store

  // Load followed users' PRs (exercise → lbs) so the leaderboard shows real numbers.
  // Requires an RLS policy allowing followers to read each other's personal_records;
  // if blocked, the rows come back empty and the leaderboard shows "—".
  useEffect(() => {
    if (!token) return;
    const friendIds = following.filter(id => id !== currentUserId);
    if (friendIds.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await sb.query(
          `personal_records?user_id=in.(${friendIds.join(",")})&select=user_id,exercise_name,weight_lbs`,
          {}, token
        ).catch(() => []);
        if (cancelled || !rows || rows.length === 0) return;
        const prMapByUser = {};
        rows.forEach(p => {
          if (!prMapByUser[p.user_id]) prMapByUser[p.user_id] = {};
          if (p.exercise_name && p.weight_lbs != null) prMapByUser[p.user_id][p.exercise_name] = p.weight_lbs;
        });
        setStore(prev => ({
          ...prev,
          users: (prev.users || []).map(u => prMapByUser[u.id] ? { ...u, prs: prMapByUser[u.id] } : u),
        }));
      } catch (e) { devWarn("friend PR load failed:", e); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, following.join(",")]);

  const blocked = store.blockedUsers || [];
  // Memoized so each keystroke doesn't rescan the user list + 590-entry exercise DB
  // (and re-lowercase the query for every single row).
  const userResults = useMemo(() => {
    if (q.length < 1) return [];
    const ql = q.toLowerCase();
    return store.users.filter(u => u.id !== currentUserId && !blocked.includes(u.id) && (
      u.name?.toLowerCase().includes(ql) || u.username?.toLowerCase().includes(ql)
    )).slice(0, 8);
  }, [q, store.users, currentUserId, store.blockedUsers]);

  const exerciseResults = useMemo(() => {
    if (q.length < 2) return [];
    const ql = q.toLowerCase();
    return EXERCISE_DB.filter(e => e.name.toLowerCase().includes(ql)).slice(0, 6);
  }, [q]);

  const showResults = q.length >= 1 && (userResults.length > 0 || exerciseResults.length > 0);

  function toggleFollow(uid2) {
    if (onFollow) { onFollow(uid2); return; }
    const isF = me?.following?.includes(uid2);
    setStore(p => ({
      ...p,
      users: p.users.map(u => {
        if (u.id === currentUserId) return { ...u, following: isF ? u.following.filter(id => id !== uid2) : [...(u.following || []), uid2] };
        if (u.id === uid2) return { ...u, followers: isF ? u.followers.filter(id => id !== currentUserId) : [...(u.followers || []), currentUserId] };
        return u;
      })
    }));
  }

  if (viewingExercise) {
    return <ExerciseDetail name={viewingExercise} store={store} unit={store.unit||"lbs"} C={C} onClose={() => setViewingExercise(null)}/>;
  }
  // Pushed sub-screens animate in from the right (same feel as switching tabs) instead of
  // swapping instantly. The wrapper is a plain flex column so the screen still fills the tab body.
  if (subTab === "groups") {
    return (
      <div className="seshd-push-in" style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0 }}>
        <GroupsScreen store={store} setStore={setStore} currentUserId={currentUserId} C={C} onBack={() => setSubTab("discover")} token={token}/>
      </div>
    );
  }
  if (subTab === "activity") {
    return (
      <div className="seshd-push-in" style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0 }}>
        <FriendsActivityScreen store={store} currentUserId={currentUserId} C={C} unit={store.unit||"lbs"} onBack={() => setSubTab("discover")} onUserClick={onUserClick} token={token}/>
      </div>
    );
  }

  return (
    <div style={{ overflowY:"auto", flex:1, paddingBottom:NAV_CLEARANCE, display:"flex", flexDirection:"column" }}>
      {/* Search bar */}
      <div style={{ padding:"14px 16px 10px", position:"relative" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position:"absolute", left:30, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
          <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/>
        </svg>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
          placeholder="Search people or exercises..."
          style={{ width:"100%", background:C.divider, border:"none", borderRadius:14, padding:"12px 14px 12px 38px", fontSize:14, color:C.text, outline:"none", boxSizing:"border-box", fontFamily:F }}
        />
        {q.length > 0 && (
          <button onClick={() => setQ("")} aria-label="Clear search" style={{ position:"absolute", right:28, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:18, padding:4, lineHeight:1 }}>×</button>
        )}
      </div>

      {/* Search results */}
      {showResults && (
        <div style={{ padding:"0 16px", marginBottom:8 }}>
          {/* No card — a repeating list of rows is one item among many, not a widget. Same
              treatment as the flat lists on Profile/Workout/History (Muscle Balance, Next Up,
              Personal records). */}
          {userResults.length > 0 && (
            <>
              <SectionLabel C={C} style={{ marginTop:8 }}>People</SectionLabel>
              <div style={{ marginBottom:12 }}>
                {userResults.map((u, idx) => {
                  const amFollowing = following.includes(u.id);
                  return (
                    <FlatRow key={u.id} idx={idx} C={C} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0" }}>
                      <div onClick={() => onUserClick && onUserClick(u.id)} style={{ display:"flex", alignItems:"center", gap:12, flex:1, cursor:"pointer" }}>
                        <Avatar user={u} size={44} C={C}/>
                        <div>
                          <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{u.username}</div>
                          <div style={{ fontSize:12, color:C.sub }}>{u.name} · {u.followers?.length||0} followers</div>
                        </div>
                      </div>
                      {/* C.primary/C.onPrimary, not C.accent + hardcoded white — the same
                          near-white-on-volt bug (1.31:1 dark theme) already fixed everywhere else
                          in App.jsx, but this file lives under src/lazy/ and sim_accentbutton only
                          scans src/App.jsx, so it never saw this one. Matches Profile's own Follow
                          button, which already uses this pair. */}
                      <button onClick={() => onFollow && onFollow(u.id)} style={{
                        padding:"7px 16px", borderRadius:20, fontSize:12, fontWeight:700, flexShrink:0,
                        background: amFollowing ? "transparent" : C.primary,
                        color: amFollowing ? C.text : C.onPrimary,
                        border: `1.5px solid ${amFollowing ? C.border : C.primary}`,
                        cursor:"pointer", fontFamily:F
                      }}>{amFollowing ? "Following" : "Follow"}</button>
                    </FlatRow>
                  );
                })}
              </div>
            </>
          )}
          {exerciseResults.length > 0 && (
            <>
              <SectionLabel C={C} style={{ marginTop:8 }}>Exercises</SectionLabel>
              <div style={{ marginBottom:12 }}>
                {exerciseResults.map((ex, idx) => (
                  <FlatRow key={ex.name} idx={idx} C={C} onClick={() => setViewingExercise(ex.name)} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0" }}>
                    <div style={{ width:40, height:40, borderRadius:12, background:C.divider, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <MuscleIcon muscle={ex.muscle||""} size={26} name={ex.name} C={C}/>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:500, color:C.text }}>{ex.name}</div>
                      <div style={{ fontSize:12, color:C.sub }}>{ex.muscle}</div>
                    </div>
                    {(store.prs||{})[ex.name] && (
                      <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:C.gold, fontWeight:700, fontFamily:MONO }}><Icon name="trophy" size={12} color={C.gold}/> {store.prs[ex.name]} {store.unit||"lbs"}</div>
                    )}
                    <span style={{ fontSize:14, color:C.sub }}>›</span>
                  </FlatRow>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Default discover view */}
      {!showResults && (
        <div style={{ padding:"4px 16px 0", flex:1, display:"flex", flexDirection:"column" }}>
          {/* Quick access cards */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
            {/* The accent ring + lift that Quick Start uses, at HALF strength. These are the two
                doors out of Discover, so they should read as doors — but Quick Start is the one
                primary action on the whole tracker tab, and if every card glows equally the glow
                stops meaning anything. Same language, quieter: a thinner ring (33 vs 55 alpha) and
                a shallower lift, so side by side the hierarchy still reads. */}
            <button onClick={() => setSubTab("activity")} style={{
              position:"relative", background:C.surface, color:C.text,
              border:`1px solid ${C.accent}33`, borderRadius:16, padding:"18px 16px",
              boxShadow:`0 0 0 1px ${C.accent}0d, 0 4px 14px -8px ${C.accent}4d`,
              cursor:"pointer", textAlign:"left", fontFamily:F,
              display:"flex", flexDirection:"column", alignItems:"flex-start", gap:14,
            }}>
              <div style={{ width:32, height:32, borderRadius:10, background:C.primary, color:C.onPrimary, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Icon name="activity" size={18} color={C.onPrimary}/>
              </div>
              <div>
                <div style={{ fontSize:14, fontWeight:700, letterSpacing:-0.3 }}>Friends Activity</div>
                {/* A static "Weekly stats" caption under every account, forever, is the generic
                    UI-kit-card tell — show the real number once there's one to show. */}
                <div style={{ fontSize:11, opacity:0.65, marginTop:3 }}>{following.length > 0 ? `${following.length} following` : "Weekly stats"}</div>
              </div>
              <ThemeMark C={C} size={19} top={9} right={9}/>
            </button>
            <button onClick={() => setSubTab("groups")} style={{
              position:"relative", background:C.surface, color:C.text,
              border:`1px solid ${C.accent}33`, borderRadius:16, padding:"18px 16px",
              boxShadow:`0 0 0 1px ${C.accent}0d, 0 4px 14px -8px ${C.accent}4d`,
              cursor:"pointer", textAlign:"left", fontFamily:F,
              display:"flex", flexDirection:"column", alignItems:"flex-start", gap:14,
            }}>
              <div style={{ width:32, height:32, borderRadius:10, background:C.divider, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Icon name="users" size={18} color={C.text}/>
              </div>
              <div>
                <div style={{ fontSize:14, fontWeight:700, letterSpacing:-0.3 }}>Groups</div>
                <div style={{ fontSize:11, color:C.sub, marginTop:3 }}>{(store.groups?.length || 0) > 0 ? `${store.groups.length} joined` : "Private crews"}</div>
              </div>
              <ThemeMark C={C} size={19} top={9} right={9}/>
            </button>
          </div>

          {following.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.sub, letterSpacing:0.8 }}>LEADERBOARD</div>
                {boardMode === "close" && (
                  <button onClick={() => setShowCloseFriendPicker(true)} style={{
                    background:"none", border:"none", cursor:"pointer", fontFamily:F,
                    fontSize:12, fontWeight:700, color:C.accent, padding:0,
                  }}>Edit</button>
                )}
              </div>
              {/* All Friends / Close Friends toggle */}
              <div style={{ display:"flex", gap:6, marginBottom:12, background:C.divider, borderRadius:12, padding:3 }}>
                {[{ id:"all", label:"All Friends" }, { id:"close", label:"Close Friends" }].map(t => (
                  <button key={t.id} onClick={() => setBoardMode(t.id)} style={{
                    flex:1, padding:"8px 0", borderRadius:9, border:"none", cursor:"pointer", fontFamily:F,
                    fontSize:12, fontWeight:700, letterSpacing:-0.1,
                    background: boardMode===t.id ? C.bg : "transparent",
                    color: boardMode===t.id ? C.text : C.sub,
                    boxShadow: boardMode===t.id ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                  }}>{t.label}</button>
                ))}
              </div>
              {boardMode === "close" && closeFriends.length === 0 ? (
                <div className="seshd-float" style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:18, padding:"28px 20px", textAlign:"center" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:4 }}>No close friends yet</div>
                  <div style={{ fontSize:12, color:C.sub, marginBottom:16, lineHeight:1.4 }}>Pick up to {CLOSE_FRIENDS_MAX} people for a smaller, private leaderboard.</div>
                  <button onClick={() => setShowCloseFriendPicker(true)} style={{
                    background:C.primary, color:C.onPrimary, border:"none", borderRadius:12, padding:"11px 22px",
                    fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:F,
                  }}>Choose close friends</button>
                </div>
              ) : (
              <div className="seshd-float" style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:18, overflow:"hidden" }}>
                {(() => {
                  // The six big barbell compounds, using the EXACT names from EXERCISE_DB
                  // (verified — e.g. "Overhead Press (Barbell)", not "Overhead Press").
                  const ALL_LIFTS = ["Barbell Bench Press","Barbell Back Squat","Deadlift","Overhead Press (Barbell)","Barbell Row","Hip Thrust (Barbell)"];
                  // For each canonical lift, also recognise common user-typed variants so
                  // their PR counts on the leaderboard. Adding new aliases here is safe —
                  // we take the MAX of any match, so the canonical name still wins if both exist.
                  const LIFT_ALIASES = {
                    "Barbell Bench Press": ["Bench Press","Flat Barbell Bench","Flat Bench"],
                    "Barbell Back Squat": ["Back Squat","Low Bar Squat","High Bar Squat","Squat"],
                    "Deadlift": ["Conventional Deadlift","Sumo Deadlift","Trap Bar Deadlift"],
                    "Overhead Press (Barbell)": ["Overhead Press","OHP","Standing Barbell OHP","Standing OHP","Standing Press","Strict Press","Military Press","Barbell OHP","Barbell Overhead Press"],
                    "Barbell Row": ["Barbell Bent-Over Row","Barbell Bent Over Row","Bent-Over Row","Bent Over Row","Bent-Over Barbell Row","Bent Over Barbell Row","Pendlay Row","Yates Row"],
                    // NOTE: machine hip thrust variants are deliberately excluded here — a machine's
                    // leverage lets people move much more weight than a free barbell, so merging them
                    // makes an old machine PR permanently bury a real, current barbell PR (reported bug).
                    "Hip Thrust (Barbell)": ["Hip Thrust","Barbell Hip Thrust","Glute Bridge (Barbell)"],
                  };
                  // Resolve the best (max) PR from canonical name + any alias the user may have used.
                  // Case-insensitive so "(machine)" vs "(Machine)" and other casings all match.
                  const bestPR = (prMap, canonical) => {
                    if (!prMap) return null;
                    const wanted = [canonical, ...(LIFT_ALIASES[canonical] || [])].map(s => s.toLowerCase());
                    const candidates = Object.keys(prMap)
                      .filter(k => wanted.includes(k.toLowerCase()))
                      .map(k => prMap[k])
                      .filter(v => v != null && v > 0);
                    if (candidates.length === 0) return null;
                    return Math.max(...candidates);
                  };
                  const lifts = showAllLifts ? ALL_LIFTS : ALL_LIFTS.slice(0, 3);
                  // Which friends populate the board: everyone you follow, or just close friends.
                  const boardFriends = boardMode === "close" ? closeFriends : following;
                  return lifts.map((exName, i) => {
                  // Real numbers only. Your PR comes from store.prs; friends' PRs come from
                  // u.prs (loaded on this screen via the effect above). Both are stored in lbs
                  // and converted to the viewer's unit. Anyone without loaded PR data shows "—".
                  const rows = [...store.users.filter(u => boardFriends.includes(u.id)), store.users.find(u => u.id === currentUserId)]
                    .filter(Boolean)
                    .map(u => {
                      let val = null;
                      if (u.id === currentUserId) {
                        const lbs = bestPR(store.prs, exName);
                        if (lbs) val = unit === "lbs" ? Math.round(lbs) : Math.round(cvt(lbs, "lbs", "kg"));
                      } else {
                        const lbs = bestPR(u.prs, exName);
                        if (lbs) val = unit === "lbs" ? Math.round(lbs) : Math.round(cvt(lbs, "lbs", "kg"));
                      }
                      return { u, val };
                    })
                    // Sort highest first; nulls last
                    .sort((a, b) => (b.val ?? -1) - (a.val ?? -1));
                  // Friendlier display label (drop the parenthetical qualifier)
                  const label = exName.replace(" (Barbell)", "").replace("Barbell ", "");
                  // Does anyone have a real number? Used to decide whether to crown a leader.
                  const hasLeader = rows.length > 0 && rows[0].val != null;
                  // Show the top 5. If "you" rank outside the top 5, pin your row at the
                  // bottom with your true rank so you always see where you stand.
                  const TOP_N = 5;
                  const myIndex = rows.findIndex(r => r.u.id === currentUserId);
                  const visible = rows.slice(0, TOP_N).map((r, ri) => ({ ...r, rank: ri }));
                  const pinned = (myIndex >= TOP_N) ? { ...rows[myIndex], rank: myIndex, _pinned: true } : null;
                  return (
                  <div key={exName} style={{ padding:"14px 16px", borderBottom: i < lifts.length-1 ? `1px solid ${C.divider}` : "none" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:C.text, letterSpacing:-0.2 }}>{label}</div>
                      <div style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1.5 }}>{(unit||"lbs").toUpperCase()}</div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {[...visible, ...(pinned ? [pinned] : [])].map(({ u, val, rank, _pinned }) => {
                        const isLeader = hasLeader && rank === 0;
                        const isMe = u.id === currentUserId;
                        return (
                          <div key={u.id} style={{
                            display:"flex", alignItems:"center", gap:10,
                            padding:"7px 10px", borderRadius:11,
                            background: isLeader ? C.accentSoft : (isMe ? C.divider : "transparent"),
                            border: isLeader ? `1px solid ${C.accent}30` : "1px solid transparent",
                            marginTop: _pinned ? 4 : 0,
                            borderTop: _pinned ? `1px dashed ${C.border}` : undefined,
                          }}>
                            {/* Rank */}
                            <div style={{
                              width:18, fontSize:11, fontWeight:800, fontFamily:MONO, flexShrink:0,
                              color: isLeader ? C.accent : C.muted, textAlign:"center",
                            }}>{val != null ? rank + 1 : "·"}</div>
                            <Avatar user={u} size={22} C={C}/>
                            <span style={{ fontSize:13, fontWeight: isMe ? 700 : 500, color: C.text, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {(u.name || u.username || "Lifter").split(" ")[0]}{isMe ? " (you)" : ""}
                            </span>
                            <span style={{ fontSize:15, fontFamily:MONO, fontWeight:700, fontVariantNumeric:"tabular-nums", color: val != null ? (isLeader ? C.accent : C.text) : C.muted }}>
                              {val != null ? val : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                  });
                })()}
                <button onClick={() => setShowAllLifts(v => !v)} style={{
                  width:"100%", padding:"13px 16px", borderTop:`1px solid ${C.divider}`,
                  background:"none", border:"none", cursor:"pointer", fontFamily:F,
                  fontSize:12, fontWeight:700, color:C.accent, textAlign:"center", letterSpacing:-0.1,
                }}>{showAllLifts ? "Show less" : "Show all 6 lifts"}</button>
              </div>
              )}
            </div>
          )}

          {/* Close Friends picker modal — portaled so it escapes the tab-swipe track's
              transform-as-containing-block, which broke its full-screen sizing/centering. */}
          {showCloseFriendPicker && createPortal((
            <div onClick={() => setShowCloseFriendPicker(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
              <div onClick={e => e.stopPropagation()} className="seshd-scale-enter" style={{ background:C.surface, borderRadius:20, width:"100%", maxWidth:420, maxHeight:"80dvh", display:"flex", flexDirection:"column", overflow:"hidden", border:`1px solid ${C.overlayEdge}`, boxShadow:"0 20px 60px rgba(0,0,0,0.45)" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 18px 12px", borderBottom:`1px solid ${C.divider}` }}>
                  <div>
                    <div style={{ fontSize:15, fontWeight:800, color:C.text }}>Close Friends</div>
                    <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>{closeFriends.length}/{CLOSE_FRIENDS_MAX} selected</div>
                  </div>
                  <button onClick={() => setShowCloseFriendPicker(false)} style={{ fontSize:14, fontWeight:700, color:C.text, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Done</button>
                </div>
                <div style={{ overflowY:"auto", flex:1, padding:"6px 0" }}>
                  {following.length === 0 ? (
                    <div style={{ padding:"28px 20px", textAlign:"center", fontSize:13, color:C.sub }}>Follow people first, then add them here.</div>
                  ) : following.map(fid => store.users.find(u => u.id === fid)).filter(Boolean).map(u => {
                    const picked = closeFriends.includes(u.id);
                    const atCap = !picked && closeFriends.length >= CLOSE_FRIENDS_MAX;
                    return (
                      <button key={u.id} onClick={() => !atCap && toggleCloseFriend(u.id)} style={{
                        width:"100%", display:"flex", alignItems:"center", gap:12, padding:"11px 18px",
                        background:"none", border:"none", cursor: atCap ? "default" : "pointer", fontFamily:F,
                        opacity: atCap ? 0.45 : 1, textAlign:"left",
                      }}>
                        <Avatar user={u} size={40} C={C}/>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.name || u.username}</div>
                          <div style={{ fontSize:12, color:C.sub, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>@{u.username}</div>
                        </div>
                        <div style={{
                          width:24, height:24, borderRadius:"50%", flexShrink:0,
                          border:`2px solid ${picked ? C.accent : C.border}`, background: picked ? C.primary : "transparent",
                          display:"flex", alignItems:"center", justifyContent:"center",
                        }}>
                          {picked && <Icon name="check" size={13} color="#fff"/>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ), document.body)}

          {(() => {
            const suggested = store.users.filter(u => u.id !== currentUserId);
            // No one to suggest yet (new user, few accounts, or offline). This used to be the
            // same icon-in-a-rounded-square + headline + subtext recipe as every other empty
            // state — and the icon was a literal duplicate of the "Groups" tile's icon two rows
            // above it. Dropped the icon entirely and gave the prompt a real action instead of
            // just text: reuses the same share-profile flow as the profile screen's own share
            // button, so tapping it actually does something rather than just restating "share
            // your profile" as a sentence with no button behind it.
            if (!suggested.length) return (
              // Centered in whatever room is left below the cards/leaderboard, instead of sitting
              // pinned under them with the rest of the screen just empty — this is the ONLY thing
              // on the screen at this point for a cold-start guest, so it should read as the
              // screen's content, not as a caption trailing off above dead space.
              <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", textAlign:"center", padding:"18px 24px 8px" }}>
                <div style={{ fontSize:13, color:C.sub, lineHeight:1.5, marginBottom:12, maxWidth:280 }}>
                  No one to suggest yet — search for friends above, or share your profile so they can find you.
                </div>
                <button onClick={() => {
                  if (store.isPublic !== true) {
                    toast("Turn on 'Public profile' in Settings to share your link", "info");
                    haptic("warn");
                    return;
                  }
                  const link = `${window.location.origin}/u/${currentUserId}`;
                  shareLink({ title: "My Seshd profile", url: link }, () => toast("Profile link copied", "success"));
                  haptic("tap");
                }} style={{
                  background:C.surface, border:`1px solid ${C.border}`, borderRadius:12,
                  padding:"10px 18px", fontSize:13, fontWeight:700, color:C.text, cursor:"pointer",
                  fontFamily:F, display:"inline-flex", alignItems:"center", gap:8,
                }}>
                  <Icon name="share" size={15} color={C.text}/> Share your profile
                </button>
              </div>
            );
            return (<>
              <SectionLabel C={C}>Suggested people</SectionLabel>
              <div>
                {suggested.map((u, idx) => {
                  const isF = following.includes(u.id);
                  return (
                    <FlatRow key={u.id} idx={idx} C={C} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0" }}>
                      <Avatar user={u} size={46} C={C} onClick={() => onUserClick(u.id)}/>
                      <div style={{ flex:1, cursor:"pointer", minWidth:0 }} onClick={() => onUserClick(u.id)}>
                        <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{u.username}</div>
                        <div style={{ fontSize:12, color:C.sub, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.name}{u.bio ? ` · ${u.bio}` : ""}</div>
                      </div>
                      {/* Same C.accent + hardcoded white bug as the search-results Follow button
                          above — see its comment. */}
                      <button onClick={() => toggleFollow(u.id)} style={{
                        padding:"7px 16px", background:isF?"transparent":C.primary,
                        border:`1.5px solid ${isF?C.border:C.primary}`, borderRadius:20,
                        fontSize:12, fontWeight:700, color:isF?C.text:C.onPrimary,
                        cursor:"pointer", flexShrink:0, fontFamily:F
                      }}>{isF?"Following":"Follow"}</button>
                    </FlatRow>
                  );
                })}
              </div>
            </>);
          })()}
        </div>
      )}
    </div>
  );
}

// GroupsScreen and FriendsActivityScreen used to live in App.jsx, but they're reached only from
// here (Discover's "groups"/"activity" pushed sub-screens) — moved in Aug 24, 2026 so they and
// GroupDetail's own lazy import ship only in this already-lazy chunk instead of App.jsx's eager
// main bundle.

function GroupsScreen({ store, setStore, currentUserId, C, onBack, token }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [activeGroup, setActiveGroup] = useState(null);
  const myGroups = (store.groups || []).filter(g => (g.members||g.member_ids||[]).includes(currentUserId));

  // UNREAD DOTS FOR GROUPS. Group posts are fetched inside GroupDetail, so this list had no idea
  // anything had happened in them — you had to open each one to find out. One query gets the
  // newest post per group (RLS already restricts it to groups you belong to), and it is compared
  // against a per-group "last opened" stamp. Your OWN posts never mark a group unread.
  const [groupLastSeen, setGroupLastSeen] = useState(() => {
    try { return JSON.parse(localStorage.getItem("seshd_group_seen") || "{}"); } catch { return {}; }
  });
  const [groupNewest, setGroupNewest] = useState({});
  // ONLY REAL SERVER IDS. `createGroup` puts a local `uid()` into store.groups the moment you tap
  // Create, before the insert returns — and `groups.id` is a uuid column, so splicing that into
  // `group_id=in.(…)` makes PostgREST reject the WHOLE query with 22P02. Measured: one temp id and
  // every group lost its dot until the next reload, because the catch below swallows the 400.
  const isServerId = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const unreadIds = myGroups.map(g => g.id).filter(isServerId);
  const groupIds = unreadIds.join(",");
  useEffect(() => {
    if (!token || !unreadIds.length) return;
    let cancelled = false;
    (async () => {
      // ONE QUERY PER GROUP, not one shared query with a row cap. A single
      // `in.(…)&order=created_at.desc&limit=200` returns the newest 200 rows ACROSS your groups,
      // so one chatty group swallows the whole budget and a quiet group's genuine unread post is
      // never seen — measured with 200 posts in one group and 1 in another: 1 dot, expected 2.
      // There is no per-group ordering in PostgREST, so the cap is a hard ceiling rather than a
      // tuning knob. `limit=1` per group is exact, and people belong to a handful of groups.
      const results = await Promise.all(unreadIds.map(async (gid) => {
        try {
          const rows = await sb.query(
            `group_posts?group_id=eq.${gid}&user_id=neq.${currentUserId}&select=created_at&order=created_at.desc&limit=1`,
            {}, token);
          const ts = Array.isArray(rows) && rows[0] ? new Date(rows[0].created_at).getTime() : NaN;
          return [gid, Number.isFinite(ts) ? ts : null];
        } catch (e) { return [gid, null]; }   // a missing dot is not worth an error toast
      }));
      if (cancelled) return;
      const newest = {};
      for (const [gid, ts] of results) if (ts) newest[gid] = ts;
      setGroupNewest(newest);
    })();
    return () => { cancelled = true; };
  }, [token, groupIds, currentUserId]);
  const markGroupSeen = (gid) => {
    setGroupLastSeen(prev => {
      const next = { ...prev, [gid]: Date.now() };
      try { localStorage.setItem("seshd_group_seen", JSON.stringify(next)); } catch {}
      return next;
    });
  };
  // A group you have NEVER opened should not scream about every post that predates you seeing it,
  // but it should still show that there is something in there — so an unseen group counts as
  // unread only if it has any post at all from someone else.
  const groupHasUnread = (gid) => {
    const newest = groupNewest[gid];
    if (!newest) return false;
    const seen = groupLastSeen[gid];
    return !seen || newest > seen;
  };

  async function createGroup() {
    if (!newName) return;
    const tempId = uid();
    const localGroup = { id: tempId, name: newName, description: newDesc, createdBy: currentUserId, members: [currentUserId], icon: "🏋️" };
    setStore(p => ({ ...p, groups: [...(p.groups || []), localGroup] }));
    setShowCreate(false); setNewName(""); setNewDesc("");
    if (token) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/groups`, {
          method: "POST",
          headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Prefer": "return=representation" },
          body: JSON.stringify({ name: newName, description: newDesc, created_by: currentUserId, member_ids: [currentUserId], icon: "🏋️" })
        });
        if (res.ok) {
          const data = await res.json();
          const dbGroup = Array.isArray(data) ? data[0] : data;
          if (dbGroup?.id) {
            // Replace temp id with real UUID from DB
            setStore(p => ({ ...p, groups: p.groups.map(g => g.id === tempId ? { ...g, id: dbGroup.id } : g) }));
          }
        }
      } catch {}
    }
  }

  async function updateGroupMembers(groupId, newMembers) {
    setStore(p => ({ ...p, groups: p.groups.map(gr => gr.id !== groupId ? gr : { ...gr, members: newMembers, member_ids: newMembers }) }));
    if (token) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/groups?id=eq.${groupId}`, {
          method: "PATCH",
          headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ member_ids: newMembers })
        });
      } catch {}
    }
  }

  if (activeGroup) {
    const g = (store.groups || []).find(x => x.id === activeGroup);
    if (!g) { setActiveGroup(null); return null; }
    const members = (g.members||[]).map(mid => store.users.find(u => u.id === mid)).filter(Boolean);
    const notMembers = store.users.filter(u => !(g.members||[]).includes(u.id) && u.id !== currentUserId);
    return <Suspense fallback={null}><GroupDetail
      g={g} members={members} notMembers={notMembers}
      currentUserId={currentUserId} store={store} setStore={setStore} C={C} token={token}
      onBack={() => setActiveGroup(null)}
      onUpdateMembers={updateGroupMembers}
      onLeave={() => { updateGroupMembers(g.id, (g.members||[]).filter(m => m !== currentUserId)); setActiveGroup(null); }}
    /></Suspense>;
  }

  return (
    <div style={{ overflowY:"auto", flex:1, paddingBottom:NAV_CLEARANCE }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", borderBottom:`1px solid ${C.divider}` }}>
        {onBack && <button onClick={onBack} aria-label="Back" style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.text, padding:"11px 14px 11px 2px" }}>‹</button>}
        <div style={{ flex:1, fontSize:18, fontWeight:700, color:C.text }}>Groups</div>
        <button onClick={() => setShowCreate(true)} style={{
          background:C.primary, color:C.onPrimary, border:"none", borderRadius:6,
          padding:"6px 12px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F
        }}>+ New</button>
      </div>
      <div style={{ padding:"16px 14px" }}>
      <div style={{ fontSize:12, color:C.sub, marginBottom:16, lineHeight:1.5 }}>
        Private groups for your gym crew or teammates. Only members see activity inside.
      </div>
      {!myGroups.length && (
        <div style={{
          background:"none", border:`1px dashed ${C.border}`,
          borderRadius:12, padding:"26px", textAlign:"center"
        }}>
          <div style={{ marginBottom:10, display:"flex", justifyContent:"center" }}><Icon name="users" size={32} color={C.sub}/></div>
          <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>No groups yet</div>
          <div style={{ fontSize:12, color:C.sub, marginBottom:14 }}>Create one for your gym crew or team</div>
          <button onClick={() => setShowCreate(true)} style={{
            background:C.primary, color:C.onPrimary, border:"none", borderRadius:8,
            padding:"9px 18px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F
          }}>Create Group</button>
        </div>
      )}
      {myGroups.map(g => (
        <div key={g.id} onClick={() => { markGroupSeen(g.id); setActiveGroup(g.id); }} style={{
          border:`1px solid ${groupHasUnread(g.id) ? `${C.accent}55` : C.border}`, borderRadius:10, padding:"14px",
          marginBottom:8, cursor:"pointer"
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:11, marginBottom:g.description?6:0 }}>
            <div style={{ position:"relative", flexShrink:0 }}>
              <div style={{ width:38, height:38, borderRadius:10, background:C.accentSoft, display:"flex", alignItems:"center", justifyContent:"center" }}><Icon name="users" size={19} color={C.accent}/></div>
              {groupHasUnread(g.id) && (
                <span aria-label="New posts" style={{ position:"absolute", top:-3, right:-3, width:11, height:11, borderRadius:"50%", background:C.accent, border:`2px solid ${C.bg}` }}/>
              )}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight: groupHasUnread(g.id) ? 700 : 600, color:C.text }}>{g.name}</div>
              <div style={{ fontSize:11, color: groupHasUnread(g.id) ? C.accent : C.sub, marginTop:1 }}>
                {groupHasUnread(g.id) ? "New posts" : `${g.members.length} member${g.members.length===1?"":"s"}`}
              </div>
            </div>
            <span style={{ fontSize:16, color:C.sub }}>›</span>
          </div>
          {g.description && <div style={{ fontSize:12, color:C.textDim, lineHeight:1.4 }}>{g.description}</div>}
        </div>
      ))}

      <Sheet open={showCreate} onClose={() => setShowCreate(false)} z={300} dragHandle
        panelStyle={{ background:C.bg, borderRadius:"16px 16px 0 0", padding:"18px 18px 32px", borderTop:`1px solid ${C.overlayEdge}` }}>
        {showCreate && (
          <>
            <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:14 }}>New Group</div>
            <input
              value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Group name"
              style={{ width:"100%", background:C.divider, border:"none", borderRadius:8, padding:"11px 14px", fontSize:14, color:C.text, outline:"none", marginBottom:10, boxSizing:"border-box", fontFamily:F }}
            />
            <textarea
              value={newDesc} onChange={e => setNewDesc(e.target.value)}
              placeholder="What's this group for?"
              rows={2}
              style={{ width:"100%", background:C.divider, border:"none", borderRadius:8, padding:"11px 14px", fontSize:13, color:C.text, outline:"none", marginBottom:14, boxSizing:"border-box", resize:"none", fontFamily:F }}
            />
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex:1, padding:"11px", background:"none", border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:13, cursor:"pointer", fontFamily:F }}>Cancel</button>
              <button onClick={createGroup} style={{ flex:1, padding:"11px", background:C.primary, border:"none", borderRadius:8, color:C.onPrimary, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:F }}>Create</button>
            </div>
          </>
        )}
      </Sheet>
      </div>
    </div>
  );
}

function FriendsActivityScreen({ store, currentUserId, C, unit, onBack, onUserClick, token }) {
  const me = store.users.find(u => u.id === currentUserId);
  const following = me?.following || [];
  const friends = [currentUserId, ...following].map(id => store.users.find(u => u.id === id)).filter(Boolean);

  // Stats keyed by user_id: { sessions, volume, prs, streak, loaded }
  const [friendStats, setFriendStats] = useState({});

  function computeMyStats() {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    let sessions = 0, volume = 0;
    const history = store.history || {};
    for (const dk of Object.keys(history)) {
      const dayMs = new Date(dk + "T12:00:00").getTime();
      if (dayMs < weekAgo) continue;
      const daySessions = Object.values(history[dk] || {});
      sessions += daySessions.length;
      // Per-session cvt: a session's unit is stamped per session because it can change, so raw
      // addition would mix kg and lbs totals for anyone who has switched.
      volume += daySessions.reduce((a, s) => a + cvt(sessionVolume(s), s.unit || "lbs", unit || "lbs"), 0);
    }
    const ws = calcWeeklyStreak(store.workoutDates || {}, store.weeklyTarget || 3);
    // PRs THIS WEEK — not `Object.keys(store.prs).length`, which is every exercise you have EVER
    // set a PR on. Under a heading that reads "THIS WEEK" that rendered as "57 PRs" for a lifter
    // with 57 lifts on record, whatever they had actually done that week. `prEvents` is the dated
    // PR-hit log written at finish and is what Wrapped already counts; dedupe by exercise so an
    // exercise that set a weight AND an e1RM PR in one session counts once.
    const prNamesThisWeek = new Set(
      (store.prEvents || [])
        .filter(e => e?.date && dateFromKey(e.date).getTime() >= weekAgo)
        .map(e => e.name)
    );
    return { sessions, volume: Math.round(volume), streak: ws.count, prs: prNamesThisWeek.size, loaded:true };
  }

  // Compute stats for one friend from their fetched workout_history rows.
  // friendUnit: the unit the friend tracks in ("lbs" or "kg"). Volume gets
  // converted to the viewer's unit so all rows compare apples-to-apples.
  function computeFriendStats(rows, prCount, friendUnit = "lbs", friendWeeklyTarget = 3) {
    const viewerUnit = unit || "lbs";
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    let sessions = 0, volume = 0;
    // workoutDates set built from all rows for streak calculation
    const workoutDates = {};
    (rows || []).forEach(row => {
      const dk = row.workout_date || (row.created_at ? dKey(new Date(row.created_at)) : null);
      if (!dk) return;
      workoutDates[dk] = true;
      // This-week count
      const dayMs = new Date(dk + "T12:00:00").getTime();
      if (dayMs >= weekAgo) {
        sessions += 1;
        const exercises = row.exercises || [];
        volume += sessionVolume(row);
      }
    });
    // Convert to viewer's unit so the volume number is meaningful across friends
    if (friendUnit !== viewerUnit) {
      volume = cvt(volume, friendUnit, viewerUnit);
    }
    // The FRIEND's own weekly target, not the viewer's — a friend genuinely hitting their own
    // goal (e.g. 2x/week) read as streak-broken here whenever the signed-in viewer's own target
    // (e.g. 5x/week) was higher, because store.weeklyTarget is always the viewer's.
    const ws = calcWeeklyStreak(workoutDates, friendWeeklyTarget || 3);
    return { sessions, volume: Math.round(volume), streak: ws.count, prs: prCount ?? 0, loaded:true };
  }

  // Fetch real stats for each friend (parallel). Requires RLS policy allowing
  // followers to read workout_history.user_id IN (your_following_ids). If RLS
  // blocks the read, the fetch resolves to an empty array and we show "—".
  useEffect(() => {
    if (!token) return;
    // Always compute own stats locally — independent of whether you have friends
    setFriendStats(prev => ({ ...prev, [currentUserId]: computeMyStats() }));

    const friendIds = following.filter(id => id !== currentUserId);
    if (friendIds.length === 0) return;

    let cancelled = false;
    async function loadFriends() {
      const weekAgoISO = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
      // Batch-fetch all friends' last 2 weeks of history (2 weeks gives enough data for streak calc)
      try {
        const idList = friendIds.join(",");
        // Fetch in parallel: workout history + PR counts + units per friend
        // unit needed so we can convert their volume to my unit (most users mix kg/lbs)
        const [rows, prCounts, profiles] = await Promise.all([
          sb.query(
            `workout_history?user_id=in.(${idList})&workout_date=gte.${weekAgoISO}&select=user_id,workout_date,exercises,created_at`,
            {}, token
          ).catch(() => []),
          // WINDOWED. Without the date filter this counted every row a friend has ever had —
          // one per exercise they have ever PR'd — and printed it under "THIS WEEK".
          // `updated_at` is only truthful because of the personal_records_touch_updated_at
          // trigger: the client upserts {user_id, exercise_name, weight_lbs} with
          // merge-duplicates, and PostgREST's on-conflict UPDATE touches only the columns in the
          // payload, so before that trigger this column froze at the row's first insert.
          sb.query(
            `personal_records?user_id=in.(${idList})&updated_at=gte.${new Date(Date.now() - 7 * 86400000).toISOString()}&select=user_id`,
            {}, token
          ).catch(() => []),
          sb.query(
            `public_profiles?id=in.(${idList})&select=id,unit,weekly_target`,
            {}, token
          ).catch(() => []),
        ]);
        if (cancelled) return;

        // Group rows by user_id
        const byUser = {};
        (rows || []).forEach(r => {
          if (!byUser[r.user_id]) byUser[r.user_id] = [];
          byUser[r.user_id].push(r);
        });
        // Count PRs per user
        const prByUser = {};
        (prCounts || []).forEach(p => { prByUser[p.user_id] = (prByUser[p.user_id] || 0) + 1; });
        // Friend's unit and weekly target (default lbs / 3)
        const unitByUser = {};
        const targetByUser = {};
        (profiles || []).forEach(p => { unitByUser[p.id] = p.unit || "lbs"; targetByUser[p.id] = p.weekly_target || 3; });

        // Compute stats per friend — convert their volume into viewer's unit, but score their
        // streak against THEIR OWN weekly target, not the viewer's.
        const next = {};
        friendIds.forEach(fid => {
          const friendUnit = unitByUser[fid] || "lbs";
          next[fid] = computeFriendStats(byUser[fid] || [], prByUser[fid] || 0, friendUnit, targetByUser[fid] || 3);
        });
        setFriendStats(prev => ({ ...prev, ...next }));
      } catch (e) {
        devWarn("friend stats sync failed:", e);
      }
    }
    loadFriends();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, following.join(",")]);

  return (
    <div style={{ overflowY:"auto", flex:1, paddingBottom:NAV_CLEARANCE }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", borderBottom:`1px solid ${C.divider}` }}>
        {onBack && <button onClick={onBack} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.text, padding:"0 8px 0 0" }}>&#8249;</button>}
        <div style={{ flex:1, fontSize:18, fontWeight:700, color:C.text }}>Friends Activity</div>
      </div>
      <div style={{ padding:"14px" }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.sub, letterSpacing:1, marginBottom:12 }}>THIS WEEK</div>
        {friends.map((u) => {
          const isMe = u.id === currentUserId;
          const cached = friendStats[u.id];
          const stats = cached || { sessions:"—", volume:"—", streak:0, prs:"—", loaded:false };
          const showStreakBadge = stats.loaded && stats.streak > 0;
          return (
            <div key={u.id} style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:"14px", marginBottom:10, background: isMe ? C.accentSoft : C.bg }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                <button onClick={() => onUserClick && onUserClick(u.id)} style={{ background:"none", border:"none", padding:0, cursor:"pointer" }}>
                  <Avatar user={u} size={40} C={C}/>
                </button>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{isMe ? "You" : u.name}</div>
                  <div style={{ fontSize:11, color:C.sub }}>@{u.username}</div>
                </div>
                {showStreakBadge && (
                  <div style={{ background:"#f97316", borderRadius:20, padding:"3px 10px", fontSize:12, fontWeight:700, color:"#fff", display:"inline-flex", alignItems:"center", gap:4 }}><Icon name="flame" size={12} color="#fff"/> {stats.streak}</div>
                )}
              </div>
              <div style={{ display:"flex", gap:0, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
                {[
                  ["Sessions", stats.sessions],
                  [`Volume (${(unit||"lbs")})`, stats.loaded && stats.volume > 1000 ? (stats.volume/1000).toFixed(1)+"k" : stats.volume],
                  ["PRs", stats.prs],
                ].map(([label, val], j) => (
                  <div key={label} style={{ flex:1, padding:"10px 6px", textAlign:"center", borderRight: j<2 ? `1px solid ${C.divider}` : "none" }}>
                    {!stats.loaded && !isMe ? (
                      <Skeleton width={28} height={17} radius={4} C={C} style={{ margin:"2px auto 4px" }}/>
                    ) : (
                      <div style={{ fontSize:17, fontWeight:800, color: isMe ? C.accent : C.text, fontFamily:MONO }}>{val}</div>
                    )}
                    <div style={{ fontSize:10, color:C.sub, marginTop:2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {friends.length <= 1 && (
          <div style={{ textAlign:"center", padding:"30px 24px", color:C.sub, fontSize:13 }}>
            <div style={{ marginBottom:12, display:"flex", justifyContent:"center" }}><Icon name="users" size={32} color="currentColor"/></div>
            <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:6 }}>No friends followed yet</div>
            <div style={{ fontSize:12, lineHeight:1.5 }}>
              Follow people in the Discover tab to see their weekly stats here.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
