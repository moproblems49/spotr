// USERNAME SIGN-IN NO LONGER LEAKS EMAIL ADDRESSES.
//
// The app resolves a username to an email because Supabase auth keys on email. That lookup used to
// happen in the CLIENT, calling the SECURITY DEFINER rpc `email_for_username` with the public anon
// key — so anyone signed out could POST a username and get that person's real email back. Usernames
// are public (feed, search, profiles), so every user's email was harvestable.
//
// It now goes through the `username-auth` edge function, which resolves with the service role and
// returns only a session. These checks pin the properties that matter:
//   1. a username sign-in NEVER calls the rpc, and DOES call the edge function
//   2. an EMAIL sign-in is completely unchanged (still a direct /auth/v1/token call) — this is the
//      safety net, so a fault in the new path can't lock anyone out
//   3. the password is sent to the function but the response is only ever a session
//   4. failure modes are distinguishable: bad credentials vs rate-limited vs our-fault
//   5. a username password-reset also avoids the rpc, and stays silent about whether the account
//      exists (no enumeration)
const _ls = new Map();
globalThis.localStorage = { getItem: k => (_ls.has(k) ? _ls.get(k) : null), setItem: (k,v) => _ls.set(k,String(v)), removeItem: k => _ls.delete(k) };
globalThis.window = undefined;

let fails = 0;
const check = (l,c,d)=>{ if(c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d?" — "+d:""}`);} };

// Recording stub: remembers every URL + body, and answers according to `reply`.
let calls = [];
let reply = () => ({ status: 200, body: {} });
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  let parsed = null;
  try { parsed = opts.body ? JSON.parse(opts.body) : null; } catch {}
  calls.push({ url: u, method: (opts.method || "GET").toUpperCase(), body: parsed, headers: opts.headers || {} });
  const r = reply(u, parsed) || { status: 200, body: {} };
  return { ok: r.status < 400, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
};

const { sb } = await import("./app.mjs");
const reset = () => { calls = []; };
const hit = (frag) => calls.some(c => c.url.includes(frag));
const SESSION = { access_token: "tok-abc", refresh_token: "ref-abc", user: { id: "u1", email: "real@person.com" } };

// ── 1. Username sign-in: edge function only, never the rpc ───────────────────────────────────
reset();
reply = (u) => u.includes("/functions/v1/username-auth") ? { status: 200, body: SESSION } : { status: 404, body: {} };
const ok = await sb.signIn("maya_lifts", "hunter2");
check("username sign-in returns the session", ok?.access_token === "tok-abc", JSON.stringify(ok));
check("username sign-in calls the edge function", hit("/functions/v1/username-auth"));
check("username sign-in NEVER calls the email rpc", !hit("email_for_username"), calls.map(c=>c.url).join(" , "));
check("username sign-in does not call /auth/v1/token directly", !hit("/auth/v1/token"));
const call = calls.find(c => c.url.includes("username-auth"));
check("it sends the username and password", call?.body?.username === "maya_lifts" && call?.body?.password === "hunter2", JSON.stringify(call?.body));
check("it asks for the signin action", call?.body?.action === "signin");
check("no email address is sent from the client", !JSON.stringify(call?.body || {}).includes("@"), JSON.stringify(call?.body));

// ── 2. EMAIL sign-in is untouched — the safety net ───────────────────────────────────────────
reset();
reply = (u) => u.includes("/auth/v1/token") ? { status: 200, body: SESSION } : { status: 500, body: {} };
const ok2 = await sb.signIn("mo@example.com", "hunter2");
check("email sign-in still returns a session", ok2?.access_token === "tok-abc");
check("email sign-in goes straight to /auth/v1/token", hit("/auth/v1/token"));
check("email sign-in does NOT involve the edge function", !hit("username-auth"), calls.map(c=>c.url).join(" , "));
check("email sign-in never calls the rpc either", !hit("email_for_username"));
// Whitespace around a pasted email must still take the email path.
reset();
const ok3 = await sb.signIn("  mo@example.com  ", "hunter2");
check("a padded email is trimmed and still uses the email path", ok3?.access_token === "tok-abc" && !hit("username-auth"));

// ── 3. Failure modes stay distinguishable ────────────────────────────────────────────────────
const expectThrow = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

reset();
reply = () => ({ status: 400, body: { error: "invalid_credentials", message: "nope" } });
let err = await expectThrow(() => sb.signIn("maya_lifts", "wrong"));
check("bad credentials throw a user-facing message", /incorrect username or password/i.test(err?.message||""), err?.message);
check("...and it does not leak which of the two was wrong", !/no account|not found|unknown user/i.test(err?.message||""), err?.message);

reset();
reply = () => ({ status: 429, body: { error: "rate_limited", message: "Too many attempts. Try again shortly." } });
err = await expectThrow(() => sb.signIn("maya_lifts", "x"));
check("rate limiting surfaces as its own message", /too many attempts/i.test(err?.message||""), err?.message);

reset();
reply = () => ({ status: 500, body: { error: "server_error" } });
err = await expectThrow(() => sb.signIn("maya_lifts", "x"));
check("our-fault failures tell the user to use their email", /use your email/i.test(err?.message||""), err?.message);
check("...and are NOT reported as a wrong password", !/incorrect/i.test(err?.message||""), err?.message);

reset();
globalThis.fetch = async () => { throw new Error("offline"); };
err = await expectThrow(() => sb.signIn("maya_lifts", "x"));
check("a transport failure is flagged as such, not as bad credentials", err?.transportFailure === true, `${err?.message} flag=${err?.transportFailure}`);
// restore the recording stub
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  let parsed = null; try { parsed = opts.body ? JSON.parse(opts.body) : null; } catch {}
  calls.push({ url: u, method: (opts.method||"GET").toUpperCase(), body: parsed, headers: opts.headers || {} });
  const r = reply(u, parsed) || { status: 200, body: {} };
  return { ok: r.status < 400, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
};

// ── 4. Password reset ────────────────────────────────────────────────────────────────────────
reset();
reply = () => ({ status: 200, body: { ok: true } });
await sb.recover("maya_lifts");
check("username reset calls the edge function", hit("/functions/v1/username-auth"));
check("username reset NEVER calls the email rpc", !hit("email_for_username"), calls.map(c=>c.url).join(" , "));
const rec = calls.find(c => c.url.includes("username-auth"));
check("reset asks for the recover action", rec?.body?.action === "recover", JSON.stringify(rec?.body));
check("reset sends no password", !("password" in (rec?.body || {})), JSON.stringify(rec?.body));

reset();
await sb.recover("someone@example.com");
check("an email reset still goes to /auth/v1/recover", hit("/auth/v1/recover"));
check("an email reset does not involve the edge function", !hit("username-auth"));

// A reset for a username that doesn't exist must resolve silently — no throw, nothing revealed.
reset();
reply = () => ({ status: 200, body: { ok: true } });
let threw = false;
try { await sb.recover("no_such_person"); } catch { threw = true; }
check("reset for an unknown username resolves silently", !threw);

console.log(`\n${fails===0?"ALL PASS":fails+" FAIL(S)"}`);
process.exit(fails?1:0);
