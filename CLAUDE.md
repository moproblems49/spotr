# Seshd — project context for Claude Code

## What this is
Seshd is a gym/workout tracker built as a **single-file React + Vite PWA**, shipped to iOS via **Capacitor 8**. Almost all app code lives in **`src/App.jsx`** (very large — ~18,500+ lines). Treat that file as the whole app unless told otherwise.

- Repo: `github.com/moproblems49/spotr` → deploys to `spotr-drab.vercel.app` (Vercel)
- Bundle id: `com.seshd.app` · Apple Team ID: `66M7SCD5GA`
- Supabase project ref: `zwsoxvekobvtvsphesef`
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
Then, if any DB change was needed, tell Mo to run the SQL in the Supabase SQL editor.

## Verification methodology (how we catch regressions)
There are jsdom simulation scripts that mount the real app bundle and exercise flows. Before running them, rebuild the ESM bundle (stale bundle = false failures):
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

To write a new sim, copy the harness header from an existing one (it seeds a guest workout and a female body type), then append the specific interaction + assertions.

## Conventions & gotchas
- **`C` theme object** holds all colors. Inline styles everywhere — no CSS classes/files.
- Helpers: `posNum()` (input sanitize), `LBS_PER_KG` (=2.2046), `cvt()` (unit conversion), `EXERCISE_ALIASES` (dedup), `IS_DEV` (dev-only logging).
- **Number inputs use `type="text"` + `inputMode`, never `type="number"`** — `type="number"` triggers the iOS autofill pill. Keep it this way.
- **Touch/swipe:** React's synthetic touch listeners are passive (preventDefault is a no-op). The tab swipe relies on `touch-action: pan-y` on the root container. **Never swap the DOM structure mid-gesture** — that orphans the touch on iOS and freezes the drag (this broke the co-move twice). The current co-move uses a stable 3-panel track `[prev|current|next]` where the center (touched) node never unmounts.
- **Gesture perf pattern (house style — follow this for any NEW drag/swipe code):** don't call `setState` on every `touchmove`/`mousemove` frame, it re-renders the whole screen per frame. Instead: call `setState` exactly once on the first frame that crosses a real threshold (flips the CSS `transition` off via a render and mounts/reveals anything needed), then every later frame writes directly to a ref'd DOM node's `.style` (transform/opacity/height/etc), then on gesture end read the **live ref value** (not the possibly-stale state var) to decide the outcome and commit it back via one final `setState`. Used in `PullToRefresh`, `SetRow`, `StoryViewer`, `InsightCards`, `ProfileScreen`'s cover-drag, and the feed/tab-swipe in `AppInner`. Two traps this pattern has actually hit: (1) if the final reset `setState` value is ever equal (via `Object.is`) to the last value React already committed, React skips the DOM write and a directly-ref-written style gets stuck — make sure the first-frame commit is always meaningfully non-rest so the final reset always differs (see `StoryViewer`'s `settleBack()` helper for the case where it doesn't); (2) **mouse drags need `window`-level `mousemove`/`mouseup` listeners, not element-level ones** — `onMouseMove`/`onMouseUp` JSX props only fire while the cursor is physically over that element, so a drag that exits a small drop target before the button is released would silently freeze state at the first frame (this happened to the cover-photo drag; fixed by adding/removing `window.addEventListener` pairs in the start/end handlers instead).
- **State is stale inside touch handlers / setTimeout.** Use refs (`useRef`) as the source of truth for values read inside `onTouchEnd` etc.
- **Hooks must stay above the component's early returns** (`if (profileUserId) return ...`, etc.) or you get "rendered more hooks than previous render".
- **Windows CRLF** can make git report "nothing to commit" even when the file changed.
- **Body maps** (`BODYMAP_MALE`, `BODYMAP_FEMALE`): minified JSON path data. Always `JSON.parse` to inspect — never grep. Female map regions must scale uniformly to preserve anatomy.
- **Two post tables:** `posts` (main personal feed + stories, `type:"story"` <24h = story ring) and `group_posts` (group feed). Don't confuse them.
- Destructive confirms use the in-app `confirmAction({...})` / `ConfirmHost` sheet — **never `window.confirm`** (ugly on iOS).
- Memory/safety: never reduce the app's own safety behavior; this is a consumer fitness app.

## Current state / roadmap (as of last session)
Recently shipped & verified: true iOS co-move swipe (3-panel track), Wrapped "Share to Story" posts to the in-app Seshd story, Hip Thrust leaderboard counts the `(machine)` variant, profile recent-posts refetch fix, History "Lifetime Volume" tile, block users (reachable + filtered from feed, discover, comments, and DMs), native confirm sheets, iOS autofill fix, female body map (front + back scaled to match). A full bug audit (security/perf/React-hooks/feature-UX) was completed and all findings fixed: RLS policy gaps on groups/group_posts/workout_history, edge-function webhook auth that failed open without `WEBHOOK_SECRET` set, a GroupDetail group-switch race condition, a silently-swallowed group-post failure, missing delete/leave confirmations, and per-keystroke rescans in search/history screens.

**Gesture-perf refactor (merged to main):** every touch/drag gesture in the app — `SetRow` swipe, tab-swipe, the shared `PullToRefresh` component (History/Profile/Messages), the feed's own pull-to-refresh, `StoryViewer` drag, `InsightCards` swipe, and the profile cover-photo position drag — was re-pointed from per-frame `setState` (re-rendering the whole screen on every `touchmove`) to the ref-write pattern documented above, plus a fix for vertical-scroll bleed-through during the tab swipe. A code review of this refactor caught and fixed one real regression before merge: the cover-photo drag's mouse path could freeze `coverPosDraft` at the gesture's first frame if the cursor left the small drag area before mouseup (now uses `window`-level listeners — see the Conventions note above).

**Push notifications are now fully wired end-to-end on the code/server side** — client registers for APNs, saves the token, and routes a tapped notification to the right screen (DM → chat thread, follow → profile, kudos/comment → Activity tab, streak → Tracker tab). Server-side: all 4 DB webhooks (`messages`, `kudos`, `comments`, `follows` → `send-message-push`/`send-activity-push`) and the `streak-at-risk-push` weekly pg_cron job are configured and active, confirmed sending real 200s in the edge function logs. **The only remaining blocker is Mac/Xcode-side — see the Ashley checklist below.**

Not yet done / launch-blockers: Apple Sign In is required by the App Store if any social login ships (`OAUTH_ENABLED = { apple:false, google:false }`). Email confirmation (Resend SMTP) is off (fine pre-launch). Native Live Activity rest timer + home-screen widgets are Mac-side. Share-to-Instagram-Stories directly would need a native Capacitor plugin (Mac-side).

### Push notifications — handoff checklist
The app code and Supabase backend are done. What's left is APNs credential setup (web-based — Mo can do this from his PC) and Xcode capability/device work (needs Ashley/Mac).

**Mo: do now on PC (no Mac needed)**
1. **Apple Developer portal** (developer.apple.com, any browser): create an APNs key (Keys → +, enable "Apple Push Notifications service (APNs)"). Note the Key ID and Team ID (`66M7SCD5GA`). Download the `.p8` file — it can only be downloaded once, so save it somewhere safe.
2. **Supabase secrets** (Supabase dashboard → Edge Functions → Secrets, or `supabase secrets set` CLI from repo root — both work fine from Windows):
   - `APNS_KEY_ID`, `APNS_TEAM_ID` = `66M7SCD5GA`, `APNS_TOPIC` = `com.seshd.app`
   - `APNS_PRIVATE_KEY` = contents of the `.p8` file
   - `APNS_ENV` = `production` for TestFlight/App Store builds, `sandbox` only for a direct Xcode-run debug build on a device
   - These may already be partially set from a prior session — re-set them if you generated a fresh key above, since the old key/secret pairing won't match.
   - Note: Claude can't set these directly — there's no Supabase tool for reading/writing Edge Function secrets, and pasting the `.p8` key into chat would expose it anyway. This step has to happen in the dashboard/CLI on your end.

**Ashley: Mac/Xcode only**
3. **Xcode capabilities** (target → Signing & Capabilities):
   - Add **Push Notifications** capability.
   - Add **Background Modes** capability → check **Remote notifications**.
4. **Test on a physical device** (simulators can't receive real APNs pushes): install a build with the new capability, open the app and accept the push permission prompt, then check the `profiles.push_token` column for that user filled in. Send yourself a DM or kudos from a second account — a push should arrive, and tapping it should open the right screen.
5. If pushes don't arrive: check Supabase Edge Function logs for `send-message-push` / `send-activity-push` — a 401 means `WEBHOOK_SECRET` mismatch (server-side, not yours to fix), anything from `api.push.apple.com` failing means the APNs key/entitlement pairing from steps 1–2 is wrong.

## Environment notes
- Dev machine: Windows + PowerShell, Node v24.15.0. Local repo `C:\Users\mohag\spotr`.
- Don't assume libraries are installed — check `package.json`. `@dnd-kit` is used (drag-drop reorder).
