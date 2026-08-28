// A FAILED SIGNUP MUST NOT LOOK LIKE A SUCCESSFUL ONE — and a successful one must still work.
//
// The real production failure: usernames are UNIQUE (raw and lowercased) and the handle_new_user
// trigger inserts one with no collision handling, so picking a taken handle raises 23505 and
// aborts the auth.users insert. GoTrue reports that as
//   { "code":500, "error_code":"unexpected_failure", "msg":"Database error saving new user" }
// with NO `error` key. sb.signUp only tested `data.error` and never res.ok, so nothing threw:
// AuthScreen saw no access_token, took the email-confirmation branch, and told the user
// "Account created! Check your email to confirm" for an account that does not exist. There is no
// availability check before submit, so that notice was the ONLY feedback — a dead end.
//
// Section 1 goes red on the pre-fix client (it shows the success notice). Section 2 exists because
// the guard added to fix it sits on the signup happy path: breaking that would be worse than the
// bug, so this asserts a 200 still authenticates.
import { chromium } from "playwright-core";
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`  PASS ${l}`); else { fails++; console.log(`  FAIL ${l}${d ? " — " + d : ""}`); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

async function runSignup({ signupStatus, signupBody }) {
  const page = await browser.newPage({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.setDefaultTimeout(6000);
  page.on("pageerror", e => { fails++; console.log("  PAGEERROR:", e.message.slice(0, 140)); });
  let signupCalled = false;
  // Register the CATCH-ALL FIRST. Playwright gives precedence to the most recently registered
  // matching route, so a catch-all added last swallows the specific ones — the first draft of this
  // guard did exactly that (signupCalled stayed false) and reported four app failures that were
  // entirely the probe's.
  await page.route("**/auth/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) }));
  await page.route("**/auth/v1/token**", r => r.fulfill({ status: 400, contentType: "application/json",
    body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }) }));
  await page.route("**/auth/v1/signup**", r => { signupCalled = true;
    return r.fulfill({ status: signupStatus, contentType: "application/json", body: JSON.stringify(signupBody) }); });
  await page.route("**/rest/v1/**", r => r.abort());
  await page.goto("http://127.0.0.1:8199/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => /get started|sign up|create/i.test(x.textContent || "")); b && b.click(); });
  await page.waitForTimeout(900);
  await page.evaluate(() => { const t = [...document.querySelectorAll("button")].find(x => /^sign up$/i.test((x.textContent || "").trim())); t && t.click(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    for (const i of [...document.querySelectorAll("input")].filter(x => x.offsetParent)) {
      const ph = (i.placeholder || "").toLowerCase();
      if (i.type === "password") set(i, "testpass123");
      else if (/email/.test(ph) || i.type === "email") set(i, "newuser@example.com");
      else if (/user/.test(ph)) set(i, "momo");
      else set(i, "New User");
    }
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].filter(x => x.offsetParent)
    .find(x => /^(create account|sign up|continue)$/i.test((x.textContent || "").trim())); b && b.click(); });
  await page.waitForTimeout(2500);
  const txt = await page.evaluate(() => document.body.innerText);
  await page.close();
  return { txt, signupCalled };
}

// ── 1. The failure the trigger actually produces ─────────────────────────────────────────────
console.log("  ── a signup the server rejected");
const bad = await runSignup({ signupStatus: 500,
  signupBody: { code: 500, error_code: "unexpected_failure", msg: "Database error saving new user" } });
check("the signup request was made", bad.signupCalled);
check("does NOT claim the account was created", !/account created/i.test(bad.txt),
  "shows the success notice after a 500 — the user has no account and will never get an email");
check("tells the user the handle is taken", /already taken/i.test(bad.txt),
  bad.txt.slice(0, 150).replace(/\n/g, " | "));
check("keeps them on the signup form to retry", /create your account|create account/i.test(bad.txt));

// ── 2. The happy path still works (the guard sits on it) ─────────────────────────────────────
console.log("  ── a signup the server accepted");
const ok = await runSignup({ signupStatus: 200,
  signupBody: { access_token: "t", refresh_token: "r", user: { id: "11111111-1111-4111-8111-111111111111" } } });
check("a 200 does NOT surface an error", !/already taken|went wrong|failed/i.test(ok.txt),
  ok.txt.slice(0, 150).replace(/\n/g, " | "));
check("a 200 leaves the signup form (authenticated)", !/create your account/i.test(ok.txt),
  ok.txt.slice(0, 150).replace(/\n/g, " | "));

await browser.close();
console.log(fails ? `${fails} FAIL(S)` : "ok");
process.exit(fails ? 1 : 0);
