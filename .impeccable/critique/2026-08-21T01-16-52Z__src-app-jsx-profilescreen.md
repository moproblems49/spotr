---
target: Profile screen (ProfileScreen)
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-21T01-16-52Z
slug: src-app-jsx-profilescreen
---
# Profile screen — design critique

Method: dual-agent (A: design review · B: detector/browser evidence), independent, synthesized after both completed. Both agents rendered the real screen in Chromium (428×926, both themes) with a heavily-used fixture (36+ workout sessions, PRs, HealthKit-shaped recovery data) rather than reading source alone.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Three normalized recovery scores (Recovery 71%, Body Battery 55/100, "Woke at 87") are the same measurement expressed three ways, shown as unrelated facts. |
| 2 | Match System / Real World | 2 | `TRAINING LOAD 1.03×` names no denominator; `Back Squat 294` is an unlabeled estimated 1RM sitting next to a real logged 245. |
| 3 | User Control and Freedom | 3 | Confirmations and swipe-back are solid; a foreign profile's only Back control scrolls out of reach. |
| 4 | Consistency and Standards | 1 | Six independent color systems on one screen; amber means three different things within 900px; three different modal idioms (dialog / dialog / sheet / full-screen). |
| 5 | Error Prevention | 3 | Genuinely strong — typed-confirmation delete, gated share links with an explanatory toast. |
| 6 | Recognition Rather Than Recall | 1 | Eight unlabeled scales on screen at once (1.03×, 294, 55/100, 71%, 72/PROFICIENT, 1.62×BW, HRV, VO₂) with no legend. |
| 7 | Flexibility and Efficiency | 1 | 10,600px / 12 viewports of scroll for 36 sessions, no grid/filter/date-jump; reaching an old session is ~15 taps. |
| 8 | Aesthetic and Minimalist Design | 1 | ~15 scored quantities render before the first logged set appears. |
| 9 | Error Recovery | 3 | Above average — export/delete failure paths surface specific, honest messages. |
| 10 | Help and Documentation | 2 | The Body Battery caption explains its own math well; Strength Score, Training Load and the per-lift estimate have no explainer at all. |
| **Total** | | **19/40** | **Poor (bottom of the band)** |

## Design Specificity Verdict

**Split, and the split is the problem.** The screen is three screens stacked, and only the middle one is Seshd. The top ~600px (avatar, three count columns, bio, outline buttons) is a literal social-app template — swap "Workouts" for "Posts" and it's indistinguishable from any app built in the last decade. The bottom ~8,000px is a vertical feed of identical cards, forever — also generic. The middle ~2,000px — the anatomical muscle map, Body Battery, the six-lift strength ladder with tier markers, the mono-spaced set ledgers — is unmistakably Seshd and has real point of view. **The specific, differentiated work is buried in the position least likely to be read**, sandwiched between two borrowed templates that occupy the two positions that matter most: first impression, and 80% of the scroll.

The CLI detector (Assessment B) found nothing new about this screen specifically — every finding that reaches ProfileScreen's rendered output matches a pattern CLAUDE.md has already adjudicated as deliberate (the press/release spring family, the Inter-font flag, set-type-meaning borders that don't even render here). **The overlay reported zero contrast findings; the manual measured sweep found 17 distinct failing pairings on the same screen** — reproducing exactly the blind spot CLAUDE.md already documents: a DOM/static scanner can't resolve inherited or hardcoded prop colors, so a clean detector run is not evidence of a clean screen.

## Overall Impression

Profile is the app's richest surface — genuinely more instrumented than any competitor's equivalent screen — and also its least disciplined. The health-and-strength instrumentation in the middle of the scroll is a real differentiator done well in isolation (the Body Battery caption that shows its own arithmetic is the single best UI text on the screen). But the screen never decided what it's *for*: it's a social profile, a training dashboard, and a duplicate of History all layered on top of each other with no hierarchy connecting them, seven overlapping color systems, and — confirmed by measurement, not guesswork — the exact same white-on-volt Follow button contrast bug CLAUDE.md already fixed twice elsewhere in the app, surviving here because the standing contrast check's regex doesn't match a ternary expression. The single biggest opportunity: pick one verdict for "should I train today" and delete the other two ways of saying it.

## What's Working

- **The muscle-balance empty state is a model for how to do this correctly** — it renders the real feature (five labeled rows, dimmed, flat) rather than the icon-in-a-box template the other two de-genericized screens got. Best instance of that pattern in the app so far.
- **The Body Battery caption reconciles its own math in one line** (`Woke at 87 · −16 training · −16 today` sums exactly to 55) — a rare, correct instinct that the rest of the screen's numbers don't share.
- **Settings is the most disciplined surface in the app** — one modal idiom, one grouping pattern, plain-language toggle explanations that state real consequences. If the rest of Profile were held to Settings' standard, this critique would be much shorter.
- **The mono-spaced set ledger** (`170×8  170×8  170×7`) reads better than the equivalent in Strong or Hevy and is genuinely the app's own voice.

## Priority Issues

**[P0] Follow — the social product's actual conversion action — is unreadable on dark theme.** Both assessments independently measured the exact same two sites and got the exact same numbers: `src/App.jsx:17103` (the primary Follow CTA on another user's profile) and `:17848` (the Follow button inside the followers/following sheet) render white text on `C.accent` — **1.31:1 on dark, 3.09:1 on light**, both under the 4.5:1 floor, on the highest-stakes button of the social half of the product. This is the exact pairing CLAUDE.md documents as "NEVER PUT WHITE TEXT ON THE VOLT ACCENT" and has already fixed twice elsewhere — it survived here because `sim_accentbutton`'s regex is `background:\s*C\.accent`, and both sites write it as a **ternary** (`background:(isFollowing||requestPending)?"transparent":C.accent`), which the pattern never matches. A third blind spot in a check that already has two documented ones. **Fix**: both go to the established neutral pair (`C.primary`/`C.onPrimary`), matching Save/Start Workout/Weekly Review; extend `sim_accentbutton` to scan the whole `background:` value expression up to its next top-level comma, not just the literal immediately after the colon, and red-proof it against current `main` before trusting it. **Suggested command**: `/impeccable harden`

**[P0] The same recovery fact is told three times, in three scales, with no connection between them.** Within ~450px of scroll: `BODY BATTERY 55/100` (amber), `TRAINING LOAD 1.03×` (lime), `Recovery 71% · Ready` (green). Assessment A traced the math: `Woke at 87` in the Body Battery caption **is** `round(55 + 0.71 × 45)` — the same Recovery % figure, re-expressed. A user reads three unrelated-looking facts about their body where two are the same measurement and the third is that measurement minus today's drains, in three different color vocabularies (amber-bad here, lime-good there, green-good elsewhere). The question the screen is actually answering — "should I train hard today?" — gets three different-colored answers. **Fix**: one headline verdict with the inputs shown as *contributors* to it (extending the Body Battery caption's own working pattern to Recovery, not restating its output as a bare "87"); retire either the `/100` or the `%` notation, they can't both survive on one screen. **Suggested command**: `/impeccable clarify`

**[P1] Semantic colors were tuned for dark theme only, and it's a systemic pattern, not one component.** Assessment B measured the full set on the real render: strength tier words `Proficient` **1.76:1**, `Intermediate` **1.92:1**, `Novice` **2.54:1** (`LEVEL_COLOR`, hardcoded, `src/App.jsx:17207`); the readiness verdict `· Ready` **2.09:1** (`_readyColor`); recovery driver text `a solid night` / `▲ above your usual` **1.74:1**; post freshness `just now` **2.09:1**; the streak badge's white-on-amber **2.15:1** (theme-*independent* — fails on both themes, and it renders twice per screen: top bar and inline); and — new, not caught by either previous contrast pass this session — every workout card's heart-rate line (`HrStat`) at **3.60:1 (avg) / 2.62:1 (peak, dimmed further by its own `opacity:0.72`)**, hardcoded, firing on every single card in the feed. All hardcoded literals, all invisible to `sim_a11y`, which only tests theme tokens against `C.bg`/`C.surface` — it structurally cannot see any of these, and also never tests `C.divider` as a surface (4 more failures there: `C.sub` on `C.divider` is 4.17:1, under-floor). This is the same class of bug CLAUDE.md already fixed for the muscle stripes (`MUSCLE_STRIPE_INK`) and the day-preview PR badge — same shape, same fix, six more sites. **Fix**: deepen `LEVEL_COLOR` and `_readyColor` with light-theme ink variants the same way `MUSCLE_STRIPE_INK` did; move the recovery-driver and post-freshness greens to `C.green`/`C.accentInk`; fix `HrStat` and the streak badge to dark ink on their fills. **Suggested command**: `/impeccable harden`

**[P1] Nothing on this screen carries a tap-target halo — zero, out of 1316 lines.** `grep -c 'seshd-hit' ` inside ProfileScreen's span returns **0**. Every other screen this session (Day Preview, live workout) used the `.seshd-hit`/`-y` pattern extensively; Profile has none of it, so the visual box *is* the hit area everywhere. Measured by real hit-testing (not `getBoundingClientRect`, which can't see a pseudo-element halo): 19 controls under the app's own 44×44pt floor, worst case the **Male/Female/Other strength-standards toggle at 20px tall** — a control that changes which population your Strength Score is graded against. Also: icon-only Share and Settings buttons at 38×32, the post `⋯` overflow menu (opens Report/Block/Delete) at 34×26, and the followers-list row is a bare `<div onClick>` with no `role="button"`, invisible to a screen reader or a keyboard-only pass. **Fix**: apply `.seshd-hit`/`-y` to the controls above (same recipe already used everywhere else), and give the followers-sheet row a real `<button>`/`role="button"`. **Suggested command**: `/impeccable audit`

**[P1] A foreign profile shows nothing you'd follow someone for, and the one number it does show is mislabeled.** Rendered a real followed user's profile: cover, avatar, name, bio, `Follow / Message / ···`, then "hasn't posted yet." No PRs, no lifts, no strength score, no muscle map — all gated on `isMe`, even though the RLS work to make a follower's `workout_history`/`personal_records` readable is already done and documented elsewhere in this codebase. Worse: the count tile reads `0 Workouts` for anyone but you, because `!isMe` counts *posts*, not sessions (`profileHistoryItems` is `isMe ? … : []`) — a coach who trains 6×/week and posts monthly shows "4 Workouts," the label makes a training claim the number doesn't answer. This is the destination of every follow, every search result, every avatar tap in a lifting app, and it currently delivers a bio. **Fix**: rename the tile to "Posts" on `!isMe` immediately (cheap, stops the false claim); then surface a top-lifts strip from the follower's already-readable `personal_records` — the data access is already built, only the screen is missing. **Suggested command**: `/impeccable shape`

## Persona Red Flags

**Alex (power user, years of history)**: the fixture's 36 sessions produced 10,600px / 12 viewports of scroll with no grid, filter, or date-jump — Alex has 300+. Worse, the two things a power user opens a profile *for* are both broken: there is no PR list on Profile at all (it only lives in History), and the one strength number that IS here — `Back Squat 294` — is an unlabeled Epley estimate that doesn't match Alex's own logged 245. A power user will notice the mismatch within a week and stop trusting the card.

**Jordan (first-timer, day one)**: the empty-account render is eight consecutive placeholder blocks — `0/0/0`, blank cover, blank bio, grey skeletons, an all-green readiness map, `BODY BATTERY 66/100 · Est. start 82`, a locked strength score, "Weekly Review — lands Sunday," "No posts yet" — and **zero calls to action anywhere on the screen**. Both confident-looking numbers on that screen (the green body map, the 66/100) are fabricated from zero real data, rendered in exactly the same type and color as a real HealthKit reading. Jordan's first impression of the app's flagship metric is a number that's quietly made up.

**Sam (accessibility / low vision)**: every qualitative label that explains a number is the failure — `Proficient`, `Intermediate`, `· Ready`, `a solid night` — all under 2:1 on light theme, all 10-11px, all carrying meaning nothing else on the row repeats. Combined with zero tap-target halos and a keyboard-invisible followers row, this is the most accessibility-hostile screen audited this session.

## Minor Observations

- **`Back Squat 294` is an unlabeled estimated 1RM** (Epley, capped at 10 reps) sitting next to the user's real logged 245 with no "est." anywhere on the card or its footnote — same shape as the "71 total sets" and "57 PRs" bugs CLAUDE.md already tracks, just newly found here.
- **Weekly Review is the single loudest, highest-contrast element on the screen** (filled `C.primary`, 17.67:1) and its own label says "lands Sunday" — it out-shouts Follow, Edit Profile and the strength score while inert 6 days out of 7. Should style by state, not by category, same logic already applied to the disabled Share button.
- **"Body" and "Body Battery" are two unrelated features sharing a name** 900px apart on the same screen.
- **The streak badge renders twice in one viewport** (top bar + inline name row), same value, ~480px apart.
- **Six independent color systems co-exist**: muscle-balance `GROUP_COLOR`, `_readyColor`, Body Battery's own palette, the training-load band, `LEVEL_COLOR`, PostCard's gold/volt. `GROUP_COLOR.Legs` is literally `C.accent` — volt is doing "Legs," "PR," "progress" and "streak" on one screen, against the lime-pass rule reserving it for earned things.
- **`Kai hasn't posted yet` still uses the generic icon-in-a-box empty-state template** with an anatomical-silhouette icon that has nothing to do with posting — the de-genericization pass reached the muscle-balance block on this same screen but not this one.
- **`posts` recomputes unmemoized every render**, re-running `postWorkoutPayload` over the full history each time, on the app's most-visited screen — performance, not design, but worth a line.
- **Parked, not reopening**: typography and containment, per Mo's standing call — noted only because Profile is where the containment question is sharpest (Muscle Balance is uncontained while everything under it is a rounded card).

## Questions to Consider

- What if Profile stopped duplicating History's session list and became purely "how strong am I and where am I going" — PR board, strength ladder, muscle balance, streak — with the raw session list living only in History, where the chart and lifetime tiles already are?
- What if the seven separate health numbers collapsed to one verdict with a one-line reason, and everything else moved behind the Body Battery sheet that already does this well?
- What would a stranger's profile need to show for a follow to feel worth it — right now yours is 12 viewports and theirs is one?
