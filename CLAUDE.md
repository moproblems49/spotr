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
  --define:import.meta.env.VITE_SUPABASE_ANON_KEY='"stubkey"'
```
Key sims (run ONE per invocation; they take ~1–2 min): a workout-flow sim (logs sets, checks no crash), an editor sim, an auth sim, a profile/readiness sim. Each prints PASS/FAIL-style lines. Use them after any change that touches the workout, profile, feed, or swipe code.

To write a new sim, copy the harness header from an existing one (it seeds a guest workout and a female body type), then append the specific interaction + assertions.

## Conventions & gotchas
- **`C` theme object** holds all colors. Inline styles everywhere — no CSS classes/files.
- Helpers: `posNum()` (input sanitize), `LBS_PER_KG` (=2.2046), `cvt()` (unit conversion), `EXERCISE_ALIASES` (dedup), `IS_DEV` (dev-only logging).
- **Number inputs use `type="text"` + `inputMode`, never `type="number"`** — `type="number"` triggers the iOS autofill pill. Keep it this way.
- **Touch/swipe:** React's synthetic touch listeners are passive (preventDefault is a no-op). The tab swipe relies on `touch-action: pan-y` on the root container. **Never swap the DOM structure mid-gesture** — that orphans the touch on iOS and freezes the drag (this broke the co-move twice). The current co-move uses a stable 3-panel track `[prev|current|next]` where the center (touched) node never unmounts.
- **State is stale inside touch handlers / setTimeout.** Use refs (`useRef`) as the source of truth for values read inside `onTouchEnd` etc.
- **Hooks must stay above the component's early returns** (`if (profileUserId) return ...`, etc.) or you get "rendered more hooks than previous render".
- **Windows CRLF** can make git report "nothing to commit" even when the file changed.
- **Body maps** (`BODYMAP_MALE`, `BODYMAP_FEMALE`): minified JSON path data. Always `JSON.parse` to inspect — never grep. Female map regions must scale uniformly to preserve anatomy.
- **Two post tables:** `posts` (main personal feed + stories, `type:"story"` <24h = story ring) and `group_posts` (group feed). Don't confuse them.
- Destructive confirms use the in-app `confirmAction({...})` / `ConfirmHost` sheet — **never `window.confirm`** (ugly on iOS).
- Memory/safety: never reduce the app's own safety behavior; this is a consumer fitness app.

## Current state / roadmap (as of last session)
Recently shipped & verified: true iOS co-move swipe (3-panel track), Wrapped "Share to Story" posts to the in-app Seshd story, Hip Thrust leaderboard counts the `(machine)` variant, profile recent-posts refetch fix, History "Lifetime Volume" tile, block users (reachable + filtered from feed, discover, comments, and DMs), native confirm sheets, iOS autofill fix, female body map (front + back scaled to match). A full bug audit (security/perf/React-hooks/feature-UX) was completed and all findings fixed: RLS policy gaps on groups/group_posts/workout_history, edge-function webhook auth that failed open without `WEBHOOK_SECRET` set, a GroupDetail group-switch race condition, a silently-swallowed group-post failure, missing delete/leave confirmations, and per-keystroke rescans in search/history screens.

**Push notifications are now fully wired end-to-end on the code/server side** — client registers for APNs, saves the token, and routes a tapped notification to the right screen (DM → chat thread, follow → profile, kudos/comment → Activity tab, streak → Tracker tab). Server-side: all 4 DB webhooks (`messages`, `kudos`, `comments`, `follows` → `send-message-push`/`send-activity-push`) and the `streak-at-risk-push` weekly pg_cron job are configured and active, confirmed sending real 200s in the edge function logs. **The only remaining blocker is Mac/Xcode-side — see the Ashley checklist below.**

Not yet done / launch-blockers: Apple Sign In is required by the App Store if any social login ships (`OAUTH_ENABLED = { apple:false, google:false }`). Email confirmation (Resend SMTP) is off (fine pre-launch). Native Live Activity rest timer + home-screen widgets are Mac-side. Share-to-Instagram-Stories directly would need a native Capacitor plugin (Mac-side).

### Push notifications — handoff checklist for Ashley
The app code and Supabase backend are done; this is purely Xcode/Apple-portal setup so a real device can receive and display pushes.

1. **Apple Developer portal:** create an APNs key (Keys → +, enable "Apple Push Notifications service (APNs)"). Note the Key ID and Team ID (`66M7SCD5GA`). Download the `.p8` file — it can only be downloaded once.
2. **Xcode capabilities** (target → Signing & Capabilities):
   - Add **Push Notifications** capability.
   - Add **Background Modes** capability → check **Remote notifications**.
3. **Supabase secrets** (already partially set up by a prior session, but confirm/re-set with the new key if it's a fresh one — `supabase secrets set` from repo root, or via Supabase dashboard → Edge Functions → Secrets):
   - `APNS_KEY_ID`, `APNS_TEAM_ID` = `66M7SCD5GA`, `APNS_TOPIC` = `com.seshd.app`
   - `APNS_PRIVATE_KEY` = contents of the `.p8` file
   - `APNS_ENV` = `production` for TestFlight/App Store builds, `sandbox` only for a direct Xcode-run debug build on a device
4. **Test:** install a build with the new capability, open the app and accept the push permission prompt, then check the `profiles.push_token` column for that user filled in. Send yourself a DM or kudos from a second account — a push should arrive, and tapping it should open the right screen.
5. If pushes don't arrive: check Supabase Edge Function logs for `send-message-push` / `send-activity-push` — a 401 means `WEBHOOK_SECRET` mismatch (server-side, not yours to fix), anything from `api.push.apple.com` failing means the APNs key/entitlement pairing is wrong.

## Environment notes
- Dev machine: Windows + PowerShell, Node v24.15.0. Local repo `C:\Users\mohag\spotr`.
- Don't assume libraries are installed — check `package.json`. `@dnd-kit` is used (drag-drop reorder).
