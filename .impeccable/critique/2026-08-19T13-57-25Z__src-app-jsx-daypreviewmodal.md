---
target: Day Preview screen (DayPreviewModal)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
timestamp: 2026-08-19T13-57-25Z
slug: src-app-jsx-daypreviewmodal
---
# Day Preview screen — design critique

Method: dual-agent (A: design review · B: detector/browser evidence), independent, synthesized after both completed.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Hero tile's headline value is literally **"Done"** with a checkmark on a screen whose job is to get you to start again. |
| 2 | Match System / Real World | 3 | Fluent gym language throughout; dinged by a box icon labeling "total sets" and "PR" never explained as lifetime-not-target. |
| 3 | User Control and Freedom | 2 | Back silently discards edits, "Done" silently saves them permanently — opposite consequences, neither labeled. No undo on remove. |
| 4 | Consistency and Standards | 2 | The muscle-color map used here disagrees with the one on the day editor one tap away (see Priority Issues). Volt (the brand color) also doubles as the "Shoulders" muscle color. |
| 5 | Error Prevention | 1 | The remove "×" is 16×20px, unconfirmed, and permanently deletes an exercise from a saved program. |
| 6 | Recognition Rather Than Recall | 2 | Shows a lifetime PR, withholds last session's actual working weight — so the user has to remember what they lifted to know what to load today. |
| 7 | Flexibility and Efficiency | 2 | "Save & Start Workout →" is a genuine accelerator; no per-session tweak or reorder here (the day editor has both). |
| 8 | Aesthetic and Minimalist Design | 2 | 110px hero band spends the best real estate on two numbers you can already count off the list beneath it. |
| 9 | Error Recovery | 1 | A raw developer string — "Couldn't generate code — run SQL migration" — is a live user-facing error toast on the Share path. |
| 10 | Help and Documentation | 3 | The per-row "?" opens real, hand-written coaching cues in place. The strongest thing on the screen. |
| **Total** | | **20/40** | **Acceptable (bottom of the band)** |

## Design Specificity Verdict

**Specific in vocabulary, generic in shape — and it withholds the one thing that would make it unmistakably Seshd's.**

The words are real: "Push B · Shoulders/Arms," "PR 105lbs," muscle names, a volt accent nobody else uses. But the *composition* — back arrow, three-stat band, flat card list with a colored stripe, pinned CTA — is one of the most templated shapes in mobile. Swap the nouns and it's a recipe app's recipe screen.

The deeper issue: Seshd knows exactly what you lifted on every one of these movements 11 days ago. The screen shows a **lifetime PR** instead — often months old, not what you're loading today. A line reading "Last: 95 × 7, 6, 6" is something no template could fake, and it turns this from a summary into the actual first page of the workout.

Cross-checked against CLAUDE.md: the muscle-color stripes are already-documented, deliberate encoding (not decoration) — confirmed correct not to re-flag as generic. The parked containment critique, the retired day-color rainbow, the RADIUS/TYPE scale, and Mo's "PR green is fine" ruling (which covered a *different* element on History/Exercise Detail) were all checked and are not re-raised here.

**Deterministic scan** (`detect.mjs` on the whole file): 16 findings file-wide, only 1 inside this screen's own code (the muscle stripe — a known false positive, confirmed deliberate). The live browser overlay, injected into the running screen, found 28 anti-patterns; scoped down to just this screen's DOM, 17 of those are 8× the same muscle-stripe pattern and 9× a 10px-text rule this codebase deliberately set one step below the detector's default floor (already documented and tested). Both scans agree: nothing found here contradicts what's already a considered decision, **except** two things a rendering pass caught that no automated rule was looking for — see below.

## Overall Impression

The gym-native language and the in-place exercise cues are real strengths nobody else has. The composition around them is a generic template, filled with a number (lifetime PR) that's usually stale rather than the one number (last session's weight) that would make the screen genuinely useful at the rack. And two real bugs — a color map that disagrees with itself, and a developer error string — are sitting in a screen that's about to go in front of App Review.

## What's Working

1. **The per-row "?" is real contextual help**, not a tooltip — hand-written cues for all 292 exercises, opened in place, no context switch.
2. **"Save & Start Workout →" collapses two intentions into one tap** and its own label changes to say so.
3. **The set-count tile is now honest** — a real sum (4+4+4+4+4+3+3+3 = 29, verified on screen), not a guess.

## Priority Issues

**[P1] A developer error string ships to users.** The Share path's failure toast reads *"Couldn't generate code — run SQL migration."* Reachable on any network hiccup — entirely plausible for an App Review tester. Fix: one line, `"Couldn't create a share code. Check your connection and try again."`

**[P1] The muscle-color map is duplicated between two screens and they disagree — a real bug, not a taste call.** This screen's map (12 entries) and the day editor's map one tap away (13 entries) were built separately. Rendered proof: an exercise tagged **Rear Delts** ("Face Pull") gets the *grey fallback* stripe here because this screen's map is missing that key, while the editor shows it correctly in violet. Separately, **Quads and Hamstrings render the identical color** in both maps — a leg day's stripe can't tell them apart. Same shape as the plate-color bug already fixed and documented in CLAUDE.md: one map serving two things that need different answers. Fix: one shared muscle-color function, not two hand-copied maps.

**[P1] The remove "×" is 16×20px, has no confirmation, and permanently rewrites a saved program.** Tapping it removes an exercise instantly; "Done" then saves that change for good, with no undo. This is exactly the "destructive control needs a verb and a confirmation" rule already established elsewhere in this app, just missed here. Fix: route it through the existing `confirmAction` sheet, naming the exercise; make Back read "Cancel" while editing so the two exits announce their opposite consequences.

**[P1] Muscle-stripe colors fail contrast on the light theme.** Measured against the light card: Shoulders `#c8f135` is **1.31:1**, with Core, Calves, Quads and Triceps all under the 3:1 floor too — while Chest and Back pass, which is why this hides (the failures look like an exception, not a pattern). Dark theme is fine throughout. The color-coding this app deliberately built is half-dead on one of its two themes. Fix: same trick already used for plate colors — a thin dark rim on the stripe/icon tile, not a darker hue (darkening would kill the color's identity).

**[P2] Visual emphasis is backwards, and the brand color is overloaded.** The rep-range chip (a number that never changes week to week) gets the loud volt accent; the PR badge (the one number that's actually an achievement) is nearly invisible on dark — measured, its fill is **1.17:1** against the card, so only the white text is doing any work. Compounding it: "Shoulders" as a muscle color IS the exact same volt as the brand accent, so on a shoulders exercise the stripe, the icon tint, the rep chip, and the "?" button are all the identical color meaning four different things. Fix: swap the emphasis (plain text for reps, the accent treatment for PR), and move Shoulders off the brand's own color.

**Also worth knowing, not urgent:** every control here — the header "Edit" (57×31, short of the 44pt floor), all eight "?" buttons (32×32, no tap-halo) — falls under this app's own 44pt standard used everywhere else; the 8th exercise's "?" is worse, physically overlapped by the floating "Start Workout" bar down to a 27×18 usable area. The exercise list also clips through the first card's middle when you scroll — the identical bug class already fixed on the workout header this session (fade + translate, not a hard clip). And the PR-vs-last-session change flagged in the specificity verdict above is a real product opportunity, not a bug — worth a deliberate "when," not a scramble before submission.

## Persona Red Flags

**Casey (one-handed, on the gym floor):** the "?" column sits exactly where her thumb rests, undersized with no halo; the 8th row's is worse (27×18, overlapped by the CTA); the remove "×" is the smallest, most destructive control on the screen. The list has only 49px of scroll room before everything's visible, so the overlap is a rest-state problem, not just mid-scroll.

**Alex (knows his program, wants to be lifting in 5 seconds):** can't tweak a single session without permanently rewriting the whole program — swapping one exercise today means editing weeks of planning or fixing it mid-workout. No reorder here either, though the day editor has it. He never reads the list at all; the one fact he'd actually want (last session's numbers) isn't there.

**Jordan (first push day ever):** "29 total sets," no time estimate — the question he actually has ("how long is this?") goes unanswered twice with numbers he can't calibrate. "PR 105lbs" is unexplained and could read as a target he must hit today. The stripe color code is never explained and isn't even groupable (lime/lime/lime/red/red/lime/orange/lime).

## Minor Observations

- Toggling Edit deletes the whole 110px hero band and restructures every card, so the information you need to *decide* what to remove disappears at the moment you're deciding.
- Renaming the day while editing flips "Done · 11d ago" to "New · first time" as you type (matches on the name, not a stable id), then flips back on save.
- The "total sets" tile uses a package/box icon — a box isn't a set.
- Muscle is stated three times per row (stripe, icon tint, text label) and the one new fact per row (last weight lifted) is stated zero times.

## Questions to Consider

1. This screen knows exactly what you lifted on all eight of these movements 11 days ago. Why show a number from months back instead?
2. If the hero band (110px) were deleted, what would be lost that isn't already on the list six pixels below it?
3. Shoulders' muscle color is byte-identical to the brand accent used for buttons and links. Should the brand color ever double as a data value?
