---
target: Live workout screen (WorkoutTracker)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 5
timestamp: 2026-08-19T22-27-06Z
slug: src-app-jsx-workouttracker
---
# Live workout screen (WorkoutTracker) — design critique

Method: dual-agent (A: design review · B: detector/browser evidence), independent, synthesized after both completed. Both agents were seeded with the same fixture (an in-progress session with a warmup set, a couple of logged working sets, and one blank/untouched set row) and with a summary of what's already deliberate on this screen (the collapsing header's rate-limited tracking, the Discard confirmation, the bottom nav staying visible, `.seshd-hit` tap-target halos, the accent-button contrast pass) so neither agent re-flagged known-good, recently-shipped work.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | The rest timer and set counter both stay legible while collapsed; no live indication that a set with blank weight/reps is about to be silently counted as done. |
| 2 | Match System / Real World | 3 | Plate math and set-type labels (warmup/working/drop) match gym vocabulary well. |
| 3 | User Control and Freedom | 2 | Discard is confirmed and reversible-in-intent; but there is no undo for an accidentally-checked done tick on a blank row, which is the direct path into the data-corruption bug below. |
| 4 | Consistency and Standards | 2 | NumberPad's Next key (bg=C.accent) and the row's own done-tick disagree about which one actually finishes logging a set — two controls doing adjacent jobs with different completion semantics. |
| 5 | Error Prevention | 1 | Ticking "done" on a set with no weight and no reps typed is accepted with no warning — the row banks as a real, completed 0×0 set. |
| 6 | Recognition Rather Than Recall | 3 | Previous-session numbers are pre-filled per set, so most rows need no recall at all. |
| 7 | Flexibility and Efficiency | 2 | NumberPad's Next key does not complete the row (see finding below), so the fast path — type weight, type reps, Next — silently fails to do what its label promises. |
| 8 | Aesthetic and Minimalist Design | 2 | The plate-breakdown diagram redraws under every single set of an exercise, not just when the load changes, so a 5-set exercise repeats the same plate stack five times down the screen. |
| 9 | Error Recovery | 2 | A logged set can be edited or removed after the fact; no in-flow warning catches the 0×0 case before it's saved. |
| 10 | Help and Documentation | 3 | Per-exercise "How to do it" cues carry over from the exercise library; RPE and set-type both have inline explainers. |
| **Total** | | **27/40** | **Acceptable** |

## Design Specificity Verdict

Screen-specific. The plate-diagram repetition and the NumberPad/done-tick mismatch are both concrete to this screen's control layout, not generic template criticism.

## Overall Impression

The live workout screen is the app's highest-stakes surface — it's what's open for the entire duration of a session, and it's where the numbers that drive PRs, progression, and Body Battery training-load actually get written. It's in reasonable shape: pre-filled previous-session numbers, a legible collapsing header, and per-set coaching cues all work well. The two things that matter are a real correctness gap (a blank set can be banked as a completed 0×0 set with zero friction) and a workflow ambiguity (NumberPad's primary action key doesn't actually finish the interaction its label implies), plus a density problem (the plate diagram) that gets worse the more sets an exercise has.

## What's Working

- Previous-session weight/reps are pre-filled per row, cutting recall load to near zero for a returning lifter.
- The collapsing header (recently reworked) tracks the scroll gesture continuously with no snap/settle — reads as deliberate, not broken.
- Discard is worded as a verb, confirmed, and states what's at stake before wiping a session.
- Per-exercise "?" cues are real, hand-written coaching content, not filler.
- The bottom nav stays visible and usable throughout a workout (a fixed regression from earlier this era).

## Priority Issues

**P1 — Silent 0/0-set data corruption.** A set row with no weight typed and no reps typed can still be ticked "done." That tick banks a real, completed set of `0 × 0` into the session — no warning, no block. This set then counts toward `workingDone()`'s total, pollutes `sessionVolume()` with a false floor value, and (per the existing `epley1RM`/stall-detection rules already in this codebase) can feed a phantom low-effort data point into the exact plateau/deload maths that CLAUDE.md documents as being sensitive to a stray 0-rep set (`Math.max(1, s.topReps || 0)` guards the deload formula specifically because of this shape). **Fix direction:** block or warn on ticking done with both fields empty — the same `confirmAction` pattern already used for Discard and for the day-preview remove-exercise "×" would fit here without inventing a new UI primitive.

**P1 — NumberPad's "Next" key doesn't complete the set.** The button pressed after typing a set's numbers is visually the primary action (accent-filled, or was — see contrast finding below) but its actual job is to move focus to the next input, not to mark the set done. A lifter who types weight, types reps, and taps Next expects the set logged; instead they still have to find and tap the row's separate done-tick. This is the same "two controls doing the same conceptual job disagree" shape CLAUDE.md already documents for the muscle-color-map and volume/PR duplication bugs, just in the interaction layer instead of a data layer.

**P1 — Dark-theme contrast failure, ~1.10:1, on [component to confirm — see Assessment B raw output].** Measured against the dark theme, one of the NumberPad control labels/badges came back at approximately 1.10:1, deep in "the AI tell" hardcoded-white-on-accent family CLAUDE.md already tracks (`sim_accentbutton`). This specific site was not caught by that sim, meaning it's either a prop-form pairing the sim's regex doesn't scan, or an inherited-color case (both blind spots the sim's own header comments call out). **Fix direction:** re-run `sim_accentbutton` after isolating the exact site; if it passes clean, the bug is in one of the two documented blind spots and the check needs a new case, not just the component.

**P1 — Dark-theme contrast failure, ~1.92:1, on [component to confirm].** A second, less severe contrast failure on the same screen, under the 4.5:1 text floor. Needs the same site-isolation pass as above before a fix is written.

**P1 — Plate diagram repeats unconditionally per set.** The plate-breakdown visualization renders under every logged/working set row for an exercise, even when consecutive sets carry the identical weight (the common case — most lifters run the same load across all working sets). On a 5-set exercise this draws the same plate stack five times in a row, which is real vertical density cost on the screen you spend the most time scrolling during a session. **Fix direction:** render it once per distinct weight value within an exercise (e.g. only when the weight differs from the set above it), not once per set.

## Persona Red Flags

- **Returning lifter mid-session, in a hurry between sets:** hits the NumberPad-Next-doesn't-finish friction on literally every set logged this way — the highest-frequency interaction on the highest-frequency screen in the app.
- **New user still learning the UI:** most likely to accidentally tick "done" on a blank row while exploring the screen, and gets no signal that anything went wrong — the corrupted set just sits there looking identical to a real one.

## Minor Observations

- The set-type chip (warmup/working/drop) and the RPE control both have real inline help; no complaint there.
- Rest timer legibility while the header is collapsed is good — confirmed readable at ~40% collapse in the fixture used for this pass.

## Questions to Consider

- Should the done-tick itself be disabled (not just warned) when both fields are empty, or should it accept the tap and immediately surface an inline "log a weight or reps first" message next to the row?
- Should NumberPad's Next key be relabeled/repurposed to actually complete the set on the last field (matching what its visual weight already implies), or should the done-tick be moved onto the keypad itself so there's one control, not two?
- Is "same weight as the row above → skip redrawing the plate diagram" the right collapse rule, or would collapsing to the exercise's first set only (regardless of later changes) read as more predictable?
