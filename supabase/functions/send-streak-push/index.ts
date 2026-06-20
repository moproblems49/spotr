// Supabase Edge Function: send-streak-push
// Fires an APNs push to users whose weekly workout streak is at risk: they hit their
// weekly target last week but haven't yet this week. Invoked once a week (Sunday 23:00
// UTC) by the `streak-at-risk-push` pg_cron job via public.invoke_streak_push_webhook(),
// which reuses the same Vault secrets as the kudos/comments/follows/messages webhooks.
//
// Notes:
// - Candidate selection (who's at risk, dedup-per-day) lives in the
//   public.get_streak_at_risk_candidates() SQL function — restricted to service_role
//   since it returns push tokens. This function just sends the pushes and marks
//   last_streak_nudge_date so a candidate is never double-nudged same day.
// - Respects profiles.notification_prefs->>'streak' (defaults to on, same opt-out
//   pattern as the other push types) — enforced inside the SQL candidate query.

import { importPKCS8, SignJWT } from "https://deno.land/x/jose@v5.9.6/index.ts";

const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_TOPIC = Deno.env.get("APNS_TOPIC") ?? "com.seshd.app";
const APNS_HOST = (Deno.env.get("APNS_ENV") ?? "production") === "sandbox"
  ? "https://api.sandbox.push.apple.com"
  : "https://api.push.apple.com";
const APNS_PRIVATE_KEY = (Deno.env.get("APNS_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n");

const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function apnsJwt(): Promise<string> {
  const key = await importPKCS8(APNS_PRIVATE_KEY, "ES256");
  return await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: APNS_KEY_ID })
    .setIssuer(APNS_TEAM_ID)
    .setIssuedAt()
    .sign(key);
}

async function getCandidates(): Promise<{ id: string; push_token: string; weekly_target: number }[]> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/get_streak_at_risk_candidates`, {
    method: "POST",
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" },
    body: "{}",
  });
  return r.ok ? await r.json() : [];
}

async function markNudged(userId: string) {
  await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ last_streak_nudge_date: new Date().toISOString().slice(0, 10) }),
  });
}

async function clearDeadToken(userId: string) {
  await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ push_token: null }),
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("method", { status: 405 });
    if (WEBHOOK_SECRET && req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }

    const candidates = await getCandidates();
    if (!candidates.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

    const jwt = await apnsJwt();
    let sent = 0;

    for (const c of candidates) {
      const res = await fetch(`${APNS_HOST}/3/device/${c.push_token}`, {
        method: "POST",
        headers: {
          authorization: `bearer ${jwt}`,
          "apns-topic": APNS_TOPIC,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          aps: {
            alert: {
              title: "Your streak is on the line",
              body: `You haven't hit your weekly goal yet. One more workout today keeps it alive.`,
            },
            sound: "default",
            "thread-id": "streak",
          },
          type: "streak",
        }),
      });

      if (res.status === 410) {
        await clearDeadToken(c.id);
      } else if (res.ok) {
        sent++;
        await markNudged(c.id);
      }
    }

    return new Response(JSON.stringify({ candidates: candidates.length, sent }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200 });
  }
});
