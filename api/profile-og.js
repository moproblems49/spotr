// Vercel serverless function: serves Open Graph tags for /u/{id} links so iMessage,
// Twitter, WhatsApp etc. unfurl a branded card, then forwards humans into the SPA's
// hash route. Crawlers don't execute JS, so they read the tags; browsers redirect.
export default async function handler(req, res) {
  const id = (req.query.id || "").toString().replace(/[^\w-]/g, "");
  const origin = "https://spotr-drab.vercel.app";

  // ★ THE CARD IS GENERIC ON PURPOSE — DO NOT "FIX" THIS BY LOOKING THE PROFILE UP.
  // This endpoint used to fetch name/username/bio and interpolate them into the og: tags. It
  // never once worked: it queried the BASE `profiles` table with the anon key, and `profiles` is
  // owner-only under RLS with no user JWT here, so `auth.uid()` was NULL and the query returned
  // ZERO ROWS every time (measured as anon with all accounts public: base `profiles` -> 0,
  // `public_profiles` -> 3). Every profile link ever shared has unfurled as the text below.
  //
  // Mo's call, Sep 2 2026, after the privacy-by-inference audit surfaced it: LEAVE IT GENERIC.
  // The one-word repair (`profiles` -> `public_profiles`, whose own
  // `is_public = true OR auth.uid() IS NOT NULL` filter returns only public rows to an anon key)
  // is correct and would work — but it INCREASES what Seshd publishes: a shared link would start
  // showing the person's real name and bio inside iMessage/WhatsApp/Twitter previews, to everyone
  // the link is ever forwarded to, with no way for them to know it happened. That is a product
  // decision, and the decision was no.
  //
  // The dead fetch is DELETED rather than left in place: code that looks like it fetches and
  // silently cannot is the exact class this repo keeps getting bitten by (dead UI nothing can
  // open, a `C.danger ||` fallback that always won). It also cost a pointless Supabase round-trip
  // on every unfurl. To enable the card later, restore a fetch against `public_profiles` — and
  // note the redirect below already sends humans into the SPA, which reads `public_profiles`
  // itself and renders the real profile, so nothing about the LOGGED-IN experience depends on it.
  const name = "Seshd", bio = "Lift heavy. Track everything.";

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
  res.status(200).send(`<!doctype html><html><head>
<meta charset="utf-8">
<title>${esc(name)}</title>
<meta property="og:title" content="${esc(name)}">
<meta property="og:description" content="${esc(bio)}">
<meta property="og:image" content="${origin}/og-image.png">
<meta property="og:url" content="${origin}/u/${id}">
<meta property="og:type" content="profile">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(name)}">
<meta name="twitter:description" content="${esc(bio)}">
<meta name="twitter:image" content="${origin}/og-image.png">
<meta http-equiv="refresh" content="0;url=/#/u/${id}">
<script>location.replace("/#/u/${id}");</script>
</head><body></body></html>`);
}
