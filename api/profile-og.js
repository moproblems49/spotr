// Vercel serverless function: serves Open Graph tags for /u/{id} links so iMessage,
// Twitter, WhatsApp etc. unfurl a branded card, then forwards humans into the SPA's
// hash route. Crawlers don't execute JS, so they read the tags; browsers redirect.
export default async function handler(req, res) {
  const id = (req.query.id || "").toString().replace(/[^\w-]/g, "");
  const origin = "https://spotr-drab.vercel.app";
  let name = "Seshd", bio = "Lift heavy. Track everything.";
  try {
    if (id) {
      const r = await fetch(
        `${process.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${id}&is_public=eq.true&select=name,username,bio`,
        { headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}` } }
      );
      const rows = await r.json();
      if (Array.isArray(rows) && rows[0]) {
        const p = rows[0];
        name = p.name ? `${p.name} (@${p.username})` : `@${p.username}`;
        bio = p.bio || "Training on Seshd — a no-bullshit gym log.";
      }
    }
  } catch (e) { /* fall back to defaults */ }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
  res.status(200).send(`<!doctype html><html><head>
<meta charset="utf-8">
<title>${esc(name)} · Seshd</title>
<meta property="og:title" content="${esc(name)} · Seshd">
<meta property="og:description" content="${esc(bio)}">
<meta property="og:image" content="${origin}/og-image.png">
<meta property="og:url" content="${origin}/u/${id}">
<meta property="og:type" content="profile">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(name)} · Seshd">
<meta name="twitter:description" content="${esc(bio)}">
<meta name="twitter:image" content="${origin}/og-image.png">
<meta http-equiv="refresh" content="0;url=/#/u/${id}">
<script>location.replace("/#/u/${id}");</script>
</head><body></body></html>`);
}
