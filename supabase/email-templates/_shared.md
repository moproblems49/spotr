# Seshd auth email templates

These are the emails Supabase sends on Mo's behalf: sign-up confirmation, password reset, and
email-address change. Out of the box they're four lines of unstyled text over a bare link, which
reads like a phishing attempt — exactly the thing that lands a new domain in spam and makes a
tester think the app is a hobby project.

## How to install them (Supabase dashboard — no deploy needed)

Authentication → Emails → Templates. One tab per template:

| Tab | File here | Subject to paste |
|---|---|---|
| Confirm signup | `confirm-signup.html` | `Confirm your email to finish setting up Seshd` |
| Reset password | `reset-password.html` | `Reset your Seshd password` |
| Change email address | `change-email.html` | `Confirm your new email address for Seshd` |

Paste the file's whole contents into the **Message body** box, set the **Subject heading**, Save.
They take effect on the next email — nothing to build or push.

## Also set the sender name

Project Settings → Authentication → SMTP Settings → **Sender name: `Seshd`**.
Without it the From line reads as a bare `hello@getseshd.app`, which is the single biggest
"this is automated junk" tell in an inbox. The sender ADDRESS must stay at the verified domain
(`hello@getseshd.app`) — Resend 550s anything else.

## Why they're built this way

- **Table-based layout, everything inline-styled.** Gmail, Outlook and Apple Mail strip `<style>`
  blocks, flexbox and most modern CSS. A `<div>` layout that looks right in a browser collapses
  into a single ragged column in Outlook. Tables are the only thing every client agrees on.
- **A real button AND the raw link underneath.** Some clients block the button's background
  colour, and some people forward these to a desktop. The bare URL is the fallback that always
  works.
- **Light card, dark header.** The app is dark, but a full-dark email body is a coin flip: several
  clients force their own background behind it and the text can end up dark-on-dark. The header
  band carries the brand; the body stays readable everywhere.
- **`{{ .ConfirmationURL }}` is Supabase's placeholder** and must stay exactly as written. It's
  what carries the one-time token.
- **Every template says what to do if you didn't ask for this.** For a password reset that line is
  the actual security control — it's how a targeted user finds out someone is trying, and it's
  what stops the email reading like a phish.
- **Expiry is stated.** "This link expires in 1 hour" removes the main support question and tells
  an attacker's victim that a stale link is harmless.
- **The button is `#4d7c0f`, NOT the app's `#65a30d` accent — do not "correct" it back.** White
  on `#65a30d` measures **3.09:1**, and the button label is 16px bold, which is NOT WCAG "large
  text" (that starts at 18.66px bold), so it needs the full 4.5:1. `#4d7c0f` is 4.99:1 and still
  reads as the brand lime rather than olive. Same rule for the raw fallback link and the mailto,
  which are accent-as-TEXT and use `#3f6212` (the app's `accentInk`, 7.08:1 on the white card).
  This is the app's own documented `accent`-is-a-fill / `accentInk`-is-text split, applied here —
  an email gets no theme toggle and no dark-mode token, so the light-theme values are the only
  ones that ever render. The volt wordmark in the dark header band is fine and stays: volt on
  near-black is the dark theme's own high-contrast pairing.
- No tracking pixels, no remote images, no web fonts — the logo is CSS-drawn text. Remote assets
  are blocked by default in most clients and a broken image box looks worse than no image.

## Link expiry

Authentication → Emails → the OTP/link expiry setting controls the real lifetime. The copy in
these templates says **1 hour**; if that setting is changed, change the wording to match, or the
emails start lying to users.
