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

**Notes** (paste into the App Review "Notes" box):

```
Seshd is a gym workout tracker with optional social features.

• No account is needed for the core app. On the welcome screen, tap "Start Tracking" to use
  workout logging, history, the plate calculator, 1RM estimator, and program building in guest mode.

• The demo account above is signed in to the social side. It already follows another user
  ("Coach Kai"), whose post appears in the Home feed.

• User-generated content safety (Guideline 1.2). Users can Report and Block from every surface
  that shows other people's content:
   - A post: tap the ••• on any Home-feed post → Report.
   - A person: open a profile (e.g. tap "Coach Kai") → ••• (top right) → Report or Block.
   - A conversation: open a chat → ••• in the header → Report.
  Reports are stored privately and reviewed within 24 hours. Blocking hides the user immediately.

• Terms with a zero-tolerance policy for objectionable content and abusive users are agreed to
  at account creation (links on the Create Account screen).

• Apple Health is optional. If allowed, HRV / resting heart rate / sleep power the "Training
  Readiness" screen on the profile. The app works fully without it.

• Push notifications are optional and used only for direct messages, kudos/comments, new
  followers, and streak reminders.

Contact: mohaggagz@gmail.com
```

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
