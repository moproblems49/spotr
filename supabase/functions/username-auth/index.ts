// username-auth — sign in (or start a password reset) with a USERNAME, without ever handing the
// account's email address back to the client.
//
// WHY THIS EXISTS
// The app lets you sign in with a username, which needs a username -> email resolution because
// Supabase auth keys on email. That used to be done client-side by calling the SECURITY DEFINER
// RPC `email_for_username` with the public anon key. It worked, but it meant anyone at all --
// signed out, no account, just curl -- could POST a username and get back that person's real email
// address. Usernames are public (feed, search, profiles), so every user's email was harvestable by
// walking the list. The original comment on that code said it existed so the email column wouldn't
// have to be world-readable; the RPC re-opened exactly the same door from another side.
//
// Now the resolution happens HERE, with the service role, and only the resulting session crosses
// the wire. `email_for_username` has had EXECUTE revoked from anon/authenticated, so the client
// cannot perform the lookup even if it wanted to.
//
// SECURITY NOTES
// - Unknown username and wrong password return the SAME generic error. Otherwise this becomes a
//   username-existence oracle, which is the thing we just closed.
// - The password check goes through the real /auth/v1/token endpoint, so Supabase's own brute-force
//   rate limiting applies. Doing the comparison in SQL would have created an unthrottled
//   credential-testing oracle -- worse than the leak it replaced.
// - Recovery always answers {ok:true} whether or not the account exists, matching the app's
//   "if an account exists, we've sent a link" copy.
// - The password is never logged.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// One generic failure for every "we won't tell you why" case.
const INVALID = { error: "invalid_credentials", message: "That username or password is incorrect." };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

  const action = String(body.action || "signin");
  const username = String(body.username || "").trim();
  if (!username) return json(INVALID, 400);
  // An email here means the caller should have used the normal auth endpoints directly; refuse
  // rather than quietly acting as an open proxy for arbitrary email addresses.
  if (username.includes("@")) return json({ error: "use_email_endpoint" }, 400);

  // Resolve username -> email with the SERVICE ROLE. This value never enters a response.
  let email: string | null = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/email_for_username`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_username: username }),
    });
    if (r.ok) {
      const raw = await r.json();
      if (typeof raw === "string") email = raw || null;
      else if (raw && typeof raw === "object") email = (raw.email_for_username ?? raw.email ?? null) as string | null;
    }
  } catch { /* fall through to the generic failure */ }

  if (action === "recover") {
    const redirectTo = String(body.redirectTo || "https://spotr-drab.vercel.app");
    // Always report success — revealing "no such user" here would undo the enumeration fix.
    if (email) {
      try {
        await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
          method: "POST",
          headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
      } catch { /* still answer ok */ }
    }
    return json({ ok: true });
  }

  // ── sign in ──────────────────────────────────────────────────────────────────────────────────
  const password = String(body.password || "");
  if (!password) return json(INVALID, 400);
  if (!email) return json(INVALID, 400);   // same shape as a wrong password, deliberately

  try {
    const t = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const session = await t.json();
    if (!t.ok || !session?.access_token) {
      // Pass through a rate-limit signal so the app can say something useful, but nothing else.
      if (t.status === 429) return json({ error: "rate_limited", message: "Too many attempts. Try again shortly." }, 429);
      return json(INVALID, 400);
    }
    return json(session);
  } catch {
    return json({ error: "server_error" }, 500);
  }
});
