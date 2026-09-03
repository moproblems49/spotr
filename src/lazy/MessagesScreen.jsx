// Lazy-loaded: the Messages inbox (MessagesScreen) and one open thread (ChatView). Both only
// render behind AppInner's showMessages/chatPeerId gates — most sessions never open either.
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  F, DISPLAY, Icon, Avatar, Spinner, PullToRefresh, haptic, toast, sb,
  loadSession, saveSession, reportContent, SharedPostLink, postIdInText,
} from "../App.jsx";

// Run an authed REST query; if it fails (most often an expired access token — the documented
// foreground-refresh race), refresh the session once and retry before giving up. Both screens
// here poll on intervals with their own access_token prop, which can go stale mid-session.
async function queryWithRetry(path, opts, token) {
  const tok = token || loadSession()?.access_token;
  try {
    return await sb.query(path, opts, tok);
  } catch (e) {
    const saved = loadSession();
    if (!saved?.refresh_token) throw e;
    const fresh = await sb.refreshToken(saved.refresh_token);
    const merged = { ...saved, ...fresh };
    saveSession(merged);
    return await sb.query(path, opts, merged.access_token);
  }
}

function fmtMsgTime(ts) {
  const d = new Date(ts), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const days = Math.floor((now - d) / 86400000);
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// Per-user thread-list cache — reopening Messages shows the list instantly while the fresh
// fetch runs, instead of a spinner.
let _msgListCache = { uid: null, rows: null };

// A thread's one-line preview. A shared post's body carries a raw /p/<uuid> URL, and printing it
// here gave the list rows like "You: A workout on Seshd http://…/p/4444…" — the chat bubble
// renders that as a card, and the list had no equivalent. Caught only once the Messages list
// stopped being unmounted behind an open chat, which is exactly why it sat there: nothing could
// see it, including the suite that asserts no raw URL is shown.
function previewText(text) {
  if (!postIdInText(text)) return text;
  const first = String(text || "").split("\n").map(l => l.trim()).filter(l => l && !/https?:\/\//i.test(l))[0];
  return first ? `${first} · Shared a post` : "Shared a post";
}

export function MessagesScreen({ store, currentUserId, token, C, onBack, onOpenChat, paused = false }) {
  const [rows, setRows] = useState(() => (_msgListCache.uid === currentUserId ? _msgListCache.rows : null)); // null = loading
  const [search, setSearch] = useState("");        // conversation filter (shown once threads grow)
  const [composeOpen, setComposeOpen] = useState(false); // pencil → people picker
  const [composeQ, setComposeQ] = useState("");
  const aliveRef = useRef(true);
  const load = useCallback(async () => {
    const tok = token || loadSession()?.access_token;
    if (!tok) { setRows([]); return; }
    try {
      const ms = await queryWithRetry(`messages?or=(sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId})&order=created_at.desc&limit=300`, {}, tok);
      if (Array.isArray(ms)) _msgListCache = { uid: currentUserId, rows: ms };
      if (aliveRef.current) setRows(Array.isArray(ms) ? ms : []);
    } catch (e) { if (aliveRef.current) setRows(r => (r === null ? [] : r)); }
  }, [currentUserId, token]);
  // ★ DON'T POLL A LIST NOBODY CAN SEE. This screen used to UNMOUNT when a chat opened (the chat
  // was an early return); now it stays mounted underneath, so its 10s/300-row poll was running
  // for the whole conversation on top of ChatView's own 3s poll — roughly six extra fetches a
  // minute, of a screen the user cannot see. Not a correctness bug, but it was a side effect of
  // making the chat an overlay rather than a decision. `load()` fires on resume so the list is
  // never stale when it comes back into view.
  useEffect(() => {
    aliveRef.current = true;
    if (paused) return () => { aliveRef.current = false; };
    load();
    const t = setInterval(load, 10000);
    return () => { aliveRef.current = false; clearInterval(t); };
  }, [load, paused]);

  const convos = useMemo(() => {
    const blocked = store.blockedUsers || [];
    const byPeer = new Map();
    for (const m of rows || []) {
      const peer = m.sender_id === currentUserId ? m.recipient_id : m.sender_id;
      if (blocked.includes(peer)) continue; // hide threads with blocked users
      if (!byPeer.has(peer)) byPeer.set(peer, { peer, last: m, unread: 0 });
      if (m.recipient_id === currentUserId && !m.read_at) byPeer.get(peer).unread++;
    }
    return [...byPeer.values()];
  }, [rows, currentUserId, store.blockedUsers]);

  // Your message-able graph: everyone you follow or who follows you, minus blocked + self.
  // Powers both the "Message a friend" suggestions and the compose people picker.
  const graphUsers = useMemo(() => {
    const meU = (store.users || []).find(u => u.id === currentUserId);
    const ids = [...new Set([...(meU?.following || []), ...(meU?.followers || [])])];
    const blocked = store.blockedUsers || [];
    return ids
      .filter(id => id !== currentUserId && !blocked.includes(id))
      .map(id => (store.users || []).find(x => x.id === id))
      .filter(Boolean);
  }, [store.users, currentUserId, store.blockedUsers]);
  // Suggestions = graph minus people you already have a thread with. Fills the (usually
  // huge) empty space under a short conversation list with a reason to use the screen.
  const friends = useMemo(() => {
    const convoSet = new Set(convos.map(c => c.peer));
    return graphUsers.filter(u => !convoSet.has(u.id)).slice(0, 8);
  }, [graphUsers, convos]);
  // Conversation filter — only worth screen space once the list has actually grown.
  const showSearch = convos.length >= 6;
  const filteredConvos = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !showSearch) return convos;
    return convos.filter(c => {
      const u = (store.users || []).find(x => x.id === c.peer);
      return (u?.name || "").toLowerCase().includes(q) || (u?.username || "").toLowerCase().includes(q)
        || (c.last?.text || "").toLowerCase().includes(q);
    });
  }, [convos, search, showSearch, store.users]);
  const composeResults = useMemo(() => {
    const q = composeQ.trim().toLowerCase();
    const list = q ? graphUsers.filter(u => (u.name || "").toLowerCase().includes(q) || (u.username || "").toLowerCase().includes(q)) : graphUsers;
    return list.slice(0, 50);
  }, [graphUsers, composeQ]);

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"calc(env(safe-area-inset-top) + 10px) 14px 10px", borderBottom:`1px solid ${C.divider}`, flexShrink:0 }}>
        <button onClick={onBack} aria-label="Back" style={{ fontSize:20, color:C.text, background:"none", border:"none", cursor:"pointer", padding:"12px 14px 12px 6px" }}>‹</button>
        <div style={{ fontSize:19, fontWeight:700, color:C.text, fontFamily:DISPLAY, letterSpacing:0.4, textTransform:"uppercase", flex:1 }}>Messages</div>
        <button onClick={() => { setComposeOpen(o => !o); setComposeQ(""); haptic("tap"); }} aria-label="New message"
          style={{ background:"none", border:"none", cursor:"pointer", padding:11, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
          </svg>
        </button>
      </div>
      {composeOpen ? (
        <div style={{ flex:1, minHeight:0, overflowY:"auto" }}>
          <div style={{ padding:"12px 14px 6px" }}>
            <input type="text" value={composeQ} onChange={e => setComposeQ(e.target.value)} placeholder="Search people…" autoFocus
              style={{ width:"100%", boxSizing:"border-box", padding:"10px 14px", borderRadius:12, border:`1px solid ${C.border}`, background:C.card || "transparent", color:C.text, fontSize:15, outline:"none", fontFamily:F }}/>
          </div>
          {composeResults.length === 0 && (
            <div style={{ padding:"28px 24px", textAlign:"center", color:C.sub, fontSize:13, lineHeight:1.6 }}>
              {graphUsers.length === 0 ? "Follow some lifters in Discover first — then you can message them here." : "No one matches that search."}
            </div>
          )}
          {composeResults.map(u => (
            <div key={u.id} onClick={() => { setComposeOpen(false); onOpenChat(u.id); }} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 14px", cursor:"pointer" }}>
              <Avatar user={u} size={40} C={C}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.name || u.username || "User"}</div>
                {u.username && <div style={{ fontSize:12, color:C.sub, marginTop:1 }}>@{u.username}</div>}
              </div>
              <span style={{ fontSize:16, color:C.muted }}>›</span>
            </div>
          ))}
        </div>
      ) : (
      <PullToRefresh onRefresh={load} C={C}>
      <div>
        {rows === null && <div style={{ padding:24 }}><Spinner C={C}/></div>}
        {showSearch && (
          <div style={{ padding:"10px 14px 4px" }}>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations…"
              style={{ width:"100%", boxSizing:"border-box", padding:"9px 14px", borderRadius:12, border:`1px solid ${C.border}`, background:C.card || "transparent", color:C.text, fontSize:14, outline:"none", fontFamily:F }}/>
          </div>
        )}
        {showSearch && search.trim() && filteredConvos.length === 0 && (
          <div style={{ padding:"20px 24px", textAlign:"center", color:C.sub, fontSize:13 }}>No conversations match.</div>
        )}
        {rows !== null && convos.length === 0 && friends.length === 0 && (
          <div style={{ padding:"48px 24px", textAlign:"center", color:C.sub, fontSize:13, lineHeight:1.6 }}>
            <div style={{ marginBottom:12, display:"flex", justifyContent:"center" }}><Icon name="users" size={36} color={C.sub}/></div>
            <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:6 }}>No messages yet</div>
            Follow some lifters in Discover, then message them from here or their profile.
          </div>
        )}
        {rows !== null && convos.length === 0 && friends.length > 0 && (
          <div style={{ padding:"26px 24px 6px", textAlign:"center", color:C.sub, fontSize:13, lineHeight:1.6 }}>
            <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:4 }}>No messages yet</div>
            Start one with someone you follow.
          </div>
        )}
        {filteredConvos.map(c => {
          const u = (store.users || []).find(x => x.id === c.peer);
          return (
            <div key={c.peer} onClick={() => onOpenChat(c.peer)} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", cursor:"pointer", borderBottom:`1px solid ${C.divider}` }}>
              <Avatar user={u || { name:"?", username:"unknown" }} size={46} C={C}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:8 }}>
                  <div style={{ fontSize:14, fontWeight:c.unread ? 800 : 600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u?.name || u?.username || "User"}</div>
                  <div style={{ fontSize:11, color:C.sub, flexShrink:0 }}>{fmtMsgTime(c.last.created_at)}</div>
                </div>
                <div style={{ fontSize:13, color:c.unread ? C.text : C.sub, fontWeight:c.unread ? 600 : 400, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginTop:2 }}>
                  {c.last.sender_id === currentUserId ? "You: " : ""}{previewText(c.last.text)}
                </div>
              </div>
              {c.unread > 0 && <span style={{ background:C.primary, color:C.onPrimary, borderRadius:10, minWidth:18, height:18, padding:"0 5px", fontSize:11, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{c.unread}</span>}
            </div>
          );
        })}
        {rows !== null && friends.length > 0 && (
          <div style={{ marginTop: convos.length ? 20 : 8, paddingBottom:8 }}>
            <div style={{ padding:"0 14px 6px", fontSize:11, fontWeight:700, letterSpacing:1, color:C.muted }}>MESSAGE A FRIEND</div>
            {friends.map(u => (
              <div key={u.id} onClick={() => onOpenChat(u.id)} style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 14px", cursor:"pointer" }}>
                <Avatar user={u} size={40} C={C}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.name || u.username || "User"}</div>
                  {u.username && <div style={{ fontSize:12, color:C.sub, marginTop:1 }}>@{u.username}</div>}
                </div>
                <span style={{ padding:"6px 14px", borderRadius:999, background:C.divider, color:C.text, fontSize:12, fontWeight:700, flexShrink:0 }}>Message</span>
              </div>
            ))}
          </div>
        )}
      </div>
      </PullToRefresh>
      )}
    </div>
  );
}

// Per-peer thread cache — reopening a chat shows the conversation instantly while the
// fresh fetch runs, instead of a spinner.
const _chatThreadCache = {};
export function ChatView({ peerId, store, currentUserId, token, C, onBack, onRead }) {
  const [msgs, setMsgs] = useState(() => _chatThreadCache[peerId] || null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  // Throttle for broadcasting "I'm typing" — at most one upsert per 2.5s while the draft
  // changes. Poll-based (no websocket): the peer's 3s message poll also reads typing_status,
  // so the indicator appears within ~3s and expires 8s after the last keystroke. Best-effort:
  // everything is try/catch-silent so chat works fine if the table doesn't exist yet.
  const typingSentRef = useRef(0);
  const bottomRef = useRef(null);
  const peer = (store.users || []).find(u => u.id === peerId);
  const isBlocked = (store.blockedUsers || []).includes(peerId);
  const tok = token || loadSession()?.access_token;

  async function load() {
    // Recompute the token each call — this loop polls every 5s, so the captured
    // `tok` can expire while the chat is open; reading it fresh (and retrying on
    // failure) keeps the thread live instead of silently stalling.
    const freshTok = token || loadSession()?.access_token;
    if (!freshTok) return;
    try {
      const ms = await queryWithRetry(`messages?or=(and(sender_id.eq.${currentUserId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${currentUserId}))&order=created_at.asc&limit=300`, {}, freshTok);
      if (Array.isArray(ms)) { _chatThreadCache[peerId] = ms; setMsgs(ms); }
      // Mark incoming as read (best-effort)
      sb.query(`messages?sender_id=eq.${peerId}&recipient_id=eq.${currentUserId}&read_at=is.null`, { method:"PATCH", body: JSON.stringify({ read_at: new Date().toISOString() }) }, freshTok)
        .then(() => onRead && onRead()).catch(() => {});
      // Peer typing? (best-effort — table may not exist on older DBs)
      sb.query(`typing_status?user_id=eq.${peerId}&peer_id=eq.${currentUserId}&select=updated_at`, {}, freshTok)
        .then(rows2 => {
          const ts = Array.isArray(rows2) && rows2[0] ? new Date(rows2[0].updated_at).getTime() : 0;
          setPeerTyping(Date.now() - ts < 8000);
        }).catch(() => {});
    } catch (e) { setMsgs(m => (m === null ? [] : m)); }
  }
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block:"end" }); }, [msgs?.length, peerTyping]);

  async function send() {
    const text = draft.trim();
    if (!text || sending || !tok || isBlocked) return;
    setSending(true);
    const tmp = { id: "tmp_" + Date.now(), sender_id: currentUserId, recipient_id: peerId, text, created_at: new Date().toISOString(), _tmp: true };
    setMsgs(m => [...(m || []), tmp]);
    setDraft("");
    try {
      const res = await sb.query("messages", { method:"POST", body: JSON.stringify({ sender_id: currentUserId, recipient_id: peerId, text }) }, tok);
      const row = Array.isArray(res) ? res[0] : null;
      if (row) setMsgs(m => (m || []).map(x => x.id === tmp.id ? row : x));
      haptic("light");
    } catch (e) {
      setMsgs(m => (m || []).filter(x => x.id !== tmp.id));
      setDraft(text);
      toast("Couldn't send — check connection", "error");
    }
    setSending(false);
  }

  // The outer column pads by the keyboard's height: with Keyboard resize:"none" (see main.jsx)
  // the webview no longer shrinks, so this bottom-pinned composer would otherwise sit UNDER the
  // keyboard. `--seshd-kb` is published from keyboardWillShow/Hide, and the transition uses the
  // keyboard's OWN reported duration so the composer moves WITH it rather than jumping after it —
  // the same thing Instagram's DM composer does. Falls back to 0px on web and on any build where
  // the plugin is not synced natively, so it is inert there.
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0,
      paddingBottom:"var(--seshd-kb, 0px)",
      transition:"padding-bottom var(--seshd-kb-ms, 250ms) cubic-bezier(0.32, 0.72, 0, 1)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"calc(env(safe-area-inset-top) + 10px) 14px 10px", borderBottom:`1px solid ${C.divider}`, flexShrink:0 }}>
        <button onClick={onBack} aria-label="Back" style={{ fontSize:20, color:C.text, background:"none", border:"none", cursor:"pointer", padding:"12px 14px 12px 6px" }}>‹</button>
        <Avatar user={peer || { name:"?" }} size={32} C={C}/>
        <div style={{ fontSize:15, fontWeight:700, color:C.text, fontFamily:F, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{peer?.name || peer?.username || "User"}</div>
        <button onClick={() => reportContent({ type:"message", id:peerId, reportedUserId:peerId, label:"conversation" })} aria-label="Report conversation" style={{ fontSize:18, color:C.muted || C.sub, background:"none", border:"none", cursor:"pointer", padding:"10px 8px", letterSpacing:1, fontWeight:700, flexShrink:0 }}>···</button>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"12px 14px", display:"flex", flexDirection:"column", gap:6 }}>
        {msgs === null && <div style={{ padding:24 }}><Spinner C={C}/></div>}
        {msgs !== null && msgs.length === 0 && <div style={{ textAlign:"center", color:C.sub, fontSize:13, padding:24 }}>Say hi</div>}
        {(() => {
          // Read receipt goes under my LAST outgoing message (iMessage convention).
          const lastMineIdx = (msgs || []).reduce((acc, m, i) => (m.sender_id === currentUserId && !m._tmp ? i : acc), -1);
          return (msgs || []).map((m, i) => {
            const mine = m.sender_id === currentUserId;
            const prev = (msgs || [])[i-1];
            const gap = prev && (new Date(m.created_at) - new Date(prev.created_at) > 20*60000);
            return (
              <div key={m.id}>
                {(!prev || gap) && <div style={{ textAlign:"center", fontSize:10, color:C.sub, margin:"8px 0 4px" }}>{fmtMsgTime(m.created_at)}</div>}
                <div style={{ display:"flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth:"78%", padding:"8px 12px", borderRadius:16, borderBottomRightRadius: mine ? 5 : 16, borderBottomLeftRadius: mine ? 16 : 5,
                    background: mine ? C.primary : (C.card || C.tabBg), color: mine ? C.onPrimary : C.text,
                    fontSize:14, lineHeight:1.45, whiteSpace:"pre-wrap", wordBreak:"break-word", opacity: m._tmp ? 0.6 : 1 }}>
                    {/* A shared post arrives as text carrying a /p/<uuid> link. Rendering the raw
                        URL would make the recipient copy it into a browser to use it, so the
                        bubble becomes a tappable row instead. The message stays plain text in the
                        DB — no column, no migration, and an older client still shows something
                        sensible. */}
                    <SharedPostLink text={m.text} C={C}
                      ink={mine ? C.onPrimary : C.text}
                      tile={mine ? "rgba(255,255,255,0.16)" : (C.bg || "transparent")}/>
                  </div>
                </div>
                {i === lastMineIdx && (
                  <div style={{ textAlign:"right", fontSize:10, fontWeight:600, color:C.sub, marginTop:3, paddingRight:4 }}>
                    {m.read_at ? "Seen" : "Sent"}
                  </div>
                )}
              </div>
            );
          });
        })()}
        {peerTyping && (
          <div style={{ display:"flex", justifyContent:"flex-start" }}>
            <div style={{ padding:"10px 14px", borderRadius:16, borderBottomLeftRadius:5, background:C.card || C.tabBg, display:"flex", gap:4, alignItems:"center" }}>
              {[0,1,2].map(k => (
                <span key={k} style={{ width:6, height:6, borderRadius:3, background:C.sub, display:"inline-block",
                  animation:`seshd-pulse-soft 1.1s ease ${k * 0.18}s infinite` }}/>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>
      {isBlocked ? (
        <div style={{ padding:"14px 16px calc(env(safe-area-inset-bottom) + 14px)", borderTop:`1px solid ${C.divider}`, flexShrink:0, background:C.bg, textAlign:"center", color:C.sub, fontSize:13, lineHeight:1.5 }}>
          You've blocked this user. Unblock them from their profile to message again.
        </div>
      ) : (
      <div style={{ display:"flex", gap:8, alignItems:"flex-end", padding:"8px 12px calc(env(safe-area-inset-bottom) + 10px)", borderTop:`1px solid ${C.divider}`, flexShrink:0, background:C.bg }}>
        <input value={draft} onChange={e => {
            setDraft(e.target.value);
            const now = Date.now();
            if (e.target.value.trim() && now - typingSentRef.current > 2500) {
              typingSentRef.current = now;
              const ft = token || loadSession()?.access_token;
              if (ft) sb.query(`typing_status?on_conflict=user_id,peer_id`, { method:"POST",
                headers_extra: { Prefer: "resolution=merge-duplicates" },
                body: JSON.stringify({ user_id: currentUserId, peer_id: peerId, updated_at: new Date().toISOString() }) }, ft).catch(() => {});
            }
          }}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message…" enterKeyHint="send"
          style={{ flex:1, padding:"11px 14px", borderRadius:22, border:`1px solid ${C.border}`, background:C.card || "transparent", color:C.text, fontSize:15, outline:"none", fontFamily:F }}/>
        <button onClick={send} disabled={!draft.trim() || sending} aria-label="Send"
          style={{ width:40, height:40, borderRadius:20, border:"none", background: draft.trim() ? C.primary : C.border, color: draft.trim() ? C.onPrimary : "#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={draft.trim() ? C.onPrimary : "#fff"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      )}
    </div>
  );
}
