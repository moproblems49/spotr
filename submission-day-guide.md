# 🚀 SUBMISSION DAY — App Store, step by step (written for Mo)

**What today achieves:** the code on GitHub becomes a build on TestFlight you can check on your
phone, and then that same build goes to Apple for review.

**You will not write any code.** The keyboard plugin is already wired up in the project — you only
need to pull it down. Every step is: paste a command, or click something.

**Two rules that save the day:**
- Run commands **one at a time**, top to bottom. Wait for the prompt (`%`) to come back.
- If a step doesn't match what's written here, **stop and tell me** rather than improvising.

**You do NOT need to plug your phone in at any point today.** Testing happens over TestFlight.

---

# PART 1 — Get the latest code onto the Mac (~10 min)

## Step 1 · Open Terminal and go to the project

**Cmd + Space** → type `Terminal` → **Return**. Then paste:

```
cd ~/Desktop/spotr
```

**If that errors** with "No such file or directory", the project is somewhere else. Try:

```
cd ~/Documents/spotr
```

Still nothing? Paste this to find it, then `cd` to whatever path it prints:

```
find ~ -name "capacitor.config.json" -maxdepth 4 2>/dev/null | head
```

## Step 2 · Pull the latest code

```
git pull origin main
```

**✅ Success:** a list of changed files, ending without red `error:`.

**If it says you have local changes** blocking the pull, paste this and run Step 2 again — it
throws away accidental local edits, which is what you want here since nothing on the Mac is
precious:

```
git checkout -- . && git pull origin main
```

## Step 3 · Check the Supabase keys file still exists

```
cat .env.local
```

**✅ Success:** three lines, starting `VITE_SUPABASE_URL=https://zwsoxvekobvtvsphesef.supabase.co`.

**If it says "No such file"**, paste this whole block (it's the same file you made in July —
without it the app builds fine but nobody can sign in):

```
cat > .env.local <<'EOF'
VITE_SUPABASE_URL=https://zwsoxvekobvtvsphesef.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3c294dmVrb2J2dHZzcGhlc2VmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMDY1NzEsImV4cCI6MjA5MjU4MjU3MX0.CWlyo6jpvo3MqZuaRNt4DoBswbSTz2k1aJGZC6Fmqdk
VITE_POSTHOG_KEY=
EOF
```

## Step 4 · Install, build, sync — in this exact order

These three must run in this order. `cap sync` copies the **compiled** app into the iOS project,
so building first is not optional. Run them one at a time.

```
npm install
```

*(This one also installs the new keyboard plugin. It may take a couple of minutes and print
warnings — warnings are fine, red `ERR!` is not. It will also modify `package-lock.json`; ignore
that, you're not committing anything from the Mac.)*

```
npm run build
```

**✅ Success:** ends with `✓ built in …`.

```
npx cap sync ios
```

**✅ Success:** ends with `✔ Sync finished`. Look for `@capacitor/keyboard` in the plugin list it
prints — that's today's new piece. Confirmed Aug 13: it reports `@capacitor/keyboard@8.0.5`
among 12 plugins.

**This project uses Swift Package Manager, not CocoaPods** — the sync log says "All plugins have a
Package.swift file". So there is no `Podfile` anywhere and nothing to `pod install`. The plugin
list that `cap sync` prints IS the proof the plugin landed; there is nothing else to check.

---

# PART 2 — Build the app in Xcode (~15 min)

## Step 5 · Open the project in Xcode

```
npx cap open ios
```

Xcode opens. Give it a minute to finish indexing (progress bar at the top).

## Step 6 · Set the build number ⚠️ THE ONE THING PEOPLE GET WRONG

Apple rejects an upload if the build number has been used before. July's build was number **1**,
so today's must be **higher**.

1. In the left sidebar, click the blue **App** icon at the very top.
2. In the main panel, select the **App** target, then the **General** tab.
3. Under **Identity** you'll see **Version** and **Build**.
   - **Version**: `1.0` (leave as is — this is what customers see)
   - **Build**: change it to **`2`**

*(If Build already says something higher than 1, just add one to whatever is there.)*

## Step 7 · Choose the right build destination

At the top of the Xcode window, next to the app name, there's a device dropdown. Click it and
choose **Any iOS Device (arm64)**.

⚠️ If a simulator is selected here, the Archive menu item stays greyed out. This is the usual
"why can't I click Archive" cause.

## Step 8 · Archive

Menu bar: **Product** → **Archive**.

This takes 3–10 minutes. When it finishes, an **Organizer** window opens by itself with your
build listed.

**If Product → Archive is greyed out:** go back to Step 7.

## Step 9 · Upload to App Store Connect

In the Organizer window:

1. Make sure today's build is selected (check the date).
2. Click **Distribute App**.
3. Choose **App Store Connect** → **Next**.
4. Choose **Upload** → **Next**.
5. Leave the default options on the next screens → **Next** through them.
6. Click **Upload**.

**✅ Success:** "Upload Successful". This takes a few minutes.

Now wait. Apple processes the build — usually **5–15 minutes**. You'll get an email when it's
ready. You can close Xcode.

---

# PART 3 — Check it on your phone before submitting (~5 min)

Do not skip this. The keyboard change is native, so it's the one thing our over-the-air updates
could never deliver or test.

1. Open **TestFlight** on your iPhone.
2. Pull down to refresh. The new build appears (build number **2**).
3. Tap **Update** / **Install**, then open Seshd.
4. Sign in if it asks.
5. **The check:** tap into any real text box — an exercise's *Add note…*, the search box, or a
   chat message. Look just above the keyboard.
   - **✅ Right:** the keyboard appears with nothing above it.
   - **❌ Wrong:** a grey strip with `‹ ›` arrows and a **Done** button. If you see that, stop
     and tell me.
6. While you're in there, also start a workout and confirm the weight/reps keypad still opens
   normally. It should be unchanged — those fields deliberately don't use the system keyboard.

---

# PART 4 — Submit for review (~10 min, phone or Mac)

Go to **appstoreconnect.apple.com** → **My Apps** → **Seshd**.

1. In the left sidebar under **iOS App**, click the **1.0 Prepare for Submission** version.
2. Scroll to **Build** and click **+** (or **Select a build**). Choose build **2**.
3. Scroll to **App Review Information**:
   - **Sign-in required**: checked
   - **User name**: `appreview@getseshd.app`
   - **Password**: `SeshdDemo2026`
   - **Notes**: paste the review notes from `appstore-submission.md` in the project folder
4. Everything else — description, keywords, screenshots, support URL, age rating, privacy — is
   already filled in from July. Scroll through and confirm nothing shows a red warning.
5. Click **Add for Review** / **Submit for Review** (top right).

**✅ Success:** the status changes to **Waiting for Review**.

---

# PART 5 — What happens next

- **Waiting for Review** → usually a day or two.
- **In Review** → a few hours.
- **Rejected** is normal and not a disaster — Apple writes exactly what they want changed, and
  most first submissions get one round. Send me what they wrote and I'll fix it.
- **Approved** → it goes live (or waits for you to release it, if you chose manual release).

---

# If something goes wrong

Tell me **which step number**, and paste **the exact red text**. Almost everything here has a
simple cause:

| Symptom | Usual cause |
|---|---|
| `Archive` greyed out | A simulator is selected — Step 7 |
| "This bundle is invalid… build number" on upload | Build number already used — Step 6 |
| App builds but sign-in fails | `.env.local` missing — Step 3 |
| `npm ERR!` during install | Paste it to me; do **not** try `npm ci` |
| Looking for a `Podfile` | There isn't one — this project uses Swift Package Manager. Read the plugin list `cap sync` prints instead |
