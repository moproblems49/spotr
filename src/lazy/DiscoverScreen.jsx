// Lazy-loaded: the Discover tab (search, leaderboard, suggested people, plus its two pushed
// sub-screens Groups and Friends Activity, and the Exercise Detail sheet reached from search).
// Not the default landing tab, so this only needs to load once someone actually switches to it.
import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  F, MONO, Icon, Avatar, MuscleIcon, NAV_CLEARANCE, toast, haptic, cvt, sb, devWarn,
  shareLink, EXERCISE_DB, getDiscoverSubTab, setDiscoverSubTabValue,
  GroupsScreen, FriendsActivityScreen, ExerciseDetail,
} from "../App.jsx";

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
    <div style={{ overflowY:"auto", flex:1, paddingBottom:NAV_CLEARANCE }}>
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
              <div style={{ fontSize:11, fontWeight:700, color:C.sub, letterSpacing:1, padding:"8px 0 10px" }}>PEOPLE</div>
              <div style={{ marginBottom:12 }}>
                {userResults.map((u, idx) => {
                  const amFollowing = following.includes(u.id);
                  return (
                    <div key={u.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0", borderTop: idx > 0 ? `1px solid ${C.divider}` : "none" }}>
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
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {exerciseResults.length > 0 && (
            <>
              <div style={{ fontSize:11, fontWeight:700, color:C.sub, letterSpacing:1, padding:"8px 0 10px" }}>EXERCISES</div>
              <div style={{ marginBottom:12 }}>
                {exerciseResults.map((ex, idx) => (
                  <div key={ex.name} onClick={() => setViewingExercise(ex.name)} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0", borderTop: idx > 0 ? `1px solid ${C.divider}` : "none", cursor:"pointer" }}>
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
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Default discover view */}
      {!showResults && (
        <div style={{ padding:"4px 16px 0" }}>
          {/* Quick access cards */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
            {/* The accent ring + lift that Quick Start uses, at HALF strength. These are the two
                doors out of Discover, so they should read as doors — but Quick Start is the one
                primary action on the whole tracker tab, and if every card glows equally the glow
                stops meaning anything. Same language, quieter: a thinner ring (33 vs 55 alpha) and
                a shallower lift, so side by side the hierarchy still reads. */}
            <button onClick={() => setSubTab("activity")} style={{
              background:C.surface, color:C.text,
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
            </button>
            <button onClick={() => setSubTab("groups")} style={{
              background:C.surface, color:C.text,
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
              <div onClick={e => e.stopPropagation()} className="seshd-scale-enter" style={{ background:C.bg, borderRadius:20, width:"100%", maxWidth:420, maxHeight:"80dvh", display:"flex", flexDirection:"column", overflow:"hidden" }}>
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
              <div style={{ padding:"18px 2px 8px" }}>
                <div style={{ fontSize:13, color:C.sub, lineHeight:1.5, marginBottom:12 }}>
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
              <div style={{ fontSize:12, fontWeight:700, color:C.sub, letterSpacing:0.8, marginBottom:12 }}>SUGGESTED PEOPLE</div>
              <div>
                {suggested.map((u, idx, arr) => {
                  const isF = following.includes(u.id);
                  return (
                    <div key={u.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0", borderTop: idx > 0 ? `1px solid ${C.divider}` : "none" }}>
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
                    </div>
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
