// CAPTCHA PLUMBING (Cloudflare Turnstile) — the client half, provable before the switch is flipped.
//
// Supabase's bot protection REFUSES every signup / password sign-in / recover / resend that does
// not carry a captcha token, so the order is: ship a bundle that SENDS tokens, then turn it on.
// This guards that bundle. Two builds:
//   A. the normal dist (no site key): no widget, no script fetched, auth bodies unchanged — the
//      shipped default must be byte-identical to before.
//   B. a dist built here with VITE_CAPTCHA_SITE_KEY set, served on its own port, with the real
//      Turnstile script replaced by a fake that hands out tok-1, tok-2, ... on demand. Asserts the
//      token reaches every protected call (email + username sign-in, signup, reset), that a spent
//      token is never re-sent (they are single-use), and that submitting before the check finishes
//      sends nothing.
import { chromium } from "playwright-core";
import { spawn, execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`  PASS ${l}`); else { fails++; console.log(`  FAIL ${l}${d ? " — " + d : ""}`); } };

const FAKE_TS = `
  (function(){
    var n = 0, w = {};
    function give(id){ var x = w[id]; if (!x) return;
      var go = function(){ if (window.__tsHold) return setTimeout(go, 60); x.opts.callback("tok-" + (++n)); };
      setTimeout(go, 60); }
    window.turnstile = {
      render: function(el, opts){ var id = "w" + Object.keys(w).length; w[id] = { el: el, opts: opts };
        window.__tsRendered = (window.__tsRendered||0) + 1; give(id); return id; },
      reset: function(id){ give(id); },
      remove: function(id){ delete w[id]; }
    };
  })();`;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

async function open(port, { hold = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(6000);
  page.on("pageerror", e => { fails++; console.log("  PAGEERROR:", e.message.slice(0, 140)); });
  const seen = { token: [], signup: [], recover: [], ua: [], tsScript: 0 };
  if (hold) await page.addInitScript(() => { window.__tsHold = true; });
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/auth/v1/token**", r => { seen.token.push(r.request().postDataJSON());
    return r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }) }); });
  await page.route("**/auth/v1/signup**", r => { seen.signup.push(r.request().postDataJSON());
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "u1", identities: [{ id: "i" }] }) }); });
  await page.route("**/auth/v1/recover**", r => { seen.recover.push(r.request().postDataJSON());
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
  await page.route("**/functions/v1/username-auth", r => { seen.ua.push(r.request().postDataJSON());
    return r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "invalid_credentials" }) }); });
  await page.route("**/rest/v1/**", r => r.abort());
  await page.route("https://challenges.cloudflare.com/**", r => { seen.tsScript++;
    return r.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_TS }); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  return { page, seen };
}
const clickText = (page, re) => page.evaluate((src) => { const r = new RegExp(src, "i");
  const b = [...document.querySelectorAll("button")].filter(x => x.offsetParent).find(x => r.test((x.textContent || "").trim())); b && b.click(); return !!b; }, re.source);
const fill = (page, vals) => page.evaluate((vals) => {
  const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
  for (const i of [...document.querySelectorAll("input")].filter(x => x.offsetParent)) {
    const ph = (i.placeholder || "").toLowerCase();
    if (i.type === "password") { if (vals.password != null) set(i, vals.password); }
    else if (/user/.test(ph) && !/email/.test(ph)) { if (vals.username != null) set(i, vals.username); }
    else if (/email/.test(ph) || i.type === "email") { if (vals.email != null) set(i, vals.email); }
    else if (vals.name != null) set(i, vals.name);
  }
}, vals);
async function toSignIn(page) {
  await clickText(page, /^(sign in|log in|i already have an account)$/);
  await page.waitForTimeout(700);
  if (!(await page.evaluate(() => /welcome back/i.test(document.body.innerText)))) { await clickText(page, /sign in/); await page.waitForTimeout(700); }
}
const meta = b => b && b.gotrue_meta_security && b.gotrue_meta_security.captcha_token;

// ── A. no site key: nothing changes ──────────────────────────────────────────────────────────
console.log("  ── A. shipped default (no site key)");
{
  const { page, seen } = await open(process.env.PORT || "8199");
  await toSignIn(page);
  check("[control] the sign-in form rendered", await page.evaluate(() => /welcome back/i.test(document.body.innerText)));
  check("A1 no captcha widget is drawn", (await page.locator("[data-captcha]").count()) === 0);
  await fill(page, { email: "a@example.com", password: "testpass123" });
  await clickText(page, /^sign in$/); await page.waitForTimeout(1200);
  check("A2 the sign-in request was made", seen.token.length === 1, JSON.stringify(seen.token));
  check("A3 ...with NO captcha field (body unchanged)", seen.token[0] && !("gotrue_meta_security" in seen.token[0]), JSON.stringify(seen.token[0]));
  check("A4 the Turnstile script is never fetched", seen.tsScript === 0, String(seen.tsScript));
  await page.close();
}

// ── B. with a site key ───────────────────────────────────────────────────────────────────────
const out = mkdtempSync(join(tmpdir(), "seshd-captcha-"));
const PORT_B = "8299";
let server = null;
try {
  execSync(`npx vite build --outDir ${out} --emptyOutDir`, { cwd: ROOT, stdio: "pipe",
    env: { ...process.env, VITE_SUPABASE_URL: "https://stub.supabase.co", VITE_SUPABASE_ANON_KEY: "stubkey",
      VITE_POSTHOG_KEY: "", VITE_CAPTCHA_SITE_KEY: "1x00000000000000000000AA" } });
  server = spawn("python3", ["-m", "http.server", PORT_B], { cwd: out, stdio: "ignore" });
  await new Promise(r => setTimeout(r, 800));

  console.log("  ── B. site key set");
  // B1-B4: submitting before the check finishes sends nothing.
  {
    const { page, seen } = await open(PORT_B, { hold: true });
    await toSignIn(page);
    check("B1 the captcha widget is drawn on the sign-in form", (await page.locator("[data-captcha]").count()) === 1);
    check("B2 the Turnstile script was loaded", seen.tsScript >= 1, String(seen.tsScript));
    await fill(page, { email: "a@example.com", password: "testpass123" });
    await clickText(page, /^sign in$/); await page.waitForTimeout(700);
    check("B3 submitting before the check finishes sends NOTHING", seen.token.length === 0, JSON.stringify(seen.token));
    check("B4 ...and says why", await page.evaluate(() => /security check/i.test(document.body.innerText)));
    await page.close();
  }
  // B5-B8: email sign-in carries the token; a retry gets a NEW one.
  {
    const { page, seen } = await open(PORT_B);
    await toSignIn(page);
    await page.waitForTimeout(400);
    await fill(page, { email: "a@example.com", password: "testpass123" });
    await clickText(page, /^sign in$/); await page.waitForTimeout(900);
    check("B5 email sign-in sends the captcha token", meta(seen.token[0]) === "tok-1", JSON.stringify(seen.token[0]));
    await page.waitForTimeout(500);
    await clickText(page, /^sign in$/); await page.waitForTimeout(900);
    check("B6 a retry sends a FRESH token, never the spent one", seen.token.length === 2 && meta(seen.token[1]) === "tok-2", JSON.stringify(seen.token.map(meta)));
    // Username path: the edge function must receive the token to forward.
    await fill(page, { email: "momo", password: "testpass123" });
    await page.waitForTimeout(500);
    await clickText(page, /^sign in$/); await page.waitForTimeout(900);
    check("B7 username sign-in forwards the token to username-auth", seen.ua.length === 1 && seen.ua[0].captchaToken === "tok-3", JSON.stringify(seen.ua[0]));
    await page.close();
  }
  // B9: password reset carries it.
  {
    const { page, seen } = await open(PORT_B);
    await toSignIn(page);
    await clickText(page, /forgot password/); await page.waitForTimeout(700);
    await page.waitForTimeout(400);
    await fill(page, { email: "a@example.com" });
    await clickText(page, /send reset link/); await page.waitForTimeout(900);
    check("B9 the reset request carries the token", seen.recover.length === 1 && meta(seen.recover[0]) === "tok-1", JSON.stringify(seen.recover));
    await page.close();
  }
  // B10-B11: signup carries it, and does not burn a second call on a token it already spent.
  {
    const { page, seen } = await open(PORT_B);
    await clickText(page, /get started|sign up|create/); await page.waitForTimeout(800);
    await clickText(page, /^sign up$/); await page.waitForTimeout(700);
    await page.waitForTimeout(400);
    await fill(page, { email: "new@example.com", password: "testpass123", username: "newbie", name: "New" });
    await clickText(page, /^(create account|sign up|continue)$/); await page.waitForTimeout(1500);
    check("B10 signup carries the token", seen.signup.length === 1 && meta(seen.signup[0]) === "tok-1", JSON.stringify(seen.signup));
    check("B11 no follow-up sign-in on the spent token", seen.token.length === 0, JSON.stringify(seen.token));
    await page.close();
  }
} finally {
  try { server && server.kill(); } catch {}
  try { rmSync(out, { recursive: true, force: true }); } catch {}
}

await browser.close();
console.log(fails ? `  FAIL ${fails}` : "  ALL PASS");
process.exit(fails ? 1 : 0);
