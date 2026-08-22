# Seshd — App Store submission reference

Everything to paste into **App Store Connect**. (Separate from the listing copy already drafted
in chat: subtitle, description, keywords, promo text.)

---

## App Review Information

**"Sign-In required" → ON**, then enter the demo login:

| Field | Value |
|---|---|
| **User name** | `appreview@getseshd.app` |
| **Password** | `SeshdDemo2026` |

> ⚠️ Before you submit: sign in to the app once with these credentials to confirm they work.
> (The account was created directly in the database; if login ever fails, sign up fresh in the
> app with the same email and tell me — I'll re-point the demo data.)

**Notes** (paste into the App Review "Notes" box) — rewritten for the Aug 22, 2026 Guideline 2.1
resubmission, which asked for all 7 items below explicitly. Fill in the **device/OS bracket in
item 2** with whatever Ashley actually tested on before pasting — that's the one fact in here I
can't know myself.

```
1. TESTED ON
[FILL IN: e.g. "iPhone 14, iOS 18.x" — the physical device(s) and iOS version(s) this build was
tested on before submission. A screen recording made on that same device is attached to this
submission / available on request.]

2. WHAT SESHD IS
Seshd is a gym workout tracker for people who lift weights, from casual gym-goers to serious
lifters. Core problem it solves: most workout-log apps are either a spreadsheet with no social
layer, or a generic fitness app with a social feed bolted on that isn't tied to real training
data. Seshd's core loop is logging sets/reps/weight during a workout (with a rest timer and plate
calculator), tracking progress (PRs, 1RM estimates, volume, muscle-group balance) over time, and
an OPTIONAL social layer (feed, groups, DMs) where what gets shared is a real logged workout, not
a generic post. Target audience: recreational and serious gym lifters who already track their
training or want to start. Free to use — no paywall, no subscription, no in-app purchase in this
build.

3. HOW TO ACCESS IT
No account is needed for the core app: on the welcome screen, tap "Start Tracking" to use workout
logging, history, the plate calculator, 1RM estimator, and program building in guest mode.

For the social/account features, sign in with the demo account below (already entered in the
"Sign-In Required" field of this submission):
  Email: appreview@getseshd.app
  Password: SeshdDemo2026
This is a fully populated account: ~27 logged workouts over the last two months, personal
records, progress charts, and training history (History tab, and each exercise's detail screen).
It follows several other users (their posts appear in the Home feed) and is a member of a private
group ("Seshd Crew") with its own group feed — so social features are all live and testable
without any extra setup.

4. EXTERNAL SERVICES USED
- Supabase (Postgres database, authentication, file storage, and edge functions) — the entire
  backend: accounts, workout data, social features.
- Resend — transactional email only (signup confirmation, password reset), sent via Supabase's
  SMTP integration.
- Apple HealthKit — OPTIONAL, on-device only. If the user grants access, HRV/resting heart
  rate/sleep power a "Training Readiness" recovery screen. The app is fully functional without it.
- Apple Push Notification service (APNs) — OPTIONAL. Used only for direct messages, kudos/
  comments, new followers, and a weekly streak reminder.
- Vercel — hosts the app's support/privacy/terms pages, and a self-hosted update endpoint used by
  @capgo/capacitor-updater (the Capacitor live-update mechanism) to deliver signed web-bundle
  bug-fix updates between App Store releases — the same "hot code push" pattern any Capacitor/
  Cordova hybrid app uses; it never adds a native capability or changes the app's core purpose.
No AI/ML services, no payment processor, no analytics SDK currently active in this build.

5. REGIONAL DIFFERENCES
None. Seshd functions identically in every region/App Store territory — no region-locked
content, no region-based feature gating, no region-specific pricing (the app is free, no IAP).

6. REGULATED INDUSTRY / PROTECTED THIRD-PARTY MATERIAL
Not applicable. Seshd is a personal fitness/workout tracker: it makes no medical claims, offers
no financial services, and includes no licensed or protected third-party material — exercise
names and muscle-group diagrams are original artwork or generic anatomical terms, not licensed
content.

7. USER-GENERATED CONTENT SAFETY (Guideline 1.2)
Users can Report and Block from every surface that shows other people's content:
 - A post: tap the ••• on any Home-feed post → Report.
 - A person: open a profile (e.g. tap "Coach Kai") → ••• (top right) → Report or Block.
 - A conversation: open a chat → ••• in the header → Report.
Reports are stored privately (insert-only, not readable by other users) and reviewed within 24
hours. Blocking hides the user immediately. Terms with a zero-tolerance policy for objectionable
content and abusive users are agreed to at account creation (linked on the Create Account screen).

8. ACCOUNT DELETION
Settings → scroll to the bottom → "Delete account" (typed "DELETE" confirmation required, App
Store-standard destructive-action pattern). Fully removes the account and its data.

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

Once recorded, Ashley uploads it directly in App Store Connect's App Review Information section
(there's an attachment/upload option there, separate from the Notes text field above).

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

## Support / legal URLs (all live)

- Support URL: https://spotr-drab.vercel.app/support.html
- Privacy Policy: https://spotr-drab.vercel.app/privacy.html
- Terms of Service: https://spotr-drab.vercel.app/terms.html
