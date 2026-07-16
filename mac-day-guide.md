# 🖥️ MAC DAY — Complete Beginner-Proof Guide (written for Mo)

**What today achieves:** Seshd goes from code on GitHub → an app running on your iPhone →
a build on TestFlight you can install like a real app.

**You will not write any code.** Every step below is: open something, click something,
or copy-paste a command. Do the steps **in order** — each one assumes the previous worked.

**Good news up front:** there is **no APNS_ENV switching** in this guide. The plan is
arranged so that setting stays on `production` all day and push notifications get tested
on the TestFlight build at the end. One less thing to remember.

---

# PART 0 — Mac basics (read this first, 2 minutes)

**Opening apps:** press **Cmd + Space** (Cmd is the ⌘ key next to the space bar), type the
app's name, press **Return**. That's how you'll open *Terminal*, *Xcode*, and *TextEdit*.

**Terminal** is the app where you paste commands. Rules:
- Paste with **Cmd+V**, then press **Return** to run it.
- Run commands **one line at a time**, top to bottom. Wait for each to finish
  (you get a new prompt line ending in `%` or `$` when it's done).
- If a popup appears saying it needs to install **"command line developer tools"** →
  click **Install**, wait for it to finish, then run the same command again. This is
  normal on a Mac that hasn't done development recently.

**"How does the latest app get onto the Mac?"** You don't send it — it's already waiting.
Every change we've made is saved on GitHub (the online copy of the project). One command
(`git clone`, in Step 2) downloads the entire latest project onto the Mac. If the project
was downloaded on this Mac before, a different one-liner (`git pull`) fetches just the updates.
Either way: **the Mac pulls it down; you never push anything to the Mac.**

---

# PART 1 — Setup before building anything

## Step 1 · Check the tools (do this FIRST — a possible big download hides here)

This Mac has Xcode and has built Seshd before. That helps (signing and phone trust are
probably already done) — but the **Xcode version** matters and old ones won't work.

1. **Check Xcode's version:** Cmd+Space → `Xcode` → open it → menu bar
   **Xcode → About Xcode**. You need **16.0 or newer**.
   - **16 or newer** → ✅ move on.
   - **Older (15.x, 14.x…)** → open **App Store → Updates** and update Xcode.
     ⚠️ It's a ~10 GB download — start it NOW and do Steps 2–4 while it runs.
     If the App Store won't offer an update (says the Mac's macOS is too old),
     stop and message Claude — that needs a macOS update first, worth knowing early.
   - After any update: open Xcode once and accept the license prompt.
2. **Node.js:** open **Terminal** → paste `node -v` → Return.
   - A version like `v20.x.x` (or higher) → done. (v18+ is fine.)
   - "command not found" or v16/older → **nodejs.org** in Safari → big green **LTS**
     button → open the downloaded `.pkg` → Continue/Agree/Install → **quit and reopen
     Terminal** → `node -v` to confirm.

## Step 2 · Get a FRESH copy of the project

The old Seshd folder from last time is on this Mac somewhere — **don't reuse it.** It has
months-old code and leftover build files; updating it in place can hit conflicts that are
miserable to untangle. A fresh download is guaranteed-clean and only takes a minute.

1. **Park the old copy:** Cmd+Space → `spotr` → if a folder named **spotr** shows up,
   note where it is (likely Desktop or Documents), right-click it in Finder →
   **Rename** → call it `spotr-OLD`. (Don't delete it — just move it out of the way.)
2. In Terminal, one line at a time:

```
cd ~/Desktop
```
```
git clone https://github.com/moproblems49/spotr.git
```
```
cd spotr
```

**✅ Success:** the clone prints progress and ends without red errors; a fresh `spotr`
folder is on the Desktop. This folder contains **every latest change** — the whole app,
this guide, everything. Nothing needs to be "sent" to the Mac.

## Step 3 · Install the app's ingredients + build it

Still in Terminal, one at a time (the first two take a few minutes each — wait for the
prompt to come back):

```
npm install
```
```
npm run build
```
```
npx cap sync ios
```

**✅ Success:** the last command ends with **`✔ Sync finished`** and a list of plugin names
(push-notifications, health, preferences, badge, secure-storage…). Those are the native
features we added while Mac-less — this command is what activates them.

> ℹ️ If any tutorial or error mentions "CocoaPods" or `pod install` — **ignore it**.
> This project doesn't use that.

## Step 4 · The one Supabase secret (5 min)

Push notifications need one key that only exists on this Mac.

1. Click the desktop, press **Cmd+Space** → type `AuthKey` → look for a file named like
   **`AuthKey_ABC123XYZ.p8`** (check Downloads/Desktop too). Found it? Continue.
   *Can't find it after really looking? Stop and tell Claude — do NOT create a new key
   on Apple's website; that breaks other settings.*
2. Right-click the file → **Open With → TextEdit**.
3. **Cmd+A** (select all) → **Cmd+C** (copy). It looks like
   `-----BEGIN PRIVATE KEY-----` gibberish `-----END PRIVATE KEY-----`. Copy ALL of it,
   including those BEGIN/END lines.
4. In Safari: **supabase.com** → sign in → open the project → left sidebar
   **Edge Functions** → **Secrets** tab.
5. Find the row **`APNS_PRIVATE_KEY`** (or click Add new secret and name it exactly that)
   → paste → **Save**.
6. While you're on this screen, sanity-check: **`APNS_ENV`** should say **`production`**.
   If it does, leave it alone — you won't touch it again today.

---

# PART 2 — Xcode

## Step 5 · Open the project in Xcode

In Terminal (inside the spotr folder):
```
npx cap open ios
```
Xcode opens with the project. (First time it may spend a few minutes "resolving packages" —
progress bar at the top. Let it finish.)

## Step 6 · Sign the app (tell Xcode who's publishing it)

1. In the LEFT panel, click the very top item — a blue icon named **App**.
2. In the middle area, under the heading **TARGETS**, click **App**.
3. Click the **Signing & Capabilities** tab (along the top of that middle area).
4. Since this Mac built Seshd before, the Apple developer login is probably already
   saved: check menu bar → **Xcode → Settings → Accounts**. If the developer Apple ID
   is listed → close Settings and skip to the next step. If the list is empty →
   click **+** (bottom left) → **Apple ID** → sign in → close Settings.
5. Back in Signing & Capabilities: set **Team** to the one showing **(66M7SCD5GA)**.
   ⚠️ Not "Personal Team" — the real one. (It may already be selected from last time.)
6. Check **Bundle Identifier** says exactly `com.seshd.app`.
7. Leave **"Automatically manage signing"** ticked.

**✅ Success:** no red text in this section; it says something like
"Provisioning Profile: Xcode Managed Profile".

## Step 7 · Add the four capabilities

Still on Signing & Capabilities, find the **`+ Capability`** button (top-LEFT of that pane).
You'll add four things. For each: click `+ Capability`, type the name in the search box,
double-click the result.

1. **Push Notifications** — nothing to configure after adding.
2. **Background Modes** — after it appears, tick the checkbox **Remote notifications**
   (only that one).
3. **HealthKit** — nothing to configure (don't tick any sub-boxes).
4. **Associated Domains** — after it appears, click the small **+** inside its box and
   type exactly:
   ```
   applinks:spotr-drab.vercel.app
   ```

**Skip** "Sign in with Apple" — not needed yet.

**✅ Success:** four new sections visible, no red errors. (If Xcode complains about
entitlements, re-check Step 6's Team.)

## Step 8 · Launch screen (the flash you see while the app opens)

**Don't burn time here.** The minimum acceptable version:

1. Left panel: **App → App → LaunchScreen.storyboard** (a visual editor loads).
2. Click the big white rectangle. In the RIGHT panel, click the slider-looking icon
   (**Attributes inspector**). Find **Background** → click the color dropdown → **Custom…**
   → in the color window pick the sliders tab → **RGB Sliders** → Hex Color: `0A0A0A` → Return.

That's a clean dark launch screen — totally fine for TestFlight. (Adding the centered logo
is optional polish; if you want it, ask Claude that day and we'll walk through it.)

---

# PART 3 — Run it on your iPhone

## Step 9 · First build onto the phone

1. Plug your iPhone into the Mac with a cable. Unlock the phone.
   Tap **Trust** if the phone asks about trusting the computer.
2. In Xcode, top-middle toolbar: there's a device dropdown (probably says a simulator name).
   Click it → pick **your iPhone** (listed at the top).
3. Press the **▶ Play button** (top left) and wait. First build takes a few minutes.
4. **Possible one-time phone popups** — since this phone ran a dev build before, these
   may not appear at all; if they do, handle them and press ▶ again:
   - *"Untrusted Developer"* → on the phone: **Settings → General → VPN & Device
     Management** → tap the developer entry → **Trust**.
   - *"Developer Mode required"* → **Settings → Privacy & Security → Developer Mode**
     → turn ON → phone restarts → confirm.

**✅ Success:** Seshd opens on your iPhone with the dark launch screen → welcome screen. 🎉

> ℹ️ If the OLD Seshd build is still on your phone from last time, this simply replaces
> it (same app identity — it updates in place). If anything acts strangely on first
> launch, delete the app from the phone and press ▶ in Xcode once more for a clean install.

## Step 10 · The on-phone test list (cable build)

Sign in as **`appreview@getseshd.app`** / **`SeshdDemo2026`** and accept the notification
permission popup when it appears.

Then check these, in any order:

| # | Test | How | Pass looks like |
|---|---|---|---|
| 1 | Push token saved | After accepting the push popup: on Safari → Supabase → **Table Editor → profiles** → find the appreview row | the `push_token` column has a long code in it |
| 2 | Apple Health | In the app: Profile → the Training Readiness card → connect Health when prompted → **Allow** the categories | no errors. (Real numbers replace estimates within ~a day — don't expect instant change) |
| 3 | Universal links | Share any profile (Share button) → paste the link into the **Notes** app → tap it | opens **inside Seshd**, not Safari. (If Safari opens: delete app, press ▶ in Xcode to reinstall, wait 1 min, retry) |
| 4 | Data survives | Log a quick workout (Quick Start → add exercise → one set → Finish) → **force-quit** the app (swipe up, fling it away) → reopen | still signed in AND the workout is in History |
| 5 | Feel check | Do a set: haptic buzz fires, rest timer bar floats above the bottom nav, tab swiping is smooth | nothing looks broken. Note oddities, don't fix today |

> **Note:** notifications are NOT tested on this cable build — that's deliberate.
> They get tested on the TestFlight build (Step 13), which uses the server's current
> settings as-is. Nothing to flip, nothing to remember.

---

# PART 4 — TestFlight

## Step 11 · Archive (package the app for Apple)

1. In the device dropdown (top toolbar), choose **Any iOS Device (arm64)** — NOT your phone.
2. Menu bar: **Product → Archive**. Wait a few minutes.
3. A window called **Organizer** pops up with your archive listed.

## Step 12 · Upload to Apple

1. In Organizer: click **Distribute App** → choose **App Store Connect** → **Upload** →
   click Next through every screen keeping defaults → **Upload**.
2. Wait for **"Upload Successful"** ✅.
3. Now Apple processes it: go to **appstoreconnect.apple.com** → **My Apps** → **Seshd** →
   **TestFlight** tab. Your build shows as *"Processing"* — this takes **10–45 minutes**.
   Go have lunch; refresh occasionally.
4. If a yellow **"Missing Compliance"** warning shows when it's done: click **Manage** →
   the answer is **standard encryption only / exempt** (our app already declares this,
   so usually no question appears at all).

## Step 13 · Install from TestFlight + THE push test

1. When the build's status becomes **Ready to Test**: still in the TestFlight tab, make
   sure your **Internal Testing** group (with your Apple ID) is linked to the build —
   click the group in the left sidebar → check the build is listed → if it asks for
   **Test Details**, paste the "what to test" text from the file `appstore-submission.md`
   in the project folder.
2. On your iPhone: open the **TestFlight** app (install it from the App Store if needed —
   it's Apple's own app) → Seshd appears → **Install**.
3. **Now the push test.** Open TestFlight-Seshd, sign in as **appreview**, accept the
   notification popup. Then lock the phone.
4. On the Mac in Safari, go to **spotr-drab.vercel.app** → sign in as
   **`coachkai@getseshd.app`** / **`SeshdDemo2026`** → send a **DM** to the appreview account.
5. **✅ Pass:** your locked iPhone lights up with a notification showing Coach Kai's name
   and message → the app icon shows a red badge → **tapping the notification opens that
   exact chat** → opening the app clears the badge.

**If no push arrives (wait 30s first):**
- Safari → Supabase → **Edge Functions** → **send-message-push** → **Logs**:
  - **401** error → tell Claude: "webhook secret mismatch".
  - An error mentioning **api.push.apple.com** → the key from Step 4 didn't paste
    cleanly — redo Step 4 carefully (ALL of the file, including BEGIN/END lines).
  - **No log entries at all** → tell Claude: "webhook didn't fire".
- After fixing a secret: just send another DM — **no rebuild needed**. Server settings
  take effect immediately.

---

# DONE — end-of-day checklist

- [ ] `npx cap sync ios` finished clean (Step 3)
- [ ] `APNS_PRIVATE_KEY` pasted; `APNS_ENV` says `production` (Step 4)
- [ ] Team = 66M7SCD5GA, four capabilities added (Steps 6–7)
- [ ] App runs on the iPhone via cable (Step 9)
- [ ] push_token filled · Health connected · link opens in-app · data survives force-quit (Step 10)
- [ ] Build uploaded and processed (Steps 11–12)
- [ ] Installed via TestFlight; **DM push arrives and opens the right chat** (Step 13)

## Explicitly NOT today
Live Activity rest timer · widgets · Instagram story sharing · Sign in with Apple ·
"Confirm email" toggle · light/dark icon variants. All post-TestFlight.

## If you get stuck anywhere
Take a screenshot of the error (Cmd+Shift+4, drag over it) and send it to Claude with
the step number. Almost every Xcode error is either the Team setting (Step 6) or a
one-time popup you haven't clicked yet.
