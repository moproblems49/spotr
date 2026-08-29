// delete-account — permanently deletes the CALLING user's own Supabase Auth identity, their
// uploaded FILES, and resolves the fate of any GROUPS they created.
//
// WHY THIS EXISTS
// The client used to call the public self-service `DELETE /auth/v1/user` endpoint directly with
// the user's own access token. That endpoint 405s on this project (confirmed in the auth logs,
// Aug 23 2026) — GoTrue's self-service account deletion isn't available here, only the ADMIN API
// (`DELETE /auth/v1/admin/users/{id}`) is, and that requires the SERVICE ROLE key, which must
// never live in the client. So account deletion needs a small server-side hop: verify who's
// calling (resolved from their OWN token), then use the service role to delete exactly that
// user's identity — never an id supplied in the request body.
//
// STORAGE (added Aug 29 2026). Deleting an account cascaded the DATABASE rows and left every file
// the user had uploaded sitting in storage forever. Those are personal data (progress photos,
// avatars) and the `images` / `post-images` buckets are PUBLICLY READABLE, so a deleted user's
// photos stayed at live public URLs. Both key objects under a `{userId}/` prefix, so this
// enumerates exactly the caller's own files from the id resolved above.
//
// GROUPS (added Aug 29 2026). `group-images` keys objects under `{groupId}/`, not `{userId}/`, so
// a user's group photos cannot be found by a user prefix. Two different cases:
//   - photos the caller posted into SOMEONE ELSE'S group: the CLIENT deletes those, reading the
//     paths out of `group_posts.image_url` before its row-delete loop and destroying the objects
//     after the rows are gone.
//   - groups the caller CREATED: handled here, see handleCreatedGroups.
//
// Storage is cleared BEFORE the identity is deleted, because a failure to clear files must not
// leave a live login behind. If file deletion fails we still delete the identity and report the
// counts, rather than stranding a half-deleted account.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Buckets whose object names begin with the owner's user id. `group-images` is deliberately absent
// — see the note above.
const USER_PREFIXED_BUCKETS = ["images", "post-images"];

// List every object under a `<prefix>/` folder in one bucket. The list endpoint returns names
// RELATIVE to the prefix, so they are re-qualified before deletion. Paged, because a long-standing
// account can hold more than one page of photos and a silent truncation would leave files behind.
async function listPrefixObjects(url: string, key: string, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const LIMIT = 100;
  for (let offset = 0; offset < 5000; offset += LIMIT) {
    const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: `${prefix}/`, limit: LIMIT, offset }),
    });
    if (!res.ok) break;
    const rows = await res.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows) if (r && typeof r.name === "string" && r.name) out.push(`${prefix}/${r.name}`);
    if (rows.length < LIMIT) break;
  }
  return out;
}

// Delete a batch of objects from one bucket. Returns true on success.
async function deleteObjects(url: string, key: string, bucket: string, paths: string[]): Promise<boolean> {
  if (!paths.length) return true;
  try {
    const del = await fetch(`${url}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: paths }),
    });
    return del.ok;
  } catch { return false; }
}

// ── Groups the caller CREATED ────────────────────────────────────────────────────────────────
// Default (`deleteGroups` false/absent): the `trg_transfer_groups_on_profile_delete` BEFORE DELETE
// trigger hands each group with other members to its longest-standing remaining member, so the
// group and everyone else's posts survive. Only a group where the caller is the SOLE member dies,
// via the ordinary cascade.
//
// `deleteGroups: true` is the caller explicitly choosing to destroy their groups instead. That is
// safe to accept from the request body BECAUSE IT NAMES NOTHING — it selects a policy for the
// caller's own groups, resolved from their own token; it can never reach another user's group.
//
// Either way, a group that is about to disappear takes its `{groupId}/` images with it, and once
// the rows are gone nothing knows those paths — so they are swept FIRST, while the rows still name
// them. That is the one ordering that has to be right here: the objects outlive their only index.
async function handleCreatedGroups(url: string, key: string, userId: string, deleteGroups: boolean): Promise<string[]> {
  const problems: string[] = [];
  const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  try {
    const res = await fetch(`${url}/rest/v1/groups?created_by=eq.${userId}&select=id,member_ids`, { headers: h });
    if (!res.ok) { problems.push(`groups_created:${res.status}`); return problems; }
    const rows = await res.json().catch(() => []);
    const doomed = (Array.isArray(rows) ? rows : []).filter((g: { member_ids?: string[] }) => {
      if (deleteGroups) return true;
      const others = (Array.isArray(g.member_ids) ? g.member_ids : []).filter((m: string) => m !== userId);
      return others.length === 0; // sole member -> the cascade will remove it
    });
    for (const g of doomed) {
      const paths = await listPrefixObjects(url, key, "group-images", g.id);
      if (paths.length && !(await deleteObjects(url, key, "group-images", paths)))
        problems.push(`group_images/${g.id}`);
    }
    if (deleteGroups && doomed.length) {
      const del = await fetch(`${url}/rest/v1/groups?created_by=eq.${userId}`, { method: "DELETE", headers: h });
      if (!del.ok) problems.push(`groups_delete:${del.status}`);
    }
  } catch { problems.push("groups_created:threw"); }
  return problems;
}

// ── Residue that no foreign key reaches ──────────────────────────────────────────────────────
// Almost everything dies with the identity: profiles.id cascades from auth.users, and comments,
// follows, kudos, messages, notifications, posts, programs, personal_records, workout_history,
// group_posts, exercise_notes and reports.reporter_id all cascade from profiles. Four columns
// have NO foreign key at all, so they survive the cascade untouched. Three of them are handled
// here, and they MUST be handled here rather than in the client: `client_errors` and `feedback`
// are INSERT-only under RLS (no SELECT, no UPDATE, no DELETE policy), so a client attempting to
// clean them gets a silent 0-row no-op.
//
// The fourth, `code_redeem_failures.actor`, is DELIBERATELY LEFT. It is a short-lived abuse
// ledger — each call opportunistically deletes expired rows, so it sits at zero between bursts —
// and erasing a user's failures on request would let someone reset their own rate limit by
// burning an account. Its IP-keyed rows are not findable by user id anyway. Do not "fix" this.
async function scrubUnreferencedResidue(url: string, key: string, userId: string): Promise<string[]> {
  const problems: string[] = [];
  const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  // Telemetry and feedback are ANONYMISED, not deleted: the value is the error text and the
  // message, and unlinking the identity is what the erasure request actually requires.
  for (const table of ["client_errors", "feedback"]) {
    try {
      const res = await fetch(`${url}/rest/v1/${table}?user_id=eq.${userId}`, {
        method: "PATCH", headers: { ...h, Prefer: "return=minimal" },
        body: JSON.stringify({ user_id: null }),
      });
      if (!res.ok) problems.push(`${table}:${res.status}`);
    } catch { problems.push(`${table}:threw`); }
  }

  // groups.member_ids is a uuid[] with no FK, so a deleted user's id stays in every group they
  // joined — inflating the visible member count and leaving a stale entry that keeps satisfying
  // membership checks shaped like `auth.uid() = ANY(member_ids)` for an id that can no longer
  // exist.
  //
  // This CANNOT be a plain PATCH with the service key, and that was measured, not guessed: the
  // `enforce_group_creator_manages` BEFORE UPDATE trigger reads `auth.uid()`, which is NULL for a
  // service-role call, so it sees a non-creator rewriting membership without removing exactly
  // themselves and refuses — a live end-to-end test returned `groups/<id>:400`. The trigger is
  // correct; the caller was. Its own rule already allows a member to remove exactly themselves,
  // which is precisely what account deletion is, so `remove_user_from_all_groups` acts AS the
  // departing member for one statement (a LOCAL `request.jwt.claims`) and satisfies the guard
  // honestly instead of disabling it. EXECUTE is service_role-only — p_user is an arbitrary uuid,
  // so an exposed grant would let anyone evict anyone from any group.
  try {
    const res = await fetch(`${url}/rest/v1/rpc/remove_user_from_all_groups`, {
      method: "POST", headers: h, body: JSON.stringify({ p_user: userId }),
    });
    if (!res.ok) problems.push(`groups:${res.status}`);
  } catch { problems.push("groups:threw"); }

  return problems;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // The ONLY input accepted from the body, and it names no target — it selects a policy for the
  // caller's own created groups (see handleCreatedGroups). Anything that named a group or a user
  // would be an authorization hole; this cannot be one.
  let deleteGroups = false;
  try {
    const body = await req.json().catch(() => ({}));
    deleteGroups = body?.deleteGroups === true;
  } catch { /* no body is the normal case — default to transfer */ }

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

  // ── Files first ────────────────────────────────────────────────────────────────────────────
  // Best-effort and never fatal: a stranded file is bad, but a live login on an account the user
  // asked to delete is worse. Counts are returned so a failure is visible rather than silent.
  let filesDeleted = 0;
  const fileErrors: string[] = [];
  for (const bucket of USER_PREFIXED_BUCKETS) {
    try {
      const paths = await listPrefixObjects(SUPABASE_URL, SERVICE_KEY, bucket, callerId);
      if (!paths.length) continue;
      const del = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
        method: "DELETE",
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
      });
      if (del.ok) filesDeleted += paths.length;
      else fileErrors.push(`${bucket}:${del.status}`);
    } catch (e) {
      fileErrors.push(`${bucket}:threw`);
    }
  }

  // Groups the caller created: transfer (default) or destroy (explicit choice), and sweep the
  // images of any group that is about to disappear while its rows still name them.
  const groupProblems = await handleCreatedGroups(SUPABASE_URL, SERVICE_KEY, callerId, deleteGroups)
    .catch(() => ["groups_created:threw"]);

  // Residue with no FK to cascade through. Best-effort and never fatal, same as storage: a
  // leftover telemetry row must not keep a login alive on an account the user asked to delete.
  const residueProblems = (await scrubUnreferencedResidue(SUPABASE_URL, SERVICE_KEY, callerId)
    .catch(() => ["residue:threw"])).concat(groupProblems);

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
      return json({ error: "delete_failed", status: del.status, detail, filesDeleted, fileErrors, residueProblems }, 502);
    }
    return json({ ok: true, filesDeleted, ...(fileErrors.length ? { fileErrors } : {}),
      ...(residueProblems.length ? { residueProblems } : {}) });
  } catch {
    return json({ error: "server_error", filesDeleted, fileErrors }, 500);
  }
});
