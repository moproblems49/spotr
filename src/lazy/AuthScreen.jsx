// Lazy-loaded: the signed-out welcome/sign-in/sign-up/reset screen. It is NEVER rendered for an
// already-signed-in session — which is nearly every app open, since a session persists in the
// iOS Keychain — so it was dead weight in the eager bundle for the overwhelming majority of opens.
import { useState } from "react";
import {
  F, DISPLAY, RADIUS, OAUTH_ENABLED, SeshdLogo, sb, track, devWarn,
  SUPABASE_URL, SUPABASE_KEY, useSwipeDismiss, blurIfTextInput,
} from "../App.jsx";

export default function AuthScreen({ onAuth, onGuest, C, initialMode = "welcome", promptReason = null }) {
  const [mode, setMode] = useState(initialMode); // "welcome" | "signin" | "signup" | "reset"
  // Remember me: pre-fill the last email used to sign in. The session itself already persists
  // (Keychain), so this just saves re-typing the address on the sign-in screen.
  const [email, setEmail] = useState(() => { try { return localStorage.getItem("seshd_remember_email") || ""; } catch { return ""; } });
  // Default ON; honor a stored opt-out so unchecking Remember me actually sticks across visits.
  const [rememberMe, setRememberMe] = useState(() => { try { return localStorage.getItem("seshd_remember_optout") !== "1"; } catch { return true; } });
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  // The form container is a fixed-height flex column with no scroll (see the sign-in/sign-up
  // return below), so on the sign-up form specifically — 4 fields plus copy, vertically CENTERED
  // rather than pinned to the top — the WKWebView keyboard covers the lower fields (Password) with
  // no way to reach them. Mo hit this live. Same fix as the rest of the app: make the container
  // scrollable and wire the same swipe-down-to-dismiss-keyboard gesture WorkoutTracker's exercise
  // scroller already uses, rather than inventing a second mechanism.
  const swipeDismissKeyboard = useSwipeDismiss(blurIfTextInput);

  // Forgot-password: always report success — never reveal whether an account exists.
  async function handleReset() {
    setError("");
    if (!email.trim()) { setError("Enter your email or username first"); return; }
    setLoading(true);
    try { await sb.recover(email); } catch (e) { /* silent by design */ }
    setResetSent(true);
    setLoading(false);
  }

  async function handleSubmit() {
    setError("");
    if (!email || !password) { setError("Email and password required"); return; }
    if (mode === "signup" && !username) { setError("Username required"); return; }
    if (mode === "signup" && username.length < 3) { setError("Username must be at least 3 characters"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      if (mode === "signup") {
        const data = await sb.signUp(email, password, username.toLowerCase().replace(/\s/g,""), name || username);
        if (data.access_token) {
          // Explicitly upsert the profile row — never rely on a DB trigger that may not exist.
          // A bare fetch RESOLVES on 4xx/5xx, so this used to check nothing at all and treat a
          // failed upsert as a silent success. Retried once (this is the second network call in
          // a row, right after signup — the single most likely moment for a mobile connection to
          // hiccup) and now actually checked. `profiles.is_public` defaults to true at the column
          // level as of this fix too, so even if both attempts fail the account still starts
          // public rather than silently private — this is belt-and-suspenders, not the only fix.
          try {
            const userId = data.user?.id;
            const uname = username.toLowerCase().replace(/\s/g,"");
            if (userId) {
              const upsertProfile = () => fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "apikey": SUPABASE_KEY,
                  "Authorization": `Bearer ${data.access_token}`,
                  "Prefer": "resolution=merge-duplicates",
                },
                body: JSON.stringify({
                  id: userId,
                  username: uname,
                  name: name || uname,
                  bio: "",
                  unit: "lbs",
                  theme: "dark",
                  is_public: true,
                  email: email,
                  seen_onboarding: false,
                }),
              });
              // upsertProfile()'s own fetch() can REJECT (a thrown transport error — the actual
              // "mobile connection hiccup" scenario this retry exists for), not just resolve with
              // a bad status. The first cut only retried on !res.ok, so a rejected first attempt
              // skipped straight past the retry into the outer catch — covered here too.
              const attempt = async () => { try { return await upsertProfile(); } catch { return null; } };
              let res = await attempt();
              if (!res || !res.ok) res = await attempt();
              if (!res || !res.ok) devWarn("profile upsert failed twice:", res ? res.status : "network error", res ? await res.text().catch(() => "") : "");
            }
          } catch (profErr) { devWarn("profile upsert:", profErr); }
          track("signup_completed");
          onAuth(data);
        } else {
          // Email confirmation is on — try signing in immediately in case it went through.
          try {
            const signInData = await sb.signIn(email, password);
            if (signInData.access_token) { onAuth(signInData); return; }
          } catch (e2) {}
          setError("Account created! Check your email to confirm, then sign in.");
          setMode("signin");
        }
      } else {
        const data = await sb.signIn(email, password);
        try {
          if (rememberMe) { localStorage.setItem("seshd_remember_email", email.trim()); localStorage.removeItem("seshd_remember_optout"); }
          else { localStorage.removeItem("seshd_remember_email"); localStorage.setItem("seshd_remember_optout", "1"); }
        } catch {}
        onAuth(data);
      }
    } catch (e) {
      // A request that never reached the server is flagged transportFailure by signIn — show a
      // friendly connection message for that, and the specific reason (e.g. "Incorrect email or
      // password") for everything the server actually answered.
      const netFail = !!(e && e.transportFailure) || (typeof navigator !== "undefined" && navigator.onLine === false);
      setError(netFail
        ? "Couldn't reach the server. Check your connection and try again."
        : (e.message || "Sign in failed. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width:"100%", background:C.divider, border:"none", borderRadius:12,
    padding:"14px 16px", fontSize:16, color:C.text, outline:"none",
    fontFamily:F, boxSizing:"border-box", marginBottom:10
  };

  // The TestFlight-phase `d1 ·` boot-diagnostic line lived here and was removed before App Store
  // submission. `setBootDiag`/`setSaveDiag` still write `seshd_boot_diag` / `seshd_kc_save`, which
  // costs nothing and is invisible — it stays the only way to find out why a boot landed on the
  // auth screen when someone reports it. Read them from storage, not off the screen.

  // ── Welcome / guest entry ────────────────────────────────────
  if (mode === "welcome") {
    return (
      <div style={{
        minHeight:"100dvh", background:C.bg, display:"flex", flexDirection:"column",
        paddingTop:"max(env(safe-area-inset-top), 32px)", paddingBottom:"calc(max(env(safe-area-inset-bottom), 34px) + 16px)",
        paddingLeft:24, paddingRight:24, position:"relative", overflowY:"auto", overflowX:"hidden",
      }}>
        {/* Soft ambient gradient — no generic blobs */}
        <div style={{
          position:"absolute", top:"-20%", right:"-30%", width:"80%", aspectRatio:"1",
          background:`radial-gradient(circle, ${C.accent}1a 0%, transparent 70%)`, pointerEvents:"none"
        }}/>
        <div style={{
          position:"absolute", bottom:"-15%", left:"-25%", width:"70%", aspectRatio:"1",
          background:`radial-gradient(circle, ${C.accent2 || C.accent}14 0%, transparent 70%)`, pointerEvents:"none"
        }}/>

        {/* Hero */}
        <div style={{ display:"flex", flexDirection:"column", position:"relative", zIndex:1, paddingTop:"4vh" }}>
          {promptReason && (
            <div style={{ marginBottom:24, padding:"14px 18px", borderRadius:14, background:C.surface, border:`1px solid ${C.accent}40` }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.sub, letterSpacing:1, marginBottom:4 }}>HEADS UP</div>
              <div style={{ fontSize:14, color:C.text, lineHeight:1.4 }}>{promptReason}</div>
            </div>
          )}

          <SeshdLogo C={C} big/>

          {/* Accent eyebrow — small uppercase kicker above the headline for a more editorial,
              premium feel. */}
          <div style={{ marginTop:30, fontSize:11, fontWeight:800, letterSpacing:2.5, color:C.sub, fontFamily:F, textTransform:"uppercase" }}>
            Built for lifters
          </div>
          {/* Display-face headline — the condensed display font reads bolder/taller than Inter and
              gives the hero real presence. */}
          <h1 style={{
            fontSize:52, fontWeight:700, color:C.text, marginTop:6, marginBottom:14,
            letterSpacing:-1.5, lineHeight:0.95, fontFamily:DISPLAY
          }}>
            Lift heavy.<br/>Track everything.
          </h1>
          <p style={{
            fontSize:15, color:C.sub, lineHeight:1.5, marginBottom:0, fontFamily:F,
            maxWidth:330
          }}>
            A gym log that actually keeps up with you. Train first — make it social later.
          </p>

          {/* Feature tiles — accent-tinted icon chips with distinct glyphs read more premium (and
              more informative) than three identical checkmarks. */}
          <div style={{ marginTop:32, display:"flex", flexDirection:"column", gap:14 }}>
            {[
              { label:"Plate calculator & 1RM, built in", icon:(
                <><line x1="4" y1="12" x2="20" y2="12"/><rect x="1" y="9" width="3" height="6" rx="1"/><rect x="20" y="9" width="3" height="6" rx="1"/><rect x="5" y="7" width="2" height="10" rx="1"/><rect x="17" y="7" width="2" height="10" rx="1"/></>
              ) },
              { label:"Auto rest timer, swipe to log", icon:(
                <><line x1="10" y1="2" x2="14" y2="2"/><line x1="12" y1="14" x2="15" y2="11"/><circle cx="12" cy="14" r="8"/></>
              ) },
              { label:"Your data stays yours", icon:(
                <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>
              ) },
            ].map((f, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:13 }}>
                <div style={{
                  width:40, height:40, borderRadius:12, background:`${C.accent}14`, border:`1px solid ${C.accent}2e`,
                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0
                }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{f.icon}</svg>
                </div>
                <div style={{ fontSize:14, color:C.text, fontWeight:500, fontFamily:F }}>{f.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Gap between the hero block and the CTAs. */}
        <div style={{ height:36 }}/>

        {/* CTAs */}
        <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", gap:10 }}>
          <button onClick={() => onGuest && onGuest()} style={{
            width:"100%", background:C.text, color:C.bg, border:"none",
            borderRadius:RADIUS.lg, padding:"18px", fontSize:16, fontWeight:800,
            cursor:"pointer", fontFamily:F, letterSpacing:-0.3,
            transition:"transform 0.1s", boxShadow:"0 10px 24px rgba(0,0,0,0.18)",
            display:"flex", alignItems:"center", justifyContent:"center", gap:9,
          }}
            onTouchStart={e => e.currentTarget.style.transform = "scale(0.98)"}
            onTouchEnd={e => e.currentTarget.style.transform = "scale(1)"}
          >
            Start Tracking
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.bg} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
          </button>
          <button onClick={() => setMode("signup")} style={{
            width:"100%", background:"transparent", color:C.text, border:`1px solid ${C.border}`,
            borderRadius:14, padding:"15px", fontSize:14, fontWeight:600,
            cursor:"pointer", fontFamily:F,
          }}>
            Create an account
          </button>
          <button onClick={() => setMode("signin")} style={{
            width:"100%", background:"transparent", color:C.sub, border:"none",
            borderRadius:14, padding:"4px", fontSize:13, fontWeight:600,
            cursor:"pointer", fontFamily:F,
          }}>
            Already have an account? <span style={{ color:C.accent, fontWeight:700 }}>Sign in</span>
          </button>
          <div style={{ textAlign:"center", marginTop:2, fontSize:11, color:C.muted, fontFamily:F }}>
            No account needed to start lifting
          </div>
        </div>
      </div>
    );
  }

  // ── Sign in / Sign up form ────────────────────────────────────
  return (
    <div style={{
      // MUST be a hard height, not minHeight. `body` is position:fixed + overflow:hidden for the
      // app's entire lifetime (including this pre-login screen), so it can never scroll — a
      // minHeight lets this container grow taller than the viewport with nowhere for the overflow
      // to go, which is exactly how the keyboard covering the Password field on sign-up became
      // unreachable: the inner form div's own overflowY:auto never engages because THIS container
      // was never actually squeezed down to the visible height in the first place.
      height:"100dvh", background:C.bg, display:"flex", flexDirection:"column",
      padding:"0 24px",
      paddingTop:"max(env(safe-area-inset-top), 20px)",
      paddingBottom:"max(env(safe-area-inset-bottom), 24px)",
    }}>
      <div style={{ display:"flex", alignItems:"center", height:48 }}>
        <button onClick={() => {
          // From the reset form, Back returns to sign-in (not the welcome screen).
          if (mode === "reset") { setMode("signin"); setError(""); setResetSent(false); return; }
          // Opened as an in-app guest gate (promptReason set): Back returns to the app, not to
          // the marketing welcome screen — a guest mid-session shouldn't land on "Start Tracking".
          if (promptReason && onGuest) { onGuest(); return; }
          setMode("welcome"); setError("");
        }} style={{
          background:"none", border:"none", padding:"10px 4px",
          display:"flex", alignItems:"center", gap:4, cursor:"pointer", fontFamily:F, color:C.text,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          <span style={{ fontSize:14, fontWeight:600 }}>Back</span>
        </button>
      </div>

      <div onScroll={blurIfTextInput} {...swipeDismissKeyboard} style={{ flex:1, minHeight:0, overflowY:"auto", WebkitOverflowScrolling:"touch", display:"flex", flexDirection:"column", maxWidth:380, width:"100%", margin:"0 auto" }}>
        {/* margin:"auto 0" on this wrapper (not justifyContent:center on the scroll container
            itself) is what centers a short form vertically while still letting a tall one
            (sign-up, with the keyboard open) scroll all the way to its own top and bottom — a
            centering flex-parent that's ALSO the scroll container clips whichever edge sticks out
            past the viewport, same shape as the alignItems:center backdrop bug elsewhere in the
            app. Auto margins collapse to 0 once there's no spare space, so this is a no-op on a
            form that already overflows. */}
        <div style={{ margin:"auto 0", width:"100%" }}>
        {/* Big centered brand mark fills the empty upper area so the screen doesn't read top-heavy-empty. */}
        <div style={{ display:"flex", justifyContent:"center", marginBottom:40 }}><SeshdLogo C={C} size={72}/></div>
        <h1 style={{
          fontSize:28, fontWeight:900, color:C.text, marginBottom:6,
          letterSpacing:-0.8, fontFamily:F
        }}>
          {mode === "signin" ? "Welcome back" : mode === "reset" ? "Reset password" : "Create your account"}
        </h1>
        <p style={{ fontSize:14, color:C.sub, marginBottom:28, fontFamily:F }}>
          {mode === "signin" ? "Sign in to sync your progress"
            : mode === "reset" ? "We'll email you a link to set a new password"
            : "Save your progress and connect with friends"}
        </p>

        {mode === "signup" && (
          <>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Full name" style={inputStyle} autoComplete="name"/>
            <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))}
              placeholder="Username" style={inputStyle}
              autoCapitalize="none" autoCorrect="off" autoComplete="username"/>
          </>
        )}
        <input value={email} onChange={e => setEmail(e.target.value)}
          /* Only sign-in accepts either identifier; sign-up and reset need a real email
             (sign-up already has its own Username field above, so "Email or username" here
             was both wrong and confusing). */
          placeholder={mode === "signin" ? "Email or username" : "Email"} type="email" style={inputStyle}
          autoCapitalize="none" autoCorrect="off" autoComplete="email"/>
        {mode !== "reset" && (
          <input value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" type="password" style={inputStyle}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}/>
        )}
        {mode === "signin" && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:-2, marginBottom:12 }}>
            <button onClick={() => setRememberMe(v => !v)} style={{
              background:"none", border:"none", cursor:"pointer", fontFamily:F, padding:"0 2px",
              display:"flex", alignItems:"center", gap:8,
            }} aria-label="Remember me" aria-pressed={rememberMe}>
              <span style={{
                width:18, height:18, borderRadius:5, flexShrink:0,
                border:`1.5px solid ${rememberMe ? C.text : C.sub}`,
                background: rememberMe ? C.text : "transparent",
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>
                {rememberMe && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.bg} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </span>
              <span style={{ fontSize:12, fontWeight:600, color:C.sub }}>Remember me</span>
            </button>
            <button onClick={() => { setMode("reset"); setError(""); setResetSent(false); }} style={{
              background:"none", border:"none", color:C.sub, fontSize:12, fontWeight:600,
              cursor:"pointer", fontFamily:F, padding:"0 2px",
            }}>Forgot password?</button>
          </div>
        )}

        {error && (
          <div style={{ fontSize:13, color:C.red, marginBottom:10, textAlign:"center", lineHeight:1.4 }}>
            {error}
          </div>
        )}
        {mode === "reset" && resetSent && (
          <div style={{ fontSize:13, color:C.green || "#22c55e", marginBottom:10, textAlign:"center", lineHeight:1.5 }}>
            If an account exists for that email, a reset link is on its way. Check your inbox (and spam).
          </div>
        )}

        <button onClick={mode === "reset" ? handleReset : handleSubmit} disabled={loading} style={{
          width:"100%", background:loading ? C.sub : C.text, color:C.bg,
          border:"none", borderRadius:12, padding:"15px",
          fontSize:15, fontWeight:700, cursor:loading?"not-allowed":"pointer",
          fontFamily:F, marginTop:6, marginBottom:14,
        }}>
          {loading ? "Please wait..."
            : mode === "signin" ? "Sign In"
            : mode === "reset" ? (resetSent ? "Resend link" : "Send reset link")
            : "Create Account"}
        </button>

        {/* App Store Guideline 1.2 (UGC): creating an account must be an explicit agreement to
            the Terms/EULA, including a stated zero-tolerance for objectionable content & abusive
            users. Links open the hosted policy pages (work in the native WebView and on web). */}
        {mode === "signup" && (
          <div style={{ fontSize:11, color:C.muted, textAlign:"center", lineHeight:1.55, margin:"-6px 0 14px", padding:"0 6px" }}>
            By creating an account you agree to our{" "}
            <a href="https://spotr-drab.vercel.app/terms.html" target="_blank" rel="noopener noreferrer" style={{ color:C.accent, fontWeight:700, textDecoration:"none" }}>Terms</a>{" "}and{" "}
            <a href="https://spotr-drab.vercel.app/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color:C.accent, fontWeight:700, textDecoration:"none" }}>Privacy Policy</a>, including a zero-tolerance policy for objectionable content and abusive behavior.
          </div>
        )}

        {/* OAuth divider */}
        {(OAUTH_ENABLED.apple || OAUTH_ENABLED.google) && (
        <div style={{ display:"flex", alignItems:"center", gap:12, margin:"6px 0 14px" }}>
          <div style={{ flex:1, height:1, background:C.border }}/>
          <div style={{ fontSize:11, color:C.muted, fontWeight:600, letterSpacing:1 }}>OR</div>
          <div style={{ flex:1, height:1, background:C.border }}/>
        </div>
        )}

        {/* OAuth buttons */}
        {OAUTH_ENABLED.apple && (
        <button onClick={async () => {
          setError("");
          setLoading(true);
          try {
            // Native iOS returns a session inline (id_token exchange); web redirects away and
            // returns null, with init() completing the sign-in on the redirect back.
            const data = await sb.signInWithApple();
            if (data?.access_token) { track("signin_apple"); onAuth(data); }
          } catch (e) {
            setError(e.message || "Apple sign-in failed.");
          } finally {
            setLoading(false);
          }
        }} disabled={loading} style={{
          width:"100%", background:"#000", color:"#fff",
          border:"none", borderRadius:12, padding:"14px",
          fontSize:14, fontWeight:600, cursor:loading?"not-allowed":"pointer",
          fontFamily:F, marginBottom:10,
          display:"flex", alignItems:"center", justifyContent:"center", gap:8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          Continue with Apple
        </button>
        )}
        {OAUTH_ENABLED.google && (
        <button onClick={() => sb.signInWithOAuth("google")} disabled={loading} style={{
          width:"100%", background:"#fff", color:"#1f1f1f",
          border:`1px solid ${C.border}`, borderRadius:12, padding:"14px",
          fontSize:14, fontWeight:600, cursor:loading?"not-allowed":"pointer",
          fontFamily:F, marginBottom:14,
          display:"flex", alignItems:"center", justifyContent:"center", gap:8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
        )}

        <button onClick={() => { setMode(m => m === "signin" ? "signup" : "signin"); setError(""); }} style={{
          width:"100%", background:"none", border:"none", color:C.sub,
          fontSize:13, cursor:"pointer", fontFamily:F, padding:8
        }}>
          {mode === "signin"
            ? <>New to Seshd? <span style={{ color:C.accent, fontWeight:700 }}>Create an account</span></>
            : <>Have an account? <span style={{ color:C.accent, fontWeight:700 }}>Sign in</span></>
          }
        </button>
        </div>
      </div>
    </div>
  );
}
