// Vercel serverless function: the page a shared /p/<id> link opens for someone WITHOUT the app.
// With Seshd installed, iOS never gets here — /p/* is claimed in the AASA file, so the tap opens
// the app directly. Everyone else (no app, a desktop, Android) used to land on the bare SPA, which
// shows a signed-out visitor the welcome screen and never the post. Now they get one clear page:
// the App Store button, the smart banner, and a "view in browser" link for anyone who wants it.
//
// ★ THE PREVIEW IS GENERIC ON PURPOSE, for the same reason as api/profile-og.js. A post link is
// forwarded freely, and an unfurl that printed the workout would publish someone's training to
// every chat the link ever reaches — while the post itself is still gated by the poster's RLS.
// The card says "a workout on Seshd" and nothing else. Do not look the post up here.
const APP_STORE_URL = "https://apps.apple.com/us/app/seshd-gym-log-lift-tracker/id6780334417";
const APP_STORE_ID = "6780334417";

export default async function handler(req, res) {
  const id = (req.query.id || "").toString().replace(/[^\w-]/g, "").slice(0, 64);
  const origin = "https://spotr-drab.vercel.app";
  const isPost = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const title = isPost ? "A workout on Seshd" : "A program on Seshd";
  const desc = "Track every set, watch your lifts climb, and see which muscles you actually trained.";
  // A share CODE has no web view; the code itself is what the visitor needs once they have the app.
  const browserLink = isPost ? `/?p=${id}` : "/";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
  res.status(200).send(`<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}, app-argument=${origin}/p/${id}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${origin}/og-image.png">
<meta property="og:url" content="${origin}/p/${id}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${origin}/og-image.png">
<style>
  :root { --bg:#0a0a0a; --surface:#16161a; --text:#f4f4f5; --sub:#a1a1aa; --border:#2a2a31; }
  @media (prefers-color-scheme: light) { :root { --bg:#f6f5f3; --surface:#ffffff; --text:#111113; --sub:#55555c; --border:#e4e2de; } }
  * { box-sizing:border-box; }
  html, body { margin:0; background:var(--bg); color:var(--text);
    font-family:-apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", Arial, sans-serif; }
  main { min-height:100dvh; display:flex; flex-direction:column; justify-content:center; align-items:center;
    padding:48px 24px calc(48px + env(safe-area-inset-bottom)); text-align:center; gap:18px; }
  img.logo { width:84px; height:84px; border-radius:20px; }
  h1 { margin:6px 0 0; font-size:26px; letter-spacing:-0.4px; text-wrap:balance; }
  p { margin:0; max-width:34ch; color:var(--sub); font-size:15px; line-height:1.45; }
  a.cta { margin-top:10px; display:inline-block; background:var(--text); color:var(--bg); text-decoration:none;
    font-weight:700; font-size:16px; padding:15px 26px; border-radius:14px; min-width:260px; }
  a.cta:focus-visible, a.alt:focus-visible { outline:2px solid var(--sub); outline-offset:3px; }
  a.alt { color:var(--sub); font-size:14px; text-decoration:underline; text-underline-offset:3px; padding:8px; }
</style>
</head><body><main>
<img class="logo" src="/icon-192.png" alt="">
<h1>Someone shared ${isPost ? "a workout" : "a program"} with you</h1>
<p>Seshd is a gym log for tracking sets, lifts and progress. Get the app to see it and train together.</p>
<a class="cta" data-app-store href="${APP_STORE_URL}">Get Seshd on the App Store</a>
<a class="alt" data-view-browser href="${browserLink}">${isPost ? "View in browser instead" : "Open Seshd in browser"}</a>
</main></body></html>`);
}
