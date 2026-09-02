# Seshd — project context for Claude Code

## What this is
Seshd is a gym/workout tracker built as a **single-file React + Vite PWA**, shipped to iOS via **Capacitor 8**. Almost all app code lives in **`src/App.jsx`** (very large — ~22,300 lines). Treat that file as the whole app unless told otherwise.

- Repo: `github.com/moproblems49/spotr` → deploys to `spotr-drab.vercel.app` (Vercel)
- Bundle id: `com.seshd.app` · Apple Team ID: `66M7SCD5GA`
- Supabase project ref: `zwsoxvekobvtvsphesef`
- Owned domain: `getseshd.app` — used ONLY for transactional email (Resend SMTP, sender
  `hello@getseshd.app`); the app itself still lives on spotr-drab.vercel.app.
- **There is no Ashley doing separate work.** Mo does all Xcode/TestFlight/Mac-side work himself,
  typing whatever commands/clicks Claude tells him to, on a Mac he has access to that belongs to a
  friend named Ashley. Every "Mac day" walkthrough in this file is Mo at the keyboard, one step at
  a time — never assume a second person is present or needs separately-addressed instructions.
  (Corrected Aug 22, 2026 — an earlier session's "Ashley checklist" framing was wrong; ignore any
  wording below that still addresses a separate "Ashley.")

## Who I'm working with
Mo is **non-technical**. He doesn't write code. So:
- **Write all the code yourself.** Don't ask him to edit files or run complex commands.
- **Don't explain code changes unless he asks.** Lead with what changed and what he needs to do next.
- **Lead with honest tradeoffs.** If something is a bad idea, a lower priority, or can't actually work (e.g. a web app can't post directly to an Instagram story), say so plainly instead of building the wrong thing.
- Keep him moving: end each piece of work with exactly what to do next (commit/push or test on device).

## The workflow (important — follow this every time)
**One change → verify → commit.** Don't batch many speculative changes.

1. Make ONE focused change to `src/App.jsx` (or the relevant file).
2. **Verify it compiles** before moving on:
   ```
   npx esbuild src/App.jsx --bundle --packages=external --loader:.jsx=jsx --outfile=/dev/null 2>&1 \
     | grep -E 'not valid inside a JSX|ERROR' && echo "BROKEN" || echo ok
   ```
   (ignore the `import.meta` notice.) **esbuild REPORTS A STRAY `)}` IN JSX AS A *WARNING* AND
   EXITS 0 — the real Vite/rolldown build fails on it.** Deleting a conditional wrapper and leaving
   its closing `)}` behind therefore passed the compile check, passed `sim_undef`, and only blew up
   at `npm run build` — which, if the next step had been a bundle publish rather than a test run,
   would have shipped nothing at all. Grep for that warning explicitly, or just run `npm run build`,
   which is the only check that agrees with production.
3. For logic changes, verify behavior with a quick Node/jsdom check rather than trusting a string match. Render or parse — don't grep minified data (the muscle-icon base64 and exercise maps produce false grep hits).
4. **Bump the version comment** on line 1 of `src/App.jsx` (e.g. `// v178091716487` → increment the number). This is the Vercel cache-buster — bump it on every change or the deploy may serve a stale build.
5. Commit with a clear message. Push when Mo says he's ready (he often batches the push).

Standard commit/push:
```
git add src/App.jsx
git commit -m "<clear message>"
git push
```
**★ ALWAYS PUBLISH THE OTA BUNDLE WITH EVERY CHANGE** (Mo's standing instruction: "always push the
app"). Pushing to git alone does NOTHING for his phone — the installed app only updates when a new
bundle is published. So finish every change with the publish recipe in `api/app-update.js`:
delete the old zip FIRST → build with the real `.env.local` → `( cd dist && zip -rq
../public/bundles/seshd-<ver>.zip . )` → bump `LATEST_VERSION` **AND `BUNDLE_SHA256`
(they are ONE step — see below)** → `node build/ota_assets_check.mjs <zip> dist` → commit + push. **The parentheses
are load-bearing.** A bare `cd dist && …` strands the shell in `dist/` if any link of the chain
fails, and the Bash tool's cwd PERSISTS into the next command — that is how a later
`rm -f .env.local` ran inside `dist/`, silently missed the real one at the repo root, and left a
live key sitting in the working tree. A subshell cannot change the caller's cwd at all. Same rule
anywhere else a `cd` appears in a chain; always re-check with an ABSOLUTE path afterwards. Bump the version
suffix (…a → …b → …c) each time. Sanity-check the built bundle carries the REAL supabase URL (a
stub-built bundle breaks sign-in for everyone).
**"Delete the old zip FIRST" is load-bearing, and it has been getting missed.** `npm run build`
copies `public/` into `dist/` — so if the previous bundle is still in `public/bundles/` when you
build, it lands in `dist/bundles/` and the new zip contains the OLD ZIP INSIDE IT. Every phone then
downloads both. Measured Aug 2: `2026-07-30l` was 3.8MB and 1.9MB of that was the `k` bundle nested
inside it; built in the right order, `m` is 1.9MB. Nothing breaks — the app ignores the stray file —
but OTA downloads had roughly doubled. If you build before deleting, `rm -f dist/bundles/*.zip`
before zipping. Check with `unzip -l <zip> | grep -E '^ +[0-9]+.*\.zip$'` — that must print nothing.
(Don't grep bare `'\.zip$'`: unzip's own `Archive:  …zip` header line matches it and reads as a
false positive. Size is the faster tell — a correct bundle is ~1.9MB, a doubled one ~3.8MB.)
**★ THE OTA REPLY NOW CARRIES A `checksum`, AND A WRONG ONE BRICKS EVERY PHONE AT ONCE.**
`api/app-update.js` serves `BUNDLE_SHA256`, the lowercase hex sha256 of the published zip. The
plugin hashes what it downloaded and, when that field is non-empty, **DELETES the bundle and
aborts** on any mismatch (`CapacitorUpdaterPlugin.swift:4383`, stat `checksum_fail`). Until
2026-09-02 the endpoint sent nothing, which the plugin reads as "skip verification", so a bundle
corrupted or swapped in transit installed happily. It needs NO Mac and NO public key: with no
`publicKey` configured `decryptChecksum` returns the value unchanged (`CryptoCipher.swift:35`), so a
plain sha256 is what it compares, and the JSON key is literally `checksum` (`InternalUtils.swift:258`,
no CodingKeys remap). **Be clear what it is: an integrity check, not a signature** — it proves the
bundle is the one this endpoint published, not that the publisher was authorised. Real signing needs
a private key held outside the repo with its public half compiled into the binary (a Mac day), and
it is the thing that would actually protect the OTA channel from a compromised GitHub account.
**The hazard it introduces is the reason `ota_assets_check` is now mandatory rather than advisory**:
a stale or hand-edited hash does not degrade to "no check", it makes every device download, reject,
delete and retry forever while the app looks perfectly healthy. Nothing else in this repo can see
that — the web build never calls the endpoint and no sim downloads a bundle. The guard reads both
constants OUT of `api/app-update.js` (a guard that hardcodes the value under test is testing its
copy) and asserts the hash matches the zip, is 64 hex chars, and that `LATEST_VERSION` names the
same file. Red-proofed three ways: one wrong character, a truncated paste, and a version left
un-bumped. Run it after editing those constants, never before.
**Where the "real `.env.local`" comes from in a sandbox session:** it isn't in the repo (the values
live in Vercel), so RECOVER IT FROM THE LAST PUBLISHED BUNDLE — that bundle was built with the real
values, so they're sitting in its JS:
```
cd <scratch> && unzip -qo /home/user/spotr/public/bundles/seshd-<prev>.zip
KEY=$(grep -rohE 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}' assets/*.js | sort -u | head -1)
printf 'VITE_SUPABASE_URL=https://zwsoxvekobvtvsphesef.supabase.co\nVITE_SUPABASE_ANON_KEY=%s\nVITE_POSTHOG_KEY=\n' "$KEY" > /home/user/spotr/.env.local
```
Do this BEFORE deleting the old zip. Delete `.env.local` right after the build, and always confirm
`grep -roh 'https://[a-z0-9]*\.supabase\.co' dist/assets/*.js` shows `zwsoxvekobvtvsphesef`, not `stub`.
(VITE_POSTHOG_KEY is deliberately empty in every published bundle so far — analytics is off.)
Shell note: never put `pkill` in a `&&` chain — it kills the whole shell (exit 144) and the rest of
the chain silently never runs. A version bump chained after a `pkill` got skipped exactly that way.
Sibling trap: a background wait-loop polling `pgrep -f run_sims.mjs` MATCHES ITSELF — the pattern
string is in its own command line — so two such loops see each other and spin forever after the
battery exits. Four deadlocked monitors accumulated this way in one session ("I see 4 tasks
running"). Poll a PID file or a marker file, not a `pgrep -f` of a string your own command carries.
In remote (claude.ai) sessions the standing directive is to push every change to BOTH the
session branch AND `main` (`git push -u origin <branch> && git branch -f main HEAD && git push origin main`
— main has always been a fast-forward so far). Version-bump one-liner that avoids hand-editing:
`cur=$(head -1 src/App.jsx | grep -oE '[0-9]+'); sed -i "1s/v${cur}/v$((cur+1))/" src/App.jsx`.
DB changes: apply directly via the Supabase MCP (`apply_migration`/`execute_sql`) — verified RLS
with `SET LOCAL ROLE`/`request.jwt.claims` role-sims; direct HTTPS to supabase.co is blocked by the
sandbox network policy (use MCP, not curl). Vercel note: pushes to main DO deploy — a "404" on a
policy page turned out to be pure browser cache (incognito confirmed live), don't chase deploy ghosts.

**Fable 5 is back in rotation for audits and complicated work** (Mo, Aug 24) — the Aug 3 credit
issue (three mid-audit run-outs, produced nothing each time) is resolved. Cold-context Opus agents
had found real bugs all the way through in the interim — including two fixes that shipped inert and
a ReferenceError that broke sharing — which is the reminder that the independence that matters in
practice is a FRESH CONTEXT, not which model runs it. Use either; if a Fable-run audit round comes
back empty or a run visibly fails partway through, say so plainly rather than reporting a clean
pass, and fall back to Opus for that round.

## The health sweep (Mo's standing request: "run the sweep", every few days)
A production-side check that needs no Mac and no device. It is NOT the sim battery — the battery
proves the code is right, the sweep proves the LIVE SYSTEM is behaving. Both times it has been run
it found something real that nobody had reported: a mid-review demo corpus that had gone stale
(the reviewer's own account showed an empty muscle map), and 1,650 Postgres errors a day from
`personal_records` upserts that had never once updated a row.
**When Mo says "run the sweep" (or "do a sweep"), do all five:**
1. **Postgres error rate.** `query_logs`, `source='postgres_logs'`, group by
   `log_attributes['parsed.error_severity']`, then by `sql_state_code` + `parsed.query`. A handful
   of errors is normal; hundreds is a bug. **Bursts of a round number (~50) are the tell for a
   client queue replaying a write that can never succeed.** Note: the ClickHouse backend rejects
   `positionCaseInsensitive`/`body` predicates — filter on `log_attributes[...]` equality instead,
   and there is no `body` column.
2. **Security + performance advisors** (`get_advisors`). Check every finding against this file
   before acting: `public_profiles` SECURITY DEFINER, the two redeem RPCs and
   `profile_is_public` are all DELIBERATE. `profile_is_public`'s EXECUTE grant is load-bearing —
   it is called inside six RLS policies, which evaluate with the CALLER's privileges, so revoking
   it would break visibility rather than harden it.
3. **Auth logs** for failed-login spikes or reset-email failures (`source='auth_logs'`).
4. **~~Demo-corpus freshness~~ — RETIRED Aug 31 2026, do not do this by reflex any more.** The
   five content personas were deleted once App Review cleared, so there is no corpus to keep warm
   and no every-few-days re-dating treadmill. `seshdreview` survives as the review login and its
   own content ages too, but that only matters BEFORE A SUBMISSION — re-date it then, not on a
   sweep. What to check here instead: nothing. Skip to 5.
5. **Storage/table growth** — orphaned images, a table growing faster than the user count explains.
   Also run the **orphaned-member_ids** check, which nothing else can see:
   `select count(*) from groups g, unnest(g.member_ids) m where not exists (select 1 from profiles p where p.id = m)`
   — must be 0. Non-zero means an account was deleted without `remove_user_from_all_groups` firing.
6. **The pg_net tripwire** — for the one finding that CANNOT be fixed from here (see Security
   Round 2). `net.http_post`/`http_get` are EXECUTE-able by PUBLIC and the grant is unrevokable
   without `supabase_admin`, so watch the two conditions that would turn it from latent into a live
   unauthenticated SSRF instead. BOTH must stay false:
   ```sql
   select coalesce((select array_to_string(rolconfig,' ') from pg_roles where rolname='authenticator'),
                   '(default: public, graphql_public)') ilike '%net%'            as net_is_rest_exposed_BAD,
          (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname in ('public','graphql_public')
              and p.prosrc ~* 'net\.http_(post|get)' and p.pronargs > 0)        as public_wrappers_BAD,
          (select count(*) from pg_trigger where tgrelid='net.http_request_queue'::regclass
             and tgname='aaa_pgnet_enqueue_guard')                              as pgnet_guard_MUST_BE_1;
   ```
   The third number is the enqueue guard that makes the unrevokable grant inert (only
   `service_role`/`postgres` may enqueue; anyone else raises). It must be **1** — a guard that
   silently stops existing is the exact disease this file is about. Also note `net._http_response`
   (the stored RESPONSE BODIES of every outbound call) is SELECT-able by `anon`/`authenticated` and
   is likewise unrevokable from here; the guard does not cover it, and the ONLY thing that keeps it
   unreachable is the same `net_is_rest_exposed_BAD` staying false.
   Red-proofed: creating a `public` function that forwards a `text` URL into `net.http_post` takes
   the second number 0 -> 1 (probe rolled back, nothing left behind).
   **AND CHECK THE GUARD IS STILL THERE** — the grant is now made INERT by a BEFORE INSERT trigger
   on the queue (see the entry below). It is lost SILENTLY if that table is ever recreated (a pg_net
   upgrade, or a drop/recreate of the extension), with pushes still working and the protection gone:
   ```sql
   select count(*) from pg_trigger
    where tgrelid='net.http_request_queue'::regclass and tgname='aaa_pgnet_enqueue_guard';  -- must be 1
   ```
Report findings even when everything is clean; "the error rate went from 1,650/day to single
digits" is the point of running it again after a fix.
**Sweep #3 (Aug 28, ~04:40 UTC), for the next run's baseline:** 950 of 953 daily Postgres errors
were still the personal_records 23505 in replay bursts — but the last burst was 00:00 UTC and the
client's fixed URL can't produce this error at all, so it was the pre-`2026-08-28b` bundle
finishing its run; NEXT SWEEP MUST CONFIRM ~0. Auth logs clean. `client_errors` (a real table —
device-side crash telemetry, worth reading in step 5) had logged nothing in 12 days; its newest
rows are the missing-push-entitlement (Mac-day item) and one pre-fix PROGRAM_TEMPLATES hit.
Two orphaned `post-images` objects (~5.4MB, May 1 + May 29, momo's own, predating the Aug 16
storage-delete work) were DELETED on Mo's say-so — and the method matters, because the obvious
one is wrong. **`DELETE FROM storage.objects` is blocked by `storage.protect_delete()`, and that
guard is right**: the row is only metadata, so a SQL delete hides the file while stranding the S3
bytes forever with the record of where they were now gone. Do not disable that trigger. The
Storage API is the real route and it is UNREACHABLE from this sandbox (no service-role key in the
env; direct HTTPS to supabase.co is blocked by the network policy). What worked: deploy a
disposable edge function that calls `DELETE /storage/v1/object/<bucket>` with the runtime-injected
`SUPABASE_SERVICE_ROLE_KEY`, then invoke it from Postgres via **`net.http_post`** (pg_net is
installed) since the sandbox can't reach the function URL either, and read the reply out of
`net._http_response`. **Hardcode the target paths in the function** so an unauthorized call can do
nothing but re-delete already-doomed files, and retire it immediately after (there is no
`delete_edge_function` MCP tool — redeploy it as an inert 410 stub; `cleanup-orphan-images` is
that stub now and is safe for Mo to delete from the dashboard). Verify orphanhood FIRST by
scanning every text/jsonb column in the public schema for the filename, not just the two columns
you remember — a reference hiding in a jsonb blob would make it a live image. `workout_codes` carries two duplicate permissive DELETE policies ("Users delete own
workout codes" + "own workout_codes") — harmless, consolidate whenever that table is next touched.
The two backup tables show "RLS enabled, no policy" in advisors: that means clients can't read
them at all, which is CORRECT for a backup — not a finding.

## ★★★ MEASURE IT; DO NOT TRUST THE READING (Mo made this the standing rule, Aug 30)
Three times in one session I told Mo something was fixed and the next audit found it was not, and
every one had the same shape: **I concluded from reading the code instead of driving it.**
- the chat-overlay host dead-zone — I fixed ONE call site of a class and reported the class fixed;
- the shared-post merge — the fix was real and `loadUserData` wiped `store.posts` one line earlier,
  so it was inert, and I only found that after patching the WRONG site and watching the check stay
  red (**when a fix does not take, find the code that runs BEFORE it, not a better version of it**);
- "hosts missing from the early returns" — I flagged a bug that instrumenting proved did not exist.
The rule now: **a claim about behaviour is not finished until something ran.** Drive the screen,
instrument the function, print the value, read the log — then say it. And the corollary that keeps
biting: **a probe is code too, so it needs the same suspicion.** In this session alone the probes
produced a single-sample toast check that could not tell "never shown" from "shown and gone", a
kudos check that counted only POSTs when the tap was a DELETE, an absence check satisfied by a
fixture omission, a fixture seeded inside the very window the test policed, and a selector that
matched the screen it was meant to see past. Every one made a real bug look like a passing test.
**Confirm a new check goes RED against the old code before believing it is green against the new.**

## Verification methodology (how we catch regressions)
**Run the whole battery with one command: `node build/run_sims.mjs`** (49 sims, ~90s — count grows as
sims get added; verify with the runner's own summary line rather than trusting a number in this
file). It rebuilds the bundle first (stale bundle = false failures) and reads each sim's real exit
code. `--no-build` skips the rebuild. Use it before any commit touching workout, health, profile,
feed or gesture code. Add `sim_*.mjs` to `build/` and the runner picks it up automatically.

**`node build/run_sims.mjs --pw` also runs the 46 Playwright suites** (+~3min): it builds dist with
STUB env, serves it on :8199, runs every `pw_*.mjs`, then stops the server and deletes `.env.local`
in a `finally` (a lingering stub `.env.local` is how a published bundle ends up unable to sign
anyone in — the delete must never be skippable). These were opt-in-by-memory for a while, which is
exactly how a suite rots; run `--pw` before any commit touching layout, gestures, overlays or the
volume/set/PR maths. **Never chain `pkill` to clean up the server** — it kills the whole shell
(exit 144, cost a run here).

**A new sim/test must be shown to FAIL against the old code before you trust it.** Copy
`src/App.jsx` aside, revert just the fix in place, rebuild the bundle, run it, confirm red, then
copy the good file back. (`git stash` works too but `git stash pop -- <path>` is not valid syntax
and has cost a scramble here — a plain `cp` is safer.) When the old revision doesn't EXPORT the
function under test, an import error is not a red result: measure the old behaviour with a probe
instead, or reintroduce the bug in a scratch copy.

**`git checkout <commit> -- <path>` WRITES *AND STAGES*, and that has silently reverted main.**
Restoring one file from an older commit to prove a test goes red left `src/App.jsx` staged at the
OLD revision; the next `git commit` shipped it, undoing every fix in the session — including an
onboarding crash — and nothing in the output said so. To go back to the working tree's own version
use `git checkout HEAD -- <path>`; better still, `cp` the good file aside first and `cp` it back,
which touches the index not at all. **Read `git status` before every commit in a session that has
reverted a file for any reason.**

**A SCRIPT THAT CANNOT FAIL DOES NOT BELONG IN THE BATTERY.** Two measurement scripts (timing the
swipe's first frame, mapping which screen regions accept a gesture) were dropped into `build/` and
the runner picked them up as `pw_*` suites. They print numbers and exit 0 unconditionally, so they
reported PASS forever and padded the count with two suites that assert nothing. Measurement is
useful — it is how the "laggy swipe" turned out to be a swipe that never started — but keep it in
the scratchpad, or give it a real assertion. The finding belongs in a suite; the probe does not.

**A TEST THAT RE-IMPLEMENTS THE APP'S MATHS TESTS NOTHING.** `sim_recovery_scale` replicated the
recovery formula and pinned the replica to src/App.jsx with regexes; a new confidence cap shipped
and every number in the sim was unaffected, because the replica had never heard of it.
`sim_healthinputs` asserted that regexes still MATCHED source lines, which can only notice a
deleted line. `sim_sleepstage` copied readRecovery's sleep filter and then pinned the copy — a
guard for a guard. All three now import the shipped function; nothing in the battery asserts on
source text. If the thing you want to test isn't reachable, EXPORT it (`readRecoveryFrom(H, now)`,
`recoveryScoreFrom`, `strengthScoreHistory`, `softCap*` all exist for exactly this reason) rather
than copying it into the test.

**Check your fixture reached the screen before believing the result.** A verification script that
looked for the Body Battery sheet on the tracker tab (it lives on your own PROFILE) clicked
nothing, screenshotted the home page, and reported both removals as successful. Scripts here now
fail loudly when the thing under test did not render. Same class: the accent tour's `tapNav` calls
silently did nothing during a live workout — which has NO tab bar — and it re-shot the workout
screen four times under the names feed/discover/profile. Two tests written this way turned
out to be measuring the wrong thing — one asserted on a locator that matched the day-name input,
another double-counted cards because a DOM heuristic matched every ancestor whose textContent
merely *started* with the label. Both printed a confident PASS/FAIL that said nothing about the
app. When a Playwright assertion disagrees with the app, screenshot it and LOOK before changing
the app — twice now the app was right and the test's DOM query was wrong.

There are jsdom simulation scripts that mount the real app bundle and exercise flows. To run one by
hand, rebuild the ESM bundle first (stale bundle = false failures):
```
npx esbuild src/App.jsx --bundle --format=esm --loader:.jsx=jsx --jsx=automatic \
  --outfile=build/app.mjs --external:react --external:react-dom \
  --external:react-dom/client --external:react/jsx-runtime \
  --define:import.meta.env.VITE_SUPABASE_URL='"https://stub.supabase.co"' \
  --define:import.meta.env.VITE_SUPABASE_ANON_KEY='"stubkey"' \
  --define:import.meta.env.VITE_POSTHOG_KEY='""' \
  --define:import.meta.env.DEV='false'
```
(the last two defines are required — without them the bundle throws `Cannot read properties of undefined (reading 'VITE_POSTHOG_KEY')` at import time and every sim fails before it even renders)
Key sims (run ONE per invocation; they take ~1–2 min): a workout-flow sim (logs sets, checks no crash), an editor sim, an auth sim, a profile/readiness sim. Each prints PASS/FAIL-style lines. Use them after any change that touches the workout, profile, feed, or swipe code.

**Harness gotcha (cost a masked failure once):** run sims from the repo's `build/` dir — NOT from an external scratch dir — so the sim and the app bundle resolve the SAME React instance (two copies = invalid-hook crash). `jsdom` is installed `--no-save`, so ANY `npm install` in the repo prunes it — reinstall with `npm install --no-save jsdom` after touching dependencies. And never gate a commit on `node sim.mjs | tail` — the pipe exit code is tail's, not the sim's; run the sim bare or check PIPESTATUS.

To write a new sim, copy the harness header from an existing one (it seeds a guest workout and a female body type), then append the specific interaction + assertions.

### Playwright visual verification (renders the REAL app — use for any UI/visual change)
jsdom sims prove behavior; Playwright proves it LOOKS right. The polish run caught 5 shipped
visual bugs this way (serif-font fallback, cover-scrim smudge, etc.) that no sim would see.
Recipe (worked examples in `build/shots.mjs` (App Store screenshots), `build/polish_tour*.mjs`):
1. Build with stub env — write `.env.local` (VITE_SUPABASE_URL=https://stub.supabase.co,
   VITE_SUPABASE_ANON_KEY=stubkey, VITE_POSTHOG_KEY=) → `npm run build` → delete `.env.local`.
2. Serve: `cd dist && python3 -m http.server 8199 &` — **and do NOT "fix" this into a subshell.**
   It looks like the stranding shape from the publish recipe and is not: in bash `&` terminates the
   whole AND-OR list, so the ENTIRE `cd … && …` already runs in a background subshell and the
   caller's cwd is never touched (measured, including with a deliberately failing `cd`). Wrapping
   it in `( … )` still serves, but the outer subshell exits immediately, so you get an EMPTY `$!`
   and no `jobs` entry — and the only way left to stop the server is `pkill`, which kills the whole
   shell (exit 144). The parentheses belong on the ZIP step, where the chain is synchronous and
   genuinely does strand the shell; they are a regression here.
   The server dies between long steps — re-check `curl -s http://127.0.0.1:8199/` before each run
   or every shot is a Chromium error page.
3. `npm install --no-save playwright-core jsdom` — install BOTH TOGETHER; any `--no-save`
   install prunes the other one. Chromium binary: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
   (launch with `executablePath` + `--no-sandbox`; never `playwright install`).
4. Seed a signed-in app via `page.addInitScript`: localStorage keys `seshd_v1` (store JSON),
   `seshd_session`, `seshd_onboarded=1`, `seshd_custom_merge_v1=1`, and optionally
   `seshd_active_session` + `seshd_wstart` for an in-progress workout.
5. Route supabase: FULFILL `/auth/v1/*` (fake token/user JSON — otherwise the app bounces to
   the welcome screen / guest banner) and ABORT `/rest/v1/*` (loadUserData fails gracefully and
   the seeded local store keeps rendering).
6. Driving gotchas: `page.setDefaultTimeout(3000)` or one bad locator hangs the whole tour;
   there are ~9 `aria-label="Close"` nodes — always filter `.locator("visible=true")`;
   the Settings sheet closes via its "Done" TEXT button, the Body screen via the "‹" Back chevron
   (generic Close/Escape do nothing — a stuck overlay makes every later shot identical);
   viewport 428×926 @ deviceScaleFactor 3 = 1284×2778 (the App Store size).

## Conventions & gotchas
- **`C` theme object** holds all colors. Inline styles everywhere — no CSS classes/files, with ONE
  exception: `src/index.css`, which carries exactly three things and each is load-bearing:
  the app-wide `font-family` fallback (same stack as `F`; keep them in sync — any element missing
  an inline `fontFamily` used to render in the WebView's default Times serif, and that shipped on
  ExerciseDetail); `overscroll-behavior:none`; and a dark `background:#0a0a0a` so any pixel a
  transform momentarily exposes (the strip behind the chat screen during an iOS edge-swipe-back) is
  the app background rather than WebView white. Read the comments in it before changing anything —
  they say which rule is the real fix and which is only covering the frames before React mounts.
- **`TYPE` and `RADIUS` are the design scales — and the consolidation behind them is DELIBERATELY
  NARROW.** A design critique called the app "generic AI" and one of its named tells was arbitrary
  geometry. Measured: **37 distinct font sizes** (including 48 uses of HALF-PIXEL sizes — 8.5, 12.5,
  13.5) and **26 distinct corner radii**, nine of them used three times or fewer. What was actually
  fixed: every half-pixel size snapped to an integer, always **DOWN, never up** (down can only make
  text imperceptibly smaller; up can overflow a box that fits today), and the three genuinely
  arbitrary card radii (13/15/28, five call sites) moved onto the scale. What was deliberately NOT
  touched, and why: the 10/11/12/13/14 font cluster is ~800 sites and collapsing it would visibly
  resize text on every screen with no test able to verify the result; and most of the "26 radii" are
  not card corners at all but **circle and capsule geometry** — 17/19 are half of a 34/38px round
  button, 44 is half an 88px avatar, 20/22/26 are pills on short elements, and 2/3/4/5 are
  half-height rounding on thin progress bars. Snapping those onto a card scale changes their SHAPE
  for no design gain. **My own first read of this was wrong and worth remembering**: I reported
  "everything is the same large radius" from memory; measuring found the opposite problem
  (arbitrariness, not sameness) and low containment counts. Measure the geometry before critiquing
  it. Sim: `sim_designscale` (source-level — a stray 12.5px renders fine, breaks no test and is
  invisible in a screenshot, so nothing else in the battery can see it).
- **One easing token: `EASE_NAV`** (`cubic-bezier(0.32, 0.72, 0, 1)`, the iOS decelerate curve).
  The app had grown NINE different curves and no two transitions felt related. Every
  screen-scale movement — tab slide, pushed screens, swipe release, edge-swipe-back, progress
  fills — goes through it. Don't add a tenth curve; and if you add a token, WIRE it, because the
  first attempt declared three and applied raw literals, leaving all three as dead code (two have
  since been removed — `EASE_NAV` is the one that's real).
  **Correction, measured Aug 18: "one easing token" was never true of the whole app, and this entry
  overclaimed.** `npx impeccable detect` found **nine live `cubic-bezier(0.34, 1.56, 0.64, 1)`
  overshoot curves** — a third family the consolidation never touched, because it only swept
  SCREEN-SCALE movement. They sit on `PullToRefresh`, `AnimatedNumber`, `SwipeToDismissRow`'s
  release, the done-tick pop, and — via the injected stylesheet's bare `button { }` rule — EVERY
  BUTTON PRESS IN THE APP. So the accurate statement is three families: `EASE_NAV` for navigation,
  `EASE_EXIT` for leaving, and an unnamed spring for press/release feedback. Whether the spring
  should stay is a taste call and is NOT settled — a 0.14s overshoot on a button press is close to
  invisible, but it is the app's most-fired transition and it is not tokenised. Don't silently
  "consolidate" it away; the nine sites are deliberate-looking and changing them alters how every
  tap in the app feels.
- **EVERY BOTTOM SHEET GOES THROUGH `<Sheet>`.** Two of the app's nineteen sheets animated in and
  NONE animated out, so seventeen popped into existence and all nineteen vanished on a frame — the
  same "did I break it?" feeling as an unanimated navigation. `Sheet` (near `SHEET_MS`) owns the
  mount delay, the backdrop fade, the translate, the unmount timer and the portal; a sheet built by
  hand will drift out of sync within a release. **`EASE_EXIT`** (`cubic-bezier(0.4, 0, 1, 1)`) is
  the second and last curve in the app and exists only for LEAVING: entering decelerates into
  place, leaving accelerates away. Using `EASE_NAV` to exit makes a sheet lurch off the mark. The
  migration itself shipped four regressions caught by audit, all the same shape — a sheet whose
  close path went through the old local state instead of the new `open` prop — so when migrating
  one, drive it on screen and close it, don't just read the diff.
- **A `<Sheet>` that must survive a re-render keeps its draft on the OWNING state object, not in a
  sibling `useState`.** The finish sheet's caption and photo live on `workoutSummary`
  (`captionDraft`, `photoDraft`) precisely so clearing `workoutSummary` clears them, and a draft
  can never leak onto the next workout's share.
- **Animate `transform: scaleX()`, never `width`.** Four progress bars animated width, which forces
  layout + paint every frame; the rest-timer bar does that 4×/sec for the whole rest period. They
  use `transformOrigin:"left center"` + `scaleX()` + `willChange:"transform"` now, which the GPU
  composites. Parents already clip with `overflow:hidden` + radius so rounded ends still work.
- **Section headings render through `SectionLabel`** — they had drifted into two sizes and two
  letter-spacings across History and Profile.
- **Don't reintroduce a global `font-size:16px !important` on inputs.** It was there as the standard
  stop-mobile-Safari-zooming-on-focus trick, but `!important` beat every inline `fontSize` in the
  app (exercise notes rendered larger than their own labels). The native shell locks zoom at the
  viewport, so it bought nothing. There's a plain 15px FLOOR now for inputs that set no size of
  their own; inline styles win. Caveat recorded in the code: mobile Safari ignores
  `user-scalable=no`, so focus-zoom returns if the WEB build ever gets real users.
- **A FREE IDENTIFIER IS A `ReferenceError`, AND NOTHING IN THIS TOOLCHAIN REPORTS ONE.** esbuild
  resolves IMPORTS, not free variables, and there is no linter — so a name that binds to nothing
  compiles clean, ships, and only fails when that line runs, into a swallowing catch or the error
  boundary. Two were live on main simultaneously (found Aug 15): `PROGRAM_TEMPLATES`, deleted by
  90927ed as collateral damage while its three references stayed — it is read at the TOP OF THE
  `Onboarding` COMPONENT BODY, so **every new signup got "Something went sideways" instead of the
  first screen for twelve days**, and "Browse templates" crashed too; and `todayMs`, read twice in
  `buildCoachContext` but declared only inside a DIFFERENT function, so the Weekly Review always
  threw and the caller's catch turned it into a silent "error" state — that feature had never once
  worked. `sim_undef` (+ `undef_scan.mjs`) is the standing check: it transforms the JSX away and
  walks the scopes with acorn. **Run it after deleting anything** — the failure mode of a deletion
  is a survivor reference, and grep for the symbol is the cheap version of the same check.
- **A prop you forgot to pass is a `ReferenceError`, and a surrounding `catch` will eat it.**
  `WorkoutTracker` referenced `isGuest` twice without receiving it as a prop and with no
  module-level binding, so both lines threw into a swallowing catch: `pr_events` was NEVER synced
  to the server (Wrapped read "0 PRs" for weeks that had real ones) and `hr_summary` never reached
  it either. Nothing logged, nothing looked broken. When a sync "just doesn't happen", check the
  component actually receives every identifier it names before looking at the network.
- **★ A BARE `setStore` WITH NO SERVER WRITE IS ERASED BY THE NEXT REFRESH — THIS IS THE DOMINANT
  BUG CLASS IN THIS APP.** `loadUserData` REPLACES 28 store keys WHOLESALE from the server, and it
  runs on boot and on every foreground. So anything written only to the phone looks perfectly saved
  — it renders, it survives a tab switch — and is silently gone on the next launch. Two shipped
  this way: **the onboarding starter program** (bare `setStore`, never POSTed, so every new user
  landed on "No active program" a minute later) and **"Import a program by code"** (POSTed a base36
  `uid()` into a `uuid NOT NULL` column with no `user_id`, failed 22P02 into a `.catch(devError)`,
  and showed a "Program imported" toast anyway). Rules: every user-visible change writes to the
  server in the same handler; a write that can fail must surface the failure, never toast success
  from the optimistic path; and mint a real UUID for any id that lands in a uuid column
  (`asUuidOrNull`). All 28 keys have since been audited against `loadUserData`; the only
  deliberately local one is `historyInteractions`, which has no table at all. Sims:
  `pw_persistence` (drives real settings and asserts a matching write left the client) and
  **`pw_journey`**, which walks signup → onboard → start → log → finish → share → RELAUNCH against
  a STATEFUL stub server that returns only what the client actually sent it. A local-only write
  cannot survive that reload, which is exactly the mechanism all three bugs used.
- **A STUB THAT ACCEPTS ANYTHING CANNOT CATCH A SCHEMA BUG.** `pw_journey`'s server models the real
  column types — it 400s a non-uuid `id` (22P02) and a missing `user_id` (23502) — because the
  import-by-code bug was precisely a write the DB rejected and the client reported as success. If
  you add a table to a test stub, model its NOT NULLs and its id type.
- **UI NOTHING CAN OPEN IS INVISIBLE TO EVERY OTHER CHECK.** `showGroupShare` had a complete picker
  sheet, a complete `finishWorkout` fast path and a "Back" button returning to a modal it was never
  opened from — and `setShowGroupShare(true)` did not exist in ANY commit. The whole feature shipped
  dead and sat that way for six weeks. `build/deadui_scan.mjs` (+ `sim_deadui`) walks the
  JSX-transformed AST for two shapes: a `useState` setter that can never be called with anything
  truthy, and a PascalCase component declared and never referenced. Its own first version MISSED the
  bug it was written for — a destructured setter binds inside an `ArrayPattern`, which the naive
  "is my parent a declarator?" test read as a reference and skipped — so it now pre-collects binding
  sites, treats `useState(true)` as already-open, and refuses to conclude anything about the 20
  setter names this file declares more than once. It prints what it did NOT examine; read that line
  before treating a clean run as "no dead UI anywhere".
- **`alignItems:"center"` on a scrollable backdrop clips the TOP of an over-tall child**, not the
  bottom — so a tall modal loses its header and close button under the status bar. Centre with
  `margin:auto` on the card and let the backdrop scroll.
- **Pluralize user-facing counts** (`{n} member{n===1?"":"s"}`) and **suppress zero/meaningless
  deltas** ("▲ 0% volume", "+225 over your previous best" on a first-ever PR — `hitPRs` carries a
  `firstEver` flag for this). Both classes of bug shipped once; check for them in new stat UI.
- **★ A NUMBER UNDER A "THIS WEEK" HEADING MUST BE WINDOWED, AND `store.prs` IS A LIFETIME MAP.**
  Mo: "Friends Activity says I have 57 PRs this week." He had exactly 57 rows in `personal_records`
  — one per exercise he has EVER set a PR on. **Two independent counters made the same mistake on
  the same screen**: his own row read `Object.keys(store.prs).length`, and the friends' query was
  `personal_records?user_id=in.(…)` with **no date filter at all**. Neither had anything to do with
  the week the heading named. `store.prs` / `personal_records` are CURRENT BESTS (one row per
  exercise, overwritten in place); the dated PR-hit log is **`store.prEvents`** / the `pr_events`
  jsonb, which is what Wrapped already counts — use it for anything time-boxed, and **dedupe by
  exercise name** so a lift that sets a weight PR and an e1RM PR in one session counts once.
  **The server-side half needed a DB fix, not a client fix.** `personal_records.updated_at` had
  `DEFAULT now()` and no trigger, and the client upserts `{user_id, exercise_name, weight_lbs}`
  with `Prefer: resolution=merge-duplicates` — **PostgREST's on-conflict UPDATE only touches the
  columns present in the payload**, so `updated_at` froze at the row's first insert and was
  unusable as a window. Proven on live data: a PR event dated 2026-08-10 whose row still read
  2026-05-22. Fixed with a `personal_records_touch_updated_at` BEFORE UPDATE trigger (bumping only
  when `weight_lbs is distinct from old.weight_lbs`, so a no-op re-sync can't fake a PR) plus a
  one-time backfill that moves `updated_at` FORWARD only and only to a date backed by a real
  `pr_events` row. A trigger rather than a client change on purpose: it is true for every
  already-installed app version. momo's count went 57 → 2. Sim: `pw_weeklyprs`.
- **★ CORRECTING LOGGED DATA MEANS FIVE SURFACES, NOT ONE — AND THE PHONE IS THE ONE THAT BITES.**
  Mo, Aug 19: "All my t-bar rows have an extra 45 lbs, can you go through my whole history and fix
  it?" — then, unprompted, "for tbar it's my fault, I added 45 to all my reps." **Not an app bug**:
  the code already knows a T-bar is one-sided (`isOneSidedBarbell`, "the bar doesn't add resistance
  — the user enters total plate weight directly") and never adds bar weight to a logged value. He
  had been typing the total including the lever. Corrected 44 sets across 14 sessions (2026-05-10 →
  08-05), which turned a 90→135 "progression" into a real 45→90 one. What that touched, and why
  each one mattered:
  1. `workout_history.exercises[].sets[].weight` — **STRINGS** here.
  2. `personal_records` — set to the true corrected best (90), not `stored − 45`: the stored 120 was
     already stale (history held 135), so blind subtraction would have preserved a wrong number.
     **The `personal_records_touch_updated_at` trigger has an ELSE branch that forces
     `new.updated_at = old.updated_at`**, so a normal UPDATE cannot restore the date — it has to be
     disabled around the restore. Skipping that would have stamped `updated_at = now()` and made a
     three-month-old lift count as a PR set THIS WEEK, straight back into the "57 PRs" bug.
  3. `profiles.pr_events[].weightLbs` — a **NUMBER**, unlike (1).
  4. `posts` / `group_posts` workout cards — `sets[].w` is a NUMBER, and the card's own `volume`
     has to drop by `45 × reps` or the card contradicts its own set ledger. `group_posts` has a
     `trg_enforce_group_post_author_edit` trigger; satisfy it by setting `request.jwt.claims` to
     act AS the author rather than by disabling a security control.
  5. **`store.prs` / `prsE1rm` / `prsVolume` ON THE PHONE — the one a server-side fix cannot reach.**
     `loadUserData` rebuilds all three from history and then MAX-MERGES the in-memory copy over the
     top (deliberate: it stops a failed PR upsert from losing a real best), and that copy is
     rehydrated from localStorage every boot — so the inflated 135 wins that max **forever** and the
     whole correction looks like it never happened. `migrateTbarPRs` (one-time, flag
     `seshd_tbar_pr_reset_v1`) strips the t-bar keys **inside `loadStore`, before hydration**, so the
     normal rebuild produces the corrected value with no special-casing. Sim: `pw_tbarpr`.
     **The first version ran as a `useEffect` after mount and `pw_tbarpr` caught it failing two
     ways**: it stripped the key AFTER `loadUserData` had already rebuilt it (so the PR was simply
     MISSING for the rest of that session) and a later persist of a stale snapshot put the inflated
     value straight back on the next launch. A migration that must beat the hydration cannot run
     after it.
  Method notes worth reusing: **back every affected row up to a table first**
  (`tbar_fix_backup_20260819`) — it made a mid-migration rollback a one-liner when the first pass hit
  a bad card; **guard the arithmetic on the value's plausible range** (one legacy card stored
  `{r:90, w:10}` — reps and weight swapped at write time years ago — and an unguarded `−45` turned
  its 10 into **−35**); and **only write a field the row already had** (a card with no `volume` key
  gained one reading `−1395`, which `PostCard` gates its VOL tile on). Verify by joining old to new
  on a REAL key — the first verification used `row_number() over ()` with no ORDER BY, which is
  non-deterministic across two queries and reported 10 of 44 sets correct on a migration that was
  actually perfect.
- **★ A DUAL-ASSESSMENT DESIGN CRITIQUE ON ONE SCREEN FOUND A REAL DUPLICATED-MAP BUG NEITHER
  DETECTOR WAS LOOKING FOR.** `/impeccable critique` on the Day Preview screen (`DayPreviewModal`)
  ran an LLM design review and a detector/browser-evidence pass independently; the detector's own
  rules (contrast, tap targets, generic anti-patterns) found nothing here that wasn't already a
  documented deliberate choice — but rendering the screen with a FULLER fixture than either
  scanner used on its own (an exercise on every muscle group, not just the ones visible in one
  screenshot) surfaced that the muscle→colour map for the left-accent stripe was **hand-copied
  into two places** (this screen and the day editor one tap away) and had drifted: this screen's
  copy was missing `"rear delts"` entirely (silently fell back to grey) and both copies mapped
  Quads and Hamstrings to the identical green (a leg day's stripes couldn't tell them apart).
  Same shape as the plate-colour bug — one map answering a question for two different callers.
  Fixed with one shared `muscleStripeColor(muscle, isDark)` + `MUSCLE_STRIPE_COLORS`/
  `MUSCLE_STRIPE_INK` (the light-theme deepened variants, same `accentInk` trick, since several of
  these hexes read fine as a small fill but fail 3:1 as a thin stripe on white — shoulders measured
  1.31:1). Shoulders itself was also byte-identical to `C.accent`, so the stripe, the icon tile, the
  rep chip and the "?" button all rendered the exact same lime on a shoulders exercise — moved to a
  fuchsia sitting in the widest open hue-gap between the other 12 categories.
- **A BADGE'S TEXT CAN BE HIGH-CONTRAST AND THE BADGE STILL BE INVISIBLE.** The Day Preview's PR
  tag was white text on a near-black fill (`#0A0A0A`) — 19.8:1 text contrast, genuinely excellent —
  but that fill measured **1.17:1 against the dark card it sits on**, so the badge SHAPE didn't
  read as a badge at all, while the rep-range chip beside it (a number that never changes) got the
  loud accent-tinted pill and visually won the row. Text contrast against its own fill is not the
  same question as a graphical object's contrast against what it sits ON. Fixed by swapping which
  element gets the loud treatment: the rep range is now plain text, and the PR badge uses `C.gold`
  (this app's existing PR/trophy colour) as a solid fill, which pops on both themes (10.16:1 / 4.93:1
  against the two card colours) instead of receding into one of them.
- **A LOOKUP KEYED ON A NUMBER THAT MEANS TWO THINGS IN TWO UNITS IS WRONG FOR ONE OF THEM.** The
  plate-disc colours were one map keyed on the plate NUMBER, shared by lbs and kg — but `25` is
  green in pounds and RED in kilos, and `10` is white in pounds and GREEN in kilos, so it could
  only ever satisfy one system. It shipped painting a 25kg plate green. Worse, because two kg
  plates (25 and 15) collapsed onto the same entry, a kg user's barbell diagram drew **two
  different plates in identical colours** and the legend beside it was simply false. `plateColor(p,
  unit)` takes both now, and `sim_platecolors` asserts no two plates within one unit share a
  colour. The colours themselves follow the IWF/IPF competition code, which is what a gym with
  coloured bumpers actually racks: kg 25 red / 20 blue / 15 yellow / 10 green, lbs 45 blue / 35
  yellow / 25 green. **The small change plates are deliberately INACCURATE** — a real 10lb/5kg is
  white and a 2.5lb is black, and each vanishes into one of the two theme surfaces. Anywhere a
  number indexes a physical thing, check whether the unit changes what that number IS.
- **A SATURATED FILL CANNOT CARRY CONTRAST ON BOTH THEMES — GIVE IT A RIM INSTEAD OF DARKENING
  IT.** The first cut of the plate colours shipped the accurate yellow and `sim_platecolors` caught
  it at **1.76:1 against the light theme's near-white card**, well under the 3:1 WCAG floor for a
  graphical object; a 9px yellow disc on that surface is invisible. The trap is the obvious fix:
  darkening the yellow until it clears 3:1 on white lands in olive-brown and stops being the
  plate's colour, which defeats the whole point. `PLATE_RING` (`inset 0 0 0 1px rgba(0,0,0,0.3)`)
  separates disc from surface without touching the fill — and it is what a real bumper plate looks
  like anyway. Fixed translucent black rather than a theme token on purpose: on light it does the
  work, on dark the fill already has the contrast and the rim just crisps the edge. Generalises:
  when a brand or real-world colour fails contrast, add a boundary, don't repaint the thing.
- **RUN `sim_undef`, NOT `undef_scan` DIRECTLY — AND NEVER EDIT BY STRING INDEX.** Both bit in one
  change. Deleting `DAY_COLORS` left one survivor reference (a `boxShadow` glow past column 165, so
  a `cut -c1-165` grep never showed it), which is a live ReferenceError; `node build/undef_scan.mjs`
  run on its own reported **"No unresolved identifiers"** while `node build/sim_undef.mjs` found it
  immediately — the sim rebuilds the transformed file first, so the bare scanner can read a stale
  one. The battery is the authority. Separately, the edit that was supposed to fix that button used
  `s.index(prefix)` to locate it, and the prefix also matched an EARLIER button changed moments
  before — so the replacement landed inside a COMMENT, silently, and the real button kept its broken
  `color:"#fff"`. `git diff` caught it. Replace on a unique full string with a `count == 1` assert;
  an index-based edit into a 25k-line file will eventually find the wrong occurrence.
- **★ THE DAY PREVIEW'S CARDS ARE GONE — THE FIRST DELIBERATE "LESS CONTAINMENT" CHANGE, AND THE
  HIERARCHY WAS THE REAL BUG.** Mo, from a screenshot: "I feel like it needs to be changed/redone."
  The screen was five identical maximal cards — rounded container + drop shadow + 4px muscle-coloured
  left rail + a 42px tinted muscle-icon tile — which is the **accent-rail-on-a-rounded-card** tell by
  name, five times, under three more rounded stat tiles. But the sharper problem was ranking, not
  decoration: the loudest element on every row was the **gold PR badge**, a lifetime best that may be
  months old, while the line you actually load off — `Last: 105×9 · 105×6` — was the smallest, dimmest
  text on the card. You open this screen to answer "what do I put on the bar today"; the design
  answered "here is a trophy". Now: hairline dividers instead of per-row containers, the muscle group
  as ONE dot (same `muscleStripeColor`, no rail + tile + word saying it three times), `Last` promoted
  to the visual anchor (mono, tabular, its own small label), the PR reduced to gold text + a trophy
  glyph, and the three stat tiles flattened to one baseline line. **What was deliberately NOT done:**
  the "?" became a ghost circle rather than being deleted in favour of a tappable row — that changes
  interaction and a11y semantics on a live screen, and this was already a large enough single change.
  **Two contracts constrain any future edit here, and they are why the guards survived a full visual
  rewrite**: `pw_daysets` finds the div whose text is exactly `total sets` and reads its
  `previousElementSibling`, so the VALUE must stay the label's immediately-preceding sibling; and the
  rep chip must stay a `<span>` whose text matches `N×range`, because the chips' set counts are
  asserted to SUM to that tile. Restyle around them — do not rewrite the test to fit a layout, which
  would retire the only alarm on the "71 total sets" bug. `sim_designscale` also caught this work
  mid-flight: the first cut introduced `9.5/11.5/13.5px` font sizes and a `13` radius. Half-pixels and
  anything under 10px are retired app-wide; a stray `12.5` renders fine, breaks nothing else and is
  invisible in a screenshot, so that source-level check is the only thing that can see it. The 26px
  round button uses `borderRadius:"50%"`, not `13` — circle geometry should say so rather than look
  like a card corner sneaking back onto the scale.
  **A dual-assessment `/impeccable critique` then scored the shipped result 31/40 and drove five
  follow-ups, all now in.** The design-review half and the detector/browser half ran isolated; the
  detector found ZERO in-scope findings (the flattening removed the shapes it hunts) and the browser
  half measured a clean bill (fonts on scale, no contrast failures, dots over 3:1 both themes). The
  five UX fixes: (1) **the overlay had no edge-swipe exit** — chat/Messages/Activity all wrap
  `EdgeSwipeBack` and this one didn't, leaving a 36px top-left Back as the only way out (both
  assessment halves flagged it independently). Wrapped now, Back/Share got `.seshd-hit` halos, and
  **the share modal had to move to `createPortal(…, document.body)`** because `EdgeSwipeBack`'s
  `willChange:"transform"` makes a containing block for fixed children — the documented
  followers-sheet trap, caught before it shipped rather than after. (2) **the `Last` line sorted sets
  by weight and sliced to 3**, so a 4-set session read as 3 re-sequenced sets under a "4×…" chip,
  hiding back-off/pyramid patterns — it shows performed order with a muted `+N` now. (3) **edit mode
  was still the pre-redesign card kit** (rounded cards, MuscleIcon tiles, blue dashed add button) —
  flattened to the same dot+divider list, only the fields differ. (4) **a zero-exercise day rendered
  a void with a live Start button** that began an unloggable empty session — empty state + the CTA
  relabels to "Add exercises to start" and opens the editor. (5) **dot + muscle word + a header
  already naming the groups was triple encoding**, and on a noted row the word and note blurred at
  equal weight — the word yields to the note when one exists. Sim: `verify_critique_fixes` drives all
  five (performed-order `Last`, real edge-swipe TouchEvents, empty-day CTA routing to edit, flattened
  edit rows, portaled share modal), and two of its own first-draft assertions were probe bugs, not
  app bugs (the overlay-finder matched on day-name text that becomes an `<input>` in edit mode;
  `NoteField` is a textarea, not an input) — verified against the app before trusting either.
  **A dual-agent `/impeccable critique` was then run against the SHIPPED redesign** (design-review
  half + detector/browser-evidence half, isolated): score **31/40 Good**, up from the pre-redesign
  screen's **20/40** (trend persisted at `.impeccable/critique/…__src-app-jsx-daypreviewmodal.md`).
  The detector found ZERO in-scope findings (the flattening removed the shapes it hunts); the browser
  half measured fonts on-scale, zero text-contrast failures both themes, and the muscle dots above
  the 3:1 graphical floor both themes. Every P1/P2/P3 it raised had ALREADY shipped in `…y` (the
  critique reviewed bundle w/x, pre-fix) — so the only NET-NEW work it drove was **the share modal**,
  which was hardcoded dark (black bg, white ink, `rgba(255,255,255,·)` surfaces) on BOTH themes — a
  jarring black card on the light app, and it also took **no focus on open** (a VoiceOver user who
  tapped Share was left reading the exercise list underneath). Fixed by threading a theme-inverted
  palette through the whole modal (`sBg`/`sInkRGB`/`sInk` for the card + every translucent surface,
  `sAccBg`/`sAccInk` for the inverted PRIMARY fill on the icon tiles and Share button — white-on-dark
  / dark-on-light so the CTA stays loud on both) and giving the card `role="dialog"
  aria-modal="true"` + a `shareCardRef` focused via a `useEffect` keyed on the OPEN transition only
  (`[!!shareModal]`, so the picker→code stage change can't re-steal focus). The dark card is
  byte-identical to before; light is now a normal surface card. Sim: `verify_sharemodal` (asserts
  role=dialog, focus-on-open, and that the card bg DIFFERS between themes and is not the old
  near-black on light). **A cold-context audit of that share-modal change then found the ONE thing
  both guards were blind to: the light theme's muted TEXT.** The translucent-ink alphas (0.5 kicker,
  0.55 captions, 0.4 chevron) were copied byte-for-byte from the dark card and had only `sInkRGB`
  flipped to dark — but an alpha calibrated as light ink over near-black FAILS AA as dark ink over
  white (the same "re-measure every hardcoded colour when the surface changes" class as the muscle
  dots). Measured on light: caption 4.03, kicker 3.54, chevron 2.61 — all under the 4.5:1 text / 3:1
  graphical floors, all comfortably passing on dark. Fixed with three light-boosted TEXT tokens
  (`sKick`/`sMut` at 0.66 → ~5.8-6.1:1, `sChev` at 0.5 → ~3.4:1); dark values are byte-identical, and
  the surface/border alphas (0.06/0.08/0.12) stay on `sInkRGB` untouched — they carry no contrast
  requirement. `pw_sharemodal` was extended to alpha-composite each muted text over its real bg stack
  and assert AA on the LIGHT theme specifically (goes red at the old 4.03/3.54/2.61) — because the
  card-bg-only assertion it shipped with, and `sim_a11y`'s token sweep, both miss text painted from
  literals. **The lesson repeated: theming a hardcoded-dark surface means re-measuring every alpha as
  the surface flips, not just swapping the ink.** **Two provocations were deliberately declined by Mo**: rebalancing so LAST
  (the anchor) rather than the PR owns the row's colour — the quiet gold PR is intended motivational
  value — and adding a duration estimate to the summary line (the screen was just decluttered).
  **A self-critique of the shipped result then found three more, and the lesson is that flattening a
  layout re-opens questions the old layout had already answered.** (1) The status stat rode in the
  same value+label array as the two counts, which reads correctly STACKED in a tile and became the
  run-on **"New first time"** once inlined — a pattern can be right in one geometry and ungrammatical
  in another, so re-read the words after any layout change, not just the pixels. It is a plain
  phrase now ("Done 4d ago" / "First time") and only the counts keep the pair shape. (2) The freeform
  `ex.note` was styled as a bordered chip sitting next to the bordered set-target chip, so a
  PRESCRIPTION and a USER NOTE became visual siblings — the duplicated-map problem in design form.
  The note is plain italic muted text now. (3) The "?" was quieted from a filled box to a ghost
  circle but was still a permanent right-hand COLUMN repeating once per exercise; quieting a
  repeated control does not fix the fact that it is repeated. **The row is now the button** and a
  single muted `›` carries the disclosure — which also improved a11y rather than costing it, since
  the row takes its accessible name from its own text and there is no icon-only control left to
  label. Verified by driving a real tap through to the exercise detail; `sim_a11y` clean.
  **Measurement note worth keeping:** the critique's first contrast pass reported the exercise name
  as 13px when the source says 15px, because the query hit the workout tab UNDERNEATH the overlay —
  the documented "an overlay does not remove the DOM beneath it" trap, hit again. The tell was the
  number disagreeing with the code. Scope measurements to `[data-fullscreen-overlay]`. That same
  pass also flagged the Edit button as failing contrast, which was an artifact of the ratio helper
  not compositing an alpha background — do not report a colour finding without compositing. Settled
  properly afterwards: `C.accentSoft` + `C.accentInk` composites to **9.56:1 dark / 6.34:1 light**,
  the documented value for that pair, so the Edit button was never a contrast problem. The
  "buttons go neutral" rule targets a FILLED `background:C.accent` with white on it (1.31:1), not a
  tint — don't conflate the two.
  **★ MOVING A COLOURED DOT/STRIPE FROM `C.surface` TO `C.bg` CAN BREAK ITS CONTRAST, AND NO TEST
  HERE CAN SEE IT.** A cold-context audit of the flattening caught the one real regression it
  introduced: `MUSCLE_STRIPE_INK` was calibrated when the muscle colour sat on a white CARD, and
  removing the cards moved the dot onto the warm off-white CANVAS (`#f6f5f3`). A darker ground needs
  a darker ink, so four of the five slipped under the 3:1 graphical floor — triceps 3.07→2.82, quads
  3.12→2.87, calves 3.26→2.99, core 3.25→2.98 — with biceps left at 3.01 and no margin. All five
  deepened; the new values clear 3:1 on the canvas AND score higher on white (3.38-3.40), so the day
  editor that shares this map via `muscleStripeColor` only improves. **`sim_a11y` cannot catch this
  class**: it sweeps theme TOKENS against `bg`/`surface`, and this is a hardcoded palette — the same
  blind spot the plate-colour work hit. When a redesign changes which SURFACE an element sits on,
  re-measure every hardcoded colour on it, not just the tokens.
  **A row that becomes a `<button>` inherits its whole text as its accessible name.** The same audit
  found the PR had quietly lost its word: dropping the literal "PR " was right visually (the trophy
  carries it, and the row is scanned rather than read), but with the row now a button, a screen
  reader heard a bare "225lbs" adjacent to the exercise name. An `aria-label` on that span restores
  "Personal record 225 lbs" without putting the word back on screen. Check the accessible NAME, not
  just the pixels, whenever a container becomes interactive.
  **And a booby trap in the guard itself, worth the general rule.** `pw_daysets`' rep-chip selector
  was `/^\d+×\d/` — unanchored at the tail, so it also matches the redesigned "Last" span
  ("225×9   220×6   215×6"). That fixture seeds no history, so it has never fired and the check has
  always passed; but adding history to the fixture later would have failed the chip COUNT with a
  message about rep chips, pointing at entirely the wrong thing. Anchored at both ends now, which is
  strictly tighter — nothing that matched before stops matching. **A regex that is accidentally
  right because of what the fixture omits is a future misdiagnosis, not a passing test.**
- **THE 7-COLOUR DAY RAINBOW IS GONE, AND THE REASON GENERALISES: A PALETTE THAT ENCODES NOTHING
  COMPETES WITH THE ONES THAT DO.** `DAY_COLORS` (violet/blue/green/amber/red/cyan, indexed by the
  day's POSITION in the program, declared twice) painted the day preview's hero band and both Start
  buttons. It was the only palette in Seshd carrying no meaning — the day is NAMED on the same line,
  you see one day at a time so the colour can't be compared to anything, and its 7th entry repeated
  its 1st so days 1 and 7 collided anyway. Worse, it fought the colour language that IS real on that
  screen: the per-exercise muscle stripes. The band is `C.surface` now and both CTAs are the neutral
  `C.primary`/`C.onPrimary` filled button, so the only colour left on the screen means something.
  **Everything else in this app's colour is earned** — muscle groups, plate weights, PR/progress
  volt — so before adding a palette, say what a reader learns from it.
- **`accentInk` IS ACCENT-AS-TEXT; `accent` IS ACCENT-AS-FILL. THEY CANNOT BE THE SAME VALUE ON THE
  LIGHT THEME.** Light `accent` (#65a30d) was picked to read as a FILL on white. Used as TEXT it is
  **3.09:1 on a white card and 2.77:1 on its own `accentSoft` tint** — under the 4.5:1 floor, on
  real functional text (the day preview's rep-range chips, "+ ADD EXERCISE", the Edit label, the
  "?" buttons). `accentInk` is lime-800 (#3f6212) on light: 7.08:1 on white, 6.34:1 on the tint,
  still reads as the brand green rather than grey. On dark it is just `accent`, because volt on its
  own tint is already 9.56:1. **Anywhere `C.accent` is a `color:`, it should be `C.accentInk`.**
  The two local `const BLUE = C.accent` aliases that hid this are deleted — a variable named BLUE
  holding lime is how the next one gets written. (A stray `#2563eb44`/`#BFDBFE` dashed border
  survived on "+ Add Exercise" from before the lime pass, blue box around lime text; fixed too.)
- **★ A TILE'S LABEL IS A CLAIM ABOUT WHAT THE NUMBER COUNTS, AND THE DAY PREVIEW'S DIDN'T.**
  Mo's Push B read **"8 exercises · 71 total sets"**. The tile was
  `exercises.reduce((a,ex) => a + (parseInt(ex.reps)||3), 0)` — it summed the **REPS** field, so
  `parseInt("10–15")` contributed 10 and the number was the sum of the low end of every rep range.
  His real answer was ~24. **The reason it survived: the built-in templates write reps as `"4×5–8"`,
  and on that shape `parseInt` happens to grab the leading SET count, so the tile is accidentally
  correct** — every template day looks right, and so does any fixture copied from one (the first
  fixture written for this audit read a plausible "20" for exactly that reason). It only misreports
  for a day whose reps are a bare range, which is what the day editor writes. `progSetCount(ex)` is
  the one definition and already existed; this was a seventh inline copy that didn't even compute
  the right quantity. Sim: `pw_daysets`, which seeds BOTH rep shapes because a one-shape test
  cannot see this bug. Same family as the 57 PRs: read the label, then check the number answers it.
  **The rep chip beside each exercise had the mirror problem**: it rendered `ex.reps` RAW, so a day
  written with bare ranges showed "5–7" and the set count appeared nowhere on the screen at all.
  `progSetsReps(ex)` is the one definition — `progSetCount` for the N, `ex.reps` with any leading
  "N×" stripped for the range (or it prints twice). Because both the chip and the tile go through
  `progSetCount`, `pw_daysets` can assert the chips' set counts SUM to the tile, which is a much
  stronger check than either number alone.
- **★ TWO TRUE NUMBERS THAT SHARE A NOUN READ AS ONE NUMBER CONTRADICTING ITSELF.** Mo, from his
  own screen: "it says Recovery 54% · Moderate, and under it Fully recovered from your last session
  — seems to contradict each other." Neither number was wrong. The pill is `rec.recoveryScore` — a
  SYSTEMIC daily read (HRV 50% + resting HR 25% + sleep 25%); the line under it is
  `recoveryTimeHours()` — the training fatigue left from your LAST WORKOUT (`sessionDrain` vs
  elapsed). They answer different questions and can legitimately disagree: Tuesday's soreness is
  gone while today's short sleep and below-baseline HRV still say take it easy. But both printed the
  word "recover", stacked two lines apart, so they read as one claim at war with itself. Fixed as
  COPY, not maths — the pill says **Readiness**, the line says **fatigue** ("No leftover fatigue from
  your last session" / "~Nh until your last session clears"), and the driver caption under the tiles
  stopped saying "you're recovered" too. **The general rule: before shipping two metrics on one
  screen, read them ALOUD in sequence.** Nothing in the battery can catch this — every number was
  correct, every test passed, and the bug existed only in the sentence the two of them formed
  together. **Mo's own call on the fix was to DELETE the second line, not reword it** — and he was
  right for a reason the rewording missed: it was a WORKOUT-scoped fact parked in the middle of a
  DAY-scoped card ("random spot"), so disambiguating the nouns fixed the contradiction and left the
  placement problem. `recoveryTimeHours` is still live and still covered by `sim_recoverytime`, with
  no UI caller; if that number returns it belongs on the workout surface. The pill kept the
  **Readiness** rename (its own verdicts are "Ready to push"/"Ready"/"Take it easy", and it is an
  HRV+sleep+RHR composite, not a countdown) — note it now shares the word with the muscle map's
  Readiness tab further down the same screen, which is the SAME question at two scopes (whole body
  vs per muscle) rather than two questions sharing a noun, so it reads as a family, not a clash.
  **Then Mo cut the score pill too — "one is enough" — and the card got BETTER, not thinner.** The
  screen already carried Body Battery and Training Load as headline composites, and the muscle map
  card's own heading is literally TRAINING READINESS, so a third score restated in a pill under it
  was the redundancy. What survives is what the number was only ever SUMMARISING: the three drivers
  (HRV, resting pulse, sleep), each against your own baseline, which unlike a percentage tell you
  WHICH input is off. `recoveryScore` is still computed — it gates the block, colours the muscle map
  and feeds Body Battery's morning charge — it is simply no longer printed; `recoveryVerdict` and
  `recoveryTimeHours` now both have no UI caller and stay covered by their sims. **The general
  lesson: a composite score earns its place only when the reader can't get the same answer from the
  drivers sitting right under it.**
- **★ A ZERO IS DATA, AND THE MUSCLE MAP PAINTED IT AS ABSENCE.** Mo: "if the muscle is not colored
  it kinda blends in." `_heatColor(t<=0)` returned `C.isDark ? "#3f4049" : "#cdd1d8"` — **the exact
  `bodyCol` literal the silhouette is drawn with**, so a muscle you trained ZERO times rendered at
  **1.00:1** against the body behind it: byte-identical, separated only by a 0.5px seam. The map's
  whole job is "what did I miss", the list directly under it names the zeros ("Back 0, Biceps 0"),
  and the picture was the one place they were invisible. An empty muscle now sits one step off the
  body (`#525460` / `#b0b6c1`, 1.37:1 dark / 1.33:1 light) so the SHAPE reads as a region with
  nothing in it, while staying quiet enough that the volt-filled muscles still own the map.
  Deliberately NOT tinted toward the volt ramp — a green-ish zero would imply some training
  happened. Strength mode's `bodyCol` return stays as-is: "no strength standard for this muscle" is
  genuinely absence of data, not a measured zero. **The Wrapped recap card's own copy of this map
  was already correct** (zero `#26262e` vs body `#34343e`, 1.22:1, going DARKER) — so this was one
  map's bug, not the pattern's, and worth checking the sibling before assuming a sweep. Sim:
  `pw_musclezero`, which needed two things to be honest: `data-muscle`/`data-body` hooks on the
  paths (the fills are computed, so there is nothing to assert without them) and a fixture with a
  REAL zero in it — a fixture that trains every group cannot see this bug at all. **A cold-context
  audit then found the guard itself shipped with two defects**: its history KEY was a hardcoded
  date-string while `weeklyMuscleVolume` windows on the KEY against `Date.now()`, so five days
  after it was written the session would age out of the window and the suite would go red with a
  message ("missing data hooks") pointing at exactly the wrong cause — the INVERSE of the
  `pw_datekey` rule (there a `Date.now()` fixture drifted over a fixed boundary; here a fixed
  fixture drifted over a `Date.now()` one; either way the fixture's dates and the code's clock must
  share a source). And two of its seven exercise names ("Triceps Pushdown", "Back Squat") were
  library-invisible near-misses — the documented demo-corpus class, reproduced inside a guard the
  same week that story was retold — silently making Quads a second untested zero. Resolve every
  fixture exercise through `getExEntry` before trusting a muscle fixture.
- **★ A FAILED SIGNUP TOLD THE USER THEIR ACCOUNT WAS CREATED, AND THE ONLY THING THAT COULD HAVE
  TOLD THEM OTHERWISE WAS THE ONE AUTH CALL MISSING ITS `res.ok` CHECK.** `profiles.username` is
  UNIQUE (raw AND `lower(username)`) and `handle_new_user` inserts it with no collision handling,
  so picking a taken handle raises 23505 INSIDE the trigger and aborts the whole `auth.users`
  insert (verified with a rolled-back probe against prod: `duplicate key … profiles_username_key`).
  GoTrue reports that as `{ code:500, error_code:"unexpected_failure", msg:"Database error saving
  new user" }` — **no `error` key** — and `sb.signUp` tested only `data.error`, never `res.ok`. So
  nothing threw: AuthScreen saw no `access_token`, took the email-confirmation branch, and showed
  **"Account created! Check your email to confirm, then sign in."** for an account that does not
  exist. No email ever arrives, every sign-in fails, and **there is no username availability check
  anywhere before submit**, so that false success was the user's only feedback. `signIn`, `recover`
  and `updatePassword` ALL check `res.ok` — signUp was the one that never got the guard, the same
  one-guard-didn't-get-copied shape as the sign-out key clearing. Fixed: check `res.ok ||
  data.error || data.error_code`, and map the opaque trigger failure to "That username is already
  taken" (safe to name it: username is the only unique constraint that trigger can violate).
  **Sim: `pw_signupguard`, which asserts BOTH directions** — a 500 must not claim success, and a
  200 must still authenticate, because the new guard sits directly on the signup happy path and
  breaking that would be worse than the bug. Red-proofed: 3 failures on the old code with the
  happy-path checks staying green. Probe lesson recorded twice over: **Playwright gives precedence
  to the MOST RECENTLY REGISTERED matching route**, so a catch-all `**/auth/v1/**` added last
  swallows the specific `/signup` stub — the first draft reported four app failures that were
  entirely its own (`signupCalled` was false, which is what gave it away).
- **★ `Prefer: resolution=merge-duplicates` WITHOUT `?on_conflict=` RESOLVES AGAINST THE PRIMARY
  KEY — WHICH A FRESH INSERT NEVER HITS — SO EVERY "UPSERT" ON A SECONDARY UNIQUE KEY WAS AN
  INSERT THAT 23505'D.** Found by a routine logs sweep, not a report: **1,650 identical Postgres
  errors in 24 hours**, bursts of exactly ~50, all `duplicate key … personal_records_user_id_
  exercise_name_key`. All six `personal_records` POST sites sent merge-duplicates with no conflict
  target, so PostgREST emitted `ON CONFLICT ("id")` while the real unique key is
  `(user_id, exercise_name)`. Consequences: a PR's FIRST insert worked, **every later improvement
  failed** — server PRs frozen at their first value for every user (this is also the real mechanism
  behind the stale `120 vs 135` row the t-bar fix stumbled over), the leaderboard reading frozen
  numbers — and `loadUserData`'s self-heal re-sent the same ~50 corrections on every foreground,
  forever, because the write it heals with was the write that fails. Fix: name the target
  (`personal_records?on_conflict=user_id,exercise_name`) at all six sites; each device then heals
  its own rows on the next foreground, so no server-side backfill was needed. **The guard had a
  hole exactly where the bug was**: `pw_journey`'s stub blindly `push`ed PR rows (the documented
  a-stub-that-accepts-anything class), so it now models the unique constraint — 409 with code
  23505 on a duplicate whose URL lacks the target, merge when it names it — and a new section 6
  corrupts the server row downward and asserts the relaunch self-heal actually heals it (red on
  the pre-fix client, naming the bare URL). **Red-proofing that section exposed a second, older
  hole: the journey had been finishing ZERO-set workouts all along** — its "tick the done control"
  clicked `btns[last]`, which is the + weight stepper, and checks 7-12 stayed green because an
  empty workout still upserts a row. The fixture now sets real weight (fresh-query clicks — a
  stepper reference goes stale after the first click's re-render), real reps via the NumberPad
  (`[data-set-field="reps"]` — the visible "0" is a placeholder SPAN, so leaf-div text hunting
  fails), and ticks the row's only empty-text button. Rule: when a flow check passes, ask what the
  server would hold if the flow had silently done NOTHING — an empty workout row satisfied
  "workout reached the server" for weeks.
- **A WATCH THAT HASN'T SYNCED YET NEEDS A SECOND CHANCE.** Mo: "avg and peak heart rate hasn't
  showing in my last 2 workouts." The History card already renders both correctly
  (`♥ {avg} avg · {peak} peak` — not a rendering bug, easy to miss because "peak" only appears in
  that one line and grepping for it with a truncated view can make it look like it never renders
  anywhere). The write side was the bug: `readWorkoutHeartRate` fires ONCE, at the exact moment
  Finish is tapped, and needs >=3 HealthKit samples or it returns null — permanently, nothing
  re-checks. Apple Watch -> iPhone HealthKit sync is not instant, so a watch that finished recording
  seconds before Finish commonly hasn't synced to the phone's store yet; the read comes back empty
  for exactly the sessions you'd expect — the most RECENT ones, whose sync hadn't caught up by read
  time. `attachWorkoutHr()` (dependency-injected, exported for the sim harness) retries once,
  ~90s later, re-querying up to THAT moment — but that only helps a workout finished AFTER the fix
  shipped. Mo asked the natural follow-up: "was that supposed to show in my last 2 workouts now or
  just future ones?" Honest answer without more work: future only. **`backfillMissingHr(appHistory,
  …)` closes that gap** — it runs on every `loadUserData` (boot + foreground, same hook the
  persistence sweep uses), scans recent history for a session with no `hrSummary`, reconstructs its
  start time as `finishedAt - duration*1000` (workout_history has no separate start-timestamp
  column), and retries it through the same `attachWorkoutHr`. Windowed to the last 24h — a session
  than old either genuinely never synced (nothing to backfill) or its watch data has likely aged out
  of HealthKit's readable window anyway, and retrying forever would mean a HealthKit read on every
  foreground for the lifetime of the account. Known remaining gap, same shape as before: if the app
  is killed before `attachWorkoutHr`'s own 90s retry fires AND the next foreground happens more than
  24h later, that one session is never recovered — closing that fully needs a persisted "still
  missing HR" queue that survives past the 24h window, a larger change. Sim: `sim_hrretry`
  (checks 7-10 cover the backfill: a recent miss gets caught, an already-filled session is left
  alone with no redundant HealthKit read, and a >24h-old miss is not retried).
- **FOUR SURFACES REPORTED HEART RATE AND ONLY ONE PRINTED BOTH HALVES OF IT.** Mo: "in
  profile/home it only shows the avg (should show both on top of each other maybe in smaller text
  in the same area)." History's session card was the single place printing `♥ 142 avg · 171 peak`;
  the workout post card (which is the FEED **and** your own profile — same `PostCard`, and
  `profileHistoryItems` carries `hrSummary` through `postWorkoutPayload`), the group-share picker
  row and the new-post picker row all rendered the avg and silently dropped `peak`. Same shape as
  the volume/set-count/PR-badge duplications: N copies of one fact, and the copies drift. There are
  two definitions now and no inline third — **`HrStat`** (the stacked tile: avg on top, peak under
  it smaller and dimmer, each carrying its own word so neither can be read as the other, ♥ inline
  instead of a caption row so the tile stays the same two lines tall as the TIME and VOL tiles
  beside it) and **`hrInline`** (the run-on ` · ♥ N avg · N peak` for rows that already read
  "12m · 5 sets · 3,850 lbs"). Sim: `pw_hrdisplay` — and note check 6, which asserts the two
  numbers share an ancestor under 24 characters wide: a plain "does the page contain 171" passes
  even if peak renders in an unrelated corner, and the first cut of that check used a 40-char
  bound that the whole TIME/VOL/HR row satisfied.
- **A SHARED CARD IS A FROZEN SNAPSHOT, SO ANYTHING THAT ARRIVES LATE HAS TO BE PUSHED INTO IT.**
  Mo asked whether heart rate was "supposed to" be on the feed. It was, and the render was fine —
  but a post's `workout` jsonb is written once at share time, and HR routinely arrives AFTER that
  (the 90s retry, or `backfillMissingHr` on the next foreground), so the shared card kept the empty
  snapshot forever. **What made it hard to see: ProfileScreen already papered over half of it** —
  `ownPosts` re-attaches `hrSummary` from local history at render time for `isMe`, so your own
  profile looked correct while every other viewer's feed showed nothing for the same workout. A
  render-time patch with no server write is the same family as the bare-`setStore` rule above, and
  it hid the bug rather than fixing it. `patchSharedCardHr(sid, hr, tok, sb)` now reads the card
  back (PostgREST has no partial jsonb PATCH), merges, and writes both `posts` and `group_posts`,
  keyed on `client_id` — the session id, the same key the finish path upserts on, so it can't touch
  another user's row or a non-workout post. It skips a card that already carries HR, or every
  foreground would churn the row for no change.
  **★ COSMETIC BOOKKEEPING MUST NEVER BE ABLE TO FAIL THE THING IT IS BOOKKEEPING FOR.** The first
  cut called this from inside `attachWorkoutHr`'s success handler with only a `.catch()` on the
  promise — so a SYNCHRONOUS throw (an `sb` without `query`, a bad row shape) escaped into
  `attachWorkoutHr`'s own catch, which treats any failure as "the HealthKit read failed": it queued
  a pointless retry and finally resolved **null for a session whose heart rate it had already found
  and written to both the store and `workout_history`**. `sim_hrretry` check 2 caught it because
  that sim's `sb` stub deliberately has no `query`. Wrapped in a real `try/catch` now, and the
  stub is left query-less on purpose so checks 1-5 keep testing the guard.
- **★ A READ WINDOW THAT DEFAULTS TO `Date.now()` IS A TIME BOMB IN ANY DEFERRED CALLER.**
  `attachWorkoutHr` was written for the finish path, where "read HR from workout start to now" is
  correct because the workout just ended. `backfillMissingHr` then reused it for sessions up to 24h
  old — and the end stayed `Date.now()`. Measured against the real bundle: a 1-hour session read at
  20:00 queried an **11-hour** window and attached `{avg:81, peak:140}`, i.e. roughly the whole
  DAY's heart rate written onto that workout. It looks plausible, so nobody would report it, and it
  is **permanent** — the backfill skips anything that already has an `hrSummary`. It fired on every
  boot and every foreground, for exactly the users the feature was built for. `endMs` is an explicit
  parameter now and the backfill passes `sess.finishedAt`. **The sim could not see it because its
  HealthKit stub ignored `opts.startDate`/`endDate` entirely** — checks 16-18 record the window the
  app actually asks for and pin its span to the session's duration. When a helper grows a second
  caller, re-read every default it has: the default was right for caller one and silently wrong for
  caller two.
- **TWO MECHANISMS THAT EACH COVER "THE OTHER CASE" CAN BOTH MISS THE COMMON ONE.**
  `patchSharedCardHr` was added so HR arriving AFTER a share reaches the card. But on the normal
  finish path the HealthKit read usually SUCCEEDS immediately — so it ran while the post did not yet
  exist (you share from the summary sheet seconds or minutes later) and matched zero rows, while the
  share payload itself was frozen at finish with no `hrSummary` in it. Net effect: for every workout
  where the watch HAD synced, History showed the heart rate and the feed card never would — the
  exact symptom the work was meant to fix, still live after it shipped. `withHr(shareData)` merges
  the stored HR at SHARE time (component-scope, reading `storeRef`, because the sheet's buttons fire
  on a much later render); `patchSharedCardHr` still covers HR that lands afterwards. The two are
  complements and neither alone is enough. `sim_hrretry` checks 11-15 passed throughout because the
  fixture pre-created the shared post — it modelled the retry ordering, not the real finish ordering.
  Related, found in the same pass: `loadFeed`'s `sameFeed` bail compared id/caption/image/kudos/
  comments but NOT the workout payload, so a client already holding the post would discard the
  refreshed copy and keep rendering the HR-less card.
- **A COLOUR PASSED AS A PROP IS INVISIBLE TO A CHECK THAT SCANS STYLE OBJECTS.** `sim_accentbutton`
  greps `background:C.accent` and then reads the enclosing `{{ … }}`. NumberPad's **Next** key — the
  button pressed after every set — passed `bg={C.accent} color={C.onPrimary}`, the documented
  mismatched pair, **3.09:1 on the light theme**, and the check reported the file clean for months.
  Related, same audit: the avatar-edit badge's fix shipped **inert**, because `Icon` takes
  `color = "currentColor"` and the call site kept an explicit `color={C.onPrimary}` that overrode the
  corrected ink on the wrapper — and the check counted that site as fixed. Checks 3 and 4 cover the
  prop form and the overriding-Icon form now. **When a standing check says an area is clean, confirm
  it can actually SEE the shape you just wrote.**
- **`max-height` CLIPS FROM THE BOTTOM, SO A FADED HEADER'S SURVIVING STRIP IS ITS TOP ROW.** The
  workout header's content fades out by ~59% collapsed while `max-height` still shows ~41% of it —
  and that surviving band is Discard, the timer and Finish, fully transparent and still
  hit-testable mid-scroll. `pointerEvents` is gated on the same opacity value that drives the fade,
  so the two can never disagree about when the header stops being visible.
  **Superseded, caught by a cold-context audit (Aug 20):** the header content now also translates
  upward by what the wrapper loses (`translateY(-c * H)`, added for the sliced-glyph fix below), so
  the cut moved to the TOP edge — the surviving strip on a partial collapse is now the BOTTOM row
  (Progress + tools), and Discard/timer/Finish are the FIRST things to go, the opposite of what this
  entry says. The `pointerEvents` gate described above is now redundant (`overflow:hidden` on the
  wrapper already stops hit-testing on anything past the clip) but harmless, so it was left in place
  rather than pulled out for its own sake. Left the original text above rather than rewriting it —
  it's what motivated the translate fix and the reasoning still holds, just for the opposite edge.
- **A HEADER THAT "SNAPS" ON A THRESHOLD IS NOT THE SAME THING AS ONE THAT TRACKS THE GESTURE.**
  The first cut of hide-on-scroll-down/reveal-on-scroll-up was a boolean + `transition:max-height`
  — collapsed or open, animated between the two on a fixed clock once a scroll-distance threshold
  was crossed. Mo: "it just snaps up and down, I wanted it to move up or down slowly with the
  swipe." That is a different mechanism, not a tuning knob on the first one: the header now tracks
  scroll CONTINUOUSLY, the same ref-driven pattern as every other gesture in this file (see the
  gesture-perf note below) applied to a scroll listener instead of a drag — a `collapseRef` (0..1)
  is nudged by the scroll delta on every `onScroll` and written straight to the wrapper's
  `max-height`, no CSS transition at all, floored so scrolling back near the top always reopens it
  regardless of the last motion's direction. **The header is a flex sibling ABOVE the scroller, not
  layered over it**, so `max-height` on the wrapper (not `transform` on the header) is what actually
  grows the scroller to reclaim the space.
  **"It bugs when I get to the end of the workout page" was iOS rubber-band overscroll.** Past the
  true scrollable range, `scrollTop` keeps firing scroll events but its value bounces past the max
  and back with no further gesture available to correct it (you're already at the end) — the old
  boolean version could latch fully hidden on a spurious bounce delta and have no recovery path.
  Fixed by clamping `scrollTop` to `[0, maxScroll]` before computing any delta. Sim: `pw_hideheader`
  drives a real scroll sequence and specifically simulates a rubber-band bounce at the list's end,
  then confirms a real scroll-up still reopens it. **Test-writing trap in the same file, worth
  remembering**: the first draft computed `maxScroll` ONCE near the top of the test and reused it —
  but the scroller is `flex:1` against the header wrapper, so its `clientHeight` GROWS as the
  header's `max-height` shrinks toward 0, meaning the real max scroll SHRINKS as the header
  collapses. The stale, larger value sent later `scrollTop` targets past the browser's actual
  current ceiling, which silently clamped them — failing the recovery check for a reason that had
  nothing to do with the app. Re-measure the live max immediately before using it, don't reuse a
  value from before any state change happened.
- **★ THE FIX FOR "IT RESTS ON A SLICED GLYPH" IS TO CHANGE WHAT THE CLIP LOOKS LIKE, NOT TO SNAP
  IT TO AN END.** Three rounds on the same header, and rounds two and three contradicted each other
  — worth reading as a pair. Round two, from Mo's screen recording: the header tracked the scroll
  correctly and still looked broken, because a `max-height` clip stopping wherever the finger
  stopped parks the cut line ANYWHERE, and his video sits for over a second on the timer with the
  bottom half of the digits sliced off. The fix shipped was a settle — a 140ms idle timer animating
  `collapseRef` to 0 or 1. **Mo, immediately: "if touch scroll up or down it just springs up and
  down."** Of course it did: snapping to an endpoint when the finger lifts IS a spring, however
  short the curve, and it fires on every small scroll in either direction. The settle is gone and
  is not coming back — this header is driven from the scroll position, never toward an endpoint.
  **Round four, and the distinction that matters: A SPEED LIMIT IS NOT A SPRING.** With the settle
  gone Mo still reported "I feel like it sometimes still springs too fast", and *sometimes* was the
  tell — nothing was animating it, so the speed was coming straight from the scroller. iOS momentum
  delivers hundreds of pixels in a handful of frames, so a flick crossed the whole `COLLAPSE_PX`
  range almost instantly while a slow drag felt right. The scroll handler now only moves a TARGET;
  a `requestAnimationFrame` follower walks the header toward it at no more than 1/`MIN_TRAVEL_MS`
  (340ms) of the range per millisecond. This never changes WHERE the header ends up, only how fast
  it may get there — a slow drag never reaches the cap, so the 1:1 tracking he liked is untouched,
  and a flick is smoothed. The follower stops itself once it arrives (no permanent rAF loop) and is
  cancelled on unmount. **The distinction to hold on to: a settle invents a destination the gesture
  did not ask for; a rate limit only refuses to teleport to the one it did.** `pw_hideheader` 3b
  pins the resting position to the exact value the scroll asked for (`OPEN_H × (1 − 40/170)`), and
  7b/7c assert a 900px jump has NOT closed the header two frames later but HAS shortly after.
  What actually makes a half-collapsed rest state look deliberate instead of broken is two things
  about the clip itself: (1) the inner content **fades** ahead of the edge (`opacity = 1 - c*1.7`,
  gone by ~59% closed); and (2) it **translates upward** by exactly what the wrapper loses
  (`translateY(-c * H)`), which moves the cut to the TOP edge so the header travels away under the
  app's top bar rather than being sliced through the middle. Clipping from the bottom was the
  actual cause of the sliced timer, and translate is the one-line answer to it. Also load-bearing:
  `COLLAPSE_PX` 70 → 170, because "too fast" survived the switch to continuous tracking — at 70 an
  ordinary flick crosses the whole range in a few frames, so a mechanism that IS continuous still
  reads as a snap. **Distance is the knob that makes a scroll-driven thing feel gradual, not
  easing.**
  **A scroll handler that resizes its own scroller must subtract its own footprint.** Collapsing
  the header makes the scroller TALLER, so its max scroll SHRINKS, and near the bottom of the list
  the browser then clamps `scrollTop` down to the new max — arriving as a negative delta the finger
  never produced, which re-opens the header, which re-shrinks the scroller. This is the mechanism
  behind "it bugs when I get to the end of the workout page". Whatever part of a negative delta is
  explained by `maxScroll` having shrunk since the last event is ours, not the user's, and is
  removed before it moves anything (`lastMaxRef`). The settle briefly papered over this with a
  time-based `settlingUntil` guard; subtracting the actual footprint is the real fix and needs no
  timer.
  **And `maxHeight` must NOT be a React inline style** — `topBarHRef` is a ref, so a re-render
  after a re-measure would rewrite the attribute and snap the header open mid-gesture. The
  measuring effect owns the initial paint instead.
  **Once faded, gate `pointerEvents`.** The band still on screen is transparent but would otherwise
  stay hit-testable — a tap mid-scroll landing on an invisible Discard or Finish. Gate it on the
  same opacity value that drives the fade so the two can never disagree.
  **Test-writing trap, caught by red-proofing**: `pw_hideheader`'s settle check first used the
  existing loose `open()` predicate (`>80px`) and PASSED against a build with the settle deleted —
  the half-collapsed rest state it was written to catch measures **91.7px**, comfortably over 80.
  Predicates compare against the header's OWN measured open height (±2px) now. Exactly the
  `sim_sleepwindow` 07:00 trap: never let the value you expect coincide with the value the bug
  produces, and always confirm a new check goes red before believing it. That check has since been
  INVERTED — it now asserts a partial collapse STAYS partial — which is the clearest possible
  record that the settle was the wrong answer.
- **8PX AND 9PX FONT SIZES ARE RETIRED — 62 SITES SNAPPED UP TO 10.** Both sat below the 11px
  "undersized UI text" floor a design-tool detector flags: 17 at 8px, 45 at 9px, the app's smallest
  captions (stat-tile labels, section kickers like FRONT/BACK/TODAY, axis labels, badge text). All
  moved UP to 10 (`tiny`), never down, so nothing shrank or risked overflow — the same direction
  rule as the earlier half-pixel snap. `TYPE.micro` (9) stays defined as a token (renaming it would
  just relocate the "what was this" question) but no literal 8 or 9 remains; `sim_designscale`
  asserts it. Verified visually on the profile screen, the single densest cluster of the retired
  sizes — nothing wrapped or overflowed.
- **A "BUTTONS THAT ARE LIME" REPORT WAS A REAL, WIDESPREAD BUG CLASS, NOT ONE BUTTON.** Mo reported
  the New Post Share button reading as invisible light-gray-on-white after picking a photo — it was
  white text (`color:"#fff"`) hardcoded onto `background:C.primary`, which is near-WHITE on the dark
  theme: 1.10:1. Auditing every `background:C.accent` site found the same failure in two shapes
  across 16 more buttons/badges app-wide: (1) hardcoded `color:"#fff"` on the accent fill — 1.31:1
  dark, since accent (volt) is a LIGHT lime, not dark; and (2) `color:C.onPrimary` paired with
  `background:C.accent` — a MISMATCHED token pair, because `onPrimary`'s light value (white) was
  calibrated for the near-black `C.primary` fill, not for the lime `C.accent` fill, and measures
  3.09:1 there. Every BUTTON went neutral (`C.primary`/`C.onPrimary`, matching Save/Edit-toggle/
  Start-Workout); every non-button informational element that stays on the accent fill (the ONE REP
  MAX hero slab, avatar-initial fallbacks, small numbered badges, the story-viewer's no-photo
  fallback) uses `C.isDark ? C.onAccent : C.text` — onAccent's dark value already equals onPrimary's
  dark value, so this only changes the light theme. Standing check: `sim_accentbutton` — source-level,
  asserts no `background:C.accent` style object still hardcodes white or pairs the wrong token.
- **THE SHARE BUTTON'S DISABLED STATE HAD ITS OWN, WORSE VERSION OF THE SAME BUG.** Before a photo
  was picked, Share read hardcoded white on `C.divider` — 1.18:1 on the LIGHT theme, worse than the
  1.10:1 active-state bug beside it. Disabled controls are exempt from the AA floor, but there's no
  reason to leave one this bad when `C.sub` (4.17:1) was sitting right there and already meant
  "de-emphasised."
- **AN INHERITED COLOUR IS INVISIBLE TO THE DETECTOR TOO.** The impeccable detector reported ZERO
  contrast findings on the whole feed — and the avatar initial was **1.31:1** on the dark theme, the
  same near-white-on-volt pairing as the Save button. It set no `color` of its own, so it inherited
  `C.text`, and a static pass cannot resolve inheritance through an inline-styled tree. Light was
  fine (5.57:1) purely because what it inherits there is already dark ink. `Avatar` sets an explicit
  ink now. **A clean detector run on a screen is not evidence the screen is clean** — measure the
  computed pair for anything painted on an accent fill.
- **A HARDCODED SURFACE IS INVISIBLE TO `sim_a11y`.** That check tests every theme token against
  `C.bg` and `C.surface` — so a control painted on a literal like `#F1F5F9` is outside its reach no
  matter how bad the pairing is. The program day editor's set steppers were
  `background:isDark?"#222":"#F1F5F9"` with the accent as the glyph colour: **2.82:1 on light**,
  under both the 4.5:1 text floor and the 3:1 graphical floor, on the primary controls of that
  screen. Found by rendering the screen and measuring it, not by the token sweep. When auditing
  contrast, measure the SCREEN; the token check only covers colours that went through the tokens.
- **NEVER PUT WHITE TEXT ON THE VOLT ACCENT — IT IS 1.31:1.** Volt is a light colour; the pairing
  token is `C.onAccent` (dark ink), and for a filled CONTROL the answer is `C.primary`/`C.onPrimary`
  (neutral), because the lime pass reserved volt for PRs, progress, the muscle map and the streak.
  Two shipped as `background:C.accent` + a hardcoded `color:"#fff"`: the program editor's **Save**
  button and the day preview's active **Edit/Done** toggle — both primary actions, both essentially
  illegible on dark. 17.67:1 / 17.20:1 after. Grep for `color:"#fff"` next to an accent background
  before adding another.
- **A TRANSLUCENT WHITE VEIL ON A COLOURED BANNER DESTROYS THE CONTRAST IT LOOKS LIKE IT HELPS.**
  The day preview's three stat tiles were `rgba(255,255,255,0.15)` over the purple banner, which
  lightens it to `#9058f0` and drops the white tile text to 4.3:1 dark / 3.2:1 light — under AA, on
  the tiles carrying the numbers. White text on the bare banner was already 5.70:1; the veil was the
  whole problem. `rgba(0,0,0,0.18)` keeps the banner's colour and takes the same text to 7.59:1.
  Darken the veil, don't repaint the text.
- **Wrapped story frame:** `wrapStorySVG()` strips the card's own lowercase "seshd" watermark and
  adds a single bottom "SESHD" — don't re-add a watermark to card SVGs without checking it.
- Helpers: `posNum()` (input sanitize), `LBS_PER_KG` (=2.2046), `cvt()` (unit conversion), `EXERCISE_ALIASES` (dedup), `IS_DEV` (dev-only logging).
- **Number inputs use `type="text"` + `inputMode`, never `type="number"`** — `type="number"` triggers the iOS autofill pill. Keep it this way.
- **Touch/swipe:** React's synthetic touch listeners are passive (preventDefault is a no-op). The tab swipe relies on `touch-action: pan-y` on the root container. **Never swap the DOM structure mid-gesture** — that orphans the touch on iOS and freezes the drag (this broke the co-move twice). The current co-move uses a stable 3-panel track `[prev|current|next]` where the center (touched) node never unmounts.
- **Identical `setState` values are a silent no-op — never let one own a timer.** Setting state to
  the value React already committed makes it bail: the component doesn't re-render AND any
  `useEffect` keyed on that state does NOT re-run, so a timer the effect owns is never reset. This
  shipped twice: the tab slide-in held a bare `"left"`/`"right"`, so two switches the same way
  inside 320ms left the FIRST switch's timer to disarm the second animation part-way through. If a
  state value is a *signal that something happened* rather than a description of what something is,
  make it unique per occurrence — an object (`{ dir }`), or a counter (`b => b + 1`, the pattern
  `prBurst` already uses correctly). Same root cause as the ref-write trap in the gesture note
  below: both are `Object.is` bail-outs.
- **A CSS animation retriggers whenever `animation-name` goes `none` → a name.** So an animation
  driven by a *condition* rather than a one-shot event replays every time anything toggles that
  condition. The tab slide-in used `prevTab && swipeX === 0 && !swipeRelease && …`, all of which
  stay true at rest — a half-swipe that changed nothing flipped it off and back on, and the screen
  visibly slid in again. Drive animations from a one-shot signal that disarms itself. (Conditions
  that are *false* at rest, like `refreshing ? spin : none`, are fine.)
- **Auth tokens must never sit in `window.location`.** OAuth callbacks and password-recovery links
  land with `#access_token=…&refresh_token=…` in the FRAGMENT, and those two values ARE the
  account. `AUTH_CALLBACK` (module top of App.jsx) captures and `history.replaceState`s them away
  at module load, before any component mounts or any third-party script initialises; `init()` reads
  AUTH_CALLBACK, never `window.location.hash`. This matters because PostHog's automatic pageview
  reads `window.location.href` into `$current_url` on load — the old code cleared the fragment in a
  React effect AFTER an `await fetch`, so switching analytics on would have shipped a working
  account takeover to a third party for every password reset. Anything new that reads the URL at
  boot must not reintroduce a window where the fragment is observable. PostHog's init also carries
  `sanitize_properties` (strips fragments) and `disable_session_recording` (replay would film the
  password field) — keep both. Note the recovery link opens in SAFARI, not the app: the AASA file
  claims only `/u/*` and `/p/*`, and a reset link is `/#…`. That's fine and deliberate.
- **Never let the client resolve a username to an email.** Supabase auth keys on email, so username
  sign-in needs the lookup — it happens in the `username-auth` edge function with the service role,
  and `email_for_username` has EXECUTE revoked from public/anon/authenticated. Doing it client-side
  (the original design) meant anyone signed out could turn a public username into that person's real
  email and harvest the lot. Also: never verify a password in SQL to avoid the round trip — that
  creates an unthrottled credential-testing oracle. Go through `/auth/v1/token` so Supabase's own
  rate limiting applies, and return ONE generic error for both "no such user" and "wrong password".
- **The `public_profiles` SECURITY DEFINER view is DELIBERATE — do not "fix" the CRITICAL advisor
  warning.** Supabase's linter flags every SECURITY DEFINER view because the pattern *can* bypass
  RLS; here the bypass is the point. The base `profiles` table is owner-only (verified: a signed-in
  user reads exactly their own row, 0 other rows, 0 emails, 0 push tokens), and this view is the
  narrow window that lets people see each other at all — 13 safe columns, no email/push_token/
  body_log/age, plus its own `is_public = true OR auth.uid() IS NOT NULL` filter. Switching it to
  `security_invoker` blanks search, follower lists and feed avatars, and an RLS policy can't replace
  it because RLS is row-level, not column-level (allowing the row hands over the email too). The
  real hazard is the opposite one: if a sensitive column is ever added to `profiles`, don't add it
  to this view. It lists columns explicitly so nothing leaks automatically. `workout_notes` (added
  July 23 so session notes survive a reinstall) is the worked example: owner-only on `profiles`,
  deliberately NOT in the view, and still never written into the shared `workout_history` row.
- **Auth Redirect URLs must stay EMPTY with Site URL pinned to the prod domain** (verified July 30:
  Site URL `https://spotr-drab.vercel.app`, allow list empty). Supabase falls back to Site URL when a
  `redirect_to` doesn't match the allow list, so an empty list means every redirect — including an
  attacker's — lands on prod. Adding a wildcard entry here would open password-reset account
  takeover, since anyone can POST `/auth/v1/recover?redirect_to=…` with the public anon key.
- **Never forward a caller-supplied `redirect_to` into an auth email.** Anyone can call a public
  edge function, so an attacker can request a genuine password-reset email for someone else's
  account pointing at their own site — the victim clicks and the recovery token lands on the
  attacker's page. Pin it to an allowlist in the function; don't rely on the dashboard's Redirect
  URLs setting, which the code can't see.
- **"Private" means nothing without follow APPROVAL.** `follows` was insert-anyone, no status, and
  `posts`/`workout_history`/`personal_records` all grant access to any FOLLOWER — so a stranger who
  tapped Follow on a private account instantly read everything. Proven on live data: 0 workouts
  visible, tap Follow, 55 workouts + 53 PRs + 65 posts. `follows.status` is `pending|accepted` now;
  a BEFORE INSERT trigger sets it from `profile_is_public(following_id)` so the CLIENT CANNOT
  CHOOSE ITS OWN STATUS (it posts `accepted` and the DB stores `pending`), only the target may
  UPDATE it, and every content policy requires `status = 'accepted'`. Existing rows were
  grandfathered as accepted — those people already had access. Client-side: only accepted rows
  count as followers/following (counts must mean what RLS means), `store.pendingFollows` drives the
  "Requested" button, `store.followRequests` drives the accept/decline rows at the top of your own
  followers sheet. Sims: `sim_followreq` + role-sims. **Verify a blocked write by ROW COUNT, not by
  catching an exception** — an UPDATE the policy filters out changes 0 rows and raises nothing, so
  an exception-based check reports "ALLOWED" for something that was actually blocked.
- **DELETE on `follows` now allows the TARGET too** (`follower_id = auth.uid() OR following_id =
  auth.uid()`). It was follower-only, so "Remove follower" in the UI matched 0 rows and silently
  did nothing while the local list updated — it looked like it worked until the next refresh.
- **A "private" account has THREE layers and they must agree.** `posts`, `workout_history` and
  `personal_records` are all `owner OR profile_is_public(user_id) OR follower`; `public_profiles`
  additionally allows any signed-in caller so people stay findable in search. Net effect (and the
  intended model, same as a private Instagram account): signed out → can't find them, can't see
  posts; signed in → can find them, can't see posts; following → sees posts. `posts` was
  `USING (true)` and broke this for every private user, and the Settings toggle DEFAULTS TO OFF, so
  it applied to every new tester. If you add a table holding user content, copy that three-way
  policy — don't write `USING (true)`.
- **★ `comments` AND `kudos` HAD THE SAME `USING (true)` BUG AND NOBODY HAD CHECKED THEM (found in a
  full security audit, Aug 25 2026).** The three-way policy above was applied to `posts`/
  `workout_history`/`personal_records` but never to their two sibling engagement tables — both had a
  flat `SELECT USING (true)`, no join back to the post's own visibility, no `is_blocked_between`
  check. Proven live with `SET LOCAL ROLE anon` (no auth at all): 18 real comments readable,
  including text and user_id, with zero connection to whether the underlying post was public. A
  synthetic rolled-back-transaction test (flip a real user's `is_public` to false inside a
  transaction, insert a comment, check visibility, then `ROLLBACK` — never touches real data) proved
  the fix: anon → 0, a genuine non-follower stranger → 0, an accepted follower → 1, the owner → 1.
  Fixed via migration `fix_comments_kudos_privacy_leak`: both tables now join to `posts` and reuse
  the exact same three-way rule. **When copying a visibility policy to sibling tables, grep for
  EVERY table that references the same parent (`post_id` here), not just the one that prompted the
  fix** — engagement tables (comments, likes, reactions, anything hanging off a post) are exactly the
  kind of table that gets added later and quietly inherits the naive default.
- **★ SIGNING OUT LEFT THE ENTIRE LOCAL STORE ON THE DEVICE, AND THE NEXT ACCOUNT COULD INHERIT IT
  (found in the same audit).** `handleSignOut` already had a comment explaining it clears the
  session keys specifically because an in-progress workout used to survive sign-out on a shared
  phone — but the fix that comment describes was scoped too narrowly. It never touched `seshd_v1`
  (the whole store: full history, PRs, programs, body-log photos), `seshd_feed_cache`,
  `seshd_pending_workouts`, or `seshd_write_queue`. `setStore(loadStore())` right after sign-out just
  re-read that still-present store back into memory — so on a shared or handed-over phone, the next
  person tapping "Continue as guest" inherited the PREVIOUS account's entire local data under a
  nominally fresh guest session, and if they signed up, `migrateGuestData` uploaded every bit of it —
  programs, PRs, workout history — as belonging to THEM, permanently, via their own valid token (RLS
  can't stop this: the writer genuinely owns the row it's writing, it has no way to know the data
  describes someone else). `handleSignOut` now clears all four keys. **A second, independent gap
  covers the case where a session ends WITHOUT an explicit sign-out** (a token expiring, the app
  just staying on the auth screen): `loadUserData`'s `setStore` callback already gated `prs`/
  `prsE1rm`/`prsVolume`/`exerciseNotes`/`workoutNotes`/`barTypes`/`closeFriends`/`weeklyTarget` on
  `prev.currentUserId === currentUserId` before falling back to `prev`, but SEVEN more fields had the
  identical fallback shape with no guard at all: `bodyLog` (photos included), `prEvents`,
  `customExercises`, `onboardingAnswers`, `strengthSex`, `dismissedInsights`, `bodyType`, `age`. All
  seven now carry the same guard. **When one field in an object literal has a security-motivated
  guard and eight of its neighbors have the exact same fallback shape without it, that's not eight
  separate decisions — it's one guard that didn't get copied.** Grep the whole literal for the
  pattern, not just the field that prompted the fix.
- **A SHARE-CODE REDEMPTION RPC IS A BRUTE-FORCE ORACLE IF THE CODE SPACE IS SMALL AND NOTHING RATE-
  LIMITS IT.** `redeem_program_by_code`/`redeem_workout_code` are `SECURITY DEFINER`, callable by
  `anon`, and bypass RLS entirely by design (the whole feature is "look this up by a code you don't
  need an account to redeem"). `generateShareCode()` was already bumped from a 4-char suffix
  (32^4 ≈ 1M combinations — confirmed brute-forceable) to 6 chars (32^6 ≈ 1.07B) for exactly this
  reason. **Aug 28 2026: bumped again to 8 chars and both legacy codes rotated** (Mo's call).
  The argument for 8 is that exposure scales with SUCCESS, not time — the odds of hitting ANY live
  code are space ÷ codes-in-use, so at 100 guesses/sec a 6-char code is 51 days with 2 codes live
  but ~2.5 HOURS at a thousand shared programs and ~12 minutes at ten thousand; 8 makes those ~99
  and ~10 days. **8 is also the CEILING, not an arbitrary pick**: `PostCard`'s caption detector is
  `/(IGNITE-[A-Z0-9]{4,8}|WO-[A-Z0-9]{4,8})/i`, so a 10-char code would still redeem when typed
  while the "Import" chip silently stopped appearing on every shared post — widen that regex FIRST
  if this ever grows again. Rotation was safe because all 54 captions mentioning the live code were
  Mo's OWN (checked before acting: `distinct_authors_overall = 1`), so the same transaction
  rewrote them; `group_posts` went through the `set_config('request.jwt.claims',…)` author loop per
  the trigger. Verified by CALLING the real RPCs: new codes return 1 row, old return 0. Backup:
  `sharecode_rotation_backup_20260828`. **Still open and NOT fixed by length: the redeem RPCs have
  no rate limiting** — PostgREST function calls bypass Supabase Auth's throttling entirely, so
  length only raises the cost of guessing. **CLOSED Aug 28 2026 — the RPCs are rate-limited inside
  the function**, since PostgREST calls bypass Supabase Auth's throttling entirely: 10 failed
  attempts per minute and 60 per hour, keyed on `auth.uid()` when signed in and otherwise the
  client IP. **Counts FAILURES only** — a successful redeem is legitimate use and must never count
  against you. Three things were measured rather than assumed. (1) **The caller IS identifiable**:
  a direct SQL connection sees no `request.headers` at all, so this was verified through the REAL
  path (a disposable probe function called via `net.http_post` → PostgREST), which showed
  `cf-connecting-ip` and `x-forwarded-for` both populated. Prefer `cf-connecting-ip`: Cloudflare
  SETS it and overwrites any client value, whereas a caller can forge an `x-forwarded-for` prefix
  to evade a limit. (2) **A naive counter is not a limit under concurrency** — firing 15 concurrent
  guesses let TWELVE through a limit of 10, because each call read the count before the others
  committed. `pg_advisory_xact_lock(hashtext('redeem:'||actor))` serializes per actor (two
  different callers never contend, so only the traffic you want to slow down queues); re-measured
  at exactly 10 through / 10 refused out of 20. (3) The ledger table `code_redeem_failures` has RLS
  on with NO policy and EXECUTE revoked from the helpers — clients can never read it, which matters
  because it holds IPs; the SECURITY DEFINER functions bypass RLS legitimately. Old rows are
  deleted opportunistically on each call so it cannot grow unbounded. Client-side, `sb.rpc` already
  threw with the server's message and the catch was discarding it; the refusal now surfaces as
  "Too many invalid codes — wait a minute and try again" while an ordinary wrong code still says
  "Code not found". Sim: `pw_redeemlimit` (both branches; red-proofed by restoring the discard).
  **★ AND A COLD-CONTEXT AUDIT FOUND THE COUPLING THAT MADE SHARING SPEND THE OWNER'S OWN BUDGET.**
  Minting a share code used to look the new code up first, "to check for a collision" — a lookup
  that by definition MISSES, so it recorded a failed attempt against the SHARER's bucket. Minting
  ten codes in a minute locked the owner out of redeeming anything and filled the abuse ledger with
  legitimate owner activity. **The fix was a deletion**: both columns are ALREADY UNIQUE in the DB
  (`programs_share_code_key`, `workout_codes_pkey`), so the constraint was always the real guard and
  a pre-check could never do better. `mintShareCode(prefix, write)` writes and retries only on 23505
  (a ~1e-8 event at 31^8), and any other error propagates so a genuine failure still surfaces
  instead of being retried five times. Three call sites converted. Sim: `pw_sharecode` — whose first
  version PASSED VACUOUSLY because the program never rendered (seeded into localStorage only, and
  `loadUserData` replaces `programs` wholesale from the server), so "zero redeem calls" was true
  only because nothing had happened; seed through the STUB. Red-proofed by restoring the pre-check:
  the other three checks stay green and only the budget check fails, naming the cause.
  **What that audit VERIFIED rather than assumed, worth keeping:** RLS on `programs`/`workout_codes`
  restricts SELECT to your own rows (proven by ROW COUNT — a signed-in stranger sees 0), so the RPC
  really is the only path to a foreign code and the limit is load-bearing rather than decoration;
  a spoofed `cf-connecting-ip` is **403'd by Cloudflare at the edge** and never reaches the app,
  while a spoofed `x-forwarded-for` reaches it and the function still records the TRUE IP; the three
  helpers are DENIED to anon and authenticated under `SET LOCAL ROLE`; a successful redeem records
  zero failures (both functions); and the sql→plpgsql rewrite kept both return signatures
  byte-identical. Residual, not actionable today: the whole IP-keying rests on Supabase continuing
  to front `*.supabase.co` with Cloudflare — if a direct-to-origin path ever existed, every anon
  caller would collapse into the shared `unknown` bucket.
- **Storage buckets need a size limit AND a MIME allowlist.** `images` is publicly readable and had
  neither, so a signed-in user could upload arbitrary files of unbounded size served from the project
  domain (free file hosting, uncapped bill, SVG/HTML carrying script). All three buckets are now
  capped with an image-only allowlist; SVG is excluded on purpose.
- **WHICH BUCKET AN IMAGE GOES TO IS DECIDED BY THE AUDIENCE, NOT BY THE UPLOADER.** `handleNewPost`
  ran the public-`images` upload unconditionally and wrote that public URL into `group_posts` too.
  It was inert only because nothing could send `imageData` and `groupIds` together — the moment the
  finish sheet could attach a photo, a share the user marked GROUPS ONLY would have landed at a
  permanent world-readable URL. Rules now: `wantsPublicImage = postData.groupOnly !== true` gates
  the public upload entirely, and each group copy calls `uploadGroupImage(dataUrl, tok, gid)` and
  stores the bare private PATH (one object per group, because the storage RLS policy scopes on the
  `{groupId}/` folder). Never reuse a public URL for a members-only surface. Sim: `pw_pumppic`.
- **A REFRESHED TOKEN MUST REACH THE WRITES THAT FOLLOW IT.** `handleNewPost` took `tok` as a
  `const`, and its refresh-once retry updated `tokenRef`, `saveSession` and `setSession` — but not
  `tok`, which drives every subsequent write. So an expired token produced: upload 401 → refresh →
  upload SUCCEEDS (the photo is now permanently in the public bucket) → every group upload, group
  insert and the feed insert 401 on the dead token → the outer catch says "Couldn't save post".
  Net result: an **orphaned world-readable image object with no post row anywhere**, which the user
  can neither see nor delete — nothing in the app ever issues a storage DELETE. It is `let` now,
  reassigned inside a shared `refreshTokenOnce()` that both the public and the per-group uploads
  use (the groups-only path had no retry at all, so an expired token silently posted the caption
  with no photo and said nothing).
- **DELETING A POST NOW DELETES ITS PHOTO — until Aug 16 nothing in the app ever issued a storage
  DELETE at all**, so every removed post (photo posts, workout posts, group posts, the "undo
  finish & edit" cascade) left its image sitting in the bucket forever, public or private,
  unreachable through the UI. Two helpers now do this: `deletePublicImage(url, token)` for the
  public `images` bucket (parses the path out of the stored URL) and `deleteGroupImage(path,
  token)` for the private `group-images` bucket (the stored value there is already a bare path).
  Both are fire-and-forget — the Postgres row is the source of truth for "does this post exist",
  so a failed cleanup just leaves an orphaned object rather than blocking or reverting a deletion
  the user already asked for. Wired into all three delete sites: `handleDelete` (feed post),
  `GroupDetail`'s own delete-post flow (grabs `image_url` from the in-memory row BEFORE the row is
  filtered out — it exists nowhere else), and the "undo finish & edit" cascade, which deletes group
  copies by `client_id` FILTER rather than by id, so it does one extra GET for the image paths
  before the delete removes the rows they live on. Sim: `pw_postimgdelete`.
- **DESTROY THE ROW FIRST, THE OBJECT SECOND — AND ONLY IF THE ROW ACTUALLY DIED.** The first cut
  of the storage cleanup got this backwards in the "undo finish & edit" cascade: it fired
  `deleteGroupImage` for every path and THEN issued the row delete with `.catch(() => {})`. A 403,
  a 5xx or `sb.query`'s 20s timeout therefore left the group post alive on the server pointing at
  an object that no longer existed — every member saw a permanently broken image, and the poster
  could not repair or remove it because the session was already gone from their own History. The
  feed leg had the same shape (`.catch(e => devError(...))` then delete the image regardless).
  **A bare `fetch` RESOLVES on 4xx/5xx**, so `GroupDetail`'s delete needed an explicit `res.ok`
  check for the same reason — without it a 403 ran the whole success path: image destroyed, row
  dropped from local state, and a "Post deleted" toast for a post still sitting on the server
  (the "never toast success from the optimistic path" rule, violated by an un-checked `fetch`).
  `handleDelete` was the one site that had it right from the start, because `sb.query` throws.
  Sections 6-9 of `pw_postimgdelete` drive a REJECTED delete and assert the image survives, the
  post stays on screen, and the user is told it failed.
- **A SIGNED URL EXPIRES; A CACHE KEYED ONLY ON PRESENCE DOES NOT.** `GroupDetail` signed each
  private group image once and cached it forever for the component's lifetime, and the sign effect
  skipped anything already in the map — so a group left open for over an hour showed broken images
  and could never re-sign, because the dead entry was still a cache HIT. Entries are `{url, exp}`
  now, renewed at 5 minutes' margin, with a 5-minute tick so an expiry that passes while nobody
  touches the feed still gets noticed.
- **A POST'S MEDIA IS GATED ON THE MEDIA, NOT ON `post.type`.** PostCard rendered images only when
  `type === "photo" || type === "form_check"`, so a workout post could carry a real `image_url` and
  show nothing. It is gated on `post.imageData` now; the grey "image didn't load" placeholder stays
  type-gated, or a photoless workout post would render an empty square. When a new post shape gains
  media, check the RENDER gate as well as the write.
- **TWO set shapes exist and they are not interchangeable.** A LIVE session set is
  `{weight, reps, done, type}` (strings, needs the warmup/done filter); `getLastExerciseSession()`
  hands back already-filtered `{w, r}` NUMBER pairs. Running the live-shape filter over `{w,r}`
  pairs silently yields zero sets, so "no previous data" — which the finish summary rendered as
  "first time" on lifts done for years. `topSet()` takes live sets, `bestPair()` takes `{w,r}`.
  Caught by `sim_wins`; it would have shipped invisible otherwise.
- **`getLastExerciseSession()` returns RAW numbers in the PREVIOUS session's unit** — that's why it
  hands back `.unit` alongside `.sets`. Every caller must `cvt(s.w, last.unit, unit)`;
  `suggestNextSet` does. `sessionWins` didn't, and comparing raw numbers across a unit switch both
  invents wins and hides real ones: 100kg last time vs 225lbs today reported "+125", a *lighter*
  200lbs session reported "+100", and a genuine PR logged in kg against lbs history reported
  nothing at all. A session's `unit` is stamped per session precisely because it can change.
  Sim: the units block in `sim_wins`.
- **Moving a control into a conditional menu: check the condition where that control matters MOST.**
  The live workout's remove-exercise `×` moved into the `···` overflow menu, whose trigger was
  gated on `ex.name`. But Quick Start seeds an exercise with `name:""` and "+ Add Exercise" appends
  more — so the blank rows, the ones you most need to delete, were the exact rows with no way to
  delete them, and cancelling the whole workout was the only escape. Gate the ITEMS that need the
  data ("How to do it" needs a name), never the door. Sim: `pw_addex`-style probe in
  `build/pw_audit.mjs`.
- **Estimated 1RM has ONE definition: `epley1RM(weight, reps, cap)`.** Epley (`w × (1 + reps/30)`)
  estimates a max from a MULTI-rep set; at one rep there's nothing to estimate — the weight lifted
  IS the max — but the raw formula multiplies by 31/30 and adds 3.3%, so `225 × 1` reported **233**
  (Mo caught it in the calculator). The formula was inlined in SEVEN places and every one was
  wrong, so the calculator and the Est-1RM PR badge could disagree about the same set. `cap` clamps
  reps BEFORE the estimate: PR/trend callers pass 12 (Epley overstates badly past ~12 — a 20-rep
  burnout set would mint a fake PR), the user-facing calculator passes nothing, because it must not
  silently substitute a rep count the user didn't type. Sim: `sim_1rm`. Note `prsE1rm` in the local
  store keeps the MAX of history-derived and previously-stored values, so an e1RM PR banked from a
  1-rep set before this fix stays 3.3% high until it's genuinely beaten.
- **A shared workout card has ONE builder: `postWorkoutPayload()`.** The post's `workout` payload was
  built in FIVE places — the write at finish, the local post rebuild after an edit, the server feed
  post rebuild, the server group-post rebuild, and the history→feed item — and four of the five
  counted WARMUPS into `volume` and listed them on the card, while History/Profile/the finish
  summary use `sessionVolume()` and exclude them. The write at finish was correct, so the reachable
  damage was the EDIT path: editing a previously-shared workout re-inflated a card that had been
  written correctly. Confirmed on live data — exactly ONE real card (momo, "Push B · Shoulders/Arms",
  2026-06-12: 12,465 shown vs 11,765 working, ~6%); the rest match their history row. **Scope the
  blast radius before reporting one** — the first pass quoted a 17.5% leg-day gap computed in SQL as
  a hypothetical, but that session had never been edited, and the history→feed path that would also
  have shown it is dead (see `sharedToFeed` below). Two more bugs fell out of consolidating: a heavy
  warmup single could flag a fake PR, and the `isPR` fallback compared a raw session-unit weight
  against `store.prs`, which is held in LBS — so a kg user's cards never showed a PR flag. `prNames`
  (the PRs actually hit) beats the stored-max guess when the caller knows it. Sim: `sim_cardvol`.
  The one affected card was repaired in prod (volume + sets rebuilt from its history row, isPR and
  ordering preserved); all 11 cards whose sessions contain warmups now match their history row.
  **The count was EIGHT, not five** — a sixth copy lived in `ProfileScreen.profileHistoryItems`
  (warmups right, but a 0.98 PR threshold vs the feed's 0.99, so the same session could show a PR
  badge on one screen and not the other), a seventh in History's "Volume by week" chart (`filter(set
  => set.done)`, no warmup exclusion and no per-session `cvt` — it printed 6.1k directly beneath a
  LIFETIME tile reading 3,850 for the same data), and an eighth in `lifetimeVolume`. When you
  consolidate, grep for the CONCEPT (`set.done`, `weight`×`reps`) and not just the variant you
  already found — the copies that look correct are still copies, and the weekly chart proved they
  drift.
- **A PR badge has ONE rule: `sessionPRNames(sess, prs)`** (which defers to `postWorkoutPayload`).
  History carried two more copies at a **0.98** threshold where the cards used 0.99, and one of them
  compared units backwards — it scaled the stored LBS pr UP by `LBS_PER_KG` for a kg session, so a
  kg lifter's top set had to beat ~2.2× its real PR and the badge could never appear. `store.prs` is
  LBS: convert the SESSION's weight *to* lbs, never the stored PR away from it.
- **A PLATEAU HAS ONE VERDICT: `detectDeloadNeeded(store, name, unit, repsTarget)`.** The banner and
  the per-set progression chips were two separate stall tests and they contradicted each other on
  screen. Each chip asked whether ITS OWN set index had gained reps since three sessions ago, so on
  Mo's real Lateral Raises the rows read `35×15 / 40×13 / 35×15 / 40×12` — deload and add-reps
  alternating, one line apart, under a banner saying "Plateau detected". Whether you have plateaued
  is a fact about the LIFT; ask it once and hand every row the same answer. The chips' 3-session
  threshold lost to the banner's 4 (chosen deliberately to cut false positives). Sims:
  `sim_stallcoherent` (maths) + `pw_stallcoherent` (the screen — the verdict now travels through a
  memo in WorkoutTracker, and a pure-function sim cannot see that wiring at all).
- **`topReps` IS THE TOP SET'S REPS, AND MOST PROGRESS DOESN'T HAPPEN THERE.** The stall test's
  "reps are flat, so it's a plateau" guard read only `topReps`. Mo opens 40×12 every session, so
  that series is dead flat while sets 2–4 climb underneath it: 40×12/11/10/8 → 40×12/12/10/9 →
  40×12/12/10/10, volume 1640 → 1720 → 1760. Every session his best yet, and the app told him to
  take 5 lbs off. `exerciseProgressed()` counts a gain in top weight, top-set reps, **total reps or
  volume** as progress. Anything reasoning about "did this exercise improve" must look past the top
  set — and must `cvt` volume/reps series into one unit, or a kg history read in lbs invents
  progress out of the conversion.
- **COMPARE THE BEST OF THE LAST TWO AGAINST THE BEST OF THE REST, not the newest against
  everything.** One short session — three sets instead of four because the gym was closing — drops
  volume through the floor without meaning anything, and a newest-vs-best test reads it as a stall
  on its own. Erring toward a missed stall is right here: the cost of a missed one is silence, the
  cost of a false one is being told to deload a session you just set a record on.
- **A BARE DATE KEY PARSES AS MIDNIGHT UTC — use `dateFromKey()`, never `new Date(key)`.** Every
  getter that reads it back (`getDate()`, `toLocaleDateString()`) is LOCAL, so west of Greenwich a
  key lands on the previous EVENING and the whole day reads one earlier. Mo reported the exercise
  screen's RECENT list and its chart axis disagreeing with the chart's hold-to-read tooltip by a
  day — and the TOOLTIP was the correct one, because it alone already anchored at local noon. Four
  sites had the bare parse (chart axis, RECENT list, the session list under it, the public profile's
  workout list). `dateFromKey` is the inverse of `dateKeyOf`, lives beside it, anchors at noon and
  still accepts a full timestamp for rows carrying `created_at`. Invisible in UTC and every zone
  east of it, which is exactly how it shipped — `pw_datekey` pins `timezoneId: America/New_York`
  and uses FIXED fixture dates, since a `Date.now()`-derived fixture drifts across the boundary the
  test exists to police.
- **A dnd-kit DRAG HANDLE MUST BE `touch-action: none`, AND CHROMIUM CANNOT TELL YOU OTHERWISE.**
  The day editor's handle was "improved" to `pan-y` so a thumb resting on the 38px tile could still
  scroll the form, on the reasoning that a stationary long-press starts no pan so the delay sensor
  wins the gesture anyway. Wrong on iOS: `pan-y` hands WebKit the VERTICAL axis, it can claim the
  gesture the moment the finger moves, waiting out the 200ms buys nothing, and a `preventDefault`
  after the browser owns the scroll cannot take it back. A reorder drag is vertical, so
  hold-then-drag scrolled the form and hold-to-reorder was dead on device for a week. It is a
  documented TouchSensor requirement, and every other grip in the app already had it.
  **`pw_reorder` could not see it twice over**: it drove the screen with `page.mouse`, which
  activates the PointerSensor on 6px of MOVEMENT and never touches the press-and-hold — and even a
  real-TouchEvent hold-drag reorders fine in Chromium, because no compositor scroll competes there.
  The property is the bug; assert the property. The suite now checks every handle's computed
  `touch-action` AND drives a genuine 320ms hold.
- **A SWIPE HINT MUST SATURATE AT THE REAL THRESHOLD.** The delete hint ramped over `threshold *
  0.75` while the comment beside it claimed it "reaches full strength exactly when the gesture
  would commit". At a 60px commit the resulting dead band was 15px and nobody noticed; moving to a
  third of the row made it 33px of travel that looks fully armed and deletes nothing. Also: a row
  with no `onDelete` must not get the long throw — one-set exercises slid 173px over bare
  background with no hint behind them and sprang back, which reads as "delete is broken". Sim:
  `pw_setswipe` (and note `sim_setswipe` can only ever test the `|| 380` fallback, because jsdom
  reports width 0 for every element — the measurement itself needs a real browser).
- **AN OVERLAY DOES NOT REMOVE THE DOM UNDERNEATH IT, AND `innerText` REPORTS IT ANYWAY.** Judging
  "which screen am I on" from `document.body.innerText` passed against a build where the overlay
  was stuck open, twice, in two different directions: once testing for the ABSENCE of "Activity"
  (the feed says "Your friends' activity", so it matched a screen where the overlay had never
  opened) and once for the PRESENCE of profile text that was there the whole time, covered. Use
  `elementFromPoint`, or count a node only the screen under test renders. Same family as the
  fixture rules above: four drafts of `pw_activity2` passed against the broken build before one
  measured the right thing.
- **A FULL-SCREEN OVERLAY NEEDS A LINE IN `switchTab`.** The bottom nav floats at zIndex 50 over
  overlays at 40, so a nav tap switches the tab UNDERNEATH: the icon lights up and the screen does
  not change. `showMessages` had the line; Activity did not when it stopped being a pseudo-tab.
  Any new overlay reachable while the nav is visible needs one too.
- **NEVER MAKE THE TAB SWIPE THE ONLY WAY OFF A SCREEN.** `handleSwipeStart` bails on any touch
  inside `[data-no-tab-swipe]`, which is every SetRow — so during a workout the swipe is dead over
  most of the screen. Measured on an ordinary 6-exercise session: **61% of the screen height
  silently refused to start a gesture**, so it worked from the header and did nothing from the sets,
  a thumb-width apart. The bottom nav was hidden during a workout at the time, which made that
  unreliable swipe the only exit; Mo reported the combination as the swipe feeling "laggy", and the
  first instinct — profiling frame times — found nothing, because nothing was slow. The nav is
  visible during a workout now, and hiding it had bought nothing anyway: the exercise scroller
  already padded by `NAV_CLEARANCE` throughout, so the icons sat over dead space rather than over
  set rows. The TOP bar is still hidden (the workout has its own header). Sims: `pw_workoutexit`
  (hit-tests all four nav buttons and then actually changes tab), `pw_workoutchrome`.
  **When a gesture is reported as "laggy", first check whether it fires at all** — a gesture that
  works two times in five is indistinguishable from a slow one.
- **A DESTRUCTIVE CONTROL NEEDS A VERB AND A CONFIRMATION.** The live workout's top-left button said
  "Cancel" and wiped the session on the first tap — no confirmation, no undo, and ambiguous next to
  a running timer ("cancel what, the rest timer?"). It says **Discard** now and goes through
  `confirmAction`, naming how many logged sets are at stake; the safe option is worded "Keep going"
  to match the Finish sheet, so the same word means the same thing in both places.
- **THE DAY PREVIEW'S REMOVE-EXERCISE "×" HAD NEITHER OF THOSE.** Found by the same critique as the
  muscle-colour bug above: a 20×20px "×" in the day editor's exercise list called `removeEx(i)`
  directly on click, and "Done" then saved that change permanently — no `confirmAction`, no undo,
  and no `.seshd-hit` halo on the smallest, most destructive control on the screen. Routed through
  `confirmAction` naming the exercise, matching every other destructive control in the app.
- **A NUMBER UNDER "LAST" MUST BE THE LAST TIME THIS EXACT DAY WAS DONE, AND THE APP ALREADY HAS
  IT.** The same critique's biggest product finding: the Day Preview showed a lifetime PR next to
  each exercise — often months old — instead of what was actually lifted last time, which is the
  number a lifter needs to know what to load today. `getLastExerciseSession()` already existed
  (built for the progressive-overload engine) and needed no new tracking; wired in as a `Last: W×R
  · W×R · W×R` line under each exercise, `cvt()`'d into the day's display unit per the existing
  raw-numbers-in-the-source-session's-unit rule. The PR badge stays — it's real motivational value —
  but stopped being the ONLY number, and see the badge-contrast entry above for why it also needed
  a new fill.
- **A SHELL ELEMENT THAT APPEARS AND DISAPPEARS PER TAB CANNOT BE RIGHT DURING A SWIPE.** The top
  bar is an IN-FLOW flex child above the swipe track, and it was gated on
  `!(workoutActive && tab === "tracker")`. `tab` only flips when the swipe COMMITS — 240ms after the
  glide starts — so the incoming panel was laid out one top-bar taller for the entire gesture and
  then snapped. Measured in Chromium, where `env()` insets are 0: the track was **926px mid-drag and
  879px after commit**, a 47px pop; on a notched iPhone the inset makes it ~95px. A gesture shows
  TWO tabs at once and there is only one shell, so any per-tab answer is wrong for one of them. The
  gate is gone; the workout header stopped claiming `env(safe-area-inset-top)` in the same change,
  because the top bar owns it again (one-owner rule). `workoutActive` had no readers left after
  that and was deleted with its `onSessionChange` plumbing. `pw_workoutexit` §4b asserts the track
  is the same height on every tab — a cheap, general form of the check.
  **A FIXTURE THAT DRIVES A GESTURE AT A FIXED `y` ENCODES THE CURRENT LAYOUT.** `pw_inertfix`
  swiped at `y=500` under a comment reading "the tab bar is hidden during a workout"; the moment
  the layout shifted by one row that coordinate landed inside a SetRow and the swipe silently did
  nothing, failing a check about unit conversion that had nothing to do with swiping. Reach a
  screen the way a user does (tap the nav) unless the gesture itself is what you are testing.
- **"NOTHING TO LOSE" MUST MEAN EMPTY, NOT UN-TICKED.** The Discard sheet counted with
  `workingDone`, which requires `done` — so a lifter who had typed every weight and rep without
  hitting the checkmarks was told "Nothing has been logged yet, so there's nothing to save"
  immediately before losing all of it. It also walked EVERY exercise while `cleanEx` saves only
  named ones, so a blank Quick Start row inflated the number the sheet quoted. Both classes are
  already in this file (COUNT WHAT GETS SAVED; two set shapes) — a confirmation dialog is a
  reporting surface and inherits every one of those rules.
- **AN OFFSET DERIVED FROM `store.posts.length` IS WRONG THE MOMENT ANYTHING ELSE MERGES INTO IT.**
  `loadFeed` started merging your own posts in (so Activity survives feed pagination) and
  "Load older posts" kept using the store's length — so the offset overshot by the number of merged
  own posts and skipped a whole page of everyone else's. Track the paginated count separately
  (`feedPagedCount`). Related: the activity re-baseline must wait for `feedLoadedOnce`, not just
  `!dataLoading` — dataLoading covers loadUserData and clears BEFORE the posts land, so the
  re-baseline banks 0 and the phantom badge returns a moment later.
- **A SURFACE THAT IS DARK IN BOTH THEMES NEEDS `ACCENT_ON_SLAB`, NOT `C.accent`.** The minimised
  rest bar pins its text and buttons to fixed light values for exactly this reason, then used
  `C.accent` for its ring — which on the light theme is the daylight lime chosen to read on WHITE,
  computing to a dark olive over a near-black slab. And check whether a `backdrop-filter` is doing
  anything: behind a 94% opaque fill it is a blur layer over your most-scrolled list, buying
  nothing.
- **A set COUNT and the volume printed beside it must come from the same list.** Four places paired
  `filter(s => s.done).length` (warmups included) with `sessionVolume()` (warmups excluded), so the
  same line read "5 sets · 3,850 lbs" for a volume drawn from 3 sets — including the LIVE workout
  header you stare at all session, History's session cards, the group-share picker and the
  new-post picker. All use `workingDone()` now; the live counter's `total` excludes warmups too, or
  the counter could never reach its own target. `{done}/{total}` is display-only — no division — so
  a warmup-only session showing "0/0 sets" is honest, not a divide-by-zero.
- **`pw_consistency` is the tool for this class.** Grep finds duplicated formulas; that run seeds ONE
  workout containing warmups and reads every screen that reports a number about it (History lifetime
  tile, weekly chart, session card, profile card, exercise detail), asserting they agree. It is what
  caught the weekly chart printing 6.1k under a lifetime tile reading 3,850. Run it after touching
  any volume/set/PR maths. `pw_unposted` is its companion: an unposted workout must stay out of the
  FEED while still counting toward workouts, lifetime volume, the weekly chart, PRs, muscle balance,
  streak and Body Battery — all 17 checks assert exactly that.
- **★ EVERY FIXTURE IN THIS BATTERY STARTS WITH DATA ALREADY IN THE STORE, WHICH IS WHY THE
  NEW-USER PATH KEEPS SHIPPING BUGS.** `pw_journey` walks signup and then immediately logs a
  workout; every other suite seeds history, PRs or a program. So the state nothing covered was the
  one three shipped bugs lived in: an account that is signed in, onboarded and holding NOTHING
  (`PROGRAM_TEMPLATES` — every new signup got the error boundary for twelve days; the onboarding
  starter program's bare `setStore`; import-by-code). `pw_freshaccount` seeds exactly that store —
  no history, no prs, no prEvents, no programs, no posts, no bodyLog, no activityHourly — and
  walks all four tabs, History, the Weekly Review and the profile's composites. **The store's
  emptiness IS the fixture**: adding a convenience default to it switches off the whole file.
  What it asserts, and why each one rather than "the screen has text on it": each tab's OWN
  empty-state copy (the three that were deliberately made different from each other would still
  put text on all three if a regression collapsed them back onto one template); History's three
  stat tiles read a real `0` (a missing value renders as an empty box that reads as a permanent
  loading state); the Weekly Review's zero-data copy specifically, because that feature had NEVER
  once run and its `todayMs` ReferenceError surfaced as a generic error state with no cause;
  Body Battery saying **"Est. start"** and not "Woke at" (with no HealthKit there is no measured
  wake — the number is honest only because the label says estimate) plus a finite 0-100 level;
  and the strength score staying GATED behind its unlock copy rather than printing a number
  derived from a bodyweight nobody logged. Plus a junk sweep over every screen's rendered text
  (`NaN`/`Infinity`/`undefined`/`[object Object]`/`▲ 0%`) — the tells of a number computed from
  nothing, which is the specific failure mode of "no data yet". Red-proofed three ways
  (caption forced to "Woke at"; the zero-data review replaced with an error state; a `NaN` injected
  into the profile), each check failing on its own. **The audit that produced it found NOTHING
  broken** — every empty state was already real, specific copy — which is precisely why it became a
  file: a clean walk with no standing guard is worth nothing next month. **A cold-context audit of
  the suite itself then found three probe-quality defects, all fixed, one general:**
  `page.keyboard.press("Escape")` is a NO-OP on `<Sheet>` — only ConfirmHost, ReportHost and the
  comment-edit input listen for Escape — so the Weekly Review sheet stayed open and two later
  sections measured the profile THROUGH it, passing only because `innerText` reports covered DOM
  (the documented overlay trap, hit from a new direction: not a wrong assertion, a wrong
  ASSUMPTION about how to leave). Close a sheet the way a finger would (its × / backdrop) and
  assert it actually closed. Also: the History-tile regex was left-unanchored so "10\nTOTAL"
  satisfied "reads 0" (anchored now — the pw_daysets class again), and the review's junk check
  passed vacuously on an empty string (tied to `wr.length > 0`).
- **Where an UNPOSTED workout belongs (settled, Aug 1):** History and your OWN profile — never the
  feed. `ProfileScreen.profileHistoryItems` builds cards from all of `store.history` when `isMe`,
  minus the ones already shared as posts, so your Workouts count = posted + unposted; viewers other
  than you see only real posts (`isMe ? … : []`). The feed shows what you chose to POST. The old
  `historyFeedItems` block in AppInner, gated on a `sess.sharedToFeed` flag that nothing ever set
  and that has no column behind it, was dead code and is DELETED — don't reintroduce it; putting
  un-posted training in the feed publishes what the user didn't share. Sim: `pw_unposted`.
- **Consolidating N copies into one helper changes edge cases the copies handled by accident.**
  Routing `detectDeloadNeeded` through `epley1RM()` was right, but the helper correctly refuses to
  estimate from a 0-rep set and returns 0, where the inlined `w × (1 + Math.min(r,12)/30)` returned
  `w`. `topReps` is the reps of the HEAVIEST set, so one set ticked done with a blank reps box
  produces it — and a 0 in that series reads as catastrophic strength loss and can fire a false
  deload banner telling the lifter to drop weight. Guarded with `Math.max(1, s.topReps || 0)`.
  Sim: `sim_deload0`. When you unify duplicated maths, diff the OLD behaviour at every boundary
  (0, 1, negative, NaN, empty), not just the case that motivated the change.
- **Volume/set counts have ONE definition: `sessionVolume()` / `workingDone()`.** Never inline
  another `sets.filter(s => s.done).reduce(...)`. Seven inline copies had drifted apart — the
  finish summary excluded warmups while History, the feed, Profile and the weekly/lifetime stats
  counted them, so the same workout read ~34% heavier in History than on the summary that saved it.
  A working set is `done && type !== "warmup"`; sets with no `type` are legacy working sets and
  must still count. Same rule, second instance: a PROGRAM exercise's set count is `progSetCount()`
  — the built-in templates and the day-preview "+ add" path write only `reps:"4×5–8"` and no
  `sets` field, and the three readers each guessed differently (start=4, editor stepper=3,
  reorder list="0 sets"). `progSetCount` handles both shapes: a live session's `sets` ARRAY (0 is
  a real answer) and a program's count-or-absent (leading `N×` in reps, else 3).
- **`ExerciseInput` has TWO callbacks and picking the wrong one is a shipped bug.** `onChange`
  fires on every KEYSTROKE (for the row editors, which bind it to a name field); `onSelect` fires
  only when a name is COMMITTED — dropdown pick, custom-exercise create, or Enter. Both "+ ADD
  EXERCISE" boxes had an add-an-exercise handler on `onChange`, so typing "Bench Press" in Build
  Your Own added an exercise named **"B"** on the first keystroke, and the caller's
  `key={…exercises.length}` remount then wiped the box — the rest of the name went nowhere and the
  dropdown could never filter. Adding by typing was impossible. If a new call site means "give me
  the finished name", use `onSelect` (+ `clearOnSelect` for an add box), never `onChange`. A
  `key` that remounts on list length is the tell that someone was papering over this.
- **`ExercisePickerSheet` is the big "Add Exercise" screen; `ExerciseInput`'s own dropdown is now
  ONLY for correcting an already-added exercise's name.** Mo, from a Strong-app screenshot: "should
  we just sorta copy Strong app... what we have now doesn't look that great" — `ExerciseInput`'s
  inline dropdown capped results at 10 inside a ~320px floating box below the field, which is what
  he was pointing at. `ExercisePickerSheet` is a real `<Sheet>` sized near-fullscreen (Strong's own
  "large pop screen," explicitly NOT a full-screen route), with a real search field, the same
  category chips, a Recent section, and — when browsing with no query — the full library grouped by
  muscle instead of a flat capped list. Wired into all four "+ Add Exercise" entry points (live
  workout, the program day editor, the day-preview edit sheet, and ProgramBuilder's "Build Your
  Own"); the per-row rename fields (`ExerciseInput value={ex.name} onChange={...}`, live workout
  and the day editor) are UNCHANGED on purpose — correcting a typo on a row that's already there is
  a different, smaller interaction than browsing to add one, and rewriting those risked the
  index-keyed staleness trap two entries below this one. Picking a result (or pressing Enter on a
  typed name — same direct-commit escape hatch `ExerciseInput` has, easy to forget when rebuilding
  the UI around it) closes the sheet immediately rather than clearing and staying open; adding a
  second exercise means reopening it. `canCreate` (the custom-exercise flow) only lights up where
  the caller already threads `store`+`setStore` through — ProgramBuilder and the day-preview sheet
  never got that plumbing even before this component existed, so parity was kept rather than wired
  net-new. Sim: `pw_addex` drives the sheet end-to-end (typing doesn't add anything until committed,
  the list filters, a pick adds exactly one exercise with the full name and closes the sheet, Enter
  commits a typed custom name and also closes it). One test-only note: the row's 44pt `.seshd-hit`
  hit-area halo paints on top of its own text per normal CSS stacking order (see the tap-target
  entry below), so a real finger tap lands on the invisible halo and bubbles to the row's onClick —
  Playwright's strict actionability check can't tell the "intercepting" element IS the handler's
  owner, so the test clicks with `force:true` there, same as any other `.seshd-hit` row.
- **A component that copies a prop into `useState` goes stale, and index keys are what expose it.**
  `useState(value)` runs once; if the parent later changes `value` without remounting, the mirror
  never updates. The program editor keys its exercise rows by INDEX, so reordering a day reused
  every `ExerciseInput` instance and each name field kept showing the exercise it mounted with —
  while the genuinely controlled reps/rest fields beside it moved. The save was correct the whole
  time; it just looked like "reordering doesn't stick". Either key by a stable id or resync the
  mirror on an external `value` change (compare against a `useRef` of the last prop so typing,
  which keeps the two in lockstep, can't be clobbered). When a reorder "doesn't stick", check what
  the STORE holds before believing the screen.
- **Only ONE shell element may reserve the status bar.** The offline bar, the guest banner and the
  top bar each padded by `env(safe-area-inset-top)` independently, so any two on screen at once —
  offline + guest, or offline while signed in — stacked TWO full status bars of dead space. The
  rule is: the topmost VISIBLE one owns it (offline > guest > top bar) and the others use flat
  padding. Sim: `pw_topbanners` (env() is 0 in Chromium, so it counts which elements *ask* for the
  inset rather than measuring pixels).
- **Body Battery must be WINNABLE and still honest.** Mo: "no one will ever have a good score." He
  was right about a specific case — measured, a normal session on a mediocre night collapsed the
  number (his real reading: 7/100). Two causes: (1) **sleep was counted twice** — once inside
  `recoveryScore` (~25% of it) and again as a Morning Charge modifier that could subtract another
  16; it's a nudge now (max −8), and if sleep needs more weight, change its weight INSIDE
  `recoveryScore`, not there. (2) one ordinary workout drained 24–30 points of a scale whose
  realistic top is ~85 — `4 + 0.6/set` now, so 20 sets costs 16 and 26 costs ~20. Post-fix spread:
  rested rest day 87, rested hard session 67, average night + normal session 48, 4h sleep + hard
  session 24, ideal 95. **The point of the number is to tell you when to back off, which it can't do
  if every session lands in the red — but "fixing" it must not make it flattering either.**
  `sim_bbscale` pins BOTH ends (a good day must clear 80, a wrecked day must stay under 40 so the
  "Low battery" copy still fires); `build/bb_probe.mjs` prints the whole distribution for tuning.
- **A HARD CEILING MAKES THE TOP OF A SCALE FLAT, AND A FLAT SCALE STOPS SAYING ANYTHING.** Three
  separate numbers had this, and Mo found all three by looking at them and saying "that can't be
  right". Activity drain was `min(18, raw)` and raw hits 18 at ~14k steps — measured, 14.6k / 22k /
  36.6k / 58.5k / 87.8k steps ALL reported the same Body Battery. Workout drain was `min(32, …)`
  while `sessionDrain` already caps one session at 24, so a two-a-day (48) and a three-a-day (72)
  were the same number. And both heart terms in `recoveryScore` CLAMPED — HRV scored a perfect 1.0
  at just 8% above your own baseline, so waking at 100/100 took a good night, not a great one.
  `softCap(raw, knee, max)` is the shared fix: linear to the knee, then compressed but still
  RISING, asymptotic to max. **Put the knee above where an ordinary day lands** — activity (12,30)
  leaves anyone under ~9k steps untouched, workout (24,44) leaves a single session of ANY size
  untouched — so the change is invisible to most people and only opens up the top. Both the
  headline and the 24h curve must go through it; and ROUND the result, because `sessionDrain`
  returns integers and nothing downstream rounded, so the first cut rendered a headline of
  "37.023884238244044". Sims: `sim_stepscale`, `sim_bbtop`.
- **A FLAT CEILING ONE LEVEL DOWN IS STILL A FLAT CEILING** — and fixing the daily one is what
  exposed it. The 24h curve clamped each HOUR at `Math.min(6, …)` while the headline had no
  per-hour limit at all, so an athlete doing 12k steps + 600 kcal in one hour (raw 13.3) was
  recorded as 6, the same as a brisk walk. The old hard `min(18, …)` hid the mismatch because both
  sides saturated on exactly 18; a soft cap never saturates, so it surfaced. `softCapHour` (knee 4,
  max 9) and `activityRawSinceWake(store, wakeMs, now)` are the fix — ONE function both sides call,
  same buckets, same hours, so they agree by construction. **Targeting `bb.activityDrain` from the
  curve WAS TRIED and is worse** (it forces 7/hour through a 6/hour model: a 3-point correction
  became 11). A shared MODEL, never a shared answer. Two related traps: the headline's rest walk
  must spend activity in the hours it ACTUALLY happened — smearing the day's total across the
  waking span charges a runner's quiet morning for effort that never happened, drops the level
  early and manufactures room for rest credit the battery has no space for (that smear was the
  entire remaining gap once the activity models were unified) — and a fixture must fill buckets
  only for hours that have ELAPSED, because pre-filling the current hour hands the headline steps
  nobody has taken and invents an 8-point gap that is the fixture's fault.
- **A VALIDITY RULE THAT CANNOT TELL TWO CAUSES APART MUST BE GENEROUS.** The sleep window's span
  rule rejects when time-in-bed exceeds time-asleep by more than the slack — meant to catch a nap
  MERGED into a night, but it cannot distinguish that from a BROKEN NIGHT. `sleepHours` is summed
  asleep minutes (`pickSleepBlock` unions the covered intervals), so at +3 a day sleeper in bed
  08:00-17:00 who actually slept 5.7h was rejected, lost a correct 17:00 wake to the guessed 07:00
  one, and was charged 8 points she hadn't earned. The population hurt is whoever's real wake is
  far from 07:00 — night shift, day sleepers. Slack is 4h with a separate 12h ceiling on a single
  sleep episode (`MAX_ANCHOR_SPAN_H`, deliberately NOT `MAX_SLEEP_SPAN_H`=16, which
  `pickSleepBlock` uses for a different job). When a heuristic has two possible causes and you can
  only see the symptom, tune it to spare the legitimate one and let a different rule catch the bad
  one. Sim: `sim_sleepwindow` §2.
- **NEVER LET A TEST'S EXPECTED VALUE COINCIDE WITH ITS FALLBACK'S VALUE.** `sim_sleepwindow`'s
  "good" fixture woke at 07:00 — which is exactly the estimated anchor used when no window is
  trusted — so "window used" and "window ignored" both printed 56 and every assertion compared 56
  to 56. An audit made BOTH call sites discard the window (`const trusted_ = null`) and the file
  stayed fully green while every night-shift user, late riser and early bird silently got an
  assumed 07:00 day. The reference now wakes at 10:00 and §0 asserts it differs from the no-window
  answer. Related: when comparing a case against a "without X" reference, strip ONLY X — two checks
  failed purely because the reference reported different `sleepHours`, which moves `charge0`.
- **A BACKGROUND VALUE HAS TO CLEAR EVERY THRESHOLD AT ONCE.** `sim_sleepwindow`'s baseline hour
  had to sit below `REST_STEPS_PER_H` (250) so rest recharge stays live, below `AWAKE_STEPS_PER_H`
  (120) so it doesn't drag the estimated anchor to hour 0, and yet NOT be so quiet that every hour
  is restful — rest recharge is capped at `charge0`, so a wholly restful day pins both models to
  that ceiling and hid the exact difference the test existed to detect (a trusted 10:00 wake and no
  window at all both read 91). Reading in the late morning instead of the evening was the fix.
- **HOUR WALKS MUST BE ANCHORED IN LOCAL TIME.** The headline's rest walk started at
  `Math.ceil(wakeMs / 36e5) * 36e5` — a UTC hour boundary, which is only a local one at whole-hour
  offsets. In Nepal (+5:45) a 07:00 wake rounded to 07:45 local and every step read the hourly
  buckets out of phase: headline 89 under a chart ending at 91. Walk from the wake time itself, as
  the curve's phase D does. Sweep sub-hour zones — `Asia/Kathmandu`, `Asia/Kolkata`,
  `Australia/Lord_Howe`, `America/St_Johns` — not just whole-hour ones; a whole-hour-only sweep is
  what let this sit.
- **TWO CALLERS THAT JUDGE THE SAME DATA MUST SHARE THE JUDGEMENT, NOT JUST THE DATA.** Both Body
  Battery models decide where your day starts from the persisted sleep window. The curve ran a
  full trust test (a start AND an end, ordered, span <=16h, span no more than 3h beyond the sleep
  it claims to contain); the headline accepted any `sleepEnd` inside 20h. Measured on one store: a
  window of 23:00->11:00 claiming 7.5h gave headline 77 / chart 56, and the headline was the
  FLATTERING side every time — a late wake means fewer awake hours AND pushes the morning's
  activity outside its window. `trustedSleepWindow(store, now)` is the one test now. When two
  functions read the same field, check they also VALIDATE it the same way — sharing the input is
  not sharing the model. And when pinning agreement in a sim, pin the absolute values too: a test
  that only compares the two numbers can be satisfied by breaking the correct one.
- **A WINDOW IS A CEILING IN DISGUISE, AND A GUESSED ANCHOR MAKES IT FLAT.** Bounding the day's
  activity to `[wake, now]` is right — steps recorded while you were genuinely asleep are the
  watch on the nightstand — but the wake anchor is a GUESS (07:00) whenever no watch recorded a
  sleep window, i.e. every phone-only user every night. Bounding to a guess discarded everything
  before it: measured on `2026-07-31j`, a shift walked 03:00-06:59 read at 20:30 gave the SAME
  battery (71) for 6.5k / 14.5k / 26.5k / 42.5k / 66.5k / 106.5k steps. Same failure class as the
  hard `min(18, …)`, reached from the opposite direction, and invisible because the sheet still
  printed the full step count beside the un-charged drain. `earliestActiveHourToday()` is the fix
  and it is the MIRROR of the existing bedtime gate: steps prove you were AWAKE, never that you
  were asleep, so evidence only moves an ESTIMATED anchor earlier, only within today, and never
  over a measured HealthKit window. Both models take the anchor from it — moving only the headline
  swaps a flat number for a 20-point endpoint cliff. `AWAKE_STEPS_PER_H` is one shared constant
  because the two sleep gates must agree about what counts as awake. Known limit, deliberate: when
  activity runs straight through the estimated night (03:00-07:00, no watch) the bedtime gate has
  already consumed those steps and pushed bedtime to its 04:00 cap, so the pull-back is refused and
  the chart under-draws there — the headline is right and the pin absorbs it, same as pre-fix.
  Sim: `sim_wakeanchor`.
- **A FIXTURE'S "BACKGROUND" VALUE CAN SWITCH OFF THE FEATURE UNDER TEST.** `sim_stepscale` §4b
  used a 500-steps/hour baseline hour, which sits above `REST_STEPS_PER_H` (250) — so
  `restfulHourRecharge` returned 0 for every hour of every fixture, `restRecharge` was 0
  throughout, and the rest-walk half of the fix could be reverted with the whole suite staying
  green. The assertion was sound; the ambient value made half of it unreachable. When a test
  covers two changes, revert them SEPARATELY and confirm each goes red on its own.
- **DON'T MEASURE HEADLINE-vs-CURVE AGREEMENT THROUGH THE PINNED ENDPOINT.** The pin overwrites the
  last point WITH the headline, so it can only ever report agreement — which is exactly why this
  divergence hid for a week. "How far did the last point move" is no better: it conflates a
  genuinely steep hour with a pin correction, and a hiker really does lose 9 points in an hour at
  11k steps. Measure the SECOND-to-last point, which the walk produces and the pin never touches,
  against the headline computed at that same instant. On the code this replaced that read 8 (trail
  run) / 9 (hike) / 15 (marathon) / 16 (ultra) against 1 for the ordinary day that was the only
  shape ever tested; it is 1 everywhere now. Section 4b of `sim_stepscale`.
- **A "nudge" must not be able to push a number past what the thing it nudges already earned.**
  `charge0` is `55 + recoveryScore * 45`, which already reaches 100 at a perfect score — then the
  sleep modifier added up to +7 on top and clamped, so every score from ~0.91 up printed exactly
  100. Sleep is a quarter of the score that produced charge0, so pushing past it counts sleep twice
  in the flattering direction. It is capped at the score's own ceiling now and can still reduce.
- **A statistic computed over a WINDOW quietly blends periods.** Making resting HR a median over the
  36h read window was the fix for a second app polluting the reading — but a watch writes about ONE
  resting-HR row per morning and a 36h lookback at 09:00 reaches back to 21:00 the day before
  yesterday, so the window normally holds two and the median of two is their average. Measured:
  yesterday 66 + today 62 displayed 64, and yesterday 70 + today 58 ALSO displayed 64. Group by
  DAY and take the newest group — that keeps the multi-source defence without averaging across
  days. (Also worth saying out loud to users: Apple's "lowest heart rate" is the minimum sample of
  the night and is a different metric from resting heart rate; it reads several bpm lower and that
  is not a bug.)
- **A gate that needs data B must not silently delete everything about data A.** The strength-score
  chart dropped every snapshot with no body-weight entry at or before its cutoff — the score is
  bodyweight-relative, so it "needs" a weight. Measured on live data: first workout 10 May, first
  weigh-in 4 June, and a three-month-old account with 58 workouts drew THREE points. Bodyweight
  moves slowly; the earliest weight on record is a far better stand-in than nothing. Related, same
  chart: the weekly→monthly switch was at 12 weeks, where a monthly chart has only three month-ends
  to draw — an account crossing that line went from a dozen points to almost none. It is 240 days
  now. Sim: `sim_scorehist`.
- **A LABEL THAT NAMES NO WINDOW WILL BE READ AS "NOW".** The resting-HR card said "trend" and
  "−6 bpm vs earlier" over a 60-day, one-point-per-day sparkline; it was reasonably read as the
  last 24 hours. Say the window.
- **A THEME'S TEXT TOKENS MUST CLEAR WCAG AA AGAINST *BOTH* SURFACES THEY SIT ON, AND A DESIGN
  SWEEP SHOULD MEASURE IT RATHER THAN EYEBALL IT.** An accessibility pass computed real contrast
  ratios (not a guess) against `THEMES.dark`/`THEMES.light`'s actual hex values and found real
  AA failures on real content, not decoration: dark `muted` 3.73:1/3.22:1 (bg/surface), light
  `muted` 2.25:1/2.45:1, light `sub` 4.39:1 (used in 300+ places), light `gold`/`red`/`green`/
  `orange` as text 2.70–4.31:1 — all on small (9–13px) real text: body-map labels, section
  kickers, error messages, "Delete"/"Leave Group", PR/ADMIN badges. All eight fixed by nudging the
  token's lightness (dark: lighter; light: darker) just far enough to clear 4.5:1 against both
  `bg` and `surface`, preserving hue. One real side effect: light `sub` and `muted` had to converge
  to nearly the same value to both clear the floor, so that theme's two de-emphasis tiers are now
  hard to tell apart — if that distinction matters again, use weight/letter-spacing to separate
  them, not lightness; there's no more contrast budget to spend there. Standing check:
  `sim_a11y` (contrast) recomputes from the THEMES source text itself, not a hardcoded copy of the
  hex values, so it can't go stale the way a pinned-expectation test would.
- **AN ICON WITH NO LABEL IS SILENCE TO A SCREEN READER.** The same audit parsed the JSX-transformed
  bundle for `<button>` elements whose every child is an icon/svg and which carry no
  `aria-label`/`title`, and found 7: three "×" close buttons, two back chevrons, a share-code-entry
  close, and the exercise-row icon that opens exercise detail. All seven have a near-identical twin
  ELSEWHERE in the same file that already has the label correctly — these were stragglers missed
  when the pattern was copy-pasted, not a systemic gap. Fixed by adding the matching label; the
  exercise-row button's label is conditional (`aria-label={ex.name ? \`${ex.name} details\` :
  undefined}`, matching the same condition that gates the button's own click handler). Standing
  check: `sim_a11y` (+ `build/a11y_scan.mjs`) walks the transformed AST rather than grepping —
  intentionally CONSERVATIVE, it only flags what it can prove is icon-only (a literal/template
  child or an icon-shaped component, nothing dynamic), so a clean run means "no PROVABLE misses,"
  not "certainly zero." It accepts a conditional `aria-label` whose consequent has real text as
  covered, since a label gated on the same condition as the click handler is correct, not a gap.
- **Duplicated formulas: grep the CONCEPT and consolidate, but NEVER with a blind regex.** The
  local date-key template `${d.getFullYear()}-${String(d.getMonth()+1)…}` was written out THIRTEEN
  times (Body Battery, activity reads, RHR trend, body-weight log, streak, strength snapshots) —
  all byte-identical, so nothing had drifted, but the volume maths had eight copies and two of
  those HAD. It is `dateKeyOf(t)` now, a function DECLARATION rather than a const because several
  callers sit above it. **The consolidating regex also rewrote the body of `dateKeyOf` itself into
  a call to `dateKeyOf`** — infinite recursion, app dead at boot, 27 sims red. Always re-read the
  helper's own definition after a mechanical replacement.
- **A HEALTH FIXTURE MUST BE AS SPARSE AS THE REAL DATA, or it proves nothing.** An Apple Watch
  writes a HANDFUL of HRV rows a night, hours apart — not one every 20 minutes. A fix for the
  recovery HRV window shipped looking correct because every fixture in its sim used 24 samples per
  night, 8-24x real density. At real density the same code failed three separate ways: a sparse
  night never cleared its "2h of span = a night" test so the fix was inert; a night split by a
  charger gap resolved to the EARLY half and the staleness guard then deleted the reading; and a
  night whose samples were >3h apart collapsed to ONE sample, so "today" was a raw reading while
  the baseline was a median. Contiguity/density heuristics are the wrong tool here — bucket by
  local noon-to-noon NIGHT and ask whether the bucket contains a small-hours sample. Same rule for
  steps/sleep/RHR fixtures: check what the device actually writes before trusting a green sim.
- **Excluding a self-referencing sample from a baseline must drop the whole KEY, not a timestamp.**
  Cutting at "the first sample of the scored night" left that night's PRE-SLEEP readings (the
  overnight filter starts at 22:00, bedtime is later) in the baseline as their own extra group —
  and awake HRV runs low, so it dragged the baseline down and the score up every night. It could
  even satisfy the "at least 3 nights of history" guard using the scored night itself.
- **A missing signal must not be able to RAISE a score.** `recoveryScore` renormalises over the
  signals present, which is right — but it also means dropping a signal scores it as whatever the
  others say. At-baseline HRV maps to 0.73 while at-baseline resting HR maps to 0.75 and 8h sleep
  to 1.0, so a day the watch failed to record HRV scored 87% against the same day's 80% with a
  complete normal read: "we couldn't measure half your recovery" outranked "we measured it and
  it's fine". An unknown signal is now CEILINGED at what a typical reading would have produced —
  ceilinged, not substituted, because substituting also lifts a genuinely bad day. And a thin read
  can't reach the top verdict band at all. **Don't implement that ceiling as a flat `Math.min`** —
  the first cut used `min(score, 0.75)` and the sleep factor is >=0.78 past 7h, so 7h, 8h and 9h
  all clamped to exactly 0.75 and a phone-only user's number stopped distinguishing anything.
- **Sleep STAGES feed recovery, not just duration (built Aug 1).** Apple Health returns sleep split
  into deep / core / REM; the app read those samples and threw the stage away, so eight broken hours
  scored identically to eight restorative ones. `stageMinutes()` now unions the per-stage intervals
  for the chosen night (union, not sum — two sources writing the same night is the bug that once
  turned 8h into "16h"), and `readRecovery`'s sleep component multiplies its duration factor by
  `0.85 + 0.15 × min(2, q)` where `q = 0.5·(deep%/0.16) + 0.5·(rem%/0.21)`. Design constraints worth
  keeping: a TYPICAL night is neutral (q = 1 → ×1.0) so most people see no change, duration still
  gates (five perfect hours are still five hours), the floor is 0.85 and the ceiling 1.15, and a
  device reporting an undifferentiated "asleep" with no stages is treated as UNKNOWN — skipped
  entirely — because unknown must never read as bad. Sim: `sim_sleepstage`.
- **`trainingLoadRatio()` is the acute:chronic workload ratio** — last 7 days' average daily volume
  over the 28-day average, i.e. Garmin's "training load" and the best-established injury-risk signal
  in sports science. Bands are the standard 0.8 / 1.3 / 1.5. It needs no data we didn't already have
  (a lifter against their own history, so units and exercise selection cancel — verified: a kg
  history read in lbs gives the same ratio). **It returns `null` rather than a number when the
  history can't support one** (span < 21 days or < 6 sessions in the window): a ratio off a handful
  of sessions is noise dressed as insight, and this number is meant to change what someone does.
  Sim: `sim_acwr`. **The guard must look INSIDE the window**: the first version measured `oldestMs`
  over ALL history while the sums came only from the last 28 days, so six sessions on ONE day plus a
  single 400-day-old row returned "4.00 — Spike — this is where injuries happen". Anyone with
  imported history returning from a break hit it. Now: >=6 sessions, spread over >=4 distinct days,
  >=2 of which are OUTSIDE the acute week. Also bucket by CALENDAR DAY anchored at local noon on
  BOTH ends — comparing a noon timestamp against `Date.now()` gave today's own session a negative
  age, so the future-date guard silently dropped the morning workout that most changes the number,
  and the band flipped at 12:00 with no new data.
- **Missing health signals are EXCLUDED, never scored as zero.** `recoveryScore` is a weighted mean
  of whatever exists — HRV 0.5, resting HR 0.25, sleep 0.25 — renormalised by the weights actually
  present, so a night the watch didn't record doesn't read as "no recovery". The fallback ladder
  (verified, not assumed): HRV+RHR+sleep → full score; HRV but no sleep → HRV+RHR renormalised and
  the Morning-Charge sleep nudge skipped; sleep but no HRV → `40 + sleepHours × 6` clamped 40–90;
  **nothing at all (dead/unworn watch) → estimated from training recency**, `70 + daysSinceWorkout`
  steps, i.e. 70 trained-today / 74 / 78 / 82+, capped 88. Don't "fix" a missing signal by
  substituting 0 — that's the difference between "we don't know" and "you're wrecked".
- **The daytime curve RECHARGES during still hours (built Aug 1).** It used to only ever fall —
  `charge0 − awakeDrain − trainingDrain − activityDrain`, every term growing — so a morning lifter
  dropped early and declined all day regardless of rest (70 → 57 across 16h of doing nothing).
  `restfulHourRecharge()` credits +2/h for an hour with ≤250 steps AND ≤40 kcal (net ≈ +1.1/h once
  the 0.9/h awake drain is netted off). **Guards that matter:** only counted when
  `activityHourlyDate` is TODAY — without fresh buckets you cannot tell "resting" from "no data",
  and assuming rest would hand a free recharge to everyone without a watch; an all-empty read is
  treated as no data; and the total is capped at `charge0`, because the number means "energy left",
  not "energy earned". Surfaced as a "Rest recovery +N" tile so a rising line has a visible cause.
  Sim: `sim_bbrest`.
- **The headline and the 24h curve have diverged THREE times — sweep it, don't spot-check it.**
  `computeBodyBattery()` and `computeBodyBatteryTimeline()` model the same day twice, and the
  symptom is always the big number disagreeing with the end of the chart directly beneath it. A
  Fable-5 audit found three more on Aug 1: (a) pre-dawn with NO HealthKit sleep window — every
  phone-only user, every night — the headline rolled its wake anchor to yesterday 7am and kept
  draining while the curve assumed a 10pm bedtime and drew a RECHARGE, and the endpoint pin can't
  reconcile them because it deliberately skips recharge points (05:30 read headline 40 / curve 71).
  Fixed by treating the app being OPEN as evidence of being awake: pre-dawn with no real window,
  push the estimated bedtime to `now`. (b) the curve applied STALE `activityHourly` buckets with no
  freshness gate, unlike its two siblings. (c) `restRecharge` was order-blind. `sim_bbmatch` and
  `sim_bbrest` pin single clock times and missed all three; **`sim_bbdiverge` sweeps the rollover**
  and is the one to extend.
- **Rest credit must be walked IN ORDER, not summed and clamped.** A still hour while the battery
  sits at `charge0` stores nothing — you cannot fill a full tank. Summing every still hour and
  clamping the TOTAL let a restful morning refund an afternoon workout: measured, a 20-set session
  was erased completely (headline 91 = charge0) while the curve, which caps hour by hour, said 84.
  The headline now walks hours with the same rule. The training hour is also never a rest hour
  however still the phone was — it sits in a locker recording ~0 steps.
- **`sessionDrain()` is the ONE workout-drain formula.** The headline and the 24h curve each had
  their own copy; moving the headline to `4 + 0.6/set` while the curve kept `6 + 0.9/set` made the
  chart dive to ~10 under a headline reading 23 — visible in Mo's screenshot, and `sim_bbmatch`
  missed it because its fixture sits at 2am where the last curve point is in the recharge phase,
  not the drain phase. `sim_bbrest` covers the afternoon case: the last drain point must equal the
  headline exactly.
- **44pt HIT AREAS COME FROM A PSEUDO-ELEMENT, NOT FROM RESIZING.** `.seshd-hit` / `.seshd-hit-y`
  (in the injected stylesheet) centre an invisible `::after` of `max(100%, 44px)` on a control, so
  the touch region grows and nothing renders differently. This exists because a set row already
  fits weight, reps, set type, RPE and the done tick across 428px — the tick was 32x32 and the
  steppers 25px tall, and neither could grow visually. Use `-y` for controls packed side by side
  (the +/- steppers): a square halo would overlap the neighbour, and in an overlap the later
  element in DOM order wins. **The hazard is a halo covering a NEIGHBOUR's centre** — that control
  becomes untappable with nothing looking wrong; `build/tap_audit.mjs` checks for it.
- **`build/tap_audit.mjs` MUST HIT-TEST, NOT MEASURE BOXES.** Its first version read
  `getBoundingClientRect`, which cannot see a pseudo-element — it reported the same 81 failures
  before AND after the fix landed. It probes with `elementFromPoint` now.
- **ACTIVITY NEVER EXPIRES — it stays until the person removes it** (Mo, Aug 8). It is DERIVED
  from posts on every render; there is no notifications table. So "remove this one" stores a key
  per hidden row (`seshd_dismissed_activity`), and because the events never age out that map must
  be capped by COUNT, never pruned by age — ageing it resurrects rows the user deliberately
  cleared. The badge count and the list must window identically (they didn't: the count looked
  back 30 days while the list showed everything, so the badge could read 0 above a screenful).
  Three more traps found by audit, all now fixed and worth knowing: **a persisted COUNT needs a
  one-time re-baseline when what it counts changes** (`seenActivityCount` was written under the
  windowed build, so removing the window gave every existing user a phantom badge on first
  launch); a **dismiss key must identify exactly one row** (kudos carry no timestamp of their own,
  so keying them on `post.createdAt` both collided for two kudos on one post and resurrected on a
  millisecond re-serialisation — key on post+actor); and **"Show N hidden" must restore the N it
  names**, not the whole map. Sim: `pw_activity`.
- **ACTIVITY IS DERIVED FROM `store.posts`, WHICH IS THE FEED — a global, paginated list.** The
  feed query is the newest 30 posts across EVERYONE and `loadFeed` replaces the array wholesale,
  so your own older posts fall off it the moment a few other people post, and every activity row
  derived from them vanishes. Mo saw two old items appear and then disappear on refresh: they were
  there only because opening your own profile fetches `posts?user_id=eq.me` and merges them in.
  `loadFeed` now fetches your own posts alongside the FIRST page (offset 0 only) and merges by id.
  Anything derived from "my posts" must not depend on feed pagination.
- **A PUSHED SCREEN MUST BE AN OVERLAY, NOT A PSEUDO-TAB.** Activity was rendered as
  `tab === "activity"` inside the 3-panel swipe track, which only mounts the current tab — so an
  edge-swipe-back dragged it off over bare app background and the whole gesture was a black
  screen. `showMessages`/`chatPeerId` were already the right pattern: an `position:absolute;
  inset:0; zIndex:40` overlay with `data-no-tab-swipe`, wrapping `EdgeSwipeBack`. The tab
  underneath is never unmounted, so it shows through the gesture. It also deletes the
  "which tab do I go back to" state entirely — and with it the trap where tapping the entry point
  again made Back a no-op, because the overlay covers that button. Sim: `pw_activity` §2 and §6.
- **`page.mouse` DOES NOT FIRE TOUCH HANDLERS.** A swipe check written with `page.mouse.down/move`
  reported success against a screenshot of a screen that had not moved at all. Dispatch real
  `TouchEvent`s (see `pw_swipeback` / `pw_activity` for the helper) AND assert the drag engaged —
  `EdgeSwipeBack` writes its transform straight onto its node, so check for a `translateX(>100px)`
  before asserting anything about what is revealed underneath.
- **`group_id=in.(…)&order=…&limit=N` RETURNS N ROWS ACROSS ALL THE GROUPS, NOT N PER GROUP.** The
  unread-dot query did this and one chatty group ate the entire budget — 200 posts in one group
  and a genuine unread post in another produced one dot, not two. PostgREST has no per-group
  ordering, so it is a hard ceiling: query per group with `limit=1`. And **filter ids to real
  UUIDs first** — `createGroup` puts a local `uid()` in the store before the insert returns, and
  splicing that into an `in.()` on a uuid column makes PostgREST reject the WHOLE query (22P02),
  which the catch swallowed and every group silently lost its dot.
- **A STOLEN TAP IS STOLEN FROM THE EDGE, SO NEVER PROBE ONLY THE CENTRE.** The steal check
  originally tested each control's centre point and reported a confident "zero found" while the
  exercise overflow menu's square halo was covering the right 2px of the rest-time picker — an
  audit proved it by CLICKING inside the picker's own box and getting the overflow menu. A halo
  eats a neighbour from the outside in, so the centre is the last thing it takes. The check grids
  9x9 over each control's box now and reports the percentage covered. Two fixture lessons from the same tool: bound BOTH axes when deciding
  what is on-screen (checking only top/bottom reported nine horizontally-scrolled filter chips as
  "stolen"), and a `.replace()`-based source edit must assert the string actually CHANGED — one
  className insertion silently no-opped because the matched text didn't contain the `<button` tag.
- **Selection and the long-press callout have been off app-wide for ages** — the injected
  stylesheet's `* { -webkit-touch-callout: none; user-select: none }` near its top, with
  `input, textarea, select` re-enabling both. A later commit added a `body` rule plus a tag list
  doing exactly the same thing ~80 lines below it; an audit showed the whole block was dead and it
  was removed. **Before "fixing" a native-feel tell, grep the stylesheet for it** — that one
  shipped with a stated premise that was already false. Links were the one genuine gap: the
  tap-highlight rule covers `button` and `[role="button"]`, not `a`.
- **★ A VERTICALLY-CENTRED FIXED-HEIGHT CONTAINER IS A *MOVING* LAYOUT THE MOMENT THE VIEWPORT CAN
  RESIZE — AND THE iOS KEYBOARD RESIZES IT.** Mo: "feels like it's still laggy, screen moves up a
  bit to adjust about 1 sec after clicking one of the type-in boxes." Nothing was slow. Capacitor's
  default iOS keyboard resize mode is `native`, which SHRINKS the whole webview when the keyboard
  opens; `AuthScreen`'s form is `height:100dvh` with its inner wrapper centred via `margin:"auto 0"`
  (that centring is itself load-bearing — see the comment there — it's what lets a short form centre
  while a tall one still scrolls to both edges). So the keyboard opening re-ran the centring against
  a shorter box and the whole form visibly drifted upward **a measured 84px at 390×844**, arriving
  a beat after the tap because it waits on the keyboard's own animation. Reads exactly like lag; is
  actually a layout recomputation. Fix: a `typing` state (bubbling `onFocus`/`onBlur` on the scroll
  container) swaps the wrapper to `margin:"0"` while any input is focused, so there is no `auto`
  margin left to recompute — and as a bonus it lifts the lower fields clear of the keyboard. The
  `onBlur` handler MUST defer through `requestAnimationFrame` and re-check `document.activeElement`:
  moving between two fields fires blur BEFORE the next focus, so reacting immediately drops `typing`
  for one frame and bounces the layout on every field change. **Device-only and invisible to the
  whole battery** — headless Chromium has no software keyboard, so all 50 sims and 48 Playwright
  suites passed both before and after. Mo's screen recording caught it; that is the SECOND bug in
  one night found that way (see the keyboard-dismiss entry below), which is the real lesson: for
  anything involving the software keyboard, a device recording outranks the entire test suite.
  Focus/blur IS testable headlessly though — `pw_authkeyboard`-style checks can pin the margin
  swap (unfocused 84px → focused 0px → back to 84px on blur) even when the keyboard itself can't be.
- **★ THE KEYBOARD-DRIFT SWEEP, AND THE HONEST LIMIT OF THE WEB-SIDE FIX.** After the AuthScreen
  drift was fixed, a cold-context sweep of every real `<input>` in the app (~56 of them) found the
  same class on four more screens, ranked by who reaches them: **`Onboarding`'s age step** (178px,
  the largest, and on EVERY new signup including App Review), **Edit Profile** (156px),
  **`NewPasswordScreen`** (which had all three problems at once — centred, no scroll container at
  all, and no `boxSizing` — on the one screen a user MUST type on to finish account recovery), plus
  the `boxSizing` latents on the **Body Battery sheet** (clips its own title/score when tall — the
  exact failure its `maxHeight` exists to prevent), **`PublicProfileView`** (reachable PRE-LOGIN via
  a shared `/u/` link) and the ErrorBoundary. All fixed. **`src/App.css` was DELETED in the same
  pass**: nothing imported it, yet it held the repo's only `box-sizing:border-box` rule, so anyone
  grepping would conclude a global reset existed — plausibly how this whole class survived so long.
  **What the fix can and cannot do, measured rather than assumed:** on a screen whose content
  OVERFLOWS the shrunken box, `margin:auto 0` collapses to 0 by itself and the pin is a genuine
  no-op — nothing moves. On a screen whose content still FITS (the onboarding age step), the
  content must go somewhere when the webview loses ~340px, so a residual ~29px shift remains and
  **top-pinning cannot remove it** — it only makes the resting position predictable and guarantees
  the field clears the keyboard. Switching `justifyContent` instead of using an auto-margin wrapper
  measured *worse* (34px) and reintroduces the documented "centring flex parent that is ALSO the
  scroll container clips the overflowing edge" bug — use the wrapper. **The only thing that removes
  the movement entirely is native**: `Keyboard.resize` in `capacitor.config.json` (unset here, so
  iOS defaults to `native`, which physically shrinks the webview). `resize:"none"` stops the resize
  app-wide — but it is NOT OTA-able, changes keyboard behaviour on every screen at once, and cannot
  be verified in this repo's battery at all (no software keyboard in jsdom or headless Chromium),
  so it was deliberately NOT taken hours before an App Store submission. Test it on device
  deliberately, with the scroll containers that now exist on the auth/onboarding/reset screens as
  the safety net, before considering it.
- **★ WHEN YOU REPLACE A MECHANISM, DELETE EVERY CALL SITE OF THE OLD ONE — A SURVIVOR WILL FIGHT
  THE NEW ONE, AND NO TEST IN THIS BATTERY CAN SEE IT.** "Swipe down to dismiss the keyboard" was
  first built as `onScroll={blurIfTextInput}`, then correctly rebuilt as `useSwipeDismiss` — a
  touch-DISTANCE hook that only fires on a real finger drag (its own comment says it exists because
  the scroll version didn't work). The rebuild added the hook to all four call sites and **left the
  old `onScroll` prop sitting right beside it on every one of them.** `onScroll` fires on ANY
  scroll, including the one WKWebView performs ITSELF to bring a focused input above the keyboard —
  so on the sign-up form, tapping "Full name" opened the keyboard, iOS scrolled the field into
  view, that scroll blurred the input, and **the keyboard slammed shut about a second after opening
  with no gesture from the user at all.** Mo reported it as two things ("doesn't feel smooth" and
  "the keyboard instantly disappears on its own"); it was one bug — the hard layout snap when the
  keyboard closes IS the un-smoothness. Invisible to the whole battery: 50 sims and 48 Playwright
  suites all passed on the broken build, because jsdom has no keyboard and Chromium's headless
  viewport never performs the focus-scroll that triggers it. **A screen recording from a real device
  found it in eight seconds.** The fix is `{...swipeDismiss}` alone at all four sites, and
  `blurIfTextInput`'s own definition now carries a "never wire this to onScroll" warning. Two
  standing lessons: grep for the OLD mechanism's call sites when you land a replacement (the
  duplicated-formula rule in this file, applied to event handlers); and **for anything involving the
  software keyboard, a device recording outranks the entire test suite** — the battery cannot
  reproduce a keyboard at all.
- **NO BACKTICKS IN THE INJECTED STYLESHEET'S COMMENTS.** The whole thing is one template literal,
  so a backtick in a CSS comment terminates it and the build dies with a syntax error pointing at
  the next word. This has broken the build twice, both times while writing a comment ABOUT the
  CSS.
- **Tap targets are NOT an App Store rejection risk.** 44pt is a HIG guideline; review rejects for
  crashes, broken flows, missing account deletion (present here), missing privacy policy, and UGC
  without report/block (present). Treat tap-target work as usability, not compliance.
- **A tall BOTTOM sheet pushes its own header off the TOP.** `align-items:flex-end` with a child
  taller than the viewport clips the top — the Body Battery sheet's title and score ended up behind
  the clock once steps/energy/HRV/RHR were added to it. Cap the sheet
  (`maxHeight: calc(100dvh - env(safe-area-inset-top) - 10px)`) and give it `overflow-y:auto` +
  `overscroll-behavior:contain`; fix the SHEET, never the content. Same family as the
  `alignItems:center` note below. Sim: `pw_bbsheet`.
- **★ AN APP STORE REJECTION, AND THE FIX THAT ACTUALLY MATTERED WASN'T THE ONE THAT LOOKED LIKE
  THE ROOT CAUSE (Aug 25 2026).** Apple rejected under Guideline 2.1(a): a reviewer on an iPad Air
  11" (M3), iPadOS 26.6, couldn't scroll the sign-up form far enough to reach the sign-in/sign-up
  toggle link (only at the bottom of the scrollable content then). First fix: added the toggle to
  the header row too, ABOVE the scroll container, so it's reachable no matter what the scrollable
  area does. Investigating further, found `AuthScreen`'s form container had `height:"100dvh"` PLUS
  padding with no `boxSizing` set — and this app has NO global `box-sizing:border-box` reset
  anywhere (checked: `src/index.css` has none; the only `box-sizing` in the repo is in
  `src/App.css`, which nothing imports — dead file). With the browser's content-box default,
  `height:100dvh` sets the CONTENT height and padding is added ON TOP, so the container's true
  rendered height was always `100dvh + its own padding`, permanently overflowing the real viewport.
  This looked like a clean explanation and got documented as "the actual root cause" — **which an
  independent audit then disproved**: reverting just the boxSizing fix and hit-testing with
  `elementFromPoint` (not `getBoundingClientRect`, which was what the first pass used and which
  quietly overclaimed) showed the extra padding sat entirely BELOW the last element at every
  viewport tested — not clipping it. The real mechanism: with the on-screen keyboard open (as it
  would be after tapping any field), the scroll container's measured `maxScroll` was **0** at real
  iPad dimensions, even though the toggle sat below the visible area under the keyboard — the
  browser saw nothing to scroll. A scroll-based reachability guarantee cannot survive that; a
  control that isn't scroll-gated at all (the header toggle, fix #1) can. **The boxSizing fix is
  still real and still correct** — content-box + padding + a hard height IS a live bug, worth
  keeping — it just wasn't the rejection's cause, and the same pattern was found on the WELCOME
  screen too (`minHeight:100dvh` + ~82px padding, measured 82px overflow at every size, clipped by
  `#root{overflow:hidden}` — the only reason it ever scrolled at all was two decorative gradient
  blobs accidentally inflating `scrollHeight`; fixed the same way). **Two lessons, not one: (1) a
  scroll/keyboard-shaped bug needs a fix that doesn't depend on scroll or keyboard state working
  correctly, not just a better scroll container; (2) `getBoundingClientRect` math can look like
  proof and still be wrong — `elementFromPoint` hit-testing is what actually confirmed both the
  bug and the fix here, and is worth reaching for before calling something "root cause."** Grep
  `height:"100dvh"` / `height:"100vh"` for other fixed-height-plus-padding, no-boxSizing instances
  before assuming this is fully swept — a partial audit found several more (`NewPasswordScreen`,
  `PublicProfileView`, the ErrorBoundary, the Body Battery sheet's panel) that are latent today only
  because their content isn't yet tall enough to reach the clipped edge.
  **The standing guard is `pw_authreach`** — added Aug 26, because for a day the fix for a
  REJECTION-causing bug had nothing protecting it, which is exactly how one gets reintroduced by an
  unrelated layout change. It hit-tests the header toggle at four viewports (iPhone, iPad portrait,
  and two cramped sizes standing in for the keyboard eating the lower half) and asserts three
  things: the toggle is on screen **with no scrolling performed at all** (a check that scrolls first
  would pass on the very build Apple rejected), it is hit-testable rather than merely on-screen
  (`elementFromPoint`, never `getBoundingClientRect` — see above for why rect math already lied once
  here), and tapping it actually switches mode. Red-proofed by deleting the header toggle and
  rebuilding: 20 failures, including "tapping it switches to sign-in" failing with the heading still
  reading "Create your account" — the user stuck on the form, which IS the rejection. Its
  "form actually rendered" checks stayed green throughout, which is what distinguishes a real
  failure from a broken fixture.
- **A fullscreen overlay owns the status-bar area itself** — it's anchored at `top:0` over the
  app's own top bar, so it needs `calc(env(safe-area-inset-top) + Npx)` on its header or the title
  and buttons sit under the clock/battery. `ProgramDetailView`, `ProgramBuilder` and
  `DayPreviewModal` all shipped without it (their reorder modals had it, which is why only the
  screen behind looked wrong). Check this on every new `position:fixed; inset:0` screen.
- **The guest→account migration must be idempotent, and `seshd_guest` is cleared LAST.** It POSTed
  every local session with no id, so each run inserted fresh copies — and the flag only clears
  after dozens of awaited requests, so any interruption re-migrated everything next launch. Mo's
  account reached **202 rows for 55 workouts**. Nothing looked broken because `loadUserData` keys
  history by ROW ID: every copy survived into the local store and inflated volume, streaks, the
  workout count, Wrapped and Body Battery's training drain ~3.7×. It now sends the session's own id
  (minting a UUID for legacy short `uid()` keys and writing it back to the store so a retry reuses
  it) and upserts `on_conflict=id`. Sim: `sim_guestmigrate`. The duplicates identify themselves by
  `created_at` at exactly midnight UTC — the old code used `new Date(date)`, which is also the
  previous EVENING for anyone west of Greenwich; it's noon local now.
- **Anything written OUT of the app must be idempotent per session id.** A workout can be finished
  more than once on purpose — "Undo finish & edit" then finish again — and a glitched finish gets
  retried. `workout_history` handles this by reusing the sid so the row upserts; the Apple Health
  calorie write did NOT, so the Move ring got the session twice (external data, permanent, not ours
  to clean up). `writeWorkoutToHealth` now guards on the sid via `seshd_health_written`, persisted
  (a retry can follow a reload) and marked BEFORE the await (two concurrent finishes).
- **The tell for a double-count is a SUM.** When sweeping, the reads that take a median or the most
  recent sample (HRV, resting HR) can't be inflated by duplicates — only the ones that add things
  up. Steps, active energy, sleep minutes and workout volume were all wrong; the medians were fine.
- **HealthKit sample reads are NOT deduplicated.** `readSamples` uses `HKSampleQuery`, which returns
  every source's samples — an iPhone and an Apple Watch both record steps/energy for the same walk,
  and multiple apps can write sleep for the same night. Apple's `HKStatisticsQuery` merges by source
  priority; this doesn't. Summing raw samples double-counts. Use `dominantSource()` for cumulative
  quantities (keeps the single most complete source) and union-of-intervals for durations (see
  `pickSleepBlock`). Both bugs shipped: ~2× steps, and one 8h night reported as 16h.
- **Gesture perf pattern (house style — follow this for any NEW drag/swipe code):** don't call `setState` on every `touchmove`/`mousemove` frame, it re-renders the whole screen per frame. Instead: call `setState` exactly once on the first frame that crosses a real threshold (flips the CSS `transition` off via a render and mounts/reveals anything needed), then every later frame writes directly to a ref'd DOM node's `.style` (transform/opacity/height/etc), then on gesture end read the **live ref value** (not the possibly-stale state var) to decide the outcome and commit it back via one final `setState`. Used in `PullToRefresh`, `SetRow`, `StoryViewer`, `InsightCards`, `ProfileScreen`'s cover-drag, and the feed/tab-swipe in `AppInner`. Two traps this pattern has actually hit: (1) if the final reset `setState` value is ever equal (via `Object.is`) to the last value React already committed, React skips the DOM write and a directly-ref-written style gets stuck — make sure the first-frame commit is always meaningfully non-rest so the final reset always differs (see `StoryViewer`'s `settleBack()` helper for the case where it doesn't); (2) **mouse drags need `window`-level `mousemove`/`mouseup` listeners, not element-level ones** — `onMouseMove`/`onMouseUp` JSX props only fire while the cursor is physically over that element, so a drag that exits a small drop target before the button is released would silently freeze state at the first frame (this happened to the cover-photo drag; fixed by adding/removing `window.addEventListener` pairs in the start/end handlers instead).
- **A drag inside a full-screen takeover must not reach the tab swipe** — `handleSwipeStart` bails
  on `[data-fullscreen-overlay]`, and every full-screen `position:fixed` overlay carries that
  attribute. This isn't about switching tabs by accident: those overlays are `position:fixed`
  inside the TRACK, so the moment the track takes a transform they resolve against it and `right:0`
  means the right edge of the 3-panel track — the overlay stretches to three screen widths and the
  whole app appears to zoom in and slide away. Mo hit exactly that dragging to reorder an exercise.
  Tag any new full-screen overlay with `data-fullscreen-overlay="true"`.
- **A portal is still "inside" you for EVENTS.** React bubbles synthetic events along the COMPONENT
  tree, not the DOM tree, so a touch inside a modal portaled to `document.body` still reaches the
  handlers of whatever rendered it. Dragging the followers list pulled the profile behind it to
  refresh for exactly this reason. `PullToRefresh` now ignores any touch whose target isn't a real
  DOM descendant of its own scroller (`el.contains(e.target)`), which covers every portaled overlay
  at once — don't fix these one modal at a time.
- **A sim that reads the wall clock must pass at every hour.** `sim_bbgate` asserted a recharge at
  "yesterday 10pm", which drops off the back of the rolling 24h window once the clock passes 22:00,
  and at "today 4am", which hasn't happened yet if you run it at 2am. It went red overnight on
  code that was fine. Loop a clock-dependent sim over all 24 hours before trusting it:
  `for h in $(seq 0 23); do TZ=<zone whose local hour is $h> node build/sim_x.mjs; done`.
- **Any `position:fixed` overlay rendered inside the tab-swipe track MUST `createPortal` to
  `document.body`.** The track's CSS transform creates a containing block (very visibly on iOS),
  so "fixed" elements get positioned/clipped inside the scrolling panel — the rest timer shipped
  as a broken clipped band this way, and the followers/following sheet shipped with its `inset:0`
  backdrop starting 56px down (below the top bar) and ending 56px short, so the profile showed
  through under the list and still scrolled. Every other overlay in ProfileScreen was portaled;
  that one was missed. `will-change: transform` creates the same containing block as an actual
  transform, so an EdgeSwipeBack panel traps fixed children too. Already-portaled precedents:
  NumberPad, Edit Profile modal, Close Friends picker, share sheet, rest timer (modal + mini bar),
  followers/following sheet, the profile overlay itself.
- **ProfileScreen's body-scroll-lock effect is a NO-OP — don't add to it.** AppInner pins
  `body { overflow:hidden; position:fixed }` for the app's whole lifetime, so the body was never
  scrollable and the effect's saved `prev` is always already `hidden`. Scrolling happens in inner
  containers. When content bleeds through an overlay, fix the OVERLAY (cover the full viewport,
  portal it out of the track) — adding another flag to that list does nothing.
- **State is stale inside touch handlers / setTimeout.** Use refs (`useRef`) as the source of truth for values read inside `onTouchEnd` etc.
- **Hooks must stay above the component's early returns** (`if (profileUserId) return ...`, etc.) or you get "rendered more hooks than previous render".
- **Windows CRLF** can make git report "nothing to commit" even when the file changed.
- **Body maps** (`BODYMAP_MALE`, `BODYMAP_FEMALE`): minified JSON path data. Always `JSON.parse` to inspect — never grep. Female map regions must scale uniformly to preserve anatomy.
- **Two post tables:** `posts` (main personal feed + stories, `type:"story"` <24h = story ring) and `group_posts` (group feed). Don't confuse them.
- Destructive confirms use the in-app `confirmAction({...})` / `ConfirmHost` sheet — **never `window.confirm`** (ugly on iOS).
- Memory/safety: never reduce the app's own safety behavior; this is a consumer fitness app.

## Current state / roadmap (as of last session)

**★★★ THE DESIGN-CRITIQUE ERA (Aug 17, 2026) — an outside eye on the look, and one number Mo could
see was wrong.** Bundles `2026-08-01u` → `2026-08-02a`. Battery is **47 sims + 42 Playwright
suites**, all green. What shipped:

- **A design critique and an accessibility review were run as cold-context agents against real
  screenshots of the running app** (not against the source). The accessibility pass found **8 real
  WCAG AA contrast failures on real 9–13px text** and **7 unlabeled icon-only buttons** — all fixed,
  and both are now standing checks inside `sim_a11y`. The design pass named three "generic AI"
  tells; Mo picked two to fix (the three-screens-one-empty-state-template problem, and the
  geometry) and **explicitly parked the third — containment / fewer rounded cards — as "we need to
  talk more about it after"**. Don't start that one unprompted.
- **The "57 PRs this week" bug**, which Mo caught by reading the screen. Two independent lifetime
  counters under a "THIS WEEK" heading, plus a `personal_records.updated_at` column that PostgREST's
  merge-duplicates upsert had never once touched. See the ★ convention above; it needed a DB trigger
  and a backfill, not just a client fix.
- **The `TYPE` and `RADIUS` scales** — 48 half-pixel font sizes snapped to integers, three arbitrary
  card radii retired. Deliberately narrow; see the convention above for what was left alone and why.
- **The plate colours**, which turned out to be a correctness bug wearing a cosmetic hat. Mo asked
  for 45 lb blue / 35 yellow / 25 green — the actual IWF/IPF competition code — and the map turned
  out to be keyed on the plate NUMBER alone while serving both unit systems, so two kg plates
  rendered in identical colours and the legend beside them was false. See the two ★ conventions
  above; the yellow then failed light-theme contrast and needed a rim rather than a darker yellow.
- **The lesson of the era: measure the design before critiquing it.** My own first pass reported
  "everything is the same large radius" from memory. Measurement found the exact opposite —
  26 distinct radii, i.e. arbitrariness — and low containment counts on the screens I had called
  over-contained. Two of the three findings I would have acted on were wrong.

**★★★ THE PRE-SUBMISSION ERA (Aug 12–16, 2026) — polish, then three rounds of "what else shipped
dead?".** Bundles `2026-08-01d` → `2026-08-01t`. Battery is **44 sims + 39 Playwright suites**, all
green. The pattern of this fortnight: the visible work was cosmetic, and every audit that followed
it found something that had NEVER WORKED rather than something newly broken.

- **Three features were dead on arrival, found by three different checks.** `PROGRAM_TEMPLATES` was
  deleted as collateral damage and its three references left behind — read at the top of the
  `Onboarding` component body, so **every new signup got the error boundary for twelve days**.
  `todayMs` was read in `buildCoachContext` but declared in a different function, so the **Weekly
  Review had never once run**. `showGroupShare`'s picker sheet, fast path and Back button all
  existed and **nothing in any commit could open it**. The standing checks are now `sim_undef`
  (+`undef_scan`) and `sim_deadui` (+`deadui_scan`); run both after deleting anything.
- **The persistence sweep.** The onboarding starter program and import-by-code both wrote locally
  and never reached the server — see the ★ convention above. All 28 `loadUserData` keys audited;
  `pw_persistence` and `pw_journey` are the standing checks. `pw_journey` is the first test in the
  repo that walks the app as a BRAND-NEW USER, which is why three bugs on that path had survived a
  suite of thirty.
- **The `<Sheet>` migration.** Two of nineteen bottom sheets animated in, none animated out. All
  nineteen go through `<Sheet>` now with `SHEET_MS` and the new `EASE_EXIT`. The migration itself
  shipped four regressions, all "close path still going through the old local state".
- **Device-reported fixes**: hold-to-reorder (`touch-action:none` on the drag handle — the one
  iOS-only bug in the batch, confirmed fixed on device); the number pad slides instead of blinking,
  gained a keyboard-dismiss key and moved both steppers under the thumb; the date-key bug that read
  every session a day early west of Greenwich; heart rate surfaced beyond the History tab; one-tap
  groups-only sharing from the Finish modal.
- **Aug 16, the last two commits** (audited separately): the bottom nav is visible during a workout
  again — the tab swipe was the only way out and it silently refuses to start over 61% of that
  screen; the top-left control is **Discard** and confirms first; and a workout post can carry ONE
  optional photo, rendered above the card, with groups-only shares routed to the private bucket.
- **`@capacitor/keyboard` is WIRED IN CODE** (package.json + a boot call) rather than being an edit
  for Mo to make on the day. It still needs `npm install` + `npx cap sync ios` on the Mac. See
  `submission-day-guide.md`; note the iOS project is **SPM, not CocoaPods**.
- **Not submitted yet.** Mo reached step 4 of the Mac checklist. The archived TestFlight build
  predates everything in this era, so it must be rebuilt before submission.

**★★★ THE HEALTH-ENGINE HARDENING ERA (Aug 3–7, 2026) — the recovery/Body-Battery maths got four
consecutive rounds of audit, and the pattern worth remembering is that MY OWN FIXES were the
biggest source of new bugs.** Bundles `2026-07-30l` → `2026-07-31m`. Battery is **41 sims + 21
Playwright suites**, all green. What shipped, and what it cost:

- **Round 1: four recovery-INPUT bugs** (read cap truncating a night, resting HR read as one raw
  sample, the illness signal reading the OLDEST row, an all-nighter inheriting the previous night).
- **Round 2: the HRV baseline contained the night it was scoring**, weighted nights by sample
  count, had a 22:00 cliff, and let one 0.25-weight signal score 100%. Fixed — and three
  cold-context audits then found FOUR new bugs in that fix: contiguous blocks assumed dense
  samples (an Apple Watch writes a handful of rows a night, hours apart, so the cliff was never
  actually fixed), the baseline cutoff was a timestamp not a key, "no overnight samples today"
  fired on one stray sample in 60 days, and a flat `min(score, 0.75)` made 7h/8h/9h identical.
- **Round 3: the daytime-HRV fallback I added in round 2 was DELETED**, not patched. An audit
  showed it failed four ways and every one flattered: it discarded a genuinely wrecked night in
  favour of yesterday's afternoon, its pool grew all day so one ordinary reading walked the score
  "Ready" → "Take it easy" → "Ready" between 08:30 and 15:30, a 09:15 lie-in reading counted as
  daytime and became the best score of the day, and all morning it served yesterday as today. The
  bug it was built for (a missing HRV RAISING the score) was already fixed properly by the
  typical-HRV ceiling in `recoveryScoreFrom`, so it bought nothing.
- **Round 4: six Body Battery bugs**, the worst pre-existing and firing EVERY night — pre-dawn the
  chart ended on a constant while the headline kept draining, and the endpoint pin drew the
  26-point difference across ~6px. `sim_bbcliff` had explicitly EXEMPTED pre-dawn on a stated basis
  that was factually wrong.
- **Mo found three bugs by looking at numbers and saying "that doesn't feel right"**: a 60-day
  sparkline read as 24h, resting HR blending two days, and 100/100 being too easy. That is a better
  hit rate than any sweep in this era — take those reports seriously and measure them.
- **The lime pass**: `C.accent` was the third most-used token in the file (283 refs vs 32 for
  `C.green`). Filled controls, selected chips and small-caps labels went neutral; volt is reserved
  for PRs, progress, the muscle map and the streak. Live workout 30 accented elements → 12,
  exercise picker 27 → 3, whole app 252 → 164. Tool: `build/accent_audit.mjs` (walks 13 screens and
  inventories every element actually painted in the accent). New `primary`/`onPrimary` tokens.
- **Round 5: the THIRD flat ceiling — the curve's per-hour activity clamp** (`2026-07-31j`). Mo:
  "there's athletes that use tracking watches and they'd get way more in an hour and I'd like it
  to be right." It had been recorded as a known-open divergence; it is closed. Both sides share
  `activityRawSinceWake` now, the headline's rest walk stopped smearing the day's activity across
  the waking span, and headline-vs-curve agreement on athlete fixtures went from 8–16 points to 1
  — the same as an ordinary day. `sim_stepscale` §4b asserts it directly and goes red on the old
  code. Two audit lessons in the Conventions list came out of this one.
- **Round 6: the round-5 fix shipped a FLAT SCALE of its own** (`2026-07-31k`). Bounding activity
  to `[wake, now]` unified the two models by discarding every step taken before an ESTIMATED
  07:00 anchor — 6.5k and 106.5k step days both read 71. Two cold-context Opus audits found it,
  plus three smaller ones in the same commit (the window returned null all pre-dawn, a
  non-numeric bucket key bypassed the guard, and the curve lost its workout damp). Fixed by making
  the anchor honest rather than the window wider. The same audits found `sim_stepscale` §4b's
  baseline hour was switching off `restfulHourRecharge`, hiding half of round 5 from its own test.
- **Round 7: the sleep-window trust test, and the health engine is CLOSED** (`2026-07-31l`). The
  two models validated the same field differently, so a corrupt window (a merged nap persisted as
  "7am → 8pm") sent them to different anchors — 21 points apart, headline flattering. One
  `trustedSleepWindow()` now. Mo's call after this: stop here. Six of seven rounds found real
  bugs, but rounds 5-6 were fixing regressions from rounds 4-5, and the area is being polished for
  an audience of a few testers. **Process change agreed: for anything touching the health maths,
  run the cold-context audit BEFORE publishing the bundle.** Round 6's flat scale was live on Mo's
  phone for about an hour because the order was publish → audit → republish.
- **Round 8: auditing round 7 found it had regressed broken sleepers** (`2026-07-31m`). The span
  rule cannot tell a merged window from a fragmented night, so tightening the headline onto the
  curve's checks threw away real windows for day sleepers. Slack 3h → 4h plus a 12h episode
  ceiling. Four smaller ones with it (empty activity window read as unknown rather than zero,
  string `sleepHours` concatenating, falsy `sleepHours` skipping the check, and the rest walk
  snapped to UTC hour boundaries — a 2-point error in every sub-hour-offset timezone). **And the
  round-7 sim was half-vacuous**: see the fallback-value convention above.
- **Also**: the two flat caps and the recovery top end (see Conventions), the strength-chart
  points, the post header + `PRTag` + set ledger, `dateKeyOf` consolidation, and `readRecovery`
  split into a device-only wrapper plus the testable `readRecoveryFrom(H, now)`.

**★★★ OTA ERA — DEVICE FEEDBACK SHIPS SAME-DAY, NO MAC (July 29, 2026).** OTA is live and proven:
six bundles published in one session (`2026-07-29a` → `f`), each reaching Mo's phone after two
relaunches. Nothing this session needed a Mac. Shipped, newest last:
- **Body Battery sleep window** — Mo saw "bed 7am, up 8pm". HealthKit returns per-stage sleep
  fragments, and the old rule kept everything ending within 14h of the newest end then took
  min(start)/max(end), so an evening nap merged with the tail of last night into a window
  describing neither. `pickSleepBlock()` groups into contiguous blocks (≤60min gap = a brief wake)
  and takes the most recent real sleep; night shift still works. The chart also rejects an
  already-persisted bad window by cross-checking span against reported sleep hours.
- **☀️ wake marker** beside the 💤, so the green stretch reads as a band and a wrong window is
  visible instead of inferred.
- **Tab-swipe replay fix** — a half-swipe that changed nothing replayed the screen's slide-in (see
  the CSS-animation convention above).
- **Hold-to-read on every progress chart** (`ExerciseVolumeChart`, so strength score + exercise
  progress + body-log all got it); all three data sources now carry a real `date`.
- **Progressive overload rewritten** — and note `parseRepRange` couldn't parse `"4×8-12"`, the
  format program days actually use, so double progression had NEVER run for a program workout.
  Now trend-aware (stall → deload, requires a rep range), load-scaled increments (~2.5%, snapped to
  a real plate), and RPE-aware (no loading a grinder; double jump at RPE ≤6.5).
- **Steps + active energy surfaced** in the Body Battery sheet only — the app is not a step
  tracker, but these steer the drain curve and the bedtime gate, and were invisible while ~2× wrong.
- **Two audit rounds + an app-wide sweep** for the bug classes, not just the instances. Found:
  accessory deload false-positive, duplicate-source step double-count, warmups inflating volume on
  every screen but the finish summary, and duplicate Apple Health calorie writes. All four are in
  the Conventions list above as rules.
**Sim battery was 20 and green at the end of that era — `node build/run_sims.mjs`.** New that session: `sim_sleepblock`,
`sim_swipenoop`, `sim_chartscrub`, `sim_overload`, `sim_stepsbox`, `sim_dupsource`,
`sim_doublecount`, `sim_setswipe`, `sim_profilehdr`, `sim_usernameauth`, `sim_progsets`,
`sim_authhash`, plus `bodymap_tip`/`bodymap_full` checkers.
**Two Playwright runs are NOT in `run_sims.mjs` — run them by hand for any program-editor change**
(dist server on :8199, see the recipe above):
- `build/pw_reorder.mjs` — the worked example for **dnd-kit**. Drag-and-drop needs real pointer
  events, so jsdom can't test a reorder at all. Seeds a program, opens the day editor, drags a row,
  and asserts the reorder list, the editor's own fields, the set steppers and the persisted store
  all agree.
- `build/pw_addex.mjs` — the "+ ADD EXERCISE" contract (typing adds nothing, the dropdown filters,
  a pick or Enter commits once, the box clears).

**★★★ FIRST-OTA + POLISH ERA (July 23–28, 2026) — the week OTA started carrying real work, and
the look-and-feel pass.** Bundles `2026-07-25a` → `2026-07-28d`. Shipped, newest last:
- **PR history had NEVER synced** — `WorkoutTracker` named `isGuest` without receiving it, so a
  swallowed ReferenceError killed both the `pr_events` and `hr_summary` writes. Wrapped read
  "0 PRs" for weeks that had real ones (confirmed against live data: last PR event June 29 despite
  10 exercises beating their stored PR Jul 13–19). See the ReferenceError rule in Conventions.
- **Two overlays trapped under the status bar** (both reorder screens' "Done" was untappable) and
  the **Wrapped modal clipped its own header** via `alignItems:center` — both rules are in
  Conventions now.
- **Notes**: auto-growing textarea, per-exercise notes attached to history and shown in History,
  per-workout notes kept OUT of the shared `workout_history` row, then synced to an owner-only
  `profiles.workout_notes` so they survive a reinstall without becoming public.
- **Recovery % stopped drifting through the day** — `pinToLastNight()`. The HRV lookback was a
  rolling 36h so it straddled two nights and shed samples as the clock advanced, and the "overnight"
  rule counted from 22:00, so evening-while-awake samples raised the score at night. It now reduces
  the pool to ONE night (HealthKit's real sleep window, else the newest contiguous block), so the
  number holds steady once you wake. Formula unchanged: 50% HRV vs baseline, 25% RHR, 25% sleep.
  Sim: `sim_recovery_pin`.
- **Polish/motion pass**: one easing token, `scaleX` progress bars, no page rubber-band, unified
  section labels, de-whitened Quick Start, sparkline fixes (inset plot, hi/lo labels, no overflow),
  History stat tiles counting up. All in Conventions. Restore point: branch
  `restore-point-pre-polish`.
- **Sub-tab memory** (`_trackerSubTab` / `_discoverSubTab`, module-level) — the swipe track only
  keeps the CURRENT tab mounted, so leaving a tab used to dump you back on its first sub-tab.
  Deliberately module-level so it does NOT touch the track's mounting (that engine has broken twice).
- **Feed foreground-refresh flicker** — a background re-fetch flipped the global loading state and
  replaced the whole array even when nothing changed. It now skips the loading toggle and bails
  when the incoming posts are identical.
- **Manual OTA update check reported "couldn't reach update server"** — the plugin REJECTS
  `getLatest()` whenever the reply carries a non-empty `message`, and the no-update reply said
  "up to date". Auto-update ignores `message`, which is why only the manual check looked broken.
  The reply is bare `{version:null}` now.
- **Settings shows which bundle is running** ("App version", tappable to check for an update).
  This is the ONLY way to tell whether an OTA landed — the app looks identical either way — so use
  it first when Mo says an update didn't arrive.

**★★ POST-TESTFLIGHT DEVICE-FEEDBACK ERA (July 20-21, 2026) — Mo testing on his phone, reporting
bugs live; each fix below is committed + pushed to main and rides the NEXT build/OTA.** A real
device build is expected "in a few hours" from the last session, so everything below ships then.
Highlights (newest first):
- **Workout finish "0m time" + duplicate-post bug (real, Mo hit it once).** The start time lived
  only in the resettable `wStart`/`elapsed` state, which the first finish nulls — a glitched-then-
  retried finish then recorded `duration = 0` and minted a NEW sid → duplicate. Fixes: a stable
  `session.startedAt` stamp drives duration (floors to real time, never 0 when sets exist); a
  `_finishedSid` tag makes a retry upsert the SAME workout_history row; and the SHARE path had the
  SAME bug in TWO more spots (the post card's `duration` read `elapsed` = the actual "0m" on the
  feed post; feed+group inserts had no idempotency). Both post tables got a `client_id` column
  (plain UNIQUE index — partial indexes can't be a PostgREST `on_conflict` target; NULLs stay
  distinct so non-workout posts are unaffected) + `on_conflict` upsert. RLS UPDATE policies already
  existed; proven with a rolled-back role-sim.
- **Apple Health feature set (all read-only, all behind the serialized `requestHealthAuth(H)` union
  auth — the boot sync fires reads concurrently and iOS honors ONE permission sheet, so a
  per-read auth call = losers rejected silently; always request the full HK_READ union).** Shipped:
  VO₂ Max 6-month sparkline card; per-workout heart rate (avg/peak, new `workout_history.hr_summary`
  jsonb, shown in History); overnight illness/overtraining signals (respiratory rate + wrist temp vs
  30-day baseline → plain-English heads-up); Resting-HR 60-day trend sparkline (down = fitter);
  auto body-weight into the body log (`readBodyWeightLog`, MANUAL entries always win, only fills
  un-logged dates / refreshes prior `source:"health"` ones, kg→user-unit, tagged "Apple Health").
  Recovery drivers rewritten from "HRV 42 vs 32" shorthand into plain-English tiles.
- **Body Battery**: sleep now moves Morning Charge on a smooth sliding scale (short nights bite
  harder); Garmin-style hourly-dot axis (green across the sleep stretch), lighter gridlines,
  2-column stat boxes; honest "Apple Health connected — waiting for data" copy via
  `isHealthConnected()` (a flag, since Apple hides read-grant state).
- **Liquid-Glass UI (partial, device-test remainder)**: translucent blurred top bar + status-bar
  OVERLAY mode (`setOverlaysWebView({overlay:true})`) so the clock/battery float over the glass;
  moved the bar up. The FULL "body content scrolls under real glass" is DEFERRED to a device pass
  (per the in-code TODO — it's the tab-swipe co-move engine + per-screen scroller clearance, exactly
  the thing that looks fine in Playwright and breaks on iOS). White-flash on chat edge-swipe-back
  FIXED (a scroll-lock effect hardcoded `body background:#fff`; now theme-bg, + dark CSS default).
- **OTA UPDATES fully wired** (@capgo/capacitor-updater, self-hosted via `/api/app-update` — see the
  OTA section below). Goes live after the NEXT Mac build includes the plugin; after that, app-code
  updates ship from any sandbox session with no Mac.
- **AppDelegate APNs fix**: the two `didRegister…RemoteNotifications` methods were missing, so the
  push token never reached JS. Added → device-verified: real DM from coach_kai buzzed the lock
  screen, tap opened the chat. **The .p8 key is PRODUCTION-ONLY** (sandbox → 403
  BadEnvironmentKeyInToken); Xcode debug builds can't receive pushes, TestFlight builds can.
- Two Fable-5 audits this era found NO correctness bugs (only low-severity hardening, applied:
  bedtime-gate date-stamp, legacy-session noon-anchor). A third audit is running as of this note.
- **Sim battery note (container recycle wiped the old gitignored build/ sims):** the committed ones
  (`git add -f`) are `sim_bootkeychain`, `sim_kcfail`, `sim_bb24`, `sim_bbgate`, `sim_health2`.
  jsdom-bootstrap.mjs is GONE — the committed sims are self-contained (inline JSDOM setup).

**★ MAC DAY HAPPENED (July 19-20, 2026) — APP IS LIVE ON TESTFLIGHT, ALL NATIVE FEATURES
DEVICE-VERIFIED.** Mo executed the whole checklist himself on Ashley's Mac (no Ashley needed).
Two builds archived + uploaded; the second carries every fix below. Verified working ON DEVICE:
login + Keychain session persistence (kill/reopen stays signed in), HealthKit permission sheet
(all types), native share sheet, offline queue, and the FULL push pipeline (DM insert → webhook
→ edge function → APNs → lock-screen banner → tap opens the right chat). First-device-run bugs
found + fixed (each verified by committed sims and/or on-device):
- **CapacitorHttp enabled** (`capacitor.config.json`) — the WebView origin can't make ANY
  cross-origin fetch ("TypeError: type error" on login and everything else). Uploads switched
  `Blob`→`File` (CapacitorHttp mangles bare Blobs). Consequences handled: offline queue can't
  sniff `e.name==="TypeError"` anymore (query() sets `err.transportFailure` / `err.httpStatus`;
  the queue keeps only transport failures), and CapacitorHttp ignores AbortSignal so query()
  races a manual timeout.
- **main.jsx never called `hydrateFromNative()`** — the exported boot hydration was never wired
  in, so every launch booted signed-out and the Preferences mirror never armed. Now awaited
  before React mounts.
- **The localStorage mirror NEVER worked anywhere** — assigning `localStorage.setItem = fn` is a
  spec-level no-op (Storage routes property-sets into stored items). Patch `Storage.prototype`
  instead (scoped to window.localStorage).
- **Session paranoia rule** (saveSession/hydrateSessionFromKeychain): never destroy a session
  copy until its replacement write is CONFIRMED; broken Keychain degrades to
  localStorage+Preferences fallback (signed-in-unencrypted beats signed-out); 4s timeouts on
  plugin calls; every step records `seshd_boot_diag`/`seshd_kc_save`, shown as a tiny `d1 ·` line
  on the auth screen (**TODO: remove before App Store submission**).
- **HealthKit auth RACE** — readRecovery/readTodayActivity/readHourlyActivity fired concurrent
  `requestAuthorization` calls; iOS honors one, the losers rejected silently → only Steps/Active
  Energy ever registered. ALL auth now goes through `requestHealthAuth(H)` (serialized, always
  the full union of types). Also: type strings MUST be from the plugin's HealthDataType union
  (invalid ones reject the whole request → no permission sheet); HK_WRITE is `["calories"]` only
  and the workout write uses `saveSample` (plugin has no writeWorkout/saveWorkout).
- **AppDelegate.swift was missing the APNs token forwarding methods**
  (`didRegisterForRemoteNotificationsWithDeviceToken` → NotificationCenter post) — the push
  token never reached JS, `profiles.push_token` stayed null. **The APNs .p8 key is
  PRODUCTION-ONLY** (sandbox send → 403 BadEnvironmentKeyInToken): debug builds can NEVER
  receive pushes — test pushes on TestFlight builds only. Both push edge functions retry the
  other APNs host on BadDeviceToken so env never needs flipping. To fire a test push: INSERT
  into `messages` from coach_kai (id 75748f50-b4a2-4cc8-bd27-53b94198875c) via MCP SQL.
- **Local Mac builds need `.env.local`** (VITE_SUPABASE_URL/ANON_KEY live in Vercel, not the
  repo) or sign-in fails; the golden rule after every `git pull` is `npm run build` THEN
  `npx cap sync ios` (sync copies the COMPILED dist). Both are in mac-day-guide.md.
Also shipped this era: **@capacitor/share** plugin via `shareLink()` helper (web
navigator.share is unreliable in WKWebView; a cancelled sheet is treated as done, not a
fallthrough); **Remember me** (email prefill + persisted opt-out `seshd_remember_optout`);
**Body Battery overhaul** — true 24h timeline (4 phases: prev-night recharge tail, yesterday
drain backward-anchored to sleepStartLevel, last-night recharge, today drain; contiguous-segment
rendering), steps-gated estimated bedtime (steps prove AWAKE only, push bedtime later, cap 4am,
only when `activityHourlyDate` is today; `activityPrevEvening` carries yesterday 8pm-midnight),
Garmin-style dot axis (hourly dots, bigger+labeled every 3h, green across the sleep stretch),
light gridlines, 2-column stat boxes incl. Resting HR + HRV (shown once Apple Health records
them), honest "Apple Health is connected — waiting for data" copy via `isHealthConnected()`
(flag = permission flow completed; Apple hides read-grant state). **Sim note: the container
recycle wiped the old gitignored build/ sim battery (jsdom-bootstrap.mjs and the sweep/flows/etc
sims are GONE — recreate as needed); the new self-contained sims ARE committed via `git add -f`:
sim_bootkeychain, sim_kcfail, sim_bb24, sim_bbgate.** A Fable-5 audit of the era's diffs found
no correctness bugs (hardening applied: gate date-stamp, noon-anchor for legacy sessions).

Earlier shipped & verified (newest first): **Polish run** (5 Playwright-verified visual fixes:
global sans fallback in index.css; profile cover scrim only over a real photo; PR modal `firstEver`
handling; zero-delta "▲ 0%" suppressed in Wrapped modal + wrapped PostCard + shared SVG;
"1 member" pluralization ×4 sites). **Story delete** — trash button in StoryViewer for your own
story (`post.userId === currentUserId`), confirmAction sheet, reuses `handleDelete` (stories are
`posts` rows); sim: `sim_storydel.mjs`. **Auth-screen logo** — big centered `<SeshdLogo size={72}/>`
above "Welcome back" (SeshdLogo now takes a `size` prop). **Wrapped story double-wordmark fix**
(see Conventions). **App Store submission assets — ALL ENTERED in App Store Connect by Mo:**
listing copy (subtitle/description/keywords/promo), screenshots uploaded, Support URL set.
Assets live in the repo: `appstore-screenshots/captioned/` (upload-ready, lifter-voice headlines)
+ `plain/` — both **1284×2778** (the 6.5" slot REJECTED 1290×2796; 1284×2778 is accepted in both
slots); `appstore-submission.md` (App Review notes + TestFlight what-to-test, paste-ready);
`public/support.html` + `terms.html` + `privacy.html` all live (a "404" was browser cache).
**App Review demo accounts (live in prod DB):** `appreview@getseshd.app` (password NOT stored in this repo — it lives in App Store Connect's review notes only; see the credential-hygiene entry in CLAUDE.md)
(follows Coach Kai so the feed + Report/Block are testable) and buddy `coachkai@getseshd.app`
(same pw, has one post) — created via SQL insert into auth.users (token columns need explicit
empty strings, profile auto-created by `handle_new_user` trigger). Login VERIFIED by Mo.
**House/demo content (live in prod DB, seeded for testers):** 4 more personas — `maya_lifts`,
`jblake_strong`, `tess_pr`, `sam_ortiz` (all `…@getseshd.app`, RANDOM unrecoverable passwords —
view-only personas, nobody signs in) + Coach Kai. Each has: **27 workout_history sessions over
~9 weeks with a real progressive-overload trend** (older rows scaled lighter via a temp SQL
`scale_w(jsonb, factor)` helper — weights stay strings rounded to 5s, so exercise Progress
charts slope upward), personal_records, feed posts (text + workout-card jsonb
`{name,duration,volume,exercises:[{name,isPR,sets:[{w,r}]}]}`), **2 group posts each** in
"Seshd Crew", a distinct bio, and an **avatar as an inline SVG data-URI in
`profiles.avatar_url`** (gradient + initials — real photo uploads are impossible from the
sandbox, and data-URIs render fine in `<img>`). Full follow mesh between them (drives
onboarding's most-followed suggestions) and they follow appreview back. Private group
"Seshd Crew" (creator coach_kai, appreview IS a member so App Review sees a live group feed;
regular testers can't join — creator-only membership — they create their own). Role-sim
verified: fresh outsider sees all profiles/posts/histories, group invisible to non-members.
**Refreshed Aug 13 (submission day):** `appreview` had 0 workouts / 0 PRs / 0 posts — the feed was
full but the reviewer's OWN app (History, charts, PRs, muscle map, profile) was blank, i.e. the half
the listing is mostly about. It now has 27 sessions cloned from coach_kai and re-dated, 9 PRs derived
from those sessions, and 2 workout posts built from its own newest sessions. The whole persona corpus
was also shifted forward — posts were 16 days stale, workouts a month — so nothing reads as
abandoned. **Two offsets were needed, not one:** posts and workouts had drifted apart, so a single
shared shift left the workouts 16 days behind. Verified after: nothing future-dated, no comment or
kudos earlier than its post. These dates go stale again — re-run the shift before any future review.
**And a real bug the reseed exposed: five exercise names in the demo corpus did not exist in the
library at all** ("Bench Press" vs "Barbell Bench Press", "Back Squat", "Leg Curl", "Incline
Dumbbell Press", "Triceps Pushdown"). `getExEntry` only tolerates bracketed suffixes — `_exNorm`
strips `(...)` but nothing else — so those sessions resolved to NO muscle and contributed nothing
to the heatmap, weekly muscle volume, muscle readiness or "most trained". Renamed in place. When
seeding demo data, resolve every name through the library first; a plausible-looking name that
isn't an exact (or bracket-suffix) match is silently invisible to every muscle feature.
Coverage now: all 13 trainable groups (Chest, Back, Shoulders, Rear Delts, Traps, Biceps, Triceps,
Forearms, Core, Quads, Hamstrings, Glutes, Calves) inside the 7-day window the heatmap actually
reads. `appreview` also follows `momo`, which is how the reviewer sees real PHOTO posts — 19 of
Mo's 74 posts carry images, so there was no need to fabricate any.
To wipe later: delete auth.users rows with `%@getseshd.app` emails (except appreview if still
needed) — profiles/posts/history cascade. Mo is added as an internal TestFlight tester. DMARC is DONE (verified live Aug 29 — see the launch-blockers entry).
(The email templates and the SMTP sender name are DONE and inbox-verified — Aug 30.) Earlier: **App Store trust & safety pass** — three things a
UGC app needs for Guideline 1.2 review: (1) **Report flow** — module-level `reportContent(target)`
+ `<ReportHost>` (mirrors `confirmAction`/`ConfirmHost`; rendered next to ConfirmHost in AppInner
so it needs `token`+`currentUserId` props), wired into profiles (the old standalone Block button
is now a `···` overflow with Report+Block), personal feed posts (PostCard's non-own `···`), group
posts (non-`isMyPost` `···`), and DM headers. Writes to the **insert-only `reports` table**
(RLS: insert only as yourself via `reporter_id = auth.uid()`, NO select policy → clients can never
read reports; **Mo triages in the Supabase dashboard `reports` table — Apple wants action within
24h**). (2) **Terms/EULA agreement at sign-up** — signup mode shows "By creating an account you
agree to Terms + Privacy, including a zero-tolerance policy for objectionable content and abusive
behavior" linking `spotr-drab.vercel.app/terms.html` (new — `public/terms.html`, matches
privacy.html style) + `/privacy.html`. (3) **Private group photos** — group photos are members-only
now, NOT in the public `images` bucket: `uploadGroupImage()` posts to the private **`group-images`**
bucket under a `{groupId}/` folder and stores the bare PATH in `group_posts.image_url`;
`signGroupImage()` mints a 1h signed URL to view; RLS helper `group_image_member_check()`
(SECURITY DEFINER) gates BOTH insert and select on group membership, so non-members 403 on signing.
`GroupDetail` signs paths lazily into `signedImgs` state (only successes cached, so transient sign
failures retry) and `resolveImg(post)` picks _localImage → signed path → legacy absolute URL.
Signed-URL shareability (a copied link works ≤1h) is the accepted tradeoff — same model Instagram
uses. Verified: RLS role-sims (member sees / outsider 403), `sim_report.mjs`, `sim_offline.mjs`.
NOTE on **offline-first**: it was ALREADY robust and is now proven — `queueWrite`/`flushWriteQueue`
(durable localStorage PATCH/DELETE queue, merges, flushed on boot AND reconnect) + the
`seshd_pending_workouts` queue for the workout POST (idempotent upsert on client `id` via
`on_conflict=id`, retried on boot+reconnect). Only offline likes/comments (POSTs) are best-effort.
Also recently: **password-reset flow** (Forgot password? on sign-in
→ Resend email → `#type=recovery` landing forces a set-new-password screen; sim: `sim_reset.mjs`);
**Resend SMTP live** on `getseshd.app` (sender `hello@getseshd.app` — the sender address MUST be
at the verified domain, a placeholder domain 550s; check Supabase auth logs via MCP `get_logs`
service `auth` when email "silently" fails, the reset UI intentionally never surfaces errors);
password minimum is **8 chars** (Supabase setting + sign-up validation — keep in sync);
**login blip fix** (loadUserData retries once silently before the "check connection" toast;
ToastHost now seeds from the queue so pre-mount toasts aren't swallowed); **iOS 18 AutoFill fix
v2** (the 4 keypad set fields are DIVs now — any focused real input attracts the pill, readOnly
included; keep them divs); **core secondary credits** (32 compounds → Abs/Obliques half-credit;
back squat/deadlift deliberately excluded — bracing ≠ half a set of abs); **AI form-guide button
removed** (all 292 built-in exercises have hand-written cues/mistakes/breathe in exerciseCues.js
— audited for duplicates/equipment-mismatch/generic filler, quality confirmed; custom exercises
get the generic fallback); **one-time custom-exercise merge migration** (`CUSTOM_MERGE_MAP_V1` +
batched `mergeExerciseNames()` — single-pair loops corrupt sessions holding two renamed
exercises, always batch; flag `seshd_custom_merge_v1`); **bug-sweep fixes** (border shorthand +
borderLeft in ONE style object breaks React's style diffing when either side is dynamic — use
per-side borders; guest auth-gate Back now returns to the app, not the marketing screen); plus
the earlier era: co-move swipe, Wrapped share-to-story, block users, native confirm sheets,
female body map, and the full security/perf audit (RLS gaps, webhook auth, race conditions).

**⚠️ THE SIM LIST BELOW IS HISTORY, NOT AN INVENTORY — most of these files NO LONGER EXIST.** A
container recycle wiped everything in the gitignored `build/`, and only the sims re-added with
`git add -f` survived. `ls build/sim_*.mjs` is the truth; `node build/run_sims.mjs` runs whatever
is actually there. The descriptions are kept because they record what each flow's tricky parts
were, so recreating one is quick — but don't go hunting for a file that isn't there, and don't
report a sim as "passing" because it's named here. The harness gotchas below the list are all
still live and worth reading before writing any new sim.

**Historic sim battery (build/*.mjs):** `sim_sweep.mjs` (full-app fuzz tour, run
plain AND with `guest` arg), `sim_flows.mjs` (finish-workout → recap + kg-unit smell scan),
`sim_reset.mjs` (password reset both halves), `sim_retry.mjs` (login blip/persistent failure),
`sim_merge.mjs` (custom-name migration), `sim_keypad.mjs` (div set fields + NumberPad),
`sim_howto.mjs` (exercise-detail guides, no AI button), `sim_report.mjs` (foreign feed post →
`···` → Report → reason → asserts POST to `reports`; needs the post author followed + Home tab —
the feed only shows followed users and boots to the tracker, not the feed), `sim_offline.mjs`
(finish workout while the save throws → lands in `seshd_pending_workouts` → fire window
offline→online → asserts idempotent `on_conflict=id` upsert + queue drains), `sim_storydel.mjs`
(seed an own `type:"story"` post → open "Your story" ring → trash button → confirm → asserts
DELETE to `posts?id=eq.<id>`; delete button is gated on `post.userId===currentUserId`), plus the older
sim_tap/str/vol/msg/
weekly/bb/hist/keychain/empty/gestures set. Sweep gotchas: nav buttons are aria-label-only
(match both), NumberPad keys fire on pointerdown not click, NumberPad portals to document.body,
and closePad arms a 500ms ghost-click swallower (wait it out before the next click).
**Stale-stub trap (bit sim_msg once):** the app loads OTHER users from `public_profiles`, not
`profiles` — any sim whose fetch stub only answers `/rest/v1/profiles` renders an empty social
UI and fails on "missing" friends. When a sim fails after a data-path change, suspect the sim's
stub before the app. Two more harness lessons (bit sim_wrappedpr): **loadUserData wipes
localStorage-seeded history/prEvents with the server copy** — seed via the fetch stub
(`workout_history` rows + `profiles.pr_events`), not just `seshd_v1`; and any share/rasterize
path dies instantly without `global.Image = window.Image` (svgToDataURL does `new Image()` —
the rejection is swallowed by the handler's catch, so nothing visibly errors). To capture a
generated share SVG, wrap the `Blob` constructor (and set `global.Blob`) — `sim_wrappedpr.mjs`
(Wrapped story SVG carries typed "Wt+Vol PR" suffixes in NEW PRs) is the worked example.

**Gesture-perf refactor (merged to main):** every touch/drag gesture in the app — `SetRow` swipe, tab-swipe, the shared `PullToRefresh` component (History/Profile/Messages), the feed's own pull-to-refresh, `StoryViewer` drag, `InsightCards` swipe, and the profile cover-photo position drag — was re-pointed from per-frame `setState` (re-rendering the whole screen on every `touchmove`) to the ref-write pattern documented above, plus a fix for vertical-scroll bleed-through during the tab swipe. A code review of this refactor caught and fixed one real regression before merge: the cover-photo drag's mouse path could freeze `coverPosDraft` at the gesture's first frame if the cursor left the small drag area before mouseup (now uses `window`-level listeners — see the Conventions note above).

**Push notifications are now fully wired end-to-end on the code/server side** — client registers for APNs, saves the token, and routes a tapped notification to the right screen (DM → chat thread, follow → profile, kudos/comment → Activity tab, streak → Tracker tab). Server-side: all 4 DB webhooks (`messages`, `kudos`, `comments`, `follows` → `send-message-push`/`send-activity-push`) and the `streak-at-risk-push` weekly pg_cron job are configured and active, confirmed sending real 200s in the edge function logs. **The only remaining blocker is Mac/Xcode-side — see the Mac day checklist below (Mo runs it himself).**

## ★★ THE UNREVOKABLE pg_net GRANT IS NOW INERT (Sep 1) — remove the EFFECT, not the permission
Mo: "what can we do about the one thing you couldn't fix? Maybe try fable 5.1?" A Fable 5.1 agent
scoped to "find a route I have missed" found a real one, and two facts that reframed the problem.
**★ THE GRANT IS SUPABASE'S DELIBERATE CURRENT DEFAULT, NOT AN OLD LEFTOVER.** Their platform
migration `20250220051611_pg_net_perms_fix.sql` runs `GRANT ALL ON FUNCTION net.http_get/http_post
TO PUBLIC` on every project with pg_net installed — which is exactly the `=X/supabase_admin` ACL
entry. So the support-ticket advice recorded earlier was based on a false premise: a ticket asks
them to deviate from their own default, and a future platform migration could re-apply it. Correct
the expectation before spending time on it.
**Every route to REMOVE the grant is blocked, and all of it was measured:** `REVOKE … GRANTED BY
supabase_admin` → `0A000 grantor must be current user`; `ALTER FUNCTION/SCHEMA … OWNER TO postgres`
→ `42501 must be owner`; `ALTER EXTENSION pg_net UPDATE` → `42501 must be owner of extension`, and
0.20.0 is newest with no update path anyway; `extrelocatable = false` so it cannot be moved; event
triggers need superuser; RLS on `net.http_request_queue` → `must be owner of table`. `postgres` is a
member of nine roles and none reach `supabase_admin`, which has zero members.
**DROP + CREATE EXTENSION *does* work** (supautils lists pg_net in `privileged_extensions` and runs
it as `supabase_admin`) **and is NOT a fix** — it re-runs the 0.20.0 script, which re-grants USAGE
and ALL on the schema/tables to PUBLIC, and it drops the queue with any in-flight webhook. Do not.
**★ SO THE FIX REMOVES THE EFFECT INSTEAD.** Every pg_net request — any role, via
`http_post`/`http_get`/`http_delete` or by writing the table directly (PUBLIC has INSERT there too)
— ends as a row in `net.http_request_queue`. `postgres` holds the TRIGGER privilege on that table
because the 0.20.0 script granted ALL to PUBLIC, so a BEFORE INSERT trigger is a single choke point
the grant cannot bypass. `supabase_functions.pgnet_enqueue_guard()` carries TWO rules covering
different attackers: the ROLE rule stops anon/authenticated outright (a direct call and a SECURITY
INVOKER wrapper both run as the caller), and the HOST rule stops pg_net being aimed off-project even
by a postgres-owned SECURITY DEFINER wrapper — which the role rule alone would permit, and which is
exactly the shape the tripwire watches, so it goes from monitored to impossible.
**Verified against the LIVE guard, not just in a rollback:** anon `http_post` blocked, authenticated
blocked, anon writing the queue directly blocked, `postgres` aiming off-host blocked, and a real
`kudos` insert still enqueued `POST …/functions/v1/send-activity-push` (queue 0 -> 1). The negative
control matters: with a deliberately wrong host allowlist the push path FAILED, which is proof the
guard genuinely sits on it — a mistyped regex here breaks notifications for every user.
**What it costs:** a future webhook to a NON-Supabase host (Stripe, Slack, Zapier) is refused until
the regex is widened. It fails LOUDLY with a message naming the function to edit.
**Reversible, but not the obvious way:** `postgres` cannot `DROP TRIGGER` or `DISABLE TRIGGER` on a
table it does not own — it owns the FUNCTION, so `CREATE OR REPLACE … RETURN NEW` disables it and
`DROP FUNCTION … CASCADE` removes it.
**NOT COVERED, and worth being honest about:** PUBLIC also has SELECT on `net._http_response`, which
stores webhook response bodies. Nothing from this role can put RLS on it. That half is still
protected only by the `net` schema not being REST-exposed — one layer, where the request path now
has two. If `net` were ever exposed, reading responses would become possible and the guard would not
help; that is what sweep step 6's first condition is for.

## ★★ SECURITY ROUND 2 (Sep 1) — the media-URL sweep found one the first pass missed
Mo, on the tracking-pixel finding: "make sure that can happen anywhere else." So the second round
led with a full sweep for remote resources loaded from a value another user controls.
- **★ `resolveImg` IN GroupDetail RETURNED A LEGACY ABSOLUTE `image_url` VERBATIM.** The first pass
  gated seven `<img>` sites in App.jsx and MISSED this one, because it is behind a resolver rather
  than an inline expression. `group_posts.image_url` is a plain text column and its author may
  PATCH it (the author-edit trigger permits exactly that), so a group member could point their own
  post's image at `https://attacker/pixel.png` and collect the IP and user-agent of **every member
  who opens that group's feed**. Every branch of the resolver goes through `safeMediaSrc` now.
- **What the sweep RULED OUT, by looking rather than assuming:** no `backgroundImage` with a
  dynamic value anywhere (the classic thing an `<img` grep misses); no `<video>`/`<source>`/
  `<iframe>`/`<object>`/`<link>` in the whole app; all three `new Image()` sites load either a local
  base64 data URL or a `URL.createObjectURL` blob of our OWN svg, never a remote URL; the share-card
  SVG builders contain no `<image>`, no `xlink:href` and no avatar, so nothing in a rasterised card
  can fetch; and `api/profile-og.js` embeds a STATIC `og-image.png`, not the user's avatar — which
  matters because that card is unfurled by third parties.
- **★ THE GUARD IS STRUCTURAL, NOT A LIST OF SITES.** `sim_mediasrc` section 3 walks every source
  file and fails any `<img src={...}>` whose expression is not a literal, not a `safeMediaSrc(...)`
  call, not a named DEVICE-LOCAL source, not a variable this file assigns from `safeMediaSrc`, and
  not a resolver whose EVERY return goes through it. That last clause is what catches the
  GroupDetail shape: a resolver with one leaking branch fails. Red-proofed both ways — restoring
  the raw `return iu` fails it, and so does a brand-new ungated `<img>`.
- **`client_errors` / `feedback` could be attributed to anyone.** The reporter POSTed a `user_id`
  while authenticating as ANON, so the column was whatever the caller claimed and RLS had nothing
  to compare it against — anyone with the public anon key could fabricate crash reports and
  feedback against any real user, which is Mo's triage queue. The client sends the session token
  now and the policy enforces `user_id IS NULL OR user_id = auth.uid()`, plus a size CHECK the
  client's own truncation already satisfies. Verified with role-sims: a forged attribution is
  refused, an anonymous null-id report still works, an oversize payload is refused, and an honest
  report from the real user still works.
- **★ THE pg_net REVOKE DID NOT TAKE, AND THE STATEMENT SAID IT DID.** `net.http_post`/`http_get`
  carry `=X/supabase_admin` in their ACL — the grant is to **PUBLIC**, made by `supabase_admin`.
  The MCP connection is `postgres`, and Postgres SILENTLY IGNORES a REVOKE for a grant the caller
  did not make: the statement returned success and `has_function_privilege('anon', …)` was still
  true afterwards. This is the scar already recorded in Sweep #5, hit again — **check the privilege
  after the revoke, never trust the statement.** Status: NOT fixed, and not fixable from here; it
  needs `supabase_admin`. **MEASURED, so nobody re-tries it:** the MCP connection is `postgres`,
  `pg_has_role(current_user,'supabase_admin','MEMBER')` is FALSE and `rolsuper` is FALSE, so
  `SET ROLE` cannot reach the owner. The `net` SCHEMA is owned by supabase_admin too and its
  `anon=U/supabase_admin` USAGE grants were likewise made by it, so the schema-level route is shut
  as well — there is no path from any tool holding these credentials, and **the dashboard SQL
  editor connects as the same `postgres` role, so it will not work either** (an earlier note here
  suggested trying it; that was wrong). A different model does not help: this is a privilege
  limit, not a reasoning one. It is a Supabase-support request, or a platform default they may
  have since changed.
  **So it is MONITORED instead — see sweep step 6.** It stays latent rather than live because
  PostgREST exposes only `public, graphql_public` and no public wrapper forwards a
  caller-controlled URL into it; those two facts are exactly what the tripwire checks.
- **The privacy policy now names Anthropic** and says exactly what the coach sends (recent
  workouts, PRs, bodyweight trend, per-muscle volume, and — only if Apple Health is connected — the
  DERIVED recovery values), what it does not (name, email, username, photos, messages, post text),
  and that it only runs when the feature is used. The HealthKit section carries the matching
  exception. This was an App Review 5.1.1 exposure, not just tidiness: HealthKit-derived values
  reached a third party while the policy listed no AI processor.
**Deliberately NOT done this round:** `/api/ai` still accepts the client's `system` prompt verbatim
(clamped to 6000 chars) rather than selecting it server-side from a mode enum. The cost risk it
represented is now bounded by the per-user daily quota, and the change touches both coach call
sites, so it is worth doing deliberately rather than tacked onto a security round.

## ★★ THE SECURITY ROUND (Sep 1) — three Fable 5.1 audits, and no live takeover hole
Mo asked for a full security audit with a focus on account takeover. Three cold-context Fable 5.1
agents ran on disjoint scopes (auth / database / client+future-risk), all read-only, RLS verified by
rolled-back role-sims **checked by ROW COUNT, not by catching an exception**.
**The headline is that there is no live account-takeover hole.** The private-account model, block
enforcement, follow approval, group permissions and storage isolation were all driven and all held.
What follows is the set of conditions that turn ONE leaked token into permanent access, plus the
things that only bite at scale. Fixed this round:
- **★ A RECOVERY LINK PERSISTED A FULL SESSION BEFORE THE PASSWORD WAS SET.** `saveSession` ran
  unconditionally in the `type=recovery` branch, and a recovery link opens in SAFARI (the AASA file
  claims only `/u/*` and `/p/*`). Combined with sessions that never expire (below), starting a reset
  on a borrowed computer and walking away left a permanent signed-in session for the next person.
  The session is held in MEMORY now and persisted only after `updatePassword` returns. A reload
  mid-recovery drops it and needs a fresh link — correct, since the link is single-use anyway.
  Sim: `pw_recoverysession`, red-proofed (the pre-fix build stores the recovery token immediately).
- **★ EVERY USERNAME LOGIN SHARED ONE THROTTLE BUCKET.** `username-auth` calls
  `/auth/v1/token` from the edge runtime without forwarding the caller's IP, and GoTrue keys its
  sign-in limit on client IP — so one person guessing passwords could 429 username login for
  EVERYONE, and guessing had no per-caller cost. It forwards **`cf-connecting-ip`**, never the
  caller's own `x-forwarded-for`: Cloudflare SETS the former and refuses a spoofed one at the edge,
  while the latter is caller-controlled and would let an attacker mint a fresh bucket per request —
  worse than no limit, because it looks like one. Deployed v3 and verified against the REAL endpoint
  (a real username + wrong password still returns `400 invalid_credentials`, not a 500).
- **★ `/api/ai` WAS AN UNMETERED CLAUDE PROXY FOR ANY ACCOUNT HOLDER.** "Any valid token" was the
  only gate; one account could call it without limit at 2000 output tokens a time. `ai_quota_consume`
  (SECURITY DEFINER, `authenticated`-only, keyed on `auth.uid()`) counts per UTC day, called with
  the CALLER'S OWN token so no service-role key is needed in Vercel and nobody can inflate someone
  else's count or reset their own. Measured in a rolled-back probe: limit 40 → 40 allowed, 5
  refused, anon refused. **Fails OPEN on a transport error deliberately** — the coach breaking
  because the counter blinked is worse than a few un-metered calls.
- **★ A SERVER-SUPPLIED MEDIA URL IS ANOTHER USER'S INPUT.** `avatar_url`/`cover_url`/`image_url`
  are plain text columns rendered as `<img src>` to everyone who sees that person; a direct PATCH
  could point one at `https://attacker/pixel.png` and collect the IP + user-agent of every viewer
  who scrolls past. `safeMediaSrc()` is the one gate (Supabase storage over https, `data:image/*`,
  `blob:` — everything else falls back to the initial). Applied at all seven server-supplied sites.
  Sim: `sim_mediasrc` (19 checks incl. suffix-attack hostnames and `data:image/svg+xml`).
**Known and NOT fixed here — Mo-side, dashboard only:** sessions carry `not_after = NULL` (verified:
9 live, one 58 days idle and still valid) — that needs Supabase's session timeout, a paid feature;
captcha on signup/token/recover, which is the real fix for the shared **30/hour project-wide email
budget** (anyone with a username list can starve every reset AND every signup, since confirmation is
on); and "Secure password change", currently off, so a valid access token can set a new password
with no re-auth.
**Known and NOT fixed here — code, next round:** `client_errors` accepts anonymous inserts with a
spoofable `user_id` and no size cap; `pg_net`'s functions are EXECUTE-able by `anon`/`authenticated`
(a latent SSRF that is inert only because `net` is not REST-exposed — revoke it while it is free);
`/api/ai` still takes the client's `system` prompt verbatim (clamped to 6000 chars) rather than
selecting it server-side from a mode enum; and the privacy policy does not name Anthropic as a
recipient, which matters because HealthKit-derived recovery values are in the coach payload.
**★ THE RANKED FUTURE RISK, worth re-reading before adding anything:**
1. **The OTA channel is the highest-value target and has the fewest controls** — a push to `main` is
   code on every phone in minutes with no signature check and no App Review. Everything else is
   bounded by one bad account; this is bounded only by GitHub/Vercel account security. Bundle
   signing needs a Mac day; 2FA + branch protection do not.
2. `CLAUDE.md` is public and is the best attack guide this app will ever have (see the entry below).
3. **"Any valid token" is the only gate on server-side spend** and the next endpoint will inherit
   the shape. One shared `withUser(req)` helper that verifies AND meters would make it structural.
4. **Rendering a server-supplied URL** was done at seven independent sites with no shared validator
   — the N-copies class in URL form. `safeMediaSrc` exists now; use it for video/second-photo too.
5. `appUrlOpen` never checks the host — harmless while the only scheme is the AASA-bound universal
   link, and a hole the moment a custom `seshd://` scheme is added (Sign in with Apple, a widget).
6. **PostHog is one env var from being on and its defaults are unsafe here** — `autocapture` sends
   the text of every tapped element (DM bubbles, captions, notes). Set `autocapture:false` in the
   init object now so flipping the key later cannot regress privacy.

## ★★★ THE REPO IS PUBLIC, AND IT HELD A LIVE PASSWORD (Sep 1) — credential hygiene rules
A three-way Fable 5.1 security audit found this and it is the most serious thing in the sweep.
`moproblems49/spotr` is **`"visibility": "public"`** (checked via the GitHub API, not assumed), and
`CLAUDE.md`, `appstore-submission.md`, `mac-day-guide.md` and `submission-day-guide.md` all carried
the App Review demo login — email AND password — in plain text. The account is live: it has signed
in, owns a group, has 2 public posts, and had **7 sessions open, none of which expire**. Anyone on
the internet could read the password, sign in, post to the public feed, DM every user, change the
password to lock Mo out before the next review, and spend the Anthropic key through `/api/ai`
(which gates on "any valid token" and has no quota).
**Scrubbed from the working tree the moment it was confirmed — but a scrub is NOT the fix.** Git
history still contains it, and a public repo's history is trivially readable. **The fix is
ROTATION**, which is Mo-side (Supabase dashboard). Until the password is rotated, treat that
account as compromised.
**Standing rules from here:**
- **`CLAUDE.md` IS A PUBLIC DOCUMENT.** It is also the best attack guide this app will ever have —
  it names every guard's blind spot, every deliberate SECURITY DEFINER, and the exact rate-limit
  numbers. Nothing in it may be *actionable without an account*: no passwords, no tokens, no
  service keys. Project refs and the anon key are fine (both are public by design).
- **The same applies to `build/*.mjs` fixtures**, which carry real user UUIDs, and to the guides.
- **A credential must live in exactly one place, and it is never the repo.** The review login
  belongs in App Store Connect's review-notes field only.
- `supabase/.temp/` is now gitignored and untracked (CLI scratch state — project ref and pooler
  HOST, no credential in it, verified before untracking).
**If the repo is made private later, this rule stays**: history is already public, and a private
repo still gets cloned onto laptops.

## ★★ THE PERSISTENCE CLUSTER (Sep 1) — the reorder, and two EXEMPTIONS that were simply untrue
Mo: "finish the remaining list." Three more "looked saved but wasn't" bugs, then a Fable 5
cold-context audit that found four defects — two of them in the fix, one of which could ERASE the
thing it was meant to save. Nothing reached a phone until the audit had reported.
- **★ REORDERING THE PROGRAM LIST was a bare `setStore`**, and the query behind it is
  `order=created_at.desc`, so the drag was undone by the next foreground every time. The order now
  lives on `profiles.program_order` (jsonb array of ids). **An array on the profile rather than a
  `sort_order` column on `programs`, deliberately**: a drag moves every row between the two
  indices, so a per-row column means N writes for one gesture, while this is ONE atomic PATCH that
  the durable queue already retries. `orderProgramsBy` is the one definition and is tolerant in
  BOTH directions — an unmentioned id keeps its query position AFTER the ordered ones (a program
  created on another device still appears), a stale id finds no row, a duplicate is consumed once,
  and ids compare as strings. This is a display preference and **must never be able to hide a
  program**. Not added to `public_profiles` (which lists its columns explicitly).
- **★ `custom_exercises` AND `body_log` WERE EXEMPT IN `sim_settingsrace` ON REASONS THAT WERE NOT
  TRUE, AND AN EXEMPTION IS ONLY AS GOOD AS ITS JUSTIFICATION.** "list edits are additive" stopped
  being true the day Settings grew Remove and Clear-all; "append-only log" was never true (an entry
  REPLACES the existing one for its date). The custom-exercise one is the worse: `loadUserData`
  UNIONS local with server, so a refresh landing before the PATCH **resurrects the exercise you
  just deleted**, and the next persist writes it back — the removal permanently fails, which is
  worse than a toggle flipping back. Both are in the recent branch now and both exemptions are
  DELETED, so the guard enforces the fix instead of excusing it. **When a guard is green because of
  an exemption, re-read the exemption's reason before trusting the green.**
- **`markSettingsEdit()` exists because a lazy module cannot assign the module-level `let`** — an
  ESM import binding is read-only from the importing side, the same trap the `_discoverSubTab`
  getter/setter pair exists for.
**★★ THE FABLE AUDIT THEN FOUND FOUR, AND TWO WERE MINE:**
- **★ `nextOrder` WAS CAPTURED BY A SIDE EFFECT INSIDE A `setStore` UPDATER, AND REACT DOES NOT
  ALWAYS RUN THAT UPDATER EAGERLY.** It only does so when the hook's fiber has no pending update —
  and this store's fiber takes interval-driven ones (the message poll, the feed refresh, the health
  sync). Measured against the repo's own React 19.2.5: with any prior update pending, the captured
  value was `[]`, so the PATCH would send `program_order: []` and **erase the saved order**,
  silently, because the local render is still correct and the loss only shows on a later
  foreground. The handler already held `arr`/`oldIndex`/`newIndex`, so the fix was to compute the
  new order OUTSIDE the updater. **The identical shape at the custom-exercise Remove is
  PRE-EXISTING and worse — an empty capture there PATCHes `custom_exercises: []`, wiping every
  custom exercise and stripping the muscle mapping from every past workout that used one** — fixed
  in the same pass by deriving from `store.customExercises`.
- **★ THE 20s GUARD PROTECTED A KEY NOTHING READS.** `programOrder` was in the recent branch and
  correctly ordered, but `programs` is what the list RENDERS, it is assigned unconditionally, and
  it was ordered from `me.program_order` alone — so a refresh inside the window re-served the stale
  order and the list visibly reverted under the user. **The `bodyType` scar one level removed: the
  field was mentioned in the guard and the mention did not govern what was drawn.** Ordering now
  comes from the EFFECTIVE order (`recentEdit ? prev.programOrder : serverProgramOrder`).
- **The automatic Apple Health weight import was stamping `markSettingsEdit()`**, and the stamp is
  GLOBAL — for 20s it makes `loadUserData` trust the local copy of theme, unit, notificationPrefs,
  customExercises, bodyLog and programOrder. So on any morning-with-a-new-weigh-in boot, a settings
  change made on another device was ignored by exactly the load that should deliver it. Unstamped:
  the import is idempotent and already durable, so it needs no window. **A stamp that means "the
  user just changed a setting" must not be set by something the user did not do.**
- **`sim_settingsrace` read `src/App.jsx` ONLY**, so the lazy screens' `profiles` writes were
  outside its reach — deleting BodyTrackingScreen's stamp left the entire battery green. It sweeps
  `jsxFiles()` now. Its stamp counter was also off by one in the vacuous-pass direction (the
  helper's definition line matches both regexes).
**Sim: `pw_reorderpersist`** (16 checks) + `sim_settingsrace` section 5. Red-proofed individually.
**★ AND THREE OF ITS OWN CHECKS WERE VACUOUS BEFORE THEY WERE REAL, EACH A DOCUMENTED TRAP:**
the first red-proof reverted `src/App.jsx` alone, which then **did not COMPILE** (BodyTrackingScreen
imports `markSettingsEdit`), so the confident failures were a stale bundle rather than a red proof —
**a red-proof build that fails is not a red proof; check the build succeeded**; the custom-exercise
check passed on BOTH builds until it waited out the **30s foreground-refresh throttle**, since
`visibilitychange` inside that window is a no-op (the `pw_switch` trap again, and note the 30s
throttle and the 20s edit window must be lined up deliberately: wait the throttle out BEFORE the
edit); and the revert check passed on the broken code because the fixture **omitted**
`program_order` from the stubbed profile, so the effective-order lookup fell back to the local copy
and hid the bug — *a fixture that is accidentally right because of what it omits is a future
misdiagnosis*. Each now carries a `[control]` assertion that the refresh actually ran.
**★ AND THE BATTERY CAUGHT WHAT A STANDALONE RUN COULD NOT: `jsxFiles()` RETURNS REPO-RELATIVE
PATHS.** `sim_settingsrace` passed from the repo root and failed inside `run_sims` with
`ENOENT src/lazy/AICoachModal.jsx`, because the runner uses its own cwd. Join onto `ROOT`; **a
guard that only works from one working directory is a guard that will silently stop running.**

## ★★ THE HEALTH ENGINE REOPENED FOR THREE GAPS (Sep 1) — and two of the five "findings" were false
Mo asked for this cluster. The engine has been CLOSED since Aug 8 for good reason (rounds 5-6 of
that era were fixing regressions from rounds 4-5), so every finding was MEASURED before it was
believed and every fix red-proofed on its own. **Two did not survive that.**
- **★ SPLIT ACTIVITY FRESHNESS SPLIT THE HEADLINE FROM THE CURVE BY 14 POINTS.** `store.activity`
  (daily totals) and `store.activityHourly` (hour buckets) come from SEPARATE HealthKit reads with
  SEPARATE date stamps, and `readHourlyActivity` returns null on its own if every dataType spelling
  fails — so "totals are today's, buckets are yesterday's" is reachable. In that state
  `activityRawSinceWake` returns null, the HEADLINE falls back to whole-day totals, and the CURVE
  charged **nothing at all**. Measured on a 13k-step day read at 18:00: headline 69, curve 83,
  which the endpoint pin then draws across a few pixels — the exact symptom rounds 4-7 kept
  closing, via a path nobody had tested. Fixed with ONE shared `wholeDayActivityRaw` plus a curve
  branch that spreads the headline's own figure across today's elapsed waking hours. Gap 14 -> 1,
  and the both-fresh case is byte-identical. **The safety property is what made this reopenable:
  the new branch runs ONLY where the curve previously did nothing, so every fresh-bucket fixture
  in the battery is untouched by construction.** This is NOT the smear the headline's rest walk was
  fixed for — there, spreading changed the rest-recharge credit and so the total; here rest
  recharge is already gated off by the same staleness, so it only redistributes drain the headline
  has already decided on.
- **★ A MISSING RESTING-HR READING RAISED THE SCORE — the HRV ceiling's sibling never got it.**
  The "unknown signal is ceilinged at what a typical one would have produced" guard was written for
  HRV only. Measured: everything exactly at baseline, a COMPLETE read scored **0.80** and the same
  day with RHR missing scored **0.82**. The bad direction is worse than the tidy one — a genuinely
  elevated resting pulse (66 against a 55 baseline, the classic coming-down-with-something signal)
  scores **0.62**, and the same day with that one reading missing scored **0.82**: a failed sensor
  read turned a back-off day into a better-than-normal one. Both ceilings are now accumulated into
  ONE bound so a read missing BOTH heart signals is held to what both-typical would have scored,
  rather than to the looser of two independent bounds; the HRV-only case is arithmetically
  unchanged. The floor is untouched — 0.62 is still 0.62. Textbook "one guard that didn't get
  copied", this time in the health maths.
- **★ `store.recovery` NEVER EXPIRED, AND `capturedAt` — WRITTEN FOR EXACTLY THIS — HAD ZERO
  READERS.** It is only ever overwritten by a SUCCESSFUL read (`recovery: rec || p.recovery`), so a
  watch that dies, sits on the charger or loses its permission leaves last week's HRV, pulse and
  sleep driving charge0, the muscle map's colour and the headline, with nothing on screen saying
  the data is old. The engine already had an honest answer for "no signal at all" (charge0
  estimated from training recency) and it could never be reached. `freshRecovery(store, now)` gates
  at **36h**, matching `readRecoveryFrom`'s own read window — a snapshot older than the window it
  was drawn from cannot correspond to any night a fresh read would find. **A snapshot with NO
  `capturedAt` is treated as FRESH on purpose**: that is exactly today's behaviour, so shipping the
  guard cannot blank the number for anyone holding a pre-`capturedAt` snapshot, and it tightens as
  new snapshots land rather than changing what anyone sees the day it ships. (`sim_bbmatch`'s
  fixture has no `capturedAt`, which is what proves the backward-compatible path is live.)
- **FALSE FINDING 1: `muscleReadiness` is NOT missing a unit conversion.** The one place it compares
  a weight (`topW` against the lbs-held `store.prs`) converts correctly via `topLbs`; everything
  else it accumulates is a SET COUNT, which is unitless. Nothing to fix.
- **FALSE FINDING 2: `weekKeyFor` has NO DST collision.** Swept three years of days across nine
  zones including four with MIDNIGHT DST transitions (Santiago, Havana, Asuncion, Beirut): zero
  malformed weeks, zero misfiled days. Local date-component arithmetic normalises correctly and
  `dateKeyOf` reads local parts, so the pair is sound. The predicted March-2029 collision does not
  exist.
**Sim: `sim_bbstale`** (22 checks). Red-proofed at **6 failures** with every control green — the
gap measured 14 on the old code, exactly matching the independent probe. It compares the
SECOND-to-last curve point on purpose: the last is pinned to the headline by construction, so
measuring through it can only ever report agreement.
**★★ AND THE COLD-CONTEXT AUDIT — RUN BEFORE PUBLISHING, WHICH IS THE WHOLE POINT OF THAT RULE —
FOUND FOUR MORE, THREE OF THEM IN THE FIX ITSELF.** The bundle was held; none of these reached a
phone. All four are now fixed and pinned by `sim_bbstale` section 4, which could see NONE of them
before (it used `history: {}`, only `activityHourlyDate = YEST`, and only a today-07:00 wake).
- **`damp` was not the headline's damp.** The curve damps activity by 0.6 when `sessions.length`,
  but `sessions` spans up to three date keys filtered only by `endMs <= now`, while the headline's
  `workoutDrain` counts ONLY sessions since wake. So a workout YESTERDAY EVENING — or one before
  this morning's wake, or one outside the 24h window that is never drawn — made the curve damp
  when the headline did not: measured 6 points high, all day, flattering. **The block FOUR LINES
  ABOVE already had `sessions.filter(x => x.endMs >= wakeMs)` with a comment describing this exact
  bug for the workout scale; `damp` never got it.** One-guard-didn't-get-copied, inside a single
  function. Inherited on the fresh path, but the commit hoisted `damp` specifically to share it
  and asserted it matched the headline — it did not.
- **The new branch was gated on the DATE STAMP, the headline on the DATA.** `activityHourlyDate ===
  today` is a PROXY for "the buckets are usable"; the headline's real test is
  `activityRawSinceWake(...) != null`, which is also null when the buckets exist but are EMPTY —
  and `readHourlyActivity` genuinely returns 24 all-zero buckets stamped TODAY when `gotAny` was
  set by `prevEvening` alone. In that state the split was still 15 points. One `hourlyUsable`
  predicate now serves both the per-hour branch and the fallback. **Proxies break — this is the
  `isDark` lesson in a third costume.**
- **The hour that STRADDLES MIDNIGHT was dropped whole.** The branch was gated on the hour's START
  being today, which discarded its today-half too. Measured on a night-shift shape (trusted wake
  yesterday 23:40, read 01:30): that segment fell **1** point instead of **7**, i.e. only awake
  drain. Clamping `from` to today's midnight — exactly the window `elapsedH` measures — makes the
  spread sum to the headline BY CONSTRUCTION rather than by hope.
- **`muscleReadiness` never got the freshness gate**, so gating charge0 made ONE SHEET contradict
  itself: the headline correctly fell back to the training-recency estimate while the driver tiles
  beside it still printed a week-old HRV under the words "Today's pulse", and the muscle map stayed
  coloured by the stale score. **A partial fix here is worse than no fix** — before, the screen was
  wrong but consistent. `freshRecovery` MOVED TO `core.js` for this: `strength.js` must never import
  `health.js` (the extractor asserts that layering) and core is the leaf both already import.
**Probe lessons from chasing these, all mine:** comparing headline to the SECOND-to-last curve
point is right at midday and meaningless pre-dawn, where the last two points can be 50 minutes
apart and the tail spans a phase boundary — three separate "gaps" I measured that way were the
curve's own slope, not a disagreement. What settled it was isolating ONE segment and diffing it
against a bundle with only that fix reverted. **When a measurement disagrees with the arithmetic,
suspect the measurement first.**
**The lesson that repeats: 2 of 5 findings were wrong, and only measuring told them apart.** Same
hit rate as the design-critique era, where two of the three findings worth acting on turned out to
be false. An audit finding is a claim, not a result.

## ★★★ THE SILENT-FAILURE CLUSTER (Sep 1) — four writes that reported success they never earned
Mo picked this off the audit list: "a 'saved!' message for something that didn't save is exactly
how someone loses a program." Four sites shared ONE shape — an optimistic `setStore`, a server
write whose failure was discarded (an empty `catch`, or a bare `fetch` whose `res.ok` was never
read), and no way for the user to find out. That is the dominant bug class in this app wearing a
new hat: `loadUserData` REPLACES 28 store keys wholesale on every boot and foreground, so a
local-only change looks perfectly saved, survives a tab switch, and is gone on the next launch.
- **★ THE GUEST MIGRATION TOLD PEOPLE THEIR WORKOUTS WERE SAVED WHILE DELETING THEM.** Every
  per-row upload in `migrateGuestData` caught its own error into `devError` and carried on, so a
  run where the `workout_history` POSTs were refused still cleared `seshd_guest` and toasted
  **"Your progress is saved to your account."** The data was not merely un-uploaded: the next
  foreground replaced `history` with the server's shorter list, so the refused sessions were gone
  from the PHONE too. Now: a `failedRows` count, ONE retry pass (the upsert is idempotent on `id`,
  so re-sending a row that landed is a no-op and the dominant failure here is transient), and a
  toast that names the shortfall. **Keeping `seshd_guest` set to force a retry was considered and
  is WRONG** — `isGuest` initialises from that flag, so the next launch would boot as a guest
  despite holding a real session. The retry belongs in the durable write queue, not in the flag.
- **★ `queueWrite` REFUSED EVERY POST, SO SEVEN CALL SITES THAT LOOKED DURABLE WERE ONE-SHOT.**
  The exclusion is right in general (replaying a POST can double-insert) and wrong for a POST whose
  URL names an `on_conflict` target — that is an UPSERT, exactly as safe to replay as a PATCH.
  Callers opt in with `idempotent: true` rather than the queue sniffing the URL, so the guarantee
  is asserted by whoever knows it holds.
  **CORRECTION, and the commit message overclaimed it: only ONE call site opted in** (the guest
  migration's history retry). The six `personal_records?on_conflict=user_id,exercise_name` POSTs
  still degrade to a one-shot `query()` offline, exactly as before — the mechanism is fixed, the
  call sites are not. Do not convert them without reading the next bullet first.
- **★★ AND WIDENING THAT MECHANISM SHIPPED A WORSE BUG THAN THE ONE IT FIXED — FOUND BY THE
  COLD-CONTEXT AUDIT, AFTER IT WAS ALREADY LIVE.** The queue dedupes on `path + method`, which
  identifies a ROW only for PATCH/DELETE/PUT: those carry a row selector in the URL
  (`programs?id=eq.X`), so two rows are two paths. **A queued POST's path is the TABLE plus its
  conflict target and is IDENTICAL for every row — the row id lives in the BODY** — so the moment
  POSTs were allowed in, each one evicted its predecessor. Measured through the real UI: a guest
  with 6 workouts signing up OFFLINE queued **1 of 6**; at 55 workouts, 54 are lost. And because
  `queueWrite` resolves gracefully, `failedRows` stayed 0, so the honest toast never fired and the
  user was told "Your progress is saved to your account" — **the exact bug the opt-in was added to
  fix, reproduced by the mechanism that fixed it.** POSTs are never deduped now.
  **Why the guard could not see it: `pw_silentfail` §5 refuses with a 403, which the durable queue
  correctly DECLINES, so the whole offline path — the one where the queue actually takes ownership
  — was untested.** A refusal and a dropped connection are different code paths in this app and a
  guard that only drives one is blind to the other by construction. §7 drives the offline path now
  and goes red at "queued 1 of 6".
- **★ AND THE "ONLY THE CREATOR CAN CHANGE WHO'S IN IT" MESSAGE WAS WRONG EVERY TIME IT COULD
  APPEAR.** It was selected by ROLE (`createdBy !== currentUserId`) rather than by what the server
  answered. Two facts kill that: `enforce_group_creator_manages` explicitly PERMITS a non-creator's
  leave (its own exception text is "members may only leave"), and a non-creator cannot reach the
  invite UI at all — `GroupDetail` gates the whole block on `currentUserId === g.createdBy`. So the
  only membership write a non-creator can produce is a leave, which the server allows, meaning the
  role branch fired **only when the real cause was a dead connection** — telling a member they were
  not allowed to leave a group they are always allowed to leave. It branches on `status === 403`
  now. **The general rule: report the cause the SERVER gave, never the cause you inferred from who
  the caller is** — and read the actual trigger definition rather than this file's summary of it,
  which is how the wrong inference got made.
- **The `_silent` program save fired one PATCH and gave up**, so a rest tweak, a day reorder or an
  exercise added from the day-preview sheet was lost outright when offline or on a dead token —
  while `handleProgramEdited`, ten lines below it, already had the durable pattern. Same rule as
  the duplicated-formula class: when two paths do the same job, the copy is where the bug lives.
- **`createGroup` left a refused group in the list holding a LOCAL `uid()` id**, and that is worse
  than one broken group: the unread-dot query splices those ids into an `in.()` on a uuid column,
  so a single failed create 22P02'd the WHOLE query and killed the dot for every group. Rolls back
  now — and `isServerId` stays, because it covers the in-flight window the rollback cannot.
- **`updateGroupMembers` is refused by a real DB guard and could not tell.**
  `enforce_group_creator_manages` only lets the CREATOR rewrite `member_ids`, and a bare `fetch`
  RESOLVES on 4xx straight past an empty catch — so a non-creator adding someone saw them appear
  and vanish on the next foreground. Reverts and names the reason.
**Sim: `pw_silentfail`** (5 sections, 20 checks). Red-proofed at **7 failures** on the group/program
half and **3** on the migration half, with the `[control]` section and every reachability check
staying green — which is what distinguishes a real failure from a broken fixture.
**★ AND ITS FIRST DRAFT PASSED VACUOUSLY IN TWO DIFFERENT WAYS, BOTH ALREADY IN THIS FILE.**
Sections 3 and 4 seeded the group and the program into `localStorage` only, so `loadUserData`
replaced both wholesale and the checks reported "the group is not on screen" and an empty write
queue — blaming the app for a FIXTURE gap (seed through the STUB). Then the leave-confirm selector
was `/^(Leave|Leave Group|Confirm)$/`, which matched the page's own "Leave Group" button underneath
the sheet, so the confirm never fired, nothing happened, and **"a refused leave does NOT drop the
member" passed because the flow never ran.** Both fixed, and section 3 now asserts a server write
was ATTEMPTED before believing anything about the rollback. A check satisfied by the flow never
running is worth nothing.

## ★★ THE OTA BUNDLE WAS 74% ART THE PHONE NEVER OPENS (Sep 1)
Measured, not guessed: of a 1,898 kB bundle, **1,414 kB was image files nothing in the app loads.**
`npm run build` copies `public/` into `dist/`, and the zip is made from `dist/`, so every PWA
manifest icon, the apple-touch-icon, the 752 kB App Store 1024 and the 192 kB OG image rode along
to every phone on every update. The native shell loads exactly ONE image from `public/`:
`icon-192.png`, which `SeshdLogo` renders and the notification payload names. Everything else there
is browser and crawler furniture.
The publish recipe now excludes them (`-x` list in `api/app-update.js`, with `bundles/*` folded in
so the nested-zip trap is structural rather than a remembered step). **1,898 kB -> 485 kB.** The web
deploy is untouched and still serves all of it.
**★ THE RISK OF AN EXCLUDE LIST IS EXCLUDING SOMETHING THE APP NEEDS, WHICH 404s ON DEVICE WHERE
NOTHING HERE WOULD SEE IT — so `build/ota_assets_check.mjs` asserts BOTH halves**: every asset the
BUILT output references is present, the web-only art is absent, and there is no nested zip.
Red-proofed both ways (the fat bundle fails the exclusion half; a bundle with `icon-192.png` deleted
fails the safety half). It reads the BUILT output rather than the source because **rolldown emits
string literals in BACKTICKS** — a grep for `"/icon-192.png"` with double quotes finds nothing and
reports a clean bill for a bundle that is missing the file. That exact mistake was made twice in
one session, once on this and once when checking whether a fix had reached a shipped bundle.
**★ AND THE GUARD IMMEDIATELY CAUGHT A MISTAKE I MADE WHILE WRITING IT.** `og-image.png` and
`favicon.svg` were both referenced by NOTHING, so I wired both into `index.html` — OG tags for link
previews (real value now the app is public) and a `<link rel="icon">`. The boot test then showed
**`404 /favicon.svg` on every launch**, because the link makes the app request a file the `-x` list
excludes. A native WebView has no tab to draw a favicon in, so the link bought nothing and cost a
request per launch. OG tags kept, favicon link reverted. **Wiring up an unreferenced asset and
excluding it from the bundle are opposite decisions — make one or the other, not both.**

## ★ A MISSING PROFILE ROW WAS RESETTING FOUR SETTINGS TO THEIR DEFAULTS (Aug 31)
Found as an aside by the theme audit, fixed on Mo's say-so. `loadUserData` rebuilt the settings
block with `me?.x || <constant>`, so whenever the user's own `profiles` row came back ABSENT — an
empty response, a failed fetch, an RLS refusal — the constant won and the user's choice was thrown
away. Not one field: **four**. `theme` is the visible one (the whole app flips back to light),
`unit` is the dangerous one (every number on screen changes meaning without the user touching
anything), `defaultRestTime` silently returns to 120s, and `notificationPrefs` re-enabled four
toggles the user had turned OFF.
**This is NOT the `_lastSettingsEditAt` race** that `pw_switch` `[race]` already covers — that
guards a 20-second window right after an edit, while this fires whenever the row is missing,
however old the edit. Same "one guard that didn't get copied" shape as the sign-out audit:
`strengthSex` and `bodyType`, two blocks further down the SAME object literal, already carried the
`prev.`-fallback and these four never got it. The `prev.currentUserId === currentUserId` check in
the fix is load-bearing rather than decoration — it is what stops one account's settings leaking
into the next one on a shared phone.
`notificationPrefs` layers defaults -> local -> server so the server still wins per key when it
HAS one; the other three are `me?.x || (sameUser ? prev.x : null) || <constant>`.
Sim: **`pw_settingsreset`**, which answers the profiles GET with `[]` and asserts all four survive,
plus a fifth check that the app is still PAINTED in the chosen theme — a store value that never
reaches the paint would be a pass on paper and a light-themed app on screen. It carries a CONTROL
case (row present, settings agree) so a broken fixture shows up as a red control rather than as a
false pass. Red-proofed: control green, all five red on the old code, naming the exact values
(theme=light, unit=lbs, rest=120, messages=true, painted rgb(246,245,243) vs midnight's rgb(10,12,18)).
**`build/` IS GITIGNORED** — the 129 files in it are tracked only because they were `git add -f`'d.
A new sim that is merely `git add`ed is invisible to git and vanishes on the next container
recycle, which is exactly how the original battery was lost. Force-add every new one.

## ★ The demo personas are GONE, and the group hand-over trigger got its first real workout (Aug 31)
Mo's call once review cleared. Deleted: `maya@`, `jordan@`, `tess@`, `sam@`, `coachkai@` — five
content personas, via `delete from auth.users where email like '%@getseshd.app' and email <>
'appreview@getseshd.app'`. **`seshdreview` (appreview@) was deliberately KEPT and was never in the
question Mo answered**: any future native change needs a new review, and that needs a demo login
with a populated app. It still has 2 posts / 29 workouts / 21 PRs, so its own History, charts and
muscle map still demo correctly.
**Blast radius, measured BEFORE deleting rather than after** (this is the step worth copying):
34 posts, 135 workout_history rows, 21 PRs, 10 group posts, 36 follows, 7 DMs, 10 kudos,
2 comments, 1 group. Crucially **zero persona kudos or comments sat on Mo's posts**, so his own
content lost nothing — his 21 kudos and 80 posts are untouched. Zero storage objects, because the
persona avatars were always inline SVG data-URIs. Backup: `persona_wipe_backup_20260831`
(266 rows, every affected row as jsonb, RLS on with no policy).
**★ `trg_transfer_groups_on_profile_delete` handled a CHAIN correctly on its first real use.**
"Seshd Crew" was created by coach_kai with 6 members, five of whom were being deleted in the same
statement. The trigger fires per-row BEFORE DELETE, so it handed the group along the chain as each
heir was itself deleted, and landed on `seshdreview` — the last live member. Verified after:
**orphaned member_ids 0**, orphaned posts/workouts/group_posts/follows/kudos all 0. That is the
invariant the Aug-29 work added to the sweep, and it held under the hardest input it will ever get.
Mo is not a member of that group and never was, so it is now a one-member group owned by the review
account; harmless, and useful if a future reviewer wants to see the groups feature.
**Also dropped, same day:** `demo_shift_backup_20260828`, `sharecode_rotation_backup_20260828`,
`orphan_image_backup_20260829` — all past the window they insured. The two `..._20260830` tables
are kept as the rollback path for the last demo shift; they are now the only thing that shift is
recoverable from, and the corpus they cover no longer exists, so they can go whenever.

## ★★★ APP REVIEW CLEARED (Mo, Aug 31 2026)
The long-standing blocker is gone. What that unblocks, and what it does NOT:
- **The pre-submission checklist below is now history**, not a to-do. Keep it for the next
  submission (a native change still needs a Mac day + a new review).
- **The demo corpus re-dating treadmill loses its original justification.** It existed so a
  reviewer opening the app saw a live feed; the reviewer is gone. It still needs a shift every
  ~3-4 days or the personas' muscle maps empty out — so this is now a product decision (keep and
  keep shifting / keep and let them go stale / wipe them), NOT maintenance to do by reflex. Ask
  before shifting again. Wipe recipe if chosen: delete `auth.users` rows with `%@getseshd.app`
  emails; profiles/posts/history cascade.
- **DMARC IS NOW `p=quarantine` — DONE Aug 31 2026, and the inferred safety argument was
  CONFIRMED first.** Mo checked the raw headers of a real Seshd email and saw `dmarc=pass`, which
  is the evidence this file kept asking for (the alignment had only ever been reasoned from the DNS
  layout). Live record: `_dmarc.getseshd.app` = `v=DMARC1; p=quarantine;`. Deliberately NO `rua=`:
  it needs a report-service address, the reports are raw XML, and publishing a personal address in
  DNS gets it harvested — add one via dmarcian/Postmark's free tier if reporting is ever wanted.
  `p=reject` is the remaining optional step; quarantine is most of the protection and, unlike
  reject, a false positive lands in spam where a user can still find it, which matters because
  password resets are the one mail that must arrive.
- **`getseshd.app` NOW RECEIVES MAIL.** It had no MX at all, so anyone replying to a Seshd email
  got a bounce. ImprovMX free forwarding (`mx1`/`mx2.improvmx.com`, priority 10/20, catch-all `*`
  alias) forwards everything at the domain to Mo's Gmail. No root SPF was added and none is needed
  — that is only required to SEND through ImprovMX; sending still goes through Resend on
  `send.getseshd.app`, which is a separate branch and untouched by any of this. DNS is hosted at
  **Vercel** (ns1/ns2.vercel-dns.com), not the registrar — that is where these records live.
- **Leaked-password protection is unchanged** — still a paid-plan feature.
- **The backup tables are NOT a size problem and never were.** Measured Aug 31: five tables
  totalling ~120 kB against a 5.5 MB schema (`tbar_fix_backup_20260819` was already dropped, so the
  earlier "six" was wrong). The only real cost is five advisor INFO notices. Drop them for
  tidiness, not for space — and note the two `..._20260830` ones are insurance for a shift that may
  still be re-run.

**⚠️ PRE-APP-STORE-SUBMISSION CHECKLIST (do these the day Mo says "submit"):**
(1) ~~Remove the tiny `d1 ·` boot-diagnostic line from the sign-in screen~~ — **DONE** (Aug 8,
bundle `2026-07-31l`). `setBootDiag`/`setSaveDiag` still WRITE `seshd_boot_diag` / `seshd_kc_save`
deliberately — invisible, free, and the only way to diagnose a boot that lands on the auth screen.
`pw_authdiag` asserts the readout stays gone (it seeds both keys so a survivor shows up loudly
rather than rendering blank and passing).
(2) App Review notes + demo accounts are already prepared in `appstore-submission.md`
(demo login `appreview@getseshd.app` (password NOT stored in this repo — it lives in App Store Connect's review notes only; see the credential-hygiene entry in CLAUDE.md)).
(3) **RE-DATE THE DEMO CORPUS.** The five personas' posts and workouts go stale on a clock, and a
reviewer opening a feed whose newest post is three weeks old sees an abandoned app. Last shifted
**Aug 28 (+6 days, mid-review)** — with the review pending, the reviewer's own demo account had
drifted to the very edge of the 7-day muscle-map window, i.e. an empty "Muscles Trained" on the
account named in the review notes. Method notes that survive to the next shift: pick the offset so
`max(existing timestamp) + offset < now()` (a +6d was safe where +7d was not); `workout_history`
has BOTH `created_at` and `workout_date` — shift both; `group_posts` is guarded by
`trg_enforce_group_post_author_edit`, so act AS each author via `set_config('request.jwt.claims',…)`
in a DO loop (the documented tbar method), never by disabling the trigger; shift MESSAGES only
where BOTH parties are personas (a persona DM to a real user is part of a real conversation); and
the trap that produced two fix-ups this time — **a persona kudos on a RECENT REAL post goes FUTURE
under the shift, and "restore it from backup" is the wrong fix when its POST also shifted** (the
restore re-created kudos-before-post): the correct placement is the `[post.created_at, now())`
window. Verify after, DATABASE-WIDE not persona-scoped: nothing future-dated in any shifted table,
no comment or kudos earlier than its post. Backup: `demo_shift_backup_20260828` (249 rows — drop
it once review clears). pr_events/personal_records deliberately NOT shifted: not on the
reviewer-visible path, and touching `updated_at` re-opens the 57-PRs class.

**OPEN, as of Aug 16 2026 (agreed with Mo):**
- **THE ONE BLOCKER IS A MAC REBUILD.** Everything since the archived TestFlight build ships in the
  web bundle, so a `git pull && npm install && npm run build && npx cap sync ios` + archive picks it
  all up. Follow `submission-day-guide.md`.
- **Multi-photo posts are DEFERRED, deliberately.** A workout post carries exactly ONE photo, and
  `posts.image_url` / `group_posts.image_url` are single `text` columns. A second slot means a
  schema change, a carousel in PostCard and every group/feed reader, and multi-select in the picker
  — days of work touching every existing post. Ship one, see whether anyone asks for two.
- **The health engine is CLOSED (Mo, Aug 8).** Seven audit rounds; rounds 5-6 were fixing
  regressions from rounds 4-5. Don't reopen it without a specific reported symptom. One known,
  deliberate limit remains: when activity runs straight through the estimated night (03:00-07:00,
  no watch) the bedtime gate consumes those steps first and the chart under-draws — the headline
  is right and the endpoint pin absorbs it, same as it always did.
- **The visual work is CLOSED (Mo, Aug 9).** The lime pass and the post card finally got their
  independent look — a cold-context audit screenshotted the PR badge, top bar, rest bar and
  Discover cards in both themes. It found one real miss (History showed two PR badge forms on the
  same card, and in light theme the older one read as a disabled button) plus the rest bar's
  theme-dependent accent ring; both fixed. Mo reviewed the three remaining taste calls and rules
  the light-theme PR green and the exercise-detail PR tile FINE as they are. Do not reopen either
  without a new reported symptom.
- **The rest of the "make it feel less AI-generated" critique**: the post header, `PRTag`, set
  ledger and (Aug 17) the three repeated empty states are done; **less containment (fewer rounded
  cards) and a typography pass are still deliberately DEFERRED** — Mo's own call, to be discussed
  further before touching it, since it's the highest-risk piece (broad inline-style changes across
  a 25k-line single file with no CSS layer). The item to ignore in that critique is "add one or two
  deliberate imperfections" — brand quirks are a consequence of solving a specific problem a
  specific way, not a decoration you add on purpose.
- **THREE UNRELATED SCREENS SHARING ONE EMPTY-STATE TEMPLATE IS THE TELL, NOT ANY ONE INSTANCE OF
  IT.** A design critique screenshotted the real app and found the Workout tab's "Start your first
  program", Discover's "Find your crew" and the profile's muscle-balance block all used the
  identical recipe — centered icon-in-a-rounded-square, bold headline, muted subtext, one button —
  which is the single most recognizable "assembled from a component kit" signal in the whole app.
  Fixed by making all three DIFFERENT, deliberately: the Workout tab's card is now a left-aligned
  header row with inline actions sitting directly under Quick Start (it was competing with Quick
  Start as a second "start something" card, not just visually generic); Discover's dropped the icon
  entirely — it was a literal duplicate of the Groups tile's icon two rows above it — and replaced
  a passive sentence with a real "Share your profile" button wired to the same share flow the
  profile screen's own button uses; the profile's previews the actual feature (five colored,
  labeled bars, dimmed) instead of an unrelated floating paragraph. **When a generic-empty-state
  finding covers multiple screens, don't reskin the same template three times — give each one a
  construction that fits what's actually underneath it.** Also fixed in the same pass: the
  Discover "Friends Activity"/"Groups" tiles showed a static caption ("Weekly stats" / "Private
  crews") forever; they now show the real count once there's one to show. Sim: `pw_emptystates`.
- ~~NOT YET CONFIRMED ON DEVICE: the hold-to-reorder fix~~ — **CONFIRMED FIXED ON DEVICE** (Mo,
  Aug 16). The day editor's drag handle was `pan-y`, which hands WebKit the vertical axis; the
  symptom was iOS-only and could not be reproduced in Chromium at all. Worth remembering as the
  worked example of a reasoned-not-observed fix that turned out right — and of why `pw_reorder`
  now asserts the computed `touch-action` PROPERTY rather than trying to drive the gesture.

**PARKED IDEAS (not scheduled — raise them when the moment fits):**
- **Naps should count toward the Body Battery recharge** (Mo parked this Aug 1, from the Garmin
  comparison). `pickSleepBlock()` deliberately picks ONE main block and discards anything under
  `MIN_MAIN_SLEEP_H` (2.5h), so a real afternoon nap is thrown away — Garmin credits it. The
  ingredients exist: the sleep samples are already read and `stageMinutes()` can score a short
  block. The care needed is in NOT double-counting it against the daytime `restfulHourRecharge`
  (a nap hour is also a still hour), and in not letting a 20-minute doze read as recovery.
- **Recovery time advisor** ("22 hours until recovered", Garmin-style). Computable today from
  `sessionDrain` + `recoveryScore`; skipped in the Aug 1 round to avoid adding a fourth number to
  a screen that had just been decluttered.
- **Trainer tier (paid).** A client list in the Workout tab; tap a client to see their workouts and
  weights. Trainers are the one segment that reliably pays in fitness (they charge $50-100/session
  and TrueCoach/Trainerize live on $20-30/mo), and the VIEWING half is nearly free — workout_history
  and personal_records are already readable by an accepted follower, so it's mostly screens. Three
  things make it a later project, not a now project: (1) trainers pay for ASSIGNMENT and compliance
  (build a program -> push it to the client -> see if they did it), not read-only viewing, and
  that's the real build; (2) an iOS subscription for in-app features must use Apple IAP (15% under
  $1M, 30% above) — StoreKit, a native plugin and server-side receipt validation, i.e. a Mac day
  plus backend, more work than the feature; (3) it doubles the permissions surface before the
  consumer app has any users. **Cheap way to test demand first:** the app already mints share codes
  for programs and workouts — a read-only "share my log" code would let a trainer view a client's
  history with no subscription, no new access class and no Apple cut. If trainers use it
  constantly, build the tier.

**★ THE BRANDED AUTH EMAIL TEMPLATES AND THE "Seshd" SENDER NAME ARE INSTALLED (Mo, Aug 30) — and
here is how to re-verify the mail stack without a browser.** Direct HTTPS to supabase.co is blocked
from the sandbox, so drive the real auth endpoint through pg_net:
```
select net.http_post(
  url := 'https://zwsoxvekobvtvsphesef.supabase.co/auth/v1/recover',
  headers := jsonb_build_object('Content-Type','application/json','apikey','<anon key from the last bundle>'),
  body := jsonb_build_object('email','<address>'));
-- then: select status_code, content_type, left(content,300), error_msg from net._http_response where id = <id>;
```
**A 200 from `/recover` is NOT proof the mail sent** — the reset UI deliberately never surfaces
errors, and GoTrue answers 200 before SMTP resolves. Three things together are the proof, and all
three were checked on Aug 30: the auth log carries `user_recovery_requested` with `status 200` and
an EMPTY `error`; **`auth.users.recovery_sent_at` advances** (it only moves once GoTrue has handed
the message to SMTP); and the request `duration` is ~2.7s, i.e. a real SMTP round-trip rather than
the near-instant return of a send that never left. What this CANNOT prove is the part that only
exists in the delivered message — that the branded template rendered and the From name reads
"Seshd". That needs a human looking at an inbox; ask. **Mo did, Aug 30: the mail arrived and the
branding is correct.** So the whole chain is confirmed end to end — dashboard templates, sender
name, Resend SMTP, delivery to a real Gmail inbox — and this item is CLOSED. Re-test only if the
templates or the SMTP settings change.
**Do not fire this at a real user's address casually**: it puts a live recovery token in their
mailbox. Mo's own account is fine when he asks for it, and the link simply expires unused.

Not yet done / launch-blockers: Apple Sign In is required by the App Store if any social login ships (`OAUTH_ENABLED = { apple:false, google:false }`; the Sign in with Apple capability is already ticked on the App ID). **Email confirmation is ON** (Mo flipped it July 30, before opening the beta). Leaked-password protection is a PAID Supabase feature and is deliberately deferred — it's the single best remaining defence for tester accounts, so re-raise it when he's on a paid plan. **DMARC IS ALREADY LIVE — this was listed as open for weeks and was not.** Verified by DNS query Aug 29 2026: `_dmarc.getseshd.app` TXT = `v=DMARC1; p=none;`. The whole Resend stack checks out — DKIM key at `resend._domainkey.getseshd.app`, SPF `v=spf1 include:amazonses.com ~all` on `send.getseshd.app`, bounce MX at `feedback-smtp.us-east-1.amazonses.com`. `p=none` is monitor-only; the optional upgrade is `p=quarantine`, which is LIKELY safe here because DKIM signs as the From domain, but that was inferred from the DNS layout, not read off a real message header — confirm before enforcing. **Deliberately NOT upgraded while App Review is pending**: enforcement can only ever cause mail to be delivered less, and reset emails reaching testers matters more right now. Check the record before re-adding this as a TODO — `node -e "require('dns').promises.resolveTxt('_dmarc.getseshd.app').then(console.log)"`. **Branded auth email templates are INSTALLED and inbox-verified (Aug 30); the source lives in `supabase/email-templates/`** (confirm-signup / reset-password / change-email, plus `preview/*.png` and `_shared.md` with install steps) — they live in the Supabase dashboard, so no deploy. The SMTP **Sender name is set to "Seshd"** and a real reset email was delivered and checked by Mo on Aug 30, so this is CLOSED — nothing Mo-side remains here. Native Live Activity rest timer + home-screen widgets are Mac-side (App Groups capability already ticked for them). Share-to-Instagram-Stories directly would need a native Capacitor plugin (Mac-side).

### OTA UPDATES (@capgo/capacitor-updater, self-hosted — set up July 20, 2026)
Purpose: ship app-code updates to installed phones WITHOUT the Mac/TestFlight. Fully wired on
the code side; goes live after ONE more Mac build (see next-Mac-day checklist below).
- **Plugin**: `@capgo/capacitor-updater@^8.51.2` in package.json; config in
  `capacitor.config.json` → `CapacitorUpdater` (autoUpdate:true, updateUrl points at our own
  `/api/app-update`, statsUrl/channelUrl empty = zero Capgo-cloud calls). `main.jsx` calls
  `notifyAppReady()` (guarded global) on every launch — without it the plugin auto-reverts the
  bundle after 10s, which is the rollback safety net for a broken OTA push.
- **Endpoint**: `api/app-update.js` (Vercel function). The full publish recipe is in its header
  comment. Summary: build dist with real env → zip dist CONTENTS (index.html at zip ROOT) to
  `public/bundles/seshd-<ver>.zip` → set `LATEST_VERSION` in api/app-update.js → delete the old
  zip → push to main. Phones fetch on next launch, apply on the one after. "No update" reply is
  `{version:null}` (documented capacitor-updater self-hosted contract).
- **Force rollback**: point LATEST_VERSION back at an older published version (restore its zip).
- **HARD LIMIT**: OTA can only ship web-bundle changes. Anything needing a new native
  plugin/capability/entitlement still requires a real Mac build + TestFlight upload — and the
  FIRST build containing the updater plugin itself is exactly that.

**★ SUBMISSION MAC DAY — the checklist for the App Store build (agreed with Mo, Aug 9).**
An App Store build needs Xcode regardless, so anything native rides along for free that day. Do
these BEFORE archiving:
1. `git pull && npm install && npm run build && npx cap sync ios` — the golden order. `cap sync`
   copies the COMPILED `dist/`, so building first is not optional.
2. ~~Add `@capacitor/keyboard`~~ — **ALREADY WIRED IN CODE** (Aug 13): it is in `package.json` and
   `Keyboard.setAccessoryBarVisible({ isVisible: false })` is called at boot behind the platform
   guard, so step 1's `npm install` + `cap sync ios` is all it needs. (Why it matters: iOS puts a
   grey `‹ › Done` accessory bar above the system keyboard for web inputs — the last big "this is a
   website" tell. It does NOT affect the set fields, which are DIVs driven by the in-app NumberPad
   on purpose, but it is visible on exercise notes, custom rest seconds, search, chat, profile edit
   and sign-in. The plugin also gives keyboard-will-show events, which is what a focused field needs
   to scroll clear of the keyboard.)
3. Archive, upload, submit. Listing copy, screenshots, Support URL, review notes and the verified
   demo accounts (`appstore-submission.md`) are all already in App Store Connect.
**Step-by-step for Mo is in `submission-day-guide.md`.** The iOS project is **SPM, not CocoaPods** —
there is no `.xcworkspace` and no `pod install`; open `ios/App/App.xcodeproj`. **The archive's build
number is expected to read one HIGHER than what you typed** — the project auto-increments on
archive, so "I wrote 8 and it says 9" is correct, not a mistake. As of Aug 16 Mo had reached step 4
and had NOT submitted; the archived build predates the whole Aug 12–16 era and must be rebuilt.
Mo-side and NOT needing a Mac, worth doing first: paste the branded auth email templates from
`supabase/email-templates/` into the Supabase dashboard, and set the SMTP Sender name to "Seshd".

**★★ ~~THE MAC-DAY CAPABILITIES WERE NEVER COMMITTED TO GIT~~ — RESOLVED, and this entry is kept
only because the failure mode is worth remembering. ✅ `ios/App/App/App.entitlements` EXISTS, is
committed (`877b9fe`) and is referenced by `CODE_SIGN_ENTITLEMENTS` in BOTH build configs; it
carries `com.apple.developer.healthkit`, `com.apple.developer.associated-domains`
(`applinks:spotr-drab.vercel.app`) and `aps-environment`, and `UIBackgroundModes`
(`remote-notification`) is in Info.plist. Verified Aug 28. **One thing to confirm on the next real
build rather than assume: `aps-environment` reads `development` in the file.** Xcode normally
rewrites that to `production` when archiving for TestFlight/App Store, so it is probably correct —
but the APNs key here is PRODUCTION-ONLY, so confirm a push actually lands rather than trusting it.
The original Aug 23 report follows, and its lesson stands: a capability ticked in Xcode's UI and
not committed vanishes from the next build with nothing in the diff to show it.**

**(Historic, Aug 23, 2026 — now fixed.)** Mo deleted+reinstalled the app to test the fresh-signup
flow; afterward, neither the Health nor the push-notification permission prompt appeared, and
Seshd disappeared from Settings → Health entirely. Chasing it through a new manual "reconnect"
button (`HealthConnectRow`, Settings) got a real native error instead of a guess: **"Missing
com.apple.developer.healthkit entitlement."** The app literally isn't signed with permission to
touch Health data. Confirmed from the repo: **`find ios -iname "*.entitlements"` returns nothing,
and `project.pbxproj` has zero `CODE_SIGN_ENTITLEMENTS`/`com.apple.developer` references.** Every
capability from the original Mac Day checklist (HealthKit, Push Notifications, Background Modes,
Associated Domains) was ticked through Xcode's Signing & Capabilities UI on some Mac in July and
NEVER git-committed — it only ever existed as local, unsaved Xcode project state. If that state
was reset or the project re-cloned since, all four capabilities silently vanish from the next
build with nothing in the diff to show it, which is consistent with BOTH push and Health prompts
failing on the same test. **This cannot be fixed via OTA** — it's a native signing issue, not app
code; every OTA-shippable fix in the reconnect flow above is correct and simply can't reach a
permission the binary was never granted. Fix needs a Mac: reopen Xcode → Signing & Capabilities,
re-add all four capabilities, and — the part that was skipped last time — **commit the resulting
`.entitlements` file and the `project.pbxproj` diff to git before archiving**, so this can't
silently disappear again. As of Aug 23 this is unconfirmed-but-likely for Push/Background
Modes/Associated Domains too (same missing-commit root cause) — verify all four in the same Mac
session rather than doing this one capability at a time.

**~~NEXT MAC DAY checklist (one-time, activates OTA)~~ — ✅ DONE.** The installed build carries
`@capgo/capacitor-updater` and OTA is device-verified: six bundles shipped to Mo's phone on
July 29 alone. **No Mac is needed for app-code changes any more** — publish per the recipe in
`api/app-update.js` and it reaches installed phones after two relaunches. The Mac is now needed
ONLY for: a new native plugin/capability/entitlement, a build for App Store submission, or a
TestFlight build refresh once the current one nears its 90-day expiry. (Adding a new TestFlight
tester to the EXISTING build does NOT need a Mac.)

### MAC DAY — ✅ COMPLETE (July 19-20, 2026; historical checklist below)
Everything that needs a Mac, in the order to do it. Code/server side is DONE for all of these.

**Step 0a — set the last APNs secret (the `.p8` key file LIVES ON THE MAC):**
The APNs key was already created in a prior session and all other secrets are already set
(`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC`, `APNS_ENV=production`). The one missing piece
is `APNS_PRIVATE_KEY`, blocked because the downloaded `.p8` file is on the Mac. On Mac day:
find the `.p8`, open it in TextEdit, and paste its full contents (BEGIN/END lines included)
into Supabase dashboard → Edge Functions → Secrets → `APNS_PRIVATE_KEY`. Do NOT generate a
new key in the Apple portal unless the file truly can't be found — a new key means updating
`APNS_KEY_ID` too. Pushes cannot send 200s from APNs until this secret is set.

**Step 0b — sync the native project (CRITICAL, do before any build):**
```
git pull
npm install
npx cap sync ios
```
This installs the plugins added while Mac-less: `@capacitor/preferences` (localStorage→native
persistence mirror — without it iOS can silently wipe user data), `@capgo/capacitor-health`
(ALL HealthKit reads: HRV/RHR/sleep/steps for readiness + body battery),
`@capawesome/capacitor-badge` (app-icon unread badge), and `capacitor-secure-storage-plugin`
(auth session tokens in the iOS Keychain — boot migration moves existing sessions out of
localStorage/Preferences automatically). The JS already calls all four behind guards; they
no-op until this sync runs. Nothing works health/persistence-wise without this step.

**Step 1 — Xcode capabilities (target → Signing & Capabilities → +):**
- **Push Notifications**
- **Background Modes** → check *Remote notifications*
- **HealthKit** (required for the health plugin; no background delivery needed)
- **Associated Domains** → add `applinks:spotr-drab.vercel.app` (universal links — the
  AASA file is already live at /.well-known/ and AppDelegate already handles the callback;
  only this entitlement is missing)
- (Only if/when social login ships: **Sign in with Apple**)

**Step 2 — Launch screen:** LaunchScreen.storyboard → background `#0a0a0a`, centered logo
(source art in `assets/`; `npx @capacitor/assets generate` can regenerate icons/splash from
`assets/icon-only.png` + `assets/splash*.png` if preferred). Info.plist permission strings,
portrait lock, and the app icon are already committed — no Xcode work needed for those.

**Step 3 — device test (physical iPhone; simulator can't do APNs or HealthKit):**
1. Build to device. Open app → accept push prompt → check `profiles.push_token` fills in.
2. From a 2nd account: send a DM → push arrives with the sender's name, app icon shows an
   unread badge count, tapping opens the right chat, badge clears when the app foregrounds.
   (For a direct Xcode debug build set `APNS_ENV=sandbox` in Supabase secrets; TestFlight
   uses `production`.)
3. Connect Apple Health when prompted (readiness/body battery should switch from estimated
   to real HRV/sleep within a day of data).
4. Paste a `spotr-drab.vercel.app/u/...` profile link into Notes/iMessage and tap it — it
   should open IN the app (universal link), not Safari.
5. Kill + relaunch the app — workout history must survive (Preferences persistence mirror)
   AND you must still be signed in (session now lives in the iOS Keychain).
6. If pushes fail: Supabase Edge Function logs → 401 = `WEBHOOK_SECRET` mismatch; an
   `api.push.apple.com` error = APNs key/entitlement pairing wrong.

**Step 4 — TestFlight:** archive, upload, add Mo as internal tester.

**★ NEXT MAC DAY — TOP OF THE LIST (added Aug 31, once App Review cleared):**
**`Keyboard.resize: "none"` in `capacitor.config.json`, tested on device.** This is the real fix
for the "feels laggy when I tap a field" class Mo reported himself: iOS defaults to `resize:native`,
which physically SHRINKS the webview when the keyboard opens, so every centred layout recomputes and
visibly drifts. The web-side pinning already shipped and takes most of it out, but a residual ~29px
shift remains on any screen whose content still FITS the shrunken box, and no web change can remove
that. It was deliberately NOT taken before submission for three good reasons that have all now
expired: it is not OTA-able, it changes keyboard behaviour on every screen at once, and it cannot be
verified by this repo's battery at all (neither jsdom nor headless Chromium has a software keyboard).
Now that there is no deadline, it can be flipped and driven properly on a real device.
**How to check it:** sign-up form, onboarding age step, Edit Profile, the password-reset screen, and
any exercise-notes field — tap each input and watch whether the layout moves. The scroll containers
added to the auth/onboarding/reset screens are the safety net if `none` leaves a field under the
keyboard; if that happens on any screen, revert to the default rather than papering over it.

**Deferred Mac-side (post-TestFlight):** (`@capacitor/keyboard` MOVED UP — it is step 2 of the
submission Mac day above, since that build happens anyway.) Live Activity rest timer, home-screen widgets,
**Apple Watch app** (log sets from the wrist — Mo confirmed "later", it's a full native target),
**video posting** (needs a native picker/recorder plugin — do it the Hevy way: 1 short clip per
workout, thumbnail + tap-to-play, ~30-60s cap, so bandwidth stays sane),
share-to-Instagram-Stories plugin, converting the top bar to a true scroll-under glass
overlay (marked TODO(device-test) in App.jsx), iOS 18 light/dark icon variants (light art exists at `assets/AppIcon-1024-light.png`,
decision was to stay single dark icon).

**Mo: PC-side prerequisites (do BEFORE Mac day so nothing blocks Mo once he's on the Mac)**
1. ~~APNs key~~ — DONE in a prior session. The `.p8` file is on the Mac; setting the
   `APNS_PRIVATE_KEY` secret from it is Step 0a of Mac day above. All other APNS_* secrets
   are already set. (Claude can't set secrets — no tool for it, and pasting the key into
   chat would expose it.)
2. ~~App Store Connect~~ — DONE (July 4). App record "Seshd — Gym Log & Lift Tracker",
   bundle id `com.seshd.app` verified, category Health & Fitness + Social Networking,
   age rating 4+, privacy questionnaire published with 8 data types, App ID capabilities
   ticked (Push, HealthKit, Associated Domains, Sign in with Apple, App Groups,
   Communication Notifications), `ITSAppUsesNonExemptEncryption=false` in Info.plist.
   ~~Screenshots/description~~ — DONE (July 11): listing copy entered, screenshots uploaded,
   Support URL set, App Review notes + demo account ready in `appstore-submission.md`.
3. ~~Resend SMTP~~ — DONE (July 4): domain `getseshd.app` verified, sender
   `hello@getseshd.app`, Supabase custom SMTP active (email rate limit 30/h).
   Still Mo-side later: "Confirm email" toggle at public launch; (DMARC is DONE — see above); Apple Services ID if Google/Apple sign-in ships at launch.

## The containment pass (started Aug 28, 2026) — MEASURE FIRST, the tool is `build/containment_audit.mjs`
The design critique's last open item ("less containment / fewer rounded cards" + a typography
pass), unparked by Mo on Aug 28. **Do not start from an impression of the app — measure.** My own
read from memory was wrong in BOTH directions last time (I said "everything is the same large
radius"; measuring found 26 distinct radii, i.e. arbitrariness, plus LOW containment on the screens
I had called over-contained). `containment_audit.mjs` walks 16 real screens and counts every
element with a corner radius AND a boundary the eye can see (a background differing from what is
behind it, a real border, or a shadow), classified by size and — the part a flat count cannot see —
**nesting depth**, since a card inside a card inside a card is what reads as assembled-from-a-kit.
It inventories typography on the same walk. It is a PROBE: it asserts nothing, so it is named
`*_audit.mjs` to stay out of `run_sims.mjs` (which globs `sim_*`/`pw_*`) per the
"a script that cannot fail does not belong in the battery" rule.
**It caught two defects in ITSELF before any number was trusted, both inherited from
`accent_audit.mjs`:** `page.mouse.wheel` is a NO-OP in this app (body is pinned `overflow:hidden`
for the app's whole lifetime, so scrolling happens in inner containers) — five "scrolled" screens
came back byte-identical to their unscrolled twins, and only the tour's own is-this-screen-distinct
check exposed it; and it looked for the Body Battery sheet on the TRACKER tab when it lives on your
own PROFILE, which is the exact failure CLAUDE.md already documents. `scrollBy()` now drives the
tallest genuinely-scrollable element directly and REPORTS when nothing moved. **accent_audit.mjs
still has both bugs** — its Body Battery shot is guarded by an `if` so it silently skips, and its
scroll shots are duplicates; fix them if that tour is ever re-run for a lime re-measure.
**★ AND ITS THIRD SELF-INFLICTED BUG IS THE ONE THAT MATTERED: AN OVERLAY DOES NOT REMOVE THE DOM
BENEATH IT, AND THE FIRST RANKING WAS PARTLY MEASURING STACKED DOM.** `exercise_detail` reported
**44 containers**, of which SIXTEEN were the Exercises tab's category chips (All/Chest/Back/…)
sitting underneath the overlay, plus the nav bar and the streak badge. Settings and the Body
Battery sheet are overlays over the profile and were inflated the same way. Scoped to the topmost
overlay now (highest-z fixed/absolute element over 240px tall — the height floor is what keeps the
50px nav bar from being mistaken for an overlay), and every line reports `[page]` or
`[overlay z=…]` so a wrong root is visible rather than silently shaping the numbers. **Total went
366 → 264: 28% of the original count was never on screen.** The lesson is the documented one hit
from a new direction — and note it inverted two conclusions, not just the totals: exercise_detail
is actually one of the LEAST contained screens (9 containers, 2 cards) and the Body Battery sheet
has 2 cards, not 7. Both had been on the "worst screens" list.
**Corrected baseline (Aug 28, dark theme, 428×926):** 264 containers over 16 screens. Worst first
— **tracker_home 7 cards/depth 1 (the landing screen, and now unambiguously #1)**, settings 6/3,
history_scrolled 6/1, profile_scrolled 4/2. 14 distinct rendered radii (20px dominant at 87 uses,
then 8/47, 14/46, 10/42). Typography: 19 distinct rendered sizes, 59 size/weight/spacing/transform
combos, 3 families.
**Finding 1, FIXED: `DAY_CARD_COLORS` was a SURVIVING TWIN of the deleted `DAY_COLORS` rainbow.**
Same positional indexing (`di % 7`), on the LANDING screen rather than the buried one the rainbow
was removed from — the "delete every call site of the old mechanism" rule, applied to a palette
instead of an event handler, and nobody grepped for a sibling. It was also broken as an identifier:
entries 1/5 and 2/6 were byte-identical, so a 6-day program showed two separate PAIRS of days in
the same colour (the original's flaw was one collision; this had two). It painted a 4px rail plus a
tinted number tile, making colour the FOURTH encoding of "which day is this" after the name, the
number and the row order. Rail is now the card's own hairline, tile is neutral.
**Finding 2, FIXED: a BOOLEAN IS A SWITCH, NOT A TWO-SEGMENT "On | Off" PICKER.** The container
count sent me to Settings (11 cards, depth 3) and LOOKING at it changed the diagnosis — worth
recording, because the metric was right about the screen and wrong about the cause. Its grouped
inset section cards are what iOS Settings actually looks like; flattening them to hairline
dividers would make the screen LESS native, not more. **Do not "reduce containment" on a settings
screen.** The real defect was the CONTROLS: five booleans (public profile + four notification
prefs) rendered as segmented On/Off pairs, which is the wrong control for the job — a segmented
control chooses among alternatives you can name, and "Off" is not an alternative, it is the
absence of the thing. Four identical pills also made the heaviest elements on the screen four
controls all sitting in their default state. New `Switch` component, deliberately reusing the
EXACT tokens the segmented control already used (`C.primary` filled / `C.divider` empty) — a
geometry change, not a repaint, so volt stays reserved. The genuine multi-choice rows (Light/Dark,
LBS/KG, weekly target 2-5) correctly stayed segmented.
**★ AND THE KNOB IS THE LESSON: ONE FIXED RIM ALPHA CANNOT SERVE BOTH THEMES.** The light knob is
white on a pale OFF track — measured **1.18:1**, and the knob's POSITION is what identifies the
state. The obvious fix is a rim (the PLATE_RING answer), but measuring the alphas showed the value
that clears light (0.5 → 3.37:1) drops the DARK knob from 4.64:1 to 1.63:1: the fix for one theme
is the bug in the other. The rim is theme-gated now (none on dark, 0.5 on light). Same family as
the share modal's muted-text alphas that were copied from the dark card and failed AA the moment
the surface flipped — **re-measure every hardcoded alpha on BOTH themes, and never assume one
value works for both.** Sim: `pw_switch` (both themes: five switches exist, no leftover On/Off
buttons, all labelled, the seeded OFF pref renders off, the knob edge clears 3:1, on/off tracks
differ by 3:1, and toggling both flips aria-checked AND writes to the server — a local-only
setState would be the dominant bug class in this app). Red-proofed by restoring the single fixed
rim: dark stays green, light fails at exactly 1.18:1.
**Finding 3, FIXED: chart axis labels rendered at 7px / 8.5px / 9px — and the GUARD had a third
coverage hole.** The app retired every 8px and 9px literal across 62 sites for sitting under the
11px floor, but `sim_designscale` swept `fontSize:` in STYLE OBJECTS only, so every SVG
`fontSize="7"` ATTRIBUTE was invisible to it: History's rotated month ticks (7px), the shared
progress chart's y-axis (8.5px mono) and its two date labels (9px) all survived the retirement
with the check green throughout. Same disease as the `sim_undef` engine-split gap and the
`src/lazy` blindness — third instance — so the rule is now explicit: **a property can appear as a
style key AND as an SVG attribute, and a guard that sweeps one is not sweeping the other.** All
bumped to 10 (UP, never down, same direction as the original 62). `sim_designscale` grew two SVG
sweeps and **immediately found two more sites nobody had spotted** — `TrendSparkline`'s hi/lo
labels at 8px — which is the guard paying for itself on its first run. Deliberately NOT swept:
the hand-built SVG STRINGS (`font-size="68"`, the Wrapped story card and the exercise share
image), because those draw into a 1080x1920 canvas where the px floor is meaningless.
**Measured, not assumed, because bumping an axis can crowd it:** the weekly chart's before/after
crops are byte-identical in size (428x119) with 8 bars and no collision — my own "~20 rotated
labels, might crowd" worry was simply wrong, and looking settled it in one screenshot. The
sparkline was the one real risk (a 38px-tall box); measured after the bump, its labels overflow
their svg by 1px into the card's own 10px padding, and the crop shows nothing clipped.
**Finding 4, FIXED: the Body Battery sheet had SIX LIME NUMBERS AND TWO RED ONES, and both halves
were wrong.** Its eight stat tiles coloured by sign alone — `startsWith("−") ? C.red : C.accent` —
so morning charge, deep sleep, resting HR, HRV, steps and active energy all came out volt. Volt is
reserved for PRs, progress, the muscle map and the streak; a resting pulse and a step count are
READOUTS, not progress. And with six of eight tiles lime the colour discriminated nothing, which is
the same "palette that encodes nothing" problem that retired the day rainbow, reached from a third
direction. The red was the worse half: it sat directly above the words "Normal energy use through
the day", so the colour contradicted its own caption and reported an ordinary day as an alarm.
All tile values are `C.text` now — the −/+ glyph in tabular mono already states the direction
without spending colour on it — so **the sheet has exactly one coloured number, the score it exists
to explain** (the headline keeps `fill`, which is real: it encodes the level band accent/gold/red).
**Deliberately NOT flattened**, though this sheet ranked second on container count: each tile
groups three lines (kicker / value / caption) in a two-column grid, so the containers are doing
real work and removing them yields a wall of text. Second time the count pointed at a screen whose
containment was fine — see Settings above. *Reduce containment* is not a rule to apply mechanically;
LOOK at the screen the number sent you to.
**Finding 5, FIXED: the streak card said "THIS WEEK" twice, two lines apart.** In the
no-streak-yet branch the kicker is `THIS WEEK` and the caption was the literal `"this week"`, so
the card read **"THIS WEEK / 1/3 / this week"** — the value sandwiched between two copies of the
same phrase. Every number was correct and nothing in the battery can see a defect like this; it
exists only in the sentence the three lines form together, which is the same class as the
Recovery-vs-fatigue contradiction and is why the house rule is to **read a card's lines ALOUD in
sequence after any copy or layout change**. The caption now names what the numbers ARE
("workouts"); the streak branch was already correct ("WEEKLY STREAK / 11 / wks · 3/3") and is
untouched. Found by LOOKING at the screen the container count had pointed to — the count was about
containment, the actual defect was copy.
**And the tracker's containment was deliberately left alone.** It ranks #1 (7 cards) and the three
program-day cards are the repeated-maximal-card shape the Day Preview flattening removed — but each
one carries THREE actions (tap-to-preview, Edit, Start), and a card is a reasonable container for a
multi-action object. That is the third screen in a row where the count pointed at containment doing
real work (see Settings and the Body Battery sheet). Mo also explicitly likes the Quick Start card's
lime glow border, so it stays.
**★ THE AUDIT OF THE SWITCH COMMIT FOUND THE FIELD THAT NEVER GOT THE SETTINGS-RACE GUARD.**
`notificationPrefs` was the ONE field with the optimistic-`setStore`-plus-immediate-`queueWrite`
shape and no protection: `loadUserData`'s `recent` branch (a 20s "an edit just happened" window)
covers exerciseNotes/workoutNotes/barTypes/closeFriends/weeklyTarget/isPublic, and the four
notification toggles never even stamped `_lastSettingsEditAt`. A foreground refresh landing before
the PATCH re-served the stale value and **the switch flipped back under the user's finger** — then
self-healed on a later load, which is precisely why nobody reported it. PRE-EXISTING (the old
segmented control had byte-identical behaviour); the switch commit was simply the moment it should
have been caught. Both halves fixed: the stamp on the notification path, and the field added to
the guard.
**★★ AND THE TIMING IS THE LESSON — TWO THROTTLES HAVE TO BE LINED UP OR THE TEST IS A NO-OP.**
The foreground refresh is throttled to once per 30s (`lastFetchRef`), so dispatching
`visibilitychange` a few seconds after boot does NOTHING. The first draft of the check did exactly
that, and **PASSED against the broken build** — the documented "a script that cannot fail" trap,
reached through a throttle rather than a bad selector. It must wait past 30s BEFORE the edit, which
is also the realistic shape of the bug (app open a while → change a setting → background). Note the
two windows barely overlap: the edit guard is 20s and the refresh throttle is 30s, so the race is
only reachable when the last fetch was already stale when you toggled. Red-proofed in BOTH
directions afterwards — red on the unguarded build (flips back to `true`), green with the fix.
Sim: `pw_switch`'s `[race]` section. **A second trap in the same session: restoring `src/App.jsx`
from a scratch copy does NOT rebuild `dist`, so the next probe run measured the OLD bundle** — the
red-proof result and the "fixed" result were swapped. Rebuild after every restore, or the two runs
you are comparing are not the two builds you think.
**Guard holes closed in the same pass.** The SVG sweeps added for the axis-label fix had six
constructible false negatives (`fontSize={ 7 }`, `fontSize = {7}`, `fontSize="7px"`,
`fontSize={"7"}`, `fontSize="9.25"`, and the hyphenated JSX form `font-size="7"`, which renders at
a real 7 CSS px). None existed in the tree, but a guard is worth what its worst case catches. One
tolerant regex now covers both attribute spellings, whitespace, braces, quotes and a `px` suffix,
and the template-string exemption is done by LOCATION (counting unescaped backticks) rather than by
hyphenation — which is what the first draft accidentally relied on while its comment claimed
otherwise. Red-proofed on all seven shapes, plus the complement: a `font-size="7"` injected INSIDE
a template-literal card stays GREEN, proving the exemption is real and not an accident.
`containment_audit`'s overlay picker also now requires `childElementCount > 0` — the `···` overflow
menus render a childless `position:fixed; inset:0; zIndex:50` click-catcher that cleared every
other filter, so opening one would have made it the root and reported a confident, wrong ~0.

## Device-feedback round (Mo testing, Aug 29 2026) — four reports, three were real bugs
- **★ "The silhouette for Strength and when you click exercises is not the same as the fixed one in
  Volume."** Correct, and worse than it looked: **18 muscles** in Strength mode were painted the
  EXACT body colour and vanished into the silhouette, plus every uninvolved muscle on the
  exercise-detail map. The zero-muscle fix had only ever reached the paths going through
  `_heatColor`; Strength's "no standard" branch and the detail map still returned `bodyCol`. The
  old comment defended that as "absence of data rather than a measured zero" — a true distinction
  the reader cannot see, whose only visible effect is the body losing its anatomy. One
  `emptyMuscleCol(C)` now serves all three. **Textbook one-fix-didn't-get-copied**, found by a user
  looking at two screens side by side, which is the class no automated check here can catch.
  `pw_musclezero` sweeps all three modes now (red-proof: 18 invisible muscles).
- **★ "Feels like it's counting too many shoulder exercises."** Real. **57 exercises** gave
  Shoulders half-credit as a secondary — **31 of them CHEST**, including pure isolation (Pec Deck,
  Cable Fly, DB Fly, pullovers), plus **11 SHRUGS**, whose primary is already Traps. Removed from
  isolation and shrugs, KEPT on presses (bench/incline/dips/close-grip) where the front delt
  genuinely works. Measured on a realistic push+pull week: **14.5 → 11.5** shoulder sets, and the
  remaining 3.5 is all pressing. Precedent: squat/deadlift were already excluded from Abs credit
  because bracing is not half a set — a fly is not half a set of shoulders either. **When a user
  says a number "feels" wrong, quantify it before agreeing OR disagreeing** — the count made the
  case in one query.
- **"On Volume, get rid of the # working sets this week."** Done. A whole-body set total mixes
  chest and calves into one figure no dose-response guidance applies to; the per-muscle counts are
  the tab's whole point. The "4+ grows · 10-20 maximizes" guidance stays — it explains the list.
- **Swipe-down-to-close on the Body Battery sheet.** Built into `<Sheet>` (opt-in via `dragHandle`)
  rather than that one caller, so all nineteen sheets can take it. Follows the house gesture
  pattern: ONE setState to drop the CSS transition, then direct writes to the ref'd nodes, outcome
  committed once on release. Two traps handled: the drag starts on the HANDLE, not the panel
  (these sheets scroll — a panel-wide drag would steal it), and the handle carries
  `touchAction:"none"` for the documented iOS reason. **The snap-back is animated by hand, not via
  state**: React's last committed transform is already `translateY(0)`, so a state reset would be
  an `Object.is` no-op and the directly-written offset would stay stuck. Sim: `pw_sheetdrag`
  (follows the finger, short drag snaps back, long drag closes, and the panel is at rest — not
  stuck at the drag offset — when reopened).
- **★ "Should we get rid of custom exercises in settings?" — KEPT, and looking at it found two real
  defects.** The section is ALREADY conditional (`customExercises.length > 0 &&`), so it does not
  render at all for anyone who has never made one — it is not clutter, and removing it would leave
  a typo'd custom exercise unfixable. But **Remove and "Clear all custom exercises" both fired on a
  single tap with no confirmation**, against the house rule that destructive controls go through
  `confirmAction`. Worse, the consequence is invisible and permanent-ish: **a custom exercise is
  what makes its name resolve to a muscle**, so deleting it silently strips the muscle mapping from
  every past workout that used it. Measured on the engine: a 4-set session went from
  `{Back: 4}` to `{}` in `weeklyMuscleVolume` the moment the registry lost the name, while
  `totalSets` still counted 4 — the sets stay in History with their volume and vanish from the
  muscle map, muscle readiness and "most trained". That is the documented library-invisible-name
  failure, reachable from a Settings button. Both now confirm, and the message COUNTS the real
  logged workouts at stake rather than saying "are you sure". Sim: `pw_customex` (red-proof: 5
  failures on the one-tap version, including proof it wrote to the server before confirming).
  **Verification note worth keeping:** the first attempt to prove the history damage used
  "Hammer Row Machine" and showed no change — that name collides with a library entry, so it
  resolved anyway. A genuinely unmatchable name was needed to see it. Pick a fixture name that
  cannot collide when testing name RESOLUTION.

## ★★ The Fable-5 audit: SEVEN findings, and the two worst were both caused by fixes made hours earlier (Aug 30)
A cold-context Fable 5 audit of the four unaudited commits. The pattern: **a fix that changes the
render tree or the store creates new bugs somewhere neither the fix nor its test was looking.**
- **★★ THE CHAT OPENED UNDERNEATH THE PROFILE, AND SILENTLY ATE UNREAD DMs.** My own regression
  from the chat-overlay change. The chat went in at zIndex 55; the profile overlay is portaled to
  `document.body` at 60, and `onMessage` only does `setChatPeerId(uid)` — nothing clears
  `profileUserId`. So tapping **Message** on a profile did nothing visible while ChatView mounted
  BENEATH it, started its 3s poll and PATCHed `read_at` on every incoming message: unread DMs
  consumed without ever being seen, and backing out of the profile dropped you into a conversation
  you never opened. A "dm" push tapped over a profile did the same. The old early return hid it by
  preempting the profile entirely. **Order is now nav 50 < profile 60 < chat 65 < post 70** —
  verified that nothing in ChatView opens a profile, so no path needs the reverse.
- **★★ `loadUserData` WIPES `store.posts` TO `[]` BEFORE CALLING `loadFeed`, WHICH MADE MY FIRST
  FIX COMPLETELY INERT.** The merge that lets `handleKudos`/`handleComment` find a post opened from
  a shared link is undone by the next foreground refresh: `loadFeed` carries only posts under 2
  minutes old and a shared post never is. The overlay kept rendering from its snapshot, so it
  LOOKED fine while every action on it went silently dead — the exact bug the merge was added to
  fix, back 30 seconds later. **I patched `loadFeed`'s carry filter first and the check still went
  red**, because by the time that filter runs `prev.posts` is already `[]`. Both sites now preserve
  the open post. **When a fix does not take, find the code that runs BEFORE it, not a better
  version of it.**
- **An RLS refusal is an empty 200, not a throw**, so the `"error"` state and its Try-again never
  covered the case its own comment described: open a `/p/` link signed out, get `[]`, sign in, and
  you stay latched on "the person who posted it keeps their account private" with the URL already
  consumed by `replaceState`. The `false` branch has a Try again now too.
- **The story ring had no follow filter.** `recentStoryPosts` gates on type and 24h only; what kept
  strangers out was incidental — they were absent from `store.users`. Merging a shared post's
  author in made a public stranger's story ring appear in your feed. Pre-existing hole, new path
  into it; now gated on `following`, the same rule `feedPosts` uses.
- **`SharedPostLink` dropped the whole LINE containing the URL**, so prose typed on the same line
  as a pasted link still vanished — the same defect the previous commit "fixed", surviving in a
  different shape. It strips the URL token now.
- **FIXED (Mo asked about it): MessagesScreen's 10s/300-row poll ran for the whole time a chat was
  open.** The list used to UNMOUNT when a chat opened (the chat was an early return); as an overlay
  it stays mounted underneath, so its poll ran alongside ChatView's own 3s one — ~6 extra fetches a
  minute of a screen nobody can see. Not a correctness bug, which is exactly why it is worth
  naming: it was a side effect of the overlay conversion rather than a decision. `paused={!!chatPeerId}`
  gates the interval and `load()` fires on resume so the list is never stale coming back into view.
  **When a screen stops unmounting, audit its timers** — every interval it owns just became
  permanent.
- **Probe lessons, four in one sitting:** section 9 failed because the fixture deliberately omits
  the author from `store.users`, so the feed card renders "?" and there was no name to tap — reach
  the profile through the post overlay, which is what resolves them. Section 10 reported "no kudos
  write" when the click was actually an UN-kudos (a DELETE), because `historyInteractions` persists
  across a reload and the stub only counted POSTs — count writes in both directions. Sections that
  ran on state left over from earlier sections measured whatever they landed on; both now start
  from a fresh `page.goto`. And `POST2` was seeded "just now", inside the 2-minute carry window,
  which would have made the eviction check pass for the wrong reason — it is 10 minutes old on
  purpose. **Every one of those made a real bug look like a passing test.**
- **Clean and worth not re-litigating**: `9cd33a8` is defect-free; `fb4ef53`'s chip is sound on both
  themes; no free identifiers or unpassed props; the chat overlay carries `data-no-tab-swipe` and
  both the tab swipe and PullToRefresh honour it; ChatView has no `position:fixed` children so
  EdgeSwipeBack's containing block is harmless; every sheet portals to body at z >= 300 so nothing
  became unreachable above the chat; the merged post is not persisted (`saveStore` strips `posts`)
  and the feed, profile counts, activity badge and pagination offset are all insulated from it.

## Sweep #5 (Aug 30, 2026) — the error rate is effectively ZERO, and the demo corpus had drifted again
**Postgres errors: 9 in 24h, and all nine are MINE** — every one is a `POST /mcp` audit probe,
role-sim or rolled-back test from the previous day's work. Zero user-generated errors. The
`personal_records` 23505 story that opened at 1,650/day (→953→83→58) is closed for good.
Auth logs clean: 52 `/token` calls, all 200, no failed-login or reset-email failures.
`client_errors` silent for 14 days. `code_redeem_failures` sitting at 0 rows, so the opportunistic
cleanup is working. Table sizes all proportionate to 8 profiles; nothing growing anomalously.
Orphaned `member_ids`: **0**.
**★ THE DEMO CORPUS HAD DRIFTED AGAIN, AND THE MAXIMUM SAFE SHIFT WAS SMALLER THAN IT LOOKED.**
Newest persona post was 3-5 days old and each persona had only **2** workouts inside the 7-day
muscle-map window — three days from an empty "Muscles Trained" on every persona. The newest
persona row across all shifted tables was a KUDOS at `08-27 22:55Z`, not a post, so `+3 days`
would have future-dated it and **+2 was the ceiling** — pick the offset from `max()` across every
table you intend to shift, not from the one you happen to look at. After: newest persona post
1-3 days old, every persona 3+ workouts in window, `seshdreview` 6. Backup:
`demo_shift_backup_20260830` (244 rows).
**★ AND THE VERIFICATION CAUGHT A NEW INSTANCE OF THE ORDERING TRAP, IN THE MIRROR DIRECTION.**
The documented version is "a persona kudos on a RECENT REAL post goes FUTURE under the shift".
This time it was the opposite: **Mo's OWN kudos on persona posts**. The post moved +2 days, his
real kudos correctly did not, so five kudos ended up dated BEFORE the post they sit on. Fixed by
the same rule — placement inside `[post.created_at, now())`, implemented as
`post.created_at + least(3h, (now() - post.created_at)/2)` so it is strictly after the post and
strictly before now by construction. Backup: `demo_shift_kudosfix_20260830`.
**The generalisation: shifting one side of a relationship breaks its ordering with the side you
correctly did not shift.** Verify DATABASE-WIDE, not persona-scoped — a persona-scoped check
would have reported clean here, because both offending rows' owners were real users.
**★ FIVE TRIGGER FUNCTIONS WERE CALLABLE AS RPCs AND SEVEN WERE NOT — the one-guard-didn't-get-
copied class, in the database.** `enforce_group_creator_manages`, `enforce_group_post_author_edit`,
`enforce_message_content_immutable`, `touch_personal_record_updated_at` and
`transfer_groups_on_profile_delete` all had EXECUTE; the other seven had it revoked.
**NOT exploitable — measured, not assumed**: Postgres refuses with "trigger functions can only be
called as triggers". Revoked anyway as defence in depth, which cleared the advisor warning.
**Two things worth keeping from doing it:** `REVOKE … FROM anon, authenticated` CHANGED NOTHING
(the grant is to `PUBLIC`, which is why the other seven read false) — the statement succeeded and
had no effect, so check the privilege afterward rather than trusting the revoke. And trigger
FIRING does not consult EXECUTE: verified after the revoke by driving two forbidden group edits
(both still refused) and a no-op PR update (date still preserved). **The first version of that
probe reported "guard did not fire" and was wrong** — it set `member_ids` to a value that removes
exactly the caller, which the guard deliberately ALLOWS. Read what the guard permits before
concluding it is broken.
**Still open, unchanged:** leaked-password protection (paid plan), `pg_net` in public, and the two
duplicate `workout_codes` DELETE policies (documented as harmless, consolidate when that table is
next touched — deliberately not touched here). The four SECURITY DEFINER warnings that remain
(`profile_is_public`, both redeem RPCs, `group_image_member_check`) are all deliberate.

## ★★ THE PUBLIC PROFILE NO LONGER PUBLISHES A CLOCK TIME (Sep 2) — the Strava-shaped fix
Mo, on the inference audit: "having people find the arrival time is really creepy." He is right,
and the fix is the two-half pattern `public_profiles` already established.
**The leak was the pairing, not any one column.** `workout_history` was readable by
`owner OR profile_is_public(user_id) OR accepted follower`, and it carries `created_at` (the exact
finish INSTANT) alongside `duration_secs` — subtract and you have the arrival time of every session
ever logged, available to a caller holding nothing but the public anon key. Measured on real
non-migrated rows: **Friday finishes spread 1 minute, Tuesday 3 minutes**, derived arrival ~09:40.
Neither column is sensitive alone, which is exactly why nothing flagged it.
**Half 1 — the TABLE stops being public.** The SELECT policy is now `owner OR accepted follower`
(the block check unchanged); `profile_is_public(user_id)` is gone from it. **Half 2 — a
column-limited VIEW**, `public_workouts`: `id, user_id, day_name, exercises, unit, workout_date`,
joined to `profiles` on `is_public = true` and carrying the same `is_blocked_between` check.
Columns are listed EXPLICITLY for the reason `public_profiles`' own comment gives — a sensitive
column added to `workout_history` later must not leak automatically. Deliberately absent:
`created_at` (the leak), `duration_secs` (pairs with any timestamp to give arrival), `hr_summary`
(health data), `note` (free text; see below).
**Verified by ROW COUNT as four different callers, never by catching an exception:** signed-out
reads of `workout_history` went **69 -> 0** while `public_workouts` still returns 69; the owner
still reads 69; an **accepted follower still reads 69 WITH `created_at`**, which is what keeps
Friends Activity (`DiscoverScreen`, the only cross-user reader that needs a timestamp) working; and
a signed-in NON-follower now gets 0 from the table and 69 from the view.
**Followers were deliberately NOT narrowed.** They are people you approved, and every social app
shows friends exact times. The creepy case is the unauthenticated one.
**A side effect worth knowing: this shrank two of the "latent" findings by itself.**
`workout_history.note` and `hr_summary` are no longer reachable by a stranger at all — the column
is on a table the public can no longer read AND is absent from the view — so a future edit that
populates `note` now reaches accepted followers only, not the world.
**What deliberately SURVIVES, measured rather than assumed:** a workout you SHARE still carries a
public `posts.created_at`, set at share time. 56 of 69 sessions were shared, so the path is well
used — but per-weekday spread on shared posts is **20-231 minutes** against the finish times' 1-3,
because people share whenever they get round to it (one post landed at 00:17). So the acute leak —
a +/-3-minute arrival time derived from data nobody chose to publish — is closed, while a rough
window remains for posts the user explicitly published, which is the normal understood trade of
pressing Share. Stripping timestamps from social posts would be a strange product change; not done.
**Sim: `pw_publicprofile`** — drives the real `/u/` page and asserts it queries `public_workouts`
and NOT `workout_history`, asks for no `created_at`/`duration_secs`/`hr_summary`, orders by
`workout_date`, still renders the profile and the workout row with its date, and that **no `HH:MM`
appears anywhere on the page**. Red-proofed at 5 failures against the pre-fix client, with the
"profile still renders" control staying green — which is what separates a real failure from a
broken fixture. The RLS half cannot be seen from a browser at all and is covered by the role-sims
above; the suite guards the client half, where a regression would silently query a table that now
returns `[]` and render an EMPTY list rather than an error — the failure nobody reports.

## ★★ THE PUBLIC PROFILE NO LONGER PUBLISHES A CLOCK TIME (Sep 2) — the Strava-shaped fix
Mo, on the inference audit: "having people find the arrival time is really creepy." He is right,
and the fix is the two-half pattern `public_profiles` already established.
**The leak was the pairing, not any one column.** `workout_history` was readable by
`owner OR profile_is_public(user_id) OR accepted follower`, and it carries `created_at` (the exact
finish INSTANT) alongside `duration_secs` — subtract and you have the arrival time of every session
ever logged, available to a caller holding nothing but the public anon key. Measured on real
non-migrated rows: **Friday finishes spread 1 minute, Tuesday 3 minutes**, derived arrival ~09:40.
Neither column is sensitive alone, which is exactly why nothing flagged it.
**Half 1 — the TABLE stops being public.** The SELECT policy is now `owner OR accepted follower`
(the block check unchanged); `profile_is_public(user_id)` is gone from it. **Half 2 — a
column-limited VIEW**, `public_workouts`: `id, user_id, day_name, exercises, unit, workout_date`,
joined to `profiles` on `is_public = true` and carrying the same `is_blocked_between` check.
Columns are listed EXPLICITLY for the reason `public_profiles`' own comment gives — a sensitive
column added to `workout_history` later must not leak automatically. Deliberately absent:
`created_at` (the leak), `duration_secs` (pairs with any timestamp to give arrival), `hr_summary`
(health data), `note` (free text; see below).
**Verified by ROW COUNT as four different callers, never by catching an exception:** signed-out
reads of `workout_history` went **69 -> 0** while `public_workouts` still returns 69; the owner
still reads 69; an **accepted follower still reads 69 WITH `created_at`**, which is what keeps
Friends Activity (`DiscoverScreen`, the only cross-user reader that needs a timestamp) working; and
a signed-in NON-follower now gets 0 from the table and 69 from the view.
**Followers were deliberately NOT narrowed.** They are people you approved, and every social app
shows friends exact times. The creepy case is the unauthenticated one.
**A side effect worth knowing: this shrank two of the "latent" findings by itself.**
`workout_history.note` and `hr_summary` are no longer reachable by a stranger at all — the column
is on a table the public can no longer read AND is absent from the view — so a future edit that
populates `note` now reaches accepted followers only, not the world.
**What deliberately SURVIVES, measured rather than assumed:** a workout you SHARE still carries a
public `posts.created_at`, set at share time. 56 of 69 sessions were shared, so the path is well
used — but per-weekday spread on shared posts is **20-231 minutes** against the finish times' 1-3,
because people share whenever they get round to it (one post landed at 00:17). So the acute leak —
a +/-3-minute arrival time derived from data nobody chose to publish — is closed, while a rough
window remains for posts the user explicitly published, which is the normal understood trade of
pressing Share. Stripping timestamps from social posts would be a strange product change; not done.
**Sim: `pw_publicprofile`** — drives the real `/u/` page and asserts it queries `public_workouts`
and NOT `workout_history`, asks for no `created_at`/`duration_secs`/`hr_summary`, orders by
`workout_date`, still renders the profile and the workout row with its date, and that **no `HH:MM`
appears anywhere on the page**. Red-proofed at 5 failures against the pre-fix client, with the
"profile still renders" control staying green — which is what separates a real failure from a
broken fixture. The RLS half cannot be seen from a browser at all and is covered by the role-sims
above; the suite guards the client half, where a regression would silently query a table that now
returns `[]` and render an EMPTY list rather than an error — the failure nobody reports.

## ★★ THE PRIVACY-BY-INFERENCE AUDIT (Sep 2) — the leak is the SCHEDULE, and the OG card never worked
Not "can a stranger break in" (the Sep 1 rounds settled that) but "what can a stranger DERIVE from
what we publish on purpose". That is the class that has actually hurt fitness apps — Strava's 2018
heatmap traced military bases with no account compromised anywhere. Seshd has no GPS, so the
equivalent axis here is TIME.
- **★ A PUBLIC ACCOUNT PUBLISHES ITS WEEKLY ABSENCE WINDOW, AND NOTHING IN THE UI SAYS SO.**
  `workout_history` is `owner OR profile_is_public OR accepted follower`, and it carries
  `created_at` (the finish instant) plus `duration_secs` — so subtracting one from the other gives
  the arrival time of every session, for the whole history, to an UNAUTHENTICATED caller holding
  only the public anon key. Measured on real non-migrated rows: **Friday finishes spread 1 minute
  (10:39-10:42), Tuesday 3 minutes (10:35-10:40)**, derived arrival ~09:40 on weekday mornings.
  Nobody ticking "public profile" is thinking "I am telling strangers when I am reliably not home".
  **This is not a broken policy — it is the feature working exactly as designed**, which is what
  makes it the Strava shape rather than a bug. Options if it is ever worth acting on, cheapest
  first: publish `workout_date` (a DAY) rather than `created_at` (an instant) to non-followers;
  or round the timestamp; or say plainly on the toggle what "public" publishes.
- **★ THE `/u/` LINK-PREVIEW CARD HAS NEVER WORKED, AND IS PRIVACY-POSITIVE BY ACCIDENT.**
  `api/profile-og.js` queries the BASE `profiles` table with the anon key. `profiles` is owner-only
  under RLS and the endpoint holds no user JWT, so `auth.uid()` is NULL and the query returns **0
  rows every time** — measured as `anon` with ALL THREE accounts public: base `profiles` -> 0,
  `public_profiles` -> 3. Every profile link ever shared has unfurled as the generic "Seshd - Lift
  heavy. Track everything." card. `PublicProfileView` in App.jsx does the SAME lookup against
  `public_profiles` and works — one feature, two implementations, one of them reached for the wrong
  table. **The fix is one word** (`profiles` -> `public_profiles`, whose own
  `is_public = true OR auth.uid() IS NOT NULL` filter returns only public rows to an anon key), but
  it INCREASES what is published, so it is a product decision, not a repair to make silently.
  **★ DECIDED, Sep 2: LEAVE THE CARD GENERIC — DO NOT "FIX" THIS.** Mo's call once the trade was
  put to him: the repair would start showing a person's real name and bio inside every
  iMessage/WhatsApp/Twitter preview of a shared link, forwarded anywhere, with no way for them to
  know. The dead fetch is DELETED rather than left in place (code that looks like it fetches and
  silently cannot is the class this repo keeps getting bitten by, and it cost a Supabase
  round-trip per unfurl); `api/profile-og.js` now carries the decision, the measurement and the
  one-line path back. Note the human path is unaffected either way — the endpoint still redirects
  into the SPA, which reads `public_profiles` itself and renders the real profile. This file is a
  serverless function, NOT part of the web bundle, so changing it needs a push but no OTA republish.
- **"PRIVATE" PROTECTS YOUR CONTENT, NOT YOUR SOCIAL GRAPH.** `follows_select_scoped` reveals an
  edge when EITHER end is public, so a private account's follows and followers are readable
  whenever their friends are public — and since public is the interesting setting, that is most of
  the graph. Same for a private account's COMMENTS on public posts (username + text, measured: 1
  visible). Both match Instagram's model and are defensible; the thing not to do is let the UI
  imply more than that. Pending requests ARE properly private — the policy's third clause requires
  `status='accepted'`, so only the two parties see a pending row (settled from the policy text,
  because the row COUNT was vacuous at 0 pending rows).
- **`PublicProfileView`'s `limit=5` IS COSMETIC — RLS ALLOWS THE LOT.** The UI asks for 5 recent
  workouts; a hand-written REST call with the same public key returned **69**. Never read a client
  `limit` as a privacy control.
- **Latent, not live:** `posts.location` is FREE TEXT the user types (there is no geolocation call
  anywhere in the app) and is used by **0 of 88** posts — but it is published to strangers on a
  public account, and "Gold's Gym" beside a 3-minute-wide Tuesday is a different fact from either
  alone. And `workout_history.note` exists as a column while every write path sends `""` — verified
  at all four finish call sites, the offline-queue replay, and the guest migration (whose `sess.note`
  is itself always `""`), with **0 of 123 rows** carrying one. The column is a loaded gun pointing at
  a public table; a future edit that populates it publishes free text with nothing to catch it.
**VERIFIED CLEAN, so it is not re-litigated:** `public_profiles` is 14 columns with no email, push
token, body log, age or workout notes; the base `profiles` table returns 0 rows to `anon` even with
every account public; `messages` and `groups` return 0; and against a DELIBERATELY private account a
signed-out viewer got 0 for findability, posts, workout_history, personal_records, comments-on-their
-posts and kudos — i.e. the Aug-25 comments/kudos three-way fix genuinely holds. The OG endpoint
HTML-escapes its output, strips the id to `[\w-]`, and embeds a STATIC image, so no avatar URL and
no tracking pixel reaches a third-party unfurler.
**★ AND THE PROBE LESSON, WHICH IS THE ONE THAT NEARLY PRODUCED A FALSE ALARM: THE FIRST ANON SWEEP
REPORTED ALL 17 COMMENTS AND ALL 25 KUDOS READABLE SIGNED-OUT, WHICH READS EXACTLY LIKE THE AUG-25
FIX HAVING REGRESSED.** It had not. **All three accounts in the database are `is_public = true`**, so
there was no private data for the check to fail against — a fixture that cannot fail, arrived at
through the DATA rather than through a bad selector. Only re-running it against an account
deliberately flipped private settled it. Check what the fixture makes POSSIBLE before believing
either a red or a green.

## ★ Sweep #7 (Sep 1, 2026) — the cleanest one yet, and the only errors are my own probes
**Postgres errors: 31 in 24h, and every single one is `app = mgmt-api`** — my own audit probes,
role-sims and rolled-back tests from the same day's security work. **Zero user-generated errors,
and zero 23505** — the `personal_records` duplicate-key story (1,650/day → 953 → 83 → 58 → the
missed call site) stays closed after the Sweep #6 fix. Auth logs quiet: 1 `/token` 400 (my own
deliberate wrong-password test of `username-auth`), 1 `/token` 200, 1 `/recover` 200, 1 Login;
no failed-login spike, no reset-email failures. `client_errors` newest row is **Aug 30**, the known
missing-push-entitlement message (a Mac-day item) — nothing since, and 98 rows is a months-long
cumulative total, not a burst. `code_redeem_failures` and `ai_usage` both at 0 rows, so both
opportunistic cleanups are working. **Orphaned `member_ids`: 0. Orphaned storage objects: 0** across
all three buckets (26 objects) — checked by resolving each object's own folder segment back to a
live `profiles` / `groups` row, which is the check the Aug-29 account-deletion sweep added. Table
sizes all proportionate to **3 profiles** (the persona wipe took it from 8): `posts` 3.1 MB / 88
rows is the workout jsonb and is the largest thing in the database.
**Advisors: nothing new, and every finding is already documented as deliberate** —
`public_profiles` SECURITY DEFINER, the two redeem RPCs, `profile_is_public`,
`group_image_member_check`, plus the two NEW-and-intentional ones from this week (`ai_usage` RLS
with no policy, `ai_quota_consume` SECURITY DEFINER, `authenticated`-only). Known-open unchanged:
pg_net in `public`, leaked-password protection (paid plan), and the two duplicate `workout_codes`
DELETE policies. Performance advisors are all scale artifacts of a 3-user database (unused indexes,
unindexed FKs on tiny tables, `auth_rls_initplan` on `typing_status`/`client_errors`/`feedback`/
`reports`) — nothing to act on until there are real users.
**Step 6, the pg_net tripwire, is now THREE numbers and all three are correct:**
`net_is_rest_exposed_BAD` false, `public_wrappers_BAD` 0, and the new
`select count(*) from pg_trigger where tgrelid='net.http_request_queue'::regclass and
tgname='aaa_pgnet_enqueue_guard'` = **1**. Add that third one to the sweep permanently — the guard
trigger is what makes the unrevokable grant inert, and a guard that silently stops existing is the
disease this whole file is about.
**★ AND THE ONE THING THE GUARD DOES NOT COVER, MEASURED THIS SWEEP: `net._http_response` IS
SELECT-ABLE BY `anon` AND `authenticated`** (verified with `has_table_privilege`; `anon` also holds
USAGE on the `net` schema). That table stores the RESPONSE BODY of every outbound call pg_net has
made — which for this project means webhook and edge-function replies, i.e. exactly the traffic
that carries service-role-authorised results. The enqueue guard stops a caller SENDING a request;
it does nothing about READING what legitimate server-side calls brought back. Same unrevokable
shape as the function grants (owned by `supabase_admin`, and `postgres` is not a member), so it is
not closable from here either. **It is inert for the same single reason: `net` is not in
PostgREST's exposed schema list**, so there is no HTTP route to that table — which is why
`net_is_rest_exposed_BAD` going true is not a "tidy up soon" item but a same-day escalation. Rows
are also short-lived (1 row present at sweep time, newest 20:10 the same evening).

## ★★ Sweep #6 (Aug 31, 2026) — THE personal_records 23505 IS BACK, AND IT IS A MISSED CALL SITE
**150 duplicate-key errors in one 8-second burst**, and this time it is NOT an old bundle
finishing its run: Mo's workout row was written at `15:12:23.650` and the errors ran
`15:12:23.808 → 15:12:31.659` — 158ms later, one POST per entry in his PR map, every one after
the first failing. **The Aug-28 fix named the conflict target at six sites and there were EIGHT.**
The two survivors both used a bare `sb.query("personal_records", …)` rather than
`sb.queueWrite(\`personal_records?on_conflict=…\`, …)`, which is why a grep for the URL pattern
missed them: `saveWorkout`'s PR loop (fires on **every finished workout**, over the whole map) and
the guest→account migration's PR upload. Both now name the target.
**The lesson is the one this file already records about consolidation, applied to a URL: grep for
the CONCEPT, not the variant you already found.** `grep 'personal_records?on_conflict'` reports a
tidy six and tells you nothing about the sites that spell the same write a different way. The
check that would have caught it is `grep -n 'personal_records"'` — the bare-table form.
**Everything else is clean.** Auth logs: 82 logins, all 200, zero errors or reset failures.
`client_errors`: ONE row in 14 days, the known missing-push-entitlement message (a Mac-day item).
`code_redeem_failures`: 0 rows, so the opportunistic cleanup is working. Orphaned `member_ids`:
**0**. **Orphaned storage objects: 0** across all three buckets (26 objects, ~31MB) — the Aug-29
account-deletion sweep is holding. Advisors: no new findings; every one is a documented deliberate
choice (`public_profiles` SECURITY DEFINER, the two redeem RPCs, `profile_is_public`,
`group_image_member_check`, `code_redeem_failures` RLS-with-no-policy) plus the two known-open ones
(`pg_net` in public, leaked-password protection needing a paid plan).
**Demo corpus: fresh enough, no shift needed.** Newest persona post 2-4 days old, every persona 3+
workouts inside the 7-day muscle-map window (`seshdreview` 5). It will need one in ~3-4 days.
**Housekeeping for Mo, not actioned unilaterally: SIX backup tables are now accumulating**
(`demo_shift_backup_20260828`, `demo_shift_backup_20260830`, `demo_shift_kudosfix_20260830`,
`orphan_image_backup_20260829`, `sharecode_rotation_backup_20260828`, `tbar_fix_backup_20260819`).
Each was correct to create; several are past the window they were insurance for. Drop them when
App Review clears.

## ★ Sweep #4 (Aug 29, 2026) — the personal_records fix is CONFIRMED, and account deletion leaked files
**The 1,650/day → 953 → 83 story ends here.** All 58 remaining `personal_records` 23505s landed in
a SINGLE hour (Aug 28 14:00) with 11 hours of silence after — one device on a pre-fix bundle
foregrounding once, replaying its stuck writes, then gone. The fixed client cannot produce that
error at all. The other ~25 errors were all mine (rate-limit tests, role-sims, the blocked
`storage.objects` delete). Auth logs clean, demo corpus fresh, advisors unchanged (the new
`code_redeem_failures` "RLS enabled, no policy" is the intended lockdown), `client_errors` silent
for 7 days.
**★ NEW CLASS FOUND: DELETING AN ACCOUNT CASCADED THE ROWS AND LEFT EVERY UPLOADED FILE BEHIND.**
Five orphaned objects in `images` (~608 kB) — and three belonged to a user id present in NEITHER
`auth.users` NOR `profiles`, i.e. a deleted account whose photos were still sitting at live PUBLIC
urls. `deleteAccount` deletes 13 tables and the auth identity and never touched storage. Fixed in
two halves, because the buckets are keyed differently and only one half can be done safely on each
side:
  * **`images` + `post-images` → the `delete-account` EDGE FUNCTION.** Both key objects under
    `{userId}/`, so the function enumerates exactly the caller's own files from the id it already
    resolves from the caller's own token — no path is ever accepted from the request body, which
    would let one user delete another's uploads. Paged (a long-lived account exceeds one page and a
    silent truncation would leave files behind). Files are cleared BEFORE the identity, and a file
    failure is never fatal: a stranded file is bad, a live login on an account the user asked to
    delete is worse. Counts come back in the reply so a failure is visible.
  * **★ AND THE EDGE-FUNCTION HALF WAS DEPLOYED BUT NEVER COMMITTED — repo and production
    diverged with nothing in the diff to show it.** `supabase/functions/delete-account/index.ts` in
    git had NO storage code at all while the deployed function was already at v2 with the full
    sweep. Anyone running `supabase functions deploy delete-account` from a clean clone would have
    silently reverted the fix. Same shape as the iOS-entitlements scar recorded further down this
    file: a change that lives only as remote dashboard/CLI state vanishes on the next deploy and
    the diff looks innocent. **When a fix has a server-side half, commit the source in the SAME
    commit as the client half** — and when auditing one, diff the repo copy against the deployed
    copy (`get_edge_function` via MCP) rather than assuming they match.
  * **`group-images` → the CLIENT: LOOK UP before the row-delete loop, DESTROY after it.** That
    bucket keys objects under `{groupId}/`, so the function cannot find them by prefix; the paths
    exist only in `group_posts.image_url`, and the loop is about to delete those rows.
    **★ THE FIRST VERSION OF THIS SHIPPED WITH THE ORDER INVERTED, AND THE COMMIT MESSAGE DEFENDED
    IT WITH REASONING THAT WAS SIMPLY WRONG** ("one line later and the files are unreachable
    forever" — untrue: the GET already materialises the paths into a JS array, so only the LOOKUP
    is order-constrained, never the deletion). It deleted objects and then deleted rows, which is
    the exact shape **"DESTROY THE ROW FIRST, THE OBJECT SECOND — AND ONLY IF THE ROW ACTUALLY
    DIED"** was written against, with a worked counterexample already in this file 6,000 lines away
    in the undo-finish cascade. Failure it would have caused: the `group_posts` DELETE times out
    (20s, and this flow makes 14 sequential calls) → every OTHER member of that group is left
    staring at a permanently broken image the poster can never repair, because their account is on
    its way out and their History is gone. Correct shape now: collect paths, run the loop, then
    delete objects gated on `groupPostsDeleted`. Found by cold-context audit, not by any test.
    **The authorization note here was ALSO wrong** and is worth correcting rather than deleting:
    the policy is `group-images: author or creator delete` =
    `owner = auth.uid() OR auth.uid() = groups.created_by` — **owner-or-creator, NOT membership**
    (`group_image_member_check` gates SELECT and INSERT only). It works today because the uploader
    owns the object, but a null-`owner` object deleted by a non-creator member 403s — and
    `deleteGroupImage` does a bare `fetch` with **no `res.ok` check**, so that failure is totally
    silent. Null owners demonstrably occur here: all 12 `post-images` objects have one.
  * **NOTHING IN THE BATTERY DRIVES ACCOUNT DELETION.** No `sim_*`/`pw_*` references
    `deleteAccount`, so "51 sims + 58 suites green" was true and VACUOUS for this change — the
    highest-stakes write in the app gained a new failure path under a green tick that could not
    have gone red. `pw_postimgdelete` §3 polices exactly this contract for the post-delete path and
    is the ready template if this is ever guarded.
**Verify orphanhood by scanning EVERY text/jsonb column**, not the two you remember — that is how
these five were confirmed. Backup: `orphan_image_backup_20260829`. Deleted via the documented
disposable-edge-function + `net.http_post` route (SQL deletes are refused by
`storage.protect_delete()`, correctly), then retired to a 410 stub. It should not be needed again.
**Front raises no longer credit Traps** (Mo's call, extending the flies→Shoulders reasoning): all
three variants are shoulder ISOLATION, so the trap involvement is postural rather than a working
half-set. Lateral raises KEEP their Traps credit — upper-trap contribution to scapular upward
rotation through abduction is real, if debated. **Squat/leg-press → Hamstrings & Calves was raised
and deliberately LEFT** (Mo's call): genuinely contested in the literature, unlike the isolation
cases.

## ★ The doomed-group image sweep couldn't delete what it existed for, and my fix for that made it worse (Aug 29)
Two rounds on the same twelve lines, and the second is the more useful lesson.
**★ ROW-FIRST WAS THE WRONG RULE HERE, AND AUTHORIZATION IS WHY.** The client-side created-group
pass deleted the `groups` row and THEN the `{groupId}/` objects, applying the house row-first rule.
But the storage policy is `owner = auth.uid() OR auth.uid() = (select created_by from groups where
id = <folder>)` — **once the row is deleted that subquery returns NULL**, the creator branch
evaluates to NULL, and the caller can no longer delete any object they do not personally own. That
is exactly the other-members' photos the pass was written to reach. Proven in a rolled-back probe:
predicate `true` with the row alive, `null` after. And `deleteGroupImage` is a bare `fetch` with no
`res.ok` check, so it failed **silently**; the battery could not see it either, because
`pw_deleteaccount`'s stub fulfils every storage DELETE with 204 (the a-stub-that-accepts-anything
class). Objects go FIRST for a group that is guaranteed to die — which is what CLAUDE.md already
said, and what the edge-function version did before it moved client-side. **Row-first exists so a
FAILED row delete cannot strand a LIVE post with a dead image; it does not apply where the row is
certain to die.** Two rules, two cases; check which one you are in.
**★★ AND THE "FIX" FOR THE ADJACENT FINDING TRADED A DETECTABLE PROBLEM FOR AN IRREVERSIBLE ONE.**
The same audit noted the client's "sole member" test ignores whether the other members still EXIST,
while the trigger requires a LIVE heir — so the two disagree for a group whose only other member is
a stale uuid. True, and I "fixed" it by resolving liveness first. **That was worse, and the battery
caught it**: a liveness lookup that fails, times out, or simply returns `[]` is indistinguishable
from "everyone else is dead", so uncertainty routed straight into the destructive branch —
`pw_deleteaccount` 5c went red with "a group was deleted on the hand-over path". Reverted. The
asymmetry is the whole argument and is worth stating as a rule: **skip when you should delete costs
an orphaned file — detectable by the sweep, recoverable, harms nobody's content; delete when you
should skip destroys a group and every member's posts, irreversibly, for people who did not ask.
Uncertainty must resolve toward preserving data.** A disagreement biased the safe way is not a bug
to close.
**Also fixed from that audit:** the transfer branch now drops OTHER stale ids too, not just the
leaver (`array_agg` filtered on `exists profiles`, verified in a rolled-back probe), so
"member_ids contains only live profiles" is an invariant rather than usually-true; the group card
in `GroupDetail` still used the filled `PRTag` per exercise after the feed card moved to the gold
trophy — two answers to "how does a per-exercise PR look", the N-copies-drift class in icon form,
and that card has no header badge at all so it was pure repetition; the now-unused `PRTag` import
went with it; and the doomed-group DELETE is checked by ROW COUNT rather than the absence of a
throw. Verified clean by the same audit and worth not re-litigating: the trigger survived every
probed hole (NULL member_ids, duplicate leaver, all-other-members-dead, claims restore byte-identical),
the client IS authorized for both halves, and the nav `accentInk` choice was load-bearing —
`accent` measures 2.88–2.99:1 composited over the light pill, under the 3:1 floor.

## The live workout name is editable (Aug 29, 2026)
Mo: "now when doing a quick workout we can change the name?" It was stamped once at start
(`day?.name || "Quick Workout"`) with no way to change it, so every Quick Start shipped a post
whose headline was a placeholder — which is what he had spotted on the feed card. It is an input in
the live header now, styled as the text it replaces so the header does not grow a form.
**`dayName` is an IDENTITY key, not only a label**, which is the thing to know before touching it:
`finishWorkout` matches "volume vs the last time this session was trained" on it, and it is the
FALLBACK for relinking a session to its program day (the primary link is `dayId`, untouched by a
rename). So renaming a Quick Workout correctly stops it matching future unnamed Quick Workouts —
those genuinely are different workouts — while a renamed program day still resolves by id. Blank
cannot persist (an empty headline is worse than a generic one); it falls back on blur.
**★ AN `<input>`'s VALUE IS NOT IN `textContent`, AND TWO SUITES DETECTED THE WORKOUT SCREEN BY
FINDING THE NAME IN `innerText`.** `pw_workoutexit` and `pw_hideheader` both went red the moment
the name became editable — the invariant they protect was still true, their reach was not. Same
class as `pw_bbsheet` asserting `overflowY` on a panel that no longer owns the scroll: fix the
reach, keep the invariant. Both read the field's value now, falling back to text. Sim:
`pw_workoutrename`, which asserts the EFFECT — it types a name, finishes, and checks what actually
reached the server and localStorage, not merely that the field accepted input. Red-proofed against
static text, and made to FAIL CLEANLY rather than throw a TimeoutError on the first `.fill()`: a
red-proof should say what is missing, not stack-trace.

## The feed card declutter (Aug 29, 2026) — from a screenshot, and the numbers were never wrong
Mo: "I feel like we can do a lot better design wise", plus three specifics. **Every number on that
card was already correct** — what was wrong was how LOUD each one was, which is a class no existing
check could see.
- **★ THE PR BADGE APPEARED FOUR TIMES IN ONE CARD** (once by the username, once per PR exercise).
  The loudest element in the card, repeated, which is how a signal stops being one — the same
  failure as the Body Battery sheet's six lime numbers and the day rainbow. ONE filled `PRTag` in
  the header now says "this session had a PR"; per-exercise PRs are a quiet gold trophy, which
  still says WHICH lift. Same answer the Day Preview redesign reached (badge → gold + trophy).
  **★ THE FIRST CUT USED A 🏆 EMOJI AND THAT WAS WRONG TWICE OVER.** Mo: "I don't like the trophy,
  we need something more classy, fitting, premium." He was right on taste — an emoji is a
  full-colour bitmap that renders differently on every platform and cannot take the theme's gold —
  but the stronger argument is that **the app ALREADY HAS a PR marker**: `Icon name="trophy"` in
  `C.gold`, used in three other places (exercise picker, program day row, PR tile). Inventing a
  second visual vocabulary for the same fact is the duplicated-map problem in icon form. **Before
  adding an icon, grep for the one this app already uses for that meaning.** The wrapper carries
  the accessible name (`role="img" aria-label="Personal record"`) because `Icon` renders a bare
  `<svg>`, and it carries `data-pr-marker` because an SVG contributes NO textContent — the guard's
  original `/🏆/` text assertion would have silently gone false and read as "the marker vanished".
- **The share code was a full-width bordered panel** — the visually heaviest element in the card
  carrying its least important information. **Measured on live data: 43 of Mo's 80 posts contain a
  code and NOBODY else's do**, so it was in practice a permanent advertisement across half of one
  person's feed presence. It is an inline chip on the caption line now. It was never owner-gated —
  the chip renders on any caption containing a code; the reason Mo only ever saw it on his own
  posts is that he is the only person who has ever shared one. Moving it to the Workout tab was
  considered and rejected: that tab ALREADY has manual code entry, so "moving" it there is just
  deleting the discovery path.
  **★ AND IT MOVED AGAIN, TO THE ACTION ROW (Mo, same day): "can we move it all the way to the
  right? Maybe even same line as share/kudos/comment icons."** Right on both counts, and the
  reasoning generalises past this chip: the kudos/comment/share row is the card's ACTION strip,
  importing IS an action, and the right half of that row was dead space — so the chip found a row
  that already means what it means, instead of interrupting a sentence. Pinned with
  `marginLeft:"auto"` rather than `justifyContent:"space-between"` on the parent, so the three
  icons keep their tight `gap:4` grouping on the left instead of spreading across the card; and
  `maxWidth:"62%"` + ellipsis so a long code can never push the icons off. **The caption gate had
  to come back with it**: it was `(displayCaption || postCode)` while the chip lived inside the
  caption line, and leaving it that way would render a username with an empty sentence after it on
  a caption-less coded post. **When you move a child out of a conditional block, re-read the
  condition — it was written for the child that left.**
- **HR avg/peak now ALIGN.** They were already stacked, but the ♥ prefixed only the first line, so
  the digits started 8.4px apart. The glyph is its own column now, and `tabular-nums` keeps the
  numbers aligned when the digit counts differ (99 vs 111).
- TIME/VOL 14 → 12px. HR stays RED and stays its size (Mo's call).
- **The live workout's NEXT UP list is indented 14px** (Mo, from the same screenshot: "about 2
  spaces to the right"). The padding goes on `FlatRow`'s own div — which is also where the
  `borderTop` lives — so the hairline divider still spans the full list width while the content
  steps in. A `marginLeft` would have pulled the divider in with it, which reads as a narrower
  list rather than an indented item. Measured after: label at x=14, exercise name at x=28.
- **The ACTIVE NAV TAB is coloured instead of glowing.** Mo asked about a glow border on the nav;
  declined, and the reasoning is the house rule: a permanent glow on permanent chrome teaches the
  reader nothing and competes with the volt reserved for PRs, progress and the muscle map. But the
  active tab really was weak — distinguished ONLY by opacity (1 vs 0.45), same colour, same weight.
  Colouring it is EARNED colour: it tells you where you are. **`accentInk`, not `accent`** — on the
  light theme the translucent pill composites to a near-white surface where `accent` measures
  **2.71:1**, under the 3:1 floor for a graphical object; `accentInk` is 6.20:1 there and is simply
  `accent` on dark (10.78:1).
**★ AND THE GUARD FOR THIS TOOK THREE ATTEMPTS, EACH VACUOUS IN A DIFFERENT WAY — worth reading
before writing any layout assertion.** (1) The alignment check used a regex the OLD markup could
not match, so the red-proof reported `dx = null`: that proves the SELECTOR broke, not that the
pixels are wrong, and those are completely different findings. (2) Rewritten to compare the two
`<div>` left edges — which ALWAYS align, because they are block siblings; what was misaligned was
the GLYPHS inside them. It now measures a `Range` over just the numeral characters, which is what
the eye actually sees. (3) The PR check asserted "at most one filled chip per row" scoped to an
exercise row — a row holding exactly one restored chip satisfies that, so it passed on the very
build it was written to fail. It asserts ZERO filled chips plus a trophy in the row now. Final
red-proof reports real numbers: **8.4375px** of misalignment and **1 filled chip, trophy absent**.
A conditional check that skips now PRINTS `SKIP` — one that quietly never runs is worth nothing.

## Share on a feed post sends it to people you follow (Aug 30, 2026)
Mo: "When clicking on share under a feed post, that should share with friends or groups." He asked
about the interaction; the button was also **broken**, which is the stronger reason it changed.
- **★ NEVER BUILD A SHARE LINK FROM `window.location` — INSIDE THE NATIVE SHELL IT IS NOT A URL
  ANYONE ELSE CAN OPEN.** There is no `server.url` in `capacitor.config.json`, so iOS loads the
  bundle from its own scheme and `window.location.origin` is `capacitor://localhost`. **BOTH**
  share buttons were built that way — the feed post sent `window.location.href`, the profile sent
  `${window.location.origin}/u/<id>` — so every link either produced was a dead scheme the moment
  it left the phone. The web build is correct, which is exactly why it survived: it is right in
  every environment the battery can run in, and the red-proof of the new suite shows the old code
  copying `capacitor://localhost/` to the clipboard. `shareOrigin()` is the one answer (it mirrors
  `API_BASE`, which had already solved this for API calls); the profile link goes through it too.
- **THE SHARE IS A LINK, NOT A COPY — and that is the whole privacy design.** Republishing someone
  else's workout card into a DM would hand their training to people the poster never approved,
  walking straight past the follow-approval model. A link carries no content, so the recipient
  still has to pass the ORIGINAL poster's RLS; if they can't they see "This post isn't available"
  and nothing has leaked. No new policy, no new column, no new RLS. `pw_sharepost` 3f asserts the
  message body does NOT contain the workout's numbers, so if that ever changes the suite says so.
- **Recipients are people you FOLLOW and groups you're in**, plus a **Copy link / Share via…** row
  under the picker for sending outside the app (Mo asked for both in a follow-up). A group share
  is a plain `type:"text"` group_post carrying the same link — never a copy of the card, for the
  same reason the DM isn't one. It deliberately sets **no `client_id`**: that column dedups a
  workout re-shared to a group, so borrowing it would both mean the wrong thing and make a second,
  intentional share silently overwrite the first.
- **`SharedPostLink` is the ONE renderer for "text that may carry a shared-post link".** The chat
  bubble and the group feed both show shared posts; writing the markup twice would have been the
  N-copies-drift class on day one. It takes `ink`/`tile` so each surface paints it correctly (a
  chat bubble sits on `C.primary` when it's mine, a group post sits on a card) and returns the
  plain text unchanged when there is no link, so an ordinary caption is untouched.
- **A mixed recipient list has no good noun, so the toast dropped it.** "Sent to 1 chat" reads
  badly for a person and "1 person" is wrong for a group — it is a bare **"Sent"** for the single
  case and `Sent to N` for several. Caught by the suite's stale assertion, then by reading it
  aloud, which is the standing rule for any two lines that form a sentence together.
- **`Icon name="link"` was ADDED rather than borrowing `package`.** The house rule is to reuse the
  glyph this app already uses for a meaning; there was none for copy/link, and a box icon labelled
  "Copy link" is the duplicated-map problem in reverse — the right fix is a new case, not a
  near-miss.
- **A post link rides the already-claimed `/p/` path, and that was not a style choice.** iOS caches
  the AASA at INSTALL time, so a NEW universal-link path cannot reach a build already on a phone.
  `/p/` was claimed and routed to share CODES; a post id is a uuid and a code is `IGNITE-`/`WO-`,
  so they are told apart by SHAPE (`POST_ID_RE`). The web half needed a `vercel.json` rewrite plus
  a boot-time read of `location.pathname`, since `/p/*` had never actually been a web URL.
- **`normalizePostRow` is now the ONE server-row-to-client-post mapping.** `loadFeed` owned it
  inline; the single-post fetch would have been the second copy — the volume-maths story again.
- **★ AN EFFECT THAT `setState`s ITS OWN DEPENDENCY CANCELS EVERYTHING AFTER THAT LINE.** The post
  fetch set `postView.post` and then, in the same async continuation, looked up an author the
  client had never loaded. Changing `post` changed the effect's deps, React ran the CLEANUP,
  `cancelled` flipped true, and the merge was skipped **every single time** — every post opened
  from a DM showed no name and no avatar, silently. Split into its own effect keyed on
  `postView?.post?.userId`. Found by driving the screen; nothing about the code reads as wrong.
- **★ AND THE ONE THAT MATTERED MOST: `chatPeerId` EARLY-RETURNS, SO AN OVERLAY IN THE MAIN RETURN
  DOES NOT EXIST INSIDE A CHAT.** The post view set its state and rendered nothing, so tapping a
  shared post in a DM — the single place shared posts arrive — did exactly nothing. The hooks were
  fine (they sit above the early return, per the standing rule); it is the JSX that never ran.
  `renderPostOverlay()` is a hoisted function called by BOTH return paths. **When adding an
  overlay, check every `return` in `AppInner`, not just the last one** — and reach it the way a
  user does, because a direct `window.dispatchEvent` from the top-level screen passes on the
  broken build.
- **★ A `useEffect` DEP ARRAY IS EVALUATED DURING RENDER, SO IT CANNOT SIT ABOVE ITS OWN
  `useState`.** The first cut put the effects ~25 lines above `const [postView, setPostView]` and
  the whole app hit the error boundary with `Cannot access 'postView' before initialization`. The
  minified name (`ge`) said nothing; `npx vite build --minify false` gave the real one in one run.
  Worth reaching for immediately on any TDZ error.
- **Suite: `pw_sharepost`** (21 checks). It asserts the WRITE, not the toast — a local-only send is
  this app's dominant bug class — and its two absence checks ("a follower I don't follow back is
  absent") are gated on the sheet actually being open, because otherwise they pass on the very
  build the suite exists to fail. Red-proofed at 13 failures, failing CLEANLY rather than
  stack-tracing on the first missing locator. Fixture note: `loadUserData` rebuilds the social
  graph from `follows` and replaces `store.users` wholesale, so seeding `following` into
  localStorage alone loses it on the first foreground — seed through the STUB.

## ★ The "hosts missing from the early returns" TODO was WRONG — measured, then closed (Aug 30)
Mo: "Do the 'Still open, pre-existing'." I had written that the seven remaining `AppInner` early
returns mount none of ToastHost/ConfirmHost/ReportHost/SharePostHost, "so a toast fired from the
auth or onboarding screens has nowhere to land". **Instrumenting all four setters to record every
call plus whether a host was mounted, and driving the screens, says otherwise:**
- **The auth/signup screen and the guest auth-prompt fire NOTHING** — 0 calls of any kind.
  `src/lazy/AuthScreen.jsx` and `Onboarding.jsx` do not import `toast` at all, and neither
  `handleAuth` nor the onboarding `onComplete` calls it.
- **Exactly ONE call fires with no host mounted**: `loadUserData`'s "Couldn't load your data —
  check connection" during `!dbReady`. It is **QUEUED** — `toast()` pushes to `_toastQueue`
  unconditionally and `ToastHost` seeds `useState(() => _toastQueue[0])` on mount — and was
  verified VISIBLE on screen. That queue is precisely why it exists.
**So there is no live bug, and mounting hosts on the loading screen would be machinery for
nothing.** What was actually shipped is the small true thing: `confirmAction`, `reportContent` and
`sharePostTo` have NO queue and drop on the floor, so they now `devWarn` instead of vanishing.
**★ AND MY FIRST MEASUREMENT SAID THE OPPOSITE, BECAUSE A TOAST AUTO-DISMISSES.** One sample at
the end of the load window reported the toast never visible; polling the whole window found it.
**A single sample cannot tell "never shown" from "shown and gone"** — the same shape as every
other probe bug in this file, and it would have justified a fix for a bug that does not exist.
Also worth recording: the first run's auth-screen case never reached the sign-in FORM (it sat on
the marketing/welcome screen) and reported a confident 0. Check the probe arrived before believing
a zero — a screen you did not reach fires nothing by definition.
**★ AND THE PUBLISH AFTER IT HIT THE DOCUMENTED `cd` TRAP, WHICH IS WHY THAT RULE IS LOAD-BEARING.**
A chained `cd <scratch>/er6 && … && npm run build` left the shell in the scratch dir: the build
failed there, the zip was made from a STALE `dist`, and the resulting bundle carried
`stub.supabase.co` — the one failure mode that breaks sign-in for every user. The same chain had
already deleted the previous zip and its `sed` on `api/app-update.js` silently missed (wrong cwd),
so `LATEST_VERSION` briefly pointed at a bundle that no longer existed. Nothing was pushed. Recovery
was: delete the stub zip, rebuild from the repo root with absolute paths only, re-verify
`grep supabase.co` on `dist/`, re-zip, and re-verify by unzipping the FINAL artifact rather than
trusting the build log. **Never chain `cd` in a publish step; and verify the zip you are about to
ship, not the dist you think you built.**

## ★★ THEMES ARE PLURAL — phases 1 and 2 (Aug 30)
Mo, for people who don't like the lime. Two phases: make the system take N themes, then ship a
third palette that is genuinely liveable rather than a novelty.
**Phase 1 — the plumbing, and the crash nobody had to worry about before.** `THEMES[store.theme]`
was safe while the only two values came from a two-option toggle. The moment a theme can be ADDED
— or REMOVED in a later release while a phone still has it saved, or synced down from
`profiles.theme` — an unknown key resolves to `undefined` and the very next `C.bg` throws at the
top of the component: a boot crash on every launch, the PROGRAM_TEMPLATES shape. **`themeOf(key)`
is now the only way to read a palette** and falls back to the default; `themeIdOf(key)` normalises
the id so an unknown stored value cannot render a picker with nothing selected. `THEME_META` is
the registry, and `isDark` is read off the palette itself so a theme cannot disagree with its own
listing. Verified: `profiles.theme` is plain `text` with no CHECK constraint, so a new id persists
(checked, not assumed — a constraint would have failed silently through `queueWrite`).
**The picker is a LIST, not a segmented control.** Two pills fit on a line; four labels do not, and
shrinking the text to fit is how a control becomes unreadable. Each row shows the theme's name, a
one-line description and a swatch of ITS OWN bg/surface/accent — the point is previewing a palette
you are not currently looking at. Rows carry `data-theme-option` because **matching on label text
is exactly what broke `pw_switch`**: its `/^Light$/` found nothing once the row read
"LightWarm off-white canvas", so it clicked nothing and the check blamed the app for not
repainting. A stable hook beats text; both suites use it now.
**Phase 2 — `midnight`.** A cool blue dark palette. The only thing that had to change is the
ACCENT (volt is what is being objected to); everything else copies the dark theme's structure,
which was already measured. **What a palette may NOT own: `red` / `green` / `gold`.** They are
semantic — the body map's ramp interpolates them, PRs are gold, errors are red — so recolouring
them would change what the app MEANS. A theme owns its accent, not the vocabulary. Every pair was
measured before shipping: accent-as-fill with its ink 7.75:1, accent-as-text on its own tint
5.70:1, overlayEdge 3.40:1 against this theme's scrim, and the tightest text token (`muted`)
4.76:1 on surface.
**`sim_a11y` now sweeps EVERY registered theme**, reading the ids out of `THEME_META` — so adding
a palette automatically extends the check and one that fails contrast cannot ship green. (The id
scan had to be scoped to THEME_META's own block: an unscoped `{id:…,label:…}` match also picked up
report reasons, set types and tab names, and found 24 "themes" on the first run.)
**★ AND THE NEW THEME IMMEDIATELY EXPOSED A HARDCODED LEAK, WHICH IS THE POINT OF HAVING ONE.**
`GROUP_COLOR.Legs` was `#c8f135` — the dark theme's accent, baked in for every theme. Two bugs in
one literal: it collided with the accent's reserved meaning on the theme it came from, and it
painted a LIME bar on the palette whose entire purpose is that there is no lime. Found by
rendering Midnight and looking, not by reading. Now violet `#8b5cf6`, the widest open hue gap and
the only candidate measured to clear 3:1 on all three surfaces. These are CATEGORICAL colours
(they encode muscle group, which is earned) so five distinct hues is right — what was wrong was
one of them being the accent.
**Known and deliberately NOT fixed, for the next theme pass:** the other four `GROUP_COLOR` hues
are calibrated for dark and measure 1.8-2.8:1 on the light theme's white card (they are labelled
bars, not colour-only, so this is polish); the strength-level ladder's `Advanced` is also the volt
accent, but it sits in an ordered green→lime→orange→gold ramp where that position is defensible;
and `emptyMuscleCol` / the silhouette's `bodyCol` are keyed on `isDark` rather than the palette, so
they are neutral greys on a blue theme rather than tuned to it. Sim: `pw_themes` (unknown key does
not crash — red-proofed to the error boundary; every registered theme has a row; picking one
repaints AND writes to the server, since a local-only setStore is this app's dominant bug class).

## ★★ Themes phase 3: Arctic, Halloween, and a theme that brings ORNAMENTS (Aug 30)
Mo, after living with Midnight: *"we don't really have much that's a different color"*, plus a
white-and-blue theme like Strong's, a properly halloweeny Halloween, and a picker that opens and
closes instead of sitting open.
**★ "NOT MUCH IS A DIFFERENT COLOUR" IS AN ARCHITECTURAL FACT, NOT A FAULT IN ANY ONE PALETTE, AND
THE ONLY LEVER A THEME HAS IS ITS NEUTRALS.** The accent is deliberately reserved for things you
EARNED — PRs, progress, the muscle map, the streak (the whole point of the lime pass) — so on every
theme the other ~95% of the app is neutral by construction, and `red`/`green`/`gold` are semantic
and not a palette's to own. That leaves exactly one place a theme can add colour without changing
what anything MEANS: **tint the canvas, the borders, the dividers and the dim text toward the
accent's hue instead of leaving them grey.** Midnight does this faintly (`#0a0c12` is a blue-black
rather than `#0b0b0e`); **Arctic** does it properly — cool blue-white canvas `#eef3fb`, blue-grey
borders and dividers, `sub`/`muted` carrying the hue — and it is why it reads as a *blue app* while
Midnight reads as a dark app with a blue accent. Nothing new had to be wired for that: same 23
tokens, chosen differently. The alternative Mo might expect (a fully blue nav bar / chrome, like
Strong) is a STRUCTURAL change — new tokens plus call sites across the shell — and was deliberately
not taken with a submission pending; raise it as its own piece of work if he wants it.
Arctic's four semantic colours are a hair darker than the light theme's because this canvas is
deeper than the warm off-white one — same reasoning as light darkening them from dark's, and they
still mean the same things. Measured: text 14.6:1, sub 4.84:1, muted 4.69:1, semantics 4.86-5.06:1
against bg, white-on-accent 5.28:1, accentInk on its own tint 6.09:1.
**★ HALLOWEEN IS THE FIRST THEME THAT IS MORE THAN A PALETTE, SO `THEME_META` GAINED A `decor`
FIELD.** `ThemeDecor` reads it and renders cobwebs, dangling spiders and drifting ghosts. Five
constraints hold it, and each is a documented trap in this file rather than a preference:
`createPortal` to `document.body` (a `position:fixed` child inside the tab-swipe track resolves
against the TRACK the moment it takes a transform — the rest-timer bug); `pointerEvents:"none"`
plus `aria-hidden` (decoration must never eat a tap on a screen where the swipe already refuses to
start over 61% of the surface); **zIndex 150** — above every navigation-level overlay (nav 50,
profile 60, chat 65, post 70) so it is visible, below every sheet and modal (300+) so opening one
puts the ornaments BEHIND it instead of over what you are reading; transform/opacity only with a
`prefers-reduced-motion` escape (this layer is live on every screen, so an animated layout property
would repaint the whole app forever); and the placements are randomised **once** in a `useMemo`
with no deps — randomising per render makes the ghosts teleport on every state change, which in
this app is many times a second.
**★ AND THE PLACEMENT HAD TO BE MEASURED, BECAUSE MY READ OF THE FIRST SCREENSHOT WAS WRONG IN BOTH
DIRECTIONS.** Looking at it I concluded the corner webs were overflowing halfway across the screen;
`getBoundingClientRect` on the real layer said both are exactly 96×96 at the corners and always
were — what I had "seen" was the left web, the right web and two spider threads read as one long
line. The defect the same measurement DID find is the one I had not flagged: a 46-96px thread
parks the spider body precisely on the Workout/Exercises/History tab row, so both spiders sat on
top of the labels. Threads are 96-200px and the spiders hang in the outer 5-12% / 87-94% margins
now, where cards have padding and the header does not. Web ink also dropped to 0.34 alpha so the
wordmark wins; the spider keeps 0.5 because it is the punchline. **Screenshot, then measure the
thing you think you saw — a rendered image is evidence, your reading of it is a claim.**
Note `orange` and `accent` sit close together on Halloween: deliberate, not an oversight —
`C.orange`'s only real job in this app is the kudos FLAME, and a pumpkin-orange flame on the
Halloween theme reads correctly rather than colliding.
**The Appearance picker is a DISCLOSURE and starts closed.** Five themes is five rows plus five
swatches permanently at the top of Settings, pushing every other preference below the fold for a
control most people touch once. The collapsed row still NAMES the theme you are on, so collapsing
it does not hide the one fact the control exists to report, and one effect keyed on `showSettings`
resets it on every close path (Done, backdrop, drag-to-dismiss) instead of three handlers that can
drift. **The rows are CONDITIONALLY RENDERED, not `display:none`** — a hidden-but-present row is
still clickable by `el.click()` in a suite, which would let every picker check pass against a build
where the disclosure never opens. Absent from the DOM is the only version a probe cannot cheat, and
`pw_themes` 2b asserts the closed state FIRST for exactly that reason.
Sims: `pw_themes` grew section 4 (the decor layer is portaled to body, pointer-transparent,
`70 < z < 300`, aria-hidden, draws ≥5 ornaments, a tap at the screen centre reaches the app, and an
undecorated theme renders NO layer at all) and 2b-2f (starts collapsed, the row is a disclosure, it
names the current theme, opening it reveals all five). `pw_switch`'s `[race]` section had to open
the disclosure before it could click a theme — the documented "fix the reach, keep the invariant"
repair, third time on this picker. **Red-proofed individually, and one attempt failed as a
red-proof and had to be redone**: flipping `useState(false)` to `true` still passed, because the
reset effect fires on mount and forces it closed again — the mutation was neutralised by unrelated
correct code. Removing the `themeOpen &&` conditional entirely is what actually goes red. *A
red-proof that stays green proves the MUTATION was wrong at least as often as it proves the check
is worthless; find a mutation that reaches the behaviour before concluding either.*
**Skills for design: there is nothing new to install** — `SuggestSkills` returned zero results, and
`/impeccable` (already vendored in `.claude/skills/`) is the design pack. Its `npx impeccable
detect` is the half that has earned its keep; its generic rules lose to this file.
**Phase 4 candidates, NOT started:** the other four `GROUP_COLOR` hues measure 1.8-2.8:1 on the
light themes; the strength ladder's `Advanced` is still the volt accent literally; `emptyMuscleCol`
and the silhouette's `bodyCol` key on `isDark` rather than the palette, so they are neutral greys
on Arctic/Halloween rather than tuned to them.

## ★★ Themes phase 4: the four seasons, and a comment that shipped on screen (Aug 30)
Mo, after Halloween: *"make a winter, summer, maybe a fall and spring themed too."* Nine themes
now — Light / Arctic / Dark / Midnight, then a **SEASONAL** group of Spring / Summer / Fall /
Winter / Halloween, each with its own `decor` kind.
**Two lights and two darks on purpose.** Four light seasonals would all read as the same theme with
the hue nudged, which is the "palette that encodes nothing" problem arriving from a new direction.
Spring is blossom PINK, not spring green — green is both the light theme's accent family and a
semantic colour, so a green accent would collide twice; nothing else in the set is pink, which is
what makes it recognisable at a glance. Summer is sand + sea TEAL (the only teal). Fall's accent is
burnt sienna and **not amber, because amber lands on `gold`, which is the PR colour** — that is
precisely the `GROUP_COLOR.Legs` mistake (an accent baked into a semantic slot), avoided this time
by checking first. Fall and Halloween are the closest pair on accent and are separated by their
NEUTRALS: espresso-brown blacks versus purple blacks. Winter and Midnight are the closest pair on
accent too — pale ice versus saturated blue — and Winter's neutrals are deliberately a LIGHTER
slate so the two do not collapse into each other. All four measured before shipping; `sim_a11y`
sweeps every registered theme automatically, so a palette that fails contrast cannot ship green.
**★ A `//` COMMENT IN JSX CHILD POSITION IS TEXT, AND IT SHIPPED ON SCREEN.** Wrapping each picker
row in a `<Fragment>` (needed for the SEASONAL heading) moved a normal JS comment from *before* the
returned element into *children* position — so the live picker rendered four copies of
"// data-theme-option is the selector contract…" as body copy. **The entire battery stayed green**,
because every check in `pw_themes` selects on `data-theme-option` rather than on text. Found by
looking at a screenshot. `pw_themes` 2h now asserts no `//`, `/*` or `data-theme-option` appears in
the picker's rendered text (red-proofed by reinstating one). **When you wrap an element in a
Fragment or a conditional, re-read every comment that was sitting above it.**
**★ AND THE FIRST WINTER SCREENSHOT WAS ELEVEN SNOWFLAKES IN A TIDY ROW ACROSS THE HEADER.** A CSS
animation applies NO style before it starts, so with a positive `animation-delay` every not-yet-
started ornament sat at its un-animated resting position — `top:0`, full opacity — until its turn
came. Two fixes, and both are worth knowing: an inline `opacity:0` governs the gap (an animation
outranks inline style once it runs, so it only ever applies before), and the delays are **negative**,
which starts each ornament partway through its own cycle and distributes them down the screen
immediately instead of after a minute of waiting.
**Per-shape sizing, because a glyph's readable size depends on how it is drawn.** Snow is
line-drawn and reads fine at 9px; a FILLED leaf at 9px is a brown dot, which is exactly what the
first Fall screenshot showed. Leaves are 15-25px at higher alpha in three tones (seven identical
brown glyphs read as debris, not autumn), petals 13-21px. The petal path had to change too — the
first cut was a rounded ellipse and seven pink pills falling past the screen is not an association
this app wants; it is a teardrop now, and the leaf is lanceolate with a midrib rather than the blob
that rendered as an acorn.
**The mechanism is shared, not copied.** Snow, petals and leaves are ONE `Faller` with a different
glyph — the N-copies-drift rule applied to decoration. It is **three nested nodes on purpose**: a
single element cannot run a fall, a sway and a spin at once because all three write `transform`.
Outer falls, middle sways, inner spins. Summer gets a corner sun and rising motes instead: nothing
falls in summer, and inventing a glyph to fill the slot is how a set of themes stops meaning
anything.
**`impeccable detect` was re-run at Mo's request and is CLEAN** — the same 15 findings as before,
nothing new from the decor layer (it is transform/opacity only, which is what the detector wants).
Both `transition: height` hits are already-justified and should stay: one is a bar-chart column
that animates once on mount (its own comment says why the transform rule does not apply), the other
is the pull-to-refresh snap-back, which is `none` while the finger is down.
Sims: `pw_themes` 2e-2h (nine rows, the SEASONAL heading, no leaked comment) and 4i (each seasonal
theme renders its OWN kind with real ornaments and stays pointer-transparent — a theme whose decor
silently renders nothing is the `showGroupShare` "capability built, call site never wired" shape).
Red-proofed individually.
**Still not done, same list as phase 3:** the other four `GROUP_COLOR` hues measure 1.8-2.8:1 on the
light themes; the strength ladder's `Advanced` is the volt accent literally; `emptyMuscleCol` and
the silhouette's `bodyCol` key on `isDark` rather than the palette, so they are neutral greys on
every non-grey theme rather than tuned to it. Nine themes makes that last one more visible than it
was with two.

## ★★★ THE NINE-THEME AUDIT: `isDark` WAS A PROXY FOR A COLOUR PROPERTY, AND PROXIES BREAK (Aug 30)
Two cold-context Fable audits of the three theme commits, split so they could not overlap (palettes
+ picker + guards / the decor layer). The decor half found **no confirmed user-facing defect** —
it drove a 924-point `elementFromPoint` grid across three screens including a live workout, probed
the live position of every falling ornament mid-flight, and built the full z-index inventory to
check the 70 < 150 < 300 claim rather than taking the four numbers I quoted from memory. The
palette half found the real one.
**★★ `C.isDark ? C.onAccent : C.text` USED `isDark` AS A STAND-IN FOR "IS THIS THEME'S ACCENT
LIGHT?", WHICH WAS TRUE FOR TWO THEMES AND FALSE THE MOMENT A LIGHT THEME SHIPPED A DARK ACCENT.**
Nine sites, all real content on an accent fill: avatar initials everywhere (feed, comments,
activity, the 88px profile disc), the ONE REP MAX hero slab, the story-viewer's no-photo fallback,
the 11px how-to step badges, the avatar-edit "+". Measured on the shipped build and confirmed
independently by rendering each theme and reading the computed colour: **Arctic 3.08:1, Spring
2.64:1, Summer 2.75:1** — under the 4.5:1 text floor, and under even the 3:1 graphical floor on two
of them, so the "+" badge and the avatar initials effectively vanished. Each of those palettes
**already declared a white scoring above 5:1** and the idiom never looked at it.
**The fix is a token, not a smarter conditional: `accentFillInk`, declared per palette.** It could
NOT be solved by repurposing `onAccent`, and that was checked rather than assumed — `onAccent` is
also the ink on `C.green` (the done-tick) and `C.accent2` (the PR tag) and is correct there on all
nine themes (5.0-10.1:1); no single value clears both the light theme's mid-lime accent and its
deep green. Two questions, two tokens. After: 5.28 / 5.66 / 5.59, with light, dark and fall
byte-identical to before.
**Why nothing caught it, and what does now.** `sim_a11y` swept tokens against `bg` and `surface`
only — it has never been able to see content painted on a coloured FILL — and
`sim_accentbutton`'s header **blesses this exact idiom as the fix** for an older bug. New
`FILL_PAIRS` section in `sim_a11y`: every ink checked against the fill it is actually painted on
(`accentFillInk`/`accent`, `onAccent`/`green`, `onAccent`/`accent2`, `onPrimary`/`primary`) for
every registered theme. Red-proofed at exactly the 3.08:1 the audit measured.
**★ AND THE NEW GUARD FOUND A TENTH DEFECT ON ITS FIRST RUN THAT NEITHER AUDIT REPORTED:** Fall's
PR tag at **4.29:1** (`onAccent` on `accent2`). Lifted `accent2` #c8532e → #cf5a33. Second time a
guard has paid for itself the moment it was widened (the SVG `font-size` sweep was the first).
**★ `ACCENT_ON_SLAB = THEMES.dark.accent` PUT VOLT LIME ON THE REST TIMER OF EVERY THEME.** The
GROUP_COLOR.Legs shape again — one theme's accent baked in as a module constant for all of them —
on the element you stare at through every rest period of every workout, including Midnight, whose
entire stated purpose is that there is no lime. Contrast was never the issue (the slab is
near-black on every theme); brand coherence was. Retired in favour of a per-palette `accentSlab`.
Its guard **parses the two slab fills out of App.jsx** rather than keeping its own copy — a guard
that hardcodes the value under test is testing its copy — and throws loudly if that line changes
shape.
**Decor items from the other half, all fixed:** `@keyframes seshd-spin` was defined twice (the
decor layer's copy and the global stylesheet's, which `LoadingSpinner` uses) — byte-identical
today, but the decor copy is portaled to body and wins the cascade, so a later edit to either
would have changed the loading spinner **depending on which theme was active**; renamed
`seshd-decor-spin`. `pw_themes` 4g probed a single point (fine for the container losing
`pointerEvents`, blind to one child flipped to `auto`) — it sweeps a grid now and asserts the
property on every descendant. `4i`'s `kids >= 5` counted the `<style>` tag; it filters it out and
applies the full portal/z/pointer contract to all four seasonal kinds, not just Halloween.
**Verified clean and not to be re-litigated** (from the audits, independently measured): every
other contrast pair on all nine themes including `overlayEdge` against 0.6 *and* 0.7 scrims; theme
persistence through `_lastSettingsEditAt` with the base key correctly ordered ABOVE the recent
spread (the `bodyType` bug is not repeated); an unknown theme key driven from both localStorage
and the server row renders on the fallback with no error boundary; the decor layer does not remount
when re-rendered, so ornaments never re-randomise mid-session; reduced motion yields clean absence
rather than a parked row.
**Known and deliberately left:** reduced-motion users get no seasonal ornaments at all (making them
visible-but-static needs per-ornament static placement, since with the animation off every resting
position collapses to the top of the screen — the exact ugly row the negative delays fixed).
GROUP_COLOR's other four hues still measure 1.67-2.65:1 on the white card, now across four light
themes rather than one. The strength ladder's `Advanced` is still literal volt on every dark theme.

## ★★ The cross-theme colour pass (Aug 31) — a Fable review, and the guard that keeps finding things
Mo: "For all themes see if there's anything we can do better color wise", plus more decor per
season, a pumpkin on the landing buttons, and "the snow flakes don't look that great".
**★ `isDark` IS STILL THE DOMINANT COLOUR BUG, AND IT NOW HAS A THIRD SHAPE.** First it was a proxy
for "is the accent light?" (the `accentFillInk` scar). Then a module constant pinned to one theme's
accent (`ACCENT_ON_SLAB`, `GROUP_COLOR.Legs`). This pass found the rest of the family:
  * **`#ef4444` as destructive TEXT at ~12 sites** — Sign Out, Delete account, Remove, Clear all,
    the plate-calculator error, the "Remove exercise" row. Measured 3.38-3.76:1 on every light
    theme and 4.11-4.42:1 on Winter/Fall, against a `C.red` that clears 4.96-6.30 on all nine.
    The token existed the whole time; these sites never went through it.
  * **`C.danger || "#ef4444"`** — **`C.danger` exists in NO theme**, so the fallback always won. A
    dead token name is worse than a literal because it reads as intentional.
  * **the fresh-post "Now" indicator at `#22c55e`: 2.28:1** on every light theme, the worst text
    failure in the sweep.
  * **the streak badge, white on a hardcoded orange-500: 2.80:1 on all nine.** `C.orange` is dark
    on every light palette and light on every dark one, so `C.onAccent` is its exact complement —
    the same pairing the done-tick already uses on `C.green`. Now in `sim_a11y`'s FILL_PAIRS.
  * **the story ring, `linear-gradient(#d9ff4d,#a3e635,#4d7c0f)`** — the dark theme's accent family
    baked in, so the feed's story rings were LIME on Midnight, whose blurb is literally "no lime".
    `C.accent`→`C.accent2` now, which is near-identical on light and correct everywhere else.
  * **`LEVEL_COLOR.Advanced` was BYTE-IDENTICAL to the dark accent**, so a ladder position rendered
    in the colour this app reserves for things you earned. Lime-400 keeps the ramp, breaks the tie.
  * **the cold-slate chip family** (`isDark?"#1e1e1e":"#F1F5F9"`, six sites) — a blue slate on the
    WARM Light and Summer canvases, and 1.00-1.08:1 against Fall's espresso surface, where the chip
    simply vanished. `C.divider` is that role on every palette.
**★ `GROUP_COLOR` NEEDED A LIGHT SPLIT, WHICH `LEVEL_COLOR` HAS HAD ALL ALONG.** Measured on a white
card: Core 1.67, Pull 1.92, Push 2.54, Cardio 2.65 — all under the 3:1 graphical floor, now facing
FOUR light themes instead of one. The bars are labelled so nothing was unreadable, but a bar you
cannot see encodes nothing. Split per theme; Legs clears on both and is shared.
**★ THE BODY SILHOUETTE'S GREYS ARE DERIVED NOW, NOT KEYED ON `isDark`.** Two fixed literals left a
neutral-grey body on Midnight's blue-black, Fall's espresso, Winter's slate and Halloween's purple —
the largest shape on the profile screen, belonging to no theme. `bodyGreys(C)` mixes each palette's
own `bg` toward its own `text` (0.24/0.33 dark, 0.18/0.29 light) and reproduces the exact
relationships the literals encoded on all nine — **including themes that do not exist yet, which is
the whole reason to derive rather than hand-author nine more pairs.** `sim_a11y` parses the two
fractions OUT of App.jsx rather than keeping its own copy.
**★ SPRING WAS THE WEAKEST THEME AND IT WAS MEASURABLE.** Its canvas had a channel spread of 6
(light 3, arctic 13, summer 19), so "pale green-white, like new growth" rendered as the Light theme
with a pink accent bolted on — exactly the failure the Arctic note names. Spread is 11 now and the
borders and dividers carry it too. **The hue has to live in ALL the neutrals or it is a tinted
background, not a themed app.**
**Decor: every season got the three-part shape Halloween proved out** — something fixed at an edge,
something falling, something with its own motion. Winter icicles + snow + twinkles, Spring a blossom
branch + petals + butterflies, Fall a bare branch + leaves + leaves skittering along the bottom,
Summer a turning sun + clouds + motes. **The snowflake was redrawn**: the first was three crossed
lines with four stubs and read as an asterisk at any size; it is a six-arm dendrite now, drawn once
and rotated so all six arms are identical by construction.
**Four ornament placement bugs, all found by rendering and MEASURING rather than reading:** the
icicles covered 192px of a 428px screen; the corner branch sat on the Workout/Exercises/History tab
labels; the sun rays were twelve solid yellow wedges over the Quick Start card rather than glare;
and a cloud sailed across the "Start your first program" heading at 72% white. **Decoration that
makes copy unreadable is the one thing this layer must never do.**
**Seasonal MARKS** (pumpkin/snowflake/blossom/sun/leaf) on Quick Start, Friends Activity and Groups
— a separate mechanism from the ambient layer, because decor floats over the whole app and belongs
to nobody while a mark is part of a specific card. It reads the theme off **`C.id`**, which is why
every palette now carries its own id: the Discover tiles never see `store`. Mo tuned it twice from
screenshots — inline beside the chevron rather than pinned to the corner, then much larger, tilted
and well under half opacity. `MARK_TILT` is per kind: a leaf or blossom reads right at an angle, a
tilted pumpkin looks like it fell over, and a sun or six-fold snowflake is radially symmetric so
rotating either changes nothing but the bounding box.
**★ AND THE SCAR OF THE SESSION: I READ A PER-FILE `PASS` AS THE OVERALL RESULT.** `node
build/sim_undef.mjs | tail -2` printed "PASS src/engine/workout.js" and I took it for a clean run.
The actual verdict line was two lines further down and said FAIL: threading the accent into
`Confetti` had introduced a bare `C` in a component that never receives one — a live ReferenceError
on every PR. It cost a full 43-failure battery run to surface. **`tail` on a guard's output is the
same mistake as gating on a piped exit code; read the verdict line, not the last line.**
**Still open, unchanged:** `MUSCLE_STRIPE_INK`'s five light values clear 3:1 on Arctic with almost
no margin (3.03-3.17) — deepening Arctic's `bg` would put them under first. ConfirmHost's white on
`#ef4444` (3.76:1) stays as its own comment documents. The muscle-icon tiles are baked base64 art
and render the same purple figure on all nine themes.

## The seasonal marks became per-BUTTON, and Summer had been toned into invisibility (Aug 31)
Mo, from a device screenshot: the pumpkin is too small ("closer to double"), give every button a
different thing on every theme, Winter's Quick Start should be a snowman, Summer's decor can't be
seen at all, and Fall/Spring's branch should be bigger.
**★ A GLYPH THAT DOES NOT FILL ITS OWN VIEWBOX RENDERS SMALLER THAN THE `size` YOU SET, AND THAT IS
HALF OF "TOO SMALL".** The pumpkin's art occupied ~60% of its 24-unit box, so at `size` 46 the
pumpkin itself was ~28px. Every glyph is drawn edge-to-edge now, and Quick Start is at 62 — the
two together are the real doubling. **Check what fraction of the box the art actually uses before
reaching for a bigger `size`.**
**`THEME_META.mark` became `marks: { start, friends, groups }`** — one glyph per BUTTON rather than
one per theme. Three identical glyphs across Quick Start / Friends Activity / Groups is the
"palette that encodes nothing" problem in icon form: repeating a mark three times makes it
wallpaper. Fifteen glyphs now (pumpkin/ghost/spider, snowman/snowflake/fir, blossom/butterfly/
sprout, sun/wave/palm, leaf/acorn/tree). `pw_themes` 4j-4j4 asserts each slot's glyph AND that the
three are DISTINCT — a regression back to one shared glyph would otherwise pass every other check.
**★ AND THE CORRECTION FOR "TOO LOUD" OVERSHOT INTO "INVISIBLE".** Summer's rays first shipped as
twelve solid wedges over the Quick Start card; the fix took the effective alpha to ~0.05 and on a
real phone Mo could not see Summer's decor at all. Both readings came from a screenshot; only the
second was checked on a device. The middle: the sun is the anchor and carries real presence, the
rays stay glare, and **the clouds went BLUE-white — a white cloud on the sand canvas is ~1.05:1, so
the fix was the HUE, not more opacity.**
**Summer lost its rising motes** (Mo: "don't need suns floating in the background") — a second sun
is the one thing a screen with a corner sun does not need, and duplicating the theme's own anchor
is the same mistake as repeating one mark on three buttons. Gliding SEAGULLS and a palm anchored in
the BOTTOM-RIGHT replace them, which also puts decor in a corner Summer had nothing in. (It was
drawn for the bottom-LEFT first and Mo moved it right; the layer is anchored on one side only, so
the swap is two style keys — but the placement note below about which corner the NAV occupies is
about the pill's whole width and is unchanged by the side.) It carries COCONUTS at each crown,
added on Mo's ask after v3 was picked.
**★★ THE PALM WAS EVENTUALLY DRAWN BY A COLD-CONTEXT AGENT, AND THE THREE THINGS IT FOUND ARE THE
ONES MY FIVE ATTEMPTS NEVER REACHED.** Mo picked v3 of six; it iterated by rendering its own SVG,
LOOKING at the screenshot, naming what was wrong, and redrawing — six rounds, each judged at target
size, at 3x, and at 50% opacity over the real canvas. The findings, in order of how much they
mattered: (a) the serrations must be ASYMMETRIC sawteeth — a long ramp out to each peak and a short
sharp cut back on the tipward side — because evenly alternating teeth read as holly or oak, and
this single change is what made the fronds read as palm; (b) DRAW ORDER beat geometry at small
size — all dark fronds first, all light fronds on top, because interleaving them chops every
silhouette into fragments; (c) each frond's arch must bend DOWNWARD whichever way it points, since
rotating one fixed arched shape around the crown is exactly what produces a pinwheel. Plus a small
dark hub disc under each crown to close the star-shaped hole where seven tapering blade bases meet.
**The general lesson about the agent, though, is about the LOOP, not the model**: it could see its
own renders and judge them, which is the same thing that finally worked here manually — what it had
that I did not was a fresh eye and the patience to redraw six times.
**★ AND ITS PLACEMENT NEEDED A SEPARATE LAYER, NOT A SEPARATE POSITION.** Mo asked for the corner;
the corner is where the floating nav bar lives (measured: the pill spans x 14-414, y 868-918 on a
428x926 viewport). The decor layer is zIndex 150 and the nav is 50, so at the corner the trunks drew
straight over the Home button. The palm gets its OWN portal at **zIndex 45** — below the nav, above
nothing else — so it passes BEHIND the pill and the base is hidden by real UI rather than by the
viewport edge. `pw_themes` 4l1-4l7 pins that: portaled to body, pointer-transparent (container AND
every descendant), `0 < z < 50`, aria-hidden, and an `elementFromPoint` at the overlap proving the
nav is still on top. Red-proofed by putting it back at 150.
**★★ THE PALM TOOK FIVE DRAWS, AND WHAT ENDED IT WAS A REFERENCE PICTURE, NOT A BETTER ADJECTIVE.**
Four rounds of "looks bad" → redraw → "still looks bad" burned a lot of cycles; Mo then sent a flat
clip-art palm and the right answer was obvious in one look. **When two or three redraws in a row
miss, stop iterating on words and ask for an example.** Each miss was nameable and the names
generalise to any icon work here: (1) shapes rotated EVENLY through 360deg is a pinwheel, not a
crown — real ones fan into one hemisphere at uneven angles; (2) a blade that WIDENS toward its tip
is an agave leaf, not a frond; (3) a stroked trunk cannot taper, so it reads as a pole (fill a
wedge instead); (4) a rachis with drawn pinnae reads as a FERN — what makes a frond legible small
is a SOLID silhouette with deep serrations, not a skeleton with ribs; (5) one tree alone reads as
a sticker, two of different heights read as a place. The serrations are GENERATED by walking the
spine and alternating an outer and an inner offset, because hand-authored path data drifts as the
blade tapers and machine-generated teeth stay even.
**★ AND "HIDE THE BASE" CANNOT BE DONE WITH THE VIEWPORT EDGE HERE.** Running the trunks off the
bottom did hide the roots and drew them straight over the floating nav bar, because the decor layer
is zIndex 150 and the nav is 50. The reference's own answer — a SAND MOUND drawn last, over the
trunks — hides the base, keeps the tree clear of the nav, and costs one path. **When an ornament
must be occluded, occlude it with another ornament; the layer's z is fixed and it is above the
chrome on purpose.**
**★ AND THE PALM TOOK THREE DRAWS, EACH WRONG IN A NAMEABLE WAY** (Mo: "the tree needs to look
better... most importantly is the look"). (1) Fronds rotated EVENLY through a full 360deg is a
pinwheel, not a crown — a real palm throws its fronds into the upper hemisphere at UNEVEN angles
and lets the outer two droop past horizontal. (2) A blade that WIDENS toward its tip is an agave
leaf; a frond is a long narrow crescent that arches as it goes out, with a few teeth on the
underside for the pinnae. (3) A stroked trunk cannot taper, so it reads as a pole — it is a filled
wedge with a slight S and segment rings now. Lowered and shrunk so the trunk runs down behind the
nav instead of ending mid-screen, which is what made it look like it was floating.
**★ A ROTATION ANCHOR OUTSIDE THE VIEWBOX DRAWS NOTHING.** The palm's first cut put the crown at
(22,8) and then offset the svg to `top:-34 left:-30`, mapping the crown to (-8,-26) — so all five
fronds rendered off-screen and the only visible thing was a sliver of trunk. When a rotated group
vanishes, check where its rotation origin lands after the container's own offset.
**★★ THE SCAR: A PYTHON SLICE FROM `function X(` TO `function Y(` SWALLOWS EVERYTHING BETWEEN, AND
I DID IT TWICE IN ONE SESSION.** Deleting `Mote` by slicing to `function ThemeDecor(` also deleted
the seven ornament components AND the entire seasonal-mark block sitting between them; the repair
sliced the same way and deleted them again. Neither `sim_undef` nor the fast esbuild check caught
the first one on its own — **`npm run build`'s MISSING_EXPORT is what actually said "ThemeMark is
not exported"**, which is the documented "esbuild is not the real build" rule paying out again.
Delete a component by matching its OWN text, never by slicing to the next function; and after any
bulk removal, grep that every symbol you did not intend to touch still has a definition.
**★ AND I READ A GUARD'S `tail -1` AS ITS VERDICT AGAIN**, one commit after writing that exact scar
down. `sim_undef | tail -1` printed a per-file PASS while the real verdict two lines below said
FAIL with seven unresolved identifiers. Grep for `'^(PASS|FAIL) all'`, or read the whole output.
**★ AND A PERCENTAGE IS THE WRONG UNIT FOR "CLEAR OF THE HEADER".** The clouds kept landing on the
Workout/Exercises/History labels however small the percentage looked, because the tab row sits at a
fixed y (measured: 47-87 on a 428x926 viewport) while a percentage scales with the whole screen.
`top` is PIXELS now and the band is bounded against that measured number — verified by reading
every cloud's real `getBoundingClientRect().bottom` (30-34) against the tab row's top (47), not by
looking at a screenshot. A safe-area inset only pushes the tabs further down, so the bound holds on
device. The Spring/Fall branch got the same treatment: bigger was the ask, and further INTO the
corner is what keeps a bigger branch off the tab label.

## ★★ The audit of the corner-mark work: I shipped a regression on the App Review device (Aug 31)
A cold-context Fable audit of the five corner-mark/top-bar commits. Four findings, one of them
serious, and it is one I argued myself into.
- **★★ THE TOP-BAR INSET TRIM ONLY MADE SENSE FOR A NOTCH OR AN ISLAND, AND I SPENT IT
  UNCONDITIONALLY.** `max(calc(env(safe-area-inset-top) - 10px), 3px)` rests on the cutout being
  horizontally CENTRED while the row puts the logo hard left and the icons hard right. On a device
  whose inset comes from a classic FULL-WIDTH 20pt status bar — iPhone SE 2/3, and an iPad running
  this app in iPhone compatibility mode (`TARGETED_DEVICE_FAMILY = 1`, and **an iPad Air is the
  device App Review used**) — the clock is drawn hard LEFT and the battery hard RIGHT, exactly
  where this row puts its content. Trimming 10 of a 20pt inset put the wordmark at y ~12 and live
  tap area at y ~7, inside the band the system draws into.
  **And the comment I wrote to justify it was false**: "on a device with a small inset the bar is
  byte-identical" — a 3px FLOOR only protects an inset of 13 or less, and the regression band is
  13 to ~44. The floor was doing nothing for the case that mattered.
  Fixed by gating the trim on the inset being big enough to BE a cutout:
  `max(calc(env(...) - 10px), min(calc(env(...) + 3px), 23px))`. **Verified by evaluating the real
  CSS in a real engine at twelve inset values** rather than by arithmetic on paper: 0 -> 3,
  10 -> 13, 20 -> 23 (identical to pre-trim), 33 -> 23, 47 -> 37, 59 -> 49. Notch and island keep
  the full trim; everything below ~33 is back to the old behaviour.
  **The general rule: a trim justified by one device's GEOMETRY must be gated on that geometry
  being present.** `env(safe-area-inset-top)` is a distance, not a shape — it cannot tell you
  whether the thing it clears is centred.
- **A number tuned against another element's position has to be re-measured whenever that element
  moves.** `CornerBranch` was tuned so its ink ends at y 46.3 against a tab row at 47 — then the
  icon-padding change in a LATER commit of the same batch shrank the top bar and moved that row to
  43, so the leaves overlapped by 3.3px. -41 -> -46.
- A comment still claimed the spring grass sits at zIndex 150 one commit after it moved to 45.
- **★ THE PLANTED MARK HAD NO GUARD, AND WRITING ONE FOUND A FIFTH DEFECT THE AUDIT MISSED.**
  `pw_themes` 4m now asserts the placement MODE, not just which glyph renders: a kind in
  `MARK_PLANT` must carry `data-theme-mark-plant`, have its stem cropped by the card's bottom
  edge, keep its top INSIDE the card, and sit in a container that actually clips; a kind not in
  the table must stay a sticker. On its first run it caught the summer palm's crown being **cut
  flat by the card's top edge, 17.6px of it** — confirmed by a 4x screenshot before anything was
  changed. A trunk cropped along its length reads as continuing past the card; a crown cut flat
  reads as damage, which is the same distinction that keeps a spider from being planted at all.
  Palm shrunk 15%. Red-proofed at 8 failures.
  **Two probe bugs of my own, both caught before the result was trusted, and both about measuring
  the wrong box.** First it used the element's `getBoundingClientRect()` — but a planted glyph can
  be ROTATED about its base, and a rotated box includes empty corners, so the leaning palm looked
  broken when it was not. Then it took the union of `<path>` rects only — missing winter's fir
  trunk, which is a `<rect>`, and reporting the fir as not reaching the card edge when it does.
  Measure the INK, and remember that "the ink" is every drawn shape, not the one element type you
  happened to look at.
- **★ AND THE RUN THAT WAS MEANT TO VERIFY ALL THIS REPORTED "ALL PASS" WITH ONE SUITE MISSING.**
  `pgrep -f "http.server 8199" | xargs kill` in the SAME command line as `node build/run_sims.mjs`
  matches ITSELF — the documented sibling trap, reached from a new direction: it took out a
  battery child, the runner finished, and printed **`62 Playwright suites / ALL PASS`**. The
  missing one was `pw_themes`, the only suite that had changed. Exit code 144 was the other tell.
  **THE COUNT IS PART OF THE VERDICT** — `ALL PASS` over a silently smaller set is not a pass.
  Compare the printed suite count against `ls build/pw_*.mjs | wc -l`.

## ★★ THE NAV CLEARANCE WAS CHARGED TWICE ON HISTORY (Mo, Aug 31)
Mo: "See how you can't see around the nav bar at the bottom?" — a device screenshot of the History
tab with the keyboard up, a session card sliced off mid-row and an empty band between it and the
floating nav pill. **Exactly one element in a scroll chain may reserve the nav clearance: the one
that actually scrolls.** Same rule as "only ONE shell element may reserve the status bar", and it
was being broken here. The tracker tab's container is `flex:1 overflowY:auto paddingBottom:
NAV_CLEARANCE`, which is right for Workout and Exercises — measured, Exercises really does scroll
in it (scrollHeight 5027 vs client 883). **History does not**: it wraps its list in
`PullToRefresh`, whose own scroller is `flex:1` and already pays the 86px. So the child inherited
the parent's 86px shortfall AND added its own.
Measured at a keyboard-shrunk 572px viewport: the list was clipped at y **486** with the nav pill's
top at **506** and 172px of clearance for a 66px pill. After: the inner scroller runs 84 -> 572, so
content passes BEHIND the translucent pill and is visible through the glass — which is what
"seeing around the nav bar" means, and what the top bar's own deferred scroll-under TODO is aiming
at. Exercises is byte-identical (43 -> 572, padding 86, still scrolling).
**The tell was a scroller whose scrollHeight equals its clientHeight**: a container that pays for
clearance and never scrolls is paying for nothing and shrinking whatever is inside it. Enumerate
every `overflow-y:auto` ancestor with its rect and padding before assuming which one scrolls — the
first probe here grabbed the OUTER one and reported a perfectly healthy 43 -> 926, because the
History list had not loaded yet (`loadUserData` replaces history wholesale, so a localStorage-only
fixture shows "No workouts logged yet" — seed through the STUB).
**★ AND THE PLANTED MARK EXTENDED TO THE OTHER THEMES, WHICH IS WHERE THE TABLE PAID OFF.** Fall's
tree, Winter's fir and Spring's sprout are all planted now; Halloween's spider stays a top-right
sticker, because a spider is not planted and cropping one at the bottom edge reads as broken.
Two per-kind numbers had to be added rather than shared, and both were found by measuring, not by
eye: **insetX**, because the palm's trunk sits at 0.675 of its box and can stand 10px from the
corner while the bottom-CENTRED plants would lose half a crown there (44px); and a **size scale**,
because the palm LEANS so its crown swings down-left and a 140px box fits a 115px-tall card, while
an upright tree fills its box to the top edge and the same 140 cropped 13px off the crown. Only a
glyph that leans can be as tall as the palm.

## The top bar's icon cluster, and the halo variant that fits a tight row (Mo, Aug 31)
Mo circled the right-hand icons: too spread out. Measured, the whitespace between two 22px glyphs
was **28px — wider than the glyphs themselves** — because each button carried 11px of padding on
every side AND the row added a 6px gap on top of that. Padding is 9 and the three icon buttons sit
in their own **gap-0 group**, so the glyphs are 18px apart. The container keeps its 6px gap for the
CHIPS (rest timer, streak), which are separate objects and have to keep reading that way — setting
the container gap to 0 would have jammed those together too, which is why the icons needed a group
of their own rather than a smaller shared gap.
**★ `.seshd-hit`, NOT `.seshd-hit-y`, IS THE ONE THAT CANNOT BE USED HERE — the square halo is 44px
WIDE.** Buttons sitting edge to edge means it reaches past its own button and eats the neighbour's
edge, which is exactly what `build/tap_audit.mjs` exists to catch and what the `-y` variant's own
comment in the stylesheet says it is for. Measured after: the `::after` computes to **44px tall x
40px wide**, so the vertical target is a full 44pt and the horizontal is the button's own 40 — the
deliberate 4pt trade for the tighter spacing. Hit-tested on a 9x9 grid over each button: 100% of
every button's own area resolves to itself, zero steals.
**Probe note, and it is the documented whitespace trap again:** counting the sites with
`s.count('              style={TOPBAR_ICON_BTN}') + s.count('            style={TOPBAR_ICON_BTN}')`
reported **4** for three buttons — the 12-space string is a SUBSTRING of the 14-space one, so both
counts saw the same line. The replacement itself was correct (after the first pass that line no
longer has spaces immediately before `style=`), but the number was wrong; `grep -c` on the result
is what confirmed exactly 3.
**And the wrong screenshot got fixed first.** Mo's "tighten those up" arrived attached to the
exercise-detail screen and he later said he had posted the wrong image. The exercise-detail work
was kept — it stands on its own (20% less scroll, a duplicated session list removed) — which is
worth recording as the right call: **a fix aimed at the wrong target is still a fix if it is
independently correct; the thing to do is say so and then do the real one, not to revert it.**

## The planted mark, and a screen that listed the same sessions twice (Mo, Aug 31)
**★ "PLANTED" IS A TABLE, NOT A FLAG, BECAUSE ONLY SOME GLYPHS HAVE A BASE.** Mo drew it on the
Groups card: the palm filling the right half, trunk running off the bottom-right corner. That
placement only reads right for a glyph with a base — a cropped fir or tree reads as planted, a
cropped snowflake or ghost reads as broken — so `MARK_PLANT` keys the behaviour by kind and a kind
absent from it keeps the top-right sticker. Only `palm` is in it today; adding another is data.
Three things it has to carry, and each was needed: **the glyph's own base point** as a fraction of
its 24-unit box (the palm's trunk is at 0.675/1.033, not bottom-centre like tree/fir/sprout, so a
generic bottom-right anchor would not put the trunk in the corner); **a lean, rotated about that
base**, because the palm's crown sits only 5 viewBox units left of its trunk and without the
rotation the tree hugs the right edge instead of reaching across the card; and **`plantSize`
separate from `size`**, or one size for both would blow every other theme's sticker up to the
planted scale. The container needs `overflow:hidden` — that crop at the rounded corner is what
makes the trunk read as running off the card rather than stopping short of it.
**★ AND THE EXERCISE DETAIL SCREEN LISTED THE SAME SESSIONS TWICE.** Mo, from a screenshot of it:
"tighten those up." Spacing was the ask and spacing was tightened (band padding 28->14, tile
padding 10/12->8/11, every list row 11/14->9/13, section gaps 10->7) — but the real find was a
second **RECENT SESSIONS** block at the bottom rendering the same `historyData` the RECENT block
near the top already showed, in the WEAKER form: "3 sets", which this file already records as
telling a lifter nothing they want to know. The duplicate is gone and RECENT carries five, which
is what the lower copy showed. **Measured before and after on the same fixture: 1631px -> 1309px
of scroll, 20% shorter, with no information removed.** Same N-copies-drift class as the volume
maths, in content rather than code — and the same tell, that the copies had already drifted into
two different renderings of one fact.
**Method note:** the before/after was measured by `cp`-ing the working file aside, writing
`git show HEAD:src/App.jsx` over it, building, measuring, then `cp`-ing back — never
`git checkout -- <path>`, which WRITES AND STAGES and has silently reverted main here before.
`git status` checked after, as the standing rule requires.
**Non-finding worth recording so it is not re-chased:** Mo's screenshot showed the FRONT/BACK
labels and the Primary legend with no bodies above them, which looks exactly like the body-map
chunk failing to load. It is not: `BodyMap` renders a `MuscleIcon` while `useBodyMapData` is
pending and that fallback draws no FRONT/BACK labels at all, so their presence proves the data HAD
loaded. He had simply scrolled the figures up under the sticky header — the labels and legend sit
BELOW the figures, so they are what survives a small scroll.

## The sub-nav decor layer became a rule, not a one-off (Mo, Aug 31)
Mo: lighter and ~20% smaller palm, ~20% bigger Fall/Spring branch, "do they need more decor?"
- **The palm scales safely because the SAND MOUND is inside its viewBox.** It is what hides the
  trunk bases, so it shrinks with the tree and the "no roots, no visible base" property survives
  any size. 206x228 -> 165x182, opacity 0.5 -> 0.36.
- **★ THE BRANCH'S OFFSET IS DELIBERATELY *NOT* PROPORTIONAL TO ITS SIZE.** Measured in Chromium
  (env() = 0, which is the WORST case here — a real safe-area inset pushes the tab row down while
  the decor layer stays pinned to the viewport): the Workout/Exercises/History row starts at y 47
  and the branch's ink ended at 46.9, tuned to the pixel. Scaling the offset by the same 1.2 would
  have put the leaves at ~57, back on the labels — the exact failure the previous size bump had
  already been fixed for. 192x131 @ -26/-32 -> 230x157 @ **-41/-38**, which measures 46.3.
  **Anchoring it to `env(safe-area-inset-top)` was considered and rejected**: it would drop the
  whole branch 59px on device, straight onto the SESHD wordmark, to buy clearance the fixed offset
  already has there. Spring's blossoms hang lower than Fall's leaves (cy 72 vs 64) so its ink ends
  at 58.7 — into the row in Chromium, 47px clear of it on any real device.
- **★★ ANYTHING THAT TOUCHES THE BOTTOM EDGE BELONGS BEHIND THE NAV, AND THAT IS NOW A LAYER
  RATHER THAN A SPECIAL CASE.** `PalmCorner`'s zIndex-45 portal was written as a one-off; the
  moment a second ornament reached the bottom edge it reproduced the identical bug — Spring's new
  grass tufts grew straight through the Home and Profile buttons. `DecorBack` is that portal
  generalised (same `.seshd-decor-back` class, so `pw_themes`' portal/z/pointer contract covers
  every user of it instead of just the palm), and the sweep found a THIRD instance already
  shipped: Fall's skittering ground leaves were crossing the pill at 150. Rule: **150 is for
  ornaments that float OVER the app, 45 is for ornaments that are part of the GROUND** — and the
  occlusion that hides their base should come from real UI, not the viewport edge. Verified by
  `elementFromPoint` on all four nav buttons: every one hits its own button, none hits decor.
- **"Do they need more decor?" — the honest answer was an ASYMMETRY, not a wish for more.** All
  five seasonals already have Halloween's three-part shape. What Spring alone lacked was a BOTTOM
  anchor: Fall skitters leaves along it, Summer plants the palm in it, Winter settles snow on the
  nav, and Spring's petals fell out of a branch into nothing. Grass is what petals land on, so
  Spring got `GrassTuft` and Fall got nothing — it was already complete. **Before adding decoration
  because a theme "feels thin", name the thing it is missing that its siblings have.**
  `GrassTuft` reuses `seshd-dangle` rather than minting a tenth keyframe, with
  `transformOrigin:"50% 100%"` so the blades bend from the ground instead of pivoting about their
  middle — the whole difference between grass in a breeze and a windscreen wiper.
- **Probe bug worth keeping:** the measurement script found the corner branch as "the first `<svg>`
  child of the decor layer with a negative `left`". `GroundLeaf`'s left is `r(-6, 40)`, so a leaf
  mid-skitter matched first and the probe confidently reported a 21px svg at y 829 as the branch.
  Select by the property that actually identifies the thing (`width > 150`), not by one it happens
  to share with a sibling.

## Three device-screenshot fixes: the notch gap, mark size, and the palm that was still bad (Mo, Aug 31)
**★ THE DEAD STRIP UNDER THE CLOCK WAS ONE PADDING VALUE, AND THE ONLY WAY TO KNOW THAT WAS TO
READ WHAT ELSE RENDERS ABOVE THE TOP BAR — NOTHING DOES.** Mo circled the band between the status
bar and the SESHD row. For a signed-in, online user the offline bar and the guest banner are both
absent, so that entire strip is the top bar's own `padding-top`, which was
`env(safe-area-inset-top) + 3px`. **The full inset is Apple's clearance for content ANYWHERE across
the width, and it is over-cautious for THIS row**: the notch/island is horizontally CENTRED (the
island spans roughly x 151-277 of a 428pt screen) while this row puts the logo hard left and the
icons hard right. Measured against the tightest case — a Dynamic Island phone, inset 59, island
bottom ~48 — the full inset leaves 11pt of clearance doing nothing. It is
`max(calc(env(safe-area-inset-top) - 10px), 3px)` now: 13pt tighter on device (the old `+3` folded
in), and **the 3px floor makes it byte-identical wherever the inset is small or zero**, so the web
build did not move and the trim only ever spends headroom that exists. Verified in Chromium that
the bar is still exactly 47px with env() = 0.
**★ A ROTATED MARK PAINTS OUTSIDE ITS LAYOUT BOX, SO `top`/`right` ARE NOT THE MARGIN YOU THINK.**
Bumping the Discover tiles' marks 44 -> 62px pushed the tilted ones (palm, acorn, butterfly,
sprout) past the card: `MARK_TILT` is a paint-time `transform`, which does not affect layout, so a
62px glyph at 18deg paints ~7px outside its box on each side. At `top:2 right:4` the palm hung 6px
above the card's top edge and 3px past its right. Measured, not eyeballed — the probe reports each
mark's overflow against `closest("button")` on all five seasonal themes, and every value must be
negative. `top:10 right:12` clears it with the palm tightest at 2.9px / 4.9px.
**★★ AND THE SMALL PALM REPRODUCED, EXACTLY, EVERY FAILURE THE BIG PALM'S SIX REDRAWS HAD ALREADY
CATALOGUED.** Mo: "the palm tree there looks really bad." It was a STROKED line trunk (cannot
taper, so it reads as a pole) plus ONE teardrop blade rotated evenly around a point (a pinwheel of
agave leaves, not a crown) — the two named failures from the `PALM_SCENE` work, sitting in a glyph
nobody re-read when that work landed. **The fix was to share the geometry, not to redraw by hand**:
`frond`/`trunk`/`disc` are lifted out of the `PALM_SCENE` IIFE into `PALM_GEO`, and `PALM_MARK_PATHS`
builds a 24-unit tree through the same generators, so it inherits the asymmetric sawteeth, the
downward arch and the filled tapering trunk for free. **The one thing that does NOT carry across
scale is the frond COUNT**: the scene's crowns are 206px wide and read fine with seven, and the
same seven at 44-62px merge into a single blob with no silhouette left. Five longer, narrower
blades keep the gaps that say palm. Settled by rendering three candidates at 62px, at 44px, at 3x
and at the real 0.34 alpha and looking at them — the 3x view alone would have picked the wrong one,
because the density that ruins the small size looks lush when it is big.
**General rule from all three: when a redraw or a resize lands, re-read the OTHER places the same
thing is drawn.** The palm mark and the scene were one tree at two sizes and only one of them got
the lessons.

## Winter puts snow on the nav bar, and it is drawn INSIDE the pill (Mo, Aug 31)
Mo: "For winter, maybe add a little snow on the nav bar?" `NavSnow` renders a settled snow band with
three small icicles as the FIRST CHILD OF THE NAV PILL, gated on `themeDecorOf(C.id) === "snow"`, and
that placement is the whole design decision. The pill already sets `overflow:"hidden"` and
`borderRadius:26`, so drawing inside it clips the band to the pill's own rounded top edge for free
and the snow inherits the pill's shrink transform, staying attached while the bar animates. The
obvious alternative — an overlay positioned over the nav — would have had to re-derive the pill's
geometry (its padding, its radius, `env(safe-area-inset-bottom)`), which is a copy of a layout that
drifts the moment the bar changes. **When decoration has to sit on a specific element, put it in that
element and let the existing clip do the work; do not restate its geometry from outside.**
It is deliberately NOT part of `ThemeDecor`: that layer is portaled to `document.body` at zIndex 150
and belongs to no particular element, while this belongs to exactly one. Same reason `ThemeMark`
(the per-button seasonal glyphs) is its own mechanism rather than another ornament in the ambient
layer. `aria-hidden`, `pointerEvents:"none"`, no animation — it is settled snow, and the nav is the
most-tapped surface in the app.

## ★★★ THE INVISIBLE-OVERLAY CLASS, SWEPT EXHAUSTIVELY (Aug 30) — and the mirror case was the half nobody had looked at
Mo: "go deep into the invisible-overlay bug to make sure it's all clear for good." Inventorying
every full-cover overlay (`position:fixed/absolute` + `inset:0` + a zIndex) found **33**, but only
**five are navigation-level**: Activity and Messages at 40, the profile at 60, the chat at 65, the
post view at 70. Everything at 200+ is a portaled modal or sheet that covers all of them and is
opened from whatever is already on top, so it cannot produce this bug; and overlays with a small z
INSIDE one of those (a `moreOpen` menu at 50 inside the z60 profile) are in their parent's own
stacking context and are likewise fine. **The class only exists among those five.**
The first pass fixed one direction — presenting something that lands UNDER an overlay already up.
**The mirror case is presenting something BELOW them in the stack, and three live paths did it:**
- a **kudos/comment push** called `setShowActivity(true)` — Activity is z40, so with a profile,
  chat or post open it mounted invisibly;
- a **streak push** called `setTab("tracker")`, changing the tab under whatever was covering it;
- **`handleOpenCode`** switched to the tracker tab — reachable today by tapping the Import chip on
  a post opened from a shared link, i.e. inside the z70 overlay, so the code sheet opened on a
  screen the user could not see.
The full contract is now four helpers, and the rule is which of them you reach for:
`presentChat` (clears postView, KEEPS the profile so Message → Back returns to it),
`presentProfile` (clears postView + chat), `dismissOverlays` (clears all three), and
`presentActivity` (dismiss, then show). **Anything presenting a nav-level screen goes through
these; anything presenting something below them calls `dismissOverlays()` first.** A raw
`setChatPeerId`/`setProfileUserId`/`setShowActivity`/`setTab` that OPENS rather than closes is how
this returns a fourth time.
Guard: `pw_sharepost` §11 drives DM → shared post → tap author and asserts the profile is actually
PAINTED (`elementFromPoint`; `innerText` reports covered DOM). Red-proofed.

## One red→green ramp for the whole body map (Mo, Aug 30)
"The colour for body map in Volume is different than readiness and strength, they should all match
red to green (also makes theme easier I think?)." Correct on both counts. Readiness and Strength
both went through `_readyColor` (red → gold → green, interpolated from the AA-safe theme tokens);
**Volume was the only tab on `_heatColor`, a volt ramp with hardcoded per-theme RGB triples**. So
the same widget spoke two colour languages depending on a tab, and a new theme would have had to
hand-author two more triples for the odd one out — which is exactly the theming cost Mo intuited.
Volume now uses `_readyColor` too and **`_heatColor` is deleted**; its last other caller (the
per-muscle list's "4-9 growing" colour) moved to `C.green`, so the entire body map is now driven by
theme tokens with no bespoke ramp anywhere.
**The zero case is the detail that mattered**: `_heatColor` guarded `t <= 0` itself and
`_readyColor` does not, so a straight swap would have painted an UNTRAINED muscle bright red.
A muscle you simply have not trained is absence, not an alarm — that is the whole point of
`emptyMuscleCol`, and the guard moved to the call site. Verified by reading the rendered `fill` of
every `[data-muscle]` path on all three tabs in both themes: Volume shows reds/oranges with
`#525460` for the zeros, Readiness greens, Strength the no-data grey.
**Consequence worth knowing before someone reports it as a bug:** a mid-week map now reads REDDER
than the old volt ramp did, because red means "not yet at target" rather than "faint". The scale is
`t = sets/20`, so amber lands at 10 sets — the floor of the productive band — and green at 20,
which matches the app's own guidance and the per-muscle list's bands. If that ever feels punishing,
the knob is the curve, not the palette.

## ★★ THE INVISIBLE-OVERLAY BUG IS A CLASS, AND RAISING A Z-INDEX ONLY MOVES IT (Aug 30)
Third time in one session. z55: a chat opened from a profile mounted UNDER the profile's z60
portal. Fixed by going to z65 — and the Fable audit then found the same failure one layer up: a
"dm" push tapped while the POST overlay (z70) is open mounts the chat beneath it, and ChatView
still polls and PATCHes `read_at`, so unread DMs are consumed unseen. It also found the reverse on
three paths the previous commit's own comment claimed were impossible ("nothing in ChatView opens
a profile — verified"): true of ChatView, false of the POST overlay's `onUserClick`, the "follows"
push, and the `/u/<id>` universal link, each of which opens a profile at z60 while a chat sits at
z65 above it.
**The root cause is that a z-index cannot express a navigation STACK.** The same two screens want
opposite orders depending on where they were opened from — Message-from-profile wants chat above
profile; a follow push wants profile above chat — so no fixed assignment is right for both.
**`presentChat(uid)` and `presentProfile(uid)` close it by construction**: each dismisses anything
that could paint over the thing being presented (`presentProfile` clears postView AND chatPeerId;
`presentChat` clears postView, leaving the profile so Message-from-profile still stacks correctly).
All eight entry points go through them — push routing ×2, the universal-link handler, the post
overlay's author tap, MessagesScreen's `onOpenChat`, ProfileScreen's `onMessage`, the Activity
avatar and the story viewer. **Use them for any NEW entry point; a raw `setChatPeerId`/
`setProfileUserId` that opens (rather than closes) an overlay is how this returns a fourth time.**
Guard: `pw_sharepost` §11 drives DM → shared post → tap author and asserts the profile is actually
PAINTED (`elementFromPoint`, not `innerText` — an overlay does not remove the DOM beneath it).
Red-proofed: restoring the raw setter reports "COVERED by DIV".
**A source-level count of the raw setters was written first and thrown away** — it would have
broken on any unrelated edit and reported a number instead of a symptom. Behaviour where it can be
driven; this repo already has the rule that nothing in the battery should assert on source text.
**Probe bug worth keeping**: the first version of §11 asked `elementFromPoint` and rejected the hit
because the topmost node was the profile label's own parent BUTTON. "Covered" means the hit lands
on a DIFFERENT branch — test both containment directions, or a visible element reads as hidden.

## The sheet grab area is 44px, not the 20px the bar occupies (Mo, Aug 30)
"Make where you have to swipe down a little bigger instead of it just the edge of the sheet." The
handle's row was `padding:"10px 0 6px"` around a 4px bar — a **20px** target for a gesture that
needs you to land on it AND move without leaving it. It is 44px now, the same number `.seshd-hit`
uses everywhere else. **Real padding, not a `.seshd-hit` halo**: a halo would extend invisibly over
the first row of the list below and swallow its taps, which is the documented hazard that
`build/tap_audit.mjs` exists to catch. Growing the handle's own flex row pushes the content down
instead, so nothing overlaps. `pw_sheetdrag` asserts `>= 44px` (red-proofs at exactly 20).

## ★★ MODALS BLENDED INTO THE PAGE, AND NO SCRIM OPACITY COULD HAVE FIXED IT (Aug 30)
Mo, from a screenshot of the Close Friends picker: "the list kind of blends in, we have this
problem in a lot of lists." He was right, and it was systemic — **24 hand-built modal backdrops
with no shared rule**: panels on `C.surface`, on `C.bg`, on hardcoded `#0A0A0A`, scrims anywhere
from 0.45 to 0.95, border and shadow present or absent at random.
**★ THE MEASUREMENT IS THE WHOLE STORY, AND IT RULES OUT THE INSTINCTIVE FIX.** The picker's panel
was `background:C.bg` — the DEEPEST layer token — on a `rgba(0,0,0,0.6)` scrim, with no border and
no shadow. Panel vs its own backdrop: **1.04:1**. And darkening the scrim cannot help, because on
this theme the page is already near-black: `#0b0b0e` at 60% black is `rgb(4,4,6)`, and **even a
100% opaque scrim leaves `C.surface` at 1.24:1** (swept 0.6→1.0). The panel would have to become
light grey to clear the 3:1 graphical floor, which would wreck the dark theme. **So the EDGE is
the only lever**, and `C.border` (#33333d) is calibrated for a card sitting ON the page — over a
scrim it measures 1.64:1.
New token **`C.overlayEdge`**: `#5e5e6b` on dark (**3.21:1** against the backdrop, 2.66:1 against
the panel it edges), and simply `C.border` on light. **Light needed nothing** — a scrim over the
warm off-white canvas lands at `rgb(98,98,97)`, where the panel already measured 5.60:1. That
asymmetry is the point: the same modal is fine on one theme and invisible on the other, so
**measure a surface pair on BOTH themes before concluding either way**.
Applied as two shapes, deliberately not one: **six centred modals** (Close Friends, the group
workout picker, PlateCalcModal, Edit Profile, EditPostModal, and one ProfileScreen modal that had
neither border nor shadow) move to `C.surface` + a full `overlayEdge` perimeter + a shadow; **twelve
bottom sheets** keep `C.bg` and only get `overlayEdge` on their `borderTop`, because a bottom sheet
fills enough of the screen to read as a new surface rather than a floating card and only its top
edge faces the scrim. Repainting all twelve would be a broad visual change for a problem that lives
on one hairline.
**★ AND THE SWEEP MISSED SEVEN PANELS, INCLUDING THE MOST-SEEN MODAL IN THE APP.** The Fable audit
found `ConfirmHost` (every destructive confirm), `SharePostHost` and `ReportHost` still on
`C.border`, plus three bottom sheets in files the commit had already touched (AICoachModal, the
New Group sheet in DiscoverScreen — 280 lines from the Close Friends modal it *did* convert — and
GroupDetail's post menu). Worse, **Edit Profile got HALF the fix**: the surface was swapped and the
edge was not, because the replacement pattern required a `boxShadow` immediately after the border
and that one modal has none, so it silently matched nothing. All seven fixed; `grep -c
'borderTop:\`1px solid \${C.border}\`'` is now 0 across every source file. **A bulk style
replacement that requires two adjacent properties will skip the site that has only one — verify
the count changed, do not assume the pattern matched.**
**Scanner note worth keeping:** the inventory script flagged `BodyTrackingScreen.jsx:128` as a
blending panel; it is a 22px "Remove photo" button with an `rgba` background, not a modal at all.
A regex that finds `position:fixed` + an rgba background cannot tell a backdrop from a chip — read
every hit before acting on the count.
**And the verification honestly labelled**: the navigation to this picker could not be driven in
the harness (its All Friends/Close Friends toggle does not render in a fixture with no close
friends, and two attempts to reach a substitute modal matched the trigger BUTTON rather than the
modal — the documented "a marker both screens render cannot distinguish them" trap, twice). What
was verified is the part that changed: the real tokens, the real scrim and the real panel geometry
rendered before/after in both themes and looked at. The arithmetic above is exact; the on-device
navigation is not covered by a suite.

## ★★ A DM SWIPED BACK ONTO A BLACK SCREEN — AND index.css'S OWN COMMENT HAD NAMED IT (Aug 30)
Mo, from the device: "When I'm in a DM swiping to go back shows a black screen not what's behind."
`chatPeerId` was an EARLY RETURN from `AppInner`, so while a chat was open **nothing else was
rendered**. `EdgeSwipeBack` translates its own node aside and the strip it uncovers was the bare
`#0a0a0a` that `src/index.css` paints on the root. **That colour was chosen for this exact
gesture** — index.css's comment says so in as many words ("the strip behind the chat screen during
an iOS edge-swipe-back") — but painting the gap dark was a MITIGATION, never the fix, and
black-instead-of-white is still a black screen. Reproduced in Chromium before touching anything:
the chat had moved 200px and the vacated strip was empty.
Identical defect and identical fix to the profile screen's, which `pw_swipeback` was written for
after the same symptom — **the class survived because that suite only ever covered the profile.**
The chat is now an overlay inside the shell (`position:absolute; inset:0; zIndex:55`), so the
Messages list (or whatever you came from) stays mounted and slides in the way iOS does.
**zIndex 55 is chosen, not arbitrary**: above the nav's 50, so a DM still covers it exactly as it
always has — which is also why it needs no line in `switchTab`, that rule being for overlays the
nav floats OVER — and below the profile/post overlays at 60, which must open on top of a chat.
**This also fixes the host dead-zone at the root** rather than by the workaround one commit
earlier: `renderGlobalHosts()` existed because the chat return had to re-mount ToastHost/
ConfirmHost/ReportHost/SharePostHost by hand. The chat is no longer a separate return, so they are
simply there. `renderGlobalHosts` is kept — **the other seven early returns (publicRoute,
authLoading, recoveryNeeded, no-session, guest authPrompt, !dbReady, onboarding) still mount none
of them**, so a toast fired from the auth or onboarding screens has nowhere to land. Pre-existing,
not swept, and worth knowing before assuming a toast appears there.
**★ THE FIX EXPOSED A BUG THAT HAD BEEN INVISIBLE TO EVERY CHECK BECAUSE OF THE BUG ITSELF.**
With the Messages list finally mounted behind an open chat, `pw_sharepost` 4c ("no raw URL is
printed at the user") went red — on the LIST's thread preview, which had always rendered a shared
post's body verbatim: *"You: A workout on Seshd http://…/p/4444…"*. Nothing could see it, the
suite included, because the list was unmounted whenever a chat was open. `previewText()` collapses
it to "…· Shared a post". **A screen that is never rendered is never tested** — when an early
return becomes an overlay, expect its neighbour's latent defects to surface at once.
**Guard: `pw_chatswipe`** — drives a real edge-swipe out of a DM and asserts the Messages list is
in the uncovered strip. **Its own first draft matched `/Pally|MESSAGES/` and PASSED on the broken
build**: the chat header contains the peer's NAME, so the check was reading the very screen it was
meant to see past. Anchored on the list's own `MESSAGES` heading now. **A marker both screens
render cannot distinguish them** — and note 4c had to be SCOPED to the thread for the mirror-image
reason, since `innerText` now reports the list behind it (the documented overlay trap, from the
other direction).

## ★★ The audit of the share feature: SIX real defects, and the worst was the class I'd just "fixed" (Aug 30)
A cold-context audit of the two share commits found six confirmed defects plus one vacuous check.
The pattern worth keeping: **fixing one call site of a class is not fixing the class.**
- **★★ `renderPostOverlay` WAS ADDED TO THE CHAT RETURN AND THE FOUR GLOBAL HOSTS WERE NOT.**
  `toast`, `confirmAction`, `reportContent` and `sharePostTo` are module-level setters into
  components that live in ONE return; `chatPeerId` early-returns past it, so all four were silent
  no-ops inside a chat. On the post overlay opened from a DM — the one arrival path the feature
  exists for — Share did nothing, Report did nothing, Delete never raised its confirm sheet so the
  post was never deleted, and Edit set AppInner state that rendered nothing there and then popped
  a modal unbidden on the way OUT of the conversation. **PRE-EXISTING beyond this feature**:
  ChatView's own "···" Report button and its "Couldn't send" toast were in the same dead zone.
  `renderGlobalHosts()` is now called by both returns. **None of the OTHER early returns
  (publicRoute/authLoading/recoveryNeeded/no-session/guest/!dbReady/onboarding) mount the hosts
  either** — pre-existing, deliberately not swept here, and worth knowing before assuming a toast
  fires on the auth screen.
- **★ EVERY ACTION ON THE POST VIEW WAS DEAD, BECAUSE `handleKudos`/`handleComment` OPEN WITH
  `store.posts.find(...); if (!post) return`.** A post opened from a shared link is BY DEFINITION
  one the client has never loaded — that is the premise of the feature, and its own author-lookup
  comment says so. Tapping the flame ran its local pop animation and wrote nothing, anywhere, with
  no error. Rendering `postView.post` (a detached snapshot) broke it from the other side too: the
  optimistic `setStore` could never reach it. Fixed by MERGING the fetched post into `store.posts`
  — the established pattern, not a new one (ProfileScreen already merges a foreign user's posts in,
  deduped by id, for the same reason) — and rendering the live copy. `feedPosts` filters on
  `following`, so this cannot smuggle a stranger's post into the feed.
- **A THROWN FETCH IS NOT "YOU CAN'T SEE THIS".** The catch set the same `false` an empty result
  produces, so a 20s timeout rendered "deleted, or the person keeps their account private" — a
  false statement about someone else's settings — and the guard never refetched. Worse: open a
  link signed out, get refused by RLS, then sign in, and you stay latched on the wrong answer for
  the session with the URL already stripped. There is a third state (`"error"`) with a Try again.
- **`SharedPostLink` DISCARDED EVERY LINE AFTER THE FIRST.** Correct for the two-line body the app
  writes, wrong the moment Copy link shipped: paste a link, type "we should try this Friday", and
  that sentence is stored in the message row and rendered nowhere. It now drops only the URL line.
- **The blocked-user filter was not copied** from MessagesScreen's own people picker (the
  one-guard-didn't-get-copied class, again). Not a leak — `messages` INSERT carries
  `NOT is_blocked_between` — but it offered a recipient the app knows it cannot send to and
  reported the refusal as a connection problem.
- **Share was the only feed action without `requireAuth`.** Gated on the SEND half only; Copy link
  and Share via… need no account and a public post's link is public.
- **★ AND THE RED-PROOF CAUGHT MY OWN NEW CHECK BEING VACUOUS — TWICE OVER.** The kudos check
  passed with the fix reverted, because the fixture's shared post was ALSO the feed's post, so
  `store.posts.find` succeeded either way. Section 7 now opens a post the feed query never returns,
  authored by someone not followed, which is the real shape. And check 2c ("I am not offered as a
  recipient") could not fail because the fixture had no self-follow row — the app's own
  `u.id !== currentUserId` guard could be deleted with it green. Both fixed; all three fixes
  red-proofed SEPARATELY. Second scar in two days for the same trap: **restoring `src/App.jsx`
  from a scratch copy does NOT rebuild `dist`**, and the first red-proof run measured the stale
  bundle and reported the two results swapped.
- **Verified clean by the same audit, worth not re-litigating**: the link-not-copy design holds —
  the message body and the group row carry no workout jsonb, volume, sets or image, and `posts`
  SELECT is owner-or-public-or-accepted-follower AND `NOT is_blocked_between`, so a group member
  who does not pass the poster's RLS gets `[]`. `POST_ID_RE` is a fully anchored uuid and a share
  code is `IGNITE-`/`WO-`, so neither shape can match the other. Contrast measured on the new UI:
  "TAP TO VIEW" 6.78:1 light / 8.57:1 dark, the Copy link icon 4.86:1, the checked tick 15-17:1.
  The UNCHECKED ring is 1.27:1 — but that is the app's existing convention for every selection
  control, not something this feature introduced.

## ★★ THE "DELETE MY GROUPS" CHOICE SHIPPED INERT, AND A STALE uuid COULD BRICK DELETION (Aug 29)
A cold-context audit of the group-ownership work found two CONFIRMED defects in it, both mine, and
the second is the more serious thing this project has shipped in a while.
**★ THE CHOICE WAS SILENTLY DISCARDED — THE UI PROMISED ONE THING AND THE SERVER DID THE OPPOSITE.**
`deleteAccount`'s table loop deletes `profiles`, which fires
`trg_transfer_groups_on_profile_delete` and hands every created group to a live heir. The destroy
path lived in the EDGE FUNCTION, which runs LAST — so by the time it queried
`groups?created_by=eq.<uid>` the trigger had already changed `created_by` and it matched **zero
rows**. A user who read "The group and every member's posts in it are erased", picked it, and typed
DELETE got the group kept, handed over, every post intact, and **no error anywhere**. The feature
only worked on the path where the client's `profiles` delete FAILED. Fixed by moving the whole
created-group handling client-side, BEFORE the table loop — the only ordering that can work, since
the trigger fires the instant the profile dies. `handleCreatedGroups` and the `deleteGroups` body
flag are deleted from the edge function rather than left as dead code.
**★ AND THE GUARD COULD NOT SEE IT, BECAUSE IT ASSERTED A MESSAGE INSTEAD OF AN OUTCOME.**
`pw_deleteaccount` §5 checked that a `deleteGroups` boolean REACHED the edge function. It did —
into code that could never act on it. **Assert the effect, not the flag**: it now asserts a real
`DELETE /groups` happens, and that it happens BEFORE the `profiles` delete that would otherwise
transfer the group away. Red-proofed against the shipped-inert build, where the UI checks stay
green and only the effect checks fail, naming the cause.
**★ A STALE uuid IN `member_ids` PERMANENTLY BLOCKED ACCOUNT DELETION — proven live (rolled back).**
The trigger picked the heir with `... where m <> OLD.id limit 1` and never checked the heir still
EXISTS. `member_ids` has no FK, so any deletion path that isn't the app's own (dashboard, admin
API, manual SQL) leaves a dead id behind. Assigning it to `created_by` violates
`groups_created_by_fkey` → **23503** → the `profiles` DELETE aborts → the whole `auth.users` delete
aborts → the edge function returns `delete_failed` and the user is told to contact support,
FOREVER, until someone hand-edits the array. Account deletion must never be blockable by stale
data, least of all with App Review pending (5.1.1(v)). Fixed three ways: the heir must have a live
`profiles` row; selection is `unnest(...) WITH ORDINALITY ORDER BY ord` so "longest-standing" is
requested rather than assumed; and the trigger now scrubs `OLD.id` from EVERY group's `member_ids`,
not just created ones — closing the SOURCE of stale ids instead of merely surviving them.
`remove_user_from_all_groups` stays as an idempotent backstop.
**Repo/deployed divergence caught again**, comment-only this time: the deployed v5 carried a
sentence the committed copy had truncated, i.e. the deploy came from a working copy that was not
what got committed. Redeployed from the committed file (v6) and re-synced. **Diff the deployed
function against the repo whenever either changes** — `get_edge_function` via MCP.

## ★ Swipe-to-close was wired to 1 of 15 sheets, and broken on that one (Aug 29, 2026)
Mo, from the device: "the swipe down to close doesn't work on Body Battery sheet or any other
sheet." **Both halves were true and they were different bugs.**
**It was opt-in and only ONE caller had ever opted in.** `dragHandle` was passed to the Body
Battery sheet and to none of the other fourteen — the feature shipped believing "all nineteen
sheets can take it", which was a statement about the COMPONENT, not about the app. Same shape as
the dead `showGroupShare` UI: capability built, call sites never wired.
**★ AND THE FIRST FIX MISCOUNTED ITS OWN WORK — "nine sheets have it now" was false, it was
SEVEN**, leaving five dismissible sheets (ReportHost, ExercisePickerSheet, swap-exercise,
templates, and the group-create sheet) still without it, i.e. the same complaint could recur
verbatim. **11 of 15** have it now; the four without are the deliberately non-dismissible
`workoutSummary` and `AICoachModal` (both `onClose={() => {}}`), the small `postMenu`, and
GroupDetail's own sheet. Count the call sites with a grep before writing a number into a commit
message — an audit caught this one, nothing else could have.
**★ AND ON THE ONE THAT HAD IT, THE HANDLE SAT INSIDE THE SCROLLER.** The Body Battery panel is
itself the scroll container (`overflowY:auto` + `WebkitOverflowScrolling:touch`) and `Sheet`
rendered the handle inside it. On iOS a touch that begins inside a momentum scroller is claimed by
WebKit's compositor **before any JS runs**, and `touch-action:none` on a child cannot take it back
— the same class as the `pan-y` reorder grip, and equally invisible in Chromium. `pw_sheetdrag`
dispatched real TouchEvents, watched the panel follow the finger, and passed throughout. **When a
handle is present the panel is now a flex column and the caller's scrolling moves to an inner
element below the handle.**
**The guard is STRUCTURAL, because the gesture one cannot see this.** `pw_sheetdrag` now asserts
the handle has no scrolling ancestor. Red-proofed: restoring the old shape leaves every gesture
check GREEN and fails only the structural one — which is the whole lesson, stated once more: the
property is the bug, so assert the property.
**Two regressions the battery caught, both mine, both worth keeping as rules.**
(1) **Three sheets already drew their own decorative grab bar** (`width:36,height:4`), so enabling
the real one rendered TWO — and on the finish sheet, which has no `maxHeight`, the extra height
pushed its buttons out of the viewport. Grep for the hand-drawn shape before adding a component
that draws it. `GroupDetail`'s copy stays: that sheet has no `dragHandle`.
(2) **★ A WRAPPER BETWEEN A FLEX PARENT AND A `flex:1` CHILD SILENTLY KILLS THE SCROLL.** The first
cut wrapped children unconditionally. Settings manages its own column layout — fixed header plus
its own `flex:1` scroller — so the new non-flex div between panel and scroller left it unable to
scroll: Playwright scrolled, and Sign Out stayed "outside of the viewport". The wrapper is now
interposed ONLY when scroll keys were actually extracted (`needsInner`), and the flex defaults are
spread BEFORE the caller's `panelStyle` so a caller that declares its own layout still wins.
**A string with leading whitespace matches INSIDE a more-indented line.** Removing the duplicate
handles by `s.count(...) == 1` failed because the 14-space form is a substring of the 16-space one.
Match whole lines (`ln.strip() in targets`) when the only difference is indentation.
**`pw_bbsheet` needed loosening in the RIGHT direction**: it asserted `overflowY` on the PANEL,
which no longer owns the scroll. It now asserts that SOMETHING inside the sheet scrolls — still
red if nothing does, so the invariant it protects is intact while the node assumption is gone.

## ★ Account deletion, completed (Aug 29, 2026) — and MOST of the "gaps" were never gaps
Mo asked for the account-deletion completeness work to be taken on. **The first thing it produced
was a correction to the list that prompted it.** An earlier audit flagged `notifications`,
`typing_status` and `reports` as left behind; all three CASCADE. `profiles.id` cascades from
`auth.users`, and from `profiles` so do comments, exercise_notes, follows, group_posts, groups,
kudos, messages, notifications, personal_records, posts, programs, reports.reporter_id and
workout_history; blocked_users, typing_status and workout_codes cascade straight off `auth.users`.
So the edge function's auth delete already erases nearly everything, and **the client's 13-entry
table loop is largely redundant with its own last entry** (`profiles`). Measure the FKs before
believing a list of orphans — three of that list's four items were wrong.
**Exactly four user-referencing columns have no FK at all**, and the decisions were:
  * **`groups.member_ids`** (uuid[]) — a real bug, now fixed. A dead uuid stayed in every group
    forever, inflating the member count and satisfying `auth.uid() = ANY(member_ids)` checks for an
    id that cannot exist.
  * **`client_errors.user_id` / `feedback.user_id`** — ANONYMISED (`user_id = NULL`), not deleted:
    the value is the stack trace and the message, and unlinking the identity is what erasure
    actually requires. **Must be server-side** — both are INSERT-only under RLS (no SELECT/UPDATE/
    DELETE policy), so a client attempt is a silent 0-row no-op.
  * **`code_redeem_failures.actor`** — DELIBERATELY LEFT. Rows self-expire (opportunistic cleanup
    on each call keeps the table at 0), and erasing a user's failures on request would let someone
    reset their own rate limit by burning an account. Documented in-function so it is not "fixed".
**★ A SERVICE-ROLE CALL HAS `auth.uid() = NULL`, AND A TRIGGER THAT READS IT WILL REFUSE YOU.**
The member_ids fix first shipped as a plain PostgREST PATCH with the service key, and the live
end-to-end test returned **`groups/<id>:400`**. `enforce_group_creator_manages` reads `auth.uid()`,
which is NULL for a service-role call, so it saw a non-creator rewriting membership without
removing exactly themselves — and correctly refused. **The trigger was right; the caller was
wrong.** Its own rule already permits a member removing exactly themselves, which is precisely what
account deletion is, so `remove_user_from_all_groups(uuid)` (SECURITY DEFINER) sets a LOCAL
`request.jwt.claims` to act AS the departing member and satisfies the guard honestly rather than
disabling it. **EXECUTE is service_role-only** and that is load-bearing — `p_user` is an arbitrary
uuid, so an exposed grant would let any caller evict anyone from any group (verified by role:
anon/authenticated false, service_role true). Same `set_config` technique as the tbar and demo-shift
work; the new part is that it applies to your OWN server-side code, not just to migrations.
**★ AND `criticalFailed` WAS ABORTING THE ONE STEP THAT COULD HAVE SAVED IT.** A failed table
delete returned early and never called the edge function. That is backwards: an FK cascade bypasses
RLS and every per-table transport failure the loop could hit, so the edge function is strictly MORE
capable of erasing the data than the loop that just failed. Aborting left the user with their data
present AND their login live — the worst of both. It runs regardless now, and the outcome is
decided from the combination; the old copy also asserted "Your data was removed" unconditionally,
which was false on exactly the run where the loop had failed too.
**A 0-ROW DELETE IS A SILENT FAILURE, AND THE DETECTION WAS ALREADY BEING THROWN AWAY.** An
RLS-filtered DELETE returns 200 and raises nothing. `sb.query` already sends
`Prefer: return=representation` on EVERY request, so each DELETE hands back the rows it removed and
the loop was discarding them. Only `profiles` is checked (exactly one row must exist, so 0 is
unambiguous); for the other twelve, zero rows is legitimate and asserting on it would invent
failures. Do not generalise the pattern to a table whose SELECT policy is narrower than its DELETE
policy — representation is filtered by SELECT.
**Verified END-TO-END against the deployed function, not just in the stub**: two disposable accounts
created via SQL, signed in through `/auth/v1/token` and deleted through the real edge function via
`net.http_post` (the sandbox cannot reach supabase.co directly). Run 1 caught the 400. Run 2, as a
plain MEMBER of a group they did not create: `{"ok":true}` with no residueProblems, auth identity
gone, profile gone, telemetry anonymised, **group survived**, members 3 → 2, stale id absent, and
the real group byte-identical to its pre-test state. **A deployed function that has never been run
is unverified** — the stub suite cannot see any of this, since it stubs the edge function out.
**Sweep item to add (step 5):** `select count(*) from groups g, unnest(g.member_ids) m where not
exists (select 1 from profiles p where p.id = m)` must be **0**. It is the standing detector for
this whole class, and no Playwright suite can see it.
**★ RESOLVED (Mo, Aug 29): `groups.created_by` CASCADED, AND NOW OWNERSHIP TRANSFERS.** Deleting
a group CREATOR's account used to delete the group and, via `group_posts.group_id`, **every other
member's posts in it** — data loss for other people, where privacy only requires the creator's own
rows to die. Every comparable product (WhatsApp, Facebook Groups, Reddit) keeps the container and
moves or vacates ownership; Discord/GitHub/Slack instead BLOCK deletion until you transfer, which
was rejected here because Apple requires account deletion to be straightforward (5.1.1(v)) and
"hand over your groups first" is exactly the friction that invites a review question.
**How it works now:** `trg_transfer_groups_on_profile_delete`, a BEFORE DELETE trigger on
`profiles`, hands each group with other members to its longest-standing remaining member (the
first `member_ids` entry that isn't the leaver — the array is append-ordered) and drops the leaver
from the array. It runs BEFORE the row dies, so the FK no longer points at it and the cascade never
reaches the group. **A TRIGGER, not edge-function logic, on purpose**: it is then true for every
deletion path — the app's flow, an admin API delete, a manual SQL delete, a caller that doesn't
exist yet. A group where the leaver is the SOLE member is deliberately left to the cascade.
**The creator can still choose to destroy instead** — and they had no way to say so before, because
**there is no delete-group UI anywhere in the app** (only an unused `Group creator can delete` RLS
policy). The delete-account modal now lists the affected groups and offers hand-over (default) or
delete. The choice reaches the edge function as `{ deleteGroups: true }` — **safe to accept from
the body BECAUSE IT NAMES NOTHING**: it selects a policy for the caller's own created groups,
resolved from their own token, and can never reach another user's group. Anything that named a
group id would be an authorization hole.
**The image half is the part that is easy to get wrong.** A group that is about to disappear (sole
member, or an explicit delete) takes its `{groupId}/` objects with it, and once the rows are gone
NOTHING knows those paths — so `handleCreatedGroups` sweeps them FIRST, while the rows still name
them. That is the opposite ordering to the client's own group-image cleanup, and both are right:
there the risk is a live post with a dead image, here the row is guaranteed to die and the only
risk is an unreachable file.
**The trigger had to act as the departing creator** for the same `auth.uid()`-is-NULL reason as
`remove_user_from_all_groups` — `enforce_group_creator_manages` would otherwise refuse the
membership rewrite. Claims are saved and restored so the impersonation cannot leak into the rest of
the cascading transaction. Verified in a rolled-back transaction: shared group survived, ownership
moved to the other member, dead creator dropped from members, **the other member's post survived**,
solo group still deleted. Sim: `pw_deleteaccount` §5 (choice offered, default sends false, choosing
delete sends true, no owned groups → no choice); red-proofed by removing the UI and the body.
**Still open and NOT decided:** `reports.reporter_id` CASCADES, so deleting an account erases every
abuse report that person FILED. Probably fine (Apple cares about response time, not retention) but
it is Mo's moderation ledger and it is a one-line decision.
**Superseded note, kept for the reasoning:** Deleting a group CREATOR's account
deletes the group and, via `group_posts.group_id`, **every other member's posts in it**. That is
data loss for other people, not a privacy requirement — privacy only demands the creator's own rows
die. Blast radius TODAY is effectively zero (2 groups: one is Mo's own with 0 posts by others; the
other belongs to a demo persona whose password is random and unrecoverable, so it can never run the
flow). There is also a storage consequence: group images key on `{groupId}/`, so once those rows
cascade away nothing knows the paths and they orphan permanently — the leak just closed, reopened
by another route. Options are cascade-as-is / transfer ownership to the oldest member / soft-orphan
with a nullable `created_by`. **Not changed unilaterally**: it is a product decision, and whichever
is picked, the other-members' group-image orphan must be handled in the same change.

## ★ The audit that found MY OWN fix inert (Aug 29, 2026) — order beats intent
A cold-context audit of the settings-race generalisation found the guard was **inert for one of
its four fields**. `bodyType`'s base key sat AFTER the `recent` spread in the same object literal,
and **later keys win**, so the stale server value still overrode a just-made edit — the exact race
the commit claimed to close, still live. `unit`/`theme`/`strengthSex` were all declared above the
spread and were genuinely fixed; only this one was ordered wrong. **When a guard works by
overriding a value, its POSITION is the guard.**
**And `sim_settingsrace` shipped green on that build**, because it asked whether a field is
MENTIONED in the recent branch, not whether the mention takes effect. It now asserts the effective
order too. That check needed THREE attempts, each a different flavour of the same disease:
(1) it grabbed the store literal with a `setStore(prev =>` regex that matched the FIRST such call
anywhere in the file — a different component entirely — found no spread, and passed trivially;
(2) scoped correctly but tested "the guard claims this field" against everything from the spread to
the end of the literal, so three unrelated fields matched their own base keys and it flagged them;
(3) anchored on `const recent = sameUser` (unique) and scoped the claim test to the `if (recent)
return { … }` block alone. Red-proofed on the real defect: it names `bodyType`.
Other findings from the same audit, all fixed: **`Back Extension (Machine)` carried
`["Biceps","RearDelts","Forearms"]`** — byte-identical to `Assisted Pull-Up (Machine)`, a
copy-paste from the row block, so every machine back-extension session minted phantom half-sets of
three unrelated muscles (now `["Glutes","Hamstrings"]`, matching its two correctly-modelled
siblings); the Clear-all confirm read **"1 logged workout use them"** at n=1; and the custom-exercise
`onConfirm` derived its next list from the render-time `store`, which was harmless as a synchronous
one-tap action and became a real window once a confirm sheet sat in the middle of it — it computes
inside the `setStore` updater now.
**Open product questions the audit raised and did NOT act on** (they are training-science calls,
not bugs): **Traps is credited by 68 exercises**, the most in the app, including all three FRONT
RAISE variants — pure isolation, the closest analog to the flies→Shoulders case Mo already ruled
on. And **all 17 quad squat/leg-press variants credit both Hamstrings and Calves**, so a 4-movement
quad day mints ~2 phantom hamstring sets. Same shape as the shoulder over-count; worth asking Mo
before changing, since squat→hamstring credit is genuinely debated.

## ★★★ THE BUG CLASSES THAT REPEAT — and what now catches each (Aug 28-29, 2026)
Mo asked the right question after a run of findings: *which of these could be somewhere else?*
The answer, measured rather than guessed, is that TWO classes were never one-offs, and both are now
mechanically checked. Read this before concluding a fix is complete — "the one field that didn't
get the guard" has now happened THREE times in this file's history.
- **★ CLASS 1: ONE GUARD THAT DIDN'T GET COPIED.** A field gets a correctness guard; its neighbours
  with the identical shape don't. Instances: the sign-out audit (seven fields had the
  `currentUserId` fallback without the guard); `notificationPrefs` (the last field with the
  optimistic-write shape and no settings-race guard); and then **generalising that one found FOUR
  more** — `unit`, `theme`, `strengthSex`, `bodyType`, all `setStore` + immediate `profiles` PATCH,
  all server-preferred on reload, none stamping `_lastSettingsEditAt`. **`theme` is the most
  visible bug this project has had**: choose dark, and a foreground refresh landing before the
  write flips the WHOLE APP back to light. All self-heal on a later load, which is exactly why
  nobody reports them. Guard: **`sim_settingsrace`** enumerates every `profiles` PATCH that sits
  near a `setStore` and asserts each field is either in `loadUserData`'s `recent` branch or named
  in an EXEMPT list *with a reason*. A new toggle added without protection FAILS the battery.
  Red-proofed two ways (drop one field; delete the whole guard block).
  **Its own first draft could not see the bug it was written for**: an 8-line lookback missed
  `notification_prefs`, because the comment documenting that very fix pushed the `setStore` out of
  range. Widened to 22. When a detector comes back clean, check it can still see the original.
- **★ CLASS 2: A TEST THAT CANNOT FAIL.** Four in two days, each looking like a clean green:
  (a) a `visibilitychange` fired inside the **30s foreground-refresh throttle** — a silent no-op, so
  the check passed against the broken build; (b) a Playwright **catch-all route registered AFTER**
  the specific one, so every call got the generic 200 and the "bad code" case passed vacuously
  because `[]` happens to be that reply; (c) a fixture seeded into localStorage only, so the screen
  never rendered and "zero redeem calls" was true merely because **nothing had happened**;
  (d) a colour compared across a **theme switch**, which repaints everything, so it failed for a
  reason unrelated to the thing under test. The standing rule is unchanged and now has four more
  scars: **a new check must be shown to go RED against the old code**, and if red-proofing is
  awkward, that is itself the finding. Corollary learned here: **restoring a file from a scratch
  copy does NOT rebuild `dist`** — the red-proof and the "fixed" run then measure the same stale
  bundle, and the two results silently swap.
- **CLASS 3: A GUARD THAT STOPPED COVERING THE CODE.** Three instances (`sim_undef` losing the
  engine split; `sim_designscale` blind to all of `src/lazy/`; and the same check unable to see SVG
  `font-size` ATTRIBUTES because it only swept style objects). Fixed structurally via
  `build/source_files.mjs`, but the lesson generalises past file paths: **a property can appear in
  more than one syntax, and sweeping one is not sweeping the other.**
- **CLASS 4: A NUMBER OR PALETTE THAT ENCODES NOTHING.** `DAY_COLORS`, then its surviving twin
  `DAY_CARD_COLORS` on the landing screen, then six lime numbers on the Body Battery sheet. No
  automated check exists and none is proposed — these were all found by LOOKING at a screenshot.
  That is the honest state of it: the container/type measurements were good at pointing at screens
  and bad at diagnosing them, and every real finding of the design pass came from reading the
  rendered screen afterwards.

## The impeccable design skill (installed Aug 18)
`.claude/skills/impeccable/` — a third-party design skill pack (Apache-2.0, pbakaus/impeccable),
invoked explicitly as `/impeccable`. **Its detector is the part that has actually earned its keep**:
`npx impeccable detect src/` is read-only, needs no install, and found a genuine survivor of a
COMPLETED pass — a fifth progress bar still animating `width` after the scaleX conversion. Run it
before a submission build. Two things to know before acting on its output:
- **It was vendored from GitHub, not installed.** `npx impeccable install` downloads its bundle
  from `impeccable.style`, which the sandbox egress proxy blocks (HTTP 403). See
  `.claude/skills/impeccable/VENDORED.md` for the update recipe. **Its hooks are deliberately NOT
  installed** — a `PostToolUse` hook on every Edit/Write plus a `Stop` deep pass would run design
  work on every change to a 25k-line file, unrequested and invisible in a diff.
- **Its rules are generic, and this file outranks them.** Of 18 findings on Seshd, one was a real
  bug; the four `borderLeft: 4px solid` "AI tell" hits carry SET TYPE and MUSCLE GROUP meaning, not
  decoration, and the nine overshoot easings are a deliberate press-feedback family. It also flags
  Inter and the containment question — both already parked by Mo. Check a finding against the
  Conventions above before changing anything.

## Code-splitting (`src/lazy/`) — Aug 20, 2026, all 8 originally-identified candidates DONE
`App.jsx` is still THE app (this file's opening line still holds) — `src/lazy/` holds a handful of
screens/modals pulled out ONLY so they load on demand instead of shipping in the eager bundle for
every session. Eight done: `Onboarding` (shown once ever per user), `WrappedModal` (+ its
`buildWrappedSVG`/`wrapStorySVG` helpers — rarely opened), `AICoachModal` (a big embedded fallback-
program library, only needed if the live AI call fails), `ProgramBuilder` ("Build Your Own", opened
only when a user picks it over a template), `GroupDetail` (opened only from a specific group),
`DiscoverScreen` (not the default landing tab — carries `GroupsScreen`/`FriendsActivityScreen` as
still-App.jsx-resident dependents, see the scope note below), `AuthScreen` (never rendered for an
already-signed-in session — the highest never-touched fraction of the eight, since a Keychain
session persists across launches), `EditHistoryModal` (opened only from a History row's edit
action; the one with the highest correctness stakes — see its own ReferenceError history above its
definition — so its extraction leaned harder on Playwright verification than the others).
**Result: the main chunk went 997KB → 726.81KB (27.1% smaller, gzip ~268KB→~189KB)**, plus eight
on-demand chunks (8-22KB each, ~112KB total) that most sessions never fetch at all. Each one was
verified with the full 49-sim + 46-Playwright battery and published as its own OTA bundle before
moving to the next — no batching, matching the standing one-change-verify-commit workflow rule.
**The pattern, precisely:**
1. Catalog every non-prop identifier the component/helpers reference (grep the body for capitalized
   and camelCase names, cross off local vars/props) — this IS the import list for the new file.
2. If an identifier is used ONLY by the thing you're extracting, move it into the new file too
   (`buildWrappedSVG`/`wrapStorySVG` did this). If it's shared with other call sites elsewhere in
   App.jsx, it stays in App.jsx and gets `export` added — never duplicate a shared helper into a lazy
   file, and never move something with a documented cross-reference (PROGRAM_TEMPLATES stays in
   App.jsx on purpose — see its own ReferenceError history right above its definition).
3. In App.jsx: delete the extracted body, replace with `const X = lazy(() => import("./lazy/X.jsx"))`.
4. Wrap every call site in `<Suspense fallback={...}>`. Simple conditional-render call sites
   (`{show && <X/>}`) are trivial. **A component that's UNCONDITIONALLY mounted for its own exit-
   animation timing (the `<Sheet>` pattern) is not** — naively lazy-loading it fetches the chunk on
   every mount of its PARENT regardless of whether it's ever opened, which defeats the entire point.
   `AICoachModal` hit this: fixed with a `hasOpenedAICoachRef` that flips true (and stays true) on
   first genuine open, gating whether the lazy JSX renders at all, so the import only fires once
   real intent exists and the component still stays mounted afterward for Sheet's own close timing.
5. **Check for export collisions before trusting esbuild's quick check.** Several pure functions
   already have a bulk `export { a, b, c, ... }` statement (~line 5759, there for the jsdom sim
   harness) — adding `export` to the function's own declaration too is a duplicate-export SyntaxError
   that only `npm run build` (the real bundler) catches; the fast `esbuild --bundle --packages=external`
   compile check used for JSX-only sanity does NOT resolve cross-file imports and will not see this.
   This is the same "esbuild isn't the real build" trap the JSX-warning gotcha describes — for any
   change touching `src/lazy/`, `npm run build` is not optional, it's the only check that agrees with
   what actually ships.
6. Rebuild, confirm the new file shows as its own chunk in the `npm run build` output (not folded
   back into `App-*.js`), run the full battery (`node build/run_sims.mjs --pw`) — `sim_undef` walks
   App.jsx's own scopes but can't see a broken cross-file import, so the REAL Vite build succeeding is
   the load-bearing check here, same as step 5.
**A third real gotcha, hit on `DiscoverScreen`, beyond the two already listed above (the
always-mounted-Sheet case, the bulk-export collision): a module-level MUTABLE `let` (the
`_trackerSubTab`/`_discoverSubTab` sub-tab-memory pattern) can be READ across a lazy-file boundary
via a bare `export let`, but not WRITTEN — ESM import bindings are read-only from the importing
side even when the exporting module's own `let` is mutable. Reassigning an imported binding is a
SyntaxError. Fixed with a getter/setter pair (`getDiscoverSubTab`/`setDiscoverSubTabValue`) instead
of a bare export; use the same pattern for any future lazy file that needs to touch a module-level
mutable value.
**Scope calls made along the way, worth knowing before extending any of these further:**
`GroupsScreen` and `FriendsActivityScreen` are used exclusively by `DiscoverScreen` — by the
"move it if exclusive" rule above they COULD have moved into `DiscoverScreen.jsx` too for more
savings, but were left in App.jsx (exported) instead to keep that extraction's blast radius
contained, the same tradeoff made for `ExercisePickerSheet` during the `ProgramBuilder` extraction.
Both remain valid future extraction targets on their own, independent of Discover.
**Remaining candidates, if this gets picked up again** (none carry the urgency the original eight
did — this was the full list from the initial size/frequency survey): `ProfileScreen` (1316 lines,
but it's a bottom-tab screen visited almost every session, so the frequency case for lazy-loading
it is weak — likely NOT worth it), `GroupsScreen`/`FriendsActivityScreen` (see above), `PostCard`/
`SetRow`/other high-reuse components (NOT candidates — they render on the critical path across many
screens, extracting them would only add Suspense overhead for no on-demand benefit). The bigger
remaining lever for bundle size at this point is likely `bodyMapData.js` (258KB) — rather than
further App.jsx screen extraction. **Checked Aug 25: this is already done.** `loadBodyMapData()`
(top of App.jsx, near `useBodyMapData`) uses a real `import("./bodyMapData.js")` inside a
promise-cached loader, consumed only through the `useBodyMapData()` hook — confirmed in the build
output too (its own chunk, no `modulepreload` for it in `dist/index.html`, no static importers
anywhere in `src/`). This note previously called it "already its own chunk via a static import,"
which was wrong — it was already dynamic. Nothing left to do here.

## The engine split (`src/engine/`) — started Aug 27, 2026
`App.jsx` is still the app, but the PURE LOGIC is moving out into plain modules. This is NOT the
`src/lazy/` work — that was about bundle size (load on demand). This is about turning a class of
silent runtime bug into a build failure: in one 23k-line file with no linter and no types, a name
that binds to nothing compiles clean and only throws when that line runs, into a swallowing catch
(`PROGRAM_TEMPLATES` killed every new signup for twelve days; `todayMs` meant the Weekly Review had
never once run). Across a module boundary the same mistake is a `npm run build` error. That is the
whole point — it is not tidiness.
**Done so far:** `src/engine/core.js` (**10** leaf primitives — `IS_DEV`, `devWarn`, `devError`,
`dateKeyOf`, `dateFromKey`, `workingDone`, `dKey`, `cvt`, `LBS_PER_KG`, `LBS_TO_KG`; imports
NOTHING, keep it that way), `src/engine/health.js` (42 symbols: recovery, Body Battery, sleep, HRV,
activity), `src/engine/workout.js` (27 symbols: volume/set counting, 1RM, PR detection,
progression, training load), `src/engine/exercises.js` (21 symbols, 14 exported: the exercise
library + name resolution; a LEAF importing nothing) and `src/engine/strength.js` (21 symbols,
8 exported: strength score, per-muscle strength vs standards, weekly muscle volume, muscle
readiness, days-since-trained; imports core+exercises+workout, NOTHING from health — the extractor
asserts that layering rather than assuming it). **App.jsx 23,095 → 19,726 lines.** Layering is
strictly one-way: core and exercises import nothing, everything else imports only downward,
App.jsx imports all of them. Round 5 added `src/engine/plates.js` (9 symbols, 3 exported: bar &
plate maths, the IWF/IPF colour code, warmup generation) and `src/engine/insights.js` (7 symbols,
4 exported: streaks, progress-insight cards, PR-event reconstruction), and moved `uid` to core
(**App.jsx → 19,329**). `buildCoachContext`/`generateWeeklyReview` were DELIBERATELY left behind:
their closure drags in the HealthKit auth chain and the AI endpoint — a "pure-looking" function
whose closure reaches device or network config is glue, not logic, and the closure blowing up like
that is the tell.
`dKey` is a thin today-default wrapper over `dateKeyOf` and was moved AS-IS rather than
consolidated — merging them is a behaviour change (`dateKeyOf(undefined)` is an Invalid Date) and
must not ride along inside a mechanical move.
**The method, and it matters — do not do this by reading:**
1. **Compute the dependency closure from the AST**, not by eye. Parse the JSX-transformed file with
   acorn, build the top-level symbol table, take the transitive closure of the seeds, then split it:
   referenced ONLY from inside the closure → MOVE (becomes module-private); referenced from outside
   too → it is a shared primitive and belongs in a LOWER module that both import. That last rule is
   what avoids a circular import between a 20k-line file and its own helpers — which behaves
   differently under Vite than under esbuild and is not worth discovering later. It also found that
   23 of the health symbols (`softCap`, `medianOf`, `nightKeyOf`, `READY_TO_PUSH`, the tuning
   constants) are used by nothing else, so they became genuinely private rather than just relocated.
2. **Move the comment block above each function with it.** They are this repo's real documentation.
   A block separated from its function by an intervening comment will be missed by a mechanical
   move — `dateKeyOf`'s consolidation history was left orphaned in App.jsx exactly that way.
3. **Strip a leading `export ` from any moved declaration** — each module ends with ONE bulk
   `export {}`, and a declaration that also exports itself is a duplicate-export SyntaxError. The
   fast `esbuild --bundle --packages=external` check does NOT resolve cross-file exports and will
   not see it; only `npm run build` does. Three core primitives were exported this way.
4. **Grep `src/lazy/*.jsx` for the moved names.** Those files import shared helpers FROM App.jsx, so
   moving one breaks them. Point them at the new module rather than re-exporting through App.jsx —
   App.jsx being the universal hub is the thing this work exists to reduce.
5. **The bulk sim-harness `export {}` needs care.** There are TWO top-level `export {}` statements
   in App.jsx (the small `hydrateFromNative` one and the ~46-name sim list) — target by SIZE, never
   by first match. A moved symbol App.jsx still uses stays in the list (an imported binding can be
   re-exported); one it no longer uses must move to `export { … } from "./engine/…"` INSTEAD of the
   list, or it is exported twice.
6. **Verify the move was semantically identical rather than assuming it.** A cold-context audit
   re-parsed both revisions and compared all 51 declarations whitespace-normalised: 0 body diffs, 0
   lines lost, 0 duplicated. Worth doing on every module — the failure mode of a bulk move is silent.
**★ AND THE ONE THAT NEARLY GOT AWAY: A SCAN THAT STOPS COVERING CODE AS THAT CODE MOVES IS WORSE
THAN NO SCAN, BECAUSE THE GREEN TICK STILL APPEARS.** `sim_undef`'s target list was
`["src/App.jsx", ...src/lazy/*.jsx]`, so the moment 1,500 lines of the most-simulated code in the
repo left App.jsx, the standing guard for the dominant ReferenceError class silently stopped
watching them — and still reported PASS. It globs `src/engine/*.js` now and reports 13 files, not
11. **Any future extraction must check the guards still reach the code**, not just that they pass.
**★ ROUND 2 FOUND THE MIRROR OF ROUND 1'S COMMENT BUG, AND BOTH DIRECTIONS ARE REAL.** Round 1
LEFT a block behind (`dateKeyOf`'s consolidation history stayed in App.jsx while the function
left). Round 2 CARRIED ONE ALONG: a 12-line "HEALTHKIT / Body battery" section banner had been
stranded above the ACWR constants by round 1 — the health code it described moved out from under
it — so round 2's contiguous-leading-comment sweep attached it to `trainingLoadRatio` and
`workout.js` ended up announcing that the acute:chronic workload ratio was about the Capacitor
health plugin. **After each round, read the comment at the TOP of each moved block and ask whether
it describes the thing underneath it**; a mechanical sweep cannot tell a belonging comment from an
adjacent one, and a stranded banner from the previous round is exactly what it will grab.
**★ GUARD COVERAGE IS NOW STRUCTURAL — `build/source_files.mjs` IS THE ONE LIST, AND EVERY
SOURCE-LEVEL GUARD ENUMERATES THROUGH IT.** Blindness had happened twice, both times silently:
`sim_undef` lost 1,500 lines to the engine split (round 1 caught it), and `sim_designscale` +
`sim_a11y`'s button scan had been blind to ALL TEN `src/lazy/` screens since the Aug 20 code-split
— ~290 `fontSize` literals and ten files of real UI policed by nothing, both printing PASS
throughout. Measured before widening: the unwatched files were CLEAN (no half-pixels, nothing under
10px, no retired radii, no unlabelled icon-only buttons), so nothing had actually slipped through —
but that was luck, not the guard working. Coverage went `sim_designscale` 1 → 14 files and
`sim_a11y` 1 → 11. All five (`sim_undef`, `sim_designscale`, `sim_a11y`, `sim_deadui`,
`sim_accentbutton`) now call `jsxFiles()` / `allSourceFiles()` instead of hardcoding a path, so a
file MOVE can never drop out of a guard's reach again and a new source directory is ONE edit rather
than five. **Two hardcoded paths deliberately remain and are correct**: `sim_a11y` reads `THEMES`
and `sim_platecolors` reads `plateColor`, both of which exist only in App.jsx. Each guard was
re-red-proofed AFTER the centralisation (a half-pixel and a retired radius injected into a lazy
file, a free identifier into an engine file, an unreachable component into a lazy file) — a widened
guard that cannot fail is worse than no guard. **Worth recording: the first a11y red-proof attempt
FAILED to go red** — stripping an `aria-label="Back"` proved nothing, because that button is not
*provably* icon-only under the scanner's conservative rules. A clean `a11y_scan` run means "no
PROVABLE misses", not "certainly zero", exactly as its own comment claims. **An audit then closed
the list's own escape hatch: `listDir` returned `[]` for a missing directory**, so renaming
`src/lazy/` would have shrunk every guard back to blindness while all five kept printing PASS —
the exact disease the file exists to cure, concentrated in one place. It THROWS now on a missing
or empty directory (red-proofed: `mv src/engine` aside → exit 1 naming the dir); retiring a
directory means editing the list in the same commit. And the red-proof of the red-proof: checking
that exit code through `node … | tail` reported tail's 0, not node's 1 — the documented PIPESTATUS
trap, hit while verifying the fix for a guard-blindness bug. Never gate on a piped exit code.
**★ ROUND 3 HIT BOTH COMMENT-TRAP DIRECTIONS AT ONCE, WHICH IS WHAT A STRANDED BLOCK GUARANTEES.**
`src/engine/exercises.js` (21 symbols → 14 exported: the 292-entry `EXERCISE_DB` plus the whole
name→muscle/region/equipment/secondaries resolution layer). It is a LEAF — imports nothing, like
core.js. App.jsx 20,958 → 20,420. The audit's one real defect: `daysSinceMuscleTrained`'s doc block
was carried INTO the module AND attached to the wrong function (`_cleanMuscle`), leaving the
function it documents bare in App.jsx. Root cause: that block was ALREADY stranded before round 3,
so the contiguous-comment sweep grabbed two unrelated blocks at once — a stranded comment doesn't
stay put, it migrates and mislabels. **Re-read the comment above each moved symbol AND check the
symbol it left behind still has one.**
**A MODULE-LEVEL STATEMENT IS NOT A DECLARATION, AND THE RANGE-FINDER ONLY TRACKS DECLARATIONS.**
`EXERCISE_DB.forEach(...)` builds the `_muscleExact`/`_muscleNorm` indexes at import time and was
captured only because it happens to sit between two declarations. It survived — verified as the
only module-level ExpressionStatement in any of the five removed regions, and proven by importing
the module in bare Node (292 exact / 260 norm entries built) — but it survived by luck. **Sweep the
moved region for non-declaration statements before trusting a range-based extraction.**
**EXPORT ONLY WHAT IS IMPORTED.** Round 3 first exported all 21 symbols; the audit cut it to the 14
anything actually imports. Beyond tidiness, `_customExercises` is a mutable `let` — exporting it
invites the read-only-import-binding trap, and keeping it private means the only way to write it is
`setCustomExerciseRegistry`, so a stray direct assignment is a hard error rather than a silent
no-op.
**★ DO NOT RUN A COLD-CONTEXT AUDIT CONCURRENTLY WITH THE BATTERY.** Round 3's first battery run
reported **20 FAILING Playwright suites** — all 50 sims green, failures a contiguous ALPHABETICAL
block from `pw_prunwind` to the end. That is the server-death signature, not 20 regressions: the
audit agent had to BUILD in order to check anything, and a concurrent build disturbs the `dist/`
the battery is serving on :8199. Telling the agent "don't run the battery" is not enough — building
alone is sufficient to break it. Run the audit BEFORE or AFTER, never alongside, and treat a
contiguous alphabetical tail of failures as infrastructure until proven otherwise.
**Round 4 (strength.js) was the first mechanically CLEAN move — every earlier round's trap was
pre-checked instead of audit-found** (statement sweep before extracting, comment integrity at both
ends of every seam, layering asserted in the extractor, all 21 symbols AST-identical). The audit
still earned its keep on three trims: the extract script exported all 21 symbols while the header
promised 13 privates (trimmed to 8 — write the export list from the PUBLIC set, never from the
full move list); the dependency-needs regex counted a COMMENT mention of `EXERCISE_SECONDARIES` as
a reference and minted a dead import in two files (the closure itself walks the AST and ignores
comments, but the import-needs check ran a bare regex over raw body text — strip comments first);
and a doc block glued above `strengthScoreHistory` carried `computeStrengthScore`'s contract in its
first four lines — a PRE-EXISTING mis-attachment carried verbatim. A glued block reads plausibly at
both ends; read it to the END before trusting it.
**★ ROUND 5'S BUG CLASS WAS THE CLOSURE TOOL'S OWN BLIND SPOT: IT READS App.jsx ONLY.** It
declared `calcStreak` and `uid` "referenced by nothing" while six `src/lazy/` files import them —
the build's MISSING_EXPORT errors caught it, which is the split working as designed, but grep
`src/lazy/` for every moved name BEFORE trusting a privacy call. Same round: re-pointing
`sim_platecolors` at plates.js broke its THEMES checks because ONE `src` variable served two
files' worth of assertions (split into `src` + `platesSrc`, each with a loud throw); and its
one-definition check silently became one-copy-tolerant when the canonical map left App.jsx —
`<= 1` was written when the canonical copy lived there, so a reintroduced modal copy would have
counted 1 and PASSED (tightened to `=== 0` in App.jsx + `=== 2` in plates.js, red-proofed). The
audit also found `PlateCalcModal` carries its own pre-existing local `PLATES_LBS`/`PLATES_KG` +
`calcPlates` — older than round 5, never consolidated. **Consolidated Aug 28**: the modal's local
copy was byte-for-byte the canonical two-sided algorithm, and `calcPlatesPerSide`'s
`barWeightOverride` parameter fit its bar-type selector exactly; boundaries (empty/NaN target,
target == bar, leftover attachment) diffed identical before cutting. Verified by DRIVING the
modal: 225 on a 45 bar renders 2×45/side + Total 225, 226 shows the shortfall note. All three
probe drafts failed on PROBE bugs while the app was right each time (typed into the Custom BAR
input; hunted for a NumberPad the field doesn't use — TARGET is a real input whose grey "225" is
its PLACEHOLDER; asserted "+1×25", which is wrong arithmetic). Screenshot-and-look settled every
one — do that before ever "fixing" the app to satisfy a probe.
**The split is COMPLETE for now (rounds 1-5, Aug 27-28 2026).** What remains in App.jsx is state,
wiring, device/network glue and components — the parts we agreed to BRAKE, not extract. New
feature logic goes in a new `src/engine/` module (or the one it belongs to), not appended to
`AppInner`/`WorkoutTracker`. **Deliberately NOT next: `AppInner` (4,339 lines) and `WorkoutTracker` (3,591).** They
are 34% of the file and the growth is landing there (+336 / +410 since Aug 9), but what accumulates
in them is STATE and WIRING, which is exactly what makes extraction dangerous — and they are being
edited most weeks. Put a brake on their growth (new feature code goes in a new module) rather than
rewriting them mid-flight.

## Environment notes
- Dev machine: Windows + PowerShell, Node v24.15.0. Local repo `C:\Users\mohag\spotr`.
- Don't assume libraries are installed — check `package.json`. `@dnd-kit` is used (drag-drop reorder).
