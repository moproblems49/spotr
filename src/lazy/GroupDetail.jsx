// Lazy-loaded: a group's feed/members screen, reached only from Groups -> a specific group.
// Most sessions never open a group at all, so this is dead weight in the eager bundle otherwise.
import { useState, useMemo, useRef, useEffect } from "react";
import { devError, dateFromKey, workingDone } from "../engine/core.js";
import { postWorkoutPayload, sessionVolume } from "../engine/workout.js";
import { F, MONO, Icon, Avatar, Spinner, Sheet, HrStat, toast, haptic, confirmAction, reportContent, SUPABASE_URL, SUPABASE_KEY, uploadGroupImage, signGroupImage, deleteGroupImage, timeAgo, fmtTime, hrInline, asUuidOrNull, SharedPostLink, NAV_CLEARANCE } from "../App.jsx";

export default function GroupDetail({ g, members, notMembers, currentUserId, store, setStore, C, token, onBack, onUpdateMembers, onLeave }) {
  const [tab, setTab] = useState("feed");
  const [posts, setPosts] = useState([]);
  const [postMenu, setPostMenu] = useState(null);        // post whose ··· menu is open
  const [menuConfirm, setMenuConfirm] = useState(false); // delete needs a second tap
  const [editingPost, setEditingPost] = useState(null);  // post id being caption-edited
  const [editText, setEditText] = useState("");
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
  const [pickerCaption, setPickerCaption] = useState(""); // optional caption for the group workout share
  const workoutPickerRecents = useMemo(() => {
    if (!showWorkoutPicker) return [];
    // Carry the session id — the card this creates needs it as client_id, or re-sharing the same
    // workout inserts a duplicate group post (the finish-time group share already dedups on it).
    return Object.entries(store.history||{}).sort(([a],[b])=>b.localeCompare(a)).flatMap(([d,s])=>Object.entries(s).map(([sid,sess])=>({...sess,sid,date:d}))).slice(0,10);
  }, [showWorkoutPicker, store.history]);
  const [loading, setLoading] = useState(true);
  const [caption, setCaption] = useState("");
  const [img, setImg] = useState(null);
  const [posting, setPosting] = useState(false);
  // path -> { url, exp } — the EXPIRY is stored because signGroupImage mints a 1h URL and this
  // cache used to be permanent for the component's lifetime. A group left open for over an hour
  // (a rest day spent scrolling, a phone that never sleeps) showed broken images and never
  // re-signed, because the dead entry was still a cache HIT. Treat anything inside the skew as
  // absent so the sign effect picks it up again.
  const [signedImgs, setSignedImgs] = useState({});
  // Re-runs the sign effect while the screen stays mounted, so an expiry that passes with nobody
  // touching the feed still gets refreshed. Cheap: the effect no-ops unless something needs it.
  const [signTick, setSignTick] = useState(0);
  const fileRef = useRef(null);
  const me = store.users.find(u => u.id === currentUserId);

  // Resolve a post's displayable image src. Private group photos are stored as a bare storage
  // path (no scheme) and must be signed; legacy/absolute URLs render directly; local optimistic
  // previews win while a fresh upload is in flight.
  const isStoredPath = (v) => typeof v === "string" && v.length > 0 && !/^(https?:|data:|blob:)/i.test(v);
  const resolveImg = (post) => {
    if (post._localImage) return post._localImage;
    const iu = post.image_url;
    if (!iu) return null;
    if (!isStoredPath(iu)) return iu;
    const e = signedImgs[iu];
    return e && e.exp > Date.now() ? e.url : null;
  };

  // Sign any private group-image paths that appear in the feed, and re-sign the ones about to
  // expire. signGroupImage asks for 3600s; renew at 5 minutes left so an image never blanks
  // mid-scroll.
  const SIGN_TTL_MS = 3600e3, SIGN_SKEW_MS = 300e3;
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const now = Date.now();
    const need = posts
      .map(p => p.image_url)
      .filter(iu => isStoredPath(iu) && !(signedImgs[iu] && signedImgs[iu].exp - SIGN_SKEW_MS > now));
    if (need.length === 0) return;
    (async () => {
      const entries = await Promise.all(need.map(async path => [path, await signGroupImage(path, token)]));
      if (cancelled) return;
      // Only cache SUCCESSFUL signs. A transient failure (returns null) is left uncached so the
      // next feed change re-signs it, instead of permanently blanking the image for the session.
      const ok = entries.filter(([, v]) => v);
      if (ok.length) setSignedImgs(prev => {
        const next = { ...prev };
        for (const [k, v] of ok) next[k] = { url: v, exp: Date.now() + SIGN_TTL_MS };
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [posts, token, signTick]);

  // Nudge the effect every 5 minutes. Without this, a screen nobody touches never re-evaluates
  // the expiry — the cache only got a chance to notice when `posts` changed.
  useEffect(() => {
    const id = setInterval(() => setSignTick(t => t + 1), 3e5);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Guard against a stale group's fetch landing after the user switched groups.
    // GroupDetail is reused (no key) across group switches, so without this a slow
    // fetch for the previous group can overwrite the new group's freshly-loaded feed.
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/group_posts?group_id=eq.${g.id}&select=*&order=created_at.desc`,
          { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` } }
        );
        if (cancelled) return;
        if (res.ok) {
          const raw = (await res.json()) || [];
          if (cancelled) return;
          // Merge persisted self-reactions (RLS may block self-PATCH on own group posts)
          // Handle both shapes: { selfReaction: emoji } (new) and { kudos: [userId] } (old, treat as 🔥)
          const persisted = store.historyInteractions || {};
          setPosts(raw.map(p => {
            const dbReactions = p.reactions || {};
            const selfKey = `group_${p.id}`;
            const persistedEntry = persisted[selfKey];
            let selfReaction = persistedEntry?.selfReaction;
            // Backwards compat: if old kudos array exists with current user, treat as a 🔥 reaction
            if (selfReaction === undefined && Array.isArray(persistedEntry?.kudos) && persistedEntry.kudos.includes(currentUserId)) {
              selfReaction = "🔥";
            }
            const merged = { ...dbReactions };
            if (selfReaction) merged[currentUserId] = selfReaction;
            else if (selfReaction === null) delete merged[currentUserId]; // explicit unreact
            return { ...p, _reactions: merged };
          }));
        }
      } catch {}
      if (!cancelled) setLoading(false);
    }
    if (token) load(); else setLoading(false);
    return () => { cancelled = true; };
  }, [g.id, token]);

  async function sendPost() {
    if ((!caption.trim() && !img) || !token) return;
    setPosting(true);
    try {
      let imageUrl = null;
      if (img) {
        imageUrl = await uploadGroupImage(img, token, g.id);
        if (!imageUrl) { toast("Couldn't upload photo — try again", "error"); setPosting(false); return; }
      }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/group_posts`, {
        method:"POST",
        headers:{ "apikey":SUPABASE_KEY, "Authorization":`Bearer ${token}`, "Content-Type":"application/json", "Prefer":"return=representation" },
        body: JSON.stringify({ group_id:g.id, user_id:currentUserId, type:img?"photo":"text", caption:caption.trim(), image_url:imageUrl })
      });
      if (res.ok) {
        const data = await res.json();
        const newPost = Array.isArray(data) ? data[0] : data;
        if (newPost) setPosts(p => [{ ...newPost, _localImage: img }, ...p]);
        setCaption(""); setImg(null);
      } else {
        toast("Couldn't post — try again", "error");
      }
    } catch {
      toast("Couldn't post — try again", "error");
    }
    setPosting(false);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"12px 14px", borderBottom:`1px solid ${C.divider}`, display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
        <button onClick={onBack} aria-label="Back" style={{ fontSize:20, color:C.text, background:"none", border:"none", cursor:"pointer", padding:"12px 14px" }}>‹</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:15, fontWeight:600, color:C.text }}>{g.name}</div>
          <div style={{ fontSize:11, color:C.sub }}>{(g.members||[]).length} member{(g.members||[]).length===1?"":"s"}</div>
        </div>
        <div style={{ display:"flex", gap:0, background:C.divider, borderRadius:8, padding:2 }}>
          {["feed","members"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding:"5px 12px", background:tab===t?C.bg:"transparent", color:tab===t?C.text:C.sub,
              border:"none", borderRadius:6, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:F,
              boxShadow:tab===t?"0 1px 3px rgba(0,0,0,0.1)":"none"
            }}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
          ))}
        </div>
      </div>

      {tab === "feed" && (
        <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden" }}>
          {/* Post composer */}
          <div style={{ padding:"10px 14px", borderBottom:`1px solid ${C.divider}`, flexShrink:0 }}>
            {/* Clear the value first — see the note on the composer's picker. Re-picking the same
                file after removing it fired no `change` event at all. */}
            <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => {
              const f = e.target.files[0]; e.target.value = ""; if (!f) return;
              const r = new FileReader(); r.onload = ev => setImg(ev.target.result); r.readAsDataURL(f);
            }}/>
            {img && (
              <div style={{ position:"relative", marginBottom:8 }}>
                <img src={img} style={{ width:"100%", maxHeight:180, objectFit:"cover", borderRadius:10 }}/>
                <button onClick={() => setImg(null)} aria-label="Remove image" style={{ position:"absolute", top:6, right:6, background:"rgba(0,0,0,0.6)", border:"none", color:"#fff", borderRadius:"50%", width:24, height:24, fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
              </div>
            )}
            <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
              <Avatar user={me} size={32} C={C}/>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder={`Post to ${g.name}...`}
                rows={1}
                style={{ flex:1, background:C.divider, border:"none", borderRadius:16, padding:"8px 12px", fontSize:14, color:C.text, outline:"none", fontFamily:F, resize:"none", minHeight:36 }}
              />
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
              <div style={{ display:"flex", gap:12 }}>
                {/* Photos upload to the PRIVATE group-images bucket (members-only, signed URLs) —
                    see uploadGroupImage/signGroupImage. Not the public feed bucket. */}
                <button onClick={() => fileRef.current?.click()} style={{ background:"none", border:"none", color:C.text, fontSize:13, cursor:"pointer", fontFamily:F, fontWeight:600, display:"inline-flex", alignItems:"center", gap:5 }}><Icon name="plus" size={14} color={C.accent}/> Photo</button>
                <button onClick={() => { setPickerCaption(""); setShowWorkoutPicker(true); }} style={{ background:"none", border:"none", color:C.text, fontSize:13, cursor:"pointer", fontFamily:F, fontWeight:600, display:"inline-flex", alignItems:"center", gap:5 }}><Icon name="dumbbell" size={14} color={C.accent}/> Share Workout</button>
              </div>
              <button onClick={sendPost} disabled={(!caption.trim() && !img) || posting} style={{
                background:(caption.trim()||img)?C.primary:C.divider, color:(caption.trim()||img)?C.onPrimary:C.sub,
                border:"none", borderRadius:16, padding:"6px 16px", fontSize:12, fontWeight:700,
                cursor:(caption.trim()||img)?"pointer":"default", fontFamily:F
              }}>{posting?"...":"Post"}</button>
            </div>
          </div>
          {/* Feed */}
          <div style={{ overflowY:"auto", flex:1, paddingBottom:NAV_CLEARANCE }}>
            {loading && <div style={{ padding:40 }}><Spinner C={C}/></div>}
            {!loading && posts.length === 0 && (
              <div style={{ textAlign:"center", padding:"40px 20px", color:C.sub }}>
                <div style={{ marginBottom:12, display:"flex", justifyContent:"center" }}><Icon name="users" size={36} color="currentColor"/></div>
                <div style={{ fontSize:17, fontWeight:700, color:C.text, marginBottom:6 }}>No posts yet</div>
                <div style={{ fontSize:13 }}>Be the first to post something to the group.</div>
              </div>
            )}
            {posts.filter(post => !(store.blockedUsers || []).includes(post.user_id)).map(post => {
              const author = store.users.find(u => u.id === post.user_id);
              const isMyPost = post.user_id === currentUserId;
              const myReaction = (post._reactions||{})[currentUserId];
              return (
                <div key={post.id} style={{ padding:"14px 14px", borderBottom:`1px solid ${C.divider}` }}>
                  <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                    <Avatar user={author} size={36} C={C}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:3 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{author?.username || "Unknown"}</span>
                          <span style={{ fontSize:11, color:C.muted }}>{timeAgo(new Date(post.created_at).getTime())}</span>
                        </div>
                        {isMyPost ? (
                          <button onClick={() => { setPostMenu(post); setMenuConfirm(false); }} aria-label="Post options"
                            style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:16, padding:"0 6px", letterSpacing:1, fontWeight:700 }}>···</button>
                        ) : (
                          <button onClick={() => reportContent({ type:"group_post", id:post.id, reportedUserId:post.user_id, label:"post" })} aria-label="Report post"
                            style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:16, padding:"0 6px", letterSpacing:1, fontWeight:700 }}>···</button>
                        )}
                      </div>
                      {editingPost === post.id ? (
                        <div style={{ marginBottom:8 }}>
                          <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3} autoFocus
                            style={{ width:"100%", boxSizing:"border-box", padding:"10px 12px", borderRadius:10, border:`1px solid ${C.accent}`, background:C.surface, color:C.text, fontSize:14, outline:"none", fontFamily:F, resize:"none" }}/>
                          <div style={{ display:"flex", gap:6, marginTop:6, justifyContent:"flex-end" }}>
                            <button onClick={() => setEditingPost(null)} style={{ padding:"7px 14px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:8, fontSize:12, fontWeight:600, color:C.text, cursor:"pointer", fontFamily:F }}>Cancel</button>
                            <button onClick={async () => {
                              const t = editText.trim();
                              const prevCaption = post.caption;
                              setEditingPost(null);
                              if (t === (prevCaption || "").trim() || !token) return;
                              setPosts(p => p.map(x => x.id === post.id ? { ...x, caption: t } : x));
                              try {
                                const res = await fetch(`${SUPABASE_URL}/rest/v1/group_posts?id=eq.${post.id}`, {
                                  method:"PATCH", headers:{ "apikey":SUPABASE_KEY, "Authorization":`Bearer ${token}`, "Content-Type":"application/json" },
                                  body: JSON.stringify({ caption: t })
                                });
                                // A bare fetch resolves on 4xx/5xx — unlike a thrown transport error,
                                // this used to sail past the catch below and leave the optimistic
                                // caption showing as saved when the server never actually took it.
                                if (!res.ok) throw new Error(`caption edit failed (${res.status})`);
                              } catch (e) {
                                setPosts(p => p.map(x => x.id === post.id ? { ...x, caption: prevCaption } : x));
                                toast("Couldn't save edit — check connection", "error");
                              }
                            }} style={{ padding:"7px 14px", background:C.primary, border:"none", borderRadius:8, fontSize:12, fontWeight:700, color:C.onPrimary, cursor:"pointer", fontFamily:F }}>Save</button>
                          </div>
                        </div>
                      ) : (
                        // A post shared into the group carries a /p/<uuid> link; SharedPostLink
                        // turns it into a tappable row and returns the plain text otherwise, so
                        // an ordinary caption is unaffected. Same component the chat uses — this
                        // is the second surface, not a second copy.
                        post.caption && <div style={{ fontSize:14, color:C.text, lineHeight:1.5, marginBottom:6 }}>
                          <SharedPostLink text={post.caption} C={C}/>
                        </div>
                      )}
                      {resolveImg(post) && (
                        <img src={resolveImg(post)} alt="" loading="lazy" decoding="async" style={{ width:"100%", borderRadius:12, marginBottom:8, maxHeight:320, objectFit:"cover" }}/>
                      )}
                      {post.workout && (
                        <div style={{ marginBottom:8, background:C.divider, borderRadius:12, padding:"12px 14px" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                            <div style={{ fontSize:14, fontWeight:800, color:C.text, letterSpacing:-0.2 }}>{post.workout.name}</div>
                            <div style={{ display:"flex", gap:10 }}>
                              {post.workout.duration && (
                                <div style={{ textAlign:"right" }}>
                                  <div style={{ fontSize:12, fontWeight:800, color:C.text, fontFamily:MONO }}>{Math.floor((post.workout.duration||0)/60)}m</div>
                                  <div style={{ fontSize:10, color:C.sub, letterSpacing:1 }}>TIME</div>
                                </div>
                              )}
                              {post.workout.volume > 0 && (
                                <div style={{ textAlign:"right" }}>
                                  <div style={{ fontSize:12, fontWeight:800, color:C.text, fontFamily:MONO }}>{post.workout.volume >= 1000 ? (post.workout.volume/1000).toFixed(1)+"k" : post.workout.volume}</div>
                                  <div style={{ fontSize:10, color:C.sub, letterSpacing:1 }}>VOL</div>
                                </div>
                              )}
                              <HrStat hr={post.workout.hrSummary} C={C} size={12} align="right"/>
                            </div>
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                            {(post.workout.exercises||[]).map((ex,i) => (
                              <div key={i}>
                                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                                  <span style={{ fontSize:12, fontWeight:700, color:C.text }}>{ex.name}</span>
                                  {/* Same quiet marker as the feed card. This surface kept the
                                      filled PRTag when the feed card moved to the gold trophy, so
                                      "how a per-exercise PR looks" had two answers — the
                                      N-copies-drift class, in icon form. It is also the ONLY PR
                                      marker on this card (there is no header PRTag here), so a
                                      loud chip per exercise was the repetition problem with none
                                      of the compensating signal. */}
                                  {ex.isPR && (
                                    <span role="img" aria-label="Personal record" title="Personal record"
                                      data-pr-marker="1"
                                      style={{ display:"inline-flex", lineHeight:1, flexShrink:0 }}>
                                      <Icon name="trophy" size={11} color={C.gold} strokeWidth={2.2}/>
                                    </span>
                                  )}
                                </div>
                                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                                  {(ex.sets||[]).map((s,j) => (
                                    <span key={j} style={{ fontSize:10, background:C.bg, border:`1px solid ${C.border}`, borderRadius:5, padding:"2px 6px", color:C.textDim||C.sub, fontFamily:MONO, fontWeight:600 }}>
                                      {s.w > 0 ? `${s.w}×${s.r}` : `${s.r} reps`}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Reactions */}
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        {["🔥","💪","👏","🏆"].map(emoji => {
                          const count = Object.values(post._reactions||{}).filter(r=>r===emoji).length;
                          const active = myReaction === emoji;
                          return (
                            <button key={emoji} onClick={async () => {
                              const prev = post._reactions||{};
                              const next = { ...prev };
                              if (active) delete next[currentUserId];
                              else next[currentUserId] = emoji;
                              // Optimistic local update
                              setPosts(p => p.map(x => x.id===post.id ? {...x, _reactions:next} : x));

                              // Persist to DB - RLS now allows any authenticated user to update reactions
                              if (token) {
                                try {
                                  const res = await fetch(`${SUPABASE_URL}/rest/v1/group_posts?id=eq.${post.id}`, {
                                    method:"PATCH",
                                    headers:{
                                      "apikey":SUPABASE_KEY,
                                      "Authorization":`Bearer ${token}`,
                                      "Content-Type":"application/json",
                                    },
                                    body: JSON.stringify({ reactions: next })
                                  });
                                  if (!res.ok) {
                                    devError("reaction save failed:", res.status, await res.text().catch(()=>""));
                                    toast("Couldn't save reaction", "error");
                                    setPosts(p => p.map(x => x.id===post.id ? {...x, _reactions:prev} : x));
                                  }
                                } catch (e) {
                                  devError("reaction save error:", e);
                                  toast("Couldn't save reaction", "error");
                                  setPosts(p => p.map(x => x.id===post.id ? {...x, _reactions:prev} : x));
                                }
                              }
                            }} style={{
                              background: active ? `${C.accent}20` : C.divider,
                              border: `1px solid ${active ? C.primary : "transparent"}`,
                              borderRadius:20, padding:"3px 10px", fontSize:12, cursor:"pointer",
                              display:"flex", alignItems:"center", gap:4, fontFamily:F,
                              color: active ? C.accent : C.sub
                            }}>
                              {emoji}{count > 0 && <span style={{ fontSize:11, fontWeight:600 }}>{count}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "members" && (
        <div style={{ overflowY:"auto", flex:1, padding:"14px", paddingBottom:20 }}>
          {g.description && <div style={{ fontSize:13, color:C.sub, marginBottom:16, lineHeight:1.5 }}>{g.description}</div>}
          <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:10 }}>MEMBERS · {members.length}</div>
          {members.map(u => (
            <div key={u.id} style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 0", borderBottom:`1px solid ${C.divider}` }}>
              <Avatar user={u} size={38} C={C}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:500, color:C.text }}>{u.name}{u.id===currentUserId?" (You)":""}</div>
                <div style={{ fontSize:11, color:C.sub }}>@{u.username}</div>
              </div>
              {u.id === g.createdBy && <span style={{ fontSize:10, color:C.gold, fontWeight:600 }}>ADMIN</span>}
            </div>
          ))}
          {currentUserId === g.createdBy && notMembers.length > 0 && (
            <>
              {/* Only the group creator manages membership (enforced server-side too). */}
              <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, margin:"16px 0 10px" }}>INVITE</div>
              {notMembers.map(u => (
                <div key={u.id} style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 0", borderBottom:`1px solid ${C.divider}` }}>
                  <Avatar user={u} size={36} C={C}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:500, color:C.text }}>{u.name}</div>
                    <div style={{ fontSize:11, color:C.sub }}>@{u.username}</div>
                  </div>
                  <button onClick={() => onUpdateMembers(g.id, [...(g.members||[]), u.id])} style={{
                    background:C.primary, color:C.onPrimary, border:"none", borderRadius:6,
                    padding:"5px 12px", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:F
                  }}>Invite</button>
                </div>
              ))}
            </>
          )}
          <button onClick={() => confirmAction({ title:`Leave ${g.name}?`, message:"You'll lose access to this group's feed and will need to be re-invited to rejoin.", confirmLabel:"Leave", destructive:true, onConfirm:onLeave })} style={{ width:"100%", background:"none", color:C.red, border:"none", padding:"14px", fontSize:13, cursor:"pointer", marginTop:16, fontFamily:F }}>Leave Group</button>
        </div>
      )}

      {showWorkoutPicker && (() => {
        const recents = workoutPickerRecents;
        return (
          <div onClick={() => setShowWorkoutPicker(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 16px" }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:C.surface, borderRadius:20, width:"100%", maxWidth:420, maxHeight:"75dvh", display:"flex", flexDirection:"column", border:`1px solid ${C.overlayEdge}`, boxShadow:"0 20px 60px rgba(0,0,0,0.45)", overflow:"hidden" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 18px 12px", borderBottom:`1px solid ${C.divider}` }}>
                <div style={{ fontSize:14, fontWeight:700, color:C.text }}>Share a Workout</div>
                <button onClick={() => setShowWorkoutPicker(false)} aria-label="Close" style={{ width:28, height:28, borderRadius:"50%", background:C.divider, border:"none", cursor:"pointer", fontSize:14, color:C.text }}>×</button>
              </div>
              {recents.length > 0 && (
                <div style={{ padding:"12px 14px 4px" }}>
                  <textarea value={pickerCaption} onChange={e => setPickerCaption(e.target.value.slice(0, 280))}
                    placeholder="Add a caption… (optional)" rows={2}
                    style={{ width:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 12px", fontSize:13, color:C.text, fontFamily:F, resize:"none", outline:"none", boxSizing:"border-box", lineHeight:1.4 }}/>
                  <div style={{ fontSize:11, color:C.muted, margin:"6px 2px 0" }}>Then tap a workout below to post it.</div>
                </div>
              )}
              <div style={{ overflowY:"auto", flex:1, padding:"10px 14px 14px" }}>
                {recents.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"40px 20px", color:C.sub }}>
                    <div style={{ marginBottom:12, display:"flex", justifyContent:"center" }}><Icon name="dumbbell" size={30} color="currentColor"/></div>
                    <div style={{ fontSize:13 }}>Complete a workout first to share it</div>
                  </div>
                ) : recents.map((sess,i) => {
                  // workingDone: this count sits next to sessionVolume(), which excludes warmups.
                  const done = (sess.exercises||[]).reduce((a,ex)=>a+workingDone(ex.sets).length,0);
                  const vol = sessionVolume(sess);
                  return (
                    <div key={i} onClick={async () => {
                      if (!token) return;
                      setShowWorkoutPicker(false);
                      setPosting(true);
                      const cap = pickerCaption.trim();
                      setPickerCaption("");
                      // A ninth hand-rolled copy of the card payload lived here: `filter(s => s.done)`
                      // with no warmup exclusion (so warmups were listed on the group card) and no
                      // `volume` at all (so the card's VOL tile was suppressed, `volume > 0` being
                      // false). The picker ROW ten lines above already used workingDone() +
                      // sessionVolume() — the row you tapped and the card it made disagreed.
                      const workoutData = postWorkoutPayload(sess.exercises, store.prs, null, sess.unit || "lbs");
                      try {
                        // `group_posts` has UNIQUE (group_id, client_id), and the finish-time group
                        // share already writes that row with the same id — so sending client_id
                        // WITHOUT an upsert target turns "share this again" into a permanent 409
                        // and a "Couldn't share — try again" that never succeeds. Mirror the
                        // finish-time call: upsert on conflict, and only when we actually have an id.
                        const gcid = asUuidOrNull(sess.sid);
                        const r = await fetch(`${SUPABASE_URL}/rest/v1/group_posts${gcid ? "?on_conflict=group_id,client_id" : ""}`, {
                          method:"POST",
                          headers:{ "apikey":SUPABASE_KEY, "Authorization":`Bearer ${token}`, "Content-Type":"application/json", "Prefer": gcid ? "resolution=merge-duplicates,return=representation" : "return=representation" },
                          // hrSummary rides along when the session has it. This path shares a PAST
                          // workout, so Apple Health has long since resolved — unlike the
                          // finish-time share, whose payload is frozen before readWorkoutHeartRate
                          // returns. Without it the picker row said "♥ 142 avg" and the card it
                          // produced showed none, the same row/card disagreement noted above.
                          body: JSON.stringify({ group_id:g.id, user_id:currentUserId, type:"workout", caption:cap, ...(gcid ? { client_id: gcid } : {}), workout:{ ...workoutData, name: sess.dayName, duration: sess.duration, ...(sess.hrSummary ? { hrSummary: sess.hrSummary } : {}) } })
                        });
                        if (r.ok) {
                          const d = await r.json();
                          const p = Array.isArray(d)?d[0]:d;
                          if(p) setPosts(prev=>[p,...prev]);
                          toast("Shared to group", "success");
                        } else {
                          toast("Couldn't share — try again", "error");
                        }
                      } catch {
                        toast("Couldn't share — try again", "error");
                      } finally {
                        setPosting(false);
                      }
                    }} style={{ padding:"12px 14px", border:`1px solid ${C.border}`, borderRadius:12, marginBottom:8, cursor:"pointer", background:C.surface }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{sess.dayName}</div>
                          <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>
                            {dateFromKey(sess.date).toLocaleDateString("en",{weekday:"short",month:"short",day:"numeric"})} · {fmtTime(sess.duration||0)} · {done} set{done === 1 ? "" : "s"}
                            {sess.hrSummary?.avg ? <span style={{ color:C.red, fontWeight:600 }}>{hrInline(sess.hrSummary)}</span> : null}
                          </div>
                          <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>
                            {(sess.exercises||[]).filter(e=>e.name).slice(0,3).map(e=>e.name).join(" · ")}
                            {(sess.exercises||[]).length > 3 ? ` +${(sess.exercises||[]).length-3}` : ""}
                          </div>
                        </div>
                        <div style={{ fontSize:13, color:C.accent, fontWeight:700, fontFamily:MONO, flexShrink:0, marginLeft:10 }}>{Math.round(vol).toLocaleString()}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Post options sheet: edit caption / confirm-then-delete */}
      <Sheet open={!!postMenu} onClose={() => setPostMenu(null)} z={600} backdrop="rgba(0,0,0,0.55)"
        panelStyle={{ background:C.bg, borderRadius:"18px 18px 0 0", borderTop:`1px solid ${C.overlayEdge}`, padding:"10px 14px calc(env(safe-area-inset-bottom) + 14px)", fontFamily:F }}>
        {postMenu && (
          <>
            <div style={{ width:36, height:4, borderRadius:2, background:C.border, margin:"0 auto 12px" }}/>
            <button onClick={() => { setEditingPost(postMenu.id); setEditText(postMenu.caption || ""); setPostMenu(null); }}
              style={{ width:"100%", padding:"14px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, fontSize:14, fontWeight:600, color:C.text, cursor:"pointer", fontFamily:F, marginBottom:8 }}>
              Edit caption
            </button>
            <button onClick={async () => {
              if (!menuConfirm) { setMenuConfirm(true); haptic("medium"); return; }
              const id_ = postMenu.id;
              // Grab the image path (if any) BEFORE the row is gone — image_url only exists on
              // the row we're about to delete, and posts state is about to filter it out too.
              const deletedGroupImage = posts.find(x => x.id === id_)?.image_url;
              setPostMenu(null);
              if (!token) return;
              try {
                // `fetch` RESOLVES on 4xx/5xx — only a transport failure rejects. Without this
                // check a 403 (RLS) or 5xx fell into the success path: the image was destroyed, the
                // row was dropped from local state, and the user was told "Post deleted" for a post
                // still sitting on the server. Never toast success from the optimistic path.
                const res = await fetch(`${SUPABASE_URL}/rest/v1/group_posts?id=eq.${id_}`, {
                  method:"DELETE", headers:{ "apikey":SUPABASE_KEY, "Authorization":`Bearer ${token}` }
                });
                if (!res.ok) throw new Error("group_post_delete_http_" + res.status);
                // Bare paths only — a legacy absolute URL predates the private bucket and has
                // nothing of ours to clean up.
                if (deletedGroupImage && !/^https?:/i.test(deletedGroupImage)) {
                  deleteGroupImage(deletedGroupImage, token);
                }
                setPosts(p => p.filter(x => x.id !== id_));
                toast("Post deleted", "success");
              } catch (e) { toast("Couldn't delete post — check connection", "error"); }
            }}
              style={{ width:"100%", padding:"14px", background: menuConfirm ? C.red : C.surface, border:`1px solid ${menuConfirm ? C.red : C.border}`, borderRadius:12, fontSize:14, fontWeight:700, color: menuConfirm ? "#fff" : C.red, cursor:"pointer", fontFamily:F, marginBottom:8, transition:"all 0.15s ease" }}>
              {menuConfirm ? "Tap again to confirm delete" : "Delete post"}
            </button>
            <button onClick={() => setPostMenu(null)}
              style={{ width:"100%", padding:"14px", background:"transparent", border:"none", fontSize:14, fontWeight:600, color:C.sub, cursor:"pointer", fontFamily:F }}>
              Cancel
            </button>
          </>
        )}
      </Sheet>
    </div>
  );
}
