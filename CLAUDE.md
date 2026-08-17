# Seshd — project context for Claude Code

## What this is
Seshd is a gym/workout tracker built as a **single-file React + Vite PWA**, shipped to iOS via **Capacitor 8**. Almost all app code lives in **`src/App.jsx`** (very large — ~22,300 lines). Treat that file as the whole app unless told otherwise.

- Repo: `github.com/moproblems49/spotr` → deploys to `spotr-drab.vercel.app` (Vercel)
- Bundle id: `com.seshd.app` · Apple Team ID: `66M7SCD5GA`
- Supabase project ref: `zwsoxvekobvtvsphesef`
- Owned domain: `getseshd.app` — used ONLY for transactional email (Resend SMTP, sender
  `hello@getseshd.app`); the app itself still lives on spotr-drab.vercel.app.
- A friend (Ashley) handles all Xcode / TestFlight / Mac-side work.

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
In remote (claude.ai) sessions the standing directive is to push every change to BOTH the
session branch AND `main` (`git push -u origin <branch> && git branch -f main HEAD && git push origin main`
— main has always been a fast-forward so far). Version-bump one-liner that avoids hand-editing:
`cur=$(head -1 src/App.jsx | grep -oE '[0-9]+'); sed -i "1s/v${cur}/v$((cur+1))/" src/App.jsx`.
DB changes: apply directly via the Supabase MCP (`apply_migration`/`execute_sql`) — verified RLS
with `SET LOCAL ROLE`/`request.jwt.claims` role-sims; direct HTTPS to supabase.co is blocked by the
sandbox network policy (use MCP, not curl). Vercel note: pushes to main DO deploy — a "404" on a
policy page turned out to be pure browser cache (incognito confirmed live), don't chase deploy ghosts.

**Audits run on Opus 5, not Fable** (Mo, Aug 3). Fable ran out of usage credits three times
mid-audit and produced nothing each time. Cold-context Opus agents have found real bugs all the way
through — including two fixes that shipped inert and a ReferenceError that broke sharing — so the
independence that matters in practice is a FRESH CONTEXT, not a different model.

## Verification methodology (how we catch regressions)
**Run the whole battery with one command: `node build/run_sims.mjs`** (46 sims, ~90s). It rebuilds the
bundle first (stale bundle = false failures) and reads each sim's real exit code. `--no-build`
skips the rebuild. Use it before any commit touching workout, health, profile, feed or gesture
code. Add `sim_*.mjs` to `build/` and the runner picks it up automatically.

**`node build/run_sims.mjs --pw` also runs the 42 Playwright suites** (+~3min): it builds dist with
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
see was wrong.** Bundles `2026-08-01u` → `2026-08-01z`. Battery is **46 sims + 42 Playwright
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

**Push notifications are now fully wired end-to-end on the code/server side** — client registers for APNs, saves the token, and routes a tapped notification to the right screen (DM → chat thread, follow → profile, kudos/comment → Activity tab, streak → Tracker tab). Server-side: all 4 DB webhooks (`messages`, `kudos`, `comments`, `follows` → `send-message-push`/`send-activity-push`) and the `streak-at-risk-push` weekly pg_cron job are configured and active, confirmed sending real 200s in the edge function logs. **The only remaining blocker is Mac/Xcode-side — see the Ashley checklist below.**

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
Aug 13; note it took TWO offsets, not one, because posts and workouts had drifted apart. Verify
after: nothing future-dated, and no comment or kudos earlier than its post.

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

**Mo: PC-side prerequisites (do BEFORE Mac day so Ashley isn't blocked)**
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

## Environment notes
- Dev machine: Windows + PowerShell, Node v24.15.0. Local repo `C:\Users\mohag\spotr`.
- Don't assume libraries are installed — check `package.json`. `@dnd-kit` is used (drag-drop reorder).
