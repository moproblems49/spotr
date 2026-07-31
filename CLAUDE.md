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
   npx esbuild src/App.jsx --bundle --packages=external --loader:.jsx=jsx --outfile=/dev/null
   ```
   (ignore the `import.meta` notice; look for real errors)
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

## Verification methodology (how we catch regressions)
**Run the whole battery with one command: `node build/run_sims.mjs`** (~40s). It rebuilds the
bundle first (stale bundle = false failures) and reads each sim's real exit code. `--no-build`
skips the rebuild. Use it before any commit touching workout, health, profile, feed or gesture
code. Add `sim_*.mjs` to `build/` and the runner picks it up automatically.

**A new sim/test must be shown to FAIL against the old code before you trust it.** Stash the fix,
rebuild the bundle, run it, confirm red, then `git stash pop`. Two tests written this way turned
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
- **One easing token: `EASE_NAV`** (`cubic-bezier(0.32, 0.72, 0, 1)`, the iOS decelerate curve).
  The app had grown NINE different curves and no two transitions felt related. Every
  screen-scale movement — tab slide, pushed screens, swipe release, edge-swipe-back, progress
  fills — goes through it. Don't add a tenth curve; and if you add a token, WIRE it, because the
  first attempt declared three and applied raw literals, leaving all three as dead code (two have
  since been removed — `EASE_NAV` is the one that's real).
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
- **A prop you forgot to pass is a `ReferenceError`, and a surrounding `catch` will eat it.**
  `WorkoutTracker` referenced `isGuest` twice without receiving it as a prop and with no
  module-level binding, so both lines threw into a swallowing catch: `pr_events` was NEVER synced
  to the server (Wrapped read "0 PRs" for weeks that had real ones) and `hr_summary` never reached
  it either. Nothing logged, nothing looked broken. When a sync "just doesn't happen", check the
  component actually receives every identifier it names before looking at the network.
- **`alignItems:"center"` on a scrollable backdrop clips the TOP of an over-tall child**, not the
  bottom — so a tall modal loses its header and close button under the status bar. Centre with
  `margin:auto` on the card and let the backdrop scroll.
- **Pluralize user-facing counts** (`{n} member{n===1?"":"s"}`) and **suppress zero/meaningless
  deltas** ("▲ 0% volume", "+225 over your previous best" on a first-ever PR — `hitPRs` carries a
  `firstEver` flag for this). Both classes of bug shipped once; check for them in new stat UI.
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
**Sim battery is 20 and green — `node build/run_sims.mjs`.** New this session: `sim_sleepblock`,
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
(1) **Remove the tiny `d1 ·` boot-diagnostic line from the sign-in screen** — AuthScreen's
`bootDiagLine`/`diagEl` (marked TODO in code); it's TestFlight-phase debugging only.
(2) App Review notes + demo accounts are already prepared in `appstore-submission.md`
(demo login `appreview@getseshd.app` / `SeshdDemo2026` — verified working).

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

**Deferred Mac-side (post-TestFlight):** **`@capacitor/keyboard`** (the last big "this is a website"
tell: iOS shows the grey `‹ › Done` accessory bar above the keyboard for web inputs, and without the
plugin there's no keyboard-will-show event to scroll the focused field clear — needs a native
install + `setAccessoryBarVisible(false)`), Live Activity rest timer, home-screen widgets,
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
