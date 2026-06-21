// Supabase Edge Function: send-activity-push
// Fires an APNs push when someone gives kudos, comments on a post, or follows a user.
// Wire-up: Database Webhooks → tables `kudos`, `comments`, `follows` → INSERT → HTTP POST to
// this function. All three webhooks can point at the same function URL; this function
// dispatches on `payload.table`.
//
// Deploy (PowerShell, from repo root):
//   mkdir supabase\functions\send-activity-push   (place this file there as index.ts)
//   supabase functions deploy send-activity-push
//   (reuses the APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY / APNS_TOPIC / APNS_ENV /
//   WEBHOOK_SECRET secrets already set for send-message-push — no new secrets needed)
//
// Notes:
// - Respects each recipient's `profiles.notification_prefs` (jsonb, e.g.
//   {"messages":true,"kudos":true,"comments":true,"follows":true}) — set a key to false to
//   mute that category. Missing/null prefs default to "on" (opt-out, not opt-in).
// - Never notifies a user about their own action (e.g. kudos-ing your own post).

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

async function sbGet(path: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` },
  });
  return r.ok ? await r.json() : null;
}

async function senderName(senderId: string): Promise<string> {
  const rows = await sbGet(`profiles?id=eq.${senderId}&select=name,username`);
  const sender = rows?.[0];
  return sender?.name || (sender?.username ? `@${sender.username}` : "Someone");
}

// type is both the notification_prefs key and the APNs payload "type" field.
async function sendPush(recipientId: string, senderId: string, type: string, title: string, body: string, extra: Record<string, unknown>) {
  if (!recipientId || recipientId === senderId) return "skipped";

  const recipRows = await sbGet(`profiles?id=eq.${recipientId}&select=push_token,notification_prefs`);
  const recip = recipRows?.[0];
  const token = recip?.push_token;
  if (!token) return "no-token";
  if (recip?.notification_prefs?.[type] === false) return "muted";

  const jwt = await apnsJwt();
  const res = await fetch(`${APNS_HOST}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": APNS_TOPIC,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: { alert: { title, body }, sound: "default", "thread-id": `${type}-${senderId}` },
      type,
      senderId,
      ...extra,
    }),
  });

  // 410 = token is dead (app deleted) — clear it so we stop trying.
  if (res.status === 410) {
    await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${recipientId}`, {
      method: "PATCH",
      headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ push_token: null }),
    });
  }
  return res.status;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("method", { status: 405 });
    if (!WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }
    const payload = await req.json();
    const record = payload?.record;
    if (payload?.type !== "INSERT" || !record) return new Response("ignored", { status: 200 });

    let result;
    if (payload.table === "kudos") {
      const post = await sbGet(`posts?id=eq.${record.post_id}&select=user_id`);
      const recipientId = post?.[0]?.user_id;
      const name = await senderName(record.user_id);
      result = await sendPush(recipientId, record.user_id, "kudos", "New kudos", `${name} gave you kudos`, { postId: record.post_id });
    } else if (payload.table === "comments") {
      const post = await sbGet(`posts?id=eq.${record.post_id}&select=user_id`);
      const recipientId = post?.[0]?.user_id;
      const name = await senderName(record.user_id);
      const body = String(record.text ?? "").slice(0, 140);
      result = await sendPush(recipientId, record.user_id, "comments", `${name} commented`, body, { postId: record.post_id });
    } else if (payload.table === "follows") {
      const name = await senderName(record.follower_id);
      result = await sendPush(record.following_id, record.follower_id, "follows", "New follower", `${name} started following you`, { followerId: record.follower_id });
    } else {
      return new Response("ignored", { status: 200 });
    }

    return new Response(JSON.stringify({ result }), { status: 200 });
  } catch (e) {
    // Never bounce the webhook — a push failing must not affect kudos/comments/follows.
    return new Response(JSON.stringify({ error: String(e) }), { status: 200 });
  }
});
