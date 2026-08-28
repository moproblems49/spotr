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
delete the old zip FIRST → build with the real `.env.local` → `cd dist && zip -rq
../public/bundles/seshd-<ver>.zip .` → bump `LATEST_VERSION` → commit + push. Bump the version
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
**Where the "real `.env.local`" comes from in a sandbox session:** it isn't in the repo (the values
live in Vercel), so RECOVER IT FROM THE LAST PUBLISHED BUNDLE — that bundle was built with the real
values, so they're sitting in its JS:
```
cd <scratch> && unzip -qo /home/user/spotr/public/bundles/seshd-<prev>.zip
KEY=$(grep -rohE 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}' assets/*.js | sort -u | head -1)
printf 'VITE_SUPABASE_URL=https://zwsoxvekobvtvsphesef.supabase.co\nVITE_SUPABASE_ANON_KEY=%s\nVITE_POSTHOG_KEY=\n' "$KEY" > /home/user/spotr/.env.local
```
Do this BEFORE deleting the old zip. Delete `.env.local` right after the build, and always confirm
`grep -roh 'https://[a-z]*\.supabase\.co' dist/assets/*.js` shows `zwsoxvekobvtvsphesef`, not `stub`.
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
4. **Demo-corpus freshness** — see the pre-submission checklist item. Newest persona post should
   read "yesterday", and every persona needs workouts inside the 7-day muscle-map window.
5. **Storage/table growth** — orphaned images, a table growing faster than the user count explains.
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
2. Serve: `cd dist && python3 -m http.server 8199 &` (it dies between long steps — re-check
   `curl -s http://127.0.0.1:8199/` before each run or every shot is a Chromium error page).
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
  length only raises the cost of guessing. That is the real control when volume arrives. No evidence of server-side rate limiting on the RPC either — Postgres
  functions called via PostgREST don't get Supabase Auth's throttling, only whatever the platform's
  general API gateway happens to apply.
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
**App Review demo accounts (live in prod DB):** `appreview@getseshd.app` / `SeshdDemo2026`
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
needed) — profiles/posts/history cascade. Mo is added as an internal TestFlight tester. DMARC is the
one remaining optional Mo-side item. Earlier: **App Store trust & safety pass** — three things a
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

**⚠️ PRE-APP-STORE-SUBMISSION CHECKLIST (do these the day Mo says "submit"):**
(1) ~~Remove the tiny `d1 ·` boot-diagnostic line from the sign-in screen~~ — **DONE** (Aug 8,
bundle `2026-07-31l`). `setBootDiag`/`setSaveDiag` still WRITE `seshd_boot_diag` / `seshd_kc_save`
deliberately — invisible, free, and the only way to diagnose a boot that lands on the auth screen.
`pw_authdiag` asserts the readout stays gone (it seeds both keys so a survivor shows up loudly
rather than rendering blank and passing).
(2) App Review notes + demo accounts are already prepared in `appstore-submission.md`
(demo login `appreview@getseshd.app` / `SeshdDemo2026` — verified working).
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

Not yet done / launch-blockers: Apple Sign In is required by the App Store if any social login ships (`OAUTH_ENABLED = { apple:false, google:false }`; the Sign in with Apple capability is already ticked on the App ID). **Email confirmation is ON** (Mo flipped it July 30, before opening the beta). Leaked-password protection is a PAID Supabase feature and is deliberately deferred — it's the single best remaining defence for tester accounts, so re-raise it when he's on a paid plan. Reset emails land in spam while the domain is new — consider a DMARC record (`_dmarc.getseshd.app` TXT `v=DMARC1; p=none;`). **Branded auth email templates are written and waiting in `supabase/email-templates/`** (confirm-signup / reset-password / change-email, plus `preview/*.png` and `_shared.md` with install steps) — they go in the Supabase dashboard, so no deploy; still Mo-side, along with setting the SMTP **Sender name to "Seshd"**. Native Live Activity rest timer + home-screen widgets are Mac-side (App Groups capability already ticked for them). Share-to-Instagram-Stories directly would need a native Capacitor plugin (Mac-side).

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
   Still Mo-side later: "Confirm email" toggle at public launch; DMARC record for
   deliverability; Apple Services ID if Google/Apple sign-in ships at launch.

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
