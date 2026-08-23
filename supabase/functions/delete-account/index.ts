// delete-account — permanently deletes the CALLING user's own Supabase Auth identity.
//
// WHY THIS EXISTS
// The client used to call the public self-service `DELETE /auth/v1/user` endpoint directly with
// the user's own access token. That endpoint 405s on this project (confirmed in the auth logs,
// Aug 23 2026 — Mo hit this live: deleted a test account, re-registered with the same email, and
// it skipped straight past signup/onboarding into the OLD identity) — GoTrue's self-service account
// deletion isn't available here, only the ADMIN API (`DELETE /auth/v1/admin/users/{id}`) is, and
// that requires the SERVICE ROLE key, which must never live in the client. So account deletion
// needs a small server-side hop: verify who's calling (resolved from their OWN token, the same way
// any other authenticated request proves identity), then use the service role to delete exactly
// that user's identity — never an id supplied in the request body, which would let one user delete
// another's account.
//
// The client already deletes all of the user's APP DATA (profiles/posts/history/etc.) itself
// before calling this — this function's only job is the final step: the AUTH IDENTITY. Without it,
// "Delete account" silently left the login credentials intact, so re-registering with the same
// email just logged back into the (data-wiped) old identity instead of starting fresh — exactly the
// gap Apple's account-deletion requirement (Guideline 5.1.1(v)) exists to catch, and exactly what a
// reviewer testing the deletion flow would hit too.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") || "";
  const callerToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!callerToken) return json({ error: "unauthorized" }, 401);

  // Resolve the CALLER's own identity from their OWN token — never trust an id in the request
  // body. This is the same /user endpoint the client already calls elsewhere to check "who am I".
  let callerId: string | null = null;
  try {
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${callerToken}` },
    });
    if (!who.ok) return json({ error: "unauthorized" }, 401);
    const u = await who.json();
    callerId = (u && typeof u === "object" ? u.id : null) || null;
  } catch {
    return json({ error: "server_error" }, 500);
  }
  if (!callerId) return json({ error: "unauthorized" }, 401);

  // Delete via the ADMIN API — the only endpoint on this project that actually removes the auth
  // identity. Scoped to callerId, resolved above from the caller's own token, so this can only
  // ever delete the account making the request, never anyone else's.
  try {
    const del = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${callerId}`, {
      method: "DELETE",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    // A 404 here means the identity is already gone (a retry after a partial earlier success) —
    // that's the goal state, not a failure.
    if (!del.ok && del.status !== 404) {
      const detail = await del.text().catch(() => "");
      return json({ error: "delete_failed", status: del.status, detail }, 502);
    }
    return json({ ok: true });
  } catch {
    return json({ error: "server_error" }, 500);
  }
});
