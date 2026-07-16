# 🖥️ MAC DAY — The Complete Step-by-Step Guide

**Goal of the day:** get Seshd building in Xcode, test it on a real iPhone (push
notifications, Apple Health, sign-in persistence, universal links), and upload the
first build to TestFlight.

**Everything code- and server-side is already done.** Nothing in this guide involves
writing code — it's setup clicks, one secret paste, and testing.

---

## Before you start — what you need on hand

| Item | Details |
|---|---|
| The Mac | With **Xcode 16 or newer** installed (App Store → search "Xcode" — it's a big download, start it early) |
| A physical iPhone + cable | The Simulator **cannot** test push notifications or Apple Health |
| Apple Developer account login | The account with Team ID **66M7SCD5GA** (app record + certificates live here) |
| The APNs key file | A file named like **`AuthKey_XXXXXXXXXX.p8`** — it was downloaded on this Mac in an earlier session. Check `~/Downloads`, Desktop, or Spotlight-search "AuthKey". **Find it before starting** — it's Step 1 |
| Supabase dashboard login | Mo has this — supabase.com, project `zwsoxvekobvtvsphesef` |
| GitHub access to the repo | `github.com/moproblems49/spotr` (public clone works if it's public; otherwise Mo's login) |
| Two phones OR one phone + the web app | For the DM push test (Step 6.2) — the demo accounts below make this easy |

**Demo logins for testing** (already live in the database):
- `appreview@getseshd.app` / `SeshdDemo2026`
- `coachkai@getseshd.app` / `SeshdDemo2026`

**Node.js on the Mac:** needed for the terminal steps. If `node -v` in Terminal says
"command not found", install from nodejs.org (LTS version) first.

---

## Who does what

- **Ashley:** everything in Xcode/Terminal (Steps 2–7).
- **Mo:** Step 1 (Supabase secret — can be done from the PC at the same time),
  being the "second account" in the push test, and installing TestFlight on his phone.

---

## Step 1 — Paste the APNs key into Supabase (5 min) — *Mo can do this from the PC*

Push notifications are fully wired; this is the single missing secret.

1. On the Mac, find the **`.p8` file** (Spotlight: `AuthKey`). Right-click → Open With → **TextEdit**.
2. Select **all** of it (Cmd-A), including the `-----BEGIN PRIVATE KEY-----` and
   `-----END PRIVATE KEY-----` lines. Copy.
3. Go to **supabase.com** → sign in → project **zwsoxvekobvtvsphesef** →
   **Edge Functions** (left sidebar) → **Secrets**.
4. Find (or add) the secret named **`APNS_PRIVATE_KEY`** → paste the whole key → **Save**.

> ⚠️ **Do NOT generate a new key** in the Apple Developer portal unless the file truly
> cannot be found. A new key has a new ID, which means the `APNS_KEY_ID` secret would
> need updating too. All the other secrets (`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC`,
> `APNS_ENV=production`) are already set.

**✅ Success looks like:** `APNS_PRIVATE_KEY` shows in the secrets list with a value set.

---

## Step 2 — Get the code and sync the native project (15 min)

Open **Terminal** on the Mac:

```bash
# 1. Get the code (first time):
git clone https://github.com/moproblems49/spotr.git
cd spotr

#    …or if the repo is already on this Mac:
cd spotr
git pull

# 2. Install JS dependencies (takes a few minutes):
npm install

# 3. Build the web app and copy it into the iOS project:
npm run build
npx cap sync ios
```

**What `cap sync` does:** installs the four native plugins added while Mac-less —
Preferences (data persistence), Health (HealthKit), Badge (app-icon badge), and
Secure Storage (Keychain sessions). The app code already calls all of them; they
simply don't work until this sync runs.

> ℹ️ This project uses **Swift Package Manager** — you do **not** need CocoaPods.
> If any guide/tutorial mentions `pod install`, ignore it.

**✅ Success looks like:** `cap sync` ends with `✔ Sync finished` and lists the plugins
(`@capacitor/push-notifications`, `@capgo/capacitor-health`, `@capacitor/preferences`,
`@capawesome/capacitor-badge`, `capacitor-secure-storage-plugin`, etc.).

**If `npm run build` fails about env variables:** create a file called `.env.local` in
the repo root containing the two `VITE_SUPABASE_*` values (ask Claude/Mo for them),
then rerun. (Normally not needed — the values are baked in.)

---

## Step 3 — Open in Xcode and set up signing (10 min)

```bash
npx cap open ios
```
(This opens the right thing automatically. If opening manually: open
`ios/App/App.xcodeproj` — via Finder is fine.)

In Xcode:

1. In the left file tree, click the blue **App** project icon (top).
2. Under **TARGETS**, click **App**.
3. Open the **Signing & Capabilities** tab.
4. **Team:** pick the team ending in **(66M7SCD5GA)**. If it's not in the dropdown:
   Xcode menu → **Settings → Accounts → +** → sign in with the Apple Developer account,
   then come back.
5. Check: **Bundle Identifier** must be exactly `com.seshd.app`.
6. Leave "Automatically manage signing" **ON**.

**✅ Success looks like:** no red errors in the Signing section; it says
"Provisioning Profile: Xcode Managed Profile".

---

## Step 4 — Add the four capabilities (10 min)

Still in **Signing & Capabilities**, click the **`+ Capability`** button (top-left of
that pane) and add each of these, one at a time:

1. **Push Notifications** — no configuration needed, just add it.
2. **Background Modes** — after adding, a checkbox list appears:
   tick **Remote notifications** only.
3. **HealthKit** — no sub-options needed (do NOT tick "Background Delivery").
4. **Associated Domains** — after adding, click the small **+** inside its panel and
   type exactly:
   ```
   applinks:spotr-drab.vercel.app
   ```

> These four are already enabled on the App ID in Apple's portal, so Xcode should
> accept them without complaint. **Skip "Sign in with Apple"** — not shipping yet.

**✅ Success looks like:** four capability panels visible, no red errors.
If Xcode complains, make sure the Team from Step 3 is the paid team (not "Personal Team").

---

## Step 5 — Launch screen (15 min)

1. In the file tree: **App → App → LaunchScreen.storyboard** (wait for the visual editor).
2. Click the white background of the view → open the **Attributes inspector**
   (right panel, slider icon) → **Background** → Custom → hex **`0A0A0A`**.
3. Drag an **Image View** from the library (+ button, top right) onto the center of
   the view. Set its Image to the app logo — add `assets/icon-only.png` from the repo
   to the asset catalog first (**App → App → Assets** → drag the PNG in, name it `LaunchLogo`),
   then set the Image View's image to `LaunchLogo`, size ~120×120, centered with
   alignment constraints (Align menu → horizontally + vertically in container).

*Shortcut if fiddly:* a plain `0A0A0A` background with **no** logo is perfectly
acceptable for TestFlight — don't burn time here. (Everything else — app icon,
permission strings, portrait lock — is already committed; no work needed.)

---

## Step 6 — Build to the iPhone and run the device tests (1–2.5 hrs)

### 6.0 First build

1. Plug in the iPhone. Unlock it. Tap **Trust This Computer** if asked.
2. In Xcode's top toolbar, click the device dropdown (next to the App name) →
   select the physical iPhone (not a Simulator).
3. Press **▶ (Run)** or Cmd-R.
4. **First-run hurdles (both normal):**
   - iPhone says *"Untrusted Developer"* → on the phone:
     **Settings → General → VPN & Device Management** → tap the developer profile → **Trust**.
   - iPhone asks to enable **Developer Mode** →
     **Settings → Privacy & Security → Developer Mode** → on → restart phone → confirm.
   Then press ▶ in Xcode again.

**✅ Success looks like:** Seshd launches on the phone with the dark launch screen,
then the welcome screen.

### 6.1 Push registration
1. In the app: create an account or sign in (use `appreview@getseshd.app` / `SeshdDemo2026`).
2. Accept the push-notification permission prompt.
3. **Verify:** Supabase dashboard → **Table Editor → profiles** → find the row for the
   signed-in account → the **`push_token`** column should now contain a long string.

### 6.2 Receive a real push  *(the big one)*
> ⚠️ **First:** a direct Xcode build uses Apple's **sandbox** push environment.
> In Supabase → Edge Functions → Secrets, set **`APNS_ENV`** to **`sandbox`** now.
> **You MUST set it back to `production` before the TestFlight upload** (Step 7) —
> put a sticky note on the screen.

1. On a **second** device (or Mo's PC browser at `spotr-drab.vercel.app`), sign in as
   **coachkai@getseshd.app** / `SeshdDemo2026`.
2. As Coach Kai, send a **DM** to the appreview account (Messages → find the user → send).
3. On the iPhone (app in background / phone locked):
   - A push arrives showing **the sender's name** and message.
   - The app icon shows a red **unread badge**.
   - **Tapping the push opens that exact chat.**
   - Opening the app clears the badge.

**If no push arrives:** Supabase → **Edge Functions → Logs** → `send-message-push`:
- **401** → the `WEBHOOK_SECRET` secret doesn't match the DB webhook config.
- An **`api.push.apple.com`** error → APNs key/team/topic mismatch — re-check Step 1
  values and that `APNS_ENV` is `sandbox` for this test.
- **No log entry at all** → the DB webhook didn't fire; check Database → Webhooks.

### 6.3 Apple Health
1. In the app, trigger the Health connect prompt (Profile → Training Readiness area).
2. Accept the iOS Health permission sheet (allow all the read types).
3. **Expect:** readiness/body battery switches from "estimated" to real numbers
   **within a day** of wear data — don't expect an instant change today. No error = pass.

### 6.4 Universal links
1. Paste a profile link (e.g. `https://spotr-drab.vercel.app/u/<any-user-id>` — share
   one from a profile's Share button) into the iPhone **Notes** app.
2. Tap it. **Expect:** it opens **in the Seshd app**, not Safari.
   (If Safari opens: delete the app, reinstall, wait ~1 min — iOS fetches the
   association file on install.)

### 6.5 Persistence (the data-safety test)
1. Log a quick workout (Quick Start → add an exercise → a set → Finish).
2. **Force-quit** the app (swipe up and away). Relaunch.
   **Expect:** still signed in (Keychain session) AND the workout is in History
   (Preferences mirror).
3. Bonus: reboot the phone and check once more.

### 6.6 Quick native feel-check (5 min, no pass/fail)
Rest timer floats above the nav during a workout · haptics fire on set completion ·
tab swipe feels smooth · keyboard doesn't cover inputs. Note anything weird; don't fix today.

---

## Step 7 — TestFlight upload (30–60 min, mostly waiting)

> ⚠️ **FIRST: set `APNS_ENV` back to `production`** in Supabase secrets (from Step 6.2).

1. In Xcode's device dropdown, choose **Any iOS Device (arm64)** (not the phone).
2. Menu: **Product → Archive**. Wait a few minutes.
3. The **Organizer** window opens with the archive → click **Distribute App** →
   **App Store Connect** → **Upload** → keep all defaults (Next/Next) → **Upload**.
4. Wait for "Upload Successful". Then Apple **processes** the build (10–45 min —
   you'll see it under App Store Connect → Seshd → **TestFlight** tab, status "Processing").
5. When it flips to ready: it may ask a **Missing Compliance** question — encryption is
   already declared in the app (`ITSAppUsesNonExemptEncryption=false`), so usually no
   prompt; if one appears anyway, answer **"None of the algorithms mentioned"** / standard
   encryption only.
6. In **TestFlight → Internal Testing**, make sure the group with **Mo** is attached to
   the build. In TestFlight's **Test Details**, paste the "what to test" text from
   **`appstore-submission.md`** (in the repo).
7. **Mo:** open the **TestFlight app** on your iPhone → Seshd appears → **Install**. 🎉

**Common archive failures:**
- *Signing error* → re-check Step 3 team selection.
- *"App Store Connect access required"* → Xcode → Settings → Accounts → the Apple ID
  must be on the team; or use the "Export" option and upload with the **Transporter** app.
- *Build number already used* (only on a SECOND upload) → Xcode → target **App** →
  **General** → increment **Build** (1 → 2) → archive again.

---

## After TestFlight works — submitting to App Review (optional, same day or later)

Everything is already entered in App Store Connect (listing, screenshots, Support URL).
Remaining clicks when you're ready:
1. App Store Connect → Seshd → the **1.0** version page → **Build** section → **+** →
   select the uploaded build.
2. **App Review Information**: turn ON "Sign-in required", enter
   `appreview@getseshd.app` / `SeshdDemo2026`, and paste the review notes from
   **`appstore-submission.md`**.
3. **Save** → **Add for Review** → **Submit to App Review**.

---

## Explicitly NOT today (deferred, all post-TestFlight)
- Live Activity rest timer, home-screen widgets
- Share-to-Instagram-Stories native plugin
- Sign in with Apple (only needed if social login ships)
- "Confirm email" toggle (flip at public launch)
- iOS 18 light/dark icon variants

---

## End-of-day checklist

- [ ] `APNS_PRIVATE_KEY` secret set in Supabase
- [ ] `cap sync ios` ran clean
- [ ] 4 capabilities added, app signed with team 66M7SCD5GA
- [ ] App runs on the physical iPhone
- [ ] `push_token` fills in after accepting the prompt
- [ ] DM push arrives, badge shows, tap opens the right chat
- [ ] Health connected without errors
- [ ] Universal link opens in-app
- [ ] Force-quit → still signed in, history intact
- [ ] **`APNS_ENV` set BACK to `production`**
- [ ] Build uploaded, processing finished, Mo installed via TestFlight
