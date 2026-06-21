// Supabase Edge Function: send-message-push
// Fires an APNs push to the recipient when a new row lands in `messages`.
// Wire-up: Database Webhooks → table `messages` → INSERT → HTTP POST to this function.
//
// Deploy (PowerShell, from repo root):
//   npm i -g supabase
//   supabase login
//   supabase link --project-ref YOUR_PROJECT_REF
//   mkdir supabase\functions\send-message-push   (place this file there as index.ts)
//   supabase secrets set APNS_KEY_ID=XXXXXXXXXX APNS_TEAM_ID=YYYYYYYYYY APNS_TOPIC=com.seshd.app APNS_ENV=production
//   supabase secrets set WEBHOOK_SECRET=some-long-random-string
//     (and add header  x-webhook-secret: some-long-random-string  in the webhook config)
//   supabase secrets set APNS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----`n...key lines...`n-----END PRIVATE KEY-----"
//   supabase functions deploy send-message-push
//
// Notes:
// - APNS_PRIVATE_KEY is the contents of the .p8 key from the Apple Developer portal
//   (Keys → create key with Apple Push Notifications service enabled).
// - TestFlight and App Store builds use the PRODUCTION APNs host. Only direct
//   Xcode-run debug builds use sandbox — set APNS_ENV=sandbox for those tests.
// - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { importPKCS8, SignJWT } from "https://deno.land/x/jose@v5.9.6/index.ts";

const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_TOPIC = Deno.env.get("APNS_TOPIC") ?? "com.seshd.app";
const APNS_HOST = (Deno.env.get("APNS_ENV") ?? "production") === "sandbox"
  ? "https://api.sandbox.push.apple.com"
  : "https://api.push.apple.com";
const APNS_PRIVATE_KEY = (Deno.env.get("APNS_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n");

// Shared secret so only the database webhook can trigger pushes (the function URL is
// public). Set the same value in the webhook's HTTP headers as `x-webhook-secret`.
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

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("method", { status: 405 });
    if (!WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }
    const payload = await req.json();
    const record = payload?.record;
    if (payload?.type !== "INSERT" || !record?.recipient_id || !record?.sender_id) {
      return new Response("ignored", { status: 200 });
    }

    // Recipient's device token + sender's display name, in parallel.
    const [recipRows, senderRows] = await Promise.all([
      sbGet(`profiles?id=eq.${record.recipient_id}&select=push_token,notification_prefs`),
      sbGet(`profiles?id=eq.${record.sender_id}&select=name,username`),
    ]);
    const recip = recipRows?.[0];
    const token = recip?.push_token;
    if (!token) return new Response("no token", { status: 200 });
    if (recip?.notification_prefs?.messages === false) return new Response("muted", { status: 200 });
    const sender = senderRows?.[0];
    const title = sender?.name || (sender?.username ? `@${sender.username}` : "New message");

    const body = String(record.text ?? "").slice(0, 140);
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
        aps: {
          alert: { title, body },
          sound: "default",
          "thread-id": `dm-${record.sender_id}`,
        },
        type: "dm",
        senderId: record.sender_id,
      }),
    });

    // 410 = token is dead (app deleted) — clear it so we stop trying.
    if (res.status === 410) {
      await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${record.recipient_id}`, {
        method: "PATCH",
        headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" },
        body: JSON.stringify({ push_token: null }),
      });
    }

    return new Response(JSON.stringify({ apns: res.status }), { status: 200 });
  } catch (e) {
    // Never bounce the webhook — a push failing must not affect message delivery.
    return new Response(JSON.stringify({ error: String(e) }), { status: 200 });
  }
});
