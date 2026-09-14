# Seshd — App Store submission reference

Everything to paste into **App Store Connect**. (Separate from the listing copy already drafted
in chat: subtitle, description, keywords, promo text.)

---

## App Review Information

**"Sign-In required" → ON**, then enter the demo login:

| Field | Value |
|---|---|
| **User name** | _not stored in this repo — enter it directly in App Store Connect_ |
| **Password** | _not stored in this repo — enter it directly in App Store Connect_ |

> ⚠️ Before you submit: sign in to the app once with these credentials to confirm they work.
> (The account was created directly in the database; if login ever fails, sign up fresh in the
> app with the same email and tell me — I'll re-point the demo data.)

**Notes** (paste into the App Review "Notes" box) — for the Aug 22, 2026 Guideline 2.1
resubmission, which asked for all 8 items below. **App Store Connect's Notes field has a
4000-character limit** — the first draft here was 4274 and got rejected by the form; this version
is ~2800, comfortably under. If you need to trim it further, cut section 4 first (external
services) — it's the least essential to a reviewer's pass/fail decision.

```
1. TESTED ON
iPhone 17 Pro, iOS 26.6. A screen recording made on this device is attached to this submission.

2. WHAT SESHD IS
Seshd is a gym workout tracker for lifters, from casual gym-goers to competitive lifters. It solves the gap between spreadsheet-style logging apps with no social layer, and generic fitness apps whose feed isn't tied to real training data. Core loop: log sets/reps/weight (rest timer, plate calculator), track progress (PRs, 1RM estimates, volume, muscle balance), and an OPTIONAL social layer (feed, groups, DMs) built on real logged workouts, not generic posts. Free — no paywall, subscription, or IAP.

3. HOW TO ACCESS IT
No account needed for the core app: tap "Start Tracking" on the welcome screen for workout logging, history, the plate calculator, 1RM estimator, and program building in guest mode.
For social/account features, sign in with the demo account (credentials entered in the fields above). It's fully populated: ~27 logged workouts, PRs, progress charts, training history. It follows other users (their posts appear in the Home feed) and is in a private group ("Seshd Crew").

4. EXTERNAL SERVICES
- Supabase: Postgres DB, auth, storage, edge functions (entire backend).
- Resend: transactional email only (signup/reset), via Supabase SMTP.
- Apple HealthKit: OPTIONAL, on-device. Powers a "Training Readiness" recovery screen if granted; app works fully without it.
- APNs: OPTIONAL push, for DMs/kudos/comments/new followers/streak reminders.
- Vercel: hosts support/privacy/terms pages and a self-hosted update endpoint for @capgo/capacitor-updater (standard Capacitor live-update for bug-fix bundles between App Store releases; adds no native capability).
No AI/ML services, payment processor, or active analytics SDK in this build.

5. REGIONAL DIFFERENCES
None — functions identically in every region. No region-locked content, feature gating, or pricing differences (free, no IAP).

6. REGULATED INDUSTRY / PROTECTED MATERIAL
Not applicable. No medical claims, no financial services, no licensed or protected third-party material — exercise names and muscle diagrams are original artwork or generic anatomical terms.

7. USER-GENERATED CONTENT SAFETY (Guideline 1.2)
Report/Block available everywhere other users' content appears:
- Post: ••• on any Home-feed post -> Report.
- Person: open a profile -> ••• -> Report or Block.
- Chat: ••• in the header -> Report.
Reports are insert-only (not readable by other users) and reviewed within 24h. Blocking hides the user immediately. Terms with a zero-tolerance policy for objectionable content are agreed to at signup.

8. ACCOUNT DELETION
Settings -> scroll to bottom -> "Delete account" (type DELETE to confirm).

Contact: mohaggagz@gmail.com
```

---

## Screen recording script (Aug 22, 2026 resubmission — item 1 of the Guideline 2.1 request)

Apple wants a recording captured **on a physical device, on the latest iOS**, that starts with
launching the app and walks the core flows — specifically calling out account registration/login,
UGC report/block, and any permission prompts (Health, push). Record with the device's built-in
screen recorder (Control Center → record button) with a fresh, unused test account so the signup
flow is real, not the demo login. Suggested path, ~2–3 minutes:

1. **Launch** the app from the home screen (cold launch, not resumed from the app switcher).
2. **Create a new account** on the welcome screen (a throwaway email is fine) — shows the signup
   flow and the Terms/zero-tolerance-policy agreement step.
3. Log in with it (or stay signed in from step 2) — shows login.
4. **Start a workout**: Workout tab → Quick Start, log 2-3 sets on an exercise, show the plate
   calculator and rest timer, then Finish.
5. Open **History** and the exercise's own detail screen to show the logged set persisted.
6. **Allow Apple Health when prompted** (or trigger it manually from Profile → Training
   Readiness if it doesn't prompt automatically) — shows the permission dialog.
7. **Allow push notifications when prompted** (Settings app dialog) — shows that permission too.
8. Open the **Home feed**, tap ••• on any post → **Report** → pick a reason → submit. Then open a
   profile → ••• → **Block**, and show the blocked user's content disappearing.
9. Go to **Settings → Delete account**, type "DELETE" to confirm — shows the deletion flow (stop
   the recording just before actually confirming, so the test account survives for any follow-up
   question from the reviewer — don't leave the account deleted, or a re-review can't sign into it).

Once recorded, upload it directly in App Store Connect's App Review Information section (there's
an attachment/upload option there, separate from the Notes text field above).

---

## TestFlight — "What to Test" (Test Details / notes for testers)

```
Thanks for testing Seshd! This is an early build. Things to try:

• Start a workout (Workout tab → Quick Start, or pick a program day), log a few sets, and Finish.
  Check that your history and PRs update.
• Try the plate calculator and the rest timer while logging a set.
• Force-quit the app mid-workout and reopen it — your workout should still be there.
• Allow Apple Health when prompted, then open Training Readiness on your profile.
• Share a workout to your feed, follow a friend, and send a direct message.
• If a push notification arrives, tap it and confirm it opens the right screen.

Found a bug or have an idea? Email hello@getseshd.app — every message reaches me.
```

---

## App Store description (paste-ready — App Store Connect > version > Description)

Rewritten Sep 14 2026 for voice. The previous draft read as generated for three measurable
reasons and all three are fixed here: NINE em dashes, almost every one in the same
`Thing — explanation` bullet shape; "so you can / so you know" three times; and a
"WHY LIFTERS SWITCH TO SESHD" header making a social-proof claim nothing backs — nobody has
switched, the app has a handful of users. Zero em dashes now, and the sentence lengths vary.

Every claim was checked against the code before it was polished rather than after:
- "swipe right to log a set" — SetRow's onTouchEnd calls onToggleDone() past +60px (App.jsx),
  the same path as tapping the checkmark. I suspected this was false and it is not; screenshot
  01's "Swipe to complete" subhead is correct too.
- "estimated 1RM on every WORKING set" — the e1RM chip is gated on `set.type !== "warmup"`.
- "plates per side on every barbell lift" — the breakdown renders only when platesBreakdown
  exists, and reads LOADED rather than PER SIDE on one-sided bars.
- "private until you turn it public" — `checked={store.isPublic === true} // default off`.
  This is the strongest line in the section and the old copy never used it; it hedged with
  "(WHEN YOU WANT TO)", "your call" and "the social side stays optional", saying the same
  thing three times without ever stating the actual default.
Body Battery is named for the first time — screenshot 06 is entirely about it and the
description had never mentioned it.

1,950 characters of the 4,000 allowed.

```
Seshd is a gym log that keeps up with you between sets.

Swipe a set done and the rest timer starts itself. The plate math is already on screen. Come back tomorrow and the app opens on your next session with the weights filled in.

IN THE GYM
• Swipe right to log a set, left to delete one
• Plates per side on every barbell lift, for the weight you just typed
• Estimated 1RM on every working set
• Rest timer starts the moment a set goes green
• Last session sits beside today's, so you always know the number to beat

SEE YOURSELF GET STRONGER
• PRs for weight, estimated 1RM and volume, tracked without you doing anything
• Weekly volume, a year of training in one heatmap, every session you've logged
• Muscle balance that catches the groups you've been quietly skipping

TRAIN AROUND YOUR RECOVERY
• Daily readiness from Apple Health: HRV, resting heart rate and sleep, each read against your own baseline
• Body Battery. One number that falls as you train and recharges when you actually rest
• Per-muscle recovery, so you can see your legs are still cooked while your back is ready to go
• Works without a watch. Connect Apple Health and the estimates become real measurements.

BUILD YOUR PROGRAM
• Start from a Push / Pull / Legs split or build your own from scratch
• Reorder and swap exercises mid-workout
• Next time it opens with what you actually lifted, not what the template said

TRAIN WITH FRIENDS, OR DON'T
• Your profile is private until you turn it public. That's the default, not a setting you have to find.
• Post a workout or a PR to your feed when you want to
• Private groups with members-only photos
• Follow, react, message. None of it is required to use the app.

YOUR DATA STAYS YOURS
• Every set saves to your phone first and syncs when you have signal. A gym dead zone doesn't cost you a workout.
• No ads. We don't sell your data.

Questions or feedback: hello@getseshd.app
```

## Support / legal URLs (all live)

- Support URL: https://spotr-drab.vercel.app/support.html
- Privacy Policy: https://spotr-drab.vercel.app/privacy.html
- Terms of Service: https://spotr-drab.vercel.app/terms.html
