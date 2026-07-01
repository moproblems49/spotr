// Vercel serverless function — proxies AI requests to Anthropic with the server-side key.
// Hardened: requires a valid Supabase user token (verified against Supabase auth) so strangers
// can't spend the Anthropic key, pins the model to an allowlist, clamps token/payload sizes,
// and only reflects known app origins in CORS. Callers in the app degrade gracefully for
// guests (program builder falls back to its table version; coach shows a sign-in note).
const ALLOWED_ORIGINS = ["https://spotr-drab.vercel.app", "capacitor://localhost", "ionic://localhost"];
const ALLOWED_MODELS = new Set(["claude-sonnet-4-6"]);
const DEFAULT_MODEL = "claude-sonnet-4-6";

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const originOk = ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  res.setHeader("Access-Control-Allow-Origin", originOk ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.ANTHROPIC_API_KEY;
  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const sbAnon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!key || !sbUrl || !sbAnon) return res.status(500).json({ error: "Server not configured" });

  // Auth gate: only signed-in app users may spend AI credits. The token is a Supabase
  // access token from the app's session; verify it against Supabase auth directly.
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "auth_required" });
  try {
    const u = await fetch(`${sbUrl}/auth/v1/user`, {
      headers: { apikey: sbAnon, Authorization: `Bearer ${token}` },
    });
    if (!u.ok) return res.status(401).json({ error: "auth_invalid" });
    const user = await u.json();
    if (!user || !user.id) return res.status(401).json({ error: "auth_invalid" });
  } catch (e) {
    return res.status(401).json({ error: "auth_invalid" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const messages = Array.isArray(body.messages) ? body.messages : null;
    if (!messages || !messages.length) return res.status(400).json({ error: "bad_request" });
    // Size clamps — the app's real payloads are a few KB; anything huge is abuse.
    if (JSON.stringify(messages).length > 30000) return res.status(413).json({ error: "too_large" });
    const system = typeof body.system === "string" ? body.system.slice(0, 6000) : undefined;
    const model = ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;
    const max_tokens = Math.min(Math.max(parseInt(body.max_tokens) || 1000, 1), 2000);
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens, system, messages }),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    // Don't leak internals to callers.
    return res.status(500).json({ error: "proxy_error" });
  }
}
